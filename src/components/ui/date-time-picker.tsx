"use client"

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Calendar as CalendarIcon, Clock, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateTimePickerProps {
  value?: string;
  onChange: (value: string) => void;
  type?: 'datetime' | 'date';
  placeholder?: string;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DateTimePicker({
  value,
  onChange,
  type = 'datetime',
  placeholder = 'Select date & time',
  disabled = false,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  // Parsed date states
  const parsedDate = React.useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, [value]);

  // Calendar navigation states (default to parsed date or today)
  const [navMonth, setNavMonth] = React.useState(() => {
    const today = new Date();
    return parsedDate ? parsedDate.getMonth() : today.getMonth();
  });
  const [navYear, setNavYear] = React.useState(() => {
    const today = new Date();
    return parsedDate ? parsedDate.getFullYear() : today.getFullYear();
  });

  // Sync calendar view if selected value changes externally
  React.useEffect(() => {
    if (parsedDate) {
      setNavMonth(parsedDate.getMonth());
      setNavYear(parsedDate.getFullYear());
    }
  }, [parsedDate]);

  // Time states (12-hour format)
  const [selectedHour, setSelectedHour] = React.useState('12');
  const [selectedMinute, setSelectedMinute] = React.useState('00');
  const [selectedPeriod, setSelectedPeriod] = React.useState<'AM' | 'PM'>('PM');

  // Sync time state if parsedDate is present
  React.useEffect(() => {
    if (parsedDate && type === 'datetime') {
      let hours = parsedDate.getHours();
      const mins = parsedDate.getMinutes().toString().padStart(2, '0');
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours === 0 ? 12 : hours;
      setSelectedHour(hours.toString().padStart(2, '0'));
      setSelectedMinute(mins);
      setSelectedPeriod(period);
    }
  }, [parsedDate, type]);

  // Calendar helpers
  const daysInMonth = React.useMemo(() => {
    return new Date(navYear, navMonth + 1, 0).getDate();
  }, [navYear, navMonth]);

  const firstDayOfWeek = React.useMemo(() => {
    return new Date(navYear, navMonth, 1).getDay();
  }, [navYear, navMonth]);

  const prevMonthDays = React.useMemo(() => {
    return new Date(navYear, navMonth, 0).getDate();
  }, [navYear, navMonth]);

  const calendarCells = React.useMemo(() => {
    const cells: Array<{ day: number; isPadding: boolean; date: Date }> = [];
    
    // Padding from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const prevMonth = navMonth === 0 ? 11 : navMonth - 1;
      const prevYear = navMonth === 0 ? navYear - 1 : navYear;
      cells.push({
        day,
        isPadding: true,
        date: new Date(prevYear, prevMonth, day),
      });
    }

    // Days in current month
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({
        day: i,
        isPadding: false,
        date: new Date(navYear, navMonth, i),
      });
    }

    // Padding for next month to make complete 6 rows (42 cells)
    const totalCells = 42;
    const nextMonthPadding = totalCells - cells.length;
    for (let i = 1; i <= nextMonthPadding; i++) {
      const nextMonth = navMonth === 11 ? 0 : navMonth + 1;
      const nextYear = navMonth === 11 ? navYear + 1 : navYear;
      cells.push({
        day: i,
        isPadding: true,
        date: new Date(nextYear, nextMonth, i),
      });
    }

    return cells;
  }, [navYear, navMonth, daysInMonth, firstDayOfWeek, prevMonthDays]);

  const handlePrevMonth = () => {
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear(prev => prev - 1);
    } else {
      setNavMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (navMonth === 11) {
      setNavMonth(0);
      setNavYear(prev => prev + 1);
    } else {
      setNavMonth(prev => prev + 1);
    }
  };

  const constructISOString = (dateObj: Date, hourStr: string, minStr: string, period: 'AM' | 'PM') => {
    let hour = parseInt(hourStr, 10);
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const hrs = hour.toString().padStart(2, '0');
    const mns = minStr.toString().padStart(2, '0');

    if (type === 'date') {
      return `${year}-${month}-${day}`;
    }
    return `${year}-${month}-${day}T${hrs}:${mns}`;
  };

  const handleSelectDate = (cellDate: Date) => {
    const iso = constructISOString(cellDate, selectedHour, selectedMinute, selectedPeriod);
    onChange(iso);
    if (type === 'date') {
      setIsOpen(false);
    }
  };

  const handleTimeChange = (hour: string, minute: string, period: 'AM' | 'PM') => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    setSelectedPeriod(period);
    
    const baseDate = parsedDate || new Date();
    const iso = constructISOString(baseDate, hour, minute, period);
    onChange(iso);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const handleToday = () => {
    const today = new Date();
    const iso = constructISOString(today, selectedHour, selectedMinute, selectedPeriod);
    onChange(iso);
  };

  // Human-readable trigger text
  const buttonText = React.useMemo(() => {
    if (!parsedDate) return placeholder;
    if (type === 'date') {
      return parsedDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    
    const timeStr = parsedDate.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const dateStr = parsedDate.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return `${dateStr} ${timeStr}`;
  }, [parsedDate, type, placeholder]);

  const hourContainerRef = React.useRef<HTMLDivElement>(null);
  const minuteContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen && type === 'datetime') {
      setTimeout(() => {
        if (hourContainerRef.current) {
          const selected = hourContainerRef.current.querySelector('[data-selected="true"]');
          if (selected) {
            selected.scrollIntoView({ block: 'nearest', behavior: 'auto' });
          }
        }
        if (minuteContainerRef.current) {
          const selected = minuteContainerRef.current.querySelector('[data-selected="true"]');
          if (selected) {
            selected.scrollIntoView({ block: 'nearest', behavior: 'auto' });
          }
        }
      }, 50);
    }
  }, [isOpen, type, selectedHour, selectedMinute]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-start text-left font-normal h-10 px-3 py-2 bg-card border rounded-xl hover:bg-accent/40 focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs gap-2",
          !value && "text-muted-foreground"
        )}
      >
        {type === 'date' ? (
          <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
        ) : (
          <Clock className="w-4 h-4 text-primary shrink-0" />
        )}
        <span className="truncate text-xs">{buttonText}</span>
      </PopoverTrigger>
      
      <PopoverContent className="w-auto p-4 bg-card border shadow-2xl rounded-2xl flex gap-4 overflow-hidden border-border/85 backdrop-blur-md">
        {/* Style block to hide scrollbars completely */}
        <style dangerouslySetInnerHTML={{__html: `
          .scrollbar-none::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-none {
            -ms-overflow-style: none;
            scrollbar-width: none;
            scroll-behavior: smooth;
          }
        `}} />

        {/* Calendar Picker Panel */}
        <div className="w-[260px] flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground">
              {MONTH_NAMES[navMonth]} {navYear}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevMonth}
                className="w-7 h-7 rounded-lg hover:bg-accent/60"
              >
                <ChevronUp className="w-4 h-4 rotate-[270deg]" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextMonth}
                className="w-7 h-7 rounded-lg hover:bg-accent/60"
              >
                <ChevronUp className="w-4 h-4 rotate-[90deg]" />
              </Button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground/80">
            {DAYS_OF_WEEK.map((d, i) => (
              <div key={i} className="py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {calendarCells.map((cell, idx) => {
              const isSelected = parsedDate && 
                parsedDate.getDate() === cell.date.getDate() &&
                parsedDate.getMonth() === cell.date.getMonth() &&
                parsedDate.getFullYear() === cell.date.getFullYear();
              
              const isToday = !cell.isPadding && (() => {
                const today = new Date();
                return today.getDate() === cell.date.getDate() &&
                  today.getMonth() === cell.date.getMonth() &&
                  today.getFullYear() === cell.date.getFullYear();
              })();

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDate(cell.date)}
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center font-medium transition-all cursor-pointer relative",
                    cell.isPadding ? "text-muted-foreground/30 hover:bg-transparent" : "text-foreground hover:bg-accent/60",
                    isToday && "border border-primary text-primary font-bold",
                    isSelected && "bg-primary text-primary-foreground font-semibold shadow-md hover:bg-primary/95 hover:text-primary-foreground"
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="flex justify-between items-center border-t border-dashed pt-2.5 mt-1">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold text-destructive hover:underline cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              Today
            </button>
          </div>
        </div>

        {/* Time Picker Panel (Optional) */}
        {type === 'datetime' && (
          <div className="flex gap-2.5 pl-4 border-l border-border/80">
            {/* Hours Column */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Hour</span>
              <div ref={hourContainerRef} className="h-48 w-11 overflow-y-auto pr-0.5 flex flex-col gap-1 scrollbar-none">
                {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => {
                  const isSelected = selectedHour === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-selected={isSelected}
                      onClick={() => handleTimeChange(h, selectedMinute, selectedPeriod)}
                      className={cn(
                        "h-7 w-full text-xs rounded-md font-medium transition-all cursor-pointer shrink-0",
                        isSelected ? "bg-primary text-primary-foreground font-bold shadow-xs" : "hover:bg-accent/65"
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
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Min</span>
              <div ref={minuteContainerRef} className="h-48 w-11 overflow-y-auto pr-0.5 flex flex-col gap-1 scrollbar-none">
                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => {
                  const isSelected = selectedMinute === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-selected={isSelected}
                      onClick={() => handleTimeChange(selectedHour, m, selectedPeriod)}
                      className={cn(
                        "h-7 w-full text-xs rounded-md font-medium transition-all cursor-pointer shrink-0",
                        isSelected ? "bg-primary text-primary-foreground font-bold shadow-xs" : "hover:bg-accent/65"
                      )}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Period (AM/PM) Column */}
            <div className="flex flex-col items-center justify-between h-[218px]">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Period</span>
                <div className="flex flex-col gap-1 w-12">
                  {(['AM', 'PM'] as const).map(p => {
                    const isSelected = selectedPeriod === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleTimeChange(selectedHour, selectedMinute, p)}
                        className={cn(
                          "h-7 w-full text-xs rounded-md font-medium transition-all cursor-pointer",
                          isSelected ? "bg-primary text-primary-foreground font-bold shadow-xs" : "hover:bg-accent/65"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-12 h-8 text-[11px] font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/95 shadow-xs flex items-center justify-center transition-all cursor-pointer mt-auto"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
