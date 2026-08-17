import { z } from 'zod';
import { createEndpoint, Users, Guides } from '@/lib/backend-sdk';
import { generateUniqueUserId } from '../lib/userIdGen';
import { serverCacheInvalidate } from '../lib/serverCache';

function roleToRoute(role: string, isBvsl?: boolean, isSadhanaMentor?: boolean, isBvSupervisor?: boolean, isBvFacilitator?: boolean, isBvSubFacilitator?: boolean, email?: string, segment?: string): string {
  const emailLower = (email || '').toLowerCase();
  const isFolk = segment === 'FOLK' || emailLower.includes('gaurmandal') || emailLower.includes('folk.org') || emailLower.includes('superguide');
  if (role === 'Super Admin' || role === 'SUPER_ADMIN' || role === 'Admin' || role === 'ADMIN') {
    return isFolk ? '/folk-guide/dashboard' : '/pw-admin/dashboard';
  }
  if (role === 'Super Guide' || role === 'SUPER_GUIDE') return '/folk-guide/dashboard';
  // BV role flags take priority over base role for Guide-level users
  if (isBvSupervisor) return '/bv-supervisor/dashboard';
  if (isBvSubFacilitator) return '/rgsf/dashboard';
  if (role === 'Guide' || role === 'GUIDE') return '/folk-guide/dashboard';
  if (role === 'BVSL') return '/bvsl/dashboard';
  if (role === 'Sadhana Mentor') return '/mentor/dashboard';
  if (isBvsl || isBvFacilitator) return '/bvsl/dashboard';
  if (isSadhanaMentor) return '/mentor/dashboard';
  return '/user/dashboard';
}

export function normalizeRole(r: string): string {
  const m: Record<string, string> = {
    'User': 'USER', 'Guide': 'GUIDE', 'Super Guide': 'SUPER_GUIDE', 'Super Admin': 'SUPER_ADMIN',
    'BVSL': 'BVSL', 'Sadhana Mentor': 'SADHANA_MENTOR', 'BVSL Mentor': 'BVSL_MENTOR',
  };
  return m[r] ?? r.toUpperCase().replace(/ /g, '_');
}

export function normalizeStatus(s: string): string {
  const m: Record<string, string> = {
    'Pending Approval': 'PENDING_APPROVAL', 'Active': 'ACTIVE', 'Rejected': 'REJECTED', 'Inactive': 'INACTIVE',
  };
  return m[s] ?? s.toUpperCase().replace(/ /g, '_');
}

/**
 * EMAIL FALLBACK: When user-sync creates a bare record (no userId/status) due to
 * email case mismatch (Google returns lowercase, registration stored mixed case),
 * find the real profile by email (case-insensitive) and merge it into the
 * user-sync record so login works correctly.
 */
async function findAndMergeRealProfile(
  syncRecordId: string,
  authEmail: string,
): Promise<any | null> {
  const emailLower = authEmail.toLowerCase();

  // Search all records by email (case-insensitive via lowercase comparison)
  const { records } = await Users.findAll({
    fields: ['id', 'userId', 'fullName', 'phone', 'email', 'role', 'status',
      'guide', 'residency', 'residencyClaimed', 'residencyApproved', 'residencyJoinDate',
      'ashrayLevel', 'isBvsl', 'isSadhanaMentor', 'createdAt', 'currentStreak',
      'lastStreakUpdatedAt', 'bvServiceAllocated', 'isBvMember'],
    limit: 100,
  });

  const realProfile = records.find(r =>
    r.id !== syncRecordId &&
    r.userId &&
    r.status &&
    (r.email || '').toLowerCase() === emailLower,
  );

  if (!realProfile) return null;

  // Merge: copy all real profile fields into the user-sync record so auth works correctly.
  // The user-sync record is permanently linked to this user's auth session.
  // Always normalize email to lowercase to prevent future case-mismatch duplicates.
  await Users.update({
    id: syncRecordId,
    record: {
      userId: realProfile.userId,
      fullName: realProfile.fullName || '',
      phone: realProfile.phone || '',
      email: (realProfile.email || authEmail).toLowerCase(),
      guide: Array.isArray(realProfile.guide) ? realProfile.guide[0] : (realProfile.guide || undefined),
      residency: Array.isArray(realProfile.residency) ? realProfile.residency[0] : (realProfile.residency || undefined),
      role: realProfile.role || 'User',
      status: realProfile.status,
      residencyClaimed: realProfile.residencyClaimed ?? false,
      residencyApproved: realProfile.residencyApproved ?? false,
      residencyJoinDate: realProfile.residencyJoinDate || undefined,
      ashrayLevel: realProfile.ashrayLevel || undefined,
      isBvsl: realProfile.isBvsl ?? false,
      isBvMember: realProfile.isBvMember ?? false,
      isSadhanaMentor: realProfile.isSadhanaMentor ?? false,
      createdAt: realProfile.createdAt || new Date().toISOString(),
      currentStreak: realProfile.currentStreak ?? 0,
      bvServiceAllocated: realProfile.bvServiceAllocated ?? false,
      lastLoginAt: new Date().toISOString(),
    },
  });

  // Delete all old duplicate records (same email, different record ID, not the sync record).
  // These are stale copies left from previous case-mismatch logins — safe to remove now
  // that the sync record has been updated with the real profile data.
  const duplicatesToDelete = records.filter(r =>
    r.id !== syncRecordId &&
    (r.email || '').toLowerCase() === emailLower,
  );
  for (const dup of duplicatesToDelete) {
    await Users.delete({ id: dup.id }).catch(() => {/* ignore individual delete errors */});
  }

  return realProfile;
}

export default createEndpoint({
  description: 'Resolve user login — O(1) direct lookup via user sync record ID, with email fallback for case-mismatch duplicates',
  authenticated: true,
  inputSchema: z.object({ email: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context }: any) => {
    if (!context.user) throw new Error('Unauthorized');
    const now = new Date().toISOString();
    const userEmail = (context.user.email || '').toLowerCase();

    // Auto-bootstrap/seed the first user as Super Guide if the Users table in Firestore is empty
    const { records: existingUsers } = await Users.findAll({ limit: 1 });
    if (existingUsers.length === 0) {
      const generatedUserId = 'GUIDE-ADMIN';
      await Users.create({
        record: {
          id: context.user.id,
          userId: generatedUserId,
          fullName: 'Initial Administrator',
          email: context.user.email,
          role: 'Super Guide',
          status: 'Active',
          createdAt: now,
          lastLoginAt: now
        }
      });
      
      await Guides.create({
        record: {
          id: 'GUIDE-ADMIN-GUIDE',
          abbreviation: 'ADM',
          email: context.user.email,
          fullName: 'Initial Administrator',
          guideId: generatedUserId,
          isActive: true
        }
      });
    }

    // Direct lookup — no full table scan needed with App DB user sync
    let userRecord = await Users.findOne({ id: context.user.id });

    // Fallback lookup by email if not found by ID
    if (!userRecord && context.user.email) {
      userRecord = await Users.findOne({ filters: { email: context.user.email } }) ||
                 await Users.findOne({ filters: { email: context.user.email.toLowerCase() } });
    }

    // Auto-seed default mock users in database if not found (dev only)
    const isMockAuthEnabled = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === 'true';
    if (context.user.email && isMockAuthEnabled) {
      const emailLower = context.user.email.toLowerCase();
      const defaults: Record<string, any> = {
        'hrvd@hkmmumbai.org': { userId: 'USER-SUPERADMIN-PW', fullName: 'Hiranyavarna Das (PW Super Admin)', email: 'hrvd@hkmmumbai.org', role: 'Super Admin', isBvSuperAdmin: true, isBvAdmin: true, status: 'Active', segment: 'PW' },
        'srilaprabhupadaworld@gmail.com': { userId: 'USER-SUPERADMIN-PW-2', fullName: 'Hiranyavarna Das (PW)', email: 'srilaprabhupadaworld@gmail.com', role: 'Super Admin', isBvSuperAdmin: true, isBvAdmin: true, status: 'Active', segment: 'PW' },
        'gaurmandal@folk.org': { userId: 'USER-SUPERADMIN-FOLK', fullName: 'Gaurmandal Das (FOLK Super Admin)', email: 'gaurmandal@folk.org', role: 'Super Admin', isBvSuperAdmin: true, isBvAdmin: true, status: 'Active', segment: 'FOLK' },
        'gaurmandal@hkmmumbai.org': { userId: 'USER-SUPERADMIN-FOLK-2', fullName: 'Gaurmandal Das (FOLK)', email: 'gaurmandal@hkmmumbai.org', role: 'Super Admin', isBvSuperAdmin: true, isBvAdmin: true, status: 'Active', segment: 'FOLK' },
        'superguide@gmail.com': { userId: 'GUIDE-SUPER-001', fullName: 'Super Guide Admin (FOLK)', email: 'superguide@gmail.com', role: 'Super Guide', isBvSuperAdmin: true, isBvAdmin: true, status: 'Active', segment: 'FOLK' },
        'admin@prabhupadaworld.org': { userId: 'GUIDE-ADMIN-001', fullName: 'PW System Administrator', email: 'admin@prabhupadaworld.org', role: 'Admin', isBvAdmin: true, status: 'Active', segment: 'PW' },
        'folkadmin@folk.org': { userId: 'GUIDE-ADMIN-FOLK', fullName: 'FOLK System Administrator', email: 'folkadmin@folk.org', role: 'Admin', isBvAdmin: true, status: 'Active', segment: 'FOLK' },
        'guide@gmail.com': { userId: 'GUIDE-001', fullName: 'Spiritual Guide (FOLK)', email: 'guide@gmail.com', role: 'Guide', status: 'Active', segment: 'FOLK' },
        'bvsupervisor@gmail.com': { userId: 'SUPERVISOR-001', fullName: 'PW BV Supervisor', email: 'bvsupervisor@gmail.com', role: 'Guide', isBvSupervisor: true, status: 'Active', segment: 'PW' },
        'folksupervisor@folk.org': { userId: 'SUPERVISOR-FOLK', fullName: 'FOLK BV Supervisor', email: 'folksupervisor@folk.org', role: 'Guide', isBvSupervisor: true, status: 'Active', segment: 'FOLK' },
        'rgf@gmail.com': { userId: 'RGF-001', fullName: 'Reading Group Facilitator (PW RGF)', email: 'rgf@gmail.com', role: 'User', isBvsl: true, isBvFacilitator: true, status: 'Active', segment: 'PW' },
        'rgsf@gmail.com': { userId: 'RGSF-001', fullName: 'Sub-Facilitator (PW RGSF)', email: 'rgsf@gmail.com', role: 'User', isBvSubFacilitator: true, status: 'Active', segment: 'PW' },
        'sadhanamentor@gmail.com': { userId: 'MENTOR-001', fullName: 'Sadhana Mentor', email: 'sadhanamentor@gmail.com', role: 'User', isSadhanaMentor: true, isBvMentor: false, status: 'Active', segment: 'PW' },
        'devotee@gmail.com': { userId: 'USER-001', fullName: 'Regular Devotee', email: 'devotee@gmail.com', role: 'User', status: 'Active', segment: 'PW' },
        'folkresident@folk.org': { userId: 'FOLK-RESIDENT-001', fullName: 'FOLK Resident Devotee', email: 'folkresident@folk.org', role: 'User', status: 'Active', segment: 'FOLK', residencyApproved: true, residencyClaimed: true, residency: ['FOLK-RESIDENCY-001'], residencyJoinDate: '2023-01-01', ashrayLevel: 'Upasaka' },
        'folknonresident@folk.org': { userId: 'FOLK-NONRES-001', fullName: 'FOLK Non-Resident Devotee', email: 'folknonresident@folk.org', role: 'User', status: 'Active', segment: 'FOLK', residencyApproved: false, residencyClaimed: false, residency: null, ashrayLevel: 'Upasaka' },
        'pwdevotee@prabhupadaworld.org': { userId: 'PW-DEVOTEE-001', fullName: 'Prabhupada World Devotee', email: 'pwdevotee@prabhupadaworld.org', role: 'User', status: 'Active', segment: 'PW', isPrabhupadaWorldUser: true, residencyApproved: false, residencyClaimed: false, residency: null, ashrayLevel: 'Upasaka' },
        'pwuser@prabhupadaworld.org': { userId: 'PW-DEVOTEE-001', fullName: 'Prabhupada World Devotee', email: 'pwuser@prabhupadaworld.org', role: 'User', status: 'Active', segment: 'PW', isPrabhupadaWorldUser: true, residencyApproved: false, residencyClaimed: false, residency: null, ashrayLevel: 'Upasaka' },
      };

      const matched = defaults[emailLower];
      if (matched) {
        if (!userRecord) {
          userRecord = await Users.create({
            record: {
              ...matched,
              id: context.user.id,
              createdAt: now,
              lastLoginAt: now,
            }
          }).catch(() => null);
        } else {
          // Force update the DB fields to match mock default values (for local testing consistency)
          await Users.update({
            id: userRecord.id || context.user.id,
            record: {
              ...matched,
              lastLoginAt: now,
            }
          }).catch(() => {});
          userRecord = { ...userRecord, ...matched };
        }
        if (!userRecord) {
          userRecord = { ...matched, id: context.user.id };
        }
        // Invalidate profile cache so fresh login gets latest profile
        serverCacheInvalidate(`user_profile:${context.user.id}`);
        serverCacheInvalidate(`sadhana_fields:`);
      }
    }

    // Auto-heal missing userId/status if record exists
    if (userRecord && (userRecord.status || userRecord.role || userRecord.email)) {
      if (!userRecord.userId) {
        userRecord.userId = userRecord.id || `USER-${context.user.id.slice(0, 8)}`;
      }
      if (!userRecord.status) {
        userRecord.status = 'Active';
      }
      await Users.update({
        id: userRecord.id || context.user.id,
        record: { userId: userRecord.userId, status: userRecord.status },
      }).catch(() => {});
    }

    if (!userRecord?.status || !userRecord?.userId) {
      // ── EMAIL FALLBACK ────────────────────────────────────────────────────
      // User-sync created a bare record (no userId/status). This happens when:
      //   1. User sync is enabled after registration (old records have different email case)
      //   2. Google returns lowercase email but registration stored mixed-case
      // Try to find the real profile by email (case-insensitive) and merge it.
      const authEmail = context.user.email;
      if (authEmail) {
        const real = await findAndMergeRealProfile(context.user.id, authEmail);
        if (real) {
          // Successfully merged — continue login with the real profile data
          const status = real.status;
          let route = '/pending';
          if (status === 'Rejected') route = '/rejected';
          else if (status === 'Inactive') route = '/inactive';
          else if (status === 'Active') route = roleToRoute(real.role || 'User', real.isBvsl, real.isSadhanaMentor, real.isBvSupervisor || real.isBvMentor, real.isBvFacilitator || real.isBvsl, real.isBvSubFacilitator, real.email || authEmail, real.segment);

          return {
            action: 'route',
            route,
            user: {
              userId: real.userId,
              fullName: real.fullName || '',
              role: normalizeRole(real.role || 'User'),
              status: normalizeStatus(status),
              phone: real.phone || '',
              email: real.email || authEmail,
              selectedGuideId: Array.isArray(real.guide) ? real.guide[0] : (real.guide || null),
              selectedFolkResidency: Array.isArray(real.residency) ? real.residency[0] : (real.residency || null),
              residencyUserClaim: real.residencyClaimed || false,
              residencyGuideVerified: real.residencyApproved || false,
              createdAt: real.createdAt || now,
              lastLoginAt: now,
              rowId: 0,
              ashrayLevel: real.ashrayLevel || null,
              residencyName: null,
              guideName: null,
              isBvsl: real.isBvsl || false,
              isSadhanaMentor: real.isSadhanaMentor || false,
              isBvMentor: real.isBvMentor || false,
            },
          };
        }
      }

      // No matching profile found — check if this is a guide email
      const guide = await Guides.findOne({
        filters: { email: context.user.email },
      });
      if (guide && guide.isActive !== false) return { action: 'guide_email_detected' };
      return { action: 'register' };
    }

    // ── Self-healing: detect and fix duplicate userId ─────────────────────────
    const currentUserId = String(userRecord.userId);
    const { records: sameIdRecords } = await Users.findAll({
      filters: { userId: currentUserId } as any,
      fields: ['id', 'userId'],
    });

    if (sameIdRecords.length > 1) {
      const isEarliestDoc = sameIdRecords
        .map(r => r.id)
        .sort()[0] === context.user.id;

      if (!isEarliestDoc) {
        const timestamp = Date.now().toString(36);
        const uniqueId = `USER-${timestamp.toUpperCase()}`;
        await Users.update({
          id: context.user.id,
          record: { userId: uniqueId },
        });
        userRecord.userId = uniqueId;
      }
    }

    // Update last login (non-blocking)
    await Users.update({ id: context.user.id, record: { lastLoginAt: now } }).catch(() => {});

    // Determine route based on status and role
    const status = userRecord.status;
    let route = '/pending';
    if (status === 'Rejected') {
      route = '/rejected';
    } else if (status === 'Inactive') {
      route = '/inactive';
    } else if (status === 'Active') {
      route = roleToRoute(userRecord.role || 'User', userRecord.isBvsl, userRecord.isSadhanaMentor, userRecord.isBvSupervisor || userRecord.isBvMentor, userRecord.isBvFacilitator || userRecord.isBvsl, userRecord.isBvSubFacilitator, userRecord.email, userRecord.segment);
    }

    return {
      action: 'route',
      route,
      user: {
        userId: userRecord.userId,
        fullName: userRecord.fullName || '',
        role: normalizeRole(userRecord.role || 'User'),
        status: normalizeStatus(status),
        phone: userRecord.phone || '',
        email: userRecord.email || context.user.email,
        selectedGuideId: Array.isArray(userRecord.guide) ? userRecord.guide[0] : (userRecord.guide || null),
        selectedFolkResidency: Array.isArray(userRecord.residency) ? userRecord.residency[0] : (userRecord.residency || null),
        residencyUserClaim: userRecord.residencyClaimed || false,
        residencyGuideVerified: userRecord.residencyApproved || false,
        createdAt: userRecord.createdAt || now,
        lastLoginAt: now,
        rowId: 0,
        ashrayLevel: userRecord.ashrayLevel || null,
        residencyName: null,
        guideName: null,
        isBvsl: userRecord.isBvsl || false,
        isSadhanaMentor: userRecord.isSadhanaMentor || false,
        isBvMentor: userRecord.isBvMentor || false,
        isBvSuperAdmin: !!(
          userRecord.isBvSuperAdmin ||
          (userEmail || '').toLowerCase() === 'srilaprabhupadaworld@gmail.com' ||
          (userEmail || '').toLowerCase() === 'hrvd@hkmmumbai.org' ||
          (userEmail || '').toLowerCase().includes('gaurmandal') ||
          (userEmail || '').toLowerCase().includes('folk.org') ||
          userRecord.role === 'Super Guide' ||
          userRecord.role === 'SUPER_GUIDE' ||
          (userEmail || '').includes('superadmin')
        ),
        isBvAdmin: !!(
          userRecord.isBvAdmin ||
          userRecord.isBvSuperAdmin ||
          (userEmail || '').toLowerCase() === 'srilaprabhupadaworld@gmail.com' ||
          (userEmail || '').toLowerCase() === 'hrvd@hkmmumbai.org' ||
          (userEmail || '').toLowerCase().includes('gaurmandal') ||
          userRecord.role === 'Super Guide' ||
          userRecord.role === 'SUPER_GUIDE' ||
          userRecord.role === 'Guide' ||
          userRecord.role === 'GUIDE'
        ),
        isBvSupervisor: !!(userRecord.isBvSupervisor || userRecord.isBvMentor),
        isBvFacilitator: !!(userRecord.isBvFacilitator || userRecord.isBvsl),
        isBvSubFacilitator: !!(userRecord.isBvSubFacilitator),
        isBvMember: userRecord.isBvMember || false,
        segment: (userEmail || '').toLowerCase().includes('gaurmandal') || (userEmail || '').toLowerCase().includes('folk.org') ? 'FOLK' : (userRecord.segment || 'PW'),
      },
    };
  },
});
