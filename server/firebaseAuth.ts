import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, NextFunction } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(__dirname, '..', 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const FIREBASE_CONFIG = loadFirebaseConfig();
const BOOTSTRAPPED_ADMIN_EMAIL = 'porradoemailatual@gmail.com';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

interface AdminCacheEntry {
  isAdmin: boolean;
  expiresAt: number;
}

let certCache: CertCache | null = null;
const adminUidCache = new Map<string, AdminCacheEntry>();
const ADMIN_CACHE_TTL_MS = 2 * 60 * 1000;

export interface VerifiedAdminUser {
  uid: string;
  email: string;
  idToken: string;
}

export interface AuthenticatedRequest extends Request {
  adminUser?: VerifiedAdminUser;
}

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 3600;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 3600;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 60 ? parsed : 3600;
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) {
    return certCache.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error('Não foi possível obter os certificados públicos do Firebase Auth.');
  }
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = parseMaxAgeSeconds(res.headers.get('cache-control'));
  certCache = {
    certs,
    expiresAt: now + maxAge * 1000,
  };
  return certs;
}

function base64UrlDecodeToBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

function parseJwtSegment<T>(segment: string): T {
  return JSON.parse(base64UrlDecodeToBuffer(segment).toString('utf8')) as T;
}

interface FirebaseJwtHeader {
  alg?: string;
  kid?: string;
}

interface FirebaseJwtPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
}> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Token de autenticação inválido.');
  }

  const [headerSeg, payloadSeg, sigSeg] = parts;
  const header = parseJwtSegment<FirebaseJwtHeader>(headerSeg);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Algoritmo ou identificador de chave inválido.');
  }

  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Chave de assinatura do token não reconhecida.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerSeg}.${payloadSeg}`);
  verifier.end();

  const signatureBuf = base64UrlDecodeToBuffer(sigSeg);
  const signatureValid = verifier.verify(certPem, signatureBuf);
  if (!signatureValid) {
    throw new Error('Assinatura do token inválida.');
  }

  const payload = parseJwtSegment<FirebaseJwtPayload>(payloadSeg);
  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_CONFIG.projectId}`;

  if (payload.aud !== FIREBASE_CONFIG.projectId) {
    throw new Error('Audience do token incompatível com o projeto.');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Emissor do token inválido.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Identificador de usuário ausente no token.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Timestamp do token inválido.');
  }
  if (payload.email_verified !== true || !payload.email) {
    throw new Error('Conta Google sem e-mail verificado.');
  }

  return {
    uid: payload.sub,
    email: payload.email,
  };
}

async function checkIsActivatedAdmin(uid: string, email: string, idToken: string): Promise<boolean> {
  if (email === BOOTSTRAPPED_ADMIN_EMAIL) {
    return true;
  }

  const cached = adminUidCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isAdmin;
  }

  // Verify /admins/{uid} via Firestore REST API using the caller's own verified Firebase ID token.
  // Firestore rules allow verified owners to read their own /admins/{uid} document if and only if activated.
  const dbId = FIREBASE_CONFIG.firestoreDatabaseId || '(default)';
  const docUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_CONFIG.projectId)}` +
    `/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(uid)}`;

  try {
    const res = await fetch(docUrl, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    const isAdmin = res.ok;
    adminUidCache.set(uid, {
      isAdmin,
      expiresAt: Date.now() + ADMIN_CACHE_TTL_MS,
    });
    return isAdmin;
  } catch {
    return false;
  }
}

export function extractBearerFromHeader(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function authenticateAdminRequest(req: Request): Promise<VerifiedAdminUser | null> {
  const token = extractBearerFromHeader(req);
  if (!token) return null;

  try {
    const verified = await verifyFirebaseIdToken(token);
    const isAdmin = await checkIsActivatedAdmin(verified.uid, verified.email, token);
    if (!isAdmin) return null;
    return {
      uid: verified.uid,
      email: verified.email,
      idToken: token,
    };
  } catch {
    return null;
  }
}

export async function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const adminUser = await authenticateAdminRequest(req);
  if (!adminUser) {
    res.status(401).json({
      error: 'Acesso não autorizado. Faça login no Painel Administrativo.',
    });
    return;
  }
  req.adminUser = adminUser;
  next();
}
