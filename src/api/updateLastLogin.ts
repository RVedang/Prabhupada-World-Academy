import { z } from 'zod';
import { createEndpoint, Users } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Update last login timestamp',
  authenticated: true,
  inputSchema: z.object({ userId: z.string().optional() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ context }) => {
    await Users.update({
      id: context.user!.id,
      record: { lastLoginAt: new Date().toISOString() },
    });
    return { success: true };
  },
});
