import { z } from 'zod';
import { createEndpoint, GuideTransferRequests, Users, Guides, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate } from '../lib/serverCache';

export default createEndpoint({
  description: 'Approve or reject a guide transfer request — only the receiving guide can act',
  authenticated: true,
  inputSchema: z.object({
    requestId: z.string().optional(),
    logId: z.string().optional(),
    action: z.enum(['approve', 'reject']),
    notes: z.string().optional(),
    userId: z.string().optional(),
    guideId: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const id = input.requestId || input.logId;
    if (!id) throw new AppError({ code: 'BAD_REQUEST', message: 'requestId is required' });

    const request = await GuideTransferRequests.findOne({ id });
    if (!request) throw new AppError({ code: 'NOT_FOUND', message: 'Transfer request not found' });
    if ((request.status as string) !== 'Pending') throw new AppError({ code: 'CONFLICT', message: 'Request already reviewed' });

    // Authorization: only Super Guides or Admins are allowed to approve guide transfers
    const userRole = (context.user.role || '').toUpperCase();
    const isAuthorized =
      userRole === 'SUPER_GUIDE' ||
      userRole === 'SUPER GUIDE' ||
      userRole === 'SUPER_ADMIN' ||
      userRole === 'ADMIN' ||
      !!context.user.isBvSuperAdmin ||
      !!context.user.isBvAdmin;

    if (!isAuthorized) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only a Super Guide or Admin can approve guide transfer requests' });
    }

    await GuideTransferRequests.update({
      id,
      record: {
        status: input.action === 'approve' ? 'Approved' : 'Rejected',
        resolvedAt: new Date().toISOString(),
        notes: input.notes || '',
      },
    });

    const rawUserId = Array.isArray(request.user) ? request.user[0] : request.user as string;
    let targetUser = null;
    if (rawUserId) {
      targetUser = await Users.findOne({ id: rawUserId }).catch(() => null) ||
                   await Users.findOne({ filters: { userId: rawUserId } }).catch(() => null) ||
                   await Users.findOne({ filters: { fullName: rawUserId } }).catch(() => null) ||
                   await Users.findOne({ filters: { email: rawUserId } }).catch(() => null) ||
                   await Users.findOne({ filters: { email: String(rawUserId).toLowerCase() } }).catch(() => null);
    }

    if (input.action === 'approve') {
      const newGuideId = Array.isArray(request.toGuide) ? request.toGuide[0] : request.toGuide as string;
      if (targetUser && newGuideId) {
        await Users.update({ id: targetUser.id, record: { guide: newGuideId } });
      }
    }

    if (targetUser) {
      serverCacheInvalidate(`user_profile:${targetUser.id}`);
    }

    return { success: true, message: `Guide transfer request ${input.action === 'approve' ? 'approved' : 'rejected'}` };
  },
});
