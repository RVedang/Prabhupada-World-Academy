import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, BvAttendance, BvGroupRequests, Guides, Users } from '@/lib/backend-sdk';
import { getTodayIST } from '../lib/streakUtils';

const groupSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  groupName: z.string(),
  description: z.string(),
  memberCount: z.number(),
  totalSessions: z.number(),
  presentToday: z.number(),
  joinToken: z.string().nullable(),
  bvslName: z.string().nullable(),
  guideName: z.string().nullable(),
  meetingTime: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Get BV groups led by a BVSL (with member count, session count, today attendance)',
  authenticated: true,
  inputSchema: z.object({
    bvslId: z.string(), // custom userId field value
    viewRole: z.enum(['RGF', 'RGSF']).optional(),
  }),
  outputSchema: z.object({
    groups: z.array(groupSchema),
    pendingRequestCount: z.number(),
    error: z.string().nullable(),
  }),
  execute: async ({ input }: any) => {
    let groupRecords: any[] = [];
    let defaultBvslName = 'Reading Group Facilitator';

    if (input.bvslId === 'ALL' || !input.bvslId) {
      const { records } = await BvGroups.findAll({ limit: 500 });
      groupRecords = records;
    } else {
      const userRecord = await Users.findOne({ filters: { userId: input.bvslId }, fields: ['id', 'userId', 'fullName', 'email', 'guide', 'bvReportingFacilitatorId', 'isBvFacilitator', 'isBvsl', 'isBvSubFacilitator'] })
        ?? await Users.findOne({ id: input.bvslId, fields: ['id', 'userId', 'fullName', 'email', 'guide', 'bvReportingFacilitatorId', 'isBvFacilitator', 'isBvsl', 'isBvSubFacilitator'] });
      
      const dbUserId = userRecord?.id || input.bvslId;
      const parentRgfId = (userRecord as any)?.bvReportingFacilitatorId;
      defaultBvslName = userRecord?.fullName || '';
      const isRgsfView = input.viewRole === 'RGSF';
 
      const { records } = await BvGroups.findAll({
        limit: 200,
      });
      const callerKeys = new Set(
        [
          input.bvslId,
          dbUserId,
          userRecord?.userId,
          userRecord?.email,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
      );

      // RGSF dashboard must show only groups directly assigned to this
      // sub-facilitator. The parent RGF fallback is for RGF views only.
      groupRecords = records.filter((g: any) => {
        if (g.isActive === false) return false;

        const leader = String(g.bvslLeader || '').toLowerCase();
        const bId = String(g.bvslId || '').toLowerCase();
        const subFacilitatorValues = [
          g.subFacilitatorId,
          g.rgsfId,
          g.subFacilitator,
        ].flatMap((value) => Array.isArray(value) ? value : [value])
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());

        if (isRgsfView) {
          return subFacilitatorValues.some((value) => callerKeys.has(value));
        }

        return (
          callerKeys.has(leader) ||
          callerKeys.has(bId) ||
          subFacilitatorValues.some((value) => callerKeys.has(value)) ||
          (parentRgfId && (
            leader === String(parentRgfId).toLowerCase() ||
            bId === String(parentRgfId).toLowerCase()
          ))
        );
      });
    }

    const dedupedGroupRecords = new Map<string, any>();
    for (const group of groupRecords) {
      const ownerKey = String(group.bvslId || group.bvslLeader || '').toLowerCase();
      const timeKey = String(group.meetingTime || group.preferredTimeSlot || '').toLowerCase();
      const groupKey = String(group.groupId || '').toLowerCase()
        || `${String(group.groupName || '').trim().toLowerCase()}|${ownerKey}|${timeKey}`;
      if (!groupKey) continue;
      const existing = dedupedGroupRecords.get(groupKey);
      if (!existing || (existing.isActive === false && group.isActive !== false)) {
        dedupedGroupRecords.set(groupKey, group);
      }
    }
    groupRecords = Array.from(dedupedGroupRecords.values());

    if (groupRecords.length === 0) return { groups: [], pendingRequestCount: 0, error: null };

    const isAll = input.bvslId === 'ALL' || !input.bvslId;
    const todayDate = getTodayIST();

    // 1. Batch fetch Facilitator Users
    // IMPORTANT: g.bvslId values are custom app userId strings,
    // NOT Firestore row ids. We must query by userId field, then map by BOTH
    // the row id and the userId so lookups work with either value.
    const facilitatorUserIds = [...new Set(groupRecords.map((g: any) => g.bvslId || g.bvslLeader).filter(Boolean))] as string[];
    const facilitatorMap = new Map<string, any>();
    if (facilitatorUserIds.length > 0) {
      const batches: string[][] = [];
      for (let i = 0; i < facilitatorUserIds.length; i += 30) {
        batches.push(facilitatorUserIds.slice(i, i + 30));
      }
      const results = await Promise.all(batches.map(async (batch) => {
        const [byUserId, byId] = await Promise.all([
          Users.findAll({
            filters: { userId: { in: batch } } as any,
            fields: ['id', 'userId', 'segment', 'fullName'],
            limit: 100,
          }).catch(() => ({ records: [] })),
          Users.findAll({
            filters: { id: { in: batch } } as any,
            fields: ['id', 'userId', 'segment', 'fullName'],
            limit: 100,
          }).catch(() => ({ records: [] })),
        ]);
        return [...(byUserId?.records || []), ...(byId?.records || [])];
      }));

      const seen = new Set<string>();
      for (const list of results) {
        for (const u of list) {
          if (!seen.has(u.id)) {
            seen.add(u.id);
            facilitatorMap.set(u.id, u);
            if (u.userId) facilitatorMap.set(u.userId, u);
          }
        }
      }
    }

    // Older groups may have stored a Guides-table ID in bvslId. Resolve those
    // too so their facilitator segment is restored for the FOLK/PW filters.
    const unresolvedFacilitatorIds = facilitatorUserIds.filter(id => !facilitatorMap.has(id));
    if (unresolvedFacilitatorIds.length > 0) {
      const guideBatches: string[][] = [];
      for (let i = 0; i < unresolvedFacilitatorIds.length; i += 30) {
        guideBatches.push(unresolvedFacilitatorIds.slice(i, i + 30));
      }
      const guideLists = await Promise.all(guideBatches.map(async batch => {
        const res = await Guides.findAll({
          filters: { id: { in: batch } } as any,
          fields: ['id', 'guideId', 'fullName', 'email', 'segment'],
          limit: 100,
        }).catch(() => ({ records: [] }));
        return res.records || [];
      }));
      const legacyGuides = guideLists.flat();
      const guideEmails = [...new Set(legacyGuides.map((g: any) => g.email).filter(Boolean))] as string[];
      const usersByGuideEmail = new Map<string, any>();
      for (let i = 0; i < guideEmails.length; i += 30) {
        const { records } = await Users.findAll({
          filters: { email: { in: guideEmails.slice(i, i + 30) } } as any,
          fields: ['id', 'userId', 'segment', 'fullName', 'email'],
          limit: 100,
        }).catch(() => ({ records: [] }));
        for (const user of records) usersByGuideEmail.set(String(user.email || '').toLowerCase(), user);
      }
      for (const guide of legacyGuides) {
        const linkedUser = usersByGuideEmail.get(String(guide.email || '').toLowerCase());
        const resolved = linkedUser || {
          id: guide.id,
          userId: guide.guideId,
          fullName: guide.fullName,
          segment: guide.segment,
        };
        facilitatorMap.set(guide.id, resolved);
        if (guide.guideId) facilitatorMap.set(guide.guideId, resolved);
      }
    }

    // 2. Batch fetch Guides
    const guideIds = [...new Set(groupRecords.map((g: any) => Array.isArray(g.guide) ? g.guide[0] : g.guide).filter(Boolean))] as string[];
    const guideMap = new Map<string, any>();
    if (guideIds.length > 0) {
      const batches: string[][] = [];
      for (let i = 0; i < guideIds.length; i += 50) {
        batches.push(guideIds.slice(i, i + 50));
      }
      const results = await Promise.all(batches.map(async (batch) => {
        const res = await Guides.findAll({
          filters: { id: { in: batch } } as any,
          fields: ['id', 'fullName'],
          limit: 100,
        }).catch(() => ({ records: [] }));
        return res?.records || [];
      }));
      for (const list of results) {
        list.forEach((g: any) => guideMap.set(g.id, g));
      }
    }

    // 3. Batch fetch BvGroupMembers counts
    // Always scope to the groups we have — avoids fetching ALL members across entire DB
    const groupIdList = groupRecords.map((g: any) => g.id);
    const { records: allMembers } = await BvGroupMembers.findAll({
      filters: { group: { in: groupIdList } } as any,
      limit: 5000,
      fields: ['id', 'group', 'user', 'userId'],
    });

    const firstValue = (value: unknown): string => {
      if (Array.isArray(value)) return String(value[0] || '');
      return String(value || '');
    };

    const memberUserIds = [...new Set(allMembers.flatMap((m: any) => [
      firstValue(m.user),
      firstValue(m.userId)
    ]).filter(Boolean))];

    const userMap: Record<string, any> = {};
    if (memberUserIds.length > 0) {
      const batches: string[][] = [];
      for (let i = 0; i < memberUserIds.length; i += 30) {
        batches.push(memberUserIds.slice(i, i + 30));
      }
      const results = await Promise.all(batches.map(async (batch) => {
        const [byUserId, byId] = await Promise.all([
          Users.findAll({
            filters: { userId: { in: batch } } as any,
            fields: ['id', 'userId', 'status', 'isBvMember', 'bvGroupId'],
            limit: 100,
          }).catch(() => ({ records: [] })),
          Users.findAll({
            filters: { id: { in: batch } } as any,
            fields: ['id', 'userId', 'status', 'isBvMember', 'bvGroupId'],
            limit: 100,
          }).catch(() => ({ records: [] })),
        ]);
        return [...(byUserId?.records || []), ...(byId?.records || [])];
      }));

      for (const list of results) {
        for (const u of list) {
          userMap[u.id] = u;
          if (u.userId) userMap[u.userId] = u;
        }
      }
    }

    const memberCounts: Record<string, number> = {};
    for (const m of allMembers) {
      const gid = Array.isArray(m.group) ? m.group[0] : m.group;
      if (!gid) continue;

      const groupAliases = new Set([gid].map(value => String(value).toLowerCase()));
      const groupRec = groupRecords.find(gr => gr.id === gid);
      if (groupRec && groupRec.groupId) {
        groupAliases.add(String(groupRec.groupId).toLowerCase());
      }

      const uid = firstValue(m.user);
      const altUid = firstValue((m as any).userId);
      const u = userMap[uid] || userMap[uid.toLowerCase()] || userMap[altUid] || userMap[altUid.toLowerCase()];

      const profileGroupId = firstValue(u?.bvGroupId).toLowerCase();
      const isCurrentGroup = profileGroupId ? groupAliases.has(profileGroupId) : !!u?.isBvMember;
      const isActiveUser = !u?.status || String(u.status).toLowerCase() === 'active';

      if (u && u.isBvMember && isCurrentGroup && isActiveUser) {
        memberCounts[gid] = (memberCounts[gid] || 0) + 1;
      }
    }

    const groups = await Promise.all(groupRecords.map(async (g) => {
      const facilitatorUser = facilitatorMap.get(g.bvslId || g.bvslLeader);
      const guideRes = guideMap.get(Array.isArray(g.guide) ? g.guide[0] : g.guide);
      
      let totalSessions = 0;
      let presentToday = 0;

      // Only fetch attendance stats if it's not the ALL view (to save API calls)
      if (!isAll) {
        const [allGroupAtt, todayPresentAtt] = await Promise.all([
          BvAttendance.findAll({ filters: { group: g.id }, fields: ['attendanceDate'], limit: 2000 }),
          BvAttendance.findAll({ filters: { group: g.id, attendanceDate: todayDate, present: true }, fields: ['id'], limit: 200 }),
        ]);
        const distinctDates = new Set(allGroupAtt.records.map((a: any) => a.attendanceDate).filter(Boolean));
        totalSessions = distinctDates.size;
        presentToday = todayPresentAtt.records.length;
      }

      return {
        id: g.id,
        groupId: g.groupId || g.id,
        groupName: g.groupName || '',
        description: g.description || '',
        memberCount: memberCounts[g.id] || 0,
        totalSessions,
        presentToday,
        joinToken: g.joinToken || null,
        bvslName: facilitatorUser?.fullName || g.bvslName || defaultBvslName || null,
        guideName: guideRes?.fullName || null,
        meetingTime: g.meetingTime || g.preferredTimeSlot || null,
        // Facilitator ownership is authoritative. This also repairs the
        // display of groups created before createBvGroup resolved custom IDs.
        segment: String(facilitatorUser?.segment || g.segment || 'PW').toUpperCase() === 'FOLK' ? 'FOLK' : 'PW',
        isActive: g.isActive ?? true,
      };
    }));

    // Count pending join requests (only if not ALL view)
    let pendingRequestCount = 0;
    if (!isAll) {
      for (const g of groupRecords) {
        const { records: reqs } = await BvGroupRequests.findAll({
          filters: { group: g.id, status: 'Pending' },
          limit: 100,
          fields: ['id'],
        });
        pendingRequestCount += reqs.length;
      }
    }

    return { groups, pendingRequestCount, error: null };
  },
});
