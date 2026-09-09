const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function setup() {
  const auth = { currentUser: { uid: 'AdminA', getIdToken: async () => 'test-token' } };
  const pending = [];
  const modules = new Map();
  const load = file => {
    if (modules.has(file)) return modules.get(file);
    const out = { exports: {} };
    modules.set(file, out.exports);
    const source = fs.readFileSync(`src/lib/${file}.ts`, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', 'fetch', 'process', code)(
      name => name === './app-auth-sdk' ? { auth } : load(name.replace('./', '')),
      out, out.exports, (url, options) => new Promise(resolve => pending.push({ url, input: JSON.parse(options.body), resolve })),
      { env: { NODE_ENV: 'production' } },
    );
    return out.exports;
  };
  const sdk = load('app-endpoints-sdk');
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const reply = (index, value, status = 200) => pending[index].resolve({ ok: status === 200, status, json: async () => value, headers: { get: () => null } });
  return { sdk, auth, pending, flush, reply };
}

test('equivalent filters and concurrent consumers share one read; cached revisit has no network', async () => {
  const { sdk, pending, flush, reply } = setup();
  const a = sdk.queryEndpoint('getGuideDetailedReport', { date: '2026-09-07', guideId: 'ALL', segment: undefined });
  const b = sdk.queryEndpoint('getGuideDetailedReport', { guideId: 'ALL', date: '2026-09-07' });
  await flush();
  assert.equal(pending.length, 1);
  reply(0, { users: [{ name: 'Test' }] });
  const [first, second] = await Promise.all([a, b]);
  first.users[0].name = 'Changed locally';
  assert.equal(second.users[0].name, 'Test');
  assert.deepEqual(await sdk.queryEndpoint('getGuideDetailedReport', { guideId: 'ALL', date: '2026-09-07' }), second);
  assert.equal(pending.length, 1);
});

test('mutations are distinct and invalidate related reads without discarding unrelated in-flight queries', async () => {
  const { sdk, pending, flush, reply } = setup();
  const meeting = sdk.queryEndpoint('getMeetings', { department: 'PW' });
  const sadhana = sdk.queryEndpoint('getGuideDetailedReport', { guideId: 'ALL' });
  await flush();
  sdk.invalidateEndpointClientCacheForChannels(['sadhana']);
  reply(0, { meetings: [] }); reply(1, { users: ['obsolete'] });
  await Promise.all([meeting, sadhana]);
  assert.ok(sdk.isEndpointQueryFresh('getMeetings', { department: 'PW' }));
  assert.equal(sdk.getEndpointCacheSnapshot('getGuideDetailedReport', { guideId: 'ALL' }), undefined);
  const a = sdk.updateMeeting({ meetingId: 'test' });
  const b = sdk.updateMeeting({ meetingId: 'test' });
  await flush();
  assert.equal(pending.length, 4);
  reply(2, { success: true }); reply(3, { success: true });
  await Promise.all([a, b]);
  assert.equal(sdk.getEndpointCacheSnapshot('getMeetings', { department: 'PW' }), undefined);
});

test('identity and role changes isolate caches and prevent old responses repopulating them', async () => {
  const { sdk, auth, pending, flush, reply } = setup();
  const first = sdk.queryEndpoint('getMeetings', { department: 'PW' });
  await flush();
  sdk.setEndpointPermissionScope('guide');
  reply(0, { meetings: ['admin-only'] }); await first;
  assert.equal(sdk.getEndpointCacheSnapshot('getMeetings', { department: 'PW' }), undefined);
  const second = sdk.queryEndpoint('getMeetings', { department: 'PW' });
  await flush(); reply(1, { meetings: ['own'] }); await second;
  auth.currentUser.uid = 'admina';
  assert.equal(sdk.getEndpointCacheSnapshot('getMeetings', { department: 'PW' }), undefined, 'Firebase IDs are case sensitive');
});

test('failed authorization removes cached data; failed reads can be retried', async () => {
  const { sdk, pending, flush, reply } = setup();
  const first = sdk.queryEndpoint('getMeetings', {});
  await flush(); reply(0, { meetings: ['old'] }); await first;
  const refresh = sdk.queryEndpoint('getMeetings', { bypassCache: true });
  await flush(); reply(1, { message: 'Forbidden' }, 403);
  await assert.rejects(refresh, error => error.status === 403);
  assert.equal(sdk.getEndpointCacheSnapshot('getMeetings', {}), undefined);
  const retry = sdk.queryEndpoint('getMeetings', {});
  await flush(); reply(2, { meetings: [] });
  assert.deepEqual(await retry, { meetings: [] });
});
