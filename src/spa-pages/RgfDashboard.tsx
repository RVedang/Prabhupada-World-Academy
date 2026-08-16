import React, { useEffect, useState, useCallback } from 'react';
import { Users, CheckSquare, BarChart3, FileText, Brain, CalendarClock, ClipboardList, Clock, Video } from 'lucide-react';
import { toast } from 'sonner';
import { getBvslGroups, getPendingBvRegistrations } from '@/lib/endpoints-sdk';
import { useNavigate } from 'react-router-dom';
import type { GetBvslGroupsOutputType } from '@/lib/endpoints-sdk';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { useAuth } from '@/lib/auth-sdk';
import { DashboardLayout } from '@/layouts';
import { LoadingPage } from '@/shared';
import TabRouter, { TabConfig } from '@/shared/TabRouter';
import BvslGroupsPanel from '@/components/bvsl/BvslGroupsPanel';
import BvslSessionPanel from '@/components/bvsl/BvslSessionPanel';
import BvslMembersTable from '@/components/bvsl/BvslMembersTable';
import BvslSadhanaReportPanel from '@/components/bvsl/BvslSadhanaReportPanel';
import BvslQuizPanel from '@/components/bvsl/BvslQuizPanel';
import BvSection from '@/components/guide/BvSection';
import BvslOneToOneTab from '@/components/bvsl/BvslOneToOneTab';
import BvslWeeklyPlanTab from '@/components/bvsl/BvslWeeklyPlanTab';
import SuperBvRegistrationsTab from '@/components/super/SuperBvRegistrationsTab';
import MeetingsAndMomTab from '@/components/super/MeetingsAndMomTab';

export default function RgfDashboard() {
  const { profile } = useUserProfile();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GetBvslGroupsOutputType['groups']>([]);
  const [loading, setLoading] = useState(true);
  const [bvRegCount, setBvRegCount] = useState(0);

  useEffect(() => { if (profile?.userId) loadGroups(); }, [profile?.userId]);

  const loadGroups = useCallback(async () => {
    const bvslId = profile?.userId;
    if (!bvslId) return;
    setLoading(true);
    try {
      const [res, bvRegs] = await Promise.all([
        getBvslGroups({ bvslId }),
        getPendingBvRegistrations({}).catch(() => []),
      ]);
      setGroups(res.groups);
      setBvRegCount(Array.isArray(bvRegs) ? bvRegs.length : 0);
    } catch {
      toast.error('Failed to load facilitator groups');
    } finally {
      setLoading(false);
    }
  }, [profile?.userId]);

  if (!profile) return <LoadingPage />;

  const bvslId = profile.userId || '';

  const subtitle = [
    'Reading Group Facilitator (RGF)',
    profile.ashrayLevel ? `Ashray: ${profile.ashrayLevel}` : null,
    (profile as any).bvReportingSupervisorName
      ? `Supervisor: ${(profile as any).bvReportingSupervisorName}`
      : profile.guideName ? `Guide: ${profile.guideName}` : null,
    profile.residencyName ? `FOLK: ${profile.residencyName}` : null,
  ].filter(Boolean).join(' · ');

  const tabs: TabConfig[] = [
    { value: 'weekplan',  label: 'Weekly Plan', icon: ClipboardList },
    { value: 'groups',    label: 'Groups',      icon: Users },
    { value: 'session',   label: 'Attendance',  icon: CheckSquare },
    { value: 'pending',   label: `Pending Applicants${bvRegCount > 0 ? ` (${bvRegCount})` : ''}`, icon: Clock },
    { value: 'quizzes',   label: 'Quizzes',     icon: Brain },
    { value: 'bvreport',  label: 'BV Report',   icon: BarChart3 },
    { value: 'report',    label: 'Sadhana',     icon: FileText },
    { value: 'members',   label: 'Members',     icon: Users },
    { value: 'onetone',   label: '1:1 Call Reports', icon: CalendarClock },
    { value: 'meetings',  label: 'Meetings & MoM', icon: Video },
  ];

  return (
    <DashboardLayout
      title={`Hare Krishna, ${profile.fullName} Prabhu`}
      subtitle={subtitle}
      role="RGF"
      maxWidth="max-w-6xl"
    >
      {loading ? <LoadingPage rows={2} /> : (
        <TabRouter tabs={tabs} defaultTab="weekplan" desktopCols={10}>
          {(activeTab) => (
            <>
              {activeTab === 'weekplan' && <BvslWeeklyPlanTab userEmail={authUser?.email || ''} />}
              {activeTab === 'groups' && (
                <BvslGroupsPanel
                  bvslId={bvslId}
                  groups={groups}
                  onGroupSelect={(groupId) => navigate(`/bvsl/groups/${groupId}`)}
                  onRefresh={loadGroups}
                />
              )}
              {activeTab === 'session' && <BvslSessionPanel bvslId={bvslId} groups={groups} />}
              {activeTab === 'pending' && <SuperBvRegistrationsTab />}
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
