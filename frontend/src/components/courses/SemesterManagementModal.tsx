import React, { useState } from 'react';
import { Archive, Calendar, CheckCircle2, Clock, Plus, RefreshCw } from 'lucide-react';
import { learningApi } from '../../api/learning';
import type { AcademicSemester, SemesterStatus } from '../../types';
import { formatDateVi } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export interface SemesterManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  semesters: AcademicSemester[];
  onChanged: () => Promise<void>;
}

function toDateInputValue(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/**
 * Admin modal for creating semesters with start/end deadlines, grace days,
 * and archiving expired terms without deleting class records.
 */
export const SemesterManagementModal: React.FC<SemesterManagementModalProps> = ({
  isOpen,
  onClose,
  semesters,
  onChanged,
}) => {
  const toast = useToast();
  const confirm = useConfirm();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [semester, setSemester] = useState('HK2');
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [graceDays, setGraceDays] = useState(14);
  const [status, setStatus] = useState<SemesterStatus>('UPCOMING');
  const [isCurrent, setIsCurrent] = useState(false);
  const [autoArchive, setAutoArchive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setCode('');
    setName('');
    setSemester('HK2');
    setAcademicYear('2026-2027');
    setStartDate('');
    setEndDate('');
    setGraceDays(14);
    setStatus('UPCOMING');
    setIsCurrent(false);
    setAutoArchive(true);
  };

  const startEdit = (s: AcademicSemester) => {
    setEditingId(s.semesterId);
    setCode(s.code);
    setName(s.name);
    setSemester(s.semester);
    setAcademicYear(s.academicYear);
    setStartDate(toDateInputValue(s.startDate));
    setEndDate(toDateInputValue(s.endDate));
    setGraceDays(s.graceDays);
    setStatus(s.status);
    setIsCurrent(s.isCurrent);
    setAutoArchive(s.autoArchiveOnExpire);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      toast.warning('Vui lòng chọn ngày bắt đầu và ngày kết thúc học kỳ.');
      return;
    }

    try {
      setSubmitting(true);
      const startIso = `${startDate}T00:00:00Z`;
      const endIso = `${endDate}T23:59:59Z`;
      if (editingId) {
        await learningApi.updateSemester(editingId, {
          name: name.trim(),
          semester: semester.trim(),
          academicYear: academicYear.trim(),
          startDate: startIso,
          endDate: endIso,
          graceDays,
          status,
          isCurrent,
          autoArchiveOnExpire: autoArchive,
        });
        toast.success('Đã cập nhật thông tin học kỳ.');
      } else {
        await learningApi.createSemester({
          code: code.trim() || `${academicYear.trim()}-${semester.trim()}`.toUpperCase(),
          name: name.trim() || `${semester.trim()} (${academicYear.trim()})`,
          semester: semester.trim(),
          academicYear: academicYear.trim(),
          startDate: startIso,
          endDate: endIso,
          graceDays,
          status,
          isCurrent,
          autoArchiveOnExpire: autoArchive,
        });
        toast.success('Đã tạo học kỳ mới.');
      }
      resetForm();
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu học kỳ.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveSemester = async (sem: AcademicSemester) => {
    const ok = await confirm({
      title: `Chốt & lưu trữ ${sem.name}?`,
      message:
        'Toàn bộ lớp học đang hoạt động trong học kỳ này sẽ chuyển sang trạng thái Lưu trữ (chỉ đọc). Điểm số, bài nộp và tài liệu vẫn được giữ nguyên.',
      confirmText: 'Lưu trữ học kỳ',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await learningApi.archiveSemesterNow(sem.semesterId);
      toast.success(`Đã chuyển học kỳ ${sem.name} và các lớp thuộc kỳ sang Lưu trữ.`);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu trữ học kỳ.');
    }
  };

  const handleSyncExpired = async () => {
    try {
      setSyncing(true);
      const res = await learningApi.syncExpiredSemesters();
      toast.success(
        `Đã đồng bộ: ${res.archivedSemesters} học kỳ hết hạn, ${res.archivedCourses} lớp được lưu trữ.`,
      );
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể đồng bộ học kỳ hết hạn.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quản lý Học kỳ & Thời hạn lưu trữ"
      subtitle="Thiết lập mốc đầu/cuối học kỳ để tự động tách lớp cũ sang Lưu trữ (không xóa dữ liệu)."
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSyncExpired()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Quét &amp; Lưu trữ kỳ đã hết hạn</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Existing Semesters List */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
            Danh sách học kỳ ({semesters.length})
          </h3>
          <div className="divide-y divide-[var(--lms-border)] rounded-xl border border-[var(--lms-border)] overflow-hidden">
            {semesters.map((s) => (
              <div
                key={s.semesterId}
                className="p-3.5 bg-[var(--lms-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-[var(--lms-text)]">{s.name}</span>
                    <span className="text-xs font-mono text-[var(--lms-text-muted)]">{s.code}</span>
                    {s.isCurrent && (
                      <Badge variant="primary" size="sm">
                        Kỳ hiện tại
                      </Badge>
                    )}
                    <Badge
                      variant={
                        s.status === 'ACTIVE'
                          ? 'success'
                          : s.status === 'UPCOMING'
                            ? 'info'
                            : 'neutral'
                      }
                      size="sm"
                    >
                      {s.status === 'ACTIVE' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : s.status === 'UPCOMING' ? (
                        <Clock className="w-3 h-3" />
                      ) : (
                        <Archive className="w-3 h-3" />
                      )}
                      <span>
                        {s.status === 'ACTIVE'
                          ? 'Đang diễn ra'
                          : s.status === 'UPCOMING'
                            ? 'Sắp mở'
                            : 'Đã lưu trữ'}
                      </span>
                    </Badge>
                  </div>
                  <div className="text-xs text-[var(--lms-text-muted)] flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                      {formatDateVi(s.startDate)} → {formatDateVi(s.endDate)}
                    </span>
                    <span>
                      Gia hạn chấm điểm: +{s.graceDays} ngày (Lưu trữ sau: {formatDateVi(s.archiveAfterDate)})
                    </span>
                    <span>
                      {s.courseCount} lớp ({s.activeCourseCount} đang mở · {s.archivedCourseCount} lưu trữ)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
                  >
                    Sửa
                  </button>
                  {s.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      onClick={() => void handleArchiveSemester(s)}
                      className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                    >
                      Chốt &amp; Lưu trữ
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create / Edit Semester Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--lms-text)] flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <span>{editingId ? 'Cập nhật học kỳ đang chọn' : 'Tạo học kỳ mới'}</span>
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-blue-600 hover:underline cursor-pointer"
              >
                + Tạo kỳ mới thay vì sửa
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Mã kỳ (Code)
              </label>
              <input
                type="text"
                disabled={Boolean(editingId)}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="2026-2027-HK2"
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Học kỳ
              </label>
              <input
                type="text"
                required
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder="HK2"
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Năm học
              </label>
              <input
                type="text"
                required
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026-2027"
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Tên hiển thị
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Học kỳ 2 (2026-2027)"
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Ngày bắt đầu
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Ngày kết thúc
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Gia hạn chấm điểm (ngày)
              </label>
              <input
                type="number"
                min={0}
                max={90}
                value={graceDays}
                onChange={(e) => setGraceDays(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SemesterStatus)}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              >
                <option value="UPCOMING">Sắp mở</option>
                <option value="ACTIVE">Đang diễn ra</option>
                <option value="ARCHIVED">Đã lưu trữ</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--lms-text)]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                  className="rounded border-[var(--lms-border)]"
                />
                <span>Đặt làm học kỳ hiện tại</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoArchive}
                  onChange={(e) => setAutoArchive(e.target.checked)}
                  className="rounded border-[var(--lms-border)]"
                />
                <span>Tự động lưu trữ lớp khi hết hạn (+gia hạn)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Đang lưu...' : editingId ? 'Lưu cập nhật' : 'Thêm học kỳ'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
