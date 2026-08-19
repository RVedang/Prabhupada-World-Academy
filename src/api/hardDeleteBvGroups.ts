import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Hard-delete BV groups (Super Admin only) — permanently removes from Firestore',
  authenticated: true,
  inputSchema: z.object({
    groupNames: z.array(z.string()).optional(),
    groupIds: z.array(z.string()).optional(),
    deleteAll: z.boolean().optional(),
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

    // Option 1: Delete all groups in the database
    if (input.deleteAll === true) {
      const { records: allGroups } = await BvGroups.findAll({ limit: 5000 });
      for (const g of allGroups) {
        // Delete all members
        const { records: members } = await BvGroupMembers.findAll({
          filters: { group: g.id },
          limit: 1000,
        });
        for (const m of members) {
          await BvGroupMembers.delete({ id: m.id });
        }

        // Delete group
        await BvGroups.delete({ id: g.id });
        deleted++;
      }
      details.push(`All ${deleted} Bhakti Vriksha groups have been deleted from the database.`);
      return { deleted, details };
    }

    // Option 2: Delete by IDs
    if (input.groupIds && input.groupIds.length > 0) {
      for (const id of input.groupIds) {
        const group = await BvGroups.findOne({ id }).catch(() => null);
        if (group) {
          // Delete member associations
          const { records: members } = await BvGroupMembers.findAll({
            filters: { group: id },
            limit: 1000,
          });
          for (const m of members) {
            await BvGroupMembers.delete({ id: m.id });
          }

          // Hard delete group
          await BvGroups.delete({ id });
          deleted++;
          details.push(`Deleted ID: ${id} ("${group.groupName}")`);
        } else {
          details.push(`Not found ID: ${id}`);
        }
      }
    }

    // Option 3: Delete by names
    if (input.groupNames && input.groupNames.length > 0) {
      for (const name of input.groupNames) {
        const { records: found } = await BvGroups.findAll({
          filters: { groupName: name },
          limit: 100,
        });

        for (const g of found) {
          const { records: members } = await BvGroupMembers.findAll({
            filters: { group: g.id },
            limit: 1000,
          });
          for (const m of members) {
            await BvGroupMembers.delete({ id: m.id });
          }

          await BvGroups.delete({ id: g.id });
          deleted++;
          details.push(`Deleted Name: "${g.groupName}" (id: ${g.id})`);
        }

        if (found.length === 0) {
          details.push(`Not found Name: "${name}"`);
        }
      }
    }

    return { deleted, details };
  },
});
