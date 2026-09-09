import assert from 'node:assert/strict';
import test from 'node:test';
import { claimSadhanaReminderSlot } from '../src/lib/sadhanaReminderDispatch';
import { getNotificationDepartment } from '../src/lib/notificationDepartment';

test('a scheduled minute is claimed once per department and later minutes remain eligible', async () => {
  const documents = new Map();
  const db = {
    collection: (collection: string) => ({doc: (id: string) => `${collection}/${id}`}),
    runTransaction: async (fn: any) => fn({
      get: async (ref: string) => ({data: () => documents.get(ref)}),
      set: (ref: string, data: unknown) => documents.set(ref, data),
    }),
  };
  assert.equal(await claimSadhanaReminderSlot('FOLK', '2026-09-09T21:20', db), true);
  assert.equal(await claimSadhanaReminderSlot('FOLK', '2026-09-09T21:20', db), false);
  assert.equal(await claimSadhanaReminderSlot('PW', '2026-09-09T21:20', db), true);
  assert.equal(await claimSadhanaReminderSlot('FOLK', '2026-09-09T22:20', db), true);
});

test('explicit department overrides legacy flags and names cannot change reminder recipients', () => {
  assert.equal(getNotificationDepartment({segment: 'PW', residencyId: 'legacy'}), 'PW');
  assert.equal(getNotificationDepartment({segment: 'FOLK', isPrabhupadaWorldUser: true}), 'FOLK');
  assert.equal(getNotificationDepartment({isFolkUser: true}), 'FOLK');
  assert.equal(getNotificationDepartment({isFolkLead: true}), 'FOLK');
  assert.equal(getNotificationDepartment({fullName: 'Folk Test', email: 'test@folk.org'}), 'PW');
});
