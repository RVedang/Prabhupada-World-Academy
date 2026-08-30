import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, Guides, Users } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get BV groups for the current guide with member details',
  authenticated: true,
  inputSchema: z.object({ guideId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const isSuperGuide = context.user.role === 'Super Guide';
    const guide = await Guides.findOne({ filters: { email: context.user.email, isActive: true } }).catch(() => null);
    const userRec = await Users.findOne({ filters: { email: context.user.email } }).catch(() => null);

    const aliases = new Set<string>([
      context.user.email.toLowerCase(),
      String(context.user.id || '').toLowerCase(),
      String(context.user.userId || '').toLowerCase(),
      String(context.user.fullName || '').toLowerCase(),
      String(context.user.name || '').toLowerCase(),
    ].filter(Boolean));

    if (guide) {
      aliases.add(String(guide.id).toLowerCase());
      if (guide.fullName) aliases.add(guide.fullName.toLowerCase());
      if (guide.name) aliases.add(guide.name.toLowerCase());
      if (guide.email) aliases.add(guide.email.toLowerCase());
    }
    if (userRec) {
      aliases.add(String(userRec.id).toLowerCase());
      if (userRec.userId) aliases.add(userRec.userId.toLowerCase());
      if (userRec.fullName) aliases.add(userRec.fullName.toLowerCase());
      if (userRec.name) aliases.add(userRec.name.toLowerCase());
    }

    const [{ records: allGroups }, { records: allUsers }] = await Promise.all([
      BvGroups.findAll({ filters: { isActive: true }, fields: ['id', 'groupId', 'groupName', 'description', 'guide', 'segment'], limit: 500 }),
      Users.findAll({
        filters: { status: 'Active' },
        fields: ['id', 'userId', 'fullName', 'status', 'guide', 'segment'],
        limit: 1000,
      }),
    ]);

    const groups = allGroups.filter((g: any) => {
      const segment = String(g.segment || '').toUpperCase();
      if (segment === 'PW') return false;
      if (isSuperGuide) return true;
      const refs = (Array.isArray(g.guide) ? g.guide : g.guide == null ? [] : [g.guide]).map((v: any) => String(v).toLowerCase());
      return refs.some((ref: string) => aliases.has(ref));
    });

    const activeUsers = allUsers.filter((u: any) => {
      const segment = String(u.segment || '').toUpperCase();
      if (segment === 'PW') return false;
      if (isSuperGuide) return true;
      const refs = (Array.isArray(u.guide) ? u.guide : u.guide == null ? [] : [u.guide]).map((v: any) => String(v).toLowerCase());
      return refs.some((ref: string) => aliases.has(ref));
    });

    const groupsWithDetails = await Promise.all(groups.map(async (g: any) => {
      const { records: memberships } = await BvGroupMembers.findAll({
        filters: { group: g.id },
        fields: ['id', 'user'],
        limit: 500,
      });

      const memberUserIds = memberships.map((m: any) => Array.isArray(m.user) ? m.user[0] : m.user).filter(Boolean) as string[];
      const memberUsers = memberUserIds.length > 0
        ? await Users.findAll({ filters: { id: { in: memberUserIds } }, fields: ['id', 'userId', 'fullName'], limit: 500 })
        : { records: [] };

      return {
        groupId: (g.groupId as string) || g.id,
        groupName: (g.groupName as string) || '',
        description: (g.description as string) || '',
        memberCount: memberships.length,
        avgScore7d: 0,
        submissionRate7d: 0,
        members: memberUsers.records.map((u: any) => ({
          userId: (u.userId as string) || u.id,
          fullName: (u.fullName as string) || '',
        })),
      };
    }));

    return {
      groups: groupsWithDetails,
      availableUsers: activeUsers.map((u: any) => ({
        userId: (u.userId as string) || u.id,
        fullName: (u.fullName as string) || '',
        status: (u.status as string) || 'Active',
      })),
    };
  },
});
