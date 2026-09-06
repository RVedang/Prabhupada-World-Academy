export type UserDepartment = 'PW' | 'FOLK';
const AUTH_DEPARTMENT_STORAGE_KEY = 'auth_department';

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

/** Public department landing route used after logout or an expired session. */
export function getDepartmentLandingPath(profile?: DepartmentProfile | null): string {
  return getUserDepartment(profile) === 'FOLK' ? '/' : '/pw';
}

export function rememberUserDepartment(profile?: DepartmentProfile | null): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(AUTH_DEPARTMENT_STORAGE_KEY, getUserDepartment(profile)); } catch {}
}

export function getRememberedDepartmentLandingPath(): string {
  if (typeof window === 'undefined') return '/';
  try {
    const department = localStorage.getItem(AUTH_DEPARTMENT_STORAGE_KEY);
    if (department === 'PW') return '/pw';
    if (department === 'FOLK') return '/';
  } catch {}
  return window.location.pathname.startsWith('/pw') ? '/pw' : '/';
}

export function getDepartmentLandingUrl(profile?: DepartmentProfile | null): string {
  const path = profile ? getDepartmentLandingPath(profile) : getRememberedDepartmentLandingPath();
  return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
}

export function getUserDashboardRedirect(
  profile: DepartmentProfile,
  location: { pathname: string; search: string; hash: string },
): string | null {
  const pathname = getUserDashboardPath(profile);
  return location.pathname === pathname ? null : `${pathname}${location.search}${location.hash}`;
}
