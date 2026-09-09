import { z } from 'zod';
import { createEndpoint, Config, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Save department-specific Sadhana notification config',
  authenticated: true,
  requiredCapabilities: 'notifications.send',
  inputSchema: z.object({
    segment: z.enum(['PW', 'FOLK']).optional().default('PW'),
    enabled: z.boolean(),
    times: z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)).min(1).max(24),
    frequency: z.enum(['daily', 'weekdays', 'custom']),
    customDays: z.array(z.number().int().min(0).max(6)).optional(),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1000),
    updatedBy: z.string(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: { input: any; context: any }) => {
    if (input.frequency === 'custom' && !input.customDays?.length) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'Select at least one day for the custom schedule' });
    }
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
