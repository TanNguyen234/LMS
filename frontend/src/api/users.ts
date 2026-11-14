import { httpGet, httpPatch, httpPost, httpPut, httpUpload } from './http';
import type { MessageResponse, PaginatedResponse, User, UserRole } from '../types';

/** Raw user payload returned by the backend (`UserResponse`). */
export interface ApiUser {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  studentCode?: string | null;
  staffCode?: string | null;
  createdAt: string;
}

export type UserStatusFilter = 'ACTIVE' | 'INACTIVE';

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: UserRole | '';
  status?: UserStatusFilter | '';
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
  isActive?: boolean;
  studentCode?: string | null;
  staffCode?: string | null;
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
  /** Empty string clears the code; undefined leaves it unchanged. */
  studentCode?: string | null;
  staffCode?: string | null;
  /** Admin password reset (6..72 UTF-8 bytes). Omit to keep the current password. */
  password?: string;
}

export interface UserImportRowError {
  row: number;
  email?: string | null;
  message: string;
}

export interface UserImportSkippedRow {
  row: number;
  email: string;
  reason: string;
}

export interface UserImportReport {
  created: number;
  skipped: number;
  errors: UserImportRowError[];
  skippedRows: UserImportSkippedRow[];
  totalRows: number;
}

export interface ProfileUpdateInput {
  fullName: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const CSV_IMPORT_COLUMNS = ['email', 'fullName', 'role', 'studentCode', 'staffCode', 'password'] as const;

/** Map backend payload to the shared `User` shape (keeps legacy snake_case aliases for older pages). */
export function normalizeUser(raw: ApiUser): User {
  return {
    ...raw,
    id: raw.userId,
    userId: raw.userId,
    fullName: raw.fullName,
    full_name: raw.fullName,
    isActive: raw.isActive,
    is_active: raw.isActive,
    createdAt: raw.createdAt,
    created_at: raw.createdAt,
    username: raw.studentCode || raw.staffCode || raw.email.split('@')[0],
  };
}

/** UTF-8 byte length, used to mirror the backend 6..72 byte password rule. */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export function validatePasswordBytes(password: string): string | null {
  const length = passwordByteLength(password);
  if (length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự.';
  if (length > 72) return 'Mật khẩu không được vượt quá 72 byte UTF-8 (khoảng 72 ký tự không dấu).';
  return null;
}

export async function listUsers(params: ListUsersParams = {}): Promise<PaginatedResponse<User>> {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('pageSize', String(params.pageSize ?? 20));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.role) query.set('role', params.role);
  if (params.status) query.set('status', params.status);
  const res = await httpGet<PaginatedResponse<ApiUser>>(`/users?${query.toString()}`);
  return { ...res, items: res.items.map(normalizeUser) };
}

export async function getUser(userId: string): Promise<User> {
  return normalizeUser(await httpGet<ApiUser>(`/users/${encodeURIComponent(userId)}`));
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const payload = {
    ...input,
    studentCode: input.studentCode?.trim() || null,
    staffCode: input.staffCode?.trim() || null,
  };
  return normalizeUser(await httpPost<ApiUser>('/users', payload));
}

export async function updateUser(userId: string, input: UpdateUserInput): Promise<User> {
  return normalizeUser(await httpPut<ApiUser>(`/users/${encodeURIComponent(userId)}`, input));
}

export async function setUserActive(userId: string, isActive: boolean): Promise<MessageResponse> {
  return httpPatch<MessageResponse>(`/users/${encodeURIComponent(userId)}/status`, { isActive });
}

export async function importUsersCsv(file: File, onProgress?: (percent: number) => void): Promise<UserImportReport> {
  const form = new FormData();
  form.append('file', file);
  return httpUpload<UserImportReport>('/users/import-csv', form, onProgress);
}

export async function getMyProfile(): Promise<User> {
  return normalizeUser(await httpGet<ApiUser>('/auth/me'));
}

export async function updateMyProfile(input: ProfileUpdateInput): Promise<User> {
  return normalizeUser(await httpPut<ApiUser>('/auth/me', input));
}

export async function changeMyPassword(input: ChangePasswordInput): Promise<MessageResponse> {
  return httpPost<MessageResponse>('/auth/change-password', input);
}
