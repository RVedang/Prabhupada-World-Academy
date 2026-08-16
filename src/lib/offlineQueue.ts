import { toast } from 'sonner';

export interface PendingQueueItem {
  id: string;
  type: 'sadhana_entry' | 'bv_registration' | 'role_update';
  payload: any;
  timestamp: number;
}

const QUEUE_STORAGE_KEY = 'pwa_offline_pending_queue';

export function getOfflineQueue(): PendingQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflinePayload(type: PendingQueueItem['type'], payload: any): string {
  const item: PendingQueueItem = {
    id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    payload,
    timestamp: Date.now(),
  };

  const queue = getOfflineQueue();
  queue.push(item);
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    toast.info('Saved locally. Will auto-sync when network connection is restored.', {
      duration: 4000,
    });
  } catch (err) {
    console.error('Failed to save offline payload:', err);
  }
  return item.id;
}

export function clearOfflineQueue() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  }
}

export async function processOfflineQueue(syncCallback: (item: PendingQueueItem) => Promise<boolean>) {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const remaining: PendingQueueItem[] = [];
  let syncedCount = 0;

  for (const item of queue) {
    try {
      const success = await syncCallback(item);
      if (success) {
        syncedCount++;
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remaining));
    if (syncedCount > 0) {
      toast.success(`Successfully synced ${syncedCount} offline record(s)!`);
    }
  } catch (err) {
    console.error('Failed to update offline queue after sync:', err);
  }
}

// Auto-register window online listener if client-side
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const queue = getOfflineQueue();
    if (queue.length > 0) {
      toast.info(`Back online! Syncing ${queue.length} pending record(s)...`);
    }
  });
}
