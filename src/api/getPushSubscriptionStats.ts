import { z } from 'zod';
import { createEndpoint, PushSubscriptions, Users, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get push subscription stats (Super Guide / Admin only)',
  authenticated: true,
  requiredCapabilities: 'notifications.send',
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
    const isAllowed = ['SUPER_GUIDE', 'SUPER_ADMIN', 'PW_ADMIN', 'ADMIN', 'GUIDE'].includes(role) ||
                      !!context.user.isBvSuperAdmin ||
                      !!context.user.isBvAdmin ||
                      !!context.user.isPwAdmin;
    if (!isAllowed) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Super Guide or Admin only' });
    }

    const callerId = context?.user?.id;
    const callerEmail = (context?.user?.email || '').toLowerCase();

    // Determine target segment: explicit input > caller context.
    let targetSegment = input?.segment || context.user?.segment;
    if (!targetSegment) targetSegment = 'PW';
    const callerSegment = String(context.user?.segment || '').trim().toUpperCase();
    const canManageAnyDepartment = context.user?.capabilities?.includes('*');
    if (!canManageAnyDepartment && callerSegment && callerSegment !== targetSegment) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You cannot view another department notification subscriptions' });
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
    const userIds = Array.from(new Set(subs.map(s => getUserIdStr(s.user)).filter(Boolean))) as string[];

    if (userIds.length === 0) {
      return { totalSubscriptions: 0, subscribers: [] };
    }

    // Firestore `in` supports bounded batches. This replaces one database read
    // request per subscription owner with a small number of parallel queries.
    const idChunks = Array.from({ length: Math.ceil(userIds.length / 30) }, (_, index) =>
      userIds.slice(index * 30, index * 30 + 30)
    );
    const userBatches = await Promise.all(idChunks.map(ids =>
      Users.findAll({ filters: { id: { in: ids } }, limit: ids.length }).catch(() => ({ records: [] }))
    ));
    const users = userBatches.flatMap(batch => batch.records || []);

    const isPwTarget = targetSegment === 'PW';

    const targetUsers = users.filter((u: any) => {
      if (u.status !== 'Active') return false;

      const isCaller = (callerId && u.id === callerId) || 
                       (callerEmail && (u.email || '').toLowerCase() === callerEmail);
      if (isCaller) return false;

      const uSegment = String(u.segment || '').toUpperCase();
      const isPwUser = uSegment === 'PW' || !!u.isPrabhupadaWorldUser;
      const isFolkUser = uSegment === 'FOLK' || !!u.isFolkLead || !!u.residencyId;

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
        const u = uid ? userMap.get(uid) as any : null;
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
