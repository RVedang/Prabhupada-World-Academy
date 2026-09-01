import { z } from 'zod';
import { createEndpoint, MinutesOfMeeting, Meetings, Users, AppError } from '@/lib/backend-sdk';
import { getMeetingViewer, isMeetingVisibleToViewer, normalizeMeetingDepartment } from '@/lib/meetingAccess';

const VIEWER_FIELDS = ['id', 'userId', 'email', 'segment', 'role', 'isSadhanaMentor', 'isBvSuperAdmin', 'isBvAdmin', 'isPwAdmin', 'uid', 'authUid', 'firebaseUid'];

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

    const storedUser = (await Users.findOne({ id: context.user.id, fields: VIEWER_FIELDS }).catch(() => null))
      || (context.user.email
        ? await Users.findOne({ filters: { email: context.user.email }, fields: VIEWER_FIELDS }).catch(() => null)
        : null);
    const viewer = getMeetingViewer(context.user, storedUser);
    const department = input.department || viewer.department || 'PW';
    if (input.department && viewer.department && input.department !== viewer.department) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You cannot view minutes for another department' });
    }

    const { records: allMoms } = await MinutesOfMeeting.findAll({ limit: 1000 });
    const { records: allMeetings } = await Meetings.findAll({ limit: 1000 });

    const meetingMap = new Map(allMeetings.map((m: any) => [m.id, m]));

    let filtered = allMoms.filter((mom: any) => {
      const meeting = meetingMap.get(mom.meetingId);
      return meeting && normalizeMeetingDepartment(meeting.segment || 'PW') === department;
    });

    if (input.meetingId) {
      filtered = filtered.filter((mom: any) => mom.meetingId === input.meetingId);
    }

    if (!viewer.canViewAllMeetings) {
      filtered = filtered.filter((mom: any) => {
        if (!mom.isPublished) return false;
        const meeting = meetingMap.get(mom.meetingId);
        // Keep MoM visibility identical to getMeetings: no invite, no meeting;
        // no visible meeting, no associated MoM.
        return !!meeting && isMeetingVisibleToViewer(meeting, viewer);
      });
    }

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
