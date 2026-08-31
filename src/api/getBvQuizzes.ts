import { z } from 'zod';
import { AppError, BvGroupMembers, BvQuizzes, BvQuizSubmissions, createEndpoint } from '@/lib/backend-sdk';
import {
  canManageQuizContent,
  findScopedQuizGroup,
  getQuizGroupsForUser,
  isPwQuizFacilitator,
  isPwQuizSubFacilitator,
  legacyQuizMatchesGroup,
  normalizeQuizDepartment,
  quizGroupAliases,
  quizIsActivatedForGroup,
  quizRefValues,
  resolveQuizDepartment,
} from '@/lib/bvQuizAccess';

function submissionMatchesGroup(submission: any, group: any, memberships: any[]): boolean {
  const groupAliases = quizGroupAliases(group);
  if (quizRefValues([submission.group, submission.groupId]).some(reference => groupAliases.has(reference))) return true;

  const submissionUsers = new Set(quizRefValues([submission.user, submission.userId]));
  return memberships.some(membership => {
    const memberUsers = quizRefValues([membership.user, membership.userId, membership.memberId]);
    if (!memberUsers.some(reference => submissionUsers.has(reference))) return false;
    return quizRefValues([membership.group, membership.groupId]).some(reference => groupAliases.has(reference));
  });
}

export default createEndpoint({
  description: 'Get authorized department quizzes with group activation and submission counts',
  authenticated: true,
  inputSchema: z.object({
    department: z.enum(['FOLK', 'PW']).optional(),
    groupId: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    const department = normalizeQuizDepartment(input.department || context.user.segment, 'PW');
    const canManageContent = canManageQuizContent(context.user, department);
    const canReadPwGroups = department === 'PW' && (isPwQuizFacilitator(context.user) || isPwQuizSubFacilitator(context.user));
    if (!canManageContent && !canReadPwGroups) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Quiz management access is required' });
    }

    const scopedGroups = await getQuizGroupsForUser(context.user, department, { readOnly: true });
    const selectedGroup = input.groupId ? findScopedQuizGroup(scopedGroups, input.groupId) : null;
    const canViewAllPw = department === 'PW' && canManageContent;
    if (input.groupId && !selectedGroup) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You can view quizzes only for authorized reading groups' });
    }
    if (!input.groupId && !canViewAllPw) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'A reading group is required' });
    }

    const [{ records: allQuizzes }, { records: allMemberships }] = await Promise.all([
      BvQuizzes.findAll({ limit: 500 }),
      BvGroupMembers.findAll({
        limit: 5000,
        fields: ['id', 'group', 'groupId', 'user', 'userId', 'memberId'],
      }).catch(() => ({ records: [] })),
    ]);

    const departmentPairs = await Promise.all(allQuizzes.map(async quiz => ({
      quiz,
      department: await resolveQuizDepartment(quiz, department),
    })));
    const quizzes = departmentPairs
      .filter(pair => pair.department === department)
      .map(pair => pair.quiz)
      .filter(quiz => canManageContent || quiz.isActive === true)
      .filter(quiz => {
        if (department === 'FOLK') return !!selectedGroup && legacyQuizMatchesGroup(quiz, selectedGroup.record);
        if (!selectedGroup) return true;
        // PW now uses central quizzes, while group-specific legacy quizzes
        // remain visible to their original group during migration.
        return quizRefValues(quiz.group).length === 0 || legacyQuizMatchesGroup(quiz, selectedGroup.record);
      });

    const quizIds = quizzes.map(quiz => quiz.id);
    const submissionBatches: any[][] = [];
    for (let index = 0; index < quizIds.length; index += 30) {
      const { records } = await BvQuizSubmissions.findAll({
        filters: { quiz: { in: quizIds.slice(index, index + 30) } },
        limit: 5000,
        fields: ['id', 'quiz', 'user', 'userId', 'group', 'groupId', 'score', 'totalQuestions', 'percentage', 'submittedAt'],
      });
      submissionBatches.push(records);
    }
    const allSubmissions = submissionBatches.flat();
    const visibleSubmissions = selectedGroup
      ? allSubmissions.filter(submission => submissionMatchesGroup(submission, selectedGroup.record, allMemberships))
      : allSubmissions;

    const myAliases = new Set(quizRefValues([context.user.id, context.user.userId, context.user.uid, context.user.email]));
    const mySubmissionByQuiz = new Map<string, any>();
    const countByQuiz = new Map<string, number>();
    for (const submission of visibleSubmissions) {
      const quizId = quizRefValues(submission.quiz)[0];
      if (!quizId) continue;
      countByQuiz.set(quizId, (countByQuiz.get(quizId) || 0) + 1);
      if (quizRefValues([submission.user, submission.userId]).some(reference => myAliases.has(reference))) {
        mySubmissionByQuiz.set(quizId, submission);
      }
    }

    const result = quizzes
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map(quiz => {
        let questions: any[] = [];
        try { questions = JSON.parse(quiz.questionsJson || '[]'); } catch {}
        const normalizedQuizId = String(quiz.id).toLowerCase();
        const mySubmission = mySubmissionByQuiz.get(normalizedQuizId);
        const activeGroupIds = quizRefValues(quiz.activeGroupIds);
        const isActiveForGroup = department === 'PW' && selectedGroup
          ? quiz.isActive === true && (quizIsActivatedForGroup(quiz, selectedGroup.record) || legacyQuizMatchesGroup(quiz, selectedGroup.record))
          : quiz.isActive === true;
        return {
          id: quiz.id,
          title: quiz.quizTitle || '',
          description: quiz.description || '',
          department,
          isActive: quiz.isActive === true,
          isActiveForGroup,
          activeGroupCount: new Set(activeGroupIds).size,
          questionCount: questions.length,
          quizDate: quiz.quizDate || '',
          createdAt: quiz.createdAt || '',
          updatedAt: quiz.updatedAt || '',
          submissionCount: countByQuiz.get(normalizedQuizId) || 0,
          mySubmission: mySubmission ? {
            id: mySubmission.id,
            score: mySubmission.score ?? 0,
            totalQuestions: mySubmission.totalQuestions ?? 0,
            percentage: mySubmission.percentage ?? 0,
            submittedAt: mySubmission.submittedAt || '',
          } : null,
        };
      });

    return {
      quizzes: result,
      permissions: {
        canManageContent,
        canToggleGroups: department === 'PW' && (canManageContent || isPwQuizFacilitator(context.user)),
        canViewAllGroups: canViewAllPw,
      },
    };
  },
});
