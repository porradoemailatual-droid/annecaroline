import React, { useMemo, useState } from 'react';
import { Calendar, Clock, Phone, Search, User, X } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import {
  computeAvailableSlots,
  formatCurrencyBR,
  formatDateBR,
  formatDateISO,
  formatPhoneMaskBR,
  normalizePhoneDigits,
} from '../../utils/schedule';
import type { AppointmentStatus, ClientLookupBooking } from '../../types/booking';

const STATUS_LABELS: Record<AppointmentStatus, { text: string; color: string }> = {
  confirmed: { text: 'Confirmado', color: 'text-[#30d158]' },
  pending: { text: 'Aguardando confirmação', color: 'text-[#ffd60a]' },
  completed: { text: 'Concluído', color: 'text-[#64d2ff]' },
  cancelled: { text: 'Cancelado', color: 'text-[#ff453a]' },
};

const PIX_STATUS_TEXT: Record<string, { label: string; className: string }> = {
  awaiting_verification: { label: 'Em análise', className: 'text-[#ffd60a]' },
  paid: { label: 'Aprovada', className: 'text-[#30d158]' },
  rejected: { label: 'Recusada', className: 'text-[#ff453a]' },
};

interface MyAppointmentsViewProps {
  onNewBooking: () => void;
}

export function MyAppointmentsView({ onNewBooking }: MyAppointmentsViewProps) {
  const {
    deviceBookings,
    appointments,
    professionals,
    settings,
    busySlots,
    lookupBookingsByPhone,
    cancelClientBooking,
    rescheduleClientBooking,
  } = useBooking();

  const [filter, setFilter] = useState<'upcoming' | 'history'>('upcoming');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [searchedPhone, setSearchedPhone] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ClientLookupBooking[]>([]);
  const [searching, setSearching] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState<ClientLookupBooking | null>(null);
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');

  const handlePhoneSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = normalizePhoneDigits(phoneQuery);
    if (digits.length < 8) {
      setSearchedPhone(null);
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await lookupBookingsByPhone(phoneQuery);
      setSearchResults(results);
      setSearchedPhone(phoneQuery);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setPhoneQuery('');
    setSearchedPhone(null);
    setSearchResults([]);
  };

  const activeList = useMemo(() => {
    const source = searchedPhone ? searchResults : deviceBookings;
    return [...source].sort((a, b) =>
      `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`)
    );
  }, [deviceBookings, searchResults, searchedPhone]);

  const filtered = useMemo(() => {
    if (filter === 'upcoming') {
      return activeList.filter((a) => a.status === 'confirmed' || a.status === 'pending');
    }
    return activeList.filter((a) => a.status === 'completed' || a.status === 'cancelled');
  }, [activeList, filter]);

  const rescheduleSlots = useMemo(() => {
    if (!rescheduleTarget || !nextDate) return [];
    const pro = professionals.find((p) => p.id === rescheduleTarget.professionalId);
    return computeAvailableSlots({
      dateISO: nextDate,
      professional: pro,
      serviceDurationMinutes: rescheduleTarget.totalDurationMinutes,
      settings,
      busySlots: busySlots.filter(
        (b) =>
          b.id !== rescheduleTarget.appointmentId &&
          b.appointmentId !== rescheduleTarget.appointmentId
      ),
      appointments: appointments.filter((a) => a.id !== rescheduleTarget.appointmentId),
    });
  }, [rescheduleTarget, nextDate, professionals, settings, busySlots, appointments]);

  const handleCancel = async (booking: ClientLookupBooking) => {
    await cancelClientBooking(booking);
    if (searchedPhone) {
      setSearchResults((prev) =>
        prev.map((item) =>
          item.appointmentId === booking.appointmentId
            ? { ...item, status: 'cancelled' }
            : item
        )
      );
    }
  };

  const handleSaveReschedule = async () => {
    if (!rescheduleTarget || !nextDate || !nextTime) return;
    await rescheduleClientBooking(rescheduleTarget, nextDate, nextTime);
    if (searchedPhone) {
      setSearchResults((prev) =>
        prev.map((item) =>
          item.appointmentId === rescheduleTarget.appointmentId
            ? { ...item, date: nextDate, startTime: nextTime }
            : item
        )
      );
    }
    setRescheduleTarget(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-4 lg:py-8 space-y-5">
      {/* iOS Large Title + Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#f5f5f7]">
            Meus Horários
          </h1>
          <p className="text-sm text-[#8e8e93] mt-1">
            Consulte seus agendamentos deste aparelho ou busque pelo seu telefone.
          </p>
        </div>

        <div className="inline-flex rounded-[14px] bg-[#1c1c1e] border border-white/[0.08] p-1 self-start">
          <button
            type="button"
            onClick={() => setFilter('upcoming')}
            className={`px-4 py-1.5 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-all ${
              filter === 'upcoming' ? 'bg-[#8c1d0e] text-white' : 'text-[#aeaeb2] hover:text-white'
            }`}
          >
            Próximos
          </button>
          <button
            type="button"
            onClick={() => setFilter('history')}
            className={`px-4 py-1.5 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-all ${
              filter === 'history' ? 'bg-[#8c1d0e] text-white' : 'text-[#aeaeb2] hover:text-white'
            }`}
          >
            Histórico
          </button>
        </div>
      </div>

      {/* iOS Phone Lookup Search Bar */}
      <form
        onSubmit={handlePhoneSearch}
        className="rounded-[20px] bg-[#1c1c1e] border border-white/[0.08] p-3.5 sm:p-4 space-y-2.5"
      >
        <label htmlFor="lookup-phone" className="block text-xs font-semibold uppercase tracking-wider text-[#8e8e93]">
          Buscar por telefone / WhatsApp
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Phone className="w-4 h-4 text-[#8e8e93] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="lookup-phone"
              type="tel"
              value={phoneQuery}
              onChange={(e) => setPhoneQuery(formatPhoneMaskBR(e.target.value))}
              placeholder="(19) 99999-9999"
              className="w-full h-11 rounded-[14px] bg-[#2c2c2e] pl-10 pr-9 text-sm text-[#f5f5f7] placeholder-[#636366] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#8c1d0e]"
            />
            {phoneQuery && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Limpar busca"
                className="w-6 h-6 rounded-full bg-[#3a3a3c] text-[#aeaeb2] hover:text-white flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={searching || normalizePhoneDigits(phoneQuery).length < 8}
            className="h-11 px-4 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>{searching ? 'Buscando...' : 'Buscar'}</span>
          </button>
        </div>

        {searchedPhone && (
          <div className="flex items-center justify-between text-xs text-[#aeaeb2] pt-0.5">
            <span>
              Resultados para <strong className="text-[#f5f5f7] tabular-nums">{searchedPhone}</strong>
            </span>
            <button
              type="button"
              onClick={clearSearch}
              className="text-[#e07a68] hover:underline font-medium"
            >
              Mostrar salvos neste aparelho
            </button>
          </div>
        )}
      </form>

      {/* Results List */}
      {filtered.length === 0 ? (
        <div className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-8 text-center space-y-4">
          <p className="text-sm text-[#8e8e93]">
            {searchedPhone
              ? 'Nenhum agendamento encontrado para este número de telefone.'
              : filter === 'upcoming'
                ? 'Nenhum horário reservado neste aparelho ainda. Digite seu telefone acima ou faça um novo agendamento.'
                : 'Nenhum atendimento concluído ou cancelado encontrado.'}
          </p>
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center justify-center h-11 px-6 rounded-2xl bg-[#8c1d0e] hover:bg-[#a32210] text-white text-sm font-semibold transition-colors"
          >
            Agendar um horário
          </button>
        </div>
      ) : (
        <div className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] divide-y divide-[#38383a]/70 overflow-hidden">
          {filtered.map((apt) => {
            const st = STATUS_LABELS[apt.status];
            const canEdit = apt.status === 'confirmed' || apt.status === 'pending';
            return (
              <article key={apt.appointmentId} className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-[#f5f5f7]">
                      {apt.serviceNames.join(' + ')}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#aeaeb2] mt-1 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#8e8e93]" />
                        {formatDateBR(apt.date)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#8e8e93]" />
                        {apt.startTime} ({apt.totalDurationMinutes} min)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-[#8e8e93]" />
                        {apt.professionalName}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-semibold ${st.color}`}>{st.text}</div>
                    <div className="text-sm font-semibold text-[#30d158] tabular-nums mt-0.5">
                      {formatCurrencyBR(apt.totalPrice)}
                    </div>
                  </div>
                </div>

                {apt.pixFeeAmount && apt.pixFeeAmount > 0 ? (
                  <div className="rounded-xl bg-[#141416] border border-white/[0.06] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[#aeaeb2] tabular-nums">
                      Taxa PIX ({apt.pixFeePercentage || 0}%):{' '}
                      <strong className="text-[#f5f5f7]">
                        {formatCurrencyBR(apt.pixFeeAmount)}
                      </strong>
                      {apt.hasPixReceipt ? ' · Comprovante anexado' : ''}
                    </span>
                    {apt.pixPaymentStatus && PIX_STATUS_TEXT[apt.pixPaymentStatus] && (
                      <span
                        className={`font-semibold ${PIX_STATUS_TEXT[apt.pixPaymentStatus].className}`}
                      >
                        {PIX_STATUS_TEXT[apt.pixPaymentStatus].label}
                      </span>
                    )}
                  </div>
                ) : null}

                {apt.notes && (
                  <p className="text-xs text-[#8e8e93]">Obs.: {apt.notes}</p>
                )}

                {canEdit && (
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRescheduleTarget(apt);
                        setNextDate(apt.date);
                        setNextTime('');
                      }}
                      className="h-9 px-4 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-xs font-semibold text-[#f5f5f7] transition-colors"
                    >
                      Remarcar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCancel(apt)}
                      className="h-9 px-4 rounded-xl bg-[#3a1615] hover:bg-[#4e1d1b] text-xs font-semibold text-[#ff6961] transition-colors"
                    >
                      Cancelar horário
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* iOS Sheet Reschedule Modal */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Remarcar horário"
        >
          <div className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[#1c1c1e] border border-white/[0.1] p-5 pb-7 sm:pb-5 space-y-4 shadow-2xl">
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden" aria-hidden="true" />

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#f5f5f7]">Remarcar agendamento</h3>
                <p className="text-xs text-[#8e8e93] mt-0.5">
                  {rescheduleTarget.serviceNames.join(', ')} com {rescheduleTarget.professionalName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-full bg-[#2c2c2e] text-[#aeaeb2] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label htmlFor="reschedule-date" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                Nova data
              </label>
              <input
                id="reschedule-date"
                type="date"
                min={formatDateISO(new Date())}
                value={nextDate}
                onChange={(e) => {
                  setNextDate(e.target.value);
                  setNextTime('');
                }}
                className="w-full h-11 rounded-[14px] bg-[#2c2c2e] px-3.5 text-sm text-[#f5f5f7] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#8c1d0e]"
              />
            </div>

            <div>
              <div className="text-xs font-medium text-[#aeaeb2] mb-2">Horários disponíveis</div>
              {rescheduleSlots.length === 0 ? (
                <p className="text-xs text-[#ff6961] py-2">
                  Nenhum horário disponível nesta data.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto">
                  {rescheduleSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setNextTime(slot)}
                      className={`h-10 rounded-xl text-xs font-semibold tabular-nums transition-colors ${
                        nextTime === slot
                          ? 'bg-[#8c1d0e] text-white'
                          : 'bg-[#2c2c2e] text-[#f5f5f7] hover:bg-[#3a3a3c]'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="flex-1 h-11 rounded-2xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-sm font-medium text-[#f5f5f7]"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!nextTime}
                onClick={() => void handleSaveReschedule()}
                className="flex-1 h-11 rounded-2xl bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-40 text-sm font-semibold text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
