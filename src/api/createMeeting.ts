import { z } from 'zod';
import { createEndpoint, Meetings, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Create a new Prabhupada World meeting (Facilitators, Executive, or Other)',
  authenticated: true,
  inputSchema: z.object({
    title: z.string().min(1, 'Meeting title is required'),
    type: z.enum(['FACILITATOR', 'EXECUTIVE', 'OTHER']),
    scheduledAt: z.string(),
    durationMinutes: z.number().default(60),
    locationOrLink: z.string().optional().default(''),
    description: z.string().optional().default(''),
    notificationLeadMinutes: z.number().default(10),
    additionalInviteeIds: z.array(z.string()).optional().default([]),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    meetingId: z.string(),
    message: z.string(),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const userEmail = (context.user.email || '').toLowerCase();
    const callerRole = (context.user.role || '').toUpperCase();

    const isAuthorized = !!(
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      context.user.isPwAdmin ||
      callerRole.includes('ADMIN') ||
      callerRole.includes('SUPER') ||
      callerRole === 'PW_ADMIN' ||
      userEmail === 'srilaprabhupadaworld@gmail.com' ||
      userEmail === 'hrvd@hkmmumbai.org'
    );

    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only Admins and Super Admins can create meetings' });
    }

    let finalInviteeIds = new Set<string>(input.additionalInviteeIds || []);

    // If Facilitators meeting, automatically fetch all active PW facilitators / BVSLs
    if (input.type === 'FACILITATOR') {
      const { records: allUsers } = await Users.findAll({ limit: 2000 });
      const pwFacilitators = allUsers.filter((u: any) => {
        const seg = (u.segment || '').toUpperCase();
        const r = (u.role || '').toUpperCase();
        return (seg === 'PW' || !seg) && (
          u.isBvFacilitator ||
          u.isBvsl ||
          r === 'BVSL' ||
          r === 'FACILITATOR'
        );
      });

      pwFacilitators.forEach(f => finalInviteeIds.add(f.id));
    }

    const inviteeIdsArray = Array.from(finalInviteeIds);

    // Fetch details of all invitees
    let invitees: any[] = [];
    if (inviteeIdsArray.length > 0) {
      const { records: inviteeUsers } = await Users.findAll({
        filters: { id: { in: inviteeIdsArray } },
        fields: ['id', 'fullName', 'email', 'role'],
        limit: 2000,
      });
      invitees = inviteeUsers.map(u => ({
        userId: u.id,
        fullName: u.fullName || u.email || 'Devotee',
        email: u.email || '',
        role: u.role || 'Member',
      }));
    }

    const meetingDoc = {
      title: input.title.trim(),
      type: input.type,
      segment: 'PW',
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      locationOrLink: input.locationOrLink.trim(),
      description: input.description.trim(),
      createdByUserId: context.user.id || '',
      createdByName: context.user.fullName || context.user.email || 'Admin',
      createdByRole: callerRole,
      inviteeUserIds: inviteeIdsArray,
      invitees,
      notificationLeadMinutes: input.notificationLeadMinutes,
      notificationSent: false,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await Meetings.create({ record: meetingDoc });

    return {
      success: true,
      meetingId: res.id,
      message: `Meeting "${input.title}" scheduled successfully!`,
    };
  },
});
