import { createHash } from 'node:crypto';
import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import { changeTopics, dependencyAffected, type QueryDependency, type RecordChange } from '../../src/lib/realtimeQueryModel';
import { REALTIME_SUBSCRIPTIONS, REALTIME_CLOCKS } from '../../src/lib/realtimeCollections';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Idempotent per-query max revisions; retries can safely resume partial fanout.
 * Do not discard old events globally: a move A->B->C delivered out of order
 * must still invalidate A, even if C has already been processed. */
export async function publishQueryChange(db: Firestore, change: RecordChange) {
  const clock = db.collection(REALTIME_CLOCKS).doc(change.table);
  await db.runTransaction(async transaction => {
    const previous = await transaction.get(clock);
    if (String(previous.data()?.version || '') < change.version) transaction.set(clock, { version: change.version });
  });

  const topics = changeTopics(change).map(digest);
  const subscriptions = new Map<string, DocumentSnapshot>();
  for (let offset = 0; offset < topics.length; offset += 30) {
    // A selective equality topic avoids scanning every user's subscription
    // when a member's Sadhana or one group's attendance changes.
    const snapshot = await db.collection(REALTIME_SUBSCRIPTIONS)
      .where('topics', 'array-contains-any', topics.slice(offset, offset + 30)).get();
    snapshot.docs.forEach(doc => subscriptions.set(doc.id, doc));
  }
  const affected = [...subscriptions.values()].filter(snapshot => {
    const subscription = snapshot.data()!;
    return (subscription.dependencies as QueryDependency[]).some(dependency => dependencyAffected(dependency, change));
  });
  // Limit concurrency and keep transactions independent of audience size.
  // A failed transaction rejects the trigger so the managed service retries.
  for (let offset = 0; offset < affected.length; offset += 20) {
    await Promise.all(affected.slice(offset, offset + 20).map(async subscriptionSnapshot => {
      const subscription = subscriptionSnapshot.data()!;
      const signal = db.collection('RealtimeClients').doc(subscription.uid).collection('queries').doc(subscriptionSnapshot.id);
      await db.runTransaction(async transaction => {
        const [current, registered] = await transaction.getAll(signal, subscriptionSnapshot.ref);
        // A different tab may have re-read the same query. Its newer read
        // must not suppress delivery to another tab with older cached data.
        // Only each browser's own read watermark can suppress that delivery.
        if (!registered.exists) return;
        if (String(current.data()?.version || '') >= change.version) return;
        transaction.set(signal, { version: change.version });
      });
    }));
  }
  return { candidates: subscriptions.size, affected: affected.length };
}
