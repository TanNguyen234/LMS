import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorBanner({
  title = 'Không thể tải dữ liệu',
  message,
  onRetry,
  retryLabel = 'Thử lại',
  className = '',
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100 sm:flex-row sm:items-center sm:justify-between ${className}`.trim()}
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <div className="min-w-0">
          {title && <p className="text-sm font-semibold">{title}</p>}
          <p className="text-sm text-red-800 dark:text-red-200/90 break-words">{message}</p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900/60 sm:self-center"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
}

export default ErrorBanner;
