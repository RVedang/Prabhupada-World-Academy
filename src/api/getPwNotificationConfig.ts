import { z } from 'zod';
import { createEndpoint, Config } from '@/lib/backend-sdk';

const DEFAULT_PW_NOTIFICATION_CONFIG = {
  enabled: true,
  times: ['21:20', '22:20'],
  frequency: 'daily',
  customDays: [0, 1, 2, 3, 4, 5, 6],
  title: '📿 Sadhana Reminder',
  body: 'Time to fill your Sadhana report before sleeping tonight!',
  updatedAt: new Date().toISOString(),
  updatedBy: 'PW Super Admin',
};

export default createEndpoint({
  description: 'Get PW Sadhana notification config',
  public: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async () => {
    const key = 'pw_sadhana_notification_config';
    const existing = await Config.findOne({ filters: { configKey: key } });
    if (existing && existing.configValue) {
      try {
        return JSON.parse(existing.configValue);
      } catch {
        return DEFAULT_PW_NOTIFICATION_CONFIG;
      }
    }
    return DEFAULT_PW_NOTIFICATION_CONFIG;
  },
});
