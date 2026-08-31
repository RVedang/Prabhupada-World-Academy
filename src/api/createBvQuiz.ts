import { z } from 'zod';
import { createEndpoint, BvQuizzes, AppError } from '@/lib/backend-sdk';
import {
  findScopedQuizGroup,
  getQuizGroupsForUser,
  normalizeQuizDepartment,
  requireQuizContentManager,
  resolveQuizDepartment,
} from '@/lib/bvQuizAccess';

const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  type: z.enum(['single', 'multiple']),
  options: z.array(z.string().trim().min(1)).min(2),
  correctAnswers: z.array(z.number().int().nonnegative()).min(1),
  explanation: z.string().optional(),
}).superRefine((question, context) => {
  if (question.type === 'single' && question.correctAnswers.length !== 1) {
    context.addIssue({ code: 'custom', path: ['correctAnswers'], message: 'Single-answer questions require exactly one correct answer' });
  }
  if (new Set(question.correctAnswers).size !== question.correctAnswers.length) {
    context.addIssue({ code: 'custom', path: ['correctAnswers'], message: 'Correct answers must be unique' });
  }
  if (question.correctAnswers.some(index => index >= question.options.length)) {
    context.addIssue({ code: 'custom', path: ['correctAnswers'], message: 'Correct answer index is outside the option list' });
  }
});

const questionsSchema = z.array(questionSchema).min(1).max(500).superRefine((questions, context) => {
  const ids = questions.map(question => question.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Question IDs must be unique' });
  }
});

export default createEndpoint({
  description: 'Create or update a department-aware BV quiz',
  authenticated: true,
  inputSchema: z.object({
    quizId: z.string().optional(),
    department: z.enum(['FOLK', 'PW']).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().optional(),
    groupId: z.string().optional(),
    questions: questionsSchema,
    isActive: z.boolean().optional(),
    quizDate: z.string().optional(),
  }),
  outputSchema: z.object({ quizId: z.string(), success: z.boolean() }),
  execute: async ({ input, context }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    const requestedDepartment = normalizeQuizDepartment(input.department || context.user.segment, 'PW');

    let existingQuiz: any = null;
    let department = requestedDepartment;
    if (input.quizId) {
      existingQuiz = await BvQuizzes.findOne({ id: input.quizId });
      if (!existingQuiz) throw new AppError({ code: 'NOT_FOUND', message: 'Quiz not found' });
      department = await resolveQuizDepartment(existingQuiz, requestedDepartment);
      if (input.department && department !== requestedDepartment) {
        throw new AppError({ code: 'FORBIDDEN', message: 'A quiz cannot be moved between departments' });
      }
    }

    requireQuizContentManager(context.user, department);

    let groupId: string | null = null;
    if (department === 'FOLK') {
      const groups = await getQuizGroupsForUser(context.user, 'FOLK');
      const group = findScopedQuizGroup(groups, input.groupId || existingQuiz?.group);
      if (!group) {
        throw new AppError({ code: 'FORBIDDEN', message: 'You can manage quizzes only for your assigned FOLK groups' });
      }
      if (existingQuiz?.group && !findScopedQuizGroup([group], existingQuiz.group)) {
        throw new AppError({ code: 'FORBIDDEN', message: 'The quiz does not belong to the selected group' });
      }
      groupId = group.id;
    }

    const questionsJson = JSON.stringify(input.questions);
    if (input.quizId) {
      await BvQuizzes.update({
        id: input.quizId,
        record: {
          quizTitle: input.title.trim(),
          description: input.description || '',
          questionsJson,
          isActive: input.isActive ?? true,
          quizDate: input.quizDate,
          department,
          updatedAt: new Date().toISOString(),
        },
      });
      return { quizId: input.quizId, success: true };
    }
    const quiz = await BvQuizzes.create({
      record: {
        quizTitle: input.title.trim(),
        description: input.description || '',
        group: department === 'FOLK' ? groupId : null,
        department,
        activeGroupIds: department === 'PW' ? [] : undefined,
        createdBy: context.user.id,
        questionsJson,
        isActive: input.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        quizDate: input.quizDate,
      },
    });
    return { quizId: quiz.id, success: true };
  },
});
