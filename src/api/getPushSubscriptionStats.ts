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

    // Get unique user IDs
    const userIds = [...new Set(subs.map(s => {
      const u = s.user;
      return Array.isArray(u) ? u[0] : u;
    }).filter(Boolean))] as string[];

    if (userIds.length === 0) {
      return { totalSubscriptions: 0, subscribers: [] };
    }

    // Fetch user details
    const { records: users } = await Users.findAll({
      filters: { id: { in: userIds } },
      fields: ['id', 'fullName', 'email', 'segment', 'isPrabhupadaWorldUser', 'isFolkLead', 'residencyId'],
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

      const isFolkUser = uSegment === 'FOLK' || 
                         email.includes('folk.org') || 
                         email.includes('gaurmandal') || 
                         email.includes('superguide') || 
                         name.includes('FOLK') || 
                         name.includes('GAURMANDAL') || 
                         !!u.residencyId || 
                         !!u.isFolkLead;

      const isPwUser = uSegment === 'PW' || 
                       !!u.isPrabhupadaWorldUser || 
                       email.includes('prabhupadaworld') || 
                       email.includes('hrvd') || 
                       email.includes('srilaprabhupadaworld') || 
                       name.includes('PW') || 
                       name.includes('PRABHUPADA') || 
                       name.includes('HIRANYAVARNA');

      if (isPwTarget) {
        if (isFolkUser && !isPwUser) return false;
        if (uSegment === 'FOLK') return false;
        return true;
      } else {
        if (isPwUser && !isFolkUser) return false;
        if (uSegment === 'PW') return false;
        return true;
      }
    });

    const targetUserIds = new Set(targetUsers.map(u => u.id));
    const userMap = new Map(targetUsers.map(u => [u.id, u]));

    const subscribers = userIds
      .filter(uid => userMap.has(uid))
      .map(uid => {
        const u = userMap.get(uid);
        return { name: u?.fullName || '—', email: u?.email || '—' };
      });

    const totalFilteredSubs = subs.filter((s: any) => {
      const uid = Array.isArray(s.user) ? s.user[0] : s.user;
      return targetUserIds.has(uid);
    }).length;

    return { totalSubscriptions: totalFilteredSubs, subscribers };
  },
});
