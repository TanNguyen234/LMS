import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const resolveAndClose = useCallback((result: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolver?.(result);
  }, []);

  const confirm = useCallback<ConfirmFn>((nextOptions) => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(nextOptions);
    });
  }, []);

  const isDanger = options?.variant === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        isOpen={Boolean(options)}
        onClose={() => resolveAndClose(false)}
        title={options?.title || 'Xác nhận thao tác'}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => resolveAndClose(false)}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] transition-colors hover:bg-[var(--lms-surface-muted)]"
            >
              {options?.cancelText || 'Hủy'}
            </button>
            <button
              type="button"
              onClick={() => resolveAndClose(true)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                isDanger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {options?.confirmText || 'Xác nhận'}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          {isDanger && (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <p className="text-sm leading-relaxed text-[var(--lms-text)]">{options?.message}</p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside ConfirmProvider');
  }
  return ctx;
};
