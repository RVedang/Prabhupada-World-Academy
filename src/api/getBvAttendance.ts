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
  execute: async ({ input, context }: any) => {
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
      limit: 1000,
    }).catch(() => ({ records: [] }));

    const sadhanaMap = new Map(sadhanaRecords.map((s: any) => [s.entryDate, s]));

    // Query BvAttendance directly by user ID (or other user keys)
    let allAtt: any[] = [];
    for (const key of userKeys) {
      const { records } = await BvAttendance.findAll({
        filters: { user: key, attendanceDate: { gte: sinceDate } },
        limit: 1000,
      }).catch(() => ({ records: [] }));
      allAtt = allAtt.concat(records);
    }

    // Deduplicate attendance records by ID
    const seenAttIds = new Set<string>();
    allAtt = allAtt.filter(a => {
      if (seenAttIds.has(a.id)) return false;
      seenAttIds.add(a.id);
      return true;
    });

    const formattedHistory = allAtt.map(a => ({
      attendanceId: a.id,
      attendanceDate: a.attendanceDate || '',
      present: !!a.present,
    })).sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    // Leaderboard — get all unique member user IDs
    const memberIds = [...new Set(allAtt.map((a: any) => Array.isArray(a.user) ? a.user[0] : a.user).filter(Boolean))] as string[];
    const userFields = ['id', 'fullName', 'userId', 'residencyApproved', 'residencyGuideVerified', 'residency', 'selectedFolkResidency', 'residencyName', 'ashrayLevel'];
    const [userRecordsById, userRecordsByUserId] = await Promise.all([
      memberIds.length > 0
        ? Users.findAll({ filters: { id: { in: memberIds } }, fields: userFields })
        : { records: [] },
      memberIds.length > 0
        ? Users.findAll({ filters: { userId: { in: memberIds } }, fields: userFields })
        : { records: [] },
    ]);

    const userDetailsMap = new Map<string, {
      name: string;
      userId: string;
      isResident: boolean;
      residencyName: string;
      ashrayLevel: string;
    }>();
    const addNameMap = (u: any) => {
      const isApprovedResident = !!((u.residencyApproved || u.residencyGuideVerified) && (u.selectedFolkResidency || u.residency || u.residencyName));
      const resName = u.residencyName || (Array.isArray(u.residency) ? u.residency[0] : u.residency) || '';
      const details = {
        name: u.fullName || '',
        userId: u.userId || u.id,
        isResident: isApprovedResident,
        residencyName: resName,
        ashrayLevel: u.ashrayLevel || 'Jigyasa',
      };
      userDetailsMap.set(u.id, details);
      if (u.userId) {
        userDetailsMap.set(u.userId, details);
      }
    };
    userRecordsById.records.forEach(addNameMap);
    userRecordsByUserId.records.forEach(addNameMap);

    const dateMap = new Map<string, boolean>();
    allAtt.forEach((a: any) => {
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

    const myAttRecords = allAtt.filter((a: any) => {
      const rawU = Array.isArray(a.user) ? a.user[0] : a.user;
      const uStr = String(rawU || '').toLowerCase();
      return userKeys.has(uStr);
    });

    // Count distinct attendance dates = total sessions
    const totalSessionDates = new Set(allAtt.map((a: any) => a.attendanceDate).filter(Boolean)).size;

    const leaderboard = memberIds.map(memberId => {
      const memberAtt = allAtt.filter((a: any) => (Array.isArray(a.user) ? a.user[0] : a.user) === memberId);
      const presentCount = memberAtt.filter((a: any) => a.present).length;
      const info = userDetailsMap.get(memberId);
      return {
        userId: (info as any)?.userId || memberId,
        displayName: (info as any)?.name || memberId,
        presentCount,
        totalCount: totalSessionDates,
        attendanceRate: totalSessionDates > 0 ? Math.round((presentCount / totalSessionDates) * 100) : 0,
        isResident: (info as any)?.isResident ?? false,
        residencyName: (info as any)?.residencyName ?? '',
        ashrayLevel: (info as any)?.ashrayLevel ?? '',
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
