import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Printer,
  Trash2,
  Video,
  FileText,
  CheckSquare,
  GraduationCap,
} from 'lucide-react';
import { learningApi } from '../api/learning';
import { listAllUsers } from '../api/users';
import { useAuth } from '../auth/AuthContext';
import { LecturerCombobox } from '../components/courses/LecturerCombobox';
import { QuickScheduleModal } from '../components/schedule/QuickScheduleModal';
import { printSection } from '../utils/exportUtils';
import { formatDateTimeVi } from '../utils/formatters';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import type { AcademicSemester, CalendarEventItem, Course, User } from '../types';

type EventKindFilter = 'ALL' | 'SESSION' | 'ASSIGNMENT' | 'QUIZ' | 'MEETING';
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
    case 'SESSION':
      return {
        label: 'Buổi học',
        variant: 'success',
        icon: <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />,
      };
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

  if (ev.kind === 'SESSION') {
    if (ev.status === 'CANCELLED') return { label: 'Đã hủy', variant: 'neutral' };
    if (endMs < now) return { label: 'Đã học', variant: 'neutral' };
    if (startMs && startMs <= now && endMs >= now) return { label: 'Đang học', variant: 'success' };
    return { label: 'Đã xếp lịch', variant: 'info' };
  }
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

function formatTimeRange(ev: CalendarEventItem): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (ev.startAt && (ev.kind === 'SESSION' || ev.kind === 'MEETING')) {
    return `${fmt(ev.startAt)} - ${fmt(ev.endAt)}`;
  }
  return fmt(ev.endAt);
}

export const SchedulePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const isAdmin = user?.role === 'ADMIN';
  const isLecturer = user?.role === 'LECTURER';
  const canSchedule = isAdmin || isLecturer;

  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<AcademicSemester[]>([]);
  const [lecturers, setLecturers] = useState<User[]>([]);

  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('ALL');
  const [selectedLecturerId, setSelectedLecturerId] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [kindFilter, setKindFilter] = useState<EventKindFilter>(() =>
    user?.role === 'STUDENT' ? 'ALL' : 'SESSION',
  );
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickModalOpen, setQuickModalOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void listAllUsers('LECTURER', true)
      .then((list) => {
        if (active) setLecturers(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const loadSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [calendarRows, courseRows, semesterRows] = await Promise.all([
        learningApi.getDashboardCalendar({
          courseId: selectedCourseId !== 'ALL' ? selectedCourseId : undefined,
          lecturerId: isAdmin && selectedLecturerId ? selectedLecturerId : undefined,
          semesterId: selectedSemesterId !== 'ALL' ? selectedSemesterId : undefined,
        }),
        learningApi.getCourses({
          semesterId: selectedSemesterId !== 'ALL' ? selectedSemesterId : undefined,
          lecturerId: isAdmin && selectedLecturerId ? selectedLecturerId : undefined,
        }),
        learningApi.getSemesters().catch(() => [] as AcademicSemester[]),
      ]);
      setEvents(calendarRows);
      setCourses(courseRows);
      setSemesters(semesterRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải lịch học tập trung');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedCourseId, selectedLecturerId, selectedSemesterId]);

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

  const handleDeleteSession = async (ev: CalendarEventItem) => {
    if (ev.kind !== 'SESSION') return;
    const ok = await confirm({
      title: 'Xóa buổi học khỏi lịch?',
      message: `Xác nhận xóa "${ev.title}" (${ev.courseCode}) vào lúc ${formatDateTimeVi(ev.startAt || ev.endAt)}?`,
      confirmText: 'Xóa buổi học',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await learningApi.deleteScheduleSession(ev.id);
      toast.success('Đã xóa buổi học khỏi thời khóa biểu.');
      await loadSchedule();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa buổi học.');
    }
  };

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
        const anchor =
          (ev.kind === 'SESSION' || ev.kind === 'MEETING') && ev.startAt
            ? new Date(ev.startAt)
            : new Date(ev.endAt);
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
      header: 'Hoạt động / Buổi học',
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => (
        <div className="space-y-0.5">
          <Link
            to={row.relatedUrl}
            className="font-semibold text-[var(--lms-text)] hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-2 hover:underline"
          >
            {row.title}
          </Link>
          {(row.room || row.lecturerName) && (
            <div className="text-xs text-[var(--lms-text-muted)] flex flex-wrap gap-2">
              {row.room && <span>Phòng: {row.room}</span>}
              {row.lecturerName && <span>GV: {row.lecturerName}</span>}
            </div>
          )}
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
          <span className="font-medium">
            {row.courseCode}
            {row.sectionCode ? ` · ${row.sectionCode}` : ''}
          </span>
          <span className="text-[var(--lms-text-muted)] truncate max-w-[14rem]">{row.courseTitle}</span>
        </span>
      ),
    },
    {
      key: 'endAt',
      header: 'Thời gian',
      sortable: true,
      sortValue: (row) => new Date(row.startAt || row.endAt).getTime(),
      render: (row) => (
        <div className="text-sm tabular-nums text-[var(--lms-text)]">
          {row.startAt && (
            <div className="text-xs text-[var(--lms-text-muted)]">
              Bắt đầu: {formatDateTimeVi(row.startAt)}
            </div>
          )}
          <div>
            {row.kind === 'ASSIGNMENT'
              ? 'Hạn nộp: '
              : row.kind === 'QUIZ'
                ? 'Đóng bài: '
                : 'Kết thúc: '}
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
      header: 'Thao tác',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center gap-1.5">
          {canSchedule && row.kind === 'SESSION' && (
            <button
              type="button"
              onClick={() => void handleDeleteSession(row)}
              aria-label={`Xóa buổi ${row.title}`}
              className="p-1.5 rounded-lg border border-[var(--lms-border)] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <Link
            to={row.relatedUrl}
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Mở ngay
          </Link>
        </div>
      ),
    },
  ];

  const weekRangeLabel = `${weekDays[0].date.toLocaleDateString('vi-VN')} - ${weekDays[6].date.toLocaleDateString('vi-VN')}`;

  const pageTitle = isAdmin
    ? 'Lịch học vụ & Điều phối thời khóa biểu'
    : isLecturer
      ? 'Lịch giảng dạy'
      : 'Lịch học & Thời hạn tập trung';

  const pageSubtitle = isAdmin
    ? 'Xếp lịch nhanh theo học kỳ, lọc theo từng giảng viên và tự động chống trùng lịch Giảng viên · Sinh viên · Phòng học.'
    : isLecturer
      ? 'Theo dõi lịch các buổi lên lớp, phòng học trực tuyến và hạn chấm bài tập.'
      : 'Theo dõi đồng bộ lịch các buổi học trên lớp/trực tuyến, hạn nộp bài tập và giờ kiểm tra.';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--lms-text)] flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span>{pageTitle}</span>
          </h1>
          <p className="text-sm text-[var(--lms-text-muted)] mt-1">{pageSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          {canSchedule && (
            <button
              type="button"
              onClick={() => setQuickModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-sm transition-colors cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              <span>{isAdmin ? 'Xếp lịch nhanh' : 'Tạo buổi dạy / Học bù'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => printSection('Lich_Hoc_Tap_Trung')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>In lịch</span>
          </button>
        </div>
      </div>

      {/* Filters & View Switcher */}
      <div className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-xl p-4 space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {semesters.length > 0 && (
            <div>
              <label
                htmlFor="schedule-semester-filter"
                className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1"
              >
                Học kỳ
              </label>
              <select
                id="schedule-semester-filter"
                value={selectedSemesterId}
                onChange={(e) => {
                  setSelectedSemesterId(e.target.value);
                  setSelectedCourseId('ALL');
                }}
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả học kỳ</option>
                {semesters.map((s) => (
                  <option key={s.semesterId} value={s.semesterId}>
                    {s.name} {s.isCurrent ? '(Hiện tại)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--lms-text-muted)]">
                  Lọc theo Giảng viên
                </span>
                {selectedLecturerId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLecturerId('');
                      setSelectedCourseId('ALL');
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                  >
                    Xem tất cả GV
                  </button>
                )}
              </div>
              <LecturerCombobox
                label=""
                lecturers={lecturers}
                value={selectedLecturerId}
                onChange={(id) => {
                  setSelectedLecturerId(id);
                  setSelectedCourseId('ALL');
                }}
              />
            </div>
          )}

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
              <option value="ALL">Tất cả khóa học ({courses.length})</option>
              {courses.map((c) => {
                const cid = c.courseId ?? c.id;
                const ccode = c.courseCode ?? c.code;
                return (
                  <option key={cid} value={cid}>
                    {ccode}{c.sectionCode ? ` · ${c.sectionCode}` : ''} - {c.title}
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
              <option value="SESSION">Lịch buổi học / Giảng dạy</option>
              <option value="ALL">Tất cả hoạt động</option>
              <option value="ASSIGNMENT">Bài tập về nhà</option>
              <option value="QUIZ">Bài kiểm tra / Quiz</option>
              <option value="MEETING">Phòng học trực tuyến</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {isAdmin && !selectedLecturerId && selectedCourseId === 'ALL' ? (
            <p className="text-xs text-[var(--lms-text-muted)]">
              Mẹo: Khi trường có nhiều giảng viên, chọn <strong>Giảng viên</strong> hoặc <strong>Khóa học</strong> ở trên để xem lịch gọn và rõ ràng hơn.
            </p>
          ) : (
            <span className="text-xs text-[var(--lms-text-muted)]">
              Đang hiển thị {filteredEvents.length} mục lịch
            </span>
          )}

          <Tabs
            idPrefix="schedule-view"
            ariaLabel="Chế độ xem lịch"
            activeId={viewMode}
            onChange={(id) => setViewMode(id as ScheduleViewMode)}
            items={[
              { id: 'week', label: 'Lịch theo tuần' },
              { id: 'list', label: 'Danh sách chi tiết', badge: filteredEvents.length },
            ]}
          />
        </div>
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
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Tuần trước</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer"
                  >
                    Tuần này
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((prev) => prev + 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
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
                            const timeStr = formatTimeRange(ev);
                            return (
                              <li key={`${ev.kind}-${ev.id}`}>
                                <Link
                                  to={ev.relatedUrl}
                                  className="block rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] p-2 hover:border-indigo-500 transition-colors space-y-1.5"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span className="shrink-0 whitespace-nowrap">
                                      <Badge variant={meta.variant} size="sm">
                                        {meta.label}
                                      </Badge>
                                    </span>
                                    <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums text-[var(--lms-text-muted)] inline-flex items-center gap-0.5">
                                      <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                                      {timeStr}
                                    </span>
                                  </div>
                                  <div className="text-xs font-semibold text-[var(--lms-text)] line-clamp-2">
                                    {ev.title}
                                  </div>
                                  {(ev.room || ev.lecturerName) && (
                                    <div className="text-[11px] text-[var(--lms-text-muted)] space-y-0.5">
                                      {ev.room && (
                                        <div className="flex items-center gap-1 truncate">
                                          <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                                          <span className="truncate">{ev.room}</span>
                                        </div>
                                      )}
                                      {isAdmin && ev.lecturerName && (
                                        <div className="truncate">GV: {ev.lecturerName}</div>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[var(--lms-text-muted)]">
                                    <span className="truncate font-medium">
                                      {ev.courseCode}
                                      {ev.sectionCode ? `·${ev.sectionCode}` : ''}
                                    </span>
                                    <span className="shrink-0 whitespace-nowrap">
                                      <Badge variant={st.variant} size="sm">
                                        {st.label}
                                      </Badge>
                                    </span>
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
                description="Thử thay đổi bộ lọc học kỳ, giảng viên, khóa học hoặc loại hoạt động để xem thêm."
              />
            ) : (
              <DataTable
                columns={columns}
                data={filteredEvents}
                caption="Danh sách thời khóa biểu và thời hạn học tập"
                hideCaption
                getRowKey={(row) => `${row.kind}-${row.id}`}
                initialSort={{ key: 'endAt', direction: 'asc' }}
              />
            )}
          </TabPanel>
        </>
      )}

      {canSchedule && (
        <QuickScheduleModal
          isOpen={quickModalOpen}
          onClose={() => setQuickModalOpen(false)}
          courses={courses}
          semesters={semesters}
          defaultCourseId={selectedCourseId !== 'ALL' ? selectedCourseId : undefined}
          onCreated={loadSchedule}
        />
      )}
    </div>
  );
};
