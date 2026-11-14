const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';
const TOKEN_STORAGE_KEY = 'lms_token';

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export class ApiError extends Error {
  status: number;
  detail: string;
  data: unknown;

  constructor(status: number, detail: string, data?: unknown) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.data = data;
  }
}

export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setAuthToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures in restricted contexts
  }
};

export const clearAuthToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted contexts
  }
};

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null): void => {
  unauthorizedHandler = handler;
};

export const resolveApiUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const base = API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath === base || normalizedPath.startsWith(`${base}/`)) {
    return normalizedPath;
  }
  return `${base}${normalizedPath}`;
};

const extractErrorMessage = (payload: unknown, fallbackStatus: number): string => {
  if (!payload || typeof payload !== 'object') {
    return `Lỗi yêu cầu HTTP ${fallbackStatus}`;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.detail === 'string' && record.detail.trim()) {
    return record.detail;
  }
  if (Array.isArray(record.detail) && record.detail.length > 0) {
    const messages = record.detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const msg = (item as Record<string, unknown>).msg;
          return typeof msg === 'string' ? msg : '';
        }
        return '';
      })
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join('; ');
    }
  }
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }
  return `Lỗi yêu cầu HTTP ${fallbackStatus}`;
};

export interface HttpRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  skipAuthRedirect?: boolean;
}

export async function httpRequest<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, skipAuth = false, skipAuthRedirect = false, ...rest } = options;

  const headers = new Headers(customHeaders);
  if (!skipAuth) {
    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let serializedBody: BodyInit | undefined;
  if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
    serializedBody = body;
  } else if (body !== undefined) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    serializedBody = JSON.stringify(body);
  }

  const response = await fetch(resolveApiUrl(path), {
    ...rest,
    headers,
    body: serializedBody,
  });

  if (response.status === 401 && !skipAuthRedirect) {
    clearAuthToken();
    unauthorizedHandler?.();
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : await response.text().catch(() => '');

  if (!response.ok) {
    const detail = isJson
      ? extractErrorMessage(data, response.status)
      : (typeof data === 'string' && data.trim()) || `Lỗi yêu cầu HTTP ${response.status}`;
    throw new ApiError(response.status, detail, data);
  }

  return data as T;
}

export const httpGet = <T>(path: string, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<T> =>
  httpRequest<T>(path, { ...options, method: 'GET' });

export const httpPost = <T>(
  path: string,
  body?: unknown,
  options?: Omit<HttpRequestOptions, 'method' | 'body'>,
): Promise<T> => httpRequest<T>(path, { ...options, method: 'POST', body });

export const httpPut = <T>(
  path: string,
  body?: unknown,
  options?: Omit<HttpRequestOptions, 'method' | 'body'>,
): Promise<T> => httpRequest<T>(path, { ...options, method: 'PUT', body });

export const httpPatch = <T>(
  path: string,
  body?: unknown,
  options?: Omit<HttpRequestOptions, 'method' | 'body'>,
): Promise<T> => httpRequest<T>(path, { ...options, method: 'PATCH', body });

export const httpDelete = <T>(path: string, options?: Omit<HttpRequestOptions, 'method'>): Promise<T> =>
  httpRequest<T>(path, { ...options, method: 'DELETE' });

export function httpUpload<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  options?: { signal?: AbortSignal; skipAuthRedirect?: boolean },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', resolveApiUrl(path));

    const token = getAuthToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      };
    }

    const abortListener = () => xhr.abort();
    if (options?.signal) {
      if (options.signal.aborted) {
        reject(new ApiError(0, 'Upload aborted'));
        return;
      }
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    const cleanup = () => {
      options?.signal?.removeEventListener('abort', abortListener);
    };

    xhr.onload = () => {
      cleanup();
      let parsed: unknown = null;
      const contentType = xhr.getResponseHeader('content-type') || '';
      if (contentType.includes('application/json') && xhr.responseText) {
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          parsed = xhr.responseText;
        }
      } else {
        parsed = xhr.responseText;
      }

      if (xhr.status === 401 && !options?.skipAuthRedirect) {
        clearAuthToken();
        unauthorizedHandler?.();
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as T);
      } else {
        reject(new ApiError(xhr.status, extractErrorMessage(parsed, xhr.status), parsed));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(0, 'Không thể kết nối tới máy chủ tải lên'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new ApiError(0, 'Đã hủy tải lên tệp'));
    };

    xhr.send(formData);
  });
}

export interface BlobUrlResult {
  blobUrl: string;
  mimeType: string;
  filename?: string;
  revoke: () => void;
}

export async function httpFetchBlobUrl(path: string, signal?: AbortSignal): Promise<BlobUrlResult> {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(path), {
    method: 'GET',
    headers,
    signal,
  });

  if (response.status === 401) {
    clearAuthToken();
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new ApiError(response.status, errText || `Không thể tải tệp (${response.status})`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)["']?/i.exec(disposition);
  return {
    blobUrl,
    mimeType: blob.type || response.headers.get('content-type') || 'application/octet-stream',
    filename: match ? decodeURIComponent(match[1]) : undefined,
    revoke: () => URL.revokeObjectURL(blobUrl),
  };
}
