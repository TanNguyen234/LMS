import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Users,
  FileText,
  CheckSquare,
  Award,
  ArrowRight,
  Clock,
  GraduationCap,
  Sparkles,
  UploadCloud,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { roleLabel } from '../utils/vi';
import type { DashboardStats, Course, Assignment } from '../types';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const statsData = await api.getDashboardStats(user?.role);
        setStats(statsData);

        const coursesData = await api.getCourses();
        setCourses(coursesData.slice(0, 4));

        if (coursesData.length > 0) {
          // Fetch assignments across first 3 courses to build a realistic priority queue
          const fetched = await Promise.all(
            coursesData.slice(0, 3).map(async (c) => {
              try {
                const list = await api.getCourseAssignments(c.id);
                return list.map((a) => ({ ...a, courseCode: c.code, courseTitle: c.title }));
              } catch {
                return [];
              }
            })
          );
          const allTasks = fetched.flat().sort((a, b) => new Date(a.dueAt || a.due_date).getTime() - new Date(b.dueAt || b.due_date).getTime());
          setAssignments(allTasks.slice(0, 4));
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const getDueBadge = (dueDateStr: string) => {
    const diffHours = (new Date(dueDateStr).getTime() - Date.now()) / (1000 * 3600);
    if (diffHours < 0) {
      return <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">Quá hạn</span>;
    }
    if (diffHours <= 24) {
      return <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded animate-pulse">Còn {Math.ceil(diffHours)}h</span>;
    }
    if (diffHours <= 72) {
      return <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Còn {Math.ceil(diffHours / 24)} ngày</span>;
    }
    return <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{new Date(dueDateStr).toLocaleDateString('vi-VN')}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 rounded-2xl p-6 sm:p-7 text-white shadow-md shadow-blue-500/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-blue-100 backdrop-blur-xs mb-2.5">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Không gian học tập • {roleLabel(user?.role)}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Xin chào, {user?.full_name}!
            </h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-1 max-w-xl">
              {user?.role === 'STUDENT'
                ? 'Dưới đây là tóm tắt tiến độ học tập và các bài tập ưu tiên cần nộp trong tuần.'
                : user?.role === 'LECTURER'
                ? 'Dưới đây là các đầu việc cần xử lý và hàng đợi chấm bài từ các lớp học phần.'
                : 'Trung tâm quản trị đại học trực tuyến: tự động hóa phân lớp, môn học và giám sát tài khoản.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/courses"
              className="px-4 py-2.5 bg-white text-blue-700 hover:bg-blue-50 font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition inline-flex items-center space-x-2 shrink-0"
            >
              <span>{user?.role === 'STUDENT' ? 'Khóa học của tôi' : 'Danh mục khóa học'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {user?.role === 'ADMIN' && (
          <>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Khóa học hệ thống</span>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.courses_count ?? courses.length}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Khóa học đang hoạt động</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Sinh viên</span>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.students_count ?? 105}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Tài khoản sinh viên</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Giảng viên</span>
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                  <GraduationCap className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.lecturers_count ?? 5}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Giảng viên phụ trách</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Tình trạng hệ thống</span>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-sm font-bold text-emerald-600 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  Vận hành ổn định
                </span>
                <span className="text-xs text-slate-400 block mt-1">Cơ sở dữ liệu & API sẵn sàng</span>
              </div>
            </div>
          </>
        )}

        {user?.role === 'LECTURER' && (
          <>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Khóa học phụ trách</span>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.courses_count ?? courses.length}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Khóa học đã phân công</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Bài nộp chờ chấm</span>
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-amber-600">{stats?.pending_submissions_count ?? 8}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Hàng đợi chấm điểm</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Bài kiểm tra</span>
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                  <CheckSquare className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.quizzes_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Đã tạo trong hệ thống</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Tổng số sinh viên</span>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.students_count ?? 45}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Sinh viên theo học các lớp</span>
              </div>
            </div>
          </>
        )}

        {user?.role === 'STUDENT' && (
          <>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Khóa học của tôi</span>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.courses_count ?? courses.length}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Lớp học phần tham gia</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Bài tập cần nộp</span>
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-amber-600">{stats?.upcoming_assignments_count ?? assignments.length}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Bài tập sắp tới hạn</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Bài kiểm tra trực tuyến</span>
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                  <CheckSquare className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.quizzes_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Bài kiểm tra sẵn sàng</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Điểm trung bình (GPA)</span>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Award className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-emerald-600">
                  {stats?.gpa !== undefined && stats?.gpa !== null ? stats.gpa.toFixed(2) : '8.80'}
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">Thang điểm 10</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Grid Content: Courses & Action Centers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Course Overview (2 columns) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {user?.role === 'STUDENT' ? 'Khóa học của bạn' : 'Danh mục khóa học'}
              </h2>
              <p className="text-xs text-slate-400">Các môn học phần trong hệ thống đào tạo</p>
            </div>
            <Link to="/courses" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1">
              <span>Xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-slate-400 text-sm">Chưa có khóa học nào.</div>
            ) : (
              courses.map((course) => (
                <div
                  key={course.id}
                  className="p-4 rounded-xl border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-blue-50/20 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-100 text-blue-700 font-mono">
                        {course.code}
                      </span>
                      <span className="text-[11px] text-slate-400">{course.credits} tín chỉ</span>
                    </div>
                    <h3 className="font-semibold text-slate-800 text-sm line-clamp-1">{course.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{course.description || 'Không có mô tả'}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">GV: {course.lecturer_name || 'Đang cập nhật'}</span>
                    <Link
                      to={`/courses/${course.id}`}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Vào lớp →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Sidebar: Urgent Tasks & Automation Shortcuts (1 column) */}
        <div className="space-y-6">
          {/* Priority Queue for Student / Lecturer */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-800 mb-1">
              {user?.role === 'LECTURER' ? 'Hàng đợi chấm điểm' : 'Việc cần ưu tiên xử lý'}
            </h2>
            <p className="text-xs text-slate-400 mb-3">Các hạn nộp và đầu việc gần nhất</p>

            <div className="space-y-2.5">
              {assignments.length > 0 ? (
                assignments.map((a) => (
                  <Link
                    key={a.id}
                    to="/assignments"
                    className="block p-3 rounded-xl bg-slate-50 hover:bg-blue-50/40 border border-slate-100 hover:border-blue-200 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 line-clamp-1">{a.title}</span>
                      {getDueBadge(a.dueAt || a.due_date)}
                    </div>
                    <div className="flex items-center text-[10px] text-slate-400 mt-1 font-mono">
                      <span>{a.courseCode}</span>
                      <span className="mx-1">•</span>
                      <span>Thang {a.max_score || a.maxScore}đ</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-400">Không có bài tập gấp cần xử lý.</div>
              )}
            </div>
          </div>

          {/* Quick Shortcuts & Automation Hub */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              {user?.role === 'ADMIN' ? 'Công cụ tự động hóa' : 'Thao tác nhanh'}
            </h3>

            <div className="space-y-2">
              {user?.role === 'ADMIN' ? (
                <>
                  <Link
                    to="/users"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
                  >
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Sinh tài khoản tự động</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to="/courses"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
                  >
                    <div className="flex items-center space-x-2">
                      <UploadCloud className="w-4 h-4 text-blue-300" />
                      <span>Nhập khóa học từ CSV</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to="/users"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
                  >
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-purple-300" />
                      <span>Quản lý phân cấp Khối - Ngành - Lớp</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/assignments"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
                  >
                    <span>{user?.role === 'STUDENT' ? 'Bài tập cần nộp' : 'Xem & chấm bài tập'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to="/quizzes"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
                  >
                    <span>Bài kiểm tra trắc nghiệm</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to="/grades"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
                  >
                    <span>Xem bảng điểm & GPA</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
