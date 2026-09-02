import { z } from 'zod';
import { createEndpoint, Meetings, AppError } from '@/lib/backend-sdk';
import { getMeetingViewer, isMeetingVisibleToViewer, normalizeMeetingDepartment } from '@/lib/meetingAccess';

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

    // The API router already resolved a fresh database-backed user context.
    // Re-querying Users here duplicated that lookup on every tab refresh.
    const viewer = getMeetingViewer(context.user, context.user);
    const department = input.department || viewer.department || 'PW';
    if (input.department && viewer.department && input.department !== viewer.department) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You cannot view meetings for another department' });
    }

    const meetingFilters = {
      ...(department === 'FOLK' ? { segment: 'FOLK' } : {}),
      ...(input.status && input.status !== 'ALL' ? { status: input.status } : {}),
    };
    const { records: allMeetings } = await Meetings.findAll({
      ...(Object.keys(meetingFilters).length ? { filters: meetingFilters } : {}),
      limit: 1000,
    });

    let filtered = allMeetings.filter((m: any) => normalizeMeetingDepartment(m.segment || 'PW') === department);

    if (!viewer.canViewAllMeetings) {
      filtered = filtered.filter((meeting: any) => isMeetingVisibleToViewer(meeting, viewer));
    }

    if (input.status && input.status !== 'ALL') {
      filtered = filtered.filter((m: any) => m.status === input.status);
    }

    // Sort by scheduledAt descending (newest / upcoming first)
    filtered.sort((a: any, b: any) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

    const meetings = filtered.map((m: any) => {
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
        // New and edited meetings denormalize this display value. Avoid an
        // N+1 Users lookup every time the meeting list opens.
        createdByName: m.createdByName || 'Admin',
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
