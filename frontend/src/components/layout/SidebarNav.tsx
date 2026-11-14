import React, { useEffect } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import type { UserRole } from '../../types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

function getNavGroups(role: UserRole): NavGroup[] {
  if (role === 'ADMIN') {
    return [
      {
        title: 'Quản trị hệ thống',
        items: [
          { to: '/dashboard', label: 'Điều hành', icon: LayoutDashboard },
          { to: '/users', label: 'Người dùng', icon: Users },
          { to: '/courses', label: 'Khóa học', icon: BookOpen },
          { to: '/schedule', label: 'Lịch học vụ', icon: CalendarDays },
        ],
      },
      {
        title: 'Vận hành',
        items: [
          { to: '/classroom', label: 'Giám sát phòng học', icon: Video },
          { to: '/notifications', label: 'Thông báo', icon: Bell },
        ],
      },
    ];
  }

  if (role === 'LECTURER') {
    return [
      {
        title: 'Giảng dạy',
        items: [
          { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
          { to: '/courses', label: 'Khóa học phụ trách', icon: BookOpen },
          { to: '/schedule', label: 'Lịch giảng dạy', icon: CalendarDays },
        ],
      },
      {
        title: 'Đánh giá & Lớp học',
        items: [
          { to: '/assignments', label: 'Chấm bài tập', icon: FileText },
          { to: '/quizzes', label: 'Trắc nghiệm', icon: ClipboardCheck },
          { to: '/grades', label: 'Sổ điểm lớp', icon: Award },
        ],
      },
      {
        title: 'Trực tuyến',
        items: [
          { to: '/classroom', label: 'Phòng học trực tuyến', icon: Video },
          { to: '/notifications', label: 'Thông báo', icon: Bell },
        ],
      },
    ];
  }

  return [
    {
      title: 'Học tập',
      items: [
        { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
        { to: '/courses', label: 'Khóa học của tôi', icon: BookOpen },
        { to: '/schedule', label: 'Lịch & Deadline', icon: CalendarDays },
      ],
    },
    {
      title: 'Đánh giá & Kết quả',
      items: [
        { to: '/assignments', label: 'Bài tập', icon: FileText },
        { to: '/quizzes', label: 'Trắc nghiệm', icon: ClipboardCheck },
        { to: '/grades', label: 'Bảng điểm', icon: Award },
      ],
    },
    {
      title: 'Kết nối',
      items: [
        { to: '/classroom', label: 'Phòng học trực tuyến', icon: Video },
        { to: '/notifications', label: 'Thông báo', icon: Bell },
      ],
    },
  ];
}

export interface SidebarNavProps {
  role: UserRole;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapse: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  role,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapse,
}) => {
  const location = useLocation();
  const groups = getNavGroups(role);

  useEffect(() => {
    onCloseMobile();
  }, [location.pathname, onCloseMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const renderNavContent = (isCompact: boolean, showMobileHeader: boolean) => (
    <div className="flex flex-col h-full bg-[var(--lms-surface)] text-[var(--lms-text)]">
      {showMobileHeader && (
        <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--lms-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center">
              <GraduationCap className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">UniLMS</div>
              <div className="text-[11px] text-[var(--lms-text-muted)]">Cổng học vụ</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Đóng menu điều hướng"
            className="p-2 rounded-lg text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)] hover:text-[var(--lms-text)] transition cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}

      <nav
        aria-label="Điều hướng phân hệ"
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
      >
        {groups.map((group) => (
          <div key={group.title}>
            {!isCompact && (
              <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--lms-text-muted)]">
                {group.title}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={isCompact ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center ${
                        isCompact ? 'justify-center px-2.5' : 'gap-3 px-3'
                      } py-2.5 rounded-xl text-sm border transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70 font-semibold'
                          : 'border-transparent text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] font-medium'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {!isCompact && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[var(--lms-border)] space-y-1">
        <NavLink
          to="/profile"
          title={isCompact ? 'Hồ sơ cá nhân' : undefined}
          className={({ isActive }) =>
            `flex items-center ${
              isCompact ? 'justify-center px-2.5' : 'gap-3 px-3'
            } py-2.5 rounded-xl text-sm border transition-colors ${
              isActive
                ? 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70 font-semibold'
                : 'border-transparent text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] font-medium'
            }`
          }
        >
          <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          {!isCompact && <span className="truncate">Hồ sơ cá nhân</span>}
        </NavLink>

        {!showMobileHeader && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCompact ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            className={`w-full flex items-center ${
              isCompact ? 'justify-center px-2.5' : 'gap-3 px-3'
            } py-2 rounded-xl text-xs font-medium text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer`}
          >
            {isCompact ? (
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                <span>Thu gọn menu</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        aria-label="Thanh điều hướng chính"
        className={`hidden md:block shrink-0 border-r border-[var(--lms-border)] bg-[var(--lms-surface)] transition-[width] duration-200 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className="sticky top-16 h-[calc(100vh-4rem)]">
          {renderNavContent(collapsed, false)}
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Điều hướng di động"
            className="relative z-10 w-72 max-w-[85vw] h-full border-r border-[var(--lms-border)] shadow-xl"
          >
            {renderNavContent(false, true)}
          </aside>
        </div>
      )}
    </>
  );
};
