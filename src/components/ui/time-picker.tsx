"use client";

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Clock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value?: string; // in "HH:MM" 24h format e.g. "21:20"
  onChange: (value24: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TimePicker({
  value = '09:00',
  onChange,
  placeholder = 'Select time',
  className,
  disabled = false,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  // Parse "HH:MM" into 12h format
  const parse24 = (t: string) => {
    if (!t) return { hour: '09', minute: '00', period: 'PM' as const };
    const [hStr, mStr] = t.split(':');
    let h = parseInt(hStr || '21', 10);
    const m = (mStr || '00').padStart(2, '0');
    const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h === 0 ? 12 : h;
    return {
      hour: h.toString().padStart(2, '0'),
      minute: m,
      period,
    };
  };

  const parsed = React.useMemo(() => parse24(value), [value]);
  const [selectedHour, setSelectedHour] = React.useState(parsed.hour);
  const [selectedMinute, setSelectedMinute] = React.useState(parsed.minute);
  const [selectedPeriod, setSelectedPeriod] = React.useState<'AM' | 'PM'>(parsed.period);

  React.useEffect(() => {
    setSelectedHour(parsed.hour);
    setSelectedMinute(parsed.minute);
    setSelectedPeriod(parsed.period);
  }, [parsed]);

  const hourContainerRef = React.useRef<HTMLDivElement>(null);
  const minuteContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (hourContainerRef.current) {
          const sel = hourContainerRef.current.querySelector('[data-selected="true"]');
          if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
        if (minuteContainerRef.current) {
          const sel = minuteContainerRef.current.querySelector('[data-selected="true"]');
          if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }, 50);
    }
  }, [isOpen]);

  const emitChange = (h: string, m: string, p: 'AM' | 'PM') => {
    let hourNum = parseInt(h, 10);
    if (p === 'PM' && hourNum < 12) hourNum += 12;
    if (p === 'AM' && hourNum === 12) hourNum = 0;
    const h24 = hourNum.toString().padStart(2, '0');
    const m24 = m.toString().padStart(2, '0');
    onChange(`${h24}:${m24}`);
  };

  const handleTimeChange = (h: string, m: string, p: 'AM' | 'PM') => {
    setSelectedHour(h);
    setSelectedMinute(m);
    setSelectedPeriod(p);
    emitChange(h, m, p);
  };

  const displayTime = React.useMemo(() => {
    if (!value) return placeholder;
    const { hour, minute, period } = parse24(value);
    return `${hour}:${minute} ${period}`;
  }, [value, placeholder]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "h-8 px-3 text-xs font-medium inline-flex items-center justify-start gap-2 bg-card border border-border/80 hover:bg-accent/50 transition-all cursor-pointer shadow-2xs rounded-lg focus:outline-none",
          !value && "text-muted-foreground",
          className
        )}
      >
        <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
        <span>{displayTime}</span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[240px] p-3 bg-card border border-border/80 shadow-xl rounded-2xl backdrop-blur-md"
      >
        {/* Style block to hide scrollbars completely */}
        <style dangerouslySetInnerHTML={{__html: `
          .scrollbar-none::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-none {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}} />

        {/* Digital Clock Banner & AM/PM Toggle */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span>{selectedHour}:{selectedMinute} {selectedPeriod}</span>
          </div>
          {/* Segmented AM/PM Switch */}
          <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
            {(['AM', 'PM'] as const).map(p => {
              const isSelected = selectedPeriod === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleTimeChange(selectedHour, selectedMinute, p)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer focus:outline-none",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hour & Minute Column Selectors */}
        <div className="grid grid-cols-2 gap-2">
          {/* Hours Column */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Hour</span>
            <div
              ref={hourContainerRef}
              className="h-44 w-full bg-muted/20 border border-border/40 rounded-xl p-1 overflow-y-auto flex flex-col gap-1 scrollbar-none"
            >
              {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => {
                const isSelected = selectedHour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => handleTimeChange(h, selectedMinute, selectedPeriod)}
                    className={cn(
                      "h-7 w-full text-xs rounded-lg font-medium transition-all cursor-pointer shrink-0 focus:outline-none flex items-center justify-center",
                      isSelected
                        ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minutes Column */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Minute</span>
            <div
              ref={minuteContainerRef}
              className="h-44 w-full bg-muted/20 border border-border/40 rounded-xl p-1 overflow-y-auto flex flex-col gap-1 scrollbar-none"
            >
              {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => {
                const isSelected = selectedMinute === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => handleTimeChange(selectedHour, m, selectedPeriod)}
                    className={cn(
                      "h-7 w-full text-xs rounded-lg font-medium transition-all cursor-pointer shrink-0 focus:outline-none flex items-center justify-center",
                      isSelected
                        ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Set Action Button */}
        <div className="pt-2 mt-2 border-t border-border/60">
          <Button
            size="sm"
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full h-7 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 shadow-2xs gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" /> Set Time
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
