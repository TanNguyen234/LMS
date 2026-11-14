import React from 'react';
import {
  GraduationCap,
  HelpCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { UserRole } from '../../types';
import { formatRole } from '../../utils/formatters';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
import { DemoRoleSwitcher } from '../common/DemoRoleSwitcher';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationPopover } from './NotificationPopover';

const ROLE_BADGE_MAP: Record<UserRole, BadgeVariant> = {
  ADMIN: 'info',
  LECTURER: 'primary',
  STUDENT: 'success',
};

export interface TopHeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
  onOpenMobileMenu: () => void;
  onOpenGuide: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  sidebarCollapsed,
  onToggleSidebarCollapse,
  onOpenMobileMenu,
  onOpenGuide,
}) => {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="sticky top-0 z-30 h-16 bg-[var(--lms-surface)]/95 backdrop-blur-sm border-b border-[var(--lms-border)] no-print">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Mở menu điều hướng"
            className="md:hidden p-2 rounded-lg border border-[var(--lms-border)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleSidebarCollapse}
            aria-label={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            className="hidden md:inline-flex p-2 rounded-lg border border-[var(--lms-border)] text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0 group">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 shadow-sm">
              <GraduationCap className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-bold tracking-tight text-[var(--lms-text)] truncate">
                UniLMS
              </div>
              <div className="hidden sm:block text-[11px] text-[var(--lms-text-muted)] truncate">
                Không gian học tập & giảng dạy
              </div>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <DemoRoleSwitcher className="hidden sm:block" />

          <ThemeToggle />

          <button
            type="button"
            onClick={onOpenGuide}
            title="Hướng dẫn nhanh theo vai trò"
            aria-label="Mở hướng dẫn nhanh theo vai trò"
            className="p-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text-muted)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>

          <NotificationPopover />

          <div className="h-6 w-px bg-[var(--lms-border)] mx-0.5 hidden sm:block" />

          <Link
            to="/profile"
            className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-[var(--lms-surface-muted)] transition"
            title="Hồ sơ cá nhân"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600/15 text-blue-700 dark:text-blue-300 font-semibold text-xs flex items-center justify-center shrink-0">
              {getInitials(user.fullName || user.email)}
            </div>
            <div className="hidden lg:block text-left leading-tight">
              <div className="text-xs font-semibold text-[var(--lms-text)] max-w-[140px] truncate">
                {user.fullName}
              </div>
              <div className="mt-0.5">
                <Badge variant={ROLE_BADGE_MAP[user.role]} size="sm">
                  {formatRole(user.role)}
                </Badge>
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={logout}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-[var(--lms-text-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/5 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span className="hidden xl:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
};
