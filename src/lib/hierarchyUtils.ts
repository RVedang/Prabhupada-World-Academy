import { Users, BvGroups, BvGroupMembers } from '@/lib/backend-sdk';

/**
 * Server-only helper: Resolves the complete set of user IDs under a caller's hierarchy.
 * Returns null if the caller is a Super Admin (unrestricted full access).
 *
 * Strict Hierarchy Scoping Rules:
 *   1. Super Admin: sees ALL data across all departments (returns null).
 *   2. Admin: sees Supervisors reporting to them (bvReportingAdminId), plus RGFs, RGSFs, and Members under those Supervisors.
 *   3. Supervisor: sees RGFs reporting to them (bvReportingSupervisorId), plus RGSFs and Members under those RGFs.
 *   4. RGF (Reading Group Facilitator): sees RGSFs reporting to them (bvReportingFacilitatorId), plus Groups facilitated by them and Members in those groups.
 *   5. RGSF (Reading Group Sub-Facilitator): sees ONLY the specific Reading Group where they are RGSF, plus Members of that group.
 */
export async function getScopedHierarchyUserIds(contextUser: any): Promise<Set<string> | null> {
  if (!contextUser) return new Set();

  const userEmail = (contextUser.email || '').toLowerCase();
  const userRole = (contextUser.role || '').toUpperCase().replace(/\s+/g, '_');

  const isSuperAdmin = !!(
    userRole === 'SUPER_ADMIN' ||
    userRole === 'SUPER_GUIDE' ||
    contextUser.isBvSuperAdmin
  );

  // Super Admin has full unrestricted access across all users and departments
  if (isSuperAdmin) return null;

  const callerId = String(contextUser.id || '').toLowerCase();
  const callerUserId = String(contextUser.userId || callerId).toLowerCase();

  const callerKeys = new Set<string>();
  if (callerId) callerKeys.add(callerId);
  if (callerUserId) callerKeys.add(callerUserId);
  if (userEmail) callerKeys.add(userEmail);

  const scopedUserIds = new Set<string>();
  callerKeys.forEach(key => scopedUserIds.add(key));

  // Fetch all users to resolve tree connections
  const res = await Users.findAll({
    limit: 2000,
    fields: [
      'id', 'userId', 'email', 'role', 'guide',
      'isBvAdmin', 'isBvSupervisor', 'isBvMentor',
      'isBvFacilitator', 'isBvsl', 'isBvSubFacilitator',
      'bvReportingAdminId', 'bvReportingSupervisorId', 'bvReportingFacilitatorId', 'bvSupervisorGuideId',
      'sadhanaMentor', 'isSadhanaMentor'
    ]
  }).catch(() => ({ records: [] }));
  const allUsers: any[] = res?.records || [];

  const isBvAdmin = !!(contextUser.isBvAdmin || userRole === 'ADMIN' || userRole === 'PW_ADMIN');
  const isBvSupervisor = !!(contextUser.isBvSupervisor || contextUser.isBvMentor);
  const isBvFacilitator = !!(contextUser.isBvFacilitator || contextUser.isBvsl);
  const isBvSubFacilitator = !!(contextUser.isBvSubFacilitator);

  // Track parent keys at each level to cascade downwards
  const supervisorKeys = new Set<string>();
  const rgfKeys = new Set<string>();
  const rgsfKeys = new Set<string>();

  // ── Level 1: ADMIN resolution ──────────────────────────────────────────────────
  if (isBvAdmin) {
    allUsers.forEach((u: any) => {
      const reportingAdmin = String(u.bvReportingAdminId || u.bvSupervisorGuideId || '').toLowerCase();
      const guideStr = String(u.guide || '').toLowerCase();

      // Include users who report to this Admin, or whose guide is this Admin, or unassigned new members
      if (
        (reportingAdmin && callerKeys.has(reportingAdmin)) ||
        (guideStr && callerKeys.has(guideStr)) ||
        (!reportingAdmin && !guideStr)
      ) {
        if (u.id) { scopedUserIds.add(u.id.toLowerCase()); supervisorKeys.add(u.id.toLowerCase()); }
        if (u.userId) { scopedUserIds.add(u.userId.toLowerCase()); supervisorKeys.add(u.userId.toLowerCase()); }
        if (u.email) { scopedUserIds.add(u.email.toLowerCase()); supervisorKeys.add(u.email.toLowerCase()); }
      }
    });
  }

  // ── Level 2: SUPERVISOR resolution ──────────────────────────────────────────────
  // (Include supervisors found above for Admin, OR use caller keys if caller is Supervisor)
  const activeSupervisorKeys = new Set<string>([
    ...supervisorKeys,
    ...(isBvSupervisor ? Array.from(callerKeys) : [])
  ]);

  if (activeSupervisorKeys.size > 0) {
    allUsers.forEach((u: any) => {
      const reportingSup = String(u.bvReportingSupervisorId || '').toLowerCase();
      const guideStr = String(u.guide || '').toLowerCase();

      if (reportingSup && activeSupervisorKeys.has(reportingSup)) {
        if (u.id) { scopedUserIds.add(u.id.toLowerCase()); rgfKeys.add(u.id.toLowerCase()); }
        if (u.userId) { scopedUserIds.add(u.userId.toLowerCase()); rgfKeys.add(u.userId.toLowerCase()); }
        if (u.email) { scopedUserIds.add(u.email.toLowerCase()); rgfKeys.add(u.email.toLowerCase()); }
      } else if (!reportingSup && guideStr && activeSupervisorKeys.has(guideStr)) {
        if (u.id) { scopedUserIds.add(u.id.toLowerCase()); rgfKeys.add(u.id.toLowerCase()); }
        if (u.userId) { scopedUserIds.add(u.userId.toLowerCase()); rgfKeys.add(u.userId.toLowerCase()); }
        if (u.email) { scopedUserIds.add(u.email.toLowerCase()); rgfKeys.add(u.email.toLowerCase()); }
      }
    });
  }

  // ── Level 3: RGF resolution ────────────────────────────────────────────────────
  // (Include RGFs found above, OR use caller keys if caller is RGF)
  const activeRgfKeys = new Set<string>([
    ...rgfKeys,
    ...(isBvFacilitator ? Array.from(callerKeys) : [])
  ]);

  if (activeRgfKeys.size > 0) {
    allUsers.forEach((u: any) => {
      const reportingFac = String(u.bvReportingFacilitatorId || '').toLowerCase();
      const guideStr = String(u.guide || '').toLowerCase();

      if (reportingFac && activeRgfKeys.has(reportingFac)) {
        if (u.id) { scopedUserIds.add(u.id.toLowerCase()); rgsfKeys.add(u.id.toLowerCase()); }
        if (u.userId) { scopedUserIds.add(u.userId.toLowerCase()); rgsfKeys.add(u.userId.toLowerCase()); }
        if (u.email) { scopedUserIds.add(u.email.toLowerCase()); rgsfKeys.add(u.email.toLowerCase()); }
      } else if (!reportingFac && guideStr && activeRgfKeys.has(guideStr)) {
        if (u.id) { scopedUserIds.add(u.id.toLowerCase()); rgsfKeys.add(u.id.toLowerCase()); }
        if (u.userId) { scopedUserIds.add(u.userId.toLowerCase()); rgsfKeys.add(u.userId.toLowerCase()); }
        if (u.email) { scopedUserIds.add(u.email.toLowerCase()); rgsfKeys.add(u.email.toLowerCase()); }
      }
    });
  }

  // ── Level 4: Group Members & RGSF Group resolution ────────────────────────────
  const { records: groups } = await BvGroups.findAll({ limit: 500 });
  const scopedGroupIds = new Set<string>();

  // Collect relevant active keys for groups
  const groupOwnerKeys = new Set<string>([
    ...callerKeys,
    ...supervisorKeys,
    ...rgfKeys,
    ...rgsfKeys,
  ]);

  groups.forEach((g: any) => {
    const bvslId = String(g.bvslId || '').toLowerCase();
    const bvslLeader = String(g.bvslLeader || '').toLowerCase();
    const gGuide = String(g.guide || '').toLowerCase();
    const subFacId = String(g.subFacilitatorId || g.rgsfId || '').toLowerCase();

    // If caller is RGSF, strictly limit to their group
    if (isBvSubFacilitator && !isBvAdmin && !isBvSupervisor && !isBvFacilitator) {
      if ((subFacId && callerKeys.has(subFacId)) || (bvslId && callerKeys.has(bvslId))) {
        if (g.id) scopedGroupIds.add(String(g.id));
        if (g.groupId) scopedGroupIds.add(String(g.groupId));
      }
      return;
    }

    if (
      (bvslId && groupOwnerKeys.has(bvslId)) ||
      (bvslLeader && groupOwnerKeys.has(bvslLeader)) ||
      (gGuide && groupOwnerKeys.has(gGuide)) ||
      (subFacId && groupOwnerKeys.has(subFacId))
    ) {
      if (g.id) scopedGroupIds.add(String(g.id));
      if (g.groupId) scopedGroupIds.add(String(g.groupId));
    }
  });

  if (scopedGroupIds.size > 0) {
    const { records: groupMembers } = await BvGroupMembers.findAll({
      limit: 2000,
      fields: ['id', 'user', 'userId', 'memberId', 'group', 'groupId'],
    });
    groupMembers.forEach((m: any) => {
      // Match group by both the Firestore document ID (m.group) and the app-level groupId (m.groupId)
      const gRef = Array.isArray(m.group) ? m.group[0] : m.group;
      const gId = String(gRef || m.groupId || '');
      if (!gId || !scopedGroupIds.has(gId)) return;

      // Collect all possible user aliases from the membership record
      // m.user is the primary foreign-key reference to the Users table
      const userRef = Array.isArray(m.user) ? m.user[0] : m.user;
      if (userRef) scopedUserIds.add(String(userRef).toLowerCase());
      if (m.userId) scopedUserIds.add(String(m.userId).toLowerCase());
      if (m.id) scopedUserIds.add(String(m.id).toLowerCase());
      if (m.memberId) scopedUserIds.add(String(m.memberId).toLowerCase());
    });
  }

  // ── Level 5: Sadhana Mentor resolution ──────────────────────────────────────────
  const isSadhanaMentor = !!(contextUser.isSadhanaMentor || userRole === 'SADHANA_MENTOR' || userRole === 'SADHANA MENTOR');
  if (isSadhanaMentor) {
    const isPwMentor = contextUser.segment === 'PW' || !!(contextUser as any).isPrabhupadaWorldUser;
    if (isPwMentor) {
      // PW: only see users assigned to them
      allUsers.forEach((u: any) => {
        if (u.sadhanaMentor && callerKeys.has(String(u.sadhanaMentor).toLowerCase())) {
          if (u.id) scopedUserIds.add(u.id.toLowerCase());
          if (u.userId) scopedUserIds.add(u.userId.toLowerCase());
          if (u.email) scopedUserIds.add(u.email.toLowerCase());
        }
      });
    } else {
      // FOLK: see all users under their guide
      const mentorUser = allUsers.find(u => {
        const uid = String(u.id || '').toLowerCase();
        const uuserId = String(u.userId || '').toLowerCase();
        const uemail = String(u.email || '').toLowerCase();
        return callerKeys.has(uid) || callerKeys.has(uuserId) || callerKeys.has(uemail);
      });
      const mentorGuideId = Array.isArray(mentorUser?.guide) ? mentorUser.guide[0] : mentorUser?.guide;
      if (mentorGuideId) {
        const guideIdLower = String(mentorGuideId).toLowerCase();
        allUsers.forEach((u: any) => {
          const uGuide = Array.isArray(u.guide) ? u.guide[0] : u.guide;
          if (uGuide && String(uGuide).toLowerCase() === guideIdLower) {
            if (u.id) scopedUserIds.add(u.id.toLowerCase());
            if (u.userId) scopedUserIds.add(u.userId.toLowerCase());
            if (u.email) scopedUserIds.add(u.email.toLowerCase());
          }
        });
      }
    }
  }

  return scopedUserIds;
}
