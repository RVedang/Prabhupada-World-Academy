import assert from 'node:assert/strict';
import test from 'node:test';

import createBvQuiz from '../src/api/createBvQuiz';
import deleteBvQuiz from '../src/api/deleteBvQuiz';
import getBvQuizDetail from '../src/api/getBvQuizDetail';
import getBvQuizSubmissions from '../src/api/getBvQuizSubmissions';
import getMyBvQuizSubmissions from '../src/api/getMyBvQuizSubmissions';
import setBvQuizGroupActivation from '../src/api/setBvQuizGroupActivation';
import submitBvQuiz from '../src/api/submitBvQuiz';
import { BvGroupMembers, BvGroups, BvQuizzes, BvQuizSubmissions, Users } from '../src/lib/app-backend-sdk';
import {
  canManageQuizContent,
  canTogglePwQuizGroups,
  getQuizGroupsForUser,
} from '../src/lib/bvQuizAccess';

const admin = {
  id: 'PWQ-ADMIN-DB', uid: 'PWQ-ADMIN-AUTH', userId: 'PWQ-ADMIN', email: 'pwq-admin@example.invalid',
  fullName: 'PW Quiz Admin', role: 'Admin', status: 'Active', segment: 'PW', isActive: true,
  isBvAdmin: true, isBvSuperAdmin: false, isBvFacilitator: false, isBvSubFacilitator: false, isBvsl: false,
};
const rgfA = {
  id: 'PWQ-RGF-A-DB', uid: 'PWQ-RGF-A-AUTH', userId: 'PWQ-RGF-A', email: 'pwq-rgf-a@example.invalid',
  fullName: 'PW Quiz RGF A', role: 'User', status: 'Active', segment: 'PW', isActive: true,
  isBvAdmin: false, isBvSuperAdmin: false, isBvFacilitator: true, isBvSubFacilitator: false, isBvsl: true,
};
const rgfB = {
  id: 'PWQ-RGF-B-DB', uid: 'PWQ-RGF-B-AUTH', userId: 'PWQ-RGF-B', email: 'pwq-rgf-b@example.invalid',
  fullName: 'PW Quiz RGF B', role: 'User', status: 'Active', segment: 'PW', isActive: true,
  isBvAdmin: false, isBvSuperAdmin: false, isBvFacilitator: true, isBvSubFacilitator: false, isBvsl: true,
};
const participant = {
  id: 'PWQ-MEMBER-DB', uid: 'PWQ-MEMBER-AUTH', userId: 'PWQ-MEMBER', email: 'pwq-member@example.invalid',
  fullName: 'PW Quiz Member', role: 'User', status: 'Active', segment: 'PW', isActive: true,
  isBvAdmin: false, isBvSuperAdmin: false, isBvFacilitator: false, isBvSubFacilitator: false, isBvsl: false,
};

const groupA = {
  id: 'PWQ-GROUP-A', groupId: 'PWQ-GROUP-A-PUBLIC', groupName: 'PW Quiz Group A',
  bvslId: rgfA.userId, segment: 'PW', isActive: true,
};
const groupB = {
  id: 'PWQ-GROUP-B', groupId: 'PWQ-GROUP-B-PUBLIC', groupName: 'PW Quiz Group B',
  bvslId: rgfB.userId, segment: 'PW', isActive: true,
};
const membershipId = 'PWQ-MEMBERSHIP-A';

test('PW quiz role matrix keeps content management admin-only and group toggles RGF-scoped', () => {
  assert.equal(canManageQuizContent(admin as any, 'PW'), true);
  assert.equal(canManageQuizContent({ ...admin, role: 'Super Admin', isBvSuperAdmin: true, segment: null } as any, 'PW'), true);
  assert.equal(canManageQuizContent({ ...admin, role: 'Prabhupada World Admin', isBvAdmin: false } as any, 'PW'), true);
  assert.equal(canManageQuizContent(rgfA as any, 'PW'), false);
  assert.equal(canTogglePwQuizGroups({ ...rgfA, role: 'Prabhupada World Reading Group Facilitator', isBvFacilitator: false, isBvsl: false } as any), true);
  assert.equal(canTogglePwQuizGroups(rgfA as any), true);
  assert.equal(canTogglePwQuizGroups({ ...rgfA, isBvFacilitator: false, isBvsl: false, isBvSubFacilitator: true } as any), false);
  assert.equal(canManageQuizContent({ ...rgfA, segment: 'FOLK' } as any, 'FOLK'), true);

  const invalidQuiz = createBvQuiz.inputSchema.safeParse({
    department: 'PW', title: 'Invalid Quiz', questions: [
      { id: 'q1', text: 'Question?', type: 'single', options: ['One', 'Two'], correctAnswers: [2] },
    ],
  });
  assert.equal(invalidQuiz.success, false);
});

test('PW central quiz flow enforces content, activation, participation, and analytics scopes', async () => {
  for (const user of [admin, rgfA, rgfB, participant]) await Users.create({ record: user });
  await BvGroups.create({ record: groupA });
  await BvGroups.create({ record: groupB });
  await BvGroupMembers.create({
    record: {
      id: membershipId,
      memberId: membershipId,
      group: groupA.id,
      groupId: groupA.groupId,
      user: participant.id,
      userId: participant.userId,
      role: 'Member',
      joinedAt: new Date().toISOString(),
    },
  });

  let quizId = '';
  try {
    const ownedGroups = await getQuizGroupsForUser(rgfA as any, 'PW');
    assert.deepEqual(ownedGroups.map(group => group.id), [groupA.id]);

    await assert.rejects(
      () => createBvQuiz.execute({
        input: {
          department: 'PW', title: 'Forbidden RGF Quiz', questions: [
            { id: 'q1', text: 'Question?', type: 'single', options: ['Yes', 'No'], correctAnswers: [0] },
          ],
        },
        context: { user: rgfA },
      } as any),
      /Only Prabhupada World Admins and Super Admins/,
    );

    const created = await createBvQuiz.execute({
      input: {
        department: 'PW', title: 'PW Central Quiz', description: 'Shared quiz', quizDate: '2026-08-30', isActive: true,
        questions: [
          { id: 'q1', text: 'Who are we?', type: 'single', options: ['Body', 'Spirit soul'], correctAnswers: [1], explanation: 'We are spirit soul.' },
          { id: 'q2', text: 'Choose both', type: 'multiple', options: ['A', 'B', 'C'], correctAnswers: [0, 2], explanation: 'A and C.' },
        ],
      },
      context: { user: admin },
    } as any);
    quizId = created.quizId;
    const storedQuiz = await BvQuizzes.findOne({ id: quizId });
    assert.equal(storedQuiz.department, 'PW');
    assert.equal(storedQuiz.group, null);
    assert.deepEqual(storedQuiz.activeGroupIds, []);

    await assert.rejects(
      () => getBvQuizDetail.execute({ input: { quizId }, context: { user: participant } } as any),
      /not active for your reading group/,
    );
    await assert.rejects(
      () => setBvQuizGroupActivation.execute({
        input: { quizId, groupId: groupA.id, isActive: true },
        context: { user: rgfB },
      } as any),
      /assigned reading groups/,
    );

    await setBvQuizGroupActivation.execute({
      input: { quizId, groupId: groupA.id, isActive: true },
      context: { user: rgfA },
    } as any);
    const participantQuiz = await getBvQuizDetail.execute({ input: { quizId }, context: { user: participant } } as any);
    assert.equal(participantQuiz.questions[0].correctAnswers, undefined);
    assert.equal(participantQuiz.questions[0].explanation, '');
    const pending = await getMyBvQuizSubmissions.execute({ input: {}, context: { user: participant } } as any);
    assert.deepEqual(pending.pendingQuizzes.map((quiz: any) => quiz.id), [quizId]);

    await setBvQuizGroupActivation.execute({
      input: { quizId, groupId: groupA.id, isActive: false },
      context: { user: rgfA },
    } as any);
    const turnedOff = await getMyBvQuizSubmissions.execute({ input: {}, context: { user: participant } } as any);
    assert.equal(turnedOff.pendingQuizzes.length, 0);
    await assert.rejects(
      () => submitBvQuiz.execute({
        input: {
          quizId,
          answers: [
            { questionId: 'q1', selected: [1] },
            { questionId: 'q2', selected: [0, 2] },
          ],
        },
        context: { user: participant },
      } as any),
      /not active for your reading group/,
    );
    await setBvQuizGroupActivation.execute({
      input: { quizId, groupId: groupA.id, isActive: true },
      context: { user: rgfA },
    } as any);

    const result = await submitBvQuiz.execute({
      input: {
        quizId,
        answers: [
          { questionId: 'q1', selected: [1] },
          { questionId: 'q2', selected: [0, 2] },
        ],
      },
      context: { user: participant },
    } as any);
    assert.deepEqual({ score: result.score, total: result.total, percentage: result.percentage }, { score: 2, total: 2, percentage: 100 });
    const completed = await getMyBvQuizSubmissions.execute({ input: {}, context: { user: participant } } as any);
    assert.equal(completed.pendingQuizzes.length, 0);
    assert.equal(completed.submissions[0].quizId, quizId);

    const report = await getBvQuizSubmissions.execute({
      input: { quizId, department: 'PW', groupId: groupA.id },
      context: { user: rgfA },
    } as any);
    assert.equal(report.submissions.length, 1);
    assert.equal(report.submissions[0].userName, participant.fullName);
    assert.equal(report.analytics.questionAnalytics.length, 2);
    assert.equal(report.analytics.questionAnalytics[0].correctPercentage, 100);
    await assert.rejects(
      () => getBvQuizSubmissions.execute({
        input: { quizId, department: 'PW', groupId: groupA.id },
        context: { user: rgfB },
      } as any),
      /authorized reading groups/,
    );

    const editableQuiz = await getBvQuizDetail.execute({
      input: { quizId, department: 'PW', includeAnswers: true },
      context: { user: admin },
    } as any);
    assert.deepEqual(editableQuiz.questions[0].correctAnswers, [1]);

    await deleteBvQuiz.execute({ input: { quizId, department: 'PW' }, context: { user: admin } } as any);
    assert.equal(await BvQuizzes.findOne({ id: quizId }), undefined);
    const remainingSubmissions = await BvQuizSubmissions.findAll({ filters: { quiz: quizId }, limit: 10 });
    assert.equal(remainingSubmissions.records.length, 0);
    quizId = '';
  } finally {
    if (quizId) {
      const submissions = await BvQuizSubmissions.findAll({ filters: { quiz: quizId }, limit: 100 });
      await Promise.all(submissions.records.map(submission => BvQuizSubmissions.delete({ id: submission.id })));
      await BvQuizzes.delete({ id: quizId });
    }
    await BvGroupMembers.delete({ id: membershipId });
    await BvGroups.delete({ id: groupA.id });
    await BvGroups.delete({ id: groupB.id });
    for (const user of [admin, rgfA, rgfB, participant]) await Users.delete({ id: user.id });
  }
});
