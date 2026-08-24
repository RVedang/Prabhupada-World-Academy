import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => readFileSync(path.join(root, relativePath), 'utf8');

test('Firestore rejects every untrusted client operation', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /return false\s*(?:&&|;)/);
  assert.doesNotMatch(rules, /allow\s+(read|write)[^;]*request\.auth\s*!=\s*null/);
  assert.doesNotMatch(rules, /allow\s+(read|write)[^;]*if\s+true/);
});

test('every API endpoint explicitly declares its authentication boundary', () => {
  const apiDirectory = path.join(root, 'src/api');
  const missing = readdirSync(apiDirectory)
    .filter(file => file.endsWith('.ts'))
    .filter(file => read(`src/api/${file}`).includes('createEndpoint({'))
    .filter(file => {
      const source = read(`src/api/${file}`);
      return !/\b(public:\s*true|authenticated:\s*true)\b/.test(source);
    });

  assert.deepEqual(missing, []);
});

test('client public endpoint allowlist matches server declarations', () => {
  const apiDirectory = path.join(root, 'src/api');
  const serverPublic = readdirSync(apiDirectory)
    .filter(file => file.endsWith('.ts'))
    .filter(file => /\bpublic:\s*true\b/.test(read(`src/api/${file}`)))
    .map(file => file.replace(/\.ts$/, ''))
    .sort();

  const sdk = read('src/lib/app-endpoints-sdk.ts');
  const allowlistBlock = sdk.match(/PUBLIC_ENDPOINTS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
  const clientPublic = [...allowlistBlock.matchAll(/'([^']+)'/g)].map(match => match[1]).sort();

  assert.deepEqual(clientPublic, serverPublic);
});

test('TagMango webhooks require the server-side webhook secret', () => {
  for (const endpoint of ['tagMangoWebhook', 'courseCompleted10', 'courseCompleted50', 'courseCompleted100']) {
    const source = read(`src/api/${endpoint}.ts`);
    assert.match(source, /publicSecretEnv:\s*'APP_TAGMANGO_WEBHOOK_SECRET'/);
    assert.match(source, /Payload is too large/);
  }
});

test('API authority is not inferred from email text and secrets have no client fallback', () => {
  const route = read('src/app/api/run/[endpoint]/route.ts');
  const push = read('src/api/sendPushNotifications.ts');
  const meetingPush = read('src/api/sendMeetingReminder.ts');
  const panel = read('src/components/super/SendRemindersPanel.tsx');

  assert.doesNotMatch(route, /email.*includes\(['"](?:admin|superadmin|gaurmandal)/i);
  assert.match(route, /endpointConfig\.public === true/);
  assert.match(route, /hasApiCapabilities/);
  assert.doesNotMatch(push, /NEXT_PUBLIC_CRON_SECRET|app_cron_secret/);
  assert.doesNotMatch(meetingPush, /vkYwOKyr1RhRONW/);
  assert.doesNotMatch(panel, /NEXT_PUBLIC_CRON_SECRET|app_cron_secret/);
});
