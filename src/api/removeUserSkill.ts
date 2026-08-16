import { z } from 'zod';
import { createEndpoint, UserSkills, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Remove a skill from a user',
  authenticated: true,
  inputSchema: z.object({
    userSkillId: z.string().optional(),
    rowId: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const id = input.userSkillId || input.rowId;
    if (!id) throw new AppError({ code: 'BAD_REQUEST', message: 'userSkillId is required' });

    const record = await UserSkills.findOne({ id });
    if (!record) throw new AppError({ code: 'NOT_FOUND', message: 'User skill record not found' });

    await UserSkills.delete({ id });

    return { success: true };
  },
});
