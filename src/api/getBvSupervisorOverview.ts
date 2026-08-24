import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, BvMemberRegistrations, AppError } from '@/lib/backend-sdk';
import { getScopedHierarchyUserIds } from '../lib/hierarchyUtils';

export default createEndpoint({
  description: 'Get overview stats and group list for BV Supervisor dashboard',
  authenticated: true,
  requiredCapabilities: 'bv.manage',
  inputSchema: z.object({}),
  outputSchema: z.object({
    rgfCount: z.number(),
    groupCount: z.number(),
    totalMembers: z.number(),
    pendingRegistrations: z.number(),
    groups: z.array(z.object({
      id: z.string(),
      groupName: z.string(),
      bvslId: z.string(),
      bvslName: z.string(),
      meetingTime: z.string().optional(),
      memberCount: z.number(),
    })),
  }),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const userEmail = (context.user.email || '').toLowerCase();
    const isAuthorized = context.user.role === 'SUPER_GUIDE' ||
      context.user.role === 'GUIDE' ||
      userEmail === 'srilaprabhupadaworld@gmail.com' ||
      context.user.isBvAdmin ||
      context.user.isBvSuperAdmin ||
      context.user.isBvSupervisor ||
      context.user.isBvMentor;

    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Supervisor access required' });
    }

    const scopedUserIds = await getScopedHierarchyUserIds(context.user);

    // Fetch active groups and filter by user segment ('PW' vs 'FOLK')
    const userSegment = context.user.segment || (userEmail.includes('gaurmandal') || userEmail.includes('folk.org') ? 'FOLK' : 'PW');
    const { records: rawGroups } = await BvGroups.findAll({ filters: { isActive: true }, limit: 500 });
    let groups = rawGroups.filter((g: any) => (g.segment || 'PW') === userSegment);

    // Apply hierarchy scoping if not Super Admin
    if (scopedUserIds !== null) {
      groups = groups.filter((g: any) => {
        const bvslId = String(g.bvslId || '').toLowerCase();
        const gGuide = String(g.guide || '').toLowerCase();
        return (bvslId && scopedUserIds.has(bvslId)) || (gGuide && scopedUserIds.has(gGuide));
      });
    }

    const { records: rawMembers } = await BvGroupMembers.findAll({ limit: 2000 });
    const members = scopedUserIds === null
      ? rawMembers
      : rawMembers.filter((m: any) => {
          const uId = String(m.userId || m.id || m.memberId || '').toLowerCase();
          return uId && scopedUserIds.has(uId);
        });

    const { records: rawPending } = await BvMemberRegistrations.findAll({ filters: { status: 'Pending Approval' }, limit: 500 });
    const pending = scopedUserIds === null
      ? rawPending
      : rawPending.filter((p: any) => {
          const uId = String(p.userId || p.id || '').toLowerCase();
          return uId && scopedUserIds.has(uId);
        });

    // Count unique RGFs (bvslId in active groups)
    const uniqueRgfs = new Set(groups.map((g: any) => g.bvslId).filter(Boolean));

    // Map group member counts
    const groupMemberCounts: Record<string, number> = {};
    members.forEach((m: any) => {
      if (m.groupId) {
        groupMemberCounts[m.groupId] = (groupMemberCounts[m.groupId] || 0) + 1;
      }
    });

    const mappedGroups = groups.map((g: any) => ({
      id: g.id,
      groupName: g.groupName || 'Unnamed Group',
      bvslId: g.bvslId || '',
      bvslName: g.bvslName || 'Unassigned',
      meetingTime: g.meetingTime || '',
      memberCount: groupMemberCounts[g.id] || 0,
    }));

    return {
      rgfCount: uniqueRgfs.size,
      groupCount: groups.length,
      totalMembers: members.length,
      pendingRegistrations: pending.length,
      groups: mappedGroups,
    };
  },
});
