import { z } from 'zod';
import { createEndpoint, Config } from '@/lib/backend-sdk';

function defaultNotificationConfig(segment: 'PW' | 'FOLK') {
  return {
    enabled: true,
    times: ['21:20', '22:20'],
    frequency: 'daily',
    customDays: [0, 1, 2, 3, 4, 5, 6],
    title: '📿 Sadhana Reminder',
    body: 'Time to fill your Sadhana report before sleeping tonight!',
    updatedAt: new Date().toISOString(),
    updatedBy: `${segment} Super Admin`,
  };
}

export default createEndpoint({
  description: 'Get department-specific Sadhana notification config',
  public: true,
  inputSchema: z.object({
    segment: z.enum(['PW', 'FOLK']).optional().default('PW'),
  }),
  outputSchema: z.any(),
  execute: async ({ input }: { input: { segment: 'PW' | 'FOLK' } }) => {
    const segment = input.segment || 'PW';
    const fallback = defaultNotificationConfig(segment);
    const key = `${segment.toLowerCase()}_sadhana_notification_config`;
    const existing = await Config.findOne({ filters: { configKey: key } });
    if (existing && existing.configValue) {
      try {
        return { ...fallback, ...JSON.parse(existing.configValue) };
      } catch {
        return fallback;
      }
    }
    return fallback;
  },
});
