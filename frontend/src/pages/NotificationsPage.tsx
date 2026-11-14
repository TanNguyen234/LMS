import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ApiError } from '../api/http';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/realtime';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Notification } from '../types';
import { formatDateTimeVi, formatNotificationType } from '../utils/formatters';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useToast } from '../components/ui/Toast';

export function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getNotifications();
      setNotifications(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Không thể tải danh sách thông báo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getNotifications();
        if (cancelled) return;
        setNotifications(list);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.detail : 'Không thể tải danh sách thông báo.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleWsEvent = useCallback(
    (event: any) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'notification.created' && event.notificationId) {
        const incoming: Notification = {
          notificationId: String(event.notificationId),
          id: String(event.notificationId),
          userId: '',
          user_id: '',
          title: String(event.title || 'Thông báo mới'),
          message: String(event.message || ''),
          type: String(event.notificationType || 'GENERAL'),
          isRead: false,
          is_read: false,
          relatedUrl: event.relatedUrl ?? null,
          link_url: event.relatedUrl ?? undefined,
          createdAt: String(event.createdAt || new Date().toISOString()),
          created_at: String(event.createdAt || new Date().toISOString()),
        };
        setNotifications((prev) => {
          if (prev.some((n) => (n.notificationId || String(n.id)) === incoming.notificationId)) {
            return prev;
          }
          return [incoming, ...prev];
        });
        toast.info(incoming.title, 'Thông báo mới');
      } else if (event.type === 'notification.read' && event.notificationId) {
        const targetId = String(event.notificationId);
        setNotifications((prev) =>
          prev.map((n) =>
            (n.notificationId || String(n.id)) === targetId
              ? { ...n, isRead: true, is_read: true }
              : n
          )
        );
      } else if (event.type === 'notification.read_all') {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true, is_read: true }))
        );
      }
    },
    [toast]
  );

  const { status: wsStatus } = useWebSocket({
    path: '/ws/notifications',
    onMessage: handleWsEvent,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !(n.isRead ?? n.is_read)).length,
    [notifications]
  );

  const visibleList = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !(n.isRead ?? n.is_read));
    }
    return notifications;
  }, [filter, notifications]);

  const handleMarkRead = async (notif: Notification) => {
    const id = String(notif.notificationId || notif.id);
    if (notif.isRead ?? notif.is_read) return;
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          String(n.notificationId || n.id) === id
            ? { ...n, isRead: true, is_read: true }
            : n
        )
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Không thể đánh dấu đã đọc.');
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, is_read: true })));
      toast.success('Đã đánh dấu toàn bộ thông báo là đã đọc.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Không thể cập nhật thông báo.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleOpenTarget = async (notif: Notification) => {
    if (!(notif.isRead ?? notif.is_read)) {
      await handleMarkRead(notif);
    }
    const targetUrl = notif.relatedUrl ?? notif.link_url;
    if (targetUrl && targetUrl.startsWith('/')) {
      navigate(targetUrl);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--lms-text)]">Thông báo</h1>
            {unreadCount > 0 && (
              <Badge variant="primary">{unreadCount} chưa đọc</Badge>
            )}
            <Badge variant={wsStatus === 'open' ? 'success' : 'neutral'} dot>
              <span className="inline-flex items-center gap-1">
                {wsStatus === 'open' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {wsStatus === 'open' ? 'Cập nhật trực tiếp' : 'Tải thủ công'}
              </span>
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--lms-text-secondary)]">
            Cập nhật lịch học trực tuyến, bài tập, bài kiểm tra và điểm số theo thời gian thực
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleMarkAllRead()}
          disabled={unreadCount === 0 || markingAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-45 cursor-pointer"
        >
          <CheckCheck className="w-4 h-4" />
          {markingAll ? 'Đang cập nhật...' : 'Đánh dấu tất cả đã đọc'}
        </button>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
            filter === 'all'
              ? 'border-[var(--lms-primary)] bg-[var(--lms-primary)] text-white'
              : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)]'
          }`}
        >
          Tất cả ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
            filter === 'unread'
              ? 'border-[var(--lms-primary)] bg-[var(--lms-primary)] text-white'
              : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)]'
          }`}
        >
          Chưa đọc ({unreadCount})
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadNotifications()} />}

      {loading ? (
        <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-12 text-center text-sm text-[var(--lms-text-secondary)]">
          Đang tải thông báo...
        </div>
      ) : visibleList.length === 0 ? (
        <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-6">
          <EmptyState
            icon={<Bell className="w-7 h-7" />}
            title={filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            description="Mọi thông báo quan trọng từ lớp học sẽ xuất hiện tại đây."
          />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visibleList.map((notif) => {
            const id = String(notif.notificationId || notif.id);
            const isRead = Boolean(notif.isRead ?? notif.is_read);
            const relatedUrl = notif.relatedUrl ?? notif.link_url;
            const hasInternalLink = Boolean(relatedUrl && relatedUrl.startsWith('/'));

            return (
              <li key={id}>
                <article
                  className={`rounded-xl border p-4 transition-colors shadow-sm ${
                    isRead
                      ? 'border-[var(--lms-border)] bg-[var(--lms-surface)]'
                      : 'border-[var(--lms-primary)]/40 bg-[var(--lms-primary)]/5'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isRead && (
                          <span
                            className="inline-block h-2 w-2 rounded-full bg-[var(--lms-primary)]"
                            aria-label="Chưa đọc"
                          />
                        )}
                        <Badge variant={isRead ? 'neutral' : 'primary'}>
                          {formatNotificationType(notif.type)}
                        </Badge>
                        <span className="text-xs text-[var(--lms-text-secondary)]">
                          {formatDateTimeVi(notif.createdAt || notif.created_at)}
                        </span>
                      </div>

                      {hasInternalLink ? (
                        <button
                          type="button"
                          onClick={() => void handleOpenTarget(notif)}
                          className="block text-left text-sm font-semibold text-[var(--lms-text)] hover:text-[var(--lms-primary)] hover:underline cursor-pointer"
                        >
                          {notif.title}
                        </button>
                      ) : (
                        <h2 className="text-sm font-semibold text-[var(--lms-text)]">
                          {notif.title}
                        </h2>
                      )}

                      <p className="text-sm text-[var(--lms-text-secondary)]">
                        {notif.message}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {hasInternalLink && (
                        <button
                          type="button"
                          onClick={() => void handleOpenTarget(notif)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-primary)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
                        >
                          Mở liên kết
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {!isRead && (
                        <button
                          type="button"
                          onClick={() => void handleMarkRead(notif)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Đánh dấu đã đọc
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPage;
