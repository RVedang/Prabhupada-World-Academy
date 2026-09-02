import { AppError, BvGroups, BvGroupMembers, Users } from '@/lib/backend-sdk';

const IDENTITY_FIELDS = [
  'id', 'userId', 'email', 'uid', 'authUid', 'firebaseUid', 'firebaseUserId',
  'firebaseAuthUid', 'authId', 'authUserId', 'firebaseId', 'firebaseAuthId', 'firebase_id',
  // Pre-migration BV groups and preaching entries stored the facilitator's
  // display name rather than a Users document ID. Keep those historic rows
  // visible in the current RGF reports while all new writes use canonical IDs.
  'fullName', 'displayName', 'name',
];
const PROFILE_RESOLUTION_FIELDS = ['fullName', 'displayName', 'name', 'status'];
type UserRecord = Record<string, unknown>;

export interface BvGroupScopeOptions {
  groupId?: string;
  segment?: 'FOLK' | 'PW';
}

export interface BvScopedGroup {
  id: string;
  groupId: string;
  groupName: string;
  record: UserRecord;
}

function refs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refs);
  if (value == null) return [];
  return String(value).split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

export function bvUserAliases(user: UserRecord | null | undefined): string[] {
  return [...new Set(IDENTITY_FIELDS.flatMap(field => refs(user?.[field])))];
}

function profileName(user: UserRecord | null | undefined): string {
  return String(user?.fullName || user?.displayName || user?.name || '').trim();
}

function profileEmail(user: UserRecord | null | undefined): string {
  return String(user?.email || '').trim();
}

function profileQuality(user: UserRecord | null | undefined): number {
  return (profileName(user) ? 8 : 0) +
    (profileEmail(user) ? 4 : 0) +
    (String(user?.userId || '').trim() ? 2 : 0) +
    (String(user?.status || '').trim().toLowerCase() === 'active' ? 1 : 0);
}

function roleValue(user: UserRecord | null | undefined): string {
  return String(user?.role || '').toUpperCase().replace(/[\s-]+/g, '_');
}

function groupAliases(group: UserRecord): string[] {
  return refs([group.id, group.groupId]);
}

async function resolveCanonicalUsersByAliases(
  targetAliases: Set<string>,
  userFields: string[],
): Promise<UserRecord[]> {
  if (targetAliases.size === 0) return [];

  const requestedFields = [...new Set([...userFields, ...IDENTITY_FIELDS, ...PROFILE_RESOLUTION_FIELDS])];
  const { records: allUsers } = await Users.findAll({ fields: requestedFields, limit: 5000 });
  const candidates = allUsers.filter(user =>
    bvUserAliases(user).some(alias => targetAliases.has(alias))
  );

  // Treat every shared canonical identity alias as an edge. Connected
  // components handle transitive legacy duplicates (A shares userId with B,
  // while B shares auth UID with C) that greedy alias claiming can miss.
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const aliasOwner = new Map<string, number>();
  candidates.forEach((user, index) => {
    for (const alias of bvUserAliases(user)) {
      const owner = aliasOwner.get(alias);
      if (owner === undefined) aliasOwner.set(alias, index);
      else union(index, owner);
    }
  });

  const canonicalUsers = new Map<number, UserRecord>();
  candidates.forEach((user, index) => {
    // Alias-only placeholder documents can connect legacy identities, but
    // must never become a visible report or 1:1 profile themselves.
    if (!profileName(user) && !profileEmail(user)) return;
    const root = find(index);
    const current = canonicalUsers.get(root);
    if (!current || profileQuality(user) > profileQuality(current)) {
      canonicalUsers.set(root, user);
    }
  });
  return [...canonicalUsers.values()];
}

/**
 * Resolve the active BV groups the caller is permitted to monitor.
 * Supervisors inherit groups from RGFs that report to them. RGF/RGSF behavior
 * remains identical to the existing dashboards.
 */
export async function resolveBvScopedGroups(
  contextUser: UserRecord,
  options: BvGroupScopeOptions = {},
): Promise<BvScopedGroup[]> {
  const callerFields = [
    'id', 'userId', 'email', 'role', 'segment', 'guide',
    'isBvSupervisor', 'isBvMentor', 'isBvFacilitator', 'isBvsl', 'isBvSubFacilitator',
    'bvReportingFacilitatorId',
  ];
  const caller = await Users.findOne({ id: contextUser.id, fields: callerFields }).catch(() => undefined) ||
    await Users.findOne({ filters: { userId: contextUser.userId || contextUser.id }, fields: callerFields }).catch(() => undefined) ||
    await Users.findOne({ filters: { email: contextUser.email }, fields: callerFields }).catch(() => undefined);

  const callerAliases = new Set([
    contextUser.id, contextUser.userId, contextUser.email,
    caller?.id, caller?.userId, caller?.email,
  ].flatMap(refs));
  const allUsersResult = await Users.findAll({
    fields: [
      'id', 'userId', 'email', 'role', 'segment', 'guide',
      'isBvSupervisor', 'isBvMentor', 'isBvFacilitator', 'isBvsl', 'isBvSubFacilitator',
      'bvReportingSupervisorId', 'bvReportingFacilitatorId',
    ],
    limit: 5000,
  }).catch(() => ({ records: [] }));
  const allUsers = allUsersResult.records as UserRecord[];

  const parentAliases = new Set([
    contextUser.bvReportingFacilitatorId,
    (caller as UserRecord | undefined)?.bvReportingFacilitatorId,
  ].flatMap(refs));

  if (parentAliases.size > 0) {
    for (const parent of allUsers) {
      if (bvUserAliases(parent).some(alias => parentAliases.has(alias))) {
        bvUserAliases(parent).forEach(alias => parentAliases.add(alias));
      }
    }
  }

  const role = roleValue(contextUser);
  const callerRole = roleValue(caller);
  const isSupervisor = !!(
    contextUser.isBvSupervisor || contextUser.isBvMentor ||
    caller?.isBvSupervisor || caller?.isBvMentor ||
    role === 'SUPERVISOR' || role === 'BV_SUPERVISOR' ||
    callerRole === 'SUPERVISOR' || callerRole === 'BV_SUPERVISOR'
  );
  const isRgsf = !!(contextUser.isBvSubFacilitator || caller?.isBvSubFacilitator || role.includes('RGSF'));

  // Resolve every identity alias for RGFs that report to this supervisor.
  // Older data can store either a Firestore id, public userId, or email.
  const reportingRgfAliases = new Set<string>();
  if (isSupervisor) {
    for (const user of allUsers) {
      const reportingSupervisorRefs = refs(user.bvReportingSupervisorId);
      const legacyGuideRefs = refs(user.guide);
      const userRole = roleValue(user);
      const isRgf = !!(user.isBvFacilitator || user.isBvsl || userRole === 'RGF' || userRole === 'BVSL' || userRole === 'FACILITATOR');
      if (!isRgf) continue;
      const explicitlyReports = reportingSupervisorRefs.some(ref => callerAliases.has(ref));
      const legacyReports = reportingSupervisorRefs.length === 0 && legacyGuideRefs.some(ref => callerAliases.has(ref));
      if (explicitlyReports || legacyReports) {
        bvUserAliases(user).forEach(alias => reportingRgfAliases.add(alias));
      }
    }
  }

  const segmentByUserAlias = new Map<string, string>();
  for (const user of allUsers) {
    const segment = String(user.segment || '').trim().toUpperCase();
    if (!segment) continue;
    bvUserAliases(user).forEach(alias => segmentByUserAlias.set(alias, segment));
  }

  const { records: allGroups } = await BvGroups.findAll({
    fields: ['id', 'groupId', 'groupName', 'segment', 'guide', 'isActive', 'bvslLeader', 'bvslId', 'subFacilitatorId', 'rgsfId', 'subFacilitator'],
    limit: 1000,
  });
  let groups = allGroups.filter(group => {
    if (group.isActive === false) return false;
    const leaderRefs = refs([group.bvslLeader, group.bvslId]);
    const rgsfRefs = refs([group.subFacilitatorId, group.rgsfId, group.subFacilitator]);
    if (options.segment) {
      const explicitSegment = String(group.segment || '').trim().toUpperCase();
      const inferredSegments = leaderRefs.map(ref => segmentByUserAlias.get(ref)).filter(Boolean);
      const groupSegment = explicitSegment || inferredSegments[0] || '';
      if (groupSegment && groupSegment !== options.segment) return false;
    }
    if (isSupervisor) {
      const legacyGuideRefs = refs(group.guide);
      return leaderRefs.some(ref => reportingRgfAliases.has(ref)) ||
        leaderRefs.some(ref => callerAliases.has(ref)) ||
        legacyGuideRefs.some(ref => callerAliases.has(ref));
    }
    if (isRgsf) {
      return leaderRefs.some(ref => callerAliases.has(ref)) ||
        rgsfRefs.some(ref => callerAliases.has(ref)) ||
        leaderRefs.some(ref => parentAliases.has(ref));
    }
    return leaderRefs.some(ref => callerAliases.has(ref));
  });

  if (options.groupId) {
    const requested = new Set(refs(options.groupId));
    groups = groups.filter(group => groupAliases(group).some(alias => requested.has(alias)));
    if (groups.length === 0) {
      throw new AppError({ code: 'FORBIDDEN', message: 'This reading group is not assigned to your hierarchy' });
    }
  }

  return groups.map(group => ({
    id: String(group.id || ''),
    groupId: String(group.groupId || group.id || ''),
    groupName: String(group.groupName || 'Reading Group'),
    record: group,
  })).filter(group => !!group.id);
}

/** Resolve the authoritative Users records belonging to the caller's BV groups. */
export async function resolveBvGroupMemberUsers(
  contextUser: UserRecord,
  userFields: string[],
  options: BvGroupScopeOptions = {},
): Promise<UserRecord[]> {
  const groups = await resolveBvScopedGroups(contextUser, options);
  if (groups.length === 0) return [];

  const scopedGroupAliases = new Set(groups.flatMap(group => refs([group.id, group.groupId])));
  const { records: memberships } = await BvGroupMembers.findAll({
    fields: ['id', 'user', 'userId', 'memberId', 'group', 'groupId'],
    limit: 5000,
  });
  const memberAliases = new Set<string>();
  for (const membership of memberships) {
    if (!refs([membership.group, membership.groupId]).some(ref => scopedGroupAliases.has(ref))) continue;
    refs([membership.user, membership.userId, membership.memberId]).forEach(ref => memberAliases.add(ref));
  }
  if (memberAliases.size === 0) return [];

  // Membership is authoritative. Do not require one exact status spelling;
  // this keeps Sadhana reports consistent with the Group Members tab.
  return resolveCanonicalUsersByAliases(memberAliases, userFields);
}

/** Resolve canonical RGF/RGSF profiles attached to the caller's scoped groups. */
export async function resolveBvGroupFacilitatorUsers(
  contextUser: UserRecord,
  userFields: string[],
  options: BvGroupScopeOptions = {},
): Promise<UserRecord[]> {
  const groups = await resolveBvScopedGroups(contextUser, options);
  const facilitatorAliases = new Set<string>();
  for (const group of groups) {
    refs([
      group.record.bvslLeader,
      group.record.bvslId,
      group.record.subFacilitatorId,
      group.record.rgsfId,
      group.record.subFacilitator,
    ]).forEach(alias => facilitatorAliases.add(alias));
  }
  return resolveCanonicalUsersByAliases(facilitatorAliases, userFields);
}
