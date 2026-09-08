import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import sendDueMeetingReminders from '../src/api/sendDueMeetingReminders';
import sendMeetingReminder, { encryptPayload } from '../src/api/sendMeetingReminder';
import { Meetings, PushSubscriptions } from '../src/lib/app-backend-sdk';

test('meeting Web Push payload uses browser-compatible RFC 8291 encryption', async () => {
  const receiver = createECDH('prime256v1');
  const receiverPublic = receiver.generateKeys();
  const auth = randomBytes(16);
  const message = JSON.stringify({ title: 'Meeting soon', body: 'Click to join.' });
  const encrypted = await encryptPayload(receiverPublic.toString('base64url'), auth.toString('base64url'), message);
  const wire = Buffer.from(encrypted.body);
  const serverPublic = wire.subarray(21, 86);
  const shared = receiver.computeSecret(serverPublic);
  const ikm = hkdfSync('sha256', shared, auth, Buffer.concat([
    Buffer.from('WebPush: info\0'), receiverPublic, serverPublic,
  ]), 32);
  const salt = wire.subarray(0, 16);
  const key = hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const decipher = createDecipheriv('aes-128-gcm', Buffer.from(key), Buffer.from(nonce));
  decipher.setAuthTag(wire.subarray(-16));
  const clear = Buffer.concat([decipher.update(wire.subarray(86, -16)), decipher.final()]);
  assert.equal(clear.at(-1), 2);
  assert.equal(clear.subarray(0, -1).toString(), message);
});

test('meeting reminder publishes to every invitee and remains directly joinable', async t => {
  let savedUpdate: any;
  let broadcast: any;
  const previousPrivateKey = process.env.APP_VAPID_PRIVATE_KEY;
  const previousPublicKey = process.env.APP_VAPID_PUBLIC_KEY;
  process.env.APP_VAPID_PRIVATE_KEY = 'invalid-test-private-key';
  process.env.APP_VAPID_PUBLIC_KEY = 'invalid-test-public-key';
  t.mock.method(Meetings, 'findOne', async () => ({
    id: 'meeting-reminder-test',
    title: 'Facilitators Meeting',
    scheduledAt: '2026-09-09T10:00:00+05:30',
    locationOrLink: 'https://meet.google.com/example',
    inviteeUserIds: ['invitee-db-id'],
    invitees: [{ userId: 'invitee-db-id', email: 'invitee@example.invalid' }],
  }));
  t.mock.method(PushSubscriptions, 'findAll', async () => ({
    // The stored user key is intentionally different: the denormalized email
    // must still associate this subscribed device with the invitee.
    records: [{
      user: 'legacy-auth-id', email: 'invitee@example.invalid',
      endpoint: 'https://push.example.invalid/device', p256DhKey: 'invalid', authKey: 'invalid',
    }],
    hasMore: false,
  }));
  t.mock.method(fs, 'writeFileSync', (_file: any, body: any) => {
    broadcast = JSON.parse(String(body));
  });
  t.mock.method(Meetings, 'update', async ({ record }: any) => {
    savedUpdate = record;
    return { id: 'meeting-reminder-test' };
  });

  try {
    const result = await sendMeetingReminder.execute({
      input: { meetingId: 'meeting-reminder-test', reminderType: 'TEN_MINUTES' },
      context: { user: { isActive: true, capabilities: ['meetings.manage'] } },
    } as never);

    assert.equal(result.inAppRecipients, 1);
    assert.equal(result.skipped, 0, 'the subscribed device should match by invitee email');
    assert.equal(result.failed, 1, 'the intentionally invalid test keys fail only after subscription matching');
    assert.equal(broadcast.url, 'https://meet.google.com/example');
    assert.deepEqual(broadcast.inviteeIds, ['invitee-db-id']);
    assert.deepEqual(broadcast.inviteeEmails, ['invitee@example.invalid']);
    assert.equal(savedUpdate.notification10mSent, true);
    assert.equal(savedUpdate.notificationSent, true);
  } finally {
    if (previousPrivateKey === undefined) delete process.env.APP_VAPID_PRIVATE_KEY;
    else process.env.APP_VAPID_PRIVATE_KEY = previousPrivateKey;
    if (previousPublicKey === undefined) delete process.env.APP_VAPID_PUBLIC_KEY;
    else process.env.APP_VAPID_PUBLIC_KEY = previousPublicKey;
  }
});

test('server scheduler dispatches both 10-minute and 1-minute reminder windows', async t => {
  const previousSecret = process.env.APP_CRON_SECRET;
  process.env.APP_CRON_SECRET = 'meeting-reminder-test-secret';
  const now = Date.now();
  const calls: string[] = [];

  t.mock.method(Meetings, 'findAll', async () => ({
    records: [
      {
        id: 'meeting-due-in-ten', status: 'SCHEDULED',
        scheduledAt: new Date(now + 10 * 60_000).toISOString(),
        notification10mSent: false, notification1mSent: false,
      },
      {
        id: 'meeting-due-in-one', status: 'SCHEDULED',
        scheduledAt: new Date(now + 60_000).toISOString(),
        notification10mSent: true, notification1mSent: false,
      },
      {
        id: 'folk-meeting-due-in-one', status: 'SCHEDULED', segment: 'FOLK',
        scheduledAt: new Date(now + 60_000).toISOString(),
        notification10mSent: true, notification1mSent: false,
      },
    ],
    hasMore: false,
  }));
  t.mock.method(sendMeetingReminder, 'execute', async ({ input }: any) => {
    calls.push(`${input.meetingId}:${input.reminderType}`);
    return { success: true } as any;
  });

  try {
    const result = await sendDueMeetingReminders.execute({
      input: { cronSecret: 'meeting-reminder-test-secret' }, context: {},
    } as never);
    assert.deepEqual(calls.sort(), [
      'meeting-due-in-one:ONE_MINUTE',
      'meeting-due-in-ten:TEN_MINUTES',
    ]);
    assert.equal(result.tenMinuteReminders, 1);
    assert.equal(result.oneMinuteReminders, 1);
    assert.equal(result.failed, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.APP_CRON_SECRET;
    else process.env.APP_CRON_SECRET = previousSecret;
  }
});
