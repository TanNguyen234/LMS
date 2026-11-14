import { httpGet, httpPatch, httpPost, httpPut, resolveApiUrl } from './http';
import type {
  CourseMessage,
  Meeting,
  MeetingLog,
  Notification,
  WhiteboardSnapshot,
} from '../types';

export interface WsTicketResponse {
  ticket: string;
  expiresInSeconds: number;
}

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  color: string;
  width: number;
  points: WhiteboardPoint[];
  tool?: 'pen' | 'highlighter' | 'eraser';
  authorId?: string;
  authorName?: string;
}

export type WhiteboardOp =
  | { action: 'add'; stroke: WhiteboardStroke }
  | { action: 'remove' | 'delete'; strokeId: string }
  | { action: 'undo'; strokeId?: string }
  | { action: 'clear' }
  | { action: 'replace'; strokes: WhiteboardStroke[] };

export interface MeetingMediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

export interface MeetingPresenceParticipant {
  peerId: string;
  userId: string;
  userName: string;
  userRole: string;
  handRaised: boolean;
  mediaState: MeetingMediaState;
}

export interface StartMeetingPayload {
  courseId: string;
  title: string;
  roomCode?: string;
  replaceActive?: boolean;
}

export interface SendCourseMessagePayload {
  content: string;
  attachmentUrl?: string;
  meetingId?: string;
  messageType?: 'TEXT' | 'SYSTEM' | 'FILE';
  attachmentFileId?: string;
}

export interface SaveWhiteboardPayload {
  meetingId?: string;
  strokesJson: string;
}

function normalizeNotification(item: any): Notification {
  return {
    ...item,
    id: item.notificationId ?? item.id,
    user_id: item.userId ?? item.user_id,
    is_read: item.isRead ?? item.is_read ?? false,
    isRead: item.isRead ?? item.is_read ?? false,
    link_url: item.relatedUrl ?? item.link_url,
    relatedUrl: item.relatedUrl ?? item.link_url,
    created_at: item.createdAt ?? item.created_at,
    createdAt: item.createdAt ?? item.created_at,
  };
}

export async function issueWsTicket(): Promise<WsTicketResponse> {
  return httpPost<WsTicketResponse>('/ws/ticket');
}

export function buildWsUrl(path: string, ticket: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const httpUrl = resolveApiUrl(normalizedPath);
  const absoluteHttp = httpUrl.startsWith('http://') || httpUrl.startsWith('https://')
    ? httpUrl
    : `${window.location.origin}${httpUrl.startsWith('/') ? '' : '/'}${httpUrl}`;
  const wsBase = absoluteHttp.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  const separator = wsBase.includes('?') ? '&' : '?';
  return `${wsBase}${separator}ticket=${encodeURIComponent(ticket)}`;
}

export async function getCourseWhiteboard(courseId: string): Promise<WhiteboardSnapshot> {
  return httpGet<WhiteboardSnapshot>(`/courses/${courseId}/whiteboard`);
}

export async function saveCourseWhiteboard(
  courseId: string,
  payload: SaveWhiteboardPayload
): Promise<WhiteboardSnapshot> {
  return httpPut<WhiteboardSnapshot>(`/courses/${courseId}/whiteboard`, payload);
}

export async function startMeeting(payload: StartMeetingPayload): Promise<Meeting> {
  return httpPost<Meeting>('/meetings', payload);
}

export async function getActiveMeetings(): Promise<Meeting[]> {
  return httpGet<Meeting[]>('/meetings/active');
}

export async function getCourseMeetings(courseId: string): Promise<Meeting[]> {
  return httpGet<Meeting[]>(`/meetings/course/${courseId}`);
}

export async function getMeetingDetail(meetingId: string): Promise<Meeting> {
  return httpGet<Meeting>(`/meetings/${meetingId}`);
}

export async function joinMeeting(meetingId: string): Promise<{ status: string; logId: string }> {
  return httpPost<{ status: string; logId: string }>(`/meetings/${meetingId}/join`);
}

export async function leaveMeeting(
  meetingId: string,
  payload: { activitySummary?: string } = {}
): Promise<{ status: string; durationSeconds?: number; detail?: string }> {
  return httpPost<{ status: string; durationSeconds?: number; detail?: string }>(
    `/meetings/${meetingId}/leave`,
    payload
  );
}

export async function endMeeting(meetingId: string): Promise<Meeting> {
  return httpPost<Meeting>(`/meetings/${meetingId}/end`);
}

export async function getMeetingAuditLogs(meetingId: string): Promise<MeetingLog[]> {
  return httpGet<MeetingLog[]>(`/meetings/${meetingId}/logs`);
}

export async function getCourseMessages(
  courseId: string,
  meetingId?: string
): Promise<CourseMessage[]> {
  const query = meetingId ? `?meetingId=${encodeURIComponent(meetingId)}` : '';
  return httpGet<CourseMessage[]>(`/courses/${courseId}/messages${query}`);
}

export async function sendCourseMessage(
  courseId: string,
  payload: SendCourseMessagePayload
): Promise<CourseMessage> {
  return httpPost<CourseMessage>(`/courses/${courseId}/messages`, payload);
}

export async function getNotifications(unreadOnly = false): Promise<Notification[]> {
  const query = unreadOnly ? '?unreadOnly=true' : '';
  const data = await httpGet<any[]>(`/notifications${query}`);
  return (data || []).map(normalizeNotification);
}

export async function getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
  return httpGet<{ unreadCount: number }>('/notifications/unread-count');
}

export async function markNotificationRead(notificationId: string): Promise<Notification> {
  const res = await httpPatch<any>(`/notifications/${notificationId}/read`);
  return normalizeNotification(res);
}

export async function markAllNotificationsRead(): Promise<{ message: string }> {
  return httpPatch<{ message: string }>('/notifications/read-all');
}
