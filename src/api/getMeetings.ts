import { z } from 'zod';
import { createEndpoint, Meetings, Users, AppError } from '@/lib/backend-sdk';
import { getMeetingViewer, isMeetingVisibleToViewer, normalizeMeetingDepartment } from '@/lib/meetingAccess';

const VIEWER_FIELDS = ['id', 'userId', 'email', 'segment', 'role', 'isSadhanaMentor', 'isBvSuperAdmin', 'isBvAdmin', 'isPwAdmin', 'uid', 'authUid', 'firebaseUid'];

export default createEndpoint({
  description: 'Get Prabhupada World meetings',
  authenticated: true,
  inputSchema: z.object({
    status: z.enum(['ALL', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional().default('ALL'),
    department: z.enum(['FOLK', 'PW']).optional(),
  }),
  outputSchema: z.object({
    meetings: z.array(z.object({
      id: z.string(),
      title: z.string(),
      type: z.string(),
      segment: z.string(),
      scheduledAt: z.string(),
      durationMinutes: z.number(),
      locationOrLink: z.string(),
      description: z.string(),
      createdByUserId: z.string(),
      createdByName: z.string(),
      createdByRole: z.string(),
      inviteeUserIds: z.array(z.string()),
      invitees: z.array(z.object({
        userId: z.string(),
        fullName: z.string(),
        email: z.string(),
        role: z.string().optional(),
      })),
      notificationLeadMinutes: z.number(),
      notificationSent: z.boolean(),
      notification10mSent: z.boolean().optional(),
      notification1mSent: z.boolean().optional(),
      status: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const storedUser = (await Users.findOne({ id: context.user.id, fields: VIEWER_FIELDS }).catch(() => null))
      || (context.user.email
        ? await Users.findOne({ filters: { email: context.user.email }, fields: VIEWER_FIELDS }).catch(() => null)
        : null);
    const viewer = getMeetingViewer(context.user, storedUser);
    const department = input.department || viewer.department || 'PW';
    if (input.department && viewer.department && input.department !== viewer.department) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You cannot view meetings for another department' });
    }

    const { records: allMeetings } = await Meetings.findAll({ limit: 1000 });

    let filtered = allMeetings.filter((m: any) => normalizeMeetingDepartment(m.segment || 'PW') === department);

    if (!viewer.canViewAllMeetings) {
      filtered = filtered.filter((meeting: any) => isMeetingVisibleToViewer(meeting, viewer));
    }

    if (input.status && input.status !== 'ALL') {
      filtered = filtered.filter((m: any) => m.status === input.status);
    }

    // Sort by scheduledAt descending (newest / upcoming first)
    filtered.sort((a: any, b: any) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

    // Resolve creator display names by checking the Users database
    const creatorIds = Array.from(new Set(filtered.map((m: any) => m.createdByUserId).filter(Boolean))) as string[];
    const creatorUsersList = await Promise.all(
      creatorIds.map(uid =>
        Users.findOne({ id: uid })
          .catch(() => null)
          .then(u => u || null)
      )
    );
    const creatorMap = new Map<string, string>();
    for (const u of creatorUsersList) {
      if (u && u.id && u.fullName) {
        creatorMap.set(u.id, u.fullName);
      }
    }

    const meetings = filtered.map((m: any) => {
      let displayName = m.createdByName || 'Admin';
      if (m.createdByUserId && creatorMap.has(m.createdByUserId)) {
        displayName = creatorMap.get(m.createdByUserId)!;
      }
      return {
        id: m.id,
        title: m.title || 'Untitled Meeting',
        type: m.type || 'OTHER',
        segment: m.segment || department,
        scheduledAt: m.scheduledAt || new Date().toISOString(),
        durationMinutes: m.durationMinutes || 60,
        locationOrLink: m.locationOrLink || '',
        description: m.description || '',
        createdByUserId: m.createdByUserId || '',
        createdByName: displayName,
        createdByRole: m.createdByRole || '',
        inviteeUserIds: m.inviteeUserIds || [],
        invitees: m.invitees || [],
        notificationLeadMinutes: m.notificationLeadMinutes || 10,
        notificationSent: !!m.notificationSent,
        notification10mSent: !!m.notification10mSent,
        notification1mSent: !!m.notification1mSent,
        status: m.status || 'SCHEDULED',
        createdAt: m.createdAt || new Date().toISOString(),
        updatedAt: m.updatedAt || new Date().toISOString(),
      };
    });

    return { meetings };
  },
});
