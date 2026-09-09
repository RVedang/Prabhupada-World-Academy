import { createHash, randomUUID } from 'node:crypto';
import { getFirestoreDb } from './app-backend-sdk';
import type { MeetingReminderType } from './meetingReminderSchedule';

export const reminderHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface ReminderCheckpoint {
  delivered: string[];
  retired: string[];
  broadcastAudience?: string;
}

/** A leased, durable per-occurrence checkpoint shared by browser and cron calls. */
export async function claimMeetingReminder(meetingId: string, scheduledAt: string, type: MeetingReminderType, db = getFirestoreDb()) {
  if (!db) throw new Error('Meeting reminders require durable Firestore storage');
  const key = reminderHash([meetingId, scheduledAt, type]);
  const ref = db.collection('meta').doc(`meetingReminder-${key}`);
  const owner = randomUUID();
  const checkpoint = await db.runTransaction(async (tx: any) => {
    const data = (await tx.get(ref)).data() || {};
    if (data.leaseUntil > Date.now()) return null;
    tx.set(ref, { ...data, owner, leaseUntil: Date.now() + 180_000 });
    return { delivered: data.delivered || [], retired: data.retired || [], broadcastAudience: data.broadcastAudience } as ReminderCheckpoint;
  });
  if (!checkpoint) return null;
  return {
    key, checkpoint,
    async complete(id: string, start: string, sentField: string, audience: string) {
      await db.runTransaction(async (tx: any) => {
        if ((await tx.get(ref)).data()?.owner !== owner) throw new Error('Meeting reminder lease was lost');
        const meetingRef = db.collection('Meetings').doc(id);
        const data = (await tx.get(meetingRef)).data();
        // A concurrent edit/cancellation must not mark the new occurrence as sent.
        if (reminderHash([data?.inviteeUserIds, data?.invitees]) !== audience || data?.scheduledAt !== start || String(data.status || 'SCHEDULED').toUpperCase() !== 'SCHEDULED') return;
        tx.set(meetingRef, { [sentField]: true, ...(sentField === 'notification10mSent' ? { notificationSent: true } : {}),
          lastNotificationSentAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      });
    },
    async save(release = false) {
      await db.runTransaction(async (tx: any) => {
        const data = (await tx.get(ref)).data();
        if (data?.owner !== owner) throw new Error('Meeting reminder lease was lost');
        tx.set(ref, { ...checkpoint, broadcastAudience: checkpoint.broadcastAudience || '', owner,
          leaseUntil: release ? 0 : Date.now() + 180_000, updatedAt: Date.now() }, { merge: true });
      });
    },
  };
}
