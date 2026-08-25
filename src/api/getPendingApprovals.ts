import { z } from 'zod';
import { createEndpoint, Users, FolkResidencies, Guides } from '@/lib/backend-sdk';
import { getGuideScope } from '../lib/guideScope';

const USER_FIELDS = ['id', 'fullName', 'phone', 'email', 'ashrayLevel', 'residency',
  'residencyClaimed', 'residencyJoinDate', 'createdAt', 'status', 'guide', 'selectedGuideId', 'guideName', 'isPrabhupadaWorldUser', 'segment'];
const RESIDENCY_FIELDS = ['id', 'residencyName'];

export default createEndpoint({
  description: 'Get users pending approval — includes all users in the guide\'s centers, not just direct folk',
  authenticated: true,
  requiredCapabilities: 'users.approve',
  inputSchema: z.object({ guideId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const userRole = (context.user.role || '').toUpperCase();
    const userEmail = (context.user.email || '').toLowerCase();
    const isSuperGuide = userRole === 'SUPER_GUIDE' || userRole === 'SUPER GUIDE' || userRole === 'SUPER_ADMIN' || !!context.user.isBvSuperAdmin;
    const pendingFilter = { status: 'Pending Approval' };

    // Fetch residencies and guides early
    const [residenciesRes, guidesRes] = await Promise.all([
      FolkResidencies.findAll({ fields: RESIDENCY_FIELDS, limit: 500 }),
      Guides.findAll({ fields: ['id', 'fullName', 'abbreviation', 'email'], limit: 500 })
    ]);

    // Build guide lookup map to normalize raw guide names/abbreviations/emails to UUIDs
    const guideLookup = new Map<string, string>();
    for (const g of guidesRes.records) {
      if (g.id) {
        guideLookup.set(g.id.toLowerCase(), g.id);
        if (g.fullName) guideLookup.set(g.fullName.toLowerCase(), g.id);
        if (g.abbreviation) guideLookup.set(g.abbreviation.toLowerCase(), g.id);
        if (g.email) guideLookup.set(g.email.toLowerCase(), g.id);
      }
    }

    const userId = context.user.id || context.user.uid || context.user.userId || '';
    const mentorGuide = guidesRes.records.find(g =>
      (g.email && g.email.toLowerCase() === userEmail) ||
      (g.id && userId && g.id.toLowerCase() === userId.toLowerCase())
    );
    const mentorGuideId = (mentorGuide?.id || userId).toLowerCase();

    // Build the set of canonical IDs this mentor maps to from Firestore.
    const mentorCanonicalIds = new Set<string>([mentorGuideId, userEmail]);
    // Also add any Guides record ID that matches this mentor's email
    if (mentorGuide?.id) mentorCanonicalIds.add(mentorGuide.id.toLowerCase());

    // Fetch all pending users from the database
    const { records: pendingRecords } = await Users.findAll({ filters: pendingFilter, fields: USER_FIELDS, limit: 1000 });

    const userSegment = context.user.segment || 'PW';

    const checkIsPwUser = (u: any) => {
      return !!u.isPrabhupadaWorldUser || u.segment === 'PW';
    };

    let allUsers: any[] = [];

    if (userSegment === 'PW') {
      const isPwAdminOrSuperAdmin = !!(
        context.user.isBvSuperAdmin ||
        context.user.isBvAdmin ||
        userRole === 'SUPER_ADMIN' ||
        userRole === 'ADMIN'
      );
      allUsers = pendingRecords.filter(u => {
        if (!checkIsPwUser(u)) return false;
        if (isPwAdminOrSuperAdmin) return true;
        
        const rawG = Array.isArray(u.guide) ? u.guide[0] : u.guide;
        const uGuide = String(rawG || u.selectedGuideId || '').toLowerCase();
        const uGuideNormalized = uGuide ? (guideLookup.get(uGuide) || uGuide) : '';
        
        // Match against all canonical IDs for this mentor (Firestore guide ID, user ID, or email).
        if ([...mentorCanonicalIds].some(id => uGuideNormalized === id || uGuide === id)) return true;
        return uGuideNormalized === mentorGuideId || uGuideNormalized === userEmail;
      });
    } else {
      const isFolkSuperAdmin = userSegment === 'FOLK' && (userRole === 'SUPER_GUIDE' || userRole === 'SUPER_ADMIN' || !!context.user.isBvSuperAdmin);
      const scope = isFolkSuperAdmin ? null : await getGuideScope(context.user.email);
      const sId = (scope?.guideId || '').toLowerCase();
      const sName = (scope?.guideName || '').toLowerCase();

      allUsers = pendingRecords.filter(u => {
        if (checkIsPwUser(u)) return false;
        if (isFolkSuperAdmin) return true;
        const rawG = Array.isArray(u.guide) ? u.guide[0] : u.guide;
        const uGuide = String(rawG || '').toLowerCase();
        if (!rawG) return true;
        if (uGuide === sId || uGuide === sName || uGuide === userEmail || (userId && uGuide === userId.toLowerCase())) return true;
        return scope ? (scope.residencyIds?.includes(u.residency) || scope.guideId === u.guide) : true;
      });
    }

    const residencyMap = new Map(residenciesRes.records.map(r => [r.id, (r as any).residencyName || '']));

    // Only show users who completed registration (fullName set)
    const completeUsers = allUsers.filter(u => (u.fullName || '').trim().length > 0);

    return completeUsers.map(u => {
      const residencyId = Array.isArray(u.residency) ? u.residency[0] : u.residency;
      const rawGuideId = Array.isArray(u.guide) ? u.guide[0] : u.guide;
      const uGuideId = rawGuideId ? (guideLookup.get(String(rawGuideId).toLowerCase()) || rawGuideId) : null;

      return {
        userId: u.id,
        rowId: u.id,
        fullName: u.fullName || '',
        phone: u.phone || '',
        email: u.email || '',
        ashrayLevel: u.ashrayLevel || null,
        residencyUserClaim: u.residencyClaimed || false,
        selectedFolkResidency: residencyId || null,
        residencyName: residencyId ? (residencyMap.get(residencyId) || '') : '',
        residencyJoinDate: u.residencyJoinDate || null,
        createdAt: u.createdAt || '',
        guideId: uGuideId || null,
      };
    });
  },
});
