export type BvGroupAssignmentCandidate = {
  id?: string;
  groupId?: string;
  segment?: string | null;
  meetingTime?: string | null;
  isActive?: boolean | null;
};

const normalizeSegment = (value: unknown): 'PW' | 'FOLK' | undefined => {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (normalized === 'FOLK') return 'FOLK';
  if (normalized === 'PW' || normalized === 'PRABHUPADAWORLD') return 'PW';
  return undefined;
};

const normalizeTimeSlot = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

export const isBvGroupActive = (group: BvGroupAssignmentCandidate) => group.isActive !== false;

export const isBvGroupTimeMatch = (preference: string | undefined, groupTime: string | null | undefined) => {
  if (!preference || preference.toLowerCase() === 'flexible' || preference.toLowerCase() === 'none') return true;
  if (!groupTime) return false;

  const cleanPreference = normalizeTimeSlot(preference);
  const cleanGroupTime = normalizeTimeSlot(groupTime);
  if (cleanGroupTime === cleanPreference || cleanPreference.includes(cleanGroupTime) || cleanGroupTime.includes(cleanPreference)) return true;

  const extractTimes = (value: string) => {
    const matches = value.match(/\d{1,4}[ap]m/gi);
    return matches ? matches.map(match => match.toLowerCase()).join('') : value.replace(/everyday|weekdays|weekends|daily|days/gi, '');
  };

  const preferredTimes = extractTimes(cleanPreference);
  const groupTimes = extractTimes(cleanGroupTime);
  return !!preferredTimes && !!groupTimes && (
    preferredTimes === groupTimes || preferredTimes.includes(groupTimes) || groupTimes.includes(preferredTimes)
  );
};

/**
 * The regular approval view starts with active, time-matched groups.  "Show
 * all groups" deliberately includes inactive groups too, so an administrator
 * can see the complete group list and why a group cannot be selected.  The UI
 * must keep inactive options disabled and the mutation enforces that rule.
 */
export const getBvGroupAssignmentOptions = <T extends BvGroupAssignmentCandidate>(
  groups: T[],
  options: { segment?: string; timePreference?: string; showAllGroups: boolean },
): T[] => {
  const targetSegment = normalizeSegment(options.segment);
  const departmentGroups = targetSegment
    ? groups.filter(group => {
        const groupSegment = normalizeSegment(group.segment);
        return !groupSegment || groupSegment === targetSegment;
      })
    : groups;

  if (options.showAllGroups) return departmentGroups;

  return departmentGroups.filter(group =>
    isBvGroupActive(group) && isBvGroupTimeMatch(options.timePreference, group.meetingTime),
  );
};
