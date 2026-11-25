import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampWatermarkOpacity,
  formatBytes,
  getWatermarkOpacityClass,
  isValidHeaderLogoUrl,
  isValidR2ProxyUrl,
  normalizeHeaderLogoMode,
  validateBrandingFileClient,
} from './branding';

test('isValidHeaderLogoUrl and isValidR2ProxyUrl accept safe R2 proxy paths per category and reject external/script/private URLs', () => {
  assert.equal(isValidHeaderLogoUrl(''), true);
  assert.equal(isValidHeaderLogoUrl('/api/r2/file?key=branding/1732512000-abc.png'), true);
  assert.equal(isValidHeaderLogoUrl('/api/r2/file?key=branding%2F1732512000-abc.ico'), true);

  assert.equal(isValidR2ProxyUrl('/api/r2/file?key=profiles/1732512000-pro.webp', 'profiles'), true);
  assert.equal(isValidR2ProxyUrl('/api/r2/file?key=banners%2F1732512000-cover.jpg', 'banners'), true);
  assert.equal(isValidR2ProxyUrl('/api/r2/file?key=gallery/1732512000-work.png', 'gallery'), true);
  assert.equal(isValidR2ProxyUrl('/api/r2/file?key=services/1732512000-cut.jpg', 'services'), true);
  assert.equal(isValidR2ProxyUrl('/api/r2/file?key=gallery/1732512000-work.png', 'profiles'), false);

  // Reject path traversal, private keys, data URLs, and arbitrary external links
  assert.equal(isValidHeaderLogoUrl('/api/r2/file?key=private/uid/secret.png'), false);
  assert.equal(isValidR2ProxyUrl('/api/r2/file?key=private/uid/secret.png', 'profiles'), false);
  assert.equal(isValidHeaderLogoUrl('/api/r2/file?key=branding/../secret.png'), false);
  assert.equal(isValidR2ProxyUrl('/api/r2/file?key=profiles/../secret.png', 'profiles'), false);
  assert.equal(isValidHeaderLogoUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
  assert.equal(isValidHeaderLogoUrl('javascript:alert(1)'), false);
  assert.equal(isValidHeaderLogoUrl('https://evil.example/logo.png'), false);
});

test('normalizeHeaderLogoMode, watermark opacity, and formatBytes helpers enforce strict ranges', () => {
  assert.equal(normalizeHeaderLogoMode('logo'), 'logo');
  assert.equal(normalizeHeaderLogoMode('watermark'), 'watermark');
  assert.equal(normalizeHeaderLogoMode('both'), 'both');
  assert.equal(normalizeHeaderLogoMode('invalid'), 'logo');

  assert.equal(clampWatermarkOpacity(1), 6);
  assert.equal(clampWatermarkOpacity(99), 35);
  assert.equal(clampWatermarkOpacity(18), 18);
  assert.equal(getWatermarkOpacityClass(14), 'opacity-[0.14]');
  assert.equal(getWatermarkOpacityClass(35), 'opacity-[0.35]');

  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');
});

test('validateBrandingFileClient checks real PNG/ICO magic bytes and rejects disguised files', async () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const pngFile = new File([pngBytes], 'logo.png', { type: 'image/png' });
  const pngRes = await validateBrandingFileClient(pngFile);
  assert.equal(pngRes.ok, true);
  if (pngRes.ok) {
    assert.equal(pngRes.format, 'PNG');
  }

  const icoBytes = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);
  const icoFile = new File([icoBytes], 'favicon.ico', { type: 'image/x-icon' });
  const icoRes = await validateBrandingFileClient(icoFile);
  assert.equal(icoRes.ok, true);
  if (icoRes.ok) {
    assert.equal(icoRes.format, 'ICO');
  }

  // Disguised SVG renamed to .png must be rejected by magic bytes
  const fakePng = new File(['<svg onload="alert(1)"></svg>'], 'evil.png', { type: 'image/png' });
  const fakeRes = await validateBrandingFileClient(fakePng);
  assert.equal(fakeRes.ok, false);
});
