import React from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AdminDashboardPayload } from '../../api/learning';
import type { Course, Meeting, User } from '../../types';
import { Badge } from '../ui/Badge';
import { KpiCard } from './KpiCard';

export interface AdminDashboardProps {
  user: User;
  data: AdminDashboardPayload;
  courses: Course[];
  activeMeetings: Meeting[];
  healthLabel: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  data,
  courses,
  activeMeetings,
  healthLabel,
}) => {
  const totalCoursesSafe = Math.max(data.totalCourses, 1);
  const activePct = Math.round((data.activeCourses / totalCoursesSafe) * 100);
  const draftPct = Math.round((data.draftCourses / totalCoursesSafe) * 100);
  const archivedPct = Math.max(0, 100 - activePct - draftPct);

  const semesterBuckets = Object.entries(
    courses.reduce<Record<string, number>>((acc, course) => {
      const key = course.semester || 'Khác';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxBucket = Math.max(...semesterBuckets.map(([, count]) => count), 1);

  return (
    <div className="space-y-6">
      <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="info" size="sm">
              Quản trị hệ thống
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              {healthLabel}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--lms-text)] tracking-tight">
            Trung tâm điều hành học vụ — {user.fullName}
          </h1>
          <p className="text-sm text-[var(--lms-text-muted)] mt-1">
            Theo dõi quy mô người dùng, tình trạng học phần, lượt ghi danh và các lớp trực tuyến đang diễn ra.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/users"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 transition"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            Quản lý người dùng
          </Link>
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] text-sm font-semibold text-[var(--lms-text)] hover:border-[var(--color-primary)] transition"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Quản lý khóa học
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Tổng tài khoản"
          value={data.totalUsers}
          subtitle={`${data.totalStudents} sinh viên · ${data.totalLecturers} giảng viên`}
          icon={Users}
          accent="blue"
          to="/users"
        />
        <KpiCard
          label="Tổng số khóa học"
          value={data.totalCourses}
          subtitle={`${data.activeCourses} đang mở · ${data.draftCourses} bản nháp`}
          icon={BookOpen}
          accent="indigo"
          to="/courses"
        />
        <KpiCard
          label="Lượt ghi danh"
          value={data.totalEnrollments}
          subtitle="Tổng đăng ký học phần toàn hệ thống"
          icon={UserCheck}
          accent="emerald"
          to="/courses"
        />
        <KpiCard
          label="Phòng học đang LIVE"
          value={data.activeMeetings}
          subtitle="Phiên trực tuyến đang hoạt động"
          icon={Video}
          accent={data.activeMeetings > 0 ? 'emerald' : 'amber'}
          to="/classroom"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs space-y-6">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
                <h2 className="text-base font-bold text-[var(--lms-text)]">
                  Phân bố trạng thái khóa học
                </h2>
              </div>
              <span className="text-xs text-[var(--lms-text-muted)] tabular-nums">
                Tổng {data.totalCourses} học phần
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-[var(--lms-surface-muted)] overflow-hidden flex">
              {data.activeCourses > 0 && (
                <div
                  className="bg-emerald-500 h-full"
                  style={{ width: `${activePct}%` }}
                  title={`Đang mở: ${data.activeCourses}`}
                />
              )}
              {data.draftCourses > 0 && (
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${draftPct}%` }}
                  title={`Bản nháp: ${data.draftCourses}`}
                />
              )}
              {data.archivedCourses > 0 && (
                <div
                  className="bg-slate-400 dark:bg-slate-600 h-full"
                  style={{ width: `${archivedPct}%` }}
                  title={`Lưu trữ: ${data.archivedCourses}`}
                />
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="p-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40">
                <div className="text-xs text-[var(--lms-text-muted)]">Đang hoạt động</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                  {data.activeCourses}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40">
                <div className="text-xs text-[var(--lms-text-muted)]">Bản nháp</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                  {data.draftCourses}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40">
                <div className="text-xs text-[var(--lms-text-muted)]">Lưu trữ</div>
                <div className="text-lg font-bold text-[var(--lms-text)] tabular-nums mt-0.5">
                  {data.archivedCourses}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--lms-text)] mb-3">
              Khóa học theo học kỳ
            </h3>
            {semesterBuckets.length === 0 ? (
              <p className="text-sm text-[var(--lms-text-muted)]">Chưa có dữ liệu khóa học.</p>
            ) : (
              <div className="space-y-2.5">
                {semesterBuckets.map(([semester, count]) => (
                  <div key={semester} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--lms-text)]">{semester}</span>
                      <span className="text-[var(--lms-text-muted)] tabular-nums">
                        {count} khóa học
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--lms-surface-muted)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)]"
                        style={{ width: `${Math.round((count / maxBucket) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="lg:col-span-5 space-y-4">
          <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-[var(--lms-text)]">Phòng học trực tuyến</h2>
            </div>

            {activeMeetings.length === 0 ? (
              <p className="text-sm text-[var(--lms-text-muted)]">
                Hiện không có phòng học trực tuyến nào đang mở.
              </p>
            ) : (
              <div className="space-y-2">
                {activeMeetings.slice(0, 4).map((meeting) => (
                  <Link
                    key={meeting.meetingId}
                    to={`/classroom?courseId=${encodeURIComponent(meeting.courseId)}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 hover:border-emerald-500/40 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--lms-text)] truncate">
                        {meeting.title}
                      </div>
                      <div className="text-xs text-[var(--lms-text-muted)] truncate">
                        {meeting.courseCode || 'Lớp học'} · {meeting.participantCount} người tham gia
                      </div>
                    </div>
                    <Badge variant="success" size="sm" dot>
                      LIVE
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs space-y-2.5">
            <h2 className="text-sm font-bold text-[var(--lms-text)]">Phím tắt quản trị</h2>
            <Link
              to="/users"
              className="flex items-center justify-between p-3 rounded-xl border border-[var(--lms-border)] hover:border-blue-500/40 transition"
            >
              <span className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--lms-text)]">
                <Users className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
                Tạo & nhập CSV tài khoản người dùng
              </span>
              <ChevronRight className="w-4 h-4 text-[var(--lms-text-muted)]" aria-hidden="true" />
            </Link>
            <Link
              to="/courses"
              className="flex items-center justify-between p-3 rounded-xl border border-[var(--lms-border)] hover:border-blue-500/40 transition"
            >
              <span className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--lms-text)]">
                <BookOpen className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
                Mở học phần & phân công giảng viên
              </span>
              <ChevronRight className="w-4 h-4 text-[var(--lms-text-muted)]" aria-hidden="true" />
            </Link>
            <Link
              to="/schedule"
              className="flex items-center justify-between p-3 rounded-xl border border-[var(--lms-border)] hover:border-blue-500/40 transition"
            >
              <span className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--lms-text)]">
                <CalendarDays className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
                Lịch kiểm tra & deadline toàn trường
              </span>
              <ChevronRight className="w-4 h-4 text-[var(--lms-text-muted)]" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
};
