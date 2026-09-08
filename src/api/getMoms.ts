import { z } from 'zod';
import { createEndpoint, MinutesOfMeeting, Meetings, AppError } from '@/lib/backend-sdk';
import { getMeetingViewer, isMeetingVisibleToViewer, normalizeMeetingDepartment } from '@/lib/meetingAccess';

export default createEndpoint({
  description: 'Get Minutes of Meeting (MoM) accessible to the current user',
  authenticated: true,
  inputSchema: z.object({
    meetingId: z.string().optional(),
    department: z.enum(['FOLK', 'PW']).optional(),
  }),
  outputSchema: z.object({
    moms: z.array(z.object({
      id: z.string(),
      meetingId: z.string(),
      meetingTitle: z.string(),
      meetingDate: z.string(),
      meetingType: z.string(),
      createdByUserId: z.string(),
      createdByName: z.string(),
      isPublished: z.boolean(),
      visibleToUserIds: z.array(z.string()),
      visibleToAllInvitees: z.boolean(),
      discussionItems: z.array(z.object({
        id: z.string(),
        proposedBy: z.string(),
        discussionPoint: z.string(),
        actionItem: z.string(),
        assignedToUserId: z.string().optional(),
        assignedToName: z.string(),
        deadline: z.string(),
        remarks: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed']).optional().default('pending'),
      })),
      createdAt: z.string(),
      updatedAt: z.string(),
    })),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const viewer = getMeetingViewer(context.user, context.user);
    const department = input.department || viewer.department || 'PW';
    if (input.department && viewer.department && input.department !== viewer.department) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You cannot view minutes for another department' });
    }
    if (department === 'FOLK') return { moms: [] };

    const { records: departmentMeetings } = await Meetings.findAll({
      limit: 1000,
    });
    const accessibleMeetings = departmentMeetings.filter((meeting: any) =>
      normalizeMeetingDepartment(meeting.segment || 'PW') === department &&
      (!input.meetingId || meeting.id === input.meetingId) &&
      (viewer.canViewAllMeetings || isMeetingVisibleToViewer(meeting, viewer))
    );
    const meetingMap = new Map(accessibleMeetings.map((meeting: any) => [meeting.id, meeting]));
    const accessibleIds = [...meetingMap.keys()];

    if (accessibleIds.length === 0) return { moms: [] };

    // Invitees generally have only a handful of visible meetings. Query just
    // those MoMs. For admins with a large catalogue, one bounded collection
    // read is cheaper than dozens of `in` batches.
    let allMoms: any[];
    if (accessibleIds.length <= 30) {
      const result = await MinutesOfMeeting.findAll({
        filters: { meetingId: { in: accessibleIds } },
        limit: Math.max(100, accessibleIds.length * 5),
      });
      allMoms = result.records || [];
    } else {
      const result = await MinutesOfMeeting.findAll({ limit: 1000 });
      allMoms = result.records || [];
    }

    let filtered = allMoms.filter((mom: any) => meetingMap.has(mom.meetingId));
    if (!viewer.canViewAllMeetings) filtered = filtered.filter((mom: any) => mom.isPublished !== false);

    filtered.sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

    const moms = filtered.map((mom: any) => ({
      id: mom.id,
      meetingId: mom.meetingId || '',
      meetingTitle: mom.meetingTitle || 'Meeting',
      meetingDate: mom.meetingDate || new Date().toISOString(),
      meetingType: mom.meetingType || 'OTHER',
      createdByUserId: mom.createdByUserId || '',
      createdByName: mom.createdByName || 'Super Admin',
      isPublished: mom.isPublished !== false,
      visibleToUserIds: mom.visibleToUserIds || [],
      visibleToAllInvitees: mom.visibleToAllInvitees !== false,
      discussionItems: (mom.discussionItems || []).map((item: any) => ({
        id: item.id || '',
        proposedBy: item.proposedBy || '',
        discussionPoint: item.discussionPoint || '',
        actionItem: item.actionItem || '',
        assignedToUserId: item.assignedToUserId || '',
        assignedToName: item.assignedToName || '',
        deadline: item.deadline || '',
        remarks: item.remarks || '',
        status: item.status || 'pending',
      })),
      createdAt: mom.createdAt || new Date().toISOString(),
      updatedAt: mom.updatedAt || new Date().toISOString(),
    }));

    return { moms };
  },
});
