import React, { useCallback, useEffect, useState } from 'react';
import {
  getAdminDashboard,
  getCourseProgress,
  getCourseQuizzes,
  getCourses,
  getDashboardCalendar,
  getLecturerDashboard,
  getQuizAnalytics,
  getStudentDashboard,
  type AdminDashboardPayload,
  type LecturerDashboardPayload,
  type StudentDashboardPayload,
} from '../api/learning';
import { getActiveMeetings } from '../api/realtime';
import { useAuth } from '../auth/AuthContext';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import {
  LecturerDashboard,
  type PendingQuizReviewItem,
} from '../components/dashboard/LecturerDashboard';
import { StudentDashboard } from '../components/dashboard/StudentDashboard';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import type {
  CalendarEventItem,
  Course,
  CourseProgressSummary,
  Meeting,
} from '../types';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [studentData, setStudentData] = useState<StudentDashboardPayload | null>(null);
  const [progressByCourse, setProgressByCourse] = useState<Record<string, CourseProgressSummary>>(
    {},
  );

  const [lecturerData, setLecturerData] = useState<LecturerDashboardPayload | null>(null);
  const [pendingQuizItems, setPendingQuizItems] = useState<PendingQuizReviewItem[]>([]);

  const [adminData, setAdminData] = useState<AdminDashboardPayload | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [healthLabel, setHealthLabel] = useState('API đang hoạt động');

  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [activeMeetings, setActiveMeetings] = useState<Meeting[]>([]);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    const fromIso = new Date().toISOString();
    const toIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const meetingsPromise = getActiveMeetings().catch(() => [] as Meeting[]);

    if (user.role === 'STUDENT') {
      const [studentPayload, events, meetings] = await Promise.all([
        getStudentDashboard(),
        getDashboardCalendar({ from: fromIso, to: toIso }).catch(() => [] as CalendarEventItem[]),
        meetingsPromise,
      ]);
      setStudentData(studentPayload);
      setCalendarEvents(events);
      setActiveMeetings(meetings);

      const progressResults = await Promise.allSettled(
        studentPayload.enrolledCourses.map((c) => getCourseProgress(c.courseId)),
      );
      const mapped: Record<string, CourseProgressSummary> = {};
      progressResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && 'completedLessons' in result.value) {
          const cid = studentPayload.enrolledCourses[idx].courseId;
          mapped[cid] = result.value;
        }
      });
      setProgressByCourse(mapped);
      return;
    }

    if (user.role === 'LECTURER') {
      const [lecturerPayload, events, meetings, lecturerCourses] = await Promise.all([
        getLecturerDashboard(),
        getDashboardCalendar({ from: fromIso, to: toIso }).catch(() => [] as CalendarEventItem[]),
        meetingsPromise,
        getCourses({ lecturerId: user.userId }).catch(() => [] as Course[]),
      ]);
      setLecturerData(lecturerPayload);
      setCalendarEvents(events);
      setActiveMeetings(meetings);

      const targetCourses =
        lecturerCourses.length > 0 ? lecturerCourses : lecturerPayload.recentCourses;
      const quizListResults = await Promise.allSettled(
        targetCourses.map((c) => getCourseQuizzes(c.courseId)),
      );
      const quizzesToCheck: Array<{
        quizId: string;
        courseId: string;
        title: string;
        courseCode?: string;
      }> = [];
      quizListResults.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return;
        const course = targetCourses[idx];
        res.value.forEach((quiz) => {
          quizzesToCheck.push({
            quizId: quiz.quizId,
            courseId: course.courseId,
            title: quiz.title,
            courseCode: course.courseCode,
          });
        });
      });

      const analyticsResults = await Promise.allSettled(
        quizzesToCheck.map((q) => getQuizAnalytics(q.quizId)),
      );
      const pendingItems: PendingQuizReviewItem[] = [];
      analyticsResults.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value.pendingReviewCount > 0) {
          const meta = quizzesToCheck[idx];
          pendingItems.push({
            quizId: meta.quizId,
            courseId: meta.courseId,
            title: meta.title,
            courseCode: meta.courseCode,
            pendingReviewCount: res.value.pendingReviewCount,
          });
        }
      });
      setPendingQuizItems(pendingItems);
      return;
    }

    const [adminPayload, coursesList, meetings] = await Promise.all([
      getAdminDashboard(),
      getCourses().catch(() => [] as Course[]),
      meetingsPromise,
    ]);
    setAdminData(adminPayload);
    setAllCourses(coursesList);
    setActiveMeetings(meetings);

    try {
      const res = await fetch('/health');
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        setHealthLabel(
          res.ok && json?.status === 'ok'
            ? 'Hệ thống & CSDL ổn định'
            : 'CSDL đang bảo trì hoặc phản hồi chậm',
        );
      } else {
        setHealthLabel('API đang hoạt động');
      }
    } catch {
      setHealthLabel('API đang hoạt động');
    }
  }, [user]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchDashboardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu tổng quan.');
    } finally {
      setLoading(false);
    }
  }, [fetchDashboardData]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        return fetchDashboardData();
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu tổng quan.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchDashboardData]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton variant="rect" className="h-[124px] rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <SkeletonCard />
          </div>
          <div className="lg:col-span-5">
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={handleRetry} />;
  }

  if (user.role === 'STUDENT' && studentData) {
    return (
      <StudentDashboard
        user={user}
        data={studentData}
        progressByCourse={progressByCourse}
        calendarEvents={calendarEvents}
        activeMeetings={activeMeetings}
      />
    );
  }

  if (user.role === 'LECTURER' && lecturerData) {
    return (
      <LecturerDashboard
        user={user}
        data={lecturerData}
        pendingQuizItems={pendingQuizItems}
        calendarEvents={calendarEvents}
        activeMeetings={activeMeetings}
      />
    );
  }

  if (user.role === 'ADMIN' && adminData) {
    return (
      <AdminDashboard
        user={user}
        data={adminData}
        courses={allCourses}
        activeMeetings={activeMeetings}
        healthLabel={healthLabel}
      />
    );
  }

  return null;
};

export default DashboardPage;
