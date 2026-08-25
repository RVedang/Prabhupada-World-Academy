import { z } from 'zod';
import { createEndpoint, BvGroups, BvGroupMembers, Users, Email } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Leave a BV group and notify RGF, Supervisor, and Admin once',
  authenticated: true,
  inputSchema: z.object({ userId: z.string().optional(), groupId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    const uid = context.user!.id;
    const userRecord = await Users.findOne({ id: uid, fields: ['id', 'userId'] }).catch(() => null);
    const realProfileId = userRecord?.userId || uid;

    // Delete membership from BvGroupMembers table for both IDs
    const res = await BvGroupMembers.findAll({ filters: { user: uid, group: input.groupId }, limit: 5, fields: ['id'] });
    for (const m of res.records) await BvGroupMembers.delete({ id: m.id });

    if (realProfileId !== uid) {
      const resAlt = await BvGroupMembers.findAll({ filters: { user: realProfileId, group: input.groupId }, limit: 5, fields: ['id'] });
      for (const m of resAlt.records) await BvGroupMembers.delete({ id: m.id });
    }

    // Clear BV group membership/registration fields on both user documents
    await Users.update({
      id: uid,
      record: {
        bvGroupId: '',
        bvGroupName: '',
        bvRegistrationStatus: '',
        isBvMember: false,
      }
    }).catch(() => {});

    if (realProfileId !== uid) {
      await Users.update({
        id: realProfileId,
        record: {
          bvGroupId: '',
          bvGroupName: '',
          bvRegistrationStatus: '',
          isBvMember: false,
        }
      }).catch(() => {});
    }


    // Send single notification to RGF, Supervisor, and Admins (deduped)
    try {
      const leavingUser = await Users.findOne({ id: uid, fields: ['id', 'fullName', 'email'] });
      const group = await BvGroups.findOne({ id: input.groupId, fields: ['id', 'groupName', 'bvslId', 'guide'] });

      const leaverName = leavingUser?.fullName || leavingUser?.email || 'A member';
      const groupName = group?.groupName || 'Reading Group';

      // Set of emails to notify (DEDUPED so each recipient is notified ONLY ONCE)
      const notifyEmails = new Set<string>();

      // 1. RGF (bvslId)
      if (group?.bvslId) {
        const rgf = await Users.findOne({ id: group.bvslId, fields: ['email'] }).catch(() => null);
        if (rgf?.email) notifyEmails.add(rgf.email.toLowerCase());
      }

      // 2. Supervisor (group's guide)
      if (group?.guide) {
        const sup = await Users.findOne({ id: group.guide, fields: ['email'] }).catch(() => null);
        if (sup?.email) notifyEmails.add(sup.email.toLowerCase());
      }

      // 3. Only that particular Admin supervising this group's supervisor
      let specificAdminEmail: string | null = null;
      if (group?.guide) {
        const supervisorUser = await Users.findOne({ id: group.guide, fields: ['id', 'email', 'bvSupervisorGuideId', 'guide'] }).catch(() => null);
        if (supervisorUser) {
          const adminId = supervisorUser.bvSupervisorGuideId || (Array.isArray(supervisorUser.guide) ? supervisorUser.guide[0] : supervisorUser.guide);
          if (adminId) {
            const adminUser = await Users.findOne({ id: adminId, fields: ['email'] }).catch(() => null);
            if (adminUser?.email) specificAdminEmail = adminUser.email.toLowerCase();
          }
        }
      }

      if (specificAdminEmail) {
        notifyEmails.add(specificAdminEmail);
      } else {
        // Fallback: notify primary BV Admin for this segment
        const { records: admins } = await Users.findAll({ filters: { isBvAdmin: true }, fields: ['email'], limit: 1 }).catch(() => ({ records: [] }));
        if (admins[0]?.email) notifyEmails.add(admins[0].email.toLowerCase());
      }

      // Send single deduped notification to each unique address
      const notificationPromises = Array.from(notifyEmails).map(email =>
        Email.send({
          to: email,
          subject: `🔔 Member Left Group — ${groupName}`,
          body: [
            {
              type: 'text',
              content: `Hare Krishna,\n\n${leaverName} has left the Bhakti Vriksha reading group: "${groupName}".`,
            },
          ],
        }).catch(() => {})
      );

      await Promise.all(notificationPromises);
    } catch {
      // Non-blocking notification fallback
    }

    return { success: true };
  },
});
