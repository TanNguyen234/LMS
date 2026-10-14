import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Users,
  FileText,
  CheckSquare,
  Award,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
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
        const statsData = await api.getDashboardStats();
        setStats(statsData);

        const coursesData = await api.getCourses();
        setCourses(coursesData.slice(0, 4));

        if (coursesData.length > 0) {
          const firstCourseAssignments = await api.getCourseAssignments(coursesData[0].id);
          setAssignments(firstCourseAssignments.slice(0, 3));
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

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-blue-500/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-blue-100 backdrop-blur-xs mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Học kỳ Fall 2026 • Phân hệ {user?.role}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Xin chào, {user?.full_name}! 👋
            </h1>
            <p className="text-blue-100 text-sm mt-1 max-w-xl">
              Chào mừng bạn quay lại Hệ thống LMS Đại học. Dưới đây là tóm tắt tiến độ và các đầu việc cần xử lý.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/courses"
              className="px-4 py-2.5 bg-white text-blue-700 hover:bg-blue-50 font-semibold text-sm rounded-xl shadow-xs transition inline-flex items-center space-x-2 shrink-0"
            >
              <span>{user?.role === 'STUDENT' ? 'Khóa học của tôi' : 'Quản lý khóa học'}</span>
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
                <span className="text-2xl font-bold text-slate-800">{stats?.courses_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Khóa học đang vận hành</span>
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
                <span className="text-2xl font-bold text-slate-800">{stats?.students_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Tài khoản sinh viên active</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Giảng viên</span>
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.lecturers_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Giảng viên cơ hữu</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Trạng thái hạ tầng</span>
                <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-sm font-bold text-emerald-600 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  100% Hoạt động bình thường
                </span>
                <span className="text-xs text-slate-400 block mt-1.5">SQL Server & FastAPI online</span>
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
                <span className="text-2xl font-bold text-slate-800">{stats?.courses_count ?? 0}</span>
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
                <span className="text-2xl font-bold text-amber-600">{stats?.pending_submissions_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Cần chấm điểm & phản hồi</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Bài kiểm tra Quiz</span>
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
                <span className="text-2xl font-bold text-slate-800">{stats?.students_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Sinh viên theo học các lớp</span>
              </div>
            </div>
          </>
        )}

        {user?.role === 'STUDENT' && (
          <>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Khóa học đăng ký</span>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-800">{stats?.courses_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Lớp học phần đang tham gia</span>
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
                <span className="text-2xl font-bold text-amber-600">{stats?.upcoming_assignments_count ?? 0}</span>
                <span className="text-xs text-slate-400 block mt-0.5">Bài tập sắp tới hạn</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Quiz trực tuyến</span>
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

      {/* Grid Content: Courses & Quick Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Course Overview */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {user?.role === 'STUDENT' ? 'Khóa học của bạn' : 'Danh sách khóa học tiêu biểu'}
              </h2>
              <p className="text-xs text-slate-400">Các môn học được phân bổ trong học kỳ này</p>
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
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-100 text-blue-700">
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

        {/* Right Sidebar: Recent Tasks / Announcements */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-800 mb-1">Đầu việc cần chú ý</h2>
            <p className="text-xs text-slate-400 mb-4">Các deadline và thông báo mới nhất</p>

            <div className="space-y-3">
              {assignments.length > 0 ? (
                assignments.map((a) => (
                  <div key={a.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-semibold text-slate-800 line-clamp-1">{a.title}</span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0 ml-2">
                        {a.max_score} đ
                      </span>
                    </div>
                    <div className="flex items-center text-[11px] text-slate-400 mt-1.5 space-x-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Hạn: {new Date(a.due_date).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-400">Không có bài tập gấp cần xử lý.</div>
              )}
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-xs">
            <h3 className="text-sm font-bold mb-2">Thao tác nhanh</h3>
            <div className="space-y-2">
              <Link
                to="/assignments"
                className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
              >
                <span>{user?.role === 'LECTURER' ? 'Chấm điểm bài nộp sinh viên' : 'Xem danh sách bài tập'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                to="/quizzes"
                className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
              >
                <span>{user?.role === 'LECTURER' ? 'Tạo câu hỏi trắc nghiệm' : 'Làm bài kiểm tra'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                to="/grades"
                className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium"
              >
                <span>{user?.role === 'LECTURER' ? 'Sổ điểm lớp học phần' : 'Xem bảng điểm cá nhân'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
