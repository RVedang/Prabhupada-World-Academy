import { AsyncLocalStorage } from 'node:async_hooks';

type Metrics = { count: number; rows: number; durationMs: number; deduplicated: number };
type RequestQueries = { pending: Map<string, Promise<unknown>>; metrics: Metrics };
const context = new AsyncLocalStorage<RequestQueries>();
function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  // Firestore Timestamp, GeoPoint and reference values are immutable. Preserve
  // their prototypes (structuredClone would strip toDate/toMillis methods).
  return value;
}
function stable(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

/** Only identical reads in ONE authorized request share a promise. No user data
 * or permission decision is shared with another request or server instance. */
export async function requestQuery<T>(table: string, operation: string, query: unknown, fetch: () => Promise<T>): Promise<T> {
  const request = context.getStore();
  if (!request) return fetch();
  const key = `${table}:${operation}:${stable(query)}`;
  let pending = request.pending.get(key) as Promise<T> | undefined;
  if (pending) request.metrics.deduplicated++;
  else {
    pending = (async () => {
      const started = performance.now();
      try {
        const result = await fetch();
        request.metrics.rows += Array.isArray((result as any)?.records) ? (result as any).records.length : Number(!!result);
        return result;
      } finally {
        request.metrics.count++;
        request.metrics.durationMs += performance.now() - started;
      }
    })();
    request.pending.set(key, pending);
    pending.catch(() => request.pending.delete(key));
  }
  // Some reports sort/enrich their inputs in place; keep consumers isolated.
  return clone(await pending);
}

export function invalidateRequestTable(table: string) {
  const request = context.getStore();
  if (request) for (const key of request.pending.keys()) if (key.startsWith(`${table}:`)) request.pending.delete(key);
}

export async function withRequestQueries<T>(run: () => Promise<T>) {
  const request: RequestQueries = { pending: new Map(), metrics: { count: 0, rows: 0, durationMs: 0, deduplicated: 0 } };
  const result = await context.run(request, run);
  return { result, metrics: request.metrics };
}
