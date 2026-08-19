import { z } from 'zod';
import { createEndpoint, Users, Guides, FolkResidencies, SadhanaEntries, BvGroups, BvGroupMembers } from '@/lib/backend-sdk';
import { getTodayIST, daysAgo } from '../lib/streakUtils';
import { normalizeRole, normalizeStatus } from './resolveUserLogin';
import { getScopedHierarchyUserIds } from '../lib/hierarchyUtils';

// Minimal fields for guide lookup
const GUIDE_FIELDS = ['id', 'email', 'isActive', 'role', 'folkResidencies'];
// Minimal fields for user listing — avoids fetching large linked-record arrays
const USER_FIELDS = ['id', 'userId', 'fullName', 'phone', 'email', 'role', 'status', 'segment',
  'ashrayLevel', 'residency', 'residencyApproved', 'residencyClaimed',
  'guide', 'isBvsl', 'isBvMember', 'isSadhanaMentor', 'isServiceAllocator', 'isBvMentor',
  'isFolkLead', 'isTripCoordinator', 'isOtherCenter', 'isCleanlinessManager', 'createdAt',
  'temporaryResidencyEnabled', 'temporaryResidency', 'isBvSupervisor', 'isBvFacilitator', 'isBvSubFacilitator', 'isBvAdmin',
  'bvReportingAdminId', 'bvReportingAdminName', 'bvReportingSupervisorId', 'bvReportingSupervisorName',
  'bvReportingFacilitatorId', 'bvReportingFacilitatorName', 'supervisorName', 'bvGroupId', 'bvGroupName'];
// Minimal fields for today's entries
const ENTRY_TODAY_FIELDS = ['id', 'user', 'entryDate'];
// Minimal fields for residency
const RESIDENCY_FIELDS = ['id', 'residencyId', 'residencyName'];

export default createEndpoint({
  description: 'Get all users for a guide — optimized with parallel queries and field selection',
  authenticated: true,
  inputSchema: z.object({
    guideId: z.string().optional(),
    status: z.enum(['all', 'active', 'inactive', 'pending', 'rejected']).optional(),
    statusFilter: z.string().optional(),
    residencyId: z.string().optional(),
    residencyFilter: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const userRole = (context.user.role || 'User').toUpperCase().replace(/\s+/g, '_');
    const userEmail = (context.user.email || '').toLowerCase();
    const isSuperGuide = userRole === 'SUPER_GUIDE' ||
      userRole === 'SUPER_ADMIN' ||
      userRole === 'PW_ADMIN' ||
      !!context.user.isBvSuperAdmin ||
      !!context.user.isBvAdmin ||
      userEmail.includes('gaurmandal') ||
      userEmail.includes('superadmin') ||
      context.user.isBvSuperAdmin;
    const isBvMentor = !!(context.user as any).isBvMentor;
    const statusKey = input.statusFilter || input.status || 'all';

    // For BV Mentors: bvMentorGuideId may be a Users-table UUID (stored when a Guide
    // tagged them) or a Guides-table UUID (stored when a Super Guide tagged them).
    // Resolve it to a Guides-table UUID so we can filter Users.guide correctly.
    let bvMentorGuideDbId: string | null = null;
    if (isBvMentor && input.guideId) {
      // Try direct Guides table lookup first (covers Super Guide assignment)
      const directGuideRec = await Guides.findOne({ id: input.guideId, fields: ['id'] }).catch(() => undefined);
      if (directGuideRec) {
        bvMentorGuideDbId = directGuideRec.id;
      } else {
        // Must be a Users-table UUID — look up that user's email, then find their Guides record
        const guideUser = await Users.findOne({ id: input.guideId, fields: ['id', 'email'] }).catch(() => undefined);
        if (guideUser?.email) {
          const guideRec = await Guides.findOne({ filters: { email: guideUser.email }, fields: ['id'] });
          if (guideRec) bvMentorGuideDbId = guideRec.id;
        }
      }
    }

    // Run guide lookup and today's entries in parallel
    const todayStr = getTodayIST();

    const [guideRecord, sadhanaRes, groupsRes, membersRes] = await Promise.all([
      (isSuperGuide || isBvMentor)
        ? Promise.resolve(null)
        : Guides.findOne({ filters: { email: context.user.email, isActive: true }, fields: GUIDE_FIELDS }).catch(() => null),
      SadhanaEntries.findAll({
        filters: { entryDate: todayStr },
        fields: ENTRY_TODAY_FIELDS,
        limit: 2000,
      }).catch(() => ({ records: [] })),
      BvGroups.findAll({ limit: 500, fields: ['id', 'groupId', 'groupName', 'bvslLeader', 'bvslId', 'bvslName', 'guide'] }).catch(() => ({ records: [] })),
      BvGroupMembers.findAll({ limit: 2000, fields: ['id', 'user', 'userId', 'group', 'groupId'] }).catch(() => ({ records: [] })),
    ]);

    const todayEntries: any[] = sadhanaRes?.records || [];
    const allBvGroups: any[] = groupsRes?.records || [];
    const allGroupMembers: any[] = membersRes?.records || [];

    // Map userId/id -> groupId
    const userGroupMap = new Map<string, string>();
    allGroupMembers.forEach((m: any) => {
      const uId = String(m.userId || m.user || '').toLowerCase();
      const gId = String(m.groupId || m.group || '');
      if (uId && gId) userGroupMap.set(uId, gId);
    });

    // Map groupId -> RGF info { id, name }
    const groupRgfMap = new Map<string, { id: string; name: string }>();
    allBvGroups.forEach((g: any) => {
      const rawRgfId = Array.isArray(g.bvslLeader) ? g.bvslLeader[0] : (g.bvslLeader || g.bvslId || g.guide || '');
      const rgfName = g.bvslName || '';
      if (g.id) groupRgfMap.set(String(g.id), { id: String(rawRgfId), name: rgfName });
      if (g.groupId) groupRgfMap.set(String(g.groupId), { id: String(rawRgfId), name: rgfName });
    });

    // Build user filters
    const filters: any = {};
    if (!isSuperGuide && !isBvMentor && guideRecord) filters.guide = (guideRecord as any).id;
    // Super Guide with explicit guideId — scope to that guide only
    if (isSuperGuide && input.guideId && input.guideId !== 'ALL' && input.guideId !== 'all') {
      filters.guide = input.guideId;
    }
    // BV Mentor — use resolved Guides-table UUID
    if (isBvMentor && bvMentorGuideDbId && bvMentorGuideDbId !== 'ALL' && bvMentorGuideDbId !== 'all') {
      filters.guide = bvMentorGuideDbId;
    }

    if (statusKey && statusKey !== 'all') {
      const statusMap: Record<string, string> = {
        active: 'Active',
        inactive: 'Inactive',
        pending: 'Pending Approval',
        rejected: 'Rejected',
      };
      filters.status = statusMap[statusKey] ?? statusKey;
    }
    const resFilter = input.residencyId || input.residencyFilter;
    if (resFilter && resFilter !== 'all' && resFilter !== 'residents' && resFilter !== 'non_residents') {
      filters.residency = resFilter;
    }
    if (resFilter === 'residents') {
      filters.residencyApproved = true;
    }

    // Phase 1 FIX: also fetch users from all residencies the guide manages (deduped)
    const baseUsersRes = await Users.findAll({ filters, fields: USER_FIELDS, limit: 2000 }).catch(() => ({ records: [] }));
    let users: any[] = baseUsersRes?.records || [];

    // If filtering by guide (non-super-guide, non-bv-mentor, no specific residency filter), also include residency-based users
    if (!isSuperGuide && !isBvMentor && guideRecord && (!resFilter || resFilter === 'all' || resFilter === 'residents' || resFilter === 'non_residents')) {
      const guideRids: string[] = Array.isArray((guideRecord as any).folkResidencies)
        ? (guideRecord as any).folkResidencies as string[]
        : ((guideRecord as any).folkResidencies ? [(guideRecord as any).folkResidencies as string] : []);
      if (guideRids.length > 0) {
        const residencyFetches = await Promise.all(
          guideRids.map(rid => {
            const resFilters: any = { residency: rid };
            if (statusKey && statusKey !== 'all') {
              const statusMap: Record<string, string> = { active: 'Active', inactive: 'Inactive', pending: 'Pending Approval', rejected: 'Rejected' };
              resFilters.status = statusMap[statusKey] ?? statusKey;
            }
            return Users.findAll({ filters: resFilters, fields: USER_FIELDS, limit: 500 }).catch(() => ({ records: [] }));
          })
        );
        const allUsersMap = new Map<string, any>();
        for (const u of users) allUsersMap.set(u.id, u);
        for (const res of residencyFetches) {
          for (const u of (res?.records || [])) allUsersMap.set(u.id, u);
        }
        users = Array.from(allUsersMap.values());
      }
    }

    const scopedUserIds = await getScopedHierarchyUserIds(context.user).catch(() => null);

    if (scopedUserIds !== null) {
      users = users.filter(u => {
        const uId = String(u.id || '').toLowerCase();
        const userIdStr = String(u.userId || '').toLowerCase();
        const emailStr = String(u.email || '').toLowerCase();
        return (uId && scopedUserIds.has(uId)) || (userIdStr && scopedUserIds.has(userIdStr)) || (emailStr && scopedUserIds.has(emailStr));
      });
    }

    // Build submitted-today set
    const submittedToday = new Set(
      todayEntries.map(e => Array.isArray(e.user) ? e.user[0] : e.user).filter(Boolean)
    );

    // Batch fetch residency names — ONE query instead of N
    // Fetch sadhana entries for the last 100 days to compute latestEntryDate and latestScore
    const cutoffStr = daysAgo(todayStr, 100);
    const entries: any[] = [];
    let entryOffset = 0;
    while (true) {
      const { records, hasMore } = await SadhanaEntries.findAll({
        filters: { entryDate: { gte: cutoffStr } } as any,
        fields: ['id', 'user', 'entryDate', 'scorePercent', 'submittedAt'],
        limit: 2000,
        offset: entryOffset,
      }).catch(() => ({ records: [], hasMore: false }));
      entries.push(...records);
      if (!hasMore || entries.length > 6000) break;
      entryOffset += 2000;
    }

    const entriesByUser = new Map<string, any[]>();
    for (const e of entries) {
      const uid = Array.isArray(e.user) ? e.user[0] : e.user;
      if (!uid) continue;
      if (!entriesByUser.has(uid)) entriesByUser.set(uid, []);
      entriesByUser.get(uid)!.push(e);
    }

    const residencyIds = [
      ...new Set(
        users
          .map(u => Array.isArray(u.residency) ? u.residency[0] : u.residency)
          .filter(Boolean) as string[]
      ),
    ];

    const [residenciesRes, guidesRes] = await Promise.all([
      FolkResidencies.findAll({ fields: RESIDENCY_FIELDS, limit: 500 }).catch(() => ({ records: [] })),
      Guides.findAll({ fields: ['id', 'fullName', 'abbreviation', 'email'], limit: 500 }).catch(() => ({ records: [] }))
    ]);

    const residencyMap = new Map<string, string>();
    for (const r of (residenciesRes?.records || [])) {
      if (r.id) {
        residencyMap.set(r.id, (r as any).residencyName || '');
        if ((r as any).residencyId) residencyMap.set((r as any).residencyId, (r as any).residencyName || '');
      }
    }

    // Build guide lookup map to normalize raw guide names/abbreviations/emails to UUIDs
    const guideLookup = new Map<string, string>();
    for (const g of (guidesRes?.records || [])) {
      if (g.id) {
        guideLookup.set(g.id.toLowerCase(), g.fullName || g.id);
        if (g.fullName) guideLookup.set(g.fullName.toLowerCase(), g.fullName);
        if (g.abbreviation) guideLookup.set(g.abbreviation.toLowerCase(), g.fullName);
        if (g.email) guideLookup.set(g.email.toLowerCase(), g.fullName);
      }
    }

    const callerId = String(context.user.id || '').toLowerCase();
    const callerUserId = String(context.user.userId || '').toLowerCase();
    const callerEmail = String(context.user.email || '').toLowerCase();

    // Filter out records based on strict hierarchy and self-exclusion rules
    const registeredUsers = users.filter(u => {
      // Basic validation
      if (!(u.userId || u.id) || (u.fullName || '').trim().length === 0) {
        return false;
      }

      const uId = String(u.id || '').toLowerCase();
      const uUserId = String(u.userId || '').toLowerCase();
      const uEmail = String(u.email || '').toLowerCase();

      // 1. Exclude the caller themselves (No self-visibility)
      if (
        uId === callerId ||
        uUserId === callerUserId ||
        (callerUserId && uId === callerUserId) ||
        (callerId && uUserId === callerId) ||
        (callerEmail && uEmail === callerEmail)
      ) {
        return false;
      }

      // 2. Exclude Super Admins (no one should see any Super Admin in the list)
      const uRole = (u.role || '').toUpperCase();
      const uIsSuperAdmin = !!(u.isBvSuperAdmin || uRole === 'SUPER ADMIN' || uRole === 'SUPER_ADMIN');
      if (uIsSuperAdmin) {
        return false;
      }

      // 3. Exclude peers (equal level) or higher level users for Admins / Supervisors / RGFs
      const callerRole = (context.user.role || '').toUpperCase();
      const callerIsSuperAdmin = !!(context.user.isBvSuperAdmin || callerRole === 'SUPER_ADMIN' || callerRole === 'SUPER ADMIN' || callerEmail.includes('superadmin') || callerEmail === 'iamthevedang@gmail.com');
      const callerIsAdmin = !!(context.user.isBvAdmin || callerRole === 'ADMIN' || callerRole === 'ADMINISTRATOR' || callerEmail.includes('admin'));
      
      const uIsAdmin = !!(u.isBvAdmin || uRole === 'ADMIN' || uRole === 'ADMINISTRATOR');
      
      // If caller is an Admin, they should not see other Admins
      if (callerIsAdmin && !callerIsSuperAdmin) {
        if (uIsAdmin) return false;
      }

      // Ensure standard supervisors cannot see other supervisors or admins
      const callerIsSupervisor = !!(context.user.isBvSupervisor || context.user.isBvMentor || callerRole === 'SUPERVISOR' || callerRole === 'MENTOR');
      const uIsSupervisor = !!(u.isBvSupervisor || u.isBvMentor || uRole === 'SUPERVISOR' || uRole === 'MENTOR');
      if (callerIsSupervisor && !callerIsAdmin && !callerIsSuperAdmin) {
        if (uIsSupervisor || uIsAdmin) return false;
      }

      // Ensure standard facilitators cannot see other facilitators, supervisors, or admins
      const callerIsFacilitator = !!(context.user.isBvFacilitator || context.user.isBvsl || callerRole === 'FACILITATOR' || callerRole === 'BVSL');
      const uIsFacilitator = !!(u.isBvFacilitator || u.isBvsl || uRole === 'FACILITATOR' || uRole === 'BVSL');
      if (callerIsFacilitator && !callerIsSupervisor && !callerIsAdmin && !callerIsSuperAdmin) {
        if (uIsFacilitator || uIsSupervisor || uIsAdmin) return false;
      }

      return true;
    });

    return {
      users: registeredUsers.map(u => {
        const residencyId = Array.isArray(u.residency) ? u.residency[0] : u.residency;
        const rawGuideId = Array.isArray(u.guide) ? u.guide[0] : u.guide;
        const guideId = rawGuideId ? (guideLookup.get(String(rawGuideId).toLowerCase()) || rawGuideId) : null;

        const uId = String(u.id || '').toLowerCase();
        const uUserId = String(u.userId || '').toLowerCase();
        const assignedGid = u.bvGroupId || userGroupMap.get(uId) || userGroupMap.get(uUserId);
        const groupRgf = assignedGid ? groupRgfMap.get(String(assignedGid)) : null;

        const resolvedFacId = u.bvReportingFacilitatorId || groupRgf?.id || null;
        let resolvedFacName = u.bvReportingFacilitatorName || groupRgf?.name || null;
        if (!resolvedFacName && resolvedFacId) {
          resolvedFacName = guideLookup.get(resolvedFacId.toLowerCase()) || null;
        }

        const userEntries = (entriesByUser.get(u.id) || [])
          .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
        const latestEntry = userEntries[0] || null;

        return {
          userId: u.id,
          userDbId: u.userId || u.id,
          fullName: u.fullName || '',
          phone: u.phone || '',
          email: u.email || '',
          role: normalizeRole(u.role || 'User'),
          status: normalizeStatus(u.status || 'Pending Approval'),
          segment: u.segment || null,
          ashrayLevel: u.ashrayLevel || null,
          residencyApproved: u.residencyApproved || false,
          residencyClaimed: u.residencyClaimed || false,
          residencyId: residencyId || null,
          residencyName: residencyId ? (residencyMap.get(residencyId) || residencyMap.get(String(residencyId).toLowerCase()) || '') : '',
          submittedToday: submittedToday.has(u.id),
          isBvsl: u.isBvsl || false,
          isB: u.isB || false,
          isOtherCenter: (u as any).isOtherCenter || false,
          isSadhanaMentor: u.isSadhanaMentor || false,
          isServiceAllocator: u.isServiceAllocator || false,
          isBvMentor: u.isBvMentor || false,
          isCleanlinessManager: u.isCleanlinessManager || false,
          isFolkLead: u.isFolkLead || false,
          isTripCoordinator: u.isTripCoordinator || false,
          isBvSupervisor: u.isBvSupervisor || false,
          isBvFacilitator: u.isBvFacilitator || false,
          isBvSubFacilitator: u.isBvSubFacilitator || false,
          isBvAdmin: u.isBvAdmin || false,
          temporaryResidencyEnabled: u.temporaryResidencyEnabled || false,
          temporaryResidency: Array.isArray(u.temporaryResidency) ? u.temporaryResidency[0] : (u.temporaryResidency || null),
          isScholar: !!(u.temporaryResidencyEnabled && (Array.isArray(u.temporaryResidency) ? u.temporaryResidency[0] : u.temporaryResidency)),
          createdAt: u.createdAt || '',
          // Reporting & Parent hierarchy fields
          bvReportingAdminId: u.bvReportingAdminId || null,
          bvReportingAdminName: u.bvReportingAdminName || null,
          bvReportingSupervisorId: u.bvReportingSupervisorId || null,
          bvReportingSupervisorName: u.bvReportingSupervisorName || null,
          bvReportingFacilitatorId: resolvedFacId,
          bvReportingFacilitatorName: resolvedFacName,
          supervisorName: u.supervisorName || resolvedFacName || null,
          bvGroupId: assignedGid || null,
          bvGroupName: u.bvGroupName || null,
          // Fields used in UsersTab table
          selectedGuideId: guideId || null,
          selectedGuideName: null,
          latestEntryDate: latestEntry?.entryDate || null,
          latestScore: latestEntry?.scorePercent ?? null,
          bvLatestDate: null,
          bvLatestScore: null,
        };
      }),
    };
  },
});
