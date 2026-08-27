import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Users, ShieldCheck, UserCheck, Leaf, Clock, BookOpen, ChevronRight } from 'lucide-react';
import { createBvGroup, assignBvRole, getBvslGroups, getGuides, getAllBvGroupsAdmin, updateBvGroup, getClientCachedQuery } from '@/lib/app-endpoints-sdk';

import { useUserProfile } from '@/contexts/UserProfileContext';

const TIME_PREFERENCES = [
  '7:45 PM – 8:15 PM (Everyday)',
  '1:00 PM – 1:30 PM (Monday to Friday)',
  '8:30 PM – 9:00 PM (Monday to Friday)',
  '11:00 AM – 12:00 PM (Saturday & Sunday only)',
];

interface BvAdminManagementTabProps {
  segment?: 'PW' | 'FOLK';
  guideId?: string;
  isSuperGuide?: boolean;
}

export default function BvAdminManagementTab({ segment: propSegment, guideId = '', isSuperGuide: isSuperGuideProp }: BvAdminManagementTabProps = {}) {
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const userEmail = (profile?.userId || '').toLowerCase();
  const isSuperAdmin = isSuperGuideProp ?? !!(
    profile?.isBvSuperAdmin ||
    profile?.role === 'SUPER_ADMIN' ||
    profile?.role === 'SUPER_GUIDE'
  );

  const segment = propSegment || profile?.segment || 'PW';

  const cachedGroups = getClientCachedQuery('getBvslGroups', { bvslId: 'ALL' });
  const cachedGuides = getClientCachedQuery('getGuides', { segment });
  const hasCache = cachedGroups !== null && cachedGuides !== null;

  const [groups, setGroups] = useState<any[]>(cachedGroups?.groups || []);
  const [guides, setGuides] = useState<any[]>(cachedGuides?.guides || []);
  const [loading, setLoading] = useState(!hasCache);

  // Group creation modal state
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupBvslId, setNewGroupBvslId] = useState('');
  const [newGroupTime, setNewGroupTime] = useState('');
  const [timeSelectionMode, setTimeSelectionMode] = useState<'select' | 'custom'>('select');
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => { loadData(); }, [guideId, isSuperAdmin, segment]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (!isSuperAdmin && guideId) {
        // Guide view is server-scoped to this guide. Do not load every FOLK
        // group and attempt to hide unrelated groups in the browser.
        const scoped = await getAllBvGroupsAdmin({ guideId });
        setGroups((scoped.groups || []).map((g: any) => ({
          ...g,
          id: g.groupId,
          groupId: g.groupId,
          totalSessions: g.totalSessions ?? g.sessionCount ?? 0,
          bvslName: g.bvslName || g.bvslLeaderName || null,
        })));
        setGuides((scoped.bvsls || []).map((u: any) => ({
          guideId: u.userId,
          name: u.fullName,
          email: u.email || '',
          abbr: (u.fullName || '').slice(0, 3).toUpperCase(),
        })));
      } else {
        const [grpRes, guideRes] = await Promise.all([
          getBvslGroups({ bvslId: 'ALL' }).catch(() => ({ groups: [] })),
          getGuides({ segment }).catch(() => ({ guides: [] })),
        ]);
        const allGroups = grpRes.groups || [];
        setGroups(segment ? allGroups.filter((g: any) => g.segment === segment) : allGroups);
        setGuides(guideRes.guides || []);
      }
    } catch {
      toast.error('Failed to load BV management data');
    } finally {
      setLoading(false);
    }
  };

  // Super Admin sees ALL groups; Admin sees only groups under facilitators assigned to them
  const visibleGroups = (function () {
    if (isSuperAdmin) return groups;

    const adminId = (profile?.userId || (profile as any)?.id || '').toLowerCase();
    const adminEmail = (userEmail || '').toLowerCase();
    const adminName = (profile?.fullName || '').toLowerCase();

    return groups.filter(group => {
      const grpGuideName = (group.guideName || '').toLowerCase();
      const grpGuideId = (group.guideId || '').toLowerCase();
      const grpBvslName = (group.bvslName || '').toLowerCase();
      const grpBvslId = (group.bvslId || '').toLowerCase();

      // Direct match on group guide/admin
      if (
        (grpGuideId && (grpGuideId === adminId || grpGuideId === adminEmail)) ||
        (grpGuideName && adminName && (grpGuideName.includes(adminName) || adminName.includes(grpGuideName))) ||
        (grpBvslId && (grpBvslId === adminId || grpBvslId === adminEmail))
      ) {
        return true;
      }

      // Check if the facilitator (RGF) of this group is under this admin
      const facilitator = guides.find(g =>
        (g.guideId && (g.guideId === grpBvslId || g.guideId === group.bvslLeader)) ||
        (g.name && grpBvslName && g.name.toLowerCase().includes(grpBvslName)) ||
        (g.email && grpBvslId && g.email.toLowerCase() === grpBvslId)
      );

      if (facilitator) {
        const facGuideName = (facilitator.guideName || facilitator.adminName || '').toLowerCase();
        const facGuideId = (facilitator.guideId || facilitator.adminId || '').toLowerCase();
        const facEmail = (facilitator.email || '').toLowerCase();

        if (
          (facGuideId && (facGuideId === adminId || facGuideId === adminEmail)) ||
          (facGuideName && adminName && (facGuideName.includes(adminName) || adminName.includes(facGuideName))) ||
          (facEmail && facEmail === adminEmail)
        ) {
          return true;
        }
      }

      // Match facilitators where guide email/name matches this admin
      const myFacilitators = guides.filter(g => {
        const gEmail = (g.email || '').toLowerCase();
        const gGuide = (g.guide || g.guideName || g.adminEmail || '').toLowerCase();
        return (
          (gEmail && gEmail === adminEmail) ||
          (gGuide && (gGuide.includes(adminName) || gGuide === adminEmail || gGuide === adminId))
        );
      });

      return myFacilitators.some(f =>
        (f.guideId && f.guideId === grpBvslId) ||
        (f.email && f.email.toLowerCase() === grpBvslId) ||
        (f.name && grpBvslName && f.name.toLowerCase().includes(grpBvslName))
      );
    });
  })();

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }
    if (!newGroupBvslId) {
      toast.error('Please select a Reading Group Facilitator');
      return;
    }
    setCreatingGroup(true);
    try {
      await createBvGroup({
        groupName: newGroupName.trim(),
        bvslId: newGroupBvslId,
        meetingTime: newGroupTime.trim() || undefined,
      });
      toast.success(`Created Reading Group "${newGroupName}"`);
      setCreateGroupOpen(false);
      setNewGroupName('');
      setNewGroupBvslId('');
      setNewGroupTime('');
      setTimeSelectionMode('select');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">Loading Bhakti Vriksha groups & guides...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Groups Card */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Bhakti Vriksha Groups & Role Management
            </CardTitle>
            <CardDescription className="text-xs">
              Monitor reading groups, view group details, create new groups, and assign roles within the Bhakti Vriksha hierarchy.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCreateGroupOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create Group
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {visibleGroups.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <Users className="w-10 h-10 mx-auto opacity-40" />
              <p className="font-semibold text-sm">No Reading Groups found</p>
              <p className="text-xs">Click "Create Group" above to initialize your first group.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleGroups.map(group => {
                const groupId = group.groupId || group.id;
                return (
                  <Card
                    key={group.id}
                    className="group relative cursor-pointer overflow-hidden border border-border/80 bg-card hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                    onClick={() => navigate(`/bvsl/groups/${groupId}`)}
                  >
                    <CardHeader className="pb-2 bg-card border-b px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                            {group.groupName}
                          </h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Facilitator: {group.bvslName || 'Unassigned'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="text-[10px] font-medium bg-muted/50">
                            {group.memberCount} members
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 text-xs">
                      {group.meetingTime && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span>{group.meetingTime}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <BookOpen className="w-3.5 h-3.5 text-orange-500" />
                        <span>{group.totalSessions || 0} sessions held</span>
                      </div>
                      {group.joinToken && (
                        <div className="pt-2 border-t mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Join Code:</span>
                          <code className="bg-muted px-1.5 py-0.5 rounded font-mono font-bold text-[10px] text-primary">{group.joinToken}</code>
                        </div>
                      )}
                      <div className="pt-2 flex items-center justify-between">
                        <Badge variant={group.isActive === false ? 'secondary' : 'default'} className="text-[10px]">
                          {group.isActive === false ? 'Inactive' : 'Active'}
                        </Badge>
                      </div>
                      <div className="pt-2 flex items-center justify-between border-t mt-2">
                        <Button
                          variant={group.isActive === false ? 'default' : 'secondary'}
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const action = group.isActive === false ? 'activate' : 'deactivate';
                            if (!window.confirm(`Are you sure you want to ${action} "${group.groupName}"?`)) return;
                            const loadToast = toast.loading(`${action === 'activate' ? 'Activating' : 'Deactivating'} group...`);
                            try {
                              await updateBvGroup({ groupId: group.groupId || group.id, isActive: group.isActive === false });
                              toast.dismiss(loadToast);
                              toast.success(`Group successfully ${action}d`);
                              loadData();
                            } catch (err: any) {
                              toast.dismiss(loadToast);
                              toast.error(err?.message || `Failed to ${action} group`);
                            }
                          }}
                        >
                          {group.isActive === false ? 'Activate' : 'Deactivate'}
                        </Button>
                        <span className="text-[11px] font-semibold text-primary group-hover:underline flex items-center gap-1">
                          View Group Details <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Reading Group Modal */}
      <Dialog open={createGroupOpen} onOpenChange={(open) => {
        setCreateGroupOpen(open);
        if (!open) {
          setTimeSelectionMode('select');
          setNewGroupTime('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Create New Reading Group
            </DialogTitle>
            <DialogDescription>
              Add a new Bhakti Vriksha reading group and assign a Reading Group Facilitator (RGF).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Group Name *</Label>
              <Input
                placeholder="e.g. Sri Chaitanya Reading Group"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Assign Facilitator (RGF) *</Label>
              <Select value={newGroupBvslId || undefined} onValueChange={(val: string | null) => setNewGroupBvslId(val || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select facilitator...">
                    {newGroupBvslId ? (guides.find(g => g.guideId === newGroupBvslId)?.name || newGroupBvslId) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {guides.map(g => {
                    const displayName = `${g.name || g.abbr} (${g.email || 'Guide'})`;
                    return (
                      <SelectItem key={g.guideId} value={g.guideId}>
                        {displayName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Meeting Time Preference *</Label>
              {timeSelectionMode === 'select' ? (
                <Select
                  value={newGroupTime || undefined}
                  onValueChange={(val: string | null) => {
                    const cleanVal = val || '';
                    if (cleanVal === 'CUSTOM') {
                      setTimeSelectionMode('custom');
                      setNewGroupTime('');
                    } else {
                      setNewGroupTime(cleanVal);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select preferred time slot..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_PREFERENCES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                    <SelectItem value="CUSTOM">Custom...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. 7:45 PM – 8:15 PM (Everyday)"
                    value={newGroupTime}
                    onChange={e => setNewGroupTime(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => {
                      setTimeSelectionMode('select');
                      setNewGroupTime('');
                    }}
                  >
                    Select List
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={creatingGroup}>
              {creatingGroup && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
