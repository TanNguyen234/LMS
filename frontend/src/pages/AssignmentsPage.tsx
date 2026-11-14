import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Send,
  Unlock,
} from 'lucide-react';
import {
  getCourseAssignments,
  getCourses,
  getMySubmission,
  updateAssignment,
} from '../api/learning';
import { useAuth } from '../auth/AuthContext';
import { AssignmentFormModal } from '../components/assignments/AssignmentFormModal';
import {
  getAssignmentDeadlineMeta,
  getAssignmentDueAt,
  getAssignmentId,
  getAssignmentMaxScore,
  getAssignmentStatus,
  getErrorMessage,
  getSubmissionStatusBadgeVariant,
  toSafeDisplayHtml,
} from '../components/assignments/assignmentUtils';
import { StudentSubmitDrawer } from '../components/assignments/StudentSubmitDrawer';
import { SubmissionsGradingDrawer } from '../components/assignments/SubmissionsGradingDrawer';
import { FilePreviewModal } from '../components/files/FilePreviewModal';
import { Badge } from '../components/ui/Badge';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SafeHtml } from '../components/ui/SafeHtml';
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import type { Assignment, Course, Submission } from '../types';
import {
  formatAssignmentStatus,
  formatDateTimeVi,
  formatSubmissionStatus,
} from '../utils/formatters';

export interface AssignmentsPageProps {
  embeddedCourseId?: string;
}

type StatusFilterKey =
  | 'ALL'
  | 'OPEN'
  | 'DUE_SOON'
  | 'PAST_DUE'
  | 'CLOSED'
  | 'DRAFT';

export function AssignmentsPage({ embeddedCourseId }: AssignmentsPageProps = {}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const baseId = useId();
  const params = useParams<{ id?: string; assignmentId?: string }>();
  const [searchParams] = useSearchParams();

  const isInstructor = user?.role === 'LECTURER' || user?.role === 'ADMIN';
  const isEmbedded = Boolean(embeddedCourseId);

  const queryCourseId = searchParams.get('courseId') ?? '';
  const deepLinkAssignmentId =
    params.assignmentId ?? searchParams.get('assignmentId') ?? '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesReady, setCoursesReady] = useState(isEmbedded);
  const [manualCourseId, setManualCourseId] = useState<string>(
    params.id ?? queryCourseId ?? '',
  );
  const selectedCourseId = embeddedCourseId ?? manualCourseId;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Record<string, Submission | null>>({});
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  const [gradingTarget, setGradingTarget] = useState<Assignment | null>(null);
  const [submitTarget, setSubmitTarget] = useState<Assignment | null>(null);

  const [previewPrompt, setPreviewPrompt] = useState<{
    fileId?: string | null;
    externalUrl?: string | null;
    title: string;
  } | null>(null);

  const deepLinkHandledRef = useRef<string>('');

  const activeFetchKey = selectedCourseId ? `${selectedCourseId}:${reloadNonce}` : '';
  const coursesLoading = !isEmbedded && !coursesReady;
  const loading =
    coursesLoading || (Boolean(selectedCourseId) && loadedKey !== activeFetchKey);

  useEffect(() => {
    if (embeddedCourseId) return;

    let cancelled = false;
    void getCourses()
      .then((list) => {
        if (cancelled) return;
        setCourses(list);
        const preferred = params.id || queryCourseId;
        if (preferred && list.some((c) => String(c.courseId ?? c.id) === preferred)) {
          setManualCourseId(preferred);
        } else if (list.length > 0) {
          setManualCourseId((prev) =>
            prev && list.some((c) => String(c.courseId ?? c.id) === prev)
              ? prev
              : String(list[0].courseId ?? list[0].id),
          );
        } else {
          setManualCourseId('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Không thể tải danh sách khóa học.'));
        }
      })
      .finally(() => {
        if (!cancelled) setCoursesReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [embeddedCourseId, params.id, queryCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    const currentKey = `${selectedCourseId}:${reloadNonce}`;

    const run = async () => {
      try {
        const list = await getCourseAssignments(selectedCourseId);
        if (cancelled) return;
        setAssignments(list);
        setError(null);

        if (!isInstructor && list.length > 0) {
          const entries = await Promise.allSettled(
            list.map(async (item) => {
              const aid = getAssignmentId(item);
              const sub = await getMySubmission(aid);
              return [aid, sub] as const;
            }),
          );
          if (cancelled) return;
          const map: Record<string, Submission | null> = {};
          for (const res of entries) {
            if (res.status === 'fulfilled') {
              map[res.value[0]] = res.value[1];
            }
          }
          setMySubmissions(map);
        } else {
          setMySubmissions({});
        }

        if (deepLinkAssignmentId) {
          const handleKey = `${selectedCourseId}:${deepLinkAssignmentId}`;
          if (deepLinkHandledRef.current !== handleKey) {
            const match = list.find(
              (item) => getAssignmentId(item) === deepLinkAssignmentId,
            );
            if (match) {
              deepLinkHandledRef.current = handleKey;
              if (isInstructor) {
                setGradingTarget(match);
              } else {
                setSubmitTarget(match);
              }
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Không thể tải danh sách bài tập.'));
        }
      } finally {
        if (!cancelled) setLoadedKey(currentKey);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [deepLinkAssignmentId, isInstructor, reloadNonce, selectedCourseId]);

  const handleRetry = () => {
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const filteredAssignments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return assignments.filter((item) => {
      const deadlineMeta = getAssignmentDeadlineMeta(item);
      if (statusFilter !== 'ALL' && deadlineMeta.key !== statusFilter) {
        return false;
      }
      if (!query) return true;
      const haystack = `${item.title} ${item.description ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assignments, searchQuery, statusFilter]);

  const summaryStats = useMemo(() => {
    let openCount = 0;
    let dueSoonCount = 0;
    let submittedOrGraded = 0;

    for (const item of assignments) {
      const meta = getAssignmentDeadlineMeta(item);
      if (meta.key === 'OPEN') openCount += 1;
      if (meta.key === 'DUE_SOON') {
        openCount += 1;
        dueSoonCount += 1;
      }
      if (!isInstructor) {
        const sub = mySubmissions[getAssignmentId(item)];
        if (sub) submittedOrGraded += 1;
      }
    }

    return {
      total: assignments.length,
      openCount,
      dueSoonCount,
      submittedOrGraded,
    };
  }, [assignments, isInstructor, mySubmissions]);

  const handleTransitionStatus = async (
    assignment: Assignment,
    nextStatus: 'PUBLISHED' | 'CLOSED',
  ) => {
    const isClosing = nextStatus === 'CLOSED';
    const confirmed = await confirm({
      title: isClosing ? 'Đóng hạn bài tập?' : 'Mở lại / Công bố bài tập?',
      message: isClosing
        ? `Bài tập "${assignment.title}" sẽ ngừng nhận bài nộp mới từ sinh viên.`
        : `Bài tập "${assignment.title}" sẽ mở cho sinh viên trong khóa học xem và nộp bài.`,
      confirmText: isClosing ? 'Đóng bài tập' : 'Xác nhận mở',
      cancelText: 'Hủy',
      variant: isClosing ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    try {
      const updated = await updateAssignment(getAssignmentId(assignment), {
        status: nextStatus,
      });
      setAssignments((prev) =>
        prev.map((item) =>
          getAssignmentId(item) === getAssignmentId(assignment) ? updated : item,
        ),
      );
      toast.success(
        isClosing
          ? 'Đã đóng hạn nộp bài tập.'
          : 'Đã cập nhật trạng thái mở bài tập.',
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không thể thay đổi trạng thái bài tập.'));
    }
  };

  const openPromptPreview = (assignment: Assignment) => {
    if (assignment.attachmentFileId) {
      setPreviewPrompt({
        fileId: assignment.attachmentFileId,
        title: `Đề bài: ${assignment.title}`,
      });
    } else if (assignment.attachmentUrl) {
      setPreviewPrompt({
        externalUrl: assignment.attachmentUrl,
        title: `Tài liệu đề bài: ${assignment.title}`,
      });
    }
  };

  const instructorColumns: DataTableColumn<Assignment>[] = [
    {
      key: 'title',
      header: 'Bài tập',
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => {
        const status = getAssignmentStatus(row);
        const deadlineMeta = getAssignmentDeadlineMeta(row);
        return (
          <div className="min-w-[200px] max-w-md space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--lms-text)]">{row.title}</span>
              <Badge variant={deadlineMeta.variant} size="sm" dot>
                {deadlineMeta.label}
              </Badge>
              {status === 'PUBLISHED' && (
                <Badge variant="neutral" size="sm">
                  {formatAssignmentStatus(status)}
                </Badge>
              )}
            </div>
            {row.description && (
              <p className="line-clamp-1 text-xs text-[var(--lms-text-muted)]">
                {row.description.replace(/<[^>]+>/g, ' ').trim()}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'dueAt',
      header: 'Hạn nộp',
      sortable: true,
      sortValue: (row) => getAssignmentDueAt(row),
      render: (row) => (
        <div className="tabular-nums whitespace-nowrap text-xs">
          <p className="font-medium text-[var(--lms-text)]">
            {formatDateTimeVi(getAssignmentDueAt(row))}
          </p>
          <p className="text-[var(--lms-text-muted)]">
            {row.allowLate ? 'Cho phép nộp muộn' : 'Không nhận nộp muộn'}
          </p>
        </div>
      ),
    },
    {
      key: 'scoring',
      header: 'Điểm / Trọng số',
      align: 'right',
      sortable: true,
      sortValue: (row) => getAssignmentMaxScore(row),
      render: (row) => (
        <div className="tabular-nums whitespace-nowrap text-right text-xs">
          <p className="font-bold text-[var(--lms-text)]">
            {getAssignmentMaxScore(row)} điểm
          </p>
          <p className="text-[var(--lms-text-muted)]">
            {row.weightPercent != null ? `Trọng số ${row.weightPercent}%` : 'Không tính trọng số'}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (row) => {
        const status = getAssignmentStatus(row);
        const hasAttachment = Boolean(row.attachmentFileId || row.attachmentUrl);
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {hasAttachment && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openPromptPreview(row);
                }}
                title="Xem tệp đề bài"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Đề bài
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setGradingTarget(row);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Award className="h-3.5 w-3.5" aria-hidden="true" />
              Chấm bài
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setEditingAssignment(row);
                setFormOpen(true);
              }}
              aria-label={`Chỉnh sửa ${row.title}`}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Sửa
            </button>
            {status === 'CLOSED' || status === 'DRAFT' ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleTransitionStatus(row, 'PUBLISHED');
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                {status === 'DRAFT' ? 'Công bố' : 'Mở lại'}
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleTransitionStatus(row, 'CLOSED');
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300"
              >
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                Đóng hạn
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const studentColumns: DataTableColumn<Assignment>[] = [
    {
      key: 'title',
      header: 'Bài tập',
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => {
        const deadlineMeta = getAssignmentDeadlineMeta(row);
        return (
          <div className="min-w-[200px] max-w-md space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--lms-text)]">{row.title}</span>
              <Badge variant={deadlineMeta.variant} size="sm" dot>
                {deadlineMeta.label}
              </Badge>
            </div>
            {row.description && (
              <p className="line-clamp-1 text-xs text-[var(--lms-text-muted)]">
                {row.description.replace(/<[^>]+>/g, ' ').trim()}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'dueAt',
      header: 'Hạn nộp',
      sortable: true,
      sortValue: (row) => getAssignmentDueAt(row),
      render: (row) => (
        <div className="tabular-nums whitespace-nowrap text-xs">
          <p className="font-medium text-[var(--lms-text)]">
            {formatDateTimeVi(getAssignmentDueAt(row))}
          </p>
          <p className="text-[var(--lms-text-muted)]">
            Tối đa {getAssignmentMaxScore(row)} đ
            {row.weightPercent != null ? ` • ${row.weightPercent}%` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'submission',
      header: 'Trạng thái & Điểm',
      render: (row) => {
        const sub = mySubmissions[getAssignmentId(row)] ?? null;
        if (!sub) {
          return (
            <Badge variant="neutral" size="sm">
              Chưa nộp bài
            </Badge>
          );
        }
        const isGraded = (sub.status || '').toUpperCase() === 'GRADED';
        return (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getSubmissionStatusBadgeVariant(sub.status)} size="sm">
                {formatSubmissionStatus(sub.status)}
              </Badge>
              {isGraded && sub.score != null && (
                <span className="tabular-nums rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {sub.score}/{getAssignmentMaxScore(row)}
                </span>
              )}
            </div>
            {isGraded && sub.feedback && (
              <div className="max-w-xs text-xs text-[var(--lms-text-muted)] line-clamp-2">
                <SafeHtml html={toSafeDisplayHtml(sub.feedback)} as="span" />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (row) => {
        const sub = mySubmissions[getAssignmentId(row)] ?? null;
        const isGraded = (sub?.status || '').toUpperCase() === 'GRADED';
        const hasAttachment = Boolean(row.attachmentFileId || row.attachmentUrl);
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {hasAttachment && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openPromptPreview(row);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Đề bài
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setSubmitTarget(row);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {isGraded ? (
                <>
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Xem kết quả
                </>
              ) : sub ? (
                <>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Cập nhật bài
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Nộp bài
                </>
              )}
            </button>
          </div>
        );
      },
    },
  ];

  const selectedCourse = courses.find(
    (c) => String(c.courseId ?? c.id) === selectedCourseId,
  );

  return (
    <div className={isEmbedded ? 'space-y-4' : 'space-y-6'}>
      {!isEmbedded ? (
        <header className="flex flex-col gap-4 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--lms-text)]">
              Bài tập & Chấm điểm
            </h1>
            <p className="mt-1 text-sm text-[var(--lms-text-muted)]">
              {isInstructor
                ? 'Quản lý đề bài, theo dõi hạn nộp và chấm điểm bài làm của sinh viên.'
                : 'Theo dõi hạn nộp bài tập, nộp tệp bài làm và xem nhận xét từ giảng viên.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isInstructor && selectedCourseId && (
              <button
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Tạo bài tập mới
              </button>
            )}
          </div>
        </header>
      ) : null}

      <section
        aria-label="Bộ lọc bài tập"
        className="flex flex-col gap-3 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 shadow-xs lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-1 lg:flex-wrap lg:items-end">
          {!isEmbedded && (
            <div className="min-w-[220px] flex-1">
              <label
                htmlFor={`${baseId}-course-select`}
                className="mb-1 block text-xs font-semibold text-[var(--lms-text-muted)]"
              >
                Khóa học
              </label>
              <select
                id={`${baseId}-course-select`}
                disabled={coursesLoading || courses.length === 0}
                value={selectedCourseId}
                onChange={(event) => {
                  setError(null);
                  setManualCourseId(event.target.value);
                }}
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
              >
                {courses.length === 0 ? (
                  <option value="">Chưa có khóa học</option>
                ) : (
                  courses.map((course) => {
                    const cid = String(course.courseId ?? course.id);
                    const code = course.courseCode ?? course.code;
                    return (
                      <option key={cid} value={cid}>
                        {code ? `${code} - ${course.title}` : course.title}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
          )}

          <div className="min-w-[200px] flex-1">
            <label
              htmlFor={`${baseId}-search`}
              className="mb-1 block text-xs font-semibold text-[var(--lms-text-muted)]"
            >
              Tìm kiếm bài tập
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lms-text-muted)]"
                aria-hidden="true"
              />
              <input
                id={`${baseId}-search`}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tìm theo tiêu đề hoặc mô tả..."
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2 pl-9 pr-3 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="min-w-[170px]">
            <label
              htmlFor={`${baseId}-status-filter`}
              className="mb-1 block text-xs font-semibold text-[var(--lms-text-muted)]"
            >
              Trạng thái hạn nộp
            </label>
            <select
              id={`${baseId}-status-filter`}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilterKey)}
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Tất cả ({assignments.length})</option>
              <option value="OPEN">Đang mở</option>
              <option value="DUE_SOON">Sắp hết hạn</option>
              <option value="PAST_DUE">Quá hạn</option>
              <option value="CLOSED">Đã đóng</option>
              {isInstructor && <option value="DRAFT">Bản nháp</option>}
            </select>
          </div>
        </div>

        {isEmbedded && isInstructor && selectedCourseId && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setEditingAssignment(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo bài tập
            </button>
          </div>
        )}
      </section>

      {!loading && selectedCourseId && assignments.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-[var(--lms-text-muted)]">Tổng số bài tập</p>
              <p className="tabular-nums text-lg font-bold text-[var(--lms-text)]">
                {summaryStats.total}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Clock className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-[var(--lms-text-muted)]">Đang mở / Sắp hết hạn</p>
              <p className="tabular-nums text-lg font-bold text-[var(--lms-text)]">
                {summaryStats.openCount}{' '}
                <span className="text-xs font-medium text-[var(--lms-text-muted)]">
                  ({summaryStats.dueSoonCount} sắp hạn)
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-[var(--lms-text-muted)]">
                {isInstructor ? 'Khóa học đang chọn' : 'Bài bạn đã nộp'}
              </p>
              <p className="tabular-nums truncate text-sm font-bold text-[var(--lms-text)]">
                {isInstructor
                  ? selectedCourse?.courseCode || selectedCourse?.code || 'Đang quản lý'
                  : `${summaryStats.submittedOrGraded} / ${summaryStats.total}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {error ? (
        <ErrorBanner message={error} onRetry={handleRetry} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <SkeletonTable rows={5} columns={4} />
        </div>
      ) : !selectedCourseId ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
          title="Chưa có khóa học nào"
          description={
            isInstructor
              ? 'Hãy tạo hoặc được phân công một khóa học để bắt đầu giao bài tập.'
              : 'Bạn chưa ghi danh vào khóa học nào để xem bài tập.'
          }
        />
      ) : (
        <DataTable<Assignment>
          columns={isInstructor ? instructorColumns : studentColumns}
          data={filteredAssignments}
          caption="Danh sách bài tập trong khóa học"
          hideCaption
          getRowKey={(row) => getAssignmentId(row)}
          emptyTitle={
            assignments.length === 0
              ? 'Chưa có bài tập nào'
              : 'Không tìm thấy bài tập phù hợp'
          }
          emptyDescription={
            assignments.length === 0
              ? isInstructor
                ? 'Tạo bài tập đầu tiên để sinh viên bắt đầu nộp bài.'
                : 'Giảng viên chưa giao bài tập nào cho khóa học này.'
              : 'Thử xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái khác.'
          }
          emptyAction={
            assignments.length === 0 && isInstructor ? (
              <button
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Tạo bài tập đầu tiên
              </button>
            ) : undefined
          }
          onRowClick={(row) => {
            if (isInstructor) {
              setGradingTarget(row);
            } else {
              setSubmitTarget(row);
            }
          }}
        />
      )}

      {selectedCourseId && (
        <AssignmentFormModal
          isOpen={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditingAssignment(null);
          }}
          courseId={selectedCourseId}
          assignment={editingAssignment}
          onSaved={(saved, isEdit) => {
            setAssignments((prev) => {
              if (isEdit) {
                return prev.map((item) =>
                  getAssignmentId(item) === getAssignmentId(saved) ? saved : item,
                );
              }
              return [saved, ...prev];
            });
          }}
        />
      )}

      <SubmissionsGradingDrawer
        isOpen={Boolean(gradingTarget)}
        onClose={() => setGradingTarget(null)}
        assignment={gradingTarget}
      />

      {selectedCourseId && (
        <StudentSubmitDrawer
          isOpen={Boolean(submitTarget)}
          onClose={() => setSubmitTarget(null)}
          assignment={submitTarget}
          courseId={selectedCourseId}
          existingSubmission={
            submitTarget ? mySubmissions[getAssignmentId(submitTarget)] ?? null : null
          }
          onSubmitted={(saved) => {
            if (!submitTarget) return;
            const aid = getAssignmentId(submitTarget);
            setMySubmissions((prev) => ({ ...prev, [aid]: saved }));
          }}
        />
      )}

      <FilePreviewModal
        isOpen={Boolean(previewPrompt)}
        onClose={() => setPreviewPrompt(null)}
        fileId={previewPrompt?.fileId}
        externalUrl={previewPrompt?.externalUrl}
        title={previewPrompt?.title ?? 'Xem trước đề bài'}
      />
    </div>
  );
}

export default AssignmentsPage;
