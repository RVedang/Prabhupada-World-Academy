import { z } from 'zod';
import { createEndpoint, AppError, BvGroups, BvGroupMembers, BvAttendance, Guides, Users } from '@/lib/backend-sdk';
import { getGuideIdsForResidencies } from '../lib/guideScope';
import { bvUserAliases, isBvDepartmentAdmin, isBvSuperAdminUser, resolveBvDepartmentGroups, resolveBvScopedGroups } from '../lib/bvGroupMemberScope';

export default createEndpoint({
  description: 'Get BV group stats for guide dashboard — member count, attendance rate per group',
  authenticated: true,
  inputSchema: z.object({ guideId: z.string().optional(), bvslMode: z.boolean().optional(), residencyIds: z.array(z.string()).optional(), segment: z.enum(['PW', 'FOLK']).optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (!context.user) throw new Error('Unauthorized');
    const isBvslMode = input.bvslMode === true;
    const isSuperGuide = context.user.role === 'Super Guide';

    const groupFilter: any = { isActive: true };
    let hierarchyGroups: any[] | null = null;

    if (input.guideId === 'ALL' && input.segment) {
      if (!isBvSuperAdminUser(context.user as any)) {
        throw new AppError({ code: 'FORBIDDEN', message: 'Department-wide BV reports require super admin access' });
      }
      hierarchyGroups = (await resolveBvDepartmentGroups(input.segment)).map(group => group.record);
    } else if (isBvDepartmentAdmin(context.user as any) && !isBvSuperAdminUser(context.user as any)) {
      hierarchyGroups = (await resolveBvScopedGroups(context.user as any, { segment: input.segment }))
        .map(group => group.record);
    } else if (isBvslMode) {
      const rawSegment = String(context.user.segment || (context.user.isBvSupervisor ? 'FOLK' : '')).toUpperCase();
      const segment = rawSegment === 'FOLK' || rawSegment === 'PW' ? rawSegment as 'FOLK' | 'PW' : undefined;
      hierarchyGroups = (await resolveBvScopedGroups(context.user as any, { segment }))
        .map(group => group.record);
    } else {
      const isBvMentor = !!(context.user as any).isBvMentor;
      let guideDbId: string | null = null;
      if (!isSuperGuide) {
        // Try email-based lookup first
        const guide = await Guides.findOne({ filters: { email: context.user.email, isActive: true }, fields: ['id', 'fullName'] });
        if (guide) {
          guideDbId = (guide as any).id;
        } else if ((isBvMentor || true) && input.guideId) {
          // Robust 3-step resolution for BV Mentors (and any caller providing guideId)
          const directGuideRec = await Guides.findOne({ id: input.guideId, fields: ['id'] }).catch(() => undefined);
          if (directGuideRec) {
            guideDbId = directGuideRec.id;
          } else {
            const guideUser = await Users.findOne({ id: input.guideId, fields: ['id', 'email'] }).catch(() => undefined);
            if (guideUser?.email) {
              const guideByEmail = await Guides.findOne({ filters: { email: guideUser.email }, fields: ['id'] });
              if (guideByEmail) guideDbId = guideByEmail.id;
            }
            if (!guideDbId) {
              const guideByCustomId = await Guides.findOne({ filters: { guideId: input.guideId }, fields: ['id'] });
              if (guideByCustomId) guideDbId = guideByCustomId.id;
            }
          }
          if (!guideDbId) return { groups: [] };
        } else {
          return { groups: [] };
        }
      } else if (input.guideId) {
        // Super Guide viewing a specific guide — resolve that guide's ID
        const directGuideRec = await Guides.findOne({ id: input.guideId, fields: ['id'] }).catch(() => undefined);
        if (directGuideRec) {
          guideDbId = directGuideRec.id;
        } else {
          const guideUser = await Users.findOne({ id: input.guideId, fields: ['id', 'email'] }).catch(() => undefined);
          if (guideUser?.email) {
            const guideByEmail = await Guides.findOne({ filters: { email: guideUser.email }, fields: ['id'] });
            if (guideByEmail) guideDbId = guideByEmail.id;
          }
          if (!guideDbId) {
            const guideByCustomId = await Guides.findOne({ filters: { guideId: input.guideId }, fields: ['id'] });
            if (guideByCustomId) guideDbId = guideByCustomId.id;
          }
        }
      }
      if (input.residencyIds && input.residencyIds.length > 0) {
        const allGuideIds = await getGuideIdsForResidencies(input.residencyIds);
        if (allGuideIds.length > 0) {
          groupFilter.guide = { in: allGuideIds };
        } else if (guideDbId) {
          groupFilter.guide = guideDbId;
        }
      } else if (guideDbId) {
        groupFilter.guide = guideDbId;
      }
    }

    const groups = hierarchyGroups ?? (await BvGroups.findAll({
      filters: groupFilter,
      fields: ['id', 'groupId', 'groupName', 'bvslLeader', 'bvslId'],
      limit: 200,
    })).records;

    if (groups.length === 0) return { groups: [] };

    const callerAliases = new Set(bvUserAliases(context.user as any));

    const bvslIds = [...new Set(groups.map((g: any) => Array.isArray(g.bvslLeader) ? g.bvslLeader[0] : g.bvslLeader).filter(Boolean))] as string[];
    const bvslMap = new Map<string, string>();
    if (bvslIds.length > 0) {
      const { records: bvslUsers } = await Users.findAll({ filters: { id: { in: bvslIds } }, fields: ['id', 'fullName'], limit: 200 });
      bvslUsers.forEach((u: any) => bvslMap.set(u.id, (u.fullName as string) || ''));
    }

    const stats = await Promise.all(groups.map(async (g: any) => {
      const groupIds = [...new Set([g.id, g.groupId].filter(Boolean))];
      const [membersByGroup, membersByGroupId, attendanceByGroup, attendanceByGroupId] = await Promise.all([
        BvGroupMembers.findAll({ filters: { group: { in: groupIds } } as any, fields: ['id', 'user', 'userId', 'memberId'], limit: 500 }),
        BvGroupMembers.findAll({ filters: { groupId: { in: groupIds } } as any, fields: ['id', 'user', 'userId', 'memberId'], limit: 500 }).catch(() => ({ records: [] })),
        BvAttendance.findAll({ filters: { group: { in: groupIds } } as any, fields: ['id', 'user', 'present', 'attendanceDate'], limit: 2000 }),
        BvAttendance.findAll({ filters: { groupId: { in: groupIds } } as any, fields: ['id', 'user', 'present', 'attendanceDate'], limit: 2000 }).catch(() => ({ records: [] })),
      ]);
      const memberRows = [...membersByGroup.records, ...membersByGroupId.records]
        .filter((row, index, rows) => rows.findIndex(candidate => candidate.id === row.id) === index);
      const attendanceRows = [...attendanceByGroup.records, ...attendanceByGroupId.records]
        .filter((row, index, rows) => rows.findIndex(candidate => candidate.id === row.id) === index);

      const isCaller = (value: unknown) => {
        const values = (Array.isArray(value) ? value : [value])
          .flatMap(item => Array.isArray(item) ? item : String(item || '').split(','));
        return values.some(item => callerAliases.has(String(item || '').trim().toLowerCase()));
      };
      const memberRecords = isBvslMode
        ? memberRows.filter(member => !isCaller([member.user, member.userId, member.memberId]))
        : memberRows;
      const attRecords = isBvslMode
        ? attendanceRows.filter(attendance => !isCaller(attendance.user))
        : attendanceRows;
      const memberCount = new Set(memberRecords.map(member =>
        String(member.user || member.userId || member.memberId || member.id),
      )).size;

      // Count distinct session dates
      const distinctDates = new Set(attRecords.map((a: any) => a.attendanceDate).filter(Boolean));
      const totalSessions = distinctDates.size;

      const presentCount = attRecords.filter((a: any) => a.present).length;
      const totalPossible = memberCount * totalSessions;
      const bvslId = Array.isArray(g.bvslLeader) ? g.bvslLeader[0] : g.bvslLeader as string;

      return {
        groupId: (g.groupId as string) || g.id,
        groupName: (g.groupName as string) || '',
        bvslName: bvslId ? (bvslMap.get(bvslId) || null) : null,
        memberCount,
        totalSessions,
        presentCount,
        attendanceRate: totalPossible > 0 ? Math.round((presentCount / totalPossible) * 100) : 0,
      };
    }));

    return { groups: stats };
  },
});
