/**
 * Notification broadcast via /tmp file.
 * Works across Next.js route isolation (worker threads, separate VM sandboxes).
 * Writing to /tmp does NOT trigger Next.js hot-reload (outside the watched src/).
 */

import fs from 'fs';
import path from 'path';

const BROADCAST_FILE = path.join('/tmp', 'pw-latest-broadcast.json');

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

let _idCounter = 0;

export function storeBroadcast(
  title: string,
  body: string,
  slot: string,
  senderEmail?: string,
  id?: string,
  inviteeIds?: string[],
  url?: string,
  inviteeEmails?: string[],
  segment?: string,
): void {
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
  try {
    fs.writeFileSync(BROADCAST_FILE, JSON.stringify(broadcast), 'utf8');
    console.log('[Notifications] Stored broadcast to', BROADCAST_FILE, ':', broadcast.id, title);
  } catch (e) {
    console.error('[Notifications] Failed to write broadcast file:', e);
  }
}

export function getLatestBroadcast(): BroadcastData | null {
  try {
    if (!fs.existsSync(BROADCAST_FILE)) return null;
    const raw = fs.readFileSync(BROADCAST_FILE, 'utf8');
    return JSON.parse(raw) as BroadcastData;
  } catch {
    return null;
  }
}
