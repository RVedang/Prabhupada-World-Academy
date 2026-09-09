import { useReactiveLoader } from '@/hooks/useReactiveLoader';
import { useState, useEffect, useCallback } from 'react';
import { getBvslOneToOneData } from '@/lib/endpoints-sdk';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Calendar, 
  Phone, 
  PhoneOff, 
  PhoneMissed, 
  FileText, 
  User,
  Clock
} from 'lucide-react';
import type { Member, Meeting } from '@/components/guide/OneToOneMatrix';
import OneToOneLogDialog from '@/components/guide/OneToOneLogDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import { useUserProfile } from '@/contexts/UserProfileContext';

interface DialogState { 
  open: boolean; 
  memberId: string; 
  memberName: string; 
  weekDate: string; 
  existing: Meeting | null; 
}

function formatDateString(dateStr: string) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function RgsfCallHistoryTab() {
  const { profile } = useUserProfile();
  const isFolk = profile?.segment === 'FOLK' || ((profile as any)?.email && (profile as any).email.includes('folk')) || (profile as any)?.isFolk;
  const [members, setMembers] = useState<Member[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>({ open: false, memberId: '', memberName: '', weekDate: '', existing: null });
  const [expandedMembers, setExpandedMembers] = useState<Record<string, boolean>>({});

  const loadData = useReactiveLoader(async (read) => {
    !read.background && setLoading(true);
    try {
      const res = await read(() => getBvslOneToOneData({})) as any;
      setMembers(res.users || []);
      setMeetings(res.meetings || []);
      setWeeks(res.weeks || []);
    } catch {
      if (read.cancelled) return; /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openDialog = (memberId: string, memberName: string, weekDate: string, existing: Meeting | null) =>
    setDialog({ open: true, memberId, memberName, weekDate, existing });
  const closeDialog = () => setDialog(d => ({ ...d, open: false }));

  const toggleExpand = (id: string) => {
    setExpandedMembers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getMemberCallDetails = (memberId: string) => {
    const memberMeetings = meetings
      .filter(m => m.memberId === memberId)
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)); // newest first

    const lastMtg = memberMeetings[0];
    const lastCallDate = lastMtg?.meetingDate || '';

    // Find the latest meeting that has a next call date
    const latestWithNextCall = memberMeetings.find(m => m.nextCallDate);
    const nextCallDate = latestWithNextCall?.nextCallDate || '';
    const nextCallAgenda = latestWithNextCall?.nextCallAgenda || '';

    return {
      memberMeetings,
      lastCallDate,
      nextCallDate,
      nextCallAgenda,
    };
  };

  if (!loading && members.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border p-8 text-center bg-card">
          <Info className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No group members found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Members of the reading group assigned to you will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">One-to-One Call History</h2>
        <p className="text-sm text-muted-foreground">View past calls, tentative schedules, and next agendas for all members of your assigned group.</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {members.map(member => {
            const { memberMeetings, lastCallDate, nextCallDate, nextCallAgenda } = getMemberCallDetails(member.userId);
            const isExpanded = !!expandedMembers[member.userId];

            return (
              <Card key={member.userId} className="border border-border bg-card shadow-sm">
                <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {member.fullName}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {member.ashrayLevel || 'No level'}
                      {isFolk && ` · ${member.isResident ? 'Resident' : 'Non-Resident'}`}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => toggleExpand(member.userId)}
                  >
                    {isExpanded ? (
                      <>Hide Call History <ChevronUp className="w-3.5 h-3.5 ml-1" /></>
                    ) : (
                      <>View Call History ({memberMeetings.length}) <ChevronDown className="w-3.5 h-3.5 ml-1" /></>
                    )}
                  </Button>
                </CardHeader>
                
                <CardContent className="px-4 pb-4 pt-0 text-xs">
                  {/* Summary Metrics (Read-only) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2 bg-muted/20 rounded-lg p-3 border border-border/40">
                    <div>
                      <p className="text-muted-foreground font-medium">Last Call Date</p>
                      <p className="font-semibold text-foreground mt-0.5">{formatDateString(lastCallDate)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Next Call Date (tentative)</p>
                      <p className="font-semibold text-foreground mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-primary" />
                        {formatDateString(nextCallDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Next Call Agenda</p>
                      <p className="font-semibold text-foreground mt-0.5 truncate" title={nextCallAgenda || 'None'}>
                        {nextCallAgenda || 'No agenda set'}
                      </p>
                    </div>
                  </div>

                  {/* Expandable Call History List (Read-only, no notes or recording link) */}
                  {isExpanded && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <p className="font-semibold text-foreground mb-2">Call Log History</p>
                      {memberMeetings.length === 0 ? (
                        <p className="text-muted-foreground italic">No past calls logged.</p>
                      ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                          {memberMeetings.map(mtg => {
                            const callStatus = mtg.callStatus || 'Connected';
                            return (
                              <div 
                                key={mtg.id} 
                                className="border border-border/60 rounded-md p-2.5 bg-background flex items-center justify-between flex-wrap gap-1.5 cursor-pointer hover:bg-muted/10 transition-colors"
                                onClick={() => openDialog(member.userId, member.fullName, mtg.weekDate, mtg)}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">{formatDateString(mtg.meetingDate)}</span>
                                  <span className="text-muted-foreground">({mtg.durationMinutes} min)</span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {callStatus === 'Connected' && (
                                    <Badge className="bg-green-50 text-green-700 hover:bg-green-50 border border-green-200 shadow-none font-medium text-[10px] px-1.5 py-0.5">
                                      <Phone className="w-2.5 h-2.5 mr-1 text-green-600" /> Connected
                                    </Badge>
                                  )}
                                  {callStatus === 'Did not answer' && (
                                    <Badge className="bg-orange-50 text-orange-700 hover:bg-orange-50 border border-orange-200 shadow-none font-medium text-[10px] px-1.5 py-0.5">
                                      <PhoneMissed className="w-2.5 h-2.5 mr-1 text-orange-500" /> Did not answer
                                    </Badge>
                                  )}
                                  {callStatus === 'Did not place the call' && (
                                    <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 shadow-none font-medium text-[10px] px-1.5 py-0.5">
                                      <PhoneOff className="w-2.5 h-2.5 mr-1 text-red-500" /> Did not place the call
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Read-only dialog */}
      <OneToOneLogDialog
        open={dialog.open}
        onClose={closeDialog}
        onSaved={loadData}
        memberId={dialog.memberId}
        memberName={dialog.memberName}
        weekDate={dialog.weekDate}
        existing={dialog.existing as any}
        readOnly={true}
      />
    </div>
  );
}
