import { z } from 'zod';
import { createEndpoint, Meetings, Users, AppError } from '@/lib/backend-sdk';

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

    const userEmail = (context.user.email || '').toLowerCase();
    const callerRole = String(context.user.role || '').toUpperCase().replace(/[\s-]+/g, '_');
    const userId = context.user.id;

    const isSuperAdminOrAdmin = !!(
      context.user.isBvSuperAdmin ||
      context.user.isBvAdmin ||
      context.user.isPwAdmin ||
      ['ADMIN', 'PW_ADMIN', 'SUPER_ADMIN', 'SUPER_GUIDE'].includes(callerRole)
    );
    // A Sadhana Mentor is an invited attendee, even when legacy profile data
    // still carries an administrative flag from a previous assignment.
    const normalizedSegment = String(context.user.segment || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
    const isPwUser = normalizedSegment === 'PW' || normalizedSegment === 'PRABHUPADAWORLD';
    const isReadOnlySadhanaMentor = isPwUser && !!(
      context.user.isSadhanaMentor || callerRole === 'SADHANA_MENTOR'
    );
    const canViewAllMeetings = isSuperAdminOrAdmin && !isReadOnlySadhanaMentor;

    const storedSegment = String(context.user.segment || '').trim().toUpperCase();
    const department = input.department || storedSegment || 'PW';
    if (input.department && storedSegment && input.department !== storedSegment) {
      throw new AppError({ code: 'FORBIDDEN', message: 'You cannot view meetings for another department' });
    }

    const { records: allMeetings } = await Meetings.findAll({ limit: 1000 });

    let filtered = allMeetings.filter((m: any) => String(m.segment || 'PW').toUpperCase() === department);

    if (!canViewAllMeetings) {
      filtered = filtered.filter((m: any) => {
        // Supervisors and other non-admins see only meetings to which they are invited.
        return (
          (m.inviteeUserIds || []).includes(userId) ||
          (m.invitees || []).some((inv: any) => inv.userId === userId || (inv.email && inv.email.toLowerCase() === userEmail))
        );
      });
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
