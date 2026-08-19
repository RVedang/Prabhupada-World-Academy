import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Hard-delete BV groups by name (Super Admin only) — permanently removes from Firestore',
  authenticated: true,
  inputSchema: z.object({
    groupNames: z.array(z.string()).min(1),
  }),
  outputSchema: z.object({
    deleted: z.number(),
    details: z.array(z.string()),
  }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const isSuperAdmin = !!(
      context.user.isBvSuperAdmin ||
      (context.user.role || '').toLowerCase().includes('super')
    );
    if (!isSuperAdmin) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Super Admin access required' });
    }

    let deleted = 0;
    const details: string[] = [];

    for (const name of input.groupNames) {
      const { records: found } = await BvGroups.findAll({
        filters: { groupName: name },
        limit: 50,
      });

      for (const g of found) {
        // Delete all member associations
        const { records: members } = await BvGroupMembers.findAll({
          filters: { group: g.id },
          limit: 500,
        });
        for (const m of members) {
          await BvGroupMembers.delete({ id: m.id });
        }

        // Hard delete the group
        await BvGroups.delete({ id: g.id });
        deleted++;
        details.push(`Deleted: "${g.groupName}" (id: ${g.id}, members removed: ${members.length})`);
      }

      if (found.length === 0) {
        details.push(`Not found: "${name}"`);
      }
    }

    return { deleted, details };
  },
});
