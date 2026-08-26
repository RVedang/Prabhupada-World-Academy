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
    const memberIdentities = new Set([uid, userRecord?.id, userRecord?.userId].filter(Boolean).map(String));
    // The UI exposes a group's public groupId, whereas membership documents
    // reference its database document ID. Resolve either form before cleanup.
    const groupRecord = await BvGroups.findOne({
      id: input.groupId,
      fields: ['id', 'groupId', 'groupName', 'bvslId', 'guide'],
    }).catch(() => null) || await BvGroups.findOne({
      filters: { groupId: input.groupId },
      fields: ['id', 'groupId', 'groupName', 'bvslId', 'guide'],
    }).catch(() => null);
    const groupDocumentId = groupRecord?.id || input.groupId;

    // Remove every matching legacy/current membership row in this group. This
    // prevents a leftover custom userId row from keeping Attendance visible.
    const { records: groupMembers } = await BvGroupMembers.findAll({
      filters: { group: groupDocumentId },
      limit: 1000,
      fields: ['id', 'user', 'userId'],
    });
    await Promise.all(groupMembers
      .filter(member => memberIdentities.has(String(member.user || '')) || memberIdentities.has(String(member.userId || '')))
      .map(member => BvGroupMembers.delete({ id: member.id })));

    // Clear the authenticated profile and any resolved email-fallback profile.
    const profileDocumentIds = [...new Set([uid, userRecord?.id].filter(Boolean).map(String))];
    const clearedMembership = {
      bvGroupId: '',
      bvGroupName: '',
      bvRegistrationStatus: '',
      isBvMember: false,
      pendingBvApprovalNotice: false,
    };
    await Promise.all(profileDocumentIds.map(id =>
      Users.update({ id, record: clearedMembership }).catch(() => {})
    ));


    // Send single notification to RGF, Supervisor, and Admins (deduped)
    try {
      const leavingUser = await Users.findOne({ id: uid, fields: ['id', 'fullName', 'email'] });
      const group = groupRecord || await BvGroups.findOne({
        id: groupDocumentId,
        fields: ['id', 'groupName', 'bvslId', 'guide'],
      });

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
