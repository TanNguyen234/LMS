import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Archive,
  ArrowRight,
  X,
  AlertCircle,
  GraduationCap,
  Pencil,
  UploadCloud,
  Download,
  FileSpreadsheet,
  Check,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { Course, User, BulkImportResult } from '../types';

export const CoursesPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lecturers, setLecturers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New course form state
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCredits, setNewCredits] = useState(3);
  const [selectedLecturerId, setSelectedLecturerId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Bulk Import Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);

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

  const resetCourseForm = () => {
    setNewCode('');
    setNewTitle('');
    setNewDesc('');
    setNewCredits(3);
    setEditingCourse(null);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const lecturerId = user?.role === 'LECTURER' ? user.id : selectedLecturerId;
      if (editingCourse) {
        await api.updateCourse(editingCourse.id, {
          title: newTitle.trim(),
          description: newDesc.trim(),
          credits: Number(newCredits),
          lecturer_id: lecturerId,
        });
      } else {
        await api.createCourse({
          code: newCode.toUpperCase().trim(),
          title: newTitle.trim(),
          description: newDesc.trim(),
          credits: Number(newCredits),
          lecturer_id: lecturerId,
        });
      }
      await fetchCourses();
      setIsModalOpen(false);
      resetCourseForm();
    } catch (err: any) {
      alert((editingCourse ? 'Lỗi cập nhật khóa học: ' : 'Lỗi tạo khóa học: ') + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleArchive = async (course: Course) => {
    const status = course.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
    try {
      await api.updateCourse(course.id, { status });
      await fetchCourses();
    } catch (err: any) {
      alert('Lỗi cập nhật trạng thái khóa học: ' + err.message);
    }
  };

  const handleBulkImportCourses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) {
      alert('Vui lòng chọn tệp CSV danh sách khóa học.');
      return;
    }
    setBulkSubmitting(true);
    setBulkResult(null);
    try {
      const result = await api.bulkImportCoursesCsv(bulkFile);
      setBulkResult(result);
      await fetchCourses();
    } catch (err: any) {
      alert('Lỗi nhập danh sách khóa học: ' + err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleExportCoursesCsv = () => {
    if (filteredCourses.length === 0) {
      alert('Không có khóa học nào để xuất.');
      return;
    }
    const headers = ['CourseCode', 'Title', 'Description', 'Credits', 'LecturerName', 'Status'];
    const rows = filteredCourses.map((c) => [
      `"${c.code}"`,
      `"${c.title}"`,
      `"${(c.description || '').replace(/"/g, '""')}"`,
      c.credits,
      `"${c.lecturer_name || ''}"`,
      `"${c.status}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `danh_sach_khoa_hoc_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredCourses = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter((c) => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [courses, search]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Đang mở
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700">
            <Clock className="w-3 h-3 mr-1" /> Bản nháp
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600">
            <Archive className="w-3 h-3 mr-1" /> Đã lưu trữ
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Automated Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {user?.role === 'STUDENT' ? 'Khóa học của tôi' : 'Quản lý Khóa học & Học phần'}
          </h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Theo dõi đề cương, tài liệu và tiến độ học tập của các môn học phần'
              : 'Quản lý chương trình đào tạo, phân công giảng viên và tự động hóa danh mục môn học'}
          </p>
        </div>

        {user?.role === 'ADMIN' && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/sample_courses_bulk_import.csv"
              download
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              title="Tải tệp CSV môn học mẫu kèm giảng viên phân công sẵn"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Tải mẫu CSV</span>
            </a>

            <button
              onClick={() => {
                setBulkFile(null);
                setBulkResult(null);
                setIsBulkModalOpen(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-xl transition"
              title="Nhập hàng loạt 50+ môn học của học kỳ trong 2 giây"
            >
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              <span>Nhập môn học từ CSV</span>
            </button>

            <button
              onClick={handleExportCoursesCsv}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              title="Xuất danh sách khóa học"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              <span>Xuất CSV</span>
            </button>

            <button
              onClick={() => { resetCourseForm(); setIsModalOpen(true); }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm môn học</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm mã môn, tên môn học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
        </div>

        {user?.role !== 'STUDENT' && (
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'ACTIVE', label: 'Đang mở' },
              { id: 'DRAFT', label: 'Bản nháp' },
              { id: 'ARCHIVED', label: 'Đã lưu trữ' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setStatusFilter(chip.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  statusFilter === chip.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
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
          <p className="text-xs text-slate-400">Đang tải danh sách khóa học...</p>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Chưa tìm thấy khóa học nào</h3>
          <p className="text-xs text-slate-400 mt-1">Vui lòng điều chỉnh bộ lọc hoặc nạp danh mục khóa học từ CSV.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCourses.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-100 font-mono">
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

                <div className="flex items-center gap-3">
                  {user?.role === 'ADMIN' && (
                    <>
                      <button
                        onClick={() => {
                          setEditingCourse(c);
                          setNewCode(c.code);
                          setNewTitle(c.title);
                          setNewDesc(c.description || '');
                          setNewCredits(Number(c.credits));
                          setSelectedLecturerId(String(c.lecturer_id || c.lecturerId));
                          setIsModalOpen(true);
                        }}
                        className="font-semibold text-slate-600 hover:text-blue-600 inline-flex items-center gap-1"
                        aria-label={`Sửa khóa học ${c.code}`}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Sửa
                      </button>
                      <button
                        onClick={() => handleToggleArchive(c)}
                        className="font-semibold text-slate-600 hover:text-amber-700"
                      >
                        {c.status === 'ARCHIVED' ? 'Mở lại' : 'Lưu trữ'}
                      </button>
                    </>
                  )}
                  <Link
                    to={`/courses/${c.id}`}
                    className="font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1 group-hover:translate-x-0.5 transition"
                  >
                    <span>Vào lớp</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Single Create / Edit Course */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editingCourse ? 'Cập nhật thông tin khóa học' : 'Tạo khóa học mới'}
              </h3>
              <button onClick={() => { setIsModalOpen(false); resetCourseForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveCourse} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Mã môn học</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingCourse}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="CS101"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold uppercase disabled:bg-slate-50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Số tín chỉ</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={newCredits}
                    onChange={(e) => setNewCredits(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tên môn học</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Cấu trúc dữ liệu và giải thuật"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              {user?.role === 'ADMIN' && (
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Giảng viên phụ trách</label>
                  <select
                    value={selectedLecturerId}
                    onChange={(e) => setSelectedLecturerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    {lecturers.map((lec) => (
                      <option key={lec.id} value={lec.id}>
                        {lec.full_name} ({lec.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Mô tả học phần</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Mô tả nội dung, mục tiêu chuẩn đầu ra của môn học..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); resetCourseForm(); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingCourse ? 'Lưu thay đổi' : 'Tạo khóa học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Bulk Course Import */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">Nhập danh mục khóa học từ CSV</h3>
              <button onClick={() => setIsBulkModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleBulkImportCourses} className="space-y-4 mt-4 text-xs">
              <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-5 bg-slate-50/50 hover:bg-indigo-50/20 transition text-center">
                <input
                  type="file"
                  id="bulkCourseFileInput"
                  className="hidden"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setBulkFile(e.target.files[0]);
                      setBulkResult(null);
                    }
                  }}
                />

                {bulkFile ? (
                  <div className="bg-white p-3 rounded-xl border border-indigo-200 flex items-center justify-between shadow-2xs">
                    <div className="text-left min-w-0">
                      <p className="font-bold text-slate-800 truncate">{bulkFile.name}</p>
                      <p className="text-slate-400">{(bulkFile.size / 1024).toFixed(1)} KB • Sẵn sàng nạp</p>
                    </div>
                    <label
                      htmlFor="bulkCourseFileInput"
                      className="cursor-pointer px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                    >
                      Đổi tệp
                    </label>
                  </div>
                ) : (
                  <label htmlFor="bulkCourseFileInput" className="cursor-pointer block">
                    <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                    <p className="font-bold text-slate-700">Nhấn để chọn tệp CSV khóa học từ máy tính</p>
                    <p className="text-slate-400 mt-1">Cột hỗ trợ: CourseCode, Title, Description, Credits, LecturerEmail, Semester, AcademicYear</p>
                  </label>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-xl text-slate-600 space-y-1">
                <div className="font-semibold text-slate-700 flex items-center justify-between">
                  <span>Quy cách tệp CSV chuẩn:</span>
                  <a
                    href="/sample_courses_bulk_import.csv"
                    download
                    className="text-indigo-600 hover:underline inline-flex items-center space-x-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải mẫu</span>
                  </a>
                </div>
                <p>• Nếu mã môn học đã tồn tại, hệ thống sẽ tự động cập nhật tên, mô tả và giảng viên.</p>
                <p>• Email giảng viên cần khớp với tài khoản Giảng viên đã có trong hệ thống.</p>
              </div>

              {bulkResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Nhập danh mục khóa học thành công!</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-slate-400 text-[10px]">Đã xử lý</div>
                      <div className="text-sm font-bold text-slate-800">{bulkResult.totalProcessed}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-slate-400 text-[10px]">Tạo mới</div>
                      <div className="text-sm font-bold text-emerald-600">+{bulkResult.createdCount}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-slate-400 text-[10px]">Cập nhật</div>
                      <div className="text-sm font-bold text-blue-600">{bulkResult.updatedCount}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting || !bulkFile}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{bulkSubmitting ? 'Đang nạp...' : 'Bắt đầu nạp môn học'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
