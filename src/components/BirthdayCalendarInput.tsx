import React, { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface BirthdayCalendarInputProps {
  id?: string;
  value: string; // YYYY-MM-DD or ''
  onChange: (nextDate: string) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export const BirthdayCalendarInput: React.FC<BirthdayCalendarInputProps> = ({
  id = 'acct-dob',
  value,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parsed = parseIsoDate(value);
  const currentYear = new Date().getFullYear();

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(parsed?.year ?? currentYear - 22);
  const [viewMonth, setViewMonth] = useState<number>(parsed?.month ?? 0);

  useEffect(() => {
    const nextParsed = parseIsoDate(value);
    if (nextParsed) {
      setViewYear(nextParsed.year);
      setViewMonth(nextParsed.month);
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const years: number[] = [];
  for (let y = currentYear; y >= 1930; y--) {
    years.push(y);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => Math.max(1930, y - 1));
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => Math.min(currentYear, y + 1));
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-[#190907] px-3 py-2 font-mono-tabular text-xs text-amber-50 hover:border-amber-400 focus:border-amber-400 focus:outline-none cursor-pointer text-left"
      >
        <span className={value ? 'text-amber-50' : 'font-sans text-amber-200/45'}>
          {value || 'Select birthday from calendar'}
        </span>
        <CalendarIcon className="h-4 w-4 text-amber-300 shrink-0" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Birthday Calendar Picker"
          className="absolute left-0 right-0 sm:right-auto sm:w-72 z-40 mt-1.5 rounded-xl border border-amber-500/40 bg-[#1B0B07] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.85)] space-y-2.5"
        >
          {/* Month / Year Controls */}
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/25 bg-[#120604] text-amber-200 hover:bg-[#2F130C] cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1.5 flex-1 justify-center">
              <select
                aria-label="Select birth month"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="rounded-md border border-amber-500/30 bg-[#120604] px-2 py-1 text-[11px] font-semibold text-amber-100 focus:outline-none"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Select birth year"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="rounded-md border border-amber-500/30 bg-[#120604] px-2 py-1 font-mono-tabular text-[11px] font-semibold text-amber-100 focus:outline-none"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/25 bg-[#120604] text-amber-200 hover:bg-[#2F130C] cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-amber-300/70">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center font-mono-tabular text-xs">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`empty_${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                parsed?.year === viewYear &&
                parsed?.month === viewMonth &&
                parsed?.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-amber-100 hover:bg-amber-500/20'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-amber-500/20 pt-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="text-amber-200/70 hover:text-amber-100 cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1 rounded bg-[#120604] border border-amber-500/30 px-2 py-0.5 text-amber-200 hover:text-amber-100 cursor-pointer"
            >
              <X className="h-3 w-3" />
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
