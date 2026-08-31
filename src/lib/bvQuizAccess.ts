import { AppError, BvGroupMembers, BvGroups, Guides, Users } from '@/lib/backend-sdk';
import type { ApiUserContext } from '@/lib/apiAuthorization';

export type QuizDepartment = 'FOLK' | 'PW';

type QuizAccessUser = ApiUserContext | (Record<string, unknown> & {
  id?: string;
  uid?: string;
  userId?: string;
  email?: string;
  fullName?: string;
  name?: string;
  role?: string;
  normalizedRole?: string;
  status?: string | null;
  segment?: string | null;
  isActive?: boolean;
  isBvAdmin?: boolean;
  isBvSuperAdmin?: boolean;
  isBvFacilitator?: boolean;
  isBvSubFacilitator?: boolean;
  isBvsl?: boolean;
});

export interface QuizGroupScope {
  id: string;
  groupId: string;
  groupName: string;
  segment: QuizDepartment;
  isActive: boolean;
  record: any;
}

export function normalizeQuizDepartment(value: unknown, fallback: QuizDepartment = 'PW'): QuizDepartment {
  const normalized = String(value || '').trim().replace(/[\s_-]+/g, '').toUpperCase();
  if (normalized === 'FOLK') return 'FOLK';
  if (normalized === 'PW' || normalized === 'PRABHUPADAWORLD') return 'PW';
  return fallback;
}

export function normalizeQuizRole(value: unknown): string {
  return String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
}

export function quizRefValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(quizRefValues);
  if (value == null) return [];
  return String(value)
    .split(',')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

export function quizUserAliases(user: QuizAccessUser | null | undefined): Set<string> {
  const aliases = new Set<string>();
  if (!user) return aliases;
  for (const value of [user.id, user.uid, user.userId, user.email, user.fullName, user.name]) {
    for (const alias of quizRefValues(value)) aliases.add(alias);
  }
  return aliases;
}

export function quizGroupAliases(group: any): Set<string> {
  const aliases = new Set<string>();
  if (!group) return aliases;
  for (const value of [group.id, group.groupId, group.groupName]) {
    for (const alias of quizRefValues(value)) aliases.add(alias);
  }
  return aliases;
}

function isActiveUser(user: QuizAccessUser | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.isActive === 'boolean') return user.isActive;
  return normalizeQuizRole(user.status) === 'ACTIVE';
}

function isPwDepartmentUser(user: QuizAccessUser): boolean {
  return normalizeQuizDepartment(user.segment, 'PW') === 'PW' && String(user.segment || '').trim() !== '';
}

export function isPwQuizAdmin(user: QuizAccessUser | null | undefined): boolean {
  if (!isActiveUser(user)) return false;
  const role = normalizeQuizRole(user?.normalizedRole || user?.role);
  if (
    role === 'SUPER_ADMIN' ||
    role === 'PW_SUPER_ADMIN' ||
    role === 'PRABHUPADA_WORLD_SUPER_ADMIN' ||
    user?.isBvSuperAdmin === true
  ) return true;
  return !!user && isPwDepartmentUser(user) && (
    role === 'ADMIN' ||
    role === 'PW_ADMIN' ||
    role === 'PRABHUPADA_WORLD_ADMIN' ||
    user.isBvAdmin === true
  );
}

export function isPwQuizFacilitator(user: QuizAccessUser | null | undefined): boolean {
  if (!isActiveUser(user) || !user || !isPwDepartmentUser(user)) return false;
  const role = normalizeQuizRole(user.normalizedRole || user.role);
  return user.isBvFacilitator === true || user.isBvsl === true ||
    role === 'BVSL' || role === 'RGF' || role === 'FACILITATOR' ||
    role === 'PW_READING_GROUP_FACILITATOR' ||
    role === 'PRABHUPADA_WORLD_READING_GROUP_FACILITATOR';
}

export function isPwQuizSubFacilitator(user: QuizAccessUser | null | undefined): boolean {
  if (!isActiveUser(user) || !user || !isPwDepartmentUser(user)) return false;
  const role = normalizeQuizRole(user.normalizedRole || user.role);
  return user.isBvSubFacilitator === true || role === 'RGSF' || role === 'SUB_FACILITATOR' ||
    role === 'PW_READING_GROUP_SUB_FACILITATOR' ||
    role === 'PRABHUPADA_WORLD_READING_GROUP_SUB_FACILITATOR';
}

export function isFolkQuizContentManager(user: QuizAccessUser | null | undefined): boolean {
  if (!isActiveUser(user) || !user || normalizeQuizDepartment(user.segment, 'PW') !== 'FOLK') return false;
  const role = normalizeQuizRole(user.normalizedRole || user.role);
  return user.isBvFacilitator === true || user.isBvsl === true || user.isBvSubFacilitator === true ||
    role === 'BVSL' || role === 'RGF' || role === 'RGSF' || role === 'FACILITATOR' || role === 'SUB_FACILITATOR';
}

export function canManageQuizContent(user: QuizAccessUser | null | undefined, department: QuizDepartment): boolean {
  return department === 'PW' ? isPwQuizAdmin(user) : isFolkQuizContentManager(user);
}

export function canTogglePwQuizGroups(user: QuizAccessUser | null | undefined): boolean {
  return isPwQuizAdmin(user) || isPwQuizFacilitator(user);
}

function groupOwnerRefs(group: any): string[] {
  return quizRefValues([
    group?.bvslId,
    group?.bvslLeader,
  ]);
}

function groupSubFacilitatorRefs(group: any): string[] {
  return quizRefValues([
    group?.subFacilitatorId,
    group?.rgsfId,
    group?.subFacilitator,
  ]);
}

function directoryAliases(record: any): string[] {
  return quizRefValues([record?.id, record?.userId, record?.guideId, record?.email, record?.fullName, record?.name]);
}

async function loadDepartmentDirectory(): Promise<Map<string, QuizDepartment>> {
  const departmentByAlias = new Map<string, QuizDepartment>();
  const [usersResult, guidesResult] = await Promise.all([
    Users.findAll({
      limit: 5000,
      fields: ['id', 'userId', 'email', 'fullName', 'segment', 'isPrabhupadaWorldUser'],
    }).catch(() => ({ records: [] })),
    Guides.findAll({
      limit: 2000,
      fields: ['id', 'guideId', 'email', 'fullName', 'segment'],
    }).catch(() => ({ records: [] })),
  ]);

  for (const record of [...usersResult.records, ...guidesResult.records]) {
    const explicit = String(record?.segment || '').trim();
    const department = explicit
      ? normalizeQuizDepartment(explicit)
      : (record?.isPrabhupadaWorldUser === true ? 'PW' : null);
    if (!department) continue;
    for (const alias of directoryAliases(record)) departmentByAlias.set(alias, department);
  }
  return departmentByAlias;
}

function resolveGroupDepartment(
  group: any,
  departmentByAlias: Map<string, QuizDepartment>,
  callerAliases: Set<string>,
  callerDepartment: QuizDepartment,
): QuizDepartment {
  if (String(group?.segment || '').trim()) return normalizeQuizDepartment(group.segment);

  for (const reference of quizRefValues([group?.bvslId, group?.bvslLeader, group?.guide])) {
    const resolved = departmentByAlias.get(reference);
    if (resolved) return resolved;
  }

  const ownerRefs = new Set(quizRefValues([group?.bvslId, group?.bvslLeader, group?.guide]));
  if ([...ownerRefs].some(reference => callerAliases.has(reference))) return callerDepartment;

  // Existing group APIs already treat untagged legacy groups as PW. Keep that
  // compatibility fallback while all newly-written quiz/group records carry a
  // department explicitly.
  return 'PW';
}

async function getExpandedAliases(reference: unknown): Promise<Set<string>> {
  const seed = quizRefValues(reference);
  const aliases = new Set(seed);
  for (const value of seed) {
    const record = await Users.findOne({ id: value }).catch(() => undefined) ||
      await Users.findOne({ filters: { userId: value } }).catch(() => undefined) ||
      await Users.findOne({ filters: { email: value } }).catch(() => undefined);
    if (record) directoryAliases(record).forEach(alias => aliases.add(alias));
  }
  return aliases;
}

export async function getQuizGroupsForUser(
  user: QuizAccessUser,
  department: QuizDepartment,
  options: { includeInactive?: boolean; readOnly?: boolean } = {},
): Promise<QuizGroupScope[]> {
  if (!isActiveUser(user)) return [];
  const callerAliases = quizUserAliases(user);
  const callerDepartment = normalizeQuizDepartment(user.segment, department);
  const [groupResult, departmentByAlias] = await Promise.all([
    BvGroups.findAll({ limit: 1000 }),
    loadDepartmentDirectory(),
  ]);

  const callerRecord = await Users.findOne({ id: String(user.id || '') }).catch(() => undefined) ||
    await Users.findOne({ filters: { userId: String(user.userId || '') } }).catch(() => undefined) ||
    await Users.findOne({ filters: { email: String(user.email || '') } }).catch(() => undefined);
  if (callerRecord) directoryAliases(callerRecord).forEach(alias => callerAliases.add(alias));

  const reportingFacilitatorAliases = await getExpandedAliases((callerRecord as any)?.bvReportingFacilitatorId);
  const isAdmin = department === 'PW' && isPwQuizAdmin(user);
  const allowRgsfRead = options.readOnly === true && isPwQuizSubFacilitator(user);

  return groupResult.records
    .filter((group: any) => options.includeInactive || group.isActive !== false)
    .map((group: any) => ({
      group,
      segment: resolveGroupDepartment(group, departmentByAlias, callerAliases, callerDepartment),
    }))
    .filter(({ segment }) => segment === department)
    .filter(({ group }) => {
      if (isAdmin) return true;
      const owners = groupOwnerRefs(group);
      const subFacilitators = groupSubFacilitatorRefs(group);
      const directlyOwned = owners.some(reference => callerAliases.has(reference));
      const directlyAssigned = subFacilitators.some(reference => callerAliases.has(reference));

      if (department === 'PW') {
        if (isPwQuizFacilitator(user)) return directlyOwned;
        if (allowRgsfRead) {
          const inherited = owners.some(reference => reportingFacilitatorAliases.has(reference));
          return directlyAssigned || inherited;
        }
        return false;
      }

      if (!isFolkQuizContentManager(user)) return false;
      const inherited = owners.some(reference => reportingFacilitatorAliases.has(reference));
      return directlyOwned || directlyAssigned || inherited;
    })
    .map(({ group, segment }) => ({
      id: String(group.id || ''),
      groupId: String(group.groupId || group.id || ''),
      groupName: String(group.groupName || 'Reading Group'),
      segment,
      isActive: group.isActive !== false,
      record: group,
    }))
    .filter(group => !!group.id);
}

export function findScopedQuizGroup(groups: QuizGroupScope[], reference: unknown): QuizGroupScope | null {
  const references = new Set(quizRefValues(reference));
  if (references.size === 0) return null;
  return groups.find(group => [...quizGroupAliases(group.record)].some(alias => references.has(alias))) || null;
}

export async function findQuizGroup(reference: unknown): Promise<any | null> {
  const refs = quizRefValues(reference);
  for (const ref of refs) {
    const group = await BvGroups.findOne({ id: ref }).catch(() => undefined) ||
      await BvGroups.findOne({ filters: { groupId: ref } }).catch(() => undefined) ||
      await BvGroups.findOne({ filters: { groupName: ref } }).catch(() => undefined);
    if (group) return group;
  }
  return null;
}

export async function resolveQuizDepartment(quiz: any, fallback: QuizDepartment): Promise<QuizDepartment> {
  if (String(quiz?.department || '').trim()) return normalizeQuizDepartment(quiz.department, fallback);
  if (quizRefValues(quiz?.group).length > 0) {
    const group = await findQuizGroup(quiz.group);
    if (group) {
      const directory = await loadDepartmentDirectory();
      return resolveGroupDepartment(group, directory, new Set(), fallback);
    }
  }

  for (const creatorRef of quizRefValues(quiz?.createdBy)) {
    const creator = await Users.findOne({ id: creatorRef }).catch(() => undefined) ||
      await Users.findOne({ filters: { userId: creatorRef } }).catch(() => undefined) ||
      await Users.findOne({ filters: { email: creatorRef } }).catch(() => undefined);
    if (creator?.segment) return normalizeQuizDepartment(creator.segment, fallback);
  }
  // Before department support, quizzes were created by the FOLK source
  // system. Untagged records with no resolvable group/creator therefore stay
  // FOLK instead of being reclassified by a caller-supplied department.
  return 'FOLK';
}

export async function getUserQuizMemberships(user: QuizAccessUser): Promise<any[]> {
  const aliases = quizUserAliases(user);
  const record = await Users.findOne({ id: String(user.id || '') }).catch(() => undefined) ||
    await Users.findOne({ filters: { userId: String(user.userId || '') } }).catch(() => undefined) ||
    await Users.findOne({ filters: { email: String(user.email || '') } }).catch(() => undefined);
  if (record) directoryAliases(record).forEach(alias => aliases.add(alias));

  const { records } = await BvGroupMembers.findAll({
    limit: 5000,
    fields: ['id', 'group', 'groupId', 'user', 'userId', 'memberId', 'role'],
  });
  return records.filter((membership: any) => {
    const memberRefs = quizRefValues([membership.user, membership.userId, membership.memberId]);
    return memberRefs.some(reference => aliases.has(reference));
  });
}

export async function getUserQuizGroups(user: QuizAccessUser, department: QuizDepartment): Promise<any[]> {
  const memberships = await getUserQuizMemberships(user);
  const groups: any[] = [];
  const seen = new Set<string>();
  const directory = await loadDepartmentDirectory();
  const callerAliases = quizUserAliases(user);
  for (const membership of memberships) {
    const group = await findQuizGroup([membership.group, membership.groupId]);
    if (!group || seen.has(group.id) || group.isActive === false) continue;
    const groupDepartment = resolveGroupDepartment(group, directory, callerAliases, normalizeQuizDepartment(user.segment, department));
    if (groupDepartment !== department) continue;
    seen.add(group.id);
    groups.push(group);
  }
  return groups;
}

export function quizIsActivatedForGroup(quiz: any, group: any): boolean {
  const activeRefs = new Set(quizRefValues(quiz?.activeGroupIds));
  return [...quizGroupAliases(group)].some(alias => activeRefs.has(alias));
}

export function legacyQuizMatchesGroup(quiz: any, group: any): boolean {
  const quizGroups = new Set(quizRefValues(quiz?.group));
  return [...quizGroupAliases(group)].some(alias => quizGroups.has(alias));
}

export async function assertQuizParticipantAccess(
  user: QuizAccessUser,
  quiz: any,
  fallbackDepartment?: QuizDepartment,
): Promise<{ department: QuizDepartment; group: any }> {
  const department = await resolveQuizDepartment(
    quiz,
    fallbackDepartment || normalizeQuizDepartment(user.segment, 'PW'),
  );
  if (normalizeQuizDepartment(user.segment, department) !== department || !String(user.segment || '').trim()) {
    throw new AppError({ code: 'FORBIDDEN', message: 'This quiz is not available in your department' });
  }
  if (quiz.isActive !== true) {
    throw new AppError({ code: 'FORBIDDEN', message: 'This quiz is not currently published' });
  }

  const groups = await getUserQuizGroups(user, department);
  const group = groups.find(candidate => department === 'PW'
    ? (quizIsActivatedForGroup(quiz, candidate) || legacyQuizMatchesGroup(quiz, candidate))
    : legacyQuizMatchesGroup(quiz, candidate));
  if (!group) {
    throw new AppError({ code: 'FORBIDDEN', message: 'This quiz is not active for your reading group' });
  }
  return { department, group };
}

export function requireQuizContentManager(user: QuizAccessUser, department: QuizDepartment): void {
  if (!canManageQuizContent(user, department)) {
    const message = department === 'PW'
      ? 'Only Prabhupada World Admins and Super Admins can manage quiz content'
      : 'Only authorized FOLK quiz managers can manage quiz content';
    throw new AppError({ code: 'FORBIDDEN', message });
  }
}
