import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';
import { getBulkExportOptions, requireBulkUserManager } from '@/lib/bulkUserManagement';

export default createEndpoint({
  description: 'Return guide-scoped group and guide filters for FOLK user export',
  authenticated: true,
  requiredCapabilities: 'users.bulk.manage',
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    const manager = await requireBulkUserManager(context.user);
    return getBulkExportOptions(manager);
  },
});

