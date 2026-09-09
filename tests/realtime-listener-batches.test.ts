import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realtimeListenerBatches } from '../src/lib/realtimeListenerBatches';

test('subscription batches retain full streams and remove unneeded tokens', () => {
  const tokens = Array.from({ length: 95 }, (_, i) => String(i).padStart(3, '0'));
  const original = realtimeListenerBatches(tokens, []);
  assert.equal(original.size, 4);
  const expanded = realtimeListenerBatches(['000-new', ...tokens, tokens[0]], original.keys());
  assert.equal(expanded.size, 4);
  assert.equal([...original.keys()].filter(key => expanded.has(key)).length, 3, 'only the partial stream is replaced');
  const reduced = realtimeListenerBatches(tokens.slice(1), expanded.keys());
  const actual = [...reduced.values()].flat();
  assert.deepEqual(actual.sort(), tokens.slice(1));
  assert.equal(new Set(actual).size, actual.length);
  assert.ok([...reduced.values()].every(part => part.length <= 30));
  assert.equal(realtimeListenerBatches([], reduced.keys()).size, 0, 'logout/unmount removes every stream');
});
