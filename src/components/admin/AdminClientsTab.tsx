import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { formatCurrencyBR, formatDateBR, validateClientInput } from '../../utils/schedule';
import type { ClientRecord } from '../../types/booking';

export function AdminClientsTab() {
  const { clients, appointments, saveClient, deleteClient } = useBooking();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [detailClient, setDetailClient] = useState<ClientRecord | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const openCreateModal = () => {
    setEditingClient(null);
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setLoyaltyPoints(0);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (client: ClientRecord) => {
    setEditingClient(client);
    setName(client.name);
    setPhone(client.phone);
    setEmail(client.email || '');
    setNotes(client.notes || '');
    setLoyaltyPoints(client.loyaltyPoints);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const check = validateClientInput({ name, phone, email, notes });
    if (!check.valid) {
      setFormError(check.error || 'Verifique os dados do cliente.');
      return;
    }

    await saveClient(
      {
        name,
        phone,
        email,
        notes,
        loyaltyPoints: Number(loyaltyPoints) || 0,
        totalVisits: editingClient?.totalVisits ?? 0,
        totalSpent: editingClient?.totalSpent ?? 0,
        lastVisitDate: editingClient?.lastVisitDate ?? '',
      },
      editingClient?.id
    );
    setModalOpen(false);
  };

  const detailAppointments = useMemo(() => {
    if (!detailClient) return [];
    const digits = detailClient.phone.replace(/\D/g, '');
    return appointments
      .filter(
        (a) =>
          (digits && a.clientPhone.replace(/\D/g, '') === digits) ||
          a.clientName.toLowerCase() === detailClient.name.toLowerCase()
      )
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`));
  }, [appointments, detailClient]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#f4f4f5]">Clientes</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            Cadastro completo com histórico de atendimentos, observações e pontos de fidelidade.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a22413] active:scale-[0.98] text-white text-sm font-semibold whitespace-nowrap transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo cliente
        </button>
      </div>

      <div className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-[#38383a]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#8e8e93] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Buscar cliente por nome, WhatsApp ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, WhatsApp ou e-mail..."
              className="w-full h-10 rounded-[14px] bg-[#2c2c2e] pl-9 pr-3 text-sm text-[#f5f5f7] placeholder-[#636366] focus:outline-none focus:ring-1 focus:ring-[#8c1d0e]"
            />
          </div>
          <div className="text-xs text-[#8e8e93] tabular-nums">
            {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#a1a1aa]">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <>
            {/* Mobile iOS Grouped List */}
            <div className="md:hidden divide-y divide-[#2c2c2e]">
              {filtered.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailClient(c)}
                    className="flex-1 min-w-0 text-left space-y-1 active:opacity-75"
                  >
                    <div className="text-[15px] font-semibold text-[#f5f5f7] truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-[#aeaeb2] tabular-nums truncate">
                      {c.phone}
                    </div>
                    <div className="text-xs text-[#8e8e93] tabular-nums flex flex-wrap items-center gap-x-1.5">
                      <span>{c.totalVisits} visitas</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#30d158] font-medium">
                        {formatCurrencyBR(c.totalSpent)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{c.loyaltyPoints} pts</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(c)}
                      aria-label={`Editar cliente ${c.name}`}
                      className="h-10 w-10 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[#f5f5f7] flex items-center justify-center active:scale-95 transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteClient(c.id)}
                      aria-label={`Excluir cliente ${c.name}`}
                      className="h-10 w-10 rounded-xl bg-[#3a1615] hover:bg-[#4e1d1b] text-[#ff6961] flex items-center justify-center active:scale-95 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#27272a] text-xs font-medium text-[#a1a1aa]">
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">WhatsApp</th>
                    <th className="py-3 px-4 text-right">Visitas</th>
                    <th className="py-3 px-4 text-right">Total gasto</th>
                    <th className="py-3 px-4 text-right">Pontos</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252529] text-sm">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-[#1b1b1e] transition-colors">
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => setDetailClient(c)}
                          className="text-left group"
                        >
                          <div className="font-medium text-[#f4f4f5] group-hover:underline">
                            {c.name}
                          </div>
                          {c.email && <div className="text-xs text-[#71717a]">{c.email}</div>}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-[#d4d4d8] tabular-nums whitespace-nowrap">
                        {c.phone}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#e4e4e7] tabular-nums">
                        {c.totalVisits}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#30d158] font-medium tabular-nums whitespace-nowrap">
                        {formatCurrencyBR(c.totalSpent)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#e4e4e7] tabular-nums">
                        {c.loyaltyPoints} pts
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            aria-label={`Editar cliente ${c.name}`}
                            className="h-9 w-9 rounded-lg hover:bg-[#2a2a30] text-[#a1a1aa] hover:text-white flex items-center justify-center"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteClient(c.id)}
                            aria-label={`Excluir cliente ${c.name}`}
                            className="h-9 w-9 rounded-lg hover:bg-[#2a1818] text-[#71717a] hover:text-[#f87171] flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Client Modal (iOS Bottom Sheet on Mobile) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingClient ? 'Editar cliente' : 'Novo cliente'}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 p-5 pb-safe space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-1 mb-1" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#f4f4f5]">
                {editingClient ? 'Editar cliente' : 'Cadastrar cliente'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar modal"
                className="h-10 w-10 rounded-full bg-[#2c2c2e] text-[#aeaeb2] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label htmlFor="cli-name" className="block text-xs text-[#a1a1aa] mb-1">
                Nome completo
              </label>
              <input
                id="cli-name"
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cli-phone" className="block text-xs text-[#a1a1aa] mb-1">
                  WhatsApp / Telefone
                </label>
                <input
                  id="cli-phone"
                  type="tel"
                  required
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(19) 99999-9999"
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                />
              </div>
              <div>
                <label htmlFor="cli-points" className="block text-xs text-[#a1a1aa] mb-1">
                  Pontos fidelidade
                </label>
                <input
                  id="cli-points"
                  type="number"
                  min={0}
                  max={1000}
                  value={loyaltyPoints}
                  onChange={(e) => setLoyaltyPoints(Number(e.target.value))}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] tabular-nums"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cli-email" className="block text-xs text-[#a1a1aa] mb-1">
                E-mail (opcional)
              </label>
              <input
                id="cli-email"
                type="email"
                maxLength={120}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
              />
            </div>

            <div>
              <label htmlFor="cli-notes" className="block text-xs text-[#a1a1aa] mb-1">
                Observações / Preferências
              </label>
              <textarea
                id="cli-notes"
                rows={3}
                maxLength={400}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: prefere esmalte claro, alergias..."
                className="w-full rounded-xl bg-[#222226] border border-[#323238] p-3 text-sm text-[#f4f4f5] resize-none"
              />
            </div>

            {formError && <p className="text-xs text-[#f87171]">{formError}</p>}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 h-12 rounded-[14px] bg-[#2c2c2e] hover:bg-[#3a3a3c] text-sm font-medium text-[#f5f5f7]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 h-12 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a22413] text-sm font-semibold text-white"
              >
                Salvar cliente
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Client History Detail Modal (iOS Bottom Sheet on Mobile) */}
      {detailClient && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Histórico de ${detailClient.name}`}
        >
          <div className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 p-5 pb-safe space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-1 mb-1" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#f4f4f5]">{detailClient.name}</h3>
                <p className="text-xs text-[#a1a1aa] mt-0.5 tabular-nums">
                  {detailClient.phone} {detailClient.email ? `· ${detailClient.email}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailClient(null)}
                aria-label="Fechar histórico"
                className="h-10 w-10 rounded-full bg-[#2c2c2e] text-[#aeaeb2] hover:text-white flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailClient.notes && (
              <div className="rounded-xl bg-[#222226] p-3 text-xs text-[#d4d4d8]">
                {detailClient.notes}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#a1a1aa]">
                Histórico de agendamentos ({detailAppointments.length})
              </div>
              {detailAppointments.length === 0 ? (
                <p className="text-xs text-[#71717a] py-3">
                  Nenhum agendamento registrado para este cliente ainda.
                </p>
              ) : (
                <div className="divide-y divide-[#27272a] border border-[#27272a] rounded-xl overflow-hidden">
                  {detailAppointments.map((apt) => (
                    <div key={apt.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-medium text-[#f4f4f5]">
                          {apt.serviceNames.join(' + ')}
                        </div>
                        <div className="text-[#a1a1aa] tabular-nums mt-0.5">
                          {formatDateBR(apt.date)} às {apt.startTime} · {apt.professionalName}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-[#4ade80] font-medium">
                          {formatCurrencyBR(apt.totalPrice)}
                        </div>
                        <div className="text-[#a1a1aa]">{apt.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
