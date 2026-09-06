import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadAuthorizationModule() {
  const filename = new URL('../src/lib/apiAuthorization.ts', import.meta.url);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', compiled)(module, module.exports);
  return module.exports;
}

const { buildApiUserContext, hasApiCapabilities } = loadAuthorizationModule();
const identity = { uid: 'auth-user', email: 'admin@example.invalid', emailVerified: true };

const integrationEndpoints = [
  'bulkTagMangoEnroll',
  'getTagMangoConfig',
  'getTagMangoSyncLog',
  'registerTagMangoWebhook',
  'saveTagMangoConfig',
  'testTagMangoConnection',
];
const attendanceEndpoints = [
  'getJigyasaTracker',
  'processJigyasaAttendance',
  'processJigyasaRegistration',
];

test('TagMango and Jigyasa endpoints declare the administrator capabilities', () => {
  for (const endpoint of integrationEndpoints) {
    const source = readFileSync(new URL(`../src/api/${endpoint}.ts`, import.meta.url), 'utf8');
    assert.match(source, /requiredCapabilities:\s*['"]integrations\.manage['"]/);
  }
  for (const endpoint of attendanceEndpoints) {
    const source = readFileSync(new URL(`../src/api/${endpoint}.ts`, import.meta.url), 'utf8');
    assert.match(source, /requiredCapabilities:\s*['"]attendance\.manage['"]/);
  }
});

for (const role of ['ADMIN', 'Admin', 'SUPER_ADMIN', 'Super Admin', 'Super Guide']) {
  test(`${role} can open both TagMango and Jigyasa tabs`, () => {
    const user = buildApiUserContext(identity, { id: role, userId: role, status: 'Active', role });
    assert.equal(hasApiCapabilities(user, 'integrations.manage'), true);
    assert.equal(hasApiCapabilities(user, 'attendance.manage'), true);
  });
}

test('a flag-based PW Admin receives the capabilities exposed by its dashboard', () => {
  const user = buildApiUserContext(identity, {
    id: 'flag-admin',
    userId: 'flag-admin',
    status: 'Active',
    role: 'User',
    segment: 'PW',
    isBvAdmin: true,
  });
  assert.equal(user.isBvAdmin, true);
  assert.equal(hasApiCapabilities(user, 'integrations.manage'), true);
  assert.equal(hasApiCapabilities(user, 'attendance.manage'), true);
});

test('regular members cannot administer TagMango or Jigyasa', () => {
  const user = buildApiUserContext(identity, {
    id: 'member',
    userId: 'member',
    status: 'Active',
    role: 'User',
  });
  assert.equal(hasApiCapabilities(user, 'integrations.manage'), false);
  assert.equal(hasApiCapabilities(user, 'attendance.manage'), false);
});
