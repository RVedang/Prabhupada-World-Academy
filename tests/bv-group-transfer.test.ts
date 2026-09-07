import assert from 'node:assert/strict';
import test from 'node:test';

import transferBvGroupMember from '../src/api/transferBvGroupMember';
import { BvGroupMembers, BvGroups, Users } from '../src/lib/app-backend-sdk';

test('moving a BV member replaces old memberships and synchronizes their profile', async () => {
  const facilitator = {
    id: 'BV-TRANSFER-RGF-DOC',
    userId: 'BV-TRANSFER-RGF',
    fullName: 'Transfer RGF',
    status: 'Active',
    segment: 'PW',
    isBvFacilitator: true,
    bvReportingSupervisorId: 'BV-TRANSFER-SUPERVISOR',
  };
  const member = {
    id: 'BV-TRANSFER-MEMBER-DOC',
    userId: 'BV-TRANSFER-MEMBER',
    email: 'bv-transfer-member@example.invalid',
    fullName: 'Transfer Member',
    status: 'Active',
    segment: 'PW',
    isBvMember: true,
    bvGroupId: 'BV-TRANSFER-OLD-GROUP-DOC',
  };
  const oldGroup = { id: 'BV-TRANSFER-OLD-GROUP-DOC', groupId: 'BV-TRANSFER-OLD-GROUP', groupName: 'Old Group', segment: 'PW', isActive: true };
  const newGroup = { id: 'BV-TRANSFER-NEW-GROUP-DOC', groupId: 'BV-TRANSFER-NEW-GROUP', groupName: 'New Group', segment: 'PW', isActive: true, bvslLeader: facilitator.id };
  const oldMembershipId = 'BV-TRANSFER-OLD-MEMBERSHIP';
  const newMembershipId = `BVMEM-${member.id}-${newGroup.id}`;

  try {
    await Users.create({ record: facilitator });
    await Users.create({ record: member });
    await BvGroups.create({ record: oldGroup });
    await BvGroups.create({ record: newGroup });
    await BvGroupMembers.create({
      record: { id: oldMembershipId, group: oldGroup.groupId, memberId: member.email, role: 'Member' },
    });

    const result = await transferBvGroupMember.execute({
      input: { userId: member.userId, groupId: newGroup.groupId },
      context: { user: { id: 'BV-TRANSFER-ADMIN' } },
    } as never);

    assert.equal(result.success, true);
    assert.equal(result.groupName, newGroup.groupName);
    assert.equal(await BvGroupMembers.findOne({ id: oldMembershipId }), undefined);
    assert.ok(await BvGroupMembers.findOne({ id: newMembershipId }));

    const updatedMember = await Users.findOne({ id: member.id });
    assert.equal(updatedMember?.bvGroupId, newGroup.id);
    assert.equal(updatedMember?.bvGroupName, newGroup.groupName);
    assert.equal(updatedMember?.bvReportingFacilitatorId, facilitator.userId);
  } finally {
    await BvGroupMembers.delete({ id: oldMembershipId }).catch(() => undefined);
    await BvGroupMembers.delete({ id: newMembershipId }).catch(() => undefined);
    await BvGroups.delete({ id: oldGroup.id }).catch(() => undefined);
    await BvGroups.delete({ id: newGroup.id }).catch(() => undefined);
    await Users.delete({ id: member.id }).catch(() => undefined);
    await Users.delete({ id: facilitator.id }).catch(() => undefined);
  }
});
