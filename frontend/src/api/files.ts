import type { FileScope, MessageResponse, StoredFile } from '../types';
import {
  httpDelete,
  httpFetchBlobUrl,
  httpGet,
  httpUpload,
  type BlobUrlResult,
} from './http';

export type UploadFileScope = Exclude<FileScope, 'SEED'>;

export const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'mp4',
  'webm',
  'txt',
  'md',
  'csv',
  'docx',
  'pptx',
  'xlsx',
  'zip',
] as const;

export const BLOCKED_FILE_EXTENSIONS = [
  'html',
  'htm',
  'xhtml',
  'svg',
  'svgz',
  'js',
  'mjs',
  'cjs',
  'exe',
  'dll',
  'msi',
  'ps1',
  'psm1',
  'bat',
  'cmd',
  'sh',
  'vbs',
  'php',
  'jsp',
  'asp',
  'aspx',
  'py',
] as const;

export const DEFAULT_MAX_FILE_SIZE_MB = 25;

export const FILE_INPUT_ACCEPT = ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');

const ALLOWED_EXTENSION_SET = new Set<string>(ALLOWED_FILE_EXTENSIONS);
const BLOCKED_EXTENSION_SET = new Set<string>(BLOCKED_FILE_EXTENSIONS);

export function getFileExtension(filename: string): string {
  const cleanName = filename.trim();
  const dotIdx = cleanName.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === cleanName.length - 1) {
    return '';
  }
  return cleanName.slice(dotIdx + 1).toLowerCase();
}

export function validateUploadFile(
  file: File,
  maxSizeMb: number = DEFAULT_MAX_FILE_SIZE_MB,
): string | null {
  if (!file || !file.name) {
    return 'Vui lòng chọn tệp hợp lệ.';
  }
  if (file.size <= 0) {
    return 'Tệp tải lên đang bị rỗng (0 byte).';
  }
  const maxBytes = Math.max(1, maxSizeMb) * 1024 * 1024;
  if (file.size > maxBytes) {
    return `Dung lượng tệp vượt quá giới hạn ${maxSizeMb} MB.`;
  }
  const ext = getFileExtension(file.name);
  if (!ext || BLOCKED_EXTENSION_SET.has(ext) || !ALLOWED_EXTENSION_SET.has(ext)) {
    return `Định dạng tệp "${ext ? `.${ext}` : 'không xác định'}" không được hỗ trợ hoặc bị chặn vì lý do bảo mật.`;
  }
  return null;
}

export interface UploadFileOptions {
  file: File;
  scope: UploadFileScope;
  courseId: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export async function uploadFile({
  file,
  scope,
  courseId,
  onProgress,
  signal,
}: UploadFileOptions): Promise<StoredFile> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('scope', scope);
  formData.append('courseId', courseId);
  return httpUpload<StoredFile>('/files/upload', formData, onProgress, { signal });
}

export async function getFileMetadata(fileId: string): Promise<StoredFile> {
  return httpGet<StoredFile>(`/files/${fileId}`);
}

export async function getFileBlobUrl(
  fileId: string,
  options?: { download?: boolean; signal?: AbortSignal },
): Promise<BlobUrlResult> {
  const query = options?.download ? '?download=1' : '';
  return httpFetchBlobUrl(`/files/${fileId}/content${query}`, options?.signal);
}

export async function downloadFile(fileId: string, fallbackName?: string): Promise<void> {
  const result = await getFileBlobUrl(fileId, { download: true });
  try {
    const anchor = document.createElement('a');
    anchor.href = result.blobUrl;
    anchor.download = result.filename || fallbackName || 'tai-lieu';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => result.revoke(), 1000);
  }
}

export async function deleteFile(fileId: string): Promise<MessageResponse> {
  return httpDelete<MessageResponse>(`/files/${fileId}`);
}
