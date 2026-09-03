import { z } from 'zod';
import { createEndpoint, BvQuizzes, BvQuizSubmissions, AppError } from '@/lib/backend-sdk';
import {
  findScopedQuizGroup,
  getQuizGroupsForUser,
  requireQuizContentManager,
  resolveQuizDepartment,
} from '@/lib/bvQuizAccess';

export default createEndpoint({
  description: 'Delete a BV quiz',
  authenticated: true,
  inputSchema: z.object({
    quizId: z.string(),
    department: z.literal('FOLK').optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    const quiz = await BvQuizzes.findOne({ id: input.quizId });
    if (!quiz) throw new AppError({ code: 'NOT_FOUND', message: 'Quiz not found' });

    if (await resolveQuizDepartment(quiz, 'FOLK') !== 'FOLK') {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only FOLK quizzes can be managed' });
    }
    requireQuizContentManager(context.user, 'FOLK');

    const groups = await getQuizGroupsForUser(context.user, 'FOLK');
    if (!findScopedQuizGroup(groups, quiz.group)) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You can delete quizzes only from your assigned FOLK groups' });
    }

    const { records: submissions } = await BvQuizSubmissions.findAll({
      filters: { quiz: input.quizId },
      limit: 5000,
      fields: ['id'],
    });
    await Promise.all(submissions.map(submission => BvQuizSubmissions.delete({ id: submission.id })));
    await BvQuizzes.delete({ id: input.quizId });
    return { success: true };
  },
});
