import { z } from 'zod';
import { createEndpoint, FolkResidencies } from '@/lib/backend-sdk';
import { serverCacheGetOrFetch } from '../lib/serverCache';

const CACHE_KEY = 'ref:residencies_v3';
const TTL = 60 * 60 * 1000; // 1 hour — residencies change very rarely

const DEFAULT_RESIDENCIES = [
  { residencyId: 'FOLK-MUMBAI', residencyName: 'HKM Mumbai FOLK Center' },
  { residencyId: 'FOLK-JUHU', residencyName: 'Juhu FOLK Center' },
  { residencyId: 'FOLK-VRV', residencyName: 'VRV Hostel' },
  { residencyId: 'FOLK-MAIN', residencyName: 'Main Center' },
];

export default createEndpoint({
  description: 'Get all active folk residencies (server-cached 1h)',
  inputSchema: z.object({
    segment: z.enum(['PW', 'FOLK']).optional(),
  }),
  outputSchema: z.array(z.object({
    residencyId: z.string(),
    residencyName: z.string(),
  })),
  execute: async ({ input }: any) => {
    const list = await serverCacheGetOrFetch(CACHE_KEY, async () => {
      const { records } = await FolkResidencies.findAll({ limit: 200 });
      const activeResidencies = records
        .filter(r => r.isActive !== false && r.isActive !== 'false')
        .map(r => ({
          residencyId: r.id || r.residencyId,
          residencyName: r.residencyName || r.name || '',
        }));
      return activeResidencies.length > 0 ? activeResidencies : DEFAULT_RESIDENCIES;
    }, TTL);

    return list.filter((r: any) => !r.residencyName.includes('Prabhupada World') && !r.residencyName.includes('PW'));
  },
});
