import { getFirestoreDb } from './app-backend-sdk';

/** Claim a department's scheduled minute once across concurrent instances. */
export async function claimSadhanaReminderSlot(
  segment: 'PW' | 'FOLK',
  slot: string,
  db = getFirestoreDb(),
): Promise<boolean> {
  if (!db) throw new Error('Scheduled Sadhana reminders require Firestore');
  const ref = db.collection('meta').doc(`sadhanaReminderDispatch-${segment}`);
  return db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.slot === slot) return false;
    transaction.set(ref, { slot, claimedAt: Date.now() });
    return true;
  });
}
