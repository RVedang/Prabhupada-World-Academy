import { z } from 'zod';
import { AppError, BvQuizzes, createEndpoint, getFirestoreDb } from '@/lib/backend-sdk';
import {
  canTogglePwQuizGroups,
  findScopedQuizGroup,
  getQuizGroupsForUser,
  isPwQuizAdmin,
  normalizeQuizDepartment,
  quizGroupAliases,
  quizRefValues,
  quizUserAliases,
  resolveQuizDepartment,
} from '@/lib/bvQuizAccess';

export default createEndpoint({
  description: 'Activate or deactivate a centrally published PW quiz for one authorized reading group',
  authenticated: true,
  inputSchema: z.object({
    quizId: z.string().min(1),
    groupId: z.string().min(1),
    isActive: z.boolean(),
  }),
  outputSchema: z.object({ success: z.boolean(), isActive: z.boolean() }),
  execute: async ({ input, context }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    if (!canTogglePwQuizGroups(context.user)) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only PW Admins or Reading Group Facilitators can change group quiz availability' });
    }

    const quiz = await BvQuizzes.findOne({ id: input.quizId });
    if (!quiz) throw new AppError({ code: 'NOT_FOUND', message: 'Quiz not found' });
    const department = await resolveQuizDepartment(quiz, 'PW');
    if (department !== 'PW') {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only Prabhupada World quizzes support per-group activation' });
    }

    const groups = await getQuizGroupsForUser(context.user, 'PW');
    const group = findScopedQuizGroup(groups, input.groupId);
    if (!group) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You can change quiz availability only for your assigned reading groups' });
    }

    const groupAliases = quizGroupAliases(group.record);
    const calculateNext = (current: unknown): string[] => {
      const retained = quizRefValues(current).filter(reference => !groupAliases.has(reference));
      if (input.isActive) retained.push(group.id);
      return [...new Set(retained)];
    };

    const db = getFirestoreDb();
    if (db) {
      await db.runTransaction(async (transaction: any) => {
        const reference = db.collection('BvQuizzes').doc(input.quizId);
        const groupReference = db.collection('BvGroups').doc(group.id);
        const [snapshot, groupSnapshot] = await Promise.all([
          transaction.get(reference),
          transaction.get(groupReference),
        ]);
        if (!snapshot.exists) throw new AppError({ code: 'NOT_FOUND', message: 'Quiz not found' });
        if (!groupSnapshot.exists || groupSnapshot.data()?.isActive === false) {
          throw new AppError({ code: 'FORBIDDEN', message: 'The reading group is no longer active' });
        }
        if (!isPwQuizAdmin(context.user)) {
          const latestGroup = groupSnapshot.data() || {};
          const callerAliases = quizUserAliases(context.user);
          const currentOwners = quizRefValues([latestGroup.bvslId, latestGroup.bvslLeader]);
          if (!currentOwners.some(owner => callerAliases.has(owner))) {
            throw new AppError({ code: 'FORBIDDEN', message: 'This reading group is no longer assigned to you' });
          }
        }
        const current = snapshot.data() || {};
        if (current.department && normalizeQuizDepartment(current.department) !== 'PW') {
          throw new AppError({ code: 'FORBIDDEN', message: 'The quiz belongs to another department' });
        }
        transaction.set(reference, {
          department: 'PW',
          activeGroupIds: calculateNext(current.activeGroupIds),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      });
    } else {
      await BvQuizzes.update({
        id: input.quizId,
        record: {
          department: 'PW',
          activeGroupIds: calculateNext(quiz.activeGroupIds),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return { success: true, isActive: input.isActive };
  },
});
