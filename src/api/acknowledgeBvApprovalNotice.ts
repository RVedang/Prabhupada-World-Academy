import { z } from 'zod';
import { createEndpoint, Users } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';
import { profileCacheKey } from './getUserProfile';

export default createEndpoint({
  description: 'Acknowledge Bhakti Vriksha approval welcome notice',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    
    await Users.update({
      id: context.user.id,
      record: {
        pendingBvApprovalNotice: false,
      }
    });

    serverCacheInvalidate(profileCacheKey(context.user.id));
    return { success: true };
  },
});
