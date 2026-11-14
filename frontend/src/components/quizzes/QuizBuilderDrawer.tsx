import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Lock,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { getCourseModules } from '../../api/content';
import type { AiGeneratedQuestion } from '../../api/ai';
import {
  addQuizQuestion,
  deleteQuizQuestion,
  getQuizAttempts,
  getQuizDetail,
  updateQuizQuestion,
  type QuizQuestionSavePayload,
} from '../../api/learning';
import type { Quiz, QuizQuestion } from '../../types';
import { formatQuestionType } from '../../utils/formatters';
import { AiQuizGeneratorModal } from '../ai/AiQuizGeneratorModal';
import { Badge } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import {
  getQuestionId,
  getQuestionPoints,
  getQuestionText,
  getQuestionType,
  getQuizErrorMessage,
  getQuizId,
  parseQuestionOptions,
  serializeSingleChoiceOptions,
  type NormalizedQuestionOption,
  type QuizQuestionTypeValue,
} from './quizUtils';

export interface QuizBuilderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz | null;
  courseId: string;
  onChanged?: () => void;
}

function makeEmptyOptions(): NormalizedQuestionOption[] {
  return [
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ];
}

function QuizBuilderInner({
  onClose,
  quiz,
  courseId,
  onChanged,
}: {
  onClose: () => void;
  quiz: Quiz;
  courseId: string;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const baseId = useId();
  const quizId = getQuizId(quiz);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [lessons, setLessons] = useState<Array<{ lessonId: string; title: string }>>([]);
  const [hasAttempts, setHasAttempts] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [mutating, setMutating] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] =
    useState<QuizQuestionTypeValue>('SINGLE_CHOICE');
  const [options, setOptions] = useState<NormalizedQuestionOption[]>(makeEmptyOptions);
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [pointsInput, setPointsInput] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);

  const [aiModalOpen, setAiModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      getQuizDetail(quizId),
      getQuizAttempts(quizId),
      courseId ? getCourseModules(courseId) : Promise.resolve([]),
    ])
      .then(([detail, attemptsRes, modulesRes]) => {
        if (cancelled) return;

        if (detail.status === 'fulfilled') {
          const sorted = [...(detail.value.questions ?? [])].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          );
          setQuestions(sorted);
          setError(null);
        } else {
          setError(
            getQuizErrorMessage(detail.reason, 'Không thể tải ngân hàng câu hỏi.'),
          );
        }

        if (attemptsRes.status === 'fulfilled') {
          setHasAttempts(attemptsRes.value.length > 0);
        } else {
          setHasAttempts(false);
        }

        if (modulesRes.status === 'fulfilled') {
          const flatLessons: Array<{ lessonId: string; title: string }> = [];
          for (const mod of modulesRes.value) {
            for (const lesson of mod.lessons ?? []) {
              flatLessons.push({
                lessonId: String(lesson.lessonId ?? lesson.id),
                title: `${mod.title} — ${lesson.title}`,
              });
            }
          }
          setLessons(flatLessons);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, quizId, reloadNonce]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const totalScore = useMemo(
    () => questions.reduce((sum, q) => sum + getQuestionPoints(q), 0),
    [questions],
  );

  const openCreateForm = () => {
    setEditingQuestion(null);
    setQuestionText('');
    setQuestionType('SINGLE_CHOICE');
    setOptions(makeEmptyOptions());
    setCorrectAnswer('A');
    setPointsInput('1');
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditForm = (question: QuizQuestion) => {
    const qType = getQuestionType(question);
    setEditingQuestion(question);
    setQuestionText(getQuestionText(question));
    setQuestionType(qType);
    setPointsInput(String(getQuestionPoints(question)));
    setFormError(null);

    if (qType === 'SINGLE_CHOICE') {
      const parsed = parseQuestionOptions(question);
      const nextOpts = parsed.length >= 2 ? parsed : makeEmptyOptions();
      setOptions(nextOpts);
      setCorrectAnswer(question.correctAnswer ?? nextOpts[0]?.id ?? 'A');
    } else if (qType === 'TRUE_FALSE') {
      setOptions(makeEmptyOptions());
      const ansLower = (question.correctAnswer ?? 'true').toLowerCase();
      setCorrectAnswer(ansLower === 'false' ? 'false' : 'true');
    } else {
      setOptions(makeEmptyOptions());
      setCorrectAnswer(question.correctAnswer ?? '');
    }
    setEditorOpen(true);
  };

  const handleTypeChange = (nextType: QuizQuestionTypeValue) => {
    setQuestionType(nextType);
    setFormError(null);
    if (nextType === 'SINGLE_CHOICE') {
      if (options.length < 2) setOptions(makeEmptyOptions());
      setCorrectAnswer(options[0]?.id || 'A');
    } else if (nextType === 'TRUE_FALSE') {
      setCorrectAnswer('true');
    } else {
      setCorrectAnswer('');
    }
  };

  const handleAddOption = () => {
    if (options.length >= 6) return;
    const nextLetter = String.fromCharCode(65 + options.length);
    setOptions((prev) => [...prev, { id: nextLetter, text: '' }]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const filtered = options.filter((_, idx) => idx !== index);
    const reindexed = filtered.map((item, idx) => ({
      id: String.fromCharCode(65 + idx),
      text: item.text,
    }));
    setOptions(reindexed);
    if (!reindexed.some((opt) => opt.id === correctAnswer)) {
      setCorrectAnswer(reindexed[0]?.id ?? 'A');
    }
  };

  const handleSaveQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasAttempts) return;
    setFormError(null);

    const trimmedText = questionText.trim();
    if (!trimmedText) {
      setFormError('Vui lòng nhập nội dung câu hỏi.');
      return;
    }

    const parsedScore = Number(pointsInput);
    if (!Number.isFinite(parsedScore) || parsedScore <= 0) {
      setFormError('Điểm câu hỏi phải lớn hơn 0.');
      return;
    }

    let optionsJson: string | null = null;
    let finalCorrect = correctAnswer.trim();

    if (questionType === 'SINGLE_CHOICE') {
      const cleanedOpts = options.map((opt) => ({
        id: opt.id,
        text: opt.text.trim(),
      }));
      if (cleanedOpts.some((opt) => !opt.text)) {
        setFormError('Vui lòng điền nội dung cho tất cả phương án lựa chọn.');
        return;
      }
      if (!cleanedOpts.some((opt) => opt.id.toUpperCase() === finalCorrect.toUpperCase())) {
        setFormError('Vui lòng chọn một đáp án đúng.');
        return;
      }
      optionsJson = serializeSingleChoiceOptions(cleanedOpts);
    } else if (questionType === 'TRUE_FALSE') {
      if (finalCorrect.toLowerCase() !== 'true' && finalCorrect.toLowerCase() !== 'false') {
        setFormError('Vui lòng chọn Đúng hoặc Sai.');
        return;
      }
      finalCorrect = finalCorrect.toLowerCase();
      optionsJson = null;
    } else {
      if (!finalCorrect) {
        setFormError('Vui lòng nhập đáp án tham chiếu / từ khóa chấm bài.');
        return;
      }
      optionsJson = null;
    }

    setMutating(true);
    try {
      if (editingQuestion) {
        const qId = getQuestionId(editingQuestion);
        const payload: Partial<QuizQuestionSavePayload> = {
          questionText: trimmedText,
          questionType,
          optionsJson,
          correctAnswer: finalCorrect,
          score: parsedScore,
          sortOrder: editingQuestion.sortOrder ?? 1,
        };
        const updated = await updateQuizQuestion(qId, payload);
        setQuestions((prev) =>
          prev.map((q) => (getQuestionId(q) === qId ? updated : q)),
        );
        toast.success('Đã cập nhật câu hỏi.');
      } else {
        const maxOrder = questions.reduce(
          (max, q, idx) => Math.max(max, q.sortOrder ?? idx + 1),
          0,
        );
        const created = await addQuizQuestion(quizId, {
          questionText: trimmedText,
          questionType,
          optionsJson,
          correctAnswer: finalCorrect,
          score: parsedScore,
          sortOrder: maxOrder + 1,
        });
        setQuestions((prev) => [...prev, created]);
        toast.success('Đã thêm câu hỏi mới.');
      }

      setEditorOpen(false);
      setEditingQuestion(null);
      onChanged?.();
    } catch (err) {
      const msg = getQuizErrorMessage(err, 'Không thể lưu câu hỏi.');
      setFormError(msg);
      toast.error(msg);
    } finally {
      setMutating(false);
    }
  };

  const handleDeleteQuestion = async (question: QuizQuestion, index: number) => {
    if (hasAttempts || mutating) return;
    const confirmed = await confirm({
      title: 'Xóa câu hỏi?',
      message: `Xóa câu hỏi #${index + 1}: "${getQuestionText(question).slice(0, 80)}"? Thao tác này không thể hoàn tác.`,
      confirmText: 'Xóa câu hỏi',
      cancelText: 'Hủy',
      variant: 'danger',
    });
    if (!confirmed) return;

    const qId = getQuestionId(question);
    setMutating(true);
    try {
      await deleteQuizQuestion(qId);
      setQuestions((prev) => prev.filter((item) => getQuestionId(item) !== qId));
      toast.success('Đã xóa câu hỏi.');
      onChanged?.();
    } catch (err) {
      toast.error(getQuizErrorMessage(err, 'Không thể xóa câu hỏi.'));
    } finally {
      setMutating(false);
    }
  };

  const handleMoveQuestion = async (index: number, direction: -1 | 1) => {
    if (hasAttempts || mutating) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const current = questions[index];
    const target = questions[targetIndex];
    const currentOrder = current.sortOrder ?? index + 1;
    const targetOrder = target.sortOrder ?? targetIndex + 1;

    setMutating(true);
    try {
      const [updatedCurrent, updatedTarget] = await Promise.all([
        updateQuizQuestion(getQuestionId(current), {
          sortOrder: targetOrder === currentOrder ? targetIndex + 1 : targetOrder,
        }),
        updateQuizQuestion(getQuestionId(target), {
          sortOrder: targetOrder === currentOrder ? index + 1 : currentOrder,
        }),
      ]);

      setQuestions((prev) => {
        const copy = [...prev];
        copy[index] = updatedTarget;
        copy[targetIndex] = updatedCurrent;
        return copy.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      });
      onChanged?.();
    } catch (err) {
      toast.error(getQuizErrorMessage(err, 'Không thể đổi thứ tự câu hỏi.'));
    } finally {
      setMutating(false);
    }
  };

  const handleAcceptAiQuestions = async (generated: AiGeneratedQuestion[]) => {
    if (generated.length === 0) return;
    setMutating(true);
    try {
      const baseOrder = questions.reduce(
        (max, q, idx) => Math.max(max, q.sortOrder ?? idx + 1),
        0,
      );
      const createdList: QuizQuestion[] = [];
      for (let i = 0; i < generated.length; i += 1) {
        const item = generated[i];
        const created = await addQuizQuestion(quizId, {
          questionText: item.questionText,
          questionType: item.questionType,
          optionsJson: item.optionsJson ?? null,
          correctAnswer: item.correctAnswer,
          score: Number(item.score) > 0 ? Number(item.score) : 1,
          sortOrder: baseOrder + i + 1,
        });
        createdList.push(created);
      }
      setQuestions((prev) => [...prev, ...createdList]);
      onChanged?.();
      toast.success(`Đã thêm ${createdList.length} câu hỏi từ AI vào bài kiểm tra.`);
    } catch (err) {
      toast.error(getQuizErrorMessage(err, 'Có lỗi khi thêm câu hỏi từ AI.'));
    } finally {
      setMutating(false);
    }
  };

  return (
    <>
      <Modal
        isOpen
        onClose={() => {
          if (!mutating) onClose();
        }}
        title={`Soạn câu hỏi: ${quiz.title}`}
        subtitle={`${questions.length} câu hỏi • Tổng điểm hiện tại: ${totalScore}`}
        size="xl"
        closeOnBackdrop={!mutating}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={hasAttempts || mutating}
                onClick={openCreateForm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Thêm câu hỏi
              </button>
              <button
                type="button"
                disabled={hasAttempts || mutating}
                onClick={() => setAiModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Tạo câu hỏi bằng AI
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={mutating}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Đóng
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {hasAttempts && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div>
                <p className="font-semibold">Bài kiểm tra đã có lượt làm bài của sinh viên</p>
                <p className="mt-0.5 text-xs">
                  Để đảm bảo công bằng điểm số, hệ thống khóa thêm/sửa/xóa/đảo thứ tự câu hỏi sau khi đã có lượt làm bài.
                </p>
              </div>
            </div>
          )}

          {editorOpen && !hasAttempts && (
            <form
              onSubmit={handleSaveQuestion}
              className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/70 dark:bg-blue-950/20 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--lms-text)]">
                  {editingQuestion ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditorOpen(false);
                    setEditingQuestion(null);
                  }}
                  className="text-xs font-medium text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]"
                >
                  Thu gọn
                </button>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${baseId}-qtype`}
                    className="mb-1 block text-xs font-semibold text-[var(--lms-text)]"
                  >
                    Loại câu hỏi
                  </label>
                  <select
                    id={`${baseId}-qtype`}
                    value={questionType}
                    onChange={(event) =>
                      handleTypeChange(event.target.value as QuizQuestionTypeValue)
                    }
                    className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                  >
                    <option value="SINGLE_CHOICE">Trắc nghiệm 1 đáp án đúng</option>
                    <option value="TRUE_FALSE">Đúng / Sai</option>
                    <option value="SHORT_TEXT">Tự luận ngắn (Giảng viên chấm)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-qscore`}
                    className="mb-1 block text-xs font-semibold text-[var(--lms-text)]"
                  >
                    Điểm số
                  </label>
                  <input
                    id={`${baseId}-qscore`}
                    type="number"
                    required
                    min="0.5"
                    step="0.5"
                    value={pointsInput}
                    onChange={(event) => setPointsInput(event.target.value)}
                    className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-qtext`}
                  className="mb-1 block text-xs font-semibold text-[var(--lms-text)]"
                >
                  Nội dung câu hỏi <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <textarea
                  id={`${baseId}-qtext`}
                  rows={3}
                  required
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  placeholder="Nhập nội dung câu hỏi..."
                  className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              {questionType === 'SINGLE_CHOICE' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--lms-text)]">
                      Các lựa chọn & chọn đáp án đúng
                    </span>
                    {options.length < 6 && (
                      <button
                        type="button"
                        onClick={handleAddOption}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        Thêm phương án
                      </button>
                    )}
                  </div>

                  {options.map((opt, idx) => {
                    const checked =
                      correctAnswer.toUpperCase() === opt.id.toUpperCase();
                    return (
                      <div key={opt.id} className="flex items-center gap-2">
                        <input
                          id={`${baseId}-opt-radio-${opt.id}`}
                          type="radio"
                          name={`${baseId}-correct`}
                          checked={checked}
                          onChange={() => setCorrectAnswer(opt.id)}
                          aria-label={`Chọn phương án ${opt.id} là đáp án đúng`}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="w-6 text-xs font-bold text-[var(--lms-text)]">
                          {opt.id}.
                        </span>
                        <input
                          id={`${baseId}-opt-text-${opt.id}`}
                          type="text"
                          value={opt.text}
                          onChange={(event) => {
                            const val = event.target.value;
                            setOptions((prev) =>
                              prev.map((item, oIdx) =>
                                oIdx === idx ? { ...item, text: val } : item,
                              ),
                            );
                          }}
                          aria-label={`Nội dung phương án ${opt.id}`}
                          placeholder={`Nhập phương án ${opt.id}`}
                          className="flex-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-1.5 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                        />
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            aria-label={`Xóa phương án ${opt.id}`}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {questionType === 'TRUE_FALSE' && (
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-[var(--lms-text)]">
                    Đáp án đúng
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'true', label: 'Đúng (True)' },
                      { id: 'false', label: 'Sai (False)' },
                    ].map((choice) => (
                      <label
                        key={choice.id}
                        htmlFor={`${baseId}-tf-${choice.id}`}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)]"
                      >
                        <input
                          id={`${baseId}-tf-${choice.id}`}
                          type="radio"
                          name={`${baseId}-tf`}
                          checked={correctAnswer.toLowerCase() === choice.id}
                          onChange={() => setCorrectAnswer(choice.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{choice.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {questionType === 'SHORT_TEXT' && (
                <div className="space-y-2">
                  <label
                    htmlFor={`${baseId}-short-ref`}
                    className="block text-xs font-semibold text-[var(--lms-text)]"
                  >
                    Đáp án tham chiếu / Từ khóa gợi ý chấm điểm{' '}
                    <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <textarea
                    id={`${baseId}-short-ref`}
                    rows={2}
                    required
                    value={correctAnswer}
                    onChange={(event) => setCorrectAnswer(event.target.value)}
                    placeholder="Nhập ý chính hoặc đáp án mẫu để giảng viên tham chiếu khi chấm..."
                    className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Lưu ý: Khi sinh viên nộp bài có câu hỏi Tự luận ngắn, lượt làm bài sẽ tự động chuyển sang trạng thái Chờ giảng viên chấm (PENDING_REVIEW).
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditorOpen(false);
                    setEditingQuestion(null);
                  }}
                  className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={mutating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {mutating
                    ? 'Đang lưu...'
                    : editingQuestion
                      ? 'Cập nhật câu hỏi'
                      : 'Lưu câu hỏi'}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : error ? (
            <ErrorBanner message={error} onRetry={handleRetry} />
          ) : questions.length === 0 ? (
            <EmptyState
              title="Bài kiểm tra chưa có câu hỏi"
              description="Thêm câu hỏi trắc nghiệm, đúng/sai hoặc tự luận ngắn thủ công, hoặc dùng AI tạo nhanh từ nội dung bài học."
            />
          ) : (
            <ol className="space-y-3">
              {questions.map((question, idx) => {
                const qId = getQuestionId(question);
                const qType = getQuestionType(question);
                const qOpts = parseQuestionOptions(question);
                const points = getQuestionPoints(question);
                const ans = (question.correctAnswer ?? '').trim();

                return (
                  <li
                    key={qId}
                    className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums rounded-md bg-[var(--lms-surface-muted)] px-2 py-0.5 text-xs font-bold text-[var(--lms-text)]">
                            Câu {idx + 1}
                          </span>
                          <Badge variant="info" size="sm">
                            {formatQuestionType(qType)}
                          </Badge>
                          <span className="tabular-nums text-xs font-semibold text-blue-600 dark:text-blue-400">
                            {points} điểm
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[var(--lms-text)] whitespace-pre-wrap">
                          {getQuestionText(question)}
                        </p>
                      </div>

                      {!hasAttempts && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0 || mutating}
                            onClick={() => void handleMoveQuestion(idx, -1)}
                            aria-label={`Di chuyển câu ${idx + 1} lên trên`}
                            className="rounded-lg border border-[var(--lms-border)] p-1.5 text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)] hover:text-[var(--lms-text)] disabled:opacity-40"
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === questions.length - 1 || mutating}
                            onClick={() => void handleMoveQuestion(idx, 1)}
                            aria-label={`Di chuyển câu ${idx + 1} xuống dưới`}
                            className="rounded-lg border border-[var(--lms-border)] p-1.5 text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)] hover:text-[var(--lms-text)] disabled:opacity-40"
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={mutating}
                            onClick={() => openEditForm(question)}
                            aria-label={`Chỉnh sửa câu ${idx + 1}`}
                            className="rounded-lg border border-[var(--lms-border)] p-1.5 text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)] hover:text-[var(--lms-text)] disabled:opacity-40"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={mutating}
                            onClick={() => void handleDeleteQuestion(question, idx)}
                            aria-label={`Xóa câu ${idx + 1}`}
                            className="rounded-lg border border-[var(--lms-border)] p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>

                    {qType === 'SHORT_TEXT' ? (
                      <div className="rounded-lg border border-dashed border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 px-3 py-2 text-xs text-[var(--lms-text-muted)]">
                        <span className="font-semibold text-[var(--lms-text)]">
                          Đáp án tham chiếu:
                        </span>{' '}
                        {ans || 'Không có'} • Sinh viên trả lời dạng văn bản (Chấm thủ công PENDING_REVIEW).
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {qOpts.map((opt) => {
                          const isCorrect =
                            ans.toLowerCase() === opt.id.toLowerCase();
                          return (
                            <div
                              key={opt.id}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                                isCorrect
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                                  : 'border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/30 text-[var(--lms-text)]'
                              }`}
                            >
                              <span className="font-bold">{opt.id.toUpperCase()}.</span>
                              <span className="flex-1">{opt.text}</span>
                              {isCorrect && (
                                <CheckCircle2
                                  className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Modal>

      <AiQuizGeneratorModal
        courseId={courseId}
        lessons={lessons}
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onAccept={(generated) => {
          void handleAcceptAiQuestions(generated);
        }}
      />
    </>
  );
}

export function QuizBuilderDrawer(props: QuizBuilderDrawerProps) {
  if (!props.isOpen || !props.quiz) return null;
  return (
    <QuizBuilderInner
      key={getQuizId(props.quiz)}
      onClose={props.onClose}
      quiz={props.quiz}
      courseId={props.courseId}
      onChanged={props.onChanged}
    />
  );
}
