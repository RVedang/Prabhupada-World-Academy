import { ASHRAY_LEVELS } from '@/types/enums';

export const PERFORMANCE_STATUS_MAP: Record<string, { label: string; className: string }> = {
  needs_attention: { label: 'Needs Attention', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  declining:       { label: 'Declining',        className: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400' },
  improving:       { label: 'Improving',         className: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400' },
  stable:          { label: 'Stable',            className: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400' },
};

export function getPerformanceBadgeConfig(status: string) {
  return PERFORMANCE_STATUS_MAP[status] ?? PERFORMANCE_STATUS_MAP.stable;
}

export function getScoreColorClass(score: number | null | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400 font-bold';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-rose-600 dark:text-rose-400 font-semibold';
}

export { ASHRAY_LEVELS };
