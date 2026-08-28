import { z } from 'zod';
import { createEndpoint, Guides, Users, FolkResidencies, AppError } from '@/lib/backend-sdk';
import type { ApiUserContext } from '@/lib/apiAuthorization';

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
  execute: async ({ input, context }: {
    input: { residencyId?: string | null };
    context: { user: ApiUserContext | null };
  }) => {
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
    }).catch(() => undefined);
    const guideUser = !guide
      ? await Users.findOne({
        id: context.user.id,
        fields: ['id', 'userId', 'email', 'folkResidencies'],
      }).catch(() => undefined) ||
        await Users.findOne({
          filters: { userId: context.user.userId },
          fields: ['id', 'userId', 'email', 'folkResidencies'],
        }).catch(() => undefined) ||
        await Users.findOne({
          filters: { email: context.user.email },
          fields: ['id', 'userId', 'email', 'folkResidencies'],
        }).catch(() => undefined)
      : undefined;

    if (!guide && !guideUser) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Guide profile record not found' });
    }

    let linkedResidencyIds = normalizeIds((guide as any)?.folkResidencies || (guideUser as any)?.folkResidencies);
    const isSuperGuide =
      role === 'SUPER_GUIDE' ||
      role === 'SUPER_ADMIN' ||
      (context.user as any).isBvSuperAdmin === true;

    if (isSuperGuide) {
      const { records: residencies } = await FolkResidencies.findAll({
        fields: ['id', 'residencyName', 'isActive'],
        limit: 500,
      });
      linkedResidencyIds = residencies
        .filter((residency: any) => {
          const name = String(residency?.residencyName || '').trim().toLowerCase();
          const isActive = residency?.isActive !== false && residency?.isActive !== 'false';
          return isActive && !name.includes('prabhupada world') && !name.startsWith('pw ');
        })
        .map((residency: any) => String(residency.id || '').trim())
        .filter(Boolean);
    }

    const nextResidencyId = String(input.residencyId || '').trim();

    if (nextResidencyId && !linkedResidencyIds.includes(nextResidencyId)) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'Please select one of your linked residencies' });
    }

    if (guide) {
      await Guides.update({
        id: (guide as any).id,
        record: { activeResidencyView: nextResidencyId || null },
      });
    } else {
      await Users.update({
        id: (guideUser as any).id,
        record: { activeResidencyView: nextResidencyId || null },
      });
    }

    return {
      success: true,
      activeResidencyId: nextResidencyId || null,
    };
  },
});
