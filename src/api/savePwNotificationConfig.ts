import { z } from 'zod';
import { createEndpoint, Config, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Save department-specific Sadhana notification config',
  authenticated: true,
  requiredCapabilities: 'notifications.send',
  inputSchema: z.object({
    segment: z.enum(['PW', 'FOLK']).optional().default('PW'),
    enabled: z.boolean(),
    times: z.array(z.string()),
    frequency: z.enum(['daily', 'weekdays', 'custom']),
    customDays: z.array(z.number()).optional(),
    title: z.string(),
    body: z.string(),
    updatedBy: z.string(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: { input: any; context: any }) => {
    const callerSegment = String(context.user?.segment || '').trim().toUpperCase();
    const role = (context.user?.role || '').replace(/\s/g, '_').toUpperCase();
    const canManageAnyDepartment = context.user?.capabilities?.includes('*');
    const inferredCallerSegment = callerSegment === 'FOLK' || callerSegment === 'PW'
      ? callerSegment
      : (role === 'PW_ADMIN' ? 'PW' : null);
    if (!canManageAnyDepartment && inferredCallerSegment !== input.segment) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You cannot change another department notification schedule' });
    }

    const key = `${input.segment.toLowerCase()}_sadhana_notification_config`;
    const recordValue = JSON.stringify({
      ...input,
      updatedAt: new Date().toISOString(),
    });

    const existing = await Config.findOne({ filters: { configKey: key } });
    if (existing) {
      await Config.update({ id: existing.id, record: { configValue: recordValue } });
    } else {
      await Config.create({ record: { configKey: key, configValue: recordValue } });
    }

    return { success: true, segment: input.segment };
  },
});
