export type UserDepartment = 'PW' | 'FOLK';

type DepartmentProfile = {
  segment?: string | null;
  isPrabhupadaWorldUser?: boolean;
  isFolkUser?: boolean;
};

/** Explicit department wins over legacy flags; unclassified accounts default to PW. */
export function getUserDepartment(profile?: DepartmentProfile | null): UserDepartment {
  const segment = profile?.segment?.trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (segment === 'FOLK' || segment === 'PW') return segment;
  if (segment === 'PRABHUPADAWORLD') return 'PW';
  if (profile?.isPrabhupadaWorldUser) return 'PW';
  return profile?.isFolkUser ? 'FOLK' : 'PW';
}

/** Personal Sadhana destination, independent of the user's management role. */
export function getUserDashboardPath(profile?: DepartmentProfile | null): string {
  return getUserDepartment(profile) === 'FOLK'
    ? '/user/folk-dashboard'
    : '/user/pw-dashboard';
}

export function getUserDashboardRedirect(
  profile: DepartmentProfile,
  location: { pathname: string; search: string; hash: string },
): string | null {
  const pathname = getUserDashboardPath(profile);
  return location.pathname === pathname ? null : `${pathname}${location.search}${location.hash}`;
}
