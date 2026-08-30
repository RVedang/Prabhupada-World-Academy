import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';
import { previewBulkUsers, requireBulkUserManager } from '@/lib/bulkUserManagement';

const rowSchema = z.record(z.string(), z.string().max(1000));

export default createEndpoint({
  description: 'Validate and preview a FOLK Guide bulk-user CSV without writing data',
  authenticated: true,
  requiredCapabilities: 'users.bulk.manage',
  maxBodyBytes: 8 * 1024 * 1024,
  inputSchema: z.object({
    headers: z.array(z.string().min(1).max(100)).max(100),
    rows: z.array(rowSchema).min(1).max(1000),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    await requireBulkUserManager(context.user);
    const preview = await previewBulkUsers(input.headers, input.rows);
    return {
      ...preview,
      rows: preview.rows.map(({ normalized: _normalized, ...row }) => row),
    };
  },
});

