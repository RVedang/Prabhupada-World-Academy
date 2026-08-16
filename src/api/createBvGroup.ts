import { z } from 'zod';
import { createEndpoint, BvGroups, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Create a new Bhakti Vriksha Reading Group',
  authenticated: true,
  inputSchema: z.object({
    groupName: z.string().min(1).max(200).transform(s => s.trim()),
    bvslId: z.string().min(1).max(100), // Facilitator (RGF) User ID or Email
    meetingTime: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    groupId: z.string(),
  }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const userEmail = (context.user.email || '').toLowerCase();
    const isAuthorized = context.user.role === 'SUPER_GUIDE' ||
      context.user.role === 'GUIDE' ||
      userEmail === 'srilaprabhupadaworld@gmail.com' ||
      context.user.isBvAdmin ||
      context.user.isBvSuperAdmin;

    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Admin access required to create Reading Groups' });
    }

    // Resolve facilitator name and segment
    let bvslName = 'Unassigned';
    let segment = 'PW';
    if (input.bvslId) {
      const facilitatorUser = await Users.findOne({ id: input.bvslId, fields: ['fullName', 'email', 'segment'] });
      if (facilitatorUser) {
        bvslName = facilitatorUser.fullName || facilitatorUser.email || input.bvslId;
        segment = facilitatorUser.segment || 'PW';
      }
    }

    const groupId = `BV-GROUP-${Date.now()}`;
    const newGroup = {
      id: groupId,
      groupName: input.groupName,
      bvslId: input.bvslId,
      bvslName,
      meetingTime: input.meetingTime || '',
      description: input.description || '',
      isActive: true,
      segment,
      createdAt: new Date().toISOString(),
    };

    await BvGroups.create({ record: newGroup });

    return {
      success: true,
      groupId,
    };
  },
});
