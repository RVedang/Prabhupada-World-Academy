import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, User, Phone, MessageSquare, Plus, Command } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  devotees: any[];
  onSelectDevotee: (devotee: any) => void;
}

export default function GlobalCommandPalette({ open, onClose, devotees, onSelectDevotee }: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (open) onClose();
        else setQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filtered = devotees.filter((d) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      d.fullName?.toLowerCase().includes(q) ||
      d.email?.toLowerCase().includes(q) ||
      d.phoneNumber?.includes(q) ||
      d.ashrayLevel?.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="p-0 max-w-xl overflow-hidden rounded-xl border shadow-2xl">
        <div className="flex items-center border-b px-3 bg-card">
          <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
          <Input
            autoFocus
            placeholder="Type a devotee name, phone, or command (Ctrl + K)..."
            className="h-12 border-none bg-transparent focus-visible:ring-0 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border">
            <Command className="w-3 h-3" /> K
          </kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Devotees & Members ({filtered.length})
          </div>

          {filtered.map((d) => (
            <div
              key={d.id}
              onClick={() => {
                onSelectDevotee(d);
                onClose();
              }}
              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/70 cursor-pointer transition text-xs group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0">
                  {d.fullName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-foreground group-hover:text-indigo-600 transition flex items-center gap-2">
                    {d.fullName}
                    {d.ashrayLevel && (
                      <Badge variant="outline" className="text-[10px] py-0 h-4">
                        {d.ashrayLevel}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.phoneNumber || d.email || 'No contact details'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground text-[11px]">
                <span>Inspect 360°</span>
                <kbd className="bg-muted px-1.5 py-0.5 rounded text-[9px] border">↵</kbd>
              </div>
            </div>
          ))}

          {!filtered.length && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No devotees found matching "{query}"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
