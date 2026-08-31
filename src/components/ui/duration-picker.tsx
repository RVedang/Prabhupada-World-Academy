import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { cn } from '@/lib/utils';

interface DurationPickerProps {
  /** Duration in minutes. An empty value keeps both selectors unselected. */
  value?: number | null;
  onChange: (minutes: number) => void;
  className?: string;
  disabled?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);

export function DurationPicker({ value, onChange, className, disabled = false }: DurationPickerProps) {
  const hasValue = value !== undefined && value !== null && Number.isFinite(Number(value));
  const totalMinutes = hasValue ? Math.min(Math.max(0, Math.round(Number(value))), 23 * 60 + 59) : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const updateHours = (nextHours: string | null) => {
    if (nextHours == null) return;
    onChange(Number(nextHours) * 60 + minutes);
  };

  const updateMinutes = (nextMinutes: string | null) => {
    if (nextMinutes == null) return;
    onChange(hours * 60 + Number(nextMinutes));
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Select
        value={hasValue ? String(hours).padStart(2, '0') : undefined}
        onValueChange={updateHours}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-[66px]">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent className="min-w-[66px] w-[66px]">
          {HOURS.map(hour => {
            const display = String(hour).padStart(2, '0');
            return <SelectItem key={display} value={display}>{display}</SelectItem>;
          })}
        </SelectContent>
      </Select>
      <span className="text-lg font-bold text-muted-foreground" aria-hidden="true">:</span>
      <Select
        value={hasValue ? String(minutes).padStart(2, '0') : undefined}
        onValueChange={updateMinutes}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-[66px]">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent className="min-w-[66px] w-[66px]">
          {MINUTES.map(minute => {
            const display = String(minute).padStart(2, '0');
            return <SelectItem key={display} value={display}>{display}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
