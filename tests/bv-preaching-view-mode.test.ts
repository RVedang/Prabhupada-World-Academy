import assert from 'node:assert/strict';
import test from 'node:test';

import { getBvPreachingDisplayAggregate } from '../src/lib/bvPreachingAnalytics';

const totals = {
  callingTime: 90,
  oneOnOneTime: 45,
  bookDistTime: 30,
  rduaTime: 15,
  planTime: 60,
  booksDistributed: 5,
  contactsCollected: 7,
  uniqueOneOnOnes: 3,
  totalMinutes: 240,
};

test('averages divide aggregate values by submitted RGFs', () => {
  assert.deepEqual(getBvPreachingDisplayAggregate(totals, 2, 'avgs'), {
    callingTime: 45,
    oneOnOneTime: 23,
    bookDistTime: 15,
    rduaTime: 8,
    planTime: 30,
    booksDistributed: 2.5,
    contactsCollected: 3.5,
    uniqueOneOnOnes: 1.5,
    totalMinutes: 120,
  });
});

test('one submitted RGF has identical totals and averages', () => {
  assert.deepEqual(getBvPreachingDisplayAggregate(totals, 1, 'avgs'), totals);
});

test('no submitted RGFs produces zero averages', () => {
  assert.deepEqual(
    Object.values(getBvPreachingDisplayAggregate(totals, 0, 'avgs')),
    Object.values(totals).map(() => 0),
  );
});
