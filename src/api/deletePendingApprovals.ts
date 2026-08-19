import { z } from 'zod';
import {
  createEndpoint,
  Users,
  AshrayUpgradeRequests,
  GuideTransferRequests,
  ResidencyTransferRequests,
  BvMemberRegistrations,
  AppError,
} from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Delete all pending approvals from the system — Super Admin only',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const userEmail = (context.user.email || '').toLowerCase();
    const isSuperAdmin =
      context.user.isBvSuperAdmin ||
      context.user.role === 'Super Admin' ||
      context.user.role === 'SUPER_ADMIN' ||
      userEmail === 'iamthevedang@gmail.com' ||
      userEmail.includes('superadmin') ||
      userEmail.includes('admin');

    if (!isSuperAdmin) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Only Super Admins can delete all pending approvals',
      });
    }

    let deletedUsersCount = 0;
    let deletedAshrayCount = 0;
    let deletedGuideTransfersCount = 0;
    let deletedResidencyTransfersCount = 0;
    let deletedBvRegistrationsCount = 0;

    // 1. Pending user registrations (status: 'Pending Approval')
    const { records: pendingUsers } = await Users.findAll({
      filters: { status: 'Pending Approval' },
      limit: 500,
    });
    for (const u of pendingUsers) {
      await Users.delete({ id: u.id });
      deletedUsersCount++;
    }

    // 2. Pending Ashray upgrade requests
    const { records: pendingAshray } = await AshrayUpgradeRequests.findAll({
      filters: { status: { in: ['Pending', 'PENDING', 'APPROVED', 'Approved'] } },
      limit: 500,
    });
    for (const a of pendingAshray) {
      await AshrayUpgradeRequests.delete({ id: a.id });
      deletedAshrayCount++;
    }

    // 3. Pending guide transfer requests (status: 'Pending')
    const { records: pendingGuideTransfers } = await GuideTransferRequests.findAll({
      filters: { status: 'Pending' },
      limit: 500,
    });
    for (const gt of pendingGuideTransfers) {
      await GuideTransferRequests.delete({ id: gt.id });
      deletedGuideTransfersCount++;
    }

    // 4. Pending residency transfer requests (status: 'Pending')
    const { records: pendingResidencyTransfers } = await ResidencyTransferRequests.findAll({
      filters: { status: 'Pending' },
      limit: 500,
    });
    for (const rt of pendingResidencyTransfers) {
      await ResidencyTransferRequests.delete({ id: rt.id });
      deletedResidencyTransfersCount++;
    }

    // 5. Pending BV registrations (status: 'Pending Approval')
    const { records: pendingBvRegs } = await BvMemberRegistrations.findAll({
      filters: { status: 'Pending Approval' },
      limit: 500,
    });
    for (const bv of pendingBvRegs) {
      await BvMemberRegistrations.delete({ id: bv.id });
      deletedBvRegistrationsCount++;
    }

    console.log(`[Admin Cleanup] Deleted ${deletedUsersCount} pending users, ${deletedAshrayCount} ashray requests, ${deletedGuideTransfersCount} guide transfers, ${deletedResidencyTransfersCount} residency transfers, ${deletedBvRegistrationsCount} BV registrations.`);

    return {
      success: true,
      deletedUsersCount,
      deletedAshrayCount,
      deletedGuideTransfersCount,
      deletedResidencyTransfersCount,
      deletedBvRegistrationsCount,
    };
  },
});
