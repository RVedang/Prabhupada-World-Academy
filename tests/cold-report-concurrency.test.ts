import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { FolkResidencies, Guides, Users, BvGroups, BvGroupMembers, BvAttendance, BvQuizzes, BvQuizSubmissions, SadhanaEntries } from '../src/lib/app-backend-sdk';
import { serverCacheInvalidate } from '../src/lib/serverCache';
import detailedReport from '../src/api/getGuideDetailedReport';
import guideUsers from '../src/api/getGuideUsers';
import missingReport from '../src/api/getMissingSadhanaReport';
import attendanceReport from '../src/api/getBvSessionMatrix';
import { apiUser } from './helpers/apiUser';
import { getGuideScope } from '../src/lib/guideScope';

const member = { id: 'member-db', userId: 'MEMBER-1', fullName: 'Test Member', status: 'Active', role: 'User', segment: 'PW', ashrayLevel: 'Upasaka' };
const context = { user: apiUser({ id: 'admin', role: 'SUPER_ADMIN', isBvSuperAdmin: true, segment: 'PW' }) };

function holdLabels(t: TestContext) {
  serverCacheInvalidate();
  let release!: () => void;
  const labels = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(FolkResidencies, 'findAll', async () => { await labels; return { records: [], hasMore: false }; });
  t.mock.method(Guides, 'findAll', async () => { await labels; return { records: [], hasMore: false }; });
  t.mock.method(Users, 'findAll', async () => ({ records: [member], hasMore: false }));
  t.mock.method(BvGroups, 'findAll', async () => ({ records: [], hasMore: false }));
  t.mock.method(BvGroupMembers, 'findAll', async () => ({ records: [], hasMore: false }));
  t.after(() => { release(); serverCacheInvalidate(); });
  return release;
}

async function completes<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Report reads waited for unrelated display labels')), 2000);
    })]);
  } finally { clearTimeout(timer!); }
}

test('cold Sadhana report reads entries before dropdown labels finish', async t => {
  const release = holdLabels(t);
  t.mock.method(SadhanaEntries, 'findAll', async (query: any) => {
    assert.equal(query.filters.entryDate, '2026-09-07');
    release();
    return { records: [], hasMore: false };
  });
  const result = await completes(detailedReport.execute({ input: { guideId: 'ALL', reportType: 'daily', date: '2026-09-07', segment: 'PW' }, context }));
  assert.deepEqual(result.users.map(user => user.id), [member.id]);
});

test('cold member directory starts scoped history before dropdown labels finish', async t => {
  const release = holdLabels(t);
  t.mock.method(SadhanaEntries, 'findAll', async (query: any) => {
    if (!query.filters.user) return { records: [], hasMore: false };
    assert.deepEqual(query.filters.user.in, [member.id]);
    release();
    return { records: [{ id: 'entry', user: member.id, entryDate: '2026-09-07', scorePercent: 82 }], hasMore: false };
  });
  const result = await completes(guideUsers.execute({ input: { guideId: 'ALL', statusFilter: 'all' }, context }));
  assert.equal(result.users.length, 1);
  assert.equal('latestScore' in result.users[0] && result.users[0].latestScore, 82);
});

test('cold missing-Sadhana report starts entries before guide labels finish', async t => {
  const release = holdLabels(t);
  t.mock.method(SadhanaEntries, 'findAll', async () => {
    release();
    return { records: [{ id: 'entry', user: member.id, entryDate: '2026-09-07', submittedAt: '2026-09-07T12:00:00Z' }], hasMore: false };
  });
  const result = await completes(missingReport.execute({ input: { startDate: '2026-09-07', endDate: '2026-09-07', segment: 'PW' }, context }));
  assert.equal(result.matrix[member.id]['2026-09-07'], 'filled');
  assert.equal(result.stats.completionRate, 100);
});

for (const segment of ['PW', 'FOLK'] as const) {
  test(`${segment} attendance loads while member identities are resolving`, async t => {
    let releaseAttendance!: () => void;
    let releaseQuizzes!: () => void;
    const attendanceStarted = new Promise<void>(resolve => { releaseAttendance = resolve; });
    const quizzesStarted = new Promise<void>(resolve => { releaseQuizzes = resolve; });
    t.after(() => { releaseAttendance(); releaseQuizzes(); });
    const group = { id: 'group-db', groupId: 'GROUP-1', groupName: 'Test Group', segment, isActive: true };
    t.mock.method(BvGroups, 'findAll', async () => ({ records: [group], hasMore: false }));
    t.mock.method(BvGroupMembers, 'findAll', async () => ({
      records: [{ id: 'membership', user: member.userId, groupId: group.groupId }], hasMore: false,
    }));
    t.mock.method(Users, 'findAll', async () => {
      await attendanceStarted;
      if (segment === 'FOLK') await quizzesStarted;
      return { records: [{ ...member, segment }], hasMore: false };
    });
    t.mock.method(BvAttendance, 'findAll', async (query: any) => {
      assert.deepEqual(query.filters.attendanceDate, { gte: '2026-09-07', lte: '2026-09-07' });
      assert.deepEqual((query.filters.group || query.filters.groupId).in, [group.id, group.groupId]);
      releaseAttendance();
      return { records: [{ id: 'attendance', user: member.userId, groupId: group.groupId, attendanceDate: '2026-09-07', present: true }], hasMore: false };
    });
    t.mock.method(BvQuizzes, 'findAll', async () => {
      assert.equal(segment, 'FOLK', 'PW reports must not load FOLK quizzes');
      return { records: [{ id: 'quiz', group: group.id, department: 'FOLK' }], hasMore: false };
    });
    t.mock.method(BvQuizSubmissions, 'findAll', async (query: any) => {
      assert.deepEqual(query.filters.user.in, [member.userId]);
      releaseQuizzes();
      return { records: [{ id: 'submission', user: member.userId, quiz: 'quiz', percentage: 84, submittedAt: '2026-09-07T10:00:00Z' }], hasMore: false };
    });

    const result = await completes(attendanceReport.execute({
      input: { guideId: 'ALL', segment, startDate: '2026-09-07', endDate: '2026-09-07' },
      context: { user: apiUser({ id: 'admin', role: 'SUPER_ADMIN', isBvSuperAdmin: true, segment }) },
    }));
    assert.deepEqual(result.members.map(user => user.userId), [member.id]);
    assert.equal(result.attendance[member.id]['2026-09-07'], true);
    assert.deepEqual(result.sessionDates, ['2026-09-07']);
    assert.deepEqual(result.quizScores, segment === 'FOLK' ? { [member.userId]: { '2026-09-07': 84 } } : {});
  });
}

test('projected legacy guide lookup preserves its stored scope flag', async t => {
  t.mock.method(Guides, 'findOne', async () => undefined);
  t.mock.method(Users, 'findOne', async () => undefined);
  t.mock.method(FolkResidencies, 'findAll', async () => ({ records: [], hasMore: false }));
  t.mock.method(Guides, 'findAll', async (query: any) => {
    assert.ok(query.fields.includes('isSuperAdminScope'));
    return { records: [{ id: 'legacy-guide', email: 'Guide@example.invalid', isSuperAdminScope: true }], hasMore: false };
  });
  const scope = await getGuideScope('guide@example.invalid');
  assert.equal(scope?.guideId, 'legacy-guide');
  assert.equal(scope?.isSuperAdminScope, true);
});
