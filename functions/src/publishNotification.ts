import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { REALTIME_IDENTITIES } from '../../src/lib/realtimeCollections';
import { getNotificationDepartment } from '../../src/lib/notificationDepartment';

export async function publishNotification(db: Firestore, broadcast: Record<string, any>) {
  if (!broadcast.id || !broadcast.title || Number(broadcast.sentAt) < Date.now() - 5 * 60_000) return;
  const targeted = Array.isArray(broadcast.inviteeIds) || Array.isArray(broadcast.inviteeEmails);
  const recipients = [...new Set<string>([...(broadcast.inviteeIds || []), ...(broadcast.inviteeEmails || []).map((email: string) => email.toLowerCase())])];
  const identities = new Map<string, QueryDocumentSnapshot>();
  if (targeted) {
    for (let offset = 0; offset < recipients.length; offset += 30) {
      const snapshot = await db.collection(REALTIME_IDENTITIES).where('aliases', 'array-contains-any', recipients.slice(offset, offset + 30)).get();
      snapshot.docs.forEach(doc => identities.set(doc.id, doc));
    }
  } else {
    // A global broadcast is an explicit server-authorized workflow. Registered
    // identities are not push subscriptions: foreground users need no native
    // notification permission to receive an in-app reminder.
    const snapshot = await db.collection(REALTIME_IDENTITIES).get();
    snapshot.docs.forEach(doc => identities.set(doc.id, doc));
  }
  const message = {
    id: broadcast.id, title: broadcast.title, body: broadcast.body || '',
    slot: broadcast.slot || 'broadcast', sentAt: broadcast.sentAt,
    url: broadcast.url || '/sadhana', realtimeExpiresAt: new Date(Number(broadcast.sentAt) + 24 * 60 * 60_000),
  };
  const list = [...identities.values()];
  for (let offset = 0; offset < list.length; offset += 20) {
    await Promise.all(list.slice(offset, offset + 20).map(async identity => {
      const profile = await db.collection('Users').doc(identity.data().userDocumentId).get();
      if (!profile.exists) return;
      const email = String(profile.data()!.email || '').toLowerCase();
      if (broadcast.senderEmail && email === String(broadcast.senderEmail).toLowerCase()) return;
      // Re-evaluate current department, including migrated legacy FOLK flags.
      if (broadcast.segment && getNotificationDepartment(profile.data()) !== broadcast.segment) return;
      await db.collection('RealtimeClients').doc(identity.id).collection('notifications').doc(broadcast.id).set(message);
    }));
  }
}
