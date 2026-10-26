import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  X,
  Award,
  Eye,
  Calendar,
  Send,
  Pencil,
  LockKeyhole,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { statusLabel } from '../utils/vi';
import type { Assignment, Course, Submission } from '../types';

export const AssignmentsPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newMaxScore, setNewMaxScore] = useState(10);
  const [newStatus, setNewStatus] = useState<'DRAFT' | 'PUBLISHED' | 'CLOSED'>('PUBLISHED');
  const [submitting, setSubmitting] = useState(false);

  // Submissions review modal for lecturer
  const [isSubmissionsModalOpen, setIsSubmissionsModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // Grading modal state
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(10);
  const [gradeFeedback, setGradeFeedback] = useState<string>('Bài làm tốt!');

  // Student submit modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitAssignmentTarget, setSubmitAssignmentTarget] = useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState('');

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const data = await api.getCourses();
        setCourses(data);
        if (data.length > 0) {
          setSelectedCourseId(String(data[0].id));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  const fetchAssignments = async () => {
    if (!selectedCourseId) return;
    try {
      setLoading(true);
      const data = await api.getCourseAssignments(selectedCourseId);
      if (user?.role === 'STUDENT') {
        const withSubmissions = await Promise.all(data.map(async (assignment) => ({
          ...assignment,
          my_submission: await api.getMySubmission(assignment.id) || undefined,
        })));
        setAssignments(withSubmissions);
      } else {
        setAssignments(data);
      }
    } catch (err) {
      console.error(err);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [selectedCourseId]);

  const resetAssignmentForm = () => {
    setNewTitle('');
    setNewDesc('');
    setNewDueDate('');
    setNewMaxScore(10);
    setNewStatus('PUBLISHED');
    setEditingAssignment(null);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment && !courses.some((course) => course.id === selectedCourseId)) return;
    setSubmitting(true);
    try {
      const dueAt = newDueDate ? new Date(newDueDate).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
      if (editingAssignment) {
        const updated = await api.updateAssignment(editingAssignment.id, {
          title: newTitle,
          description: newDesc,
          dueAt,
          maxScore: Number(newMaxScore),
          status: newStatus,
        });
        setAssignments((prev) => prev.map((assignment) => assignment.id === updated.id ? updated : assignment));
      } else {
        const created = await api.createAssignment(selectedCourseId, {
          title: newTitle,
          description: newDesc,
          due_date: dueAt,
          max_score: Number(newMaxScore),
          status: newStatus,
        });
        setAssignments((prev) => [created, ...prev]);
      }
      setIsCreateModalOpen(false);
      resetAssignmentForm();
    } catch (err: any) {
      alert((editingAssignment ? 'Lỗi cập nhật bài tập: ' : 'Lỗi tạo bài tập: ') + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditAssignment = (assignment: Assignment) => {
    const dueAt = new Date(assignment.dueAt || assignment.due_date);
    setEditingAssignment(assignment);
    setNewTitle(assignment.title);
    setNewDesc(assignment.description || '');
    setNewDueDate(new Date(dueAt.getTime() - dueAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    setNewMaxScore(Number(assignment.maxScore ?? assignment.max_score));
    setNewStatus((assignment.status as 'DRAFT' | 'PUBLISHED' | 'CLOSED') || 'PUBLISHED');
    setIsCreateModalOpen(true);
  };

  const handleOpenSubmissions = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    try {
      const subs = await api.getAssignmentSubmissions(assignment.id);
      setSubmissions(subs);
      setIsSubmissionsModalOpen(true);
    } catch (err: any) {
      alert('Lỗi tải bài nộp: ' + err.message);
    }
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSubmission) return;
    setSubmitting(true);
    try {
      await api.gradeSubmission(gradingSubmission.id, {
        score: Number(gradeScore),
        feedback: gradeFeedback,
        weight_percent: 10,
      });
      alert('Đã lưu điểm thành công!');
      // refresh submissions
      if (selectedAssignment && selectedAssignment.id) {
        const subs = await api.getAssignmentSubmissions(selectedAssignment.id);
        setSubmissions(subs);
      }
      setGradingSubmission(null);
    } catch (err: any) {
      alert('Lỗi chấm điểm: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitAssignmentTarget || !submitAssignmentTarget.id) return;
    setSubmitting(true);
    try {
      const savedSubmission = await api.submitAssignment(submitAssignmentTarget.id, submissionText);
      setAssignments((prev) => prev.map((assignment) => assignment.id === savedSubmission.assignment_id
        ? { ...assignment, my_submission: savedSubmission }
        : assignment));
      alert('Nộp bài thành công!');
      setIsSubmitModalOpen(false);
      setSubmissionText('');
      setSubmitAssignmentTarget(null);
    } catch (err: any) {
      alert('Lỗi nộp bài: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Quản lý Bài tập & Đánh giá</h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Nộp bài tập trực tuyến và xem kết quả chấm điểm từ giảng viên'
              : 'Giao bài tập, thu thập bài nộp và chấm điểm trực tiếp'}
          </p>
        </div>

        {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            disabled={!courses.some((course) => course.id === selectedCourseId)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-xs transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo bài tập mới</span>
          </button>
        )}
      </div>

      {/* Course Filter Dropdown */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
          Khóa học:
        </label>
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="w-full sm:w-96 px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium text-slate-800"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} - {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Assignments List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Đang tải danh sách bài tập...</p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-700">Chưa có bài tập nào</h3>
          <p className="text-sm mt-1">Chưa có bài tập nào được giao cho khóa học này.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-blue-200 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs">
                    Điểm tối đa: {a.max_score}đ
                  </span>
                  {user?.role !== 'STUDENT' && <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${a.status === 'CLOSED' ? 'bg-slate-100 text-slate-600' : a.status === 'DRAFT' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{statusLabel(a.status)}</span>}
                  <span className="flex items-center text-xs text-slate-400 space-x-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Hạn nộp: {new Date(a.due_date).toLocaleDateString('vi-VN')}</span>
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-800">{a.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-2">{a.description || 'Không có mô tả chi tiết.'}</p>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                {user?.role === 'STUDENT' ? (
                  a.status === 'CLOSED' || a.status === 'DRAFT' || a.my_submission?.status === 'GRADED' ? (
                    <span className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold">
                      {a.my_submission?.status === 'GRADED' ? 'Đã chấm' : a.status === 'CLOSED' ? 'Đã đóng' : 'Chưa mở'}
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setSubmitAssignmentTarget(a);
                        setSubmissionText(a.my_submission?.contentText || a.my_submission?.submission_text || '');
                        setIsSubmitModalOpen(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{a.my_submission ? 'Cập nhật bài nộp' : 'Nộp bài tập'}</span>
                    </button>
                  )
                ) : (
                  <>
                    <button
                      onClick={() => openEditAssignment(a)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                    ><Pencil className="w-3.5 h-3.5" /> Sửa</button>
                    <button
                      onClick={async () => {
                        const status = a.status === 'CLOSED' ? 'PUBLISHED' : 'CLOSED';
                        try {
                          const updated = await api.updateAssignment(a.id, { status });
                          setAssignments((prev) => prev.map((item) => item.id === updated.id ? updated : item));
                        } catch (err: any) { alert('Lỗi cập nhật trạng thái: ' + err.message); }
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                    ><LockKeyhole className="w-3.5 h-3.5" /> {a.status === 'CLOSED' ? 'Mở lại' : 'Đóng'}</button>
                    <button
                      onClick={() => handleOpenSubmissions(a)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
                    ><Eye className="w-3.5 h-3.5 text-slate-500" /><span>Xem & Chấm bài</span></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create / Edit Assignment */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editingAssignment ? 'Cập nhật bài tập' : 'Tạo bài tập mới'}</h3>
              <button onClick={() => { setIsCreateModalOpen(false); resetAssignmentForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveAssignment} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Tiêu đề bài tập</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Bài tập tuần 3: Thiết kế CSDL LMS"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Yêu cầu chi tiết</label>
                <textarea
                  rows={4}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Nêu rõ yêu cầu sinh viên cần thực hiện, tiêu chí đánh giá..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Hạn nộp</label>
                  <input
                    type="datetime-local"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Điểm tối đa</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newMaxScore}
                    onChange={(e) => setNewMaxScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Trạng thái bài tập</label>
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as typeof newStatus)} className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                  <option value="DRAFT">Bản nháp</option>
                  <option value="PUBLISHED">Đã giao</option>
                  <option value="CLOSED">Đã đóng</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsCreateModalOpen(false); resetAssignmentForm(); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingAssignment ? 'Lưu thay đổi' : 'Giao bài tập'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Submissions List for Lecturer */}
      {isSubmissionsModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Danh sách bài nộp: {selectedAssignment.title}</h3>
                <p className="text-xs text-slate-400">Tổng số sinh viên đã nộp: {submissions.length}</p>
              </div>
              <button onClick={() => setIsSubmissionsModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 my-4">
              {submissions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">Chưa có sinh viên nào nộp bài.</div>
              ) : (
                submissions.map((sub) => (
                  <div key={sub.id} className="py-3.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{sub.student_name || 'Sinh viên'}</div>
                      <div className="text-xs text-slate-400">
                        Nộp lúc: {new Date(sub.submitted_at).toLocaleString('vi-VN')}
                      </div>
                      {sub.submission_text && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-1 italic">"{sub.submission_text}"</p>
                      )}
                    </div>

                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => {
                          setGradingSubmission(sub);
                        }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center space-x-1"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Chấm điểm</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsSubmissionsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inline Grading Submission */}
      {gradingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-bold text-slate-800 text-base mb-1">
              Chấm điểm cho: {gradingSubmission.student_name}
            </h3>
            <p className="text-xs text-slate-400 mb-4">Nội dung nộp: {gradingSubmission.submission_text || 'Không có nội dung văn bản'}</p>

            <form onSubmit={handleGradeSubmission} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Điểm số (0 - 10)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  required
                  value={gradeScore}
                  onChange={(e) => setGradeScore(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-bold text-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Nhận xét & Phản hồi</label>
                <textarea
                  rows={3}
                  value={gradeFeedback}
                  onChange={(e) => setGradeFeedback(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  placeholder="Ghi nhận xét cụ thể để sinh viên cải thiện..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setGradingSubmission(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                >
                  Lưu điểm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Student Submit Assignment */}
      {isSubmitModalOpen && submitAssignmentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">Nộp bài: {submitAssignmentTarget.title}</h3>
              <button onClick={() => setIsSubmitModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleStudentSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Nội dung trả lời / Báo cáo tóm tắt
                </label>
                <textarea
                  rows={5}
                  required
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Dán câu trả lời, báo cáo tóm tắt hoặc liên kết tài liệu tại đây..."
                />
              </div>

              <p className="text-xs text-slate-500">Bài nộp được lưu dưới dạng văn bản. Tải tệp trực tiếp chưa được hỗ trợ; có thể dán liên kết chia sẻ trong nội dung.</p>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang nộp...' : 'Xác nhận nộp bài'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
