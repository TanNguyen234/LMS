import type { Lesson, LessonContentType, MessageResponse, Module } from '../types';
import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from './http';

export type ReorderDirection = 'UP' | 'DOWN';

interface RawLesson {
  lessonId: string;
  moduleId: string;
  title: string;
  contentHtml?: string | null;
  materialUrl?: string | null;
  contentType?: LessonContentType;
  attachmentFileId?: string | null;
  sortOrder: number;
  isPublished: boolean;
  estimatedMinutes?: number | null;
  createdAt: string;
}

interface RawModule {
  moduleId: string;
  courseId: string;
  title: string;
  sortOrder: number;
  description?: string | null;
  isPublished: boolean;
  createdAt: string;
  lessons?: RawLesson[];
}

function normalizeLesson(raw: RawLesson): Lesson {
  const contentType = raw.contentType ?? 'TEXT';
  return {
    lessonId: raw.lessonId,
    id: raw.lessonId,
    moduleId: raw.moduleId,
    module_id: raw.moduleId,
    title: raw.title,
    contentType,
    content_type: contentType,
    contentHtml: raw.contentHtml ?? undefined,
    content_body: raw.contentHtml ?? undefined,
    materialUrl: raw.materialUrl ?? null,
    media_url: raw.materialUrl ?? null,
    attachmentFileId: raw.attachmentFileId ?? null,
    isPublished: raw.isPublished,
    is_published: raw.isPublished,
    sortOrder: raw.sortOrder,
    order_index: raw.sortOrder,
    estimatedMinutes: raw.estimatedMinutes ?? undefined,
    createdAt: raw.createdAt,
    created_at: raw.createdAt,
  };
}

function normalizeModule(raw: RawModule): Module {
  return {
    moduleId: raw.moduleId,
    id: raw.moduleId,
    courseId: raw.courseId,
    course_id: raw.courseId,
    title: raw.title,
    description: raw.description ?? undefined,
    sortOrder: raw.sortOrder,
    order_index: raw.sortOrder,
    isPublished: raw.isPublished,
    createdAt: raw.createdAt,
    created_at: raw.createdAt,
    lessons: (raw.lessons ?? []).map(normalizeLesson),
  };
}

export interface ModuleCreateInput {
  title: string;
  description?: string;
  sortOrder?: number;
  order_index?: number;
  isPublished?: boolean;
}

export interface ModuleUpdateInput {
  title?: string;
  description?: string | null;
  sortOrder?: number;
  order_index?: number;
  isPublished?: boolean;
}

export interface LessonCreateInput {
  title: string;
  contentType?: LessonContentType;
  content_type?: LessonContentType;
  contentHtml?: string;
  content_body?: string;
  materialUrl?: string | null;
  media_url?: string | null;
  attachmentFileId?: string | null;
  sortOrder?: number;
  order_index?: number;
  isPublished?: boolean;
  is_published?: boolean;
  estimatedMinutes?: number;
}

export interface LessonUpdateInput {
  title?: string;
  contentType?: LessonContentType;
  content_type?: LessonContentType;
  contentHtml?: string | null;
  content_body?: string | null;
  materialUrl?: string | null;
  media_url?: string | null;
  attachmentFileId?: string | null;
  sortOrder?: number;
  order_index?: number;
  isPublished?: boolean;
  is_published?: boolean;
  estimatedMinutes?: number | null;
}

export async function getCourseModules(courseId: string): Promise<Module[]> {
  const rows = await httpGet<RawModule[]>(`/courses/${courseId}/modules`);
  return (rows ?? []).map(normalizeModule);
}

export async function createModule(courseId: string, data: ModuleCreateInput): Promise<Module> {
  const created = await httpPost<RawModule>(`/courses/${courseId}/modules`, {
    title: data.title,
    description: data.description,
    sortOrder: data.sortOrder ?? data.order_index ?? 1,
    isPublished: data.isPublished ?? true,
  });
  return normalizeModule(created);
}

export async function updateModule(moduleId: string, data: ModuleUpdateInput): Promise<Module> {
  const payload: Record<string, unknown> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.description = data.description;
  const sortOrder = data.sortOrder ?? data.order_index;
  if (sortOrder !== undefined) payload.sortOrder = sortOrder;
  if (data.isPublished !== undefined) payload.isPublished = data.isPublished;

  const updated = await httpPut<RawModule>(`/modules/${moduleId}`, payload);
  return normalizeModule(updated);
}

export async function toggleModulePublish(
  moduleId: string,
  isPublished: boolean,
): Promise<MessageResponse> {
  return httpPatch<MessageResponse>(`/modules/${moduleId}/publish`, { isPublished });
}

export async function reorderModule(
  moduleId: string,
  payload: { direction?: ReorderDirection; sortOrder?: number; orderedIds?: string[] },
): Promise<Module> {
  const updated = await httpPatch<RawModule>(`/modules/${moduleId}/reorder`, payload);
  return normalizeModule(updated);
}

export async function reorderCourseModules(courseId: string, moduleIds: string[]): Promise<Module[]> {
  const rows = await httpPatch<RawModule[]>(`/courses/${courseId}/modules/reorder`, { moduleIds });
  return (rows ?? []).map(normalizeModule);
}

export async function deleteModule(moduleId: string): Promise<MessageResponse> {
  return httpDelete<MessageResponse>(`/modules/${moduleId}`);
}

export async function getLesson(lessonId: string): Promise<Lesson> {
  const raw = await httpGet<RawLesson>(`/lessons/${lessonId}`);
  return normalizeLesson(raw);
}

export async function createLesson(moduleId: string, data: LessonCreateInput): Promise<Lesson> {
  const payload: Record<string, unknown> = {
    title: data.title,
    contentType: data.contentType ?? data.content_type ?? 'TEXT',
    contentHtml: data.contentHtml ?? data.content_body ?? '',
    materialUrl: data.materialUrl !== undefined ? data.materialUrl : data.media_url,
    attachmentFileId: data.attachmentFileId ?? null,
    sortOrder: data.sortOrder ?? data.order_index ?? 1,
    isPublished: data.isPublished ?? data.is_published ?? true,
    estimatedMinutes: data.estimatedMinutes ?? 15,
  };
  const created = await httpPost<RawLesson>(`/modules/${moduleId}/lessons`, payload);
  return normalizeLesson(created);
}

export async function updateLesson(lessonId: string, data: LessonUpdateInput): Promise<Lesson> {
  const payload: Record<string, unknown> = {};
  if (data.title !== undefined) payload.title = data.title;
  const contentType = data.contentType ?? data.content_type;
  if (contentType !== undefined) payload.contentType = contentType;
  if (data.contentHtml !== undefined || data.content_body !== undefined) {
    payload.contentHtml = data.contentHtml !== undefined ? data.contentHtml : data.content_body;
  }
  if (data.materialUrl !== undefined || data.media_url !== undefined) {
    payload.materialUrl = data.materialUrl !== undefined ? data.materialUrl : data.media_url;
  }
  if (data.attachmentFileId !== undefined) {
    payload.attachmentFileId = data.attachmentFileId;
  }
  const sortOrder = data.sortOrder ?? data.order_index;
  if (sortOrder !== undefined) payload.sortOrder = sortOrder;
  const isPublished = data.isPublished ?? data.is_published;
  if (isPublished !== undefined) payload.isPublished = isPublished;
  if (data.estimatedMinutes !== undefined) {
    payload.estimatedMinutes = data.estimatedMinutes;
  }

  const updated = await httpPut<RawLesson>(`/lessons/${lessonId}`, payload);
  return normalizeLesson(updated);
}

export async function toggleLessonPublish(
  lessonId: string,
  isPublished: boolean,
): Promise<MessageResponse> {
  return httpPatch<MessageResponse>(`/lessons/${lessonId}/publish`, { isPublished });
}

export async function reorderLesson(
  lessonId: string,
  payload: { direction?: ReorderDirection; sortOrder?: number; orderedIds?: string[] },
): Promise<Lesson> {
  const updated = await httpPatch<RawLesson>(`/lessons/${lessonId}/reorder`, payload);
  return normalizeLesson(updated);
}

export async function reorderModuleLessons(moduleId: string, lessonIds: string[]): Promise<Lesson[]> {
  const rows = await httpPatch<RawLesson[]>(`/modules/${moduleId}/lessons/reorder`, { lessonIds });
  return (rows ?? []).map(normalizeLesson);
}

export async function deleteLesson(lessonId: string): Promise<MessageResponse> {
  return httpDelete<MessageResponse>(`/lessons/${lessonId}`);
}
