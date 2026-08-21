import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Add a member to a BV group',
  authenticated: true,
  inputSchema: z.object({
    groupId: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.any(),
  execute: async ({ input }: any) => {
    const group = await BvGroups.findOne({ filters: { groupId: input.groupId } })
               || await BvGroups.findOne({ id: input.groupId });
    if (!group) throw new AppError({ code: 'NOT_FOUND', message: 'Group not found' });

    const user = await Users.findOne({ filters: { userId: input.userId } })
              || await Users.findOne({ id: input.userId });
    if (!user) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });

    const existing = await BvGroupMembers.findOne({ filters: { user: user.id, group: group.id } });
    if (!existing) {
      await BvGroupMembers.create({
        record: {
          user: user.id,
          group: group.id,
          role: 'Member',
          joinedAt: new Date().toISOString(),
        },
      });
    }

    // Resolve Reading Group Facilitator (RGF) for default parent link
    const rawRgfId = Array.isArray(group.bvslLeader) ? group.bvslLeader[0] : (group.bvslLeader || group.bvslId || group.guide);
    let rgfUser: any = null;
    if (rawRgfId) {
      rgfUser = await Users.findOne({ id: rawRgfId }).catch(() => null)
             || await Users.findOne({ filters: { userId: rawRgfId } }).catch(() => null);
    }

    const rgfUserId = rgfUser ? (rgfUser.userId || rgfUser.id) : String(rawRgfId || '');
    const rgfName = rgfUser ? (rgfUser.fullName || '') : String(group.bvslName || '');
    const rgfSupId = rgfUser ? String(rgfUser.bvReportingSupervisorId || '') : '';
    const rgfSupName = rgfUser ? String(rgfUser.bvReportingSupervisorName || '') : '';
    const rgfAdminId = rgfUser ? String(rgfUser.bvReportingAdminId || '') : '';
    const rgfAdminName = rgfUser ? String(rgfUser.bvReportingAdminName || '') : '';

    await Users.update({
      id: user.id,
      record: {
        bvGroupId: group.id,
        bvGroupName: group.groupName || '',
        bvReportingFacilitatorId: rgfUserId,
        bvReportingFacilitatorName: rgfName,
        bvReportingSupervisorId: rgfSupId,
        bvReportingSupervisorName: rgfSupName,
        bvReportingAdminId: rgfAdminId,
        bvReportingAdminName: rgfAdminName,
        supervisorName: rgfName,
        isBvMember: true,
        sadhanaMentor: null,
        ...(rgfAdminId ? { guide: rgfAdminId } : {}),
      },
    }).catch(() => {});

    return { success: true, message: `Added to ${group.groupName}` };
  },
});
