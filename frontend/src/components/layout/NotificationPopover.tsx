import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Bell, BellOff, CheckCheck, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/realtime';
import { useAuth } from '../../auth/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { Notification } from '../../types';
import { formatDateTimeVi } from '../../utils/formatters';
import { useToast } from '../ui/Toast';

function formatRelativeTime(isoDate?: string | null): string {
  if (!isoDate) return '';
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return '';
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ`;
  return formatDateTimeVi(isoDate);
}

export const NotificationPopover: React.FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      const [list, countRes] = await Promise.all([
        getNotifications(false),
        getUnreadNotificationCount(),
      ]);
      setItems(list.slice(0, 12));
      setUnreadCount(countRes.unreadCount);
    } catch {
      // Non-blocking background badge load
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;
    let active = true;
    Promise.all([getNotifications(false), getUnreadNotificationCount()])
      .then(([list, countRes]) => {
        if (!active) return;
        setItems(list.slice(0, 12));
        setUnreadCount(countRes.unreadCount);
      })
      .catch(() => {
        // Non-blocking background badge load
      });
    return () => {
      active = false;
    };
  }, [token, user]);

  const { status: wsStatus } = useWebSocket({
    path: '/ws/notifications',
    enabled: Boolean(token && user),
    onMessage: (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const eventType = String(payload.type ?? '');

      if (eventType === 'notifications.connected' && typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
        return;
      }

      if (eventType === 'notification.created' && payload.notificationId) {
        const createdAt = String(payload.createdAt ?? new Date().toISOString());
        const newItem: Notification = {
          notificationId: String(payload.notificationId),
          id: String(payload.notificationId),
          userId: user?.userId ?? '',
          user_id: user?.userId ?? '',
          title: String(payload.title ?? 'Thông báo mới'),
          message: String(payload.message ?? ''),
          type: String(payload.notificationType ?? 'INFO'),
          isRead: false,
          is_read: false,
          relatedUrl: payload.relatedUrl ? String(payload.relatedUrl) : null,
          link_url: payload.relatedUrl ? String(payload.relatedUrl) : undefined,
          createdAt,
          created_at: createdAt,
        };
        setItems((prev) => {
          const withoutDup = prev.filter((item) => item.notificationId !== newItem.notificationId);
          return [newItem, ...withoutDup].slice(0, 12);
        });
        setUnreadCount((prev) => prev + 1);
        return;
      }

      if (eventType === 'notification.read') {
        const readId = String(payload.notificationId ?? '');
        setItems((prev) =>
          prev.map((item) =>
            item.notificationId === readId ? { ...item, isRead: true, is_read: true } : item,
          ),
        );
        if (typeof payload.unreadCount === 'number') {
          setUnreadCount(payload.unreadCount);
        }
        return;
      }

      if (eventType === 'notification.read_all') {
        setItems((prev) => prev.map((item) => ({ ...item, isRead: true, is_read: true })));
        setUnreadCount(typeof payload.unreadCount === 'number' ? payload.unreadCount : 0);
      }
    },
  });

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleNotificationClick = async (item: Notification) => {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.notificationId);
        setItems((prev) =>
          prev.map((row) =>
            row.notificationId === item.notificationId ? { ...row, isRead: true, is_read: true } : row,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Navigate anyway so user is never blocked
      }
    }
    setOpen(false);
    navigate(item.relatedUrl || '/notifications');
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((row) => ({ ...row, isRead: true, is_read: true })));
      setUnreadCount(0);
    } catch {
      toast.error('Không thể đánh dấu đã đọc tất cả thông báo');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            void loadNotifications();
          }
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Thông báo (${unreadCount} chưa đọc)`}
        className="relative p-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {wsStatus === 'open' && (
          <span
            className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500"
            title="Kết nối thông báo thời gian thực đang hoạt động"
          />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Thông báo gần đây"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] shadow-xl z-40 overflow-hidden animate-slideUp"
        >
          <div className="px-4 py-3 border-b border-[var(--lms-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--lms-text)]">Thông báo</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-300 tabular-nums">
                  {unreadCount} mới
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Đọc tất cả
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--lms-border)]">
            {loading && items.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--lms-text-muted)]">
                Đang tải thông báo...
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <BellOff className="w-7 h-7 mx-auto mb-2 text-[var(--lms-text-muted)]" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--lms-text)]">Chưa có thông báo</p>
                <p className="text-xs text-[var(--lms-text-muted)] mt-0.5">
                  Cập nhật khóa học, bài tập và điểm số sẽ hiển thị tại đây.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.notificationId}
                  type="button"
                  onClick={() => void handleNotificationClick(item)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition hover:bg-[var(--lms-surface-muted)] cursor-pointer ${
                    !item.isRead ? 'bg-blue-500/[0.04]' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      !item.isRead ? 'bg-[var(--color-primary)]' : 'bg-transparent'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--lms-text)] truncate">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-[var(--lms-text-muted)] shrink-0 tabular-nums">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--lms-text-muted)] line-clamp-2 mt-0.5">
                      {item.message}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 flex justify-end">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
            >
              Xem tất cả thông báo
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
