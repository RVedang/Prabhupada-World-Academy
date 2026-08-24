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

    // Fetch the target user record first to resolve their actual id (email) and userId
    const targetUserRecord = await Users.findOne({ id: input.userId }).catch(() => null) ||
                             await Users.findOne({ filters: { userId: input.userId } }).catch(() => null);
    if (!targetUserRecord) throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });

    // Regular guides can only reassign users in their center
    if (!isSuperGuide) {
      const scope = await getGuideScope(context.user.email);
      if (!scope) throw new AppError({ code: 'FORBIDDEN', message: 'Guide record not found' });
      if (!isUserInGuideScope(scope, targetUserRecord)) {
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

    await Users.update({ id: targetUserRecord.id, record: { guide: resolvedGuideId } });

    try {
      const targetEmail = targetUserRecord.email ? [targetUserRecord.email.toLowerCase()] : [];
      storeBroadcast(
        'Guide Assigned',
        `You have been assigned to a new guide`,
        'guide_changed',
        undefined,
        undefined,
        [targetUserRecord.id, targetUserRecord.userId].filter(Boolean) as string[],
        undefined,
        targetEmail,
      );
    } catch (err) {
      console.error('[assignGuide] Failed to broadcast guide update:', err);
    }

    if (targetUserRecord.id) {
      serverCacheInvalidate('user_profile:' + targetUserRecord.id);
      serverCacheInvalidate('user_profile:' + targetUserRecord.id.toLowerCase());
    }
    if (targetUserRecord.userId) {
      serverCacheInvalidate('user_profile:' + targetUserRecord.userId);
    }
    return { success: true };
  },
});
