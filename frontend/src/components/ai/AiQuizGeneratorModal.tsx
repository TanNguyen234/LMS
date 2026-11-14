import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, PlusCircle, RefreshCw, Trash2 } from 'lucide-react';
import {
  generateQuizDrafts,
  type AiGeneratedQuestion,
  type AiProviderMode,
} from '../../api/ai';
import { ApiError } from '../../api/http';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';

export interface AiQuizGeneratorModalProps {
  courseId: string;
  lessons: { lessonId: string; title: string }[];
  isOpen: boolean;
  onClose: () => void;
  onAccept: (questions: AiGeneratedQuestion[]) => void;
}

type QuestionTypeOption = 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT';

const QUESTION_TYPE_LABELS: Record<QuestionTypeOption, string> = {
  SINGLE_CHOICE: 'Trắc nghiệm 1 đáp án',
  TRUE_FALSE: 'Đúng / Sai',
  SHORT_TEXT: 'Trả lời ngắn',
};

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

function parseChoiceOptions(optionsJson?: string | null): Record<string, string> {
  const defaults: Record<string, string> = { A: '', B: '', C: '', D: '' };
  if (!optionsJson) return defaults;
  try {
    const parsed: unknown = JSON.parse(optionsJson);
    if (Array.isArray(parsed)) {
      parsed.forEach((item, idx) => {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const key = String(rec.key ?? rec.id ?? rec.value ?? OPTION_KEYS[idx] ?? idx + 1);
          defaults[key] = String(rec.text ?? rec.label ?? '');
        }
      });
      return defaults;
    }
    if (parsed && typeof parsed === 'object') {
      const next: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
        next[key] = String(val ?? '');
      }
      return Object.keys(next).length > 0 ? next : defaults;
    }
  } catch {
    return defaults;
  }
  return defaults;
}

export function AiQuizGeneratorModal(props: AiQuizGeneratorModalProps) {
  if (!props.isOpen) {
    return null;
  }

  return <AiQuizGeneratorModalInner key={props.courseId} {...props} />;
}

function AiQuizGeneratorModalInner({
  courseId,
  lessons,
  isOpen,
  onClose,
  onAccept,
}: AiQuizGeneratorModalProps) {
  const countInputId = useId();
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const [lessonSelection, setLessonSelection] = useState<string[] | null>(null);
  const [count, setCount] = useState<number>(5);
  const [selectedTypes, setSelectedTypes] = useState<QuestionTypeOption[]>([
    'SINGLE_CHOICE',
    'TRUE_FALSE',
  ]);
  const [drafts, setDrafts] = useState<AiGeneratedQuestion[]>([]);
  const [providerMode, setProviderMode] = useState<AiProviderMode | null>(null);
  const [insufficientText, setInsufficientText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const validLessonIds = new Set(lessons.map((l) => l.lessonId));
  const selectedLessonIds =
    lessonSelection === null
      ? lessons.slice(0, 3).map((l) => l.lessonId)
      : lessonSelection.filter((id) => validLessonIds.has(id));

  const toggleLesson = (lessonId: string) => {
    setLessonSelection((prev) => {
      const base =
        prev === null
          ? lessons.slice(0, 3).map((l) => l.lessonId)
          : prev.filter((id) => validLessonIds.has(id));
      return base.includes(lessonId) ? base.filter((id) => id !== lessonId) : [...base, lessonId];
    });
  };

  const toggleSelectAllLessons = () => {
    if (selectedLessonIds.length === lessons.length) {
      setLessonSelection([]);
    } else {
      setLessonSelection(lessons.map((l) => l.lessonId));
    }
  };

  const toggleQuestionType = (qType: QuestionTypeOption) => {
    setSelectedTypes((prev) =>
      prev.includes(qType) ? prev.filter((item) => item !== qType) : [...prev, qType],
    );
  };

  const handleGenerate = async () => {
    if (selectedLessonIds.length === 0) {
      setError('Vui lòng chọn ít nhất 1 bài học nguồn.');
      return;
    }
    if (selectedTypes.length === 0) {
      setError('Vui lòng chọn ít nhất 1 loại câu hỏi.');
      return;
    }
    const clampedCount = Math.min(20, Math.max(1, Number(count) || 5));
    setCount(clampedCount);
    setError(null);
    setLoading(true);
    const seq = ++requestSeqRef.current;

    try {
      const res = await generateQuizDrafts({
        courseId,
        lessonIds: selectedLessonIds,
        count: clampedCount,
        questionTypes: selectedTypes,
      });
      if (mountedRef.current && requestSeqRef.current === seq) {
        setDrafts(res.questions);
        setProviderMode(res.providerMode);
        setInsufficientText(res.insufficientText);
      }
    } catch (err) {
      if (mountedRef.current && requestSeqRef.current === seq) {
        const message =
          err instanceof ApiError
            ? err.detail
            : 'Không thể tạo câu hỏi nháp bằng AI. Vui lòng thử lại.';
        setError(message);
      }
    } finally {
      if (mountedRef.current && requestSeqRef.current === seq) {
        setLoading(false);
      }
    }
  };

  const updateDraft = (index: number, patch: Partial<AiGeneratedQuestion>) => {
    setDrafts((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  };

  const updateSingleChoiceOption = (index: number, key: string, value: string) => {
    const target = drafts[index];
    if (!target) return;
    const map = parseChoiceOptions(target.optionsJson);
    map[key] = value;
    updateDraft(index, { optionsJson: JSON.stringify(map) });
  };

  const removeDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAcceptDrafts = () => {
    for (let i = 0; i < drafts.length; i += 1) {
      const item = drafts[i];
      if (!item.questionText.trim()) {
        setError(`Câu hỏi #${i + 1} đang bị trống nội dung.`);
        return;
      }
      if (!item.correctAnswer.trim()) {
        setError(`Câu hỏi #${i + 1} chưa có đáp án đúng.`);
        return;
      }
      if (item.score <= 0) {
        setError(`Điểm của câu hỏi #${i + 1} phải lớn hơn 0.`);
        return;
      }
      if (item.questionType === 'SINGLE_CHOICE') {
        const opts = parseChoiceOptions(item.optionsJson);
        const nonEmptyKeys = Object.entries(opts)
          .filter(([, text]) => text.trim().length > 0)
          .map(([k]) => k);
        if (nonEmptyKeys.length < 2) {
          setError(`Câu trắc nghiệm #${i + 1} cần ít nhất 2 lựa chọn hợp lệ.`);
          return;
        }
        if (!nonEmptyKeys.includes(item.correctAnswer)) {
          setError(`Đáp án đúng của câu #${i + 1} phải khớp với một lựa chọn có nội dung.`);
          return;
        }
      }
    }

    onAccept(drafts);
    onClose();
  };

  const footerContent = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-10 items-center rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] transition-colors hover:bg-[var(--lms-surface-muted)]"
      >
        Đóng
      </button>
      <button
        type="button"
        onClick={handleAcceptDrafts}
        disabled={drafts.length === 0 || loading}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        <span>Chấp nhận {drafts.length} câu hỏi nháp</span>
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Tạo câu hỏi Quiz nháp"
      subtitle="Rà soát, chỉnh sửa hoặc bỏ từng câu hỏi nháp trước khi đưa vào bài kiểm tra."
      size="xl"
      footer={footerContent}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-bg)]/70 p-4 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--lms-text)]">
                1. Chọn bài giảng nguồn ({selectedLessonIds.length}/{lessons.length})
              </span>
              {lessons.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllLessons}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {selectedLessonIds.length === lessons.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              )}
            </div>

            {lessons.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--lms-text-muted)]">
                Khóa học chưa có bài giảng nào để trích xuất câu hỏi.
              </p>
            ) : (
              <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {lessons.map((lesson) => {
                  const checkboxId = `ai-quiz-lesson-${lesson.lessonId}`;
                  const checked = selectedLessonIds.includes(lesson.lessonId);
                  return (
                    <label
                      key={lesson.lessonId}
                      htmlFor={checkboxId}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm hover:bg-[var(--lms-surface-muted)]"
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLesson(lesson.lessonId)}
                        className="h-4 w-4 rounded border-[var(--lms-border)] text-blue-600"
                      />
                      <span className="truncate text-[var(--lms-text)]">{lesson.title}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor={countInputId}
                className="block text-sm font-semibold text-[var(--lms-text)]"
              >
                2. Số lượng câu hỏi (1 - 20)
              </label>
              <input
                id={countInputId}
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-1.5 w-32 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-base tabular-nums text-[var(--lms-text)]"
              />
            </div>

            <div>
              <span className="block text-sm font-semibold text-[var(--lms-text)]">
                3. Loại câu hỏi
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT'] as QuestionTypeOption[]).map(
                  (qType) => {
                    const typeId = `ai-quiz-type-${qType}`;
                    const active = selectedTypes.includes(qType);
                    return (
                      <label
                        key={qType}
                        htmlFor={typeId}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                            : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)]'
                        }`}
                      >
                        <input
                          id={typeId}
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleQuestionType(qType)}
                          className="h-4 w-4 rounded border-[var(--lms-border)] text-blue-600"
                        />
                        <span>{QUESTION_TYPE_LABELS[qType]}</span>
                      </label>
                    );
                  },
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={loading || lessons.length === 0}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : drafts.length > 0 ? (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {loading
                  ? 'Đang tạo câu hỏi nháp...'
                  : drafts.length > 0
                    ? 'Tạo lại bộ câu hỏi nháp'
                    : 'Sinh câu hỏi nháp'}
              </span>
            </button>
          </div>
        </div>

        {error && <ErrorBanner title="Không thể tạo câu hỏi" message={error} />}

        {providerMode && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--lms-text)]">
                Danh sách câu hỏi nháp ({drafts.length})
              </span>
              <Badge variant={providerMode === 'GEMINI' ? 'primary' : 'info'} dot>
                {providerMode === 'GEMINI' ? 'Gemini AI' : 'Xử lý cục bộ (Offline)'}
              </Badge>
            </div>
            {insufficientText && (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Các bài học đã chọn chưa đủ văn bản để sinh thêm câu hỏi.
              </span>
            )}
          </div>
        )}

        {drafts.length === 0 ? (
          <EmptyState
            compact
            title={
              providerMode
                ? 'Chưa có câu hỏi nháp phù hợp'
                : 'Chưa có câu hỏi nháp nào được tạo'
            }
            description="Chọn bài giảng nguồn và nhấn 'Sinh câu hỏi nháp' để AI tạo danh sách câu hỏi cho bạn rà soát."
          />
        ) : (
          <div className="space-y-4">
            {drafts.map((item, idx) => {
              const qInputId = `ai-draft-text-${idx}`;
              const scoreInputId = `ai-draft-score-${idx}`;
              const ansInputId = `ai-draft-answer-${idx}`;
              const choiceMap =
                item.questionType === 'SINGLE_CHOICE'
                  ? parseChoiceOptions(item.optionsJson)
                  : {};

              return (
                <div
                  key={`${idx}-${item.questionType}`}
                  className="space-y-3 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--lms-text)]">
                        Câu {idx + 1}
                      </span>
                      <Badge variant="neutral">{QUESTION_TYPE_LABELS[item.questionType]}</Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraft(idx)}
                      aria-label={`Bỏ câu hỏi nháp số ${idx + 1}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Bỏ câu này</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={qInputId}
                        className="block text-xs font-medium text-[var(--lms-text-muted)]"
                      >
                        Nội dung câu hỏi
                      </label>
                      <textarea
                        id={qInputId}
                        rows={2}
                        value={item.questionText}
                        onChange={(e) => updateDraft(idx, { questionText: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-bg)] px-3 py-2 text-sm text-[var(--lms-text)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={scoreInputId}
                        className="block text-xs font-medium text-[var(--lms-text-muted)]"
                      >
                        Điểm
                      </label>
                      <input
                        id={scoreInputId}
                        type="number"
                        min={0.25}
                        step={0.25}
                        value={item.score}
                        onChange={(e) =>
                          updateDraft(idx, { score: Number(e.target.value) || 1 })
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-bg)] px-3 py-2 text-sm tabular-nums text-[var(--lms-text)]"
                      />
                    </div>
                  </div>

                  {item.questionType === 'SINGLE_CHOICE' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Object.entries(choiceMap).map(([optKey, optText]) => {
                        const optId = `ai-draft-${idx}-opt-${optKey}`;
                        return (
                          <div
                            key={optKey}
                            className="flex items-center gap-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-bg)]/60 px-2.5 py-1.5"
                          >
                            <input
                              type="radio"
                              name={`ai-correct-${idx}`}
                              checked={item.correctAnswer.toUpperCase() === optKey.toUpperCase()}
                              onChange={() => updateDraft(idx, { correctAnswer: optKey })}
                              aria-label={`Chọn ${optKey} làm đáp án đúng cho câu ${idx + 1}`}
                            />
                            <label
                              htmlFor={optId}
                              className="w-5 shrink-0 text-xs font-bold text-[var(--lms-text-muted)]"
                            >
                              {optKey}
                            </label>
                            <input
                              id={optId}
                              type="text"
                              value={optText}
                              onChange={(e) =>
                                updateSingleChoiceOption(idx, optKey, e.target.value)
                              }
                              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--lms-text)] focus:outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {item.questionType === 'TRUE_FALSE' && (
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium text-[var(--lms-text-muted)]">
                        Đáp án đúng:
                      </span>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--lms-text)]">
                        <input
                          type="radio"
                          name={`ai-tf-${idx}`}
                          checked={item.correctAnswer.toLowerCase() === 'true'}
                          onChange={() => updateDraft(idx, { correctAnswer: 'true' })}
                        />
                        <span>Đúng</span>
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--lms-text)]">
                        <input
                          type="radio"
                          name={`ai-tf-${idx}`}
                          checked={item.correctAnswer.toLowerCase() === 'false'}
                          onChange={() => updateDraft(idx, { correctAnswer: 'false' })}
                        />
                        <span>Sai</span>
                      </label>
                    </div>
                  )}

                  {item.questionType === 'SHORT_TEXT' && (
                    <div>
                      <label
                        htmlFor={ansInputId}
                        className="block text-xs font-medium text-[var(--lms-text-muted)]"
                      >
                        Đáp án tham khảo (Short Text)
                      </label>
                      <input
                        id={ansInputId}
                        type="text"
                        value={item.correctAnswer}
                        onChange={(e) => updateDraft(idx, { correctAnswer: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-bg)] px-3 py-2 text-sm text-[var(--lms-text)]"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default AiQuizGeneratorModal;
