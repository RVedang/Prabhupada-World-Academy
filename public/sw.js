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

// ── Slot messages (fallback text) ──
const SLOT_MESSAGES = {
  'night-1': { title: '📿 Sadhana Reminder', body: 'Time to fill your Sadhana! Complete it before sleeping tonight.' },
  'night-2': { title: '🙏 Sadhana Reminder', body: "Don't forget — fill your Sadhana report before you sleep!" },
  'morning': { title: '⏰ Last Chance!', body: "Submit yesterday's Sadhana before the morning deadline!" },
};

// ── Long-poll state for broadcast delivery ──
let swUserEmail = '';
let swLastId = '';
let isPolling = false;

/**
 * Long-poll /api/push-events inside the service worker.
 * This ensures background tabs (where the page JS is frozen) still receive
 * push broadcasts without relying solely on native Web Push delivery.
 */
async function startPollingLoop() {
  if (isPolling) return;
  isPolling = true;

  async function poll() {
    if (!isPolling || !swUserEmail) {
      isPolling = false;
      return;
    }
    try {
      const url = '/api/push-events?lastId=' + encodeURIComponent(swLastId) + '&email=' + encodeURIComponent(swUserEmail);
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) swLastId = data.id;
        if (data && data.type === 'PUSH_RECEIVED') {
          handleSwPushReceived(data);
        }
      }
    } catch (e) {
      // Network error: back off 5s
      await new Promise((r) => setTimeout(r, 5000));
    }
    // Reconnect immediately (server holds the socket for up to 25s)
    poll();
  }

  poll();
}

/**
 * Handle a broadcast received via the long-poll channel inside the SW.
 * Forward it to all open page clients; show a native notification if none are visible.
 */
function handleSwPushReceived(data) {
  if (!data || !data.title) return;

  // Skip if sender is this user
  var senderEmail = (data.senderEmail || '').toLowerCase();
  if (swUserEmail && senderEmail && swUserEmail === senderEmail) return;

  // Deduplication
  if (data.id) {
    if (processedBroadcastIds.has(data.id)) return;
    processedBroadcastIds.add(data.id);
    if (processedBroadcastIds.size > 100) {
      var first = processedBroadcastIds.values().next().value;
      if (first !== undefined) processedBroadcastIds.delete(first);
    }
  }

  var slot = data.slot || 'broadcast';
  var title = data.title || '📿 Sadhana Reminder';
  var body = data.body || 'You have a new Sadhana reminder.';
  var url = data.url || APP_URL;

  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
    var hasVisibleClient = false;
    for (var i = 0; i < windowClients.length; i++) {
      var client = windowClients[i];
      if (client.focused || client.visibilityState === 'visible') {
        hasVisibleClient = true;
      }
      try {
        client.postMessage({
          type: 'PUSH_RECEIVED',
          id: data.id || '',
          title: title,
          body: body,
          slot: slot,
          senderEmail: data.senderEmail || '',
          url: url,
        });
      } catch (e) {
        // Ignore postMessage failures
      }
    }

    // Show native notification only if no page is currently visible
    if (!hasVisibleClient && !swUserNotificationsDisabled) {
      self.registration.showNotification(title, {
        body: body,
        icon: ICON_URL,
        badge: ICON_URL,
        tag: 'sadhana-poll-' + slot + '-' + (data.id || Date.now()),
        data: { url: url, slot: slot },
        renotify: true,
      });
    }
  });
}

// ── Push event (server-sent Web Push delivery) ──
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
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(urlPath, self.location.origin);
          if (clientUrl.origin === targetUrl.origin && clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
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
        swReminderTimes = [
          { hour: 21, minute: 20, slot: 'night-1' },
          { hour: 22, minute: 20, slot: 'night-2' },
          { hour: 7, minute: 40, slot: 'morning' },
        ];
      }
    }
    
    if (data.title !== undefined) swCustomTitle = data.title;
    if (data.body !== undefined) swCustomBody = data.body;
  }
  if (data.type === 'PAGE_VISIBLE') {
    if (swUserEmail && !isPolling) {
      startPollingLoop();
    }
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

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

        return cachedResponse || fetchPromise;
      });
    })
  );
});

let swUserNotificationsDisabled = false;
let swAdminNotificationsDisabled = false;
