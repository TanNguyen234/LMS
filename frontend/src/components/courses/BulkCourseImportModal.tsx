import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { learningApi, type CourseBulkImportRowPayload } from '../../api/learning';
import type { AcademicSemester } from '../../types';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export interface BulkCourseImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  semesters: AcademicSemester[];
  onImported: () => Promise<void>;
}

const SAMPLE_CSV = [
  'courseCode,sectionCode,title,credits,lecturerIdentifier,maxStudents,category',
  'CS101,N02,Nhập môn Lập trình (Nhóm 2),3,GV001,60,Khoa học máy tính',
  'DB201,N02,Cơ sở dữ liệu (Nhóm 2),3,lecturer2@university.edu.vn,50,Hệ thống thông tin',
].join('\n');

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function parseCoursesCsv(raw: string): CourseBulkImportRowPayload[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const firstCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader =
    firstCells.includes('coursecode') ||
    firstCells.includes('title') ||
    firstCells.includes('lectureridentifier');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const cells = splitCsvLine(line);
    return {
      courseCode: (cells[0] || '').toUpperCase(),
      sectionCode: (cells[1] || '').toUpperCase(),
      title: cells[2] || '',
      credits: Math.max(1, Math.min(10, Number(cells[3]) || 3)),
      lecturerIdentifier: cells[4] || '',
      maxStudents: cells[5] ? Number(cells[5]) || null : null,
      category: cells[6] || null,
      allowSelfEnroll: true,
    };
  });
}

export const BulkCourseImportModal: React.FC<BulkCourseImportModalProps> = ({
  isOpen,
  onClose,
  semesters,
  onImported,
}) => {
  const toast = useToast();
  const defaultSemId =
    semesters.find((s) => s.isCurrent)?.semesterId ??
    semesters.find((s) => s.status !== 'ARCHIVED')?.semesterId ??
    semesters[0]?.semesterId ??
    '';

  const [selectedSemesterId, setSelectedSemesterId] = useState(defaultSemId);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Array<{ row: number; courseCode: string; message: string }>>([]);

  const effectiveSemId = selectedSemesterId || defaultSemId;
  const parsedRows = useMemo(() => parseCoursesCsv(csvText), [csvText]);

  const handleDownloadSample = () => {
    const blob = new Blob([`\uFEFF${SAMPLE_CSV}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau_nhap_lop_hoc_phan.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
        setErrors([]);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = async () => {
    if (!effectiveSemId) {
      toast.warning('Vui lòng chọn học kỳ đích.');
      return;
    }
    if (parsedRows.length === 0) {
      toast.warning('Chưa có dòng dữ liệu hợp lệ để nhập.');
      return;
    }

    try {
      setSubmitting(true);
      setErrors([]);
      const res = await learningApi.bulkImportCourses({
        semesterId: effectiveSemId,
        rows: parsedRows,
      });
      setErrors(res.errors);
      if (res.createdCount > 0) {
        toast.success(`Đã mở thành công ${res.createdCount} lớp học phần.`);
        await onImported();
      }
      if (res.errors.length === 0) {
        onClose();
      } else if (res.createdCount === 0) {
        toast.error('Không tạo được lớp nào, vui lòng kiểm tra lỗi từng dòng.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nhập danh sách lớp thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nhập hàng loạt Lớp học phần (CSV)"
      subtitle="Đối chiếu giảng viên theo Mã giảng viên (GV001) hoặc Email để tránh nhầm người trùng tên."
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={submitting || parsedRows.length === 0}
            onClick={() => void handleImport()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>{submitting ? 'Đang nhập...' : `Nhập ${parsedRows.length} lớp`}</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1">
              Học kỳ mở lớp
            </label>
            <select
              value={effectiveSemId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            >
              {semesters.map((s) => (
                <option key={s.semesterId} value={s.semesterId}>
                  {s.name} ({s.code}) {s.isCurrent ? '— Hiện tại' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tải file CSV mẫu</span>
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-500/40 bg-blue-500/10 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-500/15 cursor-pointer">
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Chọn tệp .csv</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="sr-only" />
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1">
            Nội dung CSV (courseCode, sectionCode, title, credits, lecturerIdentifier, maxStudents, category)
          </label>
          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/35 font-mono text-xs text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {errors.length > 0 && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 space-y-1 text-xs text-rose-700 dark:text-rose-300">
            <div className="font-semibold">Có {errors.length} dòng không thể nhập:</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {errors.map((err, idx) => (
                <li key={idx}>
                  Dòng {err.row} ({err.courseCode || 'N/A'}): {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-[var(--lms-border)] overflow-x-auto max-h-56">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[var(--lms-surface-muted)] text-[var(--lms-text-muted)] uppercase">
              <tr>
                <th className="px-3 py-2">Mã môn</th>
                <th className="px-3 py-2">Nhóm</th>
                <th className="px-3 py-2">Tên môn học</th>
                <th className="px-3 py-2">TC</th>
                <th className="px-3 py-2">Mã GV / Email</th>
                <th className="px-3 py-2">Sĩ số</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--lms-border)]">
              {parsedRows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-1.5 font-mono font-semibold">{row.courseCode}</td>
                  <td className="px-3 py-1.5 font-mono">{row.sectionCode || '—'}</td>
                  <td className="px-3 py-1.5">{row.title}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.credits}</td>
                  <td className="px-3 py-1.5 font-mono">{row.lecturerIdentifier}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.maxStudents ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};
