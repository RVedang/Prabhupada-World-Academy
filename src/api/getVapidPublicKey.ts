import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Returns the VAPID public key for Web Push subscription',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.object({ publicKey: z.string() }),
  execute: async () => {
    const publicKey =
      process.env.APP_VAPID_PUBLIC_KEY ||
      process.env.ZITE_VAPID_PUBLIC_KEY ||
      process.env.VAPID_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      'BGhWqw3AsssekjkeRVDrDI-hJZh8etMXz9AOr8gVhgKKuYB5VBke2IPxklX3v9_8PbBJxWGyhy0v1kMVWO51qbE';
    return { publicKey };
  },
});
