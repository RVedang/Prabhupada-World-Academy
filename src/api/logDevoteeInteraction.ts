import { z } from 'zod';
import { createEndpoint, OneToOneMeetings, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Log an interaction / touchpoint with a devotee (Call, WhatsApp, 1-on-1, Home Visit, Note)',
  authenticated: true,
  inputSchema: z.object({
    devoteeId: z.string(),
    interactionType: z.enum(['Call', 'WhatsApp', 'OneToOne', 'HomeVisit', 'Encouragement', 'Note']),
    notes: z.string(),
    callStatus: z.string().optional(),
    durationMinutes: z.number().optional(),
    nextCallDate: z.string().optional(),
    nextCallAgenda: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    id: z.string(),
  }),
  execute: async ({ input, context }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });

    const today = new Date().toISOString().split('T')[0];

    const record = await OneToOneMeetings.create({
      memberId: input.devoteeId,
      guideId: context.user.id,
      meetingDate: today,
      weekDate: today,
      notes: `[${input.interactionType.toUpperCase()}] ${input.notes}`,
      callStatus: input.callStatus || 'Connected',
      durationMinutes: input.durationMinutes || 0,
      nextCallDate: input.nextCallDate || null,
      nextCallAgenda: input.nextCallAgenda || null,
    } as any);

    return {
      success: true,
      id: record.id,
    };
  },
});
