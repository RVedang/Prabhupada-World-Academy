import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users, CalendarCheck, BookOpen, LayoutGrid, AlertCircle, Zap, ClipboardCheck, Database, Building2, CalendarClock } from 'lucide-react';
import BvslOneToOneTab from '@/components/bvsl/BvslOneToOneTab';
import { useAuth } from '@/lib/auth-sdk';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { DashboardLayout } from '@/layouts';
import SuperBvReportTab from '@/components/super/SuperBvReportTab';
import SuperUsersPanel from '@/components/super/SuperUsersPanel';
import SuperStatsPanel from '@/components/super/SuperStatsPanel';
import SendRemindersPanel from '@/components/super/SendRemindersPanel';
import ReportsTab from '@/components/guide/ReportsTab';
import MissingSadhanaTab from '@/components/guide/MissingSadhanaTab';
import TagMangoConfigTab from '@/components/super/TagMangoConfigTab';
import SuperAttendanceTab from '@/components/super/SuperAttendanceTab';
import JigyasaTrackerTab from '@/components/jigyasa/JigyasaTrackerTab';
import TabTransition from '@/components/TabTransition';
import { motion } from 'framer-motion';
import ApprovalsTab from '@/components/guide/ApprovalsTab';
import SuperBvRegistrationsTab from '@/components/super/SuperBvRegistrationsTab';
import BvAdminManagementTab from '@/components/super/BvAdminManagementTab';
import FolkResidencyManagement from '@/components/super/FolkResidencyManagement';
import {
  getCurrentGuide, getPushSubscriptionStats, GetPushSubscriptionStatsOutputType,
  getPendingApprovals, getGuideRequests, getResidencyTransferRequests, getCleanlinessReviews, getPendingBvRegistrations,
} from '@/lib/endpoints-sdk';

export default function FolkGuideDashboard() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const userEmail = (user?.email || '').toLowerCase();

  const queryParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isForceGuideMode = queryParams.get('mode') === 'guide';

  const isSuperAdmin = !isForceGuideMode && !!(
    profile?.isBvSuperAdmin ||
    profile?.role === 'SUPER_ADMIN' ||
    profile?.role === 'SUPER_GUIDE'
  );

  const dashboardTitle = isSuperAdmin
    ? "FOLK Super Guide Dashboard"
    : "FOLK Guide Dashboard";

  const isFolk = profile?.segment === 'FOLK';

  const isBvAdminUser = isSuperAdmin || isForceGuideMode || !!(profile?.isBvAdmin || (profile?.role as string) === 'ADMIN' || (profile?.role as string) === 'SUPER_ADMIN');

  useEffect(() => {
    if (profile) {
      if (!isBvAdminUser) {
        navigate('/user/folk-dashboard', { replace: true });
      } else if (profile.segment !== 'FOLK') {
        navigate('/pw-admin/dashboard', { replace: true });
      }
    }
  }, [profile, isBvAdminUser, navigate]);

  const dashboardRole = isSuperAdmin ? "SUPER_ADMIN" : (isBvAdminUser ? "ADMIN" : "USER");
  const [adminName, setAdminName] = useState(profile?.fullName || "");
  const [guideId, setGuideId] = useState<string>('');

  const initialTab = typeof window !== 'undefined' ? window.location.hash.slice(1) || 'sadhana' : 'sadhana';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [approvalCount, setApprovalCount] = useState(0);
  const [bvRegCount, setBvRegCount] = useState(0);

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
    const search = typeof window !== 'undefined' ? window.location.search : '';
    window.history.pushState(null, '', `${search}#${tab}`);
  };

  useEffect(() => {
    if (user?.email) {
      getCurrentGuide({ email: user.email }).then(r => {
        if (r.guide?.fullName) setAdminName(r.guide.fullName);
        if (r.guide?.id) setGuideId(r.guide.id);
      }).catch(() => {});

      Promise.all([
        getPendingApprovals({ guideId: 'ALL' }).catch(() => []),
        getGuideRequests({ guideId: 'ALL' }).catch(() => ({ guideTransfers: [], ashrayUpgrades: [] })),
        getResidencyTransferRequests({ guideId: 'ALL' } as any).catch(() => []),
        getCleanlinessReviews({ guideId: 'ALL' }).catch(() => []),
        getPendingBvRegistrations({ segment: 'FOLK' }).catch(() => []),
      ]).then(([pending, requests, resTrans, cleanReviews, bvRegs]) => {
        const pendingArr = Array.isArray(pending) ? pending : (pending as any).records || [];
        const guideTransfers = Array.isArray(requests?.guideTransfers) ? requests.guideTransfers : [];
        const ashrayUpgrades = Array.isArray(requests?.ashrayUpgrades) ? requests.ashrayUpgrades : [];
        const resTransfers = Array.isArray(resTrans) ? resTrans : [];
        const cleanliness = Array.isArray(cleanReviews) ? cleanReviews : [];

        const totalUserApprovals = pendingArr.length + guideTransfers.length + ashrayUpgrades.length + resTransfers.length + cleanliness.length;
        setApprovalCount(totalUserApprovals);

        const bvRegsArr = Array.isArray(bvRegs) ? bvRegs : (bvRegs as any).records || [];
        setBvRegCount(bvRegsArr.length);
      }).catch(() => {});
    }
  }, [user]);

  const navItems = [
    { id: 'sadhana', label: 'Sadhana Report', icon: BookOpen },
    { id: 'bv', label: 'Bhakti Vriksha Report', icon: LayoutGrid },
    { id: 'users', label: 'Members / Users', icon: Users },
    { id: 'approvals', label: 'Approvals', icon: AlertCircle, count: approvalCount },
    { id: 'bhakti-vriksha', label: 'Bhakti Vriksha', icon: ClipboardCheck, count: bvRegCount },
    { id: 'missing-sadhana', label: 'Missing Sadhana', icon: AlertCircle },
    ...(isSuperAdmin ? [
      { id: 'stats', label: 'Stats', icon: Zap },
      { id: 'residencies', label: 'Residencies / Hostels', icon: Building2 },
      { id: 'reminders', label: 'Send Reminders', icon: Zap },
    ] : []),
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'callreports', label: '1:1 Call Reports', icon: CalendarClock },
    { id: 'jigyasa', label: 'Jigyasa', icon: BookOpen },
    ...(isSuperAdmin ? [
      { id: 'tagmango', label: 'TagMango Sync', icon: Zap },
    ] : []),
  ];

  const cleanAdminName = (adminName || '').replace(/Super Guide/gi, '').replace(/Guide/gi, '').trim();

  return (
    <DashboardLayout
      title={dashboardTitle}
      subtitle={`Hare Krishna ${profile?.fullName || cleanAdminName || 'Guide'}!`}
      role={dashboardRole}
      maxWidth="max-w-none"
    >
      <div className="flex flex-col md:flex-row gap-6">
        <div className="block md:hidden mb-4">
          <Select value={activeTab} onValueChange={(val) => handleTabChange(val || '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Tab..." />
            </SelectTrigger>
            <SelectContent>
              {navItems.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label} {item.count ? `(${item.count})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <aside className="hidden md:block w-60 shrink-0">
          <div className="sticky top-20 space-y-1 bg-card p-3 rounded-xl border border-border shadow-sm">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.id === 'bhakti-vriksha' && (activeTab === 'bv-registrations' || activeTab === 'bv-admins'));
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.count != null && item.count > 0 && (
                    <Badge variant={isActive ? "secondary" : "default"} className="ml-2 text-xs shrink-0">
                      {item.count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <TabTransition activeTab={activeTab}>
            {activeTab === 'sadhana' && <ReportsTab segment="FOLK" guideId={isSuperAdmin ? '' : guideId} isSuperAdminOverride={isSuperAdmin} />}
            {activeTab === 'bv' && <SuperBvReportTab segment="FOLK" guideId={isSuperAdmin ? '' : guideId} isSuperAdminOverride={isSuperAdmin} />}
            {activeTab === 'users' && <SuperUsersPanel segment="FOLK" isSuperAdminOverride={isSuperAdmin} />}
            {activeTab === 'approvals' && <ApprovalsTab />}
            {(activeTab === 'bhakti-vriksha' || activeTab === 'bv-registrations' || activeTab === 'bv-admins') && (
              <div className="space-y-8">
                <SuperBvRegistrationsTab segment="FOLK" />
                <div className="pt-6 border-t border-border">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-foreground">Bhakti Vriksha Groups & Roles</h2>
                    <p className="text-sm text-muted-foreground">Manage Bhakti Vriksha reading groups, assign supervisors, RGFs, RGSFs, and member allocations</p>
                  </div>
                  <BvAdminManagementTab />
                </div>
              </div>
            )}
            {activeTab === 'residencies' && isSuperAdmin && <FolkResidencyManagement />}
            {activeTab === 'stats' && isSuperAdmin && <SuperStatsPanel segment="FOLK" />}
            {activeTab === 'missing-sadhana' && <MissingSadhanaTab segment="FOLK" />}
            {activeTab === 'attendance' && <SuperAttendanceTab segment="FOLK" />}
            {activeTab === 'jigyasa' && <JigyasaTrackerTab />}
            {activeTab === 'tagmango' && isSuperAdmin && <TagMangoConfigTab />}
            {activeTab === 'reminders' && isSuperAdmin && <SendRemindersPanel segment="FOLK" />}
            {activeTab === 'callreports' && <BvslOneToOneTab />}
          </TabTransition>
        </main>
      </div>
    </DashboardLayout>
  );
}
