import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Comparison tables retain every column and scroll inside their own region. */
export default function TableScrollArea({ children, className, label = 'Report table' }: {
  children: ReactNode; className?: string; label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const check = () => setOverflows(node.scrollWidth > node.clientWidth + 2);
    const observer = new ResizeObserver(check);
    observer.observe(node);
    const table = node.querySelector('table');
    if (table) observer.observe(table);
    check();
    return () => observer.disconnect();
  }, []);
  return <div className="min-w-0 max-w-full">
    {overflows && <p className="report-scroll-hint no-print"><ArrowLeftRight className="size-4 shrink-0" />Swipe to see all columns</p>}
    <div ref={ref} role="region" aria-label={label} tabIndex={overflows ? 0 : undefined}
      className={cn('min-w-0 max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary', className)}>{children}</div>
  </div>;
}
