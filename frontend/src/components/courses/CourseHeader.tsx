import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Settings,
  UserCheck,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { updateCourseStatus, updateEnrollmentSettings } from '../../api/learning';
import type { Course, CourseStatus, UserRole } from '../../types';
import { formatCourseStatus } from '../../utils/formatters';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

const COURSE_STATUS_BADGE: Record<CourseStatus, BadgeVariant> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  ARCHIVED: 'neutral',
};

function generateRandomJoinCode(courseCode: string): string {
  const prefix = courseCode.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase() || 'CLS';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

export interface CourseHeaderProps {
  course: Course;
  userRole: UserRole;
  canManage: boolean;
  progressPercent: number | null;
  progressLabel?: string;
  onCourseUpdated: (updated: Course) => void;
}

export const CourseHeader: React.FC<CourseHeaderProps> = ({
  course,
  userRole,
  canManage,
  progressPercent,
  progressLabel,
  onCourseUpdated,
}) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [allowSelfEnroll, setAllowSelfEnroll] = useState<boolean>(
    course.allowSelfEnroll ?? true,
  );
  const [maxStudents, setMaxStudents] = useState<string>(
    course.maxStudents ? String(course.maxStudents) : '',
  );
  const [joinCode, setJoinCode] = useState<string>(course.joinCode ?? '');
  const [regenerateCode, setRegenerateCode] = useState(false);
  const [courseStatus, setCourseStatus] = useState<CourseStatus>(course.status);

  const statusLabel = formatCourseStatus(course.status);

  const handleCopyJoinCode = async () => {
    if (!course.joinCode) return;
    try {
      await navigator.clipboard.writeText(course.joinCode);
      setCopied(true);
      toast.success(`Đã sao chép mã tham gia: ${course.joinCode}`);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Không thể sao chép mã vào bộ nhớ tạm.');
    }
  };

  const openSettingsModal = () => {
    setAllowSelfEnroll(course.allowSelfEnroll ?? true);
    setMaxStudents(course.maxStudents ? String(course.maxStudents) : '');
    setJoinCode(course.joinCode ?? '');
    setRegenerateCode(false);
    setCourseStatus(course.status);
    setSettingsOpen(true);
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const parsedMax = maxStudents.trim() ? Number(maxStudents.trim()) : null;
      if (parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax < 1)) {
        toast.error('Sĩ số tối đa phải là số nguyên dương.');
        setSavingSettings(false);
        return;
      }

      const nextJoinCode = regenerateCode
        ? generateRandomJoinCode(course.courseCode)
        : joinCode.trim() || null;

      const updated = await updateEnrollmentSettings(course.courseId, {
        allowSelfEnroll,
        maxStudents: parsedMax,
        joinCode: nextJoinCode,
      });

      if (courseStatus !== course.status) {
        await updateCourseStatus(course.courseId, courseStatus);
        updated.status = courseStatus;
      }

      onCourseUpdated(updated);
      setSettingsOpen(false);
      toast.success('Đã cập nhật cấu hình khóa học.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật cấu hình khóa học.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <>
      <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/courses"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--lms-text-muted)] hover:text-[var(--color-primary)] transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Danh sách khóa học
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {canManage && course.joinCode && (
              <button
                type="button"
                onClick={handleCopyJoinCode}
                title="Sao chép mã tham gia lớp"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] text-xs font-mono font-semibold text-[var(--lms-text)] hover:border-[var(--color-primary)] transition cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-[var(--color-primary)]" aria-hidden="true" />
                <span>Mã lớp: {course.joinCode}</span>
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[var(--lms-text-muted)]" aria-hidden="true" />
                )}
              </button>
            )}

            {canManage && (
              <button
                type="button"
                onClick={openSettingsModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                Cấu hình lớp
              </button>
            )}

            <Link
              to={`/classroom?courseId=${encodeURIComponent(course.courseId)}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-semibold hover:opacity-95 transition"
            >
              <Video className="w-3.5 h-3.5" aria-hidden="true" />
              Phòng học trực tuyến
            </Link>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300">
                {course.courseCode}
              </span>
              <Badge
                variant={COURSE_STATUS_BADGE[course.status] ?? 'neutral'}
                size="sm"
              >
                {statusLabel}
              </Badge>
              <span className="text-xs text-[var(--lms-text-muted)] tabular-nums">
                {course.credits} tín chỉ
              </span>
              {course.semester && (
                <span className="text-xs text-[var(--lms-text-muted)]">
                  Học kỳ {course.semester}
                </span>
              )}
              {course.category && (
                <span className="text-xs text-[var(--lms-text-muted)]">
                  · {course.category}
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-[var(--lms-text)] tracking-tight">
              {course.title}
            </h1>

            {course.description && (
              <p className="text-sm text-[var(--lms-text-muted)] max-w-3xl leading-relaxed">
                {course.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--lms-text-muted)] pt-1">
              {course.lecturerName && (
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Giảng viên: <strong className="text-[var(--lms-text)]">{course.lecturerName}</strong>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                {course.allowSelfEnroll !== false ? 'Cho phép tự ghi danh' : 'Chỉ ghi danh bởi quản trị'}
              </span>
            </div>
          </div>

          {progressPercent !== null && (
            <div className="w-full lg:w-72 p-4 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 shrink-0">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-[var(--lms-text-muted)]">
                  {userRole === 'STUDENT' ? 'Tiến độ của bạn' : 'Hoàn thành trung bình lớp'}
                </span>
                <span className="font-bold text-[var(--lms-text)] tabular-nums">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--lms-border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              </div>
              {progressLabel && (
                <div className="text-[11px] text-[var(--lms-text-muted)] mt-1.5 tabular-nums">
                  {progressLabel}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Cấu hình ghi danh & trạng thái khóa học"
        subtitle={`${course.courseCode} — ${course.title}`}
        size="md"
      >
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label
              htmlFor="course-status-select"
              className="block text-sm font-medium text-[var(--lms-text)] mb-1"
            >
              Trạng thái hiển thị
            </label>
            <select
              id="course-status-select"
              value={courseStatus}
              onChange={(e) => setCourseStatus(e.target.value as CourseStatus)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
            >
              <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
              <option value="DRAFT">Bản nháp (DRAFT)</option>
              <option value="ARCHIVED">Lưu trữ (ARCHIVED)</option>
            </select>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-[var(--lms-text)] cursor-pointer">
            <input
              type="checkbox"
              checked={allowSelfEnroll}
              onChange={(e) => setAllowSelfEnroll(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--lms-border)] accent-[var(--color-primary)]"
            />
            <span>Cho phép sinh viên tự ghi danh từ danh mục hoặc bằng mã lớp</span>
          </label>

          <div>
            <label
              htmlFor="course-max-students"
              className="block text-sm font-medium text-[var(--lms-text)] mb-1"
            >
              Sĩ số tối đa (để trống nếu không giới hạn)
            </label>
            <input
              id="course-max-students"
              type="number"
              min={1}
              value={maxStudents}
              onChange={(e) => setMaxStudents(e.target.value)}
              placeholder="Ví dụ: 120"
              className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
            />
          </div>

          <div>
            <label
              htmlFor="course-join-code"
              className="block text-sm font-medium text-[var(--lms-text)] mb-1"
            >
              Mã tham gia (Join code)
            </label>
            <input
              id="course-join-code"
              type="text"
              value={joinCode}
              disabled={regenerateCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Ví dụ: CS101A"
              className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm font-mono text-[var(--lms-text)] disabled:opacity-50"
            />
            <label className="flex items-center gap-2 text-xs text-[var(--lms-text-muted)] mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={regenerateCode}
                onChange={(e) => setRegenerateCode(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-[var(--color-primary)]"
              />
              <span>Tạo lại mã tham gia ngẫu nhiên mới khi lưu</span>
            </label>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 transition cursor-pointer"
            >
              {savingSettings ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
