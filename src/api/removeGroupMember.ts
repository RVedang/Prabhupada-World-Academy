import { z } from 'zod';
import { createEndpoint, BvGroupMembers, BvGroups, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Remove a member from a BV group',
  authenticated: true,
  inputSchema: z.object({
    membershipId: z.string().optional(),
    groupId: z.string().optional(),
    userId: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input }: any) => {

    let membershipDbId = input.membershipId;

    if (!membershipDbId && input.groupId && input.userId) {
      // Find user by custom userId field
      const user = await Users.findOne({ filters: { userId: input.userId }, fields: ['id'] });

      // Find group — first try by DB record ID (UUID), then by custom groupId field
      let group = await BvGroups.findOne({ filters: { id: input.groupId }, fields: ['id'] });
      if (!group) {
        group = await BvGroups.findOne({ filters: { groupId: input.groupId }, fields: ['id'] });
      }

      if (group && user) {
        const membership = await BvGroupMembers.findOne({ filters: { group: group.id, user: user.id } });
        if (membership) membershipDbId = membership.id;
      }
    }

    if (!membershipDbId) throw new AppError({ code: 'NOT_FOUND', message: 'Membership not found' });

    const membership = await BvGroupMembers.findOne({ id: membershipDbId }).catch(() => null);
    await BvGroupMembers.delete({ id: membershipDbId });

    if (membership?.user) {
      await Users.update({
        id: membership.user,
        record: {
          bvGroupId: '',
          bvGroupName: '',
          bvRegistrationStatus: '',
          isBvMember: false,
        }
      }).catch(() => {});
    }

    return { success: true, message: 'Member removed from group' };

  },
});
