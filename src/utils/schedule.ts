import type {
  Appointment,
  BusinessSettings,
  BusySlot,
  Professional,
  ServiceItem,
} from '../types/booking';

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '').slice(0, 15);
}

export function formatPhoneMaskBR(raw: string): string {
  const digits = normalizePhoneDigits(raw).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export async function hashPhoneDigits(phone: string): Promise<string> {
  const digits = normalizePhoneDigits(phone);
  const data = new TextEncoder().encode(`esmalteria-phone-v1:${digits}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateCancelToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const WEEKDAY_SHORT_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const WEEKDAY_CALENDAR_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAY_FULL_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function rangesOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
): boolean {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB && startB < endA;
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function addDaysISO(iso: string, deltaDays: number): string {
  const dt = parseDateISO(iso);
  dt.setDate(dt.getDate() + deltaDays);
  return formatDateISO(dt);
}

export function getWeekdayIndex(iso: string): number {
  return parseDateISO(iso).getDay();
}

export function formatCurrencyBR(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDateBR(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function getUpcomingDates(startISO: string, count = 14): Array<{
  iso: string;
  dayNumber: number;
  weekdayShort: string;
  monthIndex: number;
  year: number;
}> {
  const result = [];
  for (let i = 0; i < count; i++) {
    const iso = addDaysISO(startISO, i);
    const dt = parseDateISO(iso);
    result.push({
      iso,
      dayNumber: dt.getDate(),
      weekdayShort: WEEKDAY_SHORT_PT[dt.getDay()],
      monthIndex: dt.getMonth(),
      year: dt.getFullYear(),
    });
  }
  return result;
}

export interface CalendarGridCell {
  iso: string;
  dayNumber: number;
  inCurrentMonth: boolean;
}

export function getCalendarMonthGrid(year: number, monthIndex: number): CalendarGridCell[] {
  const firstDay = new Date(year, monthIndex, 1, 12, 0, 0);
  const startOffset = firstDay.getDay();
  const startDate = new Date(year, monthIndex, 1 - startOffset, 12, 0, 0);

  const cells: CalendarGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const current = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + i,
      12,
      0,
      0
    );
    cells.push({
      iso: formatDateISO(current),
      dayNumber: current.getDate(),
      inCurrentMonth: current.getMonth() === monthIndex,
    });
  }
  return cells;
}

export interface SlotStatusItem {
  time: string;
  status: 'available' | 'booked' | 'blocked';
  appointment?: Appointment;
  busySlot?: BusySlot;
}

/**
 * Generates all candidate slot start times for a given day according to salon settings
 * and the selected professional's workDays.
 */
export function generateBaseSlotsForDate(
  dateISO: string,
  settings: BusinessSettings,
  professional?: Professional
): string[] {
  if (settings.closedDates.includes(dateISO)) {
    return [];
  }

  const weekday = getWeekdayIndex(dateISO);
  if (professional && !professional.workDays.includes(weekday)) {
    return [];
  }

  const dayCfg = settings.weeklySchedule[String(weekday)];
  if (!dayCfg || !dayCfg.open) {
    return [];
  }

  const startMin = timeToMinutes(dayCfg.start);
  const endMin = timeToMinutes(dayCfg.end);
  const interval = Math.max(10, settings.slotIntervalMinutes || 30);

  const breakStartMin = dayCfg.breakStart ? timeToMinutes(dayCfg.breakStart) : null;
  const breakEndMin = dayCfg.breakEnd ? timeToMinutes(dayCfg.breakEnd) : null;

  const slots: string[] = [];
  for (let current = startMin; current < endMin; current += interval) {
    if (
      breakStartMin !== null &&
      breakEndMin !== null &&
      breakEndMin > breakStartMin &&
      current >= breakStartMin &&
      current < breakEndMin
    ) {
      continue;
    }
    slots.push(minutesToTime(current));
  }
  return slots;
}

/**
 * Computes available start times for clients given service duration, busy slots, and appointments.
 */
export function computeAvailableSlots(params: {
  dateISO: string;
  professional: Professional | undefined;
  serviceDurationMinutes: number;
  settings: BusinessSettings;
  busySlots: BusySlot[];
  appointments: Appointment[];
}): string[] {
  const { dateISO, professional, serviceDurationMinutes, settings, busySlots, appointments } = params;
  if (!professional) return [];

  const baseSlots = generateBaseSlotsForDate(dateISO, settings, professional);
  if (baseSlots.length === 0) return [];

  const weekday = getWeekdayIndex(dateISO);
  const dayCfg = settings.weeklySchedule[String(weekday)];
  if (!dayCfg || !dayCfg.open) return [];

  const endMin = timeToMinutes(dayCfg.end);
  const breakStartMin = dayCfg.breakStart ? timeToMinutes(dayCfg.breakStart) : null;
  const breakEndMin = dayCfg.breakEnd ? timeToMinutes(dayCfg.breakEnd) : null;
  const duration = Math.max(15, serviceDurationMinutes || 30);

  const occupiedRanges: Array<{ start: number; duration: number }> = [];

  for (const slot of busySlots) {
    if (slot.date === dateISO && slot.professionalId === professional.id) {
      occupiedRanges.push({
        start: timeToMinutes(slot.startTime),
        duration: slot.durationMinutes,
      });
    }
  }

  for (const apt of appointments) {
    if (
      apt.date === dateISO &&
      apt.professionalId === professional.id &&
      apt.status !== 'cancelled'
    ) {
      occupiedRanges.push({
        start: timeToMinutes(apt.startTime),
        duration: apt.totalDurationMinutes,
      });
    }
  }

  return baseSlots.filter((timeStr) => {
    const startMin = timeToMinutes(timeStr);
    // Service must finish by closing time
    if (startMin + duration > endMin) return false;
    // Service cannot overlap lunch break
    if (
      breakStartMin !== null &&
      breakEndMin !== null &&
      breakEndMin > breakStartMin &&
      rangesOverlap(startMin, duration, breakStartMin, breakEndMin - breakStartMin)
    ) {
      return false;
    }
    // Check conflicts with booked appointments or admin blocks
    for (const occ of occupiedRanges) {
      if (rangesOverlap(startMin, duration, occ.start, occ.duration)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Computes full slot status breakdown for the Admin Time Slot Manager.
 */
export function computeAdminDaySlots(params: {
  dateISO: string;
  professional: Professional | undefined;
  settings: BusinessSettings;
  busySlots: BusySlot[];
  appointments: Appointment[];
}): SlotStatusItem[] {
  const { dateISO, professional, settings, busySlots, appointments } = params;
  if (!professional) return [];

  const baseSlots = generateBaseSlotsForDate(dateISO, settings, professional);
  const interval = Math.max(10, settings.slotIntervalMinutes || 30);

  const dayApts = appointments.filter(
    (a) => a.date === dateISO && a.professionalId === professional.id && a.status !== 'cancelled'
  );
  const dayBlocks = busySlots.filter(
    (b) => b.date === dateISO && b.professionalId === professional.id && b.kind === 'blocked'
  );

  return baseSlots.map((timeStr) => {
    const startMin = timeToMinutes(timeStr);
    const matchingApt = dayApts.find((a) =>
      rangesOverlap(startMin, interval, timeToMinutes(a.startTime), a.totalDurationMinutes)
    );
    if (matchingApt) {
      return { time: timeStr, status: 'booked', appointment: matchingApt };
    }
    const matchingBlock = dayBlocks.find((b) =>
      rangesOverlap(startMin, interval, timeToMinutes(b.startTime), b.durationMinutes)
    );
    if (matchingBlock) {
      return { time: timeStr, status: 'blocked', busySlot: matchingBlock };
    }
    return { time: timeStr, status: 'available' };
  });
}

export function calculateServicesSummary(services: ServiceItem[], selectedIds: string[]): {
  totalPrice: number;
  totalDurationMinutes: number;
  selectedServices: ServiceItem[];
} {
  const selectedServices = services.filter((s) => selectedIds.includes(s.id));
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDurationMinutes = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  return { totalPrice, totalDurationMinutes, selectedServices };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateBookingInput(input: {
  selectedServiceIds: string[];
  professionalId: string;
  date: string;
  startTime: string;
  clientName: string;
  clientPhone: string;
  forSomeoneElse: boolean;
  guestName?: string;
  notes?: string;
}): ValidationResult {
  if (!input.selectedServiceIds.length || input.selectedServiceIds.length > 10) {
    return { valid: false, error: 'Selecione ao menos um procedimento.' };
  }
  if (!input.professionalId) {
    return { valid: false, error: 'Escolha um profissional.' };
  }
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)) {
    return { valid: false, error: 'Escolha uma data válida.' };
  }
  if (!/^[0-9]{2}:[0-9]{2}$/.test(input.startTime)) {
    return { valid: false, error: 'Selecione um horário disponível.' };
  }
  const cleanName = input.clientName.trim();
  if (cleanName.length < 2 || cleanName.length > 100) {
    return { valid: false, error: 'Informe seu nome completo (mínimo 2 caracteres).' };
  }
  const digits = input.clientPhone.replace(/\D/g, '');
  if (digits.length < 8 || input.clientPhone.trim().length > 30) {
    return { valid: false, error: 'Informe um WhatsApp/telefone válido com DDD.' };
  }
  if (input.forSomeoneElse && (!input.guestName || input.guestName.trim().length < 2)) {
    return { valid: false, error: 'Informe o nome da pessoa que será atendida.' };
  }
  if (input.notes && input.notes.length > 400) {
    return { valid: false, error: 'A observação pode ter no máximo 400 caracteres.' };
  }
  return { valid: true };
}

export function validateServiceInput(input: {
  name: string;
  category: string;
  price: number;
  durationMinutes: number;
}): ValidationResult {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) {
    return { valid: false, error: 'Nome do serviço deve ter entre 2 e 100 caracteres.' };
  }
  const category = input.category.trim();
  if (category.length < 2 || category.length > 60) {
    return { valid: false, error: 'Categoria deve ter entre 2 e 60 caracteres.' };
  }
  if (!Number.isFinite(input.price) || input.price < 0 || input.price > 50000) {
    return { valid: false, error: 'Informe um valor válido em R$.' };
  }
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 5 ||
    input.durationMinutes > 480
  ) {
    return { valid: false, error: 'Duração deve ser entre 5 e 480 minutos.' };
  }
  return { valid: true };
}

export function validateClientInput(input: {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}): ValidationResult {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) {
    return { valid: false, error: 'Nome do cliente deve ter entre 2 e 100 caracteres.' };
  }
  const digits = input.phone.replace(/\D/g, '');
  if (digits.length < 8 || input.phone.trim().length > 30) {
    return { valid: false, error: 'Informe um telefone/WhatsApp válido.' };
  }
  if (input.email && input.email.length > 120) {
    return { valid: false, error: 'E-mail muito longo.' };
  }
  if (input.notes && input.notes.length > 400) {
    return { valid: false, error: 'Observações podem ter no máximo 400 caracteres.' };
  }
  return { valid: true };
}

export function computeAdminStats(appointments: Appointment[], selectedDateISO: string): {
  totalDay: number;
  confirmedDay: number;
  completedDay: number;
  expectedRevenueDay: number;
  totalActiveAll: number;
} {
  const dayItems = appointments.filter((a) => a.date === selectedDateISO && a.status !== 'cancelled');
  const confirmedDay = dayItems.filter((a) => a.status === 'confirmed').length;
  const completedDay = dayItems.filter((a) => a.status === 'completed').length;
  const expectedRevenueDay = dayItems.reduce((sum, a) => sum + a.totalPrice, 0);
  const totalActiveAll = appointments.filter(
    (a) => a.status === 'confirmed' || a.status === 'pending'
  ).length;

  return {
    totalDay: dayItems.length,
    confirmedDay,
    completedDay,
    expectedRevenueDay,
    totalActiveAll,
  };
}
