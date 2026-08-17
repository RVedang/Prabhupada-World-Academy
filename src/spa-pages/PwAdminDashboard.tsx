import React, { useEffect, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, CalendarCheck, BookOpen, LayoutGrid, AlertCircle, Zap, ClipboardCheck, Database, Leaf, CalendarClock, Bell, Video } from 'lucide-react';
import BvslOneToOneTab from '@/components/bvsl/BvslOneToOneTab';
import { useAuth } from '@/lib/auth-sdk';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { DashboardLayout } from '@/layouts';
import { LoadingPage } from '@/shared';
import TabTransition from '@/components/TabTransition';
import TabErrorBoundary from '@/components/TabErrorBoundary';
import { motion } from 'framer-motion';

const SuperBvReportTab = lazy(() => import('@/components/super/SuperBvReportTab'));
const SuperUsersPanel = lazy(() => import('@/components/super/SuperUsersPanel'));
const SuperStatsPanel = lazy(() => import('@/components/super/SuperStatsPanel'));
const SendRemindersPanel = lazy(() => import('@/components/super/SendRemindersPanel'));
const ReportsTab = lazy(() => import('@/components/guide/ReportsTab'));
const MissingSadhanaTab = lazy(() => import('@/components/guide/MissingSadhanaTab'));
const TagMangoConfigTab = lazy(() => import('@/components/super/TagMangoConfigTab'));
const SuperAttendanceTab = lazy(() => import('@/components/super/SuperAttendanceTab'));
const JigyasaTrackerTab = lazy(() => import('@/components/jigyasa/JigyasaTrackerTab'));
const ApprovalsTab = lazy(() => import('@/components/guide/ApprovalsTab'));
const SuperBvRegistrationsTab = lazy(() => import('@/components/super/SuperBvRegistrationsTab'));
const BvAdminManagementTab = lazy(() => import('@/components/super/BvAdminManagementTab'));
const MeetingsAndMomTab = lazy(() => import('@/components/super/MeetingsAndMomTab'));
import {
  getCurrentGuide, getPushSubscriptionStats, GetPushSubscriptionStatsOutputType,
  getPendingApprovals, getGuideRequests, getResidencyTransferRequests, getCleanlinessReviews,
  getPendingBvRegistrations,
} from '@/lib/endpoints-sdk';

export default function PwAdminDashboard() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const userEmail = (user?.email || '').toLowerCase();
  const isFolk = profile?.segment === 'FOLK' || userEmail.includes('gaurmandal') || userEmail.includes('folk.org');

  const isSuperAdmin = !!(
    profile?.isBvSuperAdmin ||
    profile?.role === 'SUPER_ADMIN' ||
    userEmail === 'hrvd@hkmmumbai.org' ||
    userEmail === 'srilaprabhupadaworld@gmail.com' ||
    userEmail.includes('gaurmandal')
  );

  const dashboardTitle = isSuperAdmin
    ? "Prabhupada World Super Admin Dashboard"
    : "Prabhupada World Admin Dashboard";

  const isBvAdminUser = isSuperAdmin || !!(profile?.isBvAdmin || (profile?.role as string) === 'ADMIN' || (profile?.role as string) === 'SUPER_ADMIN');

  useEffect(() => {
    if (profile) {
      if (!isBvAdminUser) {
        const targetUserDashboard = isFolk ? '/user/folk-dashboard' : '/user/pw-dashboard';
        navigate(targetUserDashboard, { replace: true });
      } else if (isFolk) {
        navigate('/folk-guide/dashboard', { replace: true });
      }
    }
  }, [profile, isBvAdminUser, isFolk, navigate]);

  const dashboardRole = isSuperAdmin ? "SUPER_ADMIN" : (isBvAdminUser ? "ADMIN" : "USER");
  const defaultAdminName = "Hiranyavarna Das";
  const [adminName, setAdminName] = useState(defaultAdminName);
  const [pushStats, setPushStats] = useState<GetPushSubscriptionStatsOutputType | null>(null);

  const initialTab = typeof window !== 'undefined' ? window.location.hash.slice(1) || 'sadhana' : 'sadhana';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [approvalCount, setApprovalCount] = useState(0);
  const [bvRegCount, setBvRegCount] = useState(0);

  // Sync with browser back/forward buttons
  useEffect(() => {
    const onPop = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    window.history.pushState(null, '', `#${tab}`);
  };

  useEffect(() => {
    if (user?.email) {
      getCurrentGuide({ email: user.email }).then(r => {
        if (r.guide?.fullName) setAdminName(r.guide.fullName);
      }).catch(() => {});
      getPushSubscriptionStats({ segment: 'PW' }).then(setPushStats).catch(() => {});
    }
  }, [user?.email]);

  // Fetch pending approvals total count & BV registrations count for badges
  useEffect(() => {
    Promise.all([
      getPendingApprovals({ guideId: 'ALL' }),
      getGuideRequests({ guideId: 'ALL' }),
      getResidencyTransferRequests({ guideId: 'ALL' } as any),
      getCleanlinessReviews({ guideId: 'ALL' }).catch(() => []),
      getPendingBvRegistrations({ segment: 'PW' }).catch(() => []),
    ]).then(([pending, requests, resTrans, cleanReviews, bvRegs]) => {
      setApprovalCount(
        pending.length + requests.guideTransfers.length + requests.ashrayUpgrades.length + resTrans.length + (Array.isArray(cleanReviews) ? cleanReviews.length : 0)
      );
      setBvRegCount(Array.isArray(bvRegs) ? bvRegs.length : 0);
    }).catch(() => {});
  }, []);

  const SidebarButton = ({ value, label, icon: Icon, badge }: { value: string; label: string; icon: any; badge?: number }) => {
    const isActive = activeTab === value || (value === 'bhakti-vriksha' && activeTab === 'bv-registrations');
    return (
      <button
        onClick={() => handleTabChange(value)}
        className="relative w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:text-foreground"
      >
        {isActive && (
          <motion.div
            layoutId="pwActiveHighlight"
            className="absolute inset-0 bg-primary/10 rounded-lg border border-primary/20"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <div className="relative z-10 flex items-center gap-2">
          <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={isActive ? 'text-primary font-semibold text-left' : 'text-left'}>{label}</span>
        </div>
        {badge != null && badge > 0 && (
          <span className="relative z-10 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <DashboardLayout
      title={dashboardTitle}
      subtitle={`Hare Krishna ${(adminName || 'Admin').split(' ')[0]} Prabhu!`}
      role={dashboardRole}
      maxWidth="max-w-none"
    >
      {/* Mobile Select Tab Selector */}
      <div className="block md:hidden mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
          Navigate Dashboard
        </label>
        <Select value={activeTab} onValueChange={(val) => val && handleTabChange(val)}>
          <SelectTrigger className="w-full bg-card border">
            <SelectValue placeholder="Select tab..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sadhana">Sadhana Report</SelectItem>
            <SelectItem value="bv">Bhakti Vriksha Report</SelectItem>
            <SelectItem value="users">Members / Users</SelectItem>
            <SelectItem value="approvals">
              Approvals {approvalCount > 0 ? `(${approvalCount})` : ''}
            </SelectItem>
            <SelectItem value="bhakti-vriksha">
              Bhakti Vriksha {bvRegCount > 0 ? `(${bvRegCount})` : ''}
            </SelectItem>
            <SelectItem value="meetings">Meetings & MoM</SelectItem>
            <SelectItem value="reminders">Notifications</SelectItem>
            {isSuperAdmin && <SelectItem value="stats">Stats</SelectItem>}
            <SelectItem value="missing-sadhana">Missing Sadhana</SelectItem>
            <SelectItem value="attendance">Attendance</SelectItem>
            <SelectItem value="callreports">1:1 Call Reports</SelectItem>
            <SelectItem value="jigyasa">Jigyasa</SelectItem>
            <SelectItem value="tagmango">TagMango</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Desktop Sidebar Navigation */}
        <div className="hidden md:block w-64 shrink-0 sticky top-[93px] self-start max-h-[calc(100vh-125px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="bg-card border rounded-xl p-3 space-y-0.5 shadow-sm">
            <SidebarButton value="sadhana" label="Sadhana Report" icon={Database} />
            <SidebarButton value="bv" label="Bhakti Vriksha Report" icon={CalendarCheck} />
            <SidebarButton value="users" label="Members / Users" icon={Users} />
            <SidebarButton value="approvals" label="Approvals" icon={ClipboardCheck} badge={approvalCount} />
            <SidebarButton value="bhakti-vriksha" label="Bhakti Vriksha" icon={Leaf} badge={bvRegCount} />
            <SidebarButton value="meetings" label="Meetings & MoM" icon={Video} />
            <SidebarButton value="reminders" label="Notifications" icon={Bell} />
            {isSuperAdmin && <SidebarButton value="stats" label="Stats" icon={LayoutGrid} />}
            <SidebarButton value="missing-sadhana" label="Missing Sadhana" icon={AlertCircle} />
            <SidebarButton value="attendance" label="Attendance" icon={ClipboardCheck} />
            <SidebarButton value="callreports" label="1:1 Call Reports" icon={CalendarClock} />
            <SidebarButton value="jigyasa" label="Jigyasa" icon={BookOpen} />
            <SidebarButton value="tagmango" label="TagMango" icon={Zap} />
          </div>
        </div>

        {/* Content Pane */}
        <div className="flex-1 min-w-0 bg-card border rounded-xl p-6 shadow-sm min-h-[500px]">
          <TabErrorBoundary tabName={activeTab}>
            <Suspense fallback={<LoadingPage rows={2} />}>
              <TabTransition activeTab={activeTab}>
                {activeTab === 'sadhana' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Sadhana Reports</h2>
                      <p className="text-sm text-muted-foreground">Overview of all Prabhupada World sadhana records</p>
                    </div>
                    <ReportsTab guideId="ALL" />
                  </div>
                )}

                {activeTab === 'bv' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Bhakti Vriksha Preaching Overview</h2>
                      <p className="text-sm text-muted-foreground">Bhakti Vriksha attendance and group reports</p>
                    </div>
                    <SuperBvReportTab isPwAdmin={true} />
                  </div>
                )}

                {activeTab === 'users' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Prabhupada World Members</h2>
                      <p className="text-sm text-muted-foreground">All registered members — sortable, filterable, with role management</p>
                    </div>
                    <SuperUsersPanel isPwAdmin={true} />
                  </div>
                )}

                {activeTab === 'approvals' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Ashraya Requests & Approvals</h2>
                      <p className="text-sm text-muted-foreground">Review and approve Ashraya upgrade requests for Prabhupada World members</p>
                    </div>
                    <ApprovalsTab guideId="ALL" isSuperGuide={true} isPwAdmin={true} />
                  </div>
                )}

                {(activeTab === 'bhakti-vriksha' || activeTab === 'bv-registrations') && (
                  <div className="space-y-6">
                    <SuperBvRegistrationsTab segment="PW" />
                    <hr className="my-6 border-t" />
                    <BvAdminManagementTab />
                  </div>
                )}

                {activeTab === 'reminders' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Sadhana Reminders & Notifications</h2>
                      <p className="text-sm text-muted-foreground">Configure automatic Sadhana reminders, custom schedule times, and dispatch instant push notifications</p>
                    </div>
                    <div className="space-y-6">
                      <SendRemindersPanel segment="PW" />
                    </div>
                  </div>
                )}

                {activeTab === 'stats' && isSuperAdmin && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">System Stats & Administration</h2>
                      <p className="text-sm text-muted-foreground">Aggregate metrics and data management</p>
                    </div>
                    <div className="space-y-6">
                      <SuperStatsPanel />
                    </div>
                  </div>
                )}

                {activeTab === 'missing-sadhana' && (
                  <div>
                    <MissingSadhanaTab guideId="ALL" />
                  </div>
                )}

                {activeTab === 'attendance' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Attendance Report</h2>
                      <p className="text-sm text-muted-foreground">Course and session attendance records</p>
                    </div>
                    <SuperAttendanceTab />
                  </div>
                )}

                {activeTab === 'jigyasa' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Jigyasa Attendance Tracker</h2>
                      <p className="text-sm text-muted-foreground">Upload TagMango CSVs and track session attendance</p>
                    </div>
                    <JigyasaTrackerTab canUpload={true} />
                  </div>
                )}

                {activeTab === 'tagmango' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">TagMango Configuration</h2>
                      <p className="text-sm text-muted-foreground">Manage API credentials and course ID mappings for auto-enrollment</p>
                    </div>
                    <TagMangoConfigTab />
                  </div>
                )}

                {activeTab === 'meetings' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">Meetings & Minutes of Meeting (MoM)</h2>
                      <p className="text-sm text-muted-foreground">Schedule meetings, track attendance, and record actionable Minutes of Meeting</p>
                    </div>
                    <MeetingsAndMomTab allowSchedule={true} />
                  </div>
                )}

                {activeTab === 'callreports' && (
                  <div>
                    <div className="space-y-1 mb-4">
                      <h2 className="text-lg font-bold">1:1 Call Reports</h2>
                      <p className="text-sm text-muted-foreground">All one-on-one call logs between Facilitators (RGF) and their members</p>
                    </div>
                    <BvslOneToOneTab />
                  </div>
                )}
              </TabTransition>
            </Suspense>
          </TabErrorBoundary>
        </div>
      </div>
    </DashboardLayout>
  );
}
