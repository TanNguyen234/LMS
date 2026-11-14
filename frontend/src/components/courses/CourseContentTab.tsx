import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  File as FileIcon,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Presentation,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import {
  deleteLesson,
  deleteModule,
  reorderLesson,
  reorderModule,
  toggleLessonPublish,
  toggleModulePublish,
} from '../../api/content';
import { downloadFile } from '../../api/files';
import { ApiError } from '../../api/http';
import { updateLessonProgress } from '../../api/learning';
import type { Lesson, LessonContentType, Module, StoredFile } from '../../types';
import { LessonAiTutorDrawer } from '../ai/LessonAiTutorDrawer';
import { FilePreviewModal } from '../files/FilePreviewModal';
import { Badge } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { SafeHtml } from '../ui/SafeHtml';
import { useToast } from '../ui/Toast';
import { LessonFormModal } from './LessonFormModal';
import { ModuleFormModal } from './ModuleFormModal';

const CONTENT_TYPE_META: Record<
  LessonContentType,
  { label: string; icon: React.ElementType }
> = {
  TEXT: { label: 'Bài đọc', icon: FileText },
  PDF: { label: 'Tài liệu PDF', icon: FileIcon },
  SLIDE: { label: 'Slide bài giảng', icon: Presentation },
  VIDEO: { label: 'Video', icon: Video },
};

function extractApiFileId(materialUrl?: string | null): string | null {
  if (!materialUrl) return null;
  const match = materialUrl.match(/\/(?:api\/)?files\/([0-9a-fA-F-]{8,})\/content/i);
  return match ? match[1] : null;
}

function isSafeHttpUrl(raw?: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface CourseContentTabProps {
  courseId: string;
  modules: Module[];
  canManage: boolean;
  isStudent: boolean;
  completedLessonIds: Set<string>;
  onRefreshContent: () => Promise<void>;
  onToggleLessonCompletedLocally?: (lessonId: string, isCompleted: boolean) => void;
}

export const CourseContentTab: React.FC<CourseContentTabProps> = ({
  courseId,
  modules,
  canManage,
  isStudent,
  completedLessonIds,
  onRefreshContent,
  onToggleLessonCompletedLocally,
}) => {
  const toast = useToast();
  const confirm = useConfirm();

  const sortedModules = useMemo(
    () =>
      [...modules]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((mod) => ({
          ...mod,
          lessons: [...(mod.lessons ?? [])].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          ),
        })),
    [modules],
  );

  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [togglingProgressId, setTogglingProgressId] = useState<string | null>(null);

  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);

  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonTargetModuleId, setLessonTargetModuleId] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  const [tutorOpen, setTutorOpen] = useState(false);
  const [previewState, setPreviewState] = useState<{
    isOpen: boolean;
    fileId?: string | null;
    fileName?: string;
    mimeType?: string;
    externalUrl?: string | null;
    title?: string;
  }>({ isOpen: false });

  const effectiveSelectedLessonId = (() => {
    const allLessons = sortedModules.flatMap((m) => m.lessons);
    if (allLessons.length === 0) return null;
    if (selectedLessonId && allLessons.some((l) => l.lessonId === selectedLessonId)) {
      return selectedLessonId;
    }
    return allLessons[0].lessonId;
  })();

  let activeSelection: { module: (typeof sortedModules)[number]; lesson: Lesson } | null = null;
  if (effectiveSelectedLessonId) {
    for (const mod of sortedModules) {
      const lesson = mod.lessons.find((l) => l.lessonId === effectiveSelectedLessonId);
      if (lesson) {
        activeSelection = { module: mod, lesson };
        break;
      }
    }
  }

  const toggleExpand = (moduleId: string) => {
    setCollapsedModules((prev) => ({ ...prev, [moduleId]: !(prev[moduleId] ?? false) }));
  };

  const handleReorderModule = async (moduleId: string, direction: 'UP' | 'DOWN') => {
    try {
      await reorderModule(moduleId, { direction });
      await onRefreshContent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể sắp xếp lại chương.');
    }
  };

  const handleToggleModulePublish = async (mod: Module) => {
    try {
      await toggleModulePublish(mod.moduleId, !(mod.isPublished ?? true));
      await onRefreshContent();
      toast.success(mod.isPublished ? 'Đã chuyển chương về nháp.' : 'Đã xuất bản chương học.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể đổi trạng thái chương.');
    }
  };

  const handleDeleteModule = async (mod: Module) => {
    const ok = await confirm({
      title: 'Xóa chương học',
      message: `Bạn có chắc muốn xóa chương "${mod.title}"? Chương còn bài giảng sẽ không thể xóa trước khi dọn bài học bên trong.`,
      confirmText: 'Xóa chương',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteModule(mod.moduleId);
      toast.success('Đã xóa chương học.');
      await onRefreshContent();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.warning(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : 'Không thể xóa chương học.');
      }
    }
  };

  const handleReorderLesson = async (lessonId: string, direction: 'UP' | 'DOWN') => {
    try {
      await reorderLesson(lessonId, { direction });
      await onRefreshContent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể sắp xếp lại bài giảng.');
    }
  };

  const handleToggleLessonPublish = async (lesson: Lesson) => {
    try {
      await toggleLessonPublish(lesson.lessonId, !lesson.isPublished);
      await onRefreshContent();
      toast.success(
        lesson.isPublished ? 'Đã chuyển bài giảng về nháp.' : 'Đã xuất bản bài giảng.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể đổi trạng thái bài giảng.');
    }
  };

  const handleDeleteLesson = async (lesson: Lesson) => {
    const ok = await confirm({
      title: 'Xóa bài giảng',
      message: `Xác nhận xóa bài giảng "${lesson.title}"?`,
      confirmText: 'Xóa bài giảng',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteLesson(lesson.lessonId);
      toast.success('Đã xóa bài giảng.');
      await onRefreshContent();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.warning(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : 'Không thể xóa bài giảng.');
      }
    }
  };

  const handleToggleCompletion = async (lesson: Lesson) => {
    if (!isStudent) return;
    const currentlyCompleted = completedLessonIds.has(lesson.lessonId);
    setTogglingProgressId(lesson.lessonId);
    try {
      await updateLessonProgress(lesson.lessonId, {
        isCompleted: !currentlyCompleted,
        timeSpentDeltaSeconds: 30,
      });
      onToggleLessonCompletedLocally?.(lesson.lessonId, !currentlyCompleted);
      toast.success(
        !currentlyCompleted
          ? 'Đã đánh dấu hoàn thành bài giảng.'
          : 'Đã bỏ đánh dấu hoàn thành.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật tiến độ học.');
    } finally {
      setTogglingProgressId(null);
    }
  };

  const handleDownloadLessonAttachment = async (fileId: string, title: string) => {
    try {
      await downloadFile(fileId, title);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tải tệp đính kèm.');
    }
  };

  const openPreviewFromStoredFile = (file: StoredFile) => {
    setPreviewState({
      isOpen: true,
      fileId: file.fileId,
      fileName: file.originalName,
      mimeType: file.mimeType,
      title: file.originalName,
    });
  };

  const activeLesson = activeSelection?.lesson ?? null;
  const activeFileId = activeLesson
    ? activeLesson.attachmentFileId || extractApiFileId(activeLesson.materialUrl)
    : null;
  const activeExternalUrl =
    activeLesson && !activeFileId && isSafeHttpUrl(activeLesson.materialUrl)
      ? activeLesson.materialUrl!
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <aside className="lg:col-span-4 bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3.5 border-b border-[var(--lms-border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[var(--lms-text)]">
              Đề cương & Bài giảng ({sortedModules.length})
            </h2>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditingModule(null);
                setModuleModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold hover:opacity-95 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Thêm chương
            </button>
          )}
        </div>

        {sortedModules.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<BookOpen className="w-6 h-6" />}
              title="Chưa có chương học nào"
              description={
                canManage
                  ? 'Nhấn "Thêm chương" để bắt đầu xây dựng lộ trình bài giảng.'
                  : 'Giảng viên chưa đăng tải chương học nào cho khóa học này.'
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-[var(--lms-border)]">
            {sortedModules.map((mod, modIdx) => {
              const isExpanded = !(collapsedModules[mod.moduleId] ?? false);
              const isPublished = mod.isPublished ?? true;

              return (
                <div key={mod.moduleId}>
                  <div className="px-3.5 py-3 bg-[var(--lms-surface-muted)]/35 flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(mod.moduleId)}
                      className="flex-1 min-w-0 flex items-start gap-2 text-left cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 mt-0.5 text-[var(--lms-text-muted)] shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 mt-0.5 text-[var(--lms-text-muted)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-[var(--lms-text)]">
                            {mod.title}
                          </span>
                          {!isPublished && (
                            <Badge variant="warning" size="sm">
                              Nháp
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--lms-text-muted)] mt-0.5 tabular-nums">
                          {mod.lessons.length} bài giảng
                        </div>
                      </div>
                    </button>

                    {canManage && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={modIdx === 0}
                          onClick={() => void handleReorderModule(mod.moduleId, 'UP')}
                          title="Di chuyển lên"
                          aria-label="Di chuyển chương lên"
                          className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={modIdx === sortedModules.length - 1}
                          onClick={() => void handleReorderModule(mod.moduleId, 'DOWN')}
                          title="Di chuyển xuống"
                          aria-label="Di chuyển chương xuống"
                          className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleModulePublish(mod)}
                          title={isPublished ? 'Ẩn khỏi sinh viên' : 'Xuất bản chương'}
                          aria-label="Đổi trạng thái xuất bản chương"
                          className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] cursor-pointer"
                        >
                          {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLesson(null);
                            setLessonTargetModuleId(mod.moduleId);
                            setLessonModalOpen(true);
                          }}
                          title="Thêm bài giảng vào chương"
                          aria-label="Thêm bài giảng"
                          className="p-1 rounded text-[var(--color-primary)] hover:bg-blue-500/10 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingModule(mod);
                            setModuleModalOpen(true);
                          }}
                          title="Sửa chương"
                          aria-label="Sửa chương"
                          className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteModule(mod)}
                          title="Xóa chương"
                          aria-label="Xóa chương"
                          className="p-1 rounded text-[var(--lms-text-muted)] hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="divide-y divide-[var(--lms-border)]/60">
                      {mod.lessons.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-[var(--lms-text-muted)]">
                          Chưa có bài giảng trong chương này.
                        </div>
                      ) : (
                        mod.lessons.map((lesson, lessonIdx) => {
                          const isSelected = lesson.lessonId === effectiveSelectedLessonId;
                          const isCompleted = completedLessonIds.has(lesson.lessonId);
                          const typeMeta = CONTENT_TYPE_META[lesson.contentType ?? 'TEXT'];
                          const TypeIcon = typeMeta.icon;

                          return (
                            <div
                              key={lesson.lessonId}
                              className={`px-3.5 py-2.5 flex items-center justify-between gap-2 transition ${
                                isSelected
                                  ? 'bg-blue-500/10 border-l-2 border-l-[var(--color-primary)]'
                                  : 'hover:bg-[var(--lms-surface-muted)]/50'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedLessonId(lesson.lessonId)}
                                className="flex-1 min-w-0 flex items-start gap-2.5 text-left cursor-pointer"
                              >
                                {isStudent ? (
                                  isCompleted ? (
                                    <CheckCircle2
                                      className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                                      aria-label="Đã hoàn thành"
                                    />
                                  ) : (
                                    <Circle
                                      className="w-4 h-4 mt-0.5 text-[var(--lms-text-muted)] shrink-0"
                                      aria-label="Chưa hoàn thành"
                                    />
                                  )
                                ) : (
                                  <TypeIcon
                                    className="w-4 h-4 mt-0.5 text-[var(--lms-text-muted)] shrink-0"
                                    aria-hidden="true"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[var(--lms-text)] truncate">
                                    {lesson.title}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--lms-text-muted)] mt-0.5">
                                    <span>{typeMeta.label}</span>
                                    {lesson.estimatedMinutes !== undefined && (
                                      <span className="tabular-nums">
                                        · {lesson.estimatedMinutes} phút
                                      </span>
                                    )}
                                    {!lesson.isPublished && (
                                      <Badge variant="warning" size="sm">
                                        Nháp
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </button>

                              {canManage && (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={lessonIdx === 0}
                                    onClick={() => void handleReorderLesson(lesson.lessonId, 'UP')}
                                    aria-label="Đưa bài giảng lên"
                                    className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={lessonIdx === mod.lessons.length - 1}
                                    onClick={() => void handleReorderLesson(lesson.lessonId, 'DOWN')}
                                    aria-label="Đưa bài giảng xuống"
                                    className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleLessonPublish(lesson)}
                                    aria-label="Đổi trạng thái xuất bản bài giảng"
                                    className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] cursor-pointer"
                                  >
                                    {lesson.isPublished ? (
                                      <Eye className="w-3 h-3" />
                                    ) : (
                                      <EyeOff className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingLesson(lesson);
                                      setLessonTargetModuleId(mod.moduleId);
                                      setLessonModalOpen(true);
                                    }}
                                    aria-label="Chỉnh sửa bài giảng"
                                    className="p-1 rounded text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteLesson(lesson)}
                                    aria-label="Xóa bài giảng"
                                    className="p-1 rounded text-[var(--lms-text-muted)] hover:text-rose-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </aside>

      <section className="lg:col-span-8 bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-6 shadow-xs min-h-[420px]">
        {!activeLesson ? (
          <EmptyState
            icon={<BookOpen className="w-6 h-6" />}
            title="Chọn một bài giảng để bắt đầu"
            description="Chọn bài giảng từ cây nội dung bên trái để xem tài liệu, bài đọc và trao đổi với Trợ lý AI."
            className="py-16"
          />
        ) : (
          <div className="space-y-5">
            <div className="pb-4 border-b border-[var(--lms-border)] flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="text-xs font-medium text-[var(--lms-text-muted)]">
                  {activeSelection?.module.title}
                </div>
                <h2 className="text-xl font-bold text-[var(--lms-text)] tracking-tight">
                  {activeLesson.title}
                </h2>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Badge variant="info" size="sm">
                    {CONTENT_TYPE_META[activeLesson.contentType ?? 'TEXT'].label}
                  </Badge>
                  {activeLesson.estimatedMinutes !== undefined && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--lms-text-muted)] tabular-nums">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      {activeLesson.estimatedMinutes} phút học
                    </span>
                  )}
                  {!activeLesson.isPublished && (
                    <Badge variant="warning" size="sm">
                      Bản nháp
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setTutorOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-500/15 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Hỏi Trợ lý AI
                </button>

                {isStudent && (
                  <button
                    type="button"
                    disabled={togglingProgressId === activeLesson.lessonId}
                    onClick={() => void handleToggleCompletion(activeLesson)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      completedLessonIds.has(activeLesson.lessonId)
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] text-[var(--lms-text)] hover:border-emerald-500'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    {completedLessonIds.has(activeLesson.lessonId)
                      ? 'Đã hoàn thành'
                      : 'Đánh dấu hoàn thành'}
                  </button>
                )}
              </div>
            </div>

            {(activeFileId || activeExternalUrl) && (
              <div className="p-4 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
                    Học liệu đính kèm
                  </div>
                  <div className="text-sm font-medium text-[var(--lms-text)] truncate mt-0.5">
                    {activeFileId ? `${activeLesson.title} (Tệp hệ thống)` : activeExternalUrl}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewState({
                        isOpen: true,
                        fileId: activeFileId,
                        externalUrl: activeExternalUrl,
                        fileName: activeLesson.title,
                        title: activeLesson.title,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold hover:opacity-95 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    Xem trước tài liệu
                  </button>
                  {activeFileId && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadLessonAttachment(activeFileId, activeLesson.title)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Tải về
                    </button>
                  )}
                  {activeExternalUrl && (
                    <a
                      href={activeExternalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      Mở liên kết
                    </a>
                  )}
                </div>
              </div>
            )}

            {activeLesson.contentHtml ? (
              <SafeHtml
                html={activeLesson.contentHtml}
                className="lms-rich-content text-sm leading-relaxed"
              />
            ) : (
              <p className="text-sm text-[var(--lms-text-muted)]">
                Bài giảng này chủ yếu sử dụng học liệu đính kèm hoặc nội dung hướng dẫn trực tiếp trên lớp.
              </p>
            )}
          </div>
        )}
      </section>

      <ModuleFormModal
        isOpen={moduleModalOpen}
        onClose={() => setModuleModalOpen(false)}
        courseId={courseId}
        editingModule={editingModule}
        nextSortOrder={sortedModules.length + 1}
        onSaved={() => void onRefreshContent()}
      />

      <LessonFormModal
        isOpen={lessonModalOpen}
        onClose={() => setLessonModalOpen(false)}
        courseId={courseId}
        moduleId={lessonTargetModuleId}
        editingLesson={editingLesson}
        nextSortOrder={
          (sortedModules.find((m) => m.moduleId === lessonTargetModuleId)?.lessons.length ?? 0) + 1
        }
        onSaved={(savedId) => {
          if (savedId) setSelectedLessonId(savedId);
          void onRefreshContent();
        }}
        onPreviewFile={openPreviewFromStoredFile}
      />

      <FilePreviewModal
        isOpen={previewState.isOpen}
        onClose={() => setPreviewState({ isOpen: false })}
        fileId={previewState.fileId}
        fileName={previewState.fileName}
        mimeType={previewState.mimeType}
        externalUrl={previewState.externalUrl}
        title={previewState.title}
      />

      {activeLesson && (
        <LessonAiTutorDrawer
          lessonId={activeLesson.lessonId}
          lessonTitle={activeLesson.title}
          isOpen={tutorOpen}
          onClose={() => setTutorOpen(false)}
        />
      )}
    </div>
  );
};
