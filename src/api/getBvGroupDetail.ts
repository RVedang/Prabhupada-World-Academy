import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, BvSessions, BvAttendance, BvQuizzes, Users, AppError } from '@/lib/backend-sdk';

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getRecordUserKeys(record: any): string[] {
  const rawValues = [
    Array.isArray(record?.user) ? record.user[0] : record?.user,
    Array.isArray(record?.userId) ? record.userId[0] : record?.userId,
  ];
  return [...new Set(rawValues.filter(Boolean).map(String))];
}

function firstValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

function addUserToMap(userMap: Record<string, any>, user: any) {
  [
    user?.id,
    user?.userId,
    user?.email,
    user?.phone,
    user?.uid,
    user?.authUid,
    user?.firebaseUid,
    user?.firebaseUserId,
    user?.firebaseAuthUid,
  ].forEach(alias => {
    const key = normalizeKey(alias);
    if (key) userMap[key] = user;
  });
}

async function findUsersForKeys(keys: string[]): Promise<any[]> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  const fields = [
    'id', 'userId', 'fullName', 'email', 'phone', 'ashrayLevel', 'status',
    'bvGroupId', 'bvGroupName', 'bvRegistrationStatus', 'isBvMember',
    'uid', 'authUid', 'firebaseUid', 'firebaseUserId', 'firebaseAuthUid',
  ];
  const lookupFields = ['id', 'userId', 'email', 'phone', 'uid', 'authUid', 'firebaseUid', 'firebaseUserId', 'firebaseAuthUid'];
  const results = new Map<string, any>();

  for (let i = 0; i < uniqueKeys.length; i += 30) {
    const chunk = uniqueKeys.slice(i, i + 30);
    await Promise.all(lookupFields.map(async field => {
      const { records } = await Users.findAll({
        filters: { [field]: { in: chunk } } as any,
        fields,
        limit: 500,
      }).catch(() => ({ records: [] }));
      records.forEach((u: any) => results.set(u.id || u.userId || u.email, u));
    }));
  }

  return [...results.values()];
}

export default createEndpoint({
  description: 'Get full BV group detail — group info, active members, recent sessions',
  authenticated: true,
  inputSchema: z.object({ groupId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ input }: any) => {
    if (!input.groupId) throw new AppError({ code: 'BAD_REQUEST', message: 'groupId is required' });

    // Try finding by the custom groupId field first, then fall back to DB record ID
    let group = await BvGroups.findOne({
      filters: { groupId: input.groupId },
      fields: ['id', 'groupId', 'groupName', 'description', 'isActive', 'joinToken', 'whatsAppLink', 'bvslLeader'],
    });
    if (!group) {
      group = await BvGroups.findOne({
        id: input.groupId,
        fields: ['id', 'groupId', 'groupName', 'description', 'isActive', 'joinToken', 'whatsAppLink', 'bvslLeader'],
      }).catch(() => undefined);
    }
    if (!group) throw new AppError({ code: 'NOT_FOUND', message: 'Group not found' });

    const [membersRes, sessionsRes, quizzesRes] = await Promise.all([
      BvGroupMembers.findAll({ filters: { group: group.id }, fields: ['id', 'user', 'userId', 'role', 'joinedAt'], limit: 200 }),
      BvSessions.findAll({ filters: { group: group.id }, fields: ['id', 'sessionId', 'sessionDate', 'topic', 'notes'], limit: 50 }),
      BvQuizzes.findAll({ filters: { group: group.id }, fields: ['id', 'groupId', 'title', 'createdAt'], limit: 50 }),
    ]);

    const memberUserIds = membersRes.records.flatMap(getRecordUserKeys);

    const [userRecords, attendanceRes] = await Promise.all([
      memberUserIds.length > 0 ? findUsersForKeys(memberUserIds) : Promise.resolve([]),
      BvAttendance.findAll({
        filters: { group: group.id },
        fields: ['id', 'user', 'userId', 'present', 'attendanceDate'],
        limit: 2000,
      }).catch(() => ({ records: [] })),
    ]);

    const userMap: Record<string, any> = {};
    userRecords.forEach((u: any) => addUserToMap(userMap, u));

    const resolveMember = (record: any) => {
      const rawKeys = getRecordUserKeys(record);
      const matchedKey = rawKeys.find(key => userMap[normalizeKey(key)]);
      const user = matchedKey ? userMap[normalizeKey(matchedKey)] : null;
      const canonicalId = String(user?.id || user?.userId || rawKeys[0] || '');
      return { rawKeys, user, canonicalId };
    };

    const groupAliases = new Set([group.id, group.groupId].filter(Boolean).map(value => normalizeKey(value)));
    const activeMemberships = membersRes.records
      .map((m: any) => {
        const resolved = resolveMember(m);
        const profileGroupId = normalizeKey(firstValue(resolved.user?.bvGroupId));
        const isCurrentGroup = profileGroupId ? groupAliases.has(profileGroupId) : !!resolved.user?.isBvMember;
        const isActiveUser = !resolved.user?.status || String(resolved.user.status).toLowerCase() === 'active';
        const isActiveMember = !!resolved.user && isActiveUser && !!resolved.user?.isBvMember && isCurrentGroup;
        return { record: m, resolved, isActiveMember };
      })
      .filter(item => item.isActiveMember);

    const memberKeyToCanonical = new Map<string, string>();
    for (const { resolved } of activeMemberships) {
      for (const key of resolved.rawKeys) memberKeyToCanonical.set(normalizeKey(key), resolved.canonicalId);
    }

    const attendanceStats = new Map<string, { presentCount: number; totalCount: number; lastPresent: string }>();
    for (const a of attendanceRes.records || []) {
      const rawKeys = getRecordUserKeys(a);
      const rawMatch = rawKeys.find(key => memberKeyToCanonical.has(normalizeKey(key)));
      if (!rawMatch) continue;
      const canonicalId = memberKeyToCanonical.get(normalizeKey(rawMatch)) || rawMatch;
      const stats = attendanceStats.get(canonicalId) || { presentCount: 0, totalCount: 0, lastPresent: '' };
      stats.totalCount += 1;
      if (a.present) {
        stats.presentCount += 1;
        const attendanceDate = String(a.attendanceDate || '').slice(0, 10);
        if (attendanceDate && attendanceDate > stats.lastPresent) stats.lastPresent = attendanceDate;
      }
      attendanceStats.set(canonicalId, stats);
    }

    const members = activeMemberships.map(({ record: m, resolved }) => {
      const { user: u, canonicalId } = resolved;
      const stats = attendanceStats.get(canonicalId) || { presentCount: 0, totalCount: 0, lastPresent: '' };
      return {
        membershipId: m.id,
        userId: u?.userId || u?.id || canonicalId,
        fullName: u?.fullName || 'Unknown member',
        phone: u?.phone || '',
        ashrayLevel: u?.ashrayLevel || null,
        presentCount: stats.presentCount,
        totalCount: stats.totalCount,
        attendanceRate: stats.totalCount > 0 ? Math.round((stats.presentCount / stats.totalCount) * 100) : 0,
        lastPresent: stats.lastPresent || null,
        role: (m.role as string) || 'Member',
        joinedAt: (m.joinedAt as string) || '',
      };
    });

    const sessions = sessionsRes.records.map((s: any) => ({
      sessionId: (s.sessionId as string) || s.id,
      sessionDate: ((s.sessionDate as string) || '').slice(0, 10),
      topic: (s.topic as string) || '',
      notes: (s.notes as string) || '',
    }));

    const quizzes = quizzesRes.records.map((q: any) => ({
      quizId: q.id,
      title: (q.title as string) || 'Untitled Quiz',
      createdAt: (q.createdAt as string) || '',
    }));

    return {
      group: {
        groupId: (group.groupId as string) || group.id,
        groupName: (group.groupName as string) || '',
        description: (group.description as string) || '',
        isActive: (group.isActive as boolean) ?? true,
        joinToken: (group.joinToken as string) || null,
        whatsAppLink: (group.whatsAppLink as string) || null,
      },
      members,
      recentSessions: sessions.sort((a: any, b: any) => b.sessionDate.localeCompare(a.sessionDate)).slice(0, 20),
      quizzes,
      totalSessions: sessions.length,
      totalQuizzes: quizzes.length,
    };
  },
});
