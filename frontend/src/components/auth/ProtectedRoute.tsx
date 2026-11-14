import React from 'react';
import { ArrowLeft, Home, ShieldAlert } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { UserRole } from '../../types';
import { formatRole } from '../../utils/formatters';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, token, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-[var(--lms-bg)] text-[var(--lms-text)] flex items-center justify-center p-6"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="w-3/5 h-3.5" />
              <Skeleton className="w-2/5 h-3" />
            </div>
          </div>
          <SkeletonCard />
          <p className="text-center text-sm text-[var(--lms-text-muted)]">
            Đang xác thực phiên làm việc...
          </p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-md bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-8 text-center shadow-sm"
        >
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-[var(--lms-text)] mb-2">
            Không có quyền truy cập (403)
          </h2>
          <p className="text-sm text-[var(--lms-text-muted)] mb-6 leading-relaxed">
            Phân hệ này không khả dụng với vai trò hiện tại ({formatRole(user.role)}).
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] text-sm font-medium text-[var(--lms-text)] hover:opacity-90 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Quay lại
            </button>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white hover:opacity-95 transition"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              Về tổng quan
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
