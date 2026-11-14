import React, { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { OnboardingGuideModal } from '../common/OnboardingGuideModal';
import { SidebarNav } from './SidebarNav';
import { TopHeader } from './TopHeader';

const SIDEBAR_STORAGE_KEY = 'lms_sidebar_collapsed';

function readSidebarPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export const AppLayout: React.FC = () => {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readSidebarPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage write restriction
      }
      return next;
    });
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--lms-bg)] text-[var(--lms-text)]">
      <TopHeader
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapse={toggleSidebarCollapse}
        onOpenMobileMenu={() => setMobileOpen(true)}
        onOpenGuide={() => setGuideOpen(true)}
      />

      <div className="flex flex-1 min-h-0">
        <SidebarNav
          role={user.role}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={closeMobile}
          onToggleCollapse={toggleSidebarCollapse}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Outlet />
          </main>

          <footer className="border-t border-[var(--lms-border)] px-6 py-4 text-xs text-[var(--lms-text-muted)] text-center no-print">
            UniLMS — Hệ thống Quản lý Học tập & Giảng dạy Đại học
          </footer>
        </div>
      </div>

      <OnboardingGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        role={user.role}
      />
    </div>
  );
};
