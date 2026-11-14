import React from 'react';
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Users,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LecturerDashboardPayload } from '../../api/learning';
import type { CalendarEventItem, CourseStatus, Meeting, User } from '../../types';
import { formatCourseStatus } from '../../utils/formatters';
import { Badge, type BadgeVariant } from '../ui/Badge';

const COURSE_STATUS_BADGE: Record<CourseStatus, BadgeVariant> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  ARCHIVED: 'neutral',
};
import { EmptyState } from '../ui/EmptyState';
import { DeadlineFeed } from './DeadlineFeed';
import { KpiCard } from './KpiCard';

export interface PendingQuizReviewItem {
  quizId: string;
  courseId: string;
  title: string;
  courseCode?: string;
  pendingReviewCount: number;
}

export interface LecturerDashboardProps {
  user: User;
  data: LecturerDashboardPayload;
  pendingQuizItems: PendingQuizReviewItem[];
  calendarEvents: CalendarEventItem[];
  activeMeetings: Meeting[];
}

export const LecturerDashboard: React.FC<LecturerDashboardProps> = ({
  user,
  data,
  pendingQuizItems,
  calendarEvents,
  activeMeetings,
}) => {
  const pendingQuizTotal = pendingQuizItems.reduce(
    (sum, item) => sum + item.pendingReviewCount,
    0,
  );
  const totalGradingQueue = data.totalPendingSubmissions + pendingQuizTotal;

  return (
    <div className="space-y-6">
      <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="primary" size="sm">
              Giảng viên
            </Badge>
            {user.staffCode && (
              <span className="text-xs font-mono text-[var(--lms-text-muted)]">
                MGV: {user.staffCode}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--lms-text)] tracking-tight">
            Bảng điều khiển giảng dạy — {user.fullName}
          </h1>
          <p className="text-sm text-[var(--lms-text-muted)] mt-1">
            Quản lý học liệu, chấm bài tự luận, phê duyệt trắc nghiệm và điều phối lớp học trực tuyến.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/classroom"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
          >
            <Video className="w-4 h-4" aria-hidden="true" />
            Mở phòng học trực tuyến
          </Link>
          <Link
            to="/assignments"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 transition"
          >
            <FileCheck2 className="w-4 h-4" aria-hidden="true" />
            Chấm bài ({totalGradingQueue})
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Khóa học phụ trách"
          value={data.totalCourses}
          subtitle="Xem nội dung & cấu trúc học phần"
          icon={BookOpen}
          accent="blue"
          to="/courses"
        />
        <KpiCard
          label="Sinh viên ghi danh"
          value={data.totalStudents}
          subtitle="Tổng sinh viên đang theo học"
          icon={Users}
          accent="indigo"
        />
        <KpiCard
          label="Hàng chờ chấm điểm"
          value={totalGradingQueue}
          subtitle={`${data.totalPendingSubmissions} bài nộp · ${pendingQuizTotal} tự luận quiz`}
          icon={ClipboardList}
          accent={totalGradingQueue > 0 ? 'amber' : 'emerald'}
          to="/assignments"
          badge={
            totalGradingQueue > 0 ? (
              <Badge variant="warning" size="sm" className="tabular-nums">
                Cần chấm
              </Badge>
            ) : undefined
          }
        />
        <KpiCard
          label="Bài trắc nghiệm & LIVE"
          value={`${data.totalQuizzes} / ${data.activeMeetings}`}
          subtitle={`${data.totalQuizzes} đề quiz · ${data.activeMeetings} phòng đang mở`}
          icon={ClipboardCheck}
          accent="emerald"
          to="/quizzes"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
                <h2 className="text-base font-bold text-[var(--lms-text)]">Khóa học đang phụ trách</h2>
              </div>
              <Link
                to="/courses"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
              >
                Quản lý khóa học
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>

            {data.recentCourses.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-6 h-6" />}
                title="Chưa được phân công khóa học"
                description="Liên hệ quản trị viên để tạo mới hoặc nhận phân công giảng dạy."
              />
            ) : (
              <div className="divide-y divide-[var(--lms-border)]">
                {data.recentCourses.map((course) => {
                  const statusLabel = formatCourseStatus(course.status);
                  const live = activeMeetings.find((m) => m.courseId === course.courseId);
                  return (
                    <div
                      key={course.courseId}
                      className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300">
                            {course.courseCode}
                          </span>
                          <Badge
                            variant={COURSE_STATUS_BADGE[course.status] ?? 'neutral'}
                            size="sm"
                          >
                            {statusLabel}
                          </Badge>
                          {course.joinCode && (
                            <span className="text-xs font-mono text-[var(--lms-text-muted)]">
                              Mã tham gia: {course.joinCode}
                            </span>
                          )}
                        </div>
                        <Link
                          to={`/courses/${course.courseId}`}
                          className="text-sm font-bold text-[var(--lms-text)] hover:text-[var(--color-primary)] transition block truncate"
                        >
                          {course.title}
                        </Link>
                        <div className="text-xs text-[var(--lms-text-muted)] mt-0.5">
                          {course.credits} tín chỉ · Học kỳ {course.semester || 'Hiện tại'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          to={`/classroom?courseId=${encodeURIComponent(course.courseId)}`}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            live
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'border border-[var(--lms-border)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
                          }`}
                        >
                          {live ? 'Đang LIVE' : 'Phòng học'}
                        </Link>
                        <Link
                          to={`/courses/${course.courseId}`}
                          className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold hover:opacity-95 transition"
                        >
                          Chi tiết
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-bold text-[var(--lms-text)]">
                Hàng chờ chấm câu tự luận Quiz ({pendingQuizTotal})
              </h2>
              <Link
                to="/quizzes"
                className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
              >
                Mở module trắc nghiệm
              </Link>
            </div>
            {pendingQuizItems.length === 0 ? (
              <p className="text-sm text-[var(--lms-text-muted)]">
                Không có lượt thi trắc nghiệm nào đang ở trạng thái chờ chấm tay.
              </p>
            ) : (
              <div className="space-y-2">
                {pendingQuizItems.map((item) => (
                  <Link
                    key={item.quizId}
                    to={`/courses/${item.courseId}/quizzes/${item.quizId}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-amber-500/50 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--lms-text)] truncate">
                        {item.title}
                      </div>
                      {item.courseCode && (
                        <div className="text-xs font-mono text-[var(--lms-text-muted)]">
                          {item.courseCode}
                        </div>
                      )}
                    </div>
                    <Badge variant="warning" size="sm" className="tabular-nums">
                      {item.pendingReviewCount} chờ chấm
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <DeadlineFeed
            events={calendarEvents}
            title="Lịch đóng bài tập & Kiểm tra"
            emptyDescription="Chưa có hạn đóng bài tập hoặc lịch họp lớp trong 14 ngày tới."
          />

          <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-[var(--lms-text)] mb-3">Thao tác giảng dạy</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                to="/assignments"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)]"
              >
                Quản lý bài tập
              </Link>
              <Link
                to="/quizzes"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)]"
              >
                Ngân hàng đề & Quiz
              </Link>
              <Link
                to="/grades"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)]"
              >
                Sổ điểm tổng hợp
              </Link>
              <Link
                to="/schedule"
                className="px-3 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-blue-500/40 text-xs font-semibold text-[var(--lms-text)]"
              >
                Lịch trình giảng dạy
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
