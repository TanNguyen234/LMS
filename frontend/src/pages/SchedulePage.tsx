import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Printer,
  Video,
  FileText,
  CheckSquare,
} from 'lucide-react';
import { learningApi } from '../api/learning';
import { printSection } from '../utils/exportUtils';
import { formatDateTimeVi } from '../utils/formatters';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import type { CalendarEventItem, Course } from '../types';

type EventKindFilter = 'ALL' | 'ASSIGNMENT' | 'QUIZ' | 'MEETING';
type ScheduleViewMode = 'week' | 'list';

function startOfWeekMonday(baseDate: Date): Date {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WEEKDAY_LABELS = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ nhật',
];

function getKindMeta(kind: CalendarEventItem['kind']): {
  label: string;
  variant: BadgeVariant;
  icon: React.ReactNode;
} {
  switch (kind) {
    case 'ASSIGNMENT':
      return {
        label: 'Bài tập',
        variant: 'primary',
        icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'QUIZ':
      return {
        label: 'Kiểm tra',
        variant: 'warning',
        icon: <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'MEETING':
      return {
        label: 'Phòng học',
        variant: 'info',
        icon: <Video className="w-3.5 h-3.5" aria-hidden="true" />,
      };
  }
}

function getStatusBadge(ev: CalendarEventItem): { label: string; variant: BadgeVariant } {
  const now = Date.now();
  const endMs = new Date(ev.endAt).getTime();
  const startMs = ev.startAt ? new Date(ev.startAt).getTime() : null;
  if (ev.kind === 'MEETING' && ev.status === 'LIVE') {
    return { label: 'Đang diễn ra', variant: 'success' };
  }
  if (ev.status === 'CLOSED' || ev.status === 'ENDED') {
    return { label: 'Đã đóng', variant: 'neutral' };
  }
  if (endMs < now) {
    return { label: 'Quá hạn', variant: 'danger' };
  }
  if (startMs && startMs > now) {
    return { label: 'Sắp mở', variant: 'info' };
  }
  return { label: 'Đang mở', variant: 'success' };
}

export const SchedulePage: React.FC = () => {
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [kindFilter, setKindFilter] = useState<EventKindFilter>('ALL');
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [calendarRows, courseRows] = await Promise.all([
        learningApi.getDashboardCalendar(
          selectedCourseId !== 'ALL' ? { courseId: selectedCourseId } : undefined,
        ),
        learningApi.getCourses(),
      ]);
      setEvents(calendarRows);
      setCourses(courseRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải lịch học tập trung');
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        return loadSchedule();
      }
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [loadSchedule]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => (kindFilter === 'ALL' ? true : ev.kind === kindFilter));
  }, [events, kindFilter]);

  const [today] = useState(() => new Date());

  const currentMonday = useMemo(() => {
    const base = startOfWeekMonday(today);
    return addDays(base, weekOffset * 7);
  }, [today, weekOffset]);

  const weekDays = useMemo(
    () => WEEKDAY_LABELS.map((label, idx) => ({ label, date: addDays(currentMonday, idx) })),
    [currentMonday],
  );

  const eventsForDay = useCallback(
    (dayDate: Date) =>
      filteredEvents.filter((ev) => {
        const anchor = ev.kind === 'MEETING' && ev.startAt ? new Date(ev.startAt) : new Date(ev.endAt);
        return sameLocalDay(anchor, dayDate);
      }),
    [filteredEvents],
  );

  const columns: DataTableColumn<CalendarEventItem>[] = [
    {
      key: 'kind',
      header: 'Loại',
      sortable: true,
      sortValue: (row) => row.kind,
      render: (row) => {
        const meta = getKindMeta(row.kind);
        return (
          <Badge variant={meta.variant}>
            {meta.icon}
            <span>{meta.label}</span>
          </Badge>
        );
      },
    },
    {
      key: 'title',
      header: 'Hoạt động',
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => (
        <div>
          <Link
            to={row.relatedUrl}
            className="font-semibold text-[var(--lms-text)] hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-2 hover:underline"
          >
            {row.title}
          </Link>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Học phần',
      sortable: true,
      sortValue: (row) => row.courseCode,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--lms-text)]">
          <BookOpen className="w-3.5 h-3.5 text-[var(--lms-text-muted)]" aria-hidden="true" />
          <span className="font-medium">{row.courseCode}</span>
          <span className="text-[var(--lms-text-muted)] truncate max-w-[14rem]">{row.courseTitle}</span>
        </span>
      ),
    },
    {
      key: 'endAt',
      header: 'Thời hạn / Thời gian',
      sortable: true,
      sortValue: (row) => new Date(row.endAt).getTime(),
      render: (row) => (
        <div className="text-sm tabular-nums text-[var(--lms-text)]">
          {row.startAt && (
            <div className="text-xs text-[var(--lms-text-muted)]">
              Bắt đầu: {formatDateTimeVi(row.startAt)}
            </div>
          )}
          <div>
            {row.kind === 'ASSIGNMENT' ? 'Hạn nộp: ' : row.kind === 'QUIZ' ? 'Đóng bài: ' : 'Kết thúc: '}
            {formatDateTimeVi(row.endAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => {
        const st = getStatusBadge(row);
        return <Badge variant={st.variant}>{st.label}</Badge>;
      },
    },
    {
      key: 'action',
      header: 'Chi tiết',
      align: 'right',
      render: (row) => (
        <Link
          to={row.relatedUrl}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Mở ngay
        </Link>
      ),
    },
  ];

  const weekRangeLabel = `${weekDays[0].date.toLocaleDateString('vi-VN')} - ${weekDays[6].date.toLocaleDateString('vi-VN')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--lms-text)] flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span>Lịch học &amp; Thời hạn tập trung</span>
          </h1>
          <p className="text-sm text-[var(--lms-text-muted)] mt-1">
            Theo dõi đồng bộ hạn nộp bài tập, khung giờ bài kiểm tra và lịch phòng học trực tuyến.
          </p>
        </div>

        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => printSection('Lich_Hoc_Tap_Trung')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>In lịch</span>
          </button>
        </div>
      </div>

      {/* Filters & View Switcher */}
      <div className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-xl p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div>
            <label
              htmlFor="schedule-course-filter"
              className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1"
            >
              Lọc theo khóa học
            </label>
            <select
              id="schedule-course-filter"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Tất cả khóa học</option>
              {courses.map((c) => {
                const cid = c.courseId ?? c.id;
                const ccode = c.courseCode ?? c.code;
                return (
                  <option key={cid} value={cid}>
                    {ccode} - {c.title}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label
              htmlFor="schedule-kind-filter"
              className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1"
            >
              Loại sự kiện
            </label>
            <select
              id="schedule-kind-filter"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as EventKindFilter)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Tất cả hoạt động</option>
              <option value="ASSIGNMENT">Bài tập về nhà</option>
              <option value="QUIZ">Bài kiểm tra / Quiz</option>
              <option value="MEETING">Phòng học trực tuyến</option>
            </select>
          </div>
        </div>

        <Tabs
          idPrefix="schedule-view"
          ariaLabel="Chế độ xem lịch"
          activeId={viewMode}
          onChange={(id) => setViewMode(id as ScheduleViewMode)}
          items={[
            { id: 'week', label: 'Lịch theo tuần' },
            { id: 'list', label: 'Danh sách thời hạn', badge: filteredEvents.length },
          ]}
        />
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadSchedule()} />}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : (
        <>
          <TabPanel id="week" activeId={viewMode} idPrefix="schedule-view">
            <div className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--lms-text)] tabular-nums">
                  Tuần: {weekRangeLabel}
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => setWeekOffset((prev) => prev - 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Tuần trước</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                  >
                    Tuần này
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((prev) => prev + 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                  >
                    <span>Tuần sau</span>
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
                {weekDays.map(({ label, date }) => {
                  const isToday = sameLocalDay(date, today);
                  const dayEvents = eventsForDay(date);
                  return (
                    <section
                      key={date.toISOString()}
                      aria-label={`${label} ngày ${date.toLocaleDateString('vi-VN')}`}
                      className={`rounded-xl border p-3 min-h-[11rem] flex flex-col gap-2 ${
                        isToday
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                          : 'border-[var(--lms-border)] bg-[var(--lms-surface-muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-[var(--lms-border)] pb-2">
                        <span className="text-xs font-semibold text-[var(--lms-text)]">{label}</span>
                        <span
                          className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${
                            isToday
                              ? 'bg-indigo-600 text-white'
                              : 'text-[var(--lms-text-muted)]'
                          }`}
                        >
                          {date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>

                      {dayEvents.length === 0 ? (
                        <p className="text-xs text-[var(--lms-text-muted)] my-auto text-center py-4">
                          Không có lịch
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {dayEvents.map((ev) => {
                            const meta = getKindMeta(ev.kind);
                            const st = getStatusBadge(ev);
                            const anchor = ev.kind === 'MEETING' && ev.startAt ? ev.startAt : ev.endAt;
                            const timeStr = new Date(anchor).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            return (
                              <li key={`${ev.kind}-${ev.id}`}>
                                <Link
                                  to={ev.relatedUrl}
                                  className="block rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] p-2.5 hover:border-indigo-500 transition-colors space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <Badge variant={meta.variant} size="sm">
                                      {meta.label}
                                    </Badge>
                                    <span className="text-[11px] font-medium tabular-nums text-[var(--lms-text-muted)] flex items-center gap-0.5">
                                      <Clock className="w-3 h-3" aria-hidden="true" />
                                      {timeStr}
                                    </span>
                                  </div>
                                  <div className="text-xs font-semibold text-[var(--lms-text)] line-clamp-2">
                                    {ev.title}
                                  </div>
                                  <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--lms-text-muted)]">
                                    <span className="truncate">{ev.courseCode}</span>
                                    <Badge variant={st.variant} size="sm">
                                      {st.label}
                                    </Badge>
                                  </div>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </TabPanel>

          <TabPanel id="list" activeId={viewMode} idPrefix="schedule-view">
            {filteredEvents.length === 0 ? (
              <EmptyState
                title="Chưa có sự kiện nào phù hợp"
                description="Thử thay đổi bộ lọc khóa học hoặc loại hoạt động để xem thêm."
              />
            ) : (
              <DataTable
                columns={columns}
                data={filteredEvents}
                caption="Danh sách thời hạn học tập"
                hideCaption
                getRowKey={(row) => `${row.kind}-${row.id}`}
                initialSort={{ key: 'endAt', direction: 'asc' }}
              />
            )}
          </TabPanel>
        </>
      )}
    </div>
  );
};
