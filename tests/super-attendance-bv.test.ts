import assert from 'node:assert/strict';
import test from 'node:test';

import getSuperGuideAttendanceReport from '../src/api/getSuperGuideAttendanceReport';
import { BvAttendance, BvGroups, Users } from '../src/lib/app-backend-sdk';

test('PW Admin attendance report includes present BV rows saved with a public userId', async () => {
  const suffix = 'PW-ADMIN-ATTENDANCE-REPORT';
  const date = '2099-01-02';
  const admin = {
    id: `${suffix}-ADMIN-DB`, userId: `${suffix}-ADMIN`, email: 'pw-admin-attendance@example.invalid',
    fullName: 'PW Attendance Admin', role: 'ADMIN', status: 'Active', segment: 'PW', isBvAdmin: true,
  };
  const rgf = {
    id: `${suffix}-RGF-DB`, userId: `${suffix}-RGF`, email: 'pw-attendance-rgf@example.invalid',
    fullName: 'PW Attendance RGF', role: 'RGF', status: 'Active', segment: 'PW', isBvFacilitator: true,
    bvReportingAdminId: admin.id,
  };
  const member = {
    id: `${suffix}-MEMBER-DB`, userId: `${suffix}-MEMBER`, email: 'pw-attendance-member@example.invalid',
    fullName: 'PW Attendance Member', role: 'USER', status: 'Active', segment: 'PW', ashrayLevel: 'Sevak',
  };
  const group = {
    id: `${suffix}-GROUP-DB`, groupId: `${suffix}-GROUP`, groupName: 'PW Attendance Group',
    segment: 'PW', isActive: true, bvslLeader: rgf.userId,
  };
  const attendanceId = `${suffix}-ROW`;

  try {
    for (const user of [admin, rgf, member]) await Users.create({ record: user });
    await BvGroups.create({ record: group });
    // This is the production-compatible legacy shape: user is the public
    // userId, not the Firestore Users document ID.
    await BvAttendance.create({ record: {
      id: attendanceId, group: group.id, user: member.userId, attendanceDate: date,
      present: true, sessionTopic: 'Weekly BV Reading',
    } });

    const result = await getSuperGuideAttendanceReport.execute({
      input: { segment: 'PW', startDate: date, endDate: date }, context: { user: admin },
    } as never);

    const record = result.records.find((row: any) => row.id === attendanceId);
    assert.ok(record, 'the BV attendance row should be visible to its reporting admin');
    assert.equal(record.name, member.fullName);
    assert.equal(record.source, 'Bhakti Vriksha');
    assert.equal(record.sessionName, 'Weekly BV Reading');
    assert.equal(record.eventTitle, 'Bhakti Vriksha');
  } finally {
    await BvAttendance.delete({ id: attendanceId }).catch(() => undefined);
    await BvGroups.delete({ id: group.id }).catch(() => undefined);
    for (const user of [admin, rgf, member]) await Users.delete({ id: user.id }).catch(() => undefined);
  }
});
