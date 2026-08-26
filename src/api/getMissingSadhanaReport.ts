import { z } from 'zod';
import { createEndpoint, Users, Guides, SadhanaEntries, FolkResidencies } from '@/lib/backend-sdk';
import { requireGuideRole } from '../lib/userUtils';
import { getScopedHierarchyUserIds } from '../lib/hierarchyUtils';

const USER_FIELDS = ['id', 'userId', 'fullName', 'status', 'role', 'residency', 'guide', 'isScholar', 'residencyClaimed', 'residencyApproved', 'residentSince'];

// Guides and Super Guides oversee Sadhana; they are not expected to submit a
// daily member report. Normalize legacy spacing/casing so the rule applies to
// both PW and FOLK without relying on names or email addresses.
function isSadhanaExemptLeadershipRole(role: unknown): boolean {
  const normalized = String(role || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return normalized === 'GUIDE' || normalized === 'SUPER_GUIDE' || normalized === 'SUPERGUIDE';
}

export default createEndpoint({
  description: 'Get missing sadhana report — who did not submit for each date in a range, with late detection',
  authenticated: true,
  requiredCapabilities: 'sadhana.reports',
  inputSchema: z.object({
    startDate: z.string(),         // YYYY-MM-DD
    endDate: z.string(),           // YYYY-MM-DD
    guideId: z.string().optional(),
    residencyId: z.string().optional(),
    segment: z.enum(['PW', 'FOLK']).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    requireGuideRole(context.user.role, {
      isSadhanaMentor: context.user.isSadhanaMentor,
      isBvsl: context.user.isBvsl,
    });

    const userRole = (context.user.role || 'User').toUpperCase().replace(/\s+/g, '_');
    const userEmail = (context.user.email || '').toLowerCase();
    const isSuperGuide = userRole === 'SUPER_GUIDE' ||
      userRole === 'SUPER_ADMIN' ||
      userRole === 'PW_ADMIN' ||
      !!context.user.isBvSuperAdmin ||
      !!context.user.isBvAdmin;

    // 1. Find guide record for scoping (regular guide only)
    let guideRecord: any = null;
    if (!isSuperGuide) {
      guideRecord = await Guides.findOne({
        filters: { email: context.user.email, isActive: true },
        fields: ['id', 'folkResidencies'],
      }).catch(() => null);
    }

    // 2. Build user query filters
    const filters: any = { status: 'Active' };
    if (input.segment) {
      filters.segment = input.segment;
    }
    if (!isSuperGuide && guideRecord) {
      filters.guide = guideRecord.id;
    }
    if (isSuperGuide && input.guideId && input.guideId !== 'ALL') {
      filters.guide = input.guideId;
    }
    if (input.residencyId) {
      filters.residency = input.residencyId;
    }

    // 3. Fetch users — guide-scoped + residency-based users
    const { records: baseUsers } = await Users.findAll({ filters, fields: USER_FIELDS, limit: 2000 });
    let allUsers: any[] = [...baseUsers];

    // Include residency-based users for regular guides (same logic as getGuideUsers)
    if (!isSuperGuide && guideRecord && !input.residencyId) {
      const guideRids: string[] = Array.isArray(guideRecord.folkResidencies)
        ? (guideRecord.folkResidencies as string[])
        : (guideRecord.folkResidencies ? [guideRecord.folkResidencies as string] : []);

      if (guideRids.length > 0) {
        const resFetches = await Promise.all(
          guideRids.map(rid =>
            Users.findAll({ filters: { residency: rid, status: 'Active' }, fields: USER_FIELDS, limit: 500 })
          )
        );
        const userMap = new Map<string, any>();
        for (const u of allUsers) userMap.set(u.id, u);
        for (const res of resFetches) {
          for (const u of res.records) userMap.set(u.id, u);
        }
        allUsers = Array.from(userMap.values());
      }
    }

    const scopedUserIds = await getScopedHierarchyUserIds(context.user);
    if (scopedUserIds !== null) {
      allUsers = allUsers.filter(u => {
        const uId = String(u.id || '').toLowerCase();
        const userIdStr = String(u.userId || '').toLowerCase();
        const emailStr = String(u.email || '').toLowerCase();
        return (uId && scopedUserIds.has(uId)) || (userIdStr && scopedUserIds.has(userIdStr)) || (emailStr && scopedUserIds.has(emailStr));
      });
    }

    // Only registered members (have userId + fullName). Guides and Super
    // Guides are report administrators, not Sadhana-report participants.
    const users = allUsers.filter(u =>
      u.userId &&
      (u.fullName || '').trim().length > 0 &&
      !isSadhanaExemptLeadershipRole(u.role)
    );

    if (users.length === 0) {
      return {
        users: [],
        dates: [],
        matrix: {},
        stats: { totalUsers: 0, totalDays: 0, totalMissing: 0, totalLate: 0, completionRate: 100 },
        guides: [],
      };
    }

    // 4. Generate dates array (inclusive)
    const dates: string[] = [];
    const d = new Date(input.startDate + 'T00:00:00Z');
    const endD = new Date(input.endDate + 'T00:00:00Z');
    while (d <= endD) {
      dates.push(d.toISOString().split('T')[0]);
      d.setUTCDate(d.getUTCDate() + 1);
    }

    // 5. Fetch all sadhana entries in range (paginated) — include submittedAt for late detection
    const allEntries: any[] = [];
    let offset = 0;
    while (true) {
      const { records, hasMore } = await SadhanaEntries.findAll({
        filters: { entryDate: { gte: input.startDate, lte: input.endDate } as any },
        fields: ['id', 'user', 'entryDate', 'submittedAt'],
        limit: 2000,
        offset,
      });
      allEntries.push(...records);
      if (!hasMore) break;
      offset += 2000;
    }

    // 6. Build submission lookup map: "userId|date" -> "filled" | "late"
    // Late = submittedAt date is strictly after entryDate
    const submissionMap = new Map<string, 'filled' | 'late'>();
    for (const e of allEntries) {
      const uid = Array.isArray(e.user) ? e.user[0] : e.user;
      if (!uid || !e.entryDate) continue;
      const entryDateStr = String(e.entryDate).split('T')[0];
      const key = `${uid}|${entryDateStr}`;
      let status: 'filled' | 'late' = 'filled';
      if (e.submittedAt) {
        const submittedDateStr = String(e.submittedAt).split('T')[0];
        if (submittedDateStr > entryDateStr) {
          status = 'late';
        }
      }
      // If there's already a "filled" entry for this key, keep it (on-time wins)
      if (!submissionMap.has(key) || submissionMap.get(key) === 'late') {
        submissionMap.set(key, status);
      }
    }

    // 7. Fetch residency names (batch)
    const resIds = [...new Set(
      users.map(u => (Array.isArray(u.residency) ? u.residency[0] : u.residency)).filter(Boolean)
    )] as string[];
    const residencyMap = new Map<string, string>();
    if (resIds.length > 0) {
      const { records: residencies } = await FolkResidencies.findAll({
        fields: ['id', 'residencyId', 'residencyName'],
        limit: 200,
      });
      for (const r of residencies) {
        if (r.id) {
          residencyMap.set(r.id, (r as any).residencyName || '');
          if ((r as any).residencyId) residencyMap.set((r as any).residencyId, (r as any).residencyName || '');
        }
      }
    }

    // 8. Fetch all guides and build guideLookup (extremely robust, same as getGuideUsers)
    const { records: allGuides } = await Guides.findAll({
      fields: ['id', 'fullName', 'abbreviation', 'email'],
      limit: 500,
    });
    const guideLookup = new Map<string, string>();
    for (const g of allGuides) {
      if (g.id) {
        guideLookup.set(g.id.toLowerCase(), g.fullName || g.id);
        if (g.fullName) guideLookup.set(g.fullName.toLowerCase(), g.fullName);
        if (g.abbreviation) guideLookup.set(g.abbreviation.toLowerCase(), g.fullName);
        if (g.email) guideLookup.set(g.email.toLowerCase(), g.fullName);
      }
    }

    // 9. Sort users alphabetically and build matrix
    users.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

    const matrix: Record<string, Record<string, 'filled' | 'late' | 'missed'>> = {};
    let totalMissing = 0;
    let totalLate = 0;

    for (const u of users) {
      matrix[u.id] = {};
      for (const date of dates) {
        const key = `${u.id}|${date}`;
        const status = submissionMap.get(key);
        if (status === 'filled') {
          matrix[u.id][date] = 'filled';
        } else if (status === 'late') {
          matrix[u.id][date] = 'late';
          totalLate++;
        } else {
          matrix[u.id][date] = 'missed';
          totalMissing++;
        }
      }
    }

    const totalCells = users.length * dates.length;
    const totalFilled = totalCells - totalMissing - totalLate;
    const completionRate = totalCells > 0
      ? Math.round(((totalFilled + totalLate) / totalCells) * 100)
      : 100;

    // 10. Build guide list from users in scope
    const seenGuideIds = new Set<string>();
    const guidesInScope: { id: string; name: string }[] = [];
    for (const u of users) {
      const gid = Array.isArray(u.guide) ? u.guide[0] : u.guide;
      if (gid && !seenGuideIds.has(gid)) {
        seenGuideIds.add(gid);
        guidesInScope.push({ id: gid, name: guideLookup.get(String(gid).toLowerCase()) || 'Unknown' });
      }
    }
    guidesInScope.sort((a, b) => a.name.localeCompare(b.name));

    return {
      users: users.map(u => {
        const resId = Array.isArray(u.residency) ? u.residency[0] : u.residency;
        const guideId = Array.isArray(u.guide) ? u.guide[0] : u.guide;

        let residencyType: string;
        if (u.isScholar) {
          residencyType = 'Scholar';
        } else if (u.residencyClaimed && u.residencyApproved && resId) {
          residencyType = 'Resident';
        } else {
          residencyType = 'Non-Resident';
        }

        return {
          id: u.id,
          fullName: u.fullName || '',
          userId: u.userId || '',
          residencyName: resId ? (residencyMap.get(String(resId)) || residencyMap.get(String(resId).toLowerCase()) || resId) : '',
          guideName: guideId ? (guideLookup.get(String(guideId).toLowerCase()) || guideId) : '',
          guideId: guideId || '',
          residencyType,
        };
      }),
      dates,
      matrix,
      stats: { totalUsers: users.length, totalDays: dates.length, totalMissing, totalLate, completionRate },
      guides: guidesInScope,
    };
  },
});
