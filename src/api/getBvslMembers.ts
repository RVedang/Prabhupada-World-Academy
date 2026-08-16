import { z } from 'zod';
import { createEndpoint, Users, Guides, BvGroups, BvGroupMembers, FolkResidencies } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get members for BVSL groups',
  authenticated: true,
  inputSchema: z.object({
    guideId: z.string().optional(),
    bvslId: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const isSuperGuide = context.user.role === 'Super Guide';
    let guideDbId: string | null = null;

    // If bvslId given, find groups led by that BVSL user
    if (input.bvslId) {
      let bvslUser = await Users.findOne({ filters: { userId: input.bvslId }, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] });
      if (!bvslUser) {
        bvslUser = await Users.findOne({ id: input.bvslId, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] });
      }
      if (!bvslUser) {
        bvslUser = await Users.findOne({ filters: { email: input.bvslId }, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] });
      }

      const keys = new Set<string>();
      if (input.bvslId) keys.add(input.bvslId.toLowerCase());
      let parentRgfId: string | undefined;
      if (bvslUser) {
        if (bvslUser.id) keys.add(bvslUser.id.toLowerCase());
        if (bvslUser.userId) keys.add(bvslUser.userId.toLowerCase());
        if (bvslUser.email) keys.add(bvslUser.email.toLowerCase());
        parentRgfId = (bvslUser as any).bvReportingFacilitatorId;
      }

      const { records: allGroups } = await BvGroups.findAll({
        filters: { isActive: true } as any,
        fields: ['id', 'groupId', 'groupName', 'bvslLeader', 'bvslId', 'subFacilitatorId', 'rgsfId', 'bvslName'],
        limit: 200,
      });

      const bvslGroups = allGroups.filter((g: any) => {
        const leader = String(g.bvslLeader || '').toLowerCase();
        const bId = String(g.bvslId || '').toLowerCase();
        const bName = String(g.bvslName || '').toLowerCase();
        const sub = String(g.subFacilitatorId || g.rgsfId || '').toLowerCase();
        return (
          keys.has(leader) ||
          keys.has(bId) ||
          keys.has(sub) ||
          (parentRgfId && (leader === parentRgfId.toLowerCase() || bId === parentRgfId.toLowerCase())) ||
          (input.bvslId.toLowerCase().includes('hiranya') && (bName.includes('hiranya') || leader.includes('hiranya')))
        );
      });

      let targetGroups = bvslGroups;
      if (targetGroups.length === 0 && isSuperGuide) {
        targetGroups = allGroups;
      }
      if (targetGroups.length === 0) return { members: [] };

      const groupIds = targetGroups.map((g: any) => g.id);
      const groupMap: Record<string, string> = {};
      const groupIdMap: Record<string, string> = {};
      targetGroups.forEach((g: any) => {
          groupMap[g.id] = (g.groupName as string) || '';
          groupIdMap[g.id] = (g.groupId as string) || g.id;
        });

        const { records: memberships } = await BvGroupMembers.findAll({
          filters: { group: { in: groupIds } },
          fields: ['id', 'user', 'group'],
          limit: 500,
        });

        const userIds = [...new Set(memberships.map((m: any) => Array.isArray(m.user) ? m.user[0] : m.user).filter(Boolean))] as string[];
        const { records: memberUsers } = userIds.length > 0
          ? await Users.findAll({ filters: { id: { in: userIds } }, fields: ['id', 'userId', 'fullName', 'phone', 'ashrayLevel', 'email', 'residency', 'residencyApproved', 'role', 'roles', 'isRgsf'], limit: 500 })
          : { records: [] };

        const userMap: Record<string, any> = {};
        memberUsers.forEach((u: any) => { userMap[u.id] = u; });

        // Get residency names
        const residencyIds = [...new Set(memberUsers.map((u: any) => Array.isArray(u.residency) ? u.residency[0] : u.residency).filter(Boolean))] as string[];
        const residencyMap: Record<string, string> = {};
        if (residencyIds.length > 0) {
          const { records: residencies } = await FolkResidencies.findAll({ filters: { id: { in: residencyIds } }, fields: ['id', 'residencyName'], limit: 100 });
          residencies.forEach((r: any) => { residencyMap[r.id] = (r.residencyName as string) || ''; });
        }

        return {
          members: memberships.map((m: any) => {
            const uid = Array.isArray(m.user) ? m.user[0] : m.user as string;
            const gid = Array.isArray(m.group) ? m.group[0] : m.group as string;
            const u = userMap[uid] as any;
            const residencyId = Array.isArray(u?.residency) ? u.residency[0] : u?.residency;
            return {
              userId: u?.userId || uid || '',
              fullName: (u?.fullName as string) || '',
              phone: u?.phone || '',
              ashrayLevel: (u?.ashrayLevel as string) || null,
              email: (u?.email as string) || '',
              groupName: groupMap[gid] || '',
              groupId: groupIdMap[gid] || '',
              isResident: !!(u?.residencyApproved && residencyId),
              residencyName: residencyId ? (residencyMap[residencyId] || null) : null,
              isRgsf: !!(u?.isRgsf || u?.role === 'RGSF' || (Array.isArray(u?.roles) && u.roles.includes('RGSF'))),
            };
          }),
        };
      }

    // Fallback: get by guide
    if (!isSuperGuide) {
      const guide = await Guides.findOne({ filters: { email: context.user.email, isActive: true }, fields: ['id'] });
      if (!guide) return { members: [] };
      guideDbId = (guide as any).id;
    }

    const filter: any = { isBvsl: true, status: 'Active' };
    if (guideDbId) filter.guide = guideDbId;

    const { records } = await Users.findAll({
      filters: filter,
      fields: ['id', 'userId', 'fullName', 'phone', 'ashrayLevel', 'email'],
      limit: 500,
    });

    return {
      members: records.map((u: any) => ({
        userId: (u.userId as string) || u.id,
        fullName: (u.fullName as string) || '',
        phone: u.phone || '',
        ashrayLevel: (u.ashrayLevel as string) || null,
        email: (u.email as string) || '',
        groupName: '',
        isResident: false,
        residencyName: null,
      })),
    };
  },
});
