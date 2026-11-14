import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Lock,
} from 'lucide-react';
import { downloadFile, getFileMetadata } from '../../api/files';
import { submitAssignment } from '../../api/learning';
import type { Assignment, StoredFile, Submission } from '../../types';
import {
  formatDateTimeVi,
  formatFileSize,
  formatSubmissionStatus,
} from '../../utils/formatters';
import { FileDropzone } from '../files/FileDropzone';
import { FilePreviewModal } from '../files/FilePreviewModal';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { SafeHtml } from '../ui/SafeHtml';
import { useToast } from '../ui/Toast';
import {
  getAssignmentDeadlineMeta,
  getAssignmentDueAt,
  getAssignmentId,
  getAssignmentMaxScore,
  getAssignmentStatus,
  getErrorMessage,
  getSubmissionId,
  getSubmissionStatusBadgeVariant,
  getSubmissionSubmittedAt,
  getSubmissionText,
  getSubmissionUrl,
  parseRubricCriteria,
  toSafeDisplayHtml,
} from './assignmentUtils';

export interface StudentSubmitDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment | null;
  courseId: string;
  existingSubmission: Submission | null;
  onSubmitted: (submission: Submission) => void;
}

function StudentSubmitInner({
  onClose,
  assignment,
  courseId,
  existingSubmission,
  onSubmitted,
}: {
  onClose: () => void;
  assignment: Assignment;
  courseId: string;
  existingSubmission: Submission | null;
  onSubmitted: (submission: Submission) => void;
}) {
  const toast = useToast();
  const baseId = useId();

  const [contentText, setContentText] = useState(() =>
    existingSubmission ? getSubmissionText(existingSubmission) : '',
  );
  const [uploadedFile, setUploadedFile] = useState<StoredFile | null>(null);
  const [fileRemoved, setFileRemoved] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [promptFileMeta, setPromptFileMeta] = useState<StoredFile | null>(null);
  const [openedAtMs] = useState(() => Date.now());

  const [previewConfig, setPreviewConfig] = useState<{
    fileId?: string | null;
    fileName?: string;
    mimeType?: string;
    externalUrl?: string | null;
    title?: string;
  } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const assignmentId = getAssignmentId(assignment);
  const maxScore = getAssignmentMaxScore(assignment);
  const deadlineMeta = getAssignmentDeadlineMeta(assignment);
  const rubricCriteria = useMemo(
    () => parseRubricCriteria(assignment.rubricJson),
    [assignment.rubricJson],
  );

  const isGraded =
    (existingSubmission?.status || '').toUpperCase() === 'GRADED';
  const assignmentStatus = getAssignmentStatus(assignment);
  const dueAt = getAssignmentDueAt(assignment);
  const dueTimestamp = dueAt ? new Date(dueAt).getTime() : Number.NaN;
  const isPastDue = !Number.isNaN(dueTimestamp) && openedAtMs > dueTimestamp;
  const isLocked =
    assignmentStatus !== 'PUBLISHED' || (isPastDue && !assignment.allowLate);

  const promptFileId = assignment.attachmentFileId ?? null;
  const submittedFileId = existingSubmission?.fileId ?? null;

  useEffect(() => {
    let cancelled = false;

    if (promptFileId) {
      void getFileMetadata(promptFileId)
        .then((meta) => {
          if (!cancelled) setPromptFileMeta(meta);
        })
        .catch(() => {
          // Fallback to generic attachment title
        });
    }

    if (submittedFileId) {
      void getFileMetadata(submittedFileId)
        .then((meta) => {
          if (!cancelled) setUploadedFile(meta);
        })
        .catch(() => {
          // Fallback to generic attachment title
        });
    }

    return () => {
      cancelled = true;
    };
  }, [promptFileId, submittedFileId]);

  const handleDownload = async (fileId: string, fallbackName?: string) => {
    try {
      await downloadFile(fileId, fallbackName);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không thể tải tệp xuống.'));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked || isGraded) return;
    setFormError(null);

    const trimmedText = contentText.trim();
    const trimmedUrl = externalUrl.trim();
    let finalContentText = trimmedText;

    if (trimmedUrl) {
      if (!trimmedText.includes(trimmedUrl)) {
        finalContentText = trimmedText
          ? `${trimmedText}\n\nLiên kết bài làm: ${trimmedUrl}`
          : `Liên kết bài làm: ${trimmedUrl}`;
      }
    }

    const effectiveFileId =
      uploadedFile?.fileId ?? (fileRemoved ? null : existingSubmission?.fileId ?? null);
    if (!finalContentText && !effectiveFileId) {
      setFormError('Vui lòng nhập nội dung bài làm hoặc tải lên tệp đính kèm.');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitAssignment(assignmentId, {
        contentText: finalContentText || null,
        fileId: effectiveFileId,
      });
      toast.success(
        existingSubmission ? 'Đã cập nhật bài nộp.' : 'Đã nộp bài tập thành công.',
      );
      onSubmitted(saved);
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, 'Không thể nộp bài tập.');
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const canEdit = !isGraded && !isLocked;

  return (
    <>
      <Modal
        isOpen
        onClose={() => {
          if (!submitting) onClose();
        }}
        title={assignment.title}
        subtitle={`Hạn nộp: ${formatDateTimeVi(dueAt)} • Thang điểm tối đa: ${maxScore}${
          assignment.weightPercent != null ? ` • Trọng số ${assignment.weightPercent}%` : ''
        }`}
        size="lg"
        closeOnBackdrop={!submitting}
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Đóng
            </button>
            {canEdit && (
              <button
                type="submit"
                form={`${baseId}-submit-form`}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {submitting
                  ? 'Đang gửi...'
                  : existingSubmission
                    ? 'Cập nhật bài nộp'
                    : 'Nộp bài tập'}
              </button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={deadlineMeta.variant} dot>
              {deadlineMeta.label}
            </Badge>
            {existingSubmission && (
              <Badge variant={getSubmissionStatusBadgeVariant(existingSubmission.status)}>
                {formatSubmissionStatus(existingSubmission.status)}
              </Badge>
            )}
            {existingSubmission && (
              <span className="text-xs text-[var(--lms-text-muted)]">
                Lần nộp gần nhất: {formatDateTimeVi(getSubmissionSubmittedAt(existingSubmission))}
              </span>
            )}
          </div>

          <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
              Yêu cầu đề bài
            </h3>
            {assignment.description ? (
              <SafeHtml
                html={toSafeDisplayHtml(assignment.description)}
                className="lms-rich-content text-sm text-[var(--lms-text)]"
              />
            ) : (
              <p className="text-sm text-[var(--lms-text-muted)]">
                Không có mô tả bổ sung.
              </p>
            )}

            {assignment.attachmentFileId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--lms-text)]">
                    {promptFileMeta?.originalName ?? 'Tài liệu đề bài đính kèm'}
                  </p>
                  <p className="text-xs text-[var(--lms-text-muted)]">
                    {promptFileMeta
                      ? `${formatFileSize(promptFileMeta.sizeBytes)} • ${promptFileMeta.mimeType}`
                      : 'Tệp đính kèm đề bài'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewConfig({
                        fileId: assignment.attachmentFileId,
                        fileName: promptFileMeta?.originalName ?? 'Đề bài tập',
                        mimeType: promptFileMeta?.mimeType,
                        title: 'Xem trước đề bài',
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
                      void handleDownload(
                        assignment.attachmentFileId as string,
                        promptFileMeta?.originalName,
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Tải xuống
                  </button>
                </div>
              </div>
            ) : assignment.attachmentUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2">
                <span className="truncate text-xs text-[var(--lms-text)]">
                  {assignment.attachmentUrl}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewConfig({
                        externalUrl: assignment.attachmentUrl,
                        fileName: 'Tài liệu đề bài',
                        title: 'Xem trước đề bài',
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Xem
                  </button>
                  <a
                    href={assignment.attachmentUrl}
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

            {rubricCriteria.length > 0 && (
              <div className="pt-1">
                <p className="mb-1.5 text-xs font-semibold text-[var(--lms-text-muted)]">
                  Tiêu chí đánh giá:
                </p>
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {rubricCriteria.map((criterion) => (
                    <li
                      key={criterion.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs"
                    >
                      <span className="truncate text-[var(--lms-text)]">{criterion.title}</span>
                      <span className="tabular-nums shrink-0 font-semibold text-blue-600 dark:text-blue-400">
                        {criterion.maxPoints} đ
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {isGraded && existingSubmission && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/40 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                  <Award className="h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-bold">Kết quả chấm điểm</span>
                </div>
                <span className="tabular-nums rounded-lg bg-emerald-600 px-3 py-1 text-sm font-bold text-white dark:bg-emerald-500">
                  {existingSubmission.score ?? 0} / {maxScore}
                </span>
              </div>
              {existingSubmission.feedback ? (
                <div className="rounded-lg border border-emerald-200/80 bg-[var(--lms-surface)] p-3 dark:border-emerald-800/60">
                  <p className="mb-1 text-xs font-semibold text-[var(--lms-text-muted)]">
                    Nhận xét của giảng viên:
                  </p>
                  <SafeHtml
                    html={toSafeDisplayHtml(existingSubmission.feedback)}
                    className="lms-rich-content text-sm text-[var(--lms-text)]"
                  />
                </div>
              ) : (
                <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
                  Giảng viên chưa để lại nhận xét bằng văn bản.
                </p>
              )}
            </div>
          )}

          {!isGraded && isLocked && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              <div>
                <p className="font-semibold">Cổng nộp bài đã đóng</p>
                <p className="mt-0.5 text-xs">
                  {assignmentStatus === 'CLOSED'
                    ? 'Giảng viên đã đóng bài tập này.'
                    : 'Đã quá hạn nộp bài và bài tập không cho phép nộp muộn.'}
                </p>
              </div>
            </div>
          )}

          {!isGraded && !isLocked && isPastDue && assignment.allowLate && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div>
                <p className="font-semibold">Đã quá hạn chính thức — đang mở nộp muộn</p>
                <p className="mt-0.5 text-xs">
                  Bạn vẫn có thể nộp bài nhưng hệ thống sẽ gắn nhãn Nộp muộn cho giảng viên theo dõi.
                </p>
              </div>
            </div>
          )}

          {canEdit ? (
            <form id={`${baseId}-submit-form`} onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor={`${baseId}-content`}
                  className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
                >
                  Nội dung bài làm / Ghi chú gửi giảng viên
                </label>
                <textarea
                  id={`${baseId}-content`}
                  rows={5}
                  value={contentText}
                  onChange={(event) => setContentText(event.target.value)}
                  disabled={submitting}
                  placeholder="Nhập câu trả lời, giải trình bài làm hoặc dán liên kết báo cáo..."
                  className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2.5 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <FileDropzone
                courseId={courseId}
                scope="SUBMISSION"
                value={uploadedFile}
                fallbackUrl={externalUrl}
                allowExternalUrl
                disabled={submitting}
                label="Tệp bài làm đính kèm"
                helperText="Kéo thả hoặc chọn tệp bài làm (PDF, DOCX, ZIP, hình ảnh...). Bạn có thể xem trước tệp trước khi bấm Nộp."
                onUploaded={(file) => {
                  setUploadedFile(file);
                  setFileRemoved(false);
                  setExternalUrl('');
                }}
                onRemove={() => {
                  setUploadedFile(null);
                  setFileRemoved(true);
                }}
                onPreview={(file) =>
                  setPreviewConfig({
                    fileId: file.fileId,
                    fileName: file.originalName,
                    mimeType: file.mimeType,
                    title: 'Xem trước tệp bài làm',
                  })
                }
                onFallbackUrlChange={(url) => {
                  setExternalUrl(url);
                  if (url.trim()) {
                    setUploadedFile(null);
                    setFileRemoved(true);
                  }
                }}
                onError={(message) => toast.error(message)}
              />
            </form>
          ) : existingSubmission ? (
            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
                Bài làm đã nộp
              </h3>
              {getSubmissionText(existingSubmission) ? (
                <SafeHtml
                  html={toSafeDisplayHtml(getSubmissionText(existingSubmission))}
                  className="lms-rich-content rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3 text-sm text-[var(--lms-text)]"
                />
              ) : (
                <p className="text-sm text-[var(--lms-text-muted)]">Không có nội dung văn bản.</p>
              )}

              {existingSubmission.fileId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 px-3 py-2">
                  <span className="truncate text-sm font-medium text-[var(--lms-text)]">
                    {uploadedFile?.originalName ?? 'Tệp bài làm đã nộp'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewConfig({
                          fileId: existingSubmission.fileId,
                          fileName: uploadedFile?.originalName ?? 'Bài làm đã nộp',
                          mimeType: uploadedFile?.mimeType,
                          title: 'Xem lại tệp bài làm',
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
                        void handleDownload(
                          existingSubmission.fileId as string,
                          uploadedFile?.originalName,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Tải xuống
                    </button>
                  </div>
                </div>
              ) : getSubmissionUrl(existingSubmission) ? (
                <a
                  href={getSubmissionUrl(existingSubmission)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Mở liên kết bài làm đã nộp
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>

      <FilePreviewModal
        isOpen={Boolean(previewConfig)}
        onClose={() => setPreviewConfig(null)}
        fileId={previewConfig?.fileId}
        fileName={previewConfig?.fileName}
        mimeType={previewConfig?.mimeType}
        externalUrl={previewConfig?.externalUrl}
        title={previewConfig?.title}
      />
    </>
  );
}

export function StudentSubmitDrawer(props: StudentSubmitDrawerProps) {
  if (!props.isOpen || !props.assignment) return null;
  const subKey = props.existingSubmission
    ? getSubmissionId(props.existingSubmission)
    : 'none';
  return (
    <StudentSubmitInner
      key={`${getAssignmentId(props.assignment)}:${subKey}`}
      onClose={props.onClose}
      assignment={props.assignment}
      courseId={props.courseId}
      existingSubmission={props.existingSubmission}
      onSubmitted={props.onSubmitted}
    />
  );
}
