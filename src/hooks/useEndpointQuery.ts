import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getEndpointCacheSnapshot, getEndpointIdentityScope, isEndpointQueryFresh, queryCacheKey,
  queryEndpoint, subscribeEndpointCache,
} from '@/lib/app-endpoints-sdk';
import { realtimeChannelsForEndpoint } from '@/lib/realtimeChannels';
import { useRealtimeRefresh } from './useRealtimeRefresh';
import { useDashboardActivity } from '@/components/DashboardPanel';

/** Reactive SWR over the existing endpoint cache (no second copy of API data). */
export function useEndpointQuery<T>(name: string, input: Record<string, unknown>, enabled = true) {
  useSyncExternalStore(subscribeEndpointCache, getEndpointIdentityScope, () => 'public');
  const key = queryCacheKey(name, input);
  const inputRef = useRef(input);
  inputRef.current = input;
  const active = useDashboardActivity();
  const cache = useSyncExternalStore(subscribeEndpointCache,
    () => enabled ? getEndpointCacheSnapshot(name, inputRef.current) : undefined,
    () => undefined);
  const [state, setState] = useState<{ key: string; fetching: boolean; error: Error | null }>({ key, fetching: false, error: null });
  const latest = useRef(key);
  latest.current = key;
  const previous = useRef<{ name: string; scope: string; data: T } | null>(null);
  const scope = key.slice(0, key.indexOf(`:${name}:`));
  const data = (cache?.data as T | undefined) ?? (previous.current?.name === name && previous.current.scope === scope ? previous.current.data : undefined);
  useEffect(() => {
    if (cache) previous.current = { name, scope, data: cache.data };
  }, [cache, name, scope]);

  const fetch = useCallback(async (force = false) => {
    if (!enabled) return;
    const requestKey = key;
    setState({ key: requestKey, fetching: true, error: null });
    try {
      await queryEndpoint<T>(name, { ...inputRef.current, ...(force ? { bypassCache: true } : {}) });
      if (latest.current === requestKey) setState({ key: requestKey, fetching: false, error: null });
    } catch (error) {
      if (latest.current === requestKey) setState({ key: requestKey, fetching: false, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }, [key, name, enabled]);

  useEffect(() => {
    if (enabled && active && !isEndpointQueryFresh(name, inputRef.current)) void fetch();
  }, [key, enabled, active, name, fetch]);
  useEffect(() => {
    if (!enabled || !active) return;
    const refreshStale = () => {
      if (document.visibilityState === 'visible' && !isEndpointQueryFresh(name, inputRef.current)) void fetch();
    };
    window.addEventListener('focus', refreshStale);
    document.addEventListener('visibilitychange', refreshStale);
    // Covers long-lived visible reports even if realtime connectivity is lost.
    const timer = window.setInterval(refreshStale, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshStale);
      document.removeEventListener('visibilitychange', refreshStale);
    };
  }, [enabled, active, fetch, name]);
  useRealtimeRefresh(realtimeChannelsForEndpoint(name), () => fetch(), enabled);
  return {
    data: enabled ? data : undefined,
    loading: enabled && !data && (state.key !== key || state.fetching || !state.error),
    fetching: state.key === key && state.fetching,
    error: state.key === key ? state.error : null,
    refetch: useCallback(() => fetch(true), [fetch]),
  };
}
