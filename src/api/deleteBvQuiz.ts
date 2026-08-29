import { z } from 'zod';
import { createEndpoint, BvQuizzes, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Delete a BV quiz',
  authenticated: true,
  inputSchema: z.object({ quizId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    if (!context.user) throw new Error('Unauthorized');
    const role = String(context.user.role || '').toUpperCase().replace(/\s+/g, '_');
    const canManageQuizzes = context.user.isBvsl ||
      role === 'BVSL' ||
      context.user.isBvSubFacilitator ||
      role === 'RGSF';
    if (!canManageQuizzes) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only RGF or RGSF can delete quizzes' });
    }
    await BvQuizzes.delete({ id: input.quizId });
    return { success: true };
  },
});
