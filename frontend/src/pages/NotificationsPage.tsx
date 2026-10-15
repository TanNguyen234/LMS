import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCheck,
  Inbox,
} from 'lucide-react';
import { api } from '../api/client';
import type { Notification } from '../types';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await api.getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: string | number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = notifications.filter((n) => (filter === 'UNREAD' ? !n.is_read : true));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Hộp thư Thông báo</h1>
          <p className="text-sm text-slate-500">Cập nhật tin tức khóa học, điểm số và hạn chót bài tập</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleMarkAllAsRead}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            <CheckCheck className="w-4 h-4 text-slate-500" />
            <span>Đánh dấu tất cả đã đọc</span>
          </button>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-slate-200 pb-2 text-sm font-semibold">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg transition ${
            filter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Tất cả ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('UNREAD')}
          className={`px-3 py-1.5 rounded-lg transition ${
            filter === 'UNREAD' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Chưa đọc ({notifications.filter((n) => !n.is_read).length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Đang tải thông báo...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-700">Không có thông báo nào</h3>
          <p className="text-sm mt-1">Bạn đã xem hết các thông báo quan trọng.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
          {filtered.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.is_read && handleMarkAsRead(n.id)}
              className={`p-4 transition flex items-start justify-between cursor-pointer ${
                !n.is_read ? 'bg-blue-50/40 hover:bg-blue-50/60' : 'hover:bg-slate-50'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-slate-800">{n.title}</h3>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                  )}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {n.type}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                <div className="flex items-center text-[11px] text-slate-400 space-x-1 pt-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{new Date(n.created_at).toLocaleString('vi-VN')}</span>
                </div>
              </div>

              {!n.is_read && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkAsRead(n.id);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline shrink-0 ml-4"
                >
                  Đánh dấu đã đọc
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
