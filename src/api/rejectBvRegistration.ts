import { z } from 'zod';
import { createEndpoint, BvMemberRegistrations, Users, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Reject a pending Bhakti Vriksha member registration',
  authenticated: true,
  requiredCapabilities: 'bv.manage',
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
      context.user.isBvSuperAdmin ||
      userEmail.includes('gaurmandal') ||
      !!callerRecord.isBvSuperAdmin ||
      !!callerRecord.isBvAdmin ||
      !!callerRecord.isBvSupervisor;

    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Admin or Supervisor access required' });
    }

    let reg: any = null;
    let isSynthetic = false;
    if (input.registrationId.startsWith('BVREG-')) {
      isSynthetic = true;
      const userDocId = input.registrationId.replace(/^BVREG-/, '');
      const userRecord = await Users.findOne({ id: userDocId });
      if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User profile not found' });
      reg = {
        id: input.registrationId,
        userId: userRecord.userId || userRecord.id,
        email: userRecord.email || '',
      };
    } else {
      reg = await BvMemberRegistrations.findOne({ id: input.registrationId });
    }
    if (!reg) throw new AppError({ code: 'NOT_FOUND', message: 'Registration request not found' });

    const now = new Date().toISOString();

    // 1. Mark registration rejected
    if (!isSynthetic) {
      await BvMemberRegistrations.update({
        id: reg.id,
        record: {
          status: 'Rejected',
          rejectedBy: context.user.id,
          rejectedAt: now,
        },
      });
    } else {
      await BvMemberRegistrations.create({
        record: {
          id: reg.id,
          userId: reg.userId,
          email: reg.email,
          status: 'Rejected',
          rejectedBy: context.user.id,
          rejectedAt: now,
        }
      }).catch(() => {});
    }

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
          isBvMember: false,
        },
      });
      serverCacheInvalidate(profileCacheKey(targetUser.id));
    }

    serverCacheInvalidate(profileCacheKey(reg.userId));

    return { success: true };

  },
});
