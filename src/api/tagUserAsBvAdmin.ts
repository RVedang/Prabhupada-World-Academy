import { z } from 'zod';
import { createEndpoint, Users, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Tag or untag a user as BV Admin — Super Admin or Super Guide only',
  authenticated: true,
  requiredCapabilities: 'roles.assign',
  inputSchema: z.object({
    userId: z.string(),
    action: z.enum(['tag', 'untag']),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const canAssignAdmins =
      context.user.capabilities?.includes('*') === true ||
      context.user.normalizedRole === 'SUPER_GUIDE';
    if (!canAssignAdmins) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Super Admin access required to assign Admins' });
    }

    const userRecord = await Users.findOne({ id: input.userId, fields: ['id'] });
    if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });

    const shouldTag = input.action === 'tag';
    await Users.update({
      id: userRecord.id,
      record: {
        isBvAdmin: shouldTag,
        role: shouldTag ? 'Admin' : 'User',
        pendingRoleNotice: shouldTag ? 'Assigned responsibility: BV Admin' : 'Removed responsibility: BV Admin',
        roleNoticeAcknowledged: false,
      },
    });
    serverCacheInvalidate('user_profile:');

    return { success: true };
  },
});
