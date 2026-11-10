import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  CheckSquare,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { CardSkeleton } from '../components/common/Skeleton';
import type { Course, Assignment, Quiz } from '../types';

interface CalendarEvent {
  id: string;
  type: 'ASSIGNMENT' | 'QUIZ';
  title: string;
  courseCode: string;
  courseTitle: string;
  date: Date;
  timeStr: string;
  status?: string;
  maxScore?: number;
  durationMinutes?: number;
  originalItem: Assignment | Quiz;
}

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

export const CalendarPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'ASSIGNMENT' | 'QUIZ'>('ALL');
  const [loading, setLoading] = useState(true);

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        const courseList = await api.getCourses();
        setCourses(courseList);

        const loadedEvents: CalendarEvent[] = [];

        await Promise.all(
          courseList.map(async (c) => {
            try {
              const [assigns, quizzes] = await Promise.all([
                api.getCourseAssignments(c.id).catch(() => []),
                api.getCourseQuizzes(c.id).catch(() => []),
              ]);

              // Process Assignments
              assigns.forEach((a) => {
                const dueStr = a.dueAt || a.due_date;
                if (!dueStr) return;
                const d = new Date(dueStr);
                loadedEvents.push({
                  id: `assign-${a.id}`,
                  type: 'ASSIGNMENT',
                  title: a.title,
                  courseCode: c.code,
                  courseTitle: c.title,
                  date: d,
                  timeStr: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                  status: a.status,
                  maxScore: Number(a.maxScore ?? a.max_score ?? 10),
                  originalItem: a,
                });
              });

              // Process Quizzes
              quizzes.forEach((q) => {
                const endStr = q.endAt || q.created_at;
                if (!endStr) return;
                const d = new Date(endStr);
                loadedEvents.push({
                  id: `quiz-${q.id}`,
                  type: 'QUIZ',
                  title: q.title,
                  courseCode: c.code,
                  courseTitle: c.title,
                  date: d,
                  timeStr: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                  status: q.isPublished ?? q.is_published ? 'PUBLISHED' : 'DRAFT',
                  durationMinutes: q.duration_minutes || q.timeLimitMinutes,
                  originalItem: q,
                });
              });
            } catch {
              // Ignore single course failure
            }
          })
        );

        setEvents(loadedEvents);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [user]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const firstDayOfWeek = useMemo(() => {
    // 0 = Sunday, 1 = Monday ... 6 = Saturday
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Convert to Monday = 0
  }, [year, month]);

  const prevMonthDays = useMemo(() => {
    const daysInPrev = new Date(year, month, 0).getDate();
    return Array.from({ length: firstDayOfWeek }, (_, i) => daysInPrev - firstDayOfWeek + i + 1);
  }, [year, month, firstDayOfWeek]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (selectedCourseId !== 'ALL') {
        const c = courses.find((item) => String(item.id) === selectedCourseId);
        if (c && ev.courseCode !== c.code) return false;
      }
      if (filterType !== 'ALL' && ev.type !== filterType) return false;
      return true;
    });
  }, [events, selectedCourseId, filterType, courses]);

  // Group events by day of current month
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    filteredEvents.forEach((ev) => {
      if (ev.date.getFullYear() === year && ev.date.getMonth() === month) {
        const day = ev.date.getDate();
        map[day] = map[day] || [];
        map[day].push(ev);
      }
    });
    return map;
  }, [filteredEvents, year, month]);

  // Upcoming deadlines in the next 14 days
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const future = new Date(now.getTime() + 14 * 86400000);
    return filteredEvents
      .filter((ev) => ev.date >= new Date(now.getTime() - 86400000) && ev.date <= future)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredEvents]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Lịch & Hạn chót học vụ</h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'STUDENT'
              ? 'Theo dõi toàn diện lịch nộp bài tập, thời gian mở đề thi và các mốc thời gian học tập'
              : 'Giám sát tiến độ nộp bài, lịch mở đề kiểm tra và thời hạn các môn học'}
          </p>
        </div>

        {/* Course Filter Dropdown & Type Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">Tất cả khóa học ({courses.length})</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.title}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded-lg transition ${
                filterType === 'ALL' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilterType('ASSIGNMENT')}
              className={`px-2.5 py-1 rounded-lg transition ${
                filterType === 'ASSIGNMENT' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Bài tập
            </button>
            <button
              onClick={() => setFilterType('QUIZ')}
              className={`px-2.5 py-1 rounded-lg transition ${
                filterType === 'QUIZ' ? 'bg-white text-purple-600 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Bài thi
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <div>
            <CardSkeleton />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Calendar View (2 Columns) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
            <div>
              {/* Calendar Controls */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">
                    {MONTH_NAMES[month]} năm {year}
                  </h2>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={handleToday}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Hôm nay
                  </button>
                  <button
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                    title="Tháng trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                    title="Tháng sau"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Weekday Labels */}
              <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-slate-400 mb-2">
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className="py-1">
                    {wd}
                  </div>
                ))}
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {/* Previous month padding days */}
                {prevMonthDays.map((d, idx) => (
                  <div
                    key={`prev-${idx}`}
                    className="min-h-[88px] p-1.5 rounded-xl bg-slate-50/50 border border-transparent text-slate-300 text-xs font-mono"
                  >
                    <span>{d}</span>
                  </div>
                ))}

                {/* Current month days */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dayEvents = eventsByDay[day] || [];
                  const isToday = isCurrentMonth && today.getDate() === day;

                  return (
                    <div
                      key={`day-${day}`}
                      className={`min-h-[88px] p-1.5 rounded-xl border transition flex flex-col justify-between ${
                        isToday
                          ? 'border-blue-500 bg-blue-50/20 shadow-2xs'
                          : 'border-slate-100 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-mono font-semibold ${
                            isToday
                              ? 'w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]'
                              : 'text-slate-700'
                          }`}
                        >
                          {day}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] text-slate-400 font-bold font-mono">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Day events pills */}
                      <div className="space-y-1 mt-1 flex-1 overflow-hidden">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div
                            key={ev.id}
                            onClick={() => {
                              if (ev.type === 'ASSIGNMENT') navigate('/assignments');
                              else navigate('/quizzes');
                            }}
                            className={`p-1 rounded-md text-[10px] font-semibold truncate cursor-pointer transition ${
                              ev.type === 'ASSIGNMENT'
                                ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/50'
                                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/50'
                            }`}
                            title={`${ev.courseCode} - ${ev.title} (${ev.timeStr})`}
                          >
                            <span className="font-mono mr-1">[{ev.courseCode}]</span>
                            <span>{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-[10px] text-slate-400 font-medium pl-1">
                            +{dayEvents.length - 2} sự kiện khác
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend Footer */}
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <span>Hạn nộp bài tập</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                  <span>Bài kiểm tra / Thi</span>
                </span>
              </div>
              <span className="text-slate-400 text-[11px]">Bấm vào sự kiện để mở trang làm bài</span>
            </div>
          </div>

          {/* Right Sidebar: Upcoming Deadlines & Urgencies */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <h3 className="font-bold text-slate-800 text-sm">Hạn chót 14 ngày tới</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-xs">
                  {upcomingEvents.length}
                </span>
              </div>

              {upcomingEvents.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600">Không có hạn chót gấp</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tất cả bài tập & bài thi đang trong tiến độ an toàn.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {upcomingEvents.map((ev) => {
                    const diffMs = ev.date.getTime() - Date.now();
                    const diffHours = Math.ceil(diffMs / (1000 * 3600));
                    const isUrgent = diffHours <= 24 && diffHours >= 0;
                    const isPast = diffHours < 0;

                    return (
                      <div
                        key={ev.id}
                        className="py-3 hover:bg-slate-50/70 transition cursor-pointer rounded-xl px-2"
                        onClick={() => {
                          if (ev.type === 'ASSIGNMENT') navigate('/assignments');
                          else navigate('/quizzes');
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-slate-100 text-slate-700">
                            {ev.courseCode}
                          </span>
                          {isPast ? (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
                              Đã quá hạn
                            </span>
                          ) : isUrgent ? (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md animate-pulse">
                              Còn {diffHours}h
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-500">
                              Còn {Math.ceil(diffHours / 24)} ngày
                            </span>
                          )}
                        </div>

                        <div className="flex items-start space-x-2">
                          {ev.type === 'ASSIGNMENT' ? (
                            <FileText className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                          ) : (
                            <CheckSquare className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                          )}
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{ev.title}</h4>
                            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <span>Hạn: {ev.date.toLocaleDateString('vi-VN')}</span>
                              <span>•</span>
                              <span>{ev.timeStr}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Links Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-md">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Quy định hạn chót</h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Hệ thống tự động khóa đề kiểm tra và tính điểm muộn đối với các bài tập nộp sau thời gian quy định. Vui lòng nộp trước hạn chót ít nhất 15 phút.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
                <button
                  onClick={() => navigate('/assignments')}
                  className="text-blue-400 hover:text-blue-300 font-semibold"
                >
                  Xem bài tập →
                </button>
                <button
                  onClick={() => navigate('/quizzes')}
                  className="text-purple-400 hover:text-purple-300 font-semibold"
                >
                  Xem bài thi →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
