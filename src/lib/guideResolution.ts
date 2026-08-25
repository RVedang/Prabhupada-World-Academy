import { Guides, Users } from '@/lib/backend-sdk';

export type ResolvedGuide = {
  id: string;
  userId?: string;
  fullName?: string;
  email?: string;
  segment?: 'PW' | 'FOLK';
  isPrabhupadaWorldMentor?: boolean;
};

function asGuide(record: any): ResolvedGuide | null {
  if (!record) return null;
  const id = String(record.id || record.userId || '');
  if (!id) return null;

  const isPw = record.segment === 'PW' || record.isPrabhupadaWorldUser === true || record.isPrabhupadaWorldMentor === true;
  return {
    id,
    userId: record.userId || record.guideId || undefined,
    fullName: record.fullName || record.name || undefined,
    email: record.email || undefined,
    segment: isPw ? 'PW' : record.segment === 'FOLK' ? 'FOLK' : undefined,
    isPrabhupadaWorldMentor: isPw,
  };
}

/** Resolve a guide/admin selected in the UI from Firestore, without identity-specific aliases. */
export async function resolveGuideReference(reference?: string): Promise<ResolvedGuide | null> {
  const value = String(reference || '').trim();
  if (!value) return null;
  const email = value.toLowerCase();

  const guide = await Guides.findOne({ id: value }).catch(() => null) ||
    await Guides.findOne({ filters: { guideId: value } }).catch(() => null) ||
    (value.includes('@') ? await Guides.findOne({ filters: { email } }).catch(() => null) : null);
  if (guide) return asGuide(guide);

  const user = await Users.findOne({ id: value }).catch(() => null) ||
    await Users.findOne({ filters: { userId: value } }).catch(() => null) ||
    (value.includes('@') ? await Users.findOne({ filters: { email } }).catch(() => null) : null);
  return asGuide(user);
}

export async function resolveDefaultGuideForSegment(segment: 'PW' | 'FOLK'): Promise<ResolvedGuide | null> {
  const { records } = await Users.findAll({
    fields: ['id', 'userId', 'fullName', 'email', 'role', 'status', 'segment', 'isPrabhupadaWorldUser', 'isBvAdmin', 'isBvSuperAdmin'],
    limit: 1000,
  }).catch(() => ({ records: [] }));

  const candidates = records
    .filter((user: any) => {
      const userSegment = getUserSegment(user);
      const status = String(user.status || '').toUpperCase().replace(/\s+/g, '_');
      return userSegment === segment && status === 'ACTIVE' && isAdminRole(user);
    })
    .sort((a: any, b: any) => {
      const aSuper = isSuperAdminRole(a) ? 0 : 1;
      const bSuper = isSuperAdminRole(b) ? 0 : 1;
      if (aSuper !== bSuper) return aSuper - bSuper;
      return String(a.fullName || a.email || '').localeCompare(String(b.fullName || b.email || ''));
    });

  const selected = candidates[0];
  if (selected) {
    return {
      id: selected.userId || selected.id,
      userId: selected.userId || undefined,
      fullName: selected.fullName || undefined,
      email: selected.email || undefined,
      segment,
      isPrabhupadaWorldMentor: segment === 'PW',
    };
  }

  if (segment !== 'FOLK') return null;

  const { records: guides } = await Guides.findAll({
    filters: { isActive: true },
    fields: ['id', 'guideId', 'fullName', 'email', 'segment', 'isPrabhupadaWorldMentor'],
    limit: 500,
  }).catch(() => ({ records: [] }));
  const guide = guides.find((g: any) => asGuide(g)?.segment === segment);
  return asGuide(guide);
}

export function getUserSegment(user: { segment?: unknown; isPrabhupadaWorldUser?: unknown } | null | undefined): 'PW' | 'FOLK' | null {
  if (user?.segment === 'PW' || user?.isPrabhupadaWorldUser === true) return 'PW';
  if (user?.segment === 'FOLK') return 'FOLK';
  return null;
}

export function isAdminRole(user: { role?: unknown; isBvAdmin?: unknown; isBvSuperAdmin?: unknown } | null | undefined): boolean {
  const role = String(user?.role || '').toUpperCase().replace(/\s+/g, '_');
  return user?.isBvAdmin === true || user?.isBvSuperAdmin === true || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function isSuperAdminRole(user: { role?: unknown; isBvSuperAdmin?: unknown } | null | undefined): boolean {
  const role = String(user?.role || '').toUpperCase().replace(/\s+/g, '_');
  return user?.isBvSuperAdmin === true || role === 'SUPER_ADMIN';
}
