import React, { useState, useEffect, useMemo } from 'react';
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
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { Quiz, QuizAttempt, QuizQuestion, Course } from '../types';

type ActiveQuiz = Quiz & {
  attemptId?: string;
  startedAt?: string;
  mode: 'attempt' | 'preview';
};

function shuffleList<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const QuizzesPage: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  // Student Filter Tab
  const [studentTab, setStudentTab] = useState<'READY' | 'ALL'>('READY');

  // Modals state: Create / Edit Quiz
  const [isCreateQuizModalOpen, setIsCreateQuizModalOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [targetCourseIdForCreate, setTargetCourseIdForCreate] = useState<string>('');
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
  const [isShuffled] = useState(true);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [quizScoreResult, setQuizScoreResult] = useState<{ score: number; max: number } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);

  // Lecturer Attempts Review Modal
  const [attemptsQuiz, setAttemptsQuiz] = useState<Quiz | null>(null);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);

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

  const fetchQuizzes = async () => {
    if (courses.length === 0) return;
    try {
      setLoading(true);
      let rawQuizzes: Quiz[] = [];

      if (selectedCourseId === 'ALL') {
        const allResults = await Promise.all(
          courses.map(async (c) => {
            try {
              const list = await api.getCourseQuizzes(c.id);
              return list.map((q) => ({
                ...q,
                courseTitle: c.title,
                courseCode: c.code,
              }));
            } catch {
              return [];
            }
          })
        );
        rawQuizzes = allResults.flat();
      } else {
        const currentCourse = courses.find((c) => String(c.id) === selectedCourseId);
        const list = await api.getCourseQuizzes(selectedCourseId);
        rawQuizzes = list.map((q) => ({
          ...q,
          courseTitle: currentCourse?.title,
          courseCode: currentCourse?.code,
        }));
      }

      setQuizzes(rawQuizzes);
    } catch (err) {
      console.error(err);
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courses.length > 0) {
      fetchQuizzes();
    }
  }, [selectedCourseId, courses]);

  // Exam Countdown Timer
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
    const courseIdToUse = editingQuiz ? editingQuiz.courseId || editingQuiz.course_id : targetCourseIdForCreate;
    if (!courseIdToUse) {
      alert('Vui lòng chọn khóa học.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingQuiz) {
        const updated = await api.updateQuiz(editingQuiz.quizId || String(editingQuiz.id), {
          title: newTitle,
          description: newDesc,
          timeLimitMinutes: Number(newDuration),
          passingScore: Number(newPassingScore),
        });
        setQuizzes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      } else {
        const created = await api.createQuiz(courseIdToUse, {
          title: newTitle,
          description: newDesc,
          duration_minutes: Number(newDuration),
          passingScore: Number(newPassingScore),
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

  const handleToggleQuizPublish = async (quiz: Quiz) => {
    const isPub = quiz.isPublished ?? quiz.is_published;
    try {
      const updated = await api.updateQuiz(quiz.quizId || String(quiz.id), { isPublished: !isPub });
      setQuizzes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err: any) {
      alert('Lỗi cập nhật trạng thái: ' + err.message);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetQuiz) return;
    setSubmitting(true);
    try {
      const options = [
        { id: 'A', text: optA.trim() },
        { id: 'B', text: optB.trim() },
        { id: 'C', text: optC.trim() },
        { id: 'D', text: optD.trim() },
      ];
      if (editingQuestion) {
        await api.updateQuizQuestion(editingQuestion.id || editingQuestion.questionId, {
          questionText: questionText.trim(),
          score: Number(questionPoints),
          options,
          correctAnswer: correctOpt,
        });
      } else {
        await api.addQuizQuestion(targetQuiz.quizId || String(targetQuiz.id), {
          question_text: questionText.trim(),
          points: Number(questionPoints),
          options,
          correct_option_id: correctOpt,
        });
      }
      await fetchQuizzes();
      setIsQuestionModalOpen(false);
    } catch (err: any) {
      alert('Lỗi lưu câu hỏi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditQuiz = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setTargetCourseIdForCreate(String(quiz.courseId || quiz.course_id));
    setNewTitle(quiz.title);
    setNewDesc(quiz.description || '');
    setNewDuration(Number(quiz.timeLimitMinutes ?? quiz.duration_minutes));
    setNewPassingScore(Number(quiz.passingScore ?? 5));
    setIsCreateQuizModalOpen(true);
  };

  const handleOpenAttempts = async (quiz: Quiz) => {
    try {
      const attempts = await api.getQuizAttempts(quiz.quizId || String(quiz.id));
      setAttemptsQuiz(quiz);
      setQuizAttempts(attempts);
    } catch (err: any) {
      alert('Lỗi tải lượt làm bài: ' + err.message);
    }
  };

  const handleStartQuiz = async (quiz: Quiz) => {
    try {
      const attempt = await api.startQuizAttempt(quiz.quizId || String(quiz.id));
      const maxScore = Number(attempt.maxScore ?? attempt.questions.reduce((sum, q) => sum + Number(q.score || 0), 0));
      const attemptEnd = Date.parse(attempt.startedAt) + attempt.timeLimitMinutes * 60_000 + 60_000;
      const quizEnd = quiz.endAt ? Date.parse(quiz.endAt) : Number.POSITIVE_INFINITY;
      setRemainingSeconds(Math.max(0, Math.ceil((Math.min(attemptEnd, quizEnd) - Date.now()) / 1000)));

      let questionsToUse = attempt.questions || [];
      if (isShuffled) {
        questionsToUse = shuffleList(questionsToUse).map((q) => ({
          ...q,
          options: shuffleList(q.options || []).map((opt, oIdx) => ({
            ...opt,
            displayLabel: String.fromCharCode(65 + oIdx),
            originalId: (opt as any).originalId || opt.id,
          })),
        }));
      }

      setActiveQuiz({
        ...quiz,
        attemptId: attempt.attemptId,
        startedAt: attempt.startedAt,
        duration_minutes: attempt.timeLimitMinutes,
        maxScore,
        max_score: maxScore,
        questions: questionsToUse,
        mode: 'attempt',
      });
      setStudentAnswers({});
      setQuizScoreResult(null);
      setShowSubmitWarning(false);
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
      setShowSubmitWarning(false);
    } catch (err: any) {
      alert('Lỗi mở bản xem trước: ' + err.message);
    }
  };

  const handleCheckSubmit = () => {
    if (!activeQuiz) return;
    const questions = activeQuiz.questions || [];
    const unanswered = questions.filter((q) => !studentAnswers[q.id]);
    if (unanswered.length > 0) {
      setShowSubmitWarning(true);
    } else {
      executeSubmitQuiz();
    }
  };

  const executeSubmitQuiz = async () => {
    if (!activeQuiz?.attemptId || activeQuiz.mode !== 'attempt') return;
    setSubmitting(true);
    setShowSubmitWarning(false);
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

  // Filtered quizzes for student tab
  const filteredQuizzes = useMemo(() => {
    if (user?.role !== 'STUDENT') return quizzes;
    if (studentTab === 'READY') {
      return quizzes.filter((q) => Number(q.max_score ?? q.maxScore ?? 0) > 0);
    }
    return quizzes;
  }, [quizzes, user, studentTab]);

  // Answered count for active quiz
  const answeredCount = useMemo(() => {
    return Object.keys(studentAnswers).length;
  }, [studentAnswers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Bài kiểm tra & Trắc nghiệm</h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Tham gia các bài kiểm tra đánh giá kiến thức với đồng hồ đếm ngược và chấm điểm tức thì'
              : 'Soạn ngân hàng câu hỏi, cấu hình thời gian thi và theo dõi kết quả làm bài'}
          </p>
        </div>

        {user?.role !== 'STUDENT' && (
          <button
            onClick={() => { resetQuizForm(); setIsCreateQuizModalOpen(true); }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tạo bài kiểm tra</span>
          </button>
        )}
      </div>

      {/* Course Filter Dropdown & Student Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        {user?.role === 'STUDENT' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStudentTab('READY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                studentTab === 'READY'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Sẵn sàng làm ({quizzes.filter((q) => Number(q.max_score ?? q.maxScore ?? 0) > 0).length})
            </button>
            <button
              onClick={() => setStudentTab('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                studentTab === 'ALL'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả bài thi ({quizzes.length})
            </button>
          </div>
        )}
      </div>

      {/* Quizzes List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Đang tải danh sách bài kiểm tra...</p>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
          <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-700 text-sm">Chưa có bài kiểm tra nào</h3>
          <p className="text-xs mt-1">Không tìm thấy bài kiểm tra cho tiêu chí đã chọn.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuizzes.map((q) => (
            <div
              key={q.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-blue-200 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {q.courseCode && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold font-mono text-[10px]">
                        {q.courseCode}
                      </span>
                    )}
                    <span className="flex items-center text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                      <Clock className="w-3 h-3 mr-1" />
                      {q.duration_minutes || q.timeLimitMinutes} phút
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-700">
                    Điểm tối đa: {Number(q.max_score ?? q.maxScore ?? 0)}đ
                  </span>
                </div>

                {user?.role !== 'STUDENT' && (
                  <span
                    className={`inline-flex mb-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      (q.isPublished ?? q.is_published) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {(q.isPublished ?? q.is_published) ? 'Đã xuất bản' : 'Bản nháp / Đã ẩn'}
                  </span>
                )}

                <h3 className="font-bold text-slate-800 text-base truncate">{q.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{q.description || 'Không có mô tả chi tiết.'}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>{new Date(q.created_at).toLocaleDateString('vi-VN')}</span>

                <div className="flex items-center space-x-1.5">
                  {user?.role !== 'STUDENT' ? (
                    <>
                      <button
                        onClick={() => openEditQuiz(q)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" /> Sửa
                      </button>
                      <button
                        onClick={() => handleToggleQuizPublish(q)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <Archive className="w-3 h-3" /> {(q.isPublished ?? q.is_published) ? 'Ẩn' : 'Mở'}
                      </button>
                      <button
                        onClick={() => {
                          setTargetQuiz(q);
                          setEditingQuestion(null);
                          setQuestionText('');
                          setQuestionPoints(2.5);
                          setOptA('');
                          setOptB('');
                          setOptC('');
                          setOptD('');
                          setCorrectOpt('A');
                          setIsQuestionModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                      >
                        + Câu hỏi
                      </button>
                      <button
                        onClick={() => handleOpenAttempts(q)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <History className="w-3 h-3" /> Lượt làm
                      </button>
                      <button
                        onClick={() => handlePreviewQuiz(q)}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold"
                      >
                        Xem trước
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleStartQuiz(q)}
                      disabled={Number(q.max_score ?? q.maxScore ?? 0) <= 0}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{Number(q.max_score ?? q.maxScore ?? 0) <= 0 ? 'Chưa có câu hỏi' : 'Bắt đầu làm bài'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DISTRACTION-FREE EXAM INTERFACE MODAL WITH QUESTION PALETTE */}
      {activeQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Sticky Exam Header with Smart Timer */}
            <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <span className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                  Thi
                </span>
                <div>
                  <h3 className="font-bold text-sm text-white truncate max-w-md">{activeQuiz.title}</h3>
                  <p className="text-[11px] text-slate-400">
                    {activeQuiz.questions?.length || 0} câu hỏi • Điểm tối đa: {Number(activeQuiz.max_score ?? activeQuiz.maxScore ?? 0)}đ
                  </p>
                </div>
              </div>

              {/* Smart Countdown Clock */}
              {activeQuiz.mode === 'attempt' && !quizScoreResult && (
                <div
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl font-mono text-sm font-bold shadow-xs transition ${
                    remainingSeconds < 60
                      ? 'bg-red-600 text-white animate-pulse'
                      : remainingSeconds < 300
                      ? 'bg-amber-500 text-white'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  <Timer className="w-4 h-4" />
                  <span>
                    {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}
                  </span>
                </div>
              )}

              <button
                onClick={() => {
                  if (activeQuiz.mode === 'attempt' && !quizScoreResult) {
                    if (window.confirm('Bạn đang trong ca thi trực tuyến! Nếu thoát ra, bài làm sẽ tự động được chấm điểm. Bạn có chắc chắn muốn thoát?')) {
                      executeSubmitQuiz();
                    }
                  } else {
                    setActiveQuiz(null);
                    setQuizScoreResult(null);
                  }
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Exam Body */}
            {quizScoreResult ? (
              <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
                <div className="max-w-md w-full text-center space-y-4">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                    <Award className="w-10 h-10" />
                  </div>
                  <h4 className="text-2xl font-bold text-slate-800">Kết quả bài thi của bạn</h4>
                  <div className="text-5xl font-extrabold text-emerald-600 tracking-tight">
                    {quizScoreResult.score.toFixed(1)} / {quizScoreResult.max}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Hệ thống đã tự động ghi nhận điểm số vào sổ điểm cá nhân của bạn và gửi thông báo kết quả tới Giảng viên phụ trách môn học.
                  </p>
                  <button
                    onClick={() => {
                      setActiveQuiz(null);
                      setQuizScoreResult(null);
                    }}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 shadow-xs"
                  >
                    Hoàn tất & Quay lại
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Left Area: Questions Scroll (w-3/4) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {(!activeQuiz.questions || activeQuiz.questions.length === 0) ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Chưa có câu hỏi nào trong đề thi này.
                    </div>
                  ) : (
                    activeQuiz.questions.map((q, idx) => {
                      const isAnswered = Boolean(studentAnswers[q.id]);
                      return (
                        <div
                          key={q.id}
                          id={`question-${idx + 1}`}
                          className={`p-5 rounded-2xl border transition ${
                            isAnswered ? 'border-slate-200 bg-white' : 'border-slate-200/80 bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <span className="font-bold text-slate-800 text-sm">
                              Câu {idx + 1}: {q.question_text}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 shrink-0">
                              {q.points} điểm
                            </span>
                          </div>

                          <div className="space-y-2">
                            {(Array.isArray(q.options) ? q.options : []).map((opt: any) => {
                              const optKey = String(opt.originalId || opt.id);
                              const displayKey = opt.displayLabel || opt.id;
                              const isSelected = studentAnswers[q.id] === optKey;
                              return (
                                <label
                                  key={opt.id + '_' + displayKey}
                                  className={`flex items-center space-x-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                                    isSelected
                                      ? 'border-blue-500 bg-blue-50/60 text-blue-900 font-semibold shadow-2xs'
                                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`q_${q.id}`}
                                    value={optKey}
                                    checked={isSelected}
                                    onChange={() => setStudentAnswers((prev) => ({ ...prev, [q.id]: optKey }))}
                                    className="text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>
                                    <strong className="mr-1">{displayKey}.</strong> {opt.text}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Right Area: Question Palette Navigation Rail (w-1/4) */}
                <div className="w-64 border-l border-slate-200 bg-slate-50 p-5 flex flex-col justify-between shrink-0">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Bản đồ câu hỏi</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Đã làm: <strong className="text-blue-600">{answeredCount}</strong> / {activeQuiz.questions?.length || 0} câu
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full transition-all duration-300"
                        style={{
                          width: `${activeQuiz.questions?.length ? (answeredCount / activeQuiz.questions.length) * 100 : 0}%`,
                        }}
                      />
                    </div>

                    {/* Question Palette Grid */}
                    <div className="grid grid-cols-4 gap-2 pt-2">
                      {(activeQuiz.questions || []).map((q, idx) => {
                        const isDone = Boolean(studentAnswers[q.id]);
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(`question-${idx + 1}`);
                              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            className={`h-8 rounded-lg font-bold text-xs transition ${
                              isDone
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submission Action */}
                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    {activeQuiz.mode === 'attempt' ? (
                      <button
                        onClick={handleCheckSubmit}
                        disabled={submitting}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs shadow-xs transition"
                      >
                        {submitting ? 'Đang nộp bài...' : 'Nộp bài thi'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveQuiz(null)}
                        className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold text-xs transition"
                      >
                        Đóng bản xem trước
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRE-SUBMISSION WARNING MODAL */}
      {showSubmitWarning && activeQuiz && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 text-center space-y-3 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-base">Bạn vẫn còn câu chưa chọn đáp án!</h4>
            <p className="text-xs text-slate-500">
              Bạn mới hoàn thành <strong>{answeredCount}</strong> trong tổng số{' '}
              <strong>{activeQuiz.questions?.length || 0}</strong> câu hỏi. Bạn có chắc chắn muốn nộp bài thi ngay bây giờ?
            </p>
            <div className="pt-2 flex items-center justify-center space-x-2">
              <button
                onClick={() => setShowSubmitWarning(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Tiếp tục làm bài
              </button>
              <button
                onClick={executeSubmitQuiz}
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs"
              >
                Xác nhận nộp bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Quiz */}
      {isCreateQuizModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editingQuiz ? 'Cập nhật bài kiểm tra' : 'Tạo bài kiểm tra mới'}
              </h3>
              <button onClick={() => { setIsCreateQuizModalOpen(false); resetQuizForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveQuiz} className="space-y-4 mt-4 text-xs">
              {!editingQuiz && (
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Thuộc khóa học</label>
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
                <label className="block font-semibold text-slate-700 uppercase mb-1">Tiêu đề bài kiểm tra</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                  placeholder="Kiểm tra giữa kỳ: Thiết kế CSDL"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Mô tả bài kiểm tra</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  placeholder="Nêu rõ phạm vi kiến thức kiểm tra..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Thời gian làm bài (Phút)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    required
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Điểm đạt (Passing score)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={newPassingScore}
                    onChange={(e) => setNewPassingScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => { setIsCreateQuizModalOpen(false); resetQuizForm(); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingQuiz ? 'Lưu thay đổi' : 'Tạo bài kiểm tra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Question Editor */}
      {isQuestionModalOpen && targetQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editingQuestion ? 'Sửa câu hỏi' : `Thêm câu hỏi cho: ${targetQuiz.title}`}
              </h3>
              <button onClick={() => setIsQuestionModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Nội dung câu hỏi</label>
                <textarea
                  rows={3}
                  required
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  placeholder="Trong cơ sở dữ liệu quan hệ, khóa chính (Primary Key) có đặc điểm nào sau đây?"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Điểm câu này</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="10"
                    required
                    value={questionPoints}
                    onChange={(e) => setQuestionPoints(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Đáp án đúng</label>
                  <select
                    value={correctOpt}
                    onChange={(e) => setCorrectOpt(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-blue-600"
                  >
                    <option value="A">Lựa chọn A</option>
                    <option value="B">Lựa chọn B</option>
                    <option value="C">Lựa chọn C</option>
                    <option value="D">Lựa chọn D</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-slate-700 uppercase">Các lựa chọn đáp án</label>
                {[
                  { key: 'A', val: optA, set: setOptA },
                  { key: 'B', val: optB, set: setOptB },
                  { key: 'C', val: optC, set: setOptC },
                  { key: 'D', val: optD, set: setOptD },
                ].map((item) => (
                  <div key={item.key} className="flex items-center space-x-2">
                    <span
                      className={`w-6 h-6 rounded-lg font-bold flex items-center justify-center shrink-0 text-xs ${
                        correctOpt === item.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.key}
                    </span>
                    <input
                      type="text"
                      required
                      value={item.val}
                      onChange={(e) => item.set(e.target.value)}
                      placeholder={`Nội dung lựa chọn ${item.key}...`}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingQuestion ? 'Lưu thay đổi' : 'Thêm câu hỏi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Lecturer View Attempts */}
      {attemptsQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">Lượt làm bài: {attemptsQuiz.title}</h3>
              <button onClick={() => setAttemptsQuiz(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 my-4 text-xs">
              {quizAttempts.length === 0 ? (
                <div className="py-8 text-center text-slate-400">Chưa có sinh viên nào nộp bài kiểm tra này.</div>
              ) : (
                quizAttempts.map((att) => (
                  <div key={att.attemptId || (att as any).id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{att.studentName || 'Sinh viên'}</div>
                      <div className="text-[10px] text-slate-400">
                        Bắt đầu: {new Date(att.startedAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-sm text-emerald-600">
                        {att.score} / {attemptsQuiz.max_score || attemptsQuiz.maxScore}đ
                      </span>
                      <div className="text-[10px] text-slate-400">Lượt #{att.attemptNo}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setAttemptsQuiz(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
