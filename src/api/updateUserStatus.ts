import { z } from 'zod';
import { createEndpoint, Users, AppError } from '@/lib/backend-sdk';
import { getTodayIST } from '../lib/streakUtils';
import { getGuideScope, isUserInGuideScope } from '../lib/guideScope';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Guide activates or deactivates a user account — center-based access',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string(),
    status: z.enum(['Active', 'Inactive']),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const callerRole = (context.user.role || '').toUpperCase();
    const isSuperGuide = !!(
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      callerRole.includes('SUPER') ||
      callerRole.includes('ADMIN')
    );
    const isAuthorized = isSuperGuide || ['SUPER GUIDE', 'GUIDE', 'BVSL', 'SADHANA MENTOR'].some(r => callerRole.includes(r));
    if (!isAuthorized) throw new AppError({ code: 'FORBIDDEN', message: 'Guide access required' });

    // Regular guides: verify user is in their center
    if (!isSuperGuide) {
      const scope = await getGuideScope(context.user.email);
      if (!scope) throw new AppError({ code: 'FORBIDDEN', message: 'Guide record not found' });

      const userRecord = await Users.findOne({
        id: input.userId,
        fields: ['id', 'residency', 'guide'],
      });
      if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });
      if (!isUserInGuideScope(scope, userRecord)) {
        throw new AppError({ code: 'FORBIDDEN', message: 'You can only update status for users in your center' });
      }
    }

    const today = getTodayIST();
    await Users.update({
      id: input.userId,
      record: { status: input.status, statusChangedAt: today },
    });
    serverCacheInvalidate(profileCacheKey(input.userId));

    return { success: true };
  },
});
