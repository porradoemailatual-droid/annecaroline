import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  formatDateISO,
  getCalendarMonthGrid,
  MONTH_NAMES_PT,
  parseDateISO,
  WEEKDAY_CALENDAR_PT,
} from '../../utils/schedule';

interface CalendarModalProps {
  open: boolean;
  selectedDateISO: string;
  minDateISO?: string;
  closedDates?: string[];
  onSelectDate: (iso: string) => void;
  onClose: () => void;
}

export function CalendarModal({
  open,
  selectedDateISO,
  minDateISO,
  closedDates = [],
  onSelectDate,
  onClose,
}: CalendarModalProps) {
  const initialDate = parseDateISO(selectedDateISO);
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());

  if (!open) return null;

  const cells = getCalendarMonthGrid(viewYear, viewMonth);
  const minISO = minDateISO || formatDateISO(new Date());
  const yearOptions = [viewYear - 1, viewYear, viewYear + 1];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Selecionar data no calendário"
    >
      <div className="w-full max-w-sm rounded-t-[28px] sm:rounded-[28px] bg-[#1c1c1e] border border-white/[0.1] p-5 pb-7 sm:pb-5 shadow-2xl">
        {/* iOS Sheet Grabber */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4 sm:hidden" aria-hidden="true" />

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#f5f5f7]">Escolha a data</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar calendário"
            className="w-8 h-8 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] flex items-center justify-center text-[#aeaeb2] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month & Year selectors */}
        <div className="grid grid-cols-5 gap-2.5 mb-5">
          <div className="col-span-3 relative">
            <select
              aria-label="Mês"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="w-full appearance-none rounded-[14px] bg-[#2c2c2e] px-3.5 py-2.5 pr-9 text-sm font-medium text-[#f5f5f7] focus:outline-none focus:ring-1 focus:ring-[#8c1d0e]"
            >
              {MONTH_NAMES_PT.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#aeaeb2] pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </div>

          <div className="col-span-2 relative">
            <select
              aria-label="Ano"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="w-full appearance-none rounded-[14px] bg-[#2c2c2e] px-3.5 py-2.5 pr-9 text-sm font-medium text-[#f5f5f7] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#8c1d0e]"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#aeaeb2] pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2 text-center">
          {WEEKDAY_CALENDAR_PT.map((day) => (
            <div key={day} className="text-[11px] font-semibold text-[#8e8e93] py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const isPast = cell.iso < minISO;
            const isClosed = closedDates.includes(cell.iso);
            const isSelected = cell.iso === selectedDateISO;
            const disabled = isPast;

            return (
              <button
                key={cell.iso}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onSelectDate(cell.iso);
                  onClose();
                }}
                aria-label={`Selecionar dia ${cell.dayNumber}`}
                className={`h-10 w-full rounded-full text-sm font-medium tabular-nums transition-all ${
                  isSelected
                    ? 'bg-[#8c1d0e] text-white font-semibold'
                    : disabled || !cell.inCurrentMonth
                      ? 'text-[#48484a] cursor-not-allowed'
                      : isClosed
                        ? 'text-[#636366] hover:bg-[#2c2c2e]'
                        : 'text-[#f5f5f7] hover:bg-[#2c2c2e]'
                }`}
              >
                {cell.dayNumber}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
