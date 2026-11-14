import { useId, useState, type FormEvent } from 'react';
import { createQuiz, updateQuiz, type QuizSavePayload } from '../../api/learning';
import type { Quiz, ScoreVisibility } from '../../types';
import { formatScoreVisibility } from '../../utils/formatters';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  getDefaultQuizEndInput,
  getDefaultQuizStartInput,
  getQuizDurationMinutes,
  getQuizErrorMessage,
  getQuizId,
  getQuizPublished,
  localDateTimeInputToUtcIso,
  toLocalDateTimeInput,
} from './quizUtils';

export interface QuizFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  quiz: Quiz | null;
  onSaved: (saved: Quiz, isEdit: boolean) => void;
}

const SCORE_VISIBILITY_OPTIONS: ScoreVisibility[] = [
  'AFTER_CLOSE',
  'AFTER_ATTEMPT',
  'SCORE_ONLY',
];

function QuizFormModalInner({
  onClose,
  courseId,
  quiz,
  onSaved,
}: Omit<QuizFormModalProps, 'isOpen'>) {
  const toast = useToast();
  const baseId = useId();
  const isEdit = Boolean(quiz);

  const [title, setTitle] = useState(() => quiz?.title ?? '');
  const [description, setDescription] = useState(() => quiz?.description ?? '');
  const [startAtInput, setStartAtInput] = useState(() =>
    quiz
      ? toLocalDateTimeInput(quiz.startAt) || getDefaultQuizStartInput()
      : getDefaultQuizStartInput(),
  );
  const [endAtInput, setEndAtInput] = useState(() =>
    quiz
      ? toLocalDateTimeInput(quiz.endAt) || getDefaultQuizEndInput()
      : getDefaultQuizEndInput(),
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(() =>
    quiz ? String(getQuizDurationMinutes(quiz)) : '30',
  );
  const [maxAttempts, setMaxAttempts] = useState(() =>
    quiz ? String(quiz.maxAttempts ?? 1) : '1',
  );
  const [passingScore, setPassingScore] = useState(() =>
    quiz ? String(quiz.passingScore ?? 5) : '5',
  );
  const [weightPercent, setWeightPercent] = useState(() =>
    quiz?.weightPercent != null ? String(quiz.weightPercent) : '',
  );
  const [scoreVisibility, setScoreVisibility] = useState<ScoreVisibility>(() =>
    quiz?.scoreVisibility ?? 'AFTER_CLOSE',
  );
  const [isPublished, setIsPublished] = useState(() =>
    quiz ? getQuizPublished(quiz) : false,
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Vui lòng nhập tiêu đề bài kiểm tra.');
      return;
    }

    if (!startAtInput || !endAtInput) {
      setFormError('Vui lòng chọn thời gian mở và đóng bài kiểm tra.');
      return;
    }

    let startAtIso: string;
    let endAtIso: string;
    try {
      startAtIso = localDateTimeInputToUtcIso(startAtInput);
      endAtIso = localDateTimeInputToUtcIso(endAtInput);
    } catch {
      setFormError('Thời gian mở/đóng không hợp lệ.');
      return;
    }

    if (new Date(endAtIso).getTime() <= new Date(startAtIso).getTime()) {
      setFormError('Thời gian đóng bài phải sau thời gian mở bài.');
      return;
    }

    const parsedLimit = Math.round(Number(timeLimitMinutes));
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 300) {
      setFormError('Thời lượng làm bài phải từ 1 đến 300 phút.');
      return;
    }

    const parsedAttempts = Math.round(Number(maxAttempts));
    if (!Number.isFinite(parsedAttempts) || parsedAttempts < 1 || parsedAttempts > 10) {
      setFormError('Số lượt làm bài tối đa phải từ 1 đến 10.');
      return;
    }

    const parsedPassing = Number(passingScore);
    if (!Number.isFinite(parsedPassing) || parsedPassing < 0) {
      setFormError('Điểm đạt phải lớn hơn hoặc bằng 0.');
      return;
    }

    let parsedWeight: number | null = null;
    if (weightPercent.trim() !== '') {
      const numericWeight = Number(weightPercent);
      if (!Number.isFinite(numericWeight) || numericWeight < 0 || numericWeight > 100) {
        setFormError('Trọng số phải nằm trong khoảng 0 đến 100%.');
        return;
      }
      parsedWeight = numericWeight;
    }

    const payload: QuizSavePayload = {
      title: trimmedTitle,
      description: description.trim() ? description.trim() : null,
      startAt: startAtIso,
      endAt: endAtIso,
      timeLimitMinutes: parsedLimit,
      maxAttempts: parsedAttempts,
      passingScore: parsedPassing,
      weightPercent: parsedWeight,
      scoreVisibility,
      isPublished,
    };

    setSaving(true);
    try {
      const saved = quiz
        ? await updateQuiz(getQuizId(quiz), payload)
        : await createQuiz(courseId, payload);
      toast.success(
        isEdit
          ? 'Đã cập nhật cấu hình bài kiểm tra.'
          : 'Đã tạo bài kiểm tra mới. Hãy thêm câu hỏi trước khi công bố.',
      );
      onSaved(saved, isEdit);
      onClose();
    } catch (err) {
      const message = getQuizErrorMessage(err, 'Không thể lưu bài kiểm tra.');
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? 'Chỉnh sửa bài kiểm tra' : 'Tạo bài kiểm tra mới'}
      subtitle={
        isEdit
          ? 'Điều chỉnh khung thời gian, lượt làm bài và chính sách hiển thị đáp án.'
          : 'Thiết lập cấu hình bài kiểm tra, sau đó biên soạn hoặc dùng AI tạo câu hỏi.'
      }
      size="lg"
      closeOnBackdrop={!saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="submit"
            form={`${baseId}-quiz-form`}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo bài kiểm tra'}
          </button>
        </>
      }
    >
      <form id={`${baseId}-quiz-form`} onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200"
          >
            {formError}
          </div>
        )}

        <div>
          <label
            htmlFor={`${baseId}-title`}
            className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
          >
            Tiêu đề bài kiểm tra <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            id={`${baseId}-title`}
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ví dụ: Kiểm tra giữa kỳ - Chương 1 đến 3"
            className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label
            htmlFor={`${baseId}-description`}
            className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
          >
            Hướng dẫn làm bài
          </label>
          <textarea
            id={`${baseId}-description`}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Quy định thời gian, số lần làm bài, lưu ý khi làm câu tự luận..."
            className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${baseId}-start`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Thời gian mở bài (giờ địa phương){' '}
              <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id={`${baseId}-start`}
              type="datetime-local"
              required
              value={startAtInput}
              onChange={(event) => setStartAtInput(event.target.value)}
              className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label
              htmlFor={`${baseId}-end`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Thời gian đóng bài (giờ địa phương){' '}
              <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id={`${baseId}-end`}
              type="datetime-local"
              required
              value={endAtInput}
              onChange={(event) => setEndAtInput(event.target.value)}
              className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor={`${baseId}-duration`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Thời lượng (phút)
            </label>
            <input
              id={`${baseId}-duration`}
              type="number"
              required
              min="1"
              max="300"
              step="1"
              value={timeLimitMinutes}
              onChange={(event) => setTimeLimitMinutes(event.target.value)}
              className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label
              htmlFor={`${baseId}-attempts`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Số lượt tối đa
            </label>
            <input
              id={`${baseId}-attempts`}
              type="number"
              required
              min="1"
              max="10"
              step="1"
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(event.target.value)}
              className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label
              htmlFor={`${baseId}-passing`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Điểm đạt
            </label>
            <input
              id={`${baseId}-passing`}
              type="number"
              required
              min="0"
              step="0.5"
              value={passingScore}
              onChange={(event) => setPassingScore(event.target.value)}
              className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label
              htmlFor={`${baseId}-weight`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Trọng số (%)
            </label>
            <input
              id={`${baseId}-weight`}
              type="number"
              min="0"
              max="100"
              step="1"
              value={weightPercent}
              onChange={(event) => setWeightPercent(event.target.value)}
              placeholder="Tùy chọn"
              className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={`${baseId}-visibility`}
            className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
          >
            Chính sách hiển thị điểm & đáp án
          </label>
          <select
            id={`${baseId}-visibility`}
            value={scoreVisibility}
            onChange={(event) =>
              setScoreVisibility(event.target.value as ScoreVisibility)
            }
            className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {SCORE_VISIBILITY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {formatScoreVisibility(opt)}
              </option>
            ))}
          </select>
        </div>

        <label
          htmlFor={`${baseId}-published`}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 px-3.5 py-2.5 text-sm text-[var(--lms-text)]"
        >
          <input
            id={`${baseId}-published`}
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--lms-border)] text-blue-600 focus:ring-blue-500"
          />
          <span>
            Công bố bài kiểm tra ngay (cần có ít nhất 1 câu hỏi khi mở công bố cho sinh viên)
          </span>
        </label>
      </form>
    </Modal>
  );
}

export function QuizFormModal(props: QuizFormModalProps) {
  if (!props.isOpen) return null;
  const key = props.quiz ? getQuizId(props.quiz) : 'new';
  return (
    <QuizFormModalInner
      key={key}
      onClose={props.onClose}
      courseId={props.courseId}
      quiz={props.quiz}
      onSaved={props.onSaved}
    />
  );
}
