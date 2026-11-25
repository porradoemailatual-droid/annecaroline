import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import {
  authenticateAdminRequest,
  requireAdminAuth,
  type AuthenticatedRequest,
} from './server/firebaseAuth.ts';
import {
  buildUniqueObjectKey,
  checkR2Connection,
  deleteR2Object,
  generateTemporarySignedUrl,
  getR2ConfigStatus,
  getR2ObjectStream,
  isPubliclyProxiedCategoryKey,
  isValidCategory,
  isValidObjectKey,
  listR2Objects,
  R2_MAX_UPLOAD_BYTES,
  uploadObjectToR2,
  validateUploadBuffer,
} from './server/r2.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Server-side scrypt verifier (overridden whenever process.env.ADMIN_PIN is configured)
const PIN_SALT = 'esmalteria-beleza-pin-v1';
const DEFAULT_PIN_HASH_HEX = 'e67f8aefa75dafdcf2b6f4bc59266b57ecad97c406e9d707abb11e627530d984';
// Server-only proof returned exclusively after PIN validation (its SHA-256 is verified by firestore.rules)
const ACTIVATION_PROOF = crypto
  .createHmac('sha256', PIN_SALT)
  .update(`admin-activation-proof:${DEFAULT_PIN_HASH_HEX}`)
  .digest('hex');

interface SessionRecord {
  expiresAt: number;
}

interface RateLimitRecord {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

interface ReceiptRateLimitRecord {
  count: number;
  windowStart: number;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_FAILED_ATTEMPTS = 5;
const RECEIPT_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RECEIPT_UPLOADS_PER_WINDOW = 10;
const ALLOWED_RECEIPT_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

const activeSessions = new Map<string, SessionRecord>();
const rateLimits = new Map<string, RateLimitRecord>();
const receiptUploadLimits = new Map<string, ReceiptRateLimitRecord>();

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: R2_MAX_UPLOAD_BYTES,
    files: 1,
  },
});

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [token, rec] of activeSessions.entries()) {
    if (rec.expiresAt <= now) {
      activeSessions.delete(token);
    }
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function verifyAdminPin(submittedPin: string): boolean {
  const submittedHash = crypto.scryptSync(submittedPin, PIN_SALT, 32);
  const configuredPin = process.env.ADMIN_PIN?.trim();
  const expectedHash = configuredPin
    ? crypto.scryptSync(configuredPin, PIN_SALT, 32)
    : Buffer.from(DEFAULT_PIN_HASH_HEX, 'hex');

  if (submittedHash.length !== expectedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(submittedHash, expectedHash);
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // --- Admin PIN Activation Routes ---
  app.post('/api/admin/verify-pin', (req: Request, res: Response) => {
    pruneExpiredSessions();

    const ip = getClientIp(req);
    const now = Date.now();
    const record = rateLimits.get(ip);

    if (record && record.lockedUntil > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: `Muitas tentativas incorretas. Aguarde ${retryAfterSeconds}s e tente novamente.`,
        retryAfterSeconds,
      });
      return;
    }

    const rawPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!/^[0-9]{6}$/.test(rawPin)) {
      res.status(400).json({ error: 'Informe um PIN numérico de 6 dígitos.' });
      return;
    }

    const isValid = verifyAdminPin(rawPin);
    if (!isValid) {
      const withinWindow = record && now - record.windowStart < RATE_WINDOW_MS;
      const nextFailures = withinWindow ? record.failures + 1 : 1;
      const nextLockedUntil = nextFailures >= MAX_FAILED_ATTEMPTS ? now + RATE_WINDOW_MS : 0;
      rateLimits.set(ip, {
        failures: nextFailures,
        windowStart: withinWindow ? record.windowStart : now,
        lockedUntil: nextLockedUntil,
      });

      if (nextLockedUntil > now) {
        res.setHeader('Retry-After', '60');
        res.status(429).json({
          error: 'Limite de tentativas excedido. Aguarde 60 segundos.',
          retryAfterSeconds: 60,
        });
        return;
      }

      res.status(401).json({
        error: 'PIN incorreto. Tente novamente.',
        remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - nextFailures),
      });
      return;
    }

    rateLimits.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + SESSION_TTL_MS;
    activeSessions.set(token, { expiresAt });

    res.json({
      unlocked: true,
      token,
      expiresAt,
      activationProof: ACTIVATION_PROOF,
    });
  });

  app.get('/api/admin/session', (req: Request, res: Response) => {
    pruneExpiredSessions();
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ unlocked: false });
      return;
    }
    const session = activeSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      activeSessions.delete(token);
      res.status(401).json({ unlocked: false });
      return;
    }
    res.json({ unlocked: true, expiresAt: session.expiresAt });
  });

  app.post('/api/admin/logout', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (token) {
      activeSessions.delete(token);
    }
    res.json({ ok: true });
  });

  // --- Cloudflare R2 Private Storage Proxy Routes ---
  app.get('/api/r2/status', requireAdminAuth, async (_req: AuthenticatedRequest, res: Response) => {
    const configStatus = getR2ConfigStatus();
    if (!configStatus.configured) {
      res.json({
        configured: false,
        connected: false,
        bucketName: configStatus.bucketName,
        region: configStatus.region,
        missingVars: configStatus.missingVars,
      });
      return;
    }

    const conn = await checkR2Connection();
    res.json({
      configured: true,
      connected: conn.connected,
      bucketName: conn.bucketName,
      region: conn.region,
      error: conn.error,
    });
  });

  app.post(
    '/api/r2/upload',
    requireAdminAuth,
    (req: AuthenticatedRequest, res: Response) => {
      uploadMiddleware.single('file')(req, res, async (multerErr: unknown) => {
        if (multerErr) {
          const isSizeErr =
            typeof multerErr === 'object' &&
            multerErr !== null &&
            'code' in multerErr &&
            (multerErr as { code?: string }).code === 'LIMIT_FILE_SIZE';
          res.status(400).json({
            error: isSizeErr
              ? 'O arquivo excede o limite máximo permitido de 5 MB.'
              : 'Não foi possível processar o arquivo enviado.',
          });
          return;
        }

        const file = req.file;
        const rawCategory = typeof req.body?.category === 'string' ? req.body.category.trim() : 'private';
        if (!isValidCategory(rawCategory)) {
          res.status(400).json({ error: 'Categoria de armazenamento inválida.' });
          return;
        }
        if (!file) {
          res.status(400).json({ error: 'Nenhum arquivo enviado.' });
          return;
        }

        const validation = validateUploadBuffer(file.buffer, file.originalname, rawCategory);
        if (!validation.ok) {
          res.status(400).json({ error: validation.error });
          return;
        }

        const status = getR2ConfigStatus();
        if (!status.configured) {
          res.status(503).json({
            error: `Credenciais do Cloudflare R2 não configuradas no servidor (${status.missingVars.join(', ')}).`,
          });
          return;
        }

        const uid = req.adminUser?.uid || 'admin';
        const objectKey = buildUniqueObjectKey(rawCategory, uid, validation.extension);

        try {
          await uploadObjectToR2({
            key: objectKey,
            body: file.buffer,
            contentType: validation.mimeType,
            originalFileName: validation.safeFileName,
            uploadedByUid: uid,
          });

          const proxyUrl = `/api/r2/file?key=${encodeURIComponent(objectKey)}`;
          res.status(201).json({
            ok: true,
            asset: {
              objectKey,
              fileName: validation.safeFileName,
              category: rawCategory,
              mimeType: validation.mimeType,
              sizeBytes: file.buffer.length,
              url: proxyUrl,
              uploadedByUid: uid,
            },
          });
        } catch (err) {
          console.error('R2 upload error:', err);
          res.status(502).json({
            error: 'Falha ao enviar arquivo para o Cloudflare R2. Verifique as credenciais e tente novamente.',
          });
        }
      });
    }
  );

  // Public rate-limited endpoint for clients attaching PIX payment receipts (stored strictly under private/receipts/, readable ONLY by authenticated admins)
  app.post('/api/r2/upload-receipt', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const rec = receiptUploadLimits.get(ip);
    if (rec && now - rec.windowStart < RECEIPT_RATE_WINDOW_MS) {
      if (rec.count >= MAX_RECEIPT_UPLOADS_PER_WINDOW) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((RECEIPT_RATE_WINDOW_MS - (now - rec.windowStart)) / 1000)
        );
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          error: 'Muitos envios de comprovante em pouco tempo. Aguarde alguns minutos e tente novamente.',
        });
        return;
      }
      receiptUploadLimits.set(ip, { count: rec.count + 1, windowStart: rec.windowStart });
    } else {
      receiptUploadLimits.set(ip, { count: 1, windowStart: now });
    }

    uploadMiddleware.single('file')(req, res, async (multerErr: unknown) => {
      if (multerErr) {
        const isSizeErr =
          typeof multerErr === 'object' &&
          multerErr !== null &&
          'code' in multerErr &&
          (multerErr as { code?: string }).code === 'LIMIT_FILE_SIZE';
        res.status(400).json({
          error: isSizeErr
            ? 'O comprovante excede o limite máximo de 5 MB.'
            : 'Não foi possível processar o comprovante enviado.',
        });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Selecione uma imagem ou PDF do comprovante.' });
        return;
      }

      const validation = validateUploadBuffer(file.buffer, file.originalname, 'private');
      if (!validation.ok || !ALLOWED_RECEIPT_MIMES.has(validation.mimeType)) {
        res.status(400).json({
          error: 'Formato inválido. Envie o comprovante em PNG, JPG, WebP ou PDF (até 5 MB).',
        });
        return;
      }

      const status = getR2ConfigStatus();
      if (!status.configured) {
        res.status(503).json({
          error: 'Armazenamento de comprovantes indisponível no momento. Você ainda pode confirmar sem anexo ou via WhatsApp.',
        });
        return;
      }

      const objectKey = buildUniqueObjectKey('private', 'receipts', validation.extension);

      try {
        await uploadObjectToR2({
          key: objectKey,
          body: file.buffer,
          contentType: validation.mimeType,
          originalFileName: validation.safeFileName,
          uploadedByUid: 'guest-receipt',
        });

        res.status(201).json({
          ok: true,
          receipt: {
            objectKey,
            fileName: validation.safeFileName,
            mimeType: validation.mimeType,
            sizeBytes: file.buffer.length,
          },
        });
      } catch (err) {
        console.error('R2 receipt upload error:', err);
        res.status(502).json({
          error: 'Falha ao salvar o comprovante no servidor. Tente novamente ou envie pelo WhatsApp.',
        });
      }
    });
  });

  app.get('/api/r2/files', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
    const rawCat = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const category = rawCat && isValidCategory(rawCat) ? rawCat : undefined;
    try {
      const files = await listR2Objects(category);
      res.json({ ok: true, files });
    } catch (err) {
      console.error('R2 list error:', err);
      res.status(502).json({ error: 'Não foi possível consultar os arquivos no Cloudflare R2.' });
    }
  });

  app.get('/api/r2/file', async (req: Request, res: Response) => {
    const rawKey = typeof req.query.key === 'string' ? req.query.key.trim() : '';
    if (!isValidObjectKey(rawKey)) {
      res.status(400).json({ error: 'Chave de arquivo inválida.' });
      return;
    }

    // Site visual assets (branding/ and services/) are streamed securely through this backend proxy
    // while keeping the R2 bucket 100% private. Private admin files strictly require admin auth.
    if (!isPubliclyProxiedCategoryKey(rawKey)) {
      const adminUser = await authenticateAdminRequest(req);
      if (!adminUser) {
        res.status(401).json({ error: 'Autenticação administrativa necessária para acessar este arquivo privado.' });
        return;
      }
    }

    try {
      const obj = await getR2ObjectStream(rawKey);
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Cache-Control',
        isPubliclyProxiedCategoryKey(rawKey)
          ? 'private, max-age=300'
          : 'no-store, private'
      );
      if (obj.contentLength !== undefined) {
        res.setHeader('Content-Length', String(obj.contentLength));
      }
      if (obj.etag) {
        res.setHeader('ETag', obj.etag);
      }

      obj.body.on('error', (streamErr) => {
        console.error('R2 stream error:', streamErr);
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      obj.body.pipe(res);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'name' in err
          ? String((err as { name?: string }).name)
          : '';
      if (code === 'NoSuchKey' || code === 'NotFound') {
        res.status(404).json({ error: 'Arquivo não encontrado.' });
        return;
      }
      console.error('R2 get error:', err);
      res.status(502).json({ error: 'Não foi possível recuperar o arquivo do Cloudflare R2.' });
    }
  });

  app.post('/api/r2/signed-url', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
    const objectKey = typeof req.body?.objectKey === 'string' ? req.body.objectKey.trim() : '';
    const expiresInSeconds =
      typeof req.body?.expiresInSeconds === 'number' ? req.body.expiresInSeconds : 300;
    if (!isValidObjectKey(objectKey)) {
      res.status(400).json({ error: 'Chave de objeto inválida.' });
      return;
    }

    try {
      const result = await generateTemporarySignedUrl(objectKey, expiresInSeconds);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('R2 signed URL error:', err);
      res.status(502).json({ error: 'Não foi possível gerar a URL temporária.' });
    }
  });

  app.delete('/api/r2/file', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
    const rawKey =
      typeof req.query.key === 'string'
        ? req.query.key.trim()
        : typeof req.body?.objectKey === 'string'
        ? req.body.objectKey.trim()
        : '';
    if (!isValidObjectKey(rawKey)) {
      res.status(400).json({ error: 'Chave de objeto inválida.' });
      return;
    }

    try {
      await deleteR2Object(rawKey);
      res.json({ ok: true, deletedKey: rawKey });
    } catch (err) {
      console.error('R2 delete error:', err);
      res.status(502).json({ error: 'Não foi possível excluir o arquivo no Cloudflare R2.' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
