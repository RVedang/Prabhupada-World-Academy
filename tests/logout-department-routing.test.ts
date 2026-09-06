import assert from 'node:assert/strict';
import test from 'node:test';
import { getDepartmentLandingPath, getUserDepartment } from '../src/lib/userDashboardRoutes';

test('logout destinations follow the user department', () => {
  assert.equal(getUserDepartment({ segment: 'FOLK' }), 'FOLK');
  assert.equal(getDepartmentLandingPath({ segment: 'FOLK' }), '/');
  assert.equal(getUserDepartment({ segment: 'Prabhupada World' }), 'PW');
  assert.equal(getDepartmentLandingPath({ segment: 'Prabhupada World' }), '/pw');
  assert.equal(getDepartmentLandingPath({ isPrabhupadaWorldUser: true }), '/pw');
});
