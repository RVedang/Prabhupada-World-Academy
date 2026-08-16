import { z } from 'zod';
import { createEndpoint, OneToOneMeetings, Guides, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Log or update a one-to-one meeting (upserts by guide×member×week)',
  authenticated: true,
  inputSchema: z.object({
    memberId: z.string(),
    weekDate: z.string(),
    meetingDate: z.string(),
    durationMinutes: z.number(),
    notes: z.string().optional(),
    guideId: z.string().optional(),
    callStatus: z.enum(['Connected', 'Did not answer', 'Did not place the call']).optional(),
    recordingLink: z.string().optional(),
    nextCallDate: z.string().optional(),
    nextCallAgenda: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    let guideId = context.user!.id;

    // Elevated roles (supervisors/admins/super-admins) can act on behalf of any RGF
    const isElevated = context.user!.isBvSupervisor ||
      context.user!.isBvAdmin ||
      context.user!.isBvSuperAdmin ||
      context.user!.role === 'SUPER_ADMIN';

    if (input.guideId && isElevated) {
      // Admin acting on behalf of an RGF — use the provided guideId directly
      guideId = input.guideId;
    } else if (input.guideId && context.user!.isSadhanaMentor) {
      // Sadhana Mentor: validate they belong to the specified guide
      const mentorGuideRef = Array.isArray(context.user!.guide) ? context.user!.guide[0] : context.user!.guide;
      const guide = await Guides.findOne({ id: mentorGuideRef || '', fields: ['id'] });
      if (!guide || guide.id !== input.guideId) {
        throw new AppError({ code: 'FORBIDDEN', message: 'You can only log meetings for your assigned guide' });
      }
      guideId = input.guideId;
    }
    const record = {
      meetingDate: input.meetingDate,
      durationMinutes: input.durationMinutes,
      notes: input.notes || '',
      callStatus: input.callStatus || 'Connected',
      recordingLink: input.recordingLink || '',
      nextCallDate: input.nextCallDate || '',
      nextCallAgenda: input.nextCallAgenda || '',
    };

    const existing = await OneToOneMeetings.findOne({
      filters: { guide: guideId, member: input.memberId, weekDate: input.weekDate } as any,
    });

    if (existing) {
      await OneToOneMeetings.update({ id: existing.id, record });
      return {
        id: existing.id,
        created: false,
        memberId: input.memberId,
        weekDate: input.weekDate,
        ...record,
        guideId,
      };
    }

    const created = await OneToOneMeetings.create({
      record: { guide: guideId, member: input.memberId, weekDate: input.weekDate, ...record },
    });
    return {
      id: created.id,
      created: true,
      memberId: input.memberId,
      weekDate: input.weekDate,
      ...record,
      guideId,
    };
  },
});
