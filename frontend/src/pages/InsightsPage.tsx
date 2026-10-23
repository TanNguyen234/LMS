import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Award, BarChart3, BookOpen, CheckCircle2,
  ClipboardCheck, Clock3, FileText, GraduationCap, RefreshCw,
  Search, ShieldCheck, Users, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type {
  GradingQueueItem, LearningInsights, OperationsInsights,
  Submission, TeachingInsights,
} from '../types';

const localDate = (value: string) => {
  const instant = new Date(value);
  return Number.isNaN(instant.valueOf())
    ? 'Không xác định'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(instant);
};

function MetricCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

function RatioBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  return (
    <div aria-label={`${label}: ${max > 0 ? percent.toFixed(1) + '%' : 'chưa có dữ liệu'}`}>
      <div className="mb-2 flex justify-between gap-2 text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{max > 0 ? percent.toFixed(0) + '%' : '—'}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function TeachingPanel({ report, reload }: { report: TeachingInsights; reload: () => void }) {
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('ALL');
  const [selected, setSelected] = useState<GradingQueueItem | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const results = useMemo(() => report.queue.filter((entry) => {
    if (courseId !== 'ALL' && courseId !== entry.courseId) return false;
    const q = search.trim().toLocaleLowerCase('vi-VN');
    return !q || [entry.assignmentTitle, entry.studentName, entry.studentCode || '', entry.courseCode]
      .some((name) => name.toLocaleLowerCase('vi-VN').includes(q));
  }), [report.queue, courseId, search]);

  useEffect(() => {
    if (!selected) return;
    let live = true;
    setReading(true);
    setSubmission(null);
    setScore('');
    setFeedback('');
    setModalError(null);
    api.getAssignmentSubmissions(selected.assignmentId).then((submissions) => {
      if (!live) return;
      const match = submissions.find((row) => String(row.id) === selected.submissionId);
      if (!match || (match.status !== 'SUBMITTED' && match.status !== 'LATE')) {
        setModalError('Bài nộp không còn ở trạng thái chờ chấm. Hãy làm mới danh sách.');
        return;
      }
      setSubmission(match);
    }).catch((error: unknown) => {
      if (live) setModalError(error instanceof Error ? error.message : 'Không tải được bài nộp.');
    }).finally(() => { if (live) setReading(false); });
    return () => { live = false; };
  }, [selected]);

  const saveGrade = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !submission || saving) return;
    const value = Number(score);
    if (!score.trim() || !Number.isFinite(value) || value < 0 || value > selected.maxScore) {
      setModalError(`Điểm phải nằm trong khoảng 0 đến ${selected.maxScore}.`);
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await api.gradeSubmission(submission.id, { score: value, feedback: feedback.trim() });
      setSelected(null);
      reload();
    } catch (error: unknown) {
      setModalError(error instanceof Error ? error.message : 'Không lưu được điểm. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Lớp đang phụ trách" value={report.courses.length} hint="Chỉ học phần đang hoạt động" />
        <MetricCard label="Bài chờ chấm" value={report.totalPending} hint="Bao gồm bài nộp đúng hạn và nộp muộn" />
        <MetricCard label="Đã chấm" value={report.courses.reduce((s, c) => s + c.gradedSubmissions, 0)} hint="Lượt nộp được ghi nhận đã chấm" />
        <MetricCard label="Sinh viên theo lớp" value={report.courses.reduce((s, c) => s + c.activeStudents, 0)} hint="Tổng lượt đăng ký (không phải người duy nhất)" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-900">Sức khỏe lớp học</h2><p className="mt-1 text-xs text-slate-500">Các số liệu trực tiếp từ học phần và lượt nộp bài</p></div>
          <Link to="/courses" className="text-xs font-semibold text-blue-600 hover:underline">Mở danh sách lớp →</Link>
        </div>
        {report.courses.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {report.courses.map((course) => (
              <div key={course.courseId} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><span className="text-[11px] font-bold tracking-wide text-blue-600">{course.courseCode}</span><h3 className="mt-1 truncate text-sm font-bold text-slate-900">{course.title}</h3></div>
                  <Link className="rounded-lg bg-white p-2 text-blue-600 hover:bg-blue-50" to={`/courses/${course.courseId}`} aria-label={`Mở ${course.title}`}><ArrowRight className="h-4 w-4" /></Link>
                </div>
                <div className="my-4 grid grid-cols-3 gap-2 border-y border-slate-200 py-3 text-center">
                  <div><p className="text-lg font-bold text-slate-900">{course.activeStudents}</p><p className="text-[11px] text-slate-500">Sinh viên</p></div>
                  <div><p className="text-lg font-bold text-slate-900">{course.publishedLessons}</p><p className="text-[11px] text-slate-500">Bài học</p></div>
                  <div><p className="text-lg font-bold text-slate-900">{course.publishedQuizzes}</p><p className="text-[11px] text-slate-500">Quiz</p></div>
                </div>
                <RatioBar label="Đã chấm / tổng lượt nộp" value={course.gradedSubmissions} max={course.gradedSubmissions + course.awaitingGrade} />
                <div className="mt-3 flex justify-between text-xs text-slate-600">
                  <span>{course.publishedAssignments} bài tập công bố</span>
                  <span className={course.awaitingGrade > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{course.awaitingGrade} chờ chấm</span>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Bạn chưa được phân công học phần đang hoạt động.</p>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-bold text-slate-900">Hàng đợi chấm bài</h2><p className="mt-1 text-xs text-slate-500">Cũ nhất trước · hiển thị tối đa 60 bài chờ chấm</p></div>
          <span className="w-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">{report.shownPending}/{report.totalPending} bài đang hiển thị</span>
        </div>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[1fr_220px]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Tìm sinh viên hoặc bài tập</span><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none" placeholder="Tìm sinh viên, môn, bài tập..." /></label>
          <label className="sr-only" htmlFor="teaching-filter">Lọc theo lớp</label>
          <select id="teaching-filter" value={courseId} onChange={(event) => setCourseId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ALL">Tất cả học phần</option>{report.courses.map((c) => <option key={c.courseId} value={c.courseId}>{c.courseCode} — {c.title}</option>)}</select>
        </div>
        {results.length ? <div className="divide-y divide-slate-100">
          {results.map((item) => (
            <div key={item.submissionId} className="flex flex-col gap-3 p-4 hover:bg-slate-50/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap gap-2 text-[11px] font-semibold"><span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">{item.courseCode}</span>{item.status === 'LATE' && <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">Nộp muộn</span>}</div>
                <p className="truncate text-sm font-bold text-slate-900">{item.studentName} {item.studentCode ? `· ${item.studentCode}` : ''}</p>
                <p className="mt-0.5 text-xs text-slate-700">{item.assignmentTitle}</p>
                <p className="mt-1 text-[11px] text-slate-500">Nộp lúc {localDate(item.submittedAt)} · Tối đa {item.maxScore} điểm</p>
              </div>
              <button onClick={() => setSelected(item)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"><ClipboardCheck className="h-4 w-4" /> Xem và chấm</button>
            </div>
          ))}
        </div> : <p className="p-8 text-center text-sm text-slate-500">Không có bài nộp phù hợp với bộ lọc.</p>}
      </section>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setSelected(null); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="grade-modal-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-bold text-blue-600">{selected.courseCode} · {selected.assignmentTitle}</p><h2 id="grade-modal-title" className="mt-1 text-lg font-bold text-slate-900">Chấm bài — {selected.studentName}</h2></div>
            <button aria-label="Đóng hộp thoại" onClick={() => setSelected(null)} disabled={saving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
          {reading ? <p role="status" className="py-10 text-sm text-slate-500">Đang tải nội dung bài nộp...</p> : submission && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nội dung sinh viên đã nộp</p>
              <div className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{submission.contentText || submission.submission_text || 'Bài nộp không có nội dung.'}</div>
              <form onSubmit={saveGrade} className="mt-5 space-y-4">
                <div><label htmlFor="grade-score" className="mb-2 block text-xs font-semibold text-slate-700">Điểm (0–{selected.maxScore})</label><input id="grade-score" type="number" required step="any" min={0} max={selected.maxScore} value={score} onChange={(event) => setScore(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" /></div>
                <div><label htmlFor="grade-feedback" className="mb-2 block text-xs font-semibold text-slate-700">Nhận xét</label><textarea id="grade-feedback" rows={3} maxLength={2000} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Nhận xét cụ thể giúp sinh viên cải thiện..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" /></div>
                <p className="text-xs text-slate-500">Sau khi lưu, điểm và phản hồi được ghi vào SQL Server theo luồng chấm bài hiện có và gửi thông báo cho sinh viên.</p>
                <div className="flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Hủy</button><button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu điểm thật'}</button></div>
              </form>
            </div>
          )}
          {modalError && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{modalError}</div>}
        </div>
      </div>}
    </div>
  );
}

function LearningPanel({ report }: { report: LearningInsights }) {
  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <MetricCard label="Điểm trung bình quan sát" value={report.averageOutOfTen === null ? '—' : report.averageOutOfTen.toFixed(2)} hint="Trung bình không trọng số của các cột điểm đã ghi nhận; không phải GPA" />
      <MetricCard label="Cột điểm đã có" value={report.totalGradedItems} hint="Không tính cột điểm chưa chấm" />
      <MetricCard label="Học phần đang học" value={report.courses.length} hint="Học phần đã đăng ký và còn hoạt động" />
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5"><h2 className="text-lg font-bold text-slate-900">Kết quả theo học phần</h2><p className="mt-1 text-xs text-slate-500">Biểu đồ chỉ phản ánh các đầu điểm đã ghi nhận, chưa phải điểm tổng kết</p></div>
      {report.courses.length ? <div className="space-y-4">
        {report.courses.map((course) => (
          <div key={course.courseId} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-bold text-blue-600">{course.courseCode}</p><h3 className="truncate text-sm font-semibold text-slate-900">{course.title}</h3><p className="mt-1 text-xs text-slate-500">{course.gradedItems} cột điểm</p></div><span className="shrink-0 text-xl font-bold tabular-nums text-slate-900">{course.averageOutOfTen === null ? '—' : course.averageOutOfTen.toFixed(2)}<span className="text-xs font-normal text-slate-400"> / 10</span></span></div>
            <RatioBar label="Trung bình các cột điểm" value={course.averageOutOfTen ?? 0} max={course.averageOutOfTen === null ? 0 : 10} />
            <Link to={`/grades?course=${encodeURIComponent(course.courseId)}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">Xem bảng điểm <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        ))}
      </div> : <p className="text-sm text-slate-500">Chưa có học phần hoạt động.</p>}
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5"><h2 className="text-lg font-bold text-slate-900">Kết quả vừa được chấm</h2><p className="mt-1 text-xs text-slate-500">20 bản ghi gần nhất, chỉ tài khoản của bạn</p></div>
      {report.recentGrades.length ? <div className="divide-y divide-slate-100">
        {report.recentGrades.map((entry) => (
          <div key={entry.gradeId} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-bold text-blue-700">{entry.courseCode} · {entry.itemType}</p><p className="mt-1 text-xs text-slate-500">{localDate(entry.gradedAt)}</p></div><p className="text-sm font-bold tabular-nums text-slate-900">{entry.score}/{entry.maxScore}<span className="ml-2 text-xs font-normal text-slate-500">({entry.normalizedOutOfTen}/10)</span></p></div>
        ))}
      </div> : <p className="p-8 text-sm text-slate-500">Chưa có kết quả được ghi nhận.</p>}
    </section>
  </div>;
}

function OperationsPanel({ report }: { report: OperationsInsights }) {
  const courseRows = [
    { label: 'Đang mở', count: report.courseStatuses.ACTIVE ?? 0 },
    { label: 'Bản nháp', count: report.courseStatuses.DRAFT ?? 0 },
    { label: 'Lưu trữ', count: report.courseStatuses.ARCHIVED ?? 0 },
  ];
  const totalCourses = Object.values(report.courseStatuses).reduce((sum, count) => sum + count, 0);
  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Tài khoản hoạt động" value={report.activeUsers} hint={`Trong ${report.totalUsers} tài khoản`} />
      <MetricCard label="Lượt đăng ký môn" value={report.activeEnrollments} hint="Đăng ký còn hiệu lực vào học phần đang mở" />
      <MetricCard label="Bài chờ chấm" value={report.pendingSubmissions} hint="Các lớp đang hoạt động" />
      <MetricCard label="Nội dung đã công bố" value={report.publishedLessons + report.publishedQuizzes} hint={`${report.publishedLessons} bài học · ${report.publishedQuizzes} quiz`} />
    </div>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-slate-900">Tài khoản và vai trò</h2></div>
        <div className="space-y-4">
          {[['Sinh viên', report.roles.STUDENT ?? 0], ['Giảng viên', report.roles.LECTURER ?? 0], ['Quản trị viên', report.roles.ADMIN ?? 0]].map(([label, amount]) =>
            <div key={label}><RatioBar label={String(label)} value={Number(amount)} max={report.totalUsers} /><span className="text-xs font-semibold text-slate-600">{amount} tài khoản</span></div>
          )}
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{report.inactiveUsers} tài khoản đang vô hiệu hóa (không cộng vào số hoạt động).</p>
        </div>
        <Link to="/users" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline">Mở quản lý người dùng <ArrowRight className="h-3.5 w-3.5" /></Link>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-600" /><h2 className="font-bold text-slate-900">Vòng đời học phần</h2></div>
        <div className="space-y-4">{courseRows.map((row) => <div key={row.label}><RatioBar label={row.label} value={row.count} max={totalCourses} /><span className="text-xs font-semibold text-slate-600">{row.count} học phần</span></div>)}</div>
        <Link to="/courses" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline">Mở quản lý học phần <ArrowRight className="h-3.5 w-3.5" /></Link>
      </section>
    </div>
    <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600"><ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />Các chỉ số là snapshot từ cơ sở dữ liệu tại thời điểm tải. Không phải công cụ giám sát uptime, chất lượng học tập hoặc năng lực hệ thống.</p>
  </div>;
}

export function InsightsPage() {
  const { user } = useAuth();
  const [teaching, setTeaching] = useState<TeachingInsights | null>(null);
  const [learning, setLearning] = useState<LearningInsights | null>(null);
  const [operations, setOperations] = useState<OperationsInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    let live = true;
    const request = user.role === 'LECTURER'
      ? api.getTeachingInsights().then((data) => { if (live) setTeaching(data); })
      : user.role === 'STUDENT'
        ? api.getLearningInsights().then((data) => { if (live) setLearning(data); })
        : api.getOperationsInsights().then((data) => { if (live) setOperations(data); });
    request.then(() => { if (live) setError(null); }).catch((err: unknown) => {
      if (live) setError(err instanceof Error ? err.message : 'Không tải được phân tích.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user?.id, user?.role, refresh]);

  const reload = () => { setLoading(true); setRefresh((v) => v + 1); };
  const title = user?.role === 'LECTURER' ? 'Trung tâm giảng dạy' : user?.role === 'STUDENT' ? 'Phân tích kết quả học tập' : 'Phân tích vận hành';
  const subtitle = user?.role === 'LECTURER' ? 'Theo dõi các lớp phụ trách và xử lý bài nộp ngay tại một nơi.' : user?.role === 'STUDENT' ? 'Nhìn rõ các cột điểm đã nhận theo từng môn, không suy đoán kết quả cuối kỳ.' : 'Theo dõi số liệu vận hành và vòng đời học phần từ các bản ghi hiện có.';

  return <div className="space-y-6">
    <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-8 text-white sm:px-9">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-300"><Activity className="h-4 w-4" /> Insight Workspace</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">{subtitle}</p></div>
        <button onClick={reload} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Làm mới</button>
      </div>
    </section>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error} <button onClick={reload} className="ml-2 font-semibold underline">Thử lại</button></div>}
    {loading ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-14 text-center text-sm text-slate-500">Đang tổng hợp từ dữ liệu thực...</div> : !error && <>
      {user?.role === 'LECTURER' && teaching && <TeachingPanel report={teaching} reload={reload} />}
      {user?.role === 'STUDENT' && learning && <LearningPanel report={learning} />}
      {user?.role === 'ADMIN' && operations && <OperationsPanel report={operations} />}
    </>}
    <p className="text-xs text-slate-500">Truy cập được giới hạn bằng quyền tài khoản ở cả giao diện và API. Không sử dụng số liệu mock, biểu đồ mẫu hoặc kết quả học lực suy đoán.</p>
  </div>;
}
