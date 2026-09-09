import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Phone, MessageSquare, Users, Home, HeartHandshake, FileText } from 'lucide-react';
import { logDevoteeInteraction } from '@/lib/endpoints-sdk';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  devoteeId: string;
  devoteeName: string;
}

export const INTERACTION_TYPES = [
  { value: 'Call', label: 'Phone Call', icon: Phone, color: 'text-blue-500' },
  { value: 'WhatsApp', label: 'WhatsApp Message', icon: MessageSquare, color: 'text-emerald-500' },
  { value: 'OneToOne', label: '1-on-1 Meeting', icon: Users, color: 'text-purple-500' },
  { value: 'HomeVisit', label: 'Home Visit', icon: Home, color: 'text-amber-500' },
  { value: 'Encouragement', label: 'Encouragement / Follow-up', icon: HeartHandshake, color: 'text-pink-500' },
  { value: 'Note', label: 'General Note', icon: FileText, color: 'text-slate-500' },
] as const;

export default function LogInteractionModal({ open, onClose, onSuccess, devoteeId, devoteeName }: Props) {
  const [type, setType] = useState<typeof INTERACTION_TYPES[number]['value']>('Call');
  const [notes, setNotes] = useState('');
  const [callStatus, setCallStatus] = useState('Connected');
  const [duration, setDuration] = useState('');
  const [nextCallDate, setNextCallDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast.error('Please enter interaction notes');
      return;
    }

    try {
      setLoading(true);
      await logDevoteeInteraction({
        devoteeId,
        interactionType: type,
        notes,
        callStatus: type === 'Call' ? callStatus : undefined,
        durationMinutes: duration ? parseInt(duration, 10) : undefined,
        nextCallDate: nextCallDate || undefined,
      });

      toast.success(`Logged ${type} for ${devoteeName}`);
      onSuccess?.();
      onClose();
      // reset form
      setNotes('');
      setDuration('');
      setNextCallDate('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log interaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Phone className="w-5 h-5 text-indigo-500" />
            Log Touchpoint / Interaction
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Logging contact touchpoint for <span className="font-medium text-foreground">{devoteeName}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Touchpoint Type</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${t.color}`} />
                        <span>{t.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {type === 'Call' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Call Status</Label>
                <Select value={callStatus} onValueChange={setCallStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Connected">📞 Connected</SelectItem>
                    <SelectItem value="Did not answer">📵 Did Not Answer</SelectItem>
                    <SelectItem value="Busy">⏳ Line Busy</SelectItem>
                    <SelectItem value="Switched Off">❌ Switched Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Duration (Mins)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 15"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Interaction Notes & Summary</Label>
            <Textarea
              rows={3}
              placeholder="What was discussed? How is their sadhana/health? Any follow-up needed?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Next Follow-Up Target Date (Optional)</Label>
            <Input
              type="date"
              value={nextCallDate}
              onChange={(e) => setNextCallDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading} className="gap-1.5">
            Save Touchpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
