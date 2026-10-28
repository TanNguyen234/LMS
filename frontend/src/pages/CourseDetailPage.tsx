import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BookOpen,
  FolderPlus,
  FilePlus,
  ChevronRight,
  ChevronLeft,
  FileText,
  Download,
  Eye,
  X,
  UserPlus,
  AlertCircle,
  PlayCircle,
  Pencil,
  Archive,
  Sparkles,
  Users,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { statusLabel } from '../utils/vi';
import type { Course, Module, Lesson, Enrollment, User } from '../types';
import { PdfPreviewModal } from '../components/common/PdfPreviewModal';

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
  const [previewFile, setPreviewFile] = useState<{ url: string; title: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Syllabus generator state
  const [generatingSyllabus, setGeneratingSyllabus] = useState(false);

  // Class Enrollment modal state
  const [isEnrollClassModalOpen, setIsEnrollClassModalOpen] = useState(false);
  const [selectedClassName, setSelectedClassName] = useState<string>('');
  const [enrollingClass, setEnrollingClass] = useState(false);

  // Single student enroll modal
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Module and Lesson form modals
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');

  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonBody, setNewLessonBody] = useState('');
  const [newLessonMedia, setNewLessonMedia] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const resetModuleForm = () => {
    setNewModuleTitle('');
    setNewModuleDesc('');
    setEditingModule(null);
  };

  const resetLessonForm = () => {
    setNewLessonTitle('');
    setNewLessonBody('');
    setNewLessonMedia('');
    setEditingLesson(null);
  };

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
            if (allStudents.length > 0) {
              setSelectedStudentId(String(allStudents[0].id));
              const availableClasses = Array.from(new Set(allStudents.map((s) => s.className).filter(Boolean))) as string[];
              if (availableClasses.length > 0) {
                setSelectedClassName(availableClasses[0]);
              }
            }
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

  // Unique classes from student list
  const uniqueClasses = useMemo(() => {
    return Array.from(new Set(students.map((s) => s.className).filter(Boolean))) as string[];
  }, [students]);

  // Count active students in selected class
  const classStudentCount = useMemo(() => {
    if (!selectedClassName) return 0;
    return students.filter((s) => s.className === selectedClassName && (s.isActive ?? s.is_active)).length;
  }, [students, selectedClassName]);

  // Flattened lessons for Next / Prev navigation
  const allLessons = useMemo(() => {
    return modules.flatMap((m) => m.lessons);
  }, [modules]);

  const currentLessonIndex = useMemo(() => {
    if (!selectedLesson) return -1;
    return allLessons.findIndex((l) => l.id === selectedLesson.id);
  }, [allLessons, selectedLesson]);

  const prevLesson = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] : null;
  const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < allLessons.length - 1 ? allLessons[currentLessonIndex + 1] : null;

  const handleGenerateStandardSyllabus = async () => {
    if (!window.confirm('Khởi tạo bộ khung 15 tuần học chuẩn theo quy cách đào tạo đại học cho môn này?')) return;
    setGeneratingSyllabus(true);
    try {
      const res = await api.generateStandardSyllabus(courseId);
      alert(res.message);
      const modulesData = await api.getCourseModules(courseId);
      setModules(modulesData);
      if (modulesData.length > 0 && modulesData[0].lessons.length > 0) {
        setSelectedLesson(modulesData[0].lessons[0]);
      }
    } catch (err: any) {
      alert('Lỗi tạo khung đề cương: ' + err.message);
    } finally {
      setGeneratingSyllabus(false);
    }
  };

  const handleBulkEnrollClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassName) {
      alert('Vui lòng chọn lớp sinh hoạt.');
      return;
    }
    setEnrollingClass(true);
    try {
      const res = await api.bulkEnrollByClass(courseId, selectedClassName);
      alert(res.message);
      setIsEnrollClassModalOpen(false);
      const enrollData = await api.getCourseEnrollments(courseId);
      setEnrollments(enrollData);
    } catch (err: any) {
      alert('Lỗi ghi danh theo lớp: ' + err.message);
    } finally {
      setEnrollingClass(false);
    }
  };

  const handleExportRosterCsv = () => {
    if (enrollments.length === 0) {
      alert('Chưa có sinh viên ghi danh để xuất.');
      return;
    }
    const headers = ['StudentID', 'FullName', 'Email', 'Status', 'EnrolledDate'];
    const rows = enrollments.map((e) => [
      `"${e.student_id}"`,
      `"${e.student_name || 'Sinh viên'}"`,
      `"${e.student_email || ''}"`,
      `"${e.status}"`,
      `"${new Date(e.enrolled_at).toLocaleDateString('vi-VN')}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `danh_sach_lop_${course?.code || 'course'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingModule) {
        const updated = await api.updateModule(editingModule.id, {
          title: newModuleTitle,
          description: newModuleDesc,
        });
        setModules((prev) => prev.map((m) => (m.id === editingModule.id ? { ...m, ...updated, lessons: m.lessons } : m)));
      } else {
        const created = await api.createModule(courseId, {
          title: newModuleTitle,
          description: newModuleDesc,
        });
        setModules((prev) => [...prev, { ...created, lessons: [] }]);
      }
      setIsModuleModalOpen(false);
      resetModuleForm();
    } catch (err: any) {
      alert('Lỗi tạo chương học: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModuleId) return;
    setSubmitting(true);
    try {
      if (editingLesson) {
        const updated = await api.updateLesson(editingLesson.id, {
          title: newLessonTitle,
          content_body: newLessonBody,
          media_url: newLessonMedia || undefined,
        });
        setModules((prev) =>
          prev.map((m) => ({
            ...m,
            lessons: m.lessons.map((item) => (item.id === editingLesson.id ? updated : item)),
          }))
        );
        setSelectedLesson(updated);
      } else {
        const created = await api.createLesson(selectedModuleId, {
          title: newLessonTitle,
          content_body: newLessonBody,
          media_url: newLessonMedia || undefined,
        });
        setModules((prev) =>
          prev.map((m) => (String(m.id) === String(selectedModuleId) ? { ...m, lessons: [...m.lessons, created] } : m))
        );
        setSelectedLesson(created);
      }
      setIsLessonModalOpen(false);
      resetLessonForm();
    } catch (err: any) {
      alert('Lỗi tạo bài giảng: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnrollSingleStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;
    setSubmitting(true);
    try {
      const newEnroll = await api.enrollStudent(courseId, selectedStudentId);
      setEnrollments((prev) => [newEnroll, ...prev]);
      setIsEnrollModalOpen(false);
    } catch (err: any) {
      alert('Lỗi ghi danh sinh viên: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleModulePublish = async (module: Module) => {
    try {
      const updated = await api.updateModule(module.id, { isPublished: !module.isPublished });
      setModules((prev) => prev.map((m) => (m.id === module.id ? { ...m, ...updated, lessons: m.lessons } : m)));
    } catch (err: any) {
      alert('Lỗi cập nhật trạng thái chương: ' + err.message);
    }
  };

  const handleToggleLessonPublish = async (lesson: Lesson) => {
    try {
      const updated = await api.updateLesson(lesson.id, { is_published: !lesson.is_published });
      setModules((prev) =>
        prev.map((m) => ({
          ...m,
          lessons: m.lessons.map((item) => (item.id === lesson.id ? updated : item)),
        }))
      );
      setSelectedLesson(updated);
    } catch (err: any) {
      alert('Lỗi cập nhật bài giảng: ' + err.message);
    }
  };

  const openEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setSelectedModuleId(String(lesson.module_id));
    setNewLessonTitle(lesson.title);
    setNewLessonBody(lesson.content_body || '');
    setNewLessonMedia(lesson.media_url || '');
    setIsLessonModalOpen(true);
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
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-lg bg-blue-100 text-blue-700 font-mono">
                {course.code}
              </span>
              <span className="text-xs text-slate-500">{course.credits} Tín chỉ</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {statusLabel(course.status)}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">{course.title}</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">{course.description || 'Chưa có mô tả chi tiết.'}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user?.role !== 'STUDENT' && (
              <>
                {modules.length === 0 && (
                  <button
                    onClick={handleGenerateStandardSyllabus}
                    disabled={generatingSyllabus}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                    title="Tự động sinh 15 module tuần học chuẩn theo chương trình đại học"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{generatingSyllabus ? 'Đang tạo khung...' : 'Tạo nhanh khung 15 tuần học'}</span>
                  </button>
                )}

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
                    resetLessonForm();
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
            Chương trình và bài giảng ({allLessons.length})
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
        <div className="space-y-4">
          {/* Top Control Bar for Syllabus reading mode */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
            >
              {sidebarCollapsed ? (
                <>
                  <PanelLeftOpen className="w-4 h-4 text-blue-600" />
                  <span>Hiện mục lục bài học</span>
                </>
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4 text-slate-500" />
                  <span>Thu gọn mục lục (Chế độ đọc rộng)</span>
                </>
              )}
            </button>

            {selectedLesson && (
              <span className="text-xs text-slate-400">
                Bài {currentLessonIndex + 1} / {allLessons.length}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Modules List Accordion */}
            {!sidebarCollapsed && (
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Đề cương bài học</h2>
                  {modules.length > 0 && user?.role !== 'STUDENT' && (
                    <button
                      onClick={handleGenerateStandardSyllabus}
                      disabled={generatingSyllabus}
                      className="text-[11px] text-blue-600 hover:underline font-semibold"
                    >
                      + Bổ sung 15 tuần
                    </button>
                  )}
                </div>

                {modules.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-slate-200/80 text-center space-y-3">
                    <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
                    <div>
                      <h4 className="font-semibold text-slate-700 text-sm">Chưa có chương học nào</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Bắt đầu nhanh bằng cách khởi tạo bộ khung đề cương 15 tuần tiêu chuẩn.
                      </p>
                    </div>
                    {user?.role !== 'STUDENT' && (
                      <button
                        onClick={handleGenerateStandardSyllabus}
                        disabled={generatingSyllabus}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                      >
                        Khởi tạo khung 15 tuần chuẩn
                      </button>
                    )}
                  </div>
                ) : (
                  modules.map((m) => (
                    <div key={m.id} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                      <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-xs text-slate-800 truncate">{m.title}</h3>
                          {m.description && <p className="text-[11px] text-slate-400 truncate">{m.description}</p>}
                        </div>
                        {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
                          <div className="flex items-center gap-1.5 shrink-0 text-xs">
                            <button
                              onClick={() => {
                                setEditingModule(m);
                                setNewModuleTitle(m.title);
                                setNewModuleDesc(m.description || '');
                                setIsModuleModalOpen(true);
                              }}
                              className="text-slate-600 hover:text-blue-600 font-semibold p-1"
                              title="Sửa chương"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleModulePublish(m)}
                              className="text-slate-500 hover:text-amber-700 font-semibold p-1"
                              title={m.isPublished ? 'Ẩn chương này' : 'Xuất bản chương'}
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedModuleId(String(m.id));
                                resetLessonForm();
                                setIsLessonModalOpen(true);
                              }}
                              className="text-blue-600 hover:underline font-semibold text-[11px]"
                            >
                              + Bài
                            </button>
                          </div>
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
                                    ? 'bg-blue-50/80 text-blue-700 font-semibold'
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
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Lesson Content Viewer Panel */}
            <div className={sidebarCollapsed ? 'lg:col-span-12' : 'lg:col-span-7'}>
              {selectedLesson ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">
                        Bài giảng
                      </span>
                      <h2 className="text-xl font-bold text-slate-800 mt-2">{selectedLesson.title}</h2>
                    </div>
                    {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditLesson(selectedLesson)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 inline-flex items-center gap-1"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Sửa
                        </button>
                        <button
                          onClick={() => handleToggleLessonPublish(selectedLesson)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:border-amber-300 hover:text-amber-700"
                        >
                          {selectedLesson.is_published ? 'Ẩn bài' : 'Xuất bản'}
                        </button>
                      </div>
                    )}
                  </div>

                  {selectedLesson.media_url && (
                    <div className="space-y-2 p-4 bg-slate-50/80 rounded-xl border border-slate-200">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block">
                        Tài liệu học tập đính kèm:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedLesson.media_url.split(',').map((url, idx) => {
                          const fileUrl = url.trim();
                          const fileName = fileUrl.split('/').pop() || 'Tài liệu';
                          return (
                            <div key={idx} className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between gap-2 shadow-2xs">
                              <span className="text-xs text-slate-700 font-medium truncate" title={fileUrl}>
                                📄 {fileName}
                              </span>
                              <div className="flex items-center space-x-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile({ url: fileUrl, title: fileName })}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold flex items-center space-x-1 transition"
                                  title="Xem trước trực tiếp"
                                >
                                  <Eye className="w-3 h-3 text-slate-600" />
                                  <span>Xem</span>
                                </button>
                                <a
                                  href={fileUrl}
                                  download
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center space-x-1 transition"
                                  title="Tải về máy tính"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Tải</span>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-700 whitespace-pre-line py-2">
                    {(selectedLesson.content_body || 'Nội dung bài giảng đang được giảng viên cập nhật...')
                      .replace(/<\/p>/gi, '\n\n')
                      .replace(/<br\s*\/?>/gi, '\n')
                      .replace(/<[^>]*>/g, '')
                      .trim()}
                  </div>

                  {/* Seamless Previous / Next Lesson Navigator */}
                  <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-6">
                    {prevLesson ? (
                      <button
                        onClick={() => setSelectedLesson(prevLesson)}
                        className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-xs font-semibold text-slate-700 transition"
                      >
                        <ChevronLeft className="w-4 h-4 text-slate-400" />
                        <span className="max-w-[200px] truncate">Trước: {prevLesson.title}</span>
                      </button>
                    ) : (
                      <div />
                    )}

                    {nextLesson && (
                      <button
                        onClick={() => setSelectedLesson(nextLesson)}
                        className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
                      >
                        <span className="max-w-[200px] truncate">Kế tiếp: {nextLesson.title}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
                  <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm">Chọn một bài giảng ở mục lục bên trái để bắt đầu học tập.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Enrollments Management */}
      {activeTab === 'students' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">Danh sách sinh viên trong lớp ({enrollments.length})</h2>
              <p className="text-xs text-slate-400">Quản lý ghi danh học phần và xuất danh sách phục vụ điểm danh</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportRosterCsv}
                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                <span>Xuất CSV</span>
              </button>

              {user?.role === 'ADMIN' && (
                <>
                  {/* 1-Click Class Enrollment Button */}
                  <button
                    onClick={() => setIsEnrollClassModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-xl transition"
                    title="Ghi danh toàn bộ sinh viên của một lớp sinh hoạt vào khóa học trong 1 click"
                  >
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Ghi danh theo Lớp</span>
                  </button>

                  <button
                    onClick={() => setIsEnrollModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Ghi danh lẻ</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase">
                  <th className="py-3 px-4">Mã sinh viên / ID</th>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4">Thư điện tử</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Ngày ghi danh</th>
                  {user?.role === 'ADMIN' && <th className="py-3 px-4 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role === 'ADMIN' ? 6 : 5} className="py-8 text-center text-slate-400 text-xs">
                      Chưa có sinh viên nào ghi danh khóa học này.
                    </td>
                  </tr>
                ) : (
                  enrollments.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono text-slate-500">#{e.student_id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{e.student_name || 'Sinh viên'}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{e.student_email || '—'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            e.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {statusLabel(e.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(e.enrolled_at).toLocaleDateString('vi-VN')}
                      </td>
                      {user?.role === 'ADMIN' && (
                        <td className="py-3 px-4 text-right">
                          {e.status === 'ACTIVE' && (
                            <button
                              onClick={async () => {
                                try {
                                  await api.dropEnrollment(courseId, e.student_id);
                                  setEnrollments((prev) =>
                                    prev.map((item) => (item.id === e.id ? { ...item, status: 'DROPPED' } : item))
                                  );
                                } catch (err: any) {
                                  alert('Lỗi rút ghi danh: ' + err.message);
                                }
                              }}
                              className="text-xs font-semibold text-red-600 hover:text-red-700"
                            >
                              Rút ghi danh
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: 1-Click Class Enrollment */}
      {isEnrollClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Ghi danh cả lớp sinh hoạt</h3>
                  <p className="text-xs text-slate-400">Tự động nạp toàn bộ sinh viên của lớp vào môn học</p>
                </div>
              </div>
              <button onClick={() => setIsEnrollClassModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleBulkEnrollClass} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Chọn lớp sinh hoạt</label>
                <select
                  value={selectedClassName}
                  onChange={(e) => setSelectedClassName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
                >
                  {uniqueClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-1 text-slate-600">
                <p className="font-semibold text-indigo-900">Thông tin dự kiến:</p>
                <p>• Lớp: <strong>{selectedClassName}</strong></p>
                <p>• Số lượng sinh viên trong lớp: <strong>{classStudentCount} sinh viên</strong></p>
                <p className="text-[11px] text-slate-500 pt-1">
                  Hệ thống sẽ tự động bỏ qua các sinh viên đã được ghi danh trước đó.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEnrollClassModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={enrollingClass || !selectedClassName}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{enrollingClass ? 'Đang ghi danh...' : 'Ghi danh cả lớp ngay'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Single Student Enroll */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">Ghi danh lẻ sinh viên</h3>
              <button onClick={() => setIsEnrollModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleEnrollSingleStudent} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Chọn sinh viên</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.studentCode || s.email}) - Lớp {s.className || 'Chưa gán'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEnrollModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : 'Ghi danh'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Module */}
      {isModuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editingModule ? 'Sửa chương học' : 'Tạo chương học mới'}
              </h3>
              <button onClick={() => { setIsModuleModalOpen(false); resetModuleForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateModule} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tên chương học</label>
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
                <label className="block font-semibold text-slate-700 uppercase mb-1">Mô tả tóm tắt</label>
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
                  onClick={() => { setIsModuleModalOpen(false); resetModuleForm(); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingModule ? 'Lưu thay đổi' : 'Tạo chương'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Lesson */}
      {isLessonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editingLesson ? 'Cập nhật bài giảng' : 'Thêm bài giảng mới'}
              </h3>
              <button onClick={() => { setIsLessonModalOpen(false); resetLessonForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateLesson} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Thuộc chương học</label>
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
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tiêu đề bài giảng</label>
                <input
                  type="text"
                  required
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  placeholder="Bài 1: Khái niệm về CSDL phân tán"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Nội dung bài giảng</label>
                <textarea
                  rows={5}
                  value={newLessonBody}
                  onChange={(e) => setNewLessonBody(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  placeholder="Nhập nội dung bài giảng chi tiết..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tài liệu học tập đính kèm (URL)</label>
                <input
                  type="text"
                  value={newLessonMedia}
                  onChange={(e) => setNewLessonMedia(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  placeholder="https://example.com/slide.pdf"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsLessonModalOpen(false); resetLessonForm(); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingLesson ? 'Lưu thay đổi' : 'Tạo bài giảng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF / File Preview Modal */}
      {previewFile && (
        <PdfPreviewModal
          isOpen={Boolean(previewFile)}
          fileUrl={previewFile.url}
          title={previewFile.title}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
};
