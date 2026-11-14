import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, 'message' | 'variant' | 'duration'>> {
  id: string;
  title?: string;
}

export interface ToastApi {
  showToast: (options: ToastOptions) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/90 dark:text-emerald-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800/70 dark:bg-red-950/90 dark:text-red-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/90 dark:text-amber-100',
  info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/90 dark:text-blue-100',
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />;
    case 'error':
      return <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />;
    default:
      return <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const showToast = useCallback(
    ({ title, message, variant = 'info', duration = 4000 }: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-4), { id, title, message, variant, duration }]);
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      showToast,
      success: (message, title) => showToast({ message, title, variant: 'success' }),
      error: (message, title) => showToast({ message, title, variant: 'error', duration: 6000 }),
      warning: (message, title) => showToast({ message, title, variant: 'warning', duration: 5000 }),
      info: (message, title) => showToast({ message, title, variant: 'info' }),
    }),
    [showToast],
  );

  const politeToasts = toasts.filter((t) => t.variant !== 'error');
  const assertiveToasts = toasts.filter((t) => t.variant === 'error');

  const renderItem = (item: ToastItem) => (
    <div
      key={item.id}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-slideUp ${VARIANT_STYLES[item.variant]}`}
    >
      <ToastIcon variant={item.variant} />
      <div className="min-w-0 flex-1 text-sm">
        {item.title && <p className="font-semibold leading-5">{item.title}</p>}
        <p className="leading-5">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Đóng thông báo"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-75 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        <div aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
          {politeToasts.map(renderItem)}
        </div>
        <div aria-live="assertive" aria-atomic="false" className="flex flex-col gap-2">
          {assertiveToasts.map(renderItem)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
};
