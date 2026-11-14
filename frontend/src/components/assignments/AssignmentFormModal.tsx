import { useEffect, useId, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { getFileMetadata } from '../../api/files';
import {
  createAssignment,
  updateAssignment,
  type AssignmentSavePayload,
} from '../../api/learning';
import type { Assignment, StoredFile } from '../../types';
import { FileDropzone } from '../files/FileDropzone';
import { FilePreviewModal } from '../files/FilePreviewModal';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  getAssignmentDueAt,
  getAssignmentId,
  getAssignmentMaxScore,
  getAssignmentStatus,
  getDefaultDueDateInput,
  getErrorMessage,
  localDateTimeInputToUtcIso,
  parseRubricCriteria,
  serializeRubricCriteria,
  toLocalDateTimeInput,
  type AssignmentLifecycleStatus,
  type RubricCriterion,
} from './assignmentUtils';

export interface AssignmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  assignment: Assignment | null;
  onSaved: (saved: Assignment, isEdit: boolean) => void;
}

function AssignmentFormModalInner({
  onClose,
  courseId,
  assignment,
  onSaved,
}: Omit<AssignmentFormModalProps, 'isOpen'>) {
  const toast = useToast();
  const baseId = useId();
  const isEdit = Boolean(assignment);

  const [title, setTitle] = useState(() => assignment?.title ?? '');
  const [description, setDescription] = useState(() => assignment?.description ?? '');
  const [dueDateInput, setDueDateInput] = useState(() =>
    assignment
      ? toLocalDateTimeInput(getAssignmentDueAt(assignment)) || getDefaultDueDateInput()
      : getDefaultDueDateInput(),
  );
  const [maxScore, setMaxScore] = useState(() =>
    assignment ? String(getAssignmentMaxScore(assignment)) : '10',
  );
  const [weightPercent, setWeightPercent] = useState(() =>
    assignment?.weightPercent != null ? String(assignment.weightPercent) : '',
  );
  const [status, setStatus] = useState<AssignmentLifecycleStatus>(() =>
    assignment ? getAssignmentStatus(assignment) : 'PUBLISHED',
  );
  const [allowLate, setAllowLate] = useState(() => Boolean(assignment?.allowLate));
  const [rubricCriteria, setRubricCriteria] = useState<RubricCriterion[]>(() =>
    assignment ? parseRubricCriteria(assignment.rubricJson) : [],
  );

  const [attachedFile, setAttachedFile] = useState<StoredFile | null>(null);
  const [externalUrl, setExternalUrl] = useState(() =>
    assignment && !assignment.attachmentFileId ? (assignment.attachmentUrl ?? '') : '',
  );
  const [previewTarget, setPreviewTarget] = useState<StoredFile | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existingFileId = assignment?.attachmentFileId ?? null;

  useEffect(() => {
    if (!existingFileId) return;
    let cancelled = false;
    void getFileMetadata(existingFileId)
      .then((meta) => {
        if (!cancelled) setAttachedFile(meta);
      })
      .catch(() => {
        if (!cancelled) setAttachedFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [existingFileId]);

  const handleAddCriterion = () => {
    setRubricCriteria((prev) => [
      ...prev,
      {
        id: `crit-${Date.now()}-${prev.length + 1}`,
        title: '',
        maxPoints: 0,
        description: '',
      },
    ]);
  };

  const handleCriterionChange = (
    index: number,
    patch: Partial<RubricCriterion>,
  ) => {
    setRubricCriteria((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  };

  const handleRemoveCriterion = (index: number) => {
    setRubricCriteria((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Vui lòng nhập tiêu đề bài tập.');
      return;
    }

    if (!dueDateInput) {
      setFormError('Vui lòng chọn hạn nộp bài.');
      return;
    }

    let dueAtIso: string;
    try {
      dueAtIso = localDateTimeInputToUtcIso(dueDateInput);
    } catch {
      setFormError('Hạn nộp bài không đúng định dạng ngày giờ.');
      return;
    }

    const parsedMaxScore = Number(maxScore);
    if (!Number.isFinite(parsedMaxScore) || parsedMaxScore <= 0) {
      setFormError('Thang điểm tối đa phải lớn hơn 0.');
      return;
    }

    let parsedWeight: number | null = null;
    if (weightPercent.trim() !== '') {
      const numericWeight = Number(weightPercent);
      if (!Number.isFinite(numericWeight) || numericWeight < 0 || numericWeight > 100) {
        setFormError('Trọng số điểm phải nằm trong khoảng 0 đến 100%.');
        return;
      }
      parsedWeight = numericWeight;
    }

    const payload: AssignmentSavePayload = {
      title: trimmedTitle,
      description: description.trim() ? description.trim() : null,
      dueAt: dueAtIso,
      maxScore: parsedMaxScore,
      weightPercent: parsedWeight,
      allowLate,
      status,
      attachmentFileId: attachedFile ? attachedFile.fileId : null,
      attachmentUrl: attachedFile
        ? attachedFile.downloadUrl
        : externalUrl.trim()
          ? externalUrl.trim()
          : null,
      rubricJson: serializeRubricCriteria(rubricCriteria),
    };

    setSaving(true);
    try {
      const saved = assignment
        ? await updateAssignment(getAssignmentId(assignment), payload)
        : await createAssignment(courseId, payload);
      toast.success(
        isEdit ? 'Đã cập nhật thông tin bài tập.' : 'Đã tạo bài tập mới.',
      );
      onSaved(saved, isEdit);
      onClose();
    } catch (error) {
      const message = getErrorMessage(error, 'Không thể lưu thông tin bài tập.');
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const rubricSum = rubricCriteria.reduce(
    (sum, item) => sum + (Number.isFinite(item.maxPoints) ? item.maxPoints : 0),
    0,
  );
  const numericMaxScore = Number(maxScore) || 0;

  return (
    <>
      <Modal
        isOpen
        onClose={() => {
          if (!saving) onClose();
        }}
        title={isEdit ? 'Chỉnh sửa bài tập' : 'Tạo bài tập mới'}
        subtitle={
          isEdit
            ? 'Cập nhật yêu cầu đề bài, hạn nộp, trọng số và tiêu chí chấm điểm.'
            : 'Thiết lập bài tập, tệp đính kèm đề bài và thang điểm cho khóa học.'
        }
        size="lg"
        closeOnBackdrop={!saving}
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="submit"
              form={`${baseId}-form`}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo bài tập'}
            </button>
          </>
        }
      >
        <form id={`${baseId}-form`} onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200"
            >
              {formError}
            </div>
          )}

          <div>
            <label
              htmlFor={`${baseId}-title`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Tiêu đề bài tập <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id={`${baseId}-title`}
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ví dụ: Bài tập tuần 4 - Thiết kế lược đồ cơ sở dữ liệu"
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label
              htmlFor={`${baseId}-description`}
              className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
            >
              Mô tả yêu cầu và hướng dẫn nộp bài
            </label>
            <textarea
              id={`${baseId}-description`}
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Nêu rõ mục tiêu, định dạng bài nộp và lưu ý cho sinh viên..."
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${baseId}-due`}
                className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
              >
                Hạn nộp bài (giờ địa phương) <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                id={`${baseId}-due`}
                type="datetime-local"
                required
                value={dueDateInput}
                onChange={(event) => setDueDateInput(event.target.value)}
                className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-status`}
                className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
              >
                Trạng thái bài tập
              </label>
              <select
                id={`${baseId}-status`}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as AssignmentLifecycleStatus)
                }
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="PUBLISHED">Đã công bố (mở cho sinh viên)</option>
                <option value="DRAFT">Bản nháp (chỉ giảng viên thấy)</option>
                <option value="CLOSED">Đã đóng hạn nộp</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${baseId}-max-score`}
                className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
              >
                Thang điểm tối đa <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                id={`${baseId}-max-score`}
                type="number"
                required
                min="0.5"
                max="1000"
                step="0.5"
                value={maxScore}
                onChange={(event) => setMaxScore(event.target.value)}
                className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-weight`}
                className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]"
              >
                Trọng số tổng kết (%)
              </label>
              <input
                id={`${baseId}-weight`}
                type="number"
                min="0"
                max="100"
                step="1"
                value={weightPercent}
                onChange={(event) => setWeightPercent(event.target.value)}
                placeholder="Tùy chọn (0 - 100)"
                className="tabular-nums w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <label
            htmlFor={`${baseId}-allow-late`}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 px-3.5 py-2.5 text-sm text-[var(--lms-text)]"
          >
            <input
              id={`${baseId}-allow-late`}
              type="checkbox"
              checked={allowLate}
              onChange={(event) => setAllowLate(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--lms-border)] text-blue-600 focus:ring-blue-500"
            />
            <span>
              Cho phép sinh viên nộp muộn sau hạn (bài nộp sẽ được gắn nhãn Nộp muộn)
            </span>
          </label>

          <FileDropzone
            courseId={courseId}
            scope="ASSIGNMENT"
            value={attachedFile}
            fallbackUrl={externalUrl}
            allowExternalUrl
            label="Tài liệu / Đề bài đính kèm"
            helperText="Tải lên tệp PDF, DOCX, hình ảnh hoặc dán liên kết tài liệu ngoài."
            disabled={saving}
            onUploaded={(file) => {
              setAttachedFile(file);
              setExternalUrl('');
            }}
            onRemove={() => {
              setAttachedFile(null);
            }}
            onPreview={(file) => setPreviewTarget(file)}
            onFallbackUrlChange={(url) => {
              setExternalUrl(url);
              if (url.trim()) {
                setAttachedFile(null);
              }
            }}
            onError={(message) => toast.error(message)}
          />

          <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--lms-text)]">
                  Thang tiêu chí chấm điểm (Rubric)
                </h3>
                <p className="text-xs text-[var(--lms-text-muted)]">
                  Hiển thị gợi ý phân bổ điểm khi giảng viên chấm bài. Tổng hiện tại:{' '}
                  <span className="tabular-nums font-semibold text-[var(--lms-text)]">
                    {rubricSum}/{numericMaxScore || '?'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddCriterion}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Thêm tiêu chí
              </button>
            </div>

            {rubricCriteria.length === 0 ? (
              <p className="text-xs text-[var(--lms-text-muted)]">
                Chưa có tiêu chí chi tiết. Bạn có thể thêm các tiêu chí để chuẩn hóa điểm chấm.
              </p>
            ) : (
              <div className="space-y-2.5">
                {rubricCriteria.map((criterion, index) => (
                  <div
                    key={criterion.id}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] p-2.5 sm:grid-cols-12 sm:items-start"
                  >
                    <div className="sm:col-span-5">
                      <label
                        htmlFor={`${baseId}-crit-title-${index}`}
                        className="mb-1 block text-xs font-medium text-[var(--lms-text-muted)]"
                      >
                        Tên tiêu chí
                      </label>
                      <input
                        id={`${baseId}-crit-title-${index}`}
                        type="text"
                        value={criterion.title}
                        onChange={(event) =>
                          handleCriterionChange(index, { title: event.target.value })
                        }
                        placeholder="Ví dụ: Phân tích yêu cầu"
                        className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`${baseId}-crit-points-${index}`}
                        className="mb-1 block text-xs font-medium text-[var(--lms-text-muted)]"
                      >
                        Điểm tối đa
                      </label>
                      <input
                        id={`${baseId}-crit-points-${index}`}
                        type="number"
                        min="0"
                        step="0.5"
                        value={criterion.maxPoints}
                        onChange={(event) =>
                          handleCriterionChange(index, {
                            maxPoints: Number(event.target.value) || 0,
                          })
                        }
                        className="tabular-nums w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label
                        htmlFor={`${baseId}-crit-desc-${index}`}
                        className="mb-1 block text-xs font-medium text-[var(--lms-text-muted)]"
                      >
                        Ghi chú đánh giá
                      </label>
                      <input
                        id={`${baseId}-crit-desc-${index}`}
                        type="text"
                        value={criterion.description}
                        onChange={(event) =>
                          handleCriterionChange(index, { description: event.target.value })
                        }
                        placeholder="Mô tả mức đạt điểm"
                        className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs text-[var(--lms-text)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-end justify-end sm:col-span-1 sm:pt-5">
                      <button
                        type="button"
                        onClick={() => handleRemoveCriterion(index)}
                        aria-label={`Xóa tiêu chí ${index + 1}`}
                        className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>

      <FilePreviewModal
        isOpen={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        fileId={previewTarget?.fileId}
        fileName={previewTarget?.originalName}
        mimeType={previewTarget?.mimeType}
        title="Xem trước tệp đề bài"
      />
    </>
  );
}

export function AssignmentFormModal(props: AssignmentFormModalProps) {
  if (!props.isOpen) return null;
  const key = props.assignment ? getAssignmentId(props.assignment) : 'new';
  return (
    <AssignmentFormModalInner
      key={key}
      onClose={props.onClose}
      courseId={props.courseId}
      assignment={props.assignment}
      onSaved={props.onSaved}
    />
  );
}
