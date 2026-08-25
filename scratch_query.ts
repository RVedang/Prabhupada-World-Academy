import getBvslGroups from './src/api/getBvslGroups';
import { adminDb } from './src/lib/backend-sdk';

async function run() {
  const result = await getBvslGroups.execute({ input: { bvslId: 'ALL' }, context: { user: { id: 'GUIDE-VEDANG' } } as any });
  console.log(result.groups.map(g => ({ name: g.groupName, segment: g.segment })));
}

run().catch(console.error);
