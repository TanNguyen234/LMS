import type { BadgeVariant } from '../ui/Badge';
import type { Assignment, Submission } from '../../types';

export type AssignmentLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface RubricCriterion {
  id: string;
  title: string;
  maxPoints: number;
  description: string;
}

export interface DeadlineMeta {
  key: 'DRAFT' | 'CLOSED' | 'OPEN' | 'DUE_SOON' | 'PAST_DUE';
  label: string;
  variant: BadgeVariant;
}

export function getAssignmentId(assignment: Assignment): string {
  return String(assignment.assignmentId ?? assignment.id ?? '');
}

export function getAssignmentCourseId(assignment: Assignment): string {
  return String(assignment.courseId ?? assignment.course_id ?? '');
}

export function getAssignmentDueAt(assignment: Assignment): string {
  return assignment.dueAt ?? assignment.due_date ?? '';
}

export function getAssignmentMaxScore(assignment: Assignment): number {
  const numeric = Number(assignment.maxScore ?? assignment.max_score ?? 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 10;
}

export function getAssignmentStatus(assignment: Assignment): AssignmentLifecycleStatus {
  const raw = (assignment.status || 'PUBLISHED').toUpperCase();
  if (raw === 'DRAFT' || raw === 'CLOSED' || raw === 'PUBLISHED') {
    return raw;
  }
  return 'PUBLISHED';
}

export function getSubmissionId(submission: Submission): string {
  return String(submission.submissionId ?? submission.id ?? '');
}

export function getSubmissionText(submission: Submission): string {
  return submission.contentText ?? submission.submission_text ?? '';
}

export function getSubmissionUrl(submission: Submission): string {
  return submission.fileUrl ?? submission.attachment_url ?? '';
}

export function getSubmissionSubmittedAt(submission: Submission): string {
  return submission.submittedAt ?? submission.submitted_at ?? '';
}

export function getSubmissionStudentName(submission: Submission): string {
  return submission.studentName ?? submission.student_name ?? 'Sinh viên';
}

export function getSubmissionStudentEmail(submission: Submission): string {
  return submission.studentEmail ?? submission.student_email ?? '';
}

export function getSubmissionStatusBadgeVariant(status?: string | null): BadgeVariant {
  switch ((status || '').toUpperCase()) {
    case 'GRADED':
      return 'success';
    case 'LATE':
      return 'warning';
    case 'SUBMITTED':
      return 'info';
    default:
      return 'neutral';
  }
}

export function getAssignmentDeadlineMeta(assignment: Assignment): DeadlineMeta {
  const status = getAssignmentStatus(assignment);
  if (status === 'DRAFT') {
    return { key: 'DRAFT', label: 'Bản nháp', variant: 'neutral' };
  }
  if (status === 'CLOSED') {
    return { key: 'CLOSED', label: 'Đã đóng hạn', variant: 'danger' };
  }

  const dueAt = getAssignmentDueAt(assignment);
  const dueTime = dueAt ? new Date(dueAt).getTime() : Number.NaN;
  if (Number.isNaN(dueTime)) {
    return { key: 'OPEN', label: 'Đang mở', variant: 'success' };
  }

  const diffMs = dueTime - Date.now();
  if (diffMs < 0) {
    return {
      key: 'PAST_DUE',
      label: assignment.allowLate ? 'Quá hạn (cho nộp muộn)' : 'Quá hạn',
      variant: assignment.allowLate ? 'warning' : 'danger',
    };
  }
  if (diffMs <= 48 * 3600 * 1000) {
    return { key: 'DUE_SOON', label: 'Sắp hết hạn', variant: 'warning' };
  }
  return { key: 'OPEN', label: 'Đang mở', variant: 'success' };
}

export function toLocalDateTimeInput(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function localDateTimeInputToUtcIso(localValue: string): string {
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Thời gian không hợp lệ');
  }
  return date.toISOString();
}

export function getDefaultDueDateInput(daysAhead = 7): string {
  const target = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
  target.setHours(23, 59, 0, 0);
  return toLocalDateTimeInput(target.toISOString());
}

export function parseRubricCriteria(rubricJson?: string | null): RubricCriterion[] {
  if (!rubricJson || !rubricJson.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(rubricJson);
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { criteria?: unknown[] }).criteria)
        ? (parsed as { criteria: unknown[] }).criteria
        : parsed && typeof parsed === 'object'
          ? Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
              title: key,
              maxPoints: typeof value === 'number' ? value : 0,
              description: typeof value === 'string' ? value : '',
            }))
          : [];

    return list
      .map((item, idx): RubricCriterion | null => {
        if (typeof item === 'string') {
          return {
            id: `criterion-${idx + 1}`,
            title: item,
            maxPoints: 0,
            description: '',
          };
        }
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const title = String(obj.title ?? obj.criterion ?? obj.name ?? `Tiêu chí ${idx + 1}`).trim();
        const rawPoints = Number(obj.maxPoints ?? obj.points ?? obj.score ?? 0);
        const maxPoints = Number.isFinite(rawPoints) && rawPoints >= 0 ? rawPoints : 0;
        const description = String(obj.description ?? obj.note ?? '').trim();
        return {
          id: String(obj.id ?? `criterion-${idx + 1}`),
          title,
          maxPoints,
          description,
        };
      })
      .filter((item): item is RubricCriterion => item !== null && item.title.length > 0);
  } catch {
    return [];
  }
}

export function serializeRubricCriteria(criteria: RubricCriterion[]): string | null {
  const cleaned = criteria
    .map((item) => ({
      id: item.id,
      title: item.title.trim(),
      maxPoints: Number.isFinite(item.maxPoints) && item.maxPoints >= 0 ? item.maxPoints : 0,
      description: item.description.trim(),
    }))
    .filter((item) => item.title.length > 0);

  if (cleaned.length === 0) return null;
  return JSON.stringify(cleaned);
}

export function toSafeDisplayHtml(raw?: string | null): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  if (/<\/?[a-z][\s\S]*>/i.test(text)) {
    return text;
  }
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return linked.replace(/\r?\n/g, '<br />');
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
