import { BvGroups, BvGroupMembers, BvAttendance } from '../src/lib/app-backend-sdk';

async function main() {
  const groupsRes = await BvGroups.findAll({ limit: 1000 });
  const fguideGroups = groupsRes.records.filter(
    (g: any) => String(g.groupName || g.name || '').toLowerCase() === 'fguide group'
  );

  console.log(`Found ${fguideGroups.length} groups named "FGuide Group":`);

  for (const g of fguideGroups) {
    const membersRes = await BvGroupMembers.findAll({ filters: { group: g.id } });
    const attendanceRes = await BvAttendance.findAll({ filters: { group: g.id } });

    console.log(`- Group ID: ${g.id}`);
    console.log(`  Name: ${g.groupName}`);
    console.log(`  Members: ${membersRes.records.length}`);
    console.log(`  Sessions (Attendance records): ${attendanceRes.records.length}`);

    if (membersRes.records.length === 0 && attendanceRes.records.length === 0) {
      console.log(`  -> Deleting group ID: ${g.id}...`);
      const deleted = await BvGroups.delete({ id: g.id });
      console.log(`  -> Deleted result:`, deleted);
    } else {
      console.log(`  -> Keeping this group.`);
    }
  }
}

main().catch(console.error);
