import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  Eye,
  File as FileIcon,
  Link2,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  DEFAULT_MAX_FILE_SIZE_MB,
  FILE_INPUT_ACCEPT,
  uploadFile,
  validateUploadFile,
  type UploadFileScope,
} from '../../api/files';
import { ApiError } from '../../api/http';
import type { StoredFile } from '../../types';
import { formatFileSize } from '../../utils/formatters';

export interface FileDropzoneProps {
  courseId: string;
  scope: UploadFileScope;
  value?: StoredFile | null;
  fallbackUrl?: string;
  allowExternalUrl?: boolean;
  maxSizeMb?: number;
  accept?: string;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  onUploaded: (file: StoredFile) => void;
  onRemove?: () => void;
  onPreview?: (file: StoredFile) => void;
  onFallbackUrlChange?: (url: string) => void;
  onError?: (message: string) => void;
}

function isAllowedExternalUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (/^\/api\/files\//i.test(trimmed) && !trimmed.includes('..')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function FileDropzone({
  courseId,
  scope,
  value = null,
  fallbackUrl = '',
  allowExternalUrl = false,
  maxSizeMb = DEFAULT_MAX_FILE_SIZE_MB,
  accept = FILE_INPUT_ACCEPT,
  disabled = false,
  label = 'Tệp đính kèm',
  helperText,
  onUploaded,
  onRemove,
  onPreview,
  onFallbackUrlChange,
  onError,
}: FileDropzoneProps) {
  const inputId = useId();
  const urlInputId = useId();
  const errorId = useId();
  const urlErrorId = useId();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const reportError = (msg: string) => {
    setErrorMessage(msg);
    onError?.(msg);
  };

  const handleSelectedFile = async (file: File) => {
    if (disabled || isUploading) return;
    setErrorMessage(null);

    const validationError = validateUploadFile(file, maxSizeMb);
    if (validationError) {
      reportError(validationError);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsUploading(true);
    setProgress(0);
    setUploadingFileName(file.name);

    try {
      const stored = await uploadFile({
        file,
        scope,
        courseId,
        onProgress: (pct) => setProgress(pct),
        signal: controller.signal,
      });
      onUploaded(stored);
    } catch (err) {
      if (err instanceof ApiError) {
        reportError(err.detail || 'Tải tệp lên thất bại.');
      } else if (err instanceof Error) {
        reportError(err.message || 'Tải tệp lên thất bại.');
      } else {
        reportError('Tải tệp lên thất bại.');
      }
    } finally {
      abortRef.current = null;
      setIsUploading(false);
      setProgress(0);
      setUploadingFileName('');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleSelectedFile(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleSelectedFile(file);
    }
  };

  const handleCancelUpload = () => {
    abortRef.current?.abort();
  };

  const handleUrlBlur = () => {
    if (!isAllowedExternalUrl(fallbackUrl)) {
      setUrlError('Liên kết chỉ hỗ trợ định dạng http://, https:// hoặc /api/files/...');
    } else {
      setUrlError(null);
    }
  };

  const defaultHelper =
    helperText ||
    `Tối đa ${maxSizeMb} MB. Hỗ trợ PDF, PNG/JPG/WebP, MP4/WebM, DOCX/PPTX/XLSX, ZIP, TXT/MD/CSV.`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="block text-sm font-medium text-[var(--lms-text)]">
          {label}
        </label>
        <span className="text-xs text-[var(--lms-text-muted)]">Giới hạn {maxSizeMb} MB</span>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
            : 'border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/35 hover:border-blue-400'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled || isUploading}
          aria-describedby={errorMessage ? errorId : undefined}
          onChange={handleFileInputChange}
          className="sr-only"
        />

        {isUploading ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--lms-text)]">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" />
                <span className="truncate">Đang tải lên: {uploadingFileName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {progress}%
                </span>
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  aria-label="Hủy tải lên"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)] hover:text-red-600"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tiến trình tải tệp lên"
              className="h-2 w-full overflow-hidden rounded-full bg-[var(--lms-surface-muted)]"
            >
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-blue-600 dark:text-blue-400">
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--lms-text)]">
                Kéo thả tệp vào đây hoặc{' '}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => inputRef.current?.click()}
                  className="font-semibold text-blue-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-blue-400"
                >
                  chọn tệp từ máy
                </button>
              </p>
              <p className="text-xs text-[var(--lms-text-muted)]">{defaultHelper}</p>
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          id={errorId}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {value && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--lms-text)]">
                {value.originalName}
              </p>
              <p className="text-xs text-[var(--lms-text-muted)] tabular-nums">
                {formatFileSize(value.sizeBytes)} · {value.mimeType}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {onPreview && (
              <button
                type="button"
                onClick={() => onPreview(value)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--lms-border)] px-2.5 text-xs font-medium text-[var(--lms-text)] transition-colors hover:bg-[var(--lms-surface-muted)]"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Xem trước</span>
              </button>
            )}
            {onRemove && !disabled && (
              <button
                type="button"
                onClick={onRemove}
                aria-label="Gỡ tệp đính kèm"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--lms-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {allowExternalUrl && onFallbackUrlChange && (
        <div className="space-y-1.5 pt-1">
          <label
            htmlFor={urlInputId}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--lms-text-muted)]"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Hoặc nhập đường dẫn tài liệu ngoài (https://)</span>
          </label>
          <input
            id={urlInputId}
            type="url"
            value={fallbackUrl}
            disabled={disabled || isUploading}
            placeholder="https://example.edu.vn/tai-lieu.pdf"
            aria-invalid={Boolean(urlError)}
            aria-describedby={urlError ? urlErrorId : undefined}
            onChange={(e) => {
              if (urlError) setUrlError(null);
              onFallbackUrlChange(e.target.value);
            }}
            onBlur={handleUrlBlur}
            className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none"
          />
          {urlError && (
            <p id={urlErrorId} className="text-xs text-red-600 dark:text-red-400">
              {urlError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default FileDropzone;
