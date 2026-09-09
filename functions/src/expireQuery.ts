import type { Firestore } from 'firebase-admin/firestore';
import { REALTIME_SUBSCRIPTIONS } from '../../src/lib/realtimeCollections';

/** TTL removes abandoned subscriptions; its deletion event removes only the
 * opaque signal. A connected owner observes removal and reauthorizes that
 * exact query. Never remove a signal recreated by a concurrent fresh read. */
export async function expireQuery(db: Firestore, token: string, uid: string) {
  if (!uid || !token) return;
  await db.runTransaction(async transaction => {
    const registered = await transaction.get(db.collection(REALTIME_SUBSCRIPTIONS).doc(token));
    if (registered.exists) return;
    transaction.delete(db.collection('RealtimeClients').doc(uid).collection('queries').doc(token));
  });
}
