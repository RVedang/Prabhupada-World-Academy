import { z } from 'zod';
import { createEndpoint, BvGroupMembers, BvAttendance, Users, FolkResidencies } from '@/lib/backend-sdk';

const USER_IDENTITY_FIELDS = ['id', 'userId', 'email', 'uid', 'authUid', 'firebaseUid', 'firebaseUserId', 'firebaseAuthUid', 'authId', 'authUserId', 'firebaseId', 'firebaseAuthId', 'firebase_id'];
const USER_FIELDS = ['id', 'userId', 'email', 'fullName', 'displayName', 'name', 'residencyApproved', 'residencyGuideVerified', 'residency', 'selectedFolkResidency', 'residencyName', 'ashrayLevel', ...USER_IDENTITY_FIELDS.filter(field => !['id', 'userId', 'email'].includes(field))];

function userIdentityAliases(user: any): string[] {
  return [...new Set(USER_IDENTITY_FIELDS
    .map(field => user?.[field])
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean))];
}

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

    // When a guide opens a member detail page, `input.userId` is often a
    // legacy/custom ID. Attendance may instead be saved with Firebase Auth
    // UID, so resolve the member and query every exact stored identity.
    let requestedUser = null;
    if (input.userId) {
      if (/^USER-\d+$/i.test(input.userId)) {
        const { records } = await Users.findAll({ filters: { userId: input.userId }, fields: USER_FIELDS });
        requestedUser = records.find(r => r.id !== r.userId) || records[0];
      }
      if (!requestedUser) {
        const byId = await Users.findOne({ id: input.userId, fields: USER_FIELDS }).catch(() => undefined);
        if (byId) {
          if (byId.id === byId.userId) {
            const { records } = await Users.findAll({ filters: { userId: byId.userId }, fields: USER_FIELDS });
            requestedUser = records.find(r => r.id !== r.userId) || byId;
          } else {
            requestedUser = byId;
          }
        }
      }
      if (!requestedUser) {
        const { records } = await Users.findAll({ filters: { userId: input.userId }, fields: USER_FIELDS });
        requestedUser = records.find(r => r.id !== r.userId) || records[0] || null;
      }
    }
    const rawUserKeys = new Set<string>([
      ...userIdentityAliases(requestedUser),
      ...(input.userId ? [] : userIdentityAliases(context.user)),
      ...(uid ? [String(uid).trim()] : []),
    ].filter(Boolean));
    const userKeys = new Set([...rawUserKeys].map(key => key.toLowerCase()));

    // Query only facilitator-recorded BV attendance directly by user ID (or
    // other user keys). Sadhana submissions are deliberately unrelated to
    // reading-group attendance.
    let allAtt: any[] = [];
    for (const key of rawUserKeys) {
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
      const groupId = Array.isArray(a.group) ? a.group[0] : a.group;
      return !!groupId;
    });

    const formattedHistory = allAtt.map(a => ({
      attendanceId: a.id,
      attendanceDate: a.attendanceDate || '',
      present: !!a.present,
    })).sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    // Leaderboard — get all unique member user IDs
    const memberIds = [...new Set(allAtt.map((a: any) => Array.isArray(a.user) ? a.user[0] : a.user).filter(Boolean))] as string[];
    
    // Ensure current user is always in the leaderboard list
    const currentUserIdStr = requestedUser?.id || String(context.user!.id);
    if (!memberIds.includes(currentUserIdStr)) {
      memberIds.push(currentUserIdStr);
    }

    const userFields = USER_FIELDS;
    const [userRecordsById, userRecordsByUserId] = await Promise.all([
      memberIds.length > 0
        ? Users.findAll({ filters: { id: { in: memberIds } }, fields: userFields })
        : { records: [] },
      memberIds.length > 0
        ? Users.findAll({ filters: { userId: { in: memberIds } }, fields: userFields })
        : { records: [] },
    ]);

    // Fetch all residencies to resolve residency IDs to names
    const { records: allResidencies } = await FolkResidencies.findAll({
      fields: ['id', 'residencyName'],
      limit: 1000,
    }).catch(() => ({ records: [] }));
    const residencyMap = new Map<string, string>();
    allResidencies.forEach((r: any) => {
      if (r.id && r.residencyName) {
        residencyMap.set(String(r.id).toLowerCase(), r.residencyName);
      }
    });

    const userDetailsMap = new Map<string, {
      name: string;
      userId: string;
      isResident: boolean;
      residencyName: string;
      ashrayLevel: string;
    }>();
    const addNameMap = (u: any) => {
      const isApprovedResident = !!((u.residencyApproved || u.residencyGuideVerified) && (u.selectedFolkResidency || u.residency || u.residencyName));
      const rawRes = u.residencyName || (Array.isArray(u.residency) ? u.residency[0] : u.residency) || '';
      const resName = residencyMap.get(String(rawRes).toLowerCase()) || rawRes;
      const details = {
        name: u.fullName || u.displayName || u.name || u.userId || u.id,
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
