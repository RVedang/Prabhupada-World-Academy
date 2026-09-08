import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, BvAttendance, Users, Guides } from '@/lib/backend-sdk';
import { serverCacheGetOrFetch, serverCacheInvalidate } from '../lib/serverCache';
import { isBvSuperAdminUser } from '../lib/bvGroupMemberScope';

export default createEndpoint({
  description: 'Get all BV groups and BVSLs under a guide (admin view — for Guide/Super Guide)',
  authenticated: true,
  requiredCapabilities: 'bv.manage',
  inputSchema: z.object({
    guideId: z.string(),
  }),
  outputSchema: z.object({
    bvsls: z.array(z.object({
      userId: z.string(),
      fullName: z.string(),
      email: z.string().optional(),
      groupCount: z.number(),
      totalMembers: z.number(),
    })),
    groups: z.array(z.object({
      groupId: z.string(),
      groupDbId: z.string().optional(),
      groupName: z.string(),
      description: z.string(),
      isActive: z.boolean(),
      memberCount: z.number(),
      sessionCount: z.number(),
      totalSessions: z.number(),
      avgAttendanceRate: z.number(),
      joinToken: z.string().nullable(),
      bvslLeaderId: z.string().nullable(),
      bvslLeaderName: z.string().nullable(),
      bvslName: z.string().nullable(),
    })),
    error: z.string().nullable(),
  }),
  execute: async ({ input, context }: { input: { guideId: string }; context: any }) => {
    // A normal admin is always scoped to their own hierarchy, even if a
    // different guide ID is supplied by a modified client. Super admins may
    // intentionally select another guide or department-wide view.
    const effectiveGuideId = isBvSuperAdminUser(context?.user)
      ? input.guideId
      : String(context?.user?.id || '');
    if (!effectiveGuideId) return { bvsls: [], groups: [], error: null };
    // 10-minute server-side cache keyed by guideId — invalidated on group/role mutations
    // (assignBvRole already calls serverCacheInvalidate() for a full cache clear).
    const cacheKey = `allBvGroupsAdmin:${effectiveGuideId}`;
    return serverCacheGetOrFetch(cacheKey, () => _fetchAllBvGroupsAdmin(effectiveGuideId), 10 * 60 * 1000);
  },
});

export { serverCacheInvalidate as _invalidateAllBvGroupsAdmin };

async function _fetchAllBvGroupsAdmin(inputGuideId: string) {

    // Robustly resolve guideId to a Guides-table UUID.
    // bvMentorGuideId may be a Users-table UUID (when a Guide tagged the BV Mentor),
    // a Guides-table UUID (when a Super Guide tagged them), or a custom guideId string.
    let guideDbId: string | null = null;
    let linkedGuideUser: any = undefined;

    // Step 1: Try direct Guides-table lookup by UUID
    const directGuideRec = await Guides.findOne({ id: inputGuideId, fields: ['id', 'fullName', 'email', 'guideId'] }).catch(() => undefined);
    if (directGuideRec) {
      guideDbId = directGuideRec.id;
    } else {
      // Step 2: Try as a Users-table UUID — look up their email, then find the Guides record
      const guideUser =
        await Users.findOne({ id: inputGuideId, fields: ['id', 'userId', 'fullName', 'email', 'folkResidencies', 'residency'] }).catch(() => undefined) ||
        await Users.findOne({ filters: { userId: inputGuideId }, fields: ['id', 'userId', 'fullName', 'email', 'folkResidencies', 'residency'] }).catch(() => undefined);
      linkedGuideUser = guideUser;
      if (guideUser?.email) {
        const guideByEmail = await Guides.findOne({ filters: { email: guideUser.email }, fields: ['id', 'fullName', 'email', 'guideId'] });
        if (guideByEmail) guideDbId = guideByEmail.id;
      }

      // Step 3: Fallback — try legacy custom guideId string field
      if (!guideDbId) {
        const guideByCustomId = await Guides.findOne({ filters: { guideId: inputGuideId }, fields: ['id', 'fullName', 'email', 'guideId'] });
        if (guideByCustomId) guideDbId = guideByCustomId.id;
      }
    }

    // A Guides record is optional: several legitimate FOLK guides live only
    // in Users. We can still scope RGFs safely using that user's database ID,
    // custom userId, email, and reporting hierarchy fields.
    if (!guideDbId && !linkedGuideUser) return { bvsls: [], groups: [], error: null };

    const resolvedGuide = guideDbId
      ? await Guides.findOne({
        id: guideDbId,
        fields: ['id', 'fullName', 'email', 'guideId', 'folkResidencies'],
      }).catch(() => undefined)
      : undefined;
    // Role assignment stores hierarchy parents on the Users record, while
    // older guide records use a Guides-table id. Resolve both representations
    // so an RGF assigned to this guide is always discoverable.
    linkedGuideUser = linkedGuideUser || ((resolvedGuide as any)?.email
      ? await Users.findOne({
        filters: { email: (resolvedGuide as any).email },
        fields: ['id', 'userId', 'fullName', 'email', 'folkResidencies', 'residency'],
      }).catch(() => undefined)
      : undefined);
    if (!linkedGuideUser) {
      linkedGuideUser = await Users.findOne({ id: inputGuideId, fields: ['id', 'userId', 'fullName', 'email', 'folkResidencies', 'residency'] }).catch(() => undefined);
    }
    if (!linkedGuideUser) {
      linkedGuideUser = await Users.findOne({ filters: { userId: inputGuideId }, fields: ['id', 'userId', 'fullName', 'email', 'folkResidencies', 'residency'] }).catch(() => undefined);
    }
    const rawGuideResidencies = (resolvedGuide as any)?.folkResidencies ||
      (linkedGuideUser as any)?.folkResidencies ||
      (linkedGuideUser as any)?.residency || [];
    const guideResidencies = Array.isArray(rawGuideResidencies)
      ? rawGuideResidencies
      : [rawGuideResidencies];
    const guideResidencyAliases = new Set(
      guideResidencies
        .flatMap((value: any) => Array.isArray(value) ? value : [value])
        .filter(Boolean)
        .map((value: any) => String(value).trim().toLowerCase())
    );

    const { records: allGroupRecords } = await BvGroups.findAll({
      // Fetch active groups with a single filter and apply the guide/RGF
      // relationship in memory to avoid a deployment-time composite-index
      // failure.
      filters: { isActive: true },
      limit: 500,
    });

    // Resolve active RGFs from the Users table, then match every legacy guide
    // representation (Guide ID, custom ID, name, or email).
    const guideAliases = new Set([
      guideDbId,
      (resolvedGuide as any)?.fullName,
      (resolvedGuide as any)?.email,
      (resolvedGuide as any)?.guideId,
      inputGuideId,
      (linkedGuideUser as any)?.id,
      (linkedGuideUser as any)?.userId,
    ].filter(Boolean).map(value => String(value).trim().toLowerCase()));
    const { records: allBvslUsers } = await Users.findAll({
      // Keep this a single-field query; filtering both status and isBvsl can
      // require a composite index that may not exist immediately after deploy.
      filters: { status: 'Active' },
      limit: 1000,
      fields: ['id', 'userId', 'fullName', 'email', 'guide', 'selectedGuideId', 'guideName', 'residency', 'role', 'isBvsl', 'isBvFacilitator', 'bvReportingAdminId', 'bvReportingSupervisorId', 'bvReportingAdminName', 'bvReportingSupervisorName'],
    });
    const bvslUserRecords = allBvslUsers.filter((u: any) => {
      if (u.isBvsl !== true && String(u.role || '').toUpperCase() !== 'BVSL' && u.isBvFacilitator !== true) return false;
      const guideValues = [
        u.guide, u.selectedGuideId, u.guideName,
        u.bvReportingAdminId, u.bvReportingSupervisorId,
        u.bvReportingAdminName, u.bvReportingSupervisorName,
      ].flatMap(v => Array.isArray(v) ? v : [v]).filter(Boolean);
      const residencyValues = [u.residency].flatMap(v => Array.isArray(v) ? v : [v]).filter(Boolean);
      const matchesGuide = guideValues.some(value => guideAliases.has(String(value).trim().toLowerCase()));
      const matchesResidency = residencyValues.some(value => guideResidencyAliases.has(String(value).trim().toLowerCase()));
      return matchesGuide || matchesResidency;
    });
    const rgfAliases = new Set(bvslUserRecords.flatMap((u: any) => [u.id, u.userId]).filter(Boolean).map((v: any) => String(v).toLowerCase()));
    const groupRecords = allGroupRecords.filter((g: any) => {
      const groupGuide = Array.isArray(g.guide) ? g.guide[0] : g.guide;
      const facilitator = Array.isArray(g.bvslLeader) ? g.bvslLeader[0] : (g.bvslLeader || g.bvslId);
      return guideAliases.has(String(groupGuide || '').toLowerCase()) || rgfAliases.has(String(facilitator || '').toLowerCase());
    });

    // ── Batch all member + attendance queries in 2 round-trips ──────────────
    // Previously this was 2 queries per group (N×2 = up to 40+ round-trips).
    // Now we fetch ALL members and ALL attendance across all matched groups in
    // one shot each, then group in memory — same data, far fewer round-trips.
    const allGroupIds = groupRecords.map((g: any) => g.id);

    const [allMembersRes, allAttRes] = await Promise.all([
      BvGroupMembers.findAll({
        filters: { group: { in: allGroupIds } } as any,
        fields: ['id', 'group'],
        limit: 5000,
      }),
      BvAttendance.findAll({
        filters: { group: { in: allGroupIds } } as any,
        fields: ['id', 'group', 'present', 'attendanceDate'],
        limit: 10000,
      }),
    ]);

    // Build per-group lookup maps from the batch results
    const memberCountByGroup = new Map<string, number>();
    for (const m of allMembersRes.records) {
      const gid = Array.isArray((m as any).group) ? (m as any).group[0] : (m as any).group;
      if (gid) memberCountByGroup.set(gid, (memberCountByGroup.get(gid) ?? 0) + 1);
    }
    const attByGroup = new Map<string, any[]>();
    for (const a of allAttRes.records) {
      const gid = Array.isArray((a as any).group) ? (a as any).group[0] : (a as any).group;
      if (gid) {
        if (!attByGroup.has(gid)) attByGroup.set(gid, []);
        attByGroup.get(gid)!.push(a);
      }
    }

    const groups = groupRecords.map((g: any) => {
      const bvslDbId = Array.isArray(g.bvslLeader) ? g.bvslLeader[0] : g.bvslLeader as string | undefined;

      const memberCount = memberCountByGroup.get(g.id) ?? 0;
      const attRecords = attByGroup.get(g.id) ?? [];

      // Count distinct session dates
      const distinctDates = new Set(attRecords.map((a: any) => a.attendanceDate).filter(Boolean));
      const sessionCount = distinctDates.size;

      // Compute avg attendance rate
      const totalPresent = attRecords.filter((a: any) => a.present).length;
      const totalPossible = memberCount * sessionCount;
      const avgAttendanceRate = totalPossible > 0
        ? Math.round((totalPresent / totalPossible) * 100)
        : 0;

      const bvslUser = bvslDbId ? bvslUserRecords.find((u: any) => u.id === bvslDbId) : undefined;
      const bvslName = bvslUser?.fullName || null;

      return {
        groupId: g.groupId || g.id,
        groupDbId: g.id,
        groupName: g.groupName || '',
        description: g.description || '',
        isActive: g.isActive ?? true,
        memberCount,
        sessionCount,
        totalSessions: sessionCount,
        avgAttendanceRate,
        joinToken: g.joinToken || null,
        bvslLeaderId: bvslUser?.userId || bvslDbId || null,
        bvslLeaderName: bvslName,
        bvslName,
      };
    });

    const bvsls = bvslUserRecords.map(u => {
      const userGroups = groups.filter(g => g.bvslLeaderId === u.userId || g.bvslLeaderId === u.id || g.bvslLeaderName === u.fullName);
      return {
        userId: u.id, // Always use DB UUID for consistent ID comparison
        fullName: u.fullName || '',
        email: u.email || '',
        groupCount: userGroups.length,
        totalMembers: userGroups.reduce((sum, g) => sum + g.memberCount, 0),
      };
    });

    return { bvsls, groups, error: null };
}
