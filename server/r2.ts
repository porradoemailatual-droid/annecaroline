import crypto from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

export type R2AssetCategory =
  | 'branding'
  | 'services'
  | 'profiles'
  | 'banners'
  | 'gallery'
  | 'private';

export const R2_MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export interface R2Config {
  accessKeyId: string;
  secretAccessKey: string;
  accountId: string;
  bucketName: string;
  endpoint: string;
  region: string;
}

export interface R2ConfigStatus {
  configured: boolean;
  bucketName: string;
  region: string;
  missingVars: string[];
}

export function getR2Config(): R2Config {
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const bucketName = (process.env.R2_BUCKET_NAME || 'nexuschat-site-assets').trim();
  const region = (process.env.R2_REGION || 'auto').trim();
  const endpoint =
    (process.env.R2_ENDPOINT || '').trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  return {
    accessKeyId,
    secretAccessKey,
    accountId,
    bucketName,
    endpoint,
    region,
  };
}

export function getR2ConfigStatus(): R2ConfigStatus {
  const cfg = getR2Config();
  const missingVars: string[] = [];
  if (!cfg.accessKeyId) missingVars.push('R2_ACCESS_KEY_ID');
  if (!cfg.secretAccessKey) missingVars.push('R2_SECRET_ACCESS_KEY');
  if (!cfg.bucketName) missingVars.push('R2_BUCKET_NAME');
  if (!cfg.endpoint) missingVars.push('R2_ENDPOINT');

  return {
    configured: missingVars.length === 0,
    bucketName: cfg.bucketName,
    region: cfg.region,
    missingVars,
  };
}

let cachedClientKey = '';
let cachedClient: S3Client | null = null;

function getS3Client(): { client: S3Client; config: R2Config } {
  const config = getR2Config();
  const status = getR2ConfigStatus();
  if (!status.configured) {
    throw new Error(
      `Armazenamento R2 não configurado no servidor. Variáveis pendentes: ${status.missingVars.join(', ')}.`
    );
  }

  const fingerprint = `${config.endpoint}|${config.region}|${config.accessKeyId.slice(0, 6)}`;
  if (!cachedClient || cachedClientKey !== fingerprint) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedClientKey = fingerprint;
  }

  return { client: cachedClient, config };
}

export function isValidCategory(raw: unknown): raw is R2AssetCategory {
  return (
    raw === 'branding' ||
    raw === 'services' ||
    raw === 'profiles' ||
    raw === 'banners' ||
    raw === 'gallery' ||
    raw === 'private'
  );
}

export function isValidObjectKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length < 5 || key.length > 260) return false;
  if (key.includes('..') || key.includes('\\') || key.startsWith('/')) return false;
  return (
    /^(branding|services|profiles|banners|gallery)\/[a-zA-Z0-9._-]+$/.test(key) ||
    /^private\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9._-]+$/.test(key)
  );
}

export function isPubliclyProxiedCategoryKey(key: string): boolean {
  return (
    key.startsWith('branding/') ||
    key.startsWith('services/') ||
    key.startsWith('profiles/') ||
    key.startsWith('banners/') ||
    key.startsWith('gallery/')
  );
}

interface DetectedFileType {
  mimeType: string;
  extension: string;
}

export function detectFileTypeByMagicBytes(buffer: Buffer): DetectedFileType | null {
  if (buffer.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // ICO: 00 00 01 00
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    return { mimeType: 'image/x-icon', extension: 'ico' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  // PDF: %PDF-
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mimeType: 'application/pdf', extension: 'pdf' };
  }

  return null;
}

const ALLOWED_MIME_BY_CATEGORY: Record<R2AssetCategory, string[]> = {
  branding: ['image/png', 'image/x-icon'],
  services: ['image/png', 'image/jpeg', 'image/webp'],
  profiles: ['image/png', 'image/jpeg', 'image/webp'],
  banners: ['image/png', 'image/jpeg', 'image/webp'],
  gallery: ['image/png', 'image/jpeg', 'image/webp'],
  private: ['image/png', 'image/x-icon', 'image/jpeg', 'image/webp', 'application/pdf'],
};

export function sanitizeOriginalFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\s]/g, '').replace(/\s+/g, '-');
  return (cleaned || 'arquivo').slice(0, 120);
}

export function buildUniqueObjectKey(
  category: R2AssetCategory,
  uid: string,
  extension: string
): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'admin';
  const uniqueName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  if (category === 'private') {
    return `private/${safeUid}/${uniqueName}`;
  }
  return `${category}/${uniqueName}`;
}

export function validateUploadBuffer(
  buffer: Buffer,
  originalName: string,
  category: R2AssetCategory
):
  | { ok: true; mimeType: string; extension: string; safeFileName: string }
  | { ok: false; error: string } {
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: 'O arquivo enviado está vazio.' };
  }
  if (buffer.length > R2_MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'O arquivo ultrapassa o limite máximo de 5 MB.' };
  }

  const detected = detectFileTypeByMagicBytes(buffer);
  if (!detected) {
    return {
      ok: false,
      error: 'Formato não permitido. Envie apenas PNG, ICO, JPG, WebP ou PDF válidos.',
    };
  }

  const allowed = ALLOWED_MIME_BY_CATEGORY[category];
  if (!allowed.includes(detected.mimeType)) {
    const labelMap: Record<R2AssetCategory, string> = {
      branding: 'PNG ou ICO',
      services: 'PNG, JPG ou WebP',
      profiles: 'PNG, JPG ou WebP',
      banners: 'PNG, JPG ou WebP',
      gallery: 'PNG, JPG ou WebP',
      private: 'PNG, ICO, JPG, WebP ou PDF',
    };
    return {
      ok: false,
      error: `Para esta categoria, envie apenas arquivos ${labelMap[category]}.`,
    };
  }

  return {
    ok: true,
    mimeType: detected.mimeType,
    extension: detected.extension,
    safeFileName: sanitizeOriginalFileName(originalName),
  };
}

export async function checkR2Connection(): Promise<{
  connected: boolean;
  bucketName: string;
  region: string;
  error?: string;
}> {
  const status = getR2ConfigStatus();
  if (!status.configured) {
    return {
      connected: false,
      bucketName: status.bucketName,
      region: status.region,
      error: `Variáveis ausentes no ambiente do servidor: ${status.missingVars.join(', ')}`,
    };
  }

  try {
    const { client, config } = getS3Client();
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
    return {
      connected: true,
      bucketName: config.bucketName,
      region: config.region,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao conectar ao Cloudflare R2.';
    return {
      connected: false,
      bucketName: status.bucketName,
      region: status.region,
      error: message,
    };
  }
}

export async function uploadObjectToR2(params: {
  key: string;
  body: Buffer;
  contentType: string;
  originalFileName: string;
  uploadedByUid: string;
}): Promise<void> {
  const { client, config } = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: 'private, max-age=300',
      Metadata: {
        'original-name': params.originalFileName.slice(0, 120),
        'uploaded-by': params.uploadedByUid.slice(0, 64),
      },
    })
  );
}

export interface R2ListedObject {
  objectKey: string;
  sizeBytes: number;
  lastModified: string;
  category: R2AssetCategory;
  url: string;
}

export async function listR2Objects(category?: R2AssetCategory): Promise<R2ListedObject[]> {
  const { client, config } = getS3Client();
  const prefix = category ? `${category}/` : undefined;
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: prefix,
      MaxKeys: 200,
    })
  );

  const items = response.Contents || [];
  return items
    .filter((item): item is typeof item & { Key: string } => Boolean(item.Key && isValidObjectKey(item.Key)))
    .map((item) => {
      const cat: R2AssetCategory = item.Key.startsWith('branding/')
        ? 'branding'
        : item.Key.startsWith('services/')
        ? 'services'
        : item.Key.startsWith('profiles/')
        ? 'profiles'
        : item.Key.startsWith('banners/')
        ? 'banners'
        : item.Key.startsWith('gallery/')
        ? 'gallery'
        : 'private';
      return {
        objectKey: item.Key,
        sizeBytes: Number(item.Size || 0),
        lastModified: item.LastModified ? item.LastModified.toISOString() : new Date().toISOString(),
        category: cat,
        url: `/api/r2/file?key=${encodeURIComponent(item.Key)}`,
      };
    })
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export async function getR2ObjectStream(key: string): Promise<{
  body: Readable;
  contentType: string;
  contentLength?: number;
  etag?: string;
}> {
  const { client, config } = getS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );
  if (!response.Body) {
    throw new Error('Arquivo não encontrado no armazenamento.');
  }
  return {
    body: response.Body as Readable,
    contentType: response.ContentType || 'application/octet-stream',
    contentLength: response.ContentLength,
    etag: response.ETag,
  };
}

export async function deleteR2Object(key: string): Promise<void> {
  const { client, config } = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );
}

export async function generateTemporarySignedUrl(
  key: string,
  expiresInSeconds = 300
): Promise<{ signedUrl: string; expiresInSeconds: number }> {
  const clampedExpiry = Math.min(600, Math.max(60, Math.round(expiresInSeconds)));
  const { client, config } = getS3Client();
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });
  const signedUrl = await getSignedUrl(client, command, { expiresIn: clampedExpiry });
  return { signedUrl, expiresInSeconds: clampedExpiry };
}
