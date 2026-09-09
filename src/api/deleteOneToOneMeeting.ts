import { z } from 'zod';
import { createEndpoint, OneToOneMeetings, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Delete a one-to-one meeting record',
  authenticated: true,
  inputSchema: z.object({ meetingId: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const meeting = await OneToOneMeetings.findOne({ id: input.meetingId });
    if (!meeting) throw new AppError({ code: 'NOT_FOUND', message: 'Meeting not found' });

    const guideId = Array.isArray(meeting.guide) ? meeting.guide[0] : meeting.guide;
    const isOwner = guideId === context.user!.id;
    // Sadhana Mentors can delete meetings for their assigned guide
    let isMentorForGuide = false;
    if (!isOwner && context.user!.isSadhanaMentor) {
      const mentor = await Users.findOne({ id: context.user.id, fields: ['guide'] });
      const mentorGuideRef = Array.isArray(mentor?.guide) ? mentor.guide[0] : mentor?.guide;
      isMentorForGuide = !!mentorGuideRef && mentorGuideRef === guideId;
    }
    if (!isOwner && !isMentorForGuide) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You can only delete your own meeting records' });
    }

    await OneToOneMeetings.delete({ id: input.meetingId });
    return { success: true };
  },
});
