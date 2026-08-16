import { z } from 'zod';
import { createEndpoint, Users, ResidencyTransferRequests, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';

export default createEndpoint({
  description: 'Request to leave current residency (requires guide approval)',
  authenticated: true,
  inputSchema: z.object({ email: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');

    const user = await Users.findOne({ id: context.user.id, fields: ['id', 'residency'] });
    if (!user) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });

    const residencyId = Array.isArray(user.residency) ? user.residency[0] : user.residency;
    if (!residencyId) throw new AppError({ code: 'BAD_REQUEST', message: 'You are not in a residency' });

    // Check for existing pending request
    const existing = await ResidencyTransferRequests.findOne({ filters: { user: context.user.id, status: 'Pending' } });
    if (existing) throw new AppError({ code: 'CONFLICT', message: 'You already have a pending residency request' });

    await ResidencyTransferRequests.create({
      record: {
        user: context.user.id,
        fromResidency: residencyId,
        toResidency: null,
        notes: 'Request to leave residency and become non-resident',
        status: 'Pending',
        requestedAt: new Date().toISOString(),
      },
    });

    serverCacheInvalidate(`user_profile:${context.user.id}`);

    return { success: true };
  },
});
