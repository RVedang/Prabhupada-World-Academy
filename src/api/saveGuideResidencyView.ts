import { z } from 'zod';
import { createEndpoint, Guides, AppError } from '@/lib/backend-sdk';

function normalizeIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v || '').trim()).filter(Boolean);
  }
  const single = String(value || '').trim();
  return single ? [single] : [];
}

export default createEndpoint({
  description: 'Save the active FOLK residency view for the logged-in guide profile',
  authenticated: true,
  inputSchema: z.object({
    residencyId: z.string().nullable().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    activeResidencyId: z.string().nullable(),
  }),
  execute: async ({ input, context }) => {
    if (!context.user?.email) throw new Error('Unauthorized');

    const role = String(context.user.role || '').toUpperCase().replace(/\s+/g, '_');
    const isGuideLike = !!(
      role === 'GUIDE' ||
      role === 'SUPER_GUIDE' ||
      role === 'ADMIN' ||
      role === 'SUPER_ADMIN' ||
      (context.user as any).isBvAdmin ||
      (context.user as any).isBvSuperAdmin
    );
    if (!isGuideLike) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only guides can save a residency view' });
    }

    const guide = await Guides.findOne({
      filters: { email: context.user.email, isActive: true },
      fields: ['id', 'folkResidencies'],
    });
    if (!guide) throw new AppError({ code: 'NOT_FOUND', message: 'Guide record not found' });

    const linkedResidencyIds = normalizeIds((guide as any).folkResidencies);
    const nextResidencyId = String(input.residencyId || '').trim();

    if (nextResidencyId && !linkedResidencyIds.includes(nextResidencyId)) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'Please select one of your linked residencies' });
    }

    await Guides.update({
      id: (guide as any).id,
      record: {
        activeResidencyView: nextResidencyId || null,
      },
    });

    return {
      success: true,
      activeResidencyId: nextResidencyId || null,
    };
  },
});
