import { z } from 'zod';
import { createEndpoint, Users, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Tag or untag a user as Reading Group Sub-Facilitator (RGSF) — Admin or Super Admin only. When tagging, must specify which RGF this RGSF will report to.',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string(),
    action: z.enum(['tag', 'untag']),
    // Required when action === 'tag': the RGF this RGSF will report to
    facilitatorId: z.string().optional(),
    facilitatorName: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    const userEmail = (context.user.email || '').toLowerCase();
    const callerRole = (context.user.role || '').toUpperCase();
    const isAuthorized = !!(
      context.user.isBvAdmin ||
      context.user.isBvSuperAdmin ||
      callerRole.includes('ADMIN') ||
      callerRole.includes('SUPER') ||
      callerRole.includes('GUIDE') ||
      userEmail === 'hrvd@hkmmumbai.org' ||
      userEmail === 'srilaprabhupadaworld@gmail.com' ||
      userEmail.includes('gaurmandal') ||
      userEmail.includes('admin')
    );
    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Admin or Super Admin access required to assign Reading Group Sub-Facilitators (RGSF). Supervisors and RGFs cannot assign RGSFs.' });
    }

    if (input.action === 'tag' && !input.facilitatorId) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'You must specify which RGF this RGSF will report to (facilitatorId is required)' });
    }

    const userRecord = await Users.findOne({ id: input.userId, fields: ['id'] });
    if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });

    const shouldTag = input.action === 'tag';
    await Users.update({
      id: userRecord.id,
      record: {
        isBvSubFacilitator: shouldTag,
        role: 'User',
        pendingRoleNotice: shouldTag ? 'Reading Group Sub-Facilitator (RGSF)' : 'Regular Member',
        roleNoticeAcknowledged: false,
        // Hierarchy: which RGF does this RGSF report to?
        bvReportingFacilitatorId: shouldTag ? (input.facilitatorId || '') : '',
        bvReportingFacilitatorName: shouldTag ? (input.facilitatorName || '') : '',
      },
    });
    serverCacheInvalidate('user_profile:');

    return { success: true };
  },
});
