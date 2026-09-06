import { z } from 'zod';
import { createEndpoint, BvGroupMembers, BvAttendance, Users, FolkResidencies } from '@/lib/backend-sdk';

const USER_IDENTITY_FIELDS = ['id', 'userId', 'email', 'uid', 'authUid', 'firebaseUid', 'firebaseUserId', 'firebaseAuthUid', 'authId', 'authUserId', 'firebaseId', 'firebaseAuthId', 'firebase_id'];
const USER_FIELDS = ['id', 'userId', 'email', 'fullName', 'displayName', 'name', 'residencyApproved', 'residencyGuideVerified', 'residency', 'selectedFolkResidency', 'residencyName', 'ashrayLevel', ...USER_IDENTITY_FIELDS.filter(field => !['id', 'userId', 'email'].includes(field))];

function firstValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

function userIdentityAliases(user: any): string[] {
  return [...new Set(USER_IDENTITY_FIELDS
    .map(field => user?.[field])
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean))];
}

function formatDisplayName(str: string): string {
  if (!str) return 'Member';
  const trimmed = str.trim();
  if (!trimmed.includes('@')) return trimmed;
  const username = trimmed.split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!username) return trimmed;
  return username.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function findUsersForAliases(aliases: string[]): Promise<any[]> {
  const uniqueAliases = [...new Set(aliases.filter(Boolean))];
  const users = new Map<string, any>();

  for (let i = 0; i < uniqueAliases.length; i += 30) {
    const chunk = uniqueAliases.slice(i, i + 30);
    const [byId, byUserId, byFirebaseUid, byEmail] = await Promise.all([
      Users.findAll({ filters: { id: { in: chunk } }, fields: USER_FIELDS, limit: 30 }).catch(() => ({ records: [] })),
      Users.findAll({ filters: { userId: { in: chunk } }, fields: USER_FIELDS, limit: 30 }).catch(() => ({ records: [] })),
      Users.findAll({ filters: { firebaseUid: { in: chunk } }, fields: USER_FIELDS, limit: 30 }).catch(() => ({ records: [] })),
      Users.findAll({ filters: { email: { in: chunk } }, fields: USER_FIELDS, limit: 30 }).catch(() => ({ records: [] })),
    ]);
    for (const user of [...byId.records, ...byUserId.records, ...byFirebaseUid.records, ...byEmail.records]) {
      users.set(user.id, user);
    }
  }

  return [...users.values()];
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
    if (!context.user) throw new Error('Unauthorized');
    const lookupId = input.userId || context.user.id;
    const sinceDate = input.sinceDate || new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0];

    // Resolve the member once, then query only their group. Previously this
    // endpoint fetched 90 days of attendance for the entire application and
    // discarded almost all of those documents in memory.
    const [byId, byUserId] = await Promise.all([
      Users.findOne({ id: lookupId, fields: USER_FIELDS }).catch(() => null),
      Users.findOne({ filters: { userId: lookupId }, fields: USER_FIELDS }).catch(() => null),
    ]);
    const requestedUser = byId || byUserId;
    const identityAliases = [...new Set([
      lookupId,
      ...userIdentityAliases(requestedUser),
      ...userIdentityAliases(context.user),
    ].filter(Boolean).map(String))];

    const [membershipByUser, membershipByUserId] = await Promise.all([
      BvGroupMembers.findAll({
        filters: { user: { in: identityAliases } },
        fields: ['id', 'group', 'groupId', 'user', 'userId'],
        limit: 10,
      }),
      BvGroupMembers.findAll({
        filters: { userId: { in: identityAliases } },
        fields: ['id', 'group', 'groupId', 'user', 'userId'],
        limit: 10,
      }),
    ]);
    const membership = membershipByUser.records[0] || membershipByUserId.records[0];
    const groupId = firstValue(membership?.group || membership?.groupId);
    if (!groupId) {
      return { userHistory: [], leaderboard: [], userTotalPointsThisWeek: 0 };
    }

    const [attendanceByGroup, membersByGroup, attendanceByGroupId, membersByGroupId] = await Promise.all([
      BvAttendance.findAll({
        filters: { group: groupId },
        fields: ['id', 'group', 'groupId', 'user', 'present', 'attendanceDate'],
        limit: 5000,
      }),
      BvGroupMembers.findAll({
        filters: { group: groupId },
        fields: ['id', 'user', 'userId'],
        limit: 1000,
      }),
      BvAttendance.findAll({
        filters: { groupId },
        fields: ['id', 'group', 'groupId', 'user', 'present', 'attendanceDate'],
        limit: 5000,
      }).catch(() => ({ records: [], hasMore: false })),
      BvGroupMembers.findAll({
        filters: { groupId },
        fields: ['id', 'user', 'userId'],
        limit: 1000,
      }).catch(() => ({ records: [], hasMore: false })),
    ]);

    const attendanceResult = {
      records: [...attendanceByGroup.records, ...attendanceByGroupId.records]
        .filter((record: any, index: number, records: any[]) => records.findIndex(item => item.id === record.id) === index),
    };
    const groupMembersResult = {
      records: [...membersByGroup.records, ...membersByGroupId.records]
        .filter((member: any, index: number, members: any[]) => members.findIndex(item => item.id === member.id) === index),
    };

    const allAtt = attendanceResult.records.filter((record: any) =>
      !!record.attendanceDate && String(record.attendanceDate) >= sinceDate
    );
    const memberAliases = [...new Set([
      ...identityAliases,
      ...groupMembersResult.records.flatMap((member: any) => [firstValue(member.user), firstValue(member.userId)]),
      ...allAtt.map((record: any) => firstValue(record.user)),
    ].filter(Boolean))];
    const userRecords = await findUsersForAliases(memberAliases);
    if (requestedUser && !userRecords.some(user => user.id === requestedUser.id)) {
      userRecords.push(requestedUser);
    }

    const residencyIds = [...new Set(userRecords.flatMap(user => [
      firstValue(user.residency),
      firstValue(user.selectedFolkResidency),
    ]).filter(Boolean))];
    const residencyMap = new Map<string, string>();
    for (let i = 0; i < residencyIds.length; i += 30) {
      const chunk = residencyIds.slice(i, i + 30);
      const [byDbId, byCustomId] = await Promise.all([
        FolkResidencies.findAll({ filters: { id: { in: chunk } }, fields: ['id', 'residencyId', 'residencyName'], limit: 30 }),
        FolkResidencies.findAll({ filters: { residencyId: { in: chunk } }, fields: ['id', 'residencyId', 'residencyName'], limit: 30 }),
      ]);
      for (const residency of [...byDbId.records, ...byCustomId.records]) {
        if (residency.id) residencyMap.set(String(residency.id).toLowerCase(), residency.residencyName || '');
        if (residency.residencyId) residencyMap.set(String(residency.residencyId).toLowerCase(), residency.residencyName || '');
      }
    }

    type UserInfo = {
      canonicalId: string;
      userId: string;
      name: string;
      isResident: boolean;
      residencyName: string;
      ashrayLevel: string;
      aliases: string[];
    };
    const infoByAlias = new Map<string, UserInfo>();
    for (const user of userRecords) {
      const aliases = userIdentityAliases(user);
      const rawResidency = user.residencyName || firstValue(user.residency) || firstValue(user.selectedFolkResidency);
      const rawName = String(user.fullName || user.displayName || user.name || '').trim();
      const resolvedName = (rawName && !rawName.includes('@'))
        ? rawName
        : (user.email ? formatDisplayName(user.email) : formatDisplayName(user.userId || user.id));

      const info: UserInfo = {
        canonicalId: user.id,
        userId: user.userId || user.id,
        name: resolvedName,
        isResident: !!((user.residencyApproved || user.residencyGuideVerified) && rawResidency),
        residencyName: residencyMap.get(String(rawResidency).toLowerCase()) || rawResidency || '',
        ashrayLevel: user.ashrayLevel || 'Jigyasa',
        aliases,
      };
      for (const alias of aliases) infoByAlias.set(alias.toLowerCase(), info);
    }

    const currentAliasSet = new Set(identityAliases.map(alias => alias.toLowerCase()));
    for (const alias of [...currentAliasSet]) {
      const info = infoByAlias.get(alias);
      info?.aliases.forEach(value => currentAliasSet.add(value.toLowerCase()));
    }

    // De-duplicate repeated legacy rows by canonical user/date. If duplicate
    // rows disagree, a present mark wins for that session.
    const attendanceByUser = new Map<string, Map<string, boolean>>();
    for (const record of allAtt) {
      const rawAlias = firstValue(record.user);
      if (!rawAlias) continue;
      const info = infoByAlias.get(rawAlias.toLowerCase());
      const canonicalId = info?.canonicalId || rawAlias.toLowerCase();
      if (!attendanceByUser.has(canonicalId)) attendanceByUser.set(canonicalId, new Map());
      const date = String(record.attendanceDate || '');
      const previous = attendanceByUser.get(canonicalId)!.get(date) || false;
      attendanceByUser.get(canonicalId)!.set(date, previous || !!record.present);
    }

    const sessionDates = [...new Set(allAtt.map((record: any) => String(record.attendanceDate || '')).filter(Boolean))];
    const canonicalMembers = new Map<string, UserInfo | null>();
    for (const alias of memberAliases) {
      const info = infoByAlias.get(alias.toLowerCase());
      canonicalMembers.set(info?.canonicalId || alias.toLowerCase(), info || null);
    }
    const currentInfo = [...currentAliasSet].map(alias => infoByAlias.get(alias)).find(Boolean);
    const currentCanonicalId = currentInfo?.canonicalId || lookupId.toLowerCase();
    canonicalMembers.set(currentCanonicalId, currentInfo || null);

    const leaderboard = [...canonicalMembers.entries()].map(([canonicalId, info]) => {
      const memberAttendance = attendanceByUser.get(canonicalId) || new Map<string, boolean>();
      const presentCount = [...memberAttendance.values()].filter(Boolean).length;
      const nameCandidate = info?.name || canonicalId;
      const displayName = nameCandidate.includes('@') ? formatDisplayName(nameCandidate) : nameCandidate;
      return {
        userId: info?.userId || canonicalId,
        displayName,
        presentCount,
        totalCount: sessionDates.length,
        attendanceRate: sessionDates.length > 0 ? Math.round((presentCount / sessionDates.length) * 100) : 0,
        isResident: info?.isResident ?? false,
        residencyName: info?.residencyName ?? '',
        ashrayLevel: info?.ashrayLevel ?? '',
      };
    }).sort((a, b) => b.presentCount - a.presentCount || a.displayName.localeCompare(b.displayName));

    const myAttendance = attendanceByUser.get(currentCanonicalId) || new Map<string, boolean>();
    const userHistory = [...myAttendance.entries()].map(([attendanceDate, present]) => ({
      attendanceDate,
      present,
      status: present ? 'P' : 'A',
      sessionTopic: '',
    })).sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const userTotalPointsThisWeek = userHistory.filter(entry => entry.present && entry.attendanceDate >= weekStartStr).length;

    return { userHistory, leaderboard, userTotalPointsThisWeek };
  },
});
