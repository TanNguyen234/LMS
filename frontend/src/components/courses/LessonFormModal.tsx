import React, { useEffect, useState } from 'react';
import { createLesson, updateLesson } from '../../api/content';
import { getFileMetadata } from '../../api/files';
import type { Lesson, LessonContentType, StoredFile } from '../../types';
import { FileDropzone } from '../files/FileDropzone';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export interface LessonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  moduleId: string | null;
  editingLesson?: Lesson | null;
  nextSortOrder: number;
  onSaved: (lessonId?: string) => void;
  onPreviewFile: (file: StoredFile) => void;
}

const LessonFormBody: React.FC<{
  onClose: () => void;
  courseId: string;
  moduleId: string | null;
  editingLesson?: Lesson | null;
  nextSortOrder: number;
  onSaved: (lessonId?: string) => void;
  onPreviewFile: (file: StoredFile) => void;
}> = ({
  onClose,
  courseId,
  moduleId,
  editingLesson,
  nextSortOrder,
  onSaved,
  onPreviewFile,
}) => {
  const toast = useToast();
  const initialFileId = editingLesson?.attachmentFileId ?? null;
  const initialFallbackUrl = initialFileId ? '' : (editingLesson?.materialUrl ?? '');

  const [title, setTitle] = useState(editingLesson?.title ?? '');
  const [contentType, setContentType] = useState<LessonContentType>(
    editingLesson?.contentType ?? 'TEXT',
  );
  const [contentHtml, setContentHtml] = useState(
    editingLesson?.contentHtml ?? editingLesson?.content_body ?? '',
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>(
    editingLesson?.estimatedMinutes !== undefined
      ? String(editingLesson.estimatedMinutes)
      : '15',
  );
  const [isPublished, setIsPublished] = useState(editingLesson?.isPublished ?? true);
  const [uploadedFile, setUploadedFile] = useState<StoredFile | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState(initialFallbackUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialFileId) return;
    let active = true;
    getFileMetadata(initialFileId)
      .then((meta) => {
        if (active) setUploadedFile(meta);
      })
      .catch(() => {
        // Allow editing even if metadata lookup fails
      });
    return () => {
      active = false;
    };
  }, [initialFileId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Vui lòng nhập tiêu đề bài giảng.');
      return;
    }

    const parsedMinutes = estimatedMinutes.trim() ? Number(estimatedMinutes.trim()) : undefined;
    if (
      parsedMinutes !== undefined &&
      (!Number.isFinite(parsedMinutes) || parsedMinutes < 0)
    ) {
      toast.error('Thời lượng ước tính phải lớn hơn hoặc bằng 0.');
      return;
    }

    const materialUrl = uploadedFile
      ? uploadedFile.downloadUrl
      : fallbackUrl.trim() || null;
    const attachmentFileId = uploadedFile ? uploadedFile.fileId : null;

    setSaving(true);
    try {
      if (editingLesson) {
        const updated = await updateLesson(editingLesson.lessonId, {
          title: trimmedTitle,
          contentType,
          contentHtml: contentHtml.trim() || null,
          materialUrl,
          attachmentFileId,
          estimatedMinutes: parsedMinutes ?? null,
          isPublished,
        });
        toast.success('Đã cập nhật bài giảng.');
        onSaved(updated.lessonId);
      } else if (moduleId) {
        const created = await createLesson(moduleId, {
          title: trimmedTitle,
          contentType,
          contentHtml: contentHtml.trim() || undefined,
          materialUrl,
          attachmentFileId,
          estimatedMinutes: parsedMinutes,
          sortOrder: nextSortOrder,
          isPublished,
        });
        toast.success('Đã thêm bài giảng mới.');
        onSaved(created.lessonId);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu bài giảng.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        <div className="sm:col-span-6">
          <label
            htmlFor="lesson-title-input"
            className="block text-sm font-medium text-[var(--lms-text)] mb-1"
          >
            Tiêu đề bài giảng *
          </label>
          <input
            id="lesson-title-input"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ví dụ: Bài 1.1 — Độ phức tạp thuật toán"
            className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
          />
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="lesson-type-select"
            className="block text-sm font-medium text-[var(--lms-text)] mb-1"
          >
            Định dạng chính
          </label>
          <select
            id="lesson-type-select"
            value={contentType}
            onChange={(e) => setContentType(e.target.value as LessonContentType)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
          >
            <option value="TEXT">Văn bản / HTML</option>
            <option value="PDF">Tài liệu PDF</option>
            <option value="SLIDE">Bài trình chiếu (Slide)</option>
            <option value="VIDEO">Video bài giảng</option>
          </select>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="lesson-minutes-input"
            className="block text-sm font-medium text-[var(--lms-text)] mb-1"
          >
            Thời lượng (phút)
          </label>
          <input
            id="lesson-minutes-input"
            type="number"
            min={0}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="lesson-html-input"
          className="block text-sm font-medium text-[var(--lms-text)] mb-1"
        >
          Nội dung bài giảng (hỗ trợ HTML cơ bản)
        </label>
        <textarea
          id="lesson-html-input"
          rows={6}
          value={contentHtml}
          onChange={(e) => setContentHtml(e.target.value)}
          placeholder="<p>Nhập nội dung tóm tắt, ghi chú hoặc bài giảng chi tiết...</p>"
          className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] font-mono"
        />
      </div>

      <FileDropzone
        courseId={courseId}
        scope="LESSON"
        value={uploadedFile}
        fallbackUrl={fallbackUrl}
        allowExternalUrl
        label="Tài liệu học tập đính kèm (PDF, Slide, Video, Ảnh) hoặc liên kết ngoài"
        onUploaded={(file) => {
          setUploadedFile(file);
          setFallbackUrl('');
        }}
        onRemove={() => {
          setUploadedFile(null);
          setFallbackUrl('');
        }}
        onFallbackUrlChange={(url) => {
          setFallbackUrl(url);
          if (url) setUploadedFile(null);
        }}
        onPreview={onPreviewFile}
        onError={(msg) => toast.error(msg)}
      />

      <label className="flex items-center gap-2.5 text-sm text-[var(--lms-text)] cursor-pointer">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="w-4 h-4 rounded accent-[var(--color-primary)]"
        />
        <span>Xuất bản bài giảng cho sinh viên</span>
      </label>

      <div className="flex justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 transition cursor-pointer"
        >
          {saving ? 'Đang lưu...' : editingLesson ? 'Lưu thay đổi' : 'Thêm bài giảng'}
        </button>
      </div>
    </form>
  );
};

export const LessonFormModal: React.FC<LessonFormModalProps> = ({
  isOpen,
  onClose,
  courseId,
  moduleId,
  editingLesson,
  nextSortOrder,
  onSaved,
  onPreviewFile,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingLesson ? 'Chỉnh sửa bài giảng' : 'Thêm bài giảng mới'}
      size="lg"
    >
      {isOpen && (
        <LessonFormBody
          key={editingLesson?.lessonId ?? `new-${moduleId ?? 'none'}`}
          onClose={onClose}
          courseId={courseId}
          moduleId={moduleId}
          editingLesson={editingLesson}
          nextSortOrder={nextSortOrder}
          onSaved={onSaved}
          onPreviewFile={onPreviewFile}
        />
      )}
    </Modal>
  );
};
