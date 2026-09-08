import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMeetingRole } from '../src/components/super/MeetingsAndMomTab';

test('invite role presets use assigned roles when multi-role data exists', () => {
  const user = { roles: ['MEMBER', 'RGF'], isBvSubFacilitator: true };
  assert.equal(hasMeetingRole(user, 'RGF'), true);
  assert.equal(hasMeetingRole(user, 'FACILITATOR'), true);
  assert.equal(hasMeetingRole(user, 'RGSF'), false);
  assert.equal(hasMeetingRole(user, 'SUPERVISOR'), false);
});

test('invite role presets support every assigned role category', () => {
  const users = [
    [{ roles: ['ADMIN'] }, 'ADMIN'],
    [{ roles: ['SUPERVISOR'] }, 'SUPERVISOR'],
    [{ roles: ['SADHANA_MENTOR'] }, 'MENTOR'],
    [{ roles: ['FACILITATOR'] }, 'FACILITATOR'],
    [{ roles: ['RGF'] }, 'RGF'],
    [{ roles: ['RGSF'] }, 'RGSF'],
  ] as const;
  for (const [user, role] of users) assert.equal(hasMeetingRole(user, role), true);
});

test('legacy flags remain supported only when no roles array is present', () => {
  assert.equal(hasMeetingRole({ isBvFacilitator: true }, 'RGF'), true);
  assert.equal(hasMeetingRole({ roles: ['MEMBER'], isBvFacilitator: true }, 'RGF'), false);
});
