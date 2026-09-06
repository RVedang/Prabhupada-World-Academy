import assert from 'node:assert/strict';
import test from 'node:test';
import getUserProgressStats from '../src/api/getUserProgressStats';
import getEntryDetail from '../src/api/getEntryDetail';
import { Users, SadhanaEntries, BvAttendance } from '../src/lib/app-backend-sdk';

for (const segment of ['PW', 'FOLK']) {
  test(`${segment} progress and entry details use the member department, not the viewer`, async t => {
    const member = { id: 'member-db', userId: 'member', segment, ashrayLevel: 'Sevak' };
    const entry = {
      id: 'entry-db', entryId: 'entry', user: member.id, entryDate: '2026-09-06',
      submittedAt: '2026-09-08T10:00:00Z', templateMode: 'NR_TEMPLATE',
      totalScore: 10, maxScore: 16, scorePercent: 62.5,
      preachingMinutes: 30, booksDistributed: 2,
      fieldValuesJson: JSON.stringify({ chanting: 12, reading: 30, hearing: 60,
        fillingSameDay: false, _pts_fillingSameDay: 0, seva: true,
        bhaktiVriksha: true, report_sending: 1, preaching_raw: 30, distribution_raw: 2 }),
    };
    t.mock.method(Users, 'findOne', async () => member);
    t.mock.method(Users, 'findAll', async () => ({ records: [member], hasMore: false }));
    t.mock.method(SadhanaEntries, 'findOne', async () => entry);
    t.mock.method(SadhanaEntries, 'findAll', async () => ({ records: [entry], hasMore: false }));
    t.mock.method(BvAttendance, 'findAll', async () => ({ records: [], hasMore: false }));
    const context = { user: { id: 'admin', role: 'SUPER_ADMIN', segment: segment === 'PW' ? 'FOLK' : 'PW' } };
    const stats = await getUserProgressStats.execute({ input: {
      userId: member.userId, startDate: '2026-09-06', endDate: '2026-09-06', includeToday: true,
    }, context } as never);
    const fields = stats.fieldTrends.map((field: any) => field.field);
    assert.equal(fields.includes('fillingSameDay'), segment === 'FOLK');
    assert.equal(stats.insightFields.some((field: any) => field.key === 'nrFillingSameDayPts'), segment === 'FOLK');
    if (segment === 'PW') {
      assert.ok(fields.includes('preachingMinutes'));
      assert.ok(fields.includes('booksDistributed'));
      assert.equal(fields.includes('bhaktiVriksha'), false);
    }
    const detail = await getEntryDetail.execute({ input: { entryId: entry.entryId }, context } as never);
    const detailKeys = detail.entry!.fields.map((field: any) => field.fieldKey);
    assert.equal(detailKeys.includes('fillingSameDay'), segment === 'FOLK');
    assert.equal(detailKeys.includes('report_sending'), segment === 'FOLK');
    assert.ok(detailKeys.includes('reading'));
    assert.ok(detailKeys.includes('preaching_raw'));
    assert.equal(detail.entry!.totalScore, entry.totalScore);
  });
}
