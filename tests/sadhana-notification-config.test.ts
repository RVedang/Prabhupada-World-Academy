import assert from 'node:assert/strict';
import test from 'node:test';

import getNotificationConfig from '../src/api/getPwNotificationConfig';
import saveNotificationConfig from '../src/api/savePwNotificationConfig';
import { Config } from '../src/lib/app-backend-sdk';

test('PW and FOLK Sadhana schedules use separate configuration records', async t => {
  const lookedUpKeys: string[] = [];
  const createdKeys: string[] = [];

  t.mock.method(Config, 'findOne', async ({ filters }: any) => {
    lookedUpKeys.push(filters.configKey);
    return filters.configKey === 'folk_sadhana_notification_config'
      ? {
          id: 'folk-config',
          configValue: JSON.stringify({
            enabled: true,
            times: ['20:15'],
            frequency: 'daily',
            title: 'FOLK reminder',
            body: 'Submit Sadhana',
          }),
        }
      : null;
  });
  t.mock.method(Config, 'create', async ({ record }: any) => {
    createdKeys.push(record.configKey);
    return { id: record.configKey };
  });

  const folkConfig = await getNotificationConfig.execute({
    input: { segment: 'FOLK' }, context: {},
  } as never);
  assert.deepEqual(folkConfig.times, ['20:15']);
  assert.equal(folkConfig.title, 'FOLK reminder');

  await saveNotificationConfig.execute({
    input: {
      segment: 'PW', enabled: true, times: ['21:20'], frequency: 'daily',
      customDays: [0, 1, 2, 3, 4, 5, 6], title: 'PW reminder',
      body: 'Submit Sadhana', updatedBy: 'PW Admin',
    },
    context: {
      user: { segment: 'PW', capabilities: ['notifications.send'] },
    },
  } as never);

  assert.deepEqual(lookedUpKeys, [
    'folk_sadhana_notification_config',
    'pw_sadhana_notification_config',
  ]);
  assert.deepEqual(createdKeys, ['pw_sadhana_notification_config']);
});

