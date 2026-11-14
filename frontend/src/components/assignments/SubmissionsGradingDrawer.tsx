import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Search,
} from 'lucide-react';
import { downloadFile, getFileMetadata } from '../../api/files';
import { getAssignmentSubmissions, gradeSubmission } from '../../api/learning';
import type { Assignment, StoredFile, Submission } from '../../types';
import { exportToCsv } from '../../utils/exportUtils';
import {
  formatDateTimeVi,
  formatFileSize,
  formatSubmissionStatus,
} from '../../utils/formatters';
import { AiFeedbackButton } from '../ai/AiFeedbackButton';
import { FilePreviewModal } from '../files/FilePreviewModal';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { SafeHtml } from '../ui/SafeHtml';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import {
  getAssignmentId,
  getAssignmentMaxScore,
  getErrorMessage,
  getSubmissionId,
  getSubmissionStatusBadgeVariant,
  getSubmissionStudentEmail,
  getSubmissionStudentName,
  getSubmissionSubmittedAt,
  getSubmissionText,
  getSubmissionUrl,
  parseRubricCriteria,
  toSafeDisplayHtml,
} from './assignmentUtils';

export interface SubmissionsGradingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment | null;
  onGraded?: (updated: Submission) => void;
}

type SubmissionFilter = 'ALL' | 'UNGRADED' | 'GRADED';

function SubmissionsGradingInner({
  onClose,
  assignment,
  onGraded,
}: {
  onClose: () => void;
  assignment: Assignment;
  onGraded?: (updated: Submission) => void;
}) {
  const toast = useToast();
  const baseId = useId();
  const assignmentId = getAssignmentId(assignment);
  const maxScore = getAssignmentMaxScore(assignment);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [filter, setFilter] = useState<SubmissionFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const [scoreInput, setScoreInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [fileMetaById, setFileMetaById] = useState<Record<string, StoredFile>>({});
  const [previewConfig, setPreviewConfig] = useState<{
    fileId?: string | null;
    fileName?: string;
    mimeType?: string;
    externalUrl?: string | null;
  } | null>(null);

  const rubricCriteria = useMemo(
    () => parseRubricCriteria(assignment.rubricJson),
    [assignment.rubricJson],
  );

  useEffect(() => {
    let cancelled = false;
    void getAssignmentSubmissions(assignmentId)
      .then((list) => {
        if (cancelled) return;
        setSubmissions(list);
        setError(null);
        const firstUngraded = list.find(
          (item) => (item.status || '').toUpperCase() !== 'GRADED',
        );
        const initial = firstUngraded ?? list[0];
        if (initial) {
          setSelectedId(getSubmissionId(initial));
          setScoreInput(initial.score != null ? String(initial.score) : '');
          setFeedbackInput(initial.feedback ?? '');
          setScoreError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Không thể tải danh sách bài nộp.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentId, reloadNonce]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const selectedSubmission = useMemo(
    () => submissions.find((item) => getSubmissionId(item) === selectedId) ?? null,
    [selectedId, submissions],
  );

  const selectedFileId = selectedSubmission?.fileId ?? null;
  const cachedFileMeta = selectedFileId ? fileMetaById[selectedFileId] ?? null : null;

  useEffect(() => {
    if (!selectedFileId || cachedFileMeta) return;
    let cancelled = false;
    void getFileMetadata(selectedFileId)
      .then((meta) => {
        if (!cancelled) {
          setFileMetaById((prev) => ({ ...prev, [selectedFileId]: meta }));
        }
      })
      .catch(() => {
        // Metadata unavailable; fallback label displayed
      });
    return () => {
      cancelled = true;
    };
  }, [cachedFileMeta, selectedFileId]);

  const selectSubmission = (sub: Submission) => {
    setSelectedId(getSubmissionId(sub));
    setScoreInput(sub.score != null ? String(sub.score) : '');
    setFeedbackInput(sub.feedback ?? '');
    setScoreError(null);
  };

  const counts = useMemo(() => {
    let graded = 0;
    let ungraded = 0;
    for (const sub of submissions) {
      if ((sub.status || '').toUpperCase() === 'GRADED') {
        graded += 1;
      } else {
        ungraded += 1;
      }
    }
    return { all: submissions.length, graded, ungraded };
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return submissions.filter((sub) => {
      const isGraded = (sub.status || '').toUpperCase() === 'GRADED';
      if (filter === 'GRADED' && !isGraded) return false;
      if (filter === 'UNGRADED' && isGraded) return false;

      if (!query) return true;
      const haystack = [
        getSubmissionStudentName(sub),
        sub.studentCode ?? '',
        getSubmissionStudentEmail(sub),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [filter, searchQuery, submissions]);

  const validateScore = (): number | null => {
    if (scoreInput.trim() === '') {
      setScoreError('Vui lòng nhập điểm chấm.');
      return null;
    }
    const parsed = Number(scoreInput);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxScore) {
      setScoreError(`Điểm phải nằm trong khoảng từ 0 đến ${maxScore}.`);
      return null;
    }
    setScoreError(null);
    return parsed;
  };

  const handleSaveGrade = async (moveToNextUngraded: boolean) => {
    if (!selectedSubmission) return;
    const numericScore = validateScore();
    if (numericScore === null) return;

    const currentSubmissionId = getSubmissionId(selectedSubmission);
    setSaving(true);
    try {
      const graded = await gradeSubmission(currentSubmissionId, {
        score: numericScore,
        feedback: feedbackInput.trim() ? feedbackInput.trim() : null,
      });

      const updatedList = submissions.map((item) =>
        getSubmissionId(item) === currentSubmissionId
          ? {
              ...item,
              ...graded,
              score: graded.score ?? numericScore,
              feedback: graded.feedback ?? (feedbackInput.trim() || null),
              status: graded.status ?? 'GRADED',
            }
          : item,
      );
      setSubmissions(updatedList);
      onGraded?.(graded);

      if (moveToNextUngraded) {
        const nextUngraded = updatedList.find(
          (item) =>
            getSubmissionId(item) !== currentSubmissionId &&
            (item.status || '').toUpperCase() !== 'GRADED',
        );
        if (nextUngraded) {
          selectSubmission(nextUngraded);
          toast.success('Đã lưu điểm và chuyển sang bài chưa chấm tiếp theo.');
        } else {
          toast.success('Đã lưu điểm. Tất cả bài nộp hiện đã được chấm.');
        }
      } else {
        toast.success('Đã lưu điểm và gửi thông báo tới sinh viên.');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Không thể lưu điểm cho bài nộp này.');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (submissions.length === 0) return;
    const headers = [
      'MSSV',
      'Họ và tên',
      'Email',
      'Trạng thái',
      'Thời gian nộp',
      'Điểm',
      'Điểm tối đa',
      'Nhận xét',
    ];
    const rows = submissions.map((sub) => [
      sub.studentCode ?? '',
      getSubmissionStudentName(sub),
      getSubmissionStudentEmail(sub),
      formatSubmissionStatus(sub.status),
      formatDateTimeVi(getSubmissionSubmittedAt(sub)),
      sub.score != null ? sub.score : '',
      maxScore,
      sub.feedback ?? '',
    ]);
    const safeTitle = assignment.title.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    exportToCsv(`bang-diem-${safeTitle || 'bai-tap'}.csv`, headers, rows);
    toast.success('Đã xuất tệp CSV danh sách bài nộp.');
  };

  const handleDownloadAttached = async (fileId: string, fallbackName?: string) => {
    try {
      await downloadFile(fileId, fallbackName);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không thể tải tệp bài nộp.'));
    }
  };

  const numericScoreCandidate = Number(scoreInput);
  const validScoreForAi =
    scoreInput.trim() !== '' &&
    Number.isFinite(numericScoreCandidate) &&
    numericScoreCandidate >= 0 &&
    numericScoreCandidate <= maxScore
      ? numericScoreCandidate
      : undefined;

  return (
    <>
      <Modal
        isOpen
        onClose={() => {
          if (!saving) onClose();
        }}
        title={`Chấm bài: ${assignment.title}`}
        subtitle={`Thang điểm tối đa: ${maxScore} | Đã chấm ${counts.graded}/${counts.all} bài nộp`}
        size="xl"
        closeOnBackdrop={!saving}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={submissions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Xuất CSV ({submissions.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Đóng
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-2.5 lg:col-span-5">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
            <div className="space-y-3 lg:col-span-7">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          </div>
        ) : error ? (
          <ErrorBanner message={error} onRetry={handleRetry} />
        ) : submissions.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            title="Chưa có bài nộp nào"
            description="Sinh viên trong lớp chưa gửi bài nộp cho bài tập này."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3 lg:col-span-5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lms-text-muted)]"
                  aria-hidden="true"
                />
                <input
                  id={`${baseId}-search-sub`}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Tìm theo tên hoặc MSSV..."
                  aria-label="Tìm kiếm sinh viên nộp bài"
                  className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2 pl-9 pr-3 text-xs text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Lọc trạng thái chấm">
                {(
                  [
                    { id: 'ALL', label: `Tất cả (${counts.all})` },
                    { id: 'UNGRADED', label: `Chưa chấm (${counts.ungraded})` },
                    { id: 'GRADED', label: `Đã chấm (${counts.graded})` },
                  ] as const
                ).map((item) => {
                  const active = filter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFilter(item.id)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-blue-600 text-white dark:bg-blue-500'
                          : 'border border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-0.5">
                {filteredSubmissions.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[var(--lms-text-muted)]">
                    Không có bài nộp khớp bộ lọc.
                  </p>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const subId = getSubmissionId(sub);
                    const isSelected = subId === selectedId;
                    const isGraded = (sub.status || '').toUpperCase() === 'GRADED';
                    return (
                      <button
                        key={subId}
                        type="button"
                        onClick={() => selectSubmission(sub)}
                        className={`w-full rounded-xl border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500/30 dark:border-blue-500 dark:bg-blue-950/40'
                            : 'border-[var(--lms-border)] bg-[var(--lms-surface)] hover:bg-[var(--lms-surface-muted)]/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--lms-text)]">
                              {getSubmissionStudentName(sub)}
                            </p>
                            <p className="truncate text-xs text-[var(--lms-text-muted)]">
                              {sub.studentCode || getSubmissionStudentEmail(sub) || 'Sinh viên'}
                            </p>
                          </div>
                          {isGraded && sub.score != null ? (
                            <span className="tabular-nums shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {sub.score}/{maxScore}
                            </span>
                          ) : (
                            <Badge variant={getSubmissionStatusBadgeVariant(sub.status)} size="sm">
                              {formatSubmissionStatus(sub.status)}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs text-[var(--lms-text-muted)]">
                          Nộp lúc {formatDateTimeVi(getSubmissionSubmittedAt(sub))}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              {!selectedSubmission ? (
                <EmptyState
                  compact
                  title="Chọn một bài nộp"
                  description="Chọn sinh viên ở danh sách bên trái để xem nội dung và chấm điểm."
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[var(--lms-text)]">
                          {getSubmissionStudentName(selectedSubmission)}
                        </h3>
                        <Badge
                          variant={getSubmissionStatusBadgeVariant(selectedSubmission.status)}
                          size="sm"
                        >
                          {formatSubmissionStatus(selectedSubmission.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-[var(--lms-text-muted)]">
                        {selectedSubmission.studentCode
                          ? `MSSV: ${selectedSubmission.studentCode} • `
                          : ''}
                        Nộp lúc {formatDateTimeVi(getSubmissionSubmittedAt(selectedSubmission))}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
                      Nội dung bài làm
                    </h4>
                    {getSubmissionText(selectedSubmission) ? (
                      <SafeHtml
                        html={toSafeDisplayHtml(getSubmissionText(selectedSubmission))}
                        className="lms-rich-content rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3 text-sm text-[var(--lms-text)]"
                      />
                    ) : (
                      <p className="text-sm italic text-[var(--lms-text-muted)]">
                        Sinh viên không nhập nội dung văn bản.
                      </p>
                    )}

                    {selectedSubmission.fileId ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--lms-text)]">
                            {cachedFileMeta?.originalName ?? 'Tệp bài nộp đính kèm'}
                          </p>
                          <p className="text-xs text-[var(--lms-text-muted)]">
                            {cachedFileMeta
                              ? `${formatFileSize(cachedFileMeta.sizeBytes)} • ${cachedFileMeta.mimeType}`
                              : 'Tệp lưu trữ trên hệ thống LMS'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewConfig({
                                fileId: selectedSubmission.fileId,
                                fileName: cachedFileMeta?.originalName ?? 'Bài nộp sinh viên',
                                mimeType: cachedFileMeta?.mimeType,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            Xem trước
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleDownloadAttached(
                                selectedSubmission.fileId as string,
                                cachedFileMeta?.originalName,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Tải xuống
                          </button>
                        </div>
                      </div>
                    ) : getSubmissionUrl(selectedSubmission) ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 px-3 py-2.5">
                        <span className="truncate text-xs text-[var(--lms-text)]">
                          {getSubmissionUrl(selectedSubmission)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewConfig({
                                externalUrl: getSubmissionUrl(selectedSubmission),
                                fileName: 'Liên kết bài nộp',
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            Xem
                          </button>
                          <a
                            href={getSubmissionUrl(selectedSubmission)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Mở liên kết
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {rubricCriteria.length > 0 && (
                    <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3.5 space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
                        Gợi ý tiêu chí chấm điểm (Rubric)
                      </h4>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {rubricCriteria.map((criterion) => (
                          <div
                            key={criterion.id}
                            className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[var(--lms-text)]">
                                {criterion.title}
                              </span>
                              <span className="tabular-nums text-xs font-bold text-blue-600 dark:text-blue-400">
                                {criterion.maxPoints} đ
                              </span>
                            </div>
                            {criterion.description && (
                              <p className="mt-0.5 text-xs text-[var(--lms-text-muted)]">
                                {criterion.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label
                          htmlFor={`${baseId}-score`}
                          className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
                        >
                          Điểm số (0 – {maxScore})
                        </label>
                        <input
                          id={`${baseId}-score`}
                          type="number"
                          min="0"
                          max={maxScore}
                          step="0.25"
                          value={scoreInput}
                          onChange={(event) => {
                            setScoreInput(event.target.value);
                            setScoreError(null);
                          }}
                          className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        {scoreError && (
                          <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                            {scoreError}
                          </p>
                        )}
                      </div>

                      <div className="flex items-end sm:col-span-2">
                        <div className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 px-3.5 py-2 text-xs text-[var(--lms-text-muted)]">
                          Thang điểm tối đa của bài tập là{' '}
                          <span className="tabular-nums font-bold text-[var(--lms-text)]">
                            {maxScore}
                          </span>
                          . Sau khi lưu, sinh viên sẽ nhận được thông báo điểm ngay lập tức.
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor={`${baseId}-feedback`}
                          className="text-sm font-semibold text-[var(--lms-text)]"
                        >
                          Nhận xét của giảng viên
                        </label>
                        <AiFeedbackButton
                          submissionId={getSubmissionId(selectedSubmission)}
                          score={validScoreForAi}
                          onSuggest={(suggestedText) => setFeedbackInput(suggestedText)}
                        />
                      </div>
                      <textarea
                        id={`${baseId}-feedback`}
                        rows={4}
                        value={feedbackInput}
                        onChange={(event) => setFeedbackInput(event.target.value)}
                        placeholder="Nhập nhận xét chi tiết hoặc dùng AI gợi ý để chỉnh sửa..."
                        className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveGrade(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {saving ? 'Đang lưu...' : 'Lưu điểm'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveGrade(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        <span>Lưu & Chấm bài tiếp</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <FilePreviewModal
        isOpen={Boolean(previewConfig)}
        onClose={() => setPreviewConfig(null)}
        fileId={previewConfig?.fileId}
        fileName={previewConfig?.fileName}
        mimeType={previewConfig?.mimeType}
        externalUrl={previewConfig?.externalUrl}
        title="Xem trước bài nộp"
      />
    </>
  );
}

export function SubmissionsGradingDrawer(props: SubmissionsGradingDrawerProps) {
  if (!props.isOpen || !props.assignment) return null;
  return (
    <SubmissionsGradingInner
      key={getAssignmentId(props.assignment)}
      onClose={props.onClose}
      assignment={props.assignment}
      onGraded={props.onGraded}
    />
  );
}
