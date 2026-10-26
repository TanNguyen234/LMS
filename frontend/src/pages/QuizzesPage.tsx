import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Clock,
  Award,
  Play,
  X,
  Timer,
  Pencil,
  History,
  Archive,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { statusLabel } from '../utils/vi';
import type { Quiz, QuizAttempt, QuizQuestion, Course } from '../types';

type ActiveQuiz = Quiz & {
  attemptId?: string;
  startedAt?: string;
  mode: 'attempt' | 'preview';
};

export const QuizzesPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isCreateQuizModalOpen, setIsCreateQuizModalOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDuration, setNewDuration] = useState(15);
  const [newPassingScore, setNewPassingScore] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  // Add Question Modal
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [targetQuiz, setTargetQuiz] = useState<Quiz | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [questionPoints, setQuestionPoints] = useState(2.5);
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState('A');

  // Student Taking Quiz State
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [quizScoreResult, setQuizScoreResult] = useState<{ score: number; max: number } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [attemptsQuiz, setAttemptsQuiz] = useState<Quiz | null>(null);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const data = await api.getCourses();
        setCourses(data);
        if (data.length > 0) setSelectedCourseId(String(data[0].id));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  const fetchQuizzes = async () => {
    if (!selectedCourseId) return;
    try {
      setLoading(true);
      const data = await api.getCourseQuizzes(selectedCourseId);
      setQuizzes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, [selectedCourseId]);

  useEffect(() => {
    if (!activeQuiz || activeQuiz.mode !== 'attempt' || !activeQuiz.startedAt) {
      return;
    }

    const startedAt = Date.parse(activeQuiz.startedAt);
    const quizEndAt = activeQuiz.endAt ? Date.parse(activeQuiz.endAt) : Number.POSITIVE_INFINITY;
    const attemptEndAt = startedAt + activeQuiz.duration_minutes * 60_000 + 60_000;
    const deadline = Math.min(quizEndAt, attemptEndAt);
    const updateCountdown = () => setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [activeQuiz]);

  const resetQuizForm = () => {
    setNewTitle('');
    setNewDesc('');
    setNewDuration(15);
    setNewPassingScore(5);
    setEditingQuiz(null);
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuiz && !courses.some((course) => course.id === selectedCourseId)) return;
    setSubmitting(true);
    try {
      if (editingQuiz) {
        const updated = await api.updateQuiz(editingQuiz.id, {
          title: newTitle,
          description: newDesc,
          duration_minutes: Number(newDuration),
          passingScore: Number(newPassingScore),
        });
        setQuizzes((prev) => prev.map((quiz) => quiz.id === updated.id ? updated : quiz));
      } else {
        const created = await api.createQuiz(selectedCourseId, {
          title: newTitle,
          description: newDesc,
          duration_minutes: Number(newDuration),
          passingScore: Number(newPassingScore),
          is_published: true,
        });
        setQuizzes((prev) => [created, ...prev]);
      }
      setIsCreateQuizModalOpen(false);
      resetQuizForm();
    } catch (err: any) {
      alert((editingQuiz ? 'Lỗi cập nhật bài kiểm tra: ' : 'Lỗi tạo bài kiểm tra: ') + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetQuiz) return;
    setSubmitting(true);
    try {
      const data = {
        question_text: questionText,
        question_type: 'SINGLE_CHOICE',
        points: Number(questionPoints),
        options: [
          { id: 'A', text: optA },
          { id: 'B', text: optB },
          { id: 'C', text: optC },
          { id: 'D', text: optD },
        ],
        correct_option_id: correctOpt,
      };
      if (editingQuestion) await api.updateQuizQuestion(editingQuestion.id, data);
      else await api.addQuizQuestion(targetQuiz.id, data);
      alert(editingQuestion ? 'Đã cập nhật câu hỏi thành công!' : 'Đã thêm câu hỏi trắc nghiệm thành công!');
      setIsQuestionModalOpen(false);
      await fetchQuizzes();
      if (activeQuiz?.mode === 'preview' && activeQuiz.id === targetQuiz.id) await handlePreviewQuiz(targetQuiz);
      setEditingQuestion(null);
      setQuestionText('');
      setOptA('');
      setOptB('');
      setOptC('');
      setOptD('');
    } catch (err: any) {
      alert('Lỗi thêm câu hỏi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleQuizPublish = async (quiz: Quiz) => {
    const nextPublished = !(quiz.isPublished ?? quiz.is_published);
    try {
      await api.publishQuiz(quiz.id, nextPublished);
      setQuizzes((prev) => prev.map((item) => item.id === quiz.id ? { ...item, isPublished: nextPublished, is_published: nextPublished } : item));
    } catch (err: any) { alert('Lỗi cập nhật trạng thái quiz: ' + err.message); }
  };

  const openEditQuiz = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setNewTitle(quiz.title);
    setNewDesc(quiz.description || '');
    setNewDuration(Number(quiz.timeLimitMinutes ?? quiz.duration_minutes));
    setNewPassingScore(Number(quiz.passingScore ?? 5));
    setIsCreateQuizModalOpen(true);
  };

  const handleOpenAttempts = async (quiz: Quiz) => {
    try {
      const attempts = await api.getQuizAttempts(quiz.id);
      setAttemptsQuiz(quiz);
      setQuizAttempts(attempts);
    } catch (err: any) { alert('Lỗi tải lượt làm bài: ' + err.message); }
  };

  const openEditQuestion = (quiz: Quiz, question: QuizQuestion) => {
    setTargetQuiz(quiz);
    setEditingQuestion(question);
    setQuestionText(question.question_text || question.questionText);
    setQuestionPoints(Number(question.points ?? question.score));
    const options = question.options || [];
    setOptA(options.find((option) => String(option.id) === 'A')?.text || '');
    setOptB(options.find((option) => String(option.id) === 'B')?.text || '');
    setOptC(options.find((option) => String(option.id) === 'C')?.text || '');
    setOptD(options.find((option) => String(option.id) === 'D')?.text || '');
    setCorrectOpt(String(question.correctAnswer ?? question.correct_option_id ?? 'A'));
    setIsQuestionModalOpen(true);
  };

  const handleStartQuiz = async (quiz: Quiz) => {
    try {
      const attempt = await api.startQuizAttempt(quiz.quizId || String(quiz.id));
      const maxScore = Number(attempt.maxScore ?? attempt.questions.reduce((sum, q) => sum + Number(q.score || 0), 0));
      const attemptEnd = Date.parse(attempt.startedAt) + attempt.timeLimitMinutes * 60_000 + 60_000;
      const quizEnd = quiz.endAt ? Date.parse(quiz.endAt) : Number.POSITIVE_INFINITY;
      setRemainingSeconds(Math.max(0, Math.ceil((Math.min(attemptEnd, quizEnd) - Date.now()) / 1000)));
      setActiveQuiz({
        ...quiz,
        attemptId: attempt.attemptId,
        startedAt: attempt.startedAt,
        duration_minutes: attempt.timeLimitMinutes,
        maxScore,
        max_score: maxScore,
        questions: attempt.questions,
        mode: 'attempt',
      });
      setStudentAnswers({});
      setQuizScoreResult(null);
    } catch (err: any) {
      alert('Không thể bắt đầu bài kiểm tra: ' + err.message);
    }
  };

  const handlePreviewQuiz = async (quiz: Quiz) => {
    try {
      const fullQuiz = await api.getQuiz(quiz.quizId || String(quiz.id));
      setActiveQuiz({ ...fullQuiz, mode: 'preview' });
      setStudentAnswers({});
      setQuizScoreResult(null);
    } catch (err: any) {
      alert('Lỗi mở bản xem trước: ' + err.message);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz?.attemptId || activeQuiz.mode !== 'attempt') return;
    setSubmitting(true);
    try {
      const result = await api.submitQuiz(activeQuiz.attemptId, studentAnswers);
      setQuizScoreResult({
        score: result.score,
        max: Number(activeQuiz.max_score ?? activeQuiz.maxScore ?? 0),
      });
    } catch (err: any) {
      alert('Lỗi nộp bài kiểm tra: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Bài kiểm tra trắc nghiệm</h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Làm bài kiểm tra đánh giá kiến thức trực tuyến với cơ chế chấm điểm tự động'
              : 'Soạn ngân hàng câu hỏi trắc nghiệm và quản lý các đợt kiểm tra trực tuyến'}
          </p>
        </div>

        {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
          <button
            onClick={() => { resetQuizForm(); setIsCreateQuizModalOpen(true); }}
            disabled={!courses.some((course) => course.id === selectedCourseId)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-xs transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo bài kiểm tra mới</span>
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

      {/* Quiz List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Đang tải danh sách bài kiểm tra...</p>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
          <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-700">Chưa có bài kiểm tra nào</h3>
          <p className="text-sm mt-1">Chưa có bài kiểm tra nào trong khóa học này.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-blue-200 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    {q.duration_minutes} phút
                  </span>
                  <span className="text-xs font-bold text-slate-600">Điểm tối đa: {Number(q.max_score ?? q.maxScore ?? 0)}đ</span>
                </div>
                {user?.role !== 'STUDENT' && <span className={`inline-flex mb-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${(q.isPublished ?? q.is_published) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{(q.isPublished ?? q.is_published) ? 'Đã xuất bản' : 'Bản nháp / đã ẩn'}</span>}
                <h3 className="font-bold text-slate-800 text-base">{q.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{q.description || 'Không có mô tả'}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">Tạo ngày: {new Date(q.created_at).toLocaleDateString('vi-VN')}</span>

                <div className="flex items-center space-x-2">
                  {(user?.role === 'ADMIN' || user?.role === 'LECTURER') && (
                    <>
                      <button onClick={() => openEditQuiz(q)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Sửa</button>
                      <button onClick={() => handleToggleQuizPublish(q)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1"><Archive className="w-3.5 h-3.5" /> {(q.isPublished ?? q.is_published) ? 'Ẩn' : 'Xuất bản'}</button>
                      <button onClick={() => { setTargetQuiz(q); setEditingQuestion(null); setQuestionText(''); setQuestionPoints(2.5); setOptA(''); setOptB(''); setOptC(''); setOptD(''); setCorrectOpt('A'); setIsQuestionModalOpen(true); }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">+ Câu hỏi</button>
                      <button onClick={() => handleOpenAttempts(q)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1"><History className="w-3.5 h-3.5" /> Lượt làm</button>
                    </>
                  )}

                  {user?.role === 'STUDENT' ? (
                    <button
                      onClick={() => handleStartQuiz(q)}
                      disabled={Number(q.max_score ?? q.maxScore ?? 0) <= 0}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{Number(q.max_score ?? q.maxScore ?? 0) <= 0 ? 'Chưa có câu hỏi' : 'Làm bài'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePreviewQuiz(q)}
                      className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                    >
                      Xem trước
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Student Taking Quiz Active Interface Modal */}
      {activeQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{activeQuiz.title}</h3>
                <div className="flex items-center space-x-2 mt-0.5 text-xs text-slate-500">
                  <span className="flex items-center text-blue-600 font-semibold">
                    <Timer className="w-3.5 h-3.5 mr-1" /> Thời gian: {activeQuiz.duration_minutes} phút
                  </span>
                  <span>•</span>
                  <span>Điểm tối đa: {Number(activeQuiz.max_score ?? activeQuiz.maxScore ?? 0)} điểm</span>
                </div>
              </div>
              <button
              onClick={() => {
                  setActiveQuiz(null);
                  setQuizScoreResult(null);
                }}
                aria-label={activeQuiz.mode === 'preview' ? 'Đóng bản xem trước' : 'Đóng bài kiểm tra'}
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {quizScoreResult ? (
              <div className="py-12 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Award className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-bold text-slate-800">Kết quả bài làm của bạn</h4>
                <div className="text-4xl font-extrabold text-emerald-600">
                  {quizScoreResult.score.toFixed(1)} / {quizScoreResult.max}
                </div>
                <p className="text-xs text-slate-500">
                  Điểm số đã được hệ thống lưu vào sổ điểm và thông báo tới giảng viên phụ trách.
                </p>
                <button
                  onClick={() => {
                    setActiveQuiz(null);
                    setQuizScoreResult(null);
                  }}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                >
                  Hoàn thành và Đóng
                </button>
              </div>
            ) : (
              <>
                {activeQuiz.mode === 'attempt' && (
                  <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800" aria-live="polite">
                    Còn lại: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')} — thời gian hiển thị chỉ tham khảo; máy chủ kiểm tra hạn nộp.
                  </div>
                )}
                {activeQuiz.mode === 'preview' && (
                  <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    Chế độ xem trước. Bản xem trước không tạo lượt làm bài và không cho nộp đáp án.
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-6 my-4 pr-1">
                  {!activeQuiz.questions || activeQuiz.questions.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-sm">
                      Chưa có câu hỏi nào trong bài kiểm tra này. Giảng viên vui lòng thêm câu hỏi trước.
                    </div>
                  ) : (
                    activeQuiz.questions.map((q, idx) => (
                      <div key={q.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                        <div className="flex items-start justify-between">
                          <span className="font-semibold text-slate-800 text-sm">
                            Câu {idx + 1}: {q.question_text}
                          </span>
                          <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded ml-2">
                            {q.points} điểm
                          </span>
                          {activeQuiz.mode === 'preview' && (user?.role === 'ADMIN' || user?.role === 'LECTURER') && <button onClick={() => openEditQuestion(activeQuiz, q)} className="ml-2 text-xs font-semibold text-blue-600 hover:underline">Sửa câu hỏi</button>}
                        </div>

                        <div className="space-y-2">
                          {(Array.isArray(q.options) ? q.options : []).map((opt) => (
                            <label
                              key={opt.id}
                              className={`flex items-center space-x-3 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                                studentAnswers[q.id] === String(opt.id)
                                  ? 'border-blue-500 bg-blue-50/50 text-blue-800 font-medium'
                                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q_${q.id}`}
                                value={opt.id}
                                checked={studentAnswers[q.id] === String(opt.id)}
                                onChange={() => setStudentAnswers((prev) => ({ ...prev, [q.id]: String(opt.id) }))}
                                className="text-blue-600 focus:ring-blue-500"
                              />
                              <span>
                                <strong className="mr-1">{opt.id}.</strong> {opt.text}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {activeQuiz.mode === 'attempt' && activeQuiz.questions && activeQuiz.questions.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Đã trả lời: {Object.keys(studentAnswers).length} / {activeQuiz.questions.length} câu
                    </span>
                    <button
                      onClick={handleSubmitQuiz}
                      disabled={submitting}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting ? 'Đang chấm điểm...' : 'Nộp bài & Chấm điểm'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create Quiz */}
      {isCreateQuizModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editingQuiz ? 'Cập nhật bài kiểm tra' : 'Tạo bài kiểm tra mới'}</h3>
              <button onClick={() => { setIsCreateQuizModalOpen(false); resetQuizForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveQuiz} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Tiêu đề bài kiểm tra</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Kiểm tra trắc nghiệm Chương 1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Mô tả tóm tắt</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Thời gian (phút)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Điểm đạt</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newPassingScore}
                    onChange={(e) => setNewPassingScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsCreateQuizModalOpen(false); resetQuizForm(); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                >
                  {editingQuiz ? 'Lưu thay đổi' : 'Lưu bài kiểm tra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Question */}
      {isQuestionModalOpen && targetQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editingQuestion ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}: {targetQuiz.title}</h3>
              <button onClick={() => { setIsQuestionModalOpen(false); setEditingQuestion(null); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Câu hỏi</label>
                <input
                  type="text"
                  required
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="Nội dung câu hỏi trắc nghiệm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Điểm câu hỏi</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  value={questionPoints}
                  onChange={(e) => setQuestionPoints(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 uppercase">4 Phương án trả lời</label>
                {[
                  { id: 'A', val: optA, set: setOptA },
                  { id: 'B', val: optB, set: setOptB },
                  { id: 'C', val: optC, set: setOptC },
                  { id: 'D', val: optD, set: setOptD },
                ].map((item) => (
                  <div key={item.id} className="flex items-center space-x-2">
                    <span className="w-6 text-xs font-bold text-slate-500 text-center">{item.id}.</span>
                    <input
                      type="text"
                      required
                      value={item.val}
                      onChange={(e) => item.set(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                      placeholder={`Nội dung đáp án ${item.id}`}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Đáp án chính xác</label>
                <select
                  value={correctOpt}
                  onChange={(e) => setCorrectOpt(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white font-semibold text-emerald-700"
                >
                  <option value="A">Đáp án A</option>
                  <option value="B">Đáp án B</option>
                  <option value="C">Đáp án C</option>
                  <option value="D">Đáp án D</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsQuestionModalOpen(false); setEditingQuestion(null); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                >
                  {editingQuestion ? 'Lưu thay đổi' : 'Lưu câu hỏi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {attemptsQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div><h3 className="font-bold text-slate-800">Lượt làm: {attemptsQuiz.title}</h3><p className="text-xs text-slate-500">{quizAttempts.length} lượt được lưu</p></div>
              <button onClick={() => setAttemptsQuiz(null)} aria-label="Đóng danh sách lượt làm"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {quizAttempts.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Chưa có lượt làm bài.</p> : quizAttempts.map((attempt) => (
                <div key={attempt.id} className="py-3 flex items-center justify-between gap-3">
                  <div><p className="font-semibold text-sm text-slate-800">{attempt.student_name || 'Sinh viên'}{attempt.student_code ? ` (${attempt.student_code})` : ''}</p><p className="text-xs text-slate-500">Bắt đầu: {new Date(attempt.started_at).toLocaleString('vi-VN')}</p></div>
                  <div className="text-right"><p className="text-sm font-bold text-slate-800">{attempt.score ?? '—'} điểm</p><p className="text-xs text-slate-500">{statusLabel(attempt.status)}{attempt.submitted_at ? ` · ${new Date(attempt.submitted_at).toLocaleString('vi-VN')}` : ''}</p></div>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end"><button onClick={() => setAttemptsQuiz(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold">Đóng</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
