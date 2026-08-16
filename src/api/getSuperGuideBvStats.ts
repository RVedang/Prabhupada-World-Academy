import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, BvAttendance, Users, Guides } from '@/lib/backend-sdk';

/** ISO week number for a given Date */
function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Convert ISO week + year to Mon–Sun date strings */
function isoWeekToDateRange(weekNum: number, year: number): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (weekNum - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(weekStart), end: fmt(weekEnd) };
}

import getGuides from './getGuides';

export default createEndpoint({
  description: 'Get BV stats for Super Guide — aggregate across all active groups with weekly filtering',
  authenticated: true,
  inputSchema: z.object({
    filterGuideId: z.string().optional(),
    weekNumber: z.number().optional(),
    year: z.number().optional(),
    segment: z.enum(['PW', 'FOLK']).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: { input: any; context: any }) => {
    // Fetch guides for dropdown via getGuides endpoint (segment-aware)
    const guidesListRes = await getGuides.execute({ input: { segment: input.segment }, context });
    const guidesForDropdown = (guidesListRes.guides || []).map((g: any) => ({
      guideId: g.guideId,
      name: g.name,
      segment: g.isPrabhupadaWorldMentor ? 'PW' : 'FOLK',
    }));

    const guideNameMap = new Map<string, string>();
    for (const g of guidesForDropdown) guideNameMap.set(g.guideId, g.name);

    // Fetch all active BV groups
    const { records: allGroups } = await BvGroups.findAll({
      filters: { isActive: true } as any,
      fields: ['id', 'groupId', 'groupName', 'guide'],
      limit: 500,
    });

    // Optionally filter groups by guide (filterGuideId is the guide DB UUID)
    const groups = input.filterGuideId
      ? allGroups.filter((g: any) => {
          const gid = Array.isArray(g.guide) ? g.guide[0] : g.guide;
          return gid === input.filterGuideId;
        })
      : allGroups;

    const emptyResult = {
      summary: { totalUsers: 0, markedCount: 0, presentCount: 0, absentCount: 0, notMarkedCount: 0, serviceFullCount: 0, avgPoints: 0 },
      guideBreakdown: [],
      leaderboard: [],
      guides: guidesForDropdown,
    };

    if (groups.length === 0) return emptyResult;

    const groupIds = groups.map((g: any) => g.id);

    // Map: groupId → guide DB id
    const groupGuideMap = new Map<string, string>();
    for (const g of groups) {
      const gid = Array.isArray((g as any).guide) ? (g as any).guide[0] : (g as any).guide;
      if (gid) groupGuideMap.set(g.id, gid as string);
    }

    // Week date range
    const now = new Date();
    const weekNum = input.weekNumber ?? getISOWeek(now);
    const year = input.year ?? now.getUTCFullYear();
    const { start: weekStart, end: weekEnd } = isoWeekToDateRange(weekNum, year);

    // Parallel: members + week attendance
    const [membersRes, weekAttRes] = await Promise.all([
      BvGroupMembers.findAll({
        filters: { group: { in: groupIds } } as any,
        fields: ['id', 'group', 'user'],
        limit: 2000,
      }),
      BvAttendance.findAll({
        filters: { group: { in: groupIds }, attendanceDate: { gte: weekStart, lte: weekEnd } } as any,
        fields: ['id', 'group', 'user', 'present'],
        limit: 2000,
      }),
    ]);

    // Fetch user info for members (display name, ashray, guide, role, flags)
    const { records: userRecs } = await Users.findAll({
      fields: ['id', 'userId', 'fullName', 'email', 'ashrayLevel', 'guide', 'role', 'isBvAdmin', 'isBvSuperAdmin'],
      limit: 2000,
    });

    const userInfoMap = new Map<string, any>();
    const adminUserIds = new Set<string>();

    const callerId = String(context.user?.id || '').toLowerCase();
    const callerUserId = String(context.user?.userId || '').toLowerCase();
    const callerEmail = String(context.user?.email || '').toLowerCase();
    if (callerId) adminUserIds.add(callerId);
    if (callerUserId) adminUserIds.add(callerUserId);
    if (callerEmail) adminUserIds.add(callerEmail);

    for (const u of userRecs) {
      const uId = String(u.id || u.userId || '').toLowerCase();
      const uEmail = String(u.email || '').toLowerCase();
      const uRole = String(u.role || '').toUpperCase();
      const uName = String(u.fullName || '').toLowerCase();

      const isAdmin =
        u.isBvAdmin ||
        u.isBvSuperAdmin ||
        uRole === 'ADMIN' ||
        uRole === 'SUPER_ADMIN' ||
        uRole === 'SUPER_GUIDE' ||
        uRole === 'PW_ADMIN' ||
        uRole === 'SUPER ADMIN' ||
        uName.includes('system admin') ||
        uName.includes('super admin') ||
        uEmail === 'hrvd@hkmmumbai.org' ||
        uEmail === 'srilaprabhupadaworld@gmail.com' ||
        uEmail === 'gaurmandal@folk.org' ||
        uEmail === 'admin@prabhupadaworld.org' ||
        (callerId && uId === callerId) ||
        (callerEmail && uEmail === callerEmail);

      if (isAdmin) {
        if (u.id) adminUserIds.add(String(u.id).toLowerCase());
        if (u.userId) adminUserIds.add(String(u.userId).toLowerCase());
        if (u.email) adminUserIds.add(String(u.email).toLowerCase());
      } else {
        userInfoMap.set(u.id, u);
        if (u.userId) userInfoMap.set(u.userId, u);
      }
    }

    // Build unique user set per group from members (excluding admin users)
    const usersByGroup = new Map<string, Set<string>>();
    for (const m of membersRes.records) {
      const gid = Array.isArray(m.group) ? m.group[0] : m.group as string;
      const uid = Array.isArray(m.user) ? m.user[0] : m.user as string;
      if (!gid || !uid) continue;
      if (adminUserIds.has(String(uid).toLowerCase())) continue;
      if (!usersByGroup.has(gid)) usersByGroup.set(gid, new Set());
      usersByGroup.get(gid)!.add(uid);
    }

    // All unique non-admin users across all groups
    const allUserIds = new Set<string>();
    for (const s of usersByGroup.values()) for (const uid of s) allUserIds.add(uid);

    // Weekly attendance: userId → { present, groupId } (excluding admin users)
    const attendanceByUser = new Map<string, { present: boolean; groupId: string }>();
    for (const a of weekAttRes.records) {
      const uid = Array.isArray(a.user) ? a.user[0] : a.user as string;
      const gid = Array.isArray(a.group) ? a.group[0] : a.group as string;
      if (!uid || adminUserIds.has(String(uid).toLowerCase())) continue;
      attendanceByUser.set(uid, { present: !!(a.present), groupId: gid });
    }

    // All-time attendance for leaderboard (paginated, excluding admin users)
    let allTimeAttendance: any[] = [];
    {
      let offset = 0;
      while (true) {
        const { records, hasMore } = await BvAttendance.findAll({
          filters: { group: { in: groupIds } } as any,
          fields: ['id', 'user', 'present'],
          limit: 2000,
          offset,
        });
        const nonAdminRecs = records.filter((a: any) => {
          const uid = Array.isArray(a.user) ? a.user[0] : a.user as string;
          return uid && !adminUserIds.has(String(uid).toLowerCase());
        });
        allTimeAttendance = allTimeAttendance.concat(nonAdminRecs);
        if (!hasMore) break;
        offset += 2000;
      }
    }

    // Aggregate all-time points per user
    const userTotalPoints = new Map<string, number>(); // attended (present)
    const userTotalSessions = new Map<string, number>(); // any attendance record
    for (const a of allTimeAttendance) {
      const uid = Array.isArray(a.user) ? a.user[0] : a.user as string;
      if (!uid || adminUserIds.has(String(uid).toLowerCase())) continue;
      userTotalSessions.set(uid, (userTotalSessions.get(uid) || 0) + 1);
      if (a.present) userTotalPoints.set(uid, (userTotalPoints.get(uid) || 0) + 1);
    }

    // ── Summary stats ──
    const totalUsers = allUserIds.size;
    const markedCount = attendanceByUser.size;
    const presentCount = [...attendanceByUser.values()].filter(a => a.present).length;
    const absentCount = markedCount - presentCount;
    const notMarkedCount = totalUsers - markedCount;
    const serviceFullCount = presentCount; // present = completed service
    const avgPoints = markedCount > 0
      ? Math.round((presentCount / markedCount) * 3 * 10) / 10
      : 0;

    // ── Guide breakdown ──
    const guideBreakdownMap = new Map<string, {
      guideName: string;
      userIds: Set<string>;
      markedCount: number;
      presentCount: number;
    }>();

    // Map: groupId → Admin / Guide display name
    const groupAdminNameMap = new Map<string, string>();
    for (const g of groups) {
      const gAdmin = (g as any).bvReportingAdminName || (g as any).bvslName || (g as any).guideName || (input.segment === 'PW' ? 'Hiranyavarna Das' : 'Gaurmandal Das');
      groupAdminNameMap.set(g.id, gAdmin);
    }

    for (const [gid, uids] of usersByGroup) {
      const guideDbId = groupGuideMap.get(gid) || '';
      const name = guideNameMap.get(guideDbId) || groupAdminNameMap.get(gid) || (input.segment === 'PW' ? 'Hiranyavarna Das' : 'Gaurmandal Das');
      if (!guideBreakdownMap.has(name)) {
        guideBreakdownMap.set(name, {
          guideName: name,
          userIds: new Set(),
          markedCount: 0,
          presentCount: 0,
        });
      }
      const entry = guideBreakdownMap.get(name)!;
      for (const uid of uids) entry.userIds.add(uid);
    }

    for (const [uid, att] of attendanceByUser) {
      const guideDbId = groupGuideMap.get(att.groupId) || '';
      const name = guideNameMap.get(guideDbId) || groupAdminNameMap.get(att.groupId) || (input.segment === 'PW' ? 'Hiranyavarna Das' : 'Gaurmandal Das');
      const entry = guideBreakdownMap.get(name);
      if (!entry) continue;
      entry.markedCount++;
      if (att.present) entry.presentCount++;
    }

    const guideBreakdown = [...guideBreakdownMap.entries()]
      .map(([, d]) => ({
        guideId: [...guideNameMap.entries()].find(([, n]) => n === d.guideName)?.[0] || '',
        guideName: d.guideName,
        totalUsers: d.userIds.size,
        presentCount: d.presentCount,
        serviceFullCount: d.presentCount,
        avgPoints: d.markedCount > 0
          ? Math.round((d.presentCount / d.markedCount) * 3 * 10) / 10
          : 0,
      }))
      .filter(d => d.totalUsers > 0);

    // ── Leaderboard (sorted by all-time points) ──
    const leaderboard = [...allUserIds]
      .map(uid => {
        const u = userInfoMap.get(uid);
        const totalPts = userTotalPoints.get(uid) || 0;
        const totalAtt = userTotalSessions.get(uid) || 0;
        const guideId = u ? (Array.isArray(u.guide) ? u.guide[0] : u.guide) : null;
        return {
          userId: uid,
          displayName: u ? ((u.fullName as string) || uid) : uid,
          guideName: guideId ? (guideNameMap.get(guideId as string) || '') : '',
          ashrayLevel: u ? ((u.ashrayLevel as string) || '') : '',
          totalPoints: totalPts,
          attendanceRate: totalAtt > 0 ? Math.round((totalPts / totalAtt) * 100) : 0,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 50);

    return {
      summary: { totalUsers, markedCount, presentCount, absentCount, notMarkedCount, serviceFullCount, avgPoints },
      guideBreakdown,
      leaderboard,
      guides: guidesForDropdown,
    };
  },
});
