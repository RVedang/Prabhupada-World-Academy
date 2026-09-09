import assert from 'node:assert/strict';
import test from 'node:test';
import profile from '../src/api/getServiceProfile';
import schedule from '../src/api/getWeeklySchedule';
import { ServiceAllocations, Services, Users, UserSkills, SkillCatalog } from '../src/lib/app-backend-sdk';
import { getServiceWeekByOffset } from '../src/lib/serviceWeek';
import { apiUser } from './helpers/apiUser';

const context = { user: apiUser({ id: 'service-member', role: 'User', segment: 'FOLK' }) };

test('service profile supplies member-only totals, weekly streak and skill names', async t => {
  t.mock.method(Users, 'findOne', async (query: any) => {
    assert.equal(query.id, context.user.id);
    return { id: context.user.id, fullName: 'Service Member' };
  });
  t.mock.method(ServiceAllocations, 'findAll', async (query: any) => {
    assert.deepEqual(query.filters, { user: context.user.id });
    return { records: [
      { id: 'current', status: 'Scheduled', weekDate: getServiceWeekByOffset(0) },
      { id: 'last-1', status: 'Done', weekDate: getServiceWeekByOffset(-1) },
      { id: 'last-2', status: 'Done', weekDate: getServiceWeekByOffset(-1) },
      { id: 'previous', status: 'Done', weekDate: getServiceWeekByOffset(-2) },
      { id: 'missed', status: 'Overdue', weekDate: getServiceWeekByOffset(-3) },
      { id: 'older', status: 'Done', weekDate: getServiceWeekByOffset(-4) },
    ], hasMore: false };
  });
  t.mock.method(UserSkills, 'findAll', async (query: any) => {
    assert.deepEqual(query.filters, { user: context.user.id });
    return { records: [{ skill: ['cooking'] }, { skill: 'cooking' }, { skill: 'deleted' }], hasMore: false };
  });
  t.mock.method(SkillCatalog, 'findAll', async () => ({ records: [{ id: 'cooking', skillName: 'Cooking' }], hasMore: false }));
  const result = await profile.execute({ input: {}, context });
  assert.equal(result.totalAllocations, 6);
  assert.equal(result.completedAllocations, 4);
  assert.equal(result.overdueAllocations, 1);
  assert.equal(result.completionRate, 67);
  assert.equal(result.currentStreak, 2);
  assert.equal(result.monthlyBreakdown.reduce((total, month) => total + month.total, 0), 6);
  assert.equal(result.monthlyBreakdown.reduce((total, month) => total + month.completed, 0), 4);
  assert.deepEqual(result.skills, ['Cooking']);
});

test('weekly service cards receive stored duration and overdue state', async t => {
  t.mock.method(ServiceAllocations, 'findAll', async (query: any) => {
    assert.deepEqual(query.filters, { user: context.user.id, weekDate: '2026-09-06' });
    return { records: [{ id: 'allocation', service: ['service'], status: 'Overdue', dayOfWeek: 'Monday' }], hasMore: false };
  });
  t.mock.method(Services, 'findAll', async (query: any) => {
    assert.ok(query.fields.includes('durationMinutes'));
    return { records: [{ id: 'service', serviceName: 'Cooking', durationMinutes: 45 }], hasMore: false };
  });
  const result = await schedule.execute({ input: { weekStartDate: '2026-09-06' }, context });
  assert.equal(result.schedule[0].durationMinutes, 45);
  assert.equal(result.schedule[0].isOverdue, true);
});
