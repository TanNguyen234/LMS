import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  CheckSquare,
  Search,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { formatScore } from '../utils/vi';
import type { Grade, Course } from '../types';

export const GradesPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const courseList = await api.getCourses();
        setCourses(courseList);
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

  useEffect(() => {
    if (courses.length > 0) {
      fetchGrades();
    }
  }, [selectedCourseId, courses, user]);

  const filteredGrades = useMemo(() => {
    const q = search.toLowerCase();
    return grades.filter((g) => {
      const matchName = (g.student_name || g.studentName || '').toLowerCase().includes(q);
      const matchCode = (g.studentCode || '').toLowerCase().includes(q);
      const matchItem = (g.itemTitle || '').toLowerCase().includes(q);
      const matchCourse = (g.courseTitle || g.courseCode || '').toLowerCase().includes(q);
      return matchName || matchCode || matchItem || matchCourse;
    });
  }, [grades, search]);

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
    if (filteredGrades.length === 0) {
      alert('Không có dữ liệu điểm để xuất.');
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
    link.setAttribute('download', `so_diem_${selectedCourseId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              : 'Tổng hợp và xuất báo cáo kết quả đánh giá các cột điểm học phần'}
          </p>
        </div>

        <button
          onClick={handleExportGradesCsv}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4 text-slate-600" />
          <span>Xuất sổ điểm (CSV)</span>
        </button>
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

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Khóa học:
          </label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="w-full sm:w-80 px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">📚 Tất cả các khóa học ({courses.length})</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.title}
              </option>
            ))}
          </select>
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

      {/* Grade Table */}
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
                <tr>
                  <td colSpan={user?.role !== 'STUDENT' ? 7 : 6} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Đang tải sổ điểm...
                  </td>
                </tr>
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
    </div>
  );
};
