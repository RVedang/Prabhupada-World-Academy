import { z } from 'zod';
import { createEndpoint, BvMemberRegistrations, Users, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Reject a pending Bhakti Vriksha member registration',
  authenticated: true,
  inputSchema: z.object({
    registrationId: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const userEmail = (context.user.email || '').toLowerCase();
    
    // Fetch full caller record to access hierarchy flags
    const callerRecord = await Users.findOne({ id: context.user.id });
    if (!callerRecord) {
      throw new AppError({ code: 'FORBIDDEN', message: 'User profile not found' });
    }

    const callerRole = (callerRecord.role || '').toUpperCase();
    const isAuthorized =
      callerRole === 'SUPER_ADMIN' ||
      callerRole === 'ADMIN' ||
      callerRole === 'SUPER_GUIDE' ||
      callerRole === 'GUIDE' ||
      userEmail === 'srilaprabhupadaworld@gmail.com' ||
      userEmail === 'vdnd@hkmmumbai.org' ||
      userEmail.includes('gaurmandal') ||
      !!callerRecord.isBvSuperAdmin ||
      !!callerRecord.isBvAdmin ||
      !!callerRecord.isBvSupervisor;

    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Admin or Supervisor access required' });
    }

    const reg = await BvMemberRegistrations.findOne({ id: input.registrationId });
    if (!reg) throw new AppError({ code: 'NOT_FOUND', message: 'Registration request not found' });

    const now = new Date().toISOString();

    // 1. Mark registration rejected
    await BvMemberRegistrations.update({
      id: reg.id,
      record: {
        status: 'Rejected',
        rejectedBy: context.user.id,
        rejectedAt: now,
      },
    });

    // 2. Update main User record
    let targetUser = await Users.findOne({ id: reg.userId });
    if (!targetUser) {
      targetUser = await Users.findOne({ filters: { userId: reg.userId } }) ||
                   await Users.findOne({ filters: { email: reg.email } }) ||
                   await Users.findOne({ filters: { email: (reg.email || '').toLowerCase() } });
    }

    if (targetUser) {
      await Users.update({
        id: targetUser.id,
        record: {
          bvRegistrationStatus: 'Rejected',
          pendingBvRejectionNotice: true,
        },
      });
      serverCacheInvalidate(profileCacheKey(targetUser.id));
    }

    serverCacheInvalidate(profileCacheKey(reg.userId));

    return { success: true };
  },
});
