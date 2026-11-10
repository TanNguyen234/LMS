import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCheck,
  Inbox,
  Send,
  X,
  Megaphone,
  BookOpen,
  FileText,
  Award,
  Bell,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/common/Toast';
import type { Notification, Course } from '../types';

export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  // Broadcast Announcement Modal (Admin & Lecturer)
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<'ALL' | 'STUDENTS' | 'LECTURERS' | 'COURSE_STUDENTS'>(
    user?.role === 'ADMIN' ? 'ALL' : 'COURSE_STUDENTS'
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState('ANNOUNCEMENT');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

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
    if (user?.role === 'ADMIN' || user?.role === 'LECTURER') {
      api.getCourses().then((cList) => {
        setCourses(cList);
        if (cList.length > 0) setSelectedCourseId(String(cList[0].id));
      }).catch(console.error);
    }
  }, [user]);

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
      toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) {
      handleMarkAsRead(n.id);
    }
    const targetUrl = n.relatedUrl || (n as any).related_url;
    if (targetUrl) {
      navigate(targetUrl);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toast.warning('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo.');
      return;
    }
    setSendingBroadcast(true);
    try {
      const res = await api.broadcastNotification({
        target: broadcastTarget,
        courseId: broadcastTarget === 'COURSE_STUDENTS' ? selectedCourseId : undefined,
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        type: broadcastType,
        relatedUrl: broadcastTarget === 'COURSE_STUDENTS' && selectedCourseId ? `/courses/${selectedCourseId}` : undefined,
      });
      toast.success(res.message);
      setIsBroadcastModalOpen(false);
      setBroadcastTitle('');
      setBroadcastMessage('');
      fetchNotifications();
    } catch (err: any) {
      toast.error('Lỗi khi gửi thông báo: ' + (err.message || 'Không thể gửi'));
    } finally {
      setSendingBroadcast(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'COURSE':
        return <BookOpen className="w-4 h-4 text-blue-600" />;
      case 'ASSIGNMENT':
        return <FileText className="w-4 h-4 text-amber-600" />;
      case 'QUIZ':
        return <CheckCircle2 className="w-4 h-4 text-purple-600" />;
      case 'GRADE':
        return <Award className="w-4 h-4 text-emerald-600" />;
      case 'ANNOUNCEMENT':
        return <Megaphone className="w-4 h-4 text-rose-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const filtered = notifications.filter((n) => (filter === 'UNREAD' ? !n.is_read : true));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Hộp thư Thông báo</h1>
          <p className="text-sm text-slate-500">Cập nhật tin tức khóa học, điểm số và bài tập theo thời gian thực</p>
        </div>

        <div className="flex items-center space-x-2.5">
          {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
            <button
              onClick={() => setIsBroadcastModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gửi thông báo</span>
            </button>
          )}

          <button
            onClick={handleMarkAllAsRead}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            <CheckCheck className="w-4 h-4 text-slate-500" />
            <span>Đã đọc tất cả</span>
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
          {filtered.map((n) => {
            const targetUrl = n.relatedUrl || (n as any).related_url;
            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-4 transition flex items-start justify-between cursor-pointer ${
                  !n.is_read ? 'bg-blue-50/40 hover:bg-blue-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    {getNotificationIcon(n.type)}
                  </div>
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
                    <div className="flex items-center text-[11px] text-slate-400 space-x-3 pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(n.created_at).toLocaleString('vi-VN')}
                      </span>
                      {targetUrl && (
                        <span className="flex items-center gap-0.5 text-blue-600 font-medium">
                          <ExternalLink className="w-3 h-3" /> Xem chi tiết
                        </span>
                      )}
                    </div>
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
            );
          })}
        </div>
      )}

      {/* MODAL: Broadcast Notification */}
      {isBroadcastModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-blue-600" /> Gửi thông báo đến người dùng
              </h3>
              <button onClick={() => setIsBroadcastModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Đối tượng nhận thông báo</label>
                <select
                  value={broadcastTarget}
                  onChange={(e) => setBroadcastTarget(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {user?.role === 'ADMIN' && (
                    <>
                      <option value="ALL">Tất cả người dùng (Toàn trường)</option>
                      <option value="STUDENTS">Tất cả sinh viên</option>
                      <option value="LECTURERS">Tất cả giảng viên</option>
                    </>
                  )}
                  <option value="COURSE_STUDENTS">Sinh viên theo lớp học phần</option>
                </select>
              </div>

              {broadcastTarget === 'COURSE_STUDENTS' && (
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Chọn lớp học phần</label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Loại thông báo</label>
                <select
                  value={broadcastType}
                  onChange={(e) => setBroadcastType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="ANNOUNCEMENT">Thông báo chung (ANNOUNCEMENT)</option>
                  <option value="COURSE">Học tập / Khóa học (COURSE)</option>
                  <option value="SYSTEM">Hệ thống (SYSTEM)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tiêu đề thông báo</label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Thông báo nghỉ học, dời lịch thi hoặc nhắc nhở..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Nội dung thông báo</label>
                <textarea
                  rows={4}
                  required
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Nhập nội dung chi tiết thông báo..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingBroadcast ? 'Đang gửi...' : 'Gửi ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
