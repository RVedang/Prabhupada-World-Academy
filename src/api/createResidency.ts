import { z } from 'zod';
import { createEndpoint, FolkResidencies, AppError } from '@/lib/backend-sdk';
import { invalidateServiceReferenceData } from '../lib/serviceReferenceData';

export default createEndpoint({
  description: 'Create a new residency (Guide access required)',
  authenticated: true,
  inputSchema: z.object({
    residencyName: z.string(),
    capacity: z.number().optional(),
    guideId: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (!context.user) throw new Error('Unauthorized');
    const isSuperGuide = context.user.role === 'Super Guide';
    const isGuide = context.user.role === 'Guide';
    if (!isSuperGuide && !isGuide) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Guide access required to create residency' });
    }
    if (!input.residencyName) throw new AppError({ code: 'BAD_REQUEST', message: 'residencyName is required' });

    const record = await FolkResidencies.create({
      record: {
        residencyName: input.residencyName,
        maxCapacity: input.capacity || 0,
        isActive: true,
      },
    });
    invalidateServiceReferenceData();

    return { success: true, residencyId: record.id };
  },
});
