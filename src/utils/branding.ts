import type { HeaderLogoMode } from '../types/booking';

export const HEADER_LOGO_URL_REGEX =
  /^$|^\/api\/r2\/file\?key=branding(%2F|\/)[a-zA-Z0-9._-]+$/;

export function isValidR2ProxyUrl(
  value: unknown,
  category: 'branding' | 'services' | 'profiles' | 'banners' | 'gallery'
): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (value.length > 400) return false;
  const pattern = new RegExp(`^\\/api\\/r2\\/file\\?key=${category}(%2F|\\/)[a-zA-Z0-9._-]+$`);
  return pattern.test(value);
}

export const WATERMARK_OPACITY_MIN = 6;
export const WATERMARK_OPACITY_MAX = 35;
export const DEFAULT_WATERMARK_OPACITY = 14;

export const WATERMARK_OPACITY_STEPS = [
  { value: 6, label: '6%', className: 'opacity-[0.06]' },
  { value: 10, label: '10%', className: 'opacity-[0.10]' },
  { value: 14, label: '14%', className: 'opacity-[0.14]' },
  { value: 18, label: '18%', className: 'opacity-[0.18]' },
  { value: 22, label: '22%', className: 'opacity-[0.22]' },
  { value: 26, label: '26%', className: 'opacity-[0.26]' },
  { value: 30, label: '30%', className: 'opacity-[0.30]' },
  { value: 35, label: '35%', className: 'opacity-[0.35]' },
] as const;

export function isValidHeaderLogoUrl(value: unknown): value is string {
  return isValidR2ProxyUrl(value, 'branding');
}

export function normalizeHeaderLogoMode(value: unknown): HeaderLogoMode {
  if (value === 'watermark' || value === 'both' || value === 'logo') {
    return value;
  }
  return 'logo';
}

export function clampWatermarkOpacity(value: unknown): number {
  const num = typeof value === 'number' ? Math.round(value) : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_WATERMARK_OPACITY;
  return Math.min(WATERMARK_OPACITY_MAX, Math.max(WATERMARK_OPACITY_MIN, num));
}

export function getWatermarkOpacityClass(opacity?: number): string {
  const clamped = clampWatermarkOpacity(opacity);
  let closest: (typeof WATERMARK_OPACITY_STEPS)[number] = WATERMARK_OPACITY_STEPS[2];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const step of WATERMARK_OPACITY_STEPS) {
    const diff = Math.abs(step.value - clamped);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = step;
    }
  }
  return closest.className;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function hasPngMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function hasIcoMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  );
}

export async function validateBrandingFileClient(
  file: File
): Promise<{ ok: true; format: 'PNG' | 'ICO' } | { ok: false; error: string }> {
  if (!file || file.size === 0) {
    return { ok: false, error: 'Selecione um arquivo PNG ou ICO válido.' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'O arquivo excede o limite de 5 MB.' };
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (hasPngMagicBytes(bytes)) {
    return { ok: true, format: 'PNG' };
  }
  if (hasIcoMagicBytes(bytes)) {
    return { ok: true, format: 'ICO' };
  }
  return {
    ok: false,
    error: 'Formato não suportado. Envie apenas arquivos .PNG ou .ICO válidos.',
  };
}

export function applyDocumentBranding(
  businessName: string,
  headerLogoUrl?: string,
  headerLogoMimeType?: string
): void {
  if (typeof document === 'undefined') return;
  const safeName = businessName.trim() || 'Agendamento';
  document.title = `${safeName} — Agendamento`;

  const existingDynamicIcons = document.querySelectorAll('link[data-dynamic-favicon="true"]');

  if (headerLogoUrl && isValidHeaderLogoUrl(headerLogoUrl) && headerLogoUrl.length > 0) {
    const isIco =
      headerLogoMimeType === 'image/x-icon' ||
      headerLogoMimeType === 'image/vnd.microsoft.icon' ||
      headerLogoUrl.toLowerCase().endsWith('.ico');
    const mimeType = isIco ? 'image/x-icon' : 'image/png';

    let iconLink = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"][data-dynamic-favicon="true"]'
    );
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      iconLink.setAttribute('data-dynamic-favicon', 'true');
      document.head.appendChild(iconLink);
    }
    iconLink.type = mimeType;
    iconLink.href = headerLogoUrl;

    let shortcutLink = document.querySelector<HTMLLinkElement>(
      'link[rel="shortcut icon"][data-dynamic-favicon="true"]'
    );
    if (!shortcutLink) {
      shortcutLink = document.createElement('link');
      shortcutLink.rel = 'shortcut icon';
      shortcutLink.setAttribute('data-dynamic-favicon', 'true');
      document.head.appendChild(shortcutLink);
    }
    shortcutLink.type = mimeType;
    shortcutLink.href = headerLogoUrl;
  } else {
    existingDynamicIcons.forEach((node) => node.remove());
  }
}
