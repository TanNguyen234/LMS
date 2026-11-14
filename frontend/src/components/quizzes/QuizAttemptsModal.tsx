import { useEffect, useId, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Lock,
  Search,
  XCircle,
} from 'lucide-react';
import {
  getMyQuizAttempts,
  getQuizAttempts,
  getQuizDetail,
  manualGradeQuizAttempt,
} from '../../api/learning';
import type { Quiz, QuizAttempt, QuizQuestion } from '../../types';
import { exportToCsv } from '../../utils/exportUtils';
import {
  formatDateTimeVi,
  formatQuestionType,
  formatScoreVisibility,
  formatSubmissionStatus,
} from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { SkeletonTable } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import {
  canStudentViewAnswers,
  getAttemptId,
  getAttemptStartedAt,
  getAttemptStatusVariant,
  getAttemptSubmittedAt,
  getQuestionId,
  getQuestionPoints,
  getQuestionText,
  getQuestionType,
  getQuizErrorMessage,
  getQuizId,
  getQuizMaxScore,
  getScoreVisibilityHelperText,
  parseAnswersRecord,
  parseQuestionOptions,
  parseQuestionResults,
} from './quizUtils';

export interface QuizAttemptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz | null;
  isInstructor: boolean;
  onGraded?: () => void;
}

type AttemptStatusFilter =
  | 'ALL'
  | 'PENDING_REVIEW'
  | 'SUBMITTED'
  | 'EXPIRED'
  | 'IN_PROGRESS';

function buildScoreDrafts(
  attempt: QuizAttempt | null,
  questions: QuizQuestion[],
): Record<string, string> {
  if (!attempt) return {};
  const drafts: Record<string, string> = {};
  const parsed = parseQuestionResults(attempt.questionResultsJson);
  const resultMap = new Map(parsed.map((r) => [r.questionId, r]));
  for (const q of questions) {
    if (getQuestionType(q) === 'SHORT_TEXT') {
      const qId = getQuestionId(q);
      const existing = resultMap.get(qId)?.awardedScore;
      drafts[qId] = existing != null ? String(existing) : '0';
    }
  }
  return drafts;
}

function QuizAttemptsInner({
  onClose,
  quiz,
  isInstructor,
  onGraded,
}: {
  onClose: () => void;
  quiz: Quiz;
  isInstructor: boolean;
  onGraded?: () => void;
}) {
  const toast = useToast();
  const baseId = useId();
  const quizId = getQuizId(quiz);

  const [detailQuiz, setDetailQuiz] = useState<Quiz>(quiz);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [statusFilter, setStatusFilter] = useState<AttemptStatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAttemptId, setSelectedAttemptId] = useState('');

  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [manualFeedback, setManualFeedback] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getQuizDetail(quizId),
      isInstructor ? getQuizAttempts(quizId) : getMyQuizAttempts(quizId),
    ])
      .then(([quizRes, attemptsRes]) => {
        if (cancelled) return;
        setDetailQuiz(quizRes);
        setAttempts(attemptsRes);
        setError(null);

        const sortedQuestions = [...(quizRes.questions ?? [])].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        );
        if (attemptsRes.length > 0) {
          const initial = isInstructor
            ? attemptsRes.find(
                (a) => (a.status || '').toUpperCase() === 'PENDING_REVIEW',
              ) ?? attemptsRes[0]
            : attemptsRes[0];
          setSelectedAttemptId(getAttemptId(initial));
          setScoreDrafts(buildScoreDrafts(initial, sortedQuestions));
          setManualFeedback('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getQuizErrorMessage(err, 'Không thể tải danh sách lượt làm bài.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isInstructor, quizId, reloadNonce]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const questions = useMemo<QuizQuestion[]>(
    () =>
      [...(detailQuiz.questions ?? [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      ),
    [detailQuiz],
  );
  const maxScore =
    getQuizMaxScore(detailQuiz) ||
    questions.reduce((sum, q) => sum + getQuestionPoints(q), 0);

  const selectAttempt = (attempt: QuizAttempt) => {
    setSelectedAttemptId(getAttemptId(attempt));
    setScoreDrafts(buildScoreDrafts(attempt, questions));
    setManualFeedback('');
  };

  const filteredAttempts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return attempts.filter((att) => {
      const status = (att.status || '').toUpperCase();
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (!query) return true;
      const haystack = `${att.student_name ?? ''} ${att.student_code ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [attempts, searchQuery, statusFilter]);

  const selectedAttempt = useMemo(
    () => attempts.find((a) => getAttemptId(a) === selectedAttemptId) ?? null,
    [attempts, selectedAttemptId],
  );

  const parsedResults = useMemo(
    () =>
      selectedAttempt
        ? parseQuestionResults(selectedAttempt.questionResultsJson)
        : [],
    [selectedAttempt],
  );

  const parsedAnswers = useMemo(
    () =>
      selectedAttempt ? parseAnswersRecord(selectedAttempt.answersJson) : {},
    [selectedAttempt],
  );

  const shortTextQuestions = useMemo(
    () => questions.filter((q) => getQuestionType(q) === 'SHORT_TEXT'),
    [questions],
  );

  const handleSaveManualGrade = async () => {
    if (!selectedAttempt || !isInstructor) return;
    const attemptStatus = (selectedAttempt.status || '').toUpperCase();
    if (attemptStatus === 'IN_PROGRESS') {
      toast.warning('Sinh viên đang làm bài, không thể chấm thủ công lúc này.');
      return;
    }

    const questionScores: Record<string, number> = {};
    for (const q of shortTextQuestions) {
      const qId = getQuestionId(q);
      const qMax = getQuestionPoints(q);
      const rawVal = scoreDrafts[qId] ?? '';
      const numeric = Number(rawVal);
      if (
        rawVal.trim() === '' ||
        !Number.isFinite(numeric) ||
        numeric < 0 ||
        numeric > qMax
      ) {
        toast.error(
          `Điểm câu tự luận "${getQuestionText(q).slice(0, 40)}" phải từ 0 đến ${qMax}.`,
        );
        return;
      }
      questionScores[qId] = numeric;
    }

    if (Object.keys(questionScores).length === 0) {
      toast.info('Bài kiểm tra này không có câu tự luận ngắn cần chấm.');
      return;
    }

    const targetAttemptId = getAttemptId(selectedAttempt);
    setSavingGrade(true);
    try {
      const updated = await manualGradeQuizAttempt(targetAttemptId, {
        questionScores,
        feedback: manualFeedback.trim() ? manualFeedback.trim() : null,
      });
      setAttempts((prev) =>
        prev.map((a) => (getAttemptId(a) === targetAttemptId ? updated : a)),
      );
      toast.success('Đã lưu điểm chấm tự luận và cập nhật bảng điểm.');
      onGraded?.();
    } catch (err) {
      toast.error(getQuizErrorMessage(err, 'Không thể lưu điểm chấm thủ công.'));
    } finally {
      setSavingGrade(false);
    }
  };

  const handleExportCsv = () => {
    if (attempts.length === 0) return;
    const headers = [
      'Lần thử',
      'MSSV',
      'Họ và tên',
      'Trạng thái',
      'Bắt đầu',
      'Nộp bài',
      'Điểm',
      'Điểm tối đa',
    ];
    const rows = attempts.map((att) => [
      att.attemptNo ?? 1,
      att.student_code ?? '',
      att.student_name ?? 'Sinh viên',
      formatSubmissionStatus(att.status),
      formatDateTimeVi(getAttemptStartedAt(att)),
      getAttemptSubmittedAt(att) ? formatDateTimeVi(getAttemptSubmittedAt(att)) : '',
      att.status === 'IN_PROGRESS' ? '' : att.score,
      maxScore,
    ]);
    const safeTitle = detailQuiz.title.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    exportToCsv(`ket-qua-quiz-${safeTitle || 'kiem-tra'}.csv`, headers, rows);
    toast.success('Đã xuất tệp CSV danh sách lượt làm bài.');
  };

  const pendingCount = useMemo(
    () =>
      attempts.filter((a) => (a.status || '').toUpperCase() === 'PENDING_REVIEW')
        .length,
    [attempts],
  );

  const attemptColumns: DataTableColumn<QuizAttempt>[] = [
    ...(isInstructor
      ? [
          {
            key: 'student',
            header: 'Sinh viên',
            sortable: true,
            sortValue: (row: QuizAttempt) => row.student_name ?? '',
            render: (row: QuizAttempt) => (
              <div>
                <p className="font-semibold text-[var(--lms-text)]">
                  {row.student_name || 'Sinh viên'}
                </p>
                <p className="text-xs text-[var(--lms-text-muted)]">
                  {row.student_code || 'Không có MSSV'} • Lần #{row.attemptNo ?? 1}
                </p>
              </div>
            ),
          } satisfies DataTableColumn<QuizAttempt>,
        ]
      : [
          {
            key: 'attemptNo',
            header: 'Lần làm bài',
            render: (row: QuizAttempt) => (
              <span className="tabular-nums font-semibold text-[var(--lms-text)]">
                Lần #{row.attemptNo ?? 1}
              </span>
            ),
          } satisfies DataTableColumn<QuizAttempt>,
        ]),
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <Badge variant={getAttemptStatusVariant(row.status)} size="sm" dot>
          {formatSubmissionStatus(row.status)}
        </Badge>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Thời gian nộp',
      render: (row) => (
        <span className="tabular-nums text-xs text-[var(--lms-text-muted)]">
          {getAttemptSubmittedAt(row)
            ? formatDateTimeVi(getAttemptSubmittedAt(row))
            : `Bắt đầu ${formatDateTimeVi(getAttemptStartedAt(row))}`}
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Điểm số',
      align: 'right',
      render: (row) => {
        const status = (row.status || '').toUpperCase();
        if (status === 'IN_PROGRESS') {
          return <Badge variant="info">Đang làm bài</Badge>;
        }
        if (status === 'PENDING_REVIEW') {
          return (
            <div className="text-right">
              <Badge variant="warning">Chờ giảng viên chấm</Badge>
              {row.score > 0 && (
                <p className="tabular-nums mt-0.5 text-xs text-[var(--lms-text-muted)]">
                  Tạm tính trắc nghiệm: {row.score}
                </p>
              )}
            </div>
          );
        }
        return (
          <span className="tabular-nums font-bold text-[var(--lms-text)]">
            {row.score} / {maxScore}
          </span>
        );
      },
    },
    {
      key: 'action',
      header: 'Xem',
      align: 'right',
      render: (row) => {
        const isSelected = getAttemptId(row) === selectedAttemptId;
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              selectAttempt(row);
            }}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              isSelected
                ? 'bg-blue-600 text-white dark:bg-blue-500'
                : 'border border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
            }`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {isInstructor && (row.status || '').toUpperCase() === 'PENDING_REVIEW'
              ? 'Chấm bài'
              : 'Chi tiết'}
          </button>
        );
      },
    },
  ];

  const answersAllowedForStudent =
    isInstructor || canStudentViewAnswers(detailQuiz);

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!savingGrade) onClose();
      }}
      title={
        isInstructor
          ? `Bài làm & Chấm tự luận: ${detailQuiz.title}`
          : `Lịch sử làm bài: ${detailQuiz.title}`
      }
      subtitle={
        isInstructor
          ? `${attempts.length} lượt làm bài${
              pendingCount > 0 ? ` • ${pendingCount} lượt chờ chấm tự luận` : ''
            }`
          : getScoreVisibilityHelperText(detailQuiz)
      }
      size="xl"
      closeOnBackdrop={!savingGrade}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {isInstructor ? (
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={attempts.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Xuất CSV ({attempts.length})
            </button>
          ) : (
            <span className="text-xs text-[var(--lms-text-muted)]">
              Chính sách: {formatScoreVisibility(detailQuiz.scoreVisibility)}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={savingGrade}
            className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
          >
            Đóng
          </button>
        </div>
      }
    >
      {loading ? (
        <SkeletonTable rows={4} columns={4} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={handleRetry} />
      ) : attempts.length === 0 ? (
        <EmptyState
          title="Chưa có lượt làm bài nào"
          description={
            isInstructor
              ? 'Sinh viên chưa bắt đầu làm bài kiểm tra này.'
              : 'Bạn chưa thực hiện lượt làm bài nào cho bài kiểm tra này.'
          }
        />
      ) : (
        <div className="space-y-5">
          {isInstructor && (
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lms-text-muted)]"
                  aria-hidden="true"
                />
                <input
                  id={`${baseId}-search`}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Tìm sinh viên theo tên hoặc MSSV..."
                  aria-label="Tìm sinh viên theo tên hoặc MSSV"
                  className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] py-1.5 pl-9 pr-3 text-xs text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'Tất cả' },
                    { id: 'PENDING_REVIEW', label: `Chờ chấm (${pendingCount})` },
                    { id: 'SUBMITTED', label: 'Đã nộp' },
                    { id: 'EXPIRED', label: 'Hết giờ' },
                    { id: 'IN_PROGRESS', label: 'Đang làm' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStatusFilter(item.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      statusFilter === item.id
                        ? 'bg-blue-600 text-white dark:bg-blue-500'
                        : 'border border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <DataTable<QuizAttempt>
            columns={attemptColumns}
            data={filteredAttempts}
            caption="Danh sách lượt làm bài kiểm tra"
            hideCaption
            getRowKey={(row) => getAttemptId(row)}
            onRowClick={selectAttempt}
          />

          {selectedAttempt && (
            <div className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/30 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--lms-border)] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--lms-text)]">
                    Chi tiết Lần #{selectedAttempt.attemptNo ?? 1}
                    {isInstructor && selectedAttempt.student_name
                      ? ` — ${selectedAttempt.student_name}`
                      : ''}
                  </h3>
                  <p className="text-xs text-[var(--lms-text-muted)]">
                    Bắt đầu: {formatDateTimeVi(getAttemptStartedAt(selectedAttempt))}
                    {getAttemptSubmittedAt(selectedAttempt)
                      ? ` • Nộp lúc: ${formatDateTimeVi(getAttemptSubmittedAt(selectedAttempt))}`
                      : ''}
                  </p>
                </div>
                <Badge variant={getAttemptStatusVariant(selectedAttempt.status)}>
                  {formatSubmissionStatus(selectedAttempt.status)}
                </Badge>
              </div>

              {(selectedAttempt.status || '').toUpperCase() === 'IN_PROGRESS' ? (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-100">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Lượt làm bài này đang diễn ra và chưa nộp. Kết quả chi tiết sẽ hiển thị sau khi bài được nộp hoặc hết giờ.
                  </span>
                </div>
              ) : !answersAllowedForStudent && !isInstructor ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-3 text-xs text-[var(--lms-text-muted)]">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{getScoreVisibilityHelperText(detailQuiz)}</span>
                </div>
              ) : parsedResults.length === 0 && !isInstructor ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-3 text-xs text-[var(--lms-text-muted)]">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Chi tiết câu trả lời hiện đang được ẩn theo cài đặt bài kiểm tra.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {questions.map((question, idx) => {
                    const qId = getQuestionId(question);
                    const qType = getQuestionType(question);
                    const qOpts = parseQuestionOptions(question);
                    const resultItem = parsedResults.find((r) => r.questionId === qId);
                    const studentAnswer =
                      resultItem?.studentAnswer ?? parsedAnswers[qId] ?? null;
                    const qMax = getQuestionPoints(question);

                    const formatChoiceLabel = (val?: string | null) => {
                      if (!val) return 'Chưa trả lời';
                      if (qType === 'TRUE_FALSE') {
                        return val.toLowerCase() === 'true' ? 'Đúng' : 'Sai';
                      }
                      const foundOpt = qOpts.find(
                        (o) => o.id.toLowerCase() === val.toLowerCase(),
                      );
                      return foundOpt ? `${foundOpt.id}. ${foundOpt.text}` : val;
                    };

                    return (
                      <div
                        key={qId}
                        className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-3.5 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="tabular-nums text-xs font-bold text-[var(--lms-text-muted)]">
                                Câu {idx + 1}
                              </span>
                              <Badge variant="neutral" size="sm">
                                {formatQuestionType(qType)}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium text-[var(--lms-text)] whitespace-pre-wrap">
                              {getQuestionText(question)}
                            </p>
                          </div>

                          {resultItem?.needsManualReview ? (
                            <Badge variant="warning" size="sm">
                              Chờ giảng viên chấm
                            </Badge>
                          ) : resultItem?.awardedScore != null ? (
                            <span
                              className={`tabular-nums inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                                resultItem.awardedScore >= qMax
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : resultItem.awardedScore > 0
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                    : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                              }`}
                            >
                              {resultItem.awardedScore >= qMax ? (
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : resultItem.awardedScore === 0 ? (
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : null}
                              {resultItem.awardedScore}/{qMax} đ
                            </span>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 px-3 py-2 text-xs">
                            <p className="font-semibold text-[var(--lms-text-muted)]">
                              Câu trả lời của sinh viên:
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-[var(--lms-text)]">
                              {formatChoiceLabel(studentAnswer)}
                            </p>
                          </div>

                          {(resultItem?.correctAnswer !== undefined || isInstructor) && (
                            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/40 px-3 py-2 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/20">
                              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                                {qType === 'SHORT_TEXT' ? 'Đáp án tham chiếu:' : 'Đáp án đúng:'}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-[var(--lms-text)]">
                                {formatChoiceLabel(
                                  resultItem?.correctAnswer ?? question.correctAnswer,
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        {isInstructor && qType === 'SHORT_TEXT' && (
                          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
                            <label
                              htmlFor={`${baseId}-grade-${qId}`}
                              className="text-xs font-semibold text-[var(--lms-text)]"
                            >
                              Chấm điểm câu {idx + 1} (0 – {qMax}):
                            </label>
                            <input
                              id={`${baseId}-grade-${qId}`}
                              type="number"
                              min="0"
                              max={qMax}
                              step="0.25"
                              value={scoreDrafts[qId] ?? '0'}
                              onChange={(event) =>
                                setScoreDrafts((prev) => ({
                                  ...prev,
                                  [qId]: event.target.value,
                                }))
                              }
                              className="tabular-nums w-28 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1 text-sm font-semibold text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isInstructor && shortTextQuestions.length > 0 && (
                    <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 space-y-3">
                      <label
                        htmlFor={`${baseId}-manual-feedback`}
                        className="block text-xs font-semibold text-[var(--lms-text)]"
                      >
                        Nhận xét chung cho lượt làm bài (tùy chọn)
                      </label>
                      <textarea
                        id={`${baseId}-manual-feedback`}
                        rows={2}
                        value={manualFeedback}
                        onChange={(event) => setManualFeedback(event.target.value)}
                        placeholder="Nhập nhận xét gửi sinh viên sau khi hoàn tất chấm câu tự luận..."
                        className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={savingGrade}
                          onClick={() => void handleSaveManualGrade()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          {savingGrade
                            ? 'Đang lưu điểm...'
                            : 'Lưu điểm chấm thủ công'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function QuizAttemptsModal(props: QuizAttemptsModalProps) {
  if (!props.isOpen || !props.quiz) return null;
  return (
    <QuizAttemptsInner
      key={`${getQuizId(props.quiz)}:${props.isInstructor ? 'inst' : 'stu'}`}
      onClose={props.onClose}
      quiz={props.quiz}
      isInstructor={props.isInstructor}
      onGraded={props.onGraded}
    />
  );
}
