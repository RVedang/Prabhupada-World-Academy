import { createEndpoint, GuideTransferRequests, Users, Guides, AshrayUpgradeRequests, FolkResidencies } from '@/lib/backend-sdk';
import { ASHRAY_LEVELS } from '../types/enums';

export default createEndpoint({
  description: 'Get guide transfer requests — only where toGuide is the current guide, plus ashray upgrades (stub)',
  authenticated: true,
  requiredCapabilities: 'users.approve',
  inputSchema: z.object({ guideId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    const userRole = (context.user.role || '').toUpperCase();
    const isSuperGuide =
      userRole === 'SUPER_GUIDE' ||
      userRole === 'SUPER GUIDE' ||
      userRole === 'SUPER_ADMIN' ||
      !!context.user.isBvSuperAdmin;

    // Find the guide DB record for the current user
    let guideDbId: string | null = null;
    if (!isSuperGuide) {
      const guideRecord = await Guides.findOne({
        filters: { email: context.user.email, isActive: true },
        fields: ['id'],
      });
      if (guideRecord) {
        guideDbId = guideRecord.id;
      } else {
        const uRec = await Users.findOne({ id: context.user.id, fields: ['id', 'userId'] }) ||
                     await Users.findOne({ filters: { email: context.user.email }, fields: ['id', 'userId'] });
        guideDbId = uRec?.userId || uRec?.id || context.user.id;
      }
    }

    // Fetch pending guide transfer requests
    const { records: allRequests } = await GuideTransferRequests.findAll({
      filters: { status: 'Pending' },
      fields: ['id', 'user', 'fromGuide', 'toGuide', 'status', 'requestedAt', 'notes'],
      limit: 200,
    });

    // Filter: only show requests where toGuide is THIS guide (receiving guide)
    const filtered = isSuperGuide
      ? allRequests
      : allRequests.filter((r: any) => {
          const toId = Array.isArray(r.toGuide) ? r.toGuide[0] : r.toGuide;
          const toIdLower = String(toId || '').toLowerCase();
          return toId && (
            toIdLower === String(guideDbId || '').toLowerCase() || 
            toIdLower === context.user.id.toLowerCase() ||
            toIdLower === String(context.user.email || '').toLowerCase()
          );
        });

    // Resolve user details for guide transfers
    let guideTransfers: any[] = [];
    if (filtered.length > 0) {
      const userIds = [...new Set(filtered.map((r: any) => Array.isArray(r.user) ? r.user[0] : r.user).filter(Boolean))] as string[];
      
      const [usersRes1, usersRes2, usersRes3, usersRes4] = await Promise.all([
        userIds.length > 0 ? Users.findAll({ filters: { id: { in: userIds } }, fields: ['id', 'userId', 'fullName', 'email', 'phone', 'residency', 'residencyApproved', 'residencyClaimed'], limit: 200 }).catch(() => ({ records: [] })) : { records: [] },
        userIds.length > 0 ? Users.findAll({ filters: { userId: { in: userIds } }, fields: ['id', 'userId', 'fullName', 'email', 'phone', 'residency', 'residencyApproved', 'residencyClaimed'], limit: 200 }).catch(() => ({ records: [] })) : { records: [] },
        userIds.length > 0 ? Users.findAll({ filters: { fullName: { in: userIds } }, fields: ['id', 'userId', 'fullName', 'email', 'phone', 'residency', 'residencyApproved', 'residencyClaimed'], limit: 200 }).catch(() => ({ records: [] })) : { records: [] },
        userIds.length > 0 ? Users.findAll({ filters: { email: { in: userIds } }, fields: ['id', 'userId', 'fullName', 'email', 'phone', 'residency', 'residencyApproved', 'residencyClaimed'], limit: 200 }).catch(() => ({ records: [] })) : { records: [] },
      ]);

      const userMap: Record<string, any> = {};
      const allResolvedUsers = [...usersRes1.records, ...usersRes2.records, ...usersRes3.records, ...usersRes4.records];
      allResolvedUsers.forEach((u: any) => {
        if (u.id) userMap[String(u.id).toLowerCase()] = u;
        if (u.userId) userMap[String(u.userId).toLowerCase()] = u;
        if (u.fullName) userMap[String(u.fullName).toLowerCase()] = u;
        if (u.email) userMap[String(u.email).toLowerCase()] = u;
      });

      // Fetch all guides to resolve names
      const [guidesRes, residenciesRes] = await Promise.all([
        Guides.findAll({ fields: ['id', 'fullName'], limit: 500 }),
        FolkResidencies.findAll({ fields: ['id', 'residencyName'], limit: 500 }).catch(() => ({ records: [] })),
      ]);
      const guideNameMap = new Map<string, string>(guidesRes.records.map(g => [g.id, (g as any).fullName || '']));
      const residencyMap = new Map<string, string>(residenciesRes.records.map(r => [r.id, (r as any).residencyName || '']));

      guideTransfers = filtered.map((r: any) => {
        const uid = Array.isArray(r.user) ? r.user[0] : r.user as string;
        const u = uid ? userMap[String(uid).toLowerCase()] : null;
        
        const fromGuideId = (Array.isArray(r.fromGuide) ? r.fromGuide[0] : r.fromGuide) || (Array.isArray(u?.guide) ? u.guide[0] : u?.guide);
        const toGuideId = Array.isArray(r.toGuide) ? r.toGuide[0] : r.toGuide;
        
        const residencyId = Array.isArray(u?.residency) ? u.residency[0] : u?.residency;
        const resName = residencyId ? (residencyMap.get(residencyId) || '') : '';
        const residencyLabel = u?.residencyApproved
          ? `Resident (${resName || 'Approved'})`
          : (u?.residencyClaimed ? `Resident Claim (${resName || 'Pending'})` : 'Non-Resident');

        return {
          logId: r.id,
          userId: u?.userId || u?.id || uid || '',
          userName: u?.fullName || uid || '',
          userPhone: u?.phone || '',
          residencyLabel,
          status: r.status || 'Pending',
          timestamp: r.requestedAt || '',
          fromGuideName: fromGuideId ? (guideNameMap.get(fromGuideId) || 'Unknown') : 'None',
          toGuideName: toGuideId ? (guideNameMap.get(toGuideId) || 'Unknown') : 'None',
        };
      });
    }

    // Fetch pending/approved ashray upgrades
    const { records: rawAshray } = await AshrayUpgradeRequests.findAll({
      filters: { status: { in: ['Pending', 'APPROVED', 'Approved', 'PENDING'] } },
      limit: 200,
    });

    const ashrayUpgrades: any[] = [];
    if (rawAshray.length > 0) {
      const ashrayUserIds = [...new Set(rawAshray.map((r: any) => r.userId).filter(Boolean))];
      const [usersById, usersByUserId] = ashrayUserIds.length > 0
        ? await Promise.all([
            Users.findAll({ filters: { id: { in: ashrayUserIds } }, fields: ['id', 'userId', 'fullName', 'email', 'guide', 'selectedGuideId', 'guideName', 'residency', 'isPrabhupadaWorldUser', 'segment'], limit: 200 }),
            Users.findAll({ filters: { userId: { in: ashrayUserIds } }, fields: ['id', 'userId', 'fullName', 'email', 'guide', 'selectedGuideId', 'guideName', 'residency', 'isPrabhupadaWorldUser', 'segment'], limit: 200 })
          ])
        : [{ records: [] }, { records: [] }];

      const ashrayUserMap = new Map<string, any>();
      usersById.records.forEach((u: any) => {
        ashrayUserMap.set(u.id, u);
        if (u.userId) ashrayUserMap.set(u.userId, u);
      });
      usersByUserId.records.forEach((u: any) => {
        ashrayUserMap.set(u.id, u);
        if (u.userId) ashrayUserMap.set(u.userId, u);
      });

      const userSegment = context.user.segment || null;
      const isHiranyavarnaOrPwAdmin = !!(
        context.user.isBvSuperAdmin ||
        context.user.isBvAdmin ||
        userRole === 'SUPER_ADMIN' ||
        userRole === 'ADMIN'
      );

      const filteredAshray = rawAshray.filter((r: any) => {
        const u = ashrayUserMap.get(r.userId);
        if (!u) return false;
        const isPwMember = !!(u.isPrabhupadaWorldUser) || u.segment === 'PW';

        if (userSegment === 'PW') {
          if (!isPwMember) return false;
          if (isHiranyavarnaOrPwAdmin) return true;
          const userGuideId = Array.isArray(u.guide) ? u.guide[0] : u.guide;
          const uGuideStrLower = String(userGuideId || '').toLowerCase();
          return uGuideStrLower === String(guideDbId || '').toLowerCase() || 
                 uGuideStrLower === context.user.id.toLowerCase() ||
                 uGuideStrLower === String(context.user.email || '').toLowerCase();
        } else {
          // FOLK guide view
          if (isPwMember) return false;
          if (isSuperGuide) return true;
          const userGuideId = Array.isArray(u.guide) ? u.guide[0] : u.guide;
          const uGuideStrLower = String(userGuideId || '').toLowerCase();
          return uGuideStrLower === String(guideDbId || '').toLowerCase() || 
                 uGuideStrLower === context.user.id.toLowerCase();
        }
      });

      filteredAshray.forEach((r: any) => {
        const u = ashrayUserMap.get(r.userId);
        ashrayUpgrades.push({
          logId: r.id,
          userId: u?.id || r.userId || '',
          userName: u?.fullName || '',
          userEmail: u?.email || '',
          status: (r.status || 'PENDING').toUpperCase(),
          timestamp: r.createdAt || r.requestedAt || '',
          details: {
            currentLevel: r.currentLevel || 'Jigyasa',
            requestedLevel: r.requestedLevel || (() => {
              const currentIdx = ASHRAY_LEVELS.indexOf(r.currentLevel || 'Jigyasa');
              if (currentIdx !== -1 && currentIdx < ASHRAY_LEVELS.length - 1) {
                return ASHRAY_LEVELS[currentIdx + 1];
              }
              return 'Shraddhavan';
            })(),
          },
        });
      });
    }

    return { guideTransfers, ashrayUpgrades };
  },
});
