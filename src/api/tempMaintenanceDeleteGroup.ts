import { createEndpoint, BvGroups, BvGroupMembers, BvAttendance } from '@/lib/backend-sdk';

export default createEndpoint({
  description: 'One-off endpoint to find and delete the empty FGuide Group',
  public: true,
  execute: async () => {
    const groupsRes = await BvGroups.findAll({ limit: 1000 });
    const fguideGroups = groupsRes.records.filter(
      (g: any) => String(g.groupName || g.name || '').toLowerCase() === 'fguide group'
    );

    const log: string[] = [];
    log.push(`Found ${fguideGroups.length} groups named "FGuide Group"`);

    for (const g of fguideGroups) {
      const membersRes = await BvGroupMembers.findAll({ filters: { group: g.id } });
      const attendanceRes = await BvAttendance.findAll({ filters: { group: g.id } });

      log.push(`- Group ID: ${g.id}, Members: ${membersRes.records.length}, Sessions: ${attendanceRes.records.length}`);

      if (membersRes.records.length === 0 && attendanceRes.records.length === 0) {
        log.push(`  -> Deleting group ID: ${g.id}...`);
        const deleted = await BvGroups.delete({ id: g.id });
        log.push(`  -> Deleted result: ${JSON.stringify(deleted)}`);
      } else {
        log.push(`  -> Keeping this group.`);
      }
    }

    return { log };
  },
});
