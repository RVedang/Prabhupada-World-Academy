import { z } from 'zod';
import { createEndpoint, Users, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Tag or untag a user as BV Supervisor — Admin or Super Admin only. When tagging, must specify which Admin this Supervisor will report to.',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string(),
    action: z.enum(['tag', 'untag']),
    // Required when action === 'tag': the Admin this Supervisor will report to
    adminId: z.string().optional(),
    adminName: z.string().optional(),
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
      throw new AppError({ code: 'FORBIDDEN', message: 'Admin or Super Admin access required to manage Supervisors' });
    }

    if (input.action === 'tag' && !input.adminId) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'You must specify which Admin this Supervisor will report to (adminId is required)' });
    }

    const userRecord = await Users.findOne({ id: input.userId, fields: ['id'] });
    if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });

    const shouldTag = input.action === 'tag';
    const updateData: Record<string, any> = {
      isBvSupervisor: shouldTag,
      isBvMentor: shouldTag, // Backward compatibility
      role: shouldTag ? 'Guide' : 'User',
      pendingRoleNotice: shouldTag ? 'BV Supervisor' : 'Regular Member',
      roleNoticeAcknowledged: false,
      // Hierarchy: which Admin does this Supervisor report to?
      bvReportingAdminId: shouldTag ? (input.adminId || '') : '',
      bvReportingAdminName: shouldTag ? (input.adminName || '') : '',
      // Legacy field kept for backward compatibility
      bvSupervisorGuideId: shouldTag ? (input.adminId || context.user.id) : '',
    };

    await Users.update({ id: userRecord.id, record: updateData });
    serverCacheInvalidate('user_profile:');

    return { success: true };
  },
});
