import { z } from 'zod';
import { createEndpoint, BvQuizzes, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get a single BV quiz with all questions for taking',
  authenticated: true,
  inputSchema: z.object({ quizId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const quiz = await BvQuizzes.findOne({ id: input.quizId });
    if (!quiz) throw new AppError({ code: 'NOT_FOUND', message: 'Quiz not found' });

    let questions: any[] = [];
    try { questions = JSON.parse(quiz.questionsJson || '[]'); } catch {}

    return {
      id: quiz.id,
      title: quiz.quizTitle || '',
      description: quiz.description || '',
      isActive: quiz.isActive || false,
      createdAt: quiz.createdAt || '',
      questions: questions.map((q: any) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        options: q.options,
        explanation: q.explanation || '',
      })),
    };
  },
});
