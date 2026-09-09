import { useState, type ElementType } from 'react';
import { createPortal } from 'react-dom';
import { Menu, ChevronDown, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface NavigationItem {
  id: string;
  label: string;
  icon: ElementType;
  badge?: number;
}

export function MobileSectionNav({ items, activeId, onSelect, onIntent }: {
  items: NavigationItem[]; activeId: string; onSelect: (id: string) => void; onIntent?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = items.find(item => item.id === activeId) || items[0];
  return <div className="mb-4 min-w-0 md:hidden">
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)} aria-label="Open dashboard navigation" aria-expanded={open}
        className="w-full justify-start gap-3 rounded-xl bg-card px-3 shadow-none">
        <Menu className="size-5 text-primary" />
        <span className="min-w-0 flex-1 truncate text-left">{active?.label || 'Dashboard'}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>
      <SheetContent side="left" className="w-[min(88vw,360px)] gap-0">
        <SheetHeader className="border-b px-5 py-6 pr-14">
          <SheetTitle>Dashboard</SheetTitle>
          <SheetDescription>Choose a section</SheetDescription>
        </SheetHeader>
        <nav aria-label="Dashboard sections" className="space-y-1 overflow-y-auto p-3">
          {items.map(({ id, label, icon: Icon, badge }) => <button key={id}
            aria-current={activeId === id ? 'page' : undefined}
            onFocus={() => onIntent?.(id)} onPointerEnter={() => onIntent?.(id)}
            onClick={() => { onSelect(id); setOpen(false); }}
            className={cn('flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium', activeId === id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted')}>
            <Icon className="size-5 shrink-0" /><span className="flex-1">{label}</span>
            {!!badge && <span className="rounded-full bg-destructive px-2 py-1 text-xs text-destructive-foreground">{badge}</span>}
          </button>)}
        </nav>
      </SheetContent>
    </Sheet>
  </div>;
}

export function MemberBottomNav({ items, activeId, onSelect }: {
  items: NavigationItem[]; activeId: string; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const primary = items.slice(0, 3);
  const more = items.slice(3);
  if (typeof document === 'undefined') return null;
  return createPortal(<>
    <nav aria-label="Primary navigation" className="member-bottom-nav no-print">
      {primary.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onSelect(id)}
        aria-current={activeId === id ? 'page' : undefined} className={cn('member-nav-item', activeId === id && 'is-active')}>
        <Icon aria-hidden="true" className="size-5" /><span>{label}</span>
      </button>)}
      <button className={cn('member-nav-item', more.some(item => item.id === activeId) && 'is-active')}
        onClick={() => more.length ? setOpen(true) : navigate('/profile')} aria-expanded={more.length ? open : undefined}>
        {more.length ? <Menu className="size-5" /> : <UserRound className="size-5" />}<span>{more.length ? 'More' : 'Profile'}</span>
      </button>
    </nav>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader><SheetTitle>More</SheetTitle><SheetDescription>Your other dashboard sections</SheetDescription></SheetHeader>
        <div className="space-y-1 px-4 pb-4">
          {more.map(({ id, label, icon: Icon }) => <Button key={id} variant={id === activeId ? 'secondary' : 'ghost'} className="w-full justify-start gap-3"
            onClick={() => { onSelect(id); setOpen(false); }}><Icon className="size-5" />{label}</Button>)}
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => navigate('/profile')}><UserRound className="size-5" />Profile</Button>
        </div>
      </SheetContent>
    </Sheet>
  </>, document.body);
}
