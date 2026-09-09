import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, onSnapshot, terminate } from 'firebase/firestore';
import { NextRequest } from 'next/server';

test('native Sadhana revisions and authorized report results across five roles', {
  skip: process.env.REALTIME_NATIVE_TRIGGER !== '1', timeout: 120_000,
}, async () => {
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'demo-pwa-realtime');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  const { getFirestoreDb } = await import('../src/lib/app-backend-sdk');
  const { getAuth: adminAuth } = await import('firebase-admin/auth');
  const { POST } = await import('../src/app/api/run/[endpoint]/route');
  const db = getFirestoreDb();
  const suffix = Date.now();
  const apps: ReturnType<typeof initializeApp>[] = [];
  const clients: ReturnType<typeof getFirestore>[] = [];
  const listeners: (() => void)[] = [];
  const definitions = [
    { name: 'member', role: 'USER', segment: 'FOLK' },
    { name: 'guide', role: 'GUIDE', segment: 'FOLK' },
    { name: 'super-guide', role: 'SUPER_GUIDE', segment: 'FOLK' },
    { name: 'admin', role: 'ADMIN', segment: 'PW' },
    { name: 'super-admin', role: 'SUPER_ADMIN', segment: 'PW' },
    { name: 'pw-member', role: 'USER', segment: 'PW' },
    { name: 'unrelated-guide', role: 'GUIDE', segment: 'FOLK' },
    { name: 'unrelated-member', role: 'USER', segment: 'FOLK' },
  ];
  try {
    const fixtures = await Promise.all(definitions.map(async profile => {
      const uid = `roles-${profile.name}-${suffix}`;
      const email = `${uid}@example.invalid`;
      await adminAuth().createUser({ uid, email, emailVerified: true, password: 'Emulator-only-123!' });
      const guide = profile.name === 'member' ? `roles-guide-${suffix}` : profile.name === 'pw-member' ? `roles-admin-${suffix}` : `roles-unrelated-guide-${suffix}`;
      await db.collection('Users').doc(uid).set({ ...profile, fullName: profile.name, userId: uid, email, status: 'Active', guide, ashrayLevel: 'Sadhaka' });
      const app = initializeApp({ projectId: 'demo-pwa-realtime', apiKey: 'demo-key' }, uid);
      apps.push(app);
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const { user } = await signInWithEmailAndPassword(auth, email, 'Emulator-only-123!');
      const client = getFirestore(app);
      connectFirestoreEmulator(client, '127.0.0.1', 8080);
      clients.push(client);
      return { ...profile, uid, client, token: await user.getIdToken() };
    }));
    // Existing FOLK report authorization intersects guide assignment with BV
    // hierarchy membership. Exercise that permitted scope without expanding it.
    for (const [guideIndex, memberIndex] of [[1, 0], [6, 7]]) {
      const groupId = `role-group-${guideIndex}-${suffix}`;
      await db.collection('BvGroups').doc(groupId).set({ groupId, groupName: 'Role fixture', guide: fixtures[guideIndex].uid, segment: 'FOLK', isActive: true });
      await db.collection('BvGroupMembers').doc(`role-membership-${memberIndex}-${suffix}`).set({ group: groupId, user: fixtures[memberIndex].uid, isActive: true });
    }
    const read = async (fixture: typeof fixtures[number]) => {
      const member = fixture.role === 'USER';
      const endpoint = member ? 'getUserHistory' : 'getGuideDetailedReport';
      const input = member ? { userId: 'attempted-foreign-identity', limit: 20 } : { guideId: 'ALL', date: '2026-09-09', reportType: 'daily', segment: fixture.segment };
      const response = await POST(new NextRequest(`http://localhost/api/run/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.token}`, 'X-Realtime-Query': '1' }, body: JSON.stringify(input),
      }), { params: Promise.resolve({ endpoint }) });
      assert.equal(response.status, 200, await response.clone().text());
      assert.ok(response.headers.get('X-Realtime-Token'), fixture.name);
      return { data: await response.json(), token: response.headers.get('X-Realtime-Token')!, version: response.headers.get('X-Realtime-Version')!, timing: response.headers.get('Server-Timing') };
    };
    const initial = await Promise.all(fixtures.map(read));
    const revisions = fixtures.map(() => '');
    const waiters = new Map<number, () => void>();
    const wait = (index: number, version: string) => new Promise<void>((resolve, reject) => {
      if (revisions[index] > version) return resolve();
      const timer = setTimeout(() => { waiters.delete(index); reject(new Error(`Missing revision for ${fixtures[index].name}`)); }, 25_000);
      waiters.set(index, () => { if (revisions[index] > version) { clearTimeout(timer); waiters.delete(index); resolve(); } });
    });
    await Promise.all(fixtures.map((fixture, index) => new Promise<void>((resolve, reject) => {
      listeners.push(onSnapshot(doc(fixture.client, 'RealtimeClients', fixture.uid, 'queries', initial[index].token), snapshot => {
        revisions[index] = snapshot.data()?.version || '';
        if (!snapshot.metadata.fromCache) resolve();
        waiters.get(index)?.();
      }, reject));
    })));
    const baseline = [...revisions];
    assert.ok(initial[1].data.users.some((user: any) => user.id === fixtures[0].uid));
    assert.equal(initial[6].data.users.some((user: any) => user.id === fixtures[0].uid), false);
    const entry = { user: fixtures[0].uid, entryDate: '2026-09-09', roundsCount: 16, templateMode: 'NON_RESIDENT_TEMPLATE', totalScore: 10, maxScore: 20, scorePercent: 50 };
    await db.collection('SadhanaEntries').doc(`role-folk-entry-${suffix}`).set(entry);
    await Promise.all([0, 1, 2].map(index => wait(index, initial[index].version)));
    for (const index of [3, 4, 5, 6, 7]) assert.equal(revisions[index], baseline[index], `${fixtures[index].name} is outside this member's scope`);
    const refreshed = await Promise.all([0, 1, 2].map(index => read(fixtures[index])));
    assert.equal(refreshed[0].data.entries[0].roundsCount, 16);
    for (const result of refreshed.slice(1)) assert.equal(result.data.users.find((user: any) => user.id === fixtures[0].uid)?.submitted, true);
    await db.collection('SadhanaEntries').doc(`role-pw-entry-${suffix}`).set({ ...entry, user: fixtures[5].uid });
    await Promise.all([3, 4, 5].map(index => wait(index, initial[index].version)));
    const pw = await Promise.all([3, 4, 5].map(index => read(fixtures[index])));
    for (const result of pw.slice(0, 2)) assert.equal(result.data.users.find((user: any) => user.id === fixtures[5].uid)?.submitted, true);
    assert.equal(pw[2].data.entries[0].roundsCount, 16);
    console.log(JSON.stringify({ result: 'passed', authenticatedSessions: fixtures.length, roles: definitions.slice(0, 5).map(role => role.role), checks: ['member to own Guide and Super Guide', 'PW member to Admin and Super Admin', 'unrelated Guide isolation', 'department isolation', 'foreign member input ignored'], serverTiming: refreshed.map(result => result.timing) }));
  } finally {
    listeners.forEach(stop => stop());
    await Promise.all(clients.map(terminate));
    await Promise.all(apps.map(deleteApp));
    await db.terminate();
  }
});
