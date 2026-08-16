import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Returns the VAPID public key for Web Push subscription',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ publicKey: z.string() }),
  execute: async () => {
    const publicKey =
      process.env.APP_VAPID_PUBLIC_KEY ||
      process.env.ZITE_VAPID_PUBLIC_KEY ||
      process.env.VAPID_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      '';
    return { publicKey };
  },
});
