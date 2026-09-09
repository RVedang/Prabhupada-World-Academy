import { Users, PushSubscriptions } from '@/lib/backend-sdk';

type RecordData = Record<string, any>;
export function identityKeys(user: RecordData): string[] {
  return [...new Set([user.id, user.userId, user.user, user.uid, user.authUid, user.firebaseUid]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
}
const emailKey = (value: unknown) => String(value || '').trim().toLowerCase();

/** Page through all records, rather than silently dropping subscribers at a fixed limit. */
export async function allReminderRecords(table: { findAll: (query: any) => Promise<any> }, filters?: RecordData) {
  const records: RecordData[] = [];
  for (;;) {
    const page = await table.findAll({ filters, limit: 500, offset: records.length });
    records.push(...page.records);
    if (!page.hasMore) return records;
    if (!page.records.length) throw new Error('Reminder recipient pagination made no progress');
  }
}

/** Resolve canonical IDs, old user IDs, Firebase UIDs and missing invitee snapshots. */
export async function resolveMeetingRecipients(meeting: RecordData) {
  const snapshots: RecordData[] = Array.isArray(meeting.invitees)
    ? meeting.invitees.filter((item: unknown) => item && typeof item === 'object') : [];
  const ids: string[] = [...new Set<string>([
    ...(Array.isArray(meeting.inviteeUserIds) ? meeting.inviteeUserIds : []),
    ...snapshots.flatMap(identityKeys),
  ].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
  const emails = [...new Set(snapshots.map(item => emailKey(item.email)).filter(Boolean))];
  const profiles = new Map<string, RecordData>();
  // Scalar legacy identity fields are indexed independently. No all-user scan is needed.
  for (const field of ['id', 'userId', 'authUid', 'uid', 'firebaseUid', 'email']) {
    const values = field === 'email' ? emails : ids;
    for (let offset = 0; offset < values.length; offset += 30) {
      const batch = await Users.findAll({ filters: { [field]: { in: values.slice(offset, offset + 30) } }, limit: 500 });
      for (const user of batch.records) profiles.set(user.id, user);
    }
  }
  const recipients = [...profiles.values()].map(user => ({ ids: identityKeys(user), email: emailKey(user.email) }));
  for (const id of ids) {
    if (recipients.some(user => user.ids.includes(id))) continue;
    const snapshot = snapshots.find(item => identityKeys(item).includes(id));
    const email = emailKey(snapshot?.email);
    const existing = email && recipients.find(user => user.email === email);
    if (existing) existing.ids.push(id);
    else recipients.push({ ids: [id], email });
  }
  for (const email of emails) {
    if (!recipients.some(user => user.email === email)) recipients.push({ ids: [], email });
  }
  return recipients;
}

export async function meetingSubscriptionTargets(recipients: Awaited<ReturnType<typeof resolveMeetingRecipients>>) {
  const subs = await allReminderRecords(PushSubscriptions);
  const targets = new Map<string, RecordData>();
  for (const sub of subs) {
    const keys = identityKeys(sub);
    const email = emailKey(sub.email);
    if (sub.enabled === false || !sub.endpoint) continue;
    if (recipients.some(user => user.ids.some(id => keys.includes(id)) || (email && user.email === email))) {
      // One request per browser endpoint, while preserving a person's other devices.
      const previous = targets.get(sub.endpoint);
      if (!previous || String(sub.updatedAt || sub.createdAt || '') > String(previous.updatedAt || previous.createdAt || '')) targets.set(sub.endpoint, sub);
    }
  }
  return [...targets.values()];
}
