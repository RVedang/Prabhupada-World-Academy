import { z } from 'zod';
import { createEndpoint, BvGroupMembers, BvAttendance, Users, SadhanaEntries } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get BV attendance history and leaderboard for the current user',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string().optional(),
    localDate: z.string().optional(),
    sinceDate: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const uid = input.userId || context.user!.id;
    const sinceDate = input.sinceDate || new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0];

    const userKeys = new Set<string>();
    if (uid) userKeys.add(String(uid).toLowerCase());
    if (context.user?.id) userKeys.add(String(context.user.id).toLowerCase());
    if (context.user?.userId) userKeys.add(String(context.user.userId).toLowerCase());
    if (context.user?.email) userKeys.add(String(context.user.email).toLowerCase());

    // Query SadhanaEntries for all users — even those not in a BvGroup
    const { records: sadhanaRecords } = await SadhanaEntries.findAll({
      filters: { user: uid } as any,
      fields: ['id', 'entryDate', 'fieldValuesJson'],
      limit: 1000,
    }).catch(() => ({ records: [] }));

    // Get user's group membership
    const membershipRes = await BvGroupMembers.findAll({ filters: { user: uid }, limit: 5, fields: ['id', 'group'] });
    const membership = membershipRes.records[0];

    const groupId = membership ? (Array.isArray(membership.group) ? membership.group[0] : membership.group) : null;

    // Query all BvAttendance records and filter by userKeys
    const { records: allBvRecords } = await BvAttendance.findAll({
      limit: 2000,
      fields: ['id', 'user', 'present', 'attendanceDate'],
    }).catch(() => ({ records: [] }));

    const myAttRecords = allBvRecords.filter((a: any) => {
      const rawU = Array.isArray(a.user) ? a.user[0] : a.user;
      const uStr = String(rawU || '').toLowerCase();
      return userKeys.has(uStr);
    });

    const allAtt = allBvRecords;

    const dateMap = new Map<string, boolean>();
    myAttRecords.forEach((a: any) => {
      if (a.attendanceDate) dateMap.set(a.attendanceDate, a.present || false);
    });

    sadhanaRecords.forEach((s: any) => {
      const d = String(s.entryDate || '').slice(0, 10);
      if (d && !dateMap.has(d)) {
        let isPresent = false;
        try {
          const fv = typeof s.fieldValuesJson === 'string' ? JSON.parse(s.fieldValuesJson) : (s.fieldValuesJson || {});
          isPresent = !!(
            fv.bhaktiVriksha === true ||
            fv.bhaktiVriksha === 1 ||
            fv.bhaktiVriksha === 'true' ||
            Number(fv.bhaktiVriksha) > 0 ||
            Number(fv._pts_bhaktiVriksha) > 0
          );
        } catch {
          isPresent = false;
        }
        dateMap.set(d, isPresent);
      }
    });

    const userHistory = Array.from(dateMap.entries()).map(([attendanceDate, present]) => ({
      attendanceDate,
      present,
      status: present ? 'P' : 'A',
      sessionTopic: '',
    })).sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    // Leaderboard — get all unique member user IDs
    const memberIds = [...new Set(allAtt.map((a: any) => Array.isArray(a.user) ? a.user[0] : a.user).filter(Boolean))] as string[];
    const userRecords = memberIds.length > 0
      ? await Users.findAll({ filters: { id: { in: memberIds } }, fields: ['id', 'fullName', 'userId'] })
      : { records: [] };
    const userNameMap = new Map<string, { name: string; userId: string }>(
      userRecords.records.map((u: any) => [u.id, { name: u.fullName || '', userId: u.userId || u.id }] as [string, { name: string; userId: string }])
    );

    // Count distinct attendance dates = total sessions
    const totalSessionDates = new Set(allAtt.map((a: any) => a.attendanceDate).filter(Boolean)).size;

    const leaderboard = memberIds.map(memberId => {
      const memberAtt = allAtt.filter((a: any) => (Array.isArray(a.user) ? a.user[0] : a.user) === memberId);
      const presentCount = memberAtt.filter((a: any) => a.present).length;
      const info = userNameMap.get(memberId);
      return {
        userId: (info as any)?.userId || memberId,
        userName: (info as any)?.name || memberId,
        presentCount,
        totalSessions: totalSessionDates,
        attendanceRate: totalSessionDates > 0 ? Math.round((presentCount / totalSessionDates) * 100) : 0,
      };
    }).sort((a, b) => b.presentCount - a.presentCount);

    // This week points (1 point per present session this week)
    const weekStart = new Date(); weekStart.setHours(0,0,0,0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const thisWeekPresent = myAttRecords.filter((a: any) => a.present && a.attendanceDate >= weekStartStr).length;

    return { userHistory, leaderboard, userTotalPointsThisWeek: thisWeekPresent };
  },
});
