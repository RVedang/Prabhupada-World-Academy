export type BvPreachingAggregate = {
  callingTime: number;
  oneOnOneTime: number;
  bookDistTime: number;
  rduaTime: number;
  planTime: number;
  booksDistributed: number;
  contactsCollected: number;
  uniqueOneOnOnes: number;
  totalMinutes: number;
};

const DURATION_KEYS: Array<keyof BvPreachingAggregate> = [
  'callingTime', 'oneOnOneTime', 'bookDistTime', 'rduaTime', 'planTime', 'totalMinutes',
];

export function getBvPreachingDisplayAggregate(
  totals: BvPreachingAggregate,
  submittedCount: number,
  viewMode: 'totals' | 'avgs',
): BvPreachingAggregate {
  if (viewMode === 'totals') return totals;
  if (submittedCount <= 0) {
    return Object.fromEntries(Object.keys(totals).map(key => [key, 0])) as BvPreachingAggregate;
  }

  return Object.fromEntries(
    Object.entries(totals).map(([key, rawValue]) => {
      const average = Number(rawValue || 0) / submittedCount;
      const value = DURATION_KEYS.includes(key as keyof BvPreachingAggregate)
        ? Math.round(average)
        : Math.round(average * 10) / 10;
      return [key, value];
    }),
  ) as BvPreachingAggregate;
}
