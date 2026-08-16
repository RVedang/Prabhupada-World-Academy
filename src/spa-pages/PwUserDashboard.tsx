import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Leaf, Trophy, ClipboardCheck, Sparkles, Building2, Settings2, ArrowRightLeft, Star } from 'lucide-react';
import { FEATURES } from '@/config/features';
import UserServicesTab from '@/components/services/UserServicesTab';
import GuideServicesTab from '@/components/services/GuideServicesTab';
import { getUserDashboardData, getSadhanaLeaderboard } from '@/lib/endpoints-sdk';
import { format } from 'date-fns';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { DashboardLayout } from '@/layouts';
import { LoadingPage } from '@/shared';
import TabTransition from '@/components/TabTransition';
import SadhanaTab from '@/components/dashboard/SadhanaTab';
import BvTab from '@/components/dashboard/BvTab';
import LeaderboardTab from '@/components/dashboard/LeaderboardTab';
import { useQuery } from '@/hooks/useQuery';
import SectionErrorBoundary from '@/components/SectionErrorBoundary';
import AttendanceTab from '@/components/dashboard/AttendanceTab';
import PushNotificationBanner from '@/components/dashboard/PushNotificationBanner';
import CleanlinessCalendarTab from '@/components/cleanliness/CleanlinessCalendarTab';
import CleanlinessManagerDashboard from '@/components/cleanliness/CleanlinessManagerDashboard';
import { initReminderVisibilityCheck, scheduleSadhanaReminder, hasSubmittedToday } from '@/utils/sadhanaNotification';

export default function PwUserDashboard() {
  const { profile } = useUserProfile();
  const navigate = useNavigate();

  const initialTab = window.location.hash.slice(1) || 'sadhana';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [lbRequested, setLbRequested] = useState(initialTab === 'leaderboard');

  useEffect(() => {
    initReminderVisibilityCheck();
    scheduleSadhanaReminder(hasSubmittedToday(), 'PW');
  }, []);

  useEffect(() => {
    const onPop = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setActiveTab(hash);
        if (hash === 'leaderboard') setLbRequested(true);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    window.history.pushState(null, '', `#${tab}`);
    if (tab === 'leaderboard') setLbRequested(true);
  }, []);

  const { data: dashboardData, loading: dashLoading } = useQuery({
    key: profile?.userId ? `dashboard:${profile.userId}` : null,
    fetcher: () => getUserDashboardData({ userId: profile!.userId, days: 30 }),
    ttl: 60_000,
  });

  const { data: leaderboardData } = useQuery({
    key: lbRequested && profile?.userId ? `lb:${profile.userId}:${format(new Date(), 'yyyy-MM-dd')}` : null,
    fetcher: () => getSadhanaLeaderboard({ userId: profile!.userId }),
    ttl: 60_000,
  });

  const isResident = useMemo(() => !!(profile?.residencyGuideVerified && profile?.selectedFolkResidency), [profile]);

  if (dashLoading || !profile) return <LoadingPage rows={3} />;

  const dd = dashboardData as any;
  const metrics = (dd?.metrics || dd) ?? {};
  const metricsNorm = {
    todayScore: metrics.todayScore ?? null,
    todayPercent: metrics.todayPercent ?? null,
    todaySubmitted: metrics.todaySubmitted ?? false,
    todayEntryId: metrics.todayEntryId ?? null,
    currentStreak: metrics.currentStreak ?? 0,
    weeklyAverage: metrics.weeklyAverage ?? 0,
    weeklyAveragePercent: metrics.weeklyAveragePercent ?? null,
    weeklySubmissionRate: metrics.weeklySubmissionRate ?? 0,
    entriesThisWeek: metrics.entriesThisWeek ?? 0,
    weekNumber: metrics.weekNumber ?? 0,
    weekStartDate: metrics.weekStartDate ?? null,
    weekEndDate: metrics.weekEndDate ?? null,
    streakAtRisk: metrics.streakAtRisk ?? false,
  };

  const history = ((dd?.recentEntries || dd?.entries) ?? []).map((e: any) => ({
    entryId: e.entryId ?? '',
    entryDate: e.entryDate ?? '',
    totalScore: e.totalScore ?? 0,
    scorePercent: e.scorePercent ?? null,
    submittedAt: e.submittedAt ?? '',
    flagSick: e.flagSick ?? false,
    flagOs: e.flagOs ?? false,
  }));

  return (
    <DashboardLayout
      title={`Hare Krishna ${profile.fullName} Prabhu`}
      subtitle={`Prabhupada World Department · ${profile.guideName ? `Guide: ${profile.guideName}` : ''}`}
    >
      {/* Department Banner */}
      <div className="mb-6 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 dark:border-violet-800 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
            <Star className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-violet-800 dark:text-violet-200 text-base">Prabhupada World Department</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-violet-500 text-white uppercase tracking-wide">Testing</span>
            </div>
            <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5">
              Bhakti Vriksha registrations from this dashboard will appear in the <strong>Prabhupada World Admin / Super Admin</strong> panel.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300 shrink-0"
          onClick={() => navigate('/user/folk-dashboard')}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Switch to FOLK Dashboard
        </Button>
      </div>

      <PushNotificationBanner />
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6 w-full md:w-auto flex-wrap h-auto gap-1">
          <TabsTrigger value="sadhana" className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" />Sadhana
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4" />Leaderboard
          </TabsTrigger>
          <TabsTrigger value="bv" className="flex items-center gap-1.5">
            <Leaf className="w-4 h-4" />
            <span className="sm:hidden">BV</span>
            <span className="hidden sm:inline">Bhakti Vriksha</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-1.5">
            <ClipboardCheck className="w-4 h-4" />Attendance
          </TabsTrigger>
          {isResident && !!profile.selectedFolkResidency && (
            <TabsTrigger value="cleanliness" className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />Cleanliness
            </TabsTrigger>
          )}
          {FEATURES.SERVICE_ALLOCATION && isResident && !!profile.selectedFolkResidency && (
            <TabsTrigger value="services" className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />Services
            </TabsTrigger>
          )}
          {FEATURES.SERVICE_ALLOCATION && !!profile.isServiceAllocator && (
            <TabsTrigger value="folk-mgmt" className="flex items-center gap-1.5">
              <Settings2 className="w-4 h-4" />Mgmt
            </TabsTrigger>
          )}
        </TabsList>
        <TabTransition activeTab={activeTab}>
          {activeTab === 'sadhana' && (
            <SectionErrorBoundary sectionName="Sadhana Tab">
              <SadhanaTab metrics={metricsNorm} history={history} userId={profile.userId} residencyId={profile.selectedFolkResidency ?? undefined} />
            </SectionErrorBoundary>
          )}
          {activeTab === 'leaderboard' && (
            <SectionErrorBoundary sectionName="Leaderboard Tab">
              <LeaderboardTab
                leaderboardData={leaderboardData as any}
                userId={profile.userId}
                userResidencyName={profile.residencyName ?? undefined}
              />
            </SectionErrorBoundary>
          )}
          {activeTab === 'bv' && (
            <SectionErrorBoundary sectionName="Bhakti Vriksha Tab">
              <BvTab userId={profile.userId} segment="PW" />
            </SectionErrorBoundary>
          )}
          {activeTab === 'attendance' && (
            <SectionErrorBoundary sectionName="Attendance Tab">
              <AttendanceTab userId={profile.userId} />
            </SectionErrorBoundary>
          )}
          {activeTab === 'cleanliness' && isResident && !!profile.selectedFolkResidency && (
            <SectionErrorBoundary sectionName="Cleanliness Tab">
              {(profile as any).isCleanlinessManager ? (
                <CleanlinessManagerDashboard residencyId={profile.selectedFolkResidency!} residencyName={profile.residencyName ?? undefined} />
              ) : (
                <CleanlinessCalendarTab userId={profile.userId} residencyId={profile.selectedFolkResidency!} />
              )}
            </SectionErrorBoundary>
          )}
          {activeTab === 'services' && FEATURES.SERVICE_ALLOCATION && isResident && !!profile.selectedFolkResidency && (
            <SectionErrorBoundary sectionName="Services Tab">
              <UserServicesTab userId={profile.userId} residencyId={profile.selectedFolkResidency ?? undefined} />
            </SectionErrorBoundary>
          )}
          {activeTab === 'folk-mgmt' && FEATURES.SERVICE_ALLOCATION && !!profile.isServiceAllocator && (
            <SectionErrorBoundary sectionName="FOLK Mgmt Tab">
              <GuideServicesTab residencyId={(profile as any).folkResidencyCustomId ?? undefined} />
            </SectionErrorBoundary>
          )}
        </TabTransition>
      </Tabs>
    </DashboardLayout>
  );
}
