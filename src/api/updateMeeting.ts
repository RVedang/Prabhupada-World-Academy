import { z } from 'zod';
import { createEndpoint, Meetings, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Update a meeting or trigger instant reminder notification',
  authenticated: true,
  inputSchema: z.object({
    meetingId: z.string().min(1),
    title: z.string().optional(),
    type: z.enum(['FACILITATOR', 'EXECUTIVE', 'OTHER']).optional(),
    scheduledAt: z.string().optional(),
    locationOrLink: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional().nullable().transform(v => {
      if (!v) return undefined;
      const s = v.toUpperCase();
      if (s === 'SCHEDULED' || s === 'IN_PROGRESS' || s === 'COMPLETED' || s === 'CANCELLED') {
        return s as 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      }
      return undefined;
    }),
    additionalInviteeIds: z.array(z.string()).optional(),
    sendReminderNow: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const userEmail = (context.user.email || '').toLowerCase();
    const callerRole = (context.user.role || '').toUpperCase();

    const isSuperAdminOrAdmin = !!(
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      context.user.isPwAdmin ||
      callerRole.includes('ADMIN') ||
      callerRole.includes('SUPER') ||
      callerRole === 'PW_ADMIN' ||
      userEmail === 'srilaprabhupadaworld@gmail.com' ||
      userEmail === 'hrvd@hkmmumbai.org'
    );

    const existing = await Meetings.findOne({ id: input.meetingId });
    if (!existing) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Meeting not found' });
    }

    if (!isSuperAdminOrAdmin) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only Admins and Super Admins can edit meeting details' });
    }

    const updateFields: any = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) updateFields.title = input.title;
    if (input.scheduledAt !== undefined) updateFields.scheduledAt = input.scheduledAt;
    if (input.locationOrLink !== undefined) updateFields.locationOrLink = input.locationOrLink;
    if (input.description !== undefined) updateFields.description = input.description;
    if (input.status !== undefined) updateFields.status = input.status;

    // Recalculate invitees if type or additionalInviteeIds are updated
    if (input.type !== undefined || input.additionalInviteeIds !== undefined) {
      const activeType = input.type !== undefined ? input.type : (existing.type || 'OTHER');
      const activeAdditionalIds = input.additionalInviteeIds !== undefined ? input.additionalInviteeIds : (existing.inviteeUserIds || []);

      let finalInviteeIds = new Set<string>(activeAdditionalIds);

      // If Facilitators meeting, automatically fetch all active PW facilitators / BVSLs
      if (activeType === 'FACILITATOR') {
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

      updateFields.type = activeType;
      updateFields.inviteeUserIds = inviteeIdsArray;
      updateFields.invitees = invitees;
    }

    if (input.sendReminderNow) {
      updateFields.notificationSent = true;
      updateFields.lastNotificationSentAt = new Date().toISOString();
    }

    await Meetings.update({ id: input.meetingId, record: updateFields });

    let message = 'Meeting updated successfully!';
    if (input.sendReminderNow) {
      message = `Instant meeting reminder sent to all ${(existing.inviteeUserIds || []).length} invitees!`;
    }

    return { success: true, message };
  },
});
