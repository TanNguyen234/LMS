import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { learningApi } from '../../api/learning';
import type { AcademicSemester, Course, SlotConflictDetail } from '../../types';
import { formatDateTimeVi } from '../../utils/formatters';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

export interface QuickScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  semesters: AcademicSemester[];
  defaultCourseId?: string;
  onCreated: () => Promise<void>;
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Thứ 2' },
  { value: 1, label: 'Thứ 3' },
  { value: 2, label: 'Thứ 4' },
  { value: 3, label: 'Thứ 5' },
  { value: 4, label: 'Thứ 6' },
  { value: 5, label: 'Thứ 7' },
  { value: 6, label: 'CN' },
];

const SHIFT_PRESETS = [
  { label: 'Ca 1 (07:30-09:30)', start: '07:30', end: '09:30' },
  { label: 'Ca 2 (09:45-11:45)', start: '09:45', end: '11:45' },
  { label: 'Ca 3 (13:00-15:00)', start: '13:00', end: '15:00' },
  { label: 'Ca 4 (15:15-17:15)', start: '15:15', end: '17:15' },
  { label: 'Ca 5 (18:00-20:00)', start: '18:00', end: '20:00' },
];

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const QuickScheduleModal: React.FC<QuickScheduleModalProps> = ({
  isOpen,
  onClose,
  courses,
  semesters,
  defaultCourseId,
  onCreated,
}) => {
  const toast = useToast();

  const activeCourses = useMemo(
    () => courses.filter((c) => c.status !== 'ARCHIVED'),
    [courses],
  );

  const initialCourseId =
    (defaultCourseId && activeCourses.some((c) => c.courseId === defaultCourseId)
      ? defaultCourseId
      : activeCourses[0]?.courseId) ?? '';

  const [courseId, setCourseId] = useState(initialCourseId);
  const [titlePrefix, setTitlePrefix] = useState('Buổi học');
  const [weekdays, setWeekdays] = useState<number[]>([0]);
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('09:30');
  const [startDate, setStartDate] = useState(() => toYmd(new Date()));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return toYmd(d);
  });
  const [sessionType, setSessionType] = useState<'REGULAR' | 'MAKEUP' | 'EXAM' | 'ONLINE'>('REGULAR');
  const [deliveryMode, setDeliveryMode] = useState<'IN_PERSON' | 'ONLINE'>('IN_PERSON');
  const [room, setRoom] = useState('B203');
  const [skipConflicts, setSkipConflicts] = useState(false);

  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkedClean, setCheckedClean] = useState(false);
  const [conflicts, setConflicts] = useState<SlotConflictDetail[]>([]);

  const effectiveCourseId = courseId || initialCourseId;
  const selectedCourse = activeCourses.find((c) => c.courseId === effectiveCourseId) ?? null;

  const handleCourseChange = (nextId: string) => {
    setCourseId(nextId);
    setCheckedClean(false);
    setConflicts([]);
    const c = activeCourses.find((item) => item.courseId === nextId);
    if (c?.semesterId) {
      const sem = semesters.find((s) => s.semesterId === c.semesterId);
      if (sem) {
        const todayStr = toYmd(new Date());
        const semStart = sem.startDate.slice(0, 10);
        const semEnd = sem.endDate.slice(0, 10);
        setStartDate(semStart > todayStr ? semStart : todayStr);
        setEndDate(semEnd);
      }
    }
  };

  const toggleWeekday = (wd: number) => {
    setCheckedClean(false);
    setConflicts([]);
    setWeekdays((prev) =>
      prev.includes(wd) ? (prev.length > 1 ? prev.filter((x) => x !== wd) : prev) : [...prev, wd],
    );
  };

  const buildLocalSlots = (): Array<{
    startAt: string;
    endAt: string;
    deliveryMode: 'IN_PERSON' | 'ONLINE';
    room?: string | null;
  }> => {
    if (!startDate || !endDate || !startTime || !endTime || weekdays.length === 0) return [];
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const [sh, smin] = startTime.split(':').map(Number);
    const [eh, emin] = endTime.split(':').map(Number);

    const cur = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    if (end < cur) return [];

    // JS getDay(): 0=Sun..6=Sat -> backend weekday: 0=Mon..6=Sun
    const wdSet = new Set(weekdays);
    const slots: Array<{
      startAt: string;
      endAt: string;
      deliveryMode: 'IN_PERSON' | 'ONLINE';
      room?: string | null;
    }> = [];

    let guard = 0;
    while (cur <= end && guard < 366) {
      guard += 1;
      const pyWeekday = (cur.getDay() + 6) % 7;
      if (wdSet.has(pyWeekday)) {
        const sLocal = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), sh, smin, 0);
        const eLocal = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), eh, emin, 0);
        if (eLocal > sLocal) {
          slots.push({
            startAt: sLocal.toISOString(),
            endAt: eLocal.toISOString(),
            deliveryMode,
            room: deliveryMode === 'ONLINE' ? 'Trực tuyến' : room.trim() || null,
          });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
    return slots;
  };

  const handleCheckConflicts = async () => {
    if (!effectiveCourseId) {
      toast.warning('Vui lòng chọn lớp học phần.');
      return;
    }
    const slots = buildLocalSlots();
    if (slots.length === 0) {
      toast.warning('Không có buổi hợp lệ trong khoảng ngày/giờ đã chọn.');
      return;
    }
    try {
      setChecking(true);
      setCheckedClean(false);
      const res = await learningApi.checkScheduleConflicts({
        courseId: effectiveCourseId,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        slots,
      });
      setConflicts(res.conflicts);
      setCheckedClean(!res.hasConflicts);
      if (!res.hasConflicts) {
        toast.success(`Đã kiểm tra ${slots.length} buổi: không trùng lịch GV, SV hay Phòng học.`);
      } else {
        toast.warning(`Phát hiện ${res.conflicts.length} buổi bị trùng lịch.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể kiểm tra trùng lịch.');
    } finally {
      setChecking(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCourseId) return;

    try {
      setSubmitting(true);
      const res = await learningApi.quickGenerateSchedules({
        courseId: effectiveCourseId,
        titlePrefix: titlePrefix.trim() || 'Buổi học',
        weekdays,
        startTime,
        endTime,
        startDate,
        endDate,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        sessionType,
        deliveryMode,
        room: deliveryMode === 'ONLINE' ? 'Trực tuyến' : room.trim() || null,
        skipConflicts,
      });
      setConflicts(res.conflicts);
      if (res.createdCount > 0) {
        toast.success(
          `Đã tạo ${res.createdCount} buổi học${res.skippedCount > 0 ? ` (bỏ qua ${res.skippedCount} buổi trùng)` : ''}.`,
        );
        await onCreated();
        onClose();
      } else {
        toast.warning('Tất cả các buổi đều bị trùng lịch nên chưa tạo buổi nào.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xếp lịch (kiểm tra trùng lịch).');
      void handleCheckConflicts();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Xếp lịch nhanh & Kiểm tra trùng thông minh"
      subtitle="Tự động kiểm tra trùng giờ Giảng viên, Sinh viên đang ghi danh và Phòng học giữa tất cả các lớp."
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={checking || !effectiveCourseId}
            onClick={() => void handleCheckConflicts()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 disabled:opacity-50 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>{checking ? 'Đang kiểm tra...' : 'Kiểm tra trùng lịch (GV · SV · Phòng)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="quick-schedule-form"
              disabled={submitting || !effectiveCourseId}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Đang tạo lịch...' : 'Tạo lịch'}</span>
            </button>
          </div>
        </div>
      }
    >
      <form id="quick-schedule-form" onSubmit={(e) => void handleGenerate(e)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1">
              Lớp học phần
            </label>
            <select
              value={effectiveCourseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            >
              {activeCourses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.courseCode}{c.sectionCode ? ` · ${c.sectionCode}` : ''} - {c.title}
                  {c.lecturerName ? ` (GV: ${c.lecturerName})` : ''}
                </option>
              ))}
            </select>
            {selectedCourse?.semesterName && (
              <p className="text-[11px] text-[var(--lms-text-muted)] mt-1">
                Học kỳ: {selectedCourse.semesterName} · GV: {selectedCourse.lecturerName || '—'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1">
              Tiêu đề buổi học (tiền tố)
            </label>
            <input
              type="text"
              required
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              placeholder="Ví dụ: Lý thuyết Tuần / Thực hành"
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            />
          </div>
        </div>

        {/* Weekdays multi-select */}
        <div>
          <span className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1.5">
            Chọn thứ trong tuần (có thể chọn nhiều thứ)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((opt) => {
              const active = weekdays.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleWeekday(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    active
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time presets & Date range */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[var(--lms-text-muted)] inline-flex items-center gap-1 mr-1">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              Chọn nhanh ca:
            </span>
            {SHIFT_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setStartTime(p.start);
                  setEndTime(p.end);
                  setCheckedClean(false);
                }}
                className="px-2.5 py-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 text-[11px] font-medium hover:border-blue-500 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Giờ bắt đầu
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setCheckedClean(false);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Giờ kết thúc
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setCheckedClean(false);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Từ ngày
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCheckedClean(false);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
                Đến ngày
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCheckedClean(false);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
              Loại buổi
            </label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as 'REGULAR' | 'MAKEUP' | 'EXAM' | 'ONLINE')}
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            >
              <option value="REGULAR">Lịch giảng chính thức</option>
              <option value="MAKEUP">Buổi học bù</option>
              <option value="ONLINE">Buổi trực tuyến</option>
              <option value="EXAM">Lịch thi / Kiểm tra</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
              Hình thức
            </label>
            <select
              value={deliveryMode}
              onChange={(e) => {
                const mode = e.target.value as 'IN_PERSON' | 'ONLINE';
                setDeliveryMode(mode);
                if (mode === 'ONLINE') setRoom('Trực tuyến');
                else if (room === 'Trực tuyến') setRoom('B203');
                setCheckedClean(false);
              }}
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            >
              <option value="IN_PERSON">Học trực tiếp (Phòng học)</option>
              <option value="ONLINE">Học trực tuyến (Virtual Classroom)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--lms-text-muted)] mb-1">
              Phòng học / Địa điểm
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => {
                setRoom(e.target.value);
                setCheckedClean(false);
              }}
              placeholder="B203"
              className="w-full px-3 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-[var(--lms-text)] cursor-pointer">
          <input
            type="checkbox"
            checked={skipConflicts}
            onChange={(e) => setSkipConflicts(e.target.checked)}
            className="rounded border-[var(--lms-border)]"
          />
          <span>Tự động bỏ qua các ngày bị trùng lịch (chỉ tạo các buổi trống hợp lệ)</span>
        </label>

        {checkedClean && conflicts.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Đã kiểm tra: Không phát hiện trùng lịch với Giảng viên, Sinh viên hoặc Phòng học!</span>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 space-y-2 text-xs text-rose-700 dark:text-rose-300 max-h-48 overflow-y-auto">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Phát hiện {conflicts.length} khung giờ bị trùng:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {conflicts.map((c, idx) => (
                <li key={idx}>
                  <strong>{formatDateTimeVi(c.startAt)}</strong>: {c.reasons.join(' | ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  );
};
