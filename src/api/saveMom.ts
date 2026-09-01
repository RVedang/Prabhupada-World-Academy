import { z } from 'zod';
import { createEndpoint, MinutesOfMeeting, Meetings, AppError } from '@/lib/backend-sdk';

const DiscussionItemSchema = z.object({
  id: z.string().optional().nullable().transform(v => v || ''),
  proposedBy: z.string().min(1, 'Proposed by is required'),
  discussionPoint: z.string().min(1, 'Discussion point is required'),
  actionItem: z.string().optional().nullable().transform(v => v || ''),
  assignedToUserId: z.string().optional().nullable().transform(v => v || ''),
  assignedToName: z.string().optional().nullable().transform(v => v || ''),
  deadline: z.string().optional().nullable().transform(v => v || ''),
  remarks: z.string().optional().nullable().transform(v => v || ''),
  status: z.string().optional().nullable().transform(v => {
    const s = (v || 'pending').toLowerCase();
    if (s.includes('progress')) return 'in_progress';
    if (s.includes('complete')) return 'completed';
    return 'pending';
  }),
});

export default createEndpoint({
  description: 'Save or update Minutes of Meeting (MoM) with 6-column discussion items and visibility controls',
  authenticated: true,
  requiredCapabilities: 'meetings.manage',
  inputSchema: z.object({
    meetingId: z.string().min(1),
    visibleToUserIds: z.array(z.string()).optional().nullable().transform(v => v || []),
    visibleToAllInvitees: z.boolean().optional().nullable().transform(v => v !== false),
    isPublished: z.boolean().optional().nullable().transform(v => v !== false),
    discussionItems: z.array(DiscussionItemSchema),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    momId: z.string(),
    message: z.string(),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    if (!context.user) throw new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

    const userEmail = (context.user.email || '').toLowerCase();
    const callerRole = String(context.user.role || '').toUpperCase().replace(/[\s-]+/g, '_');

    const isSuperAdminOrAdmin = !!(
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      context.user.isPwAdmin ||
      ['ADMIN', 'PW_ADMIN', 'SUPER_ADMIN', 'SUPER_GUIDE'].includes(callerRole)
    );
    const normalizedSegment = String(context.user.segment || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
    const isPwUser = normalizedSegment === 'PW' || normalizedSegment === 'PRABHUPADAWORLD';
    const isReadOnlySadhanaMentor = isPwUser && !!(
      context.user.isSadhanaMentor || callerRole === 'SADHANA_MENTOR'
    );

    const meeting = await Meetings.findOne({ id: input.meetingId });
    if (!meeting) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Associated meeting not found' });
    }

    if (!isSuperAdminOrAdmin || isReadOnlySadhanaMentor) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Only Admins and Super Admins can manage Minutes of Meeting' });
    }

    const { records: existingMoms } = await MinutesOfMeeting.findAll({
      filters: { meetingId: input.meetingId },
      limit: 10,
    });

    const items = input.discussionItems.map((item: any, idx: number) => ({
      id: item.id || `item_${Date.now()}_${idx}`,
      proposedBy: item.proposedBy.trim(),
      discussionPoint: item.discussionPoint.trim(),
      actionItem: (item.actionItem || '').trim(),
      assignedToUserId: item.assignedToUserId || '',
      assignedToName: (item.assignedToName || '').trim(),
      deadline: item.deadline || '',
      remarks: (item.remarks || '').trim(),
      status: item.status || 'pending',
    }));

    const momData = {
      meetingId: input.meetingId,
      meetingTitle: meeting.title || 'Meeting',
      meetingDate: meeting.scheduledAt || new Date().toISOString(),
      meetingType: meeting.type || 'OTHER',
      createdByUserId: context.user.id || '',
      createdByName: context.user.fullName || context.user.email || 'Super Admin',
      isPublished: input.isPublished,
      visibleToUserIds: input.visibleToUserIds,
      visibleToAllInvitees: input.visibleToAllInvitees,
      discussionItems: items,
      updatedAt: new Date().toISOString(),
    };

    let momId = '';
    if (existingMoms.length > 0) {
      momId = existingMoms[0].id;
      await MinutesOfMeeting.update({ id: momId, record: momData });
    } else {
      const res = await MinutesOfMeeting.create({
        record: {
          ...momData,
          createdAt: new Date().toISOString(),
        },
      });
      momId = res.id;
    }

    return {
      success: true,
      momId,
      message: `Minutes of Meeting for "${meeting.title}" saved successfully!`,
    };
  },
});
