import React, { useState, useEffect } from 'react';
import {
  FileText,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { Grade, Course } from '../types';

export const GradesPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number>(0);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        if (user?.role === 'STUDENT') {
          const myGrades = await api.getMyGrades();
          setGrades(myGrades);
        } else {
          const courseList = await api.getCourses();
          setCourses(courseList);
          if (courseList.length > 0) {
            setSelectedCourseId(courseList[0].id);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [user]);

  const fetchCourseGradebook = async () => {
    if (!selectedCourseId) return;
    try {
      setLoading(true);
      const book = await api.getCourseGradebook(selectedCourseId);
      setGrades(book);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== 'STUDENT' && selectedCourseId) {
      fetchCourseGradebook();
    }
  }, [selectedCourseId]);

  const calculateStudentAverage = () => {
    if (grades.length === 0) return 0;
    const total = grades.reduce((acc, g) => acc + (g.score / g.max_score) * 10, 0);
    return total / grades.length;
  };

  const getSourceBadge = (type: string) => {
    switch (type) {
      case 'ASSIGNMENT':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">
            <FileText className="w-3 h-3 mr-1" /> Bài tập
          </span>
        );
      case 'QUIZ':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-100 text-purple-700">
            <CheckSquare className="w-3 h-3 mr-1" /> Quiz
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
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
            {user?.role === 'STUDENT' ? 'Bảng điểm & Kết quả học tập cá nhân' : 'Sổ điểm Lớp học phần (Gradebook)'}
          </h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Theo dõi kết quả đánh giá các cột điểm thành phần và nhận xét từ giảng viên'
              : 'Xem tổng hợp điểm số các cột điểm bài tập, quiz và đánh giá quá trình'}
          </p>
        </div>
      </div>

      {/* Student KPI Card */}
      {user?.role === 'STUDENT' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-400 uppercase">Điểm trung bình tạm tính</span>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-3xl font-extrabold text-blue-600">
                {calculateStudentAverage().toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">/ 10</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-400 uppercase">Số cột điểm đã tích lũy</span>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-800">{grades.length}</span>
              <span className="text-xs text-slate-400">cột điểm</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-400 uppercase">Xếp loại học lực</span>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-xl font-bold text-emerald-600">
                {calculateStudentAverage() >= 8.5 ? 'Giỏi (Excellent)' : calculateStudentAverage() >= 7 ? 'Khá (Good)' : 'Đạt'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Lecturer Course Selector */}
      {user?.role !== 'STUDENT' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            Khóa học:
          </label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(Number(e.target.value))}
            className="w-full sm:w-96 px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium text-slate-800"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Grades Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Khóa học / Sinh viên</th>
                <th className="py-3.5 px-4">Loại đầu điểm</th>
                <th className="py-3.5 px-4">Điểm số</th>
                <th className="py-3.5 px-4">Trọng số</th>
                <th className="py-3.5 px-4">Nhận xét của Giảng viên</th>
                <th className="py-3.5 px-4">Ngày chấm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Đang tải dữ liệu sổ điểm...
                  </td>
                </tr>
              ) : grades.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chưa có điểm nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                grades.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4">
                      {user?.role === 'STUDENT' ? (
                        <span className="font-semibold text-slate-800">{g.course_code || 'Khóa học'}</span>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-800">{g.student_name || 'Sinh viên'}</div>
                          <div className="text-xs text-slate-400 font-mono">ID: #{g.student_id}</div>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getSourceBadge(g.source_type)}</td>
                    <td className="py-3.5 px-4">
                      <span className="text-base font-extrabold text-blue-600">{g.score}</span>
                      <span className="text-xs text-slate-400"> / {g.max_score}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                      {g.weight_percent ? `${g.weight_percent}%` : '10%'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {g.feedback ? (
                        <span className="italic">"{g.feedback}"</span>
                      ) : (
                        <span className="text-slate-400">Không có phản hồi</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {new Date(g.graded_at).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
