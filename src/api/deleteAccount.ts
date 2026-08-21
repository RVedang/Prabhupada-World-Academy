import { z } from 'zod';
import { createEndpoint, Users } from '@/lib/backend-sdk';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export default createEndpoint({
  description: 'Permanently delete user account so they can re-register with the same email',
  authenticated: true,
  inputSchema: z.object({
    confirm: z.boolean().optional(),
    confirmText: z.string().optional(),
    email: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!input.confirm && input.confirmText !== 'DELETE') return { success: false };

    // 1. Delete from Firebase Authentication if Admin SDK is initialized
    if (getApps().length > 0) {
      try {
        await getAuth().deleteUser(context.user!.id);
        console.log(`[deleteAccount] Firebase Auth user deleted successfully: ${context.user!.id}`);
      } catch (authError: any) {
        console.warn(`[deleteAccount] Firebase Auth delete failed or user not found: ${authError?.message || authError}`);
      }
    }

    // 2. Hard delete — removes the record entirely so they can re-register
    await Users.delete({ id: context.user!.id });
    return { success: true };
  },
});
