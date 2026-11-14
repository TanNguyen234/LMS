import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  Download,
  FileText,
  Info,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import {
  learningApi,
  type ManualGradeCreatePayload,
  type ManualGradeUpdatePayload,
  type StudentTranscriptResponse,
  type TranscriptCourseEntry,
} from '../api/learning';
import { useAuth } from '../auth/AuthContext';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Modal } from '../components/ui/Modal';
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { exportToCsv, printSection } from '../utils/exportUtils';
import {
  convertScore10ToGpa4,
  formatDateTimeVi,
  formatEnrollmentStatus,
  formatSourceType,
} from '../utils/formatters';
import type { Course, Enrollment, Grade } from '../types';

type StudentGradeTab = 'course-grades' | 'transcript' | 'chart';
type StaffGradeTab = 'gradebook' | 'enrollments';
type ManualSourceType = 'MANUAL' | 'MIDTERM' | 'FINAL';

const MANUAL_SOURCE_TYPES = new Set(['MANUAL', 'MIDTERM', 'FINAL']);

function getSourceBadge(type: string): { label: string; variant: BadgeVariant; icon: React.ReactNode } {
  switch (type?.toUpperCase()) {
    case 'ASSIGNMENT':
      return {
        label: formatSourceType('ASSIGNMENT'),
        variant: 'primary',
        icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'QUIZ':
      return {
        label: formatSourceType('QUIZ'),
        variant: 'info',
        icon: <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'MIDTERM':
      return {
        label: formatSourceType('MIDTERM'),
        variant: 'warning',
        icon: <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    case 'FINAL':
      return {
        label: formatSourceType('FINAL'),
        variant: 'success',
        icon: <Award className="w-3.5 h-3.5" aria-hidden="true" />,
      };
    default:
      return {
        label: formatSourceType(type || 'MANUAL'),
        variant: 'neutral',
        icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" />,
      };
  }
}

function getCoursePassStatus(
  score10: number | null | undefined,
  gradesCount: number,
): { label: string; variant: BadgeVariant } {
  if (gradesCount === 0 || score10 == null) {
    return { label: 'Chưa có điểm', variant: 'neutral' };
  }
  if (score10 < 4.0) {
    return { label: 'Chưa đạt', variant: 'danger' };
  }
  return { label: 'Đạt', variant: 'success' };
}

function computeCourseSummaryFromGrades(grades: Grade[]): {
  finalScore10: number | null;
  totalWeightPercent: number;
  hasExplicitWeights: boolean;
} {
  if (grades.length === 0) {
    return { finalScore10: null, totalWeightPercent: 0, hasExplicitWeights: false };
  }
  const weightedItems = grades.filter(
    (g) => (g.weightPercent ?? g.weight_percent) != null && Number(g.weightPercent ?? g.weight_percent) > 0,
  );
  if (weightedItems.length > 0) {
    const totalWeight = weightedItems.reduce(
      (acc, g) => acc + Number(g.weightPercent ?? g.weight_percent ?? 0),
      0,
    );
    const weightedSum = weightedItems.reduce((acc, g) => {
      const maxVal = g.maxScore || g.max_score || 10;
      const w = Number(g.weightPercent ?? g.weight_percent ?? 0);
      const score10 = maxVal > 0 ? (g.score / maxVal) * 10 : 0;
      return acc + score10 * w;
    }, 0);
    return {
      finalScore10: totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : null,
      totalWeightPercent: Number(totalWeight.toFixed(1)),
      hasExplicitWeights: true,
    };
  }

  const avg =
    grades.reduce((acc, g) => {
      const maxVal = g.maxScore || g.max_score || 10;
      return acc + (maxVal > 0 ? (g.score / maxVal) * 10 : 0);
    }, 0) / grades.length;
  return {
    finalScore10: Number(avg.toFixed(2)),
    totalWeightPercent: 0,
    hasExplicitWeights: false,
  };
}

export const GradesPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const isStudent = user?.role === 'STUDENT';

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [grades, setGrades] = useState<Grade[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [transcript, setTranscript] = useState<StudentTranscriptResponse | null>(null);

  const [studentTab, setStudentTab] = useState<StudentGradeTab>('course-grades');
  const [staffTab, setStaffTab] = useState<StaffGradeTab>('gradebook');

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staff filters & Manual Grade Modal
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [formStudentId, setFormStudentId] = useState('');
  const [formSourceType, setFormSourceType] = useState<ManualSourceType>('MANUAL');
  const [formItemTitle, setFormItemTitle] = useState('');
  const [formScore, setFormScore] = useState('8.0');
  const [formMaxScore, setFormMaxScore] = useState('10');
  const [formWeightPercent, setFormWeightPercent] = useState('');
  const [formFeedback, setFormFeedback] = useState('');
  const [submittingGrade, setSubmittingGrade] = useState(false);
  const [completingStudentId, setCompletingStudentId] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    try {
      setLoadingInit(true);
      setError(null);
      if (isStudent) {
        const [courseList, transcriptData] = await Promise.all([
          learningApi.getCourses(),
          learningApi.getMyTranscript(),
        ]);
        setCourses(courseList);
        setTranscript(transcriptData);
        setSelectedCourseId((prev) => {
          if (prev && courseList.some((c) => String(c.courseId ?? c.id) === prev)) {
            return prev;
          }
          return courseList.length > 0 ? String(courseList[0].courseId ?? courseList[0].id) : '';
        });
      } else {
        const courseList = await learningApi.getCourses();
        setCourses(courseList);
        setSelectedCourseId((prev) => {
          if (prev && courseList.some((c) => String(c.courseId ?? c.id) === prev)) {
            return prev;
          }
          return courseList.length > 0 ? String(courseList[0].courseId ?? courseList[0].id) : '';
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu bảng điểm');
    } finally {
      setLoadingInit(false);
    }
  }, [isStudent]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        return loadInitialData();
      }
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [loadInitialData]);

  const fetchCourseGrades = useCallback(async () => {
    if (!selectedCourseId) {
      setGrades([]);
      setEnrollments([]);
      return;
    }
    try {
      setLoadingGrades(true);
      setError(null);
      if (isStudent) {
        const [myGrades, transcriptData] = await Promise.all([
          learningApi.getMyGrades(selectedCourseId),
          learningApi.getMyTranscript(),
        ]);
        setGrades(myGrades);
        setTranscript(transcriptData);
      } else {
        const [book, enrollmentRows] = await Promise.all([
          learningApi.getCourseGradebook(selectedCourseId),
          learningApi.getCourseEnrollments(selectedCourseId),
        ]);
        setGrades(book);
        setEnrollments(enrollmentRows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải điểm của khóa học');
    } finally {
      setLoadingGrades(false);
    }
  }, [isStudent, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        return fetchCourseGrades();
      }
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCourseId, fetchCourseGrades]);

  const selectedCourse = useMemo(
    () => courses.find((c) => String(c.courseId ?? c.id) === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const selectedTranscriptCourse = useMemo(() => {
    if (!transcript || !selectedCourseId) return null;
    return transcript.courses.find((c) => String(c.courseId) === selectedCourseId) || null;
  }, [transcript, selectedCourseId]);

  const currentCourseStats = useMemo(() => {
    if (selectedTranscriptCourse) {
      return {
        finalScore10: selectedTranscriptCourse.finalScore10 ?? null,
        totalWeightPercent: selectedTranscriptCourse.totalWeightPercent,
        gradesCount: selectedTranscriptCourse.gradesCount,
      };
    }
    const local = computeCourseSummaryFromGrades(grades);
    return {
      finalScore10: local.finalScore10,
      totalWeightPercent: local.totalWeightPercent,
      gradesCount: grades.length,
    };
  }, [selectedTranscriptCourse, grades]);

  const activeEnrollmentsForSelect = useMemo(
    () => enrollments.filter((enr) => enr.status !== 'DROPPED'),
    [enrollments],
  );

  const filteredStaffGrades = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return grades.filter((g) => {
      const sType = (g.sourceType ?? g.source_type ?? '').toUpperCase();
      if (sourceFilter !== 'ALL' && sType !== sourceFilter) return false;
      if (!q) return true;
      const sName = (g.studentName ?? g.student_name ?? '').toLowerCase();
      const sCode = (g.studentCode ?? '').toLowerCase();
      const title = (g.itemTitle ?? '').toLowerCase();
      return sName.includes(q) || sCode.includes(q) || title.includes(q);
    });
  }, [grades, searchQuery, sourceFilter]);

  const staffCourseSummary = useMemo(() => {
    const scoredEnrollments = activeEnrollmentsForSelect.filter((e) => e.finalScore != null);
    const avg =
      scoredEnrollments.length > 0
        ? scoredEnrollments.reduce((acc, e) => acc + Number(e.finalScore ?? 0), 0) /
          scoredEnrollments.length
        : null;
    const passedCount = scoredEnrollments.filter((e) => Number(e.finalScore ?? 0) >= 5.0).length;
    return {
      totalStudents: activeEnrollmentsForSelect.length,
      scoredStudents: scoredEnrollments.length,
      average10: avg != null ? Number(avg.toFixed(2)) : null,
      passRate:
        scoredEnrollments.length > 0
          ? Math.round((passedCount / scoredEnrollments.length) * 100)
          : null,
    };
  }, [activeEnrollmentsForSelect]);

  const openCreateGradeModal = () => {
    setEditingGrade(null);
    setFormStudentId(
      activeEnrollmentsForSelect.length > 0
        ? String(activeEnrollmentsForSelect[0].studentId ?? activeEnrollmentsForSelect[0].student_id)
        : '',
    );
    setFormSourceType('MANUAL');
    setFormItemTitle('');
    setFormScore('8.0');
    setFormMaxScore('10');
    setFormWeightPercent('');
    setFormFeedback('');
    setIsGradeModalOpen(true);
  };

  const openEditGradeModal = (grade: Grade) => {
    const rawType = (grade.sourceType ?? grade.source_type ?? 'MANUAL').toUpperCase();
    const safeType: ManualSourceType =
      rawType === 'MIDTERM' || rawType === 'FINAL' ? rawType : 'MANUAL';
    setEditingGrade(grade);
    setFormStudentId(String(grade.studentId ?? grade.student_id));
    setFormSourceType(safeType);
    setFormItemTitle(grade.itemTitle || '');
    setFormScore(String(grade.score));
    setFormMaxScore(String(grade.maxScore ?? grade.max_score ?? 10));
    const wt = grade.weightPercent ?? grade.weight_percent;
    setFormWeightPercent(wt != null ? String(wt) : '');
    setFormFeedback(grade.feedback || '');
    setIsGradeModalOpen(true);
  };

  const handleSaveManualGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) return;

    const numericScore = Number(formScore);
    const numericMax = Number(formMaxScore);
    const trimmedWeight = formWeightPercent.trim();
    const numericWeight = trimmedWeight === '' ? null : Number(trimmedWeight);

    if (!formItemTitle.trim()) {
      toast.error('Vui lòng nhập tên đầu điểm');
      return;
    }
    if (!Number.isFinite(numericMax) || numericMax <= 0) {
      toast.error('Điểm tối đa phải lớn hơn 0');
      return;
    }
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > numericMax) {
      toast.error(`Điểm số phải nằm trong khoảng từ 0 đến ${numericMax}`);
      return;
    }
    if (
      numericWeight !== null &&
      (!Number.isFinite(numericWeight) || numericWeight < 0 || numericWeight > 100)
    ) {
      toast.error('Trọng số phải nằm trong khoảng từ 0 đến 100%');
      return;
    }

    try {
      setSubmittingGrade(true);
      if (editingGrade) {
        const gradeId = String(editingGrade.gradeId ?? editingGrade.id);
        const payload: ManualGradeUpdatePayload = {
          itemTitle: formItemTitle.trim(),
          sourceType: formSourceType,
          score: numericScore,
          maxScore: numericMax,
          weightPercent: numericWeight,
          feedback: formFeedback.trim() || null,
        };
        await learningApi.updateManualGrade(gradeId, payload);
        toast.success('Đã cập nhật đầu điểm thành công');
      } else {
        if (!formStudentId) {
          toast.error('Vui lòng chọn sinh viên');
          return;
        }
        const payload: ManualGradeCreatePayload = {
          studentId: formStudentId,
          itemTitle: formItemTitle.trim(),
          sourceType: formSourceType,
          score: numericScore,
          maxScore: numericMax,
          weightPercent: numericWeight,
          feedback: formFeedback.trim() || null,
        };
        await learningApi.createManualGrade(selectedCourseId, payload);
        toast.success('Đã thêm đầu điểm thủ công thành công');
      }
      setIsGradeModalOpen(false);
      await fetchCourseGrades();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu đầu điểm');
    } finally {
      setSubmittingGrade(false);
    }
  };

  const handleDeleteManualGrade = async (grade: Grade) => {
    const ok = await confirm({
      title: 'Xóa đầu điểm thủ công',
      message: `Bạn có chắc muốn xóa đầu điểm "${grade.itemTitle || formatSourceType(grade.sourceType)}" của sinh viên ${grade.studentName || ''}? Điểm tổng kết sẽ được tính lại tự động.`,
      confirmText: 'Xóa điểm',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const gradeId = String(grade.gradeId ?? grade.id);
      await learningApi.deleteManualGrade(gradeId);
      toast.success('Đã xóa đầu điểm và đồng bộ điểm tổng kết');
      await fetchCourseGrades();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa đầu điểm');
    }
  };

  const handleCompleteStudentEnrollment = async (enrollment: Enrollment) => {
    if (!selectedCourseId) return;
    const studentId = String(enrollment.studentId ?? enrollment.student_id);
    const ok = await confirm({
      title: 'Xác nhận hoàn thành học phần',
      message: `Đánh dấu sinh viên ${enrollment.studentName || studentId} đã hoàn thành môn học này? Điểm tổng kết chính thức sẽ được chốt vào bảng điểm.`,
      confirmText: 'Hoàn thành môn',
      variant: 'primary',
    });
    if (!ok) return;

    try {
      setCompletingStudentId(studentId);
      await learningApi.completeEnrollment(selectedCourseId, studentId);
      toast.success('Đã xác nhận hoàn thành học phần cho sinh viên');
      await fetchCourseGrades();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể hoàn thành ghi danh');
    } finally {
      setCompletingStudentId(null);
    }
  };

  const handleExportCsv = () => {
    if (isStudent) {
      if (studentTab === 'transcript' || studentTab === 'chart') {
        const rows = (transcript?.courses ?? []).map((c) => {
          const st = getCoursePassStatus(c.finalScore10, c.gradesCount);
          return [
            c.courseCode,
            c.title,
            `${c.semester} - ${c.academicYear}`,
            c.credits,
            formatEnrollmentStatus(c.enrollmentStatus),
            c.finalScore10 != null ? c.finalScore10.toFixed(2) : '',
            c.gpa4 != null ? c.gpa4.toFixed(1) : '',
            c.letterGrade ?? '',
            st.label,
            c.totalWeightPercent > 0 ? `${c.totalWeightPercent}%` : 'Bình quân',
          ];
        });
        exportToCsv(
          'Bang_diem_tong_hop.csv',
          [
            'Mã môn',
            'Tên học phần',
            'Học kỳ',
            'Tín chỉ',
            'Trạng thái ghi danh',
            'Điểm hệ 10',
            'GPA hệ 4',
            'Điểm chữ',
            'Kết quả',
            'Tổng trọng số',
          ],
          rows,
        );
      } else {
        const courseCode = selectedCourse?.courseCode ?? selectedCourse?.code ?? 'MON_HOC';
        const rows = grades.map((g) => {
          const maxVal = g.maxScore || g.max_score || 10;
          const wt = g.weightPercent ?? g.weight_percent;
          const score10 = maxVal > 0 ? ((g.score / maxVal) * 10).toFixed(2) : '';
          return [
            courseCode,
            g.itemTitle || formatSourceType(g.sourceType),
            formatSourceType(g.sourceType ?? g.source_type),
            g.score,
            maxVal,
            score10,
            wt != null ? `${wt}%` : 'Chưa gán',
            g.feedback || '',
            formatDateTimeVi(g.gradedAt ?? g.graded_at),
          ];
        });
        exportToCsv(
          `Bang_diem_${courseCode}.csv`,
          [
            'Mã môn',
            'Đầu điểm',
            'Loại',
            'Điểm gốc',
            'Điểm tối đa',
            'Quy đổi hệ 10',
            'Trọng số',
            'Nhận xét',
            'Ngày chấm',
          ],
          rows,
        );
      }
      toast.success('Đã xuất file CSV bảng điểm (UTF-8)');
      return;
    }

    const courseCode = selectedCourse?.courseCode ?? selectedCourse?.code ?? 'LOP';
    if (staffTab === 'enrollments') {
      const rows = activeEnrollmentsForSelect.map((enr) => {
        const st = getCoursePassStatus(enr.finalScore ?? null, enr.finalScore != null ? 1 : 0);
        const gpaInfo = enr.finalScore != null ? convertScore10ToGpa4(enr.finalScore) : null;
        return [
          enr.studentName || '',
          enr.studentCode || '',
          enr.studentEmail || '',
          formatEnrollmentStatus(enr.status),
          enr.finalScore != null ? enr.finalScore.toFixed(2) : 'Chưa có điểm',
          gpaInfo ? gpaInfo.gpa4.toFixed(1) : '',
          gpaInfo ? gpaInfo.letterGrade : '',
          st.label,
        ];
      });
      exportToCsv(
        `Tong_ket_${courseCode}.csv`,
        [
          'Họ và tên',
          'Mã sinh viên',
          'Email',
          'Trạng thái học',
          'Điểm tổng kết (10)',
          'GPA hệ 4',
          'Điểm chữ',
          'Kết quả',
        ],
        rows,
      );
    } else {
      const rows = filteredStaffGrades.map((g) => {
        const maxVal = g.maxScore || g.max_score || 10;
        const wt = g.weightPercent ?? g.weight_percent;
        return [
          g.studentName || '',
          g.studentCode || '',
          g.itemTitle || formatSourceType(g.sourceType),
          formatSourceType(g.sourceType ?? g.source_type),
          g.score,
          maxVal,
          wt != null ? `${wt}%` : 'Chưa gán',
          g.feedback || '',
          formatDateTimeVi(g.gradedAt ?? g.graded_at),
        ];
      });
      exportToCsv(
        `So_diem_${courseCode}.csv`,
        [
          'Sinh viên',
          'Mã sinh viên',
          'Tên đầu điểm',
          'Loại',
          'Điểm',
          'Điểm tối đa',
          'Trọng số',
          'Nhận xét',
          'Ngày chấm',
        ],
        rows,
      );
    }
    toast.success('Đã xuất file CSV sổ điểm (UTF-8)');
  };

  const studentCourseGradeColumns: DataTableColumn<Grade>[] = [
    {
      key: 'itemTitle',
      header: 'Đầu điểm',
      sortable: true,
      sortValue: (row) => row.itemTitle || row.sourceType,
      render: (row) => (
        <div>
          <div className="font-semibold text-[var(--lms-text)]">
            {row.itemTitle || formatSourceType(row.sourceType ?? row.source_type)}
          </div>
          <div className="text-xs text-[var(--lms-text-muted)]">
            {selectedCourse?.courseCode ?? selectedCourse?.code ?? ''}
          </div>
        </div>
      ),
    },
    {
      key: 'sourceType',
      header: 'Loại',
      sortable: true,
      sortValue: (row) => row.sourceType ?? row.source_type ?? '',
      render: (row) => {
        const meta = getSourceBadge(row.sourceType ?? row.source_type ?? 'MANUAL');
        return (
          <Badge variant={meta.variant}>
            {meta.icon}
            <span>{meta.label}</span>
          </Badge>
        );
      },
    },
    {
      key: 'score',
      header: 'Điểm số',
      sortable: true,
      sortValue: (row) => row.score,
      render: (row) => {
        const maxVal = row.maxScore || row.max_score || 10;
        const scale10 = maxVal > 0 ? (row.score / maxVal) * 10 : 0;
        return (
          <div className="tabular-nums">
            <span className="font-bold text-blue-600 dark:text-blue-400">{row.score}</span>
            <span className="text-xs text-[var(--lms-text-muted)]"> / {maxVal}</span>
            {maxVal !== 10 && (
              <span className="block text-xs text-[var(--lms-text-muted)]">
                ({scale10.toFixed(2)} / 10)
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'weight',
      header: 'Trọng số',
      sortable: true,
      sortValue: (row) => Number(row.weightPercent ?? row.weight_percent ?? 0),
      render: (row) => {
        const wt = row.weightPercent ?? row.weight_percent;
        return (
          <span className="text-sm tabular-nums text-[var(--lms-text)]">
            {wt != null && wt > 0 ? `${wt}%` : 'Chưa gán'}
          </span>
        );
      },
    },
    {
      key: 'feedback',
      header: 'Nhận xét',
      render: (row) => (
        <span className="text-xs text-[var(--lms-text-muted)]">
          {row.feedback || 'Không có nhận xét'}
        </span>
      ),
    },
    {
      key: 'gradedAt',
      header: 'Ngày chấm',
      sortable: true,
      sortValue: (row) => new Date(row.gradedAt ?? row.graded_at).getTime(),
      render: (row) => (
        <span className="text-xs tabular-nums text-[var(--lms-text-muted)]">
          {formatDateTimeVi(row.gradedAt ?? row.graded_at)}
        </span>
      ),
    },
  ];

  const transcriptColumns: DataTableColumn<TranscriptCourseEntry>[] = [
    {
      key: 'course',
      header: 'Học phần',
      sortable: true,
      sortValue: (row) => row.courseCode,
      render: (row) => (
        <div>
          <div className="font-semibold text-[var(--lms-text)]">
            {row.courseCode} - {row.title}
          </div>
          <div className="text-xs text-[var(--lms-text-muted)] tabular-nums">
            {[row.semester, row.academicYear].filter(Boolean).join(' - ')}
          </div>
        </div>
      ),
    },
    {
      key: 'credits',
      header: 'Tín chỉ',
      sortable: true,
      align: 'center',
      sortValue: (row) => row.credits,
      render: (row) => <span className="tabular-nums font-medium">{row.credits}</span>,
    },
    {
      key: 'enrollmentStatus',
      header: 'Ghi danh',
      render: (row) => (
        <Badge variant={row.enrollmentStatus === 'COMPLETED' ? 'success' : 'primary'}>
          {formatEnrollmentStatus(row.enrollmentStatus)}
        </Badge>
      ),
    },
    {
      key: 'finalScore10',
      header: 'Hệ 10',
      sortable: true,
      align: 'right',
      sortValue: (row) => row.finalScore10 ?? -1,
      render: (row) => (
        <span className="font-bold tabular-nums text-[var(--lms-text)]">
          {row.finalScore10 != null ? row.finalScore10.toFixed(2) : 'Chưa có điểm'}
        </span>
      ),
    },
    {
      key: 'gpa4',
      header: 'Hệ 4 / Chữ',
      align: 'center',
      render: (row) =>
        row.gpa4 != null ? (
          <span className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {row.gpa4.toFixed(1)} ({row.letterGrade})
          </span>
        ) : (
          <span className="text-xs text-[var(--lms-text-muted)]">--</span>
        ),
    },
    {
      key: 'result',
      header: 'Kết quả',
      render: (row) => {
        const st = getCoursePassStatus(row.finalScore10, row.gradesCount);
        return <Badge variant={st.variant}>{st.label}</Badge>;
      },
    },
    {
      key: 'weight',
      header: 'Trọng số đã tính',
      align: 'right',
      render: (row) => (
        <span className="text-xs tabular-nums text-[var(--lms-text-muted)]">
          {row.totalWeightPercent > 0
            ? `${row.totalWeightPercent}%`
            : row.gradesCount > 0
              ? 'Bình quân'
              : '--'}
        </span>
      ),
    },
  ];

  const staffGradeColumns: DataTableColumn<Grade>[] = [
    {
      key: 'student',
      header: 'Sinh viên',
      sortable: true,
      sortValue: (row) => row.studentName ?? row.student_name ?? '',
      render: (row) => (
        <div>
          <div className="font-semibold text-[var(--lms-text)]">
            {row.studentName ?? row.student_name ?? 'Sinh viên'}
          </div>
          {row.studentCode && (
            <div className="text-xs font-mono text-[var(--lms-text-muted)]">{row.studentCode}</div>
          )}
        </div>
      ),
    },
    {
      key: 'itemTitle',
      header: 'Đầu điểm',
      sortable: true,
      sortValue: (row) => row.itemTitle || '',
      render: (row) => (
        <span className="font-medium text-[var(--lms-text)]">
          {row.itemTitle || formatSourceType(row.sourceType ?? row.source_type)}
        </span>
      ),
    },
    {
      key: 'sourceType',
      header: 'Loại',
      render: (row) => {
        const meta = getSourceBadge(row.sourceType ?? row.source_type ?? 'MANUAL');
        return (
          <Badge variant={meta.variant}>
            {meta.icon}
            <span>{meta.label}</span>
          </Badge>
        );
      },
    },
    {
      key: 'score',
      header: 'Điểm số',
      sortable: true,
      sortValue: (row) => row.score,
      render: (row) => {
        const maxVal = row.maxScore || row.max_score || 10;
        return (
          <span className="tabular-nums">
            <strong className="text-blue-600 dark:text-blue-400">{row.score}</strong>
            <span className="text-xs text-[var(--lms-text-muted)]"> / {maxVal}</span>
          </span>
        );
      },
    },
    {
      key: 'weight',
      header: 'Trọng số',
      render: (row) => {
        const wt = row.weightPercent ?? row.weight_percent;
        return (
          <span className="text-sm tabular-nums text-[var(--lms-text)]">
            {wt != null && wt > 0 ? `${wt}%` : 'Chưa gán'}
          </span>
        );
      },
    },
    {
      key: 'gradedAt',
      header: 'Ngày chấm',
      sortable: true,
      sortValue: (row) => new Date(row.gradedAt ?? row.graded_at).getTime(),
      render: (row) => (
        <span className="text-xs tabular-nums text-[var(--lms-text-muted)]">
          {formatDateTimeVi(row.gradedAt ?? row.graded_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (row) => {
        const sType = (row.sourceType ?? row.source_type ?? '').toUpperCase();
        if (!MANUAL_SOURCE_TYPES.has(sType)) {
          return (
            <span className="text-xs text-[var(--lms-text-muted)]">Đồng bộ tự động</span>
          );
        }
        return (
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEditGradeModal(row)}
              aria-label={`Sửa đầu điểm ${row.itemTitle || ''}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--lms-border)] text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sửa</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteManualGrade(row)}
              aria-label={`Xóa đầu điểm ${row.itemTitle || ''}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/70 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Xóa</span>
            </button>
          </div>
        );
      },
    },
  ];

  const staffEnrollmentColumns: DataTableColumn<Enrollment>[] = [
    {
      key: 'student',
      header: 'Sinh viên',
      sortable: true,
      sortValue: (row) => row.studentName ?? row.student_name ?? '',
      render: (row) => (
        <div>
          <div className="font-semibold text-[var(--lms-text)]">
            {row.studentName ?? row.student_name ?? 'Sinh viên'}
          </div>
          <div className="text-xs text-[var(--lms-text-muted)]">
            {[row.studentCode, row.studentEmail ?? row.student_email].filter(Boolean).join(' • ')}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái học',
      render: (row) => (
        <Badge variant={row.status === 'COMPLETED' ? 'success' : 'primary'}>
          {formatEnrollmentStatus(row.status)}
        </Badge>
      ),
    },
    {
      key: 'finalScore',
      header: 'Tổng kết (10)',
      sortable: true,
      align: 'right',
      sortValue: (row) => row.finalScore ?? -1,
      render: (row) => (
        <span className="font-bold tabular-nums text-[var(--lms-text)]">
          {row.finalScore != null ? row.finalScore.toFixed(2) : 'Chưa có điểm'}
        </span>
      ),
    },
    {
      key: 'gpa',
      header: 'GPA / Xếp loại',
      align: 'center',
      render: (row) => {
        if (row.finalScore == null) {
          return <Badge variant="neutral">Chưa có điểm</Badge>;
        }
        const conv = convertScore10ToGpa4(row.finalScore);
        const st = getCoursePassStatus(row.finalScore, 1);
        return (
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-[var(--lms-text)]">
              {conv.gpa4.toFixed(1)} ({conv.letterGrade})
            </span>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
        );
      },
    },
    {
      key: 'completeAction',
      header: 'Chốt hoàn thành',
      align: 'right',
      render: (row) => {
        if (row.status === 'COMPLETED') {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Đã chốt</span>
            </span>
          );
        }
        const sid = String(row.studentId ?? row.student_id);
        return (
          <button
            type="button"
            disabled={completingStudentId === sid}
            onClick={() => void handleCompleteStudentEnrollment(row)}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{completingStudentId === sid ? 'Đang chốt...' : 'Hoàn thành môn'}</span>
          </button>
        );
      },
    },
  ];

  // SVG chart layout constants
  const chartCourses = transcript?.courses ?? [];
  const chartWidth = Math.max(560, chartCourses.length * 108 + 90);
  const chartHeight = 250;
  const plotLeft = 48;
  const plotRight = chartWidth - 24;
  const plotTop = 24;
  const plotBottom = 200;
  const plotHeight = plotBottom - plotTop;
  const passLineY = plotBottom - (5 / 10) * plotHeight;

  const selectedCourseStatus = getCoursePassStatus(
    currentCourseStats.finalScore10,
    currentCourseStats.gradesCount,
  );
  const selectedCourseGpa =
    currentCourseStats.finalScore10 != null
      ? convertScore10ToGpa4(currentCourseStats.finalScore10)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--lms-text)] tracking-tight">
            {isStudent ? 'Bảng điểm & Kết quả học tập' : 'Sổ điểm Lớp học phần'}
          </h1>
          <p className="text-sm text-[var(--lms-text-muted)] mt-1">
            {isStudent
              ? 'Theo dõi điểm thành phần theo trọng số, GPA tạm tính / chính thức thang 4.0 và xuất bảng điểm'
              : 'Quản lý điểm thành phần, thêm đầu điểm giữa kỳ/cuối kỳ và đồng bộ điểm tổng kết'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          {!isStudent && selectedCourseId && (
            <button
              type="button"
              onClick={openCreateGradeModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Thêm đầu điểm</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loadingInit}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] hover:bg-[var(--lms-surface-muted)] text-sm font-medium text-[var(--lms-text)] transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Xuất CSV</span>
          </button>
          <button
            type="button"
            onClick={() => printSection(isStudent ? 'Bang_Diem_Ca_Nhan' : 'So_Diem_Lop_Hoc')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] hover:bg-[var(--lms-surface-muted)] text-sm font-medium text-[var(--lms-text)] transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>In bảng điểm</span>
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadInitialData()} />}

      {loadingInit ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SkeletonCard lines={2} showHeader={false} />
            <SkeletonCard lines={2} showHeader={false} />
            <SkeletonCard lines={2} showHeader={false} />
          </div>
          <SkeletonTable rows={5} columns={5} />
        </div>
      ) : isStudent ? (
        <>
          {/* Student GPA & Current Course KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--lms-surface)] p-5 rounded-2xl border border-[var(--lms-border)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase">
                  GPA chính thức (Thang 4.0)
                </span>
                <Badge variant="success">Đã hoàn thành</Badge>
              </div>
              <div className="flex items-baseline gap-2 mt-2 tabular-nums">
                <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {transcript?.officialGpaScale4 != null
                    ? transcript.officialGpaScale4.toFixed(2)
                    : 'Chưa có điểm'}
                </span>
                {transcript?.officialGpaScale4 != null && (
                  <span className="text-xs text-[var(--lms-text-muted)]">/ 4.00</span>
                )}
              </div>
              <p className="text-xs text-[var(--lms-text-muted)] mt-1 tabular-nums">
                Tín chỉ hoàn thành: {transcript?.completedCredits ?? 0} tín chỉ
              </p>
            </div>

            <div className="bg-[var(--lms-surface)] p-5 rounded-2xl border border-[var(--lms-border)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase">
                  GPA tạm tính (Thang 4.0)
                </span>
                <Badge variant="info">Đang học + Đã chốt</Badge>
              </div>
              <div className="flex items-baseline gap-2 mt-2 tabular-nums">
                <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                  {transcript?.provisionalGpaScale4 != null
                    ? transcript.provisionalGpaScale4.toFixed(2)
                    : 'Chưa có điểm'}
                </span>
                {transcript?.provisionalGpaScale4 != null && (
                  <span className="text-xs text-[var(--lms-text-muted)]">
                    / 4.00 ({transcript.provisionalGpaScale10?.toFixed(2)} / 10)
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--lms-text-muted)] mt-1 tabular-nums">
                Tổng tín chỉ có điểm: {transcript?.attemptedCredits ?? 0} / {transcript?.totalCredits ?? 0}
              </p>
            </div>

            <div className="bg-[var(--lms-surface)] p-5 rounded-2xl border border-[var(--lms-border)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase">
                  Môn đang chọn (Hệ 10)
                </span>
                <Badge variant={selectedCourseStatus.variant}>{selectedCourseStatus.label}</Badge>
              </div>
              <div className="flex items-baseline gap-2 mt-2 tabular-nums">
                <span className="text-3xl font-extrabold text-[var(--lms-text)]">
                  {currentCourseStats.finalScore10 != null
                    ? currentCourseStats.finalScore10.toFixed(2)
                    : 'Chưa có điểm'}
                </span>
                {selectedCourseGpa && (
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    GPA {selectedCourseGpa.gpa4.toFixed(1)} ({selectedCourseGpa.letterGrade})
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--lms-text-muted)] mt-1 truncate">
                {selectedCourse
                  ? `${selectedCourse.courseCode ?? selectedCourse.code} - ${selectedCourse.title}`
                  : 'Chưa chọn môn học'}
              </p>
            </div>
          </div>

          <Tabs
            idPrefix="grades-student-tabs"
            ariaLabel="Chế độ xem bảng điểm"
            activeId={studentTab}
            onChange={(id) => setStudentTab(id as StudentGradeTab)}
            items={[
              { id: 'course-grades', label: 'Điểm chi tiết theo môn', badge: grades.length },
              {
                id: 'transcript',
                label: 'Bảng điểm tổng hợp đa môn',
                badge: transcript?.courses.length ?? 0,
              },
              { id: 'chart', label: 'Biểu đồ trực quan' },
            ]}
          />

          <TabPanel id="course-grades" activeId={studentTab} idPrefix="grades-student-tabs">
            <div className="space-y-4">
              {courses.length === 0 ? (
                <EmptyState
                  title="Bạn chưa ghi danh khóa học nào"
                  description="Hãy đăng ký học phần ở mục Khóa học để theo dõi điểm số và GPA."
                />
              ) : (
                <>
                  <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1">
                      <label
                        htmlFor="student-grade-course-select"
                        className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase tracking-wider shrink-0"
                      >
                        Khóa học:
                      </label>
                      <select
                        id="student-grade-course-select"
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="w-full sm:w-96 px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm font-medium text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                      >
                        {courses.map((c) => {
                          const cid = String(c.courseId ?? c.id);
                          const ccode = c.courseCode ?? c.code;
                          return (
                            <option key={cid} value={cid}>
                              {ccode} - {c.title}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="text-xs text-[var(--lms-text-muted)] tabular-nums">
                      Tổng trọng số đã có:{' '}
                      <strong className="text-[var(--lms-text)]">
                        {currentCourseStats.totalWeightPercent > 0
                          ? `${currentCourseStats.totalWeightPercent}%`
                          : 'Chưa gán (tính bình quân)'}
                      </strong>
                    </div>
                  </div>

                  {currentCourseStats.totalWeightPercent > 0 &&
                    currentCourseStats.totalWeightPercent < 100 && (
                      <div
                        role="status"
                        className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-100"
                      >
                        <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                          Tổng trọng số các đầu điểm hiện tại là{' '}
                          <strong className="tabular-nums">{currentCourseStats.totalWeightPercent}%</strong>{' '}
                          (chưa đủ 100%). Điểm hệ 10 hiện tại phản ánh kết quả tạm tính trên phần đã chấm.
                        </span>
                      </div>
                    )}

                  <DataTable
                    columns={studentCourseGradeColumns}
                    data={grades}
                    loading={loadingGrades}
                    caption="Bảng điểm thành phần theo khóa học"
                    hideCaption
                    getRowKey={(row) => String(row.gradeId ?? row.id)}
                    emptyTitle="Chưa có điểm nào được ghi nhận"
                    emptyDescription="Các cột điểm bài tập, quiz và kiểm tra sẽ hiển thị tại đây ngay khi được chấm."
                  />
                </>
              )}
            </div>
          </TabPanel>

          <TabPanel id="transcript" activeId={studentTab} idPrefix="grades-student-tabs">
            <DataTable
              columns={transcriptColumns}
              data={transcript?.courses ?? []}
              caption="Bảng điểm tổng hợp đa môn của sinh viên"
              hideCaption
              getRowKey={(row) => row.courseId}
              emptyTitle="Chưa có môn học nào trong bảng điểm"
              emptyDescription="Đăng ký khóa học và hoàn thành các bài đánh giá để xem bảng điểm tổng hợp."
            />
          </TabPanel>

          <TabPanel id="chart" activeId={studentTab} idPrefix="grades-student-tabs">
            {chartCourses.length === 0 ? (
              <EmptyState
                title="Chưa có dữ liệu biểu đồ"
                description="Khi bạn có ít nhất một môn học, biểu đồ so sánh điểm hệ 10 sẽ hiển thị tại đây."
              />
            ) : (
              <div className="space-y-6">
                <div className="bg-[var(--lms-surface)] p-5 rounded-2xl border border-[var(--lms-border)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3
                        className="w-5 h-5 text-blue-600 dark:text-blue-400"
                        aria-hidden="true"
                      />
                      <h2 className="text-base font-bold text-[var(--lms-text)]">
                        So sánh điểm tổng kết hệ 10 giữa các học phần
                      </h2>
                    </div>
                    <span className="text-xs text-[var(--lms-text-muted)]">
                      Ngưỡng đạt: 5.0 / 10
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <svg
                      role="img"
                      aria-labelledby="grades-chart-title grades-chart-desc"
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="w-full min-w-[540px] max-h-72 text-[var(--lms-text)]"
                    >
                      <title id="grades-chart-title">
                        Biểu đồ cột điểm tổng kết hệ 10 theo từng học phần
                      </title>
                      <desc id="grades-chart-desc">
                        Hiển thị điểm hệ 10 từ 0 đến 10 cho từng học phần cùng đường ngưỡng đạt 5.0.
                        Dữ liệu chi tiết cũng được trình bày trong bảng số liệu thay thế ngay bên dưới.
                      </desc>

                      {[0, 2.5, 5, 7.5, 10].map((tick) => {
                        const y = plotBottom - (tick / 10) * plotHeight;
                        return (
                          <g key={tick}>
                            <line
                              x1={plotLeft}
                              y1={y}
                              x2={plotRight}
                              y2={y}
                              stroke="currentColor"
                              strokeOpacity={0.14}
                              strokeWidth={1}
                            />
                            <text
                              x={plotLeft - 8}
                              y={y + 4}
                              textAnchor="end"
                              fontSize={11}
                              fill="currentColor"
                              opacity={0.7}
                            >
                              {tick}
                            </text>
                          </g>
                        );
                      })}

                      <line
                        x1={plotLeft}
                        y1={passLineY}
                        x2={plotRight}
                        y2={passLineY}
                        stroke="#f59e0b"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                      />
                      <text
                        x={plotRight}
                        y={passLineY - 5}
                        textAnchor="end"
                        fontSize={10}
                        fontWeight={600}
                        fill="#d97706"
                      >
                        Ngưỡng đạt 5.0
                      </text>

                      {chartCourses.map((course, idx) => {
                        const slotWidth = (plotRight - plotLeft) / chartCourses.length;
                        const barWidth = Math.min(46, Math.max(24, slotWidth * 0.5));
                        const x = plotLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
                        const score = course.finalScore10;
                        const val = score != null ? Math.max(0, Math.min(10, score)) : 0;
                        const barHeight = (val / 10) * plotHeight;
                        const y = plotBottom - barHeight;
                        const barColor =
                          score == null ? '#94a3b8' : score >= 5.0 ? '#10b981' : '#ef4444';

                        return (
                          <g key={course.courseId}>
                            <rect
                              x={x}
                              y={score == null ? plotBottom - 4 : y}
                              width={barWidth}
                              height={score == null ? 4 : Math.max(4, barHeight)}
                              rx={6}
                              fill={barColor}
                            />
                            <text
                              x={x + barWidth / 2}
                              y={(score == null ? plotBottom - 8 : y) - 6}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight={700}
                              fill="currentColor"
                            >
                              {score != null ? score.toFixed(1) : 'N/A'}
                            </text>
                            <text
                              x={x + barWidth / 2}
                              y={plotBottom + 18}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight={600}
                              fill="currentColor"
                              opacity={0.85}
                            >
                              {course.courseCode}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-[var(--lms-text)]">
                    Bảng số liệu thay thế biểu đồ
                  </h3>
                  <DataTable
                    columns={transcriptColumns}
                    data={chartCourses}
                    caption="Bảng số liệu thay thế biểu đồ điểm các học phần"
                    hideCaption
                    getRowKey={(row) => `chart-alt-${row.courseId}`}
                  />
                </div>
              </div>
            )}
          </TabPanel>
        </>
      ) : (
        /* LECTURER & ADMIN VIEW */
        <div className="space-y-5">
          {courses.length === 0 ? (
            <EmptyState
              title="Chưa có khóa học nào"
              description="Tạo khóa học hoặc được phân công giảng dạy để quản lý sổ điểm."
            />
          ) : (
            <>
              {/* Staff Course & Filter Controls */}
              <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)] grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-2">
                  <label
                    htmlFor="staff-grade-course-select"
                    className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
                  >
                    Khóa học
                  </label>
                  <select
                    id="staff-grade-course-select"
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm font-medium text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  >
                    {courses.map((c) => {
                      const cid = String(c.courseId ?? c.id);
                      const ccode = c.courseCode ?? c.code;
                      return (
                        <option key={cid} value={cid}>
                          {ccode} - {c.title}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="staff-grade-search"
                    className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
                  >
                    Tìm sinh viên / đầu điểm
                  </label>
                  <div className="relative">
                    <Search
                      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lms-text-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      id="staff-grade-search"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tên SV, mã SV, đầu điểm..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="staff-grade-source-filter"
                    className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
                  >
                    Loại đầu điểm
                  </label>
                  <select
                    id="staff-grade-source-filter"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  >
                    <option value="ALL">Tất cả loại</option>
                    <option value="ASSIGNMENT">Bài tập</option>
                    <option value="QUIZ">Bài trắc nghiệm</option>
                    <option value="MIDTERM">Điểm giữa kỳ</option>
                    <option value="FINAL">Điểm cuối kỳ</option>
                    <option value="MANUAL">Điểm thủ công</option>
                  </select>
                </div>
              </div>

              {/* Staff KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)]">
                  <span className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase">
                    Sinh viên trong lớp
                  </span>
                  <div className="text-2xl font-extrabold text-[var(--lms-text)] mt-1 tabular-nums">
                    {staffCourseSummary.totalStudents}
                  </div>
                </div>
                <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)]">
                  <span className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase">
                    Tổng cột điểm đã chấm
                  </span>
                  <div className="text-2xl font-extrabold text-[var(--lms-text)] mt-1 tabular-nums">
                    {grades.length}
                  </div>
                </div>
                <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)]">
                  <span className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase">
                    Điểm TB lớp (Hệ 10)
                  </span>
                  <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
                    {staffCourseSummary.average10 != null
                      ? staffCourseSummary.average10.toFixed(2)
                      : 'Chưa có'}
                  </div>
                </div>
                <div className="bg-[var(--lms-surface)] p-4 rounded-2xl border border-[var(--lms-border)]">
                  <span className="text-xs font-semibold text-[var(--lms-text-muted)] uppercase">
                    Tỷ lệ đạt (&gt;= 5.0)
                  </span>
                  <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    {staffCourseSummary.passRate != null ? `${staffCourseSummary.passRate}%` : 'Chưa có'}
                  </div>
                </div>
              </div>

              <Tabs
                idPrefix="grades-staff-tabs"
                ariaLabel="Chế độ xem sổ điểm giảng viên"
                activeId={staffTab}
                onChange={(id) => setStaffTab(id as StaffGradeTab)}
                items={[
                  { id: 'gradebook', label: 'Chi tiết đầu điểm', badge: filteredStaffGrades.length },
                  {
                    id: 'enrollments',
                    label: 'Tổng kết theo sinh viên',
                    badge: activeEnrollmentsForSelect.length,
                  },
                ]}
              />

              <TabPanel id="gradebook" activeId={staffTab} idPrefix="grades-staff-tabs">
                <DataTable
                  columns={staffGradeColumns}
                  data={filteredStaffGrades}
                  loading={loadingGrades}
                  caption="Sổ điểm chi tiết lớp học phần"
                  hideCaption
                  getRowKey={(row) => String(row.gradeId ?? row.id)}
                  emptyTitle="Chưa có cột điểm phù hợp"
                  emptyDescription="Hãy chấm bài tập/quiz hoặc thêm đầu điểm giữa kỳ, cuối kỳ, thủ công."
                />
              </TabPanel>

              <TabPanel id="enrollments" activeId={staffTab} idPrefix="grades-staff-tabs">
                <DataTable
                  columns={staffEnrollmentColumns}
                  data={activeEnrollmentsForSelect}
                  loading={loadingGrades}
                  caption="Bảng tổng kết điểm sinh viên theo lớp"
                  hideCaption
                  getRowKey={(row) => String(row.enrollmentId ?? row.id)}
                  emptyTitle="Chưa có sinh viên ghi danh trong lớp"
                  emptyDescription="Khi sinh viên tham gia lớp học, điểm tổng kết sẽ tự động đồng bộ tại đây."
                />
              </TabPanel>
            </>
          )}
        </div>
      )}

      {/* Manual Grade Create / Edit Modal */}
      <Modal
        isOpen={isGradeModalOpen}
        onClose={() => setIsGradeModalOpen(false)}
        title={editingGrade ? 'Cập nhật đầu điểm thủ công' : 'Thêm đầu điểm thủ công'}
        subtitle={
          selectedCourse
            ? `${selectedCourse.courseCode ?? selectedCourse.code} - ${selectedCourse.title}`
            : undefined
        }
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsGradeModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="manual-grade-form"
              disabled={submittingGrade}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submittingGrade ? 'Đang lưu...' : 'Lưu điểm'}
            </button>
          </>
        }
      >
        <form id="manual-grade-form" onSubmit={handleSaveManualGrade} className="space-y-4">
          <div>
            <label
              htmlFor="manual-grade-student"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Sinh viên
            </label>
            <select
              id="manual-grade-student"
              required
              disabled={Boolean(editingGrade)}
              value={formStudentId}
              onChange={(e) => setFormStudentId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            >
              {activeEnrollmentsForSelect.map((enr) => {
                const sid = String(enr.studentId ?? enr.student_id);
                const sname = enr.studentName ?? enr.student_name ?? sid;
                return (
                  <option key={sid} value={sid}>
                    {sname} {enr.studentCode ? `(${enr.studentCode})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="manual-grade-source"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Loại đầu điểm
              </label>
              <select
                id="manual-grade-source"
                value={formSourceType}
                onChange={(e) => setFormSourceType(e.target.value as ManualSourceType)}
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="MIDTERM">Điểm giữa kỳ</option>
                <option value="FINAL">Điểm cuối kỳ</option>
                <option value="MANUAL">Điểm thủ công / Chuyên cần</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="manual-grade-weight"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Trọng số (%)
              </label>
              <input
                id="manual-grade-weight"
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={formWeightPercent}
                onChange={(e) => setFormWeightPercent(e.target.value)}
                placeholder="Ví dụ: 30"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="manual-grade-title"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Tên đầu điểm
            </label>
            <input
              id="manual-grade-title"
              type="text"
              required
              value={formItemTitle}
              onChange={(e) => setFormItemTitle(e.target.value)}
              placeholder="Ví dụ: Thi giữa kỳ hoặc Điểm chuyên cần"
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="manual-grade-score"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Điểm đạt được
              </label>
              <input
                id="manual-grade-score"
                type="number"
                step="0.01"
                min={0}
                required
                value={formScore}
                onChange={(e) => setFormScore(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="manual-grade-max"
                className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
              >
                Điểm tối đa
              </label>
              <input
                id="manual-grade-max"
                type="number"
                step="0.01"
                min={0.1}
                required
                value={formMaxScore}
                onChange={(e) => setFormMaxScore(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="manual-grade-feedback"
              className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
            >
              Nhận xét của giảng viên
            </label>
            <textarea
              id="manual-grade-feedback"
              rows={2}
              value={formFeedback}
              onChange={(e) => setFormFeedback(e.target.value)}
              placeholder="Ghi chú đánh giá bài làm hoặc quá trình học tập..."
              className="w-full px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
