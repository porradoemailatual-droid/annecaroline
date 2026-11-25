import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Clock3,
  QrCode,
  Scissors,
  UserPlus,
  X,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import {
  calculatePixFee,
  clampPixFeePercentage,
  isPixFeeActive,
} from '../../utils/pix';
import {
  addDaysISO,
  calculateServicesSummary,
  computeAvailableSlots,
  formatCurrencyBR,
  formatDateBR,
  formatDateISO,
  formatPhoneMaskBR,
  getUpcomingDates,
  MONTH_NAMES_PT,
  parseDateISO,
  validateBookingInput,
} from '../../utils/schedule';
import { CalendarModal } from './CalendarModal';
import { PixCheckoutModal } from './PixCheckoutModal';
import type { R2UploadedReceiptPayload } from '../../utils/r2Client';
import type { Appointment, GalleryItem } from '../../types/booking';

interface BookingFlowProps {
  mobileStep: 'services' | 'schedule';
  onChangeMobileStep: (step: 'services' | 'schedule') => void;
  onGoToAppointments: () => void;
}

export function BookingFlow({
  mobileStep,
  onChangeMobileStep,
  onGoToAppointments,
}: BookingFlowProps) {
  const {
    services,
    professionals,
    settings,
    busySlots,
    appointments,
    galleryItems,
    createAppointment,
  } = useBooking();

  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const activePros = useMemo(() => professionals.filter((p) => p.active), [professionals]);
  const activeGallery = useMemo(() => galleryItems.filter((g) => g.active && g.imageUrl), [galleryItems]);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);

  useEffect(() => {
    if (!lightboxItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxItem(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxItem]);

  const todayISO = useMemo(() => formatDateISO(new Date()), []);
  const defaultDateISO = useMemo(() => {
    const tomorrow = addDaysISO(todayISO, 1);
    return parseDateISO(tomorrow).getDay() === 0 ? addDaysISO(todayISO, 2) : tomorrow;
  }, [todayISO]);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(() =>
    activeServices[0] ? [activeServices[0].id] : []
  );
  const [selectedProId, setSelectedProId] = useState<string>(() => activePros[0]?.id || '');
  const [selectedDateISO, setSelectedDateISO] = useState<string>(defaultDateISO);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Always starts empty — zero login, zero email, zero prefilled user data
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [confirmedApt, setConfirmedApt] = useState<Appointment | null>(null);

  const effectivePro = useMemo(
    () => activePros.find((p) => p.id === selectedProId) || activePros[0],
    [activePros, selectedProId]
  );

  const { totalPrice, totalDurationMinutes } = useMemo(
    () => calculateServicesSummary(activeServices, selectedServiceIds),
    [activeServices, selectedServiceIds]
  );

  const selectedServiceNames = useMemo(
    () =>
      activeServices
        .filter((s) => selectedServiceIds.includes(s.id))
        .map((s) => s.name),
    [activeServices, selectedServiceIds]
  );

  const pixActive = useMemo(() => isPixFeeActive(settings), [settings]);
  const pixFeePct = clampPixFeePercentage(settings.pixFeePercentage);
  const { feeAmount: pixFeeAmount, remainingAmount: pixRemainingAmount } = useMemo(
    () => (pixActive ? calculatePixFee(totalPrice, pixFeePct) : { feeAmount: 0, remainingAmount: totalPrice }),
    [pixActive, pixFeePct, totalPrice]
  );
  const requiresPixCheckout = pixActive && pixFeeAmount > 0;

  const upcomingDates = useMemo(() => {
    const base = getUpcomingDates(todayISO, 14);
    if (!base.some((d) => d.iso === selectedDateISO)) {
      const dt = parseDateISO(selectedDateISO);
      const WEEKDAY_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
      return [
        {
          iso: selectedDateISO,
          dayNumber: dt.getDate(),
          weekdayShort: WEEKDAY_SHORT[dt.getDay()],
          monthIndex: dt.getMonth(),
          year: dt.getFullYear(),
        },
        ...base,
      ];
    }
    return base;
  }, [selectedDateISO, todayISO]);

  const selectedDateMonthName = MONTH_NAMES_PT[parseDateISO(selectedDateISO).getMonth()];

  const availableSlots = useMemo(
    () =>
      computeAvailableSlots({
        dateISO: selectedDateISO,
        professional: effectivePro,
        serviceDurationMinutes: totalDurationMinutes || 60,
        settings,
        busySlots,
        appointments,
      }),
    [selectedDateISO, effectivePro, totalDurationMinutes, settings, busySlots, appointments]
  );

  const toggleService = (id: string) => {
    setFormError(null);
    setSelectedTime('');
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const submitFinalAppointment = async (receipt: R2UploadedReceiptPayload | null) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createAppointment({
        clientName,
        clientPhone,
        forSomeoneElse,
        guestName: forSomeoneElse ? guestName : undefined,
        guestPhone: forSomeoneElse ? guestPhone : undefined,
        professionalId: effectivePro!.id,
        serviceIds: selectedServiceIds,
        date: selectedDateISO,
        startTime: selectedTime,
        notes,
        saveToDevice: true,
        ...(requiresPixCheckout
          ? {
              pixFeePercentage: pixFeePct,
              pixFeeAmount,
              pixPaymentStatus: 'awaiting_verification' as const,
              pixReceiptKey: receipt?.objectKey || '',
              pixReceiptFileName: receipt?.fileName || '',
              pixReceiptMimeType: receipt?.mimeType || '',
            }
          : {}),
      });
      setPixModalOpen(false);
      setConfirmedApt(created);
      setSelectedTime('');
      setNotes('');
      setGuestName('');
      setGuestPhone('');
      setForSomeoneElse(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao concluir agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = validateBookingInput({
      selectedServiceIds,
      professionalId: effectivePro?.id || '',
      date: selectedDateISO,
      startTime: selectedTime,
      clientName,
      clientPhone,
      forSomeoneElse,
      guestName,
      notes,
    });

    if (!validation.valid) {
      setFormError(validation.error || 'Verifique os campos obrigatórios.');
      return;
    }

    if (requiresPixCheckout) {
      setPixModalOpen(true);
      return;
    }

    await submitFinalAppointment(null);
  };

  if (confirmedApt) {
    const isPendingApproval = confirmedApt.status === 'pending';
    const hasPixFee = Boolean(confirmedApt.pixFeeAmount && confirmedApt.pixFeeAmount > 0);
    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="rounded-[24px] bg-[#1c1c1e] border border-white/[0.08] p-6 space-y-5 shadow-2xl">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isPendingApproval
                  ? 'bg-[#ffd60a]/15 text-[#ffd60a]'
                  : 'bg-[#30d158]/15 text-[#30d158]'
              }`}
            >
              {isPendingApproval ? (
                <Clock3 className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#f5f5f7]">
                {isPendingApproval ? 'Aguardando confirmação' : 'Agendamento confirmado'}
              </h2>
              <p className="text-sm text-[#aeaeb2]">
                {isPendingApproval
                  ? `Horário pré-reservado para ${confirmedApt.clientName}. Nossa equipe vai confirmar em breve.`
                  : `Horário reservado para ${confirmedApt.clientName}.`}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#2c2c2e]/60 divide-y divide-[#38383a]/70 text-sm overflow-hidden">
            <div className="px-4 py-3 flex justify-between gap-4">
              <span className="text-[#aeaeb2]">Procedimentos</span>
              <span className="text-[#f5f5f7] font-medium text-right">
                {confirmedApt.serviceNames.join(', ')}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between gap-4">
              <span className="text-[#aeaeb2]">Profissional</span>
              <span className="text-[#f5f5f7] font-medium">{confirmedApt.professionalName}</span>
            </div>
            <div className="px-4 py-3 flex justify-between gap-4">
              <span className="text-[#aeaeb2]">Data e horário</span>
              <span className="text-[#f5f5f7] font-medium tabular-nums">
                {formatDateBR(confirmedApt.date)} às {confirmedApt.startTime}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between gap-4">
              <span className="text-[#aeaeb2]">Telefone</span>
              <span className="text-[#f5f5f7] font-medium tabular-nums">
                {confirmedApt.clientPhone}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between gap-4">
              <span className="text-[#aeaeb2]">Duração · Valor</span>
              <span className="text-[#30d158] font-semibold tabular-nums">
                {confirmedApt.totalDurationMinutes} min · {formatCurrencyBR(confirmedApt.totalPrice)}
              </span>
            </div>
            {hasPixFee && (
              <div className="px-4 py-3 flex justify-between gap-4">
                <span className="text-[#aeaeb2]">
                  Taxa PIX ({confirmedApt.pixFeePercentage}%)
                </span>
                <span className="text-[#ffd60a] font-semibold tabular-nums">
                  {formatCurrencyBR(confirmedApt.pixFeeAmount || 0)} · Em análise
                </span>
              </div>
            )}
            {confirmedApt.forSomeoneElse && confirmedApt.guestName && (
              <div className="px-4 py-3 flex justify-between gap-4">
                <span className="text-[#aeaeb2]">Atendimento para</span>
                <span className="text-[#f5f5f7] font-medium">{confirmedApt.guestName}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setConfirmedApt(null);
                onGoToAppointments();
              }}
              className="flex-1 h-12 rounded-2xl bg-[#8c1d0e] hover:bg-[#a32210] active:scale-[0.99] text-white text-sm font-semibold transition-all"
            >
              Ver meus horários
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedApt(null);
                onChangeMobileStep('services');
              }}
              className="flex-1 h-12 rounded-2xl bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-[0.99] text-[#f5f5f7] text-sm font-medium transition-all"
            >
              Novo agendamento
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-4 lg:py-8 space-y-7">
      {/* Custom Studio Hero Banner from Cloudflare R2 */}
      {settings.heroBannerUrl && (
        <section
          aria-label="Capa do salão"
          className={`relative rounded-[24px] overflow-hidden border border-white/[0.08] bg-[#1c1c1e] h-44 sm:h-56 lg:h-60 ${
            mobileStep === 'schedule' ? 'hidden lg:block' : 'block'
          }`}
        >
          <img
            src={settings.heroBannerUrl}
            alt={settings.businessName}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex flex-col justify-end">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {settings.businessName}
            </h2>
            {(settings.heroBannerSubtitle || settings.address) && (
              <p className="text-xs sm:text-sm text-[#e5e5ea] mt-1 max-w-2xl">
                {settings.heroBannerSubtitle || settings.address}
              </p>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* LEFT COLUMN (Mobile Step 1: Serviços disponíveis) */}
        <section
          className={`lg:col-span-5 space-y-4 ${
            mobileStep === 'schedule' ? 'hidden lg:block' : 'block'
          }`}
          aria-label="Serviços disponíveis"
        >
          <div className="px-1">
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#f5f5f7]">
              Serviços disponíveis
            </h1>
            <p className="text-sm text-[#8e8e93] mt-1">
              Selecione os procedimentos e agende em segundos — sem precisar de cadastro.
            </p>
          </div>

          {activeServices.length === 0 ? (
            <div className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-6 text-center text-sm text-[#8e8e93]">
              Nenhum serviço ativo no momento.
            </div>
          ) : (
            <div className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] divide-y divide-[#38383a]/70 overflow-hidden">
              {activeServices.map((srv) => {
                const isChecked = selectedServiceIds.includes(srv.id);
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => toggleService(srv.id)}
                    aria-pressed={isChecked}
                    aria-label={`${isChecked ? 'Remover' : 'Selecionar'} serviço ${srv.name}`}
                    className={`w-full text-left p-3.5 sm:p-4 flex items-center gap-3.5 transition-colors ${
                      isChecked ? 'bg-[#8c1d0e]/[0.14]' : 'hover:bg-white/[0.03] active:bg-white/[0.05]'
                    }`}
                  >
                    <div className="w-24 h-18 sm:w-26 sm:h-20 rounded-[14px] overflow-hidden bg-[#2c2c2e] shrink-0 flex items-center justify-center">
                      {srv.imageUrl ? (
                        <img
                          src={srv.imageUrl}
                          alt={srv.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Scissors className="w-5 h-5 text-[#8e8e93]" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-[15px] sm:text-base font-semibold text-[#f5f5f7] leading-snug">
                        {srv.name}
                      </div>
                      <div className="text-[15px] sm:text-base font-semibold text-[#30d158] tabular-nums">
                        {formatCurrencyBR(srv.price)}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[#8e8e93] tabular-nums">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{srv.durationMinutes} min</span>
                      </div>
                    </div>

                    {/* iOS Circular Selection Checkmark */}
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isChecked
                          ? 'bg-[#8c1d0e] border-[#8c1d0e] text-white scale-105'
                          : 'border-[#636366] bg-transparent'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Mobile Step 1 -> Step 2 CTA */}
          <div className="lg:hidden pt-1 space-y-3">
            <div className="rounded-2xl bg-[#1c1c1e] border border-white/[0.07] px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-[#aeaeb2]">
                {selectedServiceIds.length}{' '}
                {selectedServiceIds.length === 1 ? 'selecionado' : 'selecionados'}
              </span>
              <span className="font-semibold text-[#f5f5f7] tabular-nums">
                {totalDurationMinutes} min ·{' '}
                <span className="text-[#30d158]">{formatCurrencyBR(totalPrice)}</span>
              </span>
            </div>
            <button
              type="button"
              disabled={selectedServiceIds.length === 0}
              onClick={() => onChangeMobileStep('schedule')}
              className="w-full h-12 rounded-2xl bg-[#8c1d0e] hover:bg-[#a32210] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-semibold transition-all"
            >
              Escolher data e horário
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN (Mobile Step 2: Profissional, Data, Horários e Nome/Telefone) */}
        <form
          onSubmit={handleConfirmBooking}
          className={`lg:col-span-7 space-y-5 ${
            mobileStep === 'services' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Grouped Card 1: Profissional + Data + Horários */}
          <div className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-6">
            {/* Profissional */}
            <section aria-label="Escolha o profissional" className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8e8e93]">
                Profissional
              </h2>
              <div className="flex items-center gap-4 overflow-x-auto pb-1">
                {activePros.map((pro) => {
                  const isSelected = effectivePro?.id === pro.id;
                  return (
                    <button
                      key={pro.id}
                      type="button"
                      onClick={() => {
                        setSelectedProId(pro.id);
                        setSelectedTime('');
                      }}
                      aria-pressed={isSelected}
                      className="flex flex-col items-center gap-2 shrink-0 group focus:outline-none"
                    >
                      <div
                        className={`w-15 h-15 rounded-full overflow-hidden flex items-center justify-center text-base font-semibold transition-all border-2 ${
                          isSelected
                            ? 'bg-[#8c1d0e] border-[#e07a68] text-white shadow-lg shadow-[#8c1d0e]/30'
                            : 'bg-[#2c2c2e] border-transparent text-[#d1d1d6] group-hover:bg-[#3a3a3c]'
                        }`}
                      >
                        {pro.avatarUrl ? (
                          <img
                            src={pro.avatarUrl}
                            alt={pro.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          pro.avatarInitials
                        )}
                      </div>
                      <span
                        className={`text-xs whitespace-nowrap transition-colors ${
                          isSelected ? 'text-[#f5f5f7] font-semibold' : 'text-[#8e8e93]'
                        }`}
                      >
                        {pro.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="border-t border-[#38383a]/70" />

            {/* Data */}
            <section aria-label="Escolha a data" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8e8e93]">
                  Data
                </h2>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(true)}
                  aria-label="Abrir calendário mensal"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-xs font-semibold text-[#f5f5f7] transition-colors"
                >
                  <span>{selectedDateMonthName}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#aeaeb2]" />
                </button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {upcomingDates.map((d) => {
                  const isSelected = d.iso === selectedDateISO;
                  const daySlots = computeAvailableSlots({
                    dateISO: d.iso,
                    professional: effectivePro,
                    serviceDurationMinutes: totalDurationMinutes || 60,
                    settings,
                    busySlots,
                    appointments,
                  });
                  const hasSlots = daySlots.length > 0;

                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => {
                        setSelectedDateISO(d.iso);
                        setSelectedTime('');
                        setFormError(null);
                      }}
                      aria-pressed={isSelected}
                      aria-label={`Dia ${d.dayNumber} ${d.weekdayShort}`}
                      className={`min-w-[68px] h-[78px] rounded-[18px] flex flex-col items-center justify-center gap-1 shrink-0 transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-[#8c1d0e] text-white shadow-md shadow-[#8c1d0e]/30'
                          : hasSlots
                            ? 'bg-[#2c2c2e] text-[#f5f5f7] hover:bg-[#3a3a3c]'
                            : 'bg-[#2c2c2e]/45 text-[#636366] hover:bg-[#2c2c2e]/70'
                      }`}
                    >
                      <span className="text-xl font-bold tabular-nums leading-none">
                        {d.dayNumber}
                      </span>
                      <span className="text-[11px] font-medium tracking-wide opacity-85">
                        {d.weekdayShort}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="border-t border-[#38383a]/70" />

            {/* Horários disponíveis */}
            <section aria-label="Horários disponíveis" className="space-y-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8e8e93]">
                  Horários disponíveis
                </h2>
                <span className="text-xs font-medium text-[#aeaeb2] tabular-nums whitespace-nowrap">
                  {totalDurationMinutes} min ·{' '}
                  <span className="text-[#30d158] font-semibold">
                    {formatCurrencyBR(totalPrice)}
                  </span>
                </span>
              </div>

              {selectedServiceIds.length === 0 ? (
                <p className="py-5 text-center text-sm text-[#ff453a]">
                  Selecione ao menos um procedimento para ver os horários.
                </p>
              ) : availableSlots.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#ff6961] font-medium">
                  Nenhum horário disponível nesta data. Escolha outro dia.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {availableSlots.map((slot) => {
                    const isSelected = selectedTime === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          setSelectedTime(slot);
                          setFormError(null);
                        }}
                        aria-pressed={isSelected}
                        className={`h-11 rounded-[14px] text-sm font-medium tabular-nums transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-[#8c1d0e] text-white font-semibold shadow-sm shadow-[#8c1d0e]/40'
                            : 'bg-[#2c2c2e] text-[#f5f5f7] hover:bg-[#3a3a3c]'
                        }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Grouped Card 2: Apenas Nome e Telefone (Zero Login, Zero E-mail) */}
          <div className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8e8e93]">
                Seus dados para reserva
              </h2>
              <span className="text-[11px] text-[#636366]">Sem login ou e-mail</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="booking-name" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                  Seu nome
                </label>
                <input
                  id="booking-name"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={100}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Digite seu nome"
                  className="w-full h-12 rounded-[14px] bg-[#2c2c2e] border border-transparent focus:border-[#8c1d0e] px-4 text-sm text-[#f5f5f7] placeholder-[#636366] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label htmlFor="booking-phone" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                  Telefone / WhatsApp
                </label>
                <input
                  id="booking-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  maxLength={30}
                  value={clientPhone}
                  onChange={(e) => setClientPhone(formatPhoneMaskBR(e.target.value))}
                  placeholder="(19) 99999-9999"
                  className="w-full h-12 rounded-[14px] bg-[#2c2c2e] border border-transparent focus:border-[#8c1d0e] px-4 text-sm text-[#f5f5f7] placeholder-[#636366] tabular-nums focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="booking-notes" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                Observação (opcional)
              </label>
              <textarea
                id="booking-notes"
                rows={2}
                maxLength={400}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alguma preferência ou detalhe para o atendimento?"
                className="w-full rounded-[14px] bg-[#2c2c2e] border border-transparent focus:border-[#8c1d0e] px-4 py-3 text-sm text-[#f5f5f7] placeholder-[#636366] focus:outline-none resize-none transition-colors"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setForSomeoneElse((v) => !v)}
                className="inline-flex items-center gap-2 text-xs font-medium text-[#e07a68] hover:text-[#f29584] transition-colors py-1"
              >
                <UserPlus className="w-4 h-4" />
                <span>{forSomeoneElse ? 'Cancelar agendamento para outra pessoa' : 'Agendar para outra pessoa'}</span>
              </button>

              {forSomeoneElse && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3.5 rounded-2xl bg-[#2c2c2e]/60 border border-white/[0.06]">
                  <div>
                    <label htmlFor="guest-name" className="block text-xs text-[#aeaeb2] mb-1">
                      Nome de quem será atendido(a)
                    </label>
                    <input
                      id="guest-name"
                      type="text"
                      maxLength={100}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full h-10 rounded-xl bg-[#1c1c1e] px-3 text-sm text-[#f5f5f7] placeholder-[#636366] focus:outline-none focus:ring-1 focus:ring-[#8c1d0e]"
                    />
                  </div>
                  <div>
                    <label htmlFor="guest-phone" className="block text-xs text-[#aeaeb2] mb-1">
                      Telefone (opcional)
                    </label>
                    <input
                      id="guest-phone"
                      type="tel"
                      maxLength={30}
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(formatPhoneMaskBR(e.target.value))}
                      placeholder="(19) 99999-9999"
                      className="w-full h-10 rounded-xl bg-[#1c1c1e] px-3 text-sm text-[#f5f5f7] placeholder-[#636366] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#8c1d0e]"
                    />
                  </div>
                </div>
              )}
            </div>

            {requiresPixCheckout ? (
              <div className="rounded-2xl bg-[#141416] border border-[#30d158]/25 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#f5f5f7]">
                    <QrCode className="w-4 h-4 text-[#30d158]" />
                    <span>Taxa antecipada via PIX ({pixFeePct}%)</span>
                  </div>
                  <span className="text-sm font-bold text-[#30d158] tabular-nums">
                    {formatCurrencyBR(pixFeeAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#aeaeb2] tabular-nums">
                  <span>Total: {formatCurrencyBR(totalPrice)}</span>
                  <span>Restante no local: {formatCurrencyBR(pixRemainingAmount)}</span>
                </div>
                <p className="text-[11px] text-[#8e8e93] leading-relaxed">
                  Ao continuar, geraremos o QR Code PIX válido com o valor exato da taxa. Seu horário ficará reservado aguardando confirmação.
                </p>
              </div>
            ) : settings.requireAdminConfirmation ? (
              <div className="rounded-2xl bg-[#141416] border border-[#ffd60a]/20 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-[#d1d1d6]">
                <Clock3 className="w-4 h-4 text-[#ffd60a] shrink-0" />
                <span>
                  Seu horário ficará reservado enquanto a equipe confirma o agendamento.
                </span>
              </div>
            ) : null}

            {formError && (
              <p role="alert" className="text-sm text-[#ff453a] font-medium">
                {formError}
              </p>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-13 rounded-2xl bg-[#8c1d0e] hover:bg-[#a32210] active:scale-[0.99] disabled:opacity-50 text-white text-base font-semibold transition-all shadow-lg shadow-[#8c1d0e]/20"
              >
                {submitting
                  ? 'Confirmando horário...'
                  : requiresPixCheckout
                  ? `Pagar taxa PIX (${formatCurrencyBR(pixFeeAmount)}) e agendar`
                  : settings.requireAdminConfirmation
                  ? `Solicitar horário com ${effectivePro?.name || 'profissional'}`
                  : `Agendar com ${effectivePro?.name || 'profissional'}`}
              </button>

              <button
                type="button"
                onClick={() => onChangeMobileStep('services')}
                className="w-full lg:hidden h-11 rounded-2xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[#f5f5f7] text-sm font-medium transition-colors"
              >
                Voltar para serviços
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Client-Facing Portfolio Gallery from Cloudflare R2 */}
      {activeGallery.length > 0 && (
        <section
          aria-label="Trabalhos realizados"
          className={`space-y-4 pt-3 ${mobileStep === 'schedule' ? 'hidden lg:block' : 'block'}`}
        >
          <div className="px-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#f5f5f7]">
              Trabalhos realizados
            </h2>
            <p className="text-sm text-[#8e8e93] mt-0.5">
              Confira resultados recentes feitos pela nossa equipe.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {activeGallery.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightboxItem(item)}
                className="group relative aspect-[4/3] rounded-[18px] overflow-hidden bg-[#1c1c1e] border border-white/[0.08] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e07a68]"
              >
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-3">
                  <div className="text-xs sm:text-sm font-semibold text-white truncate">
                    {item.title}
                  </div>
                  {item.caption && (
                    <div className="text-[11px] text-[#d1d1d6] truncate mt-0.5">{item.caption}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="w-full max-w-2xl rounded-[24px] bg-[#1c1c1e] border border-white/10 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-black flex items-center justify-center max-h-[70vh]">
              <img
                src={lightboxItem.imageUrl}
                alt={lightboxItem.title}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[70vh] object-contain"
              />
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                aria-label="Fechar foto"
                className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-1">
              <h3 className="text-base font-semibold text-[#f5f5f7]">{lightboxItem.title}</h3>
              {lightboxItem.caption && (
                <p className="text-sm text-[#aeaeb2]">{lightboxItem.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <CalendarModal
        open={calendarOpen}
        selectedDateISO={selectedDateISO}
        minDateISO={todayISO}
        closedDates={settings.closedDates}
        onSelectDate={(iso) => {
          setSelectedDateISO(iso);
          setSelectedTime('');
        }}
        onClose={() => setCalendarOpen(false)}
      />

      <PixCheckoutModal
        open={pixModalOpen}
        settings={settings}
        clientName={clientName}
        professionalName={effectivePro?.name || 'Profissional'}
        serviceNames={selectedServiceNames}
        dateISO={selectedDateISO}
        startTime={selectedTime}
        totalPrice={totalPrice}
        feePercentage={pixFeePct}
        feeAmount={pixFeeAmount}
        remainingAmount={pixRemainingAmount}
        submitting={submitting}
        onClose={() => setPixModalOpen(false)}
        onConfirmPaid={submitFinalAppointment}
      />
    </div>
  );
}
