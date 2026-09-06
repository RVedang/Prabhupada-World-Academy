import assert from 'node:assert/strict';
import test from 'node:test';
import { getBvGroupAssignmentOptions, isBvGroupActive } from '../src/lib/bvGroupAssignment';

const groups = [
  { id: 'krishna', groupName: 'Krishna', segment: 'FOLK', meetingTime: '8:30 PM – 9:00 PM (Monday to Friday)', isActive: false },
  { id: 'radha', groupName: 'radha', segment: 'FOLK', meetingTime: '1:00 PM – 1:30 PM (Monday to Friday)', isActive: true },
  { id: 'aas', groupName: 'aas', segment: 'FOLK', meetingTime: '1:00 PM – 1:30 PM (Monday to Friday)', isActive: true },
];

test('show-all group assignment options include inactive groups without making them selectable', () => {
  const options = getBvGroupAssignmentOptions(groups, {
    segment: 'FOLK',
    timePreference: '7:45 PM – 8:15 PM (Everyday)',
    showAllGroups: true,
  });

  assert.deepEqual(options.map(group => group.id), ['krishna', 'radha', 'aas']);
  assert.equal(isBvGroupActive(options[0]), false);
  assert.equal(isBvGroupActive(options[1]), true);
});

test('initial assignment options remain limited to active time-matched groups', () => {
  const options = getBvGroupAssignmentOptions(groups, {
    segment: 'FOLK',
    timePreference: '1:00 PM – 1:30 PM (Monday to Friday)',
    showAllGroups: false,
  });

  assert.deepEqual(options.map(group => group.id), ['radha', 'aas']);
});
