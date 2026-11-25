import type { BusinessSettings, DaySchedule } from '../types/booking';
import {
  clampWatermarkOpacity,
  normalizeHeaderLogoMode,
} from './branding';
import {
  clampPixFeePercentage,
  normalizePixKeyType,
  normalizePixProofMode,
  validatePixConfig,
} from './pix';
import { WEEKDAY_FULL_PT } from './schedule';

export type SettingsSubTab = 'pix' | 'appearance' | 'schedule' | 'general';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidTimeStr(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value.trim());
}

/**
 * Produces a Firestore-safe weekly schedule map with no `undefined` properties
 * (Firestore rejects `undefined` values inside nested maps).
 */
export function sanitizeWeeklySchedule(
  schedule: BusinessSettings['weeklySchedule'] | undefined
): Record<string, DaySchedule> {
  const result: Record<string, DaySchedule> = {};
  for (let i = 0; i < 7; i += 1) {
    const key = String(i);
    const raw = schedule?.[key];
    const open = Boolean(raw?.open);
    const start = isValidTimeStr(raw?.start) ? raw.start.trim() : '09:00';
    const end = isValidTimeStr(raw?.end) ? raw.end.trim() : '18:00';

    const day: DaySchedule = {
      open,
      start,
      end,
    };

    const breakStart = isValidTimeStr(raw?.breakStart) ? raw.breakStart.trim() : '';
    const breakEnd = isValidTimeStr(raw?.breakEnd) ? raw.breakEnd.trim() : '';
    if (breakStart && breakEnd && breakStart < breakEnd) {
      day.breakStart = breakStart;
      day.breakEnd = breakEnd;
    }

    result[key] = day;
  }
  return result;
}

export function sanitizeClosedDates(dates: string[] | undefined): string[] {
  if (!Array.isArray(dates)) return [];
  const unique = new Set<string>();
  for (const item of dates) {
    const trimmed = String(item || '').trim();
    if (DATE_PATTERN.test(trimmed)) {
      unique.add(trimmed);
    }
    if (unique.size >= 100) break;
  }
  return Array.from(unique).sort();
}

export type SettingsValidationResult =
  | { valid: true }
  | { valid: false; tab: SettingsSubTab; error: string };

export function validateSettingsDraft(draft: BusinessSettings): SettingsValidationResult {
  const businessName = (draft.businessName || '').trim();
  if (businessName.length < 2) {
    return {
      valid: false,
      tab: 'general',
      error: 'Informe o nome do estabelecimento (mínimo de 2 caracteres).',
    };
  }
  if (businessName.length > 80) {
    return {
      valid: false,
      tab: 'general',
      error: 'O nome do estabelecimento deve ter no máximo 80 caracteres.',
    };
  }

  const pixCheck = validatePixConfig({
    pixFeeEnabled: Boolean(draft.pixFeeEnabled),
    pixFeePercentage: draft.pixFeePercentage,
    pixKeyType: draft.pixKeyType,
    pixKey: draft.pixKey,
    pixBankName: draft.pixBankName,
    pixHolderName: draft.pixHolderName,
    pixCity: draft.pixCity,
    pixProofMode: draft.pixProofMode,
    pixWhatsappPhone: draft.pixWhatsappPhone,
    fallbackPhone: draft.phone,
  });
  if (!pixCheck.valid) {
    return {
      valid: false,
      tab: 'pix',
      error: pixCheck.error || 'Verifique os dados da cobrança PIX antes de salvar.',
    };
  }

  const interval = Math.round(Number(draft.slotIntervalMinutes));
  if (!Number.isFinite(interval) || interval < 10 || interval > 120) {
    return {
      valid: false,
      tab: 'schedule',
      error: 'Selecione um intervalo válido entre horários (10 a 120 minutos).',
    };
  }

  for (let i = 0; i < 7; i += 1) {
    const key = String(i);
    const day = draft.weeklySchedule?.[key];
    if (!day || !day.open) continue;

    const dayLabel = WEEKDAY_FULL_PT[i] || `Dia ${i}`;
    const start = (day.start || '').trim();
    const end = (day.end || '').trim();
    if (!isValidTimeStr(start) || !isValidTimeStr(end)) {
      return {
        valid: false,
        tab: 'schedule',
        error: `Informe horários válidos de abertura e fechamento para ${dayLabel}.`,
      };
    }
    if (start >= end) {
      return {
        valid: false,
        tab: 'schedule',
        error: `Em ${dayLabel}, o horário de fechamento deve ser posterior à abertura.`,
      };
    }

    const breakStart = (day.breakStart || '').trim();
    const breakEnd = (day.breakEnd || '').trim();
    if (Boolean(breakStart) !== Boolean(breakEnd)) {
      return {
        valid: false,
        tab: 'schedule',
        error: `Em ${dayLabel}, preencha início e fim da pausa ou deixe ambos vazios.`,
      };
    }
    if (breakStart && breakEnd) {
      if (!isValidTimeStr(breakStart) || !isValidTimeStr(breakEnd)) {
        return {
          valid: false,
          tab: 'schedule',
          error: `Horário de pausa inválido em ${dayLabel}.`,
        };
      }
      if (breakStart >= breakEnd || breakStart <= start || breakEnd >= end) {
        return {
          valid: false,
          tab: 'schedule',
          error: `Em ${dayLabel}, a pausa deve ficar dentro do horário de funcionamento.`,
        };
      }
    }
  }

  return { valid: true };
}

function normStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getChangedSubTabs(
  draft: BusinessSettings,
  saved: BusinessSettings
): SettingsSubTab[] {
  const changed: SettingsSubTab[] = [];

  const pixChanged =
    Boolean(draft.requireAdminConfirmation) !== Boolean(saved.requireAdminConfirmation) ||
    Boolean(draft.pixFeeEnabled) !== Boolean(saved.pixFeeEnabled) ||
    clampPixFeePercentage(draft.pixFeePercentage) !== clampPixFeePercentage(saved.pixFeePercentage) ||
    normalizePixKeyType(draft.pixKeyType) !== normalizePixKeyType(saved.pixKeyType) ||
    normStr(draft.pixKey) !== normStr(saved.pixKey) ||
    normStr(draft.pixBankName) !== normStr(saved.pixBankName) ||
    normStr(draft.pixHolderName) !== normStr(saved.pixHolderName) ||
    normStr(draft.pixCity || 'Sao Paulo') !== normStr(saved.pixCity || 'Sao Paulo') ||
    normalizePixProofMode(draft.pixProofMode) !== normalizePixProofMode(saved.pixProofMode) ||
    normStr(draft.pixWhatsappPhone) !== normStr(saved.pixWhatsappPhone);

  if (pixChanged) changed.push('pix');

  const appearanceChanged =
    normStr(draft.headerLogoKey) !== normStr(saved.headerLogoKey) ||
    normStr(draft.headerLogoUrl) !== normStr(saved.headerLogoUrl) ||
    normalizeHeaderLogoMode(draft.headerLogoMode) !== normalizeHeaderLogoMode(saved.headerLogoMode) ||
    clampWatermarkOpacity(draft.headerWatermarkOpacity) !==
      clampWatermarkOpacity(saved.headerWatermarkOpacity) ||
    normStr(draft.heroBannerKey) !== normStr(saved.heroBannerKey) ||
    normStr(draft.heroBannerUrl) !== normStr(saved.heroBannerUrl) ||
    normStr(draft.heroBannerSubtitle) !== normStr(saved.heroBannerSubtitle) ||
    normStr(draft.adminAvatarKey) !== normStr(saved.adminAvatarKey) ||
    normStr(draft.adminAvatarUrl) !== normStr(saved.adminAvatarUrl);

  if (appearanceChanged) changed.push('appearance');

  const scheduleChanged =
    Number(draft.slotIntervalMinutes) !== Number(saved.slotIntervalMinutes) ||
    JSON.stringify(sanitizeWeeklySchedule(draft.weeklySchedule)) !==
      JSON.stringify(sanitizeWeeklySchedule(saved.weeklySchedule)) ||
    JSON.stringify(sanitizeClosedDates(draft.closedDates)) !==
      JSON.stringify(sanitizeClosedDates(saved.closedDates));

  if (scheduleChanged) changed.push('schedule');

  const generalChanged =
    normStr(draft.businessName) !== normStr(saved.businessName) ||
    normStr(draft.phone) !== normStr(saved.phone) ||
    normStr(draft.address) !== normStr(saved.address);

  if (generalChanged) changed.push('general');

  return changed;
}

export function formatSettingsSaveError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  const lower = raw.toLowerCase();

  if (lower.includes('permission') || lower.includes('insufficient')) {
    return 'Sem permissão para salvar na nuvem. Confirme se você está logado com o e-mail de administrador e com o PIN desbloqueado.';
  }
  if (lower.includes('offline') || lower.includes('network') || lower.includes('unavailable')) {
    return 'Sem conexão com o servidor no momento. Verifique sua internet e tente salvar novamente.';
  }
  if (lower.includes('quota')) {
    return 'Limite diário do banco de dados atingido. Tente novamente mais tarde.';
  }
  return 'Não foi possível salvar as configurações agora. Revise os campos e tente novamente.';
}
