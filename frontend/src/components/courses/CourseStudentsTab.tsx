import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Search, Trash2, UserPlus } from 'lucide-react';
import {
  completeEnrollment,
  enrollStudent,
  getCourseEnrollments,
  getCourseProgress,
  removeEnrollment,
  type CourseClassProgressResponse,
  type StudentCourseProgressRow,
} from '../../api/learning';
import { listUsers } from '../../api/users';
import type { Enrollment, EnrollmentStatus, User } from '../../types';
import { formatDateTimeVi } from '../../utils/formatters';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface MergedStudentRow extends Enrollment {
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  totalTimeSpentSeconds: number;
}

const ENROLL_STATUS_META: Record<
  EnrollmentStatus,
  { label: string; variant: BadgeVariant }
> = {
  ACTIVE: { label: 'Đang học', variant: 'success' },
  COMPLETED: { label: 'Hoàn thành', variant: 'info' },
  DROPPED: { label: 'Đã rút', variant: 'neutral' },
};

export interface CourseStudentsTabProps {
  courseId: string;
  isAdmin: boolean;
  onProgressLoaded?: (avgPercent: number | null, summaryLabel: string) => void;
}

export const CourseStudentsTab: React.FC<CourseStudentsTabProps> = ({
  courseId,
  isAdmin,
  onProgressLoaded,
}) => {
  const toast = useToast();
  const confirm = useConfirm();

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [classProgress, setClassProgress] = useState<CourseClassProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EnrollmentStatus>('ALL');

  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [candidateStudents, setCandidateStudents] = useState<User[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const fetchRosterData = useCallback(async () => {
    const [enrollRows, progressRes] = await Promise.all([
      getCourseEnrollments(courseId),
      getCourseProgress(courseId).catch(() => null),
    ]);
    setEnrollments(enrollRows);
    if (progressRes && 'students' in progressRes) {
      setClassProgress(progressRes);
      const activeRows = progressRes.students.filter((s) => s.enrollmentStatus === 'ACTIVE');
      const target = activeRows.length > 0 ? activeRows : progressRes.students;
      if (target.length > 0) {
        const avg =
          target.reduce((sum, item) => sum + item.completionPercent, 0) / target.length;
        onProgressLoaded?.(
          avg,
          `${target.length} học viên · ${progressRes.totalLessons} bài giảng`,
        );
      } else {
        onProgressLoaded?.(0, `0 học viên · ${progressRes.totalLessons} bài giảng`);
      }
    }
  }, [courseId, onProgressLoaded]);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchRosterData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách sinh viên.');
    } finally {
      setLoading(false);
    }
  }, [fetchRosterData]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        return fetchRosterData();
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không thể tải danh sách sinh viên.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchRosterData]);

  const progressMap = useMemo(() => {
    const map = new Map<string, StudentCourseProgressRow>();
    classProgress?.students.forEach((row) => map.set(row.studentId, row));
    return map;
  }, [classProgress]);

  const mergedRows: MergedStudentRow[] = useMemo(() => {
    const totalLessons = classProgress?.totalLessons ?? 0;
    return enrollments
      .map((enrollment) => {
        const progress = progressMap.get(enrollment.studentId);
        return {
          ...enrollment,
          completedLessons: progress?.completedLessons ?? 0,
          totalLessons: progress?.totalLessons ?? totalLessons,
          completionPercent: progress?.completionPercent ?? 0,
          totalTimeSpentSeconds: progress?.totalTimeSpentSeconds ?? 0,
        };
      })
      .filter((row) => {
        if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
        const q = searchTerm.trim().toLowerCase();
        if (!q) return true;
        return (
          (row.studentName ?? '').toLowerCase().includes(q) ||
          (row.studentCode ?? '').toLowerCase().includes(q) ||
          (row.studentEmail ?? '').toLowerCase().includes(q)
        );
      });
  }, [enrollments, classProgress, progressMap, statusFilter, searchTerm]);

  const openAddStudentModal = async () => {
    setEnrollModalOpen(true);
    try {
      const res = await listUsers({ role: 'STUDENT', status: 'ACTIVE', pageSize: 100 });
      const activeIds = new Set(
        enrollments.filter((e) => e.status === 'ACTIVE').map((e) => e.studentId),
      );
      const available = res.items.filter((u) => !activeIds.has(u.userId));
      setCandidateStudents(available);
      setSelectedStudentId(available[0]?.userId ?? '');
    } catch {
      toast.error('Không thể tải danh sách sinh viên khả dụng.');
    }
  };

  const handleManualEnroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudentId) return;
    setEnrolling(true);
    try {
      await enrollStudent(courseId, selectedStudentId);
      toast.success('Đã ghi danh sinh viên vào lớp học.');
      setEnrollModalOpen(false);
      await loadRoster();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể ghi danh sinh viên.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleComplete = async (row: MergedStudentRow) => {
    const ok = await confirm({
      title: 'Xác nhận hoàn thành học phần',
      message: `Đánh dấu sinh viên ${row.studentName || row.studentId} đã hoàn thành khóa học?`,
      confirmText: 'Xác nhận hoàn thành',
      variant: 'primary',
    });
    if (!ok) return;

    try {
      await completeEnrollment(courseId, row.studentId);
      toast.success('Đã cập nhật trạng thái hoàn thành học phần.');
      await loadRoster();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.');
    }
  };

  const handleRemove = async (row: MergedStudentRow) => {
    const ok = await confirm({
      title: 'Gỡ sinh viên khỏi khóa học',
      message: `Xác nhận hủy ghi danh của ${row.studentName || row.studentId}?`,
      confirmText: 'Gỡ ghi danh',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await removeEnrollment(courseId, row.studentId);
      toast.success('Đã gỡ ghi danh sinh viên.');
      await loadRoster();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể gỡ ghi danh sinh viên.');
    }
  };

  const columns: DataTableColumn<MergedStudentRow>[] = [
    {
      key: 'student',
      header: 'Sinh viên',
      sortable: true,
      sortValue: (row) => row.studentName ?? '',
      render: (row) => (
        <div>
          <div className="font-semibold text-[var(--lms-text)]">
            {row.studentName || 'Sinh viên'}
          </div>
          <div className="text-xs text-[var(--lms-text-muted)]">
            {row.studentCode ? `${row.studentCode} · ` : ''}
            {row.studentEmail || ''}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => {
        const meta = ENROLL_STATUS_META[row.status] ?? ENROLL_STATUS_META.ACTIVE;
        return (
          <Badge variant={meta.variant} size="sm">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'progress',
      header: 'Tiến độ bài giảng',
      sortable: true,
      sortValue: (row) => row.completionPercent,
      render: (row) => {
        const pct = Math.round(row.completionPercent);
        return (
          <div className="w-40 space-y-1">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-[var(--lms-text-muted)]">
                {row.completedLessons}/{row.totalLessons} bài
              </span>
              <span className="font-semibold text-[var(--lms-text)]">{pct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[var(--lms-border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'enrolledAt',
      header: 'Ngày ghi danh',
      sortable: true,
      sortValue: (row) => row.enrolledAt,
      render: (row) => (
        <span className="text-xs text-[var(--lms-text-muted)] tabular-nums">
          {formatDateTimeVi(row.enrolledAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => void handleComplete(row)}
              title="Đánh dấu hoàn thành học phần"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Hoàn thành
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleRemove(row)}
            title="Hủy ghi danh"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  if (error) {
    return <ErrorBanner message={error} onRetry={loadRoster} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search
              className="w-4 h-4 text-[var(--lms-text-muted)] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, MSSV, email..."
              className="pl-9 pr-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] w-64"
            />
          </div>

          <select
            aria-label="Lọc trạng thái ghi danh"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | EnrollmentStatus)}
            className="px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
          >
            <option value="ALL">Tất cả trạng thái ({enrollments.length})</option>
            <option value="ACTIVE">Đang học</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="DROPPED">Đã rút</option>
          </select>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => void openAddStudentModal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            Ghi danh sinh viên
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={mergedRows}
        caption="Danh sách sinh viên và tiến độ học tập"
        getRowKey={(row) => row.enrollmentId || row.studentId}
        loading={loading}
        emptyTitle="Chưa có sinh viên phù hợp"
        emptyDescription="Thử thay đổi bộ lọc hoặc ghi danh sinh viên vào khóa học."
      />

      <Modal
        isOpen={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        title="Ghi danh sinh viên vào khóa học"
        size="md"
      >
        <form onSubmit={handleManualEnroll} className="space-y-4">
          {candidateStudents.length === 0 ? (
            <p className="text-sm text-[var(--lms-text-muted)]">
              Tất cả sinh viên đang hoạt động đã được ghi danh vào khóa học này.
            </p>
          ) : (
            <div>
              <label
                htmlFor="manual-enroll-select"
                className="block text-sm font-medium text-[var(--lms-text)] mb-1"
              >
                Chọn sinh viên
              </label>
              <select
                id="manual-enroll-select"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
              >
                {candidateStudents.map((student) => (
                  <option key={student.userId} value={student.userId}>
                    {student.fullName} {student.studentCode ? `(${student.studentCode})` : ''} —{' '}
                    {student.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setEnrollModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
            >
              Đóng
            </button>
            {candidateStudents.length > 0 && (
              <button
                type="submit"
                disabled={enrolling}
                className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {enrolling ? 'Đang ghi danh...' : 'Xác nhận ghi danh'}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
};
