import { auth } from '../lib/firebase';
import type { R2AssetCategory } from '../types/booking';

export interface R2StatusResponse {
  configured: boolean;
  connected: boolean;
  bucketName: string;
  region: string;
  missingVars?: string[];
  error?: string;
}

export interface R2UploadedAssetPayload {
  objectKey: string;
  fileName: string;
  category: R2AssetCategory;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedByUid: string;
}

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Faça login no Painel Administrativo para realizar esta operação.');
  }
  const idToken = await user.getIdToken();
  return {
    Authorization: `Bearer ${idToken}`,
  };
}

export async function fetchR2Status(): Promise<R2StatusResponse> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch('/api/r2/status', { headers });
  const data = (await res.json().catch(() => ({}))) as R2StatusResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível verificar o status do Cloudflare R2.');
  }
  return data;
}

export async function uploadFileToR2(
  file: File,
  category: R2AssetCategory
): Promise<R2UploadedAssetPayload> {
  const headers = await getAdminAuthHeaders();
  const formData = new FormData();
  formData.append('category', category);
  formData.append('file', file);

  const res = await fetch('/api/r2/upload', {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    asset?: R2UploadedAssetPayload;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.asset) {
    throw new Error(data.error || 'Não foi possível enviar o arquivo para o Cloudflare R2.');
  }
  return data.asset;
}

export async function deleteFileFromR2(objectKey: string): Promise<void> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch(`/api/r2/file?key=${encodeURIComponent(objectKey)}`, {
    method: 'DELETE',
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Não foi possível excluir o arquivo no Cloudflare R2.');
  }
}

export async function requestTemporarySignedUrl(
  objectKey: string,
  expiresInSeconds = 300
): Promise<{ signedUrl: string; expiresInSeconds: number }> {
  const authHeaders = await getAdminAuthHeaders();
  const res = await fetch('/api/r2/signed-url', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ objectKey, expiresInSeconds }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    signedUrl?: string;
    expiresInSeconds?: number;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.signedUrl) {
    throw new Error(data.error || 'Não foi possível gerar a URL temporária.');
  }
  return {
    signedUrl: data.signedUrl,
    expiresInSeconds: data.expiresInSeconds || expiresInSeconds,
  };
}

export interface R2UploadedReceiptPayload {
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function uploadPixReceiptToR2(file: File): Promise<R2UploadedReceiptPayload> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/r2/upload-receipt', {
    method: 'POST',
    body: formData,
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    receipt?: R2UploadedReceiptPayload;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.receipt) {
    throw new Error(data.error || 'Não foi possível enviar o comprovante PIX.');
  }
  return data.receipt;
}

export async function fetchAuthenticatedPrivateFileBlobUrl(objectKey: string): Promise<string> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch(`/api/r2/file?key=${encodeURIComponent(objectKey)}`, {
    headers,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Não foi possível abrir o arquivo privado.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
