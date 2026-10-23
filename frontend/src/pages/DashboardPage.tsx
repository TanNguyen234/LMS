import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Bell, BookOpen, CalendarDays, CheckSquare, ClipboardList,
  Clock3, FileText, GraduationCap, RefreshCw, Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { Course, DashboardStats, StudentWorkloadItem } from '../types';

const number = (value?: number) => value ?? 0;

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [work, setWork] = useState<StudentWorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    let live = true;
    Promise.all([
      api.getDashboardStats(user.role),
      api.getCourses(),
      user.role === 'STUDENT' ? api.getStudentWorkload() : Promise.resolve(null),
    ]).then(([nextStats, nextCourses, workload]) => {
      if (!live) return;
      setStats(nextStats);
      setCourses(nextCourses);
      setWork(workload?.items ?? []);
      setError(null);
    }).catch((err: unknown) => {
      if (live) setError(err instanceof Error ? err.message : 'Không thể tải tổng quan.');
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [user?.id, user?.role, refresh]);

  const now = Date.now();
  const outstanding = work
    .filter((item) => {
      if (item.kind === 'ASSIGNMENT') {
        if (item.submittedAt || item.status === 'CLOSED') return false;
        return Date.parse(item.dueAt) >= now || item.allowLate;
      }
      return Date.parse(item.dueAt) >= now && (
        item.inProgress || ((item.submittedAttempts ?? 0) === 0 && (item.attemptsUsed ?? 0) < (item.maxAttempts ?? 1))
      );
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 4);

  const metrics = user?.role === 'ADMIN'
    ? [
      { label: 'Tổng học phần', value: number(stats?.courses_count), Icon: BookOpen, detail: 'Theo dữ liệu hệ thống' },
      { label: 'Sinh viên', value: number(stats?.students_count), Icon: GraduationCap, detail: 'Tài khoản đã đăng ký' },
      { label: 'Giảng viên', value: number(stats?.lecturers_count), Icon: Users, detail: 'Tài khoản giảng dạy' },
      { label: 'Thông báo gần đây', value: stats?.recent_notifications.length ?? 0, Icon: Bell, detail: 'Tối đa 5 thông báo mới nhất' },
    ]
    : user?.role === 'LECTURER'
    ? [
      { label: 'Học phần phụ trách', value: number(stats?.courses_count), Icon: BookOpen, detail: 'Theo phân công' },
      { label: 'Sinh viên đang học', value: number(stats?.students_count), Icon: Users, detail: 'Trong các lớp phụ trách' },
      { label: 'Bài nộp chờ chấm', value: number(stats?.pending_submissions_count), Icon: ClipboardList, detail: 'Cần nhận xét và chấm điểm' },
      { label: 'Thông báo gần đây', value: stats?.recent_notifications.length ?? 0, Icon: Bell, detail: 'Tối đa 5 thông báo mới nhất' },
    ]
    : [
      { label: 'Học phần đang học', value: number(stats?.courses_count), Icon: BookOpen, detail: 'Đăng ký còn hiệu lực' },
      { label: 'Bài chưa nộp sắp hạn', value: number(stats?.upcoming_assignments_count), Icon: Clock3, detail: 'Do máy chủ thống kê' },
      { label: 'Quiz được xuất bản', value: number(stats?.quizzes_count), Icon: CheckSquare, detail: 'Còn trong thời gian mở/đến hạn' },
      { label: 'Thông báo gần đây', value: stats?.recent_notifications.length ?? 0, Icon: Bell, detail: 'Tối đa 5 thông báo mới nhất' },
    ];

  const links = user?.role === 'ADMIN'
    ? [{ path: '/insights', label: 'Phân tích vận hành', Icon: BookOpen }, { path: '/users', label: 'Quản lý tài khoản', Icon: Users }, { path: '/courses', label: 'Quản lý học phần', Icon: BookOpen }]
    : user?.role === 'LECTURER'
    ? [{ path: '/insights', label: 'Bàn làm việc giảng viên', Icon: ClipboardList }, { path: '/assignments', label: 'Chấm bài nộp', Icon: ClipboardList }, { path: '/quizzes', label: 'Quản lý quiz', Icon: CheckSquare }, { path: '/grades', label: 'Bảng điểm', Icon: FileText }]
    : [{ path: '/insights', label: 'Phân tích kết quả', Icon: CalendarDays }, { path: '/study-plan', label: 'Xem kế hoạch học tập', Icon: CalendarDays }, { path: '/assignments', label: 'Nộp bài tập', Icon: ClipboardList }, { path: '/grades', label: 'Xem kết quả', Icon: FileText }];

  const reload = () => { setLoading(true); setRefresh((value) => value + 1); };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 p-7 text-white sm:p-9">
        <div className="absolute -right-10 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-sky-300">University LMS / Tổng quan</span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Chào mừng, {user?.full_name}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              {user?.role === 'STUDENT'
                ? 'Bài học, thời hạn và kết quả trong một nơi — được cập nhật từ các học phần của bạn.'
                : user?.role === 'LECTURER'
                ? 'Nắm nhanh tình hình lớp học, bài nộp đang chờ xử lý và thông báo mới.'
                : 'Tổng quan người dùng, học phần và công việc quản trị của hệ thống.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={reload} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Làm mới</button>
            <Link to={user?.role === 'STUDENT' ? '/study-plan' : '/courses'} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
              {user?.role === 'STUDENT' ? 'Kế hoạch học tập' : 'Xem học phần'} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>Không thể tải tổng quan: {error}</span><button onClick={reload} className="font-semibold underline">Thử lại</button></div>}
      {loading ? (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500">Đang tải dữ liệu tổng quan...</div>
      ) : !error && (
        <>
          <section aria-label="Chỉ số tổng quan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map(({ label, value, Icon, detail }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-start justify-between gap-3 text-slate-500">
                  <span className="text-xs font-semibold">{label}</span>
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-600"><Icon className="h-4 w-4" /></div>
                </div>
                <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              {user?.role === 'STUDENT' && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div><h2 className="font-bold text-slate-900">Ưu tiên sắp tới</h2><p className="mt-1 text-xs text-slate-500">Bài tập và quiz chưa hoàn tất, sắp xếp theo hạn</p></div>
                    <Link to="/study-plan" className="shrink-0 text-xs font-semibold text-blue-600 hover:underline">Xem kế hoạch →</Link>
                  </div>
                  {outstanding.length ? <div className="space-y-2">
                    {outstanding.map((item) => (
                      <Link key={`${item.kind}-${item.id}`} to={item.kind === 'ASSIGNMENT' ? `/assignments?course=${encodeURIComponent(item.courseId)}` : `/quizzes?course=${encodeURIComponent(item.courseId)}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-blue-50/30">
                        <div className="min-w-0"><span className="text-[11px] font-semibold text-blue-600">{item.courseCode} · {item.kind === 'ASSIGNMENT' ? 'Bài tập' : 'Quiz'}</span><p className="truncate text-sm font-semibold text-slate-800">{item.title}</p></div>
                        <span className="shrink-0 text-right text-[11px] text-slate-500">{new Date(item.dueAt).toLocaleDateString('vi-VN')}<ArrowRight className="ml-auto mt-1 h-3.5 w-3.5" /></span>
                      </Link>
                    ))}
                  </div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Không có công việc đang chờ trong các học phần hiện tại.</p>}
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div><h2 className="font-bold text-slate-900">{user?.role === 'STUDENT' ? 'Học phần của bạn' : 'Học phần gần đây'}</h2><p className="mt-1 text-xs text-slate-500">Mở học phần để xem nội dung và hoạt động</p></div>
                  <Link to="/courses" className="text-xs font-semibold text-blue-600 hover:underline">Tất cả →</Link>
                </div>
                {courses.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {courses.slice(0, 4).map((course) => (
                    <Link key={course.id} to={`/courses/${course.id}`} className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-blue-300 hover:bg-blue-50/40">
                      <div><span className="rounded-lg bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700">{course.code}</span><h3 className="mt-3 line-clamp-2 text-sm font-bold text-slate-900 group-hover:text-blue-700">{course.title}</h3><p className="mt-1 line-clamp-2 text-xs text-slate-500">{course.description || 'Chưa có mô tả học phần'}</p></div>
                      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">Mở học phần <ArrowRight className="h-3.5 w-3.5" /></span>
                    </Link>
                  ))}
                </div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Chưa có học phần phù hợp với tài khoản hiện tại.</p>}
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-bold text-slate-900">Thao tác nhanh</h2>
                <div className="mt-4 space-y-2">
                  {links.map(({ path, label, Icon }) => (
                    <Link key={path} to={path} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700">
                      <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span><ArrowRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Thông báo</h2><Link to="/notifications" className="text-xs font-semibold text-blue-600 hover:underline">Xem tất cả →</Link></div>
                {stats?.recent_notifications.length ? <div className="mt-3 divide-y divide-slate-100">
                  {stats.recent_notifications.slice(0, 4).map((notification) => (
                    <div key={notification.id} className="py-3"><p className="text-sm font-semibold text-slate-800">{notification.title}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{notification.message}</p></div>
                  ))}
                </div> : <p className="mt-4 text-sm text-slate-500">Chưa có thông báo gần đây.</p>}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
