import { Users } from '@/lib/backend-sdk';

async function run() {
  const { records } = await Users.findAll({ limit: 100 });
  const sorted = records.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  console.log(sorted.slice(0, 10).map(u => ({
    id: u.id,
    userId: u.userId,
    fullName: u.fullName,
    email: u.email,
    createdAt: u.createdAt,
  })));
}

run().catch(console.error);
