import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { initializeApp as initializeClient, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, getDoc, getDocs, collectionGroup, setDoc, onSnapshot, disableNetwork, enableNetwork, terminate } from 'firebase/firestore';

test('real authenticated sessions: scoped revisions, private rules, ordering and offline recovery', { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 60_000 }, async () => {
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'demo-pwa-realtime', 'Never run this fixture against production');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const { getAuth: getAdminAuth } = await import('firebase-admin/auth');
  const { getFirestoreDb, SadhanaEntries } = await import('../src/lib/app-backend-sdk');
  const { withRequestQueries } = await import('../src/lib/requestQueries');
  const { registerRealtimeQuery } = await import('../src/lib/realtimeQueryRegistration');
  const { buildApiUserContext } = await import('../src/lib/apiAuthorization');
  const { publishQueryChange } = await import('../functions/src/publishQueryChange');
  const { publishNotification } = await import('../functions/src/publishNotification');
  const { registerRealtimeIdentity } = await import('../src/lib/realtimeIdentityRegistration');
  const { firestoreVersion } = await import('../src/lib/realtimeQueryModel');
  const db = getFirestoreDb();
  const suffix = `${Date.now()}`;
  const apps: ReturnType<typeof initializeClient>[] = [];
  const listeners: (() => void)[] = [];
  const clients: ReturnType<typeof getFirestore>[] = [];
  try {
    const fixtures = await Promise.all(['a', 'b'].map(async letter => {
      const uid = `realtime-${letter}-${suffix}`;
      const email = `${uid}@example.invalid`;
      await getAdminAuth().createUser({ uid, email, emailVerified: true, password: 'Emulator-only-123!' });
      await db.collection('Users').doc(uid).set({ userId: uid, email, role: 'ADMIN', status: 'Active', segment: 'PW' });
      const app = initializeClient({ projectId: 'demo-pwa-realtime', apiKey: 'demo-key', authDomain: 'localhost' }, uid);
      apps.push(app);
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      await signInWithEmailAndPassword(auth, email, 'Emulator-only-123!');
      const client = getFirestore(app);
      connectFirestoreEmulator(client, '127.0.0.1', 8080);
      clients.push(client);
      const member = `member-${letter}-${suffix}`;
      const input = { user: member, startDate: '2026-09-01', endDate: '2026-09-09' };
      const result = await withRequestQueries(() => SadhanaEntries.findAll({ filters: { user: member, date: { gte: input.startDate, lte: input.endDate } }, fields: ['user', 'date', 'rounds'] }), true);
      const context = buildApiUserContext({ uid, email, emailVerified: true }, { id: uid, userId: uid, email, role: 'ADMIN', status: 'Active', segment: 'PW' });
      const registration = await registerRealtimeQuery(context, 'emulatorSadhanaReport', input, result.dependencies, result.readVersion);
      assert.ok(registration);
      await registerRealtimeIdentity(context, { segment: 'PW' });
      return { uid, member, client, registration: registration!, result, context, input };
    }));
    const [a, b] = fixtures;
    const aRef = doc(a.client, 'RealtimeClients', a.uid, 'queries', a.registration.token);
    const bRef = doc(b.client, 'RealtimeClients', b.uid, 'queries', b.registration.token);
    let bChanges = 0;
    let aVersion = '';
    let nextA: ((version: string) => void) | undefined;
    const waitA = (minimum: string) => new Promise<string>((resolve, reject) => {
      if (aVersion >= minimum) return resolve(aVersion);
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for a revision event')), 10_000);
      nextA = version => { if (version >= minimum) { clearTimeout(timeout); nextA = undefined; resolve(version); } };
    });
    listeners.push(onSnapshot(aRef, snapshot => { aVersion = snapshot.data()?.version || ''; nextA?.(aVersion); }));
    const baselineB = await new Promise<void>((resolve, reject) => {
      let first = true;
      listeners.push(onSnapshot(bRef, snapshot => { if (!snapshot.metadata.fromCache) { if (first) { first = false; resolve(); } else bChanges++; } }, reject));
    });
    void baselineB;
    await waitA(a.registration.version);
    await assert.rejects(getDoc(doc(a.client, 'RealtimeClients', b.uid, 'queries', b.registration.token)), /permission|permissions/i);
    await assert.rejects(setDoc(aRef, { version: '999' }), /permission|permissions/i);
    await assert.rejects(getDoc(doc(a.client, 'Users', b.uid)), /permission|permissions/i);
    await assert.rejects(getDoc(doc(a.client, 'RealtimeInternal', 'registry', 'realtimeSubscriptions', a.registration.token)), /permission|permissions/i);
    await assert.rejects(getDocs(collectionGroup(a.client, 'queries')), /permission|permissions/i);
    await assert.rejects(getDocs(collectionGroup(a.client, 'notifications')), /permission|permissions/i);
    const anonymousApp = initializeClient({ projectId: 'demo-pwa-realtime', apiKey: 'demo-key' }, `anonymous-${suffix}`);
    apps.push(anonymousApp);
    const anonymous = getFirestore(anonymousApp);
    clients.push(anonymous);
    connectFirestoreEmulator(anonymous, '127.0.0.1', 8080);
    await assert.rejects(getDoc(doc(anonymous, 'RealtimeClients', a.uid, 'queries', a.registration.token)), /permission|permissions/i);
    await assert.rejects(getDoc(doc(anonymous, 'RealtimeClients', a.uid, 'notifications', 'guessed')), /permission|permissions/i);

    const entry = db.collection('SadhanaEntries').doc(`entry-${suffix}`);
    const value = { user: a.member, date: '2026-09-09', rounds: 16 };
    const committed = await entry.set(value);
    const version = firestoreVersion(committed.writeTime);
    // A second tab of the same user has already read the write. The first
    // tab must still receive its revision, not be suppressed by that read.
    const tabTwoRead = await withRequestQueries(() => SadhanaEntries.findAll({ filters: { user: a.member, date: { gte: '2026-09-01', lte: '2026-09-09' } }, fields: ['user', 'date', 'rounds'] }), true);
    await registerRealtimeQuery(a.context, 'emulatorSadhanaReport', a.input, tabTwoRead.dependencies, tabTwoRead.readVersion);
    const started = performance.now();
    const metrics = await publishQueryChange(db, { table: 'SadhanaEntries', id: entry.id, after: value, version });
    await waitA(version);
    const propagationMs = performance.now() - started;
    assert.equal(metrics.affected, 1);
    assert.equal(bChanges, 0);

    await publishNotification(db, { id: `message-${suffix}`, title: 'Meeting invite', body: 'Join now', url: 'https://meet.google.com/example', slot: 'meeting', sentAt: Date.now(), segment: 'PW', inviteeIds: [a.uid] });
    const message = await getDoc(doc(a.client, 'RealtimeClients', a.uid, 'notifications', `message-${suffix}`));
    assert.equal(message.data()?.title, 'Meeting invite');
    assert.equal(message.data()?.inviteeIds, undefined);
    assert.equal((await getDoc(doc(b.client, 'RealtimeClients', b.uid, 'notifications', `message-${suffix}`))).exists(), false);
    await assert.rejects(getDoc(doc(b.client, 'RealtimeClients', a.uid, 'notifications', `message-${suffix}`)), /permission|permissions/i);
    console.log(JSON.stringify({ measurement: 'emulator-publish-to-authenticated-listener', milliseconds: propagationMs, ...metrics, signalBytes: Buffer.byteLength(JSON.stringify({ version })) }));

    await disableNetwork(a.client);
    const updated = { ...value, rounds: 12 };
    const secondCommit = await entry.set(updated);
    const nextVersion = firestoreVersion(secondCommit.writeTime);
    await publishQueryChange(db, { table: 'SadhanaEntries', id: entry.id, before: value, after: updated, version: nextVersion });
    await enableNetwork(a.client);
    await waitA(nextVersion);
    await publishQueryChange(db, { table: 'SadhanaEntries', id: entry.id, after: value, version });
    await publishQueryChange(db, { table: 'SadhanaEntries', id: entry.id, before: value, after: updated, version: nextVersion });
    assert.equal((await getDoc(aRef)).data()?.version, nextVersion);
    assert.equal(bChanges, 0);
  } finally {
    listeners.forEach(stop => stop());
    await Promise.all(clients.map(terminate));
    await Promise.all(apps.map(deleteApp));
    await db.terminate();
  }
});
