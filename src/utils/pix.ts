import type { BusinessSettings, PixKeyType, PixPaymentStatus, PixProofMode } from '../types/booking';
import { formatCurrencyBR, normalizePhoneDigits } from './schedule';

export const PIX_KEY_TYPE_OPTIONS: Array<{ id: PixKeyType; label: string; placeholder: string }> = [
  { id: 'phone', label: 'Celular', placeholder: '(19) 99999-9999' },
  { id: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { id: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
  { id: 'email', label: 'E-mail', placeholder: 'financeiro@seudominio.com' },
  { id: 'random', label: 'Chave aleatória', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
];

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  phone: 'Celular',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  random: 'Chave aleatória',
};

export const PIX_PROOF_MODE_OPTIONS: Array<{
  id: PixProofMode;
  label: string;
  hint: string;
}> = [
  {
    id: 'both',
    label: 'Comprovante ou WhatsApp',
    hint: 'Cliente pode anexar o comprovante aqui e/ou enviar aviso pelo WhatsApp.',
  },
  {
    id: 'receipt_and_confirm',
    label: 'Anexar comprovante no site',
    hint: 'Cliente anexa o comprovante e clica em "Já paguei" para análise no painel.',
  },
  {
    id: 'whatsapp',
    label: 'Confirmar pelo WhatsApp',
    hint: 'Cliente abre o WhatsApp do atendimento com resumo pronto e confirma a solicitação.',
  },
];

export const PIX_PERCENTAGE_PRESETS = [10, 20, 30, 50, 100] as const;

export function normalizePixKeyType(value: unknown): PixKeyType {
  if (
    value === 'cpf' ||
    value === 'cnpj' ||
    value === 'email' ||
    value === 'phone' ||
    value === 'random'
  ) {
    return value;
  }
  return 'phone';
}

export function normalizePixProofMode(value: unknown): PixProofMode {
  if (value === 'receipt_and_confirm' || value === 'whatsapp' || value === 'both') {
    return value;
  }
  return 'both';
}

export function normalizePixPaymentStatus(value: unknown): PixPaymentStatus {
  if (
    value === 'not_required' ||
    value === 'awaiting_verification' ||
    value === 'paid' ||
    value === 'rejected'
  ) {
    return value;
  }
  return 'not_required';
}

export function clampPixFeePercentage(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 30;
  return Math.min(100, Math.max(1, Math.round(num)));
}

export function calculatePixFee(
  totalPrice: number,
  percentage: number
): { feeAmount: number; remainingAmount: number } {
  const safeTotal = Math.max(0, Number.isFinite(totalPrice) ? totalPrice : 0);
  const safePct = Math.min(100, Math.max(0, Number.isFinite(percentage) ? percentage : 0));
  const rawFee = Math.round(safeTotal * safePct) / 100;
  const feeAmount = Math.min(safeTotal, Math.max(0, Number(rawFee.toFixed(2))));
  const remainingAmount = Math.max(0, Number((safeTotal - feeAmount).toFixed(2)));
  return { feeAmount, remainingAmount };
}

/**
 * Formats a user-entered PIX key into the exact string required inside EMVCo
 * Merchant Account Information tag 26 -> subtag 01 (Banco Central BR Code spec).
 */
export function formatPixKeyForBrCode(rawKey: string, keyType: PixKeyType): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';

  switch (keyType) {
    case 'cpf':
    case 'cnpj':
      return trimmed.replace(/\D/g, '');
    case 'phone': {
      const digits = trimmed.replace(/\D/g, '');
      if (!digits) return '';
      if (trimmed.startsWith('+')) {
        return `+${digits}`;
      }
      // Standard Brazilian mobile numbers (10-11 digits) get +55 country prefix
      if (digits.length === 10 || digits.length === 11) {
        return `+55${digits}`;
      }
      if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
        return `+${digits}`;
      }
      return `+${digits}`;
    }
    case 'email':
      return trimmed.toLowerCase();
    case 'random':
      return trimmed;
  }
}

export function validatePixConfig(input: {
  pixFeeEnabled?: boolean;
  pixFeePercentage?: number;
  pixKeyType?: PixKeyType;
  pixKey?: string;
  pixBankName?: string;
  pixHolderName?: string;
  pixCity?: string;
  pixProofMode?: PixProofMode;
  pixWhatsappPhone?: string;
  fallbackPhone?: string;
}): { valid: boolean; error?: string } {
  if (!input.pixFeeEnabled) {
    return { valid: true };
  }

  const pct = Number(input.pixFeePercentage);
  if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
    return { valid: false, error: 'Informe uma porcentagem da taxa PIX entre 1% e 100%.' };
  }

  const keyType = normalizePixKeyType(input.pixKeyType);
  const rawKey = (input.pixKey || '').trim();
  if (!rawKey) {
    return { valid: false, error: 'Informe a chave PIX para gerar o QR Code.' };
  }

  const normalizedKey = formatPixKeyForBrCode(rawKey, keyType);
  if (keyType === 'cpf' && normalizedKey.length !== 11) {
    return { valid: false, error: 'A chave CPF deve conter exatamente 11 dígitos.' };
  }
  if (keyType === 'cnpj' && normalizedKey.length !== 14) {
    return { valid: false, error: 'A chave CNPJ deve conter exatamente 14 dígitos.' };
  }
  if (keyType === 'phone') {
    const phoneDigits = normalizedKey.replace(/\D/g, '');
    if (phoneDigits.length < 12 || phoneDigits.length > 15) {
      return { valid: false, error: 'Informe um número de celular válido com DDD para a chave PIX.' };
    }
  }
  if (keyType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedKey)) {
    return { valid: false, error: 'Informe um e-mail válido para a chave PIX.' };
  }
  if (keyType === 'random' && (normalizedKey.length < 16 || normalizedKey.length > 77)) {
    return { valid: false, error: 'Informe uma chave aleatória PIX válida.' };
  }

  if (!(input.pixBankName || '').trim()) {
    return { valid: false, error: 'Informe o nome do banco da conta PIX.' };
  }

  const proofMode = normalizePixProofMode(input.pixProofMode);
  if (proofMode === 'whatsapp') {
    const whatsappDigits = normalizePhoneDigits(input.pixWhatsappPhone || input.fallbackPhone || '');
    if (whatsappDigits.length < 10) {
      return {
        valid: false,
        error: 'Informe o WhatsApp de atendimento para receber confirmações PIX.',
      };
    }
  }

  return { valid: true };
}

export function isPixFeeActive(settings: BusinessSettings | null | undefined): boolean {
  if (!settings || !settings.pixFeeEnabled) return false;
  const check = validatePixConfig({
    pixFeeEnabled: true,
    pixFeePercentage: settings.pixFeePercentage,
    pixKeyType: settings.pixKeyType,
    pixKey: settings.pixKey,
    pixBankName: settings.pixBankName,
    pixHolderName: settings.pixHolderName,
    pixCity: settings.pixCity,
    pixProofMode: settings.pixProofMode,
    pixWhatsappPhone: settings.pixWhatsappPhone,
    fallbackPhone: settings.phone,
  });
  return check.valid;
}

/**
 * Strips diacritics and non-ASCII characters per EMVCo BR Code specification.
 */
export function sanitizeEmvAscii(value: string, maxLength: number, fallback: string): string {
  const ascii = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-/&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const chosen = ascii || fallback;
  return chosen.slice(0, maxLength).trim() || fallback.slice(0, maxLength);
}

export function sanitizePixTxid(txid?: string): string {
  const cleaned = (txid || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 25);
  return cleaned || '***';
}

function formatEmvField(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * CRC16-CCITT (polynomial 0x1021, initial value 0xFFFF, no reflection, no final XOR)
 * Required by EMVCo / Banco Central do Brasil PIX BR Code specification (Tag 63).
 */
export function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface GeneratePixBrCodeInput {
  pixKey: string;
  pixKeyType: PixKeyType;
  merchantName: string;
  merchantCity?: string;
  amount: number;
  txid?: string;
  description?: string;
}

/**
 * Generates a valid Banco Central EMVCo PIX BR Code ("Copia e Cola" / QR Code payload).
 */
export function generatePixBrCodePayload(input: GeneratePixBrCodeInput): string {
  const normalizedKey = formatPixKeyForBrCode(input.pixKey, input.pixKeyType);
  if (!normalizedKey) {
    throw new Error('Chave PIX inválida para geração do QR Code.');
  }

  const merchantName = sanitizeEmvAscii(input.merchantName, 25, 'SALAO DE BELEZA');
  const merchantCity = sanitizeEmvAscii(input.merchantCity || 'Sao Paulo', 15, 'SAO PAULO');
  const txid = sanitizePixTxid(input.txid);

  // Tag 26: Merchant Account Information (GUI + Key + optional description)
  const guiField = formatEmvField('00', 'br.gov.bcb.pix');
  const keyField = formatEmvField('01', normalizedKey);

  let maiContent = `${guiField}${keyField}`;
  if (input.description) {
    // Keep total tag 26 length <= 99 chars per EMVCo spec
    const maxDescLen = Math.max(0, 99 - maiContent.length - 4);
    if (maxDescLen >= 4) {
      const cleanDesc = sanitizeEmvAscii(input.description, Math.min(40, maxDescLen), '');
      if (cleanDesc) {
        maiContent += formatEmvField('02', cleanDesc);
      }
    }
  }

  const parts: string[] = [
    formatEmvField('00', '01'), // Payload Format Indicator
    formatEmvField('26', maiContent), // Merchant Account Information (PIX)
    formatEmvField('52', '0000'), // Merchant Category Code
    formatEmvField('53', '986'), // Transaction Currency (BRL = 986)
  ];

  const numericAmount = Number(input.amount);
  if (Number.isFinite(numericAmount) && numericAmount > 0) {
    parts.push(formatEmvField('54', numericAmount.toFixed(2)));
  }

  parts.push(
    formatEmvField('58', 'BR'), // Country Code
    formatEmvField('59', merchantName), // Merchant Name (max 25)
    formatEmvField('60', merchantCity), // Merchant City (max 15)
    formatEmvField('62', formatEmvField('05', txid)) // Additional Data Field (TXID)
  );

  const payloadWithoutCrc = `${parts.join('')}6304`;
  const crc = computeCrc16Ccitt(payloadWithoutCrc);
  return `${payloadWithoutCrc}${crc}`;
}

export function buildPixWhatsappHref(input: {
  phone: string;
  businessName: string;
  clientName: string;
  serviceNames: string[];
  professionalName: string;
  dateBR: string;
  startTime: string;
  totalPrice: number;
  feeAmount: number;
  feePercentage: number;
}): string | null {
  let digits = normalizePhoneDigits(input.phone);
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  const lines = [
    `Olá! Acabei de realizar o pagamento da taxa PIX para confirmar meu agendamento em ${input.businessName}.`,
    '',
    `Cliente: ${input.clientName}`,
    `Serviços: ${input.serviceNames.join(', ')}`,
    `Profissional: ${input.professionalName}`,
    `Data e horário: ${input.dateBR} às ${input.startTime}`,
    `Valor total: ${formatCurrencyBR(input.totalPrice)}`,
    `Taxa PIX (${input.feePercentage}%): ${formatCurrencyBR(input.feeAmount)}`,
    '',
    'Segue o comprovante para confirmação do horário.',
  ];

  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`;
}
