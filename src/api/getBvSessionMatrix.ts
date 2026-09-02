import { z } from 'zod';
import { createEndpoint, Users, BvGroups, BvGroupMembers, BvAttendance, BvQuizzes, BvQuizSubmissions, FolkResidencies } from '@/lib/backend-sdk';
import { requireGuideRole } from '../lib/userUtils';
import { getGuideIdsForResidencies } from '../lib/guideScope';
import { legacyQuizMatchesGroup, normalizeQuizDepartment, quizIsActivatedForGroup } from '../lib/bvQuizAccess';
import { bvUserAliases, resolveBvScopedGroups } from '../lib/bvGroupMemberScope';

export default createEndpoint({
  description: 'BV attendance + quiz matrix — person × date grid for guides/bvsls (queries attendance directly by group+date)',
  authenticated: true,
  inputSchema: z.object({
    guideId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    groupId: z.string().optional(),
    bvslMode: z.boolean().optional(),
    residencyIds: z.array(z.string()).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (!context.user) throw new Error('Unauthorized');
    requireGuideRole(context.user.role, {
      isSadhanaMentor: context.user.isSadhanaMentor,
      isBvsl: context.user.isBvsl,
      isBvMentor: context.user.isBvMentor,
      isBvSupervisor: context.user.isBvSupervisor,
      isBvAdmin: context.user.isBvAdmin,
      isBvSuperAdmin: context.user.isBvSuperAdmin,
      isBvSubFacilitator: context.user.isBvSubFacilitator,
    });

    const { guideId, startDate, endDate, groupId, bvslMode, residencyIds } = input;

    // Get groups
    const groupFilter: any = { isActive: true };
    if (bvslMode) {
      // Scope below by both the caller and (for an RGSF) their reporting RGF.
      // Group records use mixed identity fields, so a simple bvslLeader filter
      // would omit valid parent-RGF groups.
    } else if (residencyIds && residencyIds.length > 0) {
      // Center-based scoping: get all guides in these residencies
      const allGuideIds = await getGuideIdsForResidencies(residencyIds);
      if (allGuideIds.length > 0) {
        groupFilter.guide = { in: allGuideIds };
      } else {
        groupFilter.guide = guideId;
      }
    } else if (guideId !== 'ALL') {
      groupFilter.guide = guideId;
    }
    if (groupId) groupFilter.id = groupId;

    let groups: any[];
    if (bvslMode) {
      const rawSegment = String(context.user.segment || (context.user.isBvSupervisor ? 'FOLK' : '')).toUpperCase();
      const segment = rawSegment === 'FOLK' || rawSegment === 'PW' ? rawSegment as 'FOLK' | 'PW' : undefined;
      const scopedGroups = await resolveBvScopedGroups(context.user as any, { segment, groupId });
      groups = scopedGroups.map(group => group.record);
    } else {
      const result = await BvGroups.findAll({
        filters: groupFilter,
        fields: ['id', 'groupId', 'groupName', 'bvslLeader', 'bvslId'],
        limit: 200,
      });
      groups = result.records;
    }

    if (groups.length === 0) {
      return { members: [], allDates: [], sessionDates: [], groups: [], attendance: {}, quizScores: {} };
    }

    // Older PW documents mix the Firestore record id and public groupId in
    // memberships and attendance. Treat both as aliases of the same group.
    const groupIds = [...new Set(groups.flatMap(g => [g.id, g.groupId]).filter(Boolean))] as string[];
    const groupNameMap = new Map<string, string>();
    const groupCanonicalId = new Map<string, string>();
    for (const group of groups) {
      const canonical = String(group.id);
      for (const reference of [group.id, group.groupId].filter(Boolean)) {
        const key = String(reference);
        groupNameMap.set(key, (group.groupName || '') as string);
        groupCanonicalId.set(key, canonical);
      }
    }

    // Get all members for these groups
    const { records: memberships } = await BvGroupMembers.findAll({
      filters: { group: { in: groupIds } } as any,
      fields: ['id', 'user', 'group'],
      limit: 2000,
    });

    const memberUserIds = [
      ...new Set(
        memberships
          .map(m => (Array.isArray(m.user) ? m.user[0] : m.user) as string)
          .filter(Boolean)
      ),
    ];

    if (memberUserIds.length === 0) {
      return {
        members: [],
        allDates: [],
        sessionDates: [],
        groups: groups.map(g => ({ id: g.id, name: g.groupName || '' })),
        attendance: {},
        quizScores: {},
      };
    }

    // Get user details
    const { records: users } = await Users.findAll({
      filters: { id: { in: memberUserIds } } as any,
      fields: ['id', 'userId', 'email', 'uid', 'authUid', 'firebaseUid', 'firebaseUserId', 'firebaseAuthUid', 'authId', 'authUserId', 'firebaseId', 'firebaseAuthId', 'firebase_id', 'fullName', 'ashrayLevel', 'residency', 'residencyApproved'],
      limit: 1000,
    });
    const callerAliases = new Set(bvUserAliases(context.user as any));
    const scopedUsers = bvslMode
      ? users.filter(user => !bvUserAliases(user as any).some(alias => callerAliases.has(alias)))
      : users;
    const userMap = new Map(scopedUsers.map(u => [u.id, u]));

    // Build member list
    const seenUserIds = new Set<string>();
    const memberGroupMap = new Map<string, string>();
    for (const m of memberships) {
      const uid = (Array.isArray(m.user) ? m.user[0] : m.user) as string;
      const gid = (Array.isArray(m.group) ? m.group[0] : m.group) as string;
      const canonicalGroupId = groupCanonicalId.get(String(gid)) || String(gid);
      if (uid && canonicalGroupId && !memberGroupMap.has(uid)) memberGroupMap.set(uid, canonicalGroupId);
    }

    // Build residency name map
    const userResidencyIds = new Set<string>();
    for (const u of users) {
      const rid = Array.isArray(u.residency) ? u.residency[0] : u.residency;
      if (rid && u.residencyApproved) userResidencyIds.add(rid as string);
    }
    const residencyNameMap = new Map<string, string>();
    if (userResidencyIds.size > 0) {
      const { records: resRecs } = await FolkResidencies.findAll({
        filters: { id: { in: Array.from(userResidencyIds) } } as any,
        fields: ['id', 'residencyName'],
        limit: 100,
      });
      for (const r of resRecs) residencyNameMap.set(r.id, ((r as any).residencyName || '').replace(/^FOLK\s+/i, 'FOLK '));
    }

    const members: {
      userId: string;
      fullName: string;
      ashrayLevel: string | null;
      isResident: boolean;
      residencyName: string | null;
      groupId: string;
      groupName: string;
    }[] = [];

    for (const uid of memberUserIds) {
      if (seenUserIds.has(uid)) continue;
      seenUserIds.add(uid);
      const u = userMap.get(uid);
      if (!u) continue;
      const rawResId = Array.isArray(u.residency) ? u.residency[0] : u.residency;
      const isResident = !!(u.residencyApproved && rawResId);
      const gid = memberGroupMap.get(uid) || '';
      members.push({
        userId: uid,
        fullName: (u.fullName as string) || '',
        ashrayLevel: (u.ashrayLevel as string) || null,
        isResident,
        residencyName: isResident && rawResId ? (residencyNameMap.get(rawResId as string) || null) : null,
        groupId: gid,
        groupName: groupNameMap.get(gid) || '',
      });
    }

    // Generate all dates in range
    const allDates: string[] = [];
    const cur = new Date(startDate + 'T00:00:00');
    const endD = new Date(endDate + 'T00:00:00');
    while (cur <= endD) {
      allDates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }

    // Query attendance by group+date range directly (new approach)
    let allAttendance: any[] = [];
    if (groupIds.length > 0) {
      let offset = 0;
      while (true) {
        const { records, hasMore } = await BvAttendance.findAll({
          filters: {
            group: { in: groupIds },
            attendanceDate: { gte: startDate, lte: endDate },
          } as any,
          fields: ['id', 'group', 'user', 'present', 'attendanceDate'],
          limit: 2000,
          offset,
        });
        allAttendance = allAttendance.concat(records);
        if (!hasMore) break;
        offset += 2000;
      }
    }

    // Build attendance map: userId → date → boolean
    const attendanceMap: Record<string, Record<string, boolean>> = {};
    const sessionDatesSet = new Set<string>();
    const groupSessionDates = new Map<string, Set<string>>();

    for (const a of allAttendance) {
      const uid = (Array.isArray(a.user) ? a.user[0] : a.user) as string;
      const date = String(a.attendanceDate || '').slice(0, 10);
      const rawGroupId = (Array.isArray(a.group) ? a.group[0] : a.group) as string;
      const gid = groupCanonicalId.get(String(rawGroupId)) || String(rawGroupId || '');
      if (!uid || !date) continue;

      if (!attendanceMap[uid]) attendanceMap[uid] = {};
      attendanceMap[uid][date] = !!a.present;
      sessionDatesSet.add(date);

      if (gid) {
        if (!groupSessionDates.has(gid)) groupSessionDates.set(gid, new Set());
        groupSessionDates.get(gid)!.add(date);
      }
    }

    // For members whose group had a session but no attendance record → mark as absent
    for (const m of members) {
      const gDates = groupSessionDates.get(m.groupId);
      if (!gDates) continue;
      if (!attendanceMap[m.userId]) attendanceMap[m.userId] = {};
      for (const d of gDates) {
        if (attendanceMap[m.userId][d] === undefined) {
          attendanceMap[m.userId][d] = false;
        }
      }
    }

    // Include both legacy group-specific quizzes and centrally published PW
    // quizzes that an RGF/Admin has activated for one of these groups.
    const { records: allQuizzes } = await BvQuizzes.findAll({
      fields: ['id', 'group', 'department', 'activeGroupIds'],
      limit: 500,
    });
    const quizzes = allQuizzes.filter((quiz: any) =>
      groups.some((group: any) => legacyQuizMatchesGroup(quiz, group)) ||
      (normalizeQuizDepartment(quiz.department, 'FOLK') === 'PW' && groups.some((group: any) => quizIsActivatedForGroup(quiz, group)))
    );

    const quizIds = quizzes.map(q => q.id);

    // Get quiz submissions
    const quizScoreMap: Record<string, Record<string, number>> = {};
    if (quizIds.length > 0 && memberUserIds.length > 0) {
      let offset = 0;
      while (true) {
        const { records, hasMore } = await BvQuizSubmissions.findAll({
          filters: { user: { in: memberUserIds } } as any,
          fields: ['id', 'user', 'quiz', 'percentage', 'submittedAt'],
          limit: 2000,
          offset,
        });
        for (const sub of records) {
          const uid = (Array.isArray(sub.user) ? sub.user[0] : sub.user) as string;
          const qid = (Array.isArray(sub.quiz) ? sub.quiz[0] : sub.quiz) as string;
          if (!uid || !qid || !quizIds.includes(qid) || !sub.submittedAt) continue;
          const subDate = String(sub.submittedAt).slice(0, 10);
          if (subDate < startDate || subDate > endDate) continue;
          if (!quizScoreMap[uid]) quizScoreMap[uid] = {};
          const existing = quizScoreMap[uid][subDate];
          const score = Math.round(Number(sub.percentage) || 0);
          if (existing === undefined || score > existing) {
            quizScoreMap[uid][subDate] = score;
          }
        }
        if (!hasMore) break;
        offset += 2000;
      }
    }

    const sessionDates = [...sessionDatesSet].sort();

    return {
      members,
      allDates,
      sessionDates,
      groups: groups.map(g => ({ id: g.id, name: g.groupName || '' })),
      attendance: attendanceMap,
      quizScores: quizScoreMap,
    };
  },
});
