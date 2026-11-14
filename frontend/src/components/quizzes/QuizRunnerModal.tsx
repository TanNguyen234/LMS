import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Send,
} from 'lucide-react';
import {
  getMyQuizAttempts,
  saveQuizDraft,
  startQuizAttempt,
  submitQuizAttempt,
} from '../../api/learning';
import type { Quiz, QuizAttempt, QuizAttemptStart } from '../../types';
import { formatQuestionType, formatSubmissionStatus } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import {
  formatCountdownSeconds,
  getAttemptId,
  getAttemptStatusVariant,
  getQuestionId,
  getQuestionPoints,
  getQuestionText,
  getQuestionType,
  getQuizDurationMinutes,
  getQuizErrorMessage,
  getQuizId,
  getScoreVisibilityHelperText,
  parseQuestionOptions,
} from './quizUtils';

export interface QuizRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz | null;
  onAttemptFinalized?: (attempt: QuizAttempt) => void;
}

type DraftSaveState = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';

function QuizRunnerInner({
  onClose,
  quiz,
  onAttemptFinalized,
}: {
  onClose: () => void;
  quiz: Quiz;
  onAttemptFinalized?: (attempt: QuizAttempt) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const baseId = useId();
  const quizId = getQuizId(quiz);

  const [session, setSession] = useState<QuizAttemptStart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedIds, setFlaggedIds] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [draftState, setDraftState] = useState<DraftSaveState>('IDLE');
  const [lastSavedText, setLastSavedText] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [finalizedAttempt, setFinalizedAttempt] = useState<QuizAttempt | null>(null);

  const answersRef = useRef<Record<string, string>>({});
  const dirtyRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const sessionRef = useRef<QuizAttemptStart | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const syncExpiredAttempt = useCallback(
    async (attemptId: string): Promise<boolean> => {
      try {
        const list = await getMyQuizAttempts(quizId);
        const match = list.find((a) => getAttemptId(a) === attemptId);
        if (match && (match.status || '').toUpperCase() !== 'IN_PROGRESS') {
          setFinalizedAttempt(match);
          onAttemptFinalized?.(match);
          return true;
        }
      } catch {
        // Ignore fallback lookup errors
      }
      return false;
    },
    [onAttemptFinalized, quizId],
  );

  const flushDraftSave = useCallback(async () => {
    const activeSession = sessionRef.current;
    if (!activeSession || finalizedAttempt || !dirtyRef.current) return;

    clearDebounce();
    dirtyRef.current = false;
    setDraftState('SAVING');

    try {
      await saveQuizDraft(activeSession.attemptId, answersRef.current);
      const nowLabel = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastSavedText(nowLabel);
      setDraftState('SAVED');
    } catch (err) {
      const msg = getQuizErrorMessage(err, '');
      if (msg.toLowerCase().includes('deadline') || msg.toLowerCase().includes('expired')) {
        const synced = await syncExpiredAttempt(activeSession.attemptId);
        if (synced) {
          toast.warning('Đã hết giờ làm bài — hệ thống đã chốt đáp án nháp cuối cùng.');
          return;
        }
      }
      dirtyRef.current = true;
      setDraftState('ERROR');
    }
  }, [clearDebounce, finalizedAttempt, syncExpiredAttempt, toast]);

  useEffect(() => {
    let cancelled = false;
    const defaultDuration = getQuizDurationMinutes(quiz);

    void startQuizAttempt(quizId)
      .then((started) => {
        if (cancelled) return;
        const sortedQuestions = [...(started.questions ?? [])].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        );
        const normalizedSession: QuizAttemptStart = {
          ...started,
          questions: sortedQuestions,
        };
        sessionRef.current = normalizedSession;
        setSession(normalizedSession);

        const initialAnswers: Record<string, string> = {};
        if (started.savedAnswers) {
          for (const [k, v] of Object.entries(started.savedAnswers)) {
            if (v != null && String(v).length > 0) {
              initialAnswers[k] = String(v);
            }
          }
        }
        answersRef.current = initialAnswers;
        setAnswers(initialAnswers);
        setError(null);

        const fallbackMs =
          new Date(started.startedAt).getTime() +
          (started.timeLimitMinutes || defaultDuration) * 60_000;
        const deadlineMs = started.deadlineAt
          ? new Date(started.deadlineAt).getTime()
          : fallbackMs;
        setRemainingSeconds(
          Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getQuizErrorMessage(err, 'Không thể bắt đầu bài kiểm tra.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearDebounce();
    };
  }, [clearDebounce, quiz, quizId, reloadNonce]);

  const handleRetry = () => {
    clearDebounce();
    dirtyRef.current = false;
    autoSubmittedRef.current = false;
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const performSubmit = useCallback(
    async (isAutoExpiry: boolean) => {
      const activeSession = sessionRef.current;
      if (!activeSession || submitting || finalizedAttempt) return;

      clearDebounce();
      setSubmitting(true);
      try {
        const result = await submitQuizAttempt(
          activeSession.attemptId,
          answersRef.current,
        );
        setFinalizedAttempt(result);
        onAttemptFinalized?.(result);
        toast.success(
          isAutoExpiry
            ? 'Hết giờ làm bài — hệ thống đã tự động nộp bài của bạn.'
            : 'Đã nộp bài kiểm tra thành công.',
        );
      } catch (err) {
        const synced = await syncExpiredAttempt(activeSession.attemptId);
        if (!synced) {
          toast.error(getQuizErrorMessage(err, 'Không thể nộp bài kiểm tra.'));
        } else {
          toast.warning('Bài làm đã được chốt do hết thời gian quy định.');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [clearDebounce, finalizedAttempt, onAttemptFinalized, submitting, syncExpiredAttempt, toast],
  );

  // Server-authoritative UTC countdown timer
  useEffect(() => {
    if (!session || finalizedAttempt) return;

    const deadlineMs = session.deadlineAt
      ? new Date(session.deadlineAt).getTime()
      : new Date(session.startedAt).getTime() + session.timeLimitMinutes * 60_000;

    if (Number.isNaN(deadlineMs)) return;

    const tick = () => {
      const secs = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        void performSubmit(true);
      }
    };

    const initialTimer = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [finalizedAttempt, performSubmit, session]);

  const questions = useMemo(() => session?.questions ?? [], [session]);
  const currentQuestion = questions[currentIndex] ?? null;

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const val = answers[getQuestionId(q)];
        return val !== undefined && val.trim().length > 0;
      }).length,
    [answers, questions],
  );

  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const handleAnswerChange = (questionId: string, value: string) => {
    const nextAnswers = {
      ...answersRef.current,
      [questionId]: value,
    };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    dirtyRef.current = true;
    setDraftState('IDLE');
    clearDebounce();
    debounceTimerRef.current = window.setTimeout(() => {
      void flushDraftSave();
    }, 2500);
  };

  const handleNavigateQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    if (dirtyRef.current) {
      void flushDraftSave();
    }
    setCurrentIndex(targetIndex);
  };

  const toggleFlag = (questionId: string) => {
    setFlaggedIds((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const handleRequestSubmit = async () => {
    if (submitting || finalizedAttempt) return;
    const confirmed = await confirm({
      title: 'Xác nhận nộp bài kiểm tra?',
      message:
        unansweredCount > 0
          ? `Bạn còn ${unansweredCount}/${questions.length} câu hỏi chưa trả lời. Sau khi nộp sẽ không thể chỉnh sửa.`
          : `Bạn đã trả lời toàn bộ ${questions.length} câu hỏi. Xác nhận nộp bài ngay?`,
      confirmText: 'Nộp bài ngay',
      cancelText: 'Quay lại kiểm tra',
      variant: unansweredCount > 0 ? 'danger' : 'primary',
    });
    if (!confirmed) return;
    await performSubmit(false);
  };

  const handleRequestClose = async () => {
    if (submitting) return;
    if (finalizedAttempt || !session || error) {
      onClose();
      return;
    }
    if (dirtyRef.current) {
      await flushDraftSave();
    }
    toast.info(
      'Bài làm của bạn được giữ ở trạng thái nháp. Hãy quay lại trước khi hết hạn.',
    );
    onClose();
  };

  const isWarningTime = remainingSeconds > 0 && remainingSeconds <= 120;
  const isCriticalTime = remainingSeconds > 0 && remainingSeconds <= 30;

  return (
    <Modal
      isOpen
      onClose={() => void handleRequestClose()}
      title={quiz.title}
      subtitle={
        session && !finalizedAttempt
          ? `Lượt #${session.attemptNo} • Đã trả lời ${answeredCount}/${questions.length} câu`
          : undefined
      }
      size="xl"
      closeOnBackdrop={Boolean(finalizedAttempt || error)}
      footer={
        finalizedAttempt ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Hoàn tất
          </button>
        ) : session && !error ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--lms-text-muted)]">
              {draftState === 'SAVING'
                ? 'Đang lưu nháp...'
                : draftState === 'SAVED'
                  ? `Đã lưu nháp lúc ${lastSavedText}`
                  : draftState === 'ERROR'
                    ? 'Không thể tự động lưu nháp — sẽ thử lại khi thao tác'
                    : 'Tự động lưu nháp mỗi 2,5 giây'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRequestClose()}
                disabled={submitting}
                className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
              >
                Tạm thoát (giữ nháp)
              </button>
              <button
                type="button"
                onClick={() => void handleRequestSubmit()}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Đang nộp bài...' : 'Nộp bài'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)]"
          >
            Đóng
          </button>
        )
      }
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <SkeletonCard lines={4} />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={handleRetry} />
      ) : finalizedAttempt ? (
        <div className="space-y-4 py-2">
          <div className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-bold text-[var(--lms-text)]">
              Đã ghi nhận bài làm (Lần #{finalizedAttempt.attemptNo ?? 1})
            </h3>
            <div className="flex justify-center">
              <Badge variant={getAttemptStatusVariant(finalizedAttempt.status)} dot>
                {formatSubmissionStatus(finalizedAttempt.status)}
              </Badge>
            </div>

            {(finalizedAttempt.status || '').toUpperCase() === 'PENDING_REVIEW' ? (
              <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
                Bài làm có câu hỏi Tự luận ngắn nên đang ở trạng thái Chờ giảng viên chấm điểm.
                {finalizedAttempt.score > 0
                  ? ` Điểm phần trắc nghiệm tạm tính: ${finalizedAttempt.score}.`
                  : ''}
              </div>
            ) : (
              <div className="mx-auto max-w-sm rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4">
                <p className="text-xs text-[var(--lms-text-muted)]">Điểm đạt được</p>
                <p className="tabular-nums mt-1 text-3xl font-extrabold text-[var(--lms-text)]">
                  {finalizedAttempt.score} / {session?.maxScore ?? 10}
                </p>
              </div>
            )}

            <p className="text-xs text-[var(--lms-text-muted)]">
              {getScoreVisibilityHelperText(quiz)}
            </p>
          </div>
        </div>
      ) : session && questions.length === 0 ? (
        <ErrorBanner message="Bài kiểm tra này chưa có câu hỏi nào." />
      ) : session && currentQuestion ? (
        <div className="space-y-4">
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 ${
              isCriticalTime
                ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100'
                : isWarningTime
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
                  : 'border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 text-[var(--lms-text)]'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              {isWarningTime ? (
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {isWarningTime
                  ? 'Sắp hết thời gian làm bài — hệ thống sẽ tự động nộp khi đồng hồ về 00:00.'
                  : 'Thời gian còn lại (đồng bộ theo máy chủ)'}
              </span>
            </div>
            <span
              className="tabular-nums text-lg font-extrabold tracking-tight"
              aria-live="off"
            >
              {formatCountdownSeconds(remainingSeconds)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <aside className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3.5 lg:col-span-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--lms-text-muted)]">
                Danh sách câu hỏi ({questions.length})
              </h3>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 lg:grid-cols-5">
                {questions.map((q, idx) => {
                  const qId = getQuestionId(q);
                  const isCurrent = idx === currentIndex;
                  const isAnswered =
                    answers[qId] !== undefined && answers[qId].trim().length > 0;
                  const isFlagged = Boolean(flaggedIds[qId]);

                  return (
                    <button
                      key={qId}
                      type="button"
                      onClick={() => handleNavigateQuestion(idx)}
                      aria-label={`Câu ${idx + 1}${isAnswered ? ', đã trả lời' : ', chưa trả lời'}${isFlagged ? ', đã đánh dấu' : ''}`}
                      className={`tabular-nums relative flex h-9 items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
                        isCurrent
                          ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                          : isAnswered
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                            : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
                      }`}
                    >
                      {idx + 1}
                      {isFlagged && (
                        <span
                          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-[var(--lms-surface)]"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] text-[var(--lms-text-muted)]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" aria-hidden="true" />
                  <span>Đã trả lời ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs border border-[var(--lms-border)] bg-[var(--lms-surface)]" aria-hidden="true" />
                  <span>Chưa trả lời ({unansweredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
                  <span>Đánh dấu xem lại</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-blue-600" aria-hidden="true" />
                  <span>Đang xem</span>
                </div>
              </div>
            </aside>

            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 lg:col-span-8 flex flex-col justify-between gap-4">
              {(() => {
                const qId = getQuestionId(currentQuestion);
                const qType = getQuestionType(currentQuestion);
                const qOpts = parseQuestionOptions(currentQuestion);
                const currentAnswer = answers[qId] ?? '';
                const isFlagged = Boolean(flaggedIds[qId]);

                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--lms-border)] pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums text-sm font-bold text-[var(--lms-text)]">
                          Câu {currentIndex + 1} / {questions.length}
                        </span>
                        <Badge variant="info" size="sm">
                          {formatQuestionType(qType)}
                        </Badge>
                        <span className="tabular-nums text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {getQuestionPoints(currentQuestion)} điểm
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleFlag(qId)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isFlagged
                            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                            : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
                        }`}
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                        {isFlagged ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}
                      </button>
                    </div>

                    <p className="text-base font-medium leading-relaxed text-[var(--lms-text)] whitespace-pre-wrap">
                      {getQuestionText(currentQuestion)}
                    </p>

                    {qType === 'SHORT_TEXT' ? (
                      <div>
                        <label
                          htmlFor={`${baseId}-short-answer-${qId}`}
                          className="mb-1.5 block text-xs font-semibold text-[var(--lms-text-muted)]"
                        >
                          Câu trả lời của bạn
                        </label>
                        <textarea
                          id={`${baseId}-short-answer-${qId}`}
                          rows={5}
                          value={currentAnswer}
                          onChange={(event) =>
                            handleAnswerChange(qId, event.target.value)
                          }
                          placeholder="Nhập câu trả lời ngắn gọn, rõ ý..."
                          className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2.5 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    ) : (
                      <div
                        className="space-y-2"
                        role="radiogroup"
                        aria-label={`Lựa chọn cho câu ${currentIndex + 1}`}
                      >
                        {qOpts.map((opt) => {
                          const selected =
                            currentAnswer.toLowerCase() === opt.id.toLowerCase();
                          return (
                            <label
                              key={opt.id}
                              htmlFor={`${baseId}-choice-${qId}-${opt.id}`}
                              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                                selected
                                  ? 'border-blue-500 bg-blue-50/70 text-[var(--lms-text)] ring-1 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/40'
                                  : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]/60'
                              }`}
                            >
                              <input
                                id={`${baseId}-choice-${qId}-${opt.id}`}
                                type="radio"
                                name={`${baseId}-q-${qId}`}
                                checked={selected}
                                onChange={() => handleAnswerChange(qId, opt.id)}
                                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="font-bold text-[var(--lms-text-muted)]">
                                {opt.id.toUpperCase()}.
                              </span>
                              <span className="flex-1">{opt.text}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex items-center justify-between gap-2 border-t border-[var(--lms-border)] pt-3">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => handleNavigateQuestion(currentIndex - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Câu trước
                </button>
                <button
                  type="button"
                  disabled={currentIndex >= questions.length - 1}
                  onClick={() => handleNavigateQuestion(currentIndex + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-40"
                >
                  Câu tiếp theo
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export function QuizRunnerModal(props: QuizRunnerModalProps) {
  if (!props.isOpen || !props.quiz) return null;
  return (
    <QuizRunnerInner
      key={getQuizId(props.quiz)}
      onClose={props.onClose}
      quiz={props.quiz}
      onAttemptFinalized={props.onAttemptFinalized}
    />
  );
}
