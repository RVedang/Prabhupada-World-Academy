import assert from 'node:assert/strict';
import test from 'node:test';

import getBvAttendanceMatrix from '../src/api/getBvAttendanceMatrix';
import getBvGroupDetail from '../src/api/getBvGroupDetail';
import getBvSupervisorOverview from '../src/api/getBvSupervisorOverview';
import { BvAttendance, BvGroupMembers, BvGroups, BvQuizzes, Users } from '../src/lib/app-backend-sdk';
import { getTodayIST } from '../src/lib/streakUtils';

const supervisor = {
  id: 'SUPERVISOR-GROUPS-DB',
  userId: 'SUPERVISOR-GROUPS',
  email: 'supervisor-groups@example.invalid',
  fullName: 'Supervisor Groups',
  role: 'User',
  status: 'Active',
  segment: 'FOLK',
  isBvSupervisor: true,
};

const reportingRgf = {
  id: 'SUPERVISOR-GROUPS-RGF-DB',
  userId: 'SUPERVISOR-GROUPS-RGF',
  email: 'supervisor-groups-rgf@example.invalid',
  fullName: 'Reporting RGF',
  role: 'User',
  status: 'Active',
  segment: 'FOLK',
  isBvFacilitator: true,
  bvReportingSupervisorId: supervisor.id,
};

const outsideRgf = {
  id: 'SUPERVISOR-GROUPS-OUTSIDE-RGF-DB',
  userId: 'SUPERVISOR-GROUPS-OUTSIDE-RGF',
  email: 'supervisor-groups-outside-rgf@example.invalid',
  fullName: 'Outside RGF',
  role: 'User',
  status: 'Active',
  segment: 'FOLK',
  isBvFacilitator: true,
  bvReportingSupervisorId: 'SOME-OTHER-SUPERVISOR',
};

const member = {
  id: 'SUPERVISOR-GROUPS-MEMBER-DB',
  userId: 'SUPERVISOR-GROUPS-MEMBER',
  email: 'supervisor-groups-member@example.invalid',
  fullName: 'Group Member',
  role: 'User',
  status: 'Active',
  segment: 'FOLK',
};

const supervisedGroup = {
  id: 'SUPERVISOR-GROUPS-GROUP-DB',
  groupId: 'SUPERVISOR-GROUPS-GROUP',
  groupName: 'Supervised Reading Group',
  description: 'Visible to the reporting supervisor',
  bvslId: reportingRgf.userId,
  bvslName: reportingRgf.fullName,
  segment: 'FOLK',
  isActive: true,
};

const outsideGroup = {
  id: 'SUPERVISOR-GROUPS-OUTSIDE-GROUP-DB',
  groupId: 'SUPERVISOR-GROUPS-OUTSIDE-GROUP',
  groupName: 'Outside Reading Group',
  bvslId: outsideRgf.userId,
  bvslName: outsideRgf.fullName,
  segment: 'FOLK',
  isActive: true,
};

test('supervisor groups include only groups led by reporting RGFs with RGF card metrics', async () => {
  const users = [supervisor, reportingRgf, outsideRgf, member];
  const groups = [supervisedGroup, outsideGroup];
  const membershipId = 'SUPERVISOR-GROUPS-MEMBERSHIP';
  const attendanceId = 'SUPERVISOR-GROUPS-ATTENDANCE';
  const quizId = 'SUPERVISOR-GROUPS-QUIZ';

  for (const user of users) await Users.create({ record: user });
  for (const group of groups) await BvGroups.create({ record: group });
  await BvGroupMembers.create({
    record: {
      id: membershipId,
      group: supervisedGroup.id,
      groupId: supervisedGroup.groupId,
      user: member.id,
      userId: member.userId,
      role: 'Member',
    },
  });
  await BvAttendance.create({
    record: {
      id: attendanceId,
      group: supervisedGroup.id,
      user: member.id,
      attendanceDate: getTodayIST(),
      present: true,
    },
  });
  await BvQuizzes.create({
    record: {
      id: quizId,
      quizId,
      quizTitle: 'Supervised Group Quiz',
      group: supervisedGroup.id,
      groupId: supervisedGroup.groupId,
      department: 'FOLK',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  });

  try {
    const result = await getBvSupervisorOverview.execute({
      input: {},
      context: { user: supervisor },
    } as never);

    assert.deepEqual(result.groups.map((group: any) => group.groupId), [supervisedGroup.groupId]);
    assert.equal(result.groups[0].memberCount, 1);
    assert.equal(result.groups[0].totalSessions, 1);
    assert.equal(result.groups[0].presentToday, 1);
    assert.equal(result.groups[0].description, supervisedGroup.description);

    const detail = await getBvGroupDetail.execute({
      input: { groupId: supervisedGroup.groupId },
      context: { user: supervisor },
    } as never);
    assert.equal(detail.group.groupName, supervisedGroup.groupName);
    assert.equal(detail.members.length, 1);
    assert.equal(detail.quizzes.length, 1);

    const matrix = await getBvAttendanceMatrix.execute({
      input: { groupId: supervisedGroup.groupId, startDate: getTodayIST(), endDate: getTodayIST() },
      context: { user: supervisor },
    } as never);
    assert.deepEqual(matrix.dates, [getTodayIST()]);
    assert.equal(matrix.rows[0].weekTotal, 1);
  } finally {
    await BvQuizzes.delete({ id: quizId });
    await BvAttendance.delete({ id: attendanceId });
    await BvGroupMembers.delete({ id: membershipId });
    for (const group of groups) await BvGroups.delete({ id: group.id });
    for (const user of users) await Users.delete({ id: user.id });
  }
});
