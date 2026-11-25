import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Globe,
  ImagePlus,
  Loader2,
  Palette,
  QrCode,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import {
  clampWatermarkOpacity,
  formatBytes,
  getWatermarkOpacityClass,
  normalizeHeaderLogoMode,
  validateBrandingFileClient,
  WATERMARK_OPACITY_STEPS,
} from '../../utils/branding';
import {
  calculatePixFee,
  clampPixFeePercentage,
  generatePixBrCodePayload,
  normalizePixKeyType,
  normalizePixProofMode,
  PIX_KEY_TYPE_LABELS,
  PIX_KEY_TYPE_OPTIONS,
  PIX_PERCENTAGE_PRESETS,
  PIX_PROOF_MODE_OPTIONS,
  validatePixConfig,
} from '../../utils/pix';
import {
  formatCurrencyBR,
  formatDateBR,
  formatPhoneMaskBR,
  WEEKDAY_FULL_PT,
} from '../../utils/schedule';
import {
  formatSettingsSaveError,
  getChangedSubTabs,
  validateSettingsDraft,
  type SettingsSubTab,
} from '../../utils/settingsValidation';
import type { BusinessSettings, HeaderLogoMode } from '../../types/booking';

const HEADER_MODE_OPTIONS: Array<{ id: HeaderLogoMode; label: string; hint: string }> = [
  { id: 'logo', label: 'Logo', hint: 'Imagem nítida ao lado do nome' },
  { id: 'watermark', label: "Marca d'água", hint: 'Imagem suave ao fundo do cabeçalho' },
  { id: 'both', label: "Logo + Marca d'água", hint: 'Ícone ao lado do nome e marca ao fundo' },
];

const SETTINGS_SUB_TABS: Array<{
  id: SettingsSubTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'pix', label: 'PIX e Confirmação', mobileLabel: 'PIX', icon: QrCode },
  { id: 'appearance', label: 'Aparência', mobileLabel: 'Aparência', icon: Palette },
  { id: 'schedule', label: 'Horários', mobileLabel: 'Horários', icon: Clock },
  { id: 'general', label: 'Geral', mobileLabel: 'Geral', icon: Store },
];

const TEST_AMOUNT_PRESETS = [50, 100, 150, 200] as const;

interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}

function ToggleSwitch({ id, checked, onChange, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c1d0e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141416] ${
        checked
          ? 'bg-[#30d158] border-[#30d158]'
          : 'bg-[#3a3a3c] border-white/10'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

interface PixLivePreviewCardProps {
  draft: BusinessSettings;
  feePercentage: number;
}

function PixLivePreviewCard({ draft, feePercentage }: PixLivePreviewCardProps) {
  const [testAmountInput, setTestAmountInput] = useState('100');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrRenderError, setQrRenderError] = useState<string | null>(null);
  const [copiedTestCode, setCopiedTestCode] = useState(false);

  const parsedTestAmount = useMemo(() => {
    const normalized = Number(testAmountInput.replace(',', '.'));
    if (!Number.isFinite(normalized) || normalized <= 0) return 100;
    return Math.min(50000, Number(normalized.toFixed(2)));
  }, [testAmountInput]);

  const simulation = useMemo(
    () => calculatePixFee(parsedTestAmount, feePercentage),
    [parsedTestAmount, feePercentage]
  );

  const keyType = normalizePixKeyType(draft.pixKeyType);
  const keyValidation = useMemo(
    () =>
      validatePixConfig({
        pixFeeEnabled: true,
        pixFeePercentage: feePercentage,
        pixKeyType: keyType,
        pixKey: draft.pixKey,
        pixBankName: draft.pixBankName,
        pixHolderName: draft.pixHolderName,
        pixCity: draft.pixCity,
        pixProofMode: 'both',
        pixWhatsappPhone: draft.pixWhatsappPhone,
        fallbackPhone: draft.phone,
      }),
    [
      draft.phone,
      draft.pixBankName,
      draft.pixCity,
      draft.pixHolderName,
      draft.pixKey,
      draft.pixWhatsappPhone,
      feePercentage,
      keyType,
    ]
  );

  const previewBrCode = useMemo(() => {
    if (!keyValidation.valid || !draft.pixKey?.trim()) return '';
    try {
      return generatePixBrCodePayload({
        pixKey: draft.pixKey,
        pixKeyType: keyType,
        merchantName: draft.pixHolderName || draft.businessName || 'Salao de Beleza',
        merchantCity: draft.pixCity || 'Sao Paulo',
        amount: simulation.feeAmount,
        txid: 'TESTEADMINPIX',
        description: `Teste taxa ${draft.businessName || 'Salao'}`,
      });
    } catch {
      return '';
    }
  }, [
    draft.businessName,
    draft.pixCity,
    draft.pixHolderName,
    draft.pixKey,
    keyType,
    keyValidation.valid,
    simulation.feeAmount,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!previewBrCode) {
      setQrDataUrl('');
      setQrRenderError(null);
      return;
    }

    QRCode.toDataURL(previewBrCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 224,
      color: {
        dark: '#111113',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
          setQrRenderError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl('');
          setQrRenderError('Não foi possível renderizar o QR Code de teste.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewBrCode]);

  const handleCopyTestCode = async () => {
    if (!previewBrCode) return;
    try {
      await navigator.clipboard.writeText(previewBrCode);
      setCopiedTestCode(true);
      window.setTimeout(() => setCopiedTestCode(false), 2200);
    } catch {
      setQrRenderError('Não foi possível copiar o código automaticamente.');
    }
  };

  return (
    <aside
      aria-label="Prévia ao vivo do QR Code PIX"
      className="rounded-[20px] bg-[#141416] border border-white/[0.08] p-4 sm:p-5 space-y-4"
    >
      <div className="space-y-1 border-b border-white/[0.07] pb-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#f5f5f7]">Prévia ao vivo do QR Code</h3>
          <span
            className={`text-xs font-medium whitespace-nowrap ${
              draft.pixFeeEnabled ? 'text-[#30d158]' : 'text-[#8e8e93]'
            }`}
          >
            {draft.pixFeeEnabled ? 'Cobrança ativa' : 'Modo de teste'}
          </span>
        </div>
        <p className="text-xs text-[#8e8e93]">
          Padrão Banco Central · Simule um agendamento e escaneie com o app do banco para validar sua chave.
        </p>
      </div>

      {/* Simulated Service Value Controls */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="pix-test-amount" className="text-xs font-medium text-[#aeaeb2]">
            Valor simulado dos serviços
          </label>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-xs text-[#8e8e93]">R$</span>
            <input
              id="pix-test-amount"
              type="number"
              min={1}
              max={50000}
              step="1"
              value={testAmountInput}
              onChange={(e) => setTestAmountInput(e.target.value)}
              className="w-24 h-8 rounded-lg bg-[#222226] border border-[#323238] px-2.5 text-xs font-semibold text-[#f5f5f7] text-right tabular-nums focus:outline-none focus:border-[#8c1d0e]"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {TEST_AMOUNT_PRESETS.map((preset) => {
            const selected = parsedTestAmount === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setTestAmountInput(String(preset))}
                className={`h-8 rounded-lg text-xs font-medium tabular-nums whitespace-nowrap transition-colors ${
                  selected
                    ? 'bg-[#8c1d0e] text-white'
                    : 'bg-[#222226] text-[#aeaeb2] hover:text-white hover:bg-[#2c2c32]'
                }`}
              >
                R$ {preset}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Calculation Breakdown */}
      <div className="rounded-xl bg-[#1c1c1e] border border-white/[0.06] p-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-[#aeaeb2]">
          <span>Total simulado</span>
          <span className="tabular-nums font-medium text-[#f5f5f7]">
            {formatCurrencyBR(parsedTestAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#aeaeb2]">
          <span>Taxa PIX ({feePercentage}%)</span>
          <span className="tabular-nums font-semibold text-[#30d158]">
            {formatCurrencyBR(simulation.feeAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#8e8e93] border-t border-white/[0.06] pt-1.5">
          <span>Restante no salão</span>
          <span className="tabular-nums font-medium text-[#d1d1d6]">
            {formatCurrencyBR(simulation.remainingAmount)}
          </span>
        </div>
      </div>

      {/* Live QR Code Container */}
      {keyValidation.valid && qrDataUrl ? (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-[#1c1c1e] border border-white/[0.06] p-4">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <img
                src={qrDataUrl}
                alt="QR Code PIX de teste"
                className="w-40 h-40 object-contain block"
              />
            </div>
            <div className="mt-3 text-center space-y-0.5 max-w-full">
              <div className="text-xs font-semibold text-[#f5f5f7] truncate">
                {draft.pixHolderName?.trim() || draft.businessName || 'Salão de Beleza'}
              </div>
              <div className="text-[11px] text-[#aeaeb2] truncate">
                {draft.pixBankName?.trim()} · {PIX_KEY_TYPE_LABELS[keyType]}
              </div>
              <div className="text-[11px] text-[#8e8e93] font-mono truncate max-w-[240px]">
                {draft.pixKey?.trim()}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleCopyTestCode()}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-[0.99] text-xs font-semibold text-[#f5f5f7] inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all"
          >
            {copiedTestCode ? (
              <>
                <Check className="w-4 h-4 text-[#30d158]" />
                <span>Código PIX de teste copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#aeaeb2]" />
                <span>Copiar código PIX de teste</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#1c1c1e] border border-dashed border-white/[0.12] p-5 text-center space-y-2">
          <div className="w-11 h-11 rounded-2xl bg-[#2c2c2e] text-[#8e8e93] flex items-center justify-center mx-auto">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-[#f5f5f7]">
            QR Code de teste aguardando dados
          </div>
          <p className="text-[11px] text-[#8e8e93] leading-relaxed">
            {qrRenderError ||
              keyValidation.error ||
              'Informe uma chave PIX válida e o nome do banco para gerar o QR Code ao vivo.'}
          </p>
        </div>
      )}
    </aside>
  );
}

export function AdminSettingsTab() {
  const { settings, saveSettings, uploadMediaAsset, cleanupR2ObjectByKey } = useBooking();
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('pix');
  const [draft, setDraft] = useState<BusinessSettings>(settings);
  const [pixPctInput, setPixPctInput] = useState<string>(
    String(clampPixFeePercentage(settings.pixFeePercentage))
  );
  const [newClosedDate, setNewClosedDate] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingAdminAvatar, setUploadingAdminAvatar] = useState(false);
  const [mediaNoticeError, setMediaNoticeError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [pendingLogoKey, setPendingLogoKey] = useState('');
  const [pendingBannerKey, setPendingBannerKey] = useState('');
  const [pendingAdminAvatarKey, setPendingAdminAvatarKey] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const adminAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  const changedTabs = useMemo(() => getChangedSubTabs(draft, settings), [draft, settings]);
  const hasChanges = changedTabs.length > 0;

  useEffect(() => {
    if (!hasChanges) {
      setDraft(settings);
      setPixPctInput(String(clampPixFeePercentage(settings.pixFeePercentage)));
    }
  }, [settings, hasChanges]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const patchDraft = (updater: (prev: BusinessSettings) => BusinessSettings) => {
    setSaveError(null);
    setJustSaved(false);
    setDraft(updater);
  };

  const updateDay = (dayKey: string, patch: Partial<BusinessSettings['weeklySchedule'][string]>) => {
    patchDraft((prev) => {
      const current = prev.weeklySchedule[dayKey] || {
        open: false,
        start: '09:00',
        end: '18:00',
      };
      const merged = { ...current, ...patch };
      if (!merged.breakStart) {
        delete merged.breakStart;
      }
      if (!merged.breakEnd) {
        delete merged.breakEnd;
      }
      return {
        ...prev,
        weeklySchedule: {
          ...prev.weeklySchedule,
          [dayKey]: merged,
        },
      };
    });
  };

  const handleDiscard = () => {
    if (pendingLogoKey) {
      void cleanupR2ObjectByKey(pendingLogoKey);
      setPendingLogoKey('');
    }
    if (pendingBannerKey) {
      void cleanupR2ObjectByKey(pendingBannerKey);
      setPendingBannerKey('');
    }
    if (pendingAdminAvatarKey) {
      void cleanupR2ObjectByKey(pendingAdminAvatarKey);
      setPendingAdminAvatarKey('');
    }
    setDraft(settings);
    setPixPctInput(String(clampPixFeePercentage(settings.pixFeePercentage)));
    setSaveError(null);
    setUploadError(null);
    setMediaNoticeError(null);
    setJustSaved(false);
  };

  const handleBrandingFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploadingImage(true);
    try {
      const validation = await validateBrandingFileClient(file);
      if (!validation.ok) {
        setUploadError(validation.error);
        return;
      }
      const asset = await uploadMediaAsset(file, 'branding');
      if (pendingLogoKey && pendingLogoKey !== asset.objectKey) {
        void cleanupR2ObjectByKey(pendingLogoKey);
      }
      setPendingLogoKey(asset.objectKey);
      patchDraft((prev) => ({
        ...prev,
        headerLogoKey: asset.objectKey,
        headerLogoUrl: asset.url,
        headerLogoFileName: asset.fileName,
        headerLogoMimeType: asset.mimeType,
        headerLogoSize: asset.sizeBytes,
        headerLogoMode: normalizeHeaderLogoMode(prev.headerLogoMode),
        headerWatermarkOpacity: clampWatermarkOpacity(prev.headerWatermarkOpacity),
      }));
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Não foi possível enviar a imagem para o Cloudflare R2.'
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleHeroBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaNoticeError(null);
    setUploadingBanner(true);
    try {
      const asset = await uploadMediaAsset(file, 'banners');
      if (pendingBannerKey && pendingBannerKey !== asset.objectKey) {
        void cleanupR2ObjectByKey(pendingBannerKey);
      }
      setPendingBannerKey(asset.objectKey);
      patchDraft((prev) => ({
        ...prev,
        heroBannerKey: asset.objectKey,
        heroBannerUrl: asset.url,
      }));
    } catch (err) {
      setMediaNoticeError(err instanceof Error ? err.message : 'Falha ao enviar capa para o R2.');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleAdminAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaNoticeError(null);
    setUploadingAdminAvatar(true);
    try {
      const asset = await uploadMediaAsset(file, 'profiles');
      if (pendingAdminAvatarKey && pendingAdminAvatarKey !== asset.objectKey) {
        void cleanupR2ObjectByKey(pendingAdminAvatarKey);
      }
      setPendingAdminAvatarKey(asset.objectKey);
      patchDraft((prev) => ({
        ...prev,
        adminAvatarKey: asset.objectKey,
        adminAvatarUrl: asset.url,
      }));
    } catch (err) {
      setMediaNoticeError(err instanceof Error ? err.message : 'Falha ao enviar foto de perfil.');
    } finally {
      setUploadingAdminAvatar(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setUploadError(null);
    setMediaNoticeError(null);
    setSaveError(null);

    const validation = validateSettingsDraft(draft);
    if (!validation.valid) {
      setSaveError(validation.error);
      if (validation.tab !== activeSubTab) {
        setActiveSubTab(validation.tab);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      await saveSettings(draft);
      setPendingLogoKey('');
      setPendingBannerKey('');
      setPendingAdminAvatarKey('');
      setJustSaved(true);
      if (savedTimerRef.current) {
        window.clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = window.setTimeout(() => setJustSaved(false), 3200);
    } catch (err) {
      setSaveError(formatSettingsSaveError(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const previewLogoUrl = draft.headerLogoUrl || '';
  const previewMode = normalizeHeaderLogoMode(draft.headerLogoMode);
  const previewOpacity = clampWatermarkOpacity(draft.headerWatermarkOpacity);
  const previewOpacityClass = getWatermarkOpacityClass(previewOpacity);
  const previewShowLogo =
    Boolean(previewLogoUrl) && (previewMode === 'logo' || previewMode === 'both');
  const previewShowWatermark =
    Boolean(previewLogoUrl) && (previewMode === 'watermark' || previewMode === 'both');

  const currentPixPct = clampPixFeePercentage(draft.pixFeePercentage);
  const currentPixType = normalizePixKeyType(draft.pixKeyType);
  const currentProofMode = normalizePixProofMode(draft.pixProofMode);
  const currentKeyMeta =
    PIX_KEY_TYPE_OPTIONS.find((opt) => opt.id === currentPixType) || PIX_KEY_TYPE_OPTIONS[0];

  const renderSectionFooter = (sectionLabel: string) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/[0.07] pt-4 mt-2">
      <div className="text-xs text-[#8e8e93]">
        {saving ? (
          <span className="text-[#d1d1d6]">Salvando alterações em {sectionLabel}...</span>
        ) : hasChanges ? (
          <span className="text-[#ffd60a]">
            Existem alterações pendentes prontas para salvar.
          </span>
        ) : justSaved ? (
          <span className="text-[#30d158] inline-flex items-center gap-1.5 font-medium">
            <Check className="w-3.5 h-3.5" />
            Alterações salvas com sucesso.
          </span>
        ) : (
          <span>Todas as configurações desta seção estão sincronizadas.</span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:shrink-0">
        {hasChanges && (
          <button
            type="button"
            disabled={saving}
            onClick={handleDiscard}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-[14px] bg-[#2c2c2e] hover:bg-[#3a3a3c] disabled:opacity-50 text-xs sm:text-sm font-medium text-[#e4e4e7] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Descartar</span>
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-60 active:scale-[0.98] text-xs sm:text-sm font-semibold text-white inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4 shrink-0" />
              <span>Salvar alterações</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <form
      onSubmit={(e) => void handleSave(e)}
      noValidate
      className={`space-y-5 ${hasChanges ? 'pb-36 lg:pb-24' : 'pb-24 lg:pb-10'}`}
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#f5f5f7]">Configurações</h1>
          <p className="text-sm text-[#aeaeb2] mt-0.5">
            Organize a cobrança PIX, confirmação manual, aparência, horários e dados do salão.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {justSaved && !hasChanges && (
            <span className="text-xs font-medium text-[#30d158] inline-flex items-center gap-1.5 whitespace-nowrap">
              <Check className="w-4 h-4" />
              Salvo
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-[14px] bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-60 active:scale-[0.98] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>Salvar alterações</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub-tabs Navigation Bar */}
      <div
        role="tablist"
        aria-label="Seções de configurações"
        className="grid grid-cols-4 gap-1 p-1.5 rounded-[18px] bg-[#1c1c1e] border border-white/[0.08]"
      >
        {SETTINGS_SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeSubTab === tab.id;
          const tabChanged = changedTabs.includes(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveSubTab(tab.id)}
              className={`min-h-[44px] px-2 sm:px-3.5 py-2 rounded-[13px] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
                selected
                  ? 'bg-[#8c1d0e] text-white shadow-sm'
                  : 'text-[#aeaeb2] hover:text-white hover:bg-[#2c2c2e]/70'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.mobileLabel}</span>
              {tabChanged && (
                <span
                  aria-label="Possui alterações não salvas"
                  className={`text-xs font-bold leading-none ${
                    selected ? 'text-[#ffd60a]' : 'text-[#ffd60a]'
                  }`}
                >
                  *
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Global Save / Validation Alert Banner */}
      {saveError && (
        <div
          role="alert"
          className="rounded-2xl bg-[#3a1615]/85 border border-[#ff453a]/35 px-4 py-3 flex items-start gap-3 text-xs sm:text-sm text-[#ffd1ce]"
        >
          <AlertCircle className="w-4 h-4 text-[#ff6961] shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{saveError}</div>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            aria-label="Fechar aviso"
            className="text-[#ff9c97] hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUB-TAB 1: PIX & CONFIRMATION */}
      {activeSubTab === 'pix' && (
        <section
          role="tabpanel"
          aria-label="PIX e Confirmação"
          className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-5"
        >
          <div className="border-b border-[#38383a]/70 pb-4">
            <h2 className="text-base font-semibold text-[#f5f5f7]">
              Taxa Antecipada via PIX e Confirmação Manual
            </h2>
            <p className="text-xs text-[#aeaeb2] mt-0.5">
              Ative ou desative a obrigatoriedade da taxa PIX e da aprovação manual, defina o percentual sobre os serviços e teste seu QR Code ao vivo.
            </p>
          </div>

          {/* Two Independent Policy Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="rounded-2xl bg-[#141416] border border-white/[0.07] p-4 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#ffd60a] shrink-0" />
                  <label
                    htmlFor="switch-admin-confirm"
                    className="text-sm font-semibold text-[#f5f5f7] cursor-pointer"
                  >
                    Confirmação manual obrigatória
                  </label>
                </div>
                <p className="text-xs text-[#8e8e93] leading-relaxed">
                  Novos horários entram como &quot;Aguardando confirmação&quot; e ficam bloqueados até você aprovar ou recusar na Agenda.
                </p>
                <div className="text-[11px] font-medium pt-0.5 text-[#aeaeb2]">
                  Status:{' '}
                  <span
                    className={
                      draft.requireAdminConfirmation ? 'text-[#ffd60a]' : 'text-[#8e8e93]'
                    }
                  >
                    {draft.requireAdminConfirmation ? 'Ativada' : 'Desativada'}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="switch-admin-confirm"
                checked={Boolean(draft.requireAdminConfirmation)}
                onChange={(checked) =>
                  patchDraft((p) => ({ ...p, requireAdminConfirmation: checked }))
                }
                ariaLabel="Ativar ou desativar confirmação manual do administrador"
              />
            </div>

            <div className="rounded-2xl bg-[#141416] border border-white/[0.07] p-4 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#30d158] shrink-0" />
                  <label
                    htmlFor="switch-pix-fee"
                    className="text-sm font-semibold text-[#f5f5f7] cursor-pointer"
                  >
                    Cobrar taxa antecipada via PIX
                  </label>
                </div>
                <p className="text-xs text-[#8e8e93] leading-relaxed">
                  Exibe QR Code PIX com o percentual escolhido antes de concluir o agendamento e envia a solicitação para aprovação.
                </p>
                <div className="text-[11px] font-medium pt-0.5 text-[#aeaeb2]">
                  Status:{' '}
                  <span className={draft.pixFeeEnabled ? 'text-[#30d158]' : 'text-[#8e8e93]'}>
                    {draft.pixFeeEnabled ? `Ativada (${currentPixPct}%)` : 'Desativada'}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="switch-pix-fee"
                checked={Boolean(draft.pixFeeEnabled)}
                onChange={(checked) =>
                  patchDraft((p) => ({
                    ...p,
                    pixFeeEnabled: checked,
                    pixFeePercentage: clampPixFeePercentage(p.pixFeePercentage),
                    pixKeyType: normalizePixKeyType(p.pixKeyType),
                    pixProofMode: normalizePixProofMode(p.pixProofMode),
                  }))
                }
                ariaLabel="Ativar ou desativar cobrança de taxa antecipada via PIX"
              />
            </div>
          </div>

          {/* 2-Column PIX Config + Live QR Preview */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* Left Column: Percentage, Key, Bank & Proof Config */}
            <div className="xl:col-span-7 space-y-5">
              {/* Fee Percentage */}
              <div className="rounded-2xl bg-[#141416] border border-white/[0.07] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="cfg-pix-pct"
                    className="text-xs font-semibold text-[#f5f5f7]"
                  >
                    Percentual da taxa sobre o valor total dos serviços
                  </label>
                  <span className="text-xs text-[#30d158] font-semibold tabular-nums">
                    {currentPixPct}% antecipado
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {PIX_PERCENTAGE_PRESETS.map((pct) => {
                    const activePct = currentPixPct === pct;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setPixPctInput(String(pct));
                          patchDraft((p) => ({ ...p, pixFeePercentage: pct }));
                        }}
                        className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold tabular-nums whitespace-nowrap transition-colors ${
                          activePct
                            ? 'bg-[#8c1d0e] text-white'
                            : 'bg-[#2c2c2e] text-[#aeaeb2] hover:text-white hover:bg-[#3a3a3c]'
                        }`}
                      >
                        {pct}%
                      </button>
                    );
                  })}

                  <div className="inline-flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-[#8e8e93]">Outro:</span>
                    <input
                      id="cfg-pix-pct"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={pixPctInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setPixPctInput(raw);
                        if (raw.trim() === '') return;
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          const clamped = Math.min(100, Math.max(1, Math.round(parsed)));
                          patchDraft((p) => ({ ...p, pixFeePercentage: clamped }));
                        }
                      }}
                      onBlur={() => {
                        setPixPctInput(String(clampPixFeePercentage(draft.pixFeePercentage)));
                      }}
                      className="w-20 h-9 rounded-xl bg-[#2c2c2e] border border-white/[0.08] px-2.5 text-sm font-semibold text-[#f5f5f7] text-center tabular-nums focus:outline-none focus:border-[#8c1d0e]"
                    />
                    <span className="text-xs font-semibold text-[#aeaeb2]">%</span>
                  </div>
                </div>
              </div>

              {/* PIX Key & Bank Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cfg-pix-type" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Tipo de chave PIX
                  </label>
                  <select
                    id="cfg-pix-type"
                    value={currentPixType}
                    onChange={(e) =>
                      patchDraft((p) => ({
                        ...p,
                        pixKeyType: normalizePixKeyType(e.target.value),
                      }))
                    }
                    className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] focus:outline-none focus:border-[#8c1d0e]"
                  >
                    {PIX_KEY_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cfg-pix-key" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Chave PIX ({currentKeyMeta.label})
                  </label>
                  <input
                    id="cfg-pix-key"
                    type="text"
                    maxLength={140}
                    value={draft.pixKey || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, pixKey: e.target.value }))}
                    placeholder={currentKeyMeta.placeholder}
                    className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] placeholder-[#636366] focus:outline-none focus:border-[#8c1d0e]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-pix-bank" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Nome do banco
                  </label>
                  <input
                    id="cfg-pix-bank"
                    type="text"
                    maxLength={80}
                    value={draft.pixBankName || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, pixBankName: e.target.value }))}
                    placeholder="Ex.: Nubank, Itaú, Inter, Bradesco..."
                    className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] placeholder-[#636366] focus:outline-none focus:border-[#8c1d0e]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-pix-holder" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Nome do titular / favorecido
                  </label>
                  <input
                    id="cfg-pix-holder"
                    type="text"
                    maxLength={80}
                    value={draft.pixHolderName || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, pixHolderName: e.target.value }))}
                    placeholder={draft.businessName || 'Nome exibido no app do banco'}
                    className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] placeholder-[#636366] focus:outline-none focus:border-[#8c1d0e]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-pix-city" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Cidade da conta (para o QR Code)
                  </label>
                  <input
                    id="cfg-pix-city"
                    type="text"
                    maxLength={40}
                    value={draft.pixCity || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, pixCity: e.target.value }))}
                    placeholder="Ex.: Campinas"
                    className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] placeholder-[#636366] focus:outline-none focus:border-[#8c1d0e]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-pix-wa" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    WhatsApp para comprovantes (opcional)
                  </label>
                  <input
                    id="cfg-pix-wa"
                    type="tel"
                    maxLength={30}
                    value={draft.pixWhatsappPhone || ''}
                    onChange={(e) =>
                      patchDraft((p) => ({
                        ...p,
                        pixWhatsappPhone: formatPhoneMaskBR(e.target.value),
                      }))
                    }
                    placeholder={draft.phone || '(19) 99999-9999'}
                    className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] placeholder-[#636366] tabular-nums focus:outline-none focus:border-[#8c1d0e]"
                  />
                </div>
              </div>

              {/* Post-Payment Client Notification Mode */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-[#aeaeb2]">
                  Como o cliente avisa após pagar o PIX
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#141416] border border-white/[0.06]">
                  {PIX_PROOF_MODE_OPTIONS.map((opt) => {
                    const selected = currentProofMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => patchDraft((p) => ({ ...p, pixProofMode: opt.id }))}
                        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold transition-all text-center ${
                          selected
                            ? 'bg-[#8c1d0e] text-white shadow-sm'
                            : 'text-[#aeaeb2] hover:text-white hover:bg-[#2c2c2e]/60'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#8e8e93]">
                  {PIX_PROOF_MODE_OPTIONS.find((o) => o.id === currentProofMode)?.hint}
                </p>
              </div>
            </div>

            {/* Right Column: Live Test QR Code */}
            <div className="xl:col-span-5 xl:sticky xl:top-20">
              <PixLivePreviewCard draft={draft} feePercentage={currentPixPct} />
            </div>
          </div>

          {renderSectionFooter('PIX e Confirmação')}
        </section>
      )}

      {/* SUB-TAB 2: APPEARANCE */}
      {activeSubTab === 'appearance' && (
        <div role="tabpanel" aria-label="Aparência" className="space-y-5">
          {/* Header Branding */}
          <section className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-5">
            <div className="border-b border-[#38383a]/70 pb-4">
              <h2 className="text-base font-semibold text-[#f5f5f7]">Identidade do Cabeçalho</h2>
              <p className="text-xs text-[#aeaeb2] mt-0.5">
                Altere o nome exibido no topo do site e envie um PNG ou ICO (com ou sem fundo transparente) como logo ou marca d&apos;água.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 space-y-4">
                <div>
                  <label htmlFor="cfg-name-brand" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Nome do site no cabeçalho
                  </label>
                  <input
                    id="cfg-name-brand"
                    type="text"
                    maxLength={80}
                    value={draft.businessName}
                    onChange={(e) => patchDraft((p) => ({ ...p, businessName: e.target.value }))}
                    placeholder="Ex.: Studio Bela Unha"
                    className="w-full h-11 rounded-2xl bg-[#2c2c2e] border border-white/[0.08] focus:border-[#8c1d0e] focus:outline-none px-3.5 text-sm text-[#f5f5f7]"
                  />
                </div>

                <div className="space-y-2.5">
                  <span className="block text-xs font-medium text-[#aeaeb2]">
                    Imagem PNG ou ICO (atualiza cabeçalho e ícone da aba)
                  </span>

                  <input
                    ref={fileInputRef}
                    id="cfg-header-logo"
                    type="file"
                    accept=".png,.ico,image/png,image/x-icon,image/vnd.microsoft.icon"
                    onChange={(e) => void handleBrandingFileChange(e)}
                    className="sr-only"
                  />

                  <div className="flex flex-wrap items-center gap-3.5 rounded-2xl bg-[#141416] border border-white/[0.07] p-3.5">
                    <div className="w-16 h-16 rounded-xl border border-white/10 bg-[#1c1c1e] flex items-center justify-center overflow-hidden shrink-0">
                      {previewLogoUrl ? (
                        <img
                          src={previewLogoUrl}
                          alt="Prévia da imagem do cabeçalho"
                          referrerPolicy="no-referrer"
                          className="max-w-full max-h-full object-contain p-1.5"
                        />
                      ) : (
                        <ImagePlus className="w-6 h-6 text-[#636366]" />
                      )}
                    </div>

                    <div className="flex-1 min-w-[180px] space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={uploadingImage}
                          onClick={() => fileInputRef.current?.click()}
                          className="h-9 px-3.5 rounded-xl bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {uploadingImage
                              ? 'Processando...'
                              : previewLogoUrl
                              ? 'Trocar PNG / ICO'
                              : 'Enviar PNG / ICO'}
                          </span>
                        </button>

                        {previewLogoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setUploadError(null);
                              if (pendingLogoKey) {
                                void cleanupR2ObjectByKey(pendingLogoKey);
                                setPendingLogoKey('');
                              }
                              patchDraft((p) => ({
                                ...p,
                                headerLogoKey: '',
                                headerLogoUrl: '',
                                headerLogoFileName: '',
                                headerLogoMimeType: '',
                                headerLogoSize: 0,
                              }));
                            }}
                            className="h-9 px-3 rounded-xl bg-[#3a1615] hover:bg-[#4e1d1b] text-xs font-medium text-[#ff6961] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8e8e93] leading-relaxed">
                        {draft.headerLogoFileName
                          ? `${draft.headerLogoFileName} (${formatBytes(draft.headerLogoSize || 0)}) · Armazenado no Cloudflare R2`
                          : 'Suporta PNG (transparente ou sólido) e ICO até 5 MB.'}
                      </p>
                    </div>
                  </div>

                  {uploadError && (
                    <p role="alert" className="text-xs font-medium text-[#ff453a]">
                      {uploadError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="block text-xs font-medium text-[#aeaeb2]">
                    Modo de exibição no cabeçalho
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#141416] border border-white/[0.06]">
                    {HEADER_MODE_OPTIONS.map((opt) => {
                      const selected = previewMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => patchDraft((p) => ({ ...p, headerLogoMode: opt.id }))}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all text-center whitespace-nowrap ${
                            selected
                              ? 'bg-[#8c1d0e] text-white shadow-sm'
                              : 'text-[#aeaeb2] hover:text-white hover:bg-[#2c2c2e]/60'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#8e8e93]">
                    {HEADER_MODE_OPTIONS.find((o) => o.id === previewMode)?.hint}
                  </p>
                </div>

                {(previewMode === 'watermark' || previewMode === 'both') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#aeaeb2]">
                        Intensidade da marca d&apos;água
                      </span>
                      <span className="text-[#f5f5f7] font-semibold tabular-nums">
                        {previewOpacity}%
                      </span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                      {WATERMARK_OPACITY_STEPS.map((step) => {
                        const activeStep = previewOpacity === step.value;
                        return (
                          <button
                            key={step.value}
                            type="button"
                            onClick={() =>
                              patchDraft((p) => ({ ...p, headerWatermarkOpacity: step.value }))
                            }
                            className={`h-8 rounded-xl text-xs font-medium tabular-nums transition-colors ${
                              activeStep
                                ? 'bg-[#8c1d0e] text-white'
                                : 'bg-[#2c2c2e] text-[#aeaeb2] hover:text-white hover:bg-[#3a3a3c]'
                            }`}
                          >
                            {step.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Live Header Preview */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-[#aeaeb2]">Pré-visualização ao vivo</div>

                  <div className="inline-flex items-center gap-2 max-w-full rounded-t-xl rounded-b-lg bg-[#1c1c1e] border border-white/[0.08] px-3 py-1.5 text-[11px] text-[#d1d1d6]">
                    {previewLogoUrl ? (
                      <img
                        src={previewLogoUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-3.5 h-3.5 object-contain rounded-sm shrink-0"
                      />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-[#8e8e93] shrink-0" />
                    )}
                    <span className="truncate">
                      {(draft.businessName.trim() || 'Seu Salão')} — Agendamento
                    </span>
                  </div>

                  <div className="relative h-14 rounded-2xl bg-[#121214]/90 border border-white/[0.1] overflow-hidden px-4 flex items-center justify-between gap-3">
                    {previewShowWatermark && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden px-4"
                      >
                        <img
                          src={previewLogoUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className={`max-h-11 w-auto max-w-[180px] object-contain ${previewOpacityClass}`}
                        />
                      </div>
                    )}

                    <div className="relative z-10 flex items-center gap-2 min-w-0">
                      {previewShowLogo && (
                        <img
                          src={previewLogoUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-7 w-auto max-w-[84px] object-contain rounded-md shrink-0"
                        />
                      )}
                      <span className="text-sm font-semibold text-[#f5f5f7] truncate">
                        {draft.businessName.trim() || 'Seu Salão'}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-center gap-1 p-0.5 rounded-lg bg-[#1c1c1e]/90 border border-white/[0.06] shrink-0">
                      <span className="px-2 py-1 rounded-md bg-[#8c1d0e] text-[10px] font-medium text-white">
                        Agendar
                      </span>
                      <span className="px-2 py-1 text-[10px] font-medium text-[#aeaeb2]">
                        Meus Horários
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-[#8e8e93] leading-relaxed">
                  Ao salvar, o novo nome, a logo e o ícone da aba passam a valer imediatamente para todos os clientes.
                </p>
              </div>
            </div>
          </section>

          {/* Hero Banner & Admin Avatar */}
          <section className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-5">
            <div className="border-b border-[#38383a]/70 pb-4">
              <h2 className="text-base font-semibold text-[#f5f5f7]">
                Capa Inicial e Perfil do Administrador
              </h2>
              <p className="text-xs text-[#aeaeb2] mt-0.5">
                Envie a foto de capa exibida na tela inicial e sua foto de perfil do painel. Imagens substituídas são apagadas automaticamente do R2 ao salvar.
              </p>
            </div>

            {mediaNoticeError && (
              <p role="alert" className="text-xs font-medium text-[#ff453a]">
                {mediaNoticeError}
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 space-y-3.5">
                <span className="block text-xs font-medium text-[#aeaeb2]">
                  Banner / Capa da tela inicial (16:9)
                </span>

                <input
                  ref={bannerInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleHeroBannerUpload(e)}
                  className="sr-only"
                />

                <div className="relative h-36 rounded-2xl overflow-hidden bg-[#141416] border border-white/[0.08] flex items-center justify-center">
                  {draft.heroBannerUrl ? (
                    <>
                      <img
                        src={draft.heroBannerUrl}
                        alt="Prévia da capa inicial"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3.5">
                        <div className="text-sm font-semibold text-white truncate">
                          {draft.businessName.trim() || 'Seu Salão'}
                        </div>
                        {draft.heroBannerSubtitle && (
                          <div className="text-xs text-[#d1d1d6] truncate">
                            {draft.heroBannerSubtitle}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-1.5 px-4">
                      <ImagePlus className="w-6 h-6 text-[#636366] mx-auto" />
                      <p className="text-xs text-[#8e8e93]">Nenhuma capa configurada</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingBanner}
                    onClick={() => bannerInputRef.current?.click()}
                    className="h-9 px-3.5 rounded-xl bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadingBanner
                        ? 'Enviando...'
                        : draft.heroBannerUrl
                        ? 'Trocar capa'
                        : 'Enviar capa'}
                    </span>
                  </button>

                  {draft.heroBannerUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingBannerKey) {
                          void cleanupR2ObjectByKey(pendingBannerKey);
                          setPendingBannerKey('');
                        }
                        patchDraft((p) => ({ ...p, heroBannerKey: '', heroBannerUrl: '' }));
                      }}
                      className="h-9 px-3 rounded-xl bg-[#3a1615] hover:bg-[#4e1d1b] text-xs font-medium text-[#ff6961] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover capa</span>
                    </button>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cfg-banner-sub"
                    className="block text-xs font-medium text-[#aeaeb2] mb-1"
                  >
                    Subtítulo da capa (opcional)
                  </label>
                  <input
                    id="cfg-banner-sub"
                    type="text"
                    maxLength={160}
                    value={draft.heroBannerSubtitle || ''}
                    onChange={(e) =>
                      patchDraft((p) => ({ ...p, heroBannerSubtitle: e.target.value }))
                    }
                    placeholder="Ex.: Beleza, unhas em gel e atendimento personalizado"
                    className="w-full h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] focus:outline-none focus:border-[#8c1d0e]"
                  />
                </div>
              </div>

              <div className="lg:col-span-5 rounded-2xl bg-[#111113] border border-white/[0.07] p-4 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <span className="block text-xs font-medium text-[#aeaeb2]">
                    Foto de perfil do administrador
                  </span>

                  <input
                    ref={adminAvatarInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleAdminAvatarUpload(e)}
                    className="sr-only"
                  />

                  <div className="flex items-center gap-3.5">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-[#1c1c1e] border border-white/10 flex items-center justify-center shrink-0">
                      {draft.adminAvatarUrl ? (
                        <img
                          src={draft.adminAvatarUrl}
                          alt="Foto do administrador"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImagePlus className="w-6 h-6 text-[#636366]" />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={uploadingAdminAvatar}
                        onClick={() => adminAvatarInputRef.current?.click()}
                        className="h-9 px-3.5 rounded-xl bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingAdminAvatar
                            ? 'Enviando...'
                            : draft.adminAvatarUrl
                            ? 'Trocar foto'
                            : 'Enviar foto'}
                        </span>
                      </button>

                      {draft.adminAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            if (pendingAdminAvatarKey) {
                              void cleanupR2ObjectByKey(pendingAdminAvatarKey);
                              setPendingAdminAvatarKey('');
                            }
                            patchDraft((p) => ({
                              ...p,
                              adminAvatarKey: '',
                              adminAvatarUrl: '',
                            }));
                          }}
                          className="h-9 px-3 rounded-xl bg-[#3a1615] hover:bg-[#4e1d1b] text-xs font-medium text-[#ff6961] whitespace-nowrap"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-[#8e8e93] leading-relaxed">
                  Exibida na barra lateral e no cabeçalho do painel administrativo.
                </p>
              </div>
            </div>

            {renderSectionFooter('Aparência')}
          </section>
        </div>
      )}

      {/* SUB-TAB 3: SCHEDULE & HOLIDAYS */}
      {activeSubTab === 'schedule' && (
        <div role="tabpanel" aria-label="Horários" className="space-y-5">
          {/* Slot Interval + Weekly Hours */}
          <section className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] overflow-hidden">
            <div className="p-4 sm:px-5 border-b border-[#38383a]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#f5f5f7]">Expediente semanal</h2>
                <p className="text-xs text-[#aeaeb2] mt-0.5">
                  Defina os dias abertos, horário de atendimento, pausa opcional e intervalo entre horários.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="cfg-interval" className="text-xs text-[#aeaeb2] whitespace-nowrap">
                  Intervalo:
                </label>
                <select
                  id="cfg-interval"
                  value={draft.slotIntervalMinutes}
                  onChange={(e) =>
                    patchDraft((p) => ({ ...p, slotIntervalMinutes: Number(e.target.value) }))
                  }
                  className="h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] focus:outline-none focus:border-[#8c1d0e]"
                >
                  <option value={15}>A cada 15 min</option>
                  <option value={30}>A cada 30 min</option>
                  <option value={45}>A cada 45 min</option>
                  <option value={60}>A cada 60 min</option>
                </select>
              </div>
            </div>

            <div className="divide-y divide-[#38383a]/70">
              {WEEKDAY_FULL_PT.map((dayName, idx) => {
                const key = String(idx);
                const cfg = draft.weeklySchedule[key] || {
                  open: false,
                  start: '09:00',
                  end: '18:00',
                };
                return (
                  <div
                    key={key}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <label className="flex items-center gap-3 min-w-[160px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfg.open}
                        onChange={(e) => updateDay(key, { open: e.target.checked })}
                        className="w-4 h-4 accent-[#8c1d0e]"
                      />
                      <span className="text-sm font-medium text-[#f4f4f5]">{dayName}</span>
                    </label>

                    {cfg.open ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#a1a1aa]">
                        <span>Abre</span>
                        <input
                          type="time"
                          aria-label={`Abertura ${dayName}`}
                          value={cfg.start}
                          onChange={(e) => updateDay(key, { start: e.target.value })}
                          className="h-9 rounded-lg bg-[#222226] border border-[#323238] px-2.5 text-sm text-[#f4f4f5] tabular-nums"
                        />
                        <span>Fecha</span>
                        <input
                          type="time"
                          aria-label={`Fechamento ${dayName}`}
                          value={cfg.end}
                          onChange={(e) => updateDay(key, { end: e.target.value })}
                          className="h-9 rounded-lg bg-[#222226] border border-[#323238] px-2.5 text-sm text-[#f4f4f5] tabular-nums"
                        />
                        <span className="ml-1">Pausa</span>
                        <input
                          type="time"
                          aria-label={`Início pausa ${dayName}`}
                          value={cfg.breakStart || ''}
                          onChange={(e) =>
                            updateDay(key, { breakStart: e.target.value || undefined })
                          }
                          className="h-9 rounded-lg bg-[#222226] border border-[#323238] px-2 text-sm text-[#f4f4f5] tabular-nums"
                        />
                        <span>–</span>
                        <input
                          type="time"
                          aria-label={`Fim pausa ${dayName}`}
                          value={cfg.breakEnd || ''}
                          onChange={(e) =>
                            updateDay(key, { breakEnd: e.target.value || undefined })
                          }
                          className="h-9 rounded-lg bg-[#222226] border border-[#323238] px-2 text-sm text-[#f4f4f5] tabular-nums"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-[#71717a]">Fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Closed Dates / Holidays */}
          <section className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#f4f4f5]">Feriados e datas bloqueadas</h2>
              <p className="text-xs text-[#aeaeb2] mt-0.5">
                Bloqueie dias específicos em que o salão não atenderá.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="date"
                aria-label="Adicionar data fechada"
                value={newClosedDate}
                onChange={(e) => setNewClosedDate(e.target.value)}
                className="h-10 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] tabular-nums"
              />
              <button
                type="button"
                disabled={!newClosedDate}
                onClick={() => {
                  if (!newClosedDate || draft.closedDates.includes(newClosedDate)) return;
                  patchDraft((p) => ({
                    ...p,
                    closedDates: [...p.closedDates, newClosedDate].sort(),
                  }));
                  setNewClosedDate('');
                }}
                className="h-10 px-4 rounded-xl bg-[#2a2a2f] hover:bg-[#36363d] disabled:opacity-40 text-xs font-medium text-[#f4f4f5] whitespace-nowrap"
              >
                Adicionar data fechada
              </button>
            </div>

            {draft.closedDates.length === 0 ? (
              <p className="text-xs text-[#71717a]">Nenhuma data especial bloqueada.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {draft.closedDates.map((d) => (
                  <div
                    key={d}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#241616] border border-[#4a2323] text-xs text-[#fca5a5] tabular-nums"
                  >
                    <span>{formatDateBR(d)}</span>
                    <button
                      type="button"
                      aria-label={`Remover data bloqueada ${d}`}
                      onClick={() =>
                        patchDraft((p) => ({
                          ...p,
                          closedDates: p.closedDates.filter((item) => item !== d),
                        }))
                      }
                      className="hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {renderSectionFooter('Horários')}
          </section>
        </div>
      )}

      {/* SUB-TAB 4: GENERAL */}
      {activeSubTab === 'general' && (
        <section
          role="tabpanel"
          aria-label="Geral"
          className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-5 space-y-5"
        >
          <div className="border-b border-[#38383a]/70 pb-4">
            <h2 className="text-base font-semibold text-[#f5f5f7]">Dados do Estabelecimento</h2>
            <p className="text-xs text-[#aeaeb2] mt-0.5">
              Informações principais exibidas aos clientes no agendamento e nos comprovantes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="cfg-general-name" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                Nome do estabelecimento
              </label>
              <input
                id="cfg-general-name"
                type="text"
                maxLength={80}
                value={draft.businessName}
                onChange={(e) => patchDraft((p) => ({ ...p, businessName: e.target.value }))}
                placeholder="Ex.: Esmalteria&beleza"
                className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] focus:outline-none focus:border-[#8c1d0e]"
              />
            </div>

            <div>
              <label htmlFor="cfg-phone" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                WhatsApp principal de contato
              </label>
              <input
                id="cfg-phone"
                type="tel"
                maxLength={30}
                value={draft.phone}
                onChange={(e) =>
                  patchDraft((p) => ({ ...p, phone: formatPhoneMaskBR(e.target.value) }))
                }
                placeholder="(19) 99999-9999"
                className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] tabular-nums focus:outline-none focus:border-[#8c1d0e]"
              />
            </div>

            <div>
              <label htmlFor="cfg-addr" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                Endereço completo
              </label>
              <input
                id="cfg-addr"
                type="text"
                maxLength={200}
                value={draft.address}
                onChange={(e) => patchDraft((p) => ({ ...p, address: e.target.value }))}
                placeholder="Rua, número, bairro e cidade"
                className="w-full h-11 rounded-xl bg-[#222226] border border-[#323238] px-3 text-sm text-[#f4f4f5] focus:outline-none focus:border-[#8c1d0e]"
              />
            </div>
          </div>

          {/* Clean unboxed operational summary */}
          <div className="rounded-2xl bg-[#141416] border border-white/[0.07] p-4 space-y-2 text-xs">
            <div className="font-semibold text-[#f5f5f7]">Resumo das regras de agendamento</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#aeaeb2]">
              <span>
                Confirmação manual:{' '}
                <strong className={draft.requireAdminConfirmation ? 'text-[#ffd60a]' : 'text-[#8e8e93]'}>
                  {draft.requireAdminConfirmation ? 'Ativada' : 'Desativada'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Taxa PIX:{' '}
                <strong className={draft.pixFeeEnabled ? 'text-[#30d158]' : 'text-[#8e8e93]'}>
                  {draft.pixFeeEnabled ? `Ativada (${currentPixPct}%)` : 'Desativada'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Intervalo: <strong className="text-[#f5f5f7]">{draft.slotIntervalMinutes} min</strong>
              </span>
            </div>
          </div>

          {renderSectionFooter('Geral')}
        </section>
      )}

      {/* Floating Sticky Unsaved-Changes Bar */}
      <div
        aria-live="polite"
        className={`fixed bottom-[84px] lg:bottom-5 inset-x-0 z-30 px-3.5 sm:px-6 flex justify-center pointer-events-none transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          hasChanges ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <div
          className={`w-full max-w-2xl rounded-[20px] bg-[#161618]/94 backdrop-blur-2xl border border-white/[0.14] shadow-[0_14px_38px_rgba(0,0,0,0.72)] px-4 py-2.5 flex items-center justify-between gap-3 ${
            hasChanges ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-[#f5f5f7] truncate">
              Alterações não salvas
            </div>
            <div className="text-[11px] text-[#aeaeb2] truncate tabular-nums">
              {changedTabs.length === 1
                ? '1 seção modificada'
                : `${changedTabs.length} seções modificadas`}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              tabIndex={hasChanges ? 0 : -1}
              disabled={saving}
              onClick={handleDiscard}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#2c2c2e] hover:bg-[#3a3a3c] disabled:opacity-50 text-xs font-medium text-[#e4e4e7] whitespace-nowrap transition-colors"
            >
              Descartar
            </button>
            <button
              type="submit"
              tabIndex={hasChanges ? 0 : -1}
              disabled={saving}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#8c1d0e] hover:bg-[#a32210] disabled:opacity-60 active:scale-[0.98] text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap transition-all"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span>Salvar alterações</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
