import { z } from 'zod';
import { createEndpoint, Meetings, PushSubscriptions, Users, AppError } from '@/lib/backend-sdk';
import { storeBroadcast } from '@/lib/notificationBroadcast';

// ── VAPID + Web Push helpers (pure Web Crypto — no npm packages) ──

function base64UrlEncode(buf: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateVapidJwt(audience: string, subject: string, privateKeyBase64: string, publicKeyBase64: string): Promise<{ token: string; publicKeyBytes: Uint8Array }> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)).buffer as ArrayBuffer);
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const rawPrivKey = base64UrlDecode(privateKeyBase64);
  const jwk = {
    kty: 'EC' as const,
    crv: 'P-256' as const,
    x: base64UrlEncode(rawPrivKey.slice(0, 32).buffer),
    y: '',
    d: base64UrlEncode(rawPrivKey.buffer as ArrayBuffer),
  };

  const rawPubKey = base64UrlDecode(publicKeyBase64);
  jwk.x = base64UrlEncode(rawPubKey.slice(1, 33).buffer as ArrayBuffer);
  jwk.y = base64UrlEncode(rawPubKey.slice(33, 65).buffer as ArrayBuffer);

  const signingKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    signingKey,
    new TextEncoder().encode(unsignedToken),
  );

  const sigBytes = new Uint8Array(sig);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32);
  } else {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  }
  const rawSig = new Uint8Array(64);
  rawSig.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
  rawSig.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));

  const token = `${unsignedToken}.${base64UrlEncode(rawSig.buffer as ArrayBuffer)}`;
  return { token, publicKeyBytes: rawPubKey };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const saltBuf = salt.length ? (salt.buffer as ArrayBuffer) : new ArrayBuffer(32);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', key, saltBuf));
  const prkKey = await crypto.subtle.importKey('raw', prk.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const infoLen = new Uint8Array([...info, 1]);
  const okm = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, infoLen.buffer as ArrayBuffer));
  return okm.slice(0, length);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(len);
  let offset = 0;
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
  return result;
}

async function encryptPayload(
  p256dhKey: string,
  authSecret: string,
  payload: string,
): Promise<{ body: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  const clientPublicKey = base64UrlDecode(p256dhKey);
  const clientAuth = base64UrlDecode(authSecret);

  const localKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  const clientKey = await crypto.subtle.importKey('raw', clientPublicKey.buffer as ArrayBuffer, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, localKeyPair.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0');
  const prkCombine = await hkdf(clientAuth, sharedSecret, authInfo, 32);

  const keyInfoBuf = concat(
    new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
    new Uint8Array([0, 65]),
    clientPublicKey,
    new Uint8Array([0, 65]),
    localPublicKeyRaw,
  );
  const contentKey = await hkdf(salt, prkCombine, keyInfoBuf, 16);

  const nonceInfoBuf = concat(
    new TextEncoder().encode('Content-Encoding: nonce\0'),
    new Uint8Array([0, 65]),
    clientPublicKey,
    new Uint8Array([0, 65]),
    localPublicKeyRaw,
  );
  const nonce = await hkdf(salt, prkCombine, nonceInfoBuf, 12);

  const paddedPayload = concat(new TextEncoder().encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', contentKey.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer }, aesKey, paddedPayload.buffer as ArrayBuffer));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const body = concat(salt, rs, new Uint8Array([65]), localPublicKeyRaw, encrypted);

  return { body, salt, localPublicKey: localPublicKeyRaw };
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payloadStr: string,
  vapidPrivate: string,
  vapidPublic: string,
): Promise<boolean> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const { token, publicKeyBytes } = await generateVapidJwt(audience, 'mailto:admin@prabhupadaworld.org', vapidPrivate, vapidPublic);
  const { body } = await encryptPayload(sub.p256dh, sub.auth, payloadStr);

  const vapidPubB64 = base64UrlEncode(publicKeyBytes.buffer as ArrayBuffer);

  const resp = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(body.length),
      TTL: '86400',
      Authorization: `vapid t=${token}, k=${vapidPubB64}`,
    },
    body: body.buffer as ArrayBuffer,
  });

  return resp.status >= 200 && resp.status < 300;
}

export default createEndpoint({
  description: 'Send meeting reminder notifications to invitees',
  authenticated: true,
  requiredCapabilities: 'meetings.manage',
  inputSchema: z.object({
    meetingId: z.string().min(1),
    reminderType: z.enum(['TEN_MINUTES', 'ONE_MINUTE']).optional().default('TEN_MINUTES'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    sent: z.number(),
    failed: z.number(),
    skipped: z.number(),
    message: z.string(),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    // Load meeting details
    const meeting = await Meetings.findOne({ id: input.meetingId });
    if (!meeting) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Meeting not found' });
    }

    // Check if the reminder is already sent to avoid duplicate processing
    if (input.reminderType === 'ONE_MINUTE') {
      if (meeting.notification1mSent) {
        return { success: true, sent: 0, failed: 0, skipped: 0, message: '1-minute reminder already sent.' };
      }
    } else {
      if (meeting.notification10mSent) {
        return { success: true, sent: 0, failed: 0, skipped: 0, message: '10-minute reminder already sent.' };
      }
    }

    const inviteeIds = meeting.inviteeUserIds || [];
    if (inviteeIds.length === 0) {
      return { success: true, sent: 0, failed: 0, skipped: 0, message: 'No invitees to notify.' };
    }

    // Get all subscriptions
    const { records: subs } = await PushSubscriptions.findAll({ limit: 2000 });

    // Filter subscriptions for target invitee user IDs
    const targetSubs = subs.filter(sub => {
      const uid = Array.isArray(sub.user) ? sub.user[0] : sub.user;
      return uid && inviteeIds.includes(uid);
    });

    // Format meeting start time for notifications
    const scheduledDateStr = meeting.scheduledAt.includes('T') && !meeting.scheduledAt.endsWith('Z') && !meeting.scheduledAt.includes('+')
      ? `${meeting.scheduledAt}+05:30`
      : meeting.scheduledAt;

    const startStr = new Date(scheduledDateStr).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    let title = '';
    let body = '';
    if (input.reminderType === 'ONE_MINUTE') {
      title = `📅 The meeting is starting`;
      body = `"${meeting.title}" starts in 1 minute. Click to open.`;
    } else {
      title = `📅 Meeting starting in 10 minutes!`;
      body = `"${meeting.title}" starts at ${startStr} IST. Click to open.`;
    }

    const broadcastId = `meeting-${meeting.id}-${input.reminderType.toLowerCase()}-${Date.now()}`;

    const targetUrl = meeting.locationOrLink && meeting.locationOrLink.trim()
      ? (meeting.locationOrLink.trim().startsWith('http') ? meeting.locationOrLink.trim() : `https://${meeting.locationOrLink.trim()}`)
      : `/dashboard#meetings`;

    const payload = {
      id: broadcastId,
      title,
      body,
      slot: 'meeting',
      url: targetUrl,
      inviteeIds,
    };
    const payloadStr = JSON.stringify(payload);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    const vapidPrivate =
      process.env.APP_VAPID_PRIVATE_KEY ||
      process.env.ZITE_VAPID_PRIVATE_KEY ||
      process.env.VAPID_PRIVATE_KEY ||
      '';
    const vapidPublic =
      process.env.APP_VAPID_PUBLIC_KEY ||
      process.env.ZITE_VAPID_PUBLIC_KEY ||
      process.env.VAPID_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      'BAarbQem_U8AvpVQFhZuwDGpEML2AV7iG-Ts4EVRyM3PpJXDS1EevhEE5E85OUv56u9BiTo_27qo8nLW_JOMwtw';

    if (targetSubs.length > 0 && (!vapidPrivate || !vapidPublic)) {
      throw new AppError({ code: 'INTERNAL_ERROR', message: 'VAPID keys are not configured' });
    }

    if (targetSubs.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < targetSubs.length; i += batchSize) {
        const batch = targetSubs.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (sub) => {
            const ok = await sendPush(
              { endpoint: sub.endpoint || '', p256dh: sub.p256DhKey || '', auth: sub.authKey || '' },
              payloadStr,
              vapidPrivate,
              vapidPublic,
            );
            return ok;
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) sent++;
          else failed++;
        }
      }
    } else {
      skipped = inviteeIds.length;
    }

    // Write to broadcast file for long-polling tabs (participant-only)
    try {
      const inviteeEmails = (meeting.invitees || [])
        .map((inv: any) => (inv.email || '').toLowerCase())
        .filter(Boolean);
      storeBroadcast(title, body, 'meeting', undefined, broadcastId, inviteeIds, targetUrl, inviteeEmails);
    } catch (e) {
      console.warn('[Meeting Notification] Store broadcast failed:', e);
    }

    // Update meeting doc in database so it is marked as sent
    const dbUpdate: any = {
      updatedAt: new Date().toISOString(),
      lastNotificationSentAt: new Date().toISOString(),
    };

    if (input.reminderType === 'ONE_MINUTE') {
      dbUpdate.notification1mSent = true;
    } else {
      dbUpdate.notification10mSent = true;
      dbUpdate.notificationSent = true; // backward compatibility
    }

    await Meetings.update({
      id: meeting.id,
      record: dbUpdate,
    });

    return {
      success: true,
      sent,
      failed,
      skipped,
      message: `Meeting notification successfully dispatched to ${sent} active devices!`,
    };
  },
});
