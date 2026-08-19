import { z } from 'zod';
import { createEndpoint, PushSubscriptions, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get push subscription stats (Super Guide / Admin only)',
  authenticated: true,
  inputSchema: z.object({
    segment: z.enum(['PW', 'FOLK']).optional(),
  }),
  outputSchema: z.object({
    totalSubscriptions: z.number(),
    subscribers: z.array(z.object({
      name: z.string(),
      email: z.string(),
    })),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    const role = (context.user.role || '').replace(/\s/g, '_').toUpperCase();
    const isAllowed = ['SUPER_GUIDE', 'SUPER_ADMIN', 'PW_ADMIN', 'ADMIN'].includes(role) ||
                      !!context.user.isBvSuperAdmin ||
                      !!context.user.isBvAdmin ||
                      !!context.user.isPwAdmin;
    if (!isAllowed) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Super Guide or Admin only' });
    }

    const callerId = context?.user?.id;
    const callerEmail = (context?.user?.email || '').toLowerCase();

    // Determine target segment: explicit input > caller context > email heuristic
    let targetSegment = input?.segment || context.user?.segment;
    if (!targetSegment) {
      if (
        callerEmail.includes('srilaprabhupadaworld') ||
        callerEmail.includes('hrvd') ||
        callerEmail.includes('admin@prabhupadaworld') ||
        context.user?.isPwAdmin ||
        context.user?.isPrabhupadaWorldUser
      ) {
        targetSegment = 'PW';
      } else if (
        callerEmail.includes('gaurmandal') ||
        callerEmail.includes('folk') ||
        callerEmail.includes('superguide')
      ) {
        targetSegment = 'FOLK';
      } else {
        targetSegment = 'PW';
      }
    }

    // Get all subscriptions
    const { records: subs } = await PushSubscriptions.findAll({ limit: 2000 });

    // Helper to extract string ID from different formats of s.user (Reference, Array, String)
    const getUserIdStr = (userField: any): string | null => {
      if (!userField) return null;
      if (typeof userField === 'string') return userField;
      if (Array.isArray(userField)) {
        return getUserIdStr(userField[0]);
      }
      if (userField.id) return String(userField.id);
      if (userField.path) {
        const segments = userField.path.split('/');
        return segments[segments.length - 1];
      }
      if (userField._path && userField._path.segments) {
        const segments = userField._path.segments;
        return segments[segments.length - 1];
      }
      return String(userField);
    };

    // Get unique user IDs
    const userIds = [...new Set(subs.map(s => getUserIdStr(s.user)).filter(Boolean))] as string[];

    if (userIds.length === 0) {
      return { totalSubscriptions: 0, subscribers: [] };
    }

    // Fetch user details including guide to classify by selected guide/mentor
    const { records: users } = await Users.findAll({
      filters: { id: { in: userIds } },
      fields: ['id', 'fullName', 'email', 'segment', 'isPrabhupadaWorldUser', 'isFolkLead', 'residencyId', 'guide', 'guideName'],
      limit: 2000,
    });

    const isPwTarget = targetSegment === 'PW';

    const targetUsers = users.filter((u: any) => {
      const isCaller = (callerId && u.id === callerId) || 
                       (callerEmail && (u.email || '').toLowerCase() === callerEmail);
      if (isCaller) return false;

      const uSegment = (u.segment || '').toUpperCase();
      const name = (u.fullName || '').toUpperCase();
      const email = (u.email || '').toLowerCase();

      // Check if user has selected a PW guide/mentor
      const rawG = Array.isArray(u.guide) ? u.guide[0] : u.guide;
      const guideStr = (String(rawG || '') + ' ' + String(u.guideName || '')).toLowerCase();
      const hasPwGuide = guideStr.includes('mentor-pw-hiranyavarna') ||
                         guideStr.includes('mentor-pw-admin') ||
                         guideStr.includes('hiranyavarna') ||
                         guideStr.includes('prabhupadaworld') ||
                         guideStr.includes('iamthevedang@gmail.com') ||
                         guideStr.includes('guide-vedang') ||
                         guideStr.includes('vedang') ||
                         guideStr.includes('vdnd') ||
                         guideStr.includes('vedanarayana') ||
                         guideStr.includes('guide-vedanarayana-guide');

      const isPwUser = uSegment === 'PW' || 
                       !!u.isPrabhupadaWorldUser || 
                       hasPwGuide ||
                       email.includes('prabhupadaworld') || 
                       email.includes('hrvd') || 
                       email.includes('srilaprabhupadaworld') || 
                       name.includes('PW') || 
                       name.includes('PRABHUPADA') || 
                       name.includes('HIRANYAVARNA');

      const isFolkUser = !hasPwGuide && (
                         uSegment === 'FOLK' || 
                         email.includes('folk.org') || 
                         email.includes('gaurmandal') || 
                         email.includes('superguide') || 
                         name.includes('FOLK') || 
                         name.includes('GAURMANDAL') || 
                         !!u.residencyId || 
                         !!u.isFolkLead
                       );

      if (isPwTarget) {
        if (isPwUser) return true;
        if (isFolkUser) return false;
        return true;
      } else {
        if (isPwUser) return false;
        if (isFolkUser) return true;
        return false;
      }
    });

    const targetUserIds = new Set(targetUsers.map(u => u.id));
    const userMap = new Map(targetUsers.map(u => [u.id, u]));

    const subscribers = subs
      .map((s: any) => {
        const uid = getUserIdStr(s.user);
        const u = uid ? userMap.get(uid) : null;
        return u ? { name: u.fullName || '—', email: u.email || '—' } : null;
      })
      .filter(Boolean) as { name: string; email: string }[];

    const totalFilteredSubs = subs.filter((s: any) => {
      const uid = getUserIdStr(s.user);
      return uid && targetUserIds.has(uid);
    }).length;

    return { totalSubscriptions: totalFilteredSubs, subscribers };
  },
});
