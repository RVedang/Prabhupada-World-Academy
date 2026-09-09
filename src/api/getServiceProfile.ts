import { z } from 'zod';
import { createEndpoint, ServiceAllocations, Users, UserSkills, SkillCatalog } from '@/lib/backend-sdk';
import { getCurrentServiceWeekStart } from '../lib/serviceWeek';

export default createEndpoint({
  description: 'Get service profile summary for the current user',
  authenticated: true,
  inputSchema: z.object({ userId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const uid = context.user!.id;
    const [userRec, allocRes, skillRes, catalog] = await Promise.all([
      Users.findOne({ id: uid, fields: ['id', 'userId', 'fullName', 'bvServiceAllocated'] }),
      ServiceAllocations.findAll({ filters: { user: uid }, limit: 200, fields: ['id', 'status', 'weekDate'] }),
      UserSkills.findAll({ filters: { user: uid }, limit: 200, fields: ['id', 'skill'] }),
      SkillCatalog.findAll({ limit: 500, fields: ['id', 'skillName'] }),
    ]);

    const allocs = allocRes.records;
    const total = allocs.length;
    const completed = allocs.filter(a => a.status === 'Done').length;
    const overdue = allocs.filter(a => a.status === 'Overdue').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const monthly = new Map<string, { month: string; total: number; completed: number }>();
    const completedWeeks = new Set<string>();
    for (const allocation of allocs) {
      const week = String(allocation.weekDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) continue;
      const month = week.slice(0, 7);
      const entry = monthly.get(month) || { month, total: 0, completed: 0 };
      entry.total++;
      if (allocation.status === 'Done') {
        entry.completed++;
        completedWeeks.add(week);
      }
      monthly.set(month, entry);
    }
    let currentStreak = 0;
    const cursor = new Date(getCurrentServiceWeekStart() + 'T12:00:00Z');
    // Give the current week time to finish, as with the daily Sadhana streak.
    if (!completedWeeks.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 7);
    while (completedWeeks.has(cursor.toISOString().slice(0, 10))) {
      currentStreak++;
      cursor.setUTCDate(cursor.getUTCDate() - 7);
    }
    const skillNames = new Map(catalog.records.map(skill => [skill.id, String(skill.skillName || '')]));
    const skills = [...new Set(skillRes.records.map(skill => {
      const id = Array.isArray(skill.skill) ? skill.skill[0] : skill.skill;
      return skillNames.get(id) || '';
    }).filter(Boolean))];

    return {
      userId: userRec?.userId || uid,
      fullName: userRec?.fullName || '',
      isAllocated: userRec?.bvServiceAllocated || false,
      totalAllocations: total,
      completedAllocations: completed,
      overdueAllocations: overdue,
      completionRate,
      currentStreak,
      monthlyBreakdown: [...monthly.values()].sort((a, b) => b.month.localeCompare(a.month)),
      skills,
    };
  },
});
