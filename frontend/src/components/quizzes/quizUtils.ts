import type { BadgeVariant } from '../ui/Badge';
import type { Quiz, QuizAttempt, QuizQuestion } from '../../types';

export type QuizQuestionTypeValue = 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT';

export interface NormalizedQuestionOption {
  id: string;
  text: string;
}

export interface QuizWindowMeta {
  key: 'DRAFT' | 'UPCOMING' | 'OPEN' | 'CLOSED';
  label: string;
  variant: BadgeVariant;
}

export interface ParsedAttemptQuestionResult {
  questionId: string;
  questionType: string;
  studentAnswer: string | null;
  correctAnswer?: string | null;
  maxScore: number;
  awardedScore: number | null;
  isCorrect: boolean | null;
  needsManualReview: boolean;
}

export function getQuizId(quiz: Quiz): string {
  return String(quiz.quizId ?? quiz.id ?? '');
}

export function getQuizPublished(quiz: Quiz): boolean {
  return Boolean(quiz.isPublished ?? quiz.is_published);
}

export function getQuizDurationMinutes(quiz: Quiz): number {
  const num = Number(quiz.timeLimitMinutes ?? quiz.duration_minutes ?? 30);
  return Number.isFinite(num) && num > 0 ? num : 30;
}

export function getQuizMaxScore(quiz: Quiz): number {
  const num = Number(quiz.maxScore ?? quiz.max_score ?? 10);
  return Number.isFinite(num) && num >= 0 ? num : 10;
}

export function getQuestionId(question: QuizQuestion): string {
  return String(question.questionId ?? question.id ?? '');
}

export function getQuestionText(question: QuizQuestion): string {
  return question.questionText ?? question.question_text ?? '';
}

export function getQuestionType(question: QuizQuestion): QuizQuestionTypeValue {
  const raw = (question.questionType ?? question.question_type ?? 'SINGLE_CHOICE').toUpperCase();
  if (raw === 'TRUE_FALSE' || raw === 'SHORT_TEXT' || raw === 'SINGLE_CHOICE') {
    return raw;
  }
  return 'SINGLE_CHOICE';
}

export function getQuestionPoints(question: QuizQuestion): number {
  const num = Number(question.score ?? question.points ?? 1);
  return Number.isFinite(num) && num > 0 ? num : 1;
}

export function getAttemptId(attempt: QuizAttempt): string {
  return String(attempt.attemptId ?? attempt.id ?? '');
}

export function getAttemptStartedAt(attempt: QuizAttempt): string {
  return attempt.startedAt ?? attempt.started_at ?? '';
}

export function getAttemptSubmittedAt(attempt: QuizAttempt): string {
  return attempt.submittedAt ?? attempt.submitted_at ?? '';
}

export function getAttemptStatusVariant(status?: string | null): BadgeVariant {
  switch ((status || '').toUpperCase()) {
    case 'SUBMITTED':
      return 'success';
    case 'PENDING_REVIEW':
      return 'warning';
    case 'EXPIRED':
      return 'danger';
    case 'IN_PROGRESS':
      return 'info';
    default:
      return 'neutral';
  }
}

export function parseQuestionOptions(question: QuizQuestion): NormalizedQuestionOption[] {
  const qType = getQuestionType(question);

  if (Array.isArray(question.options) && question.options.length > 0) {
    return question.options.map((opt, idx) => ({
      id: String(opt.id ?? String.fromCharCode(65 + idx)),
      text: String(opt.text ?? ''),
    }));
  }

  if (question.optionsJson && question.optionsJson.trim()) {
    try {
      const parsed: unknown = JSON.parse(question.optionsJson);
      if (Array.isArray(parsed)) {
        const mapped = parsed
          .map((item, idx): NormalizedQuestionOption | null => {
            const fallbackKey = String.fromCharCode(65 + idx);
            if (typeof item === 'string') {
              return { id: fallbackKey, text: item };
            }
            if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              const id = String(obj.key ?? obj.id ?? obj.value ?? fallbackKey);
              const text = String(obj.text ?? obj.label ?? obj.content ?? '');
              return { id, text };
            }
            return null;
          })
          .filter((item): item is NormalizedQuestionOption => item !== null);
        if (mapped.length > 0) return mapped;
      } else if (parsed && typeof parsed === 'object') {
        const mapped = Object.entries(parsed as Record<string, unknown>).map(
          ([key, value]) => ({
            id: String(key),
            text: String(value ?? ''),
          }),
        );
        if (mapped.length > 0) return mapped;
      }
    } catch {
      // Fallback handled below
    }
  }

  if (qType === 'TRUE_FALSE') {
    return [
      { id: 'true', text: 'Đúng' },
      { id: 'false', text: 'Sai' },
    ];
  }

  return [];
}

export function serializeSingleChoiceOptions(
  options: NormalizedQuestionOption[],
): string {
  const sanitized = options.map((opt) => ({
    key: opt.id.trim(),
    text: opt.text.trim(),
  }));
  return JSON.stringify(sanitized);
}

export function getQuizWindowMeta(quiz: Quiz): QuizWindowMeta {
  if (!getQuizPublished(quiz)) {
    return { key: 'DRAFT', label: 'Chưa công bố', variant: 'neutral' };
  }

  const now = Date.now();
  const startMs = quiz.startAt ? new Date(quiz.startAt).getTime() : Number.NaN;
  const endMs = quiz.endAt ? new Date(quiz.endAt).getTime() : Number.NaN;

  if (!Number.isNaN(startMs) && now < startMs) {
    return { key: 'UPCOMING', label: 'Sắp mở', variant: 'info' };
  }
  if (!Number.isNaN(endMs) && now > endMs) {
    return { key: 'CLOSED', label: 'Đã đóng', variant: 'danger' };
  }
  return { key: 'OPEN', label: 'Đang mở', variant: 'success' };
}

export function canStudentViewAnswers(quiz: Quiz): boolean {
  const vis = (quiz.scoreVisibility || 'AFTER_CLOSE').toUpperCase();
  if (vis === 'SCORE_ONLY') return false;
  if (vis === 'AFTER_ATTEMPT') return true;
  if (vis === 'AFTER_CLOSE') {
    if (!quiz.endAt) return false;
    const endMs = new Date(quiz.endAt).getTime();
    return !Number.isNaN(endMs) && Date.now() >= endMs;
  }
  return false;
}

export function getScoreVisibilityHelperText(quiz: Quiz): string {
  const vis = (quiz.scoreVisibility || 'AFTER_CLOSE').toUpperCase();
  if (vis === 'SCORE_ONLY') {
    return 'Giảng viên cài đặt chỉ hiển thị tổng điểm, ẩn đáp án chi tiết.';
  }
  if (vis === 'AFTER_CLOSE') {
    if (quiz.endAt && Date.now() < new Date(quiz.endAt).getTime()) {
      return 'Đáp án chi tiết đang được ẩn cho đến khi bài kiểm tra kết thúc.';
    }
    return 'Bài kiểm tra đã kết thúc — bạn có thể xem đáp án chi tiết.';
  }
  return 'Bạn có thể xem đáp án chi tiết ngay sau khi nộp bài.';
}

export function parseQuestionResults(
  rawJson?: string | null,
): ParsedAttemptQuestionResult[] {
  if (!rawJson || !rawJson.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): ParsedAttemptQuestionResult | null => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        if (!obj.questionId) return null;
        return {
          questionId: String(obj.questionId),
          questionType: String(obj.questionType ?? 'SINGLE_CHOICE'),
          studentAnswer:
            obj.studentAnswer != null ? String(obj.studentAnswer) : null,
          correctAnswer:
            obj.correctAnswer != null ? String(obj.correctAnswer) : undefined,
          maxScore: Number(obj.maxScore ?? 1),
          awardedScore:
            obj.awardedScore != null ? Number(obj.awardedScore) : null,
          isCorrect:
            typeof obj.isCorrect === 'boolean' ? obj.isCorrect : null,
          needsManualReview: Boolean(obj.needsManualReview),
        };
      })
      .filter((item): item is ParsedAttemptQuestionResult => item !== null);
  } catch {
    return [];
  }
}

export function parseAnswersRecord(rawJson?: string | null): Record<string, string> {
  if (!rawJson || !rawJson.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (val != null && String(val).length > 0) {
        out[key] = String(val);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function toLocalDateTimeInput(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeInputToUtcIso(localValue: string): string {
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Thời gian không hợp lệ');
  }
  return date.toISOString();
}

export function getDefaultQuizStartInput(): string {
  return toLocalDateTimeInput(new Date().toISOString());
}

export function getDefaultQuizEndInput(daysAhead = 7): string {
  const target = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
  target.setHours(23, 59, 0, 0);
  return toLocalDateTimeInput(target.toISOString());
}

export function formatCountdownSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function getQuizErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
