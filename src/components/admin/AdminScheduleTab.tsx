import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Lock,
  Plus,
  QrCode,
  Search,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { fetchAuthenticatedPrivateFileBlobUrl } from '../../utils/r2Client';
import {
  addDaysISO,
  computeAdminDaySlots,
  computeAdminStats,
  computeAvailableSlots,
  formatCurrencyBR,
  formatDateBR,
  formatDateISO,
  parseDateISO,
  validateBookingInput,
  WEEKDAY_FULL_PT,
} from '../../utils/schedule';
import type { Appointment, AppointmentStatus } from '../../types/booking';

const STATUS_META: Record<AppointmentStatus, { label: string; className: string }> = {
  confirmed: { label: 'Confirmado', className: 'text-[#30d158]' },
  pending: { label: 'Aguardando confirmação', className: 'text-[#ffd60a]' },
  completed: { label: 'Concluído', className: 'text-[#64d2ff]' },
  cancelled: { label: 'Cancelado', className: 'text-[#ff453a]' },
};

export function AdminScheduleTab() {
  const {
    appointments,
    busySlots,
    professionals,
    services,
    clients,
    settings,
    createAppointment,
    updateAppointmentStatus,
    rescheduleAppointment,
    deleteAppointment,
    toggleSlotBlock,
    toggleDayClosed,
    showToast,
  } = useBooking();

  const todayISO = useMemo(() => formatDateISO(new Date()), []);
  const defaultDateISO = useMemo(() => {
    const tomorrow = addDaysISO(todayISO, 1);
    return parseDateISO(tomorrow).getDay() === 0 ? addDaysISO(todayISO, 2) : tomorrow;
  }, [todayISO]);

  const [selectedDateISO, setSelectedDateISO] = useState<string>(defaultDateISO);
  const [selectedProId, setSelectedProId] = useState<string>(() => professionals[0]?.id || '');
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual booking modal state
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualProId, setManualProId] = useState(() => professionals[0]?.id || '');
  const [manualServiceId, setManualServiceId] = useState(() => services[0]?.id || '');
  const [manualDate, setManualDate] = useState(defaultDateISO);
  const [manualTime, setManualTime] = useState('10:30');
  const [manualNotes, setManualNotes] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleProId, setRescheduleProId] = useState('');

  // Private PIX receipt viewer modal state
  const [receiptViewerApt, setReceiptViewerApt] = useState<Appointment | null>(null);
  const [receiptBlobUrl, setReceiptBlobUrl] = useState<string>('');
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptLoadError, setReceiptLoadError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (receiptBlobUrl) {
        URL.revokeObjectURL(receiptBlobUrl);
      }
    };
  }, [receiptBlobUrl]);

  const openReceiptViewer = async (apt: Appointment) => {
    if (!apt.pixReceiptKey) return;
    if (receiptBlobUrl) {
      URL.revokeObjectURL(receiptBlobUrl);
      setReceiptBlobUrl('');
    }
    setReceiptViewerApt(apt);
    setReceiptLoadError(null);
    setReceiptLoading(true);
    try {
      const url = await fetchAuthenticatedPrivateFileBlobUrl(apt.pixReceiptKey);
      setReceiptBlobUrl(url);
    } catch (err) {
      setReceiptLoadError(
        err instanceof Error ? err.message : 'Não foi possível carregar o comprovante PIX.'
      );
    } finally {
      setReceiptLoading(false);
    }
  };

  const closeReceiptViewer = () => {
    if (receiptBlobUrl) {
      URL.revokeObjectURL(receiptBlobUrl);
      setReceiptBlobUrl('');
    }
    setReceiptViewerApt(null);
    setReceiptLoadError(null);
  };

  const activePro = useMemo(
    () => professionals.find((p) => p.id === selectedProId) || professionals[0],
    [professionals, selectedProId]
  );

  const isDayClosed = settings.closedDates.includes(selectedDateISO);
  const weekdayLabel = WEEKDAY_FULL_PT[parseDateISO(selectedDateISO).getDay()];

  const daySlots = useMemo(
    () =>
      computeAdminDaySlots({
        dateISO: selectedDateISO,
        professional: activePro,
        settings,
        busySlots,
        appointments,
      }),
    [selectedDateISO, activePro, settings, busySlots, appointments]
  );

  const availableSlotCount = daySlots.filter((s) => s.status === 'available').length;
  const stats = useMemo(
    () => computeAdminStats(appointments, selectedDateISO),
    [appointments, selectedDateISO]
  );

  const pendingApprovals = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'pending')
        .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)),
    [appointments]
  );

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments
      .filter((a) => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (q) {
          const match =
            a.clientName.toLowerCase().includes(q) ||
            a.clientPhone.toLowerCase().includes(q) ||
            a.serviceNames.join(' ').toLowerCase().includes(q) ||
            a.professionalName.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Highlight selected date first, then chronological
        const aIsSel = a.date === selectedDateISO ? 0 : 1;
        const bIsSel = b.date === selectedDateISO ? 0 : 1;
        if (aIsSel !== bIsSel) return aIsSel - bIsSel;
        return `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`);
      });
  }, [appointments, searchQuery, statusFilter, selectedDateISO]);

  const openManualModalForSlot = (timeStr?: string) => {
    setManualName('');
    setManualPhone('');
    setManualProId(activePro?.id || professionals[0]?.id || '');
    setManualServiceId(services.find((s) => s.active)?.id || services[0]?.id || '');
    setManualDate(selectedDateISO);
    setManualTime(timeStr || '10:30');
    setManualNotes('');
    setManualError(null);
    setNewBookingOpen(true);
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const check = validateBookingInput({
      selectedServiceIds: manualServiceId ? [manualServiceId] : [],
      professionalId: manualProId,
      date: manualDate,
      startTime: manualTime,
      clientName: manualName,
      clientPhone: manualPhone,
      forSomeoneElse: false,
      notes: manualNotes,
    });
    if (!check.valid) {
      setManualError(check.error || 'Preencha todos os campos.');
      return;
    }

    await createAppointment({
      clientName: manualName,
      clientPhone: manualPhone,
      forSomeoneElse: false,
      professionalId: manualProId,
      serviceIds: [manualServiceId],
      date: manualDate,
      startTime: manualTime,
      notes: manualNotes,
      status: 'confirmed',
      saveToDevice: false,
    });
    setNewBookingOpen(false);
  };

  const rescheduleAvailableTimes = useMemo(() => {
    if (!rescheduleTarget || !rescheduleDate) return [];
    const pro = professionals.find((p) => p.id === rescheduleProId);
    return computeAvailableSlots({
      dateISO: rescheduleDate,
      professional: pro,
      serviceDurationMinutes: rescheduleTarget.totalDurationMinutes,
      settings,
      busySlots: busySlots.filter(
        (b) => b.id !== rescheduleTarget.id && b.appointmentId !== rescheduleTarget.id
      ),
      appointments: appointments.filter((a) => a.id !== rescheduleTarget.id),
    });
  }, [rescheduleTarget, rescheduleDate, rescheduleProId, professionals, settings, busySlots, appointments]);

  return (
    <div className="space-y-6">
      {/* Header + Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#f4f4f5]">Agenda e Horários</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            Controle horários livres, bloqueios rápidos e todos os atendimentos em um só lugar.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openManualModalForSlot()}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a22413] active:scale-[0.98] text-white text-sm font-semibold whitespace-nowrap transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo agendamento
        </button>
      </div>

      {/* 4-column iOS Dark KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-[20px] bg-[#1c1c1e] border border-white/[0.08] p-4">
          <div className="text-xs text-[#8e8e93]">Agendamentos no dia</div>
          <div className="text-2xl font-bold text-[#f5f5f7] tabular-nums mt-1">
            {stats.totalDay}
          </div>
          <div className="text-xs text-[#636366] mt-1 tabular-nums">
            {formatDateBR(selectedDateISO)}
          </div>
        </div>
        <div className="rounded-[20px] bg-[#1c1c1e] border border-white/[0.08] p-4">
          <div className="text-xs text-[#8e8e93]">Confirmados / Concluídos</div>
          <div className="text-2xl font-bold text-[#f5f5f7] tabular-nums mt-1">
            {stats.confirmedDay + stats.completedDay}
          </div>
          <div className="text-xs text-[#636366] mt-1 tabular-nums">
            {stats.totalActiveAll} ativos na agenda
          </div>
        </div>
        <div className="rounded-[20px] bg-[#1c1c1e] border border-white/[0.08] p-4">
          <div className="text-xs text-[#8e8e93]">Receita prevista do dia</div>
          <div className="text-2xl font-bold text-[#30d158] tabular-nums mt-1">
            {formatCurrencyBR(stats.expectedRevenueDay)}
          </div>
          <div className="text-xs text-[#636366] mt-1">Exclui cancelados</div>
        </div>
        <div className="rounded-[20px] bg-[#1c1c1e] border border-white/[0.08] p-4">
          <div className="text-xs text-[#8e8e93]">Horários livres ({activePro?.name})</div>
          <div className="text-2xl font-bold text-[#f5f5f7] tabular-nums mt-1">
            {availableSlotCount}
          </div>
          <div className="text-xs text-[#636366] mt-1">
            {isDayClosed ? 'Dia fechado' : weekdayLabel}
          </div>
        </div>
      </div>

      {/* Pending Admin Confirmation Queue */}
      {pendingApprovals.length > 0 && (
        <section
          aria-label="Agendamentos aguardando confirmação"
          className="rounded-[22px] bg-[#1f1c16] border border-[#ffd60a]/30 overflow-hidden"
        >
          <div className="px-4 sm:px-5 py-3.5 border-b border-[#ffd60a]/20 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#ffd60a]/15 text-[#ffd60a] flex items-center justify-center shrink-0">
                <Clock3 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-[#f5f5f7]">
                  Aguardando confirmação ({pendingApprovals.length})
                </h2>
                <p className="text-xs text-[#aeaeb2]">
                  Estes horários estão bloqueados na agenda até você aprovar ou recusar.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-white/[0.07]">
            {pendingApprovals.map((apt) => {
              const hasPix = Boolean(apt.pixFeeAmount && apt.pixFeeAmount > 0);
              return (
                <div
                  key={apt.id}
                  className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="text-sm font-semibold text-[#f5f5f7] tabular-nums">
                        {formatDateBR(apt.date)} · {apt.startTime}
                      </span>
                      <span className="text-[#636366]" aria-hidden="true">
                        /
                      </span>
                      <span className="text-sm font-semibold text-white">{apt.clientName}</span>
                      <span className="text-xs text-[#aeaeb2] tabular-nums">{apt.clientPhone}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#aeaeb2]">
                      <span>{apt.serviceNames.join(' + ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{apt.professionalName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#30d158] font-medium tabular-nums">
                        Total {formatCurrencyBR(apt.totalPrice)}
                      </span>
                    </div>

                    {hasPix && (
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold text-[#ffd60a] tabular-nums">
                          <QrCode className="w-3.5 h-3.5" />
                          Taxa PIX ({apt.pixFeePercentage}%): {formatCurrencyBR(apt.pixFeeAmount || 0)}
                        </span>
                        <span className="text-[#8e8e93]">
                          {apt.pixReceiptKey
                            ? `· Comprovante anexado (${apt.pixReceiptFileName || 'arquivo'})`
                            : '· Sem comprovante anexado (verifique no banco/WhatsApp)'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {apt.pixReceiptKey && (
                      <button
                        type="button"
                        onClick={() => void openReceiptViewer(apt)}
                        className="min-h-[38px] px-3 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-xs font-semibold text-[#f5f5f7] inline-flex items-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#64d2ff]" />
                        <span>Ver comprovante</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void updateAppointmentStatus(apt.id, 'confirmed')}
                      className="min-h-[38px] px-3.5 rounded-xl bg-[#163a24] hover:bg-[#1e4f31] text-xs font-semibold text-[#4ade80] inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Aprovar / Confirmar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateAppointmentStatus(apt.id, 'cancelled')}
                      className="min-h-[38px] px-3.5 rounded-xl bg-[#3a1615] hover:bg-[#4e1d1b] text-xs font-semibold text-[#ff6961] inline-flex items-center gap-1.5 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Recusar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Day & Slot Grid Manager */}
      <section
        className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-4"
        aria-label="Grade de horários do dia"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#27272a]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDateISO(addDaysISO(selectedDateISO, -1))}
              aria-label="Dia anterior"
              className="h-10 w-10 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-95 flex items-center justify-center text-[#f5f5f7] transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              aria-label="Escolher data da agenda"
              value={selectedDateISO}
              onChange={(e) => setSelectedDateISO(e.target.value)}
              className="h-10 flex-1 sm:flex-none rounded-xl bg-[#2c2c2e] border border-transparent focus:border-[#8c1d0e] px-3 text-sm text-[#f5f5f7] tabular-nums focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setSelectedDateISO(addDaysISO(selectedDateISO, 1))}
              aria-label="Próximo dia"
              className="h-10 w-10 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-95 flex items-center justify-center text-[#f5f5f7] transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDateISO(todayISO)}
              className="h-10 px-3.5 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-95 text-xs font-semibold text-[#f5f5f7] transition-all"
            >
              Hoje
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex max-w-full rounded-xl bg-[#2c2c2e] p-1 gap-1 overflow-x-auto no-scrollbar">
              {professionals.map((pro) => (
                <button
                  key={pro.id}
                  type="button"
                  onClick={() => setSelectedProId(pro.id)}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activePro?.id === pro.id
                      ? 'bg-[#8c1d0e] text-white'
                      : 'text-[#aeaeb2] hover:text-white'
                  }`}
                >
                  {pro.name}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void toggleDayClosed(selectedDateISO)}
              className={`h-10 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isDayClosed
                  ? 'bg-[#163a24] text-[#4ade80] hover:bg-[#1b4a2e]'
                  : 'bg-[#2a1818] text-[#f87171] hover:bg-[#3a1f1f]'
              }`}
            >
              {isDayClosed ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {isDayClosed ? 'Reabrir dia' : 'Fechar dia inteiro'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#a1a1aa]">
          <span>Clique em um horário livre para bloquear ou agendar rapidamente.</span>
          <span className="text-[#4ade80]">Livre</span>
          <span className="text-[#f4f4f5]">Agendado</span>
          <span className="text-[#f87171]">Bloqueado</span>
        </div>

        {isDayClosed ? (
          <div className="py-8 text-center text-sm text-[#f87171]">
            Este dia está marcado como fechado. Clientes verão nenhum horário disponível.
          </div>
        ) : daySlots.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#a1a1aa]">
            Sem expediente configurado para {weekdayLabel} com {activePro?.name}.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
            {daySlots.map((item) => {
              if (item.status === 'booked' && item.appointment) {
                const isPending = item.appointment.status === 'pending';
                return (
                  <div
                    key={item.time}
                    className={`rounded-xl p-2.5 flex flex-col justify-between min-h-[76px] border ${
                      isPending
                        ? 'bg-[#252014] border-[#ffd60a]/45'
                        : 'bg-[#222227] border-[#3a3a42]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#f4f4f5] tabular-nums">
                        {item.time}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          isPending ? 'text-[#ffd60a]' : 'text-[#93c5fd]'
                        }`}
                      >
                        {isPending ? 'Aguardando' : 'Agendado'}
                      </span>
                    </div>
                    <div className="text-xs text-[#e4e4e7] truncate mt-1">
                      {item.appointment.clientName}
                    </div>
                    <div className="text-[11px] text-[#a1a1aa] truncate">
                      {item.appointment.serviceNames[0]}
                    </div>
                  </div>
                );
              }

              if (item.status === 'blocked') {
                return (
                  <button
                    key={item.time}
                    type="button"
                    onClick={() =>
                      activePro && void toggleSlotBlock(selectedDateISO, item.time, activePro.id)
                    }
                    aria-label={`Liberar horário ${item.time}`}
                    className="rounded-xl bg-[#241616] border border-[#522626] hover:border-[#8c1d0e] p-2.5 text-left flex flex-col justify-between min-h-[76px] transition-colors"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-semibold text-[#f87171] tabular-nums">
                        {item.time}
                      </span>
                      <Lock className="w-3.5 h-3.5 text-[#f87171]" />
                    </div>
                    <div className="text-[11px] text-[#fca5a5] mt-2">Bloqueado · Liberar</div>
                  </button>
                );
              }

              return (
                <div
                  key={item.time}
                  className="rounded-xl bg-[#1a1a1d] border border-[#2d2d33] p-2.5 flex flex-col justify-between min-h-[76px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#4ade80] tabular-nums">
                      {item.time}
                    </span>
                    <span className="text-[11px] text-[#a1a1aa]">Livre</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => openManualModalForSlot(item.time)}
                      aria-label={`Agendar às ${item.time}`}
                      className="flex-1 py-1 px-2 rounded-md bg-[#2b2b31] hover:bg-[#3a3a42] text-[11px] font-medium text-[#f4f4f5] transition-colors"
                    >
                      Agendar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        activePro && void toggleSlotBlock(selectedDateISO, item.time, activePro.id)
                      }
                      aria-label={`Bloquear horário ${item.time}`}
                      className="py-1 px-2 rounded-md bg-[#271b1b] hover:bg-[#3a2222] text-[11px] font-medium text-[#fca5a5] transition-colors"
                    >
                      Bloquear
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Appointments List / Table */}
      <section className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#38383a]/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[#f5f5f7]">Todos os agendamentos</h2>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Buscar agendamento por cliente ou serviço"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente, telefone..."
                className="w-full sm:w-56 h-9 rounded-lg bg-[#222226] border border-[#323238] pl-9 pr-3 text-xs text-[#f4f4f5] placeholder-[#71717a] focus:outline-none focus:border-[#8c1d0e]"
              />
            </div>

            <div className="inline-flex rounded-lg bg-[#222226] p-1 gap-0.5 overflow-x-auto">
              {(
                [
                  ['all', 'Todos'],
                  ['confirmed', 'Confirmados'],
                  ['pending', 'Pendentes'],
                  ['completed', 'Concluídos'],
                  ['cancelled', 'Cancelados'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === key
                      ? 'bg-[#8c1d0e] text-white'
                      : 'text-[#a1a1aa] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#a1a1aa]">
            Nenhum agendamento encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-[#252529]">
            {filteredAppointments.map((apt) => {
              const st = STATUS_META[apt.status];
              return (
                <div
                  key={apt.id}
                  className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[#1b1b1e] transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="text-sm font-semibold text-[#f4f4f5] tabular-nums">
                        {formatDateBR(apt.date)} · {apt.startTime}
                      </span>
                      <span className="text-[#52525b]" aria-hidden="true">
                        /
                      </span>
                      <span className="text-sm font-medium text-[#e4e4e7]">{apt.clientName}</span>
                      <span className="text-xs text-[#a1a1aa] tabular-nums">{apt.clientPhone}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[#a1a1aa]">
                      <span>{apt.serviceNames.join(' + ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{apt.professionalName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#4ade80] font-medium tabular-nums">
                        {formatCurrencyBR(apt.totalPrice)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold ${st.className}`}>{st.label}</span>
                    </div>
                    {apt.pixFeeAmount && apt.pixFeeAmount > 0 ? (
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#d4d4d8]">
                        <span className="text-[#ffd60a] font-medium tabular-nums">
                          Taxa PIX ({apt.pixFeePercentage || 0}%): {formatCurrencyBR(apt.pixFeeAmount)}
                        </span>
                        <span className="text-[#8e8e93]">
                          ·{' '}
                          {apt.pixPaymentStatus === 'paid'
                            ? 'Confirmada'
                            : apt.pixPaymentStatus === 'rejected'
                            ? 'Recusada'
                            : 'Aguardando conferência'}
                        </span>
                      </div>
                    ) : null}
                    {apt.notes && <div className="text-xs text-[#71717a]">Obs.: {apt.notes}</div>}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {apt.pixReceiptKey && (
                      <button
                        type="button"
                        onClick={() => void openReceiptViewer(apt)}
                        aria-label={`Ver comprovante PIX de ${apt.clientName}`}
                        className="h-8 px-2.5 rounded-lg bg-[#26262b] hover:bg-[#323238] text-xs font-medium text-[#64d2ff] inline-flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Comprovante
                      </button>
                    )}
                    {apt.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => void updateAppointmentStatus(apt.id, 'confirmed')}
                        aria-label={`Confirmar agendamento de ${apt.clientName}`}
                        className="h-8 px-2.5 rounded-lg bg-[#163a24] hover:bg-[#1d4c30] text-xs font-medium text-[#4ade80] inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Confirmar
                      </button>
                    )}
                    {(apt.status === 'confirmed' || apt.status === 'pending') && (
                      <button
                        type="button"
                        onClick={() => void updateAppointmentStatus(apt.id, 'completed')}
                        aria-label={`Concluir agendamento de ${apt.clientName}`}
                        className="h-8 px-2.5 rounded-lg bg-[#1e2d45] hover:bg-[#263a59] text-xs font-medium text-[#93c5fd] inline-flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Concluir
                      </button>
                    )}
                    {apt.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRescheduleTarget(apt);
                          setRescheduleDate(apt.date);
                          setRescheduleProId(apt.professionalId);
                          setRescheduleTime('');
                        }}
                        aria-label={`Remarcar agendamento de ${apt.clientName}`}
                        className="h-8 px-2.5 rounded-lg bg-[#26262b] hover:bg-[#323238] text-xs font-medium text-[#e4e4e7] inline-flex items-center gap-1"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Remarcar
                      </button>
                    )}
                    {apt.status !== 'cancelled' && apt.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => void updateAppointmentStatus(apt.id, 'cancelled')}
                        aria-label={`Cancelar agendamento de ${apt.clientName}`}
                        className="h-8 px-2.5 rounded-lg bg-[#2a1818] hover:bg-[#3c2020] text-xs font-medium text-[#f87171]"
                      >
                        Cancelar
                      </button>
                    )}
                      <button
                        type="button"
                        onClick={() => {
                          const msg = `Olá ${apt.clientName}! Lembrando do seu horário em ${settings.businessName} no dia ${formatDateBR(apt.date)} às ${apt.startTime} (${apt.serviceNames.join(', ')}) com ${apt.professionalName}.`;
                          if (navigator.clipboard?.writeText) {
                            void navigator.clipboard.writeText(msg);
                          }
                          showToast(`Lembrete de ${apt.clientName} copiado para enviar no WhatsApp.`);
                        }}
                        aria-label={`Copiar lembrete WhatsApp para ${apt.clientName}`}
                        className="h-8 px-2.5 rounded-lg bg-[#222227] hover:bg-[#2d2d34] text-xs font-medium text-[#d4d4d8] inline-flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Lembrete
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAppointment(apt.id)}
                        aria-label={`Excluir agendamento de ${apt.clientName}`}
                        className="h-8 w-8 rounded-lg hover:bg-[#2a1818] text-[#71717a] hover:text-[#f87171] flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Manual Booking Modal (iOS Bottom Sheet on Mobile) */}
      {newBookingOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Novo agendamento manual"
        >
          <form
            onSubmit={handleCreateManual}
            className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 p-5 pb-safe space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-1 mb-1" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#f4f4f5]">Novo agendamento manual</h3>
              <button
                type="button"
                onClick={() => setNewBookingOpen(false)}
                aria-label="Fechar modal"
                className="h-10 w-10 rounded-full bg-[#2c2c2e] text-[#aeaeb2] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {clients.length > 0 && (
              <div>
                <label htmlFor="quick-client" className="block text-xs text-[#a1a1aa] mb-1">
                  Preencher de cliente cadastrado (opcional)
                </label>
                <select
                  id="quick-client"
                  defaultValue=""
                  onChange={(e) => {
                    const found = clients.find((c) => c.id === e.target.value);
                    if (found) {
                      setManualName(found.name);
                      setManualPhone(found.phone);
                    }
                  }}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                >
                  <option value="">Selecionar cliente existente...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.phone}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-name" className="block text-xs text-[#a1a1aa] mb-1">
                  Nome do cliente
                </label>
                <input
                  id="manual-name"
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                />
              </div>
              <div>
                <label htmlFor="manual-phone" className="block text-xs text-[#a1a1aa] mb-1">
                  WhatsApp
                </label>
                <input
                  id="manual-phone"
                  type="tel"
                  required
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="(19) 99999-9999"
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-srv" className="block text-xs text-[#a1a1aa] mb-1">
                  Serviço
                </label>
                <select
                  id="manual-srv"
                  value={manualServiceId}
                  onChange={(e) => setManualServiceId(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatCurrencyBR(s.price)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="manual-pro" className="block text-xs text-[#a1a1aa] mb-1">
                  Profissional
                </label>
                <select
                  id="manual-pro"
                  value={manualProId}
                  onChange={(e) => setManualProId(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                >
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-date" className="block text-xs text-[#a1a1aa] mb-1">
                  Data
                </label>
                <input
                  id="manual-date"
                  type="date"
                  required
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                />
              </div>
              <div>
                <label htmlFor="manual-time" className="block text-xs text-[#a1a1aa] mb-1">
                  Horário
                </label>
                <input
                  id="manual-time"
                  type="time"
                  required
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="manual-notes" className="block text-xs text-[#a1a1aa] mb-1">
                Observação (opcional)
              </label>
              <input
                id="manual-notes"
                type="text"
                maxLength={400}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
              />
            </div>

            {manualError && <p className="text-xs text-[#f87171]">{manualError}</p>}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setNewBookingOpen(false)}
                className="flex-1 h-11 rounded-xl border border-[#3a3a3f] text-sm text-[#e4e4e7]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-[#8c1d0e] hover:bg-[#a22413] text-sm font-medium text-white"
              >
                Salvar agendamento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Reschedule Modal (iOS Bottom Sheet on Mobile) */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Remarcar atendimento"
        >
          <div className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 p-5 pb-safe space-y-4">
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-1 mb-1" />
            <h3 className="text-base font-semibold text-[#f4f4f5]">
              Remarcar: {rescheduleTarget.clientName}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adm-res-date" className="block text-xs text-[#a1a1aa] mb-1">
                  Nova data
                </label>
                <input
                  id="adm-res-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    setRescheduleTime('');
                  }}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                />
              </div>
              <div>
                <label htmlFor="adm-res-pro" className="block text-xs text-[#a1a1aa] mb-1">
                  Profissional
                </label>
                <select
                  id="adm-res-pro"
                  value={rescheduleProId}
                  onChange={(e) => {
                    setRescheduleProId(e.target.value);
                    setRescheduleTime('');
                  }}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                >
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="text-xs text-[#a1a1aa] mb-2">Horários disponíveis</div>
              {rescheduleAvailableTimes.length === 0 ? (
                <p className="text-xs text-[#f87171]">Nenhum horário livre nesta data.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                  {rescheduleAvailableTimes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRescheduleTime(t)}
                      className={`h-9 rounded-lg text-xs font-medium tabular-nums ${
                        rescheduleTime === t
                          ? 'bg-[#8c1d0e] text-white'
                          : 'bg-[#2a2a2f] text-[#e4e4e7] hover:bg-[#3a3a40]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="flex-1 h-10 rounded-xl border border-[#3a3a3f] text-sm text-[#e4e4e7]"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!rescheduleTime}
                onClick={async () => {
                  await rescheduleAppointment(
                    rescheduleTarget.id,
                    rescheduleDate,
                    rescheduleTime,
                    rescheduleProId
                  );
                  setRescheduleTarget(null);
                }}
                className="flex-1 h-10 rounded-xl bg-[#8c1d0e] hover:bg-[#a22413] disabled:opacity-40 text-sm font-medium text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authenticated Private PIX Receipt Viewer Modal */}
      {receiptViewerApt && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Comprovante PIX enviado pelo cliente"
          onClick={closeReceiptViewer}
        >
          <div
            className="w-full sm:max-w-xl rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 p-5 pb-safe space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-1" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#f5f5f7]">
                  Comprovante PIX · {receiptViewerApt.clientName}
                </h3>
                <p className="text-xs text-[#aeaeb2] mt-0.5 tabular-nums">
                  Taxa {receiptViewerApt.pixFeePercentage || 0}%:{' '}
                  {formatCurrencyBR(receiptViewerApt.pixFeeAmount || 0)} ·{' '}
                  {formatDateBR(receiptViewerApt.date)} às {receiptViewerApt.startTime}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReceiptViewer}
                aria-label="Fechar comprovante"
                className="h-9 w-9 rounded-full bg-[#2c2c2e] text-[#aeaeb2] hover:text-white flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#111113] border border-white/[0.08] overflow-hidden min-h-[260px] flex items-center justify-center p-3">
              {receiptLoading ? (
                <p className="text-sm text-[#aeaeb2]">Carregando comprovante privado...</p>
              ) : receiptLoadError ? (
                <p className="text-sm text-[#ff6961] text-center px-4">{receiptLoadError}</p>
              ) : receiptBlobUrl ? (
                receiptViewerApt.pixReceiptMimeType === 'application/pdf' ? (
                  <iframe
                    src={receiptBlobUrl}
                    title={`Comprovante PDF de ${receiptViewerApt.clientName}`}
                    className="w-full h-[55vh] rounded-xl bg-white"
                  />
                ) : (
                  <img
                    src={receiptBlobUrl}
                    alt={`Comprovante PIX de ${receiptViewerApt.clientName}`}
                    className="max-w-full max-h-[58vh] object-contain rounded-xl"
                  />
                )
              ) : null}
            </div>

            {receiptViewerApt.status === 'pending' && (
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    await updateAppointmentStatus(receiptViewerApt.id, 'confirmed');
                    closeReceiptViewer();
                  }}
                  className="flex-1 h-11 rounded-2xl bg-[#163a24] hover:bg-[#1e4f31] text-sm font-semibold text-[#4ade80] inline-flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Aprovar e confirmar horário</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateAppointmentStatus(receiptViewerApt.id, 'cancelled');
                    closeReceiptViewer();
                  }}
                  className="flex-1 h-11 rounded-2xl bg-[#3a1615] hover:bg-[#4e1d1b] text-sm font-semibold text-[#ff6961] inline-flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  <span>Recusar e liberar horário</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
