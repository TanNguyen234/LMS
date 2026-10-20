import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BookOpen,
  FolderPlus,
  FilePlus,
  ChevronRight,
  FileText,
  Download,
  X,
  UserPlus,
  AlertCircle,
  PlayCircle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { Course, Module, Lesson, Enrollment, User } from '../types';

export const CourseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const courseId = id || '';
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'students'>('content');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');

  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonType, setNewLessonType] = useState<'TEXT' | 'VIDEO' | 'DOCUMENT'>('TEXT');
  const [newLessonBody, setNewLessonBody] = useState('');
  const [newLessonMedia, setNewLessonMedia] = useState('');

  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);

  const fetchCourseData = async () => {
    try {
      setLoading(true);
      const courseData = await api.getCourse(courseId);
      setCourse(courseData);

      const modulesData = await api.getCourseModules(courseId);
      setModules(modulesData);
      if (modulesData.length > 0 && modulesData[0].lessons.length > 0) {
        setSelectedLesson(modulesData[0].lessons[0]);
      }

      if (user?.role === 'ADMIN' || user?.role === 'LECTURER') {
        try {
          const enrollData = await api.getCourseEnrollments(courseId);
          setEnrollments(enrollData);
        } catch (e) {
          console.warn('Could not fetch enrollments:', e);
        }

        if (user?.role === 'ADMIN') {
          try {
            const allStudents = await api.getUsers('STUDENT', true);
            setStudents(allStudents);
            if (allStudents.length > 0) setSelectedStudentId(String(allStudents[0].id));
          } catch (e) {
            console.warn('Could not fetch student list:', e);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải thông tin khóa học.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
    }
  }, [courseId]);

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await api.createModule(courseId, {
        title: newModuleTitle,
        description: newModuleDesc,
      });
      setModules((prev) => [...prev, { ...created, lessons: [] }]);
      setIsModuleModalOpen(false);
      setNewModuleTitle('');
      setNewModuleDesc('');
    } catch (err: any) {
      alert('Lỗi tạo chương học: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await api.createLesson(selectedModuleId, {
        title: newLessonTitle,
        content_type: newLessonType,
        content_body: newLessonBody,
        media_url: newLessonMedia || undefined,
        is_published: true,
      });

      setModules((prev) =>
        prev.map((m) =>
          m.id === selectedModuleId ? { ...m, lessons: [...m.lessons, created] } : m
        )
      );
      setSelectedLesson(created);
      setIsLessonModalOpen(false);
      setNewLessonTitle('');
      setNewLessonBody('');
      setNewLessonMedia('');
    } catch (err: any) {
      alert('Lỗi tạo bài giảng: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const enrolled = await api.enrollStudent(courseId, selectedStudentId);
      setEnrollments((prev) => [enrolled, ...prev]);
      setIsEnrollModalOpen(false);
    } catch (err: any) {
      alert('Lỗi ghi danh sinh viên: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-red-200 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-slate-800">Không tìm thấy khóa học</h2>
        <p className="text-sm text-slate-500 mt-1">{error || 'Khóa học không tồn tại.'}</p>
        <Link to="/courses" className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline">
          ← Quay lại danh sách khóa học
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Course Banner Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-lg bg-blue-100 text-blue-700">
                {course.code}
              </span>
              <span className="text-xs text-slate-500">{course.credits} Tín chỉ</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {course.status}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">{course.title}</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">{course.description || 'Chưa có mô tả chi tiết.'}</p>
          </div>

          <div className="flex items-center gap-2">
            {user?.role !== 'STUDENT' && (
              <>
                <button
                  onClick={() => setIsModuleModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                >
                  <FolderPlus className="w-4 h-4 text-slate-500" />
                  <span>+ Chương học</span>
                </button>
                <button
                  onClick={() => {
                    if (modules.length === 0) {
                      alert('Vui lòng tạo ít nhất 1 chương học trước khi thêm bài giảng.');
                      return;
                    }
                    setSelectedModuleId(modules[0].id as any);
                    setIsLessonModalOpen(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                >
                  <FilePlus className="w-4 h-4" />
                  <span>+ Bài giảng</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-6 border-b border-slate-100 mt-6 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('content')}
            className={`pb-3 border-b-2 transition ${
              activeTab === 'content'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Chương trình & Bài giảng ({modules.reduce((acc, m) => acc + m.lessons.length, 0)})
          </button>

          {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
            <button
              onClick={() => setActiveTab('students')}
              className={`pb-3 border-b-2 transition ${
                activeTab === 'students'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Danh sách sinh viên ({enrollments.length})
            </button>
          )}
        </div>
      </div>

      {/* Tab: Content & Modules */}
      {activeTab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Modules List Accordion */}
          <div className="lg:col-span-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Đề cương bài học</h2>

            {modules.length === 0 ? (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 text-center text-sm text-slate-400">
                Chưa có chương học nào trong khóa này.
              </div>
            ) : (
              modules.map((m) => (
                <div key={m.id} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-slate-800">{m.title}</h3>
                      {m.description && <p className="text-xs text-slate-400">{m.description}</p>}
                    </div>
                    {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
                      <button
                        onClick={() => {
                          setSelectedModuleId(String(m.id));
                          setIsLessonModalOpen(true);
                        }}
                        className="text-xs text-blue-600 hover:underline font-semibold"
                        title="Thêm bài giảng vào chương này"
                      >
                        + Thêm bài
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {m.lessons.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 italic">Chưa có bài giảng</div>
                    ) : (
                      m.lessons.map((lesson) => {
                        const isSelected = selectedLesson?.id === lesson.id;
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => setSelectedLesson(lesson)}
                            className={`w-full p-3 text-left flex items-center justify-between transition ${
                              isSelected
                                ? 'bg-blue-50 text-blue-700 font-semibold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 truncate">
                              {lesson.content_type === 'VIDEO' ? (
                                <PlayCircle className="w-4 h-4 text-blue-500 shrink-0" />
                              ) : (
                                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span className="text-xs truncate">{lesson.title}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Lesson Content Viewer Panel */}
          <div className="lg:col-span-7">
            {selectedLesson ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {selectedLesson.content_type}
                    </span>
                    <h2 className="text-xl font-bold text-slate-800 mt-2">{selectedLesson.title}</h2>
                  </div>
                </div>

                {selectedLesson.media_url && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <span className="text-xs text-slate-600 truncate max-w-sm">Tài liệu đính kèm: {selectedLesson.media_url}</span>
                    <a
                      href={selectedLesson.media_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Xem/Tải file</span>
                    </a>
                  </div>
                )}

                <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                  {selectedLesson.content_body || 'Nội dung bài giảng đang được giảng viên cập nhật...'}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-sm">Chọn một bài giảng ở menu bên trái để bắt đầu học tập.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Enrollments Management */}
      {activeTab === 'students' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Danh sách sinh viên trong lớp ({enrollments.length})</h2>
            <button
              onClick={() => setIsEnrollModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>Ghi danh sinh viên</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                  <th className="py-3 px-4">Mã sinh viên / ID</th>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Ngày ghi danh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                      Chưa có sinh viên nào ghi danh khóa học này.
                    </td>
                  </tr>
                ) : (
                  enrollments.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">#{e.student_id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{e.student_name || 'Sinh viên'}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{e.student_email || '—'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          {e.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">
                        {new Date(e.enrolled_at).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Module */}
      {isModuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Tạo chương học mới</h3>
              <button onClick={() => setIsModuleModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateModule} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Tên chương học</label>
                <input
                  type="text"
                  required
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Chương 1: Tổng quan và Thiết kế Kiến trúc"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Mô tả tóm tắt</label>
                <textarea
                  rows={2}
                  value={newModuleDesc}
                  onChange={(e) => setNewModuleDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModuleModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                >
                  Lưu chương
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Lesson */}
      {isLessonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Thêm bài giảng mới</h3>
              <button onClick={() => setIsLessonModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateLesson} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Chương học</label>
                <select
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Tiêu đề bài giảng</label>
                <input
                  type="text"
                  required
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Bài 1: Giới thiệu Fast API và SQL Server"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Loại bài giảng</label>
                <select
                  value={newLessonType}
                  onChange={(e) => setNewLessonType(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="TEXT">Bài đọc / Giáo trình (Text)</option>
                  <option value="VIDEO">Video hướng dẫn (Video)</option>
                  <option value="DOCUMENT">Tài liệu PDF / Slide (Document)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Nội dung chi tiết</label>
                <textarea
                  rows={4}
                  value={newLessonBody}
                  onChange={(e) => setNewLessonBody(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Nhập nội dung hướng dẫn hoặc ghi chú học tập..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Đường dẫn Media / Slide URL (Tùy chọn)</label>
                <input
                  type="text"
                  value={newLessonMedia}
                  onChange={(e) => setNewLessonMedia(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="https://..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLessonModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                >
                  Lưu bài giảng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Enroll Student */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Ghi danh sinh viên vào lớp</h3>
              <button onClick={() => setIsEnrollModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleEnrollStudent} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Chọn sinh viên</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.username} - {s.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEnrollModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                >
                  Xác nhận ghi danh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
