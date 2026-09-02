import { z } from 'zod';
import { createEndpoint, Users, BvGroups, BvGroupMembers, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';

const referenceValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(referenceValues);
  return value == null
    ? []
    : String(value).split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
};

export default createEndpoint({
  description: 'Assign or update Bhakti Vriksha roles for a user (Supervisor, Facilitator/RGF, Sub-Facilitator/RGSF, Admin). Requires a parentId for hierarchy roles.',
  authenticated: true,
  requiredCapabilities: 'bv.roles.assign',
  inputSchema: z.object({
    userId: z.string().min(1),
    role: z.enum(['SUPERVISOR', 'FACILITATOR', 'SUB_FACILITATOR', 'ADMIN', 'MEMBER']),
    // Hierarchy parent — required for SUPERVISOR, FACILITATOR, SUB_FACILITATOR
    // SUPERVISOR  → parentId = the Admin they report to
    // FACILITATOR → parentId = the Supervisor they report to
    // SUB_FACILITATOR → parentId = the RGF they report to
    parentId: z.string().optional(),
    parentName: z.string().optional(),
    isBvMember: z.boolean().optional(),
    multiRoles: z.object({
      isAdmin: z.boolean().optional(),
      isSupervisor: z.boolean().optional(),
      isFacilitator: z.boolean().optional(),
      isSubFacilitator: z.boolean().optional(),
    }).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const isSuperAdmin = context.user.capabilities?.includes('*') === true ||
                         context.user.isBvSuperAdmin === true ||
                         context.user.role === 'Super Admin' ||
                         context.user.role === 'SUPER_ADMIN' ||
                         context.user.role === 'SUPER_GUIDE';

    // Only Super Admins can assign BV Admin role
    if ((input.role === 'ADMIN' || input.multiRoles?.isAdmin === true) && !isSuperAdmin) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only Super Admins can assign BV Admin roles' });
    }

    // Hierarchy parent: default to calling Admin if not explicitly specified
    let targetParentId = input.parentId || '';
    let targetParentName = input.parentName || '';
    if (!targetParentId && ['SUPERVISOR', 'FACILITATOR', 'SUB_FACILITATOR'].includes(input.role)) {
      targetParentId = context.user.id || context.user.userId || '';
      targetParentName = context.user.fullName || context.user.name || context.user.email || 'Admin';
    }

    // Multi-tiered user lookup to prevent 'User not found' errors
    let targetUser: any = await Users.findOne({ id: input.userId }).catch(() => null);
    if (!targetUser) {
      const res = await Users.findAll({ filters: { userId: input.userId }, limit: 1 }).catch(() => ({ records: [] }));
      targetUser = (res as any)?.records?.[0] || null;
    }
    if (!targetUser) {
      const res = await Users.findAll({ filters: { email: input.userId }, limit: 1 }).catch(() => ({ records: [] }));
      targetUser = (res as any)?.records?.[0] || null;
    }
    if (!targetUser) {
      const { records: allUsers } = await Users.findAll({ limit: 2000 }).catch(() => ({ records: [] }));
      const key = input.userId.toLowerCase();
      targetUser = allUsers.find((u: any) =>
        String(u.id || '').toLowerCase() === key ||
        String(u.userId || '').toLowerCase() === key ||
        String(u.email || '').toLowerCase() === key
      ) || null;
    }
    if (!targetUser) {
      throw new AppError({ code: 'NOT_FOUND', message: `User not found for id: ${input.userId}` });
    }

    const dbId = targetUser.id;

    const ROLE_LABELS: Record<string, string> = {
      SUPERVISOR: 'BV Supervisor',
      FACILITATOR: 'Reading Group Facilitator (RGF)',
      SUB_FACILITATOR: 'Reading Group Sub-Facilitator (RGSF)',
      ADMIN: 'BV Admin',
      MEMBER: 'Regular Member',
    };

    // Lookup parent user details if targetParentId provided
    let parentUser: any = null;
    if (targetParentId) {
      parentUser = await Users.findOne({ id: targetParentId }).catch(() => null);
      if (!parentUser) {
        const res = await Users.findAll({ filters: { userId: targetParentId }, limit: 1 }).catch(() => ({ records: [] }));
        parentUser = (res as any)?.records?.[0] || null;
      }
      if (!parentUser) {
        const res = await Users.findAll({ filters: { email: targetParentId }, limit: 1 }).catch(() => ({ records: [] }));
        parentUser = (res as any)?.records?.[0] || null;
      }
      if (!parentUser) {
        const { records: allUsers } = await Users.findAll({ limit: 2000 }).catch(() => ({ records: [] }));
        const key = targetParentId.toLowerCase();
        parentUser = allUsers.find((u: any) =>
          String(u.id || '').toLowerCase() === key ||
          String(u.userId || '').toLowerCase() === key ||
          String(u.email || '').toLowerCase() === key
        ) || null;
      }
    }

    let pName = targetParentName || '';
    if (!pName && parentUser) {
      if (parentUser.fullName && !parentUser.fullName.includes('@')) {
        pName = parentUser.fullName;
      } else if (parentUser.name && !parentUser.name.includes('@')) {
        pName = parentUser.name;
      } else if (parentUser.displayName && !parentUser.displayName.includes('@')) {
        pName = parentUser.displayName;
      } else if (parentUser.email) {
        const parts = parentUser.email.split('@')[0].split(/[._-]/);
        pName = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') + ' Prabhu';
      } else {
        pName = parentUser.fullName || parentUser.name || 'Admin';
      }
    }
    if (pName && pName.includes('@')) {
      const parts = pName.split('@')[0].split(/[._-]/);
      pName = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') + ' Prabhu';
    }
    if (!pName) pName = 'Admin';

    // Multi-role support: preserve existing role flags and enable new assigned role
    const updates: any = {
      // Role change notice
      pendingRoleNotice: ROLE_LABELS[input.role] || input.role,
      // A group assignment has its own, more useful acknowledgement. Clear a
      // previous group-assignment notice for ordinary role changes below.
      pendingBvGroupAssignmentNotice: false,
      roleNoticeAcknowledged: false,
      // Clear reporting fields first, then populate below
      bvReportingAdminId: targetUser.bvReportingAdminId || '',
      bvReportingAdminName: targetUser.bvReportingAdminName || '',
      bvReportingSupervisorId: targetUser.bvReportingSupervisorId || '',
      bvReportingSupervisorName: targetUser.bvReportingSupervisorName || '',
      bvReportingFacilitatorId: targetUser.bvReportingFacilitatorId || '',
      bvReportingFacilitatorName: targetUser.bvReportingFacilitatorName || '',
    };

    if (input.isBvMember === false) {
      updates.isBvAdmin = false;
      updates.isBvSupervisor = false;
      updates.isBvMentor = false;
      updates.isBvFacilitator = false;
      updates.isBvsl = false;
      updates.isBvSubFacilitator = false;
      updates.isBvMember = false;

      // Clear all parent hierarchy fields
      updates.bvReportingAdminId = '';
      updates.bvReportingAdminName = '';
      updates.bvReportingSupervisorId = '';
      updates.bvReportingSupervisorName = '';
      updates.bvReportingFacilitatorId = '';
      updates.bvReportingFacilitatorName = '';
    } else {
      updates.isBvMember = true;
      updates.sadhanaMentor = null;
      if (input.multiRoles) {
        updates.isBvAdmin = !!input.multiRoles.isAdmin;
        updates.isBvSupervisor = !!input.multiRoles.isSupervisor;
        updates.isBvMentor = !!input.multiRoles.isSupervisor;
        updates.isBvFacilitator = !!input.multiRoles.isFacilitator;
        updates.isBvsl = !!input.multiRoles.isFacilitator;
        updates.isBvSubFacilitator = !!input.multiRoles.isSubFacilitator;
      } else if (input.role === 'ADMIN') {
        updates.isBvAdmin = true;
        updates.isBvSupervisor = false;
        updates.isBvMentor = false;
        updates.isBvFacilitator = false;
        updates.isBvsl = false;
        updates.isBvSubFacilitator = false;
      } else if (input.role === 'SUPERVISOR') {
        updates.isBvAdmin = false;
        updates.isBvSupervisor = true;
        updates.isBvMentor = true;
        updates.isBvFacilitator = false;
        updates.isBvsl = false;
        updates.isBvSubFacilitator = false;
      } else if (input.role === 'FACILITATOR') {
        updates.isBvAdmin = false;
        updates.isBvSupervisor = false;
        updates.isBvMentor = false;
        updates.isBvFacilitator = true;
        updates.isBvsl = true;
        updates.isBvSubFacilitator = false;
      } else if (input.role === 'SUB_FACILITATOR') {
        updates.isBvAdmin = false;
        updates.isBvSupervisor = false;
        updates.isBvMentor = false;
        updates.isBvFacilitator = false;
        updates.isBvsl = false;
        updates.isBvSubFacilitator = true;
      } else if (input.role === 'MEMBER') {
        updates.isBvAdmin = false;
        updates.isBvSupervisor = false;
        updates.isBvMentor = false;
        updates.isBvFacilitator = false;
        updates.isBvsl = false;
        updates.isBvSubFacilitator = false;
      }
    }

    // Role change notice & popup trigger summary
    const activeRoles: string[] = [];
    if (updates.isBvAdmin) activeRoles.push('BV Admin');
    if (updates.isBvSupervisor) activeRoles.push('BV Supervisor');
    if (updates.isBvFacilitator) activeRoles.push('Reading Group Facilitator (RGF)');
    if (updates.isBvSubFacilitator) activeRoles.push('Reading Group Sub-Facilitator (RGSF)');
    if (activeRoles.length === 0) activeRoles.push(input.isBvMember === false ? 'NA' : 'Regular Member');

    updates.pendingRoleNotice = activeRoles.join(', ');
    updates.roleNoticeAcknowledged = false;

    // Store appropriate hierarchy link & inherit parent's admin/supervisor
    if (input.isBvMember !== false) {
      if (input.role === 'SUPERVISOR' && targetParentId) {
        updates.bvReportingAdminId = parentUser?.userId || parentUser?.id || targetParentId;
        updates.bvReportingAdminName = pName;
        updates.bvSupervisorGuideId = targetParentId;
        updates.guide = parentUser?.id || targetParentId;
      } else if (input.role === 'FACILITATOR' && targetParentId) {
        updates.bvReportingSupervisorId = parentUser?.userId || parentUser?.id || targetParentId;
        updates.bvReportingSupervisorName = pName;
        updates.bvReportingAdminId = parentUser?.bvReportingAdminId || parentUser?.userId || parentUser?.id || targetParentId;
        updates.bvReportingAdminName = parentUser?.bvReportingAdminName || pName;
        updates.guide = updates.bvReportingAdminId;
      } else if (input.role === 'SUB_FACILITATOR' && targetParentId) {
        updates.bvReportingFacilitatorId = parentUser?.userId || parentUser?.id || targetParentId;
        updates.bvReportingFacilitatorName = pName;
        updates.bvReportingSupervisorId = parentUser?.bvReportingSupervisorId || parentUser?.userId || parentUser?.id || targetParentId;
        updates.bvReportingSupervisorName = parentUser?.bvReportingSupervisorName || pName;
        updates.bvReportingAdminId = parentUser?.bvReportingAdminId || updates.bvReportingSupervisorId;
        updates.bvReportingAdminName = parentUser?.bvReportingAdminName || updates.bvReportingSupervisorName;
        updates.guide = updates.bvReportingAdminId;
      } else if (input.role === 'MEMBER' && targetParentId) {
        const parentRole = String(parentUser?.role || '').toUpperCase().replace(/[\s-]+/g, '_');
        const parentIsFacilitator = !!(
          parentUser?.isBvFacilitator ||
          parentUser?.isBvsl ||
          ['RGF', 'BVSL', 'FACILITATOR'].includes(parentRole)
        );
        if (!parentUser || !parentIsFacilitator) {
          throw new AppError({
            code: 'BAD_REQUEST',
            message: 'Members can only be assigned to a Reading Group Facilitator (RGF).',
          });
        }

        const parentKeys = new Set([
          ...referenceValues(targetParentId),
          ...referenceValues(parentUser.id),
          ...referenceValues(parentUser.userId),
          ...referenceValues(parentUser.email),
        ]);
        const targetSegment = String(targetUser.segment || parentUser.segment || '').trim().toUpperCase();
        const { records: allGroups } = await BvGroups.findAll({
          fields: ['id', 'groupId', 'groupName', 'isActive', 'segment', 'bvslLeader', 'bvslId', 'guide'],
          limit: 500,
        });
        const facilitatorGroups = allGroups.filter((group: any) => {
          const groupSegment = String(group.segment || '').trim().toUpperCase();
          const sameDepartment = !groupSegment || !targetSegment || groupSegment === targetSegment;
          const groupOwners = [group.bvslLeader, group.bvslId]
            .flatMap(referenceValues);
          return group.isActive !== false && sameDepartment && groupOwners.some(owner => parentKeys.has(owner));
        });

        if (facilitatorGroups.length === 0) {
          throw new AppError({
            code: 'NOT_FOUND',
            message: `${pName} does not have an active Reading Group to assign members to.`,
          });
        }
        if (facilitatorGroups.length > 1) {
          throw new AppError({
            code: 'CONFLICT',
            message: `${pName} has multiple active Reading Groups. Assign the member from the specific group management screen.`,
          });
        }

        const group = facilitatorGroups[0];
        const memberKeys = new Set([
          ...referenceValues(targetUser.id),
          ...referenceValues(targetUser.userId),
          ...referenceValues(targetUser.email),
        ]);
        const [membersByUser, membersByUserId] = await Promise.all([
          BvGroupMembers.findAll({ filters: { user: { in: [...memberKeys] } } as any, fields: ['id', 'user', 'userId', 'group', 'groupId'], limit: 20 }),
          BvGroupMembers.findAll({ filters: { userId: { in: [...memberKeys] } } as any, fields: ['id', 'user', 'userId', 'group', 'groupId'], limit: 20 }),
        ]);
        const memberships = [...(membersByUser.records || []), ...(membersByUserId.records || [])]
          .filter((membership: any, index: number, list: any[]) => list.findIndex(item => item.id === membership.id) === index);
        const currentGroupIds = new Set([String(group.id), String(group.groupId || '')]);
        const targetMemberships = memberships.filter((membership: any) =>
          referenceValues([membership.group, membership.groupId]).some(groupId => currentGroupIds.has(groupId))
        );

        // A member belongs to one reading group at a time. Keep a single
        // target membership, remove obsolete memberships, then sync the user.
        await Promise.all(memberships
          .filter((membership: any) => !targetMemberships.includes(membership) || membership !== targetMemberships[0])
          .map((membership: any) => BvGroupMembers.delete({ id: membership.id })));
        if (targetMemberships.length === 0) {
          await BvGroupMembers.create({
            record: {
              id: `BVMEM-${dbId}-${group.id}`,
              user: dbId,
              userId: targetUser.userId || dbId,
              group: group.id,
              groupId: group.groupId || group.id,
              role: 'Member',
              joinedAt: new Date().toISOString(),
            },
          });
        }

        updates.isBvMember = true;
        updates.bvRegistrationStatus = 'Approved';
        updates.bvGroupId = group.id;
        updates.bvGroupName = group.groupName || '';
        // This is not a role change from the member's perspective. Surface a
        // dedicated notice naming the reading group instead of the generic
        // "Regular Member" account-update dialog.
        updates.pendingRoleNotice = null;
        updates.pendingBvGroupAssignmentNotice = true;
        updates.roleNoticeAcknowledged = false;
        updates.bvReportingFacilitatorId = parentUser.userId || parentUser.id;
        updates.bvReportingFacilitatorName = pName;
        updates.bvReportingSupervisorId = parentUser.bvReportingSupervisorId || '';
        updates.bvReportingSupervisorName = parentUser.bvReportingSupervisorName || '';
        updates.bvReportingAdminId = parentUser.bvReportingAdminId || '';
        updates.bvReportingAdminName = parentUser.bvReportingAdminName || '';
        updates.supervisorName = pName;
        if (updates.bvReportingAdminId) updates.guide = updates.bvReportingAdminId;
      }
    }

    // Sync base role field — only set to 'Admin' for explicit admin assignment
    if (input.role === 'ADMIN') {
      updates.role = 'Admin';
    } else {
      updates.role = 'User';
    }

    await Users.update({ id: dbId, record: updates });
    if (targetUser.id && targetUser.id !== dbId) {
      await Users.update({ id: targetUser.id, record: updates }).catch(() => {});
    }
    if (targetUser.userId && targetUser.userId !== dbId) {
      await Users.update({ id: targetUser.userId, record: updates }).catch(() => {});
    }
    if (targetUser.email) {
      await Users.update({ id: targetUser.email.toLowerCase(), record: updates }).catch(() => {});
    }
    
    serverCacheInvalidate();

    return {
      success: true,
      message: `Updated ${targetUser.fullName || targetUser.email} role to ${input.role}`,
      bvReportingAdminId: updates.bvReportingAdminId || '',
      bvReportingAdminName: updates.bvReportingAdminName || '',
      bvReportingSupervisorId: updates.bvReportingSupervisorId || '',
      bvReportingSupervisorName: updates.bvReportingSupervisorName || '',
      bvReportingFacilitatorId: updates.bvReportingFacilitatorId || '',
      bvReportingFacilitatorName: updates.bvReportingFacilitatorName || '',
    };
  },
});
