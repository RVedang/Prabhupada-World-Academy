import assert from 'node:assert/strict';
import test from 'node:test';
import getBvAttendance from '../src/api/getBvAttendance';
import { BvAttendance, BvGroupMembers, BvGroups, FolkResidencies, Users } from '../src/lib/app-backend-sdk';

for (const lookup of ['userId', 'authUid', 'email']) {
  test(`admin profile attendance resolves ${lookup} and legacy membership references`, async t => {
    const member = { id: 'member-doc', userId: 'USER-123', authUid: 'member-auth', email: 'member@example.invalid', fullName: 'Member' };
    const peer = { id: 'peer-doc', userId: 'USER-456', fullName: 'Peer' };
    const memberships = [
      { id: 'membership-doc', user: member.id, userId: member.userId, group: 'group-doc' },
      { id: 'peer-membership', user: peer.id, userId: peer.userId, group: 'group-doc' },
    ];
    const matches = (row: any, filters: any = {}) => Object.entries(filters).every(([key, value]: any) =>
      value && typeof value === 'object' ? value.in.includes(row[key]) : row[key] === value);
    t.mock.method(Users, 'findOne', async (query: any) => [member, peer].find(row => matches(row, query.id ? { id: query.id } : query.filters)) || null);
    t.mock.method(Users, 'findAll', async (query: any) => ({ records: [member, peer].filter(row => matches(row, query.filters)) }));
    t.mock.method(BvGroupMembers, 'findAll', async (query: any) => ({ records: memberships.filter(row => matches(row, query.filters)) }));
    t.mock.method(BvGroups, 'findOne', async () => ({ id: 'group-doc' }));
    t.mock.method(FolkResidencies, 'findAll', async () => ({ records: [] }));
    t.mock.method(BvAttendance, 'findAll', async (query: any) => ({ records: [
      { id: 'present', group: 'group-doc', user: 'membership-doc', attendanceDate: '2026-09-06', present: true },
      { id: 'duplicate', group: 'group-doc', user: member.id, attendanceDate: '2026-09-06', present: false },
      { id: 'absent', group: 'group-doc', user: member.id, attendanceDate: '2026-09-05', present: false },
      { id: 'peer', group: 'group-doc', user: 'peer-membership', attendanceDate: '2026-09-05', present: true },
      { id: 'outside', group: 'outside-group', user: member.id, attendanceDate: '2026-09-04', present: true },
    ].filter(row => matches(row, query.filters)) }));

    const result = await getBvAttendance.execute({
      input: { userId: member[lookup as keyof typeof member], sinceDate: '2026-09-01' },
      context: { user: { id: 'admin-doc', role: 'PW_ADMIN', email: 'admin@example.invalid' } },
    });
    assert.deepEqual(result.userHistory.map((row: any) => [row.attendanceDate, row.status]), [
      ['2026-09-06', 'P'], ['2026-09-05', 'A'],
    ]);
    assert.deepEqual(result.leaderboard.map((row: any) => row.userId).sort(), [member.userId, peer.userId].sort());
    assert.equal(result.leaderboard.find((row: any) => row.userId === peer.userId)?.presentCount, 1);
  });
}
