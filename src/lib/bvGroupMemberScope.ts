import { BvGroups, BvGroupMembers, Users } from '@/lib/backend-sdk';

const IDENTITY_FIELDS = [
  'id', 'userId', 'email', 'uid', 'authUid', 'firebaseUid', 'firebaseUserId',
  'firebaseAuthUid', 'authId', 'authUserId', 'firebaseId', 'firebaseAuthId', 'firebase_id',
];
const PROFILE_RESOLUTION_FIELDS = ['fullName', 'displayName', 'name', 'status'];
type UserRecord = Record<string, unknown>;

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

/** Resolve the authoritative Users records belonging to the caller's BV groups. */
export async function resolveBvGroupMemberUsers(contextUser: UserRecord, userFields: string[]): Promise<UserRecord[]> {
  const caller = await Users.findOne({ id: contextUser.id, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] }).catch(() => undefined) ||
    await Users.findOne({ filters: { userId: contextUser.userId || contextUser.id }, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] }).catch(() => undefined) ||
    await Users.findOne({ filters: { email: contextUser.email }, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] }).catch(() => undefined);

  const callerAliases = new Set([
    contextUser.id, contextUser.userId, contextUser.email,
    caller?.id, caller?.userId, caller?.email,
  ].flatMap(refs));
  const parentAliases = new Set([
    contextUser.bvReportingFacilitatorId,
    (caller as UserRecord | undefined)?.bvReportingFacilitatorId,
  ].flatMap(refs));

  if (parentAliases.size > 0) {
    const { records: possibleParents } = await Users.findAll({
      fields: ['id', 'userId', 'email'],
      limit: 3000,
    });
    for (const parent of possibleParents) {
      if (bvUserAliases(parent).some(alias => parentAliases.has(alias))) {
        bvUserAliases(parent).forEach(alias => parentAliases.add(alias));
      }
    }
  }

  const role = String(contextUser.role || '').toUpperCase().replace(/[\s-]+/g, '_');
  const isRgsf = !!contextUser.isBvSubFacilitator || role.includes('RGSF');
  const { records: allGroups } = await BvGroups.findAll({
    fields: ['id', 'groupId', 'isActive', 'bvslLeader', 'bvslId', 'subFacilitatorId', 'rgsfId', 'subFacilitator'],
    limit: 1000,
  });
  const groups = allGroups.filter(group => {
    if (group.isActive === false) return false;
    const leaderRefs = refs([group.bvslLeader, group.bvslId]);
    const rgsfRefs = refs([group.subFacilitatorId, group.rgsfId, group.subFacilitator]);
    if (isRgsf) {
      return leaderRefs.some(ref => callerAliases.has(ref)) ||
        rgsfRefs.some(ref => callerAliases.has(ref)) ||
        leaderRefs.some(ref => parentAliases.has(ref));
    }
    return leaderRefs.some(ref => callerAliases.has(ref));
  });
  if (groups.length === 0) return [];

  const groupAliases = new Set(groups.flatMap(group => refs([group.id, group.groupId])));
  const { records: memberships } = await BvGroupMembers.findAll({
    fields: ['id', 'user', 'userId', 'memberId', 'group', 'groupId'],
    limit: 5000,
  });
  const memberAliases = new Set<string>();
  for (const membership of memberships) {
    if (!refs([membership.group, membership.groupId]).some(ref => groupAliases.has(ref))) continue;
    refs([membership.user, membership.userId, membership.memberId]).forEach(ref => memberAliases.add(ref));
  }
  if (memberAliases.size === 0) return [];

  // Membership is authoritative. Do not require one exact status spelling;
  // this keeps Sadhana reports consistent with the Group Members tab.
  const requestedFields = [...new Set([...userFields, ...IDENTITY_FIELDS, ...PROFILE_RESOLUTION_FIELDS])];
  const { records: allUsers } = await Users.findAll({ fields: requestedFields, limit: 5000 });
  const candidates = allUsers.filter(user =>
    bvUserAliases(user).some(alias => memberAliases.has(alias))
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
