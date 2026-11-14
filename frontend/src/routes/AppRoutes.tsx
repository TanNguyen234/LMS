import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { AppLayout } from '../components/layout/AppLayout';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';

const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const AdminUsersPage = lazy(() =>
  import('../pages/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })),
);
const CoursesPage = lazy(() =>
  import('../pages/CoursesPage').then((module) => ({ default: module.CoursesPage })),
);
const CourseDetailPage = lazy(() =>
  import('../pages/CourseDetailPage').then((module) => ({ default: module.CourseDetailPage })),
);
const AssignmentsPage = lazy(() =>
  import('../pages/AssignmentsPage').then((module) => ({ default: module.AssignmentsPage })),
);
const QuizzesPage = lazy(() =>
  import('../pages/QuizzesPage').then((module) => ({ default: module.QuizzesPage })),
);
const GradesPage = lazy(() =>
  import('../pages/GradesPage').then((module) => ({ default: module.GradesPage })),
);
const SchedulePage = lazy(() =>
  import('../pages/SchedulePage').then((module) => ({ default: module.SchedulePage })),
);
const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const NotificationsPage = lazy(() =>
  import('../pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })),
);
const VirtualClassroomPage = lazy(() =>
  import('../pages/VirtualClassroomPage').then((module) => ({
    default: module.VirtualClassroomPage,
  })),
);

const RouteLoadingFallback: React.FC = () => (
  <div className="p-6 max-w-6xl mx-auto space-y-4" aria-busy="true" aria-live="polite">
    <div className="space-y-2">
      <Skeleton className="w-56 h-7" />
      <Skeleton className="w-80 h-3.5" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/classroom"
          element={
            <ProtectedRoute>
              <VirtualClassroomPage />
            </ProtectedRoute>
          }
        />

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

          <Route
            path="users"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />

          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:id" element={<CourseDetailPage />} />
          <Route path="courses/:id/assignments/:assignmentId" element={<CourseDetailPage />} />
          <Route path="courses/:id/quizzes/:quizId" element={<CourseDetailPage />} />
          <Route path="courses/:id/classroom" element={<CourseDetailPage initialTab="classroom" />} />
          <Route path="courses/:id/grades" element={<CourseDetailPage initialTab="gradebook" />} />

          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="quizzes" element={<QuizzesPage />} />
          <Route path="grades" element={<GradesPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="teams" element={<Navigate to="/classroom" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};
