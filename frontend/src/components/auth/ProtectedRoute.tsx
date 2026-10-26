import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { roleLabel } from '../../utils/vi';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, token, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-500">Đang xác thực thông tin...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Quyền truy cập bị từ chối (403)</h2>
        <p className="text-sm text-slate-500 mb-4">Bạn không có quyền truy cập vào phân hệ này với vai trò hiện tại ({roleLabel(user.role)}).</p>
        <Navigate to="/dashboard" replace />
      </div>
    );
  }

  return <>{children}</>;
};
