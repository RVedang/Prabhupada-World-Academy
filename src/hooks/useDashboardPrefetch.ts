import { useCallback, useEffect, useRef } from 'react';
import { endOfISOWeek, format, getISOWeek, getISOWeekYear, startOfISOWeek, subDays, subWeeks } from 'date-fns';
import { hasEndpointRequestsInFlight, isEndpointQueryFresh, queryCacheKey, queryEndpoint } from '@/lib/app-endpoints-sdk';

type Query = { tab: string; name: string; input: Record<string, unknown>; intentOnly?: boolean };
type Options = { enabled: boolean; segment: 'PW' | 'FOLK'; isSuperAdmin: boolean; guideId: string; activeTab: string; residencyId?: string };

function plan({ segment, isSuperAdmin, guideId, residencyId }: Options): Query[] {
  const now = new Date();
  const date = (d: Date) => format(d, 'yyyy-MM-dd');
  const previousWeek = subWeeks(now, 1);
  return [
    { tab: 'lookups', name: 'getGuides', input: { segment } },
    { tab: 'lookups', name: 'getAllResidencies', input: { segment } },
    { tab: 'sadhana', name: 'getGuideDetailedReport', input: { guideId: segment === 'PW' ? 'ALL' : isSuperAdmin ? '' : guideId, date: date(subDays(now, 1)), reportType: 'daily', segment } },
    segment === 'FOLK' && isSuperAdmin
      ? { tab: 'bv', name: 'getSuperGuideBvStats', input: { weekNumber: getISOWeek(now), year: getISOWeekYear(now), segment } }
      : { tab: 'bv', name: 'getBvSessionMatrix', input: { guideId: isSuperAdmin ? 'ALL' : guideId, startDate: date(startOfISOWeek(now)), endDate: date(endOfISOWeek(now)), segment } },
    { tab: 'meetings', name: 'getMeetings', input: { department: segment } },
    { tab: 'meetings', name: 'getMoms', input: { department: segment } },
    { tab: 'missing-sadhana', name: 'getMissingSadhanaReport', input: { startDate: date(startOfISOWeek(previousWeek)), endDate: date(endOfISOWeek(previousWeek)), segment } },
    // Directories/group management can include many records and history. Load
    // them on navigation intent, never as an unconditional login download.
    { tab: 'users', name: 'getGuideUsers', input: { guideId: 'ALL', statusFilter: 'all' }, intentOnly: true },
    { tab: 'bhakti-vriksha', name: isSuperAdmin ? 'getBvslGroups' : 'getAllBvGroupsAdmin', input: isSuperAdmin ? { bvslId: 'ALL' } : { guideId }, intentOnly: true },
  ];
}

/** One background read at a time, only after visible requests finish. */
export function useDashboardPrefetch(options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const intent = useRef<string | null>(null);
  const wake = useRef<() => void>(() => {});
  const completed = useRef(new Set<string>());
  const scopeKey = queryCacheKey('dashboard-prefetch', { segment: options.segment, guideId: options.guideId, isSuperAdmin: options.isSuperAdmin });
  useEffect(() => {
    if (!options.enabled) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType || '')) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      const current = optionsRef.current;
      if (document.visibilityState !== 'visible' || hasEndpointRequestsInFlight()) {
        timer = setTimeout(tick, 500);
        return;
      }
      const candidates = plan(current).filter(query => query.tab !== current.activeTab &&
        (!query.intentOnly || query.tab === intent.current) &&
        !completed.current.has(queryCacheKey(query.name, query.input)));
      const next = candidates.find(query => query.tab === intent.current) || candidates[0];
      if (next) {
        const key = queryCacheKey(next.name, next.input);
        completed.current.add(key);
        if (!isEndpointQueryFresh(next.name, next.input)) {
          await queryEndpoint(next.name, next.input).catch(() => { /* Visible queries handle/report retries. */ });
        }
      }
      if (!cancelled && next) timer = setTimeout(tick, 250);
    };
    wake.current = () => { clearTimeout(timer); if (!cancelled) timer = setTimeout(tick, 120); };
    timer = setTimeout(tick, 1000);
    return () => { cancelled = true; clearTimeout(timer); wake.current = () => {}; };
  }, [options.enabled, scopeKey]);
  return useCallback((tab: string) => {
    intent.current = tab;
    const modules: Record<string, () => Promise<unknown>> = {
      sadhana: () => import('@/components/guide/ReportsTab'),
      bv: () => import('@/components/super/SuperBvReportTab'),
      users: () => import('@/components/super/SuperUsersPanel'),
      meetings: () => import('@/components/super/MeetingsAndMomTab'),
      'bhakti-vriksha': () => import('@/components/super/BvAdminManagementTab'),
      'missing-sadhana': () => import('@/components/guide/MissingSadhanaTab'),
    };
    void modules[tab]?.().catch(() => {});
    wake.current();
  }, []);
}
