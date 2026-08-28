import { z } from 'zod';
import { createEndpoint, FolkResidencies, GuideResidencyAssignmentRequests, AppError } from '@/lib/backend-sdk';

const roleName = (value: unknown) => String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
const ids = (value: unknown): string[] => (Array.isArray(value) ? value : value == null ? [] : [value]).map(v => String(v || '').trim()).filter(Boolean);

export default createEndpoint({
  description: 'List pending FOLK guide residency assignment requests for Super Guides',
  authenticated: true,
  inputSchema: z.object({ status: z.enum(['Pending', 'Approved', 'Rejected', 'ALL']).optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const role = roleName(context.user.role);
    if (!(role === 'SUPER_GUIDE' || role === 'SUPER_ADMIN' || context.user.isBvSuperAdmin === true)) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Super Guide access required' });
    }
    const { records: residencies } = await FolkResidencies.findAll({ limit: 500, fields: ['id', 'residencyName'] });
    const names = new Map(residencies.map((r: any) => [String(r.id), r.residencyName || String(r.id)]));
    const filters = input?.status && input.status !== 'ALL' ? { status: input.status } : undefined;
    const { records } = await GuideResidencyAssignmentRequests.findAll({ filters, limit: 500 });
    return records.map((r: any) => ({
      id: r.id,
      requesterId: r.requesterId || '',
      requesterName: r.requesterName || r.requesterEmail || 'Guide',
      requesterEmail: r.requesterEmail || '',
      status: r.status || 'Pending',
      requestedResidencyIds: ids(r.requestedResidencyIds),
      requestedResidencyNames: ids(r.requestedResidencyIds).map(id => names.get(id) || id),
      currentResidencyNames: ids(r.currentResidencyIds).map(id => names.get(id) || id),
      requestedAt: r.requestedAt || r.createdAt || null,
    })).sort((a: any, b: any) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
  },
});
