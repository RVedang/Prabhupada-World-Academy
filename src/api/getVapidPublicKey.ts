import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Returns the VAPID public key for Web Push subscription',
  public: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ publicKey: z.string() }),
  execute: async () => {
    const publicKey =
      process.env.APP_VAPID_PUBLIC_KEY ||
      process.env.ZITE_VAPID_PUBLIC_KEY ||
      process.env.VAPID_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      'BAarbQem_U8AvpVQFhZuwDGpEML2AV7iG-Ts4EVRyM3PpJXDS1EevhEE5E85OUv56u9BiTo_27qo8nLW_JOMwtw';
    return { publicKey };
  },
});
