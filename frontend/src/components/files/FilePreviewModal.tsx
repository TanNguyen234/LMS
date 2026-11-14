import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { downloadFile, getFileBlobUrl, getFileExtension, getFileMetadata } from '../../api/files';
import { ApiError } from '../../api/http';
import type { StoredFile } from '../../types';
import { formatFileSize } from '../../utils/formatters';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';

export interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId?: string | null;
  fileName?: string;
  mimeType?: string;
  externalUrl?: string | null;
  title?: string;
}

type PreviewKind = 'pdf' | 'video' | 'image' | 'csv' | 'markdown' | 'text' | 'download';

interface PreviewState {
  key: string;
  metadata: StoredFile | null;
  blobUrl: string | null;
  textContent: string | null;
  error: string | null;
}

const EMPTY_PREVIEW_STATE: PreviewState = {
  key: '',
  metadata: null,
  blobUrl: null,
  textContent: null,
  error: null,
};

function detectPreviewKind(mimeType?: string, fileName?: string): PreviewKind {
  const mime = (mimeType || '').toLowerCase();
  const ext = getFileExtension(fileName || '');

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('video/') || ext === 'mp4' || ext === 'webm') return 'video';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image';
  if (mime === 'text/csv' || ext === 'csv') return 'csv';
  if (mime === 'text/markdown' || ext === 'md') return 'markdown';
  if (mime.startsWith('text/') || ext === 'txt') return 'text';
  return 'download';
}

function parseCsvRows(raw: string, maxRows = 200): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }

    if (rows.length >= maxRows) {
      return { rows, truncated: i < raw.length - 1 };
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  return { rows, truncated: false };
}

function isSafeExternalUrl(raw?: string | null): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
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

function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: Array<{ kind: 'h1' | 'h2' | 'h3' | 'li' | 'code' | 'p'; content: string }> = [];
  let inCodeFence = false;
  let codeLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeFence) {
        blocks.push({ kind: 'code', content: codeLines.join('\n') });
        codeLines = [];
        inCodeFence = false;
      } else {
        inCodeFence = true;
      }
      continue;
    }
    if (inCodeFence) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ kind: 'h3', content: line.slice(4) });
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', content: line.slice(3) });
    } else if (line.startsWith('# ')) {
      blocks.push({ kind: 'h1', content: line.slice(2) });
    } else if (/^\s*[-*]\s+/.test(line)) {
      blocks.push({ kind: 'li', content: line.replace(/^\s*[-*]\s+/, '') });
    } else if (line.trim().length > 0) {
      blocks.push({ kind: 'p', content: line });
    }
  }
  if (inCodeFence && codeLines.length > 0) {
    blocks.push({ kind: 'code', content: codeLines.join('\n') });
  }

  return (
    <div className="max-h-[65vh] space-y-2.5 overflow-y-auto rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-5 text-sm leading-relaxed text-[var(--lms-text)]">
      {blocks.map((block, index) => {
        if (block.kind === 'h1') {
          return (
            <h3 key={index} className="text-xl font-bold text-[var(--lms-text)]">
              {block.content}
            </h3>
          );
        }
        if (block.kind === 'h2') {
          return (
            <h4 key={index} className="pt-2 text-lg font-semibold text-[var(--lms-text)]">
              {block.content}
            </h4>
          );
        }
        if (block.kind === 'h3') {
          return (
            <h5 key={index} className="pt-1 text-base font-semibold text-[var(--lms-text)]">
              {block.content}
            </h5>
          );
        }
        if (block.kind === 'li') {
          return (
            <div key={index} className="flex items-start gap-2 pl-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
              <span>{block.content}</span>
            </div>
          );
        }
        if (block.kind === 'code') {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-lg bg-[var(--lms-surface-muted)] p-3 font-mono text-xs text-[var(--lms-text)]"
            >
              {block.content}
            </pre>
          );
        }
        return <p key={index}>{block.content}</p>;
      })}
    </div>
  );
}

export function FilePreviewModal({
  isOpen,
  onClose,
  fileId,
  fileName,
  mimeType,
  externalUrl,
  title,
}: FilePreviewModalProps) {
  const revokeRef = useRef<(() => void) | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW_STATE);
  const [zoomState, setZoomState] = useState<{ key: string; percent: number }>({
    key: '',
    percent: 100,
  });

  const requestKey = isOpen && fileId ? `${fileId}:${reloadToken}` : '';
  const zoomPercent = zoomState.key === requestKey ? zoomState.percent : 100;

  useEffect(() => {
    if (!requestKey || !fileId) {
      return () => {
        revokeRef.current?.();
        revokeRef.current = null;
      };
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadPreview = async () => {
      try {
        const meta = await getFileMetadata(fileId);
        if (cancelled) return;

        const effectiveMime = meta.mimeType || mimeType;
        const effectiveName = meta.originalName || fileName;
        const kind = detectPreviewKind(effectiveMime, effectiveName);

        if (kind === 'download') {
          setPreview({
            key: requestKey,
            metadata: meta,
            blobUrl: null,
            textContent: null,
            error: null,
          });
          return;
        }

        const result = await getFileBlobUrl(fileId, { signal: controller.signal });
        if (cancelled) {
          result.revoke();
          return;
        }

        revokeRef.current?.();
        revokeRef.current = result.revoke;

        let rawText: string | null = null;
        if (kind === 'text' || kind === 'markdown' || kind === 'csv') {
          const textRes = await fetch(result.blobUrl, { signal: controller.signal });
          rawText = await textRes.text();
          if (cancelled) {
            return;
          }
        }

        setPreview({
          key: requestKey,
          metadata: meta,
          blobUrl: result.blobUrl,
          textContent: rawText,
          error: null,
        });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        const detail =
          err instanceof ApiError
            ? err.detail || 'Không thể tải nội dung tệp.'
            : err instanceof Error
              ? err.message || 'Không thể tải nội dung tệp.'
              : 'Không thể tải nội dung tệp.';
        setPreview({
          key: requestKey,
          metadata: null,
          blobUrl: null,
          textContent: null,
          error: detail,
        });
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
      controller.abort();
      revokeRef.current?.();
      revokeRef.current = null;
    };
  }, [requestKey, fileId, mimeType, fileName]);

  const activePreview = requestKey && preview.key === requestKey ? preview : EMPTY_PREVIEW_STATE;
  const isLoading = Boolean(requestKey) && preview.key !== requestKey;
  const activeError = downloadError || activePreview.error;
  const metadata = activePreview.metadata;
  const blobUrl = activePreview.blobUrl;
  const textContent = activePreview.textContent;

  const effectiveName = metadata?.originalName || fileName || 'Tài liệu đính kèm';
  const effectiveMime = metadata?.mimeType || mimeType || '';
  const previewKind = detectPreviewKind(effectiveMime, effectiveName);
  const safeExternalUrl = isSafeExternalUrl(externalUrl) ? externalUrl?.trim() || null : null;

  const csvParsed = useMemo(() => {
    if (previewKind !== 'csv' || textContent === null) return null;
    return parseCsvRows(textContent);
  }, [previewKind, textContent]);

  const updateZoom = (nextPercent: number) => {
    const clamped = Math.max(50, Math.min(200, nextPercent));
    setZoomState({ key: requestKey, percent: clamped });
  };

  const handleDownload = async () => {
    if (!fileId) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadFile(fileId, effectiveName);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.detail : 'Không thể tải xuống tệp.');
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = () => {
    setDownloadError(null);
    revokeRef.current?.();
    revokeRef.current = null;
    onClose();
  };

  const renderPreviewBody = () => {
    if (isLoading) {
      return (
        <div className="flex h-72 flex-col items-center justify-center gap-3 text-sm text-[var(--lms-text-muted)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span>Đang tải nội dung xem trước...</span>
        </div>
      );
    }

    if (activeError) {
      return (
        <ErrorBanner
          title="Không thể mở xem trước tệp"
          message={activeError}
          onRetry={() => {
            setDownloadError(null);
            setReloadToken((n) => n + 1);
          }}
        />
      );
    }

    if (!fileId && safeExternalUrl) {
      return (
        <div className="space-y-4">
          {previewKind === 'image' && (
            <div className="flex justify-center rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/30 p-4">
              <img
                src={safeExternalUrl}
                alt={effectiveName}
                className="max-h-[65vh] rounded-lg object-contain"
              />
            </div>
          )}
          {previewKind === 'video' && (
            <video
              controls
              playsInline
              preload="metadata"
              src={safeExternalUrl}
              className="max-h-[68vh] w-full rounded-xl bg-black"
            />
          )}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--lms-text)]">Tài liệu liên kết ngoài</p>
              <p className="truncate text-xs text-[var(--lms-text-muted)]">{safeExternalUrl}</p>
            </div>
            <a
              href={safeExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span>Mở liên kết</span>
            </a>
          </div>
        </div>
      );
    }

    if (previewKind === 'pdf' && blobUrl) {
      return (
        <div className="space-y-3">
          <object
            data={blobUrl}
            type="application/pdf"
            aria-label={effectiveName}
            className="h-[70vh] w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]"
          >
            <iframe
              title={effectiveName}
              src={blobUrl}
              sandbox="allow-same-origin"
              className="h-[70vh] w-full rounded-xl border-0"
            />
          </object>
        </div>
      );
    }

    if (previewKind === 'video' && blobUrl) {
      return (
        <div className="overflow-hidden rounded-xl border border-[var(--lms-border)] bg-black">
          <video
            controls
            playsInline
            preload="metadata"
            src={blobUrl}
            className="max-h-[70vh] w-full"
          />
        </div>
      );
    }

    if (previewKind === 'image' && blobUrl) {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => updateZoom(zoomPercent - 25)}
              aria-label="Thu nhỏ ảnh"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--lms-border)] px-2.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Thu nhỏ</span>
            </button>
            <span className="tabular-nums text-xs font-medium text-[var(--lms-text-muted)]">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => updateZoom(zoomPercent + 25)}
              aria-label="Phóng to ảnh"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--lms-border)] px-2.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Phóng to</span>
            </button>
            <button
              type="button"
              onClick={() => updateZoom(100)}
              aria-label="Đặt lại kích thước ảnh"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--lms-border)] px-2.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex max-h-[65vh] items-center justify-center overflow-auto rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/30 p-4">
            <img
              src={blobUrl}
              alt={effectiveName}
              style={{ width: `${zoomPercent}%`, maxWidth: 'none' }}
              className="rounded-lg object-contain transition-[width] duration-150"
            />
          </div>
        </div>
      );
    }

    if (previewKind === 'csv' && csvParsed) {
      const [headerRow, ...bodyRows] = csvParsed.rows;
      return (
        <div className="space-y-2">
          {csvParsed.truncated && (
            <p className="text-xs text-[var(--lms-text-muted)]">
              Đang hiển thị 200 dòng đầu tiên. Tải tệp về máy để xem toàn bộ bảng tính.
            </p>
          )}
          <div
            tabIndex={0}
            role="region"
            aria-label={`Bảng dữ liệu ${effectiveName}`}
            className="lms-table-region max-h-[65vh] overflow-auto rounded-xl border border-[var(--lms-border)]"
          >
            <table className="lms-responsive-table w-full border-collapse text-left text-sm">
              {headerRow && (
                <thead className="sticky top-0 bg-[var(--lms-surface-muted)] text-xs font-semibold uppercase text-[var(--lms-text-muted)]">
                  <tr>
                    {headerRow.map((col, idx) => (
                      <th key={idx} scope="col" className="border-b border-[var(--lms-border)] px-3 py-2">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-[var(--lms-border)] bg-[var(--lms-surface)]">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        data-label={headerRow?.[cIdx] || `Cột ${cIdx + 1}`}
                        className="px-3 py-2 text-[var(--lms-text)]"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (previewKind === 'markdown' && textContent !== null) {
      return <MarkdownPreview text={textContent} />;
    }

    if (previewKind === 'text' && textContent !== null) {
      return (
        <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/35 p-4 font-mono text-sm leading-relaxed text-[var(--lms-text)]">
          {textContent}
        </pre>
      );
    }

    return (
      <div className="space-y-4 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/30 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-blue-600 dark:text-blue-400">
          <FileArchive className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-[var(--lms-text)]">{effectiveName}</p>
          {metadata && (
            <p className="text-sm text-[var(--lms-text-muted)] tabular-nums">
              {formatFileSize(metadata.sizeBytes)} · {metadata.mimeType}
            </p>
          )}
          <p className="text-sm text-[var(--lms-text-muted)]">
            Định dạng tệp Office/lưu trữ được tải xuống trực tiếp để mở trên ứng dụng chuyên dụng.
          </p>
        </div>

        {metadata?.extractedTextPreview && (
          <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 text-left">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Trích đoạn nội dung tài liệu</span>
            </div>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--lms-text)]">
              {metadata.extractedTextPreview}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title || effectiveName}
      subtitle={metadata ? `${formatFileSize(metadata.sizeBytes)} · ${metadata.mimeType}` : undefined}
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--lms-text-muted)]">
            {fileId ? 'Tệp được bảo vệ và phân quyền từ kho lưu trữ LMS' : 'Tài nguyên tham khảo'}
          </div>
          <div className="flex items-center gap-2">
            {fileId && (
              <button
                type="button"
                disabled={downloading}
                onClick={() => void handleDownload()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>{downloading ? 'Đang tải...' : 'Tải xuống'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] transition-colors hover:bg-[var(--lms-surface-muted)]"
            >
              Đóng
            </button>
          </div>
        </div>
      }
    >
      {renderPreviewBody()}
    </Modal>
  );
}

export default FilePreviewModal;
