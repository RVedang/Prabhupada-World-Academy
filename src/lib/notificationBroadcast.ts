/**
 * Notification broadcast store.
 *
 * Primary store: Firestore document `meta/latestBroadcast`
 * — shared across ALL server instances on Firebase App Hosting.
 *
 * Fallback: in-process memory + /tmp file
 * — used when Firestore is unavailable (local dev, cold starts).
 */

import fs from 'fs';
import path from 'path';

export interface BroadcastData {
  id: string;
  title: string;
  body: string;
  slot: string;
  sentAt: number;
  senderEmail?: string;
  inviteeIds?: string[];
  inviteeEmails?: string[];
  url?: string;
  segment?: string;
}

// In-process memory cache so the long-poll tight loop doesn't hammer Firestore
let _memCache: BroadcastData | null = null;
let _memCacheTime = 0;
const MEM_CACHE_TTL_MS = 500; // refresh from Firestore at most every 500ms

let _idCounter = 0;
const BROADCAST_FILE = path.join('/tmp', 'pw-latest-broadcast.json');

// Lazy Firestore reference — avoids import-time side effects
function getDb(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getFirestoreDb } = require('./app-backend-sdk');
    return getFirestoreDb?.() ?? null;
  } catch {
    return null;
  }
}

const FIRESTORE_DOC = { collection: 'meta', doc: 'latestBroadcast' };

export async function storeBroadcast(
  title: string,
  body: string,
  slot: string,
  senderEmail?: string,
  id?: string,
  inviteeIds?: string[],
  url?: string,
  inviteeEmails?: string[],
  segment?: string,
): Promise<void> {
  const broadcast: BroadcastData = {
    id: id || (String(Date.now()) + '_' + String(++_idCounter)),
    title,
    body,
    slot,
    sentAt: Date.now(),
    senderEmail,
    inviteeIds,
    inviteeEmails,
    url,
    segment,
  };

  // Update in-process cache immediately
  _memCache = broadcast;
  _memCacheTime = Date.now();

  // Await shared persistence before the request ends. App Hosting can stop
  // background work once a response is sent.
  const db = getDb();
  if (db) {
    await db.collection(FIRESTORE_DOC.collection)
      .doc(FIRESTORE_DOC.doc)
      .set(broadcast);
  }

  // Also write /tmp as local fallback
  try {
    fs.writeFileSync(BROADCAST_FILE, JSON.stringify(broadcast), 'utf8');
  } catch {
    // Non-critical — Firestore is the primary store
  }
}

export async function getLatestBroadcast(): Promise<BroadcastData | null> {
  // Return in-process cache if fresh enough (avoids Firestore reads on every poll tick)
  if (_memCache && (Date.now() - _memCacheTime) < MEM_CACHE_TTL_MS) {
    return _memCache;
  }

  // Try Firestore first (shared across all instances)
  const db = getDb();
  if (db) {
    try {
      const snap = await db
        .collection(FIRESTORE_DOC.collection)
        .doc(FIRESTORE_DOC.doc)
        .get();
      if (snap.exists) {
        const data = snap.data() as BroadcastData;
        _memCache = data;
        _memCacheTime = Date.now();
        return data;
      }
      return null;
    } catch (e) {
      console.warn('[Notifications] Firestore read failed, falling back to /tmp:', e);
    }
  }

  // Fallback: /tmp file (single-instance or local dev)
  try {
    if (!fs.existsSync(BROADCAST_FILE)) return null;
    const raw = fs.readFileSync(BROADCAST_FILE, 'utf8');
    const data = JSON.parse(raw) as BroadcastData;
    _memCache = data;
    _memCacheTime = Date.now();
    return data;
  } catch {
    return null;
  }
}
