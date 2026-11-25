import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  FileCheck2,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import type { BusinessSettings } from '../../types/booking';
import {
  buildPixWhatsappHref,
  generatePixBrCodePayload,
  normalizePixKeyType,
  normalizePixProofMode,
  PIX_KEY_TYPE_LABELS,
} from '../../utils/pix';
import { formatCurrencyBR, formatDateBR } from '../../utils/schedule';
import { uploadPixReceiptToR2, type R2UploadedReceiptPayload } from '../../utils/r2Client';

interface PixCheckoutModalProps {
  open: boolean;
  settings: BusinessSettings;
  clientName: string;
  professionalName: string;
  serviceNames: string[];
  dateISO: string;
  startTime: string;
  totalPrice: number;
  feePercentage: number;
  feeAmount: number;
  remainingAmount: number;
  submitting: boolean;
  onClose: () => void;
  onConfirmPaid: (receipt: R2UploadedReceiptPayload | null) => Promise<void>;
}

export function PixCheckoutModal({
  open,
  settings,
  clientName,
  professionalName,
  serviceNames,
  dateISO,
  startTime,
  totalPrice,
  feePercentage,
  feeAmount,
  remainingAmount,
  submitting,
  onClose,
  onConfirmPaid,
}: PixCheckoutModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [uploadedReceipt, setUploadedReceipt] = useState<R2UploadedReceiptPayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const keyType = normalizePixKeyType(settings.pixKeyType);
  const proofMode = normalizePixProofMode(settings.pixProofMode);
  const showReceiptUpload = proofMode === 'receipt_and_confirm' || proofMode === 'both';
  const showWhatsappOption = proofMode === 'whatsapp' || proofMode === 'both';

  const txid = useMemo(() => {
    const compactDate = dateISO.replace(/-/g, '').slice(2);
    const compactTime = startTime.replace(':', '');
    return `AGD${compactDate}${compactTime}`.slice(0, 20);
  }, [dateISO, startTime]);

  const brCodePayload = useMemo(() => {
    if (!open || !settings.pixKey) return '';
    try {
      return generatePixBrCodePayload({
        pixKey: settings.pixKey,
        pixKeyType: keyType,
        merchantName: settings.pixHolderName || settings.businessName,
        merchantCity: settings.pixCity || 'Sao Paulo',
        amount: feeAmount,
        txid,
        description: `Taxa agendamento ${settings.businessName}`,
      });
    } catch {
      return '';
    }
  }, [
    feeAmount,
    keyType,
    open,
    settings.businessName,
    settings.pixCity,
    settings.pixHolderName,
    settings.pixKey,
    txid,
  ]);

  const whatsappHref = useMemo(() => {
    const targetPhone = settings.pixWhatsappPhone || settings.phone || '';
    return buildPixWhatsappHref({
      phone: targetPhone,
      businessName: settings.businessName,
      clientName,
      serviceNames,
      professionalName,
      dateBR: formatDateBR(dateISO),
      startTime,
      totalPrice,
      feeAmount,
      feePercentage,
    });
  }, [
    clientName,
    dateISO,
    feeAmount,
    feePercentage,
    professionalName,
    serviceNames,
    settings.businessName,
    settings.phone,
    settings.pixWhatsappPhone,
    startTime,
    totalPrice,
  ]);

  useEffect(() => {
    if (!open) {
      setUploadedReceipt(null);
      setReceiptError(null);
      setCopiedCode(false);
      setCopiedKey(false);
      return;
    }
    if (!brCodePayload) {
      setQrDataUrl('');
      setQrError('Não foi possível gerar o QR Code PIX. Verifique os dados configurados.');
      return;
    }
    let cancelled = false;
    setQrError(null);
    QRCode.toDataURL(brCodePayload, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#111111',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError('Falha ao renderizar o QR Code PIX.');
      });
    return () => {
      cancelled = true;
    };
  }, [brCodePayload, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, submitting]);

  if (!open) return null;

  const handleCopy = async (text: string, kind: 'code' | 'key') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback copy for restricted iframe contexts
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
    if (kind === 'code') {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2400);
    } else {
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2400);
    }
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setReceiptError(null);
    setUploadingReceipt(true);
    try {
      const receipt = await uploadPixReceiptToR2(file);
      setUploadedReceipt(receipt);
    } catch (err) {
      setReceiptError(
        err instanceof Error ? err.message : 'Não foi possível enviar o comprovante.'
      );
    } finally {
      setUploadingReceipt(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pagamento da taxa PIX antes do agendamento"
    >
      <div className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[26px] bg-[#1c1c1e] border border-white/10 p-4 sm:p-5 pb-safe max-h-[94vh] overflow-y-auto shadow-2xl space-y-3">
        <div className="sm:hidden w-10 h-1 rounded-full bg-[#48484a] mx-auto -mt-0.5" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#30d158]/15 text-[#30d158] flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#f5f5f7]">
                Taxa de reserva via PIX
              </h2>
              <p className="text-xs text-[#aeaeb2]">
                Pague a taxa de {feePercentage}% para enviar seu agendamento para confirmação.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Fechar janela de pagamento PIX"
            className="h-9 w-9 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[#aeaeb2] hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount Breakdown */}
        <div className="rounded-2xl bg-[#141416] border border-white/[0.07] p-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] text-[#8e8e93]">Total serviços</div>
            <div className="text-sm font-semibold text-[#f5f5f7] tabular-nums mt-0.5">
              {formatCurrencyBR(totalPrice)}
            </div>
          </div>
          <div className="border-x border-white/[0.08] px-2">
            <div className="text-[11px] text-[#30d158] font-medium">Taxa PIX ({feePercentage}%)</div>
            <div className="text-base font-bold text-[#30d158] tabular-nums mt-0.5">
              {formatCurrencyBR(feeAmount)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#8e8e93]">Restante no local</div>
            <div className="text-sm font-semibold text-[#d1d1d6] tabular-nums mt-0.5">
              {formatCurrencyBR(remainingAmount)}
            </div>
          </div>
        </div>

        {/* QR Code on pure white quiet-zone card */}
        <div className="flex flex-col items-center gap-2.5">
          {qrDataUrl ? (
            <div className="bg-white p-2.5 rounded-2xl shadow-lg">
              <img
                src={qrDataUrl}
                alt={`QR Code PIX no valor de ${formatCurrencyBR(feeAmount)}`}
                className="w-40 h-40 sm:w-44 sm:h-44 object-contain"
              />
            </div>
          ) : (
            <div className="w-40 h-40 rounded-2xl bg-[#2c2c2e] flex items-center justify-center p-4 text-center text-xs text-[#ff6961]">
              {qrError || 'Gerando QR Code PIX...'}
            </div>
          )}

          <button
            type="button"
            disabled={!brCodePayload}
            onClick={() => void handleCopy(brCodePayload, 'code')}
            className="w-full min-h-[42px] px-4 rounded-2xl bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-[0.99] disabled:opacity-40 text-xs sm:text-sm font-semibold text-[#f5f5f7] inline-flex items-center justify-center gap-2 transition-all"
          >
            {copiedCode ? (
              <>
                <Check className="w-4 h-4 text-[#30d158]" />
                <span className="text-[#30d158]">Código PIX Copia e Cola copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#aeaeb2]" />
                <span>Copiar código PIX (Copia e Cola)</span>
              </>
            )}
          </button>
        </div>

        {/* Account Info */}
        <div className="rounded-2xl bg-[#2c2c2e]/55 border border-white/[0.06] divide-y divide-[#38383a]/70 text-xs">
          <div className="px-3.5 py-2 flex items-center justify-between gap-3">
            <span className="text-[#aeaeb2]">Banco</span>
            <span className="font-medium text-[#f5f5f7] text-right">
              {settings.pixBankName || '—'}
            </span>
          </div>
          <div className="px-3.5 py-2 flex items-center justify-between gap-3">
            <span className="text-[#aeaeb2]">Favorecido</span>
            <span className="font-medium text-[#f5f5f7] text-right">
              {settings.pixHolderName || settings.businessName}
            </span>
          </div>
          <div className="px-3.5 py-2 flex items-center justify-between gap-3">
            <span className="text-[#aeaeb2]">Chave ({PIX_KEY_TYPE_LABELS[keyType]})</span>
            <button
              type="button"
              onClick={() => void handleCopy(settings.pixKey || '', 'key')}
              className="inline-flex items-center gap-1.5 font-medium text-[#f5f5f7] hover:text-[#30d158] truncate max-w-[65%]"
            >
              <span className="truncate">{settings.pixKey}</span>
              {copiedKey ? (
                <Check className="w-3.5 h-3.5 text-[#30d158] shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-[#8e8e93] shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* Proof Options (Receipt Upload and/or WhatsApp) */}
        <div className="space-y-2.5">
          {showReceiptUpload && (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => void handleReceiptFileChange(e)}
                className="sr-only"
              />
              {uploadedReceipt ? (
                <div className="rounded-2xl bg-[#14291d] border border-[#30d158]/35 px-3.5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileCheck2 className="w-4 h-4 text-[#30d158] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#f5f5f7] truncate">
                        {uploadedReceipt.fileName}
                      </div>
                      <div className="text-[11px] text-[#86efac]">
                        Comprovante anexado com segurança
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingReceipt}
                    className="text-xs font-medium text-[#d1d1d6] hover:text-white shrink-0"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploadingReceipt}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[44px] px-4 rounded-2xl border border-dashed border-white/20 hover:border-[#8c1d0e] bg-[#141416] hover:bg-[#1a1a1d] text-xs sm:text-sm font-medium text-[#e5e5ea] inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-4 h-4 text-[#e07a68]" />
                  <span>
                    {uploadingReceipt
                      ? 'Enviando comprovante...'
                      : 'Anexar comprovante PIX (imagem ou PDF)'}
                  </span>
                </button>
              )}

              {receiptError && (
                <p role="alert" className="text-xs text-[#ff6961]">
                  {receiptError}
                </p>
              )}
            </div>
          )}

          {showWhatsappOption && whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] px-4 rounded-2xl bg-[#163a24] hover:bg-[#1c4b2e] border border-[#30d158]/30 text-sm font-semibold text-[#86efac] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Enviar comprovante pelo WhatsApp</span>
            </a>
          )}
        </div>

        {/* Primary Confirm CTA */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={submitting || uploadingReceipt}
            onClick={() => void onConfirmPaid(uploadedReceipt)}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#8c1d0e] hover:bg-[#a32210] active:scale-[0.99] disabled:opacity-50 text-white text-sm sm:text-base font-semibold transition-all shadow-lg shadow-[#8c1d0e]/25"
          >
            {submitting ? 'Enviando solicitação...' : 'Já paguei — Enviar solicitação'}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#8e8e93] text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-[#30d158] shrink-0" />
            <span>
              Seu horário ficará reservado enquanto o administrador confirma o pagamento.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
