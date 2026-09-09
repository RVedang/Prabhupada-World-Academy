import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function loadBroadcastStore(documents) {
  const exports = {};
  const db = {
    batch: () => {
      const writes = [];
      return {
        set: (ref, value) => writes.push([ref, value]),
        commit: async () => { for (const [ref, value] of writes) documents.set(ref, value); },
      };
    },
    collection: collection => {
      const query = {
        doc: id => `${collection}/${id}`,
        where: () => query, orderBy: () => query, limit: () => query,
        get: async () => ({ docs: [...documents].filter(([key]) => key.startsWith(`${collection}/`)).map(([, data]) => ({data: () => data})) }),
      };
      return query;
    },
  };
  const context = vm.createContext({
    exports, console, Date,
    require: name => {
      if (name === 'fs') return { writeFileSync: () => {} };
      if (name === 'path') return path;
      if (name === './app-backend-sdk') return { getFirestoreDb: () => db };
      throw Error(`Unexpected import ${name}`);
    },
  });
  const source = readFileSync(new URL('../src/lib/notificationBroadcast.ts', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, context);
  return exports;
}

test('simultaneous PW and FOLK broadcasts survive across server instances and can be consumed in order', async () => {
  const documents = new Map();
  const firstServer = loadBroadcastStore(documents);
  const secondServer = loadBroadcastStore(documents);
  await Promise.all([
    firstServer.storeBroadcast('PW', 'Submit', 'night-1', undefined, 'pw', ['pw-user'], '/sadhana', [], 'PW'),
    secondServer.storeBroadcast('FOLK', 'Submit', 'night-1', undefined, 'folk', ['folk-user'], '/sadhana', [], 'FOLK'),
  ]);
  const reader = loadBroadcastStore(documents);
  const messages = await reader.getRecentBroadcasts();
  assert.deepEqual(Array.from(messages, item => item.id).sort(), ['folk', 'pw']);
  assert.equal(reader.broadcastsAfter(messages, messages[0].id)[0].id, messages[1].id);
  assert.equal(reader.broadcastsAfter(messages, messages[1].id).length, 0);
});

test('long polling finds the recipient message even when another department sends afterward', async () => {
  const messages = [
    { id: 'baseline', sentAt: 1 },
    { id: 'folk', title: 'FOLK', inviteeIds: ['folk-user'], segment: 'FOLK', sentAt: 2 },
    { id: 'pw', title: 'PW', inviteeIds: ['pw-user'], segment: 'PW', sentAt: 3 },
  ];
  const store = loadBroadcastStore(new Map());
  const exports = {};
  const context = vm.createContext({
    exports, console, URL, Date, setTimeout,
    require: name => {
      if (name === 'next/server') return { NextResponse: {json: value => value} };
      if (name === '@/lib/notificationBroadcast') return {...store, getRecentBroadcasts: async () => messages};
      if (name === '@/lib/backend-sdk') return {};
      if (name === '@/lib/notificationDepartment') return {};
      throw Error(`Unexpected import ${name}`);
    },
  });
  const source = readFileSync(new URL('../src/app/api/push-events/route.ts', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, context);
  const response = await exports.GET({ url: 'https://example.invalid/api/push-events?lastId=baseline&userId=folk-user' });
  assert.equal(response.type, 'PUSH_RECEIVED');
  assert.equal(response.id, 'folk');
  assert.equal(response.inviteeIds, undefined);
  const heartbeat = await exports.GET({ url: 'https://example.invalid/api/push-events?lastId=folk&userId=folk-user' });
  assert.equal(heartbeat.type, 'HEARTBEAT');
  assert.equal(heartbeat.id, 'pw');
});
