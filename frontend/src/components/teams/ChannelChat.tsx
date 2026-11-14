import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Paperclip,
  Send,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { ApiError } from '../../api/http';
import { downloadFile } from '../../api/files';
import { getCourseMessages, sendCourseMessage } from '../../api/realtime';
import { useAuth } from '../../auth/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { CourseMessage, StoredFile } from '../../types';
import { formatDateTimeVi, formatRole } from '../../utils/formatters';
import { FileDropzone } from '../files/FileDropzone';
import { FilePreviewModal } from '../files/FilePreviewModal';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { useToast } from '../ui/Toast';

export interface ChannelChatProps {
  courseId: string;
  courseTitle?: string;
  meetingId?: string;
  compact?: boolean;
  enableOwnWebSocket?: boolean;
  incomingMessages?: CourseMessage[];
  onSendViaMeetingWs?: (payload: {
    content: string;
    messageType?: 'TEXT' | 'FILE';
    attachmentFileId?: string;
    attachmentUrl?: string;
  }) => boolean;
  onTypingViaMeetingWs?: (isTyping: boolean) => void;
  typingUsersFromMeeting?: string[];
}

function mergeMessages(prev: CourseMessage[], incoming: CourseMessage[]): CourseMessage[] {
  const byId = new Map<string, CourseMessage>();
  for (const item of prev) {
    byId.set(item.messageId, item);
  }
  for (const item of incoming) {
    byId.set(item.messageId, item);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function extractFileId(msg: CourseMessage): string | null {
  if (msg.attachmentFileId) return msg.attachmentFileId;
  if (!msg.attachmentUrl) return null;
  const match = msg.attachmentUrl.match(/\/api\/files\/([0-9a-fA-F-]+)\/(?:content|download)/);
  return match ? match[1] : null;
}

function isSafeExternalUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/');
}

export function ChannelChat({
  courseId,
  courseTitle,
  meetingId,
  compact = false,
  enableOwnWebSocket = true,
  incomingMessages = [],
  onSendViaMeetingWs,
  onTypingViaMeetingWs,
  typingUsersFromMeeting,
}: ChannelChatProps) {
  const { user } = useAuth();
  const toast = useToast();
  const inputId = useId();

  const channelKey = `${courseId}:${meetingId || 'all'}`;
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [storedMessages, setStoredMessages] = useState<CourseMessage[]>([]);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAttachmentBox, setShowAttachmentBox] = useState(false);
  const [attachedFile, setAttachedFile] = useState<StoredFile | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [typingMap, setTypingMap] = useState<Record<string, string>>({});

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSentRef = useRef(0);
  const currentUserId = String(user?.userId ?? user?.id ?? '');

  const fetchMessages = useCallback(async () => {
    try {
      const data = await getCourseMessages(courseId, meetingId);
      setStoredMessages((prev) => mergeMessages(prev, data));
      setLoadError(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Không thể tải tin nhắn thảo luận.';
      setLoadError(msg);
    } finally {
      setLoadedKey(channelKey);
    }
  }, [courseId, meetingId, channelKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getCourseMessages(courseId, meetingId);
        if (cancelled) return;
        setStoredMessages(data);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.detail : 'Không thể tải tin nhắn thảo luận.';
        setLoadError(msg);
      } finally {
        if (!cancelled) {
          setLoadedKey(channelKey);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, meetingId, channelKey]);

  const loading = loadedKey !== channelKey;
  const messages = useMemo(() => {
    const base = loadedKey === channelKey ? storedMessages : [];
    const scopedIncoming = meetingId
      ? incomingMessages.filter((m) => !m.meetingId || m.meetingId === meetingId)
      : incomingMessages.filter((m) => m.courseId === courseId);
    return scopedIncoming.length > 0 ? mergeMessages(base, scopedIncoming) : base;
  }, [loadedKey, channelKey, storedMessages, incomingMessages, meetingId, courseId]);

  const handleWsMessage = useCallback(
    (event: any) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'chat.message' && event.message) {
        const msg = event.message as CourseMessage;
        if (meetingId && msg.meetingId && msg.meetingId !== meetingId) return;
        setStoredMessages((prev) => mergeMessages(prev, [msg]));
      } else if (event.type === 'typing' && event.userId && event.userId !== currentUserId) {
        const uid = String(event.userId);
        if (event.isTyping) {
          setTypingMap((prev) => ({ ...prev, [uid]: String(event.userName || 'Thành viên') }));
          window.setTimeout(() => {
            setTypingMap((prev) => {
              if (!prev[uid]) return prev;
              const copy = { ...prev };
              delete copy[uid];
              return copy;
            });
          }, 3000);
        } else {
          setTypingMap((prev) => {
            if (!prev[uid]) return prev;
            const copy = { ...prev };
            delete copy[uid];
            return copy;
          });
        }
      } else if (event.type === 'error' && event.detail) {
        toast.error(String(event.detail));
      }
    },
    [currentUserId, meetingId, toast]
  );

  const ownWsPath = enableOwnWebSocket && courseId ? `/ws/courses/${courseId}` : null;
  const { status: wsStatus, sendJson } = useWebSocket({
    path: ownWsPath,
    enabled: enableOwnWebSocket && Boolean(courseId),
    onMessage: handleWsMessage,
  });

  // Fallback polling only when own WS is expected but closed
  useEffect(() => {
    if (!enableOwnWebSocket || wsStatus === 'open') return;
    const interval = window.setInterval(() => {
      void fetchMessages();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [enableOwnWebSocket, wsStatus, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const activeTypers = useMemo(() => {
    if (typingUsersFromMeeting && typingUsersFromMeeting.length > 0) {
      return typingUsersFromMeeting;
    }
    return Object.values(typingMap);
  }, [typingMap, typingUsersFromMeeting]);

  const notifyTyping = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    if (onTypingViaMeetingWs) {
      onTypingViaMeetingWs(true);
    } else if (wsStatus === 'open') {
      sendJson({ type: 'typing', isTyping: true });
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    const cleanUrl = fallbackUrl.trim();
    if (!trimmed && !attachedFile && !cleanUrl) return;
    if (sending) return;

    const messageType: 'TEXT' | 'FILE' = attachedFile || cleanUrl ? 'FILE' : 'TEXT';
    const payload = {
      content: trimmed || (attachedFile ? `Đã chia sẻ tệp: ${attachedFile.originalName}` : 'Đã đính kèm liên kết'),
      meetingId,
      messageType,
      attachmentFileId: attachedFile?.fileId,
      attachmentUrl: attachedFile?.downloadUrl || (cleanUrl || undefined),
    };

    setSending(true);
    try {
      let sentViaWs = false;
      if (onSendViaMeetingWs) {
        sentViaWs = onSendViaMeetingWs(payload);
      } else if (wsStatus === 'open') {
        sentViaWs = sendJson({ type: 'chat.send', ...payload });
      }

      if (!sentViaWs) {
        const saved = await sendCourseMessage(courseId, payload);
        setStoredMessages((prev) => mergeMessages(prev, [saved]));
      }

      setContent('');
      setAttachedFile(null);
      setFallbackUrl('');
      setShowAttachmentBox(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Không thể gửi tin nhắn.');
    } finally {
      setSending(false);
    }
  };

  const handleOpenFile = async (msg: CourseMessage) => {
    const fileId = extractFileId(msg);
    if (fileId) {
      setPreviewFileId(fileId);
      return;
    }
    if (msg.attachmentUrl && isSafeExternalUrl(msg.attachmentUrl)) {
      window.open(msg.attachmentUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownloadFile = async (msg: CourseMessage) => {
    const fileId = extractFileId(msg);
    if (!fileId) return;
    try {
      await downloadFile(fileId, 'tep-dinh-kem');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Không thể tải xuống tệp.');
    }
  };

  const containerHeight = compact ? 'h-[420px]' : 'h-[540px] md:h-[600px]';

  return (
    <section
      className={`flex flex-col rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] shadow-sm overflow-hidden ${containerHeight}`}
      aria-label="Kênh thảo luận lớp học"
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--lms-border)] bg-[var(--lms-surface-muted)]">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--lms-text)] truncate">
            {meetingId ? 'Trò chuyện phòng học' : courseTitle ? `Kênh lớp: ${courseTitle}` : 'Thảo luận kênh lớp'}
          </h3>
          <p className="text-xs text-[var(--lms-text-secondary)]">
            Trao đổi bài giảng, đặt câu hỏi và chia sẻ tài liệu
          </p>
        </div>

        {enableOwnWebSocket && (
          <Badge
            variant={wsStatus === 'open' ? 'success' : wsStatus === 'connecting' ? 'warning' : 'neutral'}
            dot
          >
            <span className="inline-flex items-center gap-1">
              {wsStatus === 'open' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {wsStatus === 'open' ? 'Trực tuyến' : wsStatus === 'connecting' ? 'Đang nối' : 'Dự phòng REST'}
            </span>
          </Badge>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--lms-surface)]">
        {loadError && (
          <ErrorBanner message={loadError} onRetry={() => void fetchMessages()} />
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--lms-text-secondary)]">
            Đang tải lịch sử thảo luận...
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            compact
            title="Chưa có tin nhắn nào"
            description="Hãy bắt đầu cuộc trao đổi hoặc chia sẻ tài liệu với lớp học."
          />
        ) : (
          messages.map((msg) => {
            const isSelf = msg.senderId === currentUserId;
            const fileId = extractFileId(msg);
            const hasSafeUrl = isSafeExternalUrl(msg.attachmentUrl);

            if (msg.messageType === 'SYSTEM') {
              return (
                <div
                  key={msg.messageId}
                  className="mx-auto max-w-md rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-3 py-1.5 text-center text-xs text-[var(--lms-text-secondary)]"
                >
                  {msg.content}
                </div>
              );
            }

            return (
              <div
                key={msg.messageId}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-[var(--lms-text-secondary)]">
                  <span className="font-medium text-[var(--lms-text)]">{msg.senderName}</span>
                  <span>{formatRole(msg.senderRole)}</span>
                  <span>{formatDateTimeVi(msg.createdAt)}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                    isSelf
                      ? 'bg-[var(--lms-primary)] text-white rounded-br-sm'
                      : 'bg-[var(--lms-surface-muted)] text-[var(--lms-text)] border border-[var(--lms-border)] rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {(fileId || hasSafeUrl) && (
                    <div
                      className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        isSelf
                          ? 'border-white/30 bg-white/15 text-white'
                          : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)]'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <button
                        type="button"
                        onClick={() => void handleOpenFile(msg)}
                        className="underline font-medium hover:opacity-80 cursor-pointer"
                      >
                        {fileId ? 'Xem tệp đính kèm' : 'Mở liên kết đính kèm'}
                      </button>
                      {fileId && (
                        <button
                          type="button"
                          onClick={() => void handleDownloadFile(msg)}
                          className="ml-auto opacity-85 hover:opacity-100 underline cursor-pointer"
                        >
                          Tải xuống
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {activeTypers.length > 0 && (
        <div className="px-4 py-1.5 text-xs text-[var(--lms-text-secondary)] bg-[var(--lms-surface-muted)] border-t border-[var(--lms-border)]">
          {activeTypers.slice(0, 2).join(', ')} đang soạn tin nhắn...
        </div>
      )}

      {showAttachmentBox && (
        <div className="p-3 border-t border-[var(--lms-border)] bg-[var(--lms-surface-muted)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--lms-text)]">
              Đính kèm tệp vào tin nhắn
            </span>
            <button
              type="button"
              onClick={() => setShowAttachmentBox(false)}
              className="p-1 rounded hover:bg-[var(--lms-surface)] text-[var(--lms-text-secondary)]"
              aria-label="Đóng khung đính kèm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <FileDropzone
            courseId={courseId}
            scope="CHAT"
            value={attachedFile}
            fallbackUrl={fallbackUrl}
            allowExternalUrl
            onUploaded={(stored) => setAttachedFile(stored)}
            onRemove={() => setAttachedFile(null)}
            onPreview={(stored) => setPreviewFileId(stored.fileId)}
            onFallbackUrlChange={setFallbackUrl}
            onError={(err) => toast.error(err)}
          />
        </div>
      )}

      <form
        onSubmit={(e) => void handleSend(e)}
        className="flex items-end gap-2 p-3 border-t border-[var(--lms-border)] bg-[var(--lms-surface)]"
      >
        <button
          type="button"
          onClick={() => setShowAttachmentBox((prev) => !prev)}
          className={`shrink-0 p-2.5 rounded-lg border transition-colors ${
            showAttachmentBox || attachedFile || fallbackUrl
              ? 'border-[var(--lms-primary)] bg-[var(--lms-primary-soft,rgba(37,99,235,0.1))] text-[var(--lms-primary)]'
              : 'border-[var(--lms-border)] text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
          }`}
          title="Đính kèm tệp hoặc liên kết"
          aria-label="Đính kèm tệp hoặc liên kết"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <label htmlFor={inputId} className="sr-only">
            Nội dung tin nhắn
          </label>
          <textarea
            id={inputId}
            rows={1}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={attachedFile ? `Nhắn kèm ${attachedFile.originalName}...` : 'Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)'}
            className="w-full resize-none rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-3 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--lms-primary)]"
          />
        </div>

        <button
          type="submit"
          disabled={sending || (!content.trim() && !attachedFile && !fallbackUrl.trim())}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[var(--lms-primary)] px-3.5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">{sending ? 'Đang gửi' : 'Gửi'}</span>
        </button>
      </form>

      <FilePreviewModal
        isOpen={Boolean(previewFileId)}
        onClose={() => setPreviewFileId(null)}
        fileId={previewFileId}
      />
    </section>
  );
}

// Keep unused api reference avoided cleanly
void api;
export default ChannelChat;
