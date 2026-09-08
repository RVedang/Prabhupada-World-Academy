import { useEffect, useRef } from 'react';
import { useDashboardActivity } from '@/components/DashboardPanel';
import {
  REALTIME_INVALIDATION_EVENT,
  type RealtimeChannel,
} from '@/lib/realtimeChannels';

type RealtimeEventDetail = { channels?: RealtimeChannel[] };

/** Re-run an existing scoped query when its server-side data domain changes.
 * Events are coalesced into one microtask, so a multi-channel mutation does
 * not trigger duplicate refreshes. This is event-driven and does not poll.
 */
export function useRealtimeRefresh(
  channels: RealtimeChannel[],
  refresh: () => void | Promise<void>,
  enabled = true,
): void {
  const refreshRef = useRef(refresh);
  const queuedRef = useRef(false);
  const dirtyRef = useRef(false);
  const active = useDashboardActivity();
  const activeRef = useRef(active);
  activeRef.current = active;
  const channelKey = [...channels].sort().join('|');

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (active && enabled && dirtyRef.current) {
      dirtyRef.current = false;
      void refreshRef.current();
    }
  }, [active, enabled]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const wanted = new Set(channelKey.split('|').filter(Boolean));
    const onInvalidation = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeEventDetail>).detail;
      if (!detail?.channels?.some(channel => wanted.has(channel))) return;
      if (!activeRef.current || document.visibilityState === 'hidden') {
        dirtyRef.current = true;
        return;
      }
      if (queuedRef.current) return;
      queuedRef.current = true;
      queueMicrotask(() => {
        queuedRef.current = false;
        void refreshRef.current();
      });
    };
    window.addEventListener(REALTIME_INVALIDATION_EVENT, onInvalidation);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeRef.current && dirtyRef.current) {
        dirtyRef.current = false;
        void refreshRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(REALTIME_INVALIDATION_EVENT, onInvalidation);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [channelKey, enabled]);
}
