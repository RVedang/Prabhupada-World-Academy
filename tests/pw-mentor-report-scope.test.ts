import assert from 'node:assert/strict';
import test from 'node:test';
import getGuideDetailedReport from '../src/api/getGuideDetailedReport';
import { FolkResidencies, SadhanaEntries, Users } from '../src/lib/app-backend-sdk';

test('PW Sadhana Mentor report includes only explicitly assigned PW members', async t => {
  const mentor = { id: 'mentor-db', userId: 'mentor-public', email: 'mentor@example.test' };
  const assignedMember = {
    id: 'member-db', userId: 'member-public', fullName: 'Assigned PW Member', email: 'member@example.test',
    status: 'Active', segment: 'Prabhupada World', sadhanaMentor: mentor.id, ashrayLevel: 'Sevak', currentStreak: 1,
  };
  const unassignedMember = {
    id: 'other-db', userId: 'other-public', fullName: 'Unassigned PW Member', email: 'other@example.test',
    status: 'Active', segment: 'PW', sadhanaMentor: 'different-mentor', ashrayLevel: 'Sevak',
  };
  const folkMember = {
    id: 'folk-db', userId: 'folk-public', fullName: 'FOLK Member', email: 'folk@example.test',
    status: 'Active', segment: 'FOLK', sadhanaMentor: mentor.userId, ashrayLevel: 'Sevak',
  };
  const entry = {
    id: 'entry-db', user: assignedMember.id, entryDate: '2026-09-06', totalScore: 16, maxScore: 20,
    scorePercent: 80, submittedAt: '2026-09-06T10:00:00Z', templateMode: 'NR_TEMPLATE',
    fieldValuesJson: JSON.stringify({ chanting: 16, reading: 60, hearing: 60, seva: true }),
  };

  t.mock.method(Users, 'findOne', async () => mentor);
  t.mock.method(Users, 'findAll', async () => ({ records: [assignedMember, unassignedMember, folkMember], hasMore: false }));
  t.mock.method(SadhanaEntries, 'findAll', async () => ({ records: [entry], hasMore: false }));
  t.mock.method(FolkResidencies, 'findAll', async () => ({ records: [], hasMore: false }));

  const report = await getGuideDetailedReport.execute({
    input: { guideId: mentor.userId, date: '2026-09-06', reportType: 'daily', mentorMode: true, segment: 'PW' },
    context: { user: { ...mentor, role: 'SADHANA_MENTOR', isSadhanaMentor: true, segment: 'PW' } },
  } as never);

  assert.deepEqual(report.users.map((user: any) => user.id), [assignedMember.id]);
  assert.equal(report.users[0].submitted, true);
  assert.equal(report.users[0].scorePercent, 80);
});
