import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const endpointSource = readFileSync(
  new URL('../src/api/sendPushNotifications.ts', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../src/components/super/SendRemindersPanel.tsx', import.meta.url),
  'utf8',
);

test('instant and scheduled Sadhana sends cannot force delivery to submitted users', () => {
  assert.doesNotMatch(endpointSource, /forceSend/);
  assert.doesNotMatch(panelSource, /forceSend/);
  assert.match(endpointSource, /if \(hasSubmitted\(user\)\) \{ skipped\+\+; return false; \}/);
});

test('long-poll broadcasts are restricted to eligible recipient IDs and emails', () => {
  const filterPosition = endpointSource.indexOf('const toSend = subs.filter');
  const broadcastPosition = endpointSource.indexOf('storeBroadcast(');
  assert.ok(filterPosition >= 0);
  assert.ok(broadcastPosition > filterPosition);
  assert.match(endpointSource, /\[\.\.\.eligibleIds\]/);
  assert.match(endpointSource, /\[\.\.\.eligibleEmails\]/);
});

test('missing Sadhana members receive an in-app broadcast even without native push consent', () => {
  assert.match(endpointSource, /const eligibleRecipients = \(await fetchActiveUsers\(\)\)\.filter/);
  assert.match(endpointSource, /if \(eligibleRecipients\.length > 0\)/);
  assert.doesNotMatch(endpointSource, /if \(subs\.length === 0\) return/);
});
