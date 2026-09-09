import { apiUser } from './helpers/apiUser';
import assert from 'node:assert/strict';
import test from 'node:test';
import getBvAttendance from '../src/api/getBvAttendance';
import { BvAttendance, BvGroupMembers, Users } from '../src/lib/app-backend-sdk';

for (const hasMembership of [false, true]) {
  test(`profile calendar preserves old and transferred attendance with membership=${hasMembership}`, async t => {
    const user = { id: 'member-doc', userId: 'USER-123', fullName: 'Calendar Member', authUid: 'member-auth' };
    t.mock.method(Users, 'findOne', async () => user);
    t.mock.method(BvGroupMembers, 'findAll', async () => ({ records: hasMembership
      ? [{ id: 'membership-doc', user: user.id, group: 'current-group' }] : [] }));
    t.mock.method(BvAttendance, 'findAll', async (query: any) => {
      assert.ok(query.filters.user?.in, 'history must be queried by the viewed member');
      assert.equal(query.filters.group, undefined, 'former group history must remain visible');
      const rows = [
        { id: 'present', user: user.id, group: 'deleted-group', attendanceDate: '2026-04-17', present: true },
        { id: 'absent', user: [user.authUid], groupId: 'current-group', attendanceDate: '2026-09-05', present: false },
        { id: 'recent', user: user.userId, group: 'former-group', attendanceDate: '2026-09-06', present: true },
        { id: 'peer', user: 'other-member', group: 'current-group', attendanceDate: '2026-09-04', present: true },
        { id: 'sadhana', user: user.id, attendanceDate: '2026-09-03', present: false },
        ...(hasMembership ? [{ id: 'legacy', user: 'membership-doc', group: 'current-group', attendanceDate: '2026-09-07', present: true }] : []),
      ];
      return { records: rows.filter(row => query.filters.user.in.some((owner: unknown) => JSON.stringify(owner) === JSON.stringify(row.user))), hasMore: false };
    });
    const result = await getBvAttendance.execute({
      input: { userId: user.id, historyOnly: true, sinceDate: '1900-01-01' },
      context: { user: apiUser({ id: 'admin', role: 'PW_ADMIN' }) },
    });
    assert.deepEqual(result.userHistory.map((row: any) => [row.attendanceDate, row.status]), [
      ...(hasMembership ? [['2026-09-07', 'P']] : []),
      ['2026-09-06', 'P'], ['2026-09-05', 'A'], ['2026-04-17', 'P'],
    ]);
    assert.deepEqual(result.leaderboard, []);
  });
}

test('profile attendance reports query failures instead of returning an empty calendar', async t => {
  t.mock.method(Users, 'findOne', async () => ({ id: 'member-doc' }));
  t.mock.method(BvGroupMembers, 'findAll', async () => ({ records: [] }));
  t.mock.method(BvAttendance, 'findAll', async () => { throw Error('Attendance temporarily unavailable'); });
  await assert.rejects(getBvAttendance.execute({ input: { userId: 'member-doc', historyOnly: true }, context: { user: apiUser({ id: 'admin' }) } }), /Attendance temporarily unavailable/);
});
