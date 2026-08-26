import { z } from 'zod';
import { createEndpoint, BvGroups, BvSessions, BvAttendance, BvGroupMembers, AppError } from '@/lib/backend-sdk';

const referenceValues = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter(Boolean).map(String);

async function requireAssignedFacilitator(groupId: string, context: any) {
  const group = await BvGroups.findOne({
    id: groupId,
    fields: ['id', 'bvslLeader', 'bvslId', 'rgsfId', 'subFacilitatorId', 'subFacilitator'],
  }).catch(() => null);
  if (!group) throw new AppError({ code: 'NOT_FOUND', message: 'Reading Group not found' });

  const callerIds = new Set([
    context.user?.id,
    context.user?.userId,
    context.user?.email,
  ].filter(Boolean).map((value: any) => String(value).toLowerCase()));
  const facilitatorIds = [
    ...referenceValues(group.bvslLeader),
    ...referenceValues(group.bvslId),
    ...referenceValues(group.rgsfId),
    ...referenceValues(group.subFacilitatorId),
    ...referenceValues(group.subFacilitator),
  ];

  if (!facilitatorIds.some(id => callerIds.has(id.toLowerCase()))) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Only this Reading Group\'s facilitator can mark attendance' });
  }
  return group;
}

export default createEndpoint({
  description: 'Mark a user present or absent in a specific BV session, or by date',
  authenticated: true,
  inputSchema: z.object({
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    present: z.boolean().optional(),
    status: z.string().optional(),
    localDate: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const isPresent = input.present ?? (input.status === 'P');

    // Resolve canonical user keys (id, userId, email)
    const targetUserId = input.userId || context.user!.id;
    let uid = targetUserId;
    const userKeys = new Set<string>();
    userKeys.add(String(targetUserId).toLowerCase());
    if (context.user?.id) userKeys.add(String(context.user.id).toLowerCase());
    if (context.user?.userId) userKeys.add(String(context.user.userId).toLowerCase());

    if (input.userId) {
      const uRec = await BvAttendance.findOne({ filters: { id: input.userId }, fields: ['id'] }).catch(() => null);
      if (uRec) uid = uRec.id;
    }

    // If sessionId is given, mark attendance for that session
    if (input.sessionId) {
      const session = await BvSessions.findOne({
        id: input.sessionId,
        fields: ['id', 'sessionDate', 'group'],
      });
      if (!session) throw new AppError({ code: 'NOT_FOUND', message: 'Session not found' });

      const sessionDate = String(session.sessionDate || '').slice(0, 10);
      const groupId = Array.isArray(session.group) ? session.group[0] : session.group as string | undefined;
      if (!groupId) throw new AppError({ code: 'BAD_REQUEST', message: 'Session is not linked to a Reading Group' });
      await requireAssignedFacilitator(groupId, context);

      const { records: dateRecords } = await BvAttendance.findAll({
        filters: { attendanceDate: sessionDate },
        limit: 1000,
      }).catch(() => ({ records: [] }));

      const existing = dateRecords.find((a: any) => {
        const u = Array.isArray(a.user) ? a.user[0] : a.user;
        return userKeys.has(String(u || '').toLowerCase());
      });

      if (existing) {
        await BvAttendance.update({ id: existing.id, record: { present: isPresent, group: groupId, session: input.sessionId } });
      } else {
        await BvAttendance.create({
          record: {
            session: input.sessionId,
            user: uid,
            present: isPresent,
            ...(sessionDate ? { attendanceDate: sessionDate } : {}),
            ...(groupId ? { group: groupId } : {}),
          },
        });
      }
      return { success: true };
    }

    // If localDate given — find user's group and mark attendance directly by group+date
    if (input.localDate) {
      // Resolve the target user's group before permitting a mark. A regular
      // member cannot mark their own attendance merely by calling this API.
      const membershipRes = await BvGroupMembers.findAll({
        filters: { user: uid },
        limit: 1,
        fields: ['id', 'group'],
      }).catch(() => ({ records: [] }));
      const groupId = membershipRes.records[0]
        ? (Array.isArray(membershipRes.records[0].group) ? membershipRes.records[0].group[0] : membershipRes.records[0].group as string)
        : null;
      if (!groupId) throw new AppError({ code: 'NOT_FOUND', message: 'User is not assigned to a Reading Group' });
      await requireAssignedFacilitator(groupId, context);

      // Find all BvAttendance records for this date
      const { records: dateRecords } = await BvAttendance.findAll({
        filters: { attendanceDate: input.localDate },
        limit: 1000,
      }).catch(() => ({ records: [] }));

      const existing = dateRecords.find((a: any) => {
        const u = Array.isArray(a.user) ? a.user[0] : a.user;
        return userKeys.has(String(u || '').toLowerCase());
      });

      if (existing) {
        await BvAttendance.update({ id: existing.id, record: { present: isPresent, group: groupId } });
        return { success: true };
      }

      const session = groupId
        ? await BvSessions.findOne({ filters: { group: groupId, sessionDate: input.localDate }, fields: ['id'] }).catch(() => null)
        : null;

      await BvAttendance.create({
        record: {
          user: uid,
          present: isPresent,
          attendanceDate: input.localDate,
          ...(groupId ? { group: groupId } : {}),
          ...(session ? { session: session.id } : {}),
        },
      });
      return { success: true };
    }

    throw new AppError({ code: 'BAD_REQUEST', message: 'sessionId or localDate is required' });
  },
});
