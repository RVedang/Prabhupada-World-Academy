import { z } from 'zod';
import { createEndpoint, Users, FolkResidencies, Guides } from '@/lib/backend-sdk';
import { getGuideScope } from '../lib/guideScope';

const USER_FIELDS = ['id', 'fullName', 'phone', 'email', 'ashrayLevel', 'residency',
  'residencyClaimed', 'residencyJoinDate', 'createdAt', 'status', 'guide', 'selectedGuideId', 'guideName', 'isPrabhupadaWorldUser', 'segment'];
const RESIDENCY_FIELDS = ['id', 'residencyName'];

export default createEndpoint({
  description: 'Get users pending approval — includes all users in the guide\'s centers, not just direct folk',
  authenticated: true,
  inputSchema: z.object({ guideId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const userRole = (context.user.role || '').toUpperCase();
    const userEmail = (context.user.email || '').toLowerCase();
    const isSuperGuide = userRole === 'SUPER_GUIDE' || userRole === 'SUPER GUIDE' || userEmail.includes('superguide') || userEmail.includes('admin');
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

    const mentorGuide = guidesRes.records.find(g =>
      (g.email && g.email.toLowerCase() === userEmail) ||
      (g.id && g.id.toLowerCase() === context.user.id.toLowerCase())
    );
    const mentorGuideId = (mentorGuide?.id || context.user.id || '').toLowerCase();

    // Build the set of canonical IDs this mentor maps to (covers hardcoded PW mentor IDs)
    const mentorCanonicalIds = new Set<string>([mentorGuideId, userEmail]);
    // Map known PW mentors by email to their hardcoded guide IDs
    const PW_MENTOR_EMAIL_TO_ID: Record<string, string> = {
      'vdnd@hkmmumbai.org': 'guide-vedanarayana-guide',
      'hiranyavarna@hkmmumbai.org': 'mentor-pw-hiranyavarna',
    };
    const hardcodedId = PW_MENTOR_EMAIL_TO_ID[userEmail];
    if (hardcodedId) mentorCanonicalIds.add(hardcodedId);
    // Also add any Guides record ID that matches this mentor's email
    if (mentorGuide?.id) mentorCanonicalIds.add(mentorGuide.id.toLowerCase());

    // Fetch all pending users from the database
    const { records: pendingRecords } = await Users.findAll({ filters: pendingFilter, fields: USER_FIELDS, limit: 1000 });

    const userSegment = context.user.segment || (userEmail.includes('gaurmandal') || userEmail.includes('folk.org') ? 'FOLK' : 'PW');

    const checkIsPwUser = (u: any) => {
      const rawG = Array.isArray(u.guide) ? u.guide[0] : u.guide;
      const guideStr = (String(rawG || '') + ' ' + String(u.selectedGuideId || '') + ' ' + String(u.guideName || '')).toLowerCase();
      return !!(u.isPrabhupadaWorldUser) ||
        (u.segment === 'PW') ||
        guideStr.includes('mentor-pw-hiranyavarna') ||
        guideStr.includes('mentor-pw-admin') ||
        guideStr.includes('hiranyavarna') ||
        guideStr.includes('prabhupadaworld') ||
        guideStr.includes('vdnd@hkmmumbai.org') ||
        guideStr.includes('guide-vedanarayana-guide') ||
        guideStr.includes('vedanarayana') ||
        // Also match if guide is stored as VDND's Firebase UID (in mentorCanonicalIds)
        ([...mentorCanonicalIds].some(id => id && guideStr.includes(id.toLowerCase())));
    };

    let allUsers: any[] = [];

    if (userSegment === 'PW') {
      const isPwSuperAdmin = context.user.isBvSuperAdmin || context.user.role === 'SUPER_ADMIN' || userEmail.includes('superadmin') || userEmail.includes('admin');
      allUsers = pendingRecords.filter(u => {
        if (!checkIsPwUser(u)) return false;
        if (isPwSuperAdmin) return true;
        
        const rawG = Array.isArray(u.guide) ? u.guide[0] : u.guide;
        const uGuide = String(rawG || u.selectedGuideId || '').toLowerCase();
        const uGuideNormalized = uGuide ? (guideLookup.get(uGuide) || uGuide) : '';
        
        // Match against all canonical IDs for this mentor (Firebase UID, email, hardcoded guide ID)
        if ([...mentorCanonicalIds].some(id => uGuideNormalized === id || uGuide === id)) return true;
        return uGuideNormalized === 'mentor-pw-admin' || 
               uGuideNormalized.includes('admin') || 
               uGuideNormalized === mentorGuideId || 
               uGuideNormalized === userEmail;
      });
    } else {
      const isFolkSuperAdmin = userEmail.includes('gaurmandal') || userEmail.includes('folk.org') || userEmail.includes('superguide') || context.user.isBvSuperAdmin;
      const scope = isFolkSuperAdmin ? null : await getGuideScope(context.user.email);
      const sId = (scope?.guideId || '').toLowerCase();
      const sName = (scope?.guideName || '').toLowerCase();

      allUsers = pendingRecords.filter(u => {
        if (checkIsPwUser(u)) return false;
        if (isFolkSuperAdmin) return true;
        const rawG = Array.isArray(u.guide) ? u.guide[0] : u.guide;
        const uGuide = String(rawG || '').toLowerCase();
        if (!rawG) return true;
        if (uGuide === sId || uGuide === sName || uGuide === userEmail || uGuide === context.user.id.toLowerCase()) return true;
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
