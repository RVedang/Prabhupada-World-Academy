import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, CheckCircle2, Brain, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { getBvGroupDetail, getBvAttendanceMatrix, getBvQuizSubmissions } from '@/lib/endpoints-sdk';
import type { GetBvGroupDetailOutputType, GetBvAttendanceMatrixOutputType } from '@/lib/endpoints-sdk';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { Calendar } from 'lucide-react';
import { DashboardLayout } from '@/layouts';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { canOpenBvGroupMemberProfile, getBvGroupMemberProfileBasePath } from '@/lib/bvGroupMemberProfileNavigation';

type GroupDetail = GetBvGroupDetailOutputType;
type MatrixData = GetBvAttendanceMatrixOutputType;
type WeekFilter = 'this_week' | 'prev_week' | 'custom';

function getWeekRange(type: 'this_week' | 'prev_week'): { start: string; end: string } {
  const today = new Date();
  const base = type === 'prev_week' ? subWeeks(today, 1) : today;
  const mon = startOfWeek(base, { weekStartsOn: 1 });
  const sun = endOfWeek(base, { weekStartsOn: 1 });
  return { start: format(mon, 'yyyy-MM-dd'), end: format(sun, 'yyyy-MM-dd') };
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function AttendanceMatrix({ matrix, dates }: { matrix: MatrixData; dates: string[] }) {
  if (matrix.rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No attendance records found.</p>;
  }
  if (dates.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No attendance sessions found in the selected date range.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted border-b sticky top-0 z-10">
            <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted z-10 min-w-[140px]">Member</th>
            {dates.map(d => (
              <th key={d} className="text-center px-2 py-2 font-medium whitespace-nowrap min-w-[64px]">
                {format(new Date(d.slice(0, 10) + 'T00:00:00'), 'MMM d')}
              </th>
            ))}
            <th className="text-center px-2 py-2 font-bold bg-muted sticky right-0 z-10 min-w-[56px] border-l">Total</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row: any) => (
            <tr key={row.userId} className="border-b hover:bg-muted/30">
              <td className="px-3 py-2 font-medium sticky left-0 bg-card z-10 whitespace-nowrap">
                {row.name}
                {row.ashrayLevel && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">({row.ashrayLevel})</span>
                )}
              </td>
              {dates.map(d => {
                const val = row.attendance[d] ?? 0;
                return (
                  <td key={d} className={`text-center px-2 py-2 font-mono font-bold ${val === 1 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                    {val === 1 ? '✓' : '✗'}
                  </td>
                );
              })}
              <td className="text-center px-2 py-2 font-bold border-l sticky right-0 bg-card z-10">
                {row.weekTotal}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MembersTab({ members, onUserClick }: { members: GroupDetail['members']; onUserClick?: (userId: string) => void }) {
  if (members.length === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <Users className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
        <p className="text-sm font-medium text-muted-foreground">No members yet</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted border-b">
            <th className="text-left px-3 py-2.5 font-semibold">Name</th>
            <th className="text-left px-3 py-2.5 font-semibold hidden sm:table-cell">Ashray Level</th>
            <th className="text-center px-3 py-2.5 font-semibold">Present</th>
            <th className="text-center px-3 py-2.5 font-semibold">Sessions</th>
            <th className="text-center px-3 py-2.5 font-semibold">Rate</th>
            <th className="text-left px-3 py-2.5 font-semibold hidden md:table-cell">Last Present</th>
            <th className="text-left px-3 py-2.5 font-semibold hidden lg:table-cell">Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m: any) => (
            <tr
              key={m.userId}
              className={`border-b ${onUserClick ? 'hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary' : ''}`}
              onClick={onUserClick ? () => onUserClick(m.userId) : undefined}
              onKeyDown={onUserClick ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onUserClick(m.userId);
                }
              } : undefined}
              role={onUserClick ? 'link' : undefined}
              tabIndex={onUserClick ? 0 : undefined}
              aria-label={onUserClick ? `Open ${m.fullName}'s profile` : undefined}
            >
              <td className="px-3 py-2.5 font-medium">{m.fullName}</td>
              <td className="px-3 py-2.5 hidden sm:table-cell">
                {m.ashrayLevel
                  ? <Badge variant="outline" className="text-xs">{m.ashrayLevel}</Badge>
                  : <span className="text-muted-foreground text-xs">—</span>}
              </td>
              <td className="px-3 py-2.5 text-center text-green-600 font-semibold">{m.presentCount}</td>
              <td className="px-3 py-2.5 text-center">{m.totalCount}</td>
              <td className="px-3 py-2.5 text-center">
                <Badge variant="outline" className={`text-xs ${m.attendanceRate >= 75 ? 'border-green-400 text-green-700' : m.attendanceRate >= 50 ? 'border-yellow-400 text-yellow-700' : 'border-red-300 text-red-600'}`}>
                  {m.attendanceRate}%
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground text-xs hidden md:table-cell">
                {m.lastPresent ? format(new Date((m.lastPresent as string).slice(0, 10) + 'T00:00:00'), 'MMM d, yyyy') : '—'}
              </td>
              <td className="px-3 py-2.5 hidden lg:table-cell">
                {m.role === 'Leader'
                  ? <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Leader</Badge>
                  : <span className="text-xs text-muted-foreground">Member</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


type GroupQuiz = { quizId: string; title: string; createdAt: string };

function scoreClass(percentage: number) {
  if (percentage >= 70) return 'text-green-600';
  if (percentage >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function QuizAnalyticsCard({ quiz, groupId, memberCount }: {
  quiz: GroupQuiz;
  groupId: string;
  memberCount: number;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getBvQuizSubmissions({ quizId: quiz.quizId, department: 'FOLK', groupId })
      .then(data => { if (!cancelled) setResult(data); })
      .catch((requestError: any) => {
        if (!cancelled) setError(requestError?.message || 'Unable to load quiz analytics.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId, quiz.quizId]);

  const submissions = result?.submissions || [];
  const analytics = result?.analytics;
  const participantLabel = memberCount > 0
    ? `${analytics?.totalSubmissions ?? submissions.length} of ${memberCount}`
    : String(analytics?.totalSubmissions ?? submissions.length);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{quiz.title}</span>
            </CardTitle>
            {quiz.createdAt && (
              <p className="text-xs text-muted-foreground mt-1">Created {format(new Date(quiz.createdAt), 'MMM d, yyyy')}</p>
            )}
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold">{participantLabel}</p>
                <p className="text-xs text-muted-foreground">Members attempted</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3 text-center">
                <p className="text-xl font-bold text-primary">{analytics?.averagePercentage ?? 0}%</p>
                <p className="text-xs text-muted-foreground">Average score</p>
              </div>
              <div className="rounded-lg bg-green-500/10 p-3 text-center">
                <p className="text-xl font-bold text-green-600">{analytics?.passingCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Passed (70%+)</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowParticipants(value => !value)}
              className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              <span>Participant scores ({submissions.length})</span>
              {showParticipants ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showParticipants && (
              submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No members have attempted this quiz yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Member</th>
                        <th className="text-center px-3 py-2 font-medium">Score</th>
                        <th className="text-right px-3 py-2 font-medium">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((submission: any) => (
                        <tr key={submission.id} className="border-t">
                          <td className="px-3 py-2 font-medium">{submission.userName}</td>
                          <td className={`px-3 py-2 text-center font-semibold ${scoreClass(Number(submission.percentage) || 0)}`}>
                            {submission.score}/{submission.totalQuestions} ({submission.percentage}%)
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {submission.submittedAt ? format(new Date(submission.submittedAt), 'MMM d, yyyy') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {(analytics?.questionAnalytics || []).length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowQuestions(value => !value)}
                  className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
                >
                  <span>Question-wise analysis</span>
                  {showQuestions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showQuestions && (
                  <div className="space-y-2">
                    {analytics.questionAnalytics.map((question: any, index: number) => (
                      <div key={question.questionId} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm"><span className="font-medium">Q{index + 1}.</span> {question.questionText}</p>
                          <Badge variant="outline" className="shrink-0">{question.correctPercentage}% correct</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuizzesTab({ quizzes, groupId, memberCount }: {
  quizzes: GroupQuiz[];
  groupId: string;
  memberCount: number;
}) {
  if (quizzes.length === 0) {
    return (
      <div className="text-center py-10">
        <Brain className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-2" />
        <p className="text-sm text-muted-foreground">No quizzes assigned to this group yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Quiz participation and performance for this group.</p>
      {quizzes.map(q => <QuizAnalyticsCard key={q.quizId} quiz={q} groupId={groupId} memberCount={memberCount} />)}
    </div>
  );
}

export default function BvGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUserProfile();
  const canViewUserProfile = canOpenBvGroupMemberProfile(profile);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('this_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState('');

  const dateRange = useMemo(() => {
    if (weekFilter === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    if (weekFilter === 'custom') return null;
    return getWeekRange(weekFilter === 'prev_week' ? 'prev_week' : 'this_week');
  }, [weekFilter, customStart, customEnd]);

  useEffect(() => { if (groupId) load(); }, [groupId]);

  useEffect(() => {
    if (!groupId || !dateRange) {
      setMatrix(null);
      setMatrixLoading(false);
      setMatrixError('');
      return;
    }
    let cancelled = false;
    setMatrixLoading(true);
    setMatrixError('');
    setMatrix(null);
    getBvAttendanceMatrix({
      groupId,
      startDate: dateRange.start,
      endDate: dateRange.end,
    })
      .then(data => { if (!cancelled) setMatrix(data); })
      .catch(() => {
        if (!cancelled) {
          setMatrixError('Unable to load attendance for this date range.');
          toast.error('Unable to refresh the attendance matrix');
        }
      })
      .finally(() => { if (!cancelled) setMatrixLoading(false); });
    return () => { cancelled = true; };
  }, [groupId, dateRange]);

  const load = async (silent = false) => {
    if (!groupId) return;
    if (!silent) setLoading(true);
    try {
      const detailRes = await getBvGroupDetail({ groupId });
      setDetail(detailRes);
    } catch {
      toast.error('Failed to load group details');
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useRealtimeRefresh(
    profile?.segment === 'FOLK' ? ['groups', 'users', 'attendance', 'quizzes'] : ['groups', 'users', 'attendance'],
    () => load(true),
    Boolean(groupId),
  );

  const overallRate = useMemo(() => {
    if (!detail || detail.members.length === 0) return 0;
    const total = detail.members.reduce((s: number, m: any) => s + m.totalCount, 0);
    const present = detail.members.reduce((s: number, m: any) => s + m.presentCount, 0);
    return total > 0 ? Math.round((present / total) * 100) : 0;
  }, [detail]);

  const matrixDates = useMemo(() => matrix?.dates ?? [], [matrix]);

  if (loading) {
    return (
      <DashboardLayout title="BV Group" maxWidth="max-w-5xl" showProfile={false}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  if (!detail?.group) {
    return (
      <DashboardLayout title="BV Group" maxWidth="max-w-5xl">
        <div className="text-center py-12 text-muted-foreground">
          <p>Group not found.</p>
          <Button variant="link" onClick={() => navigate(-1)}>Go back</Button>
        </div>
      </DashboardLayout>
    );
  }

  const dd = detail as any;
  const isFolkGroup = dd.group.segment === 'FOLK';
  const quizzes = dd.quizzes ?? [];

  return (
    <DashboardLayout title="BV Group" maxWidth="max-w-5xl">
      <div className="space-y-5">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold">{detail.group.groupName}</h2>
            {detail.group.isActive
              ? <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">Active</Badge>
              : <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
          </div>
          {detail.group.description && (
            <p className="text-muted-foreground text-sm mt-1">{detail.group.description}</p>
          )}
        </div>

        <div className={`grid grid-cols-2 ${isFolkGroup ? 'md:grid-cols-3' : ''} gap-3`}>
          <StatCard icon={Users} label="Members" value={detail.members.length} sub="in this group" />
          <StatCard icon={CheckCircle2} label="Attendance Rate" value={`${overallRate}%`} sub="all-time average" color="text-green-600" />
          {isFolkGroup && <StatCard icon={Brain} label="Quizzes" value={quizzes.length} sub="assigned quizzes" color="text-purple-600" />}
        </div>

        <Tabs defaultValue={isFolkGroup ? 'quizzes' : 'attendance'}>
          <TabsList className="w-full md:w-auto">
            {isFolkGroup && <TabsTrigger value="quizzes" className="flex items-center gap-1.5">
              <Brain className="w-4 h-4" />Quizzes
            </TabsTrigger>}
            <TabsTrigger value="attendance" className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />Attendance
            </TabsTrigger>
            <TabsTrigger value="members" className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />Members
            </TabsTrigger>
          </TabsList>

          {isFolkGroup && <TabsContent value="quizzes" className="mt-4">
            <QuizzesTab quizzes={quizzes} groupId={detail.group.groupId} memberCount={detail.members.length} />
          </TabsContent>}

          <TabsContent value="attendance" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />Attendance Matrix
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {(['this_week', 'prev_week', 'custom'] as WeekFilter[]).map(f => (
                      <Button key={f} size="sm" variant={weekFilter === f ? 'default' : 'outline'} className="h-7 text-xs"
                        onClick={() => setWeekFilter(f)}>
                        {f === 'this_week' ? 'This Week' : f === 'prev_week' ? 'Prev Week' : 'Custom'}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap mt-2">
                  {weekFilter === 'custom' ? (
                    <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">From</span>
                      <DateTimePicker
                        type="date"
                        value={customStart}
                        onChange={setCustomStart}
                        max={customEnd || undefined}
                        placeholder="Choose start date"
                        className="h-9 w-[190px] rounded-lg"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">To</span>
                      <DateTimePicker
                        type="date"
                        value={customEnd}
                        onChange={setCustomEnd}
                        min={customStart || undefined}
                        placeholder="Choose end date"
                        className="h-9 w-[190px] rounded-lg"
                      />
                    </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">From</span>
                        <span className="text-sm font-medium border rounded-md px-3 py-1.5 bg-muted/30">
                          {dateRange ? format(new Date(dateRange.start + 'T00:00:00'), 'MM/dd/yyyy') : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">To</span>
                        <span className="text-sm font-medium border rounded-md px-3 py-1.5 bg-muted/30">
                          {dateRange ? format(new Date(dateRange.end + 'T00:00:00'), 'MM/dd/yyyy') : ''}
                        </span>
                      </div>
                    </>
                  )}
                  </div>
              </CardHeader>
              <CardContent>
                {matrixLoading ? (
                  <Skeleton className="h-24 w-full rounded-lg" />
                ) : matrixError ? (
                  <p className="text-sm text-destructive text-center py-6">{matrixError}</p>
                ) : matrix ? (
                  <AttendanceMatrix matrix={matrix} dates={matrixDates} />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">Select both From and To dates to load attendance.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <MembersTab
              members={detail.members}
              onUserClick={canViewUserProfile ? (uid) => {
                const detailBasePath = getBvGroupMemberProfileBasePath(profile);
                navigate(`${detailBasePath}/${encodeURIComponent(uid)}`, {
                  state: { from: `${location.pathname}${location.search}` },
                });
              } : undefined}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
