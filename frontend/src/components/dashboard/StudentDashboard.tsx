import React from 'react';
import {
  Award,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  PlayCircle,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { StudentDashboardPayload } from '../../api/learning';
import type { CalendarEventItem, CourseProgressSummary, Meeting, User } from '../../types';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { DeadlineFeed } from './DeadlineFeed';
import { KpiCard } from './KpiCard';

export interface StudentDashboardProps {
  user: User;
  data: StudentDashboardPayload;
  progressByCourse: Record<string, CourseProgressSummary>;
  calendarEvents: CalendarEventItem[];
  activeMeetings: Meeting[];
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  data,
  progressByCourse,
  calendarEvents,
  activeMeetings,
}) => {
  const completionPct =
    data.totalLessons > 0
      ? Math.round((data.completedLessons / data.totalLessons) * 100)
      : 0;

  const gpaDisplay =
    data.gpaScale4 !== null && data.gpaScale4 !== undefined
      ? `${data.gpaScale4.toFixed(2)} / 4.0`
      : data.gpa !== null && data.gpa !== undefined
        ? `${data.gpa.toFixed(1)} / 10`
        : '—';

  const gpaSubtitle =
    data.gpa !== null && data.gpa !== undefined
      ? `Thang 10: ${data.gpa.toFixed(2)}`
      : 'Chưa có điểm tổng kết';

  return (
    <div className="space-y-6">
      <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="success" size="sm">
              Sinh viên
            </Badge>
            {user.studentCode && (
              <span className="text-xs font-mono text-[var(--lms-text-muted)]">
                MSSV: {user.studentCode}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--lms-text)] tracking-tight">
            Xin chào, {user.fullName}
          </h1>
          <p className="text-sm text-[var(--lms-text-muted)] mt-1">
            Theo dõi tiến độ bài học, hạn nộp bài tập và lịch thi trắc nghiệm của bạn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeMeetings.length > 0 && (
            <Link
              to={`/classroom?courseId=${encodeURIComponent(activeMeetings[0].courseId)}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition shadow-xs"
            >
              <Video className="w-4 h-4" aria-hidden="true" />
              Vào phòng học LIVE ({activeMeetings.length})
            </Link>
          )}
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 transition"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Khóa học của tôi
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Khóa học đang học"
          value={data.totalEnrolledCourses}
          subtitle="Nhấn để xem danh mục & ghi danh"
          icon={BookOpen}
          accent="blue"
          to="/courses"
        />
        <KpiCard
          label="Tiến độ bài giảng"
          value={`${data.completedLessons}/${data.totalLessons}`}
          subtitle="Số bài học đã đánh dấu hoàn thành"
          icon={CheckCircle2}
          accent="emerald"
          badge={
            <Badge variant="success" size="sm" className="tabular-nums">
              {completionPct}%
            </Badge>
          }
        />
        <KpiCard
          label="Nhiệm vụ sắp tới"
          value={data.upcomingAssignments + data.availableQuizzes}
          subtitle={`${data.upcomingAssignments} bài tập · ${data.availableQuizzes} trắc nghiệm`}
          icon={CalendarClock}
          accent="amber"
          to="/schedule"
        />
        <KpiCard
          label="GPA tích lũy"
          value={gpaDisplay}
          subtitle={gpaSubtitle}
          icon={Award}
          accent="indigo"
          to="/grades"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[var(--lms-text)]">Tiếp tục học tập</h2>
            </div>
            <Link
              to="/courses"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
            >
              Tất cả khóa học
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          {data.enrolledCourses.length === 0 ? (
            <EmptyState
              icon={<GraduationCap className="w-6 h-6" />}
              title="Chưa ghi danh khóa học nào"
              description="Khám phá danh mục khóa học hoặc nhập mã tham gia để bắt đầu học."
              action={
                <Link
                  to="/courses"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-95 transition"
                >
                  Tìm khóa học
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {data.enrolledCourses.map((course) => {
                const progress = progressByCourse[course.courseId];
                const pct = progress ? Math.round(progress.completionPercent) : 0;
                const liveMeeting = activeMeetings.find((m) => m.courseId === course.courseId);

                return (
                  <div
                    key={course.courseId}
                    className="p-4 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300">
                            {course.courseCode}
                          </span>
                          <span className="text-xs text-[var(--lms-text-muted)] tabular-nums">
                            {course.credits} tín chỉ
                          </span>
                          {liveMeeting && (
                            <Badge variant="success" size="sm" dot>
                              Đang LIVE
                            </Badge>
                          )}
                        </div>
                        <Link
                          to={`/courses/${course.courseId}`}
                          className="text-sm font-bold text-[var(--lms-text)] hover:text-[var(--color-primary)] transition block truncate"
                        >
                          {course.title}
                        </Link>
                        {course.lecturerName && (
                          <div className="text-xs text-[var(--lms-text-muted)] mt-0.5">
                            Giảng viên: {course.lecturerName}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {liveMeeting && (
                          <Link
                            to={`/classroom?courseId=${encodeURIComponent(course.courseId)}`}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition"
                          >
                            Vào lớp
                          </Link>
                        )}
                        <Link
                          to={`/courses/${course.courseId}`}
                          className="px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs font-semibold text-[var(--lms-text)] hover:border-[var(--color-primary)] transition"
                        >
                          Học tiếp
                        </Link>
                      </div>
                    </div>

                    {progress && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-[var(--lms-text-muted)] mb-1 tabular-nums">
                          <span>
                            {progress.completedLessons}/{progress.totalLessons} bài học
                          </span>
                          <span className="font-semibold text-[var(--lms-text)]">{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--lms-border)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="lg:col-span-5 space-y-4">
          <DeadlineFeed events={calendarEvents} title="Deadline & Lịch thi 14 ngày tới" />

          <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-[var(--lms-text)] mb-3">Truy cập nhanh</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                to="/assignments"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)] transition"
              >
                Tất cả bài tập
              </Link>
              <Link
                to="/quizzes"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)] transition"
              >
                Bài trắc nghiệm
              </Link>
              <Link
                to="/grades"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)] transition"
              >
                Bảng điểm & GPA
              </Link>
              <Link
                to="/notifications"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)] flex items-center justify-between transition"
              >
                <span>Thông báo</span>
                {data.unreadNotifications > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 tabular-nums">
                    <Bell className="w-3 h-3" aria-hidden="true" />
                    {data.unreadNotifications}
                  </span>
                )}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
