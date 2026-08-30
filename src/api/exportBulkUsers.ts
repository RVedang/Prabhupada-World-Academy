import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';
import { getBulkExportData, requireBulkUserManager } from '@/lib/bulkUserManagement';

export default createEndpoint({
  description: 'Export only normal FOLK users within the authenticated guide hierarchy',
  authenticated: true,
  requiredCapabilities: 'users.bulk.manage',
  inputSchema: z.object({
    status: z.enum(['all', 'active', 'inactive']).optional(),
    startDate: z.string().max(10).optional(),
    endDate: z.string().max(10).optional(),
    groupId: z.string().max(200).optional(),
    assignedGuideId: z.string().max(200).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    const manager = await requireBulkUserManager(context.user);
    return getBulkExportData(manager, input);
  },
});

