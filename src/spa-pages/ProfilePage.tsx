import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-sdk';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Flame, TrendingUp, Leaf, Star, MapPin, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  getUserProfile, getUserMetrics, getGuides, getAshrayUpgradePath, getAllResidencies,
  getBvAttendance, getAshrayChecklist, getUserCrmData, getGuideResidencyAssignments, requestGuideResidencyAssignment,
} from '@/lib/endpoints-sdk';
import type {
  GetUserProfileOutputType, GetGuidesOutputType,
  GetAshrayUpgradePathOutputType, GetUserMetricsOutputType, GetAllResidenciesOutputType,
  GetUserCrmDataOutputType,
} from '@/lib/endpoints-sdk';
import AshrayJourneyCard from '@/components/crm/AshrayJourneyCard';
import TripsDuesCard from '@/components/crm/TripsDuesCard';
import RentHistoryCard from '@/components/crm/RentHistoryCard';
import { useUserProfile } from '@/contexts/UserProfileContext';
import PersonalInfoCard from '@/components/profile/PersonalInfoCard';
import GuideResidencyCard from '@/components/profile/GuideResidencyCard';
import AccountCard from '@/components/profile/AccountCard';
import ProfileHero from '@/components/profile/ProfileHero';
import AshrayCriteriaGrid from '@/components/profile/AshrayCriteriaGrid';
import NotificationCard from '@/components/profile/NotificationCard';

type ProfileType = NonNullable<GetUserProfileOutputType['user']>;

function isRequired(req: string): boolean {
  return !!req && req !== '-' && req !== '—';
}

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refreshProfile } = useUserProfile();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [guides, setGuides] = useState<GetGuidesOutputType['guides']>([]);
  const [metrics, setMetrics] = useState<GetUserMetricsOutputType | null>(null);
  const [ashrayData, setAshrayData] = useState<GetAshrayUpgradePathOutputType | null>(null);
  const [allResidencies, setAllResidencies] = useState<GetAllResidenciesOutputType>([]);
  const [bvWeeklyScore, setBvWeeklyScore] = useState<number | null>(null);
  const [ashrayCheckedCount, setAshrayCheckedCount] = useState<number>(0);
  const [crmData, setCrmData] = useState<GetUserCrmDataOutputType | null>(null);

  useEffect(() => { if (user?.email) loadAll(); }, [user]);

  const loadAll = async () => {
    if (!user?.email) return;
    try {
      const profileRes = await getUserProfile({ email: user.email });
      const p = profileRes?.user;
      if (!p) { navigate('/register'); return; }
      setProfile(p);

      const localDate = format(new Date(), 'yyyy-MM-dd');
      const [guidesRes, ashrayRes, metricsRes, allResRes, bvRes, checklistRes, crmRes] = await Promise.all([
        getGuides({}), getAshrayUpgradePath({}),
        getUserMetrics({ userId: p.userId }), getAllResidencies({}),
        getBvAttendance({ userId: p.userId, localDate, sinceDate: format(new Date(Date.now() - 30 * 86400_000), 'yyyy-MM-dd') }).catch(() => null),
        getAshrayChecklist({ userId: p.userId }).catch(() => null),
        getUserCrmData({ userId: p.userId || '' }).catch(() => null),
      ]);
      setGuides(guidesRes.guides);
      setAshrayData(ashrayRes);
      setMetrics(metricsRes);
      setAllResidencies(allResRes);
      if (bvRes) setBvWeeklyScore(bvRes.userTotalPointsThisWeek);
      if (checklistRes) setAshrayCheckedCount(checklistRes.checkedItems.length);
      if (crmRes) setCrmData(crmRes);
    } catch (err) {
      console.error('Profile load error:', err);
      toast.error('Failed to load profile');
    } finally { setLoading(false); }
  };

  const handleProfileChanged = async () => {
    await Promise.all([loadAll(), refreshProfile()]);
  };

  if (loading) return <ProfileSkeleton />;
  if (!profile) return null;

  const guideName = guides.find((g: any) => g.guideId === profile.selectedGuideId)?.name || '—';
  // SAD-C03 FIX: look up by ID first; never fall back to raw ID — show '—' instead
  const residencyName = allResidencies.find(
    (r: any) => r.residencyId === profile.selectedFolkResidency
  )?.residencyName || '—';

  // FIX 5: Compute total required ashray items
  const ashrayTotalRequired = ashrayData
    ? ashrayData.practiceGroups
        .flatMap((g: any) => g.practices)
        .filter((p: any) => isRequired(p.requirements[profile.ashrayLevel || 'Jigyasa'] || ''))
        .length
    : 0;

  const isGuideOrAdminOrSuper =
    profile.role === 'GUIDE' ||
    profile.role === 'SUPER_GUIDE' ||
    profile.role === 'ADMIN' ||
    profile.role === 'SUPER_ADMIN' ||
    profile.role === 'PW_ADMIN' ||
    !!(profile as any).isBvAdmin ||
    !!(profile as any).isBvSuperAdmin;

  const isSuperAdmin =
    profile.role === 'SUPER_ADMIN' ||
    profile.role === 'SUPER_GUIDE' ||
    !!(profile as any).isBvSuperAdmin;

  const isBvAdminUser =
    isSuperAdmin ||
    profile.role === 'ADMIN' ||
    profile.role === 'GUIDE' ||
    !!(profile as any).isBvAdmin;

  const isPwUser = !!(profile as any).isPrabhupadaWorldUser || profile.segment === 'PW';
  const showGuideResidencyCard = !isPwUser && !isBvAdminUser;
  const isFolk = profile.segment === 'FOLK';
  const adminDashboardPath = isFolk ? '/folk-guide/dashboard' : '/pw-admin/dashboard';
  const showGuideResidencyAssignmentCard = isFolk && isBvAdminUser && !isPwUser;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3 max-w-7xl">
          <Button variant="ghost" size="sm" onClick={() => navigate(isBvAdminUser ? adminDashboardPath : '/user/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <h1 className="text-xl font-bold">My Profile</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
        {/* SAD-C02 FIX: isResident requires guide-verified approval + valid residency ID */}
        <ProfileHero fullName={profile.fullName} email={user?.email || ''} segment={profile.segment}
          isResident={!!(profile.residencyGuideVerified && profile.selectedFolkResidency)} ashrayLevel={isSuperAdmin ? null : profile.ashrayLevel}
          role={profile.role} isBvsl={profile.isBvsl} isSadhanaMentor={profile.isSadhanaMentor}
          isFolkLead={profile.isFolkLead} isTripCoordinator={profile.isTripCoordinator} isBvMentor={profile.isBvMentor}
          isSuperAdmin={isSuperAdmin} />

        <div className="grid md:grid-cols-3 gap-6">
          <PersonalInfoCard email={user?.email || ''} fullName={profile.fullName}
            phone={String(profile.phone || '')} ashrayLevel={isSuperAdmin ? null : profile.ashrayLevel}
            isSuperAdmin={isSuperAdmin}
            onUpdated={() => handleProfileChanged()} />
          {showGuideResidencyAssignmentCard && (
            <GuideResidencyAssignmentCard isSuperGuide={isSuperAdmin} />
          )}
          {showGuideResidencyCard && (
            <GuideResidencyCard email={user?.email || ''} fullName={profile.fullName}
              phone={String(profile.phone || '')} guideName={guideName}
              currentGuideId={profile.selectedGuideId} guides={guides}
              isResident={!!(profile.residencyGuideVerified && profile.selectedFolkResidency)} residencyName={residencyName}
              residencyGuideVerified={profile.residencyGuideVerified ?? undefined}
              selectedFolkResidency={profile.selectedFolkResidency}
              allResidencies={allResidencies} ashrayLevel={profile.ashrayLevel}
              residencyJoinDate={profile.residencyJoinDate}
              hasPendingGuideTransfer={(profile as any).hasPendingGuideTransfer}
              hasPendingResidencyTransfer={(profile as any).hasPendingResidencyTransfer}
              isPendingResidencyLeave={(profile as any).isPendingResidencyLeave}
              onProfileChanged={handleProfileChanged} />
          )}
          <AccountCard createdAt={profile.createdAt ?? undefined} lastLoginAt={profile.lastLoginAt ?? undefined} />
          <NotificationCard />
        </div>

        {/* Sadhana Graph & Stat cards — Hidden for Super Admins */}
        {!isSuperAdmin && metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatMini icon={Flame} iconColor="text-orange-500"
              value={metrics.currentStreak} label="Sadhana Streak" />
            <StatMini icon={TrendingUp} iconColor="text-primary"
              value={metrics.weeklyAveragePercent != null ? `${metrics.weeklyAveragePercent}%` : '—'}
              label="Sadhana Avg Score" />
            <StatMini icon={Leaf} iconColor="text-green-600"
              value={bvWeeklyScore !== null ? bvWeeklyScore : '—'}
              label="BV Weekly Score" />
            <StatMini icon={Star} iconColor="text-amber-500"
              value={`${ashrayCheckedCount}/${ashrayTotalRequired}`}
              label="Ashraya Checked" />
          </div>
        )}

        {/* Mini CRM — Ashray Journey & Trips/Dues hidden for Super Admins */}
        {crmData && (() => {
          const role = profile.role || '';
          const canEditRent = ['GUIDE', 'SUPER_GUIDE'].includes(role) || !!profile.isFolkLead;
          const isResident = !!(profile.residencyGuideVerified && profile.selectedFolkResidency);

          if (isSuperAdmin) {
            // Super admins only see Rent History if they are residents with rent data
            if (!isResident || !crmData.rentPayments || crmData.rentPayments.length === 0) return null;
            return (
              <div className="space-y-4">
                <RentHistoryCard
                  userId={profile.userId || ''}
                  rentPayments={crmData.rentPayments}
                  canEdit={canEditRent}
                  isOwnProfile={true}
                  isResident={isResident}
                  onRefresh={loadAll}
                />
              </div>
            );
          }

          const canEditTrips = ['GUIDE', 'SUPER_GUIDE'].includes(role) || !!profile.isTripCoordinator;
          return (
            <div className="space-y-4">
              <AshrayJourneyCard ashrayHistory={crmData.ashrayHistory} currentLevel={profile.ashrayLevel || ''} />
              <TripsDuesCard
                userId={profile.userId || ''}
                trips={crmData.trips}
                canEdit={canEditTrips}
                isOwnProfile={true}
                onRefresh={loadAll}
              />
              <RentHistoryCard
                userId={profile.userId || ''}
                rentPayments={crmData.rentPayments}
                canEdit={canEditRent}
                isOwnProfile={true}
                isResident={isResident}
                onRefresh={loadAll}
              />
            </div>
          );
        })()}

        {/* Ashraya Checklist — Hidden for Super Admins */}
        {!isSuperAdmin && ashrayData && ashrayData.practiceGroups.length > 0 && (
          <AshrayCriteriaGrid currentLevel={profile.ashrayLevel || 'Jigyasa'}
            userId={profile.userId} practiceGroups={ashrayData.practiceGroups} />
        )}
      </main>
    </div>
  );
}

function GuideResidencyAssignmentCard({ isSuperGuide }: { isSuperGuide: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [allResidencies, setAllResidencies] = useState<any[]>([]);
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    getGuideResidencyAssignments({} as any)
      .then((res: any) => {
        if (cancelled) return;
        const nextAssigned = Array.isArray(res?.assignedResidencies) ? res.assignedResidencies : [];
        setAssigned(nextAssigned);
        setAllResidencies(Array.isArray(res?.allResidencies) ? res.allResidencies : []);
        setPendingRequest(res?.pendingRequest || null);
        setRequestedIds(Array.isArray(res?.pendingRequest?.requestedResidencyIds) ? res.pendingRequest.requestedResidencyIds : nextAssigned.map((r: any) => r.id));
      })
      .catch(() => {
        if (!cancelled) {
          setAssigned([]); setAllResidencies([]); setPendingRequest(null); setRequestedIds([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (requestedIds.length === 0) {
      toast.error('Select at least one residency');
      return;
    }
    setSaving(true);
    try {
      await requestGuideResidencyAssignment({ residencyIds: requestedIds } as any);
      setPendingRequest({ requestedResidencyIds: requestedIds, status: 'Pending' });
      toast.success('Residency assignment request sent for Super Guide approval');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit residency assignment request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Assigned FOLK Residencies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {assigned.length > 0 ? assigned.map((r: any) => <span key={r.id} className="rounded-full bg-primary/10 px-3 py-1 text-primary font-medium">{r.residencyName}</span>) : <span className="text-muted-foreground">No residency assigned yet.</span>}
            </div>
            {isSuperGuide ? (
              <p className="text-xs text-muted-foreground">Super Guide access includes all active FOLK residencies.</p>
            ) : (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">Residency changes require Super Guide approval.</p>
                <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto">
                  {allResidencies.map((r: any) => <label key={r.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"><input type="checkbox" checked={requestedIds.includes(r.id)} onChange={e => setRequestedIds(prev => e.target.checked ? [...new Set([...prev, r.id])] : prev.filter(id => id !== r.id))} disabled={saving || !!pendingRequest} />{r.residencyName}</label>)}
                </div>
                <Button size="sm" onClick={handleSubmit} disabled={saving || !!pendingRequest || allResidencies.length === 0}>
                  {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />} Request change
                </Button>
                {pendingRequest && <p className="text-xs text-amber-700">A residency change request is pending Super Guide approval.</p>}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatMini({ icon: Icon, iconColor, value, label }: { icon: any; iconColor: string; value: any; label: string }) {
  return (
    <Card>
      <CardContent className="pt-4 text-center">
        <Icon className={`w-6 h-6 ${iconColor} mx-auto mb-1`} />
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-7xl space-y-6 pt-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
