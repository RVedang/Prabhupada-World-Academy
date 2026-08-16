import { NextRequest, NextResponse } from 'next/server';
import { getLatestBroadcast } from '@/lib/notificationBroadcast';
import { PushSubscriptions, SadhanaEntries, Users } from '@/lib/backend-sdk';

/**
 * GET /api/push-events
 *
 * Long-poll endpoint for real-time push notification delivery.
 * Client sends `lastId` and `userId` params; server waits up to 25s for a newer broadcast.
 * For meeting notifications, only delivers to users whose ID is in inviteeIds.
 *
 * This avoids streaming/SSE controller issues with Next.js webpack bundling.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lastId = searchParams.get('lastId') || '';
  const email = (searchParams.get('email') || '').toLowerCase();
  const userId = searchParams.get('userId') || '';
  const current = getLatestBroadcast();

  async function shouldDeliver(broadcast: NonNullable<typeof current>): Promise<boolean> {
    // If sender is the current user, skip
    const senderEmail = (broadcast.senderEmail || '').toLowerCase();
    if (email && senderEmail && email === senderEmail) return false;

    // If broadcast has an inviteeIds/inviteeEmails list (meeting notification), only deliver to invitees.
    const hasInviteeList =
      (broadcast.inviteeIds && broadcast.inviteeIds.length > 0) ||
      (broadcast.inviteeEmails && broadcast.inviteeEmails.length > 0);

    if (hasInviteeList) {
      const isInvitedById = userId && broadcast.inviteeIds?.includes(userId);
      const isInvitedByEmail = email && broadcast.inviteeEmails?.includes(email);
      return !!(isInvitedById || isInvitedByEmail);
    }

    // Verify if the user has an active push subscription record
    if (userId || email) {
      const { records: userSubs } = await PushSubscriptions.findAll({ limit: 1000 }).catch(() => ({ records: [] }));
      const hasSub = userSubs.some(s => {
        const subUid = Array.isArray(s.user) ? s.user[0] : s.user;
        const subEmail = (s.email || '').toLowerCase();
        return (userId && subUid === userId) || (email && subEmail === email);
      });
      if (!hasSub) return false;
    }

    // Also check if they already submitted sadhana for the target date
    const isSadhanaBroadcast = (broadcast.slot === 'night-1' || broadcast.slot === 'night-2' || broadcast.slot === 'morning');
    if (isSadhanaBroadcast && (userId || email)) {
      const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
      const todayDate = istNow.toISOString().slice(0, 10);
      const yesterdayDate = new Date(Date.now() + 5.5 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
      const checkDate = broadcast.slot === 'morning' ? yesterdayDate : todayDate;

      const userFilters = userId ? { user: userId } : { email };
      const { records: userEntries } = await SadhanaEntries.findAll({
        filters: { entryDate: checkDate, ...userFilters } as any,
        limit: 1,
      }).catch(() => ({ records: [] }));

      if (userEntries.length > 0) {
        return false;
      }
    }

    // General segment check: if the broadcast has a segment (FOLK or PW), check if user is in that segment
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
                         uEmail.includes('vdnd') || 
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
  const POLL_INTERVAL_MS = 200;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    const latest = getLatestBroadcast();
    if (latest && latest.id !== lastId) {
      if (!await shouldDeliver(latest)) {
        return NextResponse.json({ type: 'HEARTBEAT', id: latest.id });
      }
      return NextResponse.json({ type: 'PUSH_RECEIVED', ...latest });
    }
  }

  // Timeout — return empty so client reconnects
  return NextResponse.json({ type: 'HEARTBEAT' });
}
