import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { REALTIME_EVENTS } from '../../src/lib/realtimeCollections';
import { firestoreVersion } from '../../src/lib/realtimeQueryModel';

/** Deleted snapshots have no commit updateTime. CloudEvent.time may only have
 * whole-second precision, which can incorrectly look older than a client's
 * latest read. Persist one database-issued processing timestamp per event.
 * Every retry reuses it, and a read after this timestamp already sees deletion.
 * This stores synchronization metadata only, never the deleted document. */
export async function deletionVersion(db: Firestore, eventId: string): Promise<string> {
  const reference = db.collection(REALTIME_EVENTS).doc(createHash('sha256').update(eventId).digest('hex'));
  return db.runTransaction(async transaction => {
    const previous = await transaction.get(reference);
    if (previous.exists) return String(previous.data()!.version);
    const version = firestoreVersion(previous.readTime);
    transaction.set(reference, { version, expiresAt: new Date(previous.readTime.toMillis() + 30 * 86400_000) });
    return version;
  });
}
