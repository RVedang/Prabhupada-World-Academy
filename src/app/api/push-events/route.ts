import { NextRequest, NextResponse } from 'next/server';
import { broadcastsAfter, getRecentBroadcasts, type BroadcastData } from '@/lib/notificationBroadcast';
import { Users } from '@/lib/backend-sdk';
import { getNotificationDepartment } from '@/lib/notificationDepartment';

/**
 * GET /api/push-events
 *
 * Long-poll endpoint for real-time push notification delivery.
 * Client sends `lastId`, `email`, and `userId` params; server waits up to 25s for a newer broadcast.
 * For meeting notifications, only delivers to users whose ID/email is in invitee list.
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lastId = searchParams.get('lastId') || '';
  const email = (searchParams.get('email') || '').toLowerCase();
  const userId = searchParams.get('userId') || '';

  const current = await getRecentBroadcasts();

  async function shouldDeliver(broadcast: BroadcastData): Promise<boolean> {
    // Exclude sender
    if (broadcast.senderEmail && email && email === broadcast.senderEmail.toLowerCase()) {
      return false;
    }

    // If broadcast has an inviteeIds/inviteeEmails list (meeting notification), only deliver to invitees.
    const hasInviteeList =
      Array.isArray(broadcast.inviteeIds) || Array.isArray(broadcast.inviteeEmails);

    if (hasInviteeList) {
      const isInvitedById = userId && broadcast.inviteeIds?.includes(userId);
      const isInvitedByEmail = email && broadcast.inviteeEmails?.includes(email);
      return !!(isInvitedById || isInvitedByEmail);
    }

    // General segment check: if the broadcast specifies a segment (FOLK or PW), check if user belongs to that segment
    const targetSegment = broadcast.segment;
    if (targetSegment && (userId || email)) {
      let u: any = null;
      if (userId) {
        u = await Users.findOne({ id: userId }).catch(() => null);
      }
      if (!u && email) {
        const { records: userRecords } = await Users.findAll({ filters: { email }, limit: 1 }).catch(() => ({ records: [] }));
        u = userRecords[0] || null;
      }

      return !!u && getNotificationDepartment(u) === targetSegment;
    }

    return !targetSegment;
  }

  // If this is the initial registration poll, set lastId to current ID and return HEARTBEAT
  if (lastId === '') {
    return NextResponse.json({ type: 'HEARTBEAT', id: current.at(-1)?.id || `cursor-${Date.now()}` });
  }

  async function nextResponse(broadcasts: BroadcastData[]) {
    const pending = broadcastsAfter(broadcasts, lastId);
    for (const broadcast of pending) {
      if (await shouldDeliver(broadcast)) {
        // Recipient lists are server-side routing data, not client content.
        const { inviteeIds: _ids, inviteeEmails: _emails, ...message } = broadcast;
        return NextResponse.json({ type: 'PUSH_RECEIVED', ...message });
      }
    }
    if (pending.length) return NextResponse.json({ type: 'HEARTBEAT', id: pending.at(-1)!.id });
    return null;
  }
  const immediate = await nextResponse(current);
  if (immediate) return immediate;

  // Long-poll: wait up to 25s for a new broadcast
  const MAX_WAIT_MS = 25_000;
  const POLL_INTERVAL_MS = 500;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    const response = await nextResponse(await getRecentBroadcasts());
    if (response) return response;
  }

  // Timeout — return heartbeat so client reconnects immediately
  return NextResponse.json({ type: 'HEARTBEAT' });
}
