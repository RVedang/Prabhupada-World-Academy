type BvProfileViewer = {
  role?: string | null;
  isBvsl?: boolean;
  isSadhanaMentor?: boolean;
  isBvMentor?: boolean;
  isBvSupervisor?: boolean;
  isBvSubFacilitator?: boolean;
  isBvAdmin?: boolean;
  isBvSuperAdmin?: boolean;
};

const PROFILE_VIEWER_ROLES = new Set([
  'GUIDE',
  'SUPER_GUIDE',
  'ADMIN',
  'PW_ADMIN',
  'SUPER_ADMIN',
]);

export function isBvGroupProfileAdministrator(profile?: BvProfileViewer | null): boolean {
  if (!profile) return false;
  const role = String(profile.role || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return PROFILE_VIEWER_ROLES.has(role)
    || profile.isBvAdmin === true
    || profile.isBvSuperAdmin === true;
}

/** Whether this dashboard role may open a group member's managed profile. */
export function canOpenBvGroupMemberProfile(profile?: BvProfileViewer | null): boolean {
  if (!profile) return false;
  return isBvGroupProfileAdministrator(profile)
    || profile.isBvsl === true
    || profile.isSadhanaMentor === true
    || profile.isBvMentor === true
    || profile.isBvSupervisor === true
    || profile.isBvSubFacilitator === true;
}

export function getBvGroupMemberProfileBasePath(profile?: BvProfileViewer | null): '/guide/users' | '/rgsf/users' {
  return profile?.isBvSubFacilitator ? '/rgsf/users' : '/guide/users';
}
