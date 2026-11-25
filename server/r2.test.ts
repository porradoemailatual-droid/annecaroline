import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUniqueObjectKey,
  detectFileTypeByMagicBytes,
  isPubliclyProxiedCategoryKey,
  isValidObjectKey,
  sanitizeOriginalFileName,
  validateUploadBuffer,
} from './r2';

test('isValidObjectKey allows all site-wide R2 keys and rejects traversal or invalid paths', () => {
  assert.equal(isValidObjectKey('branding/1732512000-abc.png'), true);
  assert.equal(isValidObjectKey('services/1732512000-abc.webp'), true);
  assert.equal(isValidObjectKey('profiles/1732512000-avatar.jpg'), true);
  assert.equal(isValidObjectKey('banners/1732512000-cover.png'), true);
  assert.equal(isValidObjectKey('gallery/1732512000-work.webp'), true);
  assert.equal(isValidObjectKey('private/user_123/1732512000-doc.pdf'), true);

  assert.equal(isValidObjectKey('../etc/passwd'), false);
  assert.equal(isValidObjectKey('branding/../private/uid/a.png'), false);
  assert.equal(isValidObjectKey('/profiles/avatar.png'), false);
  assert.equal(isValidObjectKey('unknown/file.png'), false);
  assert.equal(isValidObjectKey('private/file-without-uid.png'), false);
});

test('isPubliclyProxiedCategoryKey permits only site media prefixes and blocks private prefix', () => {
  assert.equal(isPubliclyProxiedCategoryKey('branding/logo.png'), true);
  assert.equal(isPubliclyProxiedCategoryKey('services/foto.jpg'), true);
  assert.equal(isPubliclyProxiedCategoryKey('profiles/avatar.png'), true);
  assert.equal(isPubliclyProxiedCategoryKey('banners/capa.webp'), true);
  assert.equal(isPubliclyProxiedCategoryKey('gallery/trabalho.jpg'), true);
  assert.equal(isPubliclyProxiedCategoryKey('private/uid1/doc.pdf'), false);
});

test('detectFileTypeByMagicBytes and validateUploadBuffer enforce category allowlists and reject SVG/HTML', () => {
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const icoBuf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const webpBuf = Buffer.from('RIFF\x24\x00\x00\x00WEBP', 'binary');
  const pdfBuf = Buffer.from('%PDF-1.7\n', 'ascii');
  const svgBuf = Buffer.from('<svg onload="alert(1)"></svg>', 'utf8');

  assert.equal(detectFileTypeByMagicBytes(pngBuf)?.mimeType, 'image/png');
  assert.equal(detectFileTypeByMagicBytes(icoBuf)?.mimeType, 'image/x-icon');
  assert.equal(detectFileTypeByMagicBytes(jpgBuf)?.mimeType, 'image/jpeg');
  assert.equal(detectFileTypeByMagicBytes(webpBuf)?.mimeType, 'image/webp');
  assert.equal(detectFileTypeByMagicBytes(pdfBuf)?.mimeType, 'application/pdf');
  assert.equal(detectFileTypeByMagicBytes(svgBuf), null);

  assert.equal(validateUploadBuffer(pngBuf, 'logo.png', 'branding').ok, true);
  assert.equal(validateUploadBuffer(icoBuf, 'icon.ico', 'branding').ok, true);
  assert.equal(validateUploadBuffer(pdfBuf, 'doc.pdf', 'branding').ok, false);

  assert.equal(validateUploadBuffer(jpgBuf, 'corte.jpg', 'services').ok, true);
  assert.equal(validateUploadBuffer(pngBuf, 'avatar.png', 'profiles').ok, true);
  assert.equal(validateUploadBuffer(webpBuf, 'capa.webp', 'banners').ok, true);
  assert.equal(validateUploadBuffer(jpgBuf, 'unha.jpg', 'gallery').ok, true);
  assert.equal(validateUploadBuffer(pdfBuf, 'doc.pdf', 'profiles').ok, false);
  assert.equal(validateUploadBuffer(pdfBuf, 'doc.pdf', 'banners').ok, false);
  assert.equal(validateUploadBuffer(pdfBuf, 'doc.pdf', 'gallery').ok, false);

  assert.equal(validateUploadBuffer(pdfBuf, 'comprovante.pdf', 'private').ok, true);
  assert.equal(validateUploadBuffer(svgBuf, 'fake.png', 'private').ok, false);
});

test('buildUniqueObjectKey and sanitizeOriginalFileName produce safe unique keys', () => {
  const profileKey = buildUniqueObjectKey('profiles', 'user123', 'jpg');
  const bannerKey = buildUniqueObjectKey('banners', 'user123', 'webp');
  const galleryKey = buildUniqueObjectKey('gallery', 'user123', 'png');
  const privateKey = buildUniqueObjectKey('private', 'user_123', 'pdf');

  assert.equal(isValidObjectKey(profileKey), true);
  assert.equal(isValidObjectKey(bannerKey), true);
  assert.equal(isValidObjectKey(galleryKey), true);
  assert.equal(isValidObjectKey(privateKey), true);
  assert.ok(privateKey.startsWith('private/user_123/'));
  assert.equal(sanitizeOriginalFileName('../../minha foto (1).png'), 'minha-foto-1.png');
});
