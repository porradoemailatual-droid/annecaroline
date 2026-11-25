import React, { useRef, useState } from 'react';
import {
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { SERVICE_IMAGE_PRESETS } from '../../data/seedData';
import {
  formatCurrencyBR,
  validateServiceInput,
  WEEKDAY_SHORT_PT,
} from '../../utils/schedule';
import type {
  Professional,
  ServiceItem,
} from '../../types/booking';

export function AdminServicesTab() {
  const { services, saveService, deleteService, uploadMediaAsset, cleanupR2ObjectByKey } =
    useBooking();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Cabelo');
  const [price, setPrice] = useState('90');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [imageUrl, setImageUrl] = useState(SERVICE_IMAGE_PRESETS[0].url);
  const [imageKey, setImageKey] = useState('');
  const [pendingUploadKey, setPendingUploadKey] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const serviceFileRef = useRef<HTMLInputElement | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCategory('Unhas');
    setPrice('65');
    setDurationMinutes('45');
    setImageUrl(SERVICE_IMAGE_PRESETS[1].url);
    setImageKey('');
    setPendingUploadKey('');
    setDescription('');
    setActive(true);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (srv: ServiceItem) => {
    setEditing(srv);
    setName(srv.name);
    setCategory(srv.category);
    setPrice(String(srv.price));
    setDurationMinutes(String(srv.durationMinutes));
    setImageUrl(srv.imageUrl || SERVICE_IMAGE_PRESETS[0].url);
    setImageKey(srv.imageKey || '');
    setPendingUploadKey('');
    setDescription(srv.description || '');
    setActive(srv.active);
    setError(null);
    setModalOpen(true);
  };

  const closeModalAndCleanup = () => {
    if (pendingUploadKey) {
      void cleanupR2ObjectByKey(pendingUploadKey);
      setPendingUploadKey('');
    }
    setModalOpen(false);
  };

  const handleServiceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploadingPhoto(true);
    try {
      const asset = await uploadMediaAsset(file, 'services');
      if (pendingUploadKey && pendingUploadKey !== asset.objectKey) {
        void cleanupR2ObjectByKey(pendingUploadKey);
      }
      setImageUrl(asset.url);
      setImageKey(asset.objectKey);
      setPendingUploadKey(asset.objectKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a foto para o R2.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numPrice = Number(price);
    const numDur = Number(durationMinutes);
    const check = validateServiceInput({
      name,
      category,
      price: numPrice,
      durationMinutes: numDur,
    });
    if (!check.valid) {
      setError(check.error || 'Verifique os dados.');
      return;
    }

    await saveService(
      {
        name,
        category,
        price: numPrice,
        durationMinutes: numDur,
        imageUrl,
        imageKey,
        description,
        active,
      },
      editing?.id
    );
    setPendingUploadKey('');
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#f4f4f5]">Serviços</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            Defina preços, duração e disponibilidade de cada procedimento exibido aos clientes.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a22413] active:scale-[0.98] text-white text-sm font-semibold whitespace-nowrap transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo serviço
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {services.map((srv) => (
          <div
            key={srv.id}
            className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 flex items-center gap-4"
          >
            <div className="w-24 h-18 rounded-[14px] overflow-hidden bg-[#2c2c2e] shrink-0">
              {srv.imageUrl && (
                <img
                  src={srv.imageUrl}
                  alt={srv.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#f5f5f7] truncate">{srv.name}</div>
              <div className="text-xs text-[#aeaeb2] mt-0.5 tabular-nums">
                {srv.category} · {srv.durationMinutes} min ·{' '}
                <span className="text-[#30d158] font-semibold">{formatCurrencyBR(srv.price)}</span>
              </div>
              <div className="text-xs mt-1">
                <span className={srv.active ? 'text-[#30d158]' : 'text-[#8e8e93]'}>
                  {srv.active ? 'Visível para agendamento' : 'Oculto'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => openEdit(srv)}
                aria-label={`Editar serviço ${srv.name}`}
                className="h-10 w-10 rounded-xl bg-[#2c2c2e]/70 hover:bg-[#3a3a3c] text-[#aeaeb2] hover:text-white flex items-center justify-center active:scale-95 transition-all"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => void deleteService(srv.id)}
                aria-label={`Excluir serviço ${srv.name}`}
                className="h-10 w-10 rounded-xl bg-[#3a1615]/70 hover:bg-[#4e1d1b] text-[#ff6961] flex items-center justify-center active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Editar serviço' : 'Novo serviço'}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 p-5 pb-safe space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-1 mb-1" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#f4f4f5]">
                {editing ? 'Editar serviço' : 'Novo serviço'}
              </h3>
              <button
                type="button"
                onClick={closeModalAndCleanup}
                aria-label="Fechar modal"
                className="h-10 w-10 rounded-full bg-[#2c2c2e] text-[#aeaeb2] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label htmlFor="srv-name" className="block text-xs text-[#a1a1aa] mb-1">
                Nome do procedimento
              </label>
              <input
                id="srv-name"
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Spa dos Pés"
                className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="srv-cat" className="block text-xs text-[#a1a1aa] mb-1">
                  Categoria
                </label>
                <input
                  id="srv-cat"
                  type="text"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
                />
              </div>
              <div>
                <label htmlFor="srv-price" className="block text-xs text-[#a1a1aa] mb-1">
                  Valor (R$)
                </label>
                <input
                  id="srv-price"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="srv-dur" className="block text-xs text-[#a1a1aa] mb-1">
                  Duração (min)
                </label>
                <input
                  id="srv-dur"
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  required
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label htmlFor="srv-img" className="block text-xs text-[#a1a1aa]">
                Foto do serviço
              </label>

              <div className="flex items-center gap-3 rounded-xl bg-[#222226] border border-[#323238] p-2.5">
                <div className="w-16 h-12 rounded-lg overflow-hidden bg-[#141416] shrink-0">
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt="Prévia do serviço"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    ref={serviceFileRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleServiceImageUpload(e)}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => serviceFileRef.current?.click()}
                    className="h-8 px-3 rounded-lg bg-[#8c1d0e] hover:bg-[#a22413] disabled:opacity-50 text-xs font-medium text-white inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadingPhoto
                        ? 'Enviando...'
                        : imageKey
                        ? 'Trocar foto (R2)'
                        : 'Enviar foto (R2)'}
                    </span>
                  </button>
                  <p className="text-[11px] text-[#8e8e93] truncate">
                    {imageKey
                      ? 'Ao trocar, a foto anterior é excluída do R2'
                      : 'PNG, JPG ou WebP até 5 MB'}
                  </p>
                </div>
              </div>

              <select
                id="srv-img"
                value={
                  SERVICE_IMAGE_PRESETS.some((p) => p.url === imageUrl) ? imageUrl : '__custom_r2__'
                }
                onChange={(e) => {
                  if (e.target.value === '__custom_r2__') return;
                  if (pendingUploadKey) {
                    void cleanupR2ObjectByKey(pendingUploadKey);
                    setPendingUploadKey('');
                  }
                  setImageUrl(e.target.value);
                  setImageKey('');
                }}
                className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
              >
                {imageKey && (
                  <option value="__custom_r2__">Imagem personalizada (Cloudflare R2)</option>
                )}
                {SERVICE_IMAGE_PRESETS.map((preset) => (
                  <option key={preset.url} value={preset.url}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-[#e4e4e7] cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 accent-[#8c1d0e]"
              />
              <span>Serviço ativo para agendamento online</span>
            </label>

            {error && <p className="text-xs text-[#f87171]">{error}</p>}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeModalAndCleanup}
                className="flex-1 h-10 rounded-xl border border-[#3a3a3f] text-sm text-[#e4e4e7]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 h-10 rounded-xl bg-[#8c1d0e] hover:bg-[#a22413] text-sm font-medium text-white"
              >
                Salvar serviço
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function AdminProfessionalsTab() {
  const {
    professionals,
    saveProfessional,
    deleteProfessional,
    uploadMediaAsset,
    cleanupR2ObjectByKey,
  } = useBooking();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarKey, setAvatarKey] = useState('');
  const [pendingAvatarKey, setPendingAvatarKey] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [active, setActive] = useState(true);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSpecialty('Esmalteria & Beleza');
    setAvatarUrl('');
    setAvatarKey('');
    setPendingAvatarKey('');
    setAvatarError(null);
    setWorkDays([1, 2, 3, 4, 5, 6]);
    setActive(true);
    setModalOpen(true);
  };

  const openEdit = (pro: Professional) => {
    setEditing(pro);
    setName(pro.name);
    setSpecialty(pro.specialty);
    setAvatarUrl(pro.avatarUrl || '');
    setAvatarKey(pro.avatarKey || '');
    setPendingAvatarKey('');
    setAvatarError(null);
    setWorkDays(pro.workDays);
    setActive(pro.active);
    setModalOpen(true);
  };

  const closeProModalAndCleanup = () => {
    if (pendingAvatarKey) {
      void cleanupR2ObjectByKey(pendingAvatarKey);
      setPendingAvatarKey('');
    }
    setModalOpen(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError(null);
    setUploadingAvatar(true);
    try {
      const asset = await uploadMediaAsset(file, 'profiles');
      if (pendingAvatarKey && pendingAvatarKey !== asset.objectKey) {
        void cleanupR2ObjectByKey(pendingAvatarKey);
      }
      setAvatarUrl(asset.url);
      setAvatarKey(asset.objectKey);
      setPendingAvatarKey(asset.objectKey);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Falha ao enviar foto de perfil.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const toggleWorkDay = (day: number) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    const parts = name.trim().split(/\s+/);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : name.trim().slice(0, 2).toUpperCase();

    await saveProfessional(
      {
        name: name.trim(),
        specialty: specialty.trim() || 'Beleza',
        avatarInitials: initials,
        avatarUrl,
        avatarKey,
        active,
        workDays,
      },
      editing?.id
    );
    setPendingAvatarKey('');
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#f4f4f5]">Profissionais</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            Gerencie sua equipe e os dias de atendimento de cada profissional.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a22413] active:scale-[0.98] text-white text-sm font-semibold whitespace-nowrap transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo profissional
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {professionals.map((pro) => (
          <div
            key={pro.id}
            className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-[#2c2c2e] text-[#f5f5f7] flex items-center justify-center text-sm font-semibold shrink-0 border border-white/[0.08]">
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
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#f4f4f5] truncate">{pro.name}</div>
                <div className="text-xs text-[#a1a1aa] truncate">{pro.specialty}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(pro)}
                  aria-label={`Editar ${pro.name}`}
                  className="h-10 w-10 rounded-xl bg-[#2c2c2e]/70 hover:bg-[#3a3a3c] text-[#aeaeb2] hover:text-white flex items-center justify-center active:scale-95 transition-all"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteProfessional(pro.id)}
                  aria-label={`Remover ${pro.name}`}
                  className="h-10 w-10 rounded-xl bg-[#3a1615]/70 hover:bg-[#4e1d1b] text-[#ff6961] flex items-center justify-center active:scale-95 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-xs text-[#a1a1aa] border-t border-[#252529] pt-2.5">
              Dias:{' '}
              <span className="text-[#e4e4e7]">
                {pro.workDays.map((d) => WEEKDAY_SHORT_PT[d]).join(', ') || 'Nenhum'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Editar profissional' : 'Novo profissional'}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 p-5 pb-safe space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-1 mb-1" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#f4f4f5]">
                {editing ? 'Editar profissional' : 'Novo profissional'}
              </h3>
              <button
                type="button"
                onClick={closeProModalAndCleanup}
                aria-label="Fechar modal"
                className="h-10 w-10 rounded-full bg-[#2c2c2e] text-[#aeaeb2] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Photo Upload (R2 profiles/) */}
            <div className="space-y-2">
              <span className="block text-xs text-[#a1a1aa]">Foto de perfil (R2)</span>
              <div className="flex items-center gap-3.5 rounded-xl bg-[#222226] border border-[#323238] p-3">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-[#141416] border border-white/10 flex items-center justify-center text-sm font-semibold text-[#d1d1d6] shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Prévia do perfil"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{(name.trim().slice(0, 2) || 'PR').toUpperCase()}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleAvatarUpload(e)}
                    className="sr-only"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={uploadingAvatar}
                      onClick={() => avatarFileRef.current?.click()}
                      className="h-8 px-3 rounded-lg bg-[#8c1d0e] hover:bg-[#a22413] disabled:opacity-50 text-xs font-medium text-white inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {uploadingAvatar
                          ? 'Enviando...'
                          : avatarUrl
                          ? 'Trocar foto'
                          : 'Enviar foto'}
                      </span>
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (pendingAvatarKey) {
                            void cleanupR2ObjectByKey(pendingAvatarKey);
                            setPendingAvatarKey('');
                          }
                          setAvatarUrl('');
                          setAvatarKey('');
                        }}
                        className="h-8 px-2.5 rounded-lg bg-[#3a1615] hover:bg-[#4e1d1b] text-xs font-medium text-[#ff6961]"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8e8e93]">
                    PNG, JPG ou WebP até 5 MB. Ao trocar, a antiga é excluída.
                  </p>
                </div>
              </div>
              {avatarError && <p className="text-xs text-[#f87171]">{avatarError}</p>}
            </div>

            <div>
              <label htmlFor="pro-name" className="block text-xs text-[#a1a1aa] mb-1">
                Nome
              </label>
              <input
                id="pro-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
              />
            </div>

            <div>
              <label htmlFor="pro-spec" className="block text-xs text-[#a1a1aa] mb-1">
                Especialidade
              </label>
              <input
                id="pro-spec"
                type="text"
                required
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5]"
              />
            </div>

            <div>
              <div className="text-xs text-[#a1a1aa] mb-2">Dias de atendimento</div>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_SHORT_PT.map((label, dayIdx) => {
                  const activeDay = workDays.includes(dayIdx);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWorkDay(dayIdx)}
                      className={`h-9 rounded-lg text-xs font-medium ${
                        activeDay
                          ? 'bg-[#8c1d0e] text-white'
                          : 'bg-[#222226] text-[#a1a1aa] hover:bg-[#2c2c32]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-[#e4e4e7]">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 accent-[#8c1d0e]"
              />
              <span>Disponível na agenda online</span>
            </label>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeProModalAndCleanup}
                className="flex-1 h-10 rounded-xl border border-[#3a3a3f] text-sm text-[#e4e4e7]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 h-10 rounded-xl bg-[#8c1d0e] hover:bg-[#a22413] text-sm font-medium text-white"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export { AdminSettingsTab } from './AdminSettingsTab';
