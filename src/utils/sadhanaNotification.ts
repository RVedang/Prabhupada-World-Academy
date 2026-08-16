/**
 * Sadhana Notification Utility
 * Manages Web Push subscriptions and local reminder scheduling
 */

import * as React from 'react';
import { getVapidPublicKey, subscribePush, unsubscribePush, getPwNotificationConfig as apiGetConfig, savePwNotificationConfig as apiSaveConfig } from '@/lib/endpoints-sdk';
import { toast } from 'sonner';

// ── PW Super Admin Notification Authority Config ──
export interface PwSadhanaNotificationConfig {
  enabled: boolean;
  times: string[]; // e.g. ["21:20", "22:20"] in 24h format
  frequency: 'daily' | 'weekdays' | 'custom';
  customDays?: number[]; // [0, 1, 2, 3, 4, 5, 6] where 0=Sun, 1=Mon...
  title: string;
  body: string;
  updatedAt: string;
  updatedBy: string;
}

const CONFIG_STORAGE_KEY = 'pw_sadhana_notification_config';

export const DEFAULT_PW_NOTIFICATION_CONFIG: PwSadhanaNotificationConfig = {
  enabled: true,
  times: ['21:20', '22:20'],
  frequency: 'daily',
  customDays: [0, 1, 2, 3, 4, 5, 6],
  title: '📿 Sadhana Reminder',
  body: 'Time to fill your Sadhana report before sleeping tonight!',
  updatedAt: new Date().toISOString(),
  updatedBy: 'PW Super Admin',
};

export async function getPwNotificationConfig(): Promise<PwSadhanaNotificationConfig> {
  try {
    const config = await apiGetConfig({});
    return { ...DEFAULT_PW_NOTIFICATION_CONFIG, ...config };
  } catch {
    return DEFAULT_PW_NOTIFICATION_CONFIG;
  }
}

export async function savePwNotificationConfig(config: Partial<PwSadhanaNotificationConfig>): Promise<PwSadhanaNotificationConfig> {
  try {
    const current = await getPwNotificationConfig();
    const updated: PwSadhanaNotificationConfig = {
      ...current,
      ...config,
      updatedAt: new Date().toISOString(),
    };
    await apiSaveConfig(updated);
    return updated;
  } catch (e) {
    console.error('Failed to save config in DB:', e);
    const current = DEFAULT_PW_NOTIFICATION_CONFIG;
    const updated: PwSadhanaNotificationConfig = {
      ...current,
      ...config,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  }
}

// ── Reminder times (IST fallback) ──
const REMINDER_TIMES = {
  'night-1': { hour: 21, minute: 20 }, // 9:20 PM
  'night-2': { hour: 22, minute: 20 }, // 10:20 PM
  'morning': { hour: 7, minute: 40 },  // 7:40 AM next day
};

// ── localStorage helpers ──
const SUBMITTED_KEY = 'sadhana_submitted_today';
const SUBMITTED_DATE_KEY = 'sadhana_submitted_date';

export function hasSubmittedToday(): boolean {
  const date = localStorage.getItem(SUBMITTED_DATE_KEY);
  const today = new Date().toISOString().slice(0, 10);
  return date === today && localStorage.getItem(SUBMITTED_KEY) === 'true';
}

export function markSubmittedToday(): void {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(SUBMITTED_KEY, 'true');
  localStorage.setItem(SUBMITTED_DATE_KEY, today);
}

// ── Permission helpers ──
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    await ensureSwRegistered();
  }
  return result;
}

// ── Service Worker registration ──
let _swRegistration: ServiceWorkerRegistration | null = null;

/** Returns true when SW registration is safe (secure context, not in iframe/editor preview) */
function canRegisterSw(): boolean {
  if (!('serviceWorker' in navigator)) return false;
  // Service workers require a secure context (HTTPS or localhost)
  if (!window.isSecureContext) return false;
  // Skip registration inside iframes (e.g. App editor preview)
  if (window.self !== window.top) return false;
  return true;
}

export async function ensureSwRegistered(): Promise<ServiceWorkerRegistration | null> {
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    }).catch(() => {});
  }

  if (_swRegistration) return _swRegistration;
  if (!canRegisterSw()) return null;
  try {
    _swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return _swRegistration;
  } catch {
    // SW registration can fail in restricted contexts — non-critical, degrade gracefully
    return null;
  }
}

export async function registerServiceWorker(): Promise<void> {
  // Always run page-level long-polling stream for real-time notification delivery when the tab is open
  connectToNotificationStream();

  const reg = await ensureSwRegistered();
  if (!reg) return;

  // Immediately tell SW if page is visible
  function notifySwVisibility() {
    const type = document.visibilityState === 'visible' ? 'PAGE_VISIBLE' : 'PAGE_HIDDEN';
    navigator.serviceWorker.controller?.postMessage({ type });
  }
  notifySwVisibility();
  document.addEventListener('visibilitychange', notifySwVisibility);

  // Sync user email to service worker
  function syncSwUser() {
    const email = localStorage.getItem('auth_email') || '';
    navigator.serviceWorker.controller?.postMessage({ type: 'SYNC_USER', email });
  }
  syncSwUser();

  // Sync settings (enabled/disabled status, times, title, body) to service worker
  function syncSwSettings() {
    getPwNotificationConfig().then((config) => {
      const userDisabled = localStorage.getItem('push_notifications_disabled') === 'true';
      navigator.serviceWorker.controller?.postMessage({
        type: 'SYNC_SETTINGS',
        userDisabled,
        adminDisabled: !config.enabled,
        times: config.times,
        title: config.title,
        body: config.body,
      });
    }).catch(() => {});
  }
  syncSwSettings();

  // Send state when the service worker controller becomes active
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    notifySwVisibility();
    syncSwUser();
    syncSwSettings();
  });

  // Periodically check if user has logged in/out or changed email, and sync with SW
  let lastSyncedEmail = localStorage.getItem('auth_email') || '';
  let lastSyncedDisabled = localStorage.getItem('push_notifications_disabled') === 'true';
  setInterval(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const currentEmail = localStorage.getItem('auth_email') || '';
      const currentDisabled = localStorage.getItem('push_notifications_disabled') === 'true';
      if (currentEmail !== lastSyncedEmail) {
        syncSwUser();
        lastSyncedEmail = currentEmail;
      }
      if (currentDisabled !== lastSyncedDisabled) {
        syncSwSettings();
        lastSyncedDisabled = currentDisabled;
      }
    }
  }, 2000);

  // Set to prevent duplicate toasts in page-level client
  const _seenBroadcasts = new Set<string>();

  // Listen for messages from SW
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'GET_STATE') {
      navigator.serviceWorker.controller?.postMessage({
        type: 'SYNC_STATE',
        submittedToday: hasSubmittedToday(),
      });
    } else if (event.data?.type === 'PUSH_RECEIVED') {
      // If the current tab belongs to the sender, ignore it
      const currentEmail = (localStorage.getItem('auth_email') || '').toLowerCase();
      const senderEmail = (event.data.senderEmail || '').toLowerCase();
      if (currentEmail && senderEmail && currentEmail === senderEmail) {
        return;
      }
      
      const msgId = event.data.id;
      if (msgId) {
        if (_seenBroadcasts.has(msgId)) return;
        _seenBroadcasts.add(msgId);
        if (_seenBroadcasts.size > 50) {
          const first = _seenBroadcasts.values().next().value;
          if (first !== undefined) _seenBroadcasts.delete(first);
        }
      }

      toast(event.data.title || '📿 Sadhana Reminder', {
        id: `sadhana-${Date.now()}`,
        description: event.data.body || 'New Sadhana reminder',
        duration: 6000,
      });
    }
  });

  // Fire-and-forget: always sync subscription with DB if permission is granted and not explicitly disabled
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    if (localStorage.getItem('push_notifications_disabled') !== 'true') {
      subscribeToPush().catch(() => {});
    }
  }
}

/**
 * Long-poll /api/push-events for real-time Super Admin push broadcasts.
 *
 * The server holds the request for up to 25 s and returns immediately when a
 * new broadcast is stored.  The client reconnects right away, creating a
 * near-real-time channel without SSE streaming issues.
 */
export function connectToNotificationStream(): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  let lastId = '';

  async function poll(): Promise<void> {
    const userId = localStorage.getItem('auth_user_id') || '';
    const email = localStorage.getItem('auth_email') || '';

    if (!userId && !email) {
      // Not logged in yet. Check again in 1 second.
      await new Promise<void>((r) => setTimeout(r, 1000));
      poll();
      return;
    }

    try {
      const url = `/api/push-events?lastId=${encodeURIComponent(lastId)}&email=${encodeURIComponent(email)}&userId=${encodeURIComponent(userId)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        // Wait before retrying on error
        await new Promise<void>((r) => setTimeout(r, 5000));
        poll();
        return;
      }
      const data = await res.json();
      if (data?.id) {
        lastId = data.id;
      }
      if (data?.type === 'PUSH_RECEIVED') {
        handlePushReceived(data);
      }
      // Immediately reconnect for next event
      poll();
    } catch {
      // Network error — retry after 5 s
      await new Promise<void>((r) => setTimeout(r, 5000));
      poll();
    }
  }

  poll();
}

function handlePushReceived(data: { id?: string; title?: string; body?: string; slot?: string; senderEmail?: string; url?: string }): void {
  // Check user local preference first
  if (typeof window !== 'undefined' && localStorage.getItem('push_notifications_disabled') === 'true') {
    return;
  }

  // If the current tab belongs to the sender, ignore it
  const currentEmail = (localStorage.getItem('auth_email') || '').toLowerCase();
  const senderEmail = (data.senderEmail || '').toLowerCase();
  if (currentEmail && senderEmail && currentEmail === senderEmail) {
    return;
  }

  // Check for duplicate messages
  const msgId = data.id;
  if (msgId) {
    if (typeof window !== 'undefined') {
      const win = window as any;
      if (!win._seenBroadcasts) win._seenBroadcasts = new Set<string>();
      if (win._seenBroadcasts.has(msgId)) return;
      win._seenBroadcasts.add(msgId);
      if (win._seenBroadcasts.size > 50) {
        const first = win._seenBroadcasts.values().next().value;
        if (first !== undefined) win._seenBroadcasts.delete(first);
      }
    }
  }

  const title = data.title || '📿 Sadhana Reminder';
  const body = data.body || 'You have a new Sadhana reminder.';
  const slot = data.slot || 'broadcast';
  const urlToUse = data.url || '/sadhana';

  // If page is in foreground, show in-app toast
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    toast(
      React.createElement(
        'div',
        {
          onClick: () => {
            if (urlToUse) {
              if (urlToUse.startsWith('http')) {
                window.open(urlToUse, '_blank');
              } else {
                window.location.href = urlToUse;
              }
            }
          },
          className: 'cursor-pointer w-full text-left',
        },
        React.createElement('div', { className: 'font-semibold text-foreground text-xs' }, title),
        React.createElement('div', { className: 'text-[11px] text-muted-foreground mt-0.5' }, body)
      ),
      {
        id: `sadhana-${Date.now()}`,
        duration: 8000,
      }
    );
  } else {
    const uniqueTag = `sadhana-${slot}-${data.id || Date.now()}`;
    // If page is in background, show native system Chrome notification
    if (_swRegistration) {
      _swRegistration.showNotification(title, {
        body: body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: uniqueTag,
        data: { url: urlToUse, slot },
        renotify: true,
      } as any);
    } else if (typeof Notification !== 'undefined') {
      new Notification(title, { body: body, tag: uniqueTag });
    }
  }
}

// ── Push subscription ──
let _subscribeLock: Promise<boolean> | null = null;

export async function subscribeToPush(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('push_notifications_disabled');
    try {
      const email = localStorage.getItem('auth_email') || '';
      // Sync userDisabled=false AND user email — if SW was restarted, swUserEmail is empty
      // which prevents the polling loop from starting. Re-syncing email restarts it.
      navigator.serviceWorker.controller?.postMessage({
        type: 'SYNC_SETTINGS',
        userDisabled: false,
      });
      navigator.serviceWorker.controller?.postMessage({ type: 'SYNC_USER', email });
    } catch {}
  }
  if (_subscribeLock) return _subscribeLock;
  _subscribeLock = _doSubscribe();
  try {
    return await _subscribeLock;
  } finally {
    _subscribeLock = null;
  }
}

async function _doSubscribe(): Promise<boolean> {
  try {
    const reg = await ensureSwRegistered();
    if (!reg) return false;

    const { publicKey } = await getVapidPublicKey({});
    if (!publicKey) {
      console.error('[Push] VAPID public key not found');
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    let subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      // Check if current subscription applicationServerKey matches new server key
      try {
        const currentAppKey = subscription.options?.applicationServerKey;
        if (currentAppKey) {
          const currentArr = new Uint8Array(currentAppKey);
          const targetArr = new Uint8Array(applicationServerKey.buffer as ArrayBuffer);
          let match = currentArr.length === targetArr.length;
          if (match) {
            for (let i = 0; i < currentArr.length; i++) {
              if (currentArr[i] !== targetArr[i]) { match = false; break; }
            }
          }
          if (!match) {
            await subscription.unsubscribe();
            subscription = null;
          }
        }
      } catch (err) {
        console.warn('[Push] Existing subscription key check failed, renewing:', err);
        try { await subscription?.unsubscribe(); } catch {}
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
    }

    const subJson = subscription.toJSON();
    const keys = subJson.keys || {};

    const res = await subscribePush({
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh || '',
      auth: keys.auth || '',
    });

    return !!res?.success;
  } catch (e) {
    console.error('[Push] Subscribe failed:', e);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('push_notifications_disabled', 'true');
      try {
        navigator.serviceWorker.controller?.postMessage({
          type: 'SYNC_SETTINGS',
          userDisabled: true,
        });
      } catch {}
    }
    const reg = await ensureSwRegistered();
    if (!reg) return false;

    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush({ endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    return true;
  } catch (e) {
    console.error('[Push] Unsubscribe failed:', e);
    return false;
  }
}

export async function checkPushSubscriptionStatus(): Promise<boolean> {
  try {
    const reg = await ensureSwRegistered();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// ── Local notification scheduling ──
let _reminderTimers: ReturnType<typeof setTimeout>[] = [];

export async function scheduleSadhanaReminder(submittedToday: boolean, segment?: string): Promise<void> {
  // Clear existing timers
  _reminderTimers.forEach(t => clearTimeout(t));
  _reminderTimers = [];

  // Super Admin/Admin role check - Super Admins do not receive or trigger Sadhana reminders
  if (typeof window !== 'undefined') {
    const isPwAdmin = localStorage.getItem('is_pw_admin') === 'true';
    const authRole = localStorage.getItem('auth_role');
    if (isPwAdmin || authRole === 'SUPER_ADMIN') {
      return;
    }
  }

  const config = await getPwNotificationConfig();
  // If PW department and disabled by PW Super Admin, skip scheduling
  if (segment === 'PW' && !config.enabled) return;

  // Notify the SW
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SUBMITTED_TODAY',
      submittedToday,
    });
    // Send updated config values
    const userDisabled = localStorage.getItem('push_notifications_disabled') === 'true';
    navigator.serviceWorker.controller.postMessage({
      type: 'SYNC_SETTINGS',
      userDisabled,
      adminDisabled: !config.enabled,
      times: config.times,
      title: config.title,
      body: config.body,
    });
  }

  if (submittedToday) return; // No reminders needed
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const now = new Date();
  // IST offset
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istHour = istNow.getUTCHours();
  const istMinute = istNow.getUTCMinutes();

  const timesToUse = config.times.length > 0
    ? config.times.map((t, idx) => {
        const [hStr, mStr] = t.split(':');
        return {
          slot: `custom-${idx}`,
          hour: parseInt(hStr || '0', 10),
          minute: parseInt(mStr || '0', 10),
        };
      })
    : Object.entries(REMINDER_TIMES).map(([slot, time]) => ({
        slot,
        hour: time.hour,
        minute: time.minute,
      }));

  for (const time of timesToUse) {
    const slot = time.slot;
    const targetIST = new Date(istNow);
    targetIST.setUTCHours(time.hour, time.minute, 0, 0);

    // If target time is in the past for today, schedule for next day
    if (istHour < time.hour || (istHour === time.hour && istMinute < time.minute)) {
      // Fine, target is today in future
    } else {
      targetIST.setUTCDate(targetIST.getUTCDate() + 1);
    }

    // Convert IST target to local time
    const targetLocal = new Date(targetIST.getTime() - istOffset);
    const delay = targetLocal.getTime() - now.getTime();

    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      const timer = setTimeout(async () => {
        // Re-read live config at fire-time — fail closed: if we can't verify, skip
        const liveConfig = await getPwNotificationConfig().catch(() => null);
        if (!liveConfig || !liveConfig.enabled) {
          console.log('[Push] Skipping local reminder: notifications disabled by admin (or config unavailable)');
          return;
        }
        // Re-check user's own disable flag at fire-time
        if (typeof window !== 'undefined' && localStorage.getItem('push_notifications_disabled') === 'true') {
          console.log('[Push] Skipping local reminder: user has disabled notifications');
          return;
        }

        // Check subscription still exists
        const hasSub = await checkPushSubscriptionStatus();
        if (!hasSub) {
          console.log('[Push] Skipping reminder: user is not subscribed');
          return;
        }

        if (!hasSubmittedToday()) {
          showLocalNotification(slot, liveConfig);
        }
      }, delay);
      _reminderTimers.push(timer);
    }
  }
}

function showLocalNotification(slot: string, config?: PwSadhanaNotificationConfig): void {
  const title = config?.title || '📿 Sadhana Reminder';
  const body = config?.body || 'Time to fill your Sadhana report before sleeping tonight!';

  // When the app is in the foreground, the SW push event already sends PUSH_RECEIVED
  // to the page which triggers the in-app toast via registerServiceWorker listener.
  // Only show in-app toast here if the app IS in foreground AND no SW is controlling the page
  // (i.e. fallback path where SW-based delivery isn't available).
  const swControlled = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  if (!swControlled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
    toast(title, {
      id: `sadhana-local-${slot}-${Date.now()}`,
      description: body,
      duration: 6000,
    });
  }

  // Show native Chrome system notification when app is in background
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    const uniqueTag = `sadhana-local-${slot}-${Date.now()}`;
    if (_swRegistration) {
      _swRegistration.showNotification(title, {
        body: body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: uniqueTag,
        data: { url: '/sadhana', slot },
        renotify: true,
      } as any);
    } else if (typeof Notification !== 'undefined') {
      new Notification(title, { body: body, tag: uniqueTag });
    }
  }
}

// ── Visibility change handler ──
export function initReminderVisibilityCheck(): void {
  const handler = () => {
    if (document.visibilityState === 'visible') {
      scheduleSadhanaReminder(hasSubmittedToday()).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', handler);
}

// ── Helpers ──
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
