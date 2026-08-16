import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  AlertTriangle, PhoneCall, Calendar, CheckSquare, Plus,
  MessageSquare, User, Clock, ArrowRight, ShieldAlert, Sparkles
} from 'lucide-react';
import LogInteractionModal from './LogInteractionModal';
import Devotee360Drawer from './Devotee360Drawer';

interface DevoteeTaskItem {
  id: string;
  fullName: string;
  phoneNumber?: string;
  ashrayLevel?: string;
  reason: string;
  type: 'INACTIVITY' | 'FOLLOWUP_DUE' | 'ASHRAY_PENDING';
  dueDate?: string;
}

interface Props {
  devotees: any[];
}

export default function MentorTaskCenterTab({ devotees }: Props) {
  const [tasks, setTasks] = useState<DevoteeTaskItem[]>([
    {
      id: 't-1',
      fullName: 'Rohan Sharma',
      phoneNumber: '+91 98765 43210',
      ashrayLevel: 'Jigyasa',
      reason: 'No sadhana submission for 3 consecutive days',
      type: 'INACTIVITY',
    },
    {
      id: 't-2',
      fullName: 'Arjun Das',
      phoneNumber: '+91 98123 45678',
      ashrayLevel: 'Sadhaka',
      reason: 'Scheduled monthly 1-on-1 touchpoint due today',
      type: 'FOLLOWUP_DUE',
      dueDate: new Date().toISOString().split('T')[0],
    },
  ]);

  const [newTaskText, setNewTaskText] = useState('');
  const [selectedForCall, setSelectedForCall] = useState<{ id: string; name: string } | null>(null);
  const [selectedDevoteeDrawer, setSelectedDevoteeDrawer] = useState<any | null>(null);

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    setTasks([
      {
        id: `t-${Date.now()}`,
        fullName: newTaskText,
        reason: 'Custom mentor task',
        type: 'FOLLOWUP_DUE',
      },
      ...tasks,
    ]);
    setNewTaskText('');
    toast.success('Added new task to checklist');
  };

  const handleCompleteTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
    toast.success('Task marked as completed');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/20 border-rose-200 dark:border-rose-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                At-Risk Devotees
              </p>
              <h3 className="text-2xl font-extrabold text-rose-950 dark:text-rose-100 mt-0.5">
                {tasks.filter((t) => t.type === 'INACTIVITY').length}
              </h3>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-1">Requires immediate touchpoint</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border-blue-200 dark:border-blue-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Follow-ups Due Today
              </p>
              <h3 className="text-2xl font-extrabold text-blue-950 dark:text-blue-100 mt-0.5">
                {tasks.filter((t) => t.type === 'FOLLOWUP_DUE').length}
              </h3>
              <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-1">Scheduled calls & 1-on-1s</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/20 border-purple-200 dark:border-purple-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                Pending Ashray Reviews
              </p>
              <h3 className="text-2xl font-extrabold text-purple-950 dark:text-purple-100 mt-0.5">0</h3>
              <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-1">Awaiting mentor signature</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Task List & Quick Action Items */}
      <Card>
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-indigo-500" />
              Mentor Daily Action Queue
            </CardTitle>
            <CardDescription className="text-xs">
              System-generated notifications and manual task follow-ups for assigned devotees
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Quick Add Custom Task */}
          <div className="flex gap-2">
            <Input
              placeholder="Add a new custom mentor task or reminder..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
              className="text-xs"
            />
            <Button size="sm" onClick={handleAddTask} className="gap-1 text-xs shrink-0">
              <Plus className="w-4 h-4" /> Add Task
            </Button>
          </div>

          {/* Action Queue Cards */}
          <div className="space-y-3 pt-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-3 border rounded-xl bg-card hover:border-indigo-500/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    onCheckedChange={() => handleCompleteTask(task.id)}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-foreground">{task.fullName}</h4>
                      {task.ashrayLevel && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4">
                          {task.ashrayLevel}
                        </Badge>
                      )}
                      <Badge
                        variant="secondary"
                        className={`text-[10px] py-0 h-4 ${
                          task.type === 'INACTIVITY'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {task.type === 'INACTIVITY' ? '🔴 Alert' : '⏰ Scheduled'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{task.reason}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setSelectedForCall({ id: task.id, name: task.fullName })}
                  >
                    <PhoneCall className="w-3 h-3 text-emerald-600" /> Log Call
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setSelectedDevoteeDrawer({ id: task.id, fullName: task.fullName, phoneNumber: task.phoneNumber })}
                  >
                    Inspect 360°
                  </Button>
                </div>
              </div>
            ))}

            {!tasks.length && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                🎉 All mentor action items completed for today!
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Log Call Modal */}
      {selectedForCall && (
        <LogInteractionModal
          open={!!selectedForCall}
          onClose={() => setSelectedForCall(null)}
          devoteeId={selectedForCall.id}
          devoteeName={selectedForCall.name}
          onSuccess={() => {
            handleCompleteTask(selectedForCall.id);
          }}
        />
      )}

      {/* Devotee 360 Drawer */}
      <Devotee360Drawer
        open={!!selectedDevoteeDrawer}
        onClose={() => setSelectedDevoteeDrawer(null)}
        devotee={selectedDevoteeDrawer}
      />
    </div>
  );
}
