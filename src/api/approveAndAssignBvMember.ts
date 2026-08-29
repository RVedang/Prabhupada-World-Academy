import { z } from 'zod';
import { createEndpoint, BvMemberRegistrations, BvGroupMembers, Users, BvGroups, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
// Synthetic IDs are generated for registrations that exist only in the Users table
// (users whose bvRegistrationStatus is Pending Approval but never wrote a BvMemberRegistrations doc).
const isSyntheticId = (id: string) => id.startsWith('BVREG-');
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Approve a Bhakti Vriksha registration, optionally assigning a Reading Group — Admin or Supervisor access',
  authenticated: true,
  requiredCapabilities: 'bv.manage',
  inputSchema: z.object({
    registrationId: z.string(),
    // Group assignment is intentionally optional.  Approval and BV membership
    // are separate steps so the first RGF/group can be created after users are
    // approved (breaking the guide -> RGF -> group -> approval deadlock).
    groupId: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    
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
      !!callerRecord.isBvSuperAdmin ||
      !!callerRecord.isBvAdmin ||
      !!callerRecord.isBvSupervisor;

    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Admin or Supervisor access required' });
    }

    // Real registration documents are also named BVREG-<userId>. Treat the id
    // as synthetic only when no BvMemberRegistrations document exists.
    let reg: any = await BvMemberRegistrations.findOne({ id: input.registrationId }).catch(() => null);
    const synthetic = !reg;
    if (synthetic) {
      if (!isSyntheticId(input.registrationId)) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Registration request not found' });
      }
      const userDbId = input.registrationId.replace(/^BVREG-/, '');
      const userRec = await Users.findOne({ id: userDbId }).catch(() => null);
      if (!userRec) throw new AppError({ code: 'NOT_FOUND', message: 'User record not found for synthetic registration' });
      reg = { id: null, userId: userRec.id, userDbId: userRec.id, email: userRec.email || '' };
    }

    const group = input.groupId
      ? await BvGroups.findOne({ id: input.groupId })
      : null;
    if (input.groupId && !group) throw new AppError({ code: 'NOT_FOUND', message: 'Selected Reading Group not found' });

    const now = new Date().toISOString();

    // 1. Mark registration approved (only for real BvMemberRegistrations documents)
    if (!synthetic && reg.id) {
      await BvMemberRegistrations.update({
        id: reg.id,
        record: {
          status: 'Approved',
          ...(group ? {
            assignedGroupId: group.id,
            assignedGroupName: group.groupName || '',
          } : {
            assignedGroupId: null,
            assignedGroupName: '',
          }),
          approvedBy: context.user.id,
          approvedAt: now,
        },
      });
    }

    // Resolve the applicant once. reg.userId may be either a userId or a user
    // DB id. This is also used for approval-only (unassigned) registrations.
    const memberUserId = reg.userDbId || reg.userId || input.registrationId.replace(/^BVREG-/, '');
    let targetUser = await Users.findOne({ id: memberUserId }).catch(() => null);
    if (!targetUser) {
      targetUser = await Users.findOne({ filters: { userId: memberUserId } }).catch(() => null) ||
                   await Users.findOne({ filters: { email: reg.email } }).catch(() => null) ||
                   await Users.findOne({ filters: { email: (reg.email || '').toLowerCase() } }).catch(() => null);
    }

    if (targetUser) {
      const relatedRegistrationIds = [
        input.registrationId,
        `BVREG-${targetUser.id}`,
        targetUser.userId ? `BVREG-${targetUser.userId}` : '',
      ].filter(Boolean);

      for (const registrationId of [...new Set(relatedRegistrationIds)]) {
        const relatedReg = await BvMemberRegistrations.findOne({ id: registrationId }).catch(() => null);
        if (!relatedReg) continue;
        await BvMemberRegistrations.update({
          id: relatedReg.id,
          record: {
            status: 'Approved',
            ...(group ? {
              assignedGroupId: group.id,
              assignedGroupName: group.groupName || '',
            } : {
              assignedGroupId: null,
              assignedGroupName: '',
            }),
            approvedBy: context.user.id,
            approvedAt: now,
          },
        });
      }
    }

    if (targetUser && group) {
      const targetUserDbId = targetUser.id;
      const targetUserLegacyId = targetUser.userId || targetUser.id;

      // 2. Add member to group
      const memberRecordId = `BVMEM-${targetUserDbId}-${group.id}`;
      const existingMember = await BvGroupMembers.findOne({ id: memberRecordId }).catch(() => null);
      if (!existingMember) {
        await BvGroupMembers.create({
          record: {
            id: memberRecordId,
            group: group.id,
            user: targetUserDbId,
            groupId: group.id,
            userId: targetUserLegacyId,
            role: 'Member',
            joinedAt: now,
          },
        });
      }

      // 3. Update main User record & establish reporting parent (RGF)
      // Find Reading Group Facilitator (RGF) for the group
      const rawRgfId = Array.isArray(group.bvslLeader) ? group.bvslLeader[0] : (group.bvslLeader || group.bvslId || group.guide);
      let rgfUser: any = null;
      if (rawRgfId) {
        rgfUser = await Users.findOne({ id: rawRgfId }).catch(() => null)
               || await Users.findOne({ filters: { userId: rawRgfId } }).catch(() => null)
               || await Users.findOne({ filters: { email: rawRgfId } }).catch(() => null);
      }

      const formatEmailToName = (nameStr: string, fallback: string) => {
        const val = nameStr || fallback || '';
        if (val.includes('@')) {
          const parts = val.split('@')[0].split(/[._-]/);
          return parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') + ' Prabhu';
        }
        return val;
      };

      const rgfUserId = rgfUser ? (rgfUser.userId || rgfUser.id) : String(rawRgfId || '');
      const rgfName = formatEmailToName(rgfUser ? (rgfUser.fullName || rgfUser.name || '') : '', String(group.bvslName || ''));

      const rgfSupId = rgfUser ? String(rgfUser.bvReportingSupervisorId || '') : '';
      const rgfSupName = formatEmailToName(rgfUser ? String(rgfUser.bvReportingSupervisorName || '') : '', '');
      const rgfAdminId = (rgfUser && rgfUser.bvReportingAdminId) ? String(rgfUser.bvReportingAdminId) : String(callerRecord.userId || callerRecord.id || '');
      const rgfAdminName = formatEmailToName((rgfUser && rgfUser.bvReportingAdminName) ? String(rgfUser.bvReportingAdminName) : String(callerRecord.fullName || callerRecord.name || ''), '');

      await Users.update({
        id: targetUser.id,
        record: {
          bvRegistrationStatus: 'Approved',
          isBvMember: true,                  // ← enables Attendance tab & removes from pending list
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
          pendingBvApprovalNotice: true,      // ← triggers popup on user's next login
          sadhanaMentor: null,                // Clear sadhana mentor upon BV approval
        },
      });
      serverCacheInvalidate(profileCacheKey(targetUser.id));
    } else if (targetUser) {
      // Approval without a group deliberately does not make the user a BV
      // member. Attendance and group reports remain hidden until assignment.
      await Users.update({
        id: targetUser.id,
        record: {
          bvRegistrationStatus: 'Approved',
          isBvMember: false,
          bvGroupId: '',
          bvGroupName: '',
          // Do not show the “joined group” notice until a group is assigned.
          pendingBvApprovalNotice: false,
        },
      });
      serverCacheInvalidate(profileCacheKey(targetUser.id));
    }

    serverCacheInvalidate(profileCacheKey(reg.userId));

    return { success: true };
  },
});
