import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import {
  AlertTriangle,
  BookOpen,
  FileText,
  HelpCircle,
  ListChecks,
  Loader2,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import { askLessonTutor, type AiTutorMode, type AiTutorResponse } from '../../api/ai';
import { ApiError } from '../../api/http';
import { Badge } from '../ui/Badge';
import { ErrorBanner } from '../ui/ErrorBanner';

export interface LessonAiTutorDrawerProps {
  lessonId: string;
  lessonTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ModeOption {
  mode: AiTutorMode;
  label: string;
  description: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'SUMMARY',
    label: 'Tóm tắt',
    description: 'Tổng hợp các ý chính và từ khóa trọng tâm của bài giảng.',
  },
  {
    mode: 'EXPLAIN',
    label: 'Giải thích',
    description: 'Diễn giải chi tiết khái niệm cốt lõi hoặc phần nội dung bạn quan tâm.',
  },
  {
    mode: 'PRACTICE_QUESTIONS',
    label: 'Câu hỏi luyện tập',
    description: 'Tạo nhanh câu hỏi tự ôn tập kèm gợi ý tham khảo từ bài học.',
  },
  {
    mode: 'QA',
    label: 'Hỏi đáp',
    description: 'Đặt câu hỏi trực tiếp dựa trên nội dung bài giảng và tài liệu đính kèm.',
  },
];

function ModeIcon({ mode }: { mode: AiTutorMode }) {
  switch (mode) {
    case 'SUMMARY':
      return <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case 'EXPLAIN':
      return <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case 'PRACTICE_QUESTIONS':
      return <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />;
    default:
      return <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }
}

interface LessonAiTutorContentProps {
  lessonId: string;
  lessonTitle: string;
  titleId: string;
  subtitleId: string;
  onClose: () => void;
}

export function LessonAiTutorDrawer({
  lessonId,
  lessonTitle,
  isOpen,
  onClose,
}: LessonAiTutorDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.setAttribute('closedby', 'any');

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className="my-4 mr-4 ml-auto h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-0 text-[var(--lms-text)] shadow-2xl animate-slideUp open:flex open:flex-col"
    >
      <LessonAiTutorContent
        key={lessonId}
        lessonId={lessonId}
        lessonTitle={lessonTitle}
        titleId={titleId}
        subtitleId={subtitleId}
        onClose={onClose}
      />
    </dialog>
  );
}

function LessonAiTutorContent({
  lessonId,
  lessonTitle,
  titleId,
  subtitleId,
  onClose,
}: LessonAiTutorContentProps) {
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const questionId = useId();

  const [activeMode, setActiveMode] = useState<AiTutorMode>('SUMMARY');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiTutorResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const executeTutor = async (modeToRun: AiTutorMode, questionText: string) => {
    const trimmed = questionText.trim();
    if (modeToRun === 'QA' && !trimmed) {
      setValidationError('Vui lòng nhập câu hỏi trước khi gửi ở chế độ Hỏi đáp.');
      return;
    }

    setValidationError(null);
    setError(null);
    setLoading(true);
    const seq = ++requestSeqRef.current;

    try {
      const data = await askLessonTutor({
        lessonId,
        mode: modeToRun,
        question: trimmed || undefined,
      });
      if (mountedRef.current && requestSeqRef.current === seq) {
        setResult(data);
      }
    } catch (err) {
      if (mountedRef.current && requestSeqRef.current === seq) {
        const message =
          err instanceof ApiError
            ? err.detail
            : 'Không thể kết nối trợ lý AI bài học. Vui lòng thử lại.';
        setError(message);
      }
    } finally {
      if (mountedRef.current && requestSeqRef.current === seq) {
        setLoading(false);
      }
    }
  };

  const handleModeClick = (mode: AiTutorMode) => {
    setActiveMode(mode);
    setValidationError(null);
    if (mode !== 'QA') {
      void executeTutor(mode, question);
    }
  };

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    void executeTutor(activeMode, question);
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      void executeTutor(activeMode, question);
    }
  };

  const activeMeta = MODE_OPTIONS.find((item) => item.mode === activeMode) ?? MODE_OPTIONS[0];

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--lms-border)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="text-lg font-semibold leading-6 text-[var(--lms-text)]">
              Trợ lý AI Bài học
            </h2>
            {result && (
              <Badge
                variant={result.providerMode === 'GEMINI' ? 'primary' : 'info'}
                dot
              >
                {result.providerMode === 'GEMINI' ? 'Gemini AI' : 'Xử lý cục bộ (Offline)'}
              </Badge>
            )}
          </div>
          <p id={subtitleId} className="mt-1 truncate text-sm text-[var(--lms-text-muted)]">
            {lessonTitle}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng ngăn trợ lý AI"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--lms-text-muted)] transition-colors hover:bg-[var(--lms-surface-muted)] hover:text-[var(--lms-text)]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
            Chế độ hỗ trợ
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((item) => {
              const selected = item.mode === activeMode;
              return (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => handleModeClick(item.mode)}
                  disabled={loading}
                  aria-pressed={selected}
                  className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ${
                    selected
                      ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                      : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
                  }`}
                >
                  <ModeIcon mode={item.mode} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--lms-text-muted)]">{activeMeta.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor={questionId} className="text-sm font-medium text-[var(--lms-text)]">
            {activeMode === 'QA'
              ? 'Câu hỏi về bài học'
              : 'Yêu cầu bổ sung hoặc từ khóa trọng tâm (tùy chọn)'}
          </label>
          <textarea
            id={questionId}
            rows={3}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (validationError) setValidationError(null);
            }}
            onKeyDown={handleTextareaKeyDown}
            placeholder={
              activeMode === 'QA'
                ? 'Ví dụ: Sự khác nhau giữa vòng lặp for và while trong bài này là gì?'
                : 'Nhập khái niệm muốn tập trung hoặc nhấn gửi ngay...'
            }
            aria-invalid={Boolean(validationError)}
            className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-bg)] px-3.5 py-2.5 text-base text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-600 focus:outline-none"
          />
          {validationError && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {validationError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--lms-text-muted)]">
              Nhấn Enter để gửi, Shift+Enter để xuống dòng.
            </span>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{loading ? 'Đang xử lý...' : 'Hỏi trợ lý AI'}</span>
            </button>
          </div>
        </form>

        {error && (
          <ErrorBanner
            title="Không thể nhận phản hồi AI"
            message={error}
            onRetry={() => void executeTutor(activeMode, question)}
          />
        )}

        <div
          aria-live="polite"
          aria-atomic="true"
          className="flex-1 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-bg)]/70 p-4"
        >
          {loading ? (
            <div className="flex items-center gap-3 py-6 text-sm text-[var(--lms-text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
              <span>Đang tổng hợp nội dung từ bài giảng và tài liệu đính kèm...</span>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {result.insufficientText && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  <span>
                    Bài giảng hiện chưa có đủ nội dung văn bản hoặc tài liệu trích xuất được (ví dụ bài chỉ có video).
                  </span>
                </div>
              )}

              <div className="whitespace-pre-wrap text-sm leading-6 text-[var(--lms-text)]">
                {result.answer}
              </div>

              {result.citations.length > 0 && (
                <div className="border-t border-[var(--lms-border)] pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
                    Nguồn trích dẫn từ bài học
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-xs text-[var(--lms-text-muted)]">
                    {result.citations.map((citation, index) => (
                      <li
                        key={`${index}-${citation.slice(0, 24)}`}
                        className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-1.5 text-[var(--lms-text)]"
                      >
                        {citation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-8 w-8 text-[var(--lms-text-muted)]" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[var(--lms-text)]">
                Chọn một chế độ hoặc đặt câu hỏi để bắt đầu
              </p>
              <p className="mt-1 text-xs text-[var(--lms-text-muted)]">
                Trợ lý chỉ sử dụng nội dung bài giảng và tài liệu đính kèm, không đọc đáp án đề thi.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default LessonAiTutorDrawer;
