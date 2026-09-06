import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenBvGroupMemberProfile, getBvGroupMemberProfileBasePath, isBvGroupProfileAdministrator } from '../src/lib/bvGroupMemberProfileNavigation';

test('PW admins and super admins can open a BV group member profile', () => {
  assert.equal(canOpenBvGroupMemberProfile({ role: 'PW_ADMIN' }), true);
  assert.equal(canOpenBvGroupMemberProfile({ role: 'User', isBvAdmin: true }), true);
  assert.equal(canOpenBvGroupMemberProfile({ role: 'User', isBvSuperAdmin: true }), true);
  assert.equal(isBvGroupProfileAdministrator({ role: 'PW Admin' }), true);
});

test('regular BV members cannot open managed profiles and RGSFs retain their route', () => {
  assert.equal(canOpenBvGroupMemberProfile({ role: 'User' }), false);
  assert.equal(getBvGroupMemberProfileBasePath({ isBvSubFacilitator: true }), '/rgsf/users');
  assert.equal(getBvGroupMemberProfileBasePath({ role: 'PW_ADMIN' }), '/guide/users');
});
