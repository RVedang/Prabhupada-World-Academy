import { z } from 'zod';
import { createEndpoint, Users, AppError } from '@/lib/backend-sdk';
import { getGuideScope, isUserInGuideScope } from '../lib/guideScope';
import { serverCacheInvalidate } from '../lib/serverCache';

export default createEndpoint({
  description: 'Tag/untag a user as Service Allocator — center-based access',
  authenticated: true,
  requiredCapabilities: 'roles.assign',
  inputSchema: z.object({
    userId: z.string(),
    action: z.enum(['tag', 'untag']),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const callerRole = context.user.role || '';
    const isSuperGuide = callerRole === 'Super Guide';
    const isAuthorized = isSuperGuide || callerRole === 'Guide' || callerRole === 'BVSL';
    if (!isAuthorized) throw new AppError({ code: 'FORBIDDEN', message: 'Guide access required' });

    // Resolve user record (primary path: DB UUID)
    let userRecord = await Users.findOne({
      id: input.userId,
      fields: ['id', 'isServiceAllocator', 'residency', 'guide'],
    });
    if (!userRecord) {
      userRecord = await Users.findOne({
        filters: { userId: input.userId },
        fields: ['id', 'isServiceAllocator', 'residency', 'guide'],
      });
    }
    if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: `User ${input.userId} not found` });

    // Regular guides: verify user is in their center
    if (!isSuperGuide) {
      const scope = await getGuideScope(context.user.email);
      if (!scope) throw new AppError({ code: 'FORBIDDEN', message: 'Guide record not found' });
      if (!isUserInGuideScope(scope, userRecord)) {
        throw new AppError({ code: 'FORBIDDEN', message: 'You can only tag users in your center' });
      }
    }

    await Users.update({
      id: userRecord.id,
      record: {
        isServiceAllocator: input.action === 'tag',
        pendingRoleNotice: input.action === 'tag' ? 'Assigned role: Service Allocator' : 'Removed role: Service Allocator',
        roleNoticeAcknowledged: false,
      },
    });
    serverCacheInvalidate('user_profile:' + userRecord.id);
    return { success: true };
  },
});
