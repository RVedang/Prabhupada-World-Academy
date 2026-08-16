import { z } from 'zod';
import { createEndpoint, Guides, Users } from '@/lib/backend-sdk';
import { serverCacheGetOrFetch } from '../lib/serverCache';

function formatGuideName(fullName: string | null | undefined, email: string | null | undefined): string {
  const name = (fullName || '').trim();
  if (name && !name.includes('@') && name.toLowerCase() !== 'null' && name.toLowerCase() !== 'undefined') {
    return name;
  }
  if (email && email.trim() !== '') {
    const localPart = email.split('@')[0];
    const cleaned = localPart
      .replace(/[\._\-+0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) {
      return cleaned
        .split(' ')
        .map(w => {
          const lower = w.toLowerCase();
          if (lower === 'folkadmin') return 'FOLK Admin';
          if (lower === 'guide') return 'Spiritual Guide';
          if (['folk', 'pw', 'bv', 'bvsl'].includes(lower)) return w.toUpperCase();
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(' ');
    }
    return email;
  }
  return 'Unknown Guide';
}

const CACHE_KEY = 'ref:guides_v4';
const TTL = 10 * 1000; // 10 seconds — updates quickly when role changes

// Prabhupada World Mentors
const PW_SUPER_ADMIN = {
  guideId: 'MENTOR-PW-HIRANYAVARNA',
  name: 'Hiranyavarna Das',
  abbr: 'HVD',
  email: 'hrvd@hkmmumbai.org',
  isPrabhupadaWorldMentor: true,
};

// FOLK Super Guide
const FOLK_SUPER_GUIDE = {
  guideId: 'MENTOR-FOLK-GAURMANDAL',
  name: 'Gaurmandal Prabhu (Super Guide)',
  abbr: 'GMP',
  email: 'gaurmandal@folk.org',
  isPrabhupadaWorldMentor: false,
};

const DEFAULT_FOLK_GUIDES = [
  FOLK_SUPER_GUIDE,
  { guideId: 'GUIDE-VEDANG', name: 'Vedang Prabhu', abbr: 'VED', email: 'vedang.adgokar@gmail.com', isPrabhupadaWorldMentor: false },
  { guideId: 'GUIDE-001', name: 'Spiritual Guide', abbr: 'SG', email: 'guide@folk.org', isPrabhupadaWorldMentor: false },
];

export default createEndpoint({
  description: 'Get all active guides for registration / forms (server-cached 10s)',
  inputSchema: z.object({
    segment: z.enum(['PW', 'FOLK', 'ALL']).optional(),
  }),
  outputSchema: z.object({
    guides: z.array(z.object({
      guideId: z.string(),
      name: z.string(),
      abbr: z.string(),
      email: z.string().optional(),
      isPrabhupadaWorldMentor: z.boolean().optional(),
    })),
  }),
  execute: async ({ input, context }: { input: any; context: any }) => {
    const allGuides = await serverCacheGetOrFetch(CACHE_KEY, async () => {
      const [{ records: guideRecords }, { records: userRecords }] = await Promise.all([
        Guides.findAll({ filters: { isActive: true }, limit: 500 }).catch(() => ({ records: [] })),
        Users.findAll({ limit: 1000 }).catch(() => ({ records: [] })),
      ]);

      const SYSTEM_GUIDE_IDS = ['GUIDE-000', 'GUIDE-SUPER-PWA-GUIDE', 'GUIDE-001', 'GUIDE-ADMIN-001'];
      const folkGuidesFromDb = guideRecords
        .filter(g => {
          if (SYSTEM_GUIDE_IDS.includes(g.guideId || g.id)) return false;

          // Cross-reference with Users table to check if they were deleted/modified
          if (g.email) {
            const emailLower = g.email.toLowerCase().trim();
            const correspondingUser = userRecords.find(u => (u.email || '').toLowerCase().trim() === emailLower);
            if (correspondingUser) {
              // If user exists, status must be Active and role must be a guide/admin role
              const roleUpper = (correspondingUser.role || '').toUpperCase();
              const isGuideOrAdmin =
                roleUpper === 'GUIDE' ||
                roleUpper === 'SUPER_GUIDE' ||
                roleUpper === 'ADMIN' ||
                roleUpper === 'SUPER_ADMIN' ||
                correspondingUser.isBvAdmin === true ||
                correspondingUser.isBvSuperAdmin === true;

              if (correspondingUser.status !== 'Active' || !isGuideOrAdmin) {
                return false;
              }
            }
          }
          return true;
        })
        .map(g => ({
          guideId: g.id || g.guideId,
          name: formatGuideName(g.fullName || g.name, g.email),
          abbr: g.abbreviation || g.abbr || (g.fullName || '').slice(0, 3).toUpperCase(),
          email: g.email || '',
          isPrabhupadaWorldMentor: false,
        }));

      // Dynamically fetch FOLK Guides / Supervisors / Admins from Users table
      const dbFolkGuides = userRecords
        .filter(u => {
          const roleUpper = (u.role || '').toUpperCase();
          const segmentUpper = (u.segment || '').toUpperCase();
          const emailLower = (u.email || '').toLowerCase();
          const nameLower = (u.fullName || '').toLowerCase();

          // Filter out demo admin account
          if (emailLower === 'admin@prabhupadaworld.org' || nameLower.includes('pw system administrator')) {
            return false;
          }

          const isPwUser =
            segmentUpper === 'PW' ||
            u.isPrabhupadaWorldUser === true ||
            emailLower.includes('prabhupada') ||
            emailLower === 'hrvd@hkmmumbai.org' ||
            nameLower.includes('hiranya') ||
            nameLower.includes('prabhupada world');

          if (isPwUser) return false;

          const isFolkRole =
            roleUpper === 'GUIDE' ||
            roleUpper === 'SUPER_GUIDE' ||
            roleUpper === 'ADMIN' ||
            roleUpper === 'SUPER_ADMIN' ||
            u.isBvAdmin === true ||
            u.isBvSuperAdmin === true;

          return isFolkRole && u.status === 'Active';
        })
        .map(u => ({
          guideId: u.id || u.userId,
          name: formatGuideName(u.fullName, u.email),
          abbr: (u.fullName || '').slice(0, 3).toUpperCase(),
          email: u.email || '',
          isPrabhupadaWorldMentor: false,
        }));

      const combinedFolk = [...folkGuidesFromDb, ...dbFolkGuides];
      const listToReturn = combinedFolk.length > 0 ? combinedFolk : DEFAULT_FOLK_GUIDES;

      // Dynamically fetch PW Admins from Users table
      const dbPwAdmins = userRecords
        .filter(u => {
          const roleUpper = (u.role || '').toUpperCase();
          const segmentUpper = (u.segment || '').toUpperCase();
          const nameLower = (u.fullName || '').toLowerCase();
          const emailLower = (u.email || '').toLowerCase();
          const isHiranya = emailLower.includes('hrvd@hkmmumbai');
          if (isHiranya) return false;

          // Filter out demo admin account
          if (emailLower === 'admin@prabhupadaworld.org' || nameLower.includes('pw system administrator')) {
            return false;
          }

          return (roleUpper === 'ADMIN' || u.isBvAdmin === true || roleUpper === 'SUPER_ADMIN' || u.isBvSuperAdmin === true) &&
                 (segmentUpper === 'PW' || u.isPrabhupadaWorldUser === true) &&
                 u.status === 'Active';
        })
        .map(u => ({
          guideId: u.id || u.userId,
          name: `${formatGuideName(u.fullName, u.email)} (Admin)`,
          abbr: (u.fullName || '').slice(0, 3).toUpperCase(),
          email: u.email || '',
          isPrabhupadaWorldMentor: true,
        }));

      // Conditionally show PW_SUPER_ADMIN only if active in Users table
      const hasSuperAdminUser = userRecords.some(u => 
        (u.email || '').toLowerCase().trim() === 'hrvd@hkmmumbai.org' && 
        u.status === 'Active' && 
        (u.role === 'Super Admin' || u.isBvSuperAdmin === true)
      );

      const pwList = dedupeGuides([
        ...(hasSuperAdminUser ? [PW_SUPER_ADMIN] : []),
        ...dbPwAdmins
      ]);
      const folkList = dedupeGuides(listToReturn);
      const allList = dedupeGuides([...pwList, ...folkList]);

      return {
        pw: pwList,
        folk: folkList,
        all: allList,
      };
    }, TTL);

    const effectiveSegment = input.segment;

    const sortGuides = (list: any[]) => {
      return [...list].sort((a, b) => {
        const isAPw = !!a.isPrabhupadaWorldMentor;
        const isBPw = !!b.isPrabhupadaWorldMentor;
        if (isAPw && !isBPw) return -1;
        if (!isAPw && isBPw) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
    };

    if (effectiveSegment === 'PW') {
      return { guides: sortGuides(allGuides.pw) };
    } else if (effectiveSegment === 'FOLK') {
      return { guides: sortGuides(allGuides.folk) };
    }

    return { guides: sortGuides(allGuides.all) };
  },
});

function dedupeGuides(list: any[]) {
  const seen = new Set();
  return list.filter(g => {
    const emailKey = (g.email || '').toLowerCase().trim();
    if (!emailKey) return true;
    if (seen.has(emailKey)) return false;
    seen.add(emailKey);
    return true;
  });
}
