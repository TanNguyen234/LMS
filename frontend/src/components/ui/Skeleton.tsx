export interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle';
  className?: string;
}

export function Skeleton({ variant = 'text', className = '' }: SkeletonProps) {
  const base = 'animate-pulse bg-[var(--lms-surface-muted)]';
  const shape =
    variant === 'circle'
      ? 'h-10 w-10 rounded-full'
      : variant === 'rect'
        ? 'h-24 w-full rounded-xl'
        : 'h-4 w-full rounded-md';

  return <div aria-hidden="true" className={`${base} ${shape} ${className}`.trim()} />;
}

export interface SkeletonCardProps {
  lines?: number;
  showHeader?: boolean;
  className?: string;
}

export function SkeletonCard({
  lines = 3,
  showHeader = true,
  className = '',
}: SkeletonCardProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-5 ${className}`.trim()}
    >
      <span className="sr-only">Đang tải nội dung...</span>
      {showHeader && (
        <div className="mb-4 flex items-center gap-3">
          <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      )}
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, idx) => (
          <Skeleton
            key={idx}
            className={idx === lines - 1 ? 'w-3/4' : 'w-full'}
          />
        ))}
      </div>
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className = '',
}: SkeletonTableProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`overflow-hidden rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] ${className}`.trim()}
    >
      <span className="sr-only">Đang tải bảng dữ liệu...</span>
      <div className="border-b border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 px-4 py-3">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, idx) => (
            <Skeleton key={idx} className="h-3.5 w-3/4" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-[var(--lms-border)]">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid gap-4 px-4 py-3.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, colIdx) => (
              <Skeleton
                key={colIdx}
                className={colIdx === 0 ? 'w-5/6' : colIdx === columns - 1 ? 'w-1/2' : 'w-2/3'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
