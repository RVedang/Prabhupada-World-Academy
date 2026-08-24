import { z } from 'zod';
import { createEndpoint, AppError, ChallengeEnrollments, AttendanceSessions } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Join a challenge for a session (public)',
  public: true,
  inputSchema: z.object({
    sessionId: z.string().min(1).max(128),
    token: z.string().min(16).max(200),
    userId: z.string().min(1).max(128).optional(),
    participantId: z.string().min(1).max(128).optional(),
  }),
  outputSchema: z.object({
    enrollmentId: z.string(),
    currentStreak: z.number(),
    challengeDays: z.number(),
  }),
  execute: async ({ input, context }: any) => {
    const session = await AttendanceSessions.findOne({ id: input.sessionId });
    if (!session || session.shareToken !== input.token || !session.challengeEnabled) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'Challenge not available' });
    }
    if (!input.userId && !input.participantId) throw new AppError({ code: 'BAD_REQUEST', message: 'userId or participantId required' });
    if (input.userId && (!context.user || (input.userId !== context.user.id && input.userId !== context.user.userId))) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You may only join a challenge for your own signed-in account.' });
    }

    // Check existing
    const filters: any = { session: input.sessionId };
    if (input.userId) filters.user = input.userId;
    if (input.participantId) filters.participant = input.participantId;
    const existing = await ChallengeEnrollments.findOne({ filters });
    if (existing) {
      return { enrollmentId: existing.id, currentStreak: existing.currentStreak || 0, challengeDays: session.challengeDays || 7 };
    }

    const today = new Date().toISOString().slice(0, 10);
    const record: any = { session: input.sessionId, currentStreak: 1, lastAttendanceDate: today, status: 'Active' };
    if (input.userId) record.user = input.userId;
    if (input.participantId) record.participant = input.participantId;
    const enrollment = await ChallengeEnrollments.create({ record });

    return { enrollmentId: enrollment.id, currentStreak: 1, challengeDays: session.challengeDays || 7 };
  },
});
