import React from 'react';
import { CalendarClock, ChevronRight, ClipboardCheck, FileText, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CalendarEventItem } from '../../types';
import { formatDateTimeVi } from '../../utils/formatters';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';

const KIND_META: Record<
  CalendarEventItem['kind'],
  { label: string; variant: BadgeVariant; icon: React.ElementType }
> = {
  ASSIGNMENT: { label: 'Bài tập', variant: 'warning', icon: FileText },
  QUIZ: { label: 'Trắc nghiệm', variant: 'info', icon: ClipboardCheck },
  MEETING: { label: 'Phòng học', variant: 'success', icon: Video },
};

function isDueWithin24Hours(isoDate: string): boolean {
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return false;
  const diff = target - Date.now();
  return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
}

export interface DeadlineFeedProps {
  events: CalendarEventItem[];
  title?: string;
  emptyDescription?: string;
}

export const DeadlineFeed: React.FC<DeadlineFeedProps> = ({
  events,
  title = 'Lịch & Hạn nộp sắp tới',
  emptyDescription = 'Không có bài tập, kiểm tra hay buổi học nào trong 14 ngày tới.',
}) => {
  const sorted = [...events]
    .sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime())
    .slice(0, 8);

  return (
    <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--lms-text)]">{title}</h2>
        </div>
        <Link
          to="/schedule"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
        >
          Lịch đầy đủ
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="w-6 h-6" />}
          title="Chưa có lịch sắp tới"
          description={emptyDescription}
          className="py-6"
        />
      ) : (
        <div className="divide-y divide-[var(--lms-border)]">
          {sorted.map((ev) => {
            const meta = KIND_META[ev.kind] ?? KIND_META.ASSIGNMENT;
            const Icon = meta.icon;
            const urgent = isDueWithin24Hours(ev.endAt);
            return (
              <Link
                key={`${ev.kind}-${ev.id}`}
                to={ev.relatedUrl || `/courses/${ev.courseId}`}
                className="py-3 first:pt-1 last:pb-1 flex items-start gap-3 group hover:bg-[var(--lms-surface-muted)]/60 -mx-2 px-2 rounded-xl transition"
              >
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-[var(--lms-surface-muted)] text-[var(--lms-text-muted)] group-hover:text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Badge variant={meta.variant} size="sm">
                      {meta.label}
                    </Badge>
                    <span className="text-[11px] font-mono text-[var(--lms-text-muted)]">
                      {ev.courseCode}
                    </span>
                    {urgent && (
                      <Badge variant="danger" size="sm">
                        Sắp hết hạn
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-[var(--lms-text)] group-hover:text-[var(--color-primary)] truncate">
                    {ev.title}
                  </div>
                  <div className="text-xs text-[var(--lms-text-muted)] mt-0.5 tabular-nums">
                    {formatDateTimeVi(ev.endAt)} · {ev.courseTitle}
                  </div>
                </div>
                <ChevronRight
                  className="w-4 h-4 mt-2 text-[var(--lms-text-muted)] shrink-0"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
};
