import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Archive,
  ArrowRight,
  X,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { Course, User } from '../types';

export const CoursesPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lecturers, setLecturers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New course form state
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCredits, setNewCredits] = useState(3);
  const [selectedLecturerId, setSelectedLecturerId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const data = await api.getCourses(statusFilter === 'ALL' ? undefined : statusFilter);
      setCourses(data);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách khóa học.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [statusFilter]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api.getUsers('LECTURER', true).then((lecs) => {
        setLecturers(lecs);
        if (lecs.length > 0) setSelectedLecturerId(String(lecs[0].id));
      }).catch(console.error);
    }
  }, [user]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const lecturerId = user?.role === 'LECTURER' ? user.id : selectedLecturerId;
      const created = await api.createCourse({
        code: newCode.toUpperCase().trim(),
        title: newTitle.trim(),
        description: newDesc.trim(),
        credits: Number(newCredits),
        lecturer_id: lecturerId,
      });
      setCourses((prev) => [created, ...prev]);
      setIsModalOpen(false);
      // Reset form
      setNewCode('');
      setNewTitle('');
      setNewDesc('');
      setNewCredits(3);
    } catch (err: any) {
      alert('Lỗi tạo khóa học: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCourses = courses.filter((c) => {
    const q = search.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Đang mở
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3.5 h-3.5 mr-1" /> Bản nháp
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            <Archive className="w-3.5 h-3.5 mr-1" /> Đã lưu trữ
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {user?.role === 'STUDENT' ? 'Khóa học của tôi & Chương trình đào tạo' : 'Quản lý Khóa học & Học phần'}
          </h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Theo dõi đề cương, tài liệu và tiến độ học tập của các môn học phần'
              : 'Quản lý danh mục khóa học, đề cương môn học và phân công giảng viên'}
          </p>
        </div>

        {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-xs transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm khóa học mới</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm mã môn học, tên môn..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
        </div>

        {user?.role !== 'STUDENT' && (
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang mở (Active)</option>
              <option value="PUBLISHED">Đang mở (Published)</option>
              <option value="DRAFT">Bản nháp (Draft)</option>
              <option value="ARCHIVED">Đã lưu trữ (Archived)</option>
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Courses Cards Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Đang tải danh sách khóa học...</p>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">Chưa tìm thấy khóa học nào</h3>
          <p className="text-sm text-slate-400 mt-1">Vui lòng điều chỉnh bộ lọc hoặc tạo khóa học mới.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                    {c.code}
                  </span>
                  {getStatusBadge(c.status)}
                </div>

                <h2 className="font-bold text-slate-800 text-base group-hover:text-blue-600 transition line-clamp-2">
                  <Link to={`/courses/${c.id}`}>{c.title}</Link>
                </h2>

                <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                  {c.description || 'Chưa có đề cương chi tiết.'}
                </p>
              </div>

              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-1.5">
                  <GraduationCap className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-slate-600">{c.credits} tín chỉ</span>
                </div>

                <Link
                  to={`/courses/${c.id}`}
                  className="font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1 group-hover:translate-x-0.5 transition"
                >
                  <span>Chi tiết</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Tạo khóa học mới</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Mã môn học</label>
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    placeholder="CS101"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Số tín chỉ</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={newCredits}
                    onChange={(e) => setNewCredits(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Tên môn học</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Nhập môn Lập trình Web"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Mô tả tóm tắt</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Mô tả mục tiêu, kiến thức và chuẩn đầu ra môn học..."
                />
              </div>

              {user?.role === 'ADMIN' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Phân công giảng viên</label>
                  <select
                    value={selectedLecturerId}
                    onChange={(e) => setSelectedLecturerId(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  >
                    {lecturers.map((lec) => (
                      <option key={lec.id} value={lec.id}>
                        {lec.full_name} ({lec.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang tạo...' : 'Lưu khóa học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
