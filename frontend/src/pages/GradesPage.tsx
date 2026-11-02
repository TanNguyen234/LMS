import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  CheckSquare,
  Search,
  FileSpreadsheet,
  CheckCircle2,
  Table,
  List,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { formatScore } from '../utils/vi';
import { useToast } from '../components/common/Toast';
import { useDebounce } from '../utils/useDebounce';
import { TableRowSkeleton } from '../components/common/Skeleton';
import type { Grade, Course } from '../types';

interface MatrixStudent {
  studentId: string;
  studentName: string;
  studentCode?: string;
  email: string;
  quizScore?: number;
  assignmentScore?: number;
  examScore?: number;
  weightedTotal: number;
  gpa4: number;
  letterGrade: string;
  status: string;
  finalScoreRecorded?: number;
}

export const GradesPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // View Mode: 'matrix' (Weighted Grade Matrix) or 'logs' (Raw Grade Items)
  const [viewMode, setViewMode] = useState<'matrix' | 'logs'>('matrix');
  const [matrixStudents, setMatrixStudents] = useState<MatrixStudent[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Weights (Default: Quiz 20%, Assignment 30%, Final Exam 50%)
  const [weightQuiz, setWeightQuiz] = useState(20);
  const [weightAssign, setWeightAssign] = useState(30);
  const [weightExam, setWeightExam] = useState(50);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const courseList = await api.getCourses();
        setCourses(courseList);
        if (courseList.length > 0 && selectedCourseId === 'ALL') {
          // Default to first course if available for matrix
          setSelectedCourseId(String(courseList[0].id));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [user]);

  const fetchGrades = async () => {
    if (courses.length === 0) return;
    try {
      setLoading(true);
      if (selectedCourseId === 'ALL') {
        const allGrades = await Promise.all(
          courses.map(async (c) => {
            try {
              if (user?.role === 'STUDENT') {
                const myGrades = await api.getMyGrades(c.id);
                return myGrades.map((g) => ({ ...g, courseTitle: c.title, courseCode: c.code }));
              } else {
                const book = await api.getCourseGradebook(c.id);
                return book.map((g) => ({ ...g, courseTitle: c.title, courseCode: c.code }));
              }
            } catch {
              return [];
            }
          })
        );
        setGrades(allGrades.flat());
      } else {
        const currentCourse = courses.find((c) => String(c.id) === selectedCourseId);
        if (user?.role === 'STUDENT') {
          const myGrades = await api.getMyGrades(selectedCourseId);
          setGrades(myGrades.map((g) => ({ ...g, courseTitle: currentCourse?.title, courseCode: currentCourse?.code })));
        } else {
          const book = await api.getCourseGradebook(selectedCourseId);
          setGrades(book.map((g) => ({ ...g, courseTitle: currentCourse?.title, courseCode: currentCourse?.code })));
        }
      }
    } catch (err) {
      console.error(err);
      setGrades([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatrix = async () => {
    if (selectedCourseId === 'ALL' || courses.length === 0) {
      setMatrixStudents([]);
      return;
    }
    try {
      setMatrixLoading(true);
      const res = await api.getCourseGradeMatrix(selectedCourseId, {
        quizzes: weightQuiz,
        assignments: weightAssign,
        exam: weightExam,
      });
      setMatrixStudents(res.students || []);
    } catch (err: any) {
      console.error(err);
      setMatrixStudents([]);
    } finally {
      setMatrixLoading(false);
    }
  };

  useEffect(() => {
    if (courses.length > 0) {
      fetchGrades();
      if (selectedCourseId !== 'ALL') {
        fetchMatrix();
      }
    }
  }, [selectedCourseId, courses, user, weightQuiz, weightAssign, weightExam]);

  const handleFinalizeGradebook = async () => {
    if (selectedCourseId === 'ALL') return;
    if (!window.confirm('Bạn có chắc chắn muốn chốt điểm tổng kết và ghi vào hồ sơ sinh viên không?')) return;
    setFinalizing(true);
    try {
      const res = await api.finalizeCourseGradebook(selectedCourseId, {
        quizzes: weightQuiz,
        assignments: weightAssign,
        exam: weightExam,
      });
      toast.success(res.message);
      await fetchMatrix();
    } catch (err: any) {
      toast.error('Lỗi chốt sổ điểm: ' + err.message);
    } finally {
      setFinalizing(false);
    }
  };

  const filteredGrades = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    if (!q) return grades;
    return grades.filter((g) => {
      const matchName = (g.student_name || g.studentName || '').toLowerCase().includes(q);
      const matchCode = (g.studentCode || '').toLowerCase().includes(q);
      const matchItem = (g.itemTitle || '').toLowerCase().includes(q);
      const matchCourse = (g.courseTitle || g.courseCode || '').toLowerCase().includes(q);
      return matchName || matchCode || matchItem || matchCourse;
    });
  }, [grades, debouncedSearch]);

  const filteredMatrix = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    if (!q) return matrixStudents;
    return matrixStudents.filter((s) => {
      const matchName = (s.studentName || '').toLowerCase().includes(q);
      const matchCode = (s.studentCode || '').toLowerCase().includes(q);
      const matchEmail = (s.email || '').toLowerCase().includes(q);
      return matchName || matchCode || matchEmail;
    });
  }, [matrixStudents, debouncedSearch]);

  const studentAverage10 = useMemo(() => {
    if (grades.length === 0) return 0;
    const total = grades.reduce((acc, g) => acc + (g.score / (g.max_score || g.maxScore || 10)) * 10, 0);
    return total / grades.length;
  }, [grades]);

  const studentAverage4 = useMemo(() => {
    return (studentAverage10 * 4) / 10;
  }, [studentAverage10]);

  const getPerformanceTier = (score10: number) => {
    if (score10 >= 9.0) return { label: 'Xuất sắc', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (score10 >= 8.0) return { label: 'Giỏi', color: 'text-blue-700 bg-blue-50 border-blue-200' };
    if (score10 >= 6.5) return { label: 'Khá', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
    if (score10 >= 5.0) return { label: 'Trung bình', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { label: 'Cần cải thiện', color: 'text-red-700 bg-red-50 border-red-200' };
  };

  const getScoreBadge = (score: number, maxScore: number) => {
    const scale10 = (score / (maxScore || 10)) * 10;
    if (scale10 >= 8.5) {
      return <span className="font-bold text-emerald-600 font-mono text-sm">{formatScore(score)}</span>;
    }
    if (scale10 >= 7.0) {
      return <span className="font-bold text-blue-600 font-mono text-sm">{formatScore(score)}</span>;
    }
    if (scale10 >= 5.0) {
      return <span className="font-bold text-amber-600 font-mono text-sm">{formatScore(score)}</span>;
    }
    return <span className="font-bold text-red-600 font-mono text-sm">{formatScore(score)}</span>;
  };

  const handleExportGradesCsv = () => {
    if (viewMode === 'matrix') {
      if (filteredMatrix.length === 0) {
        toast.warning('Không có dữ liệu ma trận điểm để xuất.');
        return;
      }
      const headers = ['StudentID', 'FullName', 'StudentCode', 'Email', 'Quizzes(20%)', 'Assignments(30%)', 'Exam(50%)', 'WeightedTotal(10)', 'GPA(4)', 'Letter', 'Status', 'RecordedFinal'];
      const rows = filteredMatrix.map((s) => [
        `"${s.studentId}"`,
        `"${s.studentName}"`,
        `"${s.studentCode || ''}"`,
        `"${s.email}"`,
        s.quizScore ?? '',
        s.assignmentScore ?? '',
        s.examScore ?? '',
        s.weightedTotal,
        s.gpa4,
        `"${s.letterGrade}"`,
        `"${s.status}"`,
        s.finalScoreRecorded ?? '',
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `ma_tran_diem_${selectedCourseId}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Đã xuất ma trận điểm thành công!');
      return;
    }

    if (filteredGrades.length === 0) {
      toast.warning('Không có dữ liệu điểm để xuất.');
      return;
    }
    const headers = ['Course', 'StudentName', 'StudentCode', 'SourceType', 'ItemTitle', 'Score', 'MaxScore', 'Feedback', 'GradedDate'];
    const rows = filteredGrades.map((g) => [
      `"${g.courseCode || g.courseTitle || ''}"`,
      `"${g.student_name || g.studentName || 'Sinh viên'}"`,
      `"${g.studentCode || ''}"`,
      `"${g.sourceType || g.source_type}"`,
      `"${g.itemTitle || ''}"`,
      g.score,
      g.maxScore || g.max_score,
      `"${(g.feedback || '').replace(/"/g, '""')}"`,
      `"${new Date(g.gradedAt || g.graded_at).toLocaleDateString('vi-VN')}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nhat_ky_diem_${selectedCourseId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Đã xuất nhật ký điểm thành công!');
  };

  const getSourceBadge = (type: string) => {
    switch (type) {
      case 'ASSIGNMENT':
        return (
          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
            <FileText className="w-3 h-3 mr-1" /> Bài tập
          </span>
        );
      case 'QUIZ':
        return (
          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">
            <CheckSquare className="w-3 h-3 mr-1" /> Trắc nghiệm
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {user?.role === 'STUDENT' ? 'Bảng điểm & Kết quả học tập cá nhân' : 'Sổ điểm & Đánh giá quá trình'}
          </h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Theo dõi tổng kết kết quả đánh giá các cột điểm thành phần và phản hồi từ giảng viên'
              : 'Tổng hợp ma trận điểm trọng số học phần và xuất báo cáo kết quả đánh giá'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user?.role !== 'STUDENT' && selectedCourseId !== 'ALL' && viewMode === 'matrix' && (
            <button
              onClick={handleFinalizeGradebook}
              disabled={finalizing}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition shrink-0 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{finalizing ? 'Đang chốt...' : 'Chốt & Công bố điểm'}</span>
            </button>
          )}

          <button
            onClick={handleExportGradesCsv}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* Student Academic Summary Card */}
      {user?.role === 'STUDENT' && grades.length > 0 && (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-500/10">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
            <div>
              <span className="text-xs text-blue-200 font-semibold uppercase tracking-wider block">
                Điểm trung bình tích lũy
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold mt-1 tracking-tight">
                {studentAverage10.toFixed(2)}{' '}
                <span className="text-sm font-normal text-blue-200">/ 10</span>
              </div>
              <span className="text-xs text-blue-100 mt-1 block">
                Quy đổi: <strong>{studentAverage4.toFixed(2)}</strong> (Thang 4)
              </span>
            </div>

            <div className="border-l border-white/20 pl-4">
              <span className="text-xs text-blue-200 font-semibold uppercase tracking-wider block">
                Xếp loại học lực
              </span>
              <div className="text-xl font-bold mt-1 text-white">
                {getPerformanceTier(studentAverage10).label}
              </div>
              <span className="text-xs text-blue-200 mt-1 block">Dựa trên {grades.length} cột điểm đã ghi nhận</span>
            </div>

            <div className="border-l border-white/20 pl-4">
              <span className="text-xs text-blue-200 font-semibold uppercase tracking-wider block">
                Khóa học ghi nhận
              </span>
              <div className="text-xl font-bold mt-1 text-white">
                {new Set(grades.map((g) => g.courseId || g.course_id)).size} môn học
              </div>
              <span className="text-xs text-blue-200 mt-1 block">Tất cả các học phần đang theo học</span>
            </div>

            <div className="border-l border-white/20 pl-4">
              <span className="text-xs text-blue-200 font-semibold uppercase tracking-wider block">
                Trạng thái học vụ
              </span>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-100 text-xs font-bold mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tiến độ đạt yêu cầu</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Mode Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
              Khóa học:
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full sm:w-72 px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">📚 Tất cả các khóa học ({courses.length})</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Switcher */}
          {selectedCourseId !== 'ALL' && (
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1 rounded-lg flex items-center space-x-1.5 transition ${
                  viewMode === 'matrix' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>Ma trận trọng số</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('logs')}
                className={`px-3 py-1 rounded-lg flex items-center space-x-1.5 transition ${
                  viewMode === 'logs' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Nhật ký đầu điểm</span>
              </button>
            </div>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={user?.role === 'STUDENT' ? 'Tìm bài tập, môn học...' : 'Tìm sinh viên, mã SV, đầu điểm...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* VIEW 1: WEIGHTED GRADE MATRIX */}
      {viewMode === 'matrix' && selectedCourseId !== 'ALL' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Weights Configuration Bar */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 text-slate-700 font-semibold">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Cơ cấu trọng số học phần:</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {user?.role !== 'STUDENT' ? (
                <>
                  <label className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium text-xs">
                    <span>Trắc nghiệm:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weightQuiz}
                      onChange={(e) => setWeightQuiz(Number(e.target.value) || 0)}
                      className="w-10 px-1 py-0.2 rounded bg-white border border-purple-200 text-center font-bold text-purple-900"
                    />
                    <span>%</span>
                  </label>
                  <label className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium text-xs">
                    <span>Bài tập:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weightAssign}
                      onChange={(e) => setWeightAssign(Number(e.target.value) || 0)}
                      className="w-10 px-1 py-0.2 rounded bg-white border border-blue-200 text-center font-bold text-blue-900"
                    />
                    <span>%</span>
                  </label>
                  <label className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-medium text-xs">
                    <span>Thi:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weightExam}
                      onChange={(e) => setWeightExam(Number(e.target.value) || 0)}
                      className="w-10 px-1 py-0.2 rounded bg-white border border-emerald-200 text-center font-bold text-emerald-900"
                    />
                    <span>%</span>
                  </label>
                  <span className={`font-bold ${weightQuiz + weightAssign + weightExam === 100 ? 'text-slate-500' : 'text-red-500'}`}>
                    = {weightQuiz + weightAssign + weightExam}%
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium">
                    Trắc nghiệm: {weightQuiz}%
                  </span>
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium">
                    Bài tập: {weightAssign}%
                  </span>
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-medium">
                    Thi cuối kỳ: {weightExam}%
                  </span>
                  <span className="text-slate-400 font-bold">= 100%</span>
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-white border-b border-slate-200 font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Sinh viên</th>
                  <th className="py-3 px-4 text-center">Trắc nghiệm ({weightQuiz}%)</th>
                  <th className="py-3 px-4 text-center">Bài tập ({weightAssign}%)</th>
                  <th className="py-3 px-4 text-center">Thi ({weightExam}%)</th>
                  <th className="py-3 px-4 text-center">Tổng kết (Hệ 10)</th>
                  <th className="py-3 px-4 text-center">Hệ 4</th>
                  <th className="py-3 px-4 text-center">Điểm chữ</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Sổ điểm chính thức</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrixLoading ? (
                  <>
                    <TableRowSkeleton cols={9} />
                    <TableRowSkeleton cols={9} />
                    <TableRowSkeleton cols={9} />
                    <TableRowSkeleton cols={9} />
                  </>
                ) : filteredMatrix.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Chưa có sinh viên hoặc dữ liệu tính toán cho khóa học này.
                    </td>
                  </tr>
                ) : (
                  filteredMatrix.map((st) => (
                    <tr key={st.studentId} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 text-xs">{st.studentName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{st.studentCode || st.email}</div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium">
                        {st.quizScore !== null && st.quizScore !== undefined ? `${st.quizScore}đ` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium">
                        {st.assignmentScore !== null && st.assignmentScore !== undefined ? `${st.assignmentScore}đ` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium">
                        {st.examScore !== null && st.examScore !== undefined ? `${st.examScore}đ` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-sm text-blue-600">
                        {st.weightedTotal.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-slate-700">
                        {st.gpa4.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                          st.letterGrade === 'A' ? 'bg-emerald-100 text-emerald-800' :
                          st.letterGrade === 'B' ? 'bg-blue-100 text-blue-800' :
                          st.letterGrade === 'C' ? 'bg-amber-100 text-amber-800' :
                          st.letterGrade === 'D' ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {st.letterGrade}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          st.status === 'PASSED' ? 'bg-emerald-50 text-emerald-700' :
                          st.status === 'FAILED' ? 'bg-red-50 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {st.status === 'PASSED' ? 'Đạt' : st.status === 'FAILED' ? 'Học lại' : 'Đang xử lý'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        {st.finalScoreRecorded !== null && st.finalScoreRecorded !== undefined ? (
                          <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                            {st.finalScoreRecorded}đ
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Chưa chốt</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW 2: RAW GRADEBOOK LOGS */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Học phần</th>
                  {user?.role !== 'STUDENT' && <th className="py-3 px-4">Sinh viên</th>}
                  <th className="py-3 px-4">Đầu điểm & Phân loại</th>
                  <th className="py-3 px-4">Điểm số</th>
                  <th className="py-3 px-4">Thang điểm</th>
                  <th className="py-3 px-4">Nhận xét từ giảng viên</th>
                  <th className="py-3 px-4 text-right">Ngày ghi nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <>
                    <TableRowSkeleton cols={user?.role !== 'STUDENT' ? 7 : 6} />
                    <TableRowSkeleton cols={user?.role !== 'STUDENT' ? 7 : 6} />
                    <TableRowSkeleton cols={user?.role !== 'STUDENT' ? 7 : 6} />
                    <TableRowSkeleton cols={user?.role !== 'STUDENT' ? 7 : 6} />
                  </>
                ) : filteredGrades.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role !== 'STUDENT' ? 7 : 6} className="py-12 text-center text-slate-400">
                      Chưa có cột điểm nào được ghi nhận cho tiêu chí đã chọn.
                    </td>
                  </tr>
                ) : (
                  filteredGrades.map((g) => {
                    return (
                      <tr key={g.id || g.gradeId} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800 text-xs">{g.courseTitle || 'Học phần'}</div>
                          <div className="text-[10px] font-mono text-slate-400">{g.courseCode || ''}</div>
                        </td>

                        {user?.role !== 'STUDENT' && (
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{g.student_name || g.studentName || 'Sinh viên'}</div>
                            <div className="text-[10px] font-mono text-slate-400">{g.studentCode || ''}</div>
                          </td>
                        )}

                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800 mb-1">{g.itemTitle || 'Bài đánh giá'}</div>
                          {getSourceBadge(g.sourceType || g.source_type)}
                        </td>

                        <td className="py-3 px-4">
                          {getScoreBadge(g.score, g.max_score || g.maxScore || 10)}
                        </td>

                        <td className="py-3 px-4">
                          <span className="text-slate-400 font-mono">/ {g.max_score || g.maxScore || 10}đ</span>
                        </td>

                        <td className="py-3 px-4 max-w-xs">
                          {g.feedback ? (
                            <span className="text-slate-600 line-clamp-2 italic">"{g.feedback}"</span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right text-slate-400 font-mono">
                          {new Date(g.gradedAt || g.graded_at).toLocaleDateString('vi-VN')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
