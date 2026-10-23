import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  LayoutDashboard,
  CalendarDays,
  Users,
  BookOpen,
  FileText,
  CheckSquare,
  Award,
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../api/client';
import type { Notification } from '../../types';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.slice(0, 5));
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch {
      // Ignored for layout polling
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const navItems = [
    { label: 'Tổng quan', path: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'LECTURER', 'STUDENT'] },
    { label: 'Kế hoạch học tập', path: '/study-plan', icon: CalendarDays, roles: ['STUDENT'] },
    { label: 'Người dùng', path: '/users', icon: Users, roles: ['ADMIN'] },
    { label: 'Khóa học', path: '/courses', icon: BookOpen, roles: ['ADMIN', 'LECTURER', 'STUDENT'] },
    { label: 'Bài tập', path: '/assignments', icon: FileText, roles: ['LECTURER', 'STUDENT'] },
    { label: 'Bài kiểm tra (Quiz)', path: '/quizzes', icon: CheckSquare, roles: ['LECTURER', 'STUDENT'] },
    { label: 'Bảng điểm', path: '/grades', icon: Award, roles: ['STUDENT', 'LECTURER'] },
    { label: 'Thông báo', path: '/notifications', icon: Bell, roles: ['ADMIN', 'LECTURER', 'STUDENT'] },
  ];

  const allowedNav = navItems.filter((item) => user && item.roles.includes(user.role));

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">Admin</span>;
      case 'LECTURER':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">Giảng viên</span>;
      case 'STUDENT':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">Sinh viên</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Toggle sidebar"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <span className="font-bold text-lg text-slate-800 tracking-tight block leading-none">University LMS</span>
                <span className="text-xs text-slate-400 font-medium">Hệ thống Quản lý Học tập Đại học</span>
              </div>
            </Link>
          </div>

          {/* User actions */}
          <div className="flex items-center space-x-4">
            {/* Notifications Menu */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
                title="Thông báo"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-800">Thông báo mới</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-400">Không có thông báo nào</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3 hover:bg-slate-50 transition cursor-pointer ${
                            !n.is_read ? 'bg-blue-50/40' : ''
                          }`}
                          onClick={() => {
                            setNotificationsOpen(false);
                            navigate('/notifications');
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-medium text-slate-800 line-clamp-1">{n.title}</span>
                            {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-600 ml-2 mt-1.5 shrink-0" />}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.message}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {new Date(n.created_at).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t border-slate-100 p-2 text-center">
                    <Link
                      to="/notifications"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Xem tất cả thông báo
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Profile info */}
            <div className="hidden sm:flex items-center space-x-3 pl-2 border-l border-slate-200">
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-800 leading-none">{user?.full_name}</div>
                <div className="mt-1 flex justify-end">{getRoleBadge(user?.role)}</div>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex-1 flex gap-6">
        {/* Sidebar Desktop */}
        <aside className="hidden md:block w-64 shrink-0">
          <nav className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs space-y-1 sticky top-24">
            <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Menu Chính</div>
            {allowedNav.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Sidebar Modal */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setSidebarOpen(false)} />
            <div className="relative w-64 bg-white p-4 flex flex-col h-full shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <span className="font-bold text-slate-800">Menu Hệ Thống</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <nav className="mt-4 space-y-1 flex-1">
                {allowedNav.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                        isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={logout}
                  className="flex items-center space-x-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        University LMS • Đồ án Quản lý Dự án Phần mềm • Dual-Track Monolith Architecture
      </footer>
    </div>
  );
};
