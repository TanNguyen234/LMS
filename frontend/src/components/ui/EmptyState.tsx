import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className = '',
}: EmptyStateProps) {
  const paddingClass = compact ? 'px-4 py-8' : 'px-6 py-12';
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--lms-border)] bg-[var(--lms-surface)]/60 text-center ${paddingClass} ${className}`.trim()}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] text-[var(--lms-text-muted)]">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold text-[var(--lms-text)]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-[var(--lms-text-muted)]">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
