'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { dashboardScope } from '@/lib/dashboardScope';
import { firebaseApp } from '@/lib/app-auth-sdk';
import { useAuth } from '@/lib/auth-sdk';
import { useUserProfile } from '@/contexts/UserProfileContext';
import {
  REALTIME_CHANNELS,
  REALTIME_INVALIDATION_EVENT,
  normalizeRealtimeDepartment,
  type RealtimeChannel,
} from '@/lib/realtimeChannels';
import { clearEndpointClientCache, invalidateEndpointClientCacheForChannels, setEndpointPermissionScope } from '@/lib/app-endpoints-sdk';
import { invalidateCache } from '@/utils/cache';

type Versions = Partial<Record<RealtimeChannel, number>>;

export default function RealtimeSyncProvider() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const profileSegment = profile?.segment;
  const lastIdentityRef = useRef<string>('');
  const permissionScope = dashboardScope(profile, user?.id || user?.email);
  useLayoutEffect(() => {
    setEndpointPermissionScope(permissionScope);
    invalidateCache();
  }, [permissionScope]);

  useEffect(() => {
    const identity = String(user?.id || user?.email || '').toLowerCase();
    if (lastIdentityRef.current && lastIdentityRef.current !== identity) {
      clearEndpointClientCache();
      invalidateCache();
    }
    lastIdentityRef.current = identity;
    if (!identity || !profileSegment || !firebaseApp) return;

    let disposed = false;
    const unsubscribers: Array<() => void> = [];
    const previousByDepartment = new Map<string, Versions>();
    const department = normalizeRealtimeDepartment(profileSegment) || 'PW';

    void (async () => {
      const firestore = await import('firebase/firestore');
      if (disposed) return;

      let db;
      try {
        db = firestore.initializeFirestore(firebaseApp, {
          localCache: firestore.persistentLocalCache({
            tabManager: firestore.persistentMultipleTabManager(),
          }),
        });
      } catch {
        // Firestore may already have been initialized by another mounted tree.
        db = firestore.getFirestore(firebaseApp);
      }

      for (const scope of [department, 'ALL'] as const) {
        const unsubscribe = firestore.onSnapshot(
          firestore.doc(db, 'RealtimeInvalidations', scope),
          snapshot => {
            if (!snapshot.exists()) return;
            const next = (snapshot.data()?.channels || {}) as Versions;
            const previous = previousByDepartment.get(scope);
            previousByDepartment.set(scope, next);
            // The initial snapshot establishes the baseline. Only subsequent
            // server writes represent changes for this mounted session.
            if (!previous) return;
            const changed = REALTIME_CHANNELS.filter(channel =>
              Number(next[channel] || 0) > Number(previous[channel] || 0)
            );
            if (changed.length === 0) return;
            invalidateEndpointClientCacheForChannels(changed);
            window.dispatchEvent(new CustomEvent(REALTIME_INVALIDATION_EVENT, {
              detail: { department: scope, channels: changed, version: snapshot.data()?.version || Date.now() },
            }));
          },
          error => {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[Realtime] Listener unavailable; cached API data remains active.', error.code || error.message);
            }
          },
        );
        unsubscribers.push(unsubscribe);
      }
    })();

    return () => {
      disposed = true;
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [user?.id, user?.email, profileSegment]);

  return null;
}
