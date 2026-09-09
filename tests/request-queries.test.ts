import test from 'node:test';
import assert from 'node:assert/strict';
import { requestQuery, withRequestQueries, invalidateRequestTable } from '../src/lib/requestQueries';

test('identical reads deduplicate within a request and consumers cannot mutate one another', async () => {
  let calls = 0;
  const run = () => requestQuery('Users', 'findAll', { filters: { status: 'Active' } }, async () => {
    calls++;
    return { records: [{ id: 'one', nested: { score: 80 }, at: new Date('2026-09-08') }] };
  });
  const { metrics } = await withRequestQueries(async () => {
    const [a, b] = await Promise.all([run(), run()]);
    a.records[0].nested.score = 0;
    assert.equal(b.records[0].nested.score, 80);
    assert.ok(b.records[0].at instanceof Date);
    invalidateRequestTable('Users');
    await run();
  });
  assert.equal(calls, 2);
  assert.equal(metrics.deduplicated, 1);
  assert.equal(metrics.count, 2);
  await withRequestQueries(run);
  assert.equal(calls, 3, 'another authorized request must read its own data');
});

test('different scopes and projections never share a result; Firestore value methods survive', async () => {
  class Timestamp { toMillis() { return 123; } }
  let calls = 0;
  await withRequestQueries(async () => {
    for (const query of [{ filters: { guide: 'a' } }, { filters: { guide: 'b' } }, { filters: { guide: 'a' }, fields: ['name'] }]) {
      const value = await requestQuery('Users', 'findAll', query, async () => { calls++; return { at: new Timestamp() }; });
      assert.equal(value.at.toMillis(), 123);
    }
  });
  assert.equal(calls, 3);
});
