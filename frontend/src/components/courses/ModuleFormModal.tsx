import React, { useState } from 'react';
import { createModule, updateModule } from '../../api/content';
import type { Module } from '../../types';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export interface ModuleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  editingModule?: Module | null;
  nextSortOrder: number;
  onSaved: () => void;
}

const ModuleFormBody: React.FC<{
  onClose: () => void;
  courseId: string;
  editingModule?: Module | null;
  nextSortOrder: number;
  onSaved: () => void;
}> = ({ onClose, courseId, editingModule, nextSortOrder, onSaved }) => {
  const toast = useToast();
  const [title, setTitle] = useState(editingModule?.title ?? '');
  const [description, setDescription] = useState(editingModule?.description ?? '');
  const [isPublished, setIsPublished] = useState(editingModule?.isPublished ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('Vui lòng nhập tiêu đề chương học.');
      return;
    }

    setSaving(true);
    try {
      if (editingModule) {
        await updateModule(editingModule.moduleId, {
          title: trimmed,
          description: description.trim() || null,
          isPublished,
        });
        toast.success('Đã cập nhật chương học.');
      } else {
        await createModule(courseId, {
          title: trimmed,
          description: description.trim() || undefined,
          sortOrder: nextSortOrder,
          isPublished,
        });
        toast.success('Đã tạo chương học mới.');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu chương học.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="module-title-input"
          className="block text-sm font-medium text-[var(--lms-text)] mb-1"
        >
          Tên chương học *
        </label>
        <input
          id="module-title-input"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ví dụ: Chương 1 — Nhập môn thuật toán"
          className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
        />
      </div>

      <div>
        <label
          htmlFor="module-desc-input"
          className="block text-sm font-medium text-[var(--lms-text)] mb-1"
        >
          Mô tả ngắn
        </label>
        <textarea
          id="module-desc-input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mục tiêu học tập hoặc tóm tắt nội dung chương..."
          className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
        />
      </div>

      <label className="flex items-center gap-2.5 text-sm text-[var(--lms-text)] cursor-pointer">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="w-4 h-4 rounded accent-[var(--color-primary)]"
        />
        <span>Xuất bản ngay cho sinh viên</span>
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
          {saving ? 'Đang lưu...' : editingModule ? 'Cập nhật' : 'Tạo chương'}
        </button>
      </div>
    </form>
  );
};

export const ModuleFormModal: React.FC<ModuleFormModalProps> = ({
  isOpen,
  onClose,
  courseId,
  editingModule,
  nextSortOrder,
  onSaved,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingModule ? 'Chỉnh sửa chương học' : 'Thêm chương học mới'}
      size="md"
    >
      {isOpen && (
        <ModuleFormBody
          key={editingModule?.moduleId ?? 'new-module'}
          onClose={onClose}
          courseId={courseId}
          editingModule={editingModule}
          nextSortOrder={nextSortOrder}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
};
