import assert from 'node:assert/strict';
import test from 'node:test';

import { filterBvAdminFacilitators } from '../src/lib/bvAdminFacilitatorScope';

const adminA = {
  id: 'ADMIN-A-DB', userId: 'ADMIN-A', email: 'admin-a@example.test',
  status: 'Active', segment: 'PW', role: 'ADMIN', isBvAdmin: true,
};
const adminB = {
  id: 'ADMIN-B-DB', userId: 'ADMIN-B', email: 'admin-b@example.test',
  status: 'Active', segment: 'PW', role: 'ADMIN', isBvAdmin: true,
};
const supervisorA = {
  id: 'SUPERVISOR-A-DB', userId: 'SUPERVISOR-A', status: 'Active', segment: 'PW',
  role: 'Guide', isBvSupervisor: true, bvReportingAdminId: adminA.userId,
};
const rgfA = {
  id: 'RGF-A-DB', userId: 'RGF-A', fullName: 'Admin A RGF', status: 'Active', segment: 'PW',
  role: 'BVSL', isBvFacilitator: true, bvReportingSupervisorId: supervisorA.id,
};
const rgsfA = {
  id: 'RGSF-A-DB', userId: 'RGSF-A', fullName: 'Admin A RGSF', status: 'Active', segment: 'PW',
  role: 'User', isBvSubFacilitator: true, bvReportingFacilitatorId: rgfA.userId,
};
const rgfB = {
  id: 'RGF-B-DB', userId: 'RGF-B', fullName: 'Admin B RGF', status: 'Active', segment: 'PW',
  role: 'RGF', isBvsl: true, guide: adminB.id,
};
const memberA = {
  id: 'MEMBER-A-DB', userId: 'MEMBER-A', fullName: 'Ordinary Member', status: 'Active',
  segment: 'PW', role: 'User', guide: adminA.id,
};

const users = [adminA, adminB, supervisorA, rgfA, rgsfA, rgfB, memberA];

test('PW Admin facilitator Sadhana scope contains only RGF/RGSF descendants of that Admin', () => {
  const result = filterBvAdminFacilitators(users, adminA, adminB.userId, 'PW');
  assert.deepEqual(result.map(user => user.id).sort(), [rgfA.id, rgsfA.id].sort());
});

test('PW Super Admin can view all facilitators or select one Admin', () => {
  const superAdmin = {
    id: 'SUPER-ADMIN-DB', userId: 'SUPER-ADMIN', status: 'Active', segment: 'PW',
    role: 'SUPER_ADMIN', isBvSuperAdmin: true,
  };
  const all = filterBvAdminFacilitators([...users, superAdmin], superAdmin, 'ALL', 'PW');
  assert.deepEqual(all.map(user => user.id).sort(), [rgfA.id, rgsfA.id, rgfB.id].sort());

  const selected = filterBvAdminFacilitators([...users, superAdmin], superAdmin, adminB.userId, 'PW');
  assert.deepEqual(selected.map(user => user.id), [rgfB.id]);
});
