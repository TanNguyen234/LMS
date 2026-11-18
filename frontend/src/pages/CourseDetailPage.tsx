import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  ClipboardCheck,
  FileText,
  Lock,
  Users,
  Video,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getCourseModules } from '../api/content';
import { ApiError } from '../api/http';
import { getCourseDetail, getCourseProgress } from '../api/learning';
import { useAuth } from '../auth/AuthContext';
import { CourseClassroomTab } from '../components/courses/CourseClassroomTab';
import { CourseContentTab } from '../components/courses/CourseContentTab';
import { CourseGradebookTab } from '../components/courses/CourseGradebookTab';
import { CourseHeader } from '../components/courses/CourseHeader';
import { CourseStudentsTab } from '../components/courses/CourseStudentsTab';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '../components/ui/Tabs';
import type { Course, Module } from '../types';
import { AssignmentsPage } from './AssignmentsPage';
import { QuizzesPage } from './QuizzesPage';

export type CourseTabKey =
  | 'content'
  | 'assignments'
  | 'quizzes'
  | 'gradebook'
  | 'students'
  | 'classroom';

const ALL_TAB_KEYS = new Set<CourseTabKey>([
  'content',
  'assignments',
  'quizzes',
  'gradebook',
  'students',
  'classroom',
]);

export interface CourseDetailPageProps {
  initialTab?: CourseTabKey;
}

export const CourseDetailPage: React.FC<CourseDetailPageProps> = ({ initialTab }) => {
  const { id: courseId, assignmentId, quizId } = useParams<{
    id: string;
    assignmentId?: string;
    quizId?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [loadedWorkspaceKey, setLoadedWorkspaceKey] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const workspaceKey = `${user?.userId ?? ''}:${courseId ?? ''}`;
  const loading = loadedWorkspaceKey !== workspaceKey;

  const canManage = useMemo(() => {
    if (!user || !course) return false;
    if (user.role === 'ADMIN') return true;
    if (user.role === 'LECTURER') {
      return course.lecturerId.toLowerCase() === user.userId.toLowerCase();
    }
    return false;
  }, [user, course]);

  const isStudent = user?.role === 'STUDENT';
  const isStudentReadOnly =
    isStudent &&
    Boolean(
      course &&
        (course.status.toUpperCase() !== 'ACTIVE' ||
          (course.myEnrollmentStatus &&
            course.myEnrollmentStatus.toUpperCase() !== 'ACTIVE')),
    );

  const fetchCourseWorkspace = useCallback(async () => {
    if (!courseId || !user?.userId) return;
    const [courseDetail, moduleList, progressRes] = await Promise.all([
      getCourseDetail(courseId),
      getCourseModules(courseId),
      getCourseProgress(courseId).catch(() => null),
    ]);
    setCourse(courseDetail);
    setModules(moduleList);
    setAccessDenied(false);
    setError(null);

    if (progressRes) {
      if ('completedLessons' in progressRes) {
        const doneIds = new Set(
          progressRes.items.filter((i) => i.isCompleted).map((i) => i.lessonId),
        );
        setCompletedLessonIds(doneIds);
        setProgressPercent(progressRes.completionPercent);
        setProgressLabel(
          `${progressRes.completedLessons}/${progressRes.totalLessons} bài giảng đã hoàn thành`,
        );
      } else if ('students' in progressRes) {
        const activeRows = progressRes.students.filter((s) => s.enrollmentStatus === 'ACTIVE');
        const target = activeRows.length > 0 ? activeRows : progressRes.students;
        const avg =
          target.length > 0
            ? target.reduce((sum, s) => sum + s.completionPercent, 0) / target.length
            : 0;
        setProgressPercent(avg);
        setProgressLabel(
          `${target.length} học viên · ${progressRes.totalLessons} bài giảng`,
        );
      }
    } else {
      setCompletedLessonIds(new Set());
      setProgressPercent(null);
      setProgressLabel('');
    }
  }, [courseId, user?.userId]);

  const loadCourseWorkspace = useCallback(async () => {
    const key = `${user?.userId ?? ''}:${courseId ?? ''}`;
    setLoadedWorkspaceKey('');
    setError(null);
    setAccessDenied(false);
    try {
      await fetchCourseWorkspace();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setCourse(null);
        setAccessDenied(true);
      } else {
        setError(err instanceof Error ? err.message : 'Không thể tải thông tin khóa học.');
      }
    } finally {
      setLoadedWorkspaceKey(key);
    }
  }, [courseId, fetchCourseWorkspace, user?.userId]);

  useEffect(() => {
    let active = true;
    const key = `${user?.userId ?? ''}:${courseId ?? ''}`;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        return fetchCourseWorkspace();
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 403) {
          setCourse(null);
          setAccessDenied(true);
          setError(null);
        } else {
          setAccessDenied(false);
          setError(err instanceof Error ? err.message : 'Không thể tải thông tin khóa học.');
        }
      })
      .finally(() => {
        if (active) setLoadedWorkspaceKey(key);
      });
    return () => {
      active = false;
    };
  }, [courseId, fetchCourseWorkspace, user?.userId]);

  const refreshModulesOnly = useCallback(async () => {
    if (!courseId) return;
    const list = await getCourseModules(courseId);
    setModules(list);
  }, [courseId]);

  const handleToggleLessonCompletedLocally = useCallback(
    (lessonId: string, isCompleted: boolean) => {
      const totalLessons = modules.reduce((sum, mod) => sum + mod.lessons.length, 0);
      setCompletedLessonIds((prev) => {
        const next = new Set(prev);
        if (isCompleted) {
          next.add(lessonId);
        } else {
          next.delete(lessonId);
        }
        const pct = totalLessons > 0 ? (next.size / totalLessons) * 100 : 0;
        setProgressPercent(pct);
        setProgressLabel(`${next.size}/${totalLessons} bài giảng đã hoàn thành`);
        return next;
      });
    },
    [modules],
  );

  const handleClassProgressLoaded = useCallback(
    (avg: number | null, label: string) => {
      setProgressPercent(avg);
      setProgressLabel(label);
    },
    [],
  );

  const activeTab: CourseTabKey = useMemo(() => {
    if (assignmentId) return 'assignments';
    if (quizId) return 'quizzes';

    const queryTab = searchParams.get('tab') as CourseTabKey | null;
    if (queryTab && ALL_TAB_KEYS.has(queryTab)) {
      if (queryTab === 'students' && !canManage) return 'content';
      return queryTab;
    }

    if (initialTab && ALL_TAB_KEYS.has(initialTab)) {
      if (initialTab === 'students' && !canManage) return 'content';
      return initialTab;
    }
    return 'content';
  }, [assignmentId, quizId, searchParams, initialTab, canManage]);

  const handleTabChange = (nextId: string) => {
    const nextTab = nextId as CourseTabKey;
    if (!courseId) return;
    if (assignmentId || quizId || initialTab) {
      navigate(`/courses/${courseId}?tab=${encodeURIComponent(nextTab)}`);
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const tabItems: TabItem[] = useMemo(() => {
    const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
    const items: TabItem[] = [
      {
        id: 'content',
        label: 'Nội dung học',
        badge: totalLessons,
        icon: <BookOpen className="w-4 h-4" aria-hidden="true" />,
      },
      {
        id: 'assignments',
        label: 'Bài tập',
        icon: <FileText className="w-4 h-4" aria-hidden="true" />,
      },
      {
        id: 'quizzes',
        label: 'Trắc nghiệm',
        icon: <ClipboardCheck className="w-4 h-4" aria-hidden="true" />,
      },
      {
        id: 'gradebook',
        label: canManage ? 'Sổ điểm' : 'Điểm số',
        icon: <Award className="w-4 h-4" aria-hidden="true" />,
      },
    ];

    if (canManage) {
      items.push({
        id: 'students',
        label: 'Học viên',
        icon: <Users className="w-4 h-4" aria-hidden="true" />,
      });
    }

    items.push({
      id: 'classroom',
      label: 'Phòng học',
      icon: <Video className="w-4 h-4" aria-hidden="true" />,
    });

    return items;
  }, [modules, canManage]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton variant="rect" className="h-[180px] rounded-2xl" />
        <Skeleton className="w-[420px] h-11 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <SkeletonCard />
          </div>
          <div className="lg:col-span-8">
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-8 shadow-xs">
        <EmptyState
          icon={<Lock className="w-6 h-6" aria-hidden="true" />}
          title="Chưa có quyền truy cập học phần này"
          description={
            isStudent
              ? 'Tài khoản sinh viên hiện tại chưa ghi danh vào học phần này hoặc học phần đang ở trạng thái nháp chưa mở cho học viên.'
              : 'Học phần này thuộc giảng viên khác. Hãy chuyển sang danh sách khóa học bạn phụ trách.'
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Link
                to="/courses"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 transition"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                {isStudent ? 'Khám phá & Ghi danh học phần' : 'Danh sách khóa học'}
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] transition"
              >
                Về tổng quan
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (error || !course) {
    return (
      <ErrorBanner
        message={error || 'Không tìm thấy khóa học yêu cầu.'}
        onRetry={loadCourseWorkspace}
      />
    );
  }

  return (
    <div className="space-y-6">
      <CourseHeader
        course={course}
        userRole={user.role}
        canManage={canManage}
        progressPercent={progressPercent}
        progressLabel={progressLabel}
        onCourseUpdated={(updated) => setCourse(updated)}
      />

      <Tabs
        items={tabItems}
        activeId={activeTab}
        onChange={handleTabChange}
        ariaLabel="Phân khu khóa học"
        idPrefix="course-workspace"
      />

      <TabPanel id="content" activeId={activeTab} idPrefix="course-workspace">
        <CourseContentTab
          courseId={course.courseId}
          modules={modules}
          canManage={canManage}
          isStudent={isStudent}
          readOnlyProgress={isStudentReadOnly}
          completedLessonIds={completedLessonIds}
          onRefreshContent={refreshModulesOnly}
          onToggleLessonCompletedLocally={handleToggleLessonCompletedLocally}
        />
      </TabPanel>

      <TabPanel id="assignments" activeId={activeTab} idPrefix="course-workspace">
        <AssignmentsPage
          embeddedCourseId={course.courseId}
          embeddedCourseStatus={course.status}
          embeddedEnrollmentStatus={course.myEnrollmentStatus}
        />
      </TabPanel>

      <TabPanel id="quizzes" activeId={activeTab} idPrefix="course-workspace">
        <QuizzesPage
          embeddedCourseId={course.courseId}
          embeddedCourseStatus={course.status}
          embeddedEnrollmentStatus={course.myEnrollmentStatus}
        />
      </TabPanel>

      <TabPanel id="gradebook" activeId={activeTab} idPrefix="course-workspace">
        <CourseGradebookTab course={course} canManage={canManage} />
      </TabPanel>

      {canManage && (
        <TabPanel id="students" activeId={activeTab} idPrefix="course-workspace">
          <CourseStudentsTab
            courseId={course.courseId}
            isAdmin={user.role === 'ADMIN'}
            onProgressLoaded={handleClassProgressLoaded}
          />
        </TabPanel>
      )}

      <TabPanel id="classroom" activeId={activeTab} idPrefix="course-workspace">
        <CourseClassroomTab course={course} canManage={canManage} />
      </TabPanel>
    </div>
  );
};

export default CourseDetailPage;
