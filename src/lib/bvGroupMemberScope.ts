import { BvGroups, BvGroupMembers, Users } from '@/lib/backend-sdk';

const IDENTITY_FIELDS = [
  'id', 'userId', 'email', 'uid', 'authUid', 'firebaseUid', 'firebaseUserId',
  'firebaseAuthUid', 'authId', 'authUserId', 'firebaseId', 'firebaseAuthId', 'firebase_id',
];

function refs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refs);
  if (value == null) return [];
  return String(value).split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

export function bvUserAliases(user: any): string[] {
  return [...new Set(IDENTITY_FIELDS.flatMap(field => refs(user?.[field])))];
}

/** Resolve the authoritative Users records belonging to the caller's BV groups. */
export async function resolveBvGroupMemberUsers(contextUser: any, userFields: string[]): Promise<any[]> {
  const caller = await Users.findOne({ id: contextUser.id, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] }).catch(() => undefined) ||
    await Users.findOne({ filters: { userId: contextUser.userId || contextUser.id }, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] }).catch(() => undefined) ||
    await Users.findOne({ filters: { email: contextUser.email }, fields: ['id', 'userId', 'email', 'bvReportingFacilitatorId'] }).catch(() => undefined);

  const callerAliases = new Set([
    contextUser.id, contextUser.userId, contextUser.email,
    caller?.id, caller?.userId, caller?.email,
  ].flatMap(refs));
  const parentAliases = new Set([
    contextUser.bvReportingFacilitatorId,
    (caller as any)?.bvReportingFacilitatorId,
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
  const groups = allGroups.filter((group: any) => {
    if (group.isActive === false) return false;
    const leaderRefs = refs([group.bvslLeader, group.bvslId]);
    const rgsfRefs = refs([group.subFacilitatorId, group.rgsfId, group.subFacilitator]);
    if (isRgsf) {
      return rgsfRefs.some(ref => callerAliases.has(ref)) ||
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
  const requestedFields = [...new Set([...userFields, ...IDENTITY_FIELDS])];
  const { records: allUsers } = await Users.findAll({ fields: requestedFields, limit: 5000 });
  return allUsers.filter(user => bvUserAliases(user).some(alias => memberAliases.has(alias)));
}
