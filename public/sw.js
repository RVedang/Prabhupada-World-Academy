// Sadhana Tracker Service Worker — Push Notifications & Reminders
/* eslint-disable no-restricted-globals */

const APP_URL = '/sadhana';
const ICON_URL = '/icons/icon-192.png';

// ── State ──
let submittedToday = false;
const notifiedSlots = new Set();
// Track processed broadcast IDs to avoid duplicates from push events and polling fallback
const processedBroadcastIds = new Set();

// ── Reminder times (IST hours/minutes fallbacks) ──
let swReminderTimes = [
  { hour: 21, minute: 20, slot: 'night-1' },
  { hour: 22, minute: 20, slot: 'night-2' },
  { hour: 7, minute: 40, slot: 'morning' },
];

let swCustomTitle = '';
let swCustomBody = '';

// ── Push event (server-sent) ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Sadhana Reminder', body: event.data.text() };
  }

  // User-level bypass guard
  if (swUserNotificationsDisabled) {
    console.log('[SW] Skipping push event: user has disabled notifications');
    return;
  }

  // Deduplication check
  if (data.id) {
    if (processedBroadcastIds.has(data.id)) return;
    processedBroadcastIds.add(data.id);
    if (processedBroadcastIds.size > 100) {
      const first = processedBroadcastIds.values().next().value;
      if (first !== undefined) processedBroadcastIds.delete(first);
    }
  }

  const slot = data.slot || 'night-1';
  // Prioritize title and body sent by server (which may contain custom super admin content)
  const titleToUse = data.title || (SLOT_MESSAGES[slot] ? SLOT_MESSAGES[slot].title : 'Sadhana Reminder');
  const bodyToUse = data.body || (SLOT_MESSAGES[slot] ? SLOT_MESSAGES[slot].body : '');

  // Broadcast to active pages and conditionally show native notification
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      let hasVisibleClient = false;
      for (const client of windowClients) {
        if (client.focused || client.visibilityState === 'visible') {
          hasVisibleClient = true;
        }
        try {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            id: data.id || '',
            title: titleToUse,
            body: bodyToUse,
            slot,
            senderEmail: data.senderEmail || '',
            url: data.url || '',
            inviteeIds: data.inviteeIds || [],
          });
        } catch (e) {
          console.warn('[SW] Failed to postMessage to window client:', e);
        }
      }

      // Only show native system notification if no visible page is active
      if (!hasVisibleClient) {
        return self.registration.showNotification(titleToUse, {
          body: bodyToUse,
          icon: ICON_URL,
          badge: ICON_URL,
          tag: `sadhana-push-${slot}-${data.id || Date.now()}`,
          data: { url: data.url || APP_URL, slot, inviteeIds: data.inviteeIds || [] },
          renotify: true,
        });
      }
    })
  );
});

// ── Notification click ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlPath = event.notification.data?.url || APP_URL;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if found (matching base URL origin & path, bypassing hash difference)
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(urlPath, self.location.origin);
          if (clientUrl.origin === targetUrl.origin && clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
            // Navigate if hash differs
            if (clientUrl.hash !== targetUrl.hash && 'navigate' in client) {
              client.navigate(urlPath);
            }
            return client.focus();
          }
        } catch (e) {
          if (client.url.includes(urlPath) && 'focus' in client) {
            return client.focus();
          }
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlPath);
      }
    })
  );
});

// ── Message listener ──
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SYNC_STATE' || data.type === 'SUBMITTED_TODAY') {
    submittedToday = !!data.submittedToday;
    if (submittedToday) notifiedSlots.clear();
  }
  if (data.type === 'SYNC_USER') {
    swUserEmail = (data.email || '').toLowerCase();
    if (swUserEmail) {
      startPollingLoop();
    } else {
      isPolling = false;
    }
  }
  if (data.type === 'SYNC_SETTINGS') {
    const wasUserDisabled = swUserNotificationsDisabled;
    if (data.userDisabled !== undefined) {
      swUserNotificationsDisabled = !!data.userDisabled;
    } else if (data.disabled !== undefined) {
      swUserNotificationsDisabled = !!data.disabled;
    }
    if (data.adminDisabled !== undefined) {
      swAdminNotificationsDisabled = !!data.adminDisabled;
    }
    if (wasUserDisabled && !swUserNotificationsDisabled) {
      // User enabled notifications — reset swLastId so they immediately fetch the current broadcast if any
      swLastId = '';
    }
    
    // Sync custom reminder times
    if (Array.isArray(data.times)) {
      if (data.times.length > 0) {
        swReminderTimes = data.times.map((t, idx) => {
          const [hStr, mStr] = t.split(':');
          return {
            hour: parseInt(hStr || '0', 10),
            minute: parseInt(mStr || '0', 10),
            slot: `custom-${idx}`,
          };
        });
      } else {
        // Reset to default fallbacks
        swReminderTimes = [
          { hour: 21, minute: 20, slot: 'night-1' },
          { hour: 22, minute: 20, slot: 'night-2' },
          { hour: 7, minute: 40, slot: 'morning' },
        ];
      }
    }
    
    // Sync custom text contents
    if (data.title !== undefined) swCustomTitle = data.title;
    if (data.body !== undefined) swCustomBody = data.body;
  }
});

// ── Periodic sync (background check) ──
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sadhana-reminder-check') {
    event.waitUntil(checkAndNotify());
  }
});

async function checkAndNotify() {
  if (submittedToday) return;
  if (swUserNotificationsDisabled || swAdminNotificationsDisabled) {
    console.log('[SW] Skipping checkAndNotify: user or admin disabled notifications');
    return;
  }

  // Fetch the latest subscriber list/status just before sending
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) {
    console.log('[SW] Skipping reminder check: user is not subscribed');
    return;
  }

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istHour = istNow.getUTCHours();
  const istMinute = istNow.getUTCMinutes();

  for (const time of swReminderTimes) {
    const slot = time.slot;
    if (notifiedSlots.has(slot)) continue;

    const targetMinutes = time.hour * 60 + time.minute;
    const currentMinutes = istHour * 60 + istMinute;

    // Fire if we're within 10 minutes past the target time
    if (currentMinutes >= targetMinutes && currentMinutes <= targetMinutes + 10) {
      const titleToUse = swCustomTitle || '📿 Sadhana Reminder';
      const bodyToUse = swCustomBody || 'Time to fill your Sadhana report before sleeping tonight!';
      
      await self.registration.showNotification(titleToUse, {
        body: bodyToUse,
        icon: ICON_URL,
        badge: ICON_URL,
        tag: `sadhana-local-${slot}`,
        data: { url: APP_URL, slot },
      });
      notifiedSlots.add(slot);
    }
  }
}

// ── Cache Configuration ──
const CACHE_NAME = 'sadhana-static-cache-v2';
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/next.svg',
  '/globe.svg',
  '/window.svg',
  '/file.svg',
  '/vercel.svg',
];

// ── Lifecycle & Caching ──
// Pre-cache core static assets on install (excluding HTML documents to prevent refresh loops)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[ServiceWorker] Pre-caching failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Purge old CacheStorage versions on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing obsolete cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch interception with Stale-While-Revalidate strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Only handle GET requests of assets from the same origin
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 2. Exclude page navigations, HTML files, APIs, hot reloads, and internal Next.js chunks.
  // Never cache HTML documents to prevent infinite reload loops during app updates.
  if (
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.startsWith('/api/') || 
    url.pathname.includes('webpack') || 
    url.pathname.includes('hot-update') ||
    url.pathname.includes('/_next/')
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          return cachedResponse;
        });

        // Return cached resource immediately if available, updating in background
        return cachedResponse || fetchPromise;
      });
    })
  );
});

let swUserNotificationsDisabled = false;
let swAdminNotificationsDisabled = false;
