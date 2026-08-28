import React, { useEffect, useState, useCallback } from 'react';
import { Users, CheckSquare, BarChart3, BookOpen, FileText, Brain, GraduationCap, CalendarClock, ClipboardList, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getBvslGroups, getCurrentGuide } from '@/lib/endpoints-sdk';
import { useNavigate } from 'react-router-dom';
import type { GetBvslGroupsOutputType } from '@/lib/endpoints-sdk';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { useAuth } from '@/lib/auth-sdk';
import { DashboardLayout } from '@/layouts';
import { LoadingPage } from '@/shared';
import TabRouter from '@/shared/TabRouter';
import type { TabConfig } from '@/shared/TabRouter';
import BvslGroupsPanel from '@/components/bvsl/BvslGroupsPanel';
import BvslSessionPanel from '@/components/bvsl/BvslSessionPanel';
import BvslMembersTable from '@/components/bvsl/BvslMembersTable';
import BvslSadhanaReportPanel from '@/components/bvsl/BvslSadhanaReportPanel';
import BvslQuizPanel from '@/components/bvsl/BvslQuizPanel';
import BvSection from '@/components/guide/BvSection';
import BvslOneToOneTab from '@/components/bvsl/BvslOneToOneTab';
import BvslWeeklyPlanTab from '@/components/bvsl/BvslWeeklyPlanTab';
import SuperBvRegistrationsTab from '@/components/super/SuperBvRegistrationsTab';
import { Toaster } from '@/components/ui/sonner';
import MeetingsAndMomTab from '@/components/super/MeetingsAndMomTab';

export default function BvslDashboard() {
  const { profile } = useUserProfile();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GetBvslGroupsOutputType['groups']>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');

  const isFolk = profile?.segment === 'FOLK';
  const isSuperAdmin = !!(profile?.isBvSuperAdmin || profile?.role === 'SUPER_ADMIN' || profile?.isBvAdmin);

  useEffect(() => { if (profile?.userId) loadGroups(); }, [profile?.userId]);

  useEffect(() => {
    if (authUser?.email && !isSuperAdmin) {
      getCurrentGuide({ email: authUser.email }).then(r => {
        if (r.guide?.fullName) setDisplayName(r.guide.fullName);
      }).catch(() => {});
    }
  }, [authUser?.email, isSuperAdmin]);

  const loadGroups = useCallback(async () => {
    const bvslId = profile?.userId;
    if (!bvslId) return;
    setLoading(true);
    try {
      const res = await getBvslGroups({ bvslId });
      setGroups(res.groups);
    } catch { toast.error('Failed to load groups'); }
    finally { setLoading(false); }
  }, [profile?.userId]);

  if (!profile) return <LoadingPage />;

  const bvslId = profile.userId || '';

  const isSubFacilitatorOnly = Boolean(
    profile.isBvSubFacilitator &&
    !profile.isBvFacilitator &&
    !profile.isBvsl &&
    !profile.isBvSupervisor &&
    !profile.isBvAdmin &&
    !profile.isBvSuperAdmin
  );
  const canView1on1 = !isSubFacilitatorOnly;

  const tabs: TabConfig[] = [
    { value: 'weekplan',  label: 'Weekly Plan', icon: ClipboardList },
    { value: 'groups',    label: 'Groups',      icon: Users },
    { value: 'session',   label: 'Attendance',  icon: CheckSquare },
    { value: 'quizzes',   label: 'Quizzes',     icon: Brain },
    { value: 'bvreport',  label: 'BV Report',   icon: BarChart3 },
    { value: 'report',    label: 'Sadhana',     icon: FileText },
    { value: 'members',   label: 'Members',     icon: BarChart3 },
    ...(canView1on1 ? [{ value: 'onetone', label: '1:1 Call Reports', icon: CalendarClock }] : []),
    { value: 'meetings',  label: 'Meetings & MoM', icon: Video },
  ];

  const defaultName = isFolk ? 'FOLK' : 'Prabhupada World';
  const headerName = isSuperAdmin ? defaultName : (displayName || defaultName);
  const roleTitle = isSubFacilitatorOnly ? 'Reading Group Sub-Facilitator Dashboard' : 'Reading Group Facilitator Dashboard';
  const subtitle = [
    `Hare Krishna ${headerName} Prabhu`,
    isSubFacilitatorOnly ? 'Sub-Facilitator (RGSF)' : 'Facilitator (RGF)',
    profile.ashrayLevel ? `Ashray: ${profile.ashrayLevel}` : null,
    profile.guideName ? `Guide: ${profile.guideName}` : null,
    profile.residencyName ? `FOLK: ${profile.residencyName}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <DashboardLayout
      title={roleTitle}
      subtitle={subtitle}
      role={profile.isBvSubFacilitator ? 'RGSF' : 'RGF'}
      maxWidth="max-w-6xl"
    >
      <Toaster />
      {loading ? <LoadingPage rows={2} /> : (
        <TabRouter tabs={tabs} defaultTab="weekplan" desktopCols={canView1on1 ? 9 : 8}>
          {(activeTab) => (
            <>
              {activeTab === 'weekplan' && <BvslWeeklyPlanTab userEmail={authUser?.email || ''} />}
              {activeTab === 'groups' && (
                <BvslGroupsPanel bvslId={bvslId} groups={groups}
                  onGroupSelect={(groupId) => navigate(`/bvsl/groups/${groupId}`)}
                  onRefresh={loadGroups} />
              )}
              {activeTab === 'session' && <BvslSessionPanel bvslId={bvslId} groups={groups} />}
              {activeTab === 'members' && <BvslMembersTable bvslId={bvslId} />}
              {activeTab === 'bvreport' && <BvSection guideId={bvslId} bvslMode />}
              {activeTab === 'report' && <BvslSadhanaReportPanel bvslId={bvslId} />}
              {activeTab === 'quizzes' && (
                <BvslQuizPanel
                  bvslId={bvslId}
                  groups={groups.map((g: any) => ({ id: g.id, groupName: g.groupName }))}
                />
              )}
              {activeTab === 'onetone' && <BvslOneToOneTab />}
              {activeTab === 'meetings' && <MeetingsAndMomTab />}
            </>
          )}
        </TabRouter>
      )}
    </DashboardLayout>
  );
}
