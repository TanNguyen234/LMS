import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { SkeletonTable } from './Skeleton';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
}

export interface DataTableSort {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  caption: string;
  hideCaption?: boolean;
  getRowKey?: (row: T, index: number) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: DataTableSort;
  className?: string;
}

function compareValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined
): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right), 'vi', { numeric: true, sensitivity: 'base' });
}

const ALIGN_CLASSES: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export function DataTable<T>({
  columns,
  data,
  caption,
  hideCaption = true,
  getRowKey,
  loading = false,
  skeletonRows = 5,
  emptyTitle = 'Chưa có dữ liệu',
  emptyDescription,
  emptyAction,
  onRowClick,
  initialSort,
  className = '',
}: DataTableProps<T>) {
  const captionId = useId();
  const [sort, setSort] = useState<DataTableSort | null>(initialSort ?? null);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const activeCol = columns.find((col) => col.key === sort.key && col.sortable && col.sortValue);
    if (!activeCol?.sortValue) return data;
    const extract = activeCol.sortValue;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => compareValues(extract(a), extract(b)) * factor);
  }, [columns, data, sort]);

  const toggleSort = (colKey: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== colKey) {
        return { key: colKey, direction: 'asc' };
      }
      return { key: colKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  if (loading) {
    return <SkeletonTable rows={skeletonRows} columns={Math.max(columns.length, 3)} className={className} />;
  }

  if (sortedData.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  return (
    <div
      tabIndex={0}
      role="region"
      aria-labelledby={captionId}
      className={`lms-table-region rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] ${className}`.trim()}
    >
      <table className="lms-responsive-table w-full border-collapse text-left text-sm">
        <caption
          id={captionId}
          className={
            hideCaption
              ? 'sr-only'
              : 'border-b border-[var(--lms-border)] px-4 py-3 text-left text-sm font-semibold text-[var(--lms-text)]'
          }
        >
          {caption}
        </caption>
        <thead className="border-b border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60">
          <tr>
            {columns.map((col) => {
              const isSorted = sort?.key === col.key;
              const alignClass = ALIGN_CLASSES[col.align ?? 'left'];
              const ariaSort = col.sortable
                ? isSorted
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined;

              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)] ${alignClass} ${col.headerClassName ?? ''}`.trim()}
                >
                  {col.sortable && col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1.5 rounded font-semibold text-inherit hover:text-[var(--lms-text)]"
                    >
                      <span>{col.header}</span>
                      {isSorted ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--lms-border)]">
          {sortedData.map((row, rowIndex) => {
            const key = getRowKey ? getRowKey(row, rowIndex) : String(rowIndex);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={
                  onRowClick
                    ? 'cursor-pointer transition-colors hover:bg-[var(--lms-surface-muted)]/50'
                    : 'transition-colors hover:bg-[var(--lms-surface-muted)]/30'
                }
              >
                {columns.map((col) => {
                  const alignClass = ALIGN_CLASSES[col.align ?? 'left'];
                  return (
                    <td
                      key={col.key}
                      data-label={col.header}
                      className={`px-4 py-3 text-[var(--lms-text)] ${alignClass} ${col.className ?? ''}`.trim()}
                    >
                      {col.render(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
