import { useEffect, useRef, type DependencyList } from 'react';
import { useReactiveLoader, type ReactiveRead } from './useReactiveLoader';

/** Effect-shaped adapter for existing read-only UI synchronization. A caller
 * wraps each endpoint in read(() => endpoint(input)); event reruns retain the
 * effect's normal cleanup and never remount its component. */
export function useReactiveEffect(
  effect: (read: ReactiveRead) => void | (() => void),
  dependencies: DependencyList,
  enabled = true,
) {
  const currentEffect = useRef(effect);
  currentEffect.current = effect;
  const cleanup = useRef<(() => void) | void>(undefined);
  const run = useReactiveLoader(async read => {
    cleanup.current?.();
    const pending: Promise<unknown>[] = [];
    const tracked = Object.assign(<T,>(request: () => Promise<T>) => {
      const promise = read(request);
      pending.push(promise);
      return promise;
    }, { background: read.background });
    Object.defineProperty(tracked, 'cancelled', { get: () => read.cancelled });
    cleanup.current = currentEffect.current(tracked as ReactiveRead);
    // Include later reads started by an async loader after its first await.
    // This drains known work; it neither sleeps nor polls a remote endpoint.
    for (let completed = 0; completed < pending.length;) {
      const end = pending.length;
      await Promise.allSettled(pending.slice(completed, end));
      completed = end;
    }
  }, dependencies, enabled);
  useEffect(() => {
    void run().catch(error => { if (error?.name !== 'AbortError') console.warn('[Realtime] Read effect failed', error); });
    return () => { cleanup.current?.(); cleanup.current = undefined; };
  }, [run]);
}
