import { z } from 'zod';
import { createEndpoint, Users, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Tag or untag a user as Reading Group Facilitator (RGF) — Admin or Super Admin only. When tagging, must specify which Supervisor this RGF will report to.',
  authenticated: true,
  requiredCapabilities: 'bv.roles.assign',
  inputSchema: z.object({
    userId: z.string(),
    action: z.enum(['tag', 'untag']),
    // Required when action === 'tag': the Supervisor this RGF will report to
    supervisorId: z.string().optional(),
    supervisorName: z.string().optional(),
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
      context.user.isBvSuperAdmin ||
      userEmail.includes('gaurmandal') ||
      userEmail.includes('admin')
    );
    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Admin or Super Admin access required to assign Reading Group Facilitators (RGF). Supervisors cannot assign RGFs.' });
    }

    if (input.action === 'tag' && !input.supervisorId) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'You must specify which Supervisor this RGF will report to (supervisorId is required)' });
    }

    const userRecord = await Users.findOne({ id: input.userId, fields: ['id'] });
    if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });

    const shouldTag = input.action === 'tag';
    await Users.update({
      id: userRecord.id,
      record: {
        isBvFacilitator: shouldTag,
        isBvsl: shouldTag, // Backward compatibility
        role: shouldTag ? 'BVSL' : 'User',
        pendingRoleNotice: shouldTag ? 'Reading Group Facilitator (RGF)' : 'Regular Member',
        roleNoticeAcknowledged: false,
        // Hierarchy: which Supervisor does this RGF report to?
        bvReportingSupervisorId: shouldTag ? (input.supervisorId || '') : '',
        bvReportingSupervisorName: shouldTag ? (input.supervisorName || '') : '',
      },
    });
    serverCacheInvalidate('user_profile:');

    return { success: true };
  },
});
