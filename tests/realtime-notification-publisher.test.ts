import assert from 'node:assert/strict';
import test from 'node:test';

import { publishNotification } from '../src/lib/realtimeNotificationPublisher';
import { REALTIME_IDENTITIES } from '../src/lib/realtimeCollections';

function firestore() {
  const identities = [
    { id: 'auth-a', data: () => ({ userDocumentId: 'user-a', aliases: ['auth-a', 'user-a', 'a@example.invalid'] }) },
    { id: 'auth-b', data: () => ({ userDocumentId: 'user-b', aliases: ['auth-b', 'user-b', 'b@example.invalid'] }) },
    { id: 'auth-folk', data: () => ({ userDocumentId: 'user-folk', aliases: ['user-folk'] }) },
  ];
  const profiles: Record<string, any> = {
    'user-a': { email: 'a@example.invalid', department: 'PW' },
    'user-b': { email: 'b@example.invalid', department: 'PW' },
    'user-folk': { email: 'folk@example.invalid', department: 'FOLK', isFolkUser: true },
  };
  const writes = new Map<string, any>();
  const db = {
    collection(name: string) {
      if (name === REALTIME_IDENTITIES) {
        return {
          where(_field: string, _operator: string, aliases: string[]) {
            return { get: async () => ({ docs: identities.filter(identity => identity.data().aliases.some((alias: string) => aliases.includes(alias))) }) };
          },
          get: async () => ({ docs: identities }),
        };
      }
      if (name === 'Users') {
        return { doc: (id: string) => ({ get: async () => ({ exists: !!profiles[id], data: () => profiles[id] }) }) };
      }
      if (name === 'RealtimeClients') {
        return { doc: (uid: string) => ({ collection: () => ({ doc: (id: string) => ({ set: async (value: any) => writes.set(`${uid}/${id}`, value) }) }) }) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
  return { db, writes };
}

test('targeted PW reminders are written directly to matching realtime inboxes', async () => {
  const { db, writes } = firestore();
  await publishNotification(db, {
    id: 'meeting-occurrence-TEN_MINUTES',
    title: 'Upcoming meeting',
    body: 'Starts soon',
    slot: 'meeting',
    sentAt: Date.now(),
    inviteeIds: ['user-a', 'user-folk'],
    inviteeEmails: ['B@EXAMPLE.INVALID'],
    segment: 'PW',
    url: 'https://meet.example.invalid/room',
  });

  assert.deepEqual([...writes.keys()].sort(), [
    'auth-a/meeting-occurrence-TEN_MINUTES',
    'auth-b/meeting-occurrence-TEN_MINUTES',
  ]);
  assert.equal(writes.get('auth-a/meeting-occurrence-TEN_MINUTES').slot, 'meeting');
  assert.equal(writes.get('auth-a/meeting-occurrence-TEN_MINUTES').url, 'https://meet.example.invalid/room');
});

test('replaying the same notification is idempotent and expired notifications are ignored', async () => {
  const { db, writes } = firestore();
  const broadcast = {
    id: 'meeting-occurrence-ONE_MINUTE', title: 'Upcoming meeting', sentAt: Date.now(),
    inviteeIds: ['user-a'], segment: 'PW',
  };
  await publishNotification(db, broadcast);
  await publishNotification(db, broadcast);
  assert.equal(writes.size, 1);

  await publishNotification(db, { ...broadcast, id: 'expired', sentAt: Date.now() - 6 * 60_000 });
  assert.equal(writes.size, 1);
});
