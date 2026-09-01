/** Shared server-side meeting visibility rules.
 *
 * A person can be represented by a Firebase UID, a database document ID, a
 * legacy userId, or an email address. Meetings created across those migrations
 * contain a mixture of those identifiers, so invitee checks must compare all
 * of them consistently.
 */

type UserLike = Record<string, any> | null | undefined;

export type MeetingViewer = {
  department: 'FOLK' | 'PW' | null;
  canViewAllMeetings: boolean;
  isReadOnlySadhanaMentor: boolean;
  identityKeys: Set<string>;
  email: string;
};

export function normalizeMeetingDepartment(value: unknown): 'FOLK' | 'PW' | null {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (normalized === 'FOLK') return 'FOLK';
  if (normalized === 'PW' || normalized === 'PRABHUPADAWORLD') return 'PW';
  return null;
}

function normalizedRole(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function identityValues(...users: UserLike[]): Set<string> {
  const keys = new Set<string>();
  for (const user of users) {
    if (!user) continue;
    for (const value of [user.id, user.userId, user.email, user.uid, user.authUid, user.firebaseUid]) {
      const key = String(value || '').trim().toLowerCase();
      if (key) keys.add(key);
    }
  }
  return keys;
}

export function getMeetingViewer(contextUser: UserLike, storedUser: UserLike): MeetingViewer {
  // The database profile takes precedence; it is the source of truth when a
  // token still contains a legacy department or role from a prior assignment.
  const department = normalizeMeetingDepartment(storedUser?.segment)
    || normalizeMeetingDepartment(contextUser?.segment);
  const roles = [normalizedRole(storedUser?.role), normalizedRole(contextUser?.role)];
  const isSadhanaMentor = !!(
    storedUser?.isSadhanaMentor || contextUser?.isSadhanaMentor ||
    roles.includes('SADHANA_MENTOR')
  );
  const isReadOnlySadhanaMentor = department === 'PW' && isSadhanaMentor;
  const isAdmin = !!(
    storedUser?.isBvSuperAdmin || storedUser?.isBvAdmin || storedUser?.isPwAdmin ||
    contextUser?.isBvSuperAdmin || contextUser?.isBvAdmin || contextUser?.isPwAdmin ||
    roles.some(role => ['ADMIN', 'PW_ADMIN', 'SUPER_ADMIN', 'SUPER_GUIDE'].includes(role))
  );

  return {
    department,
    isReadOnlySadhanaMentor,
    canViewAllMeetings: isAdmin && !isReadOnlySadhanaMentor,
    identityKeys: identityValues(storedUser, contextUser),
    email: String(storedUser?.email || contextUser?.email || '').trim().toLowerCase(),
  };
}

export function isMeetingVisibleToViewer(meeting: any, viewer: MeetingViewer): boolean {
  const inviteeIds = Array.isArray(meeting?.inviteeUserIds) ? meeting.inviteeUserIds : [];
  if (inviteeIds.some((id: unknown) => viewer.identityKeys.has(String(id || '').trim().toLowerCase()))) {
    return true;
  }

  const invitees = Array.isArray(meeting?.invitees) ? meeting.invitees : [];
  return invitees.some((invitee: any) => {
    const invitedId = String(invitee?.userId || '').trim().toLowerCase();
    const invitedEmail = String(invitee?.email || '').trim().toLowerCase();
    return viewer.identityKeys.has(invitedId) || (!!viewer.email && invitedEmail === viewer.email);
  });
}
