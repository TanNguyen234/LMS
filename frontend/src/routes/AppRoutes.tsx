import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { StudyPlannerPage } from '../pages/StudyPlannerPage';
import { AdminUsersPage } from '../pages/AdminUsersPage';
import { CoursesPage } from '../pages/CoursesPage';
import { CourseDetailPage } from '../pages/CourseDetailPage';
import { AssignmentsPage } from '../pages/AssignmentsPage';
import { QuizzesPage } from '../pages/QuizzesPage';
import { GradesPage } from '../pages/GradesPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated Application */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        
        {/* Admin only */}
        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />

        {/* All authenticated */}
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/:id" element={<CourseDetailPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="study-plan" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudyPlannerPage /></ProtectedRoute>} />
        <Route path="quizzes" element={<QuizzesPage />} />
        <Route path="grades" element={<GradesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
