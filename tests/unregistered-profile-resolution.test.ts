import assert from 'node:assert/strict';
import test from 'node:test';

import getUserProfile from '../src/api/getUserProfile';
import resolveUserLogin from '../src/api/resolveUserLogin';
import updateLastLogin from '../src/api/updateLastLogin';
import { Users } from '../src/lib/app-backend-sdk';

test('an authentication-only Users record remains unregistered', async () => {
  const id = 'AUTH-ONLY-REGRESSION-TEST';
  const email = 'auth-only-regression-test@example.invalid';
  const context = {
    user: {
      id,
      uid: id,
      userId: id,
      email,
      role: 'UNREGISTERED',
      status: null,
    },
  };

  await Users.create({
    record: {
      id,
      email,
      createdAt: new Date().toISOString(),
    },
  });

  try {
    const profile = await getUserProfile.execute({ input: {}, context } as never);
    assert.equal(profile.user, null);

    const login = await resolveUserLogin.execute({ input: {}, context } as never);
    assert.equal(login.action, 'register');

    const lastLogin = await updateLastLogin.execute({ input: {}, context } as never);
    assert.equal(lastLogin.success, false);

    const stored = await Users.findOne({ id });
    assert.equal(stored.userId, undefined);
    assert.equal(stored.status, undefined);
    assert.equal(stored.lastLoginAt, undefined);
  } finally {
    await Users.delete({ id });
  }
});

test('a complete registered profile still resolves and updates last login', async () => {
  const id = 'REGISTERED-PROFILE-REGRESSION-TEST';
  const email = 'registered-profile-regression-test@example.invalid';
  const context = {
    user: {
      id,
      uid: id,
      userId: 'USER-REGRESSION-TEST',
      email,
      role: 'User',
      status: 'Active',
    },
  };

  await Users.create({
    record: {
      id,
      userId: 'USER-REGRESSION-TEST',
      fullName: 'Registered Regression Test',
      email,
      role: 'User',
      status: 'Active',
      segment: 'PW',
      createdAt: new Date().toISOString(),
    },
  });

  try {
    const profile = await getUserProfile.execute({ input: {}, context } as never);
    assert.equal(profile.user?.userId, 'USER-REGRESSION-TEST');
    assert.equal(profile.user?.status, 'ACTIVE');

    const login = await resolveUserLogin.execute({ input: {}, context } as never);
    assert.equal(login.action, 'route');

    const lastLogin = await updateLastLogin.execute({ input: {}, context } as never);
    assert.equal(lastLogin.success, true);

    const stored = await Users.findOne({ id });
    assert.equal(typeof stored.lastLoginAt, 'string');
  } finally {
    await Users.delete({ id });
  }
});
