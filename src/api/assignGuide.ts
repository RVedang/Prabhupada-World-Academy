import { z } from 'zod';
import { createEndpoint, Users, Guides, AppError } from '@/lib/backend-sdk';
import { getGuideScope, isUserInGuideScope } from '../lib/guideScope';
import { serverCacheInvalidate } from '../lib/serverCache';
import { storeBroadcast } from '../lib/notificationBroadcast';

export default createEndpoint({
  description: 'Reassign a user to a different guide — Super Guides can do this for anyone; regular guides can do this for users in their center',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string(),
    newGuideId: z.string().optional(),
    guideId: z.string().optional(), // legacy alias for newGuideId
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const callerRole = (context.user.role || '').toUpperCase();
    const isSuperGuide = !!(
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      callerRole.includes('SUPER') ||
      callerRole.includes('ADMIN') ||
      callerRole === 'SUPER GUIDE'
    );
    const isGuide = isSuperGuide || callerRole.includes('GUIDE');

    if (!isSuperGuide && !isGuide) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Guide access required' });
    }

    // Regular guides can only reassign users in their center
    if (!isSuperGuide) {
      const scope = await getGuideScope(context.user.email);
      if (!scope) throw new AppError({ code: 'FORBIDDEN', message: 'Guide record not found' });

      const userRecord = await Users.findOne({
        id: input.userId,
        fields: ['id', 'residency', 'guide'],
      });
      if (!userRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });
      if (!isUserInGuideScope(scope, userRecord)) {
        throw new AppError({ code: 'FORBIDDEN', message: 'You can only reassign users in your center' });
      }
    }

    const targetGuideId = input.newGuideId || input.guideId || '';
    
    // 1. Try finding in the Guides table first (by id, guideId, or email)
    let newGuide = await Guides.findOne({ id: targetGuideId }).catch(() => null);
    if (!newGuide) {
      newGuide = await Guides.findOne({ filters: { guideId: targetGuideId } }).catch(() => null);
    }
    if (!newGuide && targetGuideId.includes('@')) {
      newGuide = await Guides.findOne({ filters: { email: targetGuideId.toLowerCase() } }).catch(() => null);
    }

    // 2. If not found in Guides table, check if targetGuideId is a static/legacy alias
    let resolvedEmail = '';
    if (targetGuideId === 'MENTOR-PW-HIRANYAVARNA') resolvedEmail = 'hrvd@hkmmumbai.org';
    else if (targetGuideId === 'MENTOR-FOLK-GAURMANDAL') resolvedEmail = 'gmnd@hkmmumbai.org';

    if (resolvedEmail && !newGuide) {
      newGuide = await Guides.findOne({ filters: { email: resolvedEmail } }).catch(() => null);
    }

    // 3. If still not found in Guides, try finding in the Users table (by id, userId, or email)
    let resolvedGuideId = '';
    if (newGuide) {
      resolvedGuideId = newGuide.id;
    } else {
      let userGuide = await Users.findOne({ id: targetGuideId }).catch(() => null);
      if (!userGuide) {
        userGuide = await Users.findOne({ filters: { userId: targetGuideId } }).catch(() => null);
      }
      if (!userGuide && resolvedEmail) {
        userGuide = await Users.findOne({ filters: { email: resolvedEmail } }).catch(() => null);
      }
      if (!userGuide && targetGuideId.includes('@')) {
        userGuide = await Users.findOne({ filters: { email: targetGuideId.toLowerCase() } }).catch(() => null);
      }

      if (userGuide) {
        resolvedGuideId = userGuide.id;
      }
    }

    if (!resolvedGuideId) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Guide not found' });
    }

    await Users.update({ id: input.userId, record: { guide: resolvedGuideId } });

    try {
      storeBroadcast(
        'Guide Assigned',
        `You have been assigned to a new guide`,
        'guide_changed',
        undefined,
        undefined,
        [input.userId].filter(Boolean),
      );
    } catch (err) {
      console.error('[assignGuide] Failed to broadcast guide update:', err);
    }

    serverCacheInvalidate('user_profile:' + input.userId);
    return { success: true };
  },
});
