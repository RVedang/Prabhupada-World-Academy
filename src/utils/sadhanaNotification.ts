/**
 * Sadhana Notification Utility
 * Manages Web Push subscriptions, real-time in-app toast alerts, and OS notifications.
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
  if (typeof window !== 'undefined' && localStorage.getItem('notifications_simulated_granted') === 'true') {
    return 'granted';
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window !== 'undefined' && localStorage.getItem('notifications_simulated_granted') === 'true') {
    return 'granted';
  }

  if (typeof Notification === 'undefined') {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notifications_simulated_granted', 'true');
      localStorage.removeItem('push_notifications_disabled');
    }
    return 'granted';
  }

  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await ensureSwRegistered();
      return result;
    }
  } catch (err) {
    console.warn('Native notification request failed, falling back to simulation:', err);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem('notifications_simulated_granted', 'true');
    localStorage.removeItem('push_notifications_disabled');
  }
  return 'granted';
}

// ── Service Worker registration ──
let _swRegistration: ServiceWorkerRegistration | null = null;

function canRegisterSw(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!window.isSecureContext) return false;
  if (window.self !== window.top) return false;
  return true;
}

export async function ensureSwRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!canRegisterSw()) return null;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    _swRegistration = reg;
    // Check for updates
    reg.update().catch(() => {});
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    await navigator.serviceWorker.ready;
    return _swRegistration;
  } catch (e) {
    console.warn('[SW] Registration failed:', e);
    return null;
  }
}

// ── Deduplication set for toasts / in-app notifications ──
const _seenBroadcastIds = new Set<string>();

/**
 * Unified trigger for in-app toast (foreground) OR native system notification (background).
 */
export function triggerInAppOrNativeNotification(data: {
  id?: string;
  title?: string;
  body?: string;
  slot?: string;
  senderEmail?: string;
  url?: string;
  suppressNative?: boolean;
}): void {
  if (!data) return;

  // Do not show side notifications (toasts) for role or guide updates
  if (data.slot === 'role_changed' || data.slot === 'guide_changed') {
    return;
  }

  // Check user local preference
  if (typeof window !== 'undefined' && localStorage.getItem('push_notifications_disabled') === 'true') {
    return;
  }

  // Deduplication
  const msgId = data.id || `${data.title}_${data.body}_${Date.now()}`;
  if (_seenBroadcastIds.has(msgId)) {
    return;
  }
  _seenBroadcastIds.add(msgId);
  if (_seenBroadcastIds.size > 100) {
    const first = _seenBroadcastIds.values().next().value;
    if (first !== undefined) _seenBroadcastIds.delete(first);
  }

  const title = data.title || '📿 Sadhana Reminder';
  const body = data.body || 'Time to fill your Sadhana report before sleeping tonight!';
  const urlToUse = data.url || '/sadhana';

  const isForeground = typeof document !== 'undefined' && document.visibilityState === 'visible';

  if (isForeground) {
    // ── 1. FOREGROUND: Display rich in-app interactive toast ──
    const isMeeting = data.slot === 'meeting' || 
                      urlToUse.includes('/meeting') || 
                      urlToUse.includes('zoom.us') || 
                      urlToUse.includes('meet.google.com') ||
                      body.toLowerCase().includes('meeting') ||
                      title.toLowerCase().includes('meeting');
    const iconEmoji = isMeeting ? '📅' : '📿';

    let actionText = 'Tap here to open Sadhana →';
    if (isMeeting) {
      actionText = 'Tap here to join Meeting →';
    } else if (urlToUse.startsWith('http')) {
      actionText = 'Tap here to open link →';
    } else if (urlToUse !== '/sadhana') {
      actionText = 'Tap here to view →';
    }

    const navigateToTarget = () => {
      if (urlToUse) {
        if (urlToUse.startsWith('http')) {
          window.open(urlToUse, '_blank');
        } else {
          window.location.href = urlToUse;
        }
      }
    };

    toast(
      React.createElement(
        'div',
        {
          onClick: navigateToTarget,
          className: 'cursor-pointer w-full text-left flex items-start gap-3 select-none py-1',
        },
        React.createElement(
          'div',
          { className: 'w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 text-lg shadow-xs' },
          iconEmoji
        ),
        React.createElement(
          'div',
          { className: 'flex-1 min-w-0' },
          React.createElement(
            'div',
            { className: 'font-bold text-foreground text-sm leading-tight flex items-center justify-between' },
            React.createElement('span', { className: 'truncate' }, title),
            React.createElement('span', { className: 'text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary ml-2 shrink-0' }, 'Reminder')
          ),
          React.createElement('div', { className: 'text-xs text-muted-foreground mt-1 leading-snug' }, body),
          React.createElement(
            'div',
            { className: 'mt-2 text-xs font-semibold text-primary flex items-center gap-1 hover:underline' },
            actionText
          )
        )
      ),
      {
        id: `sadhana-toast-${Date.now()}`,
        duration: 10000,
      }
    );
  } else if (!data.suppressNative) {
    // ── 2. BACKGROUND: Display native OS system notification ──
    const uniqueTag = `sadhana-${data.slot || 'reminder'}-${data.id || Date.now()}`;
    if (_swRegistration) {
      _swRegistration.showNotification(title, {
        body: body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: uniqueTag,
        data: { url: urlToUse, slot: data.slot || 'night-1' },
        renotify: true,
        requireInteraction: true,
      } as any).catch(() => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, { body: body, icon: '/icons/icon-192.png', tag: uniqueTag });
        }
      });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body: body, icon: '/icons/icon-192.png', tag: uniqueTag });
    }
  }
}

// ── Global Service Worker Message Listener (Active as soon as client loads) ──
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'GET_STATE') {
      navigator.serviceWorker.controller?.postMessage({
        type: 'SYNC_STATE',
        submittedToday: hasSubmittedToday(),
      });
    } else if (event.data?.type === 'PUSH_RECEIVED') {
      triggerInAppOrNativeNotification({
        ...event.data,
        suppressNative: typeof document !== 'undefined' && document.visibilityState !== 'visible',
      });
    }
  });
}

export async function registerServiceWorker(): Promise<void> {
  const reg = await ensureSwRegistered();
  if (!reg) return;

  // Tell SW if page is visible
  function notifySwVisibility() {
    const type = document.visibilityState === 'visible' ? 'PAGE_VISIBLE' : 'PAGE_HIDDEN';
    navigator.serviceWorker.controller?.postMessage({ type });
  }
  notifySwVisibility();
  document.addEventListener('visibilitychange', notifySwVisibility);

  // Sync user email and userId to service worker
  function syncSwUser() {
    const email = localStorage.getItem('auth_email') || '';
    const userId = localStorage.getItem('auth_user_id') || '';
    navigator.serviceWorker.controller?.postMessage({ type: 'SYNC_USER', email, userId });
  }
  syncSwUser();

  // Sync settings to service worker
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

  // Browser events replace the former 3-second localStorage polling loop.
  const syncFromStorage = (event?: StorageEvent) => {
    if (!event || event.key === 'auth_email' || event.key === 'auth_user_id') syncSwUser();
    if (!event || event.key === 'push_notifications_disabled') syncSwSettings();
  };
  window.addEventListener('storage', syncFromStorage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncFromStorage();
  });

  // Fire-and-forget: sync push subscription with DB if permission is granted
  const perm = getNotificationPermission();
  if (perm === 'granted') {
    if (localStorage.getItem('push_notifications_disabled') !== 'true') {
      subscribeToPush().catch(() => {});
    }
  }
}

// ── Push subscription ──
let _subscribeLock: Promise<boolean> | null = null;

const FALLBACK_VAPID_PUBLIC_KEY = 'BAarbQem_U8AvpVQFhZuwDGpEML2AV7iG-Ts4EVRyM3PpJXDS1EevhEE5E85OUv56u9BiTo_27qo8nLW_JOMwtw';

export async function subscribeToPush(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('push_notifications_disabled');
    localStorage.removeItem('notifications_simulated_granted');
    try {
      const email = localStorage.getItem('auth_email') || '';
      const userId = localStorage.getItem('auth_user_id') || '';
      navigator.serviceWorker.controller?.postMessage({
        type: 'SYNC_SETTINGS',
        userDisabled: false,
      });
      navigator.serviceWorker.controller?.postMessage({ type: 'SYNC_USER', email, userId });
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

    let publicKey = '';
    try {
      const res = await getVapidPublicKey({});
      publicKey = res?.publicKey || '';
    } catch (e) {
      console.warn('[Push] getVapidPublicKey failed, using default public key:', e);
    }

    if (!publicKey) {
      publicKey = FALLBACK_VAPID_PUBLIC_KEY;
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
      localStorage.removeItem('notifications_simulated_granted');
      try {
        navigator.serviceWorker.controller?.postMessage({
          type: 'SYNC_SETTINGS',
          userDisabled: true,
        });
      } catch {}
    }
    const reg = await ensureSwRegistered();
    if (!reg) return true;

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
  _reminderTimers.forEach(t => clearTimeout(t));
  _reminderTimers = [];

  const config = await getPwNotificationConfig();
  if (segment === 'PW' && !config.enabled) return;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SUBMITTED_TODAY',
      submittedToday,
    });
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

  if (submittedToday) return;
  const configPerm = getNotificationPermission();
  if (configPerm === 'unsupported' || configPerm !== 'granted') return;

  const now = new Date();
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

    if (istHour < time.hour || (istHour === time.hour && istMinute < time.minute)) {
      // Future today
    } else {
      targetIST.setUTCDate(targetIST.getUTCDate() + 1);
    }

    const targetLocal = new Date(targetIST.getTime() - istOffset);
    const delay = targetLocal.getTime() - now.getTime();

    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      const timer = setTimeout(async () => {
        const liveConfig = await getPwNotificationConfig().catch(() => null);
        if (!liveConfig || !liveConfig.enabled) return;
        if (typeof window !== 'undefined' && localStorage.getItem('push_notifications_disabled') === 'true') return;

        const hasSub = await checkPushSubscriptionStatus();
        if (!hasSub) return;

        if (!hasSubmittedToday()) {
          triggerInAppOrNativeNotification({
            id: `local-${slot}-${Date.now()}`,
            title: liveConfig.title,
            body: liveConfig.body,
            slot,
            url: '/sadhana',
          });
        }
      }, delay);
      _reminderTimers.push(timer);
    }
  }
}

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
