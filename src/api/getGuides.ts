import { z } from 'zod';
import { createEndpoint, Guides } from 'zite-integrations-backend-sdk';
import { serverCacheGetOrFetch } from '../lib/serverCache';

const CACHE_KEY = 'ref:guides_v2';
const TTL = 60 * 60 * 1000; // 1 hour — guides change very rarely

// Prabhupada World mentor — always present; not stored in Guides table
const PW_MENTOR = {
  guideId: 'MENTOR-PW-HIRANYAVARNA',
  name: 'Hiranyavarna Das',
  abbr: 'HVD',
  email: 'hiranyavarna@prabhupadaworld.org',
  isPrabhupadaWorldMentor: true,
};

const DEFAULT_FOLK_GUIDES = [
  { guideId: 'GUIDE-VEDANG', name: 'Vedang Prabhu', abbr: 'VED', email: 'vedang.adgokar@gmail.com', isPrabhupadaWorldMentor: false },
  { guideId: 'GUIDE-VDND', name: 'Vedanarayana Das', abbr: 'VND', email: 'vdnd@hkmmumbai.org', isPrabhupadaWorldMentor: false },
  { guideId: 'GUIDE-001', name: 'Spiritual Guide', abbr: 'SG', email: 'guide@gmail.com', isPrabhupadaWorldMentor: false },
];

export default createEndpoint({
  description: 'Get all active guides for registration / forms (server-cached 1h)',
  inputSchema: z.object({}),
  outputSchema: z.object({
    guides: z.array(z.object({
      guideId: z.string(),
      name: z.string(),
      abbr: z.string(),
      email: z.string().optional(),
      isPrabhupadaWorldMentor: z.boolean().optional(),
    })),
  }),
  execute: async () => {
    const guides = await serverCacheGetOrFetch(CACHE_KEY, async () => {
      const { records } = await Guides.findAll({ filters: { isActive: true }, limit: 500 });
      const SYSTEM_GUIDE_IDS = ['GUIDE-000', 'GUIDE-SUPER-PWA-GUIDE', 'GUIDE-001', 'GUIDE-ADMIN-001'];
      const folkGuides = records
        .filter(g => !SYSTEM_GUIDE_IDS.includes(g.guideId || g.id))
        .map(g => ({
          guideId: g.id || g.guideId,
          name: g.fullName || g.name || '',
          abbr: g.abbreviation || g.abbr || (g.fullName || '').slice(0, 3).toUpperCase(),
          email: g.email || '',
          isPrabhupadaWorldMentor: false,
        }));
      const listToReturn = folkGuides.length > 0 ? folkGuides : DEFAULT_FOLK_GUIDES;
      return [PW_MENTOR, ...listToReturn];
    }, TTL);

    return { guides };
  },
});

