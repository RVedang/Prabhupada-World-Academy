import assert from 'node:assert/strict';
import test from 'node:test';

import getOneToOneContext from '../src/api/getOneToOneContext';
import { BvAttendance, SadhanaEntries, Users } from '../src/lib/app-backend-sdk';
import { getTodayIST } from '../src/lib/streakUtils';

test('one-to-one Sadhana context resolves alternate user identities and stored score percentages', async () => {
  const today = getTodayIST();
  const user = {
    id: 'ONE-TO-ONE-CONTEXT-USER-DB',
    userId: 'ONE-TO-ONE-CONTEXT-USER',
    authUid: 'ONE-TO-ONE-CONTEXT-AUTH-UID',
    email: 'one-to-one-context@example.invalid',
    fullName: 'One To One Context User',
    status: 'Active',
    residencyApproved: true,
    currentStreak: 2,
  };
  const entryId = 'ONE-TO-ONE-CONTEXT-ENTRY';
  const attendanceId = 'ONE-TO-ONE-CONTEXT-ATTENDANCE';

  try {
    await Users.create({ record: user });
    await SadhanaEntries.create({
      record: {
        id: entryId,
        user: user.authUid,
        entryDate: today,
        scorePercent: 85,
        roundsCount: 16,
        preachingMinutes: 25,
        booksDistributed: 1,
      },
    });
    await BvAttendance.create({
      record: {
        id: attendanceId,
        user: user.userId,
        attendanceDate: today,
        present: true,
      },
    });

    const result = await getOneToOneContext.execute({
      input: { userId: user.userId },
      context: { user: { id: 'CALLER', role: 'SUPER_ADMIN' } },
    } as never);
    const latestWeek = result.weeks[result.weeks.length - 1];

    assert.equal(latestWeek.scorePercent, 85);
    assert.equal(latestWeek.rounds, 16);
    assert.equal(result.totalPreachingMins, 25);
    assert.equal(result.bvAttendanceCount, 1);
  } finally {
    await BvAttendance.delete({ id: attendanceId }).catch(() => undefined);
    await SadhanaEntries.delete({ id: entryId }).catch(() => undefined);
    await Users.delete({ id: user.id }).catch(() => undefined);
  }
});
