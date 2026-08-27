import { z } from 'zod';
import { createEndpoint, ResidencyTransferRequests, Users, FolkResidencies, Guides } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get pending residency transfer requests — only for residencies the current guide manages',
  authenticated: true,
  requiredCapabilities: 'users.approve',
  inputSchema: z.object({
    status: z.string().optional(),
    guideId: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    const userRole = String(context.user.role || '').toUpperCase().replace(/\s+/g, '_');
    const userEmail = (context.user.email || '').toLowerCase();
    const scopedGuideId = String(input?.guideId || '').trim();
    const isSuperGuide = (!scopedGuideId || scopedGuideId === 'ALL') && (
      userRole === 'SUPER_GUIDE' ||
      userRole === 'SUPER_ADMIN' ||
      userRole === 'ADMIN' ||
      userEmail.includes('superadmin') ||
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      !!context.user.isBvSuperAdmin);

    // Determine which residency IDs this guide manages
    let allowedResidencyIds: string[] = [];

    if (!isSuperGuide) {
      // Find the guide record for the current user
      const guideRecord = await Guides.findOne({
        ...(scopedGuideId && scopedGuideId !== 'ALL' ? { id: scopedGuideId } : { filters: { email: context.user.email, isActive: true } }),
        fields: ['id', 'folkResidencies'],
      });
      if (!guideRecord) return [];

      // Get residencies linked to this guide
      const guideResidencies = guideRecord.folkResidencies;
      if (guideResidencies) {
        allowedResidencyIds = Array.isArray(guideResidencies) ? guideResidencies : [guideResidencies];
      }

      // If guide has no residencies, they shouldn't see any residency transfers
      if (allowedResidencyIds.length === 0) return [];
    }

    const { records: requestRecords } = await ResidencyTransferRequests.findAll({
      fields: ['id', 'user', 'fromResidency', 'toResidency', 'status', 'requestedAt', 'notes'],
      limit: 200,
    });
    // Requests created by older app versions may use a different status case.
    // Read the pending set case-insensitively so valid FOLK leave requests are
    // visible to the super guide regardless of which client submitted them.
    const requests = requestRecords.filter((r: any) =>
      String(r.status || '').trim().toUpperCase() === 'PENDING'
    );

    if (requests.length === 0) return [];

    // Transfers are reviewed by the receiving residency guide. Leave requests
    // have no target residency, so they belong to the current/source residency.
    const filtered = isSuperGuide
      ? requests
      : requests.filter((r: any) => {
          const toId = Array.isArray(r.toResidency) ? r.toResidency[0] : r.toResidency;
          const fromId = Array.isArray(r.fromResidency) ? r.fromResidency[0] : r.fromResidency;
          const reviewResidencyId = toId || fromId;
          return reviewResidencyId && allowedResidencyIds.includes(reviewResidencyId);
        });

    if (filtered.length === 0) return [];

    const userIds = [...new Set(filtered.map((r: any) => Array.isArray(r.user) ? r.user[0] : r.user).filter(Boolean))] as string[];
    const usersRes = userIds.length > 0
      ? await Users.findAll({ filters: { id: { in: userIds } }, fields: ['id', 'userId', 'fullName', 'email', 'phone', 'residency', 'residencyApproved'], limit: 200 })
      : { records: [] };

    const userMap: Record<string, any> = {};
    usersRes.records.forEach((u: any) => { userMap[u.id] = u; });

    const residencyIds = [
      ...new Set(
        filtered.flatMap((r: any) => {
          const uid = Array.isArray(r.user) ? r.user[0] : r.user as string;
          const u = userMap[uid] as any;
          const fromId = (Array.isArray(r.fromResidency) ? r.fromResidency[0] : r.fromResidency) || 
                         (u?.residencyApproved ? (Array.isArray(u.residency) ? u.residency[0] : u.residency) : null);
          const toId = Array.isArray(r.toResidency) ? r.toResidency[0] : r.toResidency;
          return [fromId, toId];
        }).filter(Boolean) as string[]
      )
    ];

    const residenciesRes = residencyIds.length > 0
      ? await FolkResidencies.findAll({ filters: { id: { in: residencyIds } }, fields: ['id', 'residencyName'], limit: 200 })
      : { records: [] };

    const residencyMap: Record<string, any> = {};
    residenciesRes.records.forEach((r: any) => { residencyMap[r.id] = r; });

    return filtered.map((r: any) => {
      const uid = Array.isArray(r.user) ? r.user[0] : r.user as string;
      const u = userMap[uid] as any;
      const fromId = (Array.isArray(r.fromResidency) ? r.fromResidency[0] : r.fromResidency) || 
                     (u?.residencyApproved ? (Array.isArray(u.residency) ? u.residency[0] : u.residency) : null) as string | null;
      const toId = Array.isArray(r.toResidency) ? r.toResidency[0] : r.toResidency as string | null;
      const from = fromId ? (residencyMap[fromId] as any) : null;
      const to = toId ? (residencyMap[toId] as any) : null;
      let rawPhone = u?.phone || '';
      const cleanPhone = rawPhone.replace(/\D/g, '');
      if (cleanPhone.length > 10 && !rawPhone.startsWith('+')) {
        rawPhone = `+${rawPhone}`;
      }

      return {
        requestId: r.id,
        rowId: r.id,
        userId: u?.userId || uid || '',
        userName: u?.fullName || '',
        userEmail: u?.email || '',
        userPhone: rawPhone,
        fromResidencyName: from?.residencyName || 'Non-resident',
        toResidencyName: to?.residencyName || 'Leave Residency',
        oldResidencyName: from?.residencyName || 'Non-resident',
        newResidencyName: to?.residencyName || 'Leave Residency',
        oldResidencyId: fromId || '',
        newResidencyId: toId || '',
        status: (r.status as string) || 'Pending',
        requestedAt: (r.requestedAt as string) || '',
        notes: (r.notes as string) || '',
      };
    });
  },
});
