import { Timestamp } from 'firebase-admin/firestore';
import { REALTIME_IDENTITIES } from './realtimeCollections';
import { getFirestoreDb } from './app-backend-sdk';
import { getNotificationDepartment } from './notificationDepartment';
import type { ApiUserContext } from './apiAuthorization';

const registered = new Map<string, string>();

/** Routing identities are derived from a verified token and its resolved
 * database profile, never from notification/subscription query parameters. */
export async function registerRealtimeIdentity(user: ApiUserContext, databaseProfile: unknown) {
  const db = getFirestoreDb();
  if (!db || !user.uid || !user.isRegistered) return;
  const identity = {
    userDocumentId: user.id,
    aliases: [...new Set([user.uid, user.id, user.userId, user.email.toLowerCase()].filter(Boolean))],
    segment: getNotificationDepartment(databaseProfile),
  };
  const signature = JSON.stringify(identity);
  if (registered.get(user.uid) === signature) return;
  await db.collection(REALTIME_IDENTITIES).doc(user.uid).set({ ...identity, updatedAt: Timestamp.now() });
  registered.set(user.uid, signature);
  while (registered.size > 250) registered.delete(registered.keys().next().value!);
}
