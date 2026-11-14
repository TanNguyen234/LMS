import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import {
  createManualGrade,
  deleteManualGrade,
  getCourseEnrollments,
  getCourseGradebook,
  getMyGrades,
  updateManualGrade,
} from '../../api/learning';
import type { Course, Enrollment, Grade, GradeSourceType } from '../../types';
import { exportToCsv, printSection } from '../../utils/exportUtils';
import { formatDateTimeVi } from '../../utils/formatters';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

const SOURCE_META: Record<GradeSourceType, { label: string; variant: BadgeVariant }> = {
  ASSIGNMENT: { label: 'Bài tập', variant: 'info' },
  QUIZ: { label: 'Trắc nghiệm', variant: 'primary' },
  MANUAL: { label: 'Điểm thành phần', variant: 'neutral' },
  MIDTERM: { label: 'Giữa kỳ', variant: 'warning' },
  FINAL: { label: 'Cuối kỳ', variant: 'success' },
};

const MANUAL_SOURCES = new Set<GradeSourceType>(['MANUAL', 'MIDTERM', 'FINAL']);

export interface CourseGradebookTabProps {
  course: Course;
  canManage: boolean;
}

export const CourseGradebookTab: React.FC<CourseGradebookTabProps> = ({
  course,
  canManage,
}) => {
  const toast = useToast();
  const confirm = useConfirm();

  const [grades, setGrades] = useState<Grade[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | GradeSourceType>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [studentId, setStudentId] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [sourceType, setSourceType] = useState<'MANUAL' | 'MIDTERM' | 'FINAL'>('MANUAL');
  const [score, setScore] = useState('8.5');
  const [maxScore, setMaxScore] = useState('10');
  const [weightPercent, setWeightPercent] = useState('20');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchGradebookData = useCallback(async () => {
    if (canManage) {
      const [rows, enrollRows] = await Promise.all([
        getCourseGradebook(course.courseId),
        getCourseEnrollments(course.courseId).catch(() => [] as Enrollment[]),
      ]);
      setGrades(rows);
      setEnrollments(enrollRows);
    } else {
      const rows = await getMyGrades(course.courseId);
      setGrades(rows);
    }
  }, [canManage, course.courseId]);

  const loadGradebook = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchGradebookData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải sổ điểm khóa học.');
    } finally {
      setLoading(false);
    }
  }, [fetchGradebookData]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        return fetchGradebookData();
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không thể tải sổ điểm khóa học.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchGradebookData]);

  const filteredGrades = useMemo(
    () =>
      grades.filter((g) => {
        const st = g.sourceType ?? g.source_type ?? 'MANUAL';
        return sourceFilter === 'ALL' || st === sourceFilter;
      }),
    [grades, sourceFilter],
  );

  const studentSummary = useMemo(() => {
    if (canManage || grades.length === 0) return null;
    let totalWeight = 0;
    let weightedSum = 0;
    let simplePctSum = 0;

    grades.forEach((g) => {
      const pct = g.maxScore > 0 ? (g.score / g.maxScore) * 10 : 0;
      simplePctSum += pct;
      if (g.weightPercent && g.weightPercent > 0) {
        totalWeight += g.weightPercent;
        weightedSum += pct * g.weightPercent;
      }
    });

    const scale10 =
      totalWeight > 0 ? weightedSum / totalWeight : simplePctSum / grades.length;
    return {
      count: grades.length,
      totalWeight,
      scale10,
    };
  }, [canManage, grades]);

  const openCreateModal = () => {
    setEditingGrade(null);
    const activeStudents = enrollments.filter((e) => e.status !== 'DROPPED');
    setStudentId(activeStudents[0]?.studentId ?? '');
    setItemTitle('');
    setSourceType('MANUAL');
    setScore('8.5');
    setMaxScore('10');
    setWeightPercent('20');
    setFeedback('');
    setModalOpen(true);
  };

  const openEditModal = (row: Grade) => {
    setEditingGrade(row);
    setStudentId(row.studentId);
    setItemTitle(row.itemTitle ?? '');
    const st = (row.sourceType ?? 'MANUAL') as 'MANUAL' | 'MIDTERM' | 'FINAL';
    setSourceType(MANUAL_SOURCES.has(st) ? st : 'MANUAL');
    setScore(String(row.score));
    setMaxScore(String(row.maxScore));
    setWeightPercent(row.weightPercent ? String(row.weightPercent) : '');
    setFeedback(row.feedback ?? '');
    setModalOpen(true);
  };

  const handleSaveManual = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericScore = Number(score);
    const numericMax = Number(maxScore);
    const numericWeight = weightPercent.trim() ? Number(weightPercent) : null;

    if (!Number.isFinite(numericScore) || !Number.isFinite(numericMax) || numericMax <= 0) {
      toast.error('Điểm và thang điểm tối đa không hợp lệ.');
      return;
    }

    setSaving(true);
    try {
      if (editingGrade) {
        await updateManualGrade(editingGrade.gradeId, {
          itemTitle: itemTitle.trim() || undefined,
          sourceType,
          score: numericScore,
          maxScore: numericMax,
          weightPercent: numericWeight,
          feedback: feedback.trim() || null,
        });
        toast.success('Đã cập nhật điểm thành phần.');
      } else {
        if (!studentId) {
          toast.error('Vui lòng chọn sinh viên.');
          setSaving(false);
          return;
        }
        await createManualGrade(course.courseId, {
          studentId,
          itemTitle: itemTitle.trim() || 'Điểm thành phần',
          sourceType,
          score: numericScore,
          maxScore: numericMax,
          weightPercent: numericWeight,
          feedback: feedback.trim() || null,
        });
        toast.success('Đã thêm điểm thành phần.');
      }
      setModalOpen(false);
      await loadGradebook();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu điểm.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteManual = async (row: Grade) => {
    const ok = await confirm({
      title: 'Xóa điểm thành phần',
      message: `Xác nhận xóa đầu điểm "${row.itemTitle || row.sourceType}" của ${
        row.studentName || 'sinh viên'
      }?`,
      confirmText: 'Xóa đầu điểm',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteManualGrade(row.gradeId);
      toast.success('Đã xóa đầu điểm.');
      await loadGradebook();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa đầu điểm.');
    }
  };

  const handleExportCsv = () => {
    const headers = canManage
      ? ['MSSV', 'Sinh viên', 'Đầu điểm', 'Loại', 'Điểm', 'Thang điểm', 'Trọng số (%)', 'Nhận xét', 'Ngày chấm']
      : ['Đầu điểm', 'Loại', 'Điểm', 'Thang điểm', 'Trọng số (%)', 'Nhận xét', 'Ngày chấm'];

    const rows = filteredGrades.map((row) =>
      canManage
        ? [
            row.studentCode ?? '',
            row.studentName ?? '',
            row.itemTitle ?? row.sourceType,
            SOURCE_META[row.sourceType]?.label ?? row.sourceType,
            row.score,
            row.maxScore,
            row.weightPercent ?? '',
            row.feedback ?? '',
            formatDateTimeVi(row.gradedAt),
          ]
        : [
            row.itemTitle ?? row.sourceType,
            SOURCE_META[row.sourceType]?.label ?? row.sourceType,
            row.score,
            row.maxScore,
            row.weightPercent ?? '',
            row.feedback ?? '',
            formatDateTimeVi(row.gradedAt),
          ],
    );

    exportToCsv(`bang-diem-${course.courseCode.toLowerCase()}.csv`, headers, rows);
    toast.success('Đã xuất bảng điểm CSV.');
  };

  const columns: DataTableColumn<Grade>[] = [
    ...(canManage
      ? [
          {
            key: 'student',
            header: 'Sinh viên',
            sortable: true,
            sortValue: (row: Grade) => row.studentName ?? '',
            render: (row: Grade) => (
              <div>
                <div className="font-semibold text-[var(--lms-text)]">
                  {row.studentName || 'Sinh viên'}
                </div>
                {row.studentCode && (
                  <div className="text-xs font-mono text-[var(--lms-text-muted)]">
                    {row.studentCode}
                  </div>
                )}
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'itemTitle',
      header: 'Đầu điểm',
      sortable: true,
      sortValue: (row) => row.itemTitle ?? row.sourceType,
      render: (row) => (
        <div>
          <div className="font-medium text-[var(--lms-text)]">
            {row.itemTitle || SOURCE_META[row.sourceType]?.label || row.sourceType}
          </div>
          {row.feedback && (
            <div className="text-xs text-[var(--lms-text-muted)] mt-0.5">{row.feedback}</div>
          )}
        </div>
      ),
    },
    {
      key: 'sourceType',
      header: 'Phân loại',
      render: (row) => {
        const meta = SOURCE_META[row.sourceType] ?? SOURCE_META.MANUAL;
        return (
          <Badge variant={meta.variant} size="sm">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'score',
      header: 'Điểm số',
      align: 'right',
      sortable: true,
      sortValue: (row) => (row.maxScore > 0 ? row.score / row.maxScore : 0),
      render: (row) => (
        <span className="font-bold text-[var(--lms-text)] tabular-nums">
          {row.score} / {row.maxScore}
        </span>
      ),
    },
    {
      key: 'weight',
      header: 'Trọng số',
      align: 'right',
      render: (row) => (
        <span className="text-xs text-[var(--lms-text-muted)] tabular-nums">
          {row.weightPercent ? `${row.weightPercent}%` : '—'}
        </span>
      ),
    },
    {
      key: 'gradedAt',
      header: 'Thời gian',
      render: (row) => (
        <span className="text-xs text-[var(--lms-text-muted)] tabular-nums">
          {formatDateTimeVi(row.gradedAt)}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Thao tác',
            align: 'right' as const,
            render: (row: Grade) =>
              MANUAL_SOURCES.has(row.sourceType) ? (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(row)}
                    aria-label="Sửa đầu điểm"
                    className="p-1.5 rounded-lg border border-[var(--lms-border)] text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteManual(row)}
                    aria-label="Xóa đầu điểm"
                    className="p-1.5 rounded-lg border border-[var(--lms-border)] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[var(--lms-text-muted)]">Tự động</span>
              ),
          },
        ]
      : []),
  ];

  if (error) {
    return <ErrorBanner message={error} onRetry={loadGradebook} />;
  }

  return (
    <div className="space-y-4">
      {studentSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)]">
            <div className="text-xs text-[var(--lms-text-muted)]">Điểm trung bình tạm tính</div>
            <div className="text-2xl font-bold text-[var(--lms-text)] tabular-nums mt-1">
              {studentSummary.scale10.toFixed(2)} / 10
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)]">
            <div className="text-xs text-[var(--lms-text-muted)]">Số đầu điểm đã công bố</div>
            <div className="text-2xl font-bold text-[var(--lms-text)] tabular-nums mt-1">
              {studentSummary.count}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)]">
            <div className="text-xs text-[var(--lms-text-muted)]">Tổng trọng số đã có</div>
            <div className="text-2xl font-bold text-[var(--lms-text)] tabular-nums mt-1">
              {studentSummary.totalWeight > 0 ? `${studentSummary.totalWeight}%` : 'Chưa gán'}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <select
          aria-label="Lọc loại đầu điểm"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as 'ALL' | GradeSourceType)}
          className="px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
        >
          <option value="ALL">Tất cả đầu điểm ({grades.length})</option>
          <option value="ASSIGNMENT">Bài tập</option>
          <option value="QUIZ">Trắc nghiệm</option>
          <option value="MANUAL">Điểm thành phần</option>
          <option value="MIDTERM">Giữa kỳ</option>
          <option value="FINAL">Cuối kỳ</option>
        </select>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filteredGrades.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-40 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Xuất CSV
          </button>
          <button
            type="button"
            onClick={() => printSection(`Bang-diem-${course.courseCode}`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            In bảng điểm
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-semibold hover:opacity-95 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Thêm điểm thành phần
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredGrades}
        caption={`Sổ điểm môn ${course.courseCode}`}
        getRowKey={(row) => row.gradeId}
        loading={loading}
        emptyTitle="Chưa có dữ liệu điểm"
        emptyDescription="Điểm bài tập, trắc nghiệm và điểm thành phần sẽ được tổng hợp tại đây."
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGrade ? 'Cập nhật điểm thành phần' : 'Thêm điểm thành phần'}
        size="md"
      >
        <form onSubmit={handleSaveManual} className="space-y-4">
          {!editingGrade && (
            <div>
              <label
                htmlFor="manual-grade-student"
                className="block text-sm font-medium text-[var(--lms-text)] mb-1"
              >
                Sinh viên *
              </label>
              <select
                id="manual-grade-student"
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
              >
                {enrollments.map((enr) => (
                  <option key={enr.studentId} value={enr.studentId}>
                    {enr.studentName || enr.studentId}{' '}
                    {enr.studentCode ? `(${enr.studentCode})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="manual-grade-title"
                className="block text-sm font-medium text-[var(--lms-text)] mb-1"
              >
                Tên đầu điểm *
              </label>
              <input
                id="manual-grade-title"
                type="text"
                required
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                placeholder="Ví dụ: Chuyên cần / Thi giữa kỳ"
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
              />
            </div>

            <div>
              <label
                htmlFor="manual-grade-source"
                className="block text-sm font-medium text-[var(--lms-text)] mb-1"
              >
                Phân loại
              </label>
              <select
                id="manual-grade-source"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as 'MANUAL' | 'MIDTERM' | 'FINAL')}
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
              >
                <option value="MANUAL">Điểm thành phần</option>
                <option value="MIDTERM">Thi giữa kỳ</option>
                <option value="FINAL">Thi cuối kỳ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="manual-grade-score"
                className="block text-sm font-medium text-[var(--lms-text)] mb-1"
              >
                Điểm *
              </label>
              <input
                id="manual-grade-score"
                type="number"
                step="0.01"
                min={0}
                required
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="manual-grade-max"
                className="block text-sm font-medium text-[var(--lms-text)] mb-1"
              >
                Thang điểm *
              </label>
              <input
                id="manual-grade-max"
                type="number"
                step="0.01"
                min={0.1}
                required
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="manual-grade-weight"
                className="block text-sm font-medium text-[var(--lms-text)] mb-1"
              >
                Trọng số (%)
              </label>
              <input
                id="manual-grade-weight"
                type="number"
                step="1"
                min={0}
                max={100}
                value={weightPercent}
                onChange={(e) => setWeightPercent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="manual-grade-feedback"
              className="block text-sm font-medium text-[var(--lms-text)] mb-1"
            >
              Nhận xét
            </label>
            <textarea
              id="manual-grade-feedback"
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Đang lưu...' : 'Lưu đầu điểm'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
