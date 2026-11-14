import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Search,
} from 'lucide-react';
import {
  getCourseQuizzes,
  getCourses,
  getMyQuizAttempts,
  toggleQuizPublish,
} from '../api/learning';
import { useAuth } from '../auth/AuthContext';
import { QuizAnalyticsPanel } from '../components/quizzes/QuizAnalyticsPanel';
import { QuizAttemptsModal } from '../components/quizzes/QuizAttemptsModal';
import { QuizBuilderDrawer } from '../components/quizzes/QuizBuilderDrawer';
import { QuizFormModal } from '../components/quizzes/QuizFormModal';
import { QuizRunnerModal } from '../components/quizzes/QuizRunnerModal';
import {
  getQuizDurationMinutes,
  getQuizErrorMessage,
  getQuizId,
  getQuizMaxScore,
  getQuizPublished,
  getQuizWindowMeta,
} from '../components/quizzes/quizUtils';
import { Badge } from '../components/ui/Badge';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import type { Course, Quiz, QuizAttempt } from '../types';
import { formatDateTimeVi, formatScoreVisibility } from '../utils/formatters';

export interface QuizzesPageProps {
  embeddedCourseId?: string;
}

type QuizFilterKey = 'ALL' | 'OPEN' | 'UPCOMING' | 'CLOSED' | 'DRAFT';

export function QuizzesPage({ embeddedCourseId }: QuizzesPageProps = {}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const baseId = useId();
  const params = useParams<{ id?: string; quizId?: string }>();
  const [searchParams] = useSearchParams();

  const isInstructor = user?.role === 'LECTURER' || user?.role === 'ADMIN';
  const isEmbedded = Boolean(embeddedCourseId);

  const queryCourseId = searchParams.get('courseId') ?? '';
  const deepLinkQuizId = params.quizId ?? searchParams.get('quizId') ?? '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesReady, setCoursesReady] = useState(isEmbedded);
  const [manualCourseId, setManualCourseId] = useState<string>(
    params.id ?? queryCourseId ?? '',
  );
  const selectedCourseId = embeddedCourseId ?? manualCourseId;

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [myAttemptsMap, setMyAttemptsMap] = useState<Record<string, QuizAttempt[]>>({});
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuizFilterKey>('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);

  const [builderTarget, setBuilderTarget] = useState<Quiz | null>(null);
  const [attemptsTarget, setAttemptsTarget] = useState<Quiz | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<Quiz | null>(null);
  const [runnerTarget, setRunnerTarget] = useState<Quiz | null>(null);

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
          setError(getQuizErrorMessage(err, 'Không thể tải danh sách khóa học.'));
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
        const list = await getCourseQuizzes(selectedCourseId);
        if (cancelled) return;
        setQuizzes(list);
        setError(null);

        let nextAttemptsMap: Record<string, QuizAttempt[]> = {};
        if (!isInstructor && list.length > 0) {
          const results = await Promise.allSettled(
            list.map(async (q) => {
              const qid = getQuizId(q);
              const atts = await getMyQuizAttempts(qid);
              return [qid, atts] as const;
            }),
          );
          if (cancelled) return;
          for (const item of results) {
            if (item.status === 'fulfilled') {
              nextAttemptsMap[item.value[0]] = item.value[1];
            }
          }
          setMyAttemptsMap(nextAttemptsMap);
        } else {
          nextAttemptsMap = {};
          setMyAttemptsMap(nextAttemptsMap);
        }

        if (deepLinkQuizId) {
          const key = `${selectedCourseId}:${deepLinkQuizId}`;
          if (deepLinkHandledRef.current !== key) {
            const match = list.find((q) => getQuizId(q) === deepLinkQuizId);
            if (match) {
              deepLinkHandledRef.current = key;
              if (isInstructor) {
                setAttemptsTarget(match);
              } else {
                const attempts = nextAttemptsMap[deepLinkQuizId] ?? [];
                if (attempts.length > 0) {
                  setAttemptsTarget(match);
                } else if (getQuizWindowMeta(match).key === 'OPEN') {
                  setRunnerTarget(match);
                }
              }
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(getQuizErrorMessage(err, 'Không thể tải danh sách bài kiểm tra.'));
        }
      } finally {
        if (!cancelled) setLoadedKey(currentKey);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [deepLinkQuizId, isInstructor, reloadNonce, selectedCourseId]);

  const handleRetry = () => {
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const triggerReload = () => {
    setReloadNonce((n) => n + 1);
  };

  const filteredQuizzes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return quizzes.filter((q) => {
      const win = getQuizWindowMeta(q);
      if (statusFilter !== 'ALL' && win.key !== statusFilter) return false;
      if (!query) return true;
      const haystack = `${q.title} ${q.description ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [quizzes, searchQuery, statusFilter]);

  const summaryStats = useMemo(() => {
    let openCount = 0;
    let draftOrUpcoming = 0;
    let completedCount = 0;

    for (const q of quizzes) {
      const win = getQuizWindowMeta(q);
      if (win.key === 'OPEN') openCount += 1;
      if (win.key === 'DRAFT' || win.key === 'UPCOMING') draftOrUpcoming += 1;
      if (!isInstructor) {
        const atts = myAttemptsMap[getQuizId(q)] ?? [];
        if (atts.some((a) => (a.status || '').toUpperCase() !== 'IN_PROGRESS')) {
          completedCount += 1;
        }
      }
    }

    return {
      total: quizzes.length,
      openCount,
      draftOrUpcoming,
      completedCount,
    };
  }, [isInstructor, myAttemptsMap, quizzes]);

  const handleTogglePublish = async (quiz: Quiz) => {
    const currentlyPublished = getQuizPublished(quiz);
    const nextPublished = !currentlyPublished;

    const confirmed = await confirm({
      title: nextPublished ? 'Công bố bài kiểm tra?' : 'Ẩn / Hủy công bố bài kiểm tra?',
      message: nextPublished
        ? `Bài kiểm tra "${quiz.title}" sẽ hiển thị cho sinh viên trong khóa học theo khung giờ đã cấu hình.`
        : `Ẩn bài kiểm tra "${quiz.title}" khỏi sinh viên (không thể hủy công bố nếu đang có sinh viên làm bài).`,
      confirmText: nextPublished ? 'Công bố ngay' : 'Ẩn bài kiểm tra',
      cancelText: 'Hủy',
      variant: nextPublished ? 'primary' : 'danger',
    });
    if (!confirmed) return;

    try {
      await toggleQuizPublish(getQuizId(quiz), nextPublished);
      setQuizzes((prev) =>
        prev.map((item) =>
          getQuizId(item) === getQuizId(quiz)
            ? { ...item, isPublished: nextPublished, is_published: nextPublished }
            : item,
        ),
      );
      toast.success(
        nextPublished
          ? 'Đã công bố bài kiểm tra.'
          : 'Đã chuyển bài kiểm tra về trạng thái chưa công bố.',
      );
    } catch (err) {
      toast.error(
        getQuizErrorMessage(err, 'Không thể thay đổi trạng thái công bố bài kiểm tra.'),
      );
    }
  };

  const instructorColumns: DataTableColumn<Quiz>[] = [
    {
      key: 'title',
      header: 'Bài kiểm tra',
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => {
        const win = getQuizWindowMeta(row);
        return (
          <div className="min-w-[210px] max-w-md space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--lms-text)]">{row.title}</span>
              <Badge variant={win.variant} size="sm" dot>
                {win.label}
              </Badge>
            </div>
            <p className="text-xs text-[var(--lms-text-muted)]">
              {formatScoreVisibility(row.scoreVisibility)}
              {row.weightPercent != null ? ` • Trọng số ${row.weightPercent}%` : ''}
            </p>
          </div>
        );
      },
    },
    {
      key: 'schedule',
      header: 'Khung thời gian',
      sortable: true,
      sortValue: (row) => row.endAt ?? '',
      render: (row) => (
        <div className="tabular-nums whitespace-nowrap text-xs">
          <p className="text-[var(--lms-text)]">
            Mở: {formatDateTimeVi(row.startAt)}
          </p>
          <p className="text-[var(--lms-text-muted)]">
            Đóng: {formatDateTimeVi(row.endAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'config',
      header: 'Cấu hình',
      align: 'right',
      render: (row) => (
        <div className="tabular-nums whitespace-nowrap text-right text-xs">
          <p className="font-semibold text-[var(--lms-text)]">
            {getQuizDurationMinutes(row)} phút • {row.maxAttempts ?? 1} lượt
          </p>
          <p className="text-[var(--lms-text-muted)]">
            Tối đa {getQuizMaxScore(row)} đ • Đạt &ge; {row.passingScore ?? 5}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (row) => {
        const published = getQuizPublished(row);
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setBuilderTarget(row);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Câu hỏi
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setAttemptsTarget(row);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              Bài làm
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setAnalyticsTarget(row);
              }}
              aria-label={`Thống kê ${row.title}`}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              Thống kê
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setEditingQuiz(row);
                setFormOpen(true);
              }}
              aria-label={`Chỉnh sửa ${row.title}`}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Sửa
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleTogglePublish(row);
              }}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                published
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              {published ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  Ẩn bài
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Công bố
                </>
              )}
            </button>
          </div>
        );
      },
    },
  ];

  const studentColumns: DataTableColumn<Quiz>[] = [
    {
      key: 'title',
      header: 'Bài kiểm tra',
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => {
        const win = getQuizWindowMeta(row);
        return (
          <div className="min-w-[200px] max-w-md space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--lms-text)]">{row.title}</span>
              <Badge variant={win.variant} size="sm" dot>
                {win.label}
              </Badge>
            </div>
            <p className="tabular-nums text-xs text-[var(--lms-text-muted)]">
              Thời lượng {getQuizDurationMinutes(row)} phút • Đóng lúc{' '}
              {formatDateTimeVi(row.endAt)}
            </p>
          </div>
        );
      },
    },
    {
      key: 'attempts',
      header: 'Lượt làm & Điểm cao nhất',
      render: (row) => {
        const qId = getQuizId(row);
        const attempts = myAttemptsMap[qId] ?? [];
        const maxAttempts = row.maxAttempts ?? 1;
        const maxScore = getQuizMaxScore(row);
        const inProgress = attempts.find(
          (a) => (a.status || '').toUpperCase() === 'IN_PROGRESS',
        );
        const finalized = attempts.filter((a) => {
          const s = (a.status || '').toUpperCase();
          return s === 'SUBMITTED' || s === 'EXPIRED';
        });
        const pendingReview = attempts.some(
          (a) => (a.status || '').toUpperCase() === 'PENDING_REVIEW',
        );

        const bestScore =
          finalized.length > 0
            ? Math.max(...finalized.map((a) => Number(a.score ?? 0)))
            : null;

        return (
          <div className="space-y-1 text-xs">
            <p className="tabular-nums font-medium text-[var(--lms-text)]">
              Đã dùng: {attempts.length} / {maxAttempts} lượt
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {inProgress && <Badge variant="info">Có bài đang làm dở</Badge>}
              {bestScore !== null ? (
                <span className="tabular-nums rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Cao nhất: {bestScore}/{maxScore}
                </span>
              ) : pendingReview ? (
                <Badge variant="warning">Chờ giảng viên chấm</Badge>
              ) : !inProgress ? (
                <span className="text-[var(--lms-text-muted)]">Chưa làm bài</span>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (row) => {
        const qId = getQuizId(row);
        const win = getQuizWindowMeta(row);
        const attempts = myAttemptsMap[qId] ?? [];
        const maxAttempts = row.maxAttempts ?? 1;
        const inProgress = attempts.find(
          (a) => (a.status || '').toUpperCase() === 'IN_PROGRESS',
        );
        const canStartNew = win.key === 'OPEN' && attempts.length < maxAttempts;
        const canResume = win.key === 'OPEN' && Boolean(inProgress);

        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {attempts.length > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setAttemptsTarget(row);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Lịch sử ({attempts.length})
              </button>
            )}

            {canResume ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setRunnerTarget(row);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Tiếp tục làm nháp
              </button>
            ) : canStartNew ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setRunnerTarget(row);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Bắt đầu làm bài
              </button>
            ) : null}
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
              Kiểm tra & Trắc nghiệm
            </h1>
            <p className="mt-1 text-sm text-[var(--lms-text-muted)]">
              {isInstructor
                ? 'Soạn ngân hàng câu hỏi, tạo câu hỏi bằng AI, chấm tự luận ngắn và xem thống kê kết quả.'
                : 'Làm bài kiểm tra trực tuyến theo thời gian thực, tự động lưu nháp và xem kết quả.'}
            </p>
          </div>

          {isInstructor && selectedCourseId && (
            <button
              type="button"
              onClick={() => {
                setEditingQuiz(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo bài kiểm tra
            </button>
          )}
        </header>
      ) : null}

      <section
        aria-label="Bộ lọc bài kiểm tra"
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
              Tìm kiếm bài kiểm tra
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
                placeholder="Tìm theo tên hoặc hướng dẫn..."
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2 pl-9 pr-3 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="min-w-[170px]">
            <label
              htmlFor={`${baseId}-status-filter`}
              className="mb-1 block text-xs font-semibold text-[var(--lms-text-muted)]"
            >
              Trạng thái mở bài
            </label>
            <select
              id={`${baseId}-status-filter`}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as QuizFilterKey)}
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Tất cả ({quizzes.length})</option>
              <option value="OPEN">Đang mở</option>
              <option value="UPCOMING">Sắp mở</option>
              <option value="CLOSED">Đã đóng</option>
              {isInstructor && <option value="DRAFT">Chưa công bố</option>}
            </select>
          </div>
        </div>

        {isEmbedded && isInstructor && selectedCourseId && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setEditingQuiz(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo bài kiểm tra
            </button>
          </div>
        )}
      </section>

      {!loading && selectedCourseId && quizzes.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-[var(--lms-text-muted)]">Tổng số bài kiểm tra</p>
              <p className="tabular-nums text-lg font-bold text-[var(--lms-text)]">
                {summaryStats.total}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Clock className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-[var(--lms-text-muted)]">Đang mở làm bài</p>
              <p className="tabular-nums text-lg font-bold text-[var(--lms-text)]">
                {summaryStats.openCount}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
              {isInstructor ? (
                <BookOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div>
              <p className="text-xs text-[var(--lms-text-muted)]">
                {isInstructor ? 'Khóa học đang chọn' : 'Bài đã hoàn thành'}
              </p>
              <p className="tabular-nums truncate text-sm font-bold text-[var(--lms-text)]">
                {isInstructor
                  ? selectedCourse?.courseCode || selectedCourse?.code || 'Đang quản lý'
                  : `${summaryStats.completedCount} / ${summaryStats.total}`}
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
              ? 'Hãy tạo hoặc được phân công một khóa học để soạn bài kiểm tra.'
              : 'Bạn chưa ghi danh vào khóa học nào để xem bài kiểm tra.'
          }
        />
      ) : (
        <DataTable<Quiz>
          columns={isInstructor ? instructorColumns : studentColumns}
          data={filteredQuizzes}
          caption="Danh sách bài kiểm tra"
          hideCaption
          getRowKey={(row) => getQuizId(row)}
          emptyTitle={
            quizzes.length === 0
              ? 'Chưa có bài kiểm tra nào'
              : 'Không tìm thấy bài kiểm tra phù hợp'
          }
          emptyDescription={
            quizzes.length === 0
              ? isInstructor
                ? 'Tạo bài kiểm tra đầu tiên và thêm câu hỏi thủ công hoặc bằng AI.'
                : 'Giảng viên chưa mở bài kiểm tra nào cho khóa học này.'
              : 'Thử điều chỉnh từ khóa hoặc bộ lọc trạng thái.'
          }
          emptyAction={
            quizzes.length === 0 && isInstructor ? (
              <button
                type="button"
                onClick={() => {
                  setEditingQuiz(null);
                  setFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Tạo bài kiểm tra đầu tiên
              </button>
            ) : undefined
          }
          onRowClick={(row) => {
            if (isInstructor) {
              setBuilderTarget(row);
            } else {
              const attempts = myAttemptsMap[getQuizId(row)] ?? [];
              const win = getQuizWindowMeta(row);
              const hasInProgress = attempts.some(
                (a) => (a.status || '').toUpperCase() === 'IN_PROGRESS',
              );
              if (win.key === 'OPEN' && (hasInProgress || attempts.length === 0)) {
                setRunnerTarget(row);
              } else if (attempts.length > 0) {
                setAttemptsTarget(row);
              }
            }
          }}
        />
      )}

      {selectedCourseId && (
        <QuizFormModal
          isOpen={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditingQuiz(null);
          }}
          courseId={selectedCourseId}
          quiz={editingQuiz}
          onSaved={(saved, isEdit) => {
            setQuizzes((prev) => {
              if (isEdit) {
                return prev.map((item) =>
                  getQuizId(item) === getQuizId(saved) ? saved : item,
                );
              }
              return [saved, ...prev];
            });
          }}
        />
      )}

      {selectedCourseId && (
        <QuizBuilderDrawer
          isOpen={Boolean(builderTarget)}
          onClose={() => setBuilderTarget(null)}
          quiz={builderTarget}
          courseId={selectedCourseId}
          onChanged={triggerReload}
        />
      )}

      <QuizAttemptsModal
        isOpen={Boolean(attemptsTarget)}
        onClose={() => setAttemptsTarget(null)}
        quiz={attemptsTarget}
        isInstructor={isInstructor}
        onGraded={triggerReload}
      />

      <QuizAnalyticsPanel
        isOpen={Boolean(analyticsTarget)}
        onClose={() => setAnalyticsTarget(null)}
        quiz={analyticsTarget}
      />

      <QuizRunnerModal
        isOpen={Boolean(runnerTarget)}
        onClose={() => {
          setRunnerTarget(null);
          triggerReload();
        }}
        quiz={runnerTarget}
        onAttemptFinalized={(attempt) => {
          const qid = runnerTarget ? getQuizId(runnerTarget) : '';
          if (!qid) return;
          setMyAttemptsMap((prev) => {
            const current = prev[qid] ?? [];
            const exists = current.some(
              (item) => (item.attemptId ?? item.id) === (attempt.attemptId ?? attempt.id),
            );
            const updated = exists
              ? current.map((item) =>
                  (item.attemptId ?? item.id) === (attempt.attemptId ?? attempt.id)
                    ? attempt
                    : item,
                )
              : [attempt, ...current];
            return { ...prev, [qid]: updated };
          });
        }}
      />
    </div>
  );
}

export default QuizzesPage;
