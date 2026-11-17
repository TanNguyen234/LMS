import React, { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { learningApi } from '../../api/learning';
import type { AcademicSemester, Course } from '../../types';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export interface CloneCoursesModalProps {
  isOpen: boolean;
  onClose: () => void;
  semesters: AcademicSemester[];
  allCourses: Course[];
  onCloned: () => Promise<void>;
}

export const CloneCoursesModal: React.FC<CloneCoursesModalProps> = ({
  isOpen,
  onClose,
  semesters,
  allCourses,
  onCloned,
}) => {
  const toast = useToast();

  const defaultSourceSem = semesters.find((s) => s.isCurrent)?.semesterId ?? semesters[0]?.semesterId ?? '';
  const defaultTargetSem =
    semesters.find((s) => s.status === 'UPCOMING')?.semesterId ??
    semesters.find((s) => s.semesterId !== defaultSourceSem)?.semesterId ??
    '';

  const [sourceSemId, setSourceSemId] = useState(defaultSourceSem);
  const [targetSemId, setTargetSemId] = useState(defaultTargetSem);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copySyllabus, setCopySyllabus] = useState(true);
  const [defaultStatus, setDefaultStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT');
  const [submitting, setSubmitting] = useState(false);

  const effectiveSourceSem = sourceSemId || defaultSourceSem;
  const effectiveTargetSem = targetSemId || defaultTargetSem;

  const sourceCourses = useMemo(
    () => allCourses.filter((c) => c.semesterId === effectiveSourceSem),
    [allCourses, effectiveSourceSem],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === sourceCourses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sourceCourses.map((c) => c.courseId)));
    }
  };

  const handleClone = async () => {
    if (!effectiveTargetSem) {
      toast.warning('Vui lòng chọn hoặc tạo học kỳ đích trước khi mở lớp.');
      return;
    }
    if (effectiveTargetSem === effectiveSourceSem) {
      toast.warning('Học kỳ đích phải khác học kỳ nguồn.');
      return;
    }
    if (selectedIds.size === 0) {
      toast.warning('Hãy chọn ít nhất 1 lớp học phần để nhân bản.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await learningApi.cloneCoursesToSemester({
        sourceCourseIds: Array.from(selectedIds),
        targetSemesterId: effectiveTargetSem,
        copyModulesAndLessons: copySyllabus,
        defaultStatus,
      });
      if (res.createdCount > 0) {
        toast.success(`Đã mở ${res.createdCount} lớp sang học kỳ mới.`);
        await onCloned();
      }
      if (res.errors.length > 0) {
        toast.warning(`Bỏ qua ${res.errors.length} lớp đã tồn tại ở kỳ đích.`);
      }
      if (res.createdCount > 0) {
        setSelectedIds(new Set());
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể nhân bản lớp sang học kỳ mới.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mở lớp sang học kỳ mới từ kỳ trước"
      subtitle="Sao chép thông tin học phần, giảng viên phụ trách và khung bài giảng sang học kỳ tiếp theo (không sao chép sinh viên cũ)."
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting || selectedIds.size === 0 || !effectiveTargetSem}
            onClick={() => void handleClone()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
          >
            <Copy className="w-4 h-4" aria-hidden="true" />
            <span>{submitting ? 'Đang tạo...' : `Nhân bản ${selectedIds.size} lớp`}</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1">
              Lấy mẫu từ học kỳ
            </label>
            <select
              value={effectiveSourceSem}
              onChange={(e) => {
                setSourceSemId(e.target.value);
                setSelectedIds(new Set());
              }}
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            >
              {semesters.map((s) => (
                <option key={s.semesterId} value={s.semesterId}>
                  {s.name} ({s.courseCount} lớp)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1">
              Mở sang học kỳ đích
            </label>
            <select
              value={effectiveTargetSem}
              onChange={(e) => setTargetSemId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            >
              {semesters.length < 2 ? (
                <option value="">Cần tạo thêm học kỳ mới trước</option>
              ) : (
                semesters.map((s) => (
                  <option key={s.semesterId} value={s.semesterId}>
                    {s.name} ({s.code})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 px-3.5 py-2.5 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={copySyllabus}
              onChange={(e) => setCopySyllabus(e.target.checked)}
              className="rounded border-[var(--lms-border)]"
            />
            <span>Sao chép luôn khung Chương &amp; Bài giảng</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-[var(--lms-text-muted)]">Trạng thái lớp mới:</span>
            <select
              value={defaultStatus}
              onChange={(e) => setDefaultStatus(e.target.value as 'DRAFT' | 'ACTIVE')}
              className="px-2.5 py-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs"
            >
              <option value="DRAFT">Bản nháp (chuẩn bị trước)</option>
              <option value="ACTIVE">Mở hoạt động ngay</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--lms-border)] overflow-hidden">
          <div className="px-3.5 py-2 bg-[var(--lms-surface-muted)] border-b border-[var(--lms-border)] flex items-center justify-between text-xs font-semibold">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sourceCourses.length > 0 && selectedIds.size === sourceCourses.length}
                onChange={toggleAll}
                className="rounded border-[var(--lms-border)]"
              />
              <span>Chọn tất cả ({sourceCourses.length} lớp)</span>
            </label>
            <span className="text-[var(--lms-text-muted)]">Đã chọn: {selectedIds.size}</span>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-[var(--lms-border)]">
            {sourceCourses.length === 0 ? (
              <p className="p-6 text-center text-xs text-[var(--lms-text-muted)]">
                Học kỳ nguồn chưa có lớp học phần nào.
              </p>
            ) : (
              sourceCourses.map((c) => (
                <label
                  key={c.courseId}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[var(--lms-surface-muted)]/50 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.courseId)}
                      onChange={() => toggleSelect(c.courseId)}
                      className="rounded border-[var(--lms-border)]"
                    />
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400 shrink-0">
                      {c.courseCode}
                      {c.sectionCode ? ` · ${c.sectionCode}` : ''}
                    </span>
                    <span className="font-medium text-[var(--lms-text)] truncate">{c.title}</span>
                  </div>
                  <span className="text-[var(--lms-text-muted)] shrink-0">
                    GV: {c.lecturerName || '—'}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
