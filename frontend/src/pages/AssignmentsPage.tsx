import React, { useState, useEffect, useMemo } from 'react';
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
  Download,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { statusLabel } from '../utils/vi';
import type { Assignment, Course, Submission } from '../types';
import { PdfPreviewModal } from '../components/common/PdfPreviewModal';

export const AssignmentsPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Student Task Filter Tabs
  const [studentTab, setStudentTab] = useState<'ALL' | 'TODO' | 'SUBMITTED' | 'GRADED'>('TODO');

  // Modals state: Create / Edit Assignment
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [targetCourseIdForCreate, setTargetCourseIdForCreate] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newMaxScore, setNewMaxScore] = useState(10);
  const [newStatus, setNewStatus] = useState<'DRAFT' | 'PUBLISHED' | 'CLOSED'>('PUBLISHED');
  const [submitting, setSubmitting] = useState(false);

  // Lecturer Side-by-Side Split Review State (Replaces Modal-in-Modal)
  const [reviewingAssignment, setReviewingAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionFilter, setSubmissionFilter] = useState<'ALL' | 'UNGRADED' | 'GRADED'>('ALL');

  // Grading form state inside Side-by-Side panel
  const [gradeScore, setGradeScore] = useState<number>(10);
  const [gradeFeedback, setGradeFeedback] = useState<string>('Bài làm rất tốt, đúng yêu cầu!');
  const [gradeSaving, setGradeSaving] = useState(false);

  // Student submit modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitAssignmentTarget, setSubmitAssignmentTarget] = useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const data = await api.getCourses();
        setCourses(data);
        if (data.length > 0) {
          setTargetCourseIdForCreate(String(data[0].id));
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
    if (courses.length === 0) return;
    try {
      setLoading(true);
      let rawAssignments: Assignment[] = [];

      if (selectedCourseId === 'ALL') {
        const allResults = await Promise.all(
          courses.map(async (c) => {
            try {
              const list = await api.getCourseAssignments(c.id);
              return list.map((a) => ({
                ...a,
                courseTitle: c.title,
                courseCode: c.code,
              }));
            } catch {
              return [];
            }
          })
        );
        rawAssignments = allResults.flat();
      } else {
        const currentCourse = courses.find((c) => String(c.id) === selectedCourseId);
        const list = await api.getCourseAssignments(selectedCourseId);
        rawAssignments = list.map((a) => ({
          ...a,
          courseTitle: currentCourse?.title,
          courseCode: currentCourse?.code,
        }));
      }

      // Sort by due date (closest first)
      rawAssignments.sort((a, b) => {
        const dateA = new Date(a.dueAt || a.due_date).getTime();
        const dateB = new Date(b.dueAt || b.due_date).getTime();
        return dateA - dateB;
      });

      if (user?.role === 'STUDENT') {
        const withSubmissions = await Promise.all(
          rawAssignments.map(async (assignment) => {
            try {
              const mySub = await api.getMySubmission(assignment.id);
              return { ...assignment, my_submission: mySub || undefined };
            } catch {
              return assignment;
            }
          })
        );
        setAssignments(withSubmissions);
      } else {
        setAssignments(rawAssignments);
      }
    } catch (err) {
      console.error(err);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courses.length > 0) {
      fetchAssignments();
    }
  }, [selectedCourseId, courses]);

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
    const courseIdToUse = editingAssignment ? editingAssignment.courseId || editingAssignment.course_id : targetCourseIdForCreate;
    if (!courseIdToUse) {
      alert('Vui lòng chọn khóa học.');
      return;
    }
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
        setAssignments((prev) => prev.map((assignment) => (assignment.id === updated.id ? updated : assignment)));
      } else {
        const created = await api.createAssignment(courseIdToUse, {
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
    setTargetCourseIdForCreate(String(assignment.courseId || assignment.course_id));
    setNewTitle(assignment.title);
    setNewDesc(assignment.description || '');
    setNewDueDate(new Date(dueAt.getTime() - dueAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    setNewMaxScore(Number(assignment.maxScore ?? assignment.max_score));
    setNewStatus((assignment.status as 'DRAFT' | 'PUBLISHED' | 'CLOSED') || 'PUBLISHED');
    setIsCreateModalOpen(true);
  };

  // Open Lecturer Side-by-Side Review Panel
  const handleOpenReviewPanel = async (assignment: Assignment) => {
    setReviewingAssignment(assignment);
    setSubmissionsLoading(true);
    try {
      const subs = await api.getAssignmentSubmissions(assignment.id);
      setSubmissions(subs);
      if (subs.length > 0) {
        setSelectedSubmission(subs[0]);
        setGradeScore(subs[0].score !== null && subs[0].score !== undefined ? subs[0].score : (assignment.maxScore ?? assignment.max_score ?? 10));
        setGradeFeedback(subs[0].feedback || 'Bài làm rất tốt, đúng yêu cầu!');
      } else {
        setSelectedSubmission(null);
      }
    } catch (err: any) {
      alert('Lỗi tải danh sách bài nộp: ' + err.message);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleSelectSubmission = (sub: Submission) => {
    setSelectedSubmission(sub);
    setGradeScore(sub.score !== null && sub.score !== undefined ? sub.score : (reviewingAssignment?.maxScore ?? reviewingAssignment?.max_score ?? 10));
    setGradeFeedback(sub.feedback || 'Bài làm rất tốt, đúng yêu cầu!');
  };

  const handleSaveGradeAndNext = async (andNext: boolean) => {
    if (!selectedSubmission || !reviewingAssignment) return;
    setGradeSaving(true);
    try {
      await api.gradeSubmission(selectedSubmission.id, {
        score: Number(gradeScore),
        feedback: gradeFeedback,
        weight_percent: 10,
      });

      // Update local submissions list
      const updatedList = submissions.map((s) =>
        s.id === selectedSubmission.id ? { ...s, score: Number(gradeScore), feedback: gradeFeedback, status: 'GRADED' } : s
      );
      setSubmissions(updatedList);

      if (andNext) {
        const currentIndex = updatedList.findIndex((s) => s.id === selectedSubmission.id);
        const nextSub = updatedList.slice(currentIndex + 1).find((s) => s.status !== 'GRADED') || updatedList[currentIndex + 1];
        if (nextSub) {
          handleSelectSubmission(nextSub);
        } else {
          alert('Đã hoàn tất chấm điểm toàn bộ bài nộp!');
        }
      } else {
        alert('Đã lưu điểm thành công!');
      }
    } catch (err: any) {
      alert('Lỗi chấm điểm: ' + err.message);
    } finally {
      setGradeSaving(false);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitAssignmentTarget || !submitAssignmentTarget.id) return;

    const hasText = Boolean(submissionText && submissionText.trim());
    const hasFile = Boolean(submissionFile || existingFileUrl);
    if (!hasText && !hasFile) {
      alert('Vui lòng chọn tệp bài làm đính kèm hoặc nhập nội dung trả lời.');
      return;
    }

    setSubmitting(true);
    try {
      let uploadedUrl = existingFileUrl || undefined;
      if (submissionFile) {
        const uploadRes = await api.uploadFile(submissionFile);
        uploadedUrl = uploadRes.fileUrl;
      }

      const savedSubmission = await api.submitAssignment(submitAssignmentTarget.id, submissionText, uploadedUrl);

      setAssignments((prev) =>
        prev.map((assignment) =>
          assignment.id === savedSubmission.assignment_id ? { ...assignment, my_submission: savedSubmission } : assignment
        )
      );
      alert('Nộp bài tập thành công!');
      setIsSubmitModalOpen(false);
      setSubmissionText('');
      setSubmissionFile(null);
      setExistingFileUrl(null);
      setSubmitAssignmentTarget(null);
    } catch (err: any) {
      alert('Lỗi nộp bài: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Assignments for Student based on Action Tabs
  const filteredAssignments = useMemo(() => {
    if (user?.role !== 'STUDENT') return assignments;

    if (studentTab === 'TODO') {
      return assignments.filter((a) => !a.my_submission || a.my_submission.status === 'DRAFT');
    }
    if (studentTab === 'SUBMITTED') {
      return assignments.filter((a) => a.my_submission && a.my_submission.status !== 'GRADED');
    }
    if (studentTab === 'GRADED') {
      return assignments.filter((a) => a.my_submission && a.my_submission.status === 'GRADED');
    }
    return assignments;
  }, [assignments, user, studentTab]);

  // Submissions filtered in Review Panel
  const filteredSubmissions = useMemo(() => {
    if (submissionFilter === 'UNGRADED') {
      return submissions.filter((s) => s.status !== 'GRADED');
    }
    if (submissionFilter === 'GRADED') {
      return submissions.filter((s) => s.status === 'GRADED');
    }
    return submissions;
  }, [submissions, submissionFilter]);

  // Helper for due date urgency
  const getDueBadge = (dueDateStr: string) => {
    const dueTime = new Date(dueDateStr).getTime();
    const diffHours = (dueTime - Date.now()) / (1000 * 3600);

    if (diffHours < 0) {
      return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700">Đã quá hạn</span>;
    }
    if (diffHours <= 24) {
      return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">Hôm nay (Còn {Math.ceil(diffHours)}h)</span>;
    }
    if (diffHours <= 72) {
      return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800">Còn {Math.ceil(diffHours / 24)} ngày</span>;
    }
    return (
      <span className="text-slate-400 text-xs flex items-center space-x-1">
        <Calendar className="w-3 h-3" />
        <span>Hạn: {new Date(dueDateStr).toLocaleDateString('vi-VN')}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Bài tập & Đánh giá quá trình</h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Theo dõi thời hạn nộp bài, gửi bài trực tuyến và nhận phản hồi chi tiết từ giảng viên'
              : 'Giao đề bài tập, theo dõi tiến độ nộp bài và chấm điểm song song'}
          </p>
        </div>

        {user?.role !== 'STUDENT' && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tạo bài tập mới</span>
          </button>
        )}
      </div>

      {/* Course Filter Dropdown & Student Action Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
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

        {/* Student Action Tabs */}
        {user?.role === 'STUDENT' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'TODO', label: 'Cần làm', count: assignments.filter((a) => !a.my_submission || a.my_submission.status === 'DRAFT').length },
              { id: 'SUBMITTED', label: 'Đã nộp', count: assignments.filter((a) => a.my_submission && a.my_submission.status !== 'GRADED').length },
              { id: 'GRADED', label: 'Đã có điểm', count: assignments.filter((a) => a.my_submission && a.my_submission.status === 'GRADED').length },
              { id: 'ALL', label: 'Tất cả', count: assignments.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStudentTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center space-x-1.5 ${
                  studentTab === tab.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${studentTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assignments List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Đang tải danh sách bài tập...</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-700 text-sm">Không có bài tập nào</h3>
          <p className="text-xs mt-1">
            {user?.role === 'STUDENT'
              ? 'Tuyệt vời! Bạn không còn bài tập nào cần giải quyết trong mục này.'
              : 'Chưa có bài tập nào được tạo cho tiêu chí đã chọn.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAssignments.map((a) => {
            const isGraded = a.my_submission?.status === 'GRADED';
            const isSubmitted = Boolean(a.my_submission && a.my_submission.status !== 'DRAFT');

            return (
              <div
                key={a.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-blue-200 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.courseCode && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold font-mono text-[10px]">
                        {a.courseCode}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px]">
                      Thang điểm: {a.max_score || a.maxScore}đ
                    </span>

                    {user?.role !== 'STUDENT' ? (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          a.status === 'CLOSED'
                            ? 'bg-slate-100 text-slate-600'
                            : a.status === 'DRAFT'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {statusLabel(a.status)}
                      </span>
                    ) : (
                      getDueBadge(a.dueAt || a.due_date)
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-800 truncate">{a.title}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2">{a.description || 'Không có mô tả chi tiết.'}</p>

                  {/* Submission & Grade status badge for student */}
                  {user?.role === 'STUDENT' && isGraded && (
                    <div className="inline-flex items-center space-x-2 p-2 bg-emerald-50 rounded-xl border border-emerald-100 text-xs">
                      <Award className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-900">Điểm: {a.my_submission?.score} / {a.max_score || a.maxScore}</span>
                      {a.my_submission?.feedback && (
                        <span className="text-emerald-700 italic border-l border-emerald-200 pl-2">
                          "{a.my_submission.feedback}"
                        </span>
                      )}
                    </div>
                  )}

                  {(a.attachmentUrl || a.attachment_url) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(a.attachmentUrl || a.attachment_url || '').split(',').map((url: string, idx: number) => {
                        const u = url.trim();
                        const fname = u.split('/').pop() || 'Đề bài';
                        return (
                          <div key={idx} className="inline-flex items-center space-x-1 bg-slate-100 rounded-lg p-0.5 text-xs text-slate-700">
                            <button
                              type="button"
                              onClick={() => setPreviewFile({ url: u, title: `Đề bài: ${fname}` })}
                              className="px-2 py-0.5 hover:bg-white rounded text-blue-600 flex items-center space-x-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Đề bài: {fname}</span>
                            </button>
                            <a href={u} download className="px-1.5 py-0.5 hover:bg-white rounded text-slate-500" title="Tải về">
                              <Download className="w-3 h-3" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {user?.role === 'STUDENT' ? (
                    a.status === 'CLOSED' ? (
                      <span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-semibold">
                        Đã đóng
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setSubmitAssignmentTarget(a);
                          setSubmissionText(a.my_submission?.contentText || a.my_submission?.submission_text || '');
                          setExistingFileUrl(a.my_submission?.fileUrl || a.my_submission?.file_url || null);
                          setSubmissionFile(null);
                          setIsSubmitModalOpen(true);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition ${
                          isSubmitted
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isSubmitted ? 'Sửa bài nộp' : 'Nộp bài ngay'}</span>
                      </button>
                    )
                  ) : (
                    <>
                      <button
                        onClick={() => openEditAssignment(a)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Sửa
                      </button>
                      <button
                        onClick={async () => {
                          const status = a.status === 'CLOSED' ? 'PUBLISHED' : 'CLOSED';
                          try {
                            const updated = await api.updateAssignment(a.id, { status });
                            setAssignments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                          } catch (err: any) {
                            alert('Lỗi cập nhật trạng thái: ' + err.message);
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <LockKeyhole className="w-3.5 h-3.5" /> {a.status === 'CLOSED' ? 'Mở lại' : 'Đóng'}
                      </button>
                      {/* Side-by-Side Review Trigger */}
                      <button
                        onClick={() => handleOpenReviewPanel(a)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Chấm bài song song</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LECTURER SIDE-BY-SIDE SPLIT REVIEW PANEL (ELIMINATES MODAL-IN-MODAL) */}
      {reviewingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Top Toolbar */}
            <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-mono text-[10px] font-bold">
                    {reviewingAssignment.courseCode || 'LMS'}
                  </span>
                  <h3 className="font-bold text-slate-800 text-sm truncate">{reviewingAssignment.title}</h3>
                </div>
                <p className="text-[11px] text-slate-400">
                  Thang điểm: {reviewingAssignment.maxScore ?? reviewingAssignment.max_score}đ • Tổng số bài nộp: {submissions.length}
                </p>
              </div>

              <button
                onClick={() => setReviewingAssignment(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Split Screen Body */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Column: Student Submissions List (w-1/3) */}
              <div className="w-full sm:w-80 md:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
                <div className="p-3 border-b border-slate-200 space-y-2">
                  <div className="flex items-center gap-1 text-[11px]">
                    {[
                      { id: 'ALL', label: 'Tất cả' },
                      { id: 'UNGRADED', label: 'Chưa chấm' },
                      { id: 'GRADED', label: 'Đã chấm' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSubmissionFilter(f.id as any)}
                        className={`px-2.5 py-1 rounded-lg font-medium transition ${
                          submissionFilter === f.id
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {submissionsLoading ? (
                    <div className="py-12 text-center text-xs text-slate-400">Đang nạp danh sách nộp bài...</div>
                  ) : filteredSubmissions.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">Chưa có bài nộp nào trong mục này.</div>
                  ) : (
                    filteredSubmissions.map((sub) => {
                      const isSelected = selectedSubmission?.id === sub.id;
                      const hasGrade = sub.status === 'GRADED' || sub.score !== null;

                      return (
                        <div
                          key={sub.id}
                          onClick={() => handleSelectSubmission(sub)}
                          className={`p-3.5 cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-white border-l-4 border-l-blue-600 shadow-xs'
                              : 'hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-xs text-slate-800 truncate">{sub.student_name || 'Sinh viên'}</div>
                            <div className="text-[10px] text-slate-400">
                              Nộp: {new Date(sub.submitted_at).toLocaleDateString('vi-VN')}
                            </div>
                            {sub.submission_text && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5 italic">"{sub.submission_text}"</p>
                            )}
                          </div>

                          <div className="shrink-0 text-right">
                            {hasGrade ? (
                              <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-100 text-emerald-800">
                                {sub.score}đ
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md font-medium text-[10px] bg-amber-100 text-amber-800">
                                Chờ chấm
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Submission Content + Instant Grading Form (w-2/3) */}
              <div className="flex-1 flex flex-col bg-white overflow-y-auto p-6 space-y-6">
                {selectedSubmission ? (
                  <>
                    {/* Student Info & Submission Details */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-slate-800">{selectedSubmission.student_name}</h4>
                          <p className="text-xs text-slate-400">
                            Thời gian nộp bài: {new Date(selectedSubmission.submitted_at).toLocaleString('vi-VN')}
                          </p>
                        </div>
                        {selectedSubmission.score !== null && (
                          <span className="px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs">
                            Điểm hiện tại: {selectedSubmission.score} / {reviewingAssignment.maxScore ?? reviewingAssignment.max_score}đ
                          </span>
                        )}
                      </div>

                      {/* Text submission */}
                      {selectedSubmission.submission_text ? (
                        <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                          {selectedSubmission.submission_text}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Không có nội dung văn bản kèm theo.</p>
                      )}

                      {/* File attachment preview */}
                      {(selectedSubmission.fileUrl || selectedSubmission.file_url) && (
                        <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-700 truncate">
                            📄 Tệp đính kèm: {String(selectedSubmission.fileUrl || selectedSubmission.file_url).split('/').pop()}
                          </span>
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewFile({
                                  url: String(selectedSubmission.fileUrl || selectedSubmission.file_url),
                                  title: `Bài làm của ${selectedSubmission.student_name}`,
                                })
                              }
                              className="px-3 py-1 bg-white hover:bg-slate-100 text-blue-600 rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Xem bài trực tiếp</span>
                            </button>
                            <a
                              href={String(selectedSubmission.fileUrl || selectedSubmission.file_url)}
                              download
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center space-x-1"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Tải về</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Instant Side-by-Side Grading Form */}
                    <div className="p-5 bg-white rounded-2xl border-2 border-blue-100 shadow-xs space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                          <Award className="w-4 h-4 text-blue-600" />
                          <span>Chấm điểm & Nhận xét phản hồi</span>
                        </span>

                        {/* Quick score pills */}
                        <div className="flex items-center space-x-1 text-xs">
                          <span className="text-slate-400 mr-1 text-[11px]">Điểm nhanh:</span>
                          {[10, 9, 8, 7, 5].map((pts) => (
                            <button
                              key={pts}
                              type="button"
                              onClick={() => setGradeScore(pts)}
                              className={`px-2 py-0.5 rounded-md font-bold text-xs transition ${
                                gradeScore === pts
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              {pts}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="sm:col-span-1">
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Điểm số</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={reviewingAssignment.maxScore ?? reviewingAssignment.max_score ?? 10}
                            required
                            value={gradeScore}
                            onChange={(e) => setGradeScore(Number(e.target.value))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold text-lg text-blue-600 text-center focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-2">
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Lời nhận xét</label>
                          <textarea
                            rows={3}
                            value={gradeFeedback}
                            onChange={(e) => setGradeFeedback(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Ghi nhận xét chi tiết..."
                          />

                          {/* Quick Feedback Snippets */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[
                              'Bài làm rất tốt, đúng yêu cầu!',
                              'Lập luận chặt chẽ, trình bày rõ ràng.',
                              'Cần bổ sung ví dụ minh họa và tài liệu tham khảo.',
                              'Cần chú ý định dạng và cấu trúc bài nộp.',
                            ].map((snippet) => (
                              <button
                                key={snippet}
                                type="button"
                                onClick={() => setGradeFeedback(snippet)}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] transition"
                              >
                                + {snippet}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => handleSaveGradeAndNext(false)}
                          disabled={gradeSaving}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                        >
                          Lưu điểm
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveGradeAndNext(true)}
                          disabled={gradeSaving}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition"
                        >
                          <span>{gradeSaving ? 'Đang lưu...' : 'Lưu & Sang bạn kế tiếp'}</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-400 text-xs">
                    Chọn một sinh viên ở danh sách bên trái để xem bài làm và chấm điểm.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Assignment */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">{editingAssignment ? 'Cập nhật bài tập' : 'Giao bài tập mới'}</h3>
              <button onClick={() => { setIsCreateModalOpen(false); resetAssignmentForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveAssignment} className="space-y-4 mt-4 text-xs">
              {!editingAssignment && (
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Khóa học</label>
                  <select
                    value={targetCourseIdForCreate}
                    onChange={(e) => setTargetCourseIdForCreate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tiêu đề bài tập</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  placeholder="Bài tập tuần 3: Thiết kế CSDL phân tán"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Yêu cầu chi tiết</label>
                <textarea
                  rows={4}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  placeholder="Nêu rõ yêu cầu sinh viên cần nộp, tiêu chí đánh giá..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Hạn nộp</label>
                  <input
                    type="datetime-local"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Điểm tối đa</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newMaxScore}
                    onChange={(e) => setNewMaxScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Trạng thái</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="DRAFT">Bản nháp</option>
                  <option value="PUBLISHED">Đã giao</option>
                  <option value="CLOSED">Đã đóng</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsCreateModalOpen(false); resetAssignmentForm(); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingAssignment ? 'Lưu thay đổi' : 'Giao bài tập'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Student Submit Assignment */}
      {isSubmitModalOpen && submitAssignmentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">Nộp bài tập: {submitAssignmentTarget.title}</h3>
              <button onClick={() => setIsSubmitModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleStudentSubmit} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Nội dung trả lời trực tiếp</label>
                <textarea
                  rows={4}
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  placeholder="Nhập câu trả lời hoặc tóm tắt nội dung bài làm..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tệp bài làm đính kèm (PDF, DOCX, ZIP)</label>
                <input
                  type="file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSubmissionFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {existingFileUrl && !submissionFile && (
                  <p className="text-[11px] text-slate-400 mt-1">Đã có tệp nộp trước đó: <code>{existingFileUrl.split('/').pop()}</code></p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Đang gửi...' : 'Nộp bài'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
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
