import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users, Search, Filter, ChevronRight, UserPlus, Phone,
  Sparkles, CheckCircle2, ArrowRightLeft, MoreHorizontal, Eye
} from 'lucide-react';
import { calculateDevoteeHealth } from '@/utils/devoteeHealthUtils';
import Devotee360Drawer from './Devotee360Drawer';
import { toast } from 'sonner';

export const CRM_STAGES = [
  { id: 'New Lead', title: 'New Lead', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300' },
  { id: 'Jigyasa Attendee', title: 'Jigyasa Attendee', color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200' },
  { id: 'Daily Sadhaka', title: 'Daily Sadhaka', color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200' },
  { id: 'Shraddhavan', title: 'Shraddhavan', color: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200' },
  { id: 'Krishna Sevaka', title: 'Krishna Sevaka', color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200' },
  { id: 'Diksha Candidate', title: 'Diksha Candidate', color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200' },
] as const;

interface DevoteeCardData {
  id: string;
  userId?: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  ashrayLevel?: string;
  stage: string;
  guideName?: string;
  residencyName?: string;
  sadhanaPercent?: number;
  attendancePercent?: number;
}

interface Props {
  devotees: DevoteeCardData[];
  onStageChange?: (devoteeId: string, newStage: string) => void;
}

export default function DevoteePipelineTab({ devotees, onStageChange }: Props) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [selectedDevotee, setSelectedDevotee] = useState<DevoteeCardData | null>(null);

  // Group devotees by stage
  const filteredDevotees = devotees.filter((d) => {
    const matchesSearch = d.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (d.phoneNumber && d.phoneNumber.includes(search));
    const matchesStage = stageFilter === 'all' || d.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const getDevoteesForStage = (stageId: string) => {
    return filteredDevotees.filter((d) => (d.stage || 'New Lead') === stageId);
  };

  return (
    <div className="space-y-4">
      {/* Kanban Header Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
          <Input
            placeholder="Search devotees in pipeline..."
            className="h-8 text-xs border-none bg-transparent focus-visible:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={stageFilter} onValueChange={(v) => v && setStageFilter(v)}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {CRM_STAGES.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto pb-4">
        {CRM_STAGES.map((stage) => {
          const list = getDevoteesForStage(stage.id);
          return (
            <div key={stage.id} className="flex flex-col min-w-[240px] bg-muted/40 rounded-xl p-2.5 border">
              {/* Stage Column Header */}
              <div className="flex items-center justify-between pb-2.5 mb-2 border-b">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${stage.color}`}>
                    {stage.title}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {list.length}
                </Badge>
              </div>

              {/* Devotee Cards List */}
              <div className="flex-1 space-y-2.5 min-h-[300px]">
                {list.map((d) => {
                  const health = calculateDevoteeHealth({
                    sadhanaCompliancePercent: d.sadhanaPercent ?? 80,
                    attendancePercent: d.attendancePercent ?? 75,
                  });

                  return (
                    <Card
                      key={d.id}
                      className="p-3 bg-card hover:shadow-md transition cursor-pointer border hover:border-indigo-500/50 group relative"
                      onClick={() => setSelectedDevotee(d)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-xs border border-indigo-500/20">
                            {d.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-foreground group-hover:text-indigo-600 transition">
                              {d.fullName}
                            </h4>
                            <div className="text-[10px] text-muted-foreground">
                              {d.guideName ? `Guide: ${d.guideName}` : 'Unassigned Guide'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border text-[10px]">
                        <Badge variant="outline" className="text-[10px] h-5">
                          {d.ashrayLevel || 'No Ashray'}
                        </Badge>
                        <Badge className={`text-[10px] h-5 border ${health.badgeClass}`}>
                          {health.label}
                        </Badge>
                      </div>

                      {/* Quick Stage Shift Dropdown */}
                      <div className="mt-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={d.stage || 'New Lead'}
                          onValueChange={(val) => {
                            if (val) {
                              onStageChange?.(d.id, val);
                              toast.success(`Moved ${d.fullName} to ${val}`);
                            }
                          }}
                        >
                          <SelectTrigger className="h-6 text-[10px] border-none bg-muted hover:bg-muted/80 w-full justify-between">
                            <span className="truncate">Move Stage...</span>
                          </SelectTrigger>
                          <SelectContent>
                            {CRM_STAGES.map((s) => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">
                                {s.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </Card>
                  );
                })}

                {!list.length && (
                  <div className="h-24 border border-dashed rounded-lg flex items-center justify-center text-muted-foreground text-[11px]">
                    No devotees in stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Devotee 360 Drawer */}
      <Devotee360Drawer
        open={!!selectedDevotee}
        onClose={() => setSelectedDevotee(null)}
        devotee={selectedDevotee}
      />
    </div>
  );
}
