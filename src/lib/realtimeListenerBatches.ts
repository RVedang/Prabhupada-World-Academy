/** Firestore permits up to 30 values in an `in` query. Preserve unchanged full
 * batches so visiting one new screen does not reopen every existing stream. */
export function realtimeListenerBatches(tokens: string[], existing: Iterable<string>) {
  const wanted = new Set(tokens);
  const covered = new Set<string>();
  const batches = new Map<string, string[]>();
  for (const key of existing) {
    const part = key.split('|');
    if (part.length === 30 && part.every(token => wanted.has(token) && !covered.has(token))) {
      batches.set(key, part);
      part.forEach(token => covered.add(token));
    }
  }
  const remaining = [...wanted].filter(token => !covered.has(token)).sort();
  for (let index = 0; index < remaining.length; index += 30) {
    const part = remaining.slice(index, index + 30);
    batches.set(part.join('|'), part);
  }
  return batches;
}
