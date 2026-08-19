import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Home, BookOpen, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { getGuides, getGuideUsers, getAllResidenciesWithStats, deletePendingApprovals, hardDeleteBvGroups, getSystemBvGroups } from '@/lib/endpoints-sdk';
import type { GetGuidesOutputType, GetSystemBvGroupsOutputType } from '@/lib/endpoints-sdk';
import { Button } from '@/components/ui/button';

import { useUserProfile } from '@/contexts/UserProfileContext';

type GuideStat = GetGuidesOutputType['guides'][0] & { userCount: number; avgScore: number | null };

interface SuperStatsPanelProps {
  segment?: 'PW' | 'FOLK';
}

export default function SuperStatsPanel({ segment }: SuperStatsPanelProps) {
  const { profile } = useUserProfile();
  const userEmail = (profile?.userId || '').toLowerCase();
  const effectiveSegment = segment || profile?.segment || (userEmail.includes('prabhupadaworld') || userEmail.includes('hrvd') ? 'PW' : 'FOLK');
  const isPw = effectiveSegment === 'PW';

  const [guideStats, setGuideStats] = useState<GuideStat[]>([]);
  const [totalHostels, setTotalHostels] = useState(0);
  const [systemGroups, setSystemGroups] = useState<GetSystemBvGroupsOutputType['groups']>([]);
  const [loading, setLoading] = useState(true);

  const reloadSystemGroups = async () => {
    try {
      const res = await getSystemBvGroups({});
      setSystemGroups(res.groups);
    } catch {}
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [{ guides }, hostels, sysGroupsRes] = await Promise.all([
          getGuides({ segment: effectiveSegment }),
          getAllResidenciesWithStats({}).catch(() => [] as any[]),
          getSystemBvGroups({}).catch(() => ({ groups: [] as any[] })),
        ]);
        setTotalHostels((hostels as any[]).filter((h: any) => h.isActive).length);
        setSystemGroups(sysGroupsRes.groups);
        const stats = await Promise.all(
          guides.map((g: any) =>
            getGuideUsers({ guideId: g.guideId, statusFilter: 'active' })
              .then(r => {
                const scored = r.users.filter((u: any) => u.latestScore != null);
                const avg = scored.length > 0
                  ? Math.round(scored.reduce((s: number, u: any) => s + (u.latestScore || 0), 0) / scored.length)
                  : null;
                return { ...g, userCount: r.users.length, avgScore: avg };
              })
              .catch(() => ({ ...g, userCount: 0, avgScore: null as null }))
          )
        );
        setGuideStats(stats);
      } catch { toast.error('Failed to load stats'); }
      finally { setLoading(false); }
    };
    load();
  }, [isPw]);

  const totalUsers = guideStats.reduce((s, g) => s + g.userCount, 0);
  const overallAvg = guideStats.filter(g => g.avgScore != null).length > 0
    ? Math.round(guideStats.filter(g => g.avgScore != null).reduce((s, g) => s + (g.avgScore || 0), 0) / guideStats.filter(g => g.avgScore != null).length)
    : null;

  if (loading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${isPw ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
        <StatCard icon={<Users className="w-5 h-5 text-primary" />} label="Total Users" value={totalUsers} />
        <StatCard icon={<BookOpen className="w-5 h-5 text-blue-500" />} label={isPw ? "Total Admins" : "Total Guides"} value={guideStats.length} />
        {!isPw && <StatCard icon={<Home className="w-5 h-5 text-green-600" />} label="Active Hostels" value={totalHostels} />}
        <StatCard icon={<BarChart3 className="w-5 h-5 text-amber-500" />} label="Overall Avg Score" value={overallAvg != null ? `${overallAvg}%` : '—'} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isPw ? "Admin-wise Breakdown" : "Guide-wise Breakdown"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isPw ? "Admin / Mentor" : "Guide"}</TableHead>
                <TableHead className="text-center">Active Users</TableHead>
                <TableHead className="text-center">Avg Sadhana Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guideStats.map(g => (
                <TableRow key={g.guideId}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-center"><Badge variant="secondary">{g.userCount}</Badge></TableCell>
                  <TableCell className="text-center">
                    {g.avgScore != null
                      ? <span className={`font-bold ${g.avgScore >= 80 ? 'text-green-600' : g.avgScore >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{g.avgScore}%</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            ⚠️ Administrative Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Use these tools with caution. The following action will permanently delete all pending user registrations, level requests, and transfers across the database.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!window.confirm("ARE YOU ABSOLUTELY SURE you want to delete ALL pending registrations, upgrades, and transfers? This cannot be undone.")) {
                  return;
                }
                const loadToast = toast.loading("Deleting all pending approvals...");
                try {
                  const res = await deletePendingApprovals({});
                  toast.dismiss(loadToast);
                  if (res.success) {
                    toast.success(
                      `Cleaned up: ${res.deletedUsersCount} users, ${res.deletedAshrayCount} upgrades, ${res.deletedGuideTransfersCount} guide transfers, ${res.deletedResidencyTransfersCount} residency transfers, ${res.deletedBvRegistrationsCount} BV regs.`
                    );
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    toast.error("Failed to delete pending approvals.");
                  }
                } catch (e: any) {
                  toast.dismiss(loadToast);
                  toast.error(`Error: ${e.message || "Failed to process request"}`);
                }
              }}
            >
              Delete All Pending Approvals
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!window.confirm("Delete all dummy Bhakti Vriksha groups (Blissful Sanga, Bhakti Sadhana, Srinivasa, Back to Godhead, Sadhana Report Submission)? This cannot be undone.")) {
                  return;
                }
                const loadToast = toast.loading("Deleting dummy BV groups...");
                try {
                  const res = await hardDeleteBvGroups({
                    groupNames: ['Blissful Sanga', 'Bhakti Sadhana', 'Srinivasa', 'Back to Godhead', 'Sadhana Report Submission'],
                  });
                  toast.dismiss(loadToast);
                  toast.success(`Deleted ${res.deleted} dummy group(s). ${res.details.join(' | ')}`);
                  reloadSystemGroups();
                } catch (e: any) {
                  toast.dismiss(loadToast);
                  toast.error(`Error: ${e.message || 'Failed to delete groups'}`);
                }
              }}
            >
              Delete 5 Default Dummy BV Groups
            </Button>
          </div>

          <div className="border-t border-destructive/20 pt-4 mt-4 space-y-3">
            <h4 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
              Permanent Bhakti Vriksha Groups Deletion ({systemGroups.length} total)
            </h4>
            <p className="text-xs text-muted-foreground">
              Search and delete any active or dummy Bhakti Vriksha groups directly from Firestore.
            </p>
            <div className="max-h-[300px] overflow-y-auto border rounded-md bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group Name</TableHead>
                    <TableHead>Facilitator (RGF)</TableHead>
                    <TableHead className="text-center">Segment</TableHead>
                    <TableHead className="text-center">Members</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">
                        No Bhakti Vriksha groups found in system.
                      </TableCell>
                    </TableRow>
                  ) : (
                    systemGroups.map((g: any) => (
                      <TableRow key={g.id} className="text-xs">
                        <TableCell className="font-semibold">{g.groupName}</TableCell>
                        <TableCell>{g.bvslName || '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={g.segment === 'PW' ? 'border-primary text-primary' : 'border-blue-500 text-blue-500'}>
                            {g.segment || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold">{g.memberCount}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={g.isActive ? 'default' : 'secondary'}>
                            {g.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={async () => {
                              if (!window.confirm(`Are you absolutely sure you want to permanently delete "${g.groupName}"? All group data and member associations will be erased.`)) {
                                return;
                              }
                              const loadToast = toast.loading(`Deleting "${g.groupName}"...`);
                              try {
                                const res = await hardDeleteBvGroups({ groupIds: [g.id] });
                                toast.dismiss(loadToast);
                                toast.success(`Successfully deleted "${g.groupName}"`);
                                reloadSystemGroups();
                              } catch (e: any) {
                                toast.dismiss(loadToast);
                                toast.error(`Error: ${e.message || 'Failed to delete group'}`);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
