import assert from 'node:assert/strict';
import test from 'node:test';
import { getUserDashboardPath, getUserDashboardRedirect, getUserDepartment } from '../src/lib/userDashboardRoutes';
import resolveUserLogin from '../src/api/resolveUserLogin';
import { Users } from '../src/lib/app-backend-sdk';

test('explicit department overrides stale flags and legacy accounts resolve consistently', () => {
  assert.equal(getUserDepartment({ segment: ' folk ', isPrabhupadaWorldUser: true }), 'FOLK');
  assert.equal(getUserDepartment({ segment: 'PW', isFolkUser: true }), 'PW');
  assert.equal(getUserDepartment({ isPrabhupadaWorldUser: true }), 'PW');
  assert.equal(getUserDepartment({ isFolkUser: true }), 'FOLK');
  assert.equal(getUserDepartment({ segment: 'Prabhupada World' }), 'PW');
  assert.equal(getUserDepartment({}), 'PW');
});

for (const segment of ['PW', 'FOLK']) {
  const canonical = segment === 'PW' ? '/user/pw-dashboard' : '/user/folk-dashboard';
  const other = segment === 'PW' ? '/user/folk-dashboard' : '/user/pw-dashboard';
  test(`${segment} old and opposite-department links preserve query and selected tab without redirect loops`, () => {
    const profile = { segment };
    assert.equal(getUserDashboardPath(profile), canonical);
    for (const pathname of ['/user/dashboard', other]) {
      const target = getUserDashboardRedirect(profile, { pathname, search: '?date=2026-09-06', hash: '#leaderboard' });
      assert.equal(target, `${canonical}?date=2026-09-06#leaderboard`);
      const location = new URL(target!, 'https://example.invalid');
      assert.equal(getUserDashboardRedirect(profile, location), null);
    }
    assert.equal(getUserDashboardRedirect(profile, { pathname: canonical, search: '', hash: '#sadhana' }), null);
  });

  test(`${segment} login goes directly to its user dashboard`, async t => {
    const member = { id: 'routing-member', userId: 'routing-member', email: 'routing@example.invalid', role: 'User', status: 'Active', segment };
    t.mock.method(Users, 'findOne', async () => member);
    t.mock.method(Users, 'findAll', async () => ({ records: [member] }));
    t.mock.method(Users, 'update', async () => member);
    const result = await resolveUserLogin.execute({ input: {}, context: { user: member } } as never);
    assert.equal(result.route, canonical);
    assert.equal(result.user.segment, segment);
  });

  test(`${segment} staff still land on their management dashboard and have a separate personal destination`, async t => {
    const member = { id: 'routing-staff', userId: 'routing-staff', email: 'routing@example.invalid', role: 'User', status: 'Active', segment, isBvSubFacilitator: true };
    t.mock.method(Users, 'findOne', async () => member);
    t.mock.method(Users, 'findAll', async () => ({ records: [member] }));
    t.mock.method(Users, 'update', async () => member);
    const result = await resolveUserLogin.execute({ input: {}, context: { user: member } } as never);
    assert.equal(result.route, '/rgsf/dashboard');
    assert.equal(getUserDashboardPath(member), canonical);
  });
}
