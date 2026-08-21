import { NextRequest, NextResponse } from 'next/server';
import { getLatestBroadcast } from '@/lib/notificationBroadcast';
import { Users } from '@/lib/backend-sdk';

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

  const current = await getLatestBroadcast();

  async function shouldDeliver(broadcast: NonNullable<typeof current>): Promise<boolean> {
    // If broadcast has an inviteeIds/inviteeEmails list (meeting notification), only deliver to invitees.
    const hasInviteeList =
      (broadcast.inviteeIds && broadcast.inviteeIds.length > 0) ||
      (broadcast.inviteeEmails && broadcast.inviteeEmails.length > 0);

    if (hasInviteeList) {
      const isInvitedById = userId && broadcast.inviteeIds?.includes(userId);
      const isInvitedByEmail = email && broadcast.inviteeEmails?.includes(email);
      return !!(isInvitedById || isInvitedByEmail);
    }

    // General segment check: if the broadcast specifies a segment (FOLK or PW), check if user belongs to that segment
    const targetSegment = broadcast.segment;
    if (targetSegment && (userId || email)) {
      const filter = userId ? { id: userId } : { email };
      const { records: userRecords } = await Users.findAll({ filters: filter as any, limit: 1 }).catch(() => ({ records: [] }));
      if (userRecords.length > 0) {
        const u = userRecords[0];
        const uSegment = (u.segment || '').toUpperCase();
        const uEmail = (u.email || '').toLowerCase();
        const uName = (u.fullName || '').toUpperCase();

        const isFolkUser = uSegment === 'FOLK' || 
                           uEmail.includes('folk.org') || 
                           uEmail.includes('gaurmandal') || 
                           uEmail.includes('superguide') || 
                           uName.includes('FOLK') || 
                           uName.includes('GAURMANDAL') || 
                           !!u.residencyId || 
                           !!u.isFolkLead;

        const isPwUser = uSegment === 'PW' || 
                         !!u.isPrabhupadaWorldUser || 
                         uEmail.includes('prabhupadaworld') || 
                         uEmail.includes('hrvd') || 
                         uEmail.includes('srilaprabhupadaworld') || 
                         uName.includes('PW') || 
                         uName.includes('PRABHUPADA') || 
                         uName.includes('HIRANYAVARNA');

        if (targetSegment === 'PW') {
          if (isFolkUser && !isPwUser) return false;
          if (uSegment === 'FOLK') return false;
        } else if (targetSegment === 'FOLK') {
          if (isPwUser && !isFolkUser) return false;
          if (uSegment === 'PW') return false;
        }
      }
    }

    return true;
  }

  // If this is the initial registration poll, set lastId to current ID and return HEARTBEAT
  if (lastId === '') {
    return NextResponse.json({ type: 'HEARTBEAT', id: current?.id || 'initial' });
  }

  // Check immediately — return any new broadcast the client hasn't seen
  if (current && current.id !== lastId) {
    if (!await shouldDeliver(current)) {
      return NextResponse.json({ type: 'HEARTBEAT', id: current.id });
    }
    return NextResponse.json({ type: 'PUSH_RECEIVED', ...current });
  }

  // Long-poll: wait up to 25s for a new broadcast
  const MAX_WAIT_MS = 25_000;
  const POLL_INTERVAL_MS = 500;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    const latest = await getLatestBroadcast();
    if (latest && latest.id !== lastId) {
      if (!await shouldDeliver(latest)) {
        return NextResponse.json({ type: 'HEARTBEAT', id: latest.id });
      }
      return NextResponse.json({ type: 'PUSH_RECEIVED', ...latest });
    }
  }

  // Timeout — return heartbeat so client reconnects immediately
  return NextResponse.json({ type: 'HEARTBEAT' });
}
