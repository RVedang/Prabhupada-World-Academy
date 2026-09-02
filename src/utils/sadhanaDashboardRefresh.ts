export const SADHANA_ENTRY_SAVED_EVENT = 'pwa_sadhana_entry_saved';

const PENDING_KEY = 'pwa_pending_sadhana_entry_saved';

export type SavedSadhanaEntryPayload = {
  userId: string;
  entryId: string;
  entryDate: string;
  totalScore: number;
  maxScore: number;
  scorePercent: number | null;
  flagSick?: boolean;
  flagOs?: boolean;
  submittedAt: string;
};

export function publishSadhanaEntrySaved(payload: SavedSadhanaEntryPayload): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {}
  window.dispatchEvent(new CustomEvent<SavedSadhanaEntryPayload>(SADHANA_ENTRY_SAVED_EVENT, { detail: payload }));
}

export function consumePendingSadhanaEntrySaved(userId: string): SavedSadhanaEntryPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as SavedSadhanaEntryPayload;
    if (payload.userId !== userId) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return payload;
  } catch {
    return null;
  }
}

export function mergeSavedSadhanaIntoDashboardData<T>(data: T | undefined, payload: SavedSadhanaEntryPayload): T | undefined {
  if (!data || typeof data !== 'object') return data;

  const dashboard = data as any;
  // Every calendar lookup is date-only.  Keep the optimistic record in that
  // exact form as well, including when a caller supplied an ISO timestamp.
  const entryDate = String(payload.entryDate || '').slice(0, 10);
  const totalScore = Number(payload.totalScore) || 0;
  const maxScore = Number(payload.maxScore) || 0;
  // The server normally returns scorePercent, but deriving it here prevents a
  // successful save from rendering as an uncoloured calendar day if an older
  // endpoint response omits that field.
  const scorePercent = payload.scorePercent ?? (maxScore > 0
    ? Math.round((totalScore / maxScore) * 100)
    : null);
  const entry = {
    entryId: payload.entryId,
    rowId: '',
    entryDate,
    totalScore,
    maxScore,
    scorePercent,
    flagSick: !!payload.flagSick,
    flagOs: !!payload.flagOs,
    submittedAt: payload.submittedAt,
  };

  const recentEntries = Array.isArray(dashboard.recentEntries)
    ? dashboard.recentEntries.filter((item: any) => String(item.entryDate || '').slice(0, 10) !== entryDate)
    : [];

  // Only change the dashboard's "today" card when the saved entry is for
  // today.  Editing a previous date must not temporarily replace today's data.
  const todayIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const next = {
    ...dashboard,
    metrics: {
      ...(dashboard.metrics || {}),
      ...(entryDate === todayIst ? {
        todayScore: totalScore,
        todayPercent: scorePercent,
        todaySubmitted: true,
        todayEntryId: payload.entryId,
        streakAtRisk: false,
      } : {}),
    },
    recentEntries: [entry, ...recentEntries].sort((a: any, b: any) =>
      String(b.entryDate || '').localeCompare(String(a.entryDate || ''))
    ),
  };

  return next as T;
}
