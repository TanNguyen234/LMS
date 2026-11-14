import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  closeOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.setAttribute('closedby', closeOnBackdrop ? 'any' : 'closerequest');

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen, closeOnBackdrop]);

  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (!closeOnBackdrop) return;
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className={`m-auto w-[calc(100%-2rem)] ${SIZE_CLASSES[size]} rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-0 text-[var(--lms-text)] shadow-2xl animate-slideUp open:flex open:flex-col`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--lms-border)] px-6 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold leading-6 text-[var(--lms-text)]">
            {title}
          </h2>
          {subtitle && (
            <p id={subtitleId} className="mt-1 text-sm text-[var(--lms-text-muted)]">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng hộp thoại"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--lms-text-muted)] transition-colors hover:bg-[var(--lms-surface-muted)] hover:text-[var(--lms-text)]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 px-6 py-4">
          {footer}
        </div>
      )}
    </dialog>
  );
}

export default Modal;
