import { MEETING_REMINDERS, meetingStartMs, reminderWindow } from '@/lib/meetingReminderSchedule';
import { useCallback, useEffect, useRef } from 'react';
import { getMeetings, sendMeetingReminder } from '@/lib/endpoints-sdk';
import { useReactiveLoader } from '@/hooks/useReactiveLoader';

type MeetingDepartment = 'FOLK' | 'PW';

/**
 * Schedules exact one-shot browser timers from a scoped meeting query.
 * Firestore invalidations rebuild the timers when a meeting changes; no
 * database polling is performed. The endpoint remains idempotent and is the
 * authorization boundary for sending each reminder.
 */
export function useMeetingReminderScheduler(
  department: MeetingDepartment,
  enabled: boolean,
): void {
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(timer => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const schedule = useReactiveLoader(async (read) => {
    clearTimers();
    if (!enabled || typeof window === 'undefined') return;
    try {
      const { meetings } = await read(() => getMeetings({ department }));
      const now = Date.now();
      for (const meeting of meetings || []) {
        if (String(meeting.status || '').toUpperCase() !== 'SCHEDULED') continue;
        const start = meetingStartMs(meeting.scheduledAt);
        if (!Number.isFinite(start) || start <= now) continue;
        for (const reminder of MEETING_REMINDERS) {
          const dueWindow = reminderWindow(start, reminder.type);
          if (meeting[reminder.sentField] || now >= dueWindow.until) continue;
          const delay = Math.max(0, dueWindow.from - now);
          // Browser timers cannot safely exceed a signed 32-bit delay. A
          // realtime meeting update or next app visit will schedule far-future
          // meetings closer to their start time.
          if (delay > 2_147_000_000) continue;
          timersRef.current.push(window.setTimeout(() => {
            void sendMeetingReminder({ meetingId: meeting.id, reminderType: reminder.type })
              .catch((error: unknown) => console.error('[Meeting Reminder] Failed:', error));
          }, delay));
        }
      }
    } catch (error) {
      if (read.cancelled) return;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Meeting Reminder] Unable to schedule scoped reminders.', error);
      }
    }
  }, [clearTimers, department, enabled]);

  useEffect(() => {
    void schedule();
    return clearTimers;
  }, [schedule, clearTimers]);
}
