import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';

/** Presentation only: filters keep their existing controlled values and handlers. */
export default function FilterPanel({ children, summary = 'Refine results', title = 'Report filters' }: {
  children: ReactNode; summary?: ReactNode; title?: string;
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (!mobile) return <>{children}</>;
  return <Sheet open={open} onOpenChange={setOpen}>
    <Button variant="outline" className="w-full justify-between rounded-xl shadow-none" onClick={() => setOpen(true)}>
      <span className="flex items-center gap-2"><SlidersHorizontal className="size-4" />Filters</span>
      <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{summary}</span>
    </Button>
    <SheetContent side="bottom" className="gap-0 rounded-t-3xl">
      <SheetHeader className="border-b pr-14"><SheetTitle>{title}</SheetTitle><SheetDescription>Selections update the report automatically.</SheetDescription></SheetHeader>
      <div className="mobile-filter-fields overflow-y-auto p-4">{children}</div>
      <SheetFooter className="border-t"><Button onClick={() => setOpen(false)}>Show results</Button></SheetFooter>
    </SheetContent>
  </Sheet>;
}
