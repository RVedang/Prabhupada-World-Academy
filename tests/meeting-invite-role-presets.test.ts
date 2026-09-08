import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMeetingRole } from '../src/components/super/MeetingsAndMomTab';

test('invite role presets use assigned roles when multi-role data exists', () => {
  const user = { roles: ['MEMBER', 'RGF'], isBvSubFacilitator: true };
  assert.equal(hasMeetingRole(user, 'RGF'), true);
  assert.equal(hasMeetingRole(user, 'FACILITATOR'), true);
  assert.equal(hasMeetingRole(user, 'RGSF'), true);
  assert.equal(hasMeetingRole(user, 'SUPERVISOR'), false);
});

test('invite role presets support every assigned role category', () => {
  const users = [
    [{ roles: ['ADMIN'] }, 'ADMIN'],
    [{ roles: ['SUPERVISOR'] }, 'SUPERVISOR'],
    [{ roles: ['SADHANA_MENTOR'] }, 'MENTOR'],
    [{ roles: ['FACILITATOR'] }, 'FACILITATOR'],
    [{ roles: ['FACILITATOR'] }, 'RGF'],
    [{ roles: ['RGF'] }, 'RGF'],
    [{ roles: ['RGSF'] }, 'RGSF'],
  ] as const;
  for (const [user, role] of users) assert.equal(hasMeetingRole(user, role), true);
});

test('role flags remain supported when a multi-role record also has a base role', () => {
  assert.equal(hasMeetingRole({ isBvFacilitator: true }, 'RGF'), true);
  assert.equal(hasMeetingRole({ roles: ['MEMBER'], isBvFacilitator: true }, 'RGF'), true);
  assert.equal(hasMeetingRole({ roles: ['USER'], isBvSubFacilitator: true }, 'RGSF'), true);
});

test('PW users with a User base role remain visible when assigned as an RGF', () => {
  const user = {
    fullName: 'BITS VEDANG',
    role: 'User',
    segment: 'PW',
    isPrabhupadaWorldUser: true,
    isBvsl: true,
    isBvFacilitator: true,
  };

  assert.equal(hasMeetingRole(user, 'RGF'), true);
  assert.equal(hasMeetingRole(user, 'FACILITATOR'), true);
});

test('multi-role values are all matched, including legacy serialized values', () => {
  const user = { role: 'USER', roles: '["USER", "RGF"]', isBvSubFacilitator: true };
  assert.equal(hasMeetingRole(user, 'RGF'), true);
  assert.equal(hasMeetingRole(user, 'RGSF'), true);
});
