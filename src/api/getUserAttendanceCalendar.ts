import { z } from 'zod';
import { createEndpoint, AttendanceRecords, AttendanceSessions, AttendanceEvents, BvAttendance, SadhanaEntries } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get attendance calendar data for the current user',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const userKeys = new Set<string>();
    if (context.user?.id) userKeys.add(String(context.user.id).toLowerCase());
    if (context.user?.userId) userKeys.add(String(context.user.userId).toLowerCase());
    if (context.user?.email) userKeys.add(String(context.user.email).toLowerCase());

    // Fetch BvAttendance records for user
    const { records: allBv } = await BvAttendance.findAll({
      limit: 2000,
      fields: ['id', 'user', 'attendanceDate', 'present'],
    }).catch(() => ({ records: [] }));

    const bvAtt = allBv.filter((a: any) => {
      const rawU = Array.isArray(a.user) ? a.user[0] : a.user;
      return userKeys.has(String(rawU || '').toLowerCase());
    });

    // Fetch SadhanaEntries for user
    const { records: allSadhana } = await SadhanaEntries.findAll({
      limit: 2000,
      fields: ['id', 'user', 'entryDate', 'fieldValuesJson'],
    }).catch(() => ({ records: [] }));

    const sadhanaEntries = allSadhana.filter((s: any) => {
      const rawU = Array.isArray(s.user) ? s.user[0] : s.user;
      return userKeys.has(String(rawU || '').toLowerCase());
    });

    // Fetch legacy AttendanceRecords
    const { records: allLegacy } = await AttendanceRecords.findAll({
      limit: 2000,
      fields: ['id', 'user', 'session', 'date'],
    }).catch(() => ({ records: [] }));

    const records = allLegacy.filter((r: any) => {
      const rawU = Array.isArray(r.user) ? r.user[0] : r.user;
      return userKeys.has(String(rawU || '').toLowerCase());
    });

    // Get unique session IDs
    const sessionIds = [...new Set(records.map(r => Array.isArray(r.session) ? r.session[0] : r.session).filter(Boolean))] as string[];

    // Fetch session and event details
    const sessionMap = new Map<string, { name: string; eventId?: string }>();
    const eventIds = new Set<string>();

    if (sessionIds.length > 0) {
      for (let i = 0; i < sessionIds.length; i += 100) {
        const batch = sessionIds.slice(i, i + 100);
        const { records: sessions } = await AttendanceSessions.findAll({
          filters: { id: { in: batch } } as any,
          fields: ['id', 'name', 'event'],
          limit: 100,
        }).catch(() => ({ records: [] }));
        sessions.forEach(s => {
          const eid = Array.isArray(s.event) ? s.event[0] : s.event;
          sessionMap.set(s.id, { name: s.name || '', eventId: eid });
          if (eid) eventIds.add(eid);
        });
      }
    }

    const eventMap = new Map<string, string>();
    if (eventIds.size > 0) {
      const { records: events } = await AttendanceEvents.findAll({
        filters: { id: { in: [...eventIds] } } as any,
        fields: ['id', 'title'],
        limit: 100,
      }).catch(() => ({ records: [] }));
      events.forEach(e => eventMap.set(e.id, e.title || ''));
    }

    const entryMap = new Map<string, { date: string; present: boolean; status: 'P' | 'A'; sessionName: string; eventTitle: string }>();

    // Add BvAttendance records (present: true or false)
    bvAtt.forEach((a: any) => {
      if (a.attendanceDate) {
        const isPres = !!a.present;
        entryMap.set(a.attendanceDate, {
          date: a.attendanceDate,
          present: isPres,
          status: isPres ? 'P' : 'A',
          sessionName: 'Bhakti Vriksha Session',
          eventTitle: isPres ? 'Present' : 'Absent',
        });
      }
    });

    // Add SadhanaEntries
    sadhanaEntries.forEach((s: any) => {
      const d = String(s.entryDate || '').slice(0, 10);
      if (d && !entryMap.has(d)) {
        try {
          const fv = typeof s.fieldValuesJson === 'string' ? JSON.parse(s.fieldValuesJson) : (s.fieldValuesJson || {});
          const isAttended = !!(
            fv.bhaktiVriksha === true ||
            fv.bhaktiVriksha === 1 ||
            fv.bhaktiVriksha === 'true' ||
            Number(fv.bhaktiVriksha) > 0 ||
            Number(fv._pts_bhaktiVriksha) > 0
          );
          entryMap.set(d, {
            date: d,
            present: isAttended,
            status: isAttended ? 'P' : 'A',
            sessionName: 'Bhakti Vriksha (Sadhana Logged)',
            eventTitle: isAttended ? 'Present' : 'Absent',
          });
        } catch {}
      }
    });

    // Add legacy AttendanceRecords
    records.forEach(r => {
      if (r.date && !entryMap.has(r.date)) {
        const sid = (Array.isArray(r.session) ? r.session[0] : r.session) as string;
        const session = sessionMap.get(sid);
        entryMap.set(r.date, {
          date: r.date || '',
          present: true,
          status: 'P',
          sessionName: session?.name || 'Session',
          eventTitle: session?.eventId ? eventMap.get(session.eventId) || '' : 'Program Session',
        });
      }
    });

    const entries = Array.from(entryMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    // Calculate stats — count dates where present === true
    const presentDates = new Set(entries.filter(e => e.present).map(e => e.date));
    const totalDaysAttended = presentDates.size;

    // Current streak
    const sortedDates = [...presentDates].sort().reverse();
    let currentStreak = 0;
    const today = new Date();
    const checkDate = new Date(today);
    checkDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      if (sortedDates.includes(dateStr)) {
        currentStreak++;
      } else if (i > 0) {
        break; // Allow today to be missing (streak from yesterday)
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // This month count
    const thisMonth = today.toISOString().slice(0, 7);
    const thisMonthCount = [...presentDates].filter(d => d.startsWith(thisMonth)).length;

    // Longest streak
    const allDates = [...presentDates].sort();
    let longestStreak = 0;
    let streak = 0;
    for (let i = 0; i < allDates.length; i++) {
      if (i === 0) { streak = 1; }
      else {
        const prev = new Date(allDates[i - 1]);
        const curr = new Date(allDates[i]);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        streak = diff === 1 ? streak + 1 : 1;
      }
      longestStreak = Math.max(longestStreak, streak);
    }

    return {
      entries,
      stats: { totalDaysAttended, currentStreak, thisMonthCount, longestStreak },
    };
  },
});
