import { z } from 'zod';
import { createEndpoint, Users, BvslPreachingEntries, BvGroups, Guides } from '@/lib/backend-sdk';
import { requireGuideRole } from '../lib/userUtils';
import { getGuideIdsForResidencies } from '../lib/guideScope';
import { bvUserAliases, resolveBvGroupFacilitatorUsers, resolveBvScopedGroups } from '../lib/bvGroupMemberScope';

function isFolkMemberLevelFacilitator(user: any): boolean {
  const role = String(user?.role || '').toUpperCase().replace(/\s+/g, '_');
  return !(
    user?.isBvAdmin ||
    user?.isBvSuperAdmin ||
    role === 'GUIDE' ||
    role === 'SUPER_GUIDE' ||
    role === 'SUPER_ADMIN' ||
    role === 'PW_ADMIN' ||
    role === 'ADMIN'
  );
}

export default createEndpoint({
  description: 'BV preaching report for guide — all BVSLs under guide with preaching entries',
  authenticated: true,
  inputSchema: z.object({
    guideId: z.string(),
    date: z.string(),
    reportType: z.enum(['daily', 'weekly', 'monthly']),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    bvslMode: z.boolean().optional(),
    groupId: z.string().optional(),
    residencyIds: z.array(z.string()).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (!context.user) throw new Error('Unauthorized');
    const isBvMentor = !!(context.user as any).isBvMentor;
    if (!input.bvslMode && !isBvMentor) requireGuideRole(context.user.role, { isSadhanaMentor: context.user.isSadhanaMentor, isBvsl: context.user.isBvsl, isBvMentor });

    const { guideId: inputGuideId, date, reportType, startDate, endDate, bvslMode, groupId, residencyIds } = input;
    const effectiveStart = (startDate || date || '').split('T')[0];
    const effectiveEnd = (endDate || date || '').split('T')[0];
    if (!effectiveStart) throw new Error('Invalid date');

    let guideDbId: string | null = inputGuideId === 'ALL' ? null : inputGuideId;

    // Robust guide ID resolution: resolve Users-table UUID → Guides-table UUID
    if (guideDbId) {
      const directGuideRec = await Guides.findOne({ id: guideDbId, fields: ['id'] }).catch(() => undefined);
      if (!directGuideRec) {
        const guideUser = await Users.findOne({ id: guideDbId, fields: ['id', 'email'] }).catch(() => undefined);
        if (guideUser?.email) {
          const guideByEmail = await Guides.findOne({ filters: { email: guideUser.email }, fields: ['id'] });
          if (guideByEmail) guideDbId = guideByEmail.id;
        }
        if (guideDbId === inputGuideId) {
          const guideByCustomId = await Guides.findOne({ filters: { guideId: guideDbId }, fields: ['id'] });
          if (guideByCustomId) guideDbId = guideByCustomId.id;
        }
      }
    }

    const isSupervisorMode = !!bvslMode && !!(context.user.isBvSupervisor || context.user.isBvMentor);
    let hierarchyGroups: any[] | null = null;
    let bvslUsers: any[] = [];
    if (isSupervisorMode) {
      const rawSegment = String(context.user.segment || 'FOLK').toUpperCase();
      const segment = rawSegment === 'PW' ? 'PW' : 'FOLK';
      hierarchyGroups = (await resolveBvScopedGroups(context.user as any, { segment, groupId }))
        .map(group => group.record);
      bvslUsers = await resolveBvGroupFacilitatorUsers(
        context.user as any,
        ['id', 'userId', 'email', 'fullName', 'ashrayLevel', 'residency', 'residencyApproved', 'phone', 'role', 'isBvAdmin', 'isBvSuperAdmin'],
        { segment, groupId },
      );
    } else if (bvslMode) {
      // bvslMode: return only the current user's data
      const me = await Users.findOne({
        id: context.user.id,
        fields: ['id', 'userId', 'fullName', 'ashrayLevel', 'residency', 'residencyApproved', 'phone'],
      });
      if (me) bvslUsers = [me];
    } else if (residencyIds && residencyIds.length > 0) {
      // Center-based scoping: get all BVSLs under all guides in these residencies
      const allGuideIds = await getGuideIdsForResidencies(residencyIds);
      if (allGuideIds.length > 0) {
        const bvslMap = new Map<string, any>();
        const fetches = await Promise.all(allGuideIds.map(gid =>
          Users.findAll({ filters: { isBvsl: true, status: 'Active', guide: gid }, fields: ['id', 'userId', 'fullName', 'ashrayLevel', 'residency', 'residencyApproved', 'phone', 'role', 'isBvAdmin', 'isBvSuperAdmin'], limit: 200 })
        ));
        for (const res of fetches) for (const u of res.records) bvslMap.set(u.id, u);
        // Also get BVSLs from the residencies directly (in case they're not assigned to a specific guide)
        const resFetches = await Promise.all(residencyIds.map((rid: string) =>
          Users.findAll({ filters: { isBvsl: true, status: 'Active', residency: rid }, fields: ['id', 'userId', 'fullName', 'ashrayLevel', 'residency', 'residencyApproved', 'phone', 'role', 'isBvAdmin', 'isBvSuperAdmin'], limit: 200 })
        ));
        for (const res of resFetches) for (const u of res.records) bvslMap.set(u.id, u);
        bvslUsers = Array.from(bvslMap.values());
      }
    } else {
      const userFilter: any = { isBvsl: true, status: 'Active' };
      if (guideDbId) userFilter.guide = guideDbId;

      const { records } = await Users.findAll({
        filters: userFilter,
        fields: ['id', 'userId', 'fullName', 'ashrayLevel', 'residency', 'residencyApproved', 'phone', 'role', 'isBvAdmin', 'isBvSuperAdmin'],
        limit: 200,
      });
      bvslUsers = records.filter(u => u.id !== context.user!.id && u.userId !== context.user!.id);
    }

    const isFolkReport = (context.user as any).segment === 'FOLK' || (residencyIds && residencyIds.length > 0);
    if (isFolkReport) {
      bvslUsers = bvslUsers.filter(isFolkMemberLevelFacilitator);
    }

    if (bvslUsers.length === 0) return { bvsls: [], groups: [] };

    const bvslDbIds = bvslUsers.map(u => u.id);

    // Get groups led by these BVSLs (with optional groupId filter). Supervisor
    // mode already resolved mixed Firestore/public/email ownership aliases.
    let groups: any[];
    if (hierarchyGroups !== null) {
      groups = hierarchyGroups;
    } else {
      const groupFilter: any = { bvslLeader: { in: bvslDbIds }, isActive: true };
      if (groupId) groupFilter.id = groupId;
      groups = (await BvGroups.findAll({
        filters: groupFilter,
        fields: ['id', 'groupId', 'groupName', 'bvslLeader', 'bvslId', 'subFacilitatorId', 'rgsfId', 'subFacilitator'],
        limit: 200,
      })).records;
    }

    // If a specific group is selected, only show BVSLs leading that group
    let filteredBvslUsers = bvslUsers;
    if (groupId && groups.length > 0) {
      const leaderIdsInGroup = new Set(groups.flatMap(g => [
        g.bvslLeader, g.bvslId, g.subFacilitatorId, g.rgsfId, g.subFacilitator,
      ]).flat().filter(Boolean).map(value => String(value).toLowerCase()));
      filteredBvslUsers = bvslUsers.filter(u =>
        bvUserAliases(u).some(alias => leaderIdsInGroup.has(alias))
      );
    }

    const groupByBvsl = new Map<string, string>();
    for (const g of groups) {
      [g.bvslLeader, g.bvslId, g.subFacilitatorId, g.rgsfId, g.subFacilitator]
        .flatMap(value => Array.isArray(value) ? value : [value])
        .filter(Boolean)
        .forEach(value => groupByBvsl.set(String(value).toLowerCase(), g.groupName || ''));
    }

    // Fetch preaching entries in date range
    const dateFilter = reportType === 'daily' || effectiveStart === effectiveEnd
      ? { entryDate: effectiveStart }
      : { entryDate: { gte: effectiveStart, lte: effectiveEnd } };

    let allEntries: any[] = [];
    let offset = 0;
    while (true) {
      const { records, hasMore } = await BvslPreachingEntries.findAll({
        filters: dateFilter as any,
        limit: 2000,
        offset,
      });
      allEntries = allEntries.concat(records);
      if (!hasMore) break;
      offset += 2000;
    }

    const canonicalByAlias = new Map<string, string>();
    filteredBvslUsers.forEach(user => {
      bvUserAliases(user).forEach(alias => canonicalByAlias.set(alias, user.id));
    });

    // Group entries by user
    const entriesByUser = new Map<string, any[]>();
    for (const e of allEntries) {
      const entryAliases = (Array.isArray(e.user) ? e.user : [e.user])
        .filter(Boolean).map((value: unknown) => String(value).toLowerCase());
      const canonicalId = entryAliases.map(alias => canonicalByAlias.get(alias)).find(Boolean);
      if (!canonicalId) continue;
      if (!entriesByUser.has(canonicalId)) entriesByUser.set(canonicalId, []);
      entriesByUser.get(canonicalId)!.push(e);
    }

    const bvslRows = filteredBvslUsers.map(u => {
      const entries = entriesByUser.get(u.id) || [];
      const submitted = entries.length > 0;

      const sum = (field: string) => entries.reduce((s, e) => s + (Number((e as any)[field]) || 0), 0);

      const callingTime    = reportType === 'daily' ? (entries[0]?.prCallingTime ?? 0)      : sum('prCallingTime');
      const oneOnOneTime   = reportType === 'daily' ? (entries[0]?.prOneOnOneTime ?? 0)     : sum('prOneOnOneTime');
      const bookDistTime   = reportType === 'daily' ? (entries[0]?.prBookDistTime ?? 0)     : sum('prBookDistTime');
      const rduaTime       = reportType === 'daily' ? (entries[0]?.prRduaTime ?? 0)         : sum('prRduaTime');
      const planTime       = reportType === 'daily' ? (entries[0]?.prPlanTime ?? 0)         : sum('prPlanTime');
      const booksDistributed  = reportType === 'daily' ? (entries[0]?.prBooksDistributed ?? 0)  : sum('prBooksDistributed');
      const contactsCollected = reportType === 'daily' ? (entries[0]?.prContactsCollected ?? 0) : sum('prContactsCollected');
      const uniqueOneOnOnes   = reportType === 'daily' ? (entries[0]?.prUniqueOneOnOnes ?? 0)   : sum('prUniqueOneOnOnes');
      const totalMinutes      = reportType === 'daily' ? (entries[0]?.totalPreachingMinutes ?? 0) : sum('totalPreachingMinutes');

      return {
        id: u.id,
        userId: u.userId || u.id,
        fullName: u.fullName || '',
        phone: (u as any).phone || '',
        groupName: bvUserAliases(u).map(alias => groupByBvsl.get(alias)).find(Boolean) || '—',
        submitted,
        callingTime: Number(callingTime) || 0,
        oneOnOneTime: Number(oneOnOneTime) || 0,
        bookDistTime: Number(bookDistTime) || 0,
        rduaTime: Number(rduaTime) || 0,
        planTime: Number(planTime) || 0,
        booksDistributed: Number(booksDistributed) || 0,
        contactsCollected: Number(contactsCollected) || 0,
        uniqueOneOnOnes: Number(uniqueOneOnOnes) || 0,
        totalMinutes: Number(totalMinutes) || 0,
        entriesCount: entries.length,
        submittedAt: entries.length > 0 ? (entries[0].submittedAt || null) : null,
      };
    });

    // Sort by totalMinutes desc
    bvslRows.sort((a, b) => b.totalMinutes - a.totalMinutes);

    return {
      bvsls: bvslRows,
      groups: groups.map(g => ({ id: g.id, name: g.groupName || '' })),
    };
  },
});
