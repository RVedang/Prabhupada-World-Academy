import { z } from 'zod';
import { createEndpoint, BvGroups, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Update a BV group name, description, WhatsApp link, or assigned Sub-Facilitator (RGSF)',
  authenticated: true,
  inputSchema: z.object({
    groupId: z.string(),
    groupName: z.string().optional(),
    description: z.string().optional(),
    whatsAppLink: z.string().optional(),
    subFacilitatorId: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input }: any) => {
    const group = await BvGroups.findOne({ filters: { groupId: input.groupId }, fields: ['id'] })
      ?? await BvGroups.findOne({ id: input.groupId, fields: ['id'] });
    if (!group) throw new AppError({ code: 'NOT_FOUND', message: 'Group not found' });

    const updates: any = {};
    if (input.groupName !== undefined) updates.groupName = input.groupName;
    if (input.description !== undefined) updates.description = input.description;
    if (input.whatsAppLink !== undefined) updates.whatsAppLink = input.whatsAppLink;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.subFacilitatorId !== undefined) {
      updates.subFacilitatorId = input.subFacilitatorId;
      updates.rgsfId = input.subFacilitatorId;

      if (input.subFacilitatorId) {
        const u = await Users.findOne({ filters: { userId: input.subFacilitatorId }, fields: ['id'] })
          ?? await Users.findOne({ id: input.subFacilitatorId, fields: ['id'] });
        if (u) {
          await Users.update({ id: u.id, record: { isBvSubFacilitator: true } });
        }
      }
    }

    await BvGroups.update({ id: group.id, record: updates });

    return { success: true };
  },
});
