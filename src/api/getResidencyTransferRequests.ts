import { z } from 'zod';
import { createEndpoint, ResidencyTransferRequests, Users, FolkResidencies, Guides } from '@/lib/backend-sdk';

function firstRef(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

function normalizeIds(values: unknown[]): string[] {
  return values
    .map(firstRef)
    .map(id => id.trim())
    .filter(Boolean);
}

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
    const hasDepartmentWideResidencyAccess =
      userRole === 'SUPER_GUIDE' ||
      userRole === 'SUPER_ADMIN' ||
      context.user.isBvSuperAdmin === true;
    const hasSuperGuideAccess = (
      userRole === 'SUPER_GUIDE' ||
      userRole === 'SUPER_ADMIN' ||
      userRole === 'ADMIN' ||
      userEmail.includes('superadmin') ||
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      !!context.user.isBvSuperAdmin);
    // An explicit guide ID means a dual-role super guide opened guide mode.
    // Their super-guide dashboard remains unrestricted when the ID is ALL.
    const isSuperGuide = (!scopedGuideId || scopedGuideId === 'ALL') && hasSuperGuideAccess;

    // Determine which residency IDs this guide manages
    let allowedResidencyIds: string[] = [];

    if (!isSuperGuide) {
      // Find the guide record for the current user
      let guideRecord: any = await Guides.findOne({
        ...(scopedGuideId && scopedGuideId !== 'ALL' ? { id: scopedGuideId } : { filters: { email: context.user.email, isActive: true } }),
        fields: ['id', 'folkResidencies'],
      }).catch(() => undefined);
      // Dual-role guide/super-guide profiles may exist only in Users. Prefer
      // the authenticated record so its saved residency view is used even if
      // legacy duplicate Users rows share the same custom userId.
      if (!guideRecord) {
        guideRecord =
          await Users.findOne({ id: context.user.id, fields: ['id', 'userId', 'folkResidencies'] }).catch(() => undefined) ||
          await Users.findOne({ id: scopedGuideId, fields: ['id', 'userId', 'folkResidencies'] }).catch(() => undefined) ||
          await Users.findOne({ filters: { userId: scopedGuideId }, fields: ['id', 'userId', 'folkResidencies'] }).catch(() => undefined) ||
          await Users.findOne({ filters: { email: context.user.email }, fields: ['id', 'userId', 'folkResidencies'] }).catch(() => undefined);
      }
      if (!guideRecord) return [];

      // Get residencies linked to this guide
      const linkedResidencyIds = normalizeIds(
        Array.isArray(guideRecord.folkResidencies)
          ? guideRecord.folkResidencies
          : [guideRecord.folkResidencies]
      );
      if (hasDepartmentWideResidencyAccess) {
        const { records: allResidencies } = await FolkResidencies.findAll({
          fields: ['id', 'residencyName', 'isActive'],
          limit: 500,
        });
        const allFolkResidencyIds = allResidencies
          .filter((residency: any) => {
            const name = String(residency?.residencyName || '').trim().toLowerCase();
            const isActive = residency?.isActive !== false && residency?.isActive !== 'false';
            return isActive && !name.includes('prabhupada world') && !name.startsWith('pw ');
          })
          .map((residency: any) => String(residency.id || '').trim())
          .filter(Boolean);
        allowedResidencyIds = allFolkResidencyIds;
      } else {
        allowedResidencyIds = linkedResidencyIds;
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

    // Regular guides see requests where their residency is either the source
    // or destination. For A -> B, guide A gets the leave side and guide B gets
    // the incoming transfer side. Super Guides see everything.
    const filtered = isSuperGuide
      ? requests
      : requests.filter((r: any) => {
          const transferResidencyIds = normalizeIds([r.fromResidency, r.toResidency]);
          return transferResidencyIds.some(id => allowedResidencyIds.includes(id));
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
