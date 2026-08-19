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
      const userRecord = await Users.findOne({ filters: { userId: input.bvslId }, fields: ['id', 'fullName', 'guide', 'bvReportingFacilitatorId'] })
        ?? await Users.findOne({ id: input.bvslId, fields: ['id', 'fullName', 'guide', 'bvReportingFacilitatorId'] });
      
      const dbUserId = userRecord?.id || input.bvslId;
      const parentRgfId = (userRecord as any)?.bvReportingFacilitatorId;
      defaultBvslName = userRecord?.fullName || '';
 
      const { records } = await BvGroups.findAll({
        limit: 200,
      });
      // Filter by bvslLeader, bvslId, subFacilitator, or parent RGF
      groupRecords = records.filter((g: any) => 
        g.bvslLeader === dbUserId || 
        g.bvslId === input.bvslId || 
        g.bvslId === dbUserId || 
        g.bvslLeader === input.bvslId ||
        g.subFacilitatorId === dbUserId ||
        g.subFacilitatorId === input.bvslId ||
        g.rgsfId === dbUserId ||
        g.rgsfId === input.bvslId ||
        g.subFacilitator === dbUserId ||
        g.subFacilitator === input.bvslId ||
        (parentRgfId && (
          g.bvslLeader === parentRgfId ||
          g.bvslId === parentRgfId
        ))
      );
    }

    if (groupRecords.length === 0) return { groups: [], pendingRequestCount: 0, error: null };

    const isAll = input.bvslId === 'ALL' || !input.bvslId;
    const todayDate = getTodayIST();

    // 1. Batch fetch Facilitator Users
    const facilitatorUserIds = [...new Set(groupRecords.map((g: any) => g.bvslId || g.bvslLeader).filter(Boolean))] as string[];
    const facilitatorMap = new Map<string, any>();
    if (facilitatorUserIds.length > 0) {
      for (let i = 0; i < facilitatorUserIds.length; i += 50) {
        const batch = facilitatorUserIds.slice(i, i + 50);
        const { records: batchUsers } = await Users.findAll({
          filters: { id: { in: batch } } as any,
          fields: ['id', 'segment', 'fullName'],
          limit: 100,
        });
        batchUsers.forEach((u: any) => facilitatorMap.set(u.id, u));
      }
    }

    // 2. Batch fetch Guides
    const guideIds = [...new Set(groupRecords.map((g: any) => Array.isArray(g.guide) ? g.guide[0] : g.guide).filter(Boolean))] as string[];
    const guideMap = new Map<string, any>();
    if (guideIds.length > 0) {
      for (let i = 0; i < guideIds.length; i += 50) {
        const batch = guideIds.slice(i, i + 50);
        const { records: batchGuides } = await Guides.findAll({
          filters: { id: { in: batch } } as any,
          fields: ['id', 'fullName'],
          limit: 100,
        });
        batchGuides.forEach((g: any) => guideMap.set(g.id, g));
      }
    }

    // 3. Batch fetch BvGroupMembers counts (group by group id)
    // To avoid fetching members for 200 groups individually, we'll fetch all members and group them
    const { records: allMembers } = await BvGroupMembers.findAll({
      filters: isAll ? {} : { group: { in: groupRecords.map((g: any) => g.id) } } as any,
      limit: 5000,
      fields: ['id', 'group'],
    });
    const memberCounts: Record<string, number> = {};
    for (const m of allMembers) {
      const gid = Array.isArray(m.group) ? m.group[0] : m.group;
      if (gid) memberCounts[gid] = (memberCounts[gid] || 0) + 1;
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
        segment: g.segment || facilitatorUser?.segment || 'PW',
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
