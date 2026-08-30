import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';
import { BULK_USER_CSV_FIELDS, BULK_USER_CSV_HEADERS } from '@/config/bulkUserCsv';
import { requireBulkUserManager } from '@/lib/bulkUserManagement';

export default createEndpoint({
  description: 'Return the authorized FOLK bulk-user CSV template derived from the registration forms',
  authenticated: true,
  requiredCapabilities: 'users.bulk.manage',
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    await requireBulkUserManager(context.user);
    return {
      headers: BULK_USER_CSV_HEADERS,
      fields: BULK_USER_CSV_FIELDS,
      filename: 'folk-user-import-template.csv',
    };
  },
});

