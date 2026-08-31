import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, subDays, startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth, getISOWeek, getISOWeekYear } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';
import FolkReportTable from '@/components/guide/FolkReportTable';
import GuideLeaderboardDisplay from '@/components/guide/GuideLeaderboardDisplay';
import { getFolkSadhanaReport, getSadhanaLeaderboard } from '@/lib/endpoints-sdk';
import { useUserProfile } from '@/contexts/UserProfileContext';
import type { SadhanaGroupOption } from '@/components/guide/ReportsTab';

type ReportType = 'daily' | 'weekly' | 'monthly';

function getDefaultWeek(): string {
  const today = new Date();
  return `${getISOWeekYear(today)}-W${String(getISOWeek(today)).padStart(2, '0')}`;
}

function parseWeekInput(weekStr: string): { start: string; end: string } {
  const [yearStr, wStr] = weekStr.split('-W');
  const year = parseInt(yearStr), week = parseInt(wStr);
  const jan4 = new Date(year, 0, 4);
  const startW1 = startOfISOWeek(jan4);
  const weekStart = new Date(startW1);
  weekStart.setDate(startW1.getDate() + (week - 1) * 7);
  return { start: format(weekStart, 'yyyy-MM-dd'), end: format(endOfISOWeek(weekStart), 'yyyy-MM-dd') };
}

function parseMonthInput(monthStr: string): { start: string; end: string } {
  const [yearStr, mStr] = monthStr.split('-');
  const date = new Date(parseInt(yearStr), parseInt(mStr) - 1, 1);
  return { start: format(startOfMonth(date), 'yyyy-MM-dd'), end: format(endOfMonth(date), 'yyyy-MM-dd') };
}

function getWeekOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  const curWeekStart = startOfISOWeek(now);
  for (let i = 0; i < 52; i++) {
    const ws = new Date(curWeekStart);
    ws.setDate(curWeekStart.getDate() - i * 7);
    const we = endOfISOWeek(ws);
    const wn = getISOWeek(ws), wy = getISOWeekYear(ws);
    opts.push({
      value: `${wy}-W${String(wn).padStart(2, '0')}`,
      label: `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}${i === 0 ? ' (Current)' : ''}`,
    });
  }
  return opts;
}

function getMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  for (let y = curYear; y >= curYear - 2; y--) {
    const maxM = y === curYear ? curMonth : 12;
    for (let m = maxM; m >= 1; m--) {
      opts.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: format(new Date(y, m - 1, 1), 'MMMM yyyy') });
    }
  }
  return opts;
}

const WEEK_OPTIONS = getWeekOptions();
const MONTH_OPTIONS = getMonthOptions();
const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const today = format(new Date(), 'yyyy-MM-dd');

interface Props {
  guideId?: string;
  bvslMode?: boolean;
  groupOptions?: SadhanaGroupOption[];
}

export default function GuideLeaderboardTab({ guideId, bvslMode, groupOptions = [] }: Props) {
  const { profile } = useUserProfile();
  const isFolk = profile?.segment === 'FOLK';
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [selectedDate, setSelectedDate] = useState(yesterday);
  const [selectedWeek, setSelectedWeek] = useState(getDefaultWeek());
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedGroupId, setSelectedGroupId] = useState('all');

  const [folkData, setFolkData] = useState<any>(null);
  const [folkLoading, setFolkLoading] = useState(false);
  const [lbData, setLbData] = useState<any>(null);
  const [lbLoading, setLbLoading] = useState(false);

  // Compute date range for FOLK Report and leaderboard date
  const { startDate, endDate, rangeLabel } = useMemo(() => {
    if (reportType === 'weekly') {
      const { start, end } = parseWeekInput(selectedWeek);
      const opt = WEEK_OPTIONS.find(o => o.value === selectedWeek);
      return { startDate: start, endDate: end, rangeLabel: opt?.label ?? selectedWeek };
    }
    if (reportType === 'monthly') {
      const { start, end } = parseMonthInput(selectedMonth);
      return { startDate: start, endDate: end, rangeLabel: format(new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]) - 1, 1), 'MMMM yyyy') };
    }
    // daily
    const label = format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMM d, yyyy');
    return { startDate: selectedDate, endDate: selectedDate, rangeLabel: label };
  }, [reportType, selectedDate, selectedWeek, selectedMonth]);

  useEffect(() => {
    if (selectedGroupId !== 'all' && !groupOptions.some(group => group.id === selectedGroupId || group.groupId === selectedGroupId)) {
      setSelectedGroupId('all');
    }
  }, [groupOptions, selectedGroupId]);

  const loadFolk = useCallback(async (s: string, e: string) => {
    setFolkLoading(true);
    try {
      setFolkData(await getFolkSadhanaReport({
        date: s,
        startDate: s,
        endDate: e,
        bvslMode,
        groupId: selectedGroupId === 'all' ? undefined : selectedGroupId,
      }));
    }
    catch {/* ignore */} finally { setFolkLoading(false); }
  }, [bvslMode, selectedGroupId]);

  const loadLb = useCallback(async (s: string, e: string) => {
    setLbLoading(true);
    try {
      setLbData(await getSadhanaLeaderboard({
        date: s,
        startDate: s,
        endDate: e,
        guideId,
        bvslMode,
        groupId: selectedGroupId === 'all' ? undefined : selectedGroupId,
      }));
    }
    catch {/* ignore */} finally { setLbLoading(false); }
  }, [guideId, bvslMode, selectedGroupId]);

  useEffect(() => {
    loadFolk(startDate, endDate);
    loadLb(startDate, endDate);
  }, [startDate, endDate, loadFolk, loadLb]);

  const handleRefresh = () => { loadFolk(startDate, endDate); loadLb(startDate, endDate); };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Report type */}
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium whitespace-nowrap">Type:</Label>
          <Select value={reportType} onValueChange={(v: ReportType) => setReportType(v)}>
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue>{reportType === 'daily' ? 'Daily' : reportType === 'weekly' ? 'Weekly' : 'Monthly'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date / Week / Month selector */}
        {reportType === 'daily' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Label className="text-sm font-medium whitespace-nowrap">Date:</Label>
            <Button size="sm" variant={selectedDate === yesterday ? 'default' : 'outline'} className="h-8 text-xs px-3"
              onClick={() => setSelectedDate(yesterday)}>Yesterday</Button>
            <Button size="sm" variant={selectedDate === today ? 'default' : 'outline'} className="h-8 text-xs px-3"
              onClick={() => setSelectedDate(today)}>Today</Button>
            <Input type="date" className="h-8 w-[140px]" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)} max={today} />
          </div>
        )}

        {reportType === 'weekly' && (
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium whitespace-nowrap">Week:</Label>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="h-8 w-[280px]"><SelectValue>{WEEK_OPTIONS.find(o => o.value === selectedWeek)?.label || selectedWeek}</SelectValue></SelectTrigger>
              <SelectContent className="max-h-60">
                {WEEK_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {reportType === 'monthly' && (
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium whitespace-nowrap">Month:</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {MONTH_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {groupOptions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium whitespace-nowrap">Group:</Label>
            <Select value={selectedGroupId} onValueChange={(value: string | null) => setSelectedGroupId(value || 'all')}>
              <SelectTrigger className="h-8 w-[210px]">
                <span className="truncate">
                  {selectedGroupId === 'all'
                    ? 'All Groups'
                    : groupOptions.find(group => group.id === selectedGroupId || group.groupId === selectedGroupId)?.groupName || 'Reading Group'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {groupOptions.map(group => (
                  <SelectItem key={group.id} value={group.id}>{group.groupName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <button onClick={handleRefresh} disabled={folkLoading || lbLoading}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 text-xs font-medium">
          <RefreshCw className={`w-3.5 h-3.5 ${(folkLoading || lbLoading) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* FOLK Report (only shown for FOLK segment users) */}
      {isFolk && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            FOLK Report — {folkData?.title || 'All Residencies'}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{rangeLabel}</span>
          </h3>
          {folkLoading && !folkData ? (
            <Skeleton className="h-48 w-full" />
          ) : folkData ? (
            <div className={`transition-opacity ${folkLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <FolkReportTable folkRows={folkData.folkRows} fieldDefs={folkData.fieldDefs} />
            </div>
          ) : null}
        </div>
      )}

      {/* Individual Leaderboard — matches selected period */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Individual Leaderboard
          <span className="ml-2 text-xs font-normal text-muted-foreground">{rangeLabel}</span>
        </h3>
        {lbLoading && !lbData ? (
          <Skeleton className="h-60 w-full" />
        ) : lbData ? (
          <div className={`transition-opacity ${lbLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <GuideLeaderboardDisplay
              leaderboard={lbData.leaderboard ?? []}
              dateLabel={rangeLabel}
              totalDays={lbData.totalDays ?? 1}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
