import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get members of a specific BV group with user details',
  authenticated: true,
  inputSchema: z.object({ groupDbId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ input }: any) => {
    // Try by DB UUID first, then by custom groupId field
    let group = await BvGroups.findOne({ id: input.groupDbId, fields: ['id', 'groupId', 'groupName'] });
    if (!group) group = await BvGroups.findOne({ filters: { groupId: input.groupDbId }, fields: ['id', 'groupId', 'groupName'] });
    if (!group) throw new AppError({ code: 'NOT_FOUND', message: 'Group not found' });

    const { records: memberships } = await BvGroupMembers.findAll({
      filters: { group: group.id },
      fields: ['id', 'user', 'role', 'joinedAt'],
      limit: 500,
    });

    const memberUserIds = memberships
      .map(m => (Array.isArray(m.user) ? m.user[0] : m.user) as string)
      .filter(Boolean);

    const userMap: Record<string, any> = {};
    if (memberUserIds.length > 0) {
      // 1. Find by database id/UUID
      const { records: usersById } = await Users.findAll({
        filters: { id: { in: memberUserIds } as any },
        fields: ['id', 'userId', 'fullName', 'phone', 'ashrayLevel', 'currentStreak', 'email'],
        limit: 500,
      });
      for (const u of usersById) {
        userMap[u.id] = u;
        if (u.userId) userMap[u.userId] = u;
        if (u.fullName) userMap[u.fullName] = u;
        if (u.fullName) userMap[u.fullName.toLowerCase()] = u;
        if (u.email) userMap[u.email.toLowerCase()] = u;
      }

      // 2. Find by custom userId string
      const { records: usersByCustomId } = await Users.findAll({
        filters: { userId: { in: memberUserIds } as any },
        fields: ['id', 'userId', 'fullName', 'phone', 'ashrayLevel', 'currentStreak', 'email'],
        limit: 500,
      });
      for (const u of usersByCustomId) {
        userMap[u.id] = u;
        if (u.userId) userMap[u.userId] = u;
        if (u.fullName) userMap[u.fullName] = u;
        if (u.fullName) userMap[u.fullName.toLowerCase()] = u;
        if (u.email) userMap[u.email.toLowerCase()] = u;
      }

      // 3. Find by fullName (highly common in backup CSV files)
      const { records: usersByName } = await Users.findAll({
        filters: { fullName: { in: memberUserIds } as any },
        fields: ['id', 'userId', 'fullName', 'phone', 'ashrayLevel', 'currentStreak', 'email'],
        limit: 500,
      });
      for (const u of usersByName) {
        userMap[u.id] = u;
        if (u.userId) userMap[u.userId] = u;
        if (u.fullName) userMap[u.fullName] = u;
        if (u.fullName) userMap[u.fullName.toLowerCase()] = u;
        if (u.email) userMap[u.email.toLowerCase()] = u;
      }
    }

    return {
      groupId: group.groupId || group.id,
      groupDbId: group.id,
      groupName: group.groupName || '',
      members: memberships.map(m => {
        const uid = (Array.isArray(m.user) ? m.user[0] : m.user) as string;
        const u = userMap[uid] || userMap[String(uid).toLowerCase()] || {};
        return {
          membershipId: m.id,
          userId: uid,
          fullName: u.fullName || uid || '',
          phone: u.phone || '',
          ashrayLevel: u.ashrayLevel || null,
          currentStreak: u.currentStreak ?? 0,
          role: m.role || 'Member',
          joinedAt: m.joinedAt || null,
        };
      }),
    };
  },
});
