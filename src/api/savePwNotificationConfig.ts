import { z } from 'zod';
import { createEndpoint, Config, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Save PW Sadhana notification config',
  authenticated: true,
  inputSchema: z.object({
    enabled: z.boolean(),
    times: z.array(z.string()),
    frequency: z.enum(['daily', 'weekdays', 'custom']),
    customDays: z.array(z.number()).optional(),
    title: z.string(),
    body: z.string(),
    updatedBy: z.string(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    // Check permission
    const role = (context.user?.role || '').replace(/\s/g, '_').toUpperCase();
    if (!['SUPER_GUIDE', 'SUPER_ADMIN', 'PW_ADMIN'].includes(role)) {
      throw new AppError({ code: 'FORBIDDEN', message: 'PW Super Admin access required' });
    }

    const key = 'pw_sadhana_notification_config';
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

    return { success: true };
  },
});
