import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function loadClient(permission = 'denied') {
  const storage = new Map([['auth_user_id', 'member-a']]);
  const timers = [];
  const toasts = [];
  const exports = {};
  const config = { enabled: true, times: ['21:20'], frequency: 'daily', title: 'Reminder', body: 'Submit Sadhana' };
  const configRequests = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-09-06T15:49:00Z'])); }
    static now() { return new Date('2026-09-06T15:49:00Z').getTime(); }
  }
  const notification = { permission, requestPermission: async () => permission };
  const context = vm.createContext({
    exports, console, Date: Clock,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: {}, navigator: {}, document: { visibilityState: 'visible' },
    Notification: permission === 'unsupported' ? undefined : notification,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: () => {},
    require: name => {
      if (name === 'react') return { createElement: (...args) => args };
      if (name === 'sonner') return { toast: value => toasts.push(value) };
      if (name === '@/lib/endpoints-sdk') return {
        getPwNotificationConfig: async input => { configRequests.push(input); return config; },
      };
      throw Error(`Unexpected import ${name}`);
    },
  });
  const source = readFileSync(new URL('../src/utils/sadhanaNotification.ts', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { api: exports, storage, timers, toasts, configRequests };
}

test('denied and unsupported native permission never become simulated permission', async () => {
  for (const permission of ['denied', 'unsupported']) {
    const { api, storage } = loadClient(permission);
    storage.set('notifications_simulated_granted', 'true');
    assert.equal(api.getNotificationPermission(), permission);
    assert.equal(await api.requestNotificationPermission(), permission);
    assert.equal(storage.has('notifications_simulated_granted'), false);
  }
});

test('foreground missing-Sadhana reminder works without native permission or a subscription', async () => {
  const { api, timers, toasts } = loadClient('denied');
  await api.scheduleSadhanaReminder(false, 'PW');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 60_000);
  await timers[0].callback();
  assert.equal(toasts.length, 1);
});

test('FOLK users load the FOLK notification schedule', async () => {
  const { api, configRequests } = loadClient('denied');
  await api.scheduleSadhanaReminder(false, 'FOLK');
  assert.equal(configRequests[0]?.segment, 'FOLK');
});

test('another user submitting on the same browser does not suppress this user reminders', () => {
  const { api, storage } = loadClient();
  api.markSubmittedToday();
  assert.equal(api.hasSubmittedToday(), true);
  storage.set('auth_user_id', 'member-b');
  assert.equal(api.hasSubmittedToday(), false);
});
