import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Flame, Calendar, ClipboardCheck, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import { getUserAttendanceCalendar } from '@/lib/endpoints-sdk';
import { fmt } from '@/lib/fmt';

interface Props { userId: string; }

export default function AttendanceTab({ userId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fetchAttendance = () => {
    getUserAttendanceCalendar({}).then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAttendance();
    window.addEventListener('attendanceUpdated', fetchAttendance);
    return () => window.removeEventListener('attendanceUpdated', fetchAttendance);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const entries: any[] = data?.entries || [];

  // Map each date to present status: true (P), false (A)
  const attendanceMap = new Map<string, boolean>();
  entries.forEach((e: any) => {
    if (e.date) {
      attendanceMap.set(e.date, e.present ?? (e.status === 'P'));
    }
  });

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.totalDaysAttended || 0}</p>
          <p className="text-xs text-muted-foreground">Sessions Attended</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Flame className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-orange-500">{stats.currentStreak || 0}</p>
          <p className="text-xs text-muted-foreground">Current Streak</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold">{stats.thisMonthCount || 0}</p>
          <p className="text-xs text-muted-foreground">This Month</p>
        </CardContent></Card>
      </div>

      {/* Calendar heatmap */}
      <AttendanceCalendar
        attendanceMap={attendanceMap}
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
      />

      {/* Recent entries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" /> Recent Attendance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No attendance records yet</p>
          ) : (
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {entries.slice(0, 20).map((e: any, i: number) => {
                const isPresent = e.present ?? (e.status === 'P');
                return (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{e.sessionName || 'Session'}</p>
                      <p className="text-xs text-muted-foreground">{e.eventTitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={isPresent ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300'}>
                        {isPresent ? '✓ Attended' : '✗ Not Attended'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{fmt.date(e.date)}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceCalendar({ attendanceMap, currentMonth, onMonthChange }: {
  attendanceMap: Map<string, boolean>;
  currentMonth: Date;
  onMonthChange: (d: Date) => void;
}) {
  const calendarDays = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });
  const firstDayOfWeek = (calendarDays[0].getDay() + 6) % 7;
  const today = format(new Date(), 'yyyy-MM-dd');

  const monthAttendedCount = calendarDays.filter(d => attendanceMap.get(format(d, 'yyyy-MM-dd')) === true).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Attendance Calendar</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => onMonthChange(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="sm" onClick={() => onMonthChange(addMonths(currentMonth, 1))} disabled={currentMonth >= new Date()}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {monthAttendedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {monthAttendedCount} day{monthAttendedCount !== 1 ? 's' : ''} attended this month
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
          ))}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
          {calendarDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const hasRecord = attendanceMap.has(dateStr);
            const isPresent = attendanceMap.get(dateStr) === true;
            const isAbsent = hasRecord && !isPresent;
            const isToday = dateStr === today;
            const isFuture = isBefore(startOfDay(new Date()), startOfDay(day)) && !isToday;

            return (
              <div
                key={dateStr}
                className={[
                  'min-h-[44px] rounded-lg flex flex-col items-center justify-center border transition-all font-semibold',
                  isFuture
                    ? 'bg-transparent border-transparent text-muted-foreground/30'
                    : isPresent
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold'
                    : isAbsent
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold'
                    : 'bg-muted/30 border-muted text-muted-foreground',
                  isToday ? 'ring-2 ring-primary ring-offset-1' : '',
                ].join(' ')}
              >
                <span className="text-sm leading-none">{format(day, 'd')}</span>
                {isPresent && <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 leading-none mt-0.5">✓</span>}
                {isAbsent && <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 leading-none mt-0.5">✗</span>}
              </div>
            );
          })}
        </div>
        <div className="flex gap-6 mt-4 text-xs font-medium justify-center">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Attended (✓)
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Not Attended (✗)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
