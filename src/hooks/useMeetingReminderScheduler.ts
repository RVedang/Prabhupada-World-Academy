import { useCallback, useEffect, useRef } from 'react';
import { getMeetings, sendMeetingReminder } from '@/lib/endpoints-sdk';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type MeetingDepartment = 'FOLK' | 'PW';

function meetingStartMs(value: string): number {
  const normalized = value.includes('T') && !value.endsWith('Z') && !value.includes('+')
    ? `${value}+05:30`
    : value;
  return new Date(normalized).getTime();
}

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

  const schedule = useCallback(async () => {
    clearTimers();
    if (!enabled || typeof window === 'undefined') return;
    try {
      const { meetings } = await getMeetings({ department });
      const now = Date.now();
      for (const meeting of meetings || []) {
        if (String(meeting.status || '').toUpperCase() !== 'SCHEDULED') continue;
        const start = meetingStartMs(meeting.scheduledAt);
        if (!Number.isFinite(start) || start <= now) continue;
        const reminders = [
          { at: start - 10 * 60_000, type: 'TEN_MINUTES' as const, sent: meeting.notification10mSent },
          { at: start - 60_000, type: 'ONE_MINUTE' as const, sent: meeting.notification1mSent },
        ];
        for (const reminder of reminders) {
          if (reminder.sent || reminder.at <= now) continue;
          const delay = reminder.at - now;
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
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Meeting Reminder] Unable to schedule scoped reminders.', error);
      }
    }
  }, [clearTimers, department, enabled]);

  useEffect(() => {
    void schedule();
    return clearTimers;
  }, [schedule, clearTimers]);
  useRealtimeRefresh(['meetings'], schedule, enabled);
}
