import { z } from 'zod';
import { createEndpoint, PushSubscriptions } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Subscribe to Web Push notifications',
  authenticated: true,
  inputSchema: z.object({
    endpoint: z.string(),
    p256dh: z.string(),
    auth: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.enum(['created', 'updated']),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    const userId = context.user.id;
    const email = context.user.email || '';
    const now = new Date().toISOString();

    // Check if this exact endpoint already exists for this user
    const existing = await PushSubscriptions.findOne({
      filters: { endpoint: input.endpoint, user: userId },
    });

    if (existing) {
      // Update keys on existing record
      await PushSubscriptions.update({
        id: existing.id,
        record: { p256DhKey: input.p256dh, authKey: input.auth, email, updatedAt: now },
      });
      return { success: true, action: 'updated' as const };
    }

    // Same browser endpoint may have been saved earlier under another user
    // key. Remove those stale rows so one Chrome profile receives one push.
    const existingEndpointRows = await PushSubscriptions.findAll({
      filters: { endpoint: input.endpoint },
      limit: 100,
    });
    for (const sub of existingEndpointRows.records) {
      await PushSubscriptions.delete({ id: sub.id });
    }

    // Keep the user's other devices subscribed. Registering a laptop must
    // not silently disable reminders on their phone.

    // Create new subscription
    await PushSubscriptions.create({
      record: {
        endpoint: input.endpoint,
        user: userId,
        email,
        p256DhKey: input.p256dh,
        authKey: input.auth,
        createdAt: now,
        updatedAt: now,
      },
    });

    return { success: true, action: 'created' as const };
  },
});
