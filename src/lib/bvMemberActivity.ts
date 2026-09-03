/**
 * Normalise the Bhakti Vriksha activity that regular members submit through
 * the Sadhana form into the field names used by the BV reporting views.
 *
 * Facilitator reports live in BvslPreachingEntries and contain a detailed
 * breakdown (calling, 1:1, RDUA, and so on). Regular members do not write to
 * that collection: their available BV fields are preachingMinutes and
 * booksDistributed on SadhanaEntries, with fieldValuesJson retained as a
 * compatibility fallback for older entries.
 */
export interface MemberBvActivity extends Record<string, unknown> {
  totalPreachingMinutes: number;
  prBooksDistributed: number;
}

export function normaliseMemberBvActivity(entry: Record<string, unknown>): MemberBvActivity {
  let fieldValues: Record<string, unknown> = {};
  try {
    fieldValues = typeof entry?.fieldValuesJson === 'string'
      ? JSON.parse(entry.fieldValuesJson || '{}')
      : (entry?.fieldValuesJson || {});
  } catch {
    fieldValues = {};
  }

  const firstNumber = (...values: unknown[]): number => {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };

  return {
    ...entry,
    totalPreachingMinutes: firstNumber(
      entry?.preachingMinutes,
      fieldValues.preaching_raw,
      fieldValues.preaching_minutes,
    ),
    prBooksDistributed: firstNumber(
      entry?.booksDistributed,
      fieldValues.distribution_raw,
      fieldValues.books_distributed,
    ),
  };
}
