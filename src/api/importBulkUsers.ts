import { z } from 'zod';
import { createEndpoint } from '@/lib/backend-sdk';
import { createBulkUser, previewBulkUsers, requireBulkUserManager } from '@/lib/bulkUserManagement';

const rowSchema = z.record(z.string(), z.string().max(1000));

export default createEndpoint({
  description: 'Create normal FOLK users and approved BV registrations from a validated CSV',
  authenticated: true,
  requiredCapabilities: 'users.bulk.manage',
  maxBodyBytes: 8 * 1024 * 1024,
  inputSchema: z.object({
    headers: z.array(z.string().min(1).max(100)).max(100),
    rows: z.array(rowSchema).min(1).max(1000),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    const manager = await requireBulkUserManager(context.user);
    // Never trust client preview state: validation and duplicate checks are
    // repeated immediately before the server performs writes.
    const preview = await previewBulkUsers(input.headers, input.rows);
    let created = 0;
    let alreadyExisting = preview.existingUsers;
    const failures = preview.rows
      .filter(row => row.status === 'invalid')
      .map(row => ({ rowNumber: row.rowNumber, email: row.email, fullName: row.fullName, errors: row.errors }));

    const pending = preview.rows.filter(item => item.status === 'new' && item.normalized);
    // Bound concurrency to keep large imports fast without exhausting the
    // Firestore connection pool or write quota.
    for (let offset = 0; offset < pending.length; offset += 20) {
      const chunk = pending.slice(offset, offset + 20);
      const outcomes = await Promise.all(chunk.map(async (row, chunkIndex) => {
        try {
          const value = await createBulkUser(row.normalized!, manager, offset + chunkIndex);
          return { row, value };
        } catch (error: any) {
          return { row, error };
        }
      }));
      for (const outcome of outcomes) {
        if ('error' in outcome) {
          const error: any = outcome.error;
          if (error?.code === 'CONFLICT' || /already exists/i.test(error?.message || '')) alreadyExisting += 1;
          else failures.push({ rowNumber: outcome.row.rowNumber, email: outcome.row.email, fullName: outcome.row.fullName, errors: [error?.message || 'Database write failed'] });
        } else if (outcome.value.status === 'created') created += 1;
        else alreadyExisting += 1;
      }
    }

    return {
      success: failures.length === 0,
      totalRecords: preview.totalRecords,
      created,
      alreadyExisting,
      failed: failures.length,
      failures,
    };
  },
});
