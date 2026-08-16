import { z } from 'zod';
import { createEndpoint, MinutesOfMeeting, Meetings, AppError } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'Get Minutes of Meeting (MoM) accessible to the current user',
  authenticated: true,
  inputSchema: z.object({
    meetingId: z.string().optional(),
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

    const userEmail = (context.user.email || '').toLowerCase();
    const callerRole = (context.user.role || '').toUpperCase();
    const userId = context.user.id;

    const isSuperAdminOrAdmin = !!(
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      context.user.isPwAdmin ||
      callerRole.includes('ADMIN') ||
      callerRole.includes('SUPER') ||
      callerRole === 'PW_ADMIN' ||
      userEmail === 'srilaprabhupadaworld@gmail.com' ||
      userEmail === 'vdnd@hkmmumbai.org'
    );

    const { records: allMoms } = await MinutesOfMeeting.findAll({ limit: 1000 });
    const { records: allMeetings } = await Meetings.findAll({ limit: 1000 });

    const meetingMap = new Map(allMeetings.map((m: any) => [m.id, m]));

    let filtered = allMoms;

    if (input.meetingId) {
      filtered = filtered.filter((mom: any) => mom.meetingId === input.meetingId);
    }

    if (!isSuperAdminOrAdmin) {
      filtered = filtered.filter((mom: any) => {
        if (!mom.isPublished) return false;

        const meeting = meetingMap.get(mom.meetingId);
        const visibleUsers: string[] = mom.visibleToUserIds || [];
        if (visibleUsers.includes(userId)) return true;

        if (meeting) {
          if (
            meeting.createdByUserId === userId ||
            (meeting.inviteeUserIds || []).includes(userId) ||
            (meeting.invitees || []).some((inv: any) => inv.userId === userId || (inv.email && inv.email.toLowerCase() === userEmail))
          ) {
            return true;
          }
        }

        return false;
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
