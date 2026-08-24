import { z } from 'zod';
import { createEndpoint, BvMemberRegistrations, BvGroupMembers, Users, BvGroups, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Approve pending Bhakti Vriksha member registration and assign them to a Reading Group — Admin or Supervisor access',
  authenticated: true,
  requiredCapabilities: 'bv.manage',
  inputSchema: z.object({
    registrationId: z.string(),
    groupId: z.string(),
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

    const reg = await BvMemberRegistrations.findOne({ id: input.registrationId });
    if (!reg) throw new AppError({ code: 'NOT_FOUND', message: 'Registration request not found' });

    const group = await BvGroups.findOne({ id: input.groupId });
    if (!group) throw new AppError({ code: 'NOT_FOUND', message: 'Selected Reading Group not found' });

    const now = new Date().toISOString();

    // 1. Mark registration approved
    await BvMemberRegistrations.update({
      id: reg.id,
      record: {
        status: 'Approved',
        assignedGroupId: group.id,
        assignedGroupName: group.groupName || '',
        approvedBy: context.user.id,
        approvedAt: now,
      },
    });

    // 2. Add member to group
    const memberRecordId = `BVMEM-${reg.userId}-${group.id}`;
    const existingMember = await BvGroupMembers.findOne({ id: memberRecordId }).catch(() => null);
    if (!existingMember) {
      await BvGroupMembers.create({
        record: {
          id: memberRecordId,
          group: group.id,
          user: reg.userId,
          groupId: group.id,
          userId: reg.userId,
          role: 'Member',
          joinedAt: now,
        },
      });
    }

    // 3. Update main User record & establish reporting parent (RGF)
    let targetUser = await Users.findOne({ id: reg.userId });
    if (!targetUser) {
      targetUser = await Users.findOne({ filters: { userId: reg.userId } }) ||
                   await Users.findOne({ filters: { email: reg.email } }) ||
                   await Users.findOne({ filters: { email: (reg.email || '').toLowerCase() } });
    }

    if (targetUser) {
      // Find Reading Group Facilitator (RGF) for the group
      const rawRgfId = Array.isArray(group.bvslLeader) ? group.bvslLeader[0] : (group.bvslLeader || group.bvslId || group.guide);
      let rgfUser: any = null;
      if (rawRgfId) {
        rgfUser = await Users.findOne({ id: rawRgfId }).catch(() => null)
               || await Users.findOne({ filters: { userId: rawRgfId } }).catch(() => null)
               || await Users.findOne({ filters: { email: rawRgfId } }).catch(() => null);
      }

      const rgfUserId = rgfUser ? (rgfUser.userId || rgfUser.id) : String(rawRgfId || '');
      const rgfName = rgfUser ? (rgfUser.fullName || '') : String(group.bvslName || '');

      const rgfSupId = rgfUser ? String(rgfUser.bvReportingSupervisorId || '') : '';
      const rgfSupName = rgfUser ? String(rgfUser.bvReportingSupervisorName || '') : '';
      const rgfAdminId = (rgfUser && rgfUser.bvReportingAdminId) ? String(rgfUser.bvReportingAdminId) : String(callerRecord.userId || callerRecord.id || '');
      const rgfAdminName = (rgfUser && rgfUser.bvReportingAdminName) ? String(rgfUser.bvReportingAdminName) : String(callerRecord.fullName || '');

      await Users.update({
        id: targetUser.id,
        record: {
          bvRegistrationStatus: 'Approved',
          bvGroupId: group.id,
          bvGroupName: group.groupName || '',
          // Default parent is RGF (Reading Group Facilitator)
          bvReportingFacilitatorId: rgfUserId,
          bvReportingFacilitatorName: rgfName,
          bvReportingSupervisorId: rgfSupId,
          bvReportingSupervisorName: rgfSupName,
          bvReportingAdminId: rgfAdminId,
          bvReportingAdminName: rgfAdminName,
          supervisorName: rgfName, // Legacy fallback
          guide: rgfAdminId || callerRecord.id, // Ensures Admin's member list includes this user
          pendingBvApprovalNotice: true,
          sadhanaMentor: null, // Clear sadhana mentor upon BV approval
        },
      });
      serverCacheInvalidate(profileCacheKey(targetUser.id));
    }

    serverCacheInvalidate(profileCacheKey(reg.userId));

    return { success: true };
  },
});
