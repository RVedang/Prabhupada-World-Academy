import { z } from 'zod';
import { createEndpoint, Users, OneToOneMeetings, BvGroups, BvGroupMembers } from '@/lib/backend-sdk';
import { getScopedHierarchyUserIds } from '../lib/hierarchyUtils';

function getWeeks(weeksBack: number): string[] {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  const weeks: string[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - i * 7);
    weeks.push(d.toISOString().split('T')[0]);
  }
  return weeks;
}

export default createEndpoint({
  description: 'Get 1:1 meeting data for RGSF, RGF, Supervisor, Admin, Super Admin scoped strictly to users under them with hierarchy names.',
  authenticated: true,
  inputSchema: z.object({ weeksBack: z.number().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const weeksBack = input.weeksBack || 8;
    const weeks = getWeeks(weeksBack);
    const startDate = weeks[0];
    const endDate = weeks[weeks.length - 1];

    const dbUserId = context.user.id;
    const customUserId = context.user.userId || dbUserId;

    // Fetch booking link for current user if set
    const bvslUser = await Users.findOne({ id: dbUserId, fields: ['oneToOneLink'] }).catch(() => null);

    // Get strict hierarchy scoped user IDs for the calling user
    const scopedUserIds = await getScopedHierarchyUserIds(context.user).catch(() => null);

    const callerSegment = context.user.segment || (context.user.email?.includes('gaurmandal') || context.user.email?.includes('folk.org') ? 'FOLK' : 'PW');

    // Fetch candidate users
    const { records: allUsers } = await Users.findAll({
      filters: { segment: callerSegment, status: 'Active' },
      fields: [
        'id', 'userId', 'email', 'fullName', 'ashrayLevel', 'residencyApproved', 'oneToOneDelegate',
        'bvReportingAdminId', 'bvReportingAdminName',
        'bvReportingSupervisorId', 'bvReportingSupervisorName',
        'bvReportingFacilitatorId', 'bvReportingFacilitatorName', 'segment'
      ],
      limit: 2000,
    });

    let filteredUsers: any[] = [];

    if (scopedUserIds === null) {
      // 5. Super Admin: sees every single member of Prabhupada World Bhakti Vriksha
      filteredUsers = allUsers.filter((u: any) => u.id !== dbUserId && u.id !== customUserId);
    } else if (scopedUserIds.size > 0) {
      // Scoped role (Admin, Supervisor, RGF, RGSF): filter strictly to scoped user IDs (excluding self)
      filteredUsers = allUsers.filter((u: any) => {
        const uId = String(u.id || '').toLowerCase();
        const userIdStr = String(u.userId || '').toLowerCase();
        const emailStr = String(u.email || '').toLowerCase();
        const isSelf = uId === dbUserId.toLowerCase() || userIdStr === customUserId.toLowerCase();
        if (isSelf) return false;
        return scopedUserIds.has(uId) || scopedUserIds.has(userIdStr) || scopedUserIds.has(emailStr);
      });
    }

    // Fallback: If group/hierarchy mapping is empty for an RGF/RGSF without explicit tree entries,
    // fetch group members from groups where user is assigned
    if (filteredUsers.length === 0 && scopedUserIds !== null) {
      const { records: allGroups } = await BvGroups.findAll({ limit: 500, fields: ['id', 'bvslLeader', 'bvslId', 'subFacilitatorId', 'rgsfId'] });
      const { records: allMemberships } = await BvGroupMembers.findAll({ limit: 2500, fields: ['id', 'user', 'group'] });

      const userGroupIds = allGroups.filter((g: any) => {
        const leader = String(g.bvslLeader || g.bvslId || '').toLowerCase();
        const sub = String(g.subFacilitatorId || g.rgsfId || '').toLowerCase();
        return leader === dbUserId.toLowerCase() || leader === customUserId.toLowerCase() ||
               sub === dbUserId.toLowerCase() || sub === customUserId.toLowerCase();
      }).map((g: any) => g.id);

      if (userGroupIds.length > 0) {
        const memberIds = new Set(
          allMemberships
            .filter((m: any) => {
              const g = Array.isArray(m.group) ? m.group[0] : m.group;
              return g && userGroupIds.includes(g);
            })
            .map((m: any) => String(Array.isArray(m.user) ? m.user[0] : m.user || ''))
            .filter(Boolean)
        );
        filteredUsers = allUsers.filter((u: any) => memberIds.has(u.id) && u.id !== dbUserId && u.id !== customUserId);
      }
    }

    // Build hierarchy lookup maps for user cards
    const { records: allBvGroups } = await BvGroups.findAll({
      limit: 1000,
      fields: ['id', 'bvslLeader', 'bvslId', 'bvslName', 'bvReportingSupervisorId', 'bvReportingSupervisorName', 'bvReportingAdminId', 'bvReportingAdminName'],
    }).catch(() => ({ records: [] }));

    const { records: allBvMemberships } = await BvGroupMembers.findAll({
      limit: 3000,
      fields: ['id', 'user', 'group'],
    }).catch(() => ({ records: [] }));

    const groupMap = new Map<string, any>();
    allBvGroups.forEach((g: any) => {
      if (g.id) groupMap.set(String(g.id), g);
    });

    const userToGroupMap = new Map<string, any>();
    allBvMemberships.forEach((m: any) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      const g = Array.isArray(m.group) ? m.group[0] : m.group;
      if (u && g && groupMap.has(String(g))) {
        userToGroupMap.set(String(u), groupMap.get(String(g)));
      }
    });

    const userNameMap = new Map<string, string>();
    allUsers.forEach((u: any) => {
      if (u.id) userNameMap.set(String(u.id).toLowerCase(), u.fullName || '');
      if (u.userId) userNameMap.set(String(u.userId).toLowerCase(), u.fullName || '');
    });

    const userIds = filteredUsers.map((u: any) => u.id);

    let meetings: any[] = [];
    if (userIds.length > 0) {
      const { records } = await OneToOneMeetings.findAll({
        filters: { weekDate: { gte: startDate, lte: endDate } } as any,
        fields: ['id', 'guide', 'member', 'weekDate', 'meetingDate', 'durationMinutes', 'notes', 'callStatus', 'recordingLink', 'nextCallDate', 'nextCallAgenda'],
        limit: 5000,
      });
      meetings = records.filter((m: any) => {
        const mid = Array.isArray(m.member) ? m.member[0] : m.member;
        return mid && userIds.includes(mid);
      });
    }

    // Collect department-scoped unique Admins for dropdown filtering
    const callerEmail = (context.user?.email || '').toLowerCase();
    const isCallerPw = context.user?.segment === 'PW' || context.user?.isPwAdmin || callerEmail.includes('srilaprabhupadaworld') || callerEmail.includes('vdnd');

    const allAdminsSet = new Set<string>();
    allUsers.forEach((u: any) => {
      if (u.isBvAdmin || u.isBvSuperAdmin || u.role === 'Admin' || u.role === 'ADMIN' || u.role === 'Super Admin' || u.role === 'SUPER_ADMIN') {
        const name = u.fullName || u.name || u.email;
        const isUserFolk = u.segment === 'FOLK' || (u.email || '').includes('gaurmandal') || (u.fullName || '').includes('FOLK');
        const isUserPw = u.segment === 'PW' || (u.email || '').includes('srilaprabhupadaworld') || (u.email || '').includes('vdnd') || (u.fullName || '').includes('PW') || (u.fullName || '').includes('Prabhupada');
        if (isCallerPw) {
          if (isUserPw || (!isUserFolk && !name.toUpperCase().includes('FOLK'))) {
            if (name) allAdminsSet.add(name);
          }
        } else {
          if (isUserFolk || (!isUserPw && !name.toUpperCase().includes('PW') && !name.toLowerCase().includes('prabhupada'))) {
            if (name) allAdminsSet.add(name);
          }
        }
      }
      if (u.bvReportingAdminName) {
        if (isCallerPw && !u.bvReportingAdminName.toUpperCase().includes('FOLK')) allAdminsSet.add(u.bvReportingAdminName);
        if (!isCallerPw && !u.bvReportingAdminName.toUpperCase().includes('PW') && !u.bvReportingAdminName.toLowerCase().includes('prabhupada')) allAdminsSet.add(u.bvReportingAdminName);
      }
    });
    const allAdmins = Array.from(allAdminsSet).filter(Boolean).sort();

    return {
      bvslLink: (bvslUser as any)?.oneToOneLink || null,
      allAdmins,
      users: filteredUsers.map((u: any) => {
        const uGrp = userToGroupMap.get(String(u.id)) || userToGroupMap.get(String(u.userId));

        const rgfId = String(u.bvReportingFacilitatorId || uGrp?.bvslLeader || uGrp?.bvslId || '').toLowerCase();
        const rgfName = u.bvReportingFacilitatorName || uGrp?.bvslName || (rgfId ? userNameMap.get(rgfId) : null) || null;

        const supId = String(u.bvReportingSupervisorId || uGrp?.bvReportingSupervisorId || '').toLowerCase();
        const supervisorName = u.bvReportingSupervisorName || uGrp?.bvReportingSupervisorName || (supId ? userNameMap.get(supId) : null) || null;

        const adminId = String(u.bvReportingAdminId || uGrp?.bvReportingAdminId || '').toLowerCase();
        const adminName = u.bvReportingAdminName || uGrp?.bvReportingAdminName || (adminId ? userNameMap.get(adminId) : null) || null;

        return {
          userId: u.id,
          fullName: u.fullName || '',
          ashrayLevel: u.ashrayLevel || null,
          isResident: u.residencyApproved || false,
          eligibility: 'Delegated',
          delegateId: Array.isArray(u.oneToOneDelegate) ? u.oneToOneDelegate[0] : (u.oneToOneDelegate || context.user.id),
          delegateName: null,
          rgfName,
          supervisorName,
          adminName,
        };
      }),
      meetings: meetings.map((m: any) => ({
        id: m.id,
        guideId: Array.isArray(m.guide) ? m.guide[0] : m.guide,
        memberId: Array.isArray(m.member) ? m.member[0] : m.member,
        weekDate: String(m.weekDate || '').split('T')[0],
        meetingDate: String(m.meetingDate || '').split('T')[0],
        durationMinutes: m.durationMinutes || 0,
        notes: m.notes || '',
        callStatus: m.callStatus || 'Connected',
        recordingLink: m.recordingLink || '',
        nextCallDate: m.nextCallDate ? String(m.nextCallDate).split('T')[0] : '',
        nextCallAgenda: m.nextCallAgenda || '',
      })),
      weeks,
    };
  },
});
