import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, BookOpen, CalendarDays, CheckCircle2,
  Clock3, ClipboardList, RefreshCw, Search, Timer, TriangleAlert,
} from 'lucide-react';
import { api } from '../api/client';
import type { StudentWorkloadItem } from '../types';

type WorkState = 'DONE' | 'OPEN' | 'SCHEDULED' | 'LATE' | 'MISSED' | 'CLOSED' | 'IN_PROGRESS' | 'EXHAUSTED';
type WorkFilter = 'ACTION' | 'ALL' | 'DONE' | 'PAST';

function workState(item: StudentWorkloadItem, now: number): WorkState {
  const deadline = Date.parse(item.dueAt);
  if (item.kind === 'ASSIGNMENT') {
    if (item.submittedAt) return 'DONE';
    if (item.status === 'CLOSED') return 'CLOSED';
    if (deadline < now) return item.allowLate ? 'LATE' : 'MISSED';
    return 'OPEN';
  }
  if (item.inProgress) return 'IN_PROGRESS';
  if ((item.submittedAttempts ?? 0) > 0) return 'DONE';
  if ((item.attemptsUsed ?? 0) >= (item.maxAttempts ?? 1)) return 'EXHAUSTED';
  if (deadline < now) return 'MISSED';
  if (item.startAt && Date.parse(item.startAt) > now) return 'SCHEDULED';
  return 'OPEN';
}

const labels: Record<WorkState, string> = {
  DONE: 'Đã thực hiện',
  OPEN: 'Cần thực hiện',
  SCHEDULED: 'Chưa mở',
  LATE: 'Có thể nộp muộn',
  MISSED: 'Đã hết hạn',
  CLOSED: 'Đã đóng',
  IN_PROGRESS: 'Đang làm',
  EXHAUSTED: 'Hết lượt làm',
};

const styles: Record<WorkState, string> = {
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OPEN: 'bg-blue-50 text-blue-700 border-blue-200',
  SCHEDULED: 'bg-sky-50 text-sky-700 border-sky-200',
  LATE: 'bg-amber-50 text-amber-800 border-amber-200',
  MISSED: 'bg-rose-50 text-rose-700 border-rose-200',
  CLOSED: 'bg-slate-100 text-slate-600 border-slate-200',
  IN_PROGRESS: 'bg-violet-50 text-violet-700 border-violet-200',
  EXHAUSTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Không xác định'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function StudyPlannerPage() {
  const [items, setItems] = useState<StudentWorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('ALL');
  const [filter, setFilter] = useState<WorkFilter>('ACTION');
  const now = Date.now();

  useEffect(() => {
    let live = true;
    api.getStudentWorkload()
      .then((data) => { if (live) { setItems(data.items); setError(null); } })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Không thể tải lịch học.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refreshKey]);

  const courses = useMemo(() => Array.from(
    new Map(items.map((item) => [item.courseId, { id: item.courseId, title: item.courseTitle, code: item.courseCode }])).values(),
  ).sort((a, b) => a.code.localeCompare(b.code)), [items]);

  const summary = useMemo(() => {
    const counts = { action: 0, dueSoon: 0, done: 0, past: 0 };
    for (const item of items) {
      const state = workState(item, now);
      if (state === 'OPEN' || state === 'LATE' || state === 'IN_PROGRESS') counts.action++;
      if ((state === 'OPEN' || state === 'LATE') && Date.parse(item.dueAt) <= now + 7 * 86400000) counts.dueSoon++;
      if (state === 'DONE') counts.done++;
      if (state === 'MISSED' || state === 'CLOSED' || state === 'EXHAUSTED') counts.past++;
    }
    return counts;
  }, [items, now]);

  const visible = useMemo(() => items.filter((item) => {
    const state = workState(item, now);
    const q = search.trim().toLocaleLowerCase('vi-VN');
    if (course !== 'ALL' && item.courseId !== course) return false;
    if (q && ![item.title, item.courseTitle, item.courseCode].some((value) => value.toLocaleLowerCase('vi-VN').includes(q))) return false;
    if (filter === 'ACTION') return ['OPEN', 'LATE', 'SCHEDULED', 'IN_PROGRESS'].includes(state);
    if (filter === 'DONE') return state === 'DONE';
    if (filter === 'PAST') return ['MISSED', 'CLOSED', 'EXHAUSTED'].includes(state);
    return true;
  }).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)), [items, course, filter, search, now]);

  const retry = () => { setLoading(true); setRefreshKey((value) => value + 1); };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-8 text-white sm:px-9">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
              <CalendarDays className="h-3.5 w-3.5" /> Lịch học từ dữ liệu thực
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Kế hoạch học tập</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">Theo dõi bài tập, lịch mở quiz và các mốc cần hoàn thành trong những học phần bạn đang tham gia.</p>
          </div>
          <button onClick={retry} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> {error}</span>
          <button onClick={retry} className="font-semibold underline">Thử lại</button>
        </div>
      )}
      {!error && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Cần xử lý', value: summary.action, icon: ClipboardList },
            { label: 'Đến hạn trong 7 ngày', value: summary.dueSoon, icon: Timer },
            { label: 'Đã thực hiện', value: summary.done, icon: CheckCircle2 },
            { label: 'Quá hạn / đã đóng', value: summary.past, icon: TriangleAlert },
          ].map((entry) => (
            <div key={entry.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-semibold">{entry.label}</span>
                <entry.icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{entry.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <span className="sr-only">Tìm bài tập hoặc học phần</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm bài tập, quiz, mã môn..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <label className="sr-only" htmlFor="workload-course">Lọc theo học phần</label>
          <select id="workload-course" value={course} onChange={(e) => setCourse(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="ALL">Tất cả học phần</option>
            {courses.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} — {entry.title}</option>)}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Lọc trạng thái công việc">
          {([
            ['ACTION', 'Cần quan tâm'], ['ALL', 'Tất cả'], ['DONE', 'Đã làm'], ['PAST', 'Hết hạn'],
          ] as const).map(([value, title]) => (
            <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${filter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{title}</button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500" role="status">Đang đồng bộ công việc từ hệ thống...</div>
        ) : !error && visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800">Không có công việc phù hợp</p>
            <p className="mt-1 text-sm text-slate-500">Thử đổi bộ lọc hoặc kiểm tra các học phần đã đăng ký.</p>
          </div>
        ) : visible.map((item) => {
          const state = workState(item, now);
          const href = item.kind === 'ASSIGNMENT' ? `/assignments?course=${encodeURIComponent(item.courseId)}` : `/quizzes?course=${encodeURIComponent(item.courseId)}`;
          return (
            <article key={`${item.kind}-${item.id}`} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="rounded-lg bg-slate-100 px-2 py-1">{item.courseCode}</span>
                    <span>{item.kind === 'ASSIGNMENT' ? 'Bài tập' : 'Quiz'}</span>
                    <span className={`rounded-full border px-2.5 py-1 ${styles[state]}`}>{labels[state]}</span>
                  </div>
                  <h2 className="mt-3 text-base font-bold text-slate-900">{item.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">{item.courseTitle}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {item.kind === 'ASSIGNMENT' ? 'Hạn nộp' : 'Đóng quiz'}: {dateLabel(item.dueAt)}</span>
                    {item.kind === 'QUIZ' && <span>Bắt đầu: {item.startAt ? dateLabel(item.startAt) : 'Chưa rõ'}</span>}
                    {item.kind === 'QUIZ' && <span>Lượt đã dùng: {item.attemptsUsed ?? 0}/{item.maxAttempts ?? 1}</span>}
                    {item.kind === 'ASSIGNMENT' && item.submittedAt && <span>Nộp lúc: {dateLabel(item.submittedAt)}</span>}
                  </div>
                </div>
                <Link to={href} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                  {state === 'DONE' ? 'Xem lại' : state === 'IN_PROGRESS' ? 'Tiếp tục' : 'Mở học phần'} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">Lịch được tổng hợp từ bài tập đã công bố và quiz đã xuất bản trong các môn đăng ký còn hiệu lực. Thời hạn hiển thị theo múi giờ thiết bị; trạng thái được kiểm tra lại khi mở chức năng.</p>
    </div>
  );
}
