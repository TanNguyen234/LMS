import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Filter,
  GraduationCap,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings2,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import {
  learningApi,
  type CourseCreatePayload,
  type CourseUpdatePayload,
} from '../api/learning';
import { useAuth } from '../auth/AuthContext';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Modal } from '../components/ui/Modal';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { formatCourseStatus, formatEnrollmentStatus } from '../utils/formatters';
import type { Course, CourseCatalogItem, CourseStatus, User } from '../types';

type StudentTab = 'my-courses' | 'catalog';

function getCourseStatusMeta(status?: string): { label: string; variant: BadgeVariant; icon: React.ReactNode } {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
    case 'PUBLISHED':
      return {
        label: formatCourseStatus('ACTIVE'),
        variant: 'success',
        icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'DRAFT':
      return {
        label: formatCourseStatus('DRAFT'),
        variant: 'warning',
        icon: <Clock className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'ARCHIVED':
      return {
        label: formatCourseStatus('ARCHIVED'),
        variant: 'neutral',
        icon: <Archive className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    default:
      return {
        label: formatCourseStatus(status),
        variant: 'neutral',
        icon: <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />,
      };
  }
}

export const CoursesPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const isStudent = user?.role === 'STUDENT';
  const isAdmin = user?.role === 'ADMIN';
  const canManageEnrollment = user?.role === 'ADMIN' || user?.role === 'LECTURER';

  const [activeTab, setActiveTab] = useState<StudentTab>('my-courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [catalog, setCatalog] = useState<CourseCatalogItem[]>([]);
  const [lecturers, setLecturers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [semesterFilter, setSemesterFilter] = useState<string>('ALL');

  // Create / Edit Course Modal (Admin)
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCredits, setFormCredits] = useState<number>(3);
  const [formSemester, setFormSemester] = useState('HK1');
  const [formAcademicYear, setFormAcademicYear] = useState('2025-2026');
  const [formStatus, setFormStatus] = useState<CourseStatus>('ACTIVE');
  const [formLecturerId, setFormLecturerId] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formAllowSelfEnroll, setFormAllowSelfEnroll] = useState(true);
  const [formJoinCode, setFormJoinCode] = useState('');
  const [formMaxStudents, setFormMaxStudents] = useState('');
  const [submittingCourse, setSubmittingCourse] = useState(false);

  // Enrollment Settings Modal (Lecturer / Admin)
  const [settingsCourse, setSettingsCourse] = useState<Course | null>(null);
  const [settingsAllowSelfEnroll, setSettingsAllowSelfEnroll] = useState(true);
  const [settingsJoinCode, setSettingsJoinCode] = useState('');
  const [settingsMaxStudents, setSettingsMaxStudents] = useState('');
  const [settingsCategory, setSettingsCategory] = useState('');
  const [submittingSettings, setSubmittingSettings] = useState(false);

  // Join by Code Modal (Student)
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [submittingJoinCode, setSubmittingJoinCode] = useState(false);

  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [droppingCourseId, setDroppingCourseId] = useState<string | null>(null);

  const fetchMyCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await learningApi.getCourses(
        !isStudent && statusFilter !== 'ALL' ? { status: statusFilter } : undefined,
      );
      setCourses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách khóa học');
    } finally {
      setLoading(false);
    }
  }, [isStudent, statusFilter]);

  const fetchCatalog = useCallback(async () => {
    if (!isStudent) return;
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const rows = await learningApi.getCourseCatalog();
      setCatalog(rows);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Không thể tải danh mục khóa học mở đăng ký');
    } finally {
      setCatalogLoading(false);
    }
  }, [isStudent]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        return fetchMyCourses();
      }
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [fetchMyCourses]);

  useEffect(() => {
    if (!isStudent) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        return fetchCatalog();
      }
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [isStudent, fetchCatalog]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const loadLecturers = async () => {
      try {
        const list = await api.getUsers('LECTURER', true);
        if (!active) return;
        setLecturers(list);
        if (list.length > 0) {
          setFormLecturerId((prev) => prev || String(list[0].userId ?? list[0].id));
        }
      } catch (err) {
        if (active) {
          toast.error(err instanceof Error ? err.message : 'Không thể tải danh sách giảng viên');
        }
      }
    };
    void loadLecturers();
    return () => {
      active = false;
    };
  }, [isAdmin, toast]);

  const resetCourseForm = () => {
    setEditingCourse(null);
    setFormCode('');
    setFormTitle('');
    setFormDescription('');
    setFormCredits(3);
    setFormSemester('HK1');
    setFormAcademicYear('2025-2026');
    setFormStatus('ACTIVE');
    setFormCategory('');
    setFormAllowSelfEnroll(true);
    setFormJoinCode('');
    setFormMaxStudents('');
    if (lecturers.length > 0) {
      setFormLecturerId(String(lecturers[0].userId ?? lecturers[0].id));
    } else {
      setFormLecturerId('');
    }
  };

  const openCreateModal = () => {
    resetCourseForm();
    setIsCourseModalOpen(true);
  };

  const openEditModal = (course: Course) => {
    setEditingCourse(course);
    setFormCode(course.courseCode ?? course.code);
    setFormTitle(course.title);
    setFormDescription(course.description || '');
    setFormCredits(Number(course.credits || 3));
    setFormSemester(course.semester || 'HK1');
    setFormAcademicYear(course.academicYear || '2025-2026');
    setFormStatus(course.status);
    setFormLecturerId(String(course.lecturerId ?? course.lecturer_id ?? ''));
    setFormCategory(course.category || '');
    setFormAllowSelfEnroll(Boolean(course.allowSelfEnroll));
    setFormJoinCode(course.joinCode || '');
    setFormMaxStudents(course.maxStudents != null ? String(course.maxStudents) : '');
    setIsCourseModalOpen(true);
  };

  const openSettingsModal = (course: Course) => {
    setSettingsCourse(course);
    setSettingsAllowSelfEnroll(Boolean(course.allowSelfEnroll));
    setSettingsJoinCode(course.joinCode || '');
    setSettingsMaxStudents(course.maxStudents != null ? String(course.maxStudents) : '');
    setSettingsCategory(course.category || '');
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMax = formMaxStudents.trim() === '' ? null : Number(formMaxStudents.trim());
    if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 1)) {
      toast.error('Sĩ số tối đa phải là số nguyên dương');
      return;
    }

    try {
      setSubmittingCourse(true);
      if (editingCourse) {
        const courseId = String(editingCourse.courseId ?? editingCourse.id);
        const payload: CourseUpdatePayload = {
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          lecturerId: formLecturerId || undefined,
          credits: formCredits,
          semester: formSemester.trim(),
          academicYear: formAcademicYear.trim(),
          status: formStatus,
          category: formCategory.trim() || null,
          allowSelfEnroll: formAllowSelfEnroll,
          joinCode: formJoinCode.trim() || null,
          maxStudents: parsedMax,
        };
        await learningApi.updateCourse(courseId, payload);
        toast.success('Đã cập nhật thông tin khóa học');
      } else {
        const payload: CourseCreatePayload = {
          courseCode: formCode.trim().toUpperCase(),
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          lecturerId: formLecturerId,
          credits: formCredits,
          semester: formSemester.trim(),
          academicYear: formAcademicYear.trim(),
          status: formStatus,
          category: formCategory.trim() || null,
          allowSelfEnroll: formAllowSelfEnroll,
          joinCode: formJoinCode.trim() || null,
          maxStudents: parsedMax,
        };
        await learningApi.createCourse(payload);
        toast.success('Đã tạo khóa học mới thành công');
      }
      setIsCourseModalOpen(false);
      resetCourseForm();
      await fetchMyCourses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu thông tin khóa học');
    } finally {
      setSubmittingCourse(false);
    }
  };

  const handleSaveEnrollmentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsCourse) return;
    const parsedMax = settingsMaxStudents.trim() === '' ? null : Number(settingsMaxStudents.trim());
    if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 1)) {
      toast.error('Sĩ số tối đa phải là số nguyên dương');
      return;
    }

    try {
      setSubmittingSettings(true);
      const courseId = String(settingsCourse.courseId ?? settingsCourse.id);
      await learningApi.updateEnrollmentSettings(courseId, {
        allowSelfEnroll: settingsAllowSelfEnroll,
        joinCode: settingsJoinCode.trim() || null,
        maxStudents: parsedMax,
        category: settingsCategory.trim() || null,
      });
      toast.success('Đã cập nhật cấu hình ghi danh');
      setSettingsCourse(null);
      await fetchMyCourses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật cấu hình ghi danh');
    } finally {
      setSubmittingSettings(false);
    }
  };

  const handleToggleArchive = async (course: Course) => {
    const nextStatus: CourseStatus = course.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
    const actionLabel = nextStatus === 'ARCHIVED' ? 'lưu trữ' : 'mở lại';
    const ok = await confirm({
      title: nextStatus === 'ARCHIVED' ? 'Lưu trữ khóa học' : 'Mở lại khóa học',
      message: `Bạn có chắc muốn ${actionLabel} học phần "${course.title}" (${course.courseCode ?? course.code})?`,
      confirmText: nextStatus === 'ARCHIVED' ? 'Lưu trữ' : 'Mở lại',
      variant: nextStatus === 'ARCHIVED' ? 'danger' : 'primary',
    });
    if (!ok) return;

    try {
      const courseId = String(course.courseId ?? course.id);
      await learningApi.updateCourseStatus(courseId, nextStatus);
      toast.success(nextStatus === 'ARCHIVED' ? 'Đã chuyển khóa học sang lưu trữ' : 'Đã mở lại khóa học');
      await fetchMyCourses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể thay đổi trạng thái khóa học');
    }
  };

  const handleSelfEnroll = async (item: CourseCatalogItem) => {
    const courseId = String(item.courseId ?? item.id);
    try {
      setEnrollingCourseId(courseId);
      await learningApi.selfEnrollCourse(courseId);
      toast.success(`Đã đăng ký thành công môn ${item.courseCode ?? item.code}`);
      await Promise.all([fetchMyCourses(), fetchCatalog()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tự đăng ký khóa học');
    } finally {
      setEnrollingCourseId(null);
    }
  };

  const handleSelfDrop = async (course: Course) => {
    const courseId = String(course.courseId ?? course.id);
    const ok = await confirm({
      title: 'Rút khỏi học phần',
      message: `Xác nhận rút khỏi học phần "${course.title}"? Hệ thống chỉ cho phép rút khi bạn chưa phát sinh bài nộp, bài kiểm tra hoặc điểm số.`,
      confirmText: 'Rút học phần',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      setDroppingCourseId(courseId);
      await learningApi.selfDropCourse(courseId);
      toast.success(`Đã rút khỏi học phần ${course.courseCode ?? course.code}`);
      await Promise.all([fetchMyCourses(), fetchCatalog()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể rút học phần');
    } finally {
      setDroppingCourseId(null);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCodeInput.trim();
    if (!cleaned) {
      toast.warning('Vui lòng nhập mã lớp do giảng viên cung cấp');
      return;
    }
    try {
      setSubmittingJoinCode(true);
      await learningApi.joinCourseByCode(cleaned);
      toast.success('Tham gia lớp học bằng mã lớp thành công');
      setJoinCodeInput('');
      setIsJoinCodeOpen(false);
      setActiveTab('my-courses');
      await Promise.all([fetchMyCourses(), fetchCatalog()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mã lớp không hợp lệ hoặc lớp đã đủ sĩ số');
    } finally {
      setSubmittingJoinCode(false);
    }
  };

  const filteredMyCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => {
      const code = (c.courseCode ?? c.code).toLowerCase();
      const title = c.title.toLowerCase();
      const lecturer = (c.lecturerName ?? c.lecturer_name ?? '').toLowerCase();
      return code.includes(q) || title.includes(q) || lecturer.includes(q);
    });
  }, [courses, search]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set).sort();
  }, [catalog]);

  const semesterOptions = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((c) => {
      if (c.semester) set.add(c.semester);
    });
    return Array.from(set).sort();
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalog.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (semesterFilter !== 'ALL' && item.semester !== semesterFilter) return false;
      if (!q) return true;
      const code = (item.courseCode ?? item.code).toLowerCase();
      const title = item.title.toLowerCase();
      const lecturer = (item.lecturerName ?? item.lecturer_name ?? '').toLowerCase();
      return code.includes(q) || title.includes(q) || lecturer.includes(q);
    });
  }, [catalog, catalogSearch, categoryFilter, semesterFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--lms-text)] tracking-tight">
            {isStudent ? 'Khóa học & Đăng ký học phần' : 'Quản lý Khóa học & Học phần'}
          </h1>
          <p className="text-sm text-[var(--lms-text-muted)] mt-1">
            {isStudent
              ? 'Theo dõi các môn đã ghi danh hoặc khám phá danh mục học phần đang mở'
              : 'Quản lý thông tin học phần, cấu hình tự ghi danh, mã lớp và giảng viên phụ trách'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isStudent && (
            <button
              type="button"
              onClick={() => setIsJoinCodeOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] hover:bg-[var(--lms-surface-muted)] text-sm font-semibold text-[var(--lms-text)] transition-colors"
            >
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Nhập mã lớp</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Thêm khóa học mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Student Tabs */}
      {isStudent && (
        <Tabs
          idPrefix="courses-student-tabs"
          ariaLabel="Chế độ xem khóa học"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as StudentTab)}
          items={[
            { id: 'my-courses', label: 'Khóa học của tôi', badge: courses.length },
            { id: 'catalog', label: 'Khám phá & Đăng ký', badge: catalog.length },
          ]}
        />
      )}

      {/* TAB 1 (or default for Lecturer/Admin): My Courses */}
      <TabPanel
        id="my-courses"
        activeId={isStudent ? activeTab : 'my-courses'}
        idPrefix="courses-student-tabs"
      >
        <div className="space-y-5">
          {/* Search and Filter Bar */}
          <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)] flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative w-full sm:w-80">
              <label htmlFor="my-courses-search" className="sr-only">
                Tìm kiếm khóa học
              </label>
              <Search
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--lms-text-muted)]"
                aria-hidden="true"
              />
              <input
                id="my-courses-search"
                type="text"
                placeholder="Tìm mã môn, tên môn, giảng viên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            {!isStudent && (
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[var(--lms-text-muted)]" aria-hidden="true" />
                <label
                  htmlFor="course-status-filter"
                  className="text-xs font-semibold text-[var(--lms-text-muted)] shrink-0"
                >
                  Trạng thái:
                </label>
                <select
                  id="course-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="ARCHIVED">Đã lưu trữ</option>
                </select>
              </div>
            )}
          </div>

          {error && <ErrorBanner message={error} onRetry={() => void fetchMyCourses()} />}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
            </div>
          ) : filteredMyCourses.length === 0 ? (
            <EmptyState
              title="Chưa tìm thấy khóa học nào"
              description={
                isStudent
                  ? 'Bạn chưa ghi danh khóa học nào khớp với từ khóa. Hãy chuyển sang tab Khám phá & Đăng ký hoặc nhập mã lớp.'
                  : 'Vui lòng điều chỉnh bộ lọc hoặc tạo khóa học mới.'
              }
              action={
                isStudent ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalog')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                  >
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    <span>Khám phá khóa học</span>
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMyCourses.map((c) => {
                const courseId = String(c.courseId ?? c.id);
                const courseCode = c.courseCode ?? c.code;
                const lecturerName = c.lecturerName ?? c.lecturer_name;
                const statusMeta = getCourseStatusMeta(c.status);

                return (
                  <article
                    key={courseId}
                    className="bg-[var(--lms-surface)] rounded-2xl border border-[var(--lms-border)] hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
                  >
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800/70">
                            {courseCode}
                          </span>
                          {c.category && <Badge variant="info">{c.category}</Badge>}
                        </div>
                        <Badge variant={statusMeta.variant}>
                          {statusMeta.icon}
                          <span>{statusMeta.label}</span>
                        </Badge>
                      </div>

                      <h2 className="font-bold text-[var(--lms-text)] text-base line-clamp-2">
                        <Link
                          to={`/courses/${courseId}`}
                          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {c.title}
                        </Link>
                      </h2>

                      <p className="text-xs text-[var(--lms-text-muted)] line-clamp-3 leading-relaxed">
                        {c.description || 'Chưa có đề cương chi tiết.'}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--lms-text-muted)] pt-1">
                        {lecturerName && <span>GV: {lecturerName}</span>}
                        {(c.semester || c.academicYear) && (
                          <span className="tabular-nums">
                            {[c.semester, c.academicYear].filter(Boolean).join(' - ')}
                          </span>
                        )}
                      </div>

                      {!isStudent && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <Badge variant={c.allowSelfEnroll ? 'primary' : 'neutral'}>
                            {c.allowSelfEnroll ? 'Cho phép tự đăng ký' : 'Khóa tự đăng ký'}
                          </Badge>
                          {c.joinCode && (
                            <Badge variant="info">
                              Mã lớp: {c.joinCode}
                            </Badge>
                          )}
                          {c.maxStudents != null && (
                            <Badge variant="neutral">
                              Tối đa {c.maxStudents} SV
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="px-5 py-3.5 bg-[var(--lms-surface-muted)] border-t border-[var(--lms-border)] flex items-center justify-between gap-2 text-xs text-[var(--lms-text-muted)]">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <GraduationCap className="w-4 h-4" aria-hidden="true" />
                        <span className="font-medium text-[var(--lms-text)] tabular-nums">
                          {c.credits} tín chỉ
                        </span>
                      </div>

                      <div className="flex items-center flex-wrap justify-end gap-2.5">
                        {isStudent && (
                          <button
                            type="button"
                            disabled={droppingCourseId === courseId}
                            onClick={() => void handleSelfDrop(c)}
                            className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                          >
                            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{droppingCourseId === courseId ? 'Đang rút...' : 'Rút môn'}</span>
                          </button>
                        )}

                        {canManageEnrollment && (
                          <button
                            type="button"
                            onClick={() => openSettingsModal(c)}
                            className="inline-flex items-center gap-1 font-semibold text-[var(--lms-text)] hover:text-blue-600 dark:hover:text-blue-400"
                            aria-label={`Cài đặt ghi danh ${courseCode}`}
                          >
                            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Ghi danh</span>
                          </button>
                        )}

                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              className="inline-flex items-center gap-1 font-semibold text-[var(--lms-text)] hover:text-blue-600 dark:hover:text-blue-400"
                              aria-label={`Sửa khóa học ${courseCode}`}
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Sửa</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleArchive(c)}
                              className="font-semibold text-[var(--lms-text-muted)] hover:text-amber-600 dark:hover:text-amber-400"
                            >
                              {c.status === 'ARCHIVED' ? 'Mở lại' : 'Lưu trữ'}
                            </button>
                          </>
                        )}

                        <Link
                          to={`/courses/${courseId}`}
                          className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span>Chi tiết</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </TabPanel>

      {/* TAB 2 (Student only): Course Catalog & Self-Enroll */}
      {isStudent && (
        <TabPanel id="catalog" activeId={activeTab} idPrefix="courses-student-tabs">
          <div className="space-y-5">
            <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div className="lg:col-span-2">
                <label
                  htmlFor="catalog-search-input"
                  className="block text-xs font-semibold text-[var(--lms-text-muted)] mb-1"
                >
                  Tìm kiếm danh mục học phần
                </label>
                <div className="relative">
                  <Search
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--lms-text-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    id="catalog-search-input"
                    type="text"
                    placeholder="Tên môn học, mã môn học hoặc giảng viên..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="catalog-category-filter"
                  className="block text-xs font-semibold text-[var(--lms-text-muted)] mb-1"
                >
                  Nhóm học phần
                </label>
                <select
                  id="catalog-category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                >
                  <option value="ALL">Tất cả nhóm</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="catalog-semester-filter"
                  className="block text-xs font-semibold text-[var(--lms-text-muted)] mb-1"
                >
                  Học kỳ
                </label>
                <select
                  id="catalog-semester-filter"
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                >
                  <option value="ALL">Tất cả học kỳ</option>
                  {semesterOptions.map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {catalogError && <ErrorBanner message={catalogError} onRetry={() => void fetchCatalog()} />}

            {catalogLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <SkeletonCard lines={3} />
                <SkeletonCard lines={3} />
                <SkeletonCard lines={3} />
              </div>
            ) : filteredCatalog.length === 0 ? (
              <EmptyState
                title="Không có học phần mở đăng ký phù hợp"
                description="Thử xóa bộ lọc tìm kiếm hoặc sử dụng mã lớp do giảng viên cung cấp."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCatalog.map((item) => {
                  const courseId = String(item.courseId ?? item.id);
                  const courseCode = item.courseCode ?? item.code;
                  const lecturerName = item.lecturerName ?? item.lecturer_name;
                  const isFull =
                    item.maxStudents != null && item.enrolledCount >= item.maxStudents;
                  const alreadyJoined =
                    item.isEnrolled ||
                    item.enrollmentStatus === 'ACTIVE' ||
                    item.enrollmentStatus === 'COMPLETED';

                  return (
                    <article
                      key={courseId}
                      className="bg-[var(--lms-surface)] rounded-2xl border border-[var(--lms-border)] hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-200 flex flex-col justify-between overflow-hidden"
                    >
                      <div className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800/70">
                            {courseCode}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.category && <Badge variant="info">{item.category}</Badge>}
                            {alreadyJoined && (
                              <Badge variant="success">
                                {formatEnrollmentStatus(item.enrollmentStatus || 'ACTIVE')}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <h2 className="font-bold text-[var(--lms-text)] text-base line-clamp-2">
                          {item.title}
                        </h2>

                        <p className="text-xs text-[var(--lms-text-muted)] line-clamp-3 leading-relaxed">
                          {item.description || 'Chưa có mô tả chi tiết học phần.'}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--lms-text-muted)] pt-1">
                          <span>{lecturerName ? `GV: ${lecturerName}` : 'Chưa gán giảng viên'}</span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            {item.maxStudents != null
                              ? `${item.enrolledCount}/${item.maxStudents} SV`
                              : `${item.enrolledCount} SV`}
                          </span>
                        </div>
                      </div>

                      <div className="px-5 py-3.5 bg-[var(--lms-surface-muted)] border-t border-[var(--lms-border)] flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-1.5 text-[var(--lms-text)] font-medium tabular-nums">
                          <GraduationCap className="w-4 h-4 text-[var(--lms-text-muted)]" aria-hidden="true" />
                          <span>{item.credits} tín chỉ</span>
                        </div>

                        {alreadyJoined ? (
                          <Link
                            to={`/courses/${courseId}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                          >
                            <span>Vào lớp</span>
                            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </Link>
                        ) : isFull ? (
                          <Badge variant="danger">Đã đủ sĩ số</Badge>
                        ) : item.allowSelfEnroll ? (
                          <button
                            type="button"
                            disabled={enrollingCourseId === courseId}
                            onClick={() => void handleSelfEnroll(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                          >
                            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {enrollingCourseId === courseId ? 'Đang đăng ký...' : 'Đăng ký ngay'}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsJoinCodeOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] hover:bg-[var(--lms-surface-muted)] text-[var(--lms-text)] font-semibold"
                          >
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Dùng mã lớp</span>
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </TabPanel>
      )}

      {/* Join by Code Modal (Student) */}
      <Modal
        isOpen={isJoinCodeOpen}
        onClose={() => {
          setIsJoinCodeOpen(false);
          setJoinCodeInput('');
        }}
        title="Tham gia lớp học bằng mã"
        subtitle="Nhập mã lớp do giảng viên phụ trách cung cấp để ghi danh vào khóa học."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setIsJoinCodeOpen(false);
                setJoinCodeInput('');
              }}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="join-by-code-form"
              disabled={submittingJoinCode}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submittingJoinCode ? 'Đang xử lý...' : 'Tham gia lớp'}
            </button>
          </>
        }
      >
        <form id="join-by-code-form" onSubmit={handleJoinByCode} className="space-y-3">
          <div>
            <label
              htmlFor="join-code-input"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Mã lớp
            </label>
            <input
              id="join-code-input"
              type="text"
              required
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
                  e.preventDefault();
                }
              }}
              placeholder="Ví dụ: CS101-2026"
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>
        </form>
      </Modal>

      {/* Admin Create / Edit Course Modal */}
      <Modal
        isOpen={isCourseModalOpen}
        onClose={() => {
          setIsCourseModalOpen(false);
          resetCourseForm();
        }}
        title={editingCourse ? 'Cập nhật thông tin khóa học' : 'Tạo khóa học mới'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setIsCourseModalOpen(false);
                resetCourseForm();
              }}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="admin-course-form"
              disabled={submittingCourse}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submittingCourse ? 'Đang lưu...' : 'Lưu khóa học'}
            </button>
          </>
        }
      >
        <form id="admin-course-form" onSubmit={handleSaveCourse} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="course-form-code"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Mã môn học
              </label>
              <input
                id="course-form-code"
                type="text"
                required
                disabled={Boolean(editingCourse)}
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="CS101"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="course-form-credits"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Số tín chỉ
              </label>
              <input
                id="course-form-credits"
                type="number"
                min={1}
                max={10}
                required
                value={formCredits}
                onChange={(e) => setFormCredits(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="course-form-status"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Trạng thái
              </label>
              <select
                id="course-form-status"
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as CourseStatus)}
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="DRAFT">Bản nháp</option>
                <option value="ARCHIVED">Đã lưu trữ</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="course-form-title"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Tên môn học
            </label>
            <input
              id="course-form-title"
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Nhập môn Lập trình Web"
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="course-form-semester"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Học kỳ
              </label>
              <input
                id="course-form-semester"
                type="text"
                required
                value={formSemester}
                onChange={(e) => setFormSemester(e.target.value)}
                placeholder="HK1"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="course-form-year"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Năm học
              </label>
              <input
                id="course-form-year"
                type="text"
                required
                value={formAcademicYear}
                onChange={(e) => setFormAcademicYear(e.target.value)}
                placeholder="2025-2026"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="course-form-category"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Nhóm học phần
              </label>
              <input
                id="course-form-category"
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="Công nghệ thông tin"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="course-form-description"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Mô tả tóm tắt
            </label>
            <textarea
              id="course-form-description"
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Mô tả mục tiêu, kiến thức và chuẩn đầu ra môn học..."
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="course-form-lecturer"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Phân công giảng viên
            </label>
            <select
              id="course-form-lecturer"
              required
              value={formLecturerId}
              onChange={(e) => setFormLecturerId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            >
              {lecturers.map((lec) => {
                const lecId = String(lec.userId ?? lec.id);
                const lecName = lec.fullName ?? lec.full_name ?? lec.email;
                return (
                  <option key={lecId} value={lecId}>
                    {lecName} ({lec.email})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label
                htmlFor="course-form-joincode"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Mã lớp (tùy chọn)
              </label>
              <input
                id="course-form-joincode"
                type="text"
                value={formJoinCode}
                onChange={(e) => setFormJoinCode(e.target.value)}
                placeholder="Để trống nếu không yêu cầu"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="course-form-maxstudents"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Sĩ số tối đa (tùy chọn)
              </label>
              <input
                id="course-form-maxstudents"
                type="number"
                min={1}
                value={formMaxStudents}
                onChange={(e) => setFormMaxStudents(e.target.value)}
                placeholder="Không giới hạn"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="course-form-selfenroll"
              type="checkbox"
              checked={formAllowSelfEnroll}
              onChange={(e) => setFormAllowSelfEnroll(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--lms-border)] text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="course-form-selfenroll" className="text-sm text-[var(--lms-text)]">
              Cho phép sinh viên tự đăng ký từ danh mục khóa học
            </label>
          </div>
        </form>
      </Modal>

      {/* Lecturer / Admin Enrollment Settings Modal */}
      <Modal
        isOpen={Boolean(settingsCourse)}
        onClose={() => setSettingsCourse(null)}
        title="Cấu hình ghi danh lớp học"
        subtitle={
          settingsCourse
            ? `${settingsCourse.courseCode ?? settingsCourse.code} - ${settingsCourse.title}`
            : undefined
        }
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSettingsCourse(null)}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="enrollment-settings-form"
              disabled={submittingSettings}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submittingSettings ? 'Đang cập nhật...' : 'Lưu cài đặt'}
            </button>
          </>
        }
      >
        <form id="enrollment-settings-form" onSubmit={handleSaveEnrollmentSettings} className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              id="settings-allow-self-enroll"
              type="checkbox"
              checked={settingsAllowSelfEnroll}
              onChange={(e) => setSettingsAllowSelfEnroll(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--lms-border)] text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="settings-allow-self-enroll" className="text-sm text-[var(--lms-text)]">
              Cho phép sinh viên tự đăng ký trực tiếp
            </label>
          </div>

          <div>
            <label
              htmlFor="settings-join-code"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Mã lớp tham gia
            </label>
            <input
              id="settings-join-code"
              type="text"
              value={settingsJoinCode}
              onChange={(e) => setSettingsJoinCode(e.target.value)}
              placeholder="Ví dụ: WEB2026"
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="settings-max-students"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Sĩ số tối đa
              </label>
              <input
                id="settings-max-students"
                type="number"
                min={1}
                value={settingsMaxStudents}
                onChange={(e) => setSettingsMaxStudents(e.target.value)}
                placeholder="Không giới hạn"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="settings-category"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Nhóm học phần
              </label>
              <input
                id="settings-category"
                type="text"
                value={settingsCategory}
                onChange={(e) => setSettingsCategory(e.target.value)}
                placeholder="Chuyên ngành"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
