import { z } from 'zod';
import { createEndpoint, Meetings, AppError } from '@/lib/backend-sdk';
import sendMeetingReminder from './sendMeetingReminder';

const REMINDER_WINDOW_MS = 90_000;

function meetingStartMs(value: string): number {
  const normalized = value.includes('T') && !value.endsWith('Z') && !value.includes('+')
    ? `${value}+05:30`
    : value;
  return new Date(normalized).getTime();
}

/**
 * Runs once per minute from Cloud Scheduler. The individual sender is
 * idempotent, so overlapping scheduler invocations cannot duplicate a
 * reminder after its meeting flag has been recorded.
 */
export default createEndpoint({
  description: 'Dispatch due 10-minute and 1-minute meeting reminders. Called by Cloud Scheduler every minute.',
  public: true,
  inputSchema: z.object({
    cronSecret: z.string().min(16).max(256),
  }),
  outputSchema: z.object({
    checked: z.number(),
    tenMinuteReminders: z.number(),
    oneMinuteReminders: z.number(),
    failed: z.number(),
  }),
  execute: async ({ input }: { input: any }) => {
    const validCronSecrets = [process.env.APP_CRON_SECRET, process.env.ZITE_CRON_SECRET].filter(Boolean);
    if (!validCronSecrets.includes(input.cronSecret)) {
      throw new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized scheduler request' });
    }

    const { records: meetings } = await Meetings.findAll({ limit: 1000 });
    const now = Date.now();
    let checked = 0;
    let tenMinuteReminders = 0;
    let oneMinuteReminders = 0;
    let failed = 0;

    for (const meeting of meetings) {
      const segment = String(meeting.segment || 'PW').trim().toUpperCase();
      if (segment === 'FOLK') continue;
      if (String(meeting.status || 'SCHEDULED').toUpperCase() !== 'SCHEDULED') continue;
      const start = meetingStartMs(String(meeting.scheduledAt || ''));
      if (!Number.isFinite(start)) continue;
      checked++;

      const dueReminders = [
        { type: 'TEN_MINUTES' as const, at: start - 10 * 60_000, sent: !!meeting.notification10mSent },
        { type: 'ONE_MINUTE' as const, at: start - 60_000, sent: !!meeting.notification1mSent },
      ];

      for (const reminder of dueReminders) {
        if (reminder.sent || now < reminder.at || now >= reminder.at + REMINDER_WINDOW_MS) continue;
        try {
          const result = await sendMeetingReminder.execute({
            input: { meetingId: meeting.id, reminderType: reminder.type, cronSecret: input.cronSecret },
            context: {},
          } as never);
          if (!result.success) {
            failed++;
          } else if (reminder.type === 'TEN_MINUTES') {
            tenMinuteReminders++;
          } else {
            oneMinuteReminders++;
          }
        } catch (error) {
          failed++;
          console.error(`[Meeting Reminder] Failed to dispatch ${reminder.type} reminder for ${meeting.id}:`, error);
        }
      }
    }

    return { checked, tenMinuteReminders, oneMinuteReminders, failed };
  },
});
