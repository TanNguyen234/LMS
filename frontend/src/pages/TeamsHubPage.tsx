import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Video,
  Edit3,
  Search,
  Play,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ChannelChat } from '../components/teams/ChannelChat';
import { MeetingRoom } from '../components/teams/MeetingRoom';
import { WhiteboardCanvas } from '../components/teams/WhiteboardCanvas';
import type { Course, Meeting } from '../types';

export const TeamsHubPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<'general' | 'meeting' | 'whiteboard' | 'logs'>('general');
  const [activeMeetings, setActiveMeetings] = useState<Meeting[]>([]);
  const [courseMeetings, setCourseMeetings] = useState<Meeting[]>([]);
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');

  // Meeting creation form state
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const isLecturerOrAdmin = user?.role === 'ADMIN' || user?.role === 'LECTURER';

  const fetchData = async () => {
    try {
      const [coursesData, activeData] = await Promise.all([
        api.getCourses(),
        api.getActiveMeetings()
      ]);
      setCourses(coursesData);
      setActiveMeetings(activeData);

      // Resolve URL params if provided
      const paramCourseId = searchParams.get('courseId');
      const paramMeetingId = searchParams.get('meetingId');

      let targetCourse = coursesData[0] || null;
      if (paramCourseId) {
        const found = coursesData.find((c) => c.courseId === paramCourseId);
        if (found) targetCourse = found;
      }
      setSelectedCourse(targetCourse);

      if (targetCourse) {
        const meetings = await api.getCourseMeetings(targetCourse.courseId);
        setCourseMeetings(meetings);

        if (paramMeetingId) {
          const m = meetings.find((item) => item.meetingId === paramMeetingId);
          if (m) {
            setCurrentMeeting(m);
            setSelectedChannel('meeting');
          }
        } else {
          // If there is an active meeting in this course, select it
          const live = meetings.find((item) => item.status === 'LIVE');
          if (live) {
            setCurrentMeeting(live);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load Teams Hub data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectCourse = async (course: Course) => {
    setSelectedCourse(course);
    try {
      const meetings = await api.getCourseMeetings(course.courseId);
      setCourseMeetings(meetings);
      const live = meetings.find((m) => m.status === 'LIVE');
      setCurrentMeeting(live || null);
    } catch (err) {
      console.error('Failed to load meetings for course:', err);
    }
  };

  const handleStartMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !newMeetingTitle.trim() || creatingMeeting) return;

    setCreatingMeeting(true);
    try {
      const meeting = await api.createMeeting({
        courseId: selectedCourse.courseId,
        title: newMeetingTitle.trim()
      });
      setCurrentMeeting(meeting);
      setSelectedChannel('meeting');
      setNewMeetingTitle('');
      // Refresh list
      const updated = await api.getCourseMeetings(selectedCourse.courseId);
      setCourseMeetings(updated);
      const actives = await api.getActiveMeetings();
      setActiveMeetings(actives);
    } catch (err) {
      console.error('Failed to start meeting:', err);
      alert('Không thể tạo phòng học trực tuyến. Vui lòng thử lại.');
    } finally {
      setCreatingMeeting(false);
    }
  };

  const filteredCourses = courses.filter((c) =>
    c.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
    c.courseCode.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-100">
      {/* ======================================================== */}
      {/* COLUMN 1: MS Teams Leftmost App Bar (Tím thương hiệu) */}
      {/* ======================================================== */}
      <div className="w-16 bg-[#33373B] sm:bg-[#464EB8] flex flex-col items-center py-4 justify-between select-none z-10 shadow-md">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* MS Teams Logo Icon */}
          <div className="w-10 h-10 rounded-xl bg-white text-[#464EB8] flex items-center justify-center font-black text-xl shadow-inner">
            T
          </div>

          {/* Navigation icons */}
          <div className="flex flex-col items-center gap-3 w-full">
            <button
              onClick={() => setSelectedChannel('general')}
              className={`w-full py-2 flex flex-col items-center text-xs gap-1 transition-colors ${
                selectedChannel === 'general' ? 'text-white border-l-4 border-white font-bold bg-white/10' : 'text-indigo-200 hover:text-white'
              }`}
              title="Kênh thảo luận (Teams Chat)"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-[10px]">Chat</span>
            </button>

            <button
              onClick={() => setSelectedChannel('meeting')}
              className={`w-full py-2 flex flex-col items-center text-xs gap-1 transition-colors relative ${
                selectedChannel === 'meeting' ? 'text-white border-l-4 border-white font-bold bg-white/10' : 'text-indigo-200 hover:text-white'
              }`}
              title="Phòng học trực tuyến"
            >
              <Video className="w-5 h-5" />
              <span className="text-[10px]">Lớp học</span>
              {activeMeetings.length > 0 && (
                <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setSelectedChannel('whiteboard')}
              className={`w-full py-2 flex flex-col items-center text-xs gap-1 transition-colors ${
                selectedChannel === 'whiteboard' ? 'text-white border-l-4 border-white font-bold bg-white/10' : 'text-indigo-200 hover:text-white'
              }`}
              title="Bảng trắng trực tuyến"
            >
              <Edit3 className="w-5 h-5" />
              <span className="text-[10px]">Vẽ</span>
            </button>

            {isLecturerOrAdmin && (
              <button
                onClick={() => setSelectedChannel('logs')}
                className={`w-full py-2 flex flex-col items-center text-xs gap-1 transition-colors ${
                  selectedChannel === 'logs' ? 'text-white border-l-4 border-white font-bold bg-white/10' : 'text-indigo-200 hover:text-white'
                }`}
                title="Báo cáo tham gia & chống gian lận"
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="text-[10px]">Báo cáo</span>
              </button>
            )}
          </div>
        </div>

        {/* User Mini Profile */}
        <div className="w-10 h-10 rounded-full bg-indigo-800 text-white flex items-center justify-center font-bold text-sm shadow">
          {user?.fullName?.charAt(0).toUpperCase() || 'U'}
        </div>
      </div>

      {/* ======================================================== */}
      {/* COLUMN 2: Teams & Channels Sidebar (Mô phỏng MS Teams) */}
      {/* ======================================================== */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col overflow-hidden flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Lớp học (Teams)</span>
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
            {courses.length}
          </span>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm kiếm môn học..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Course List & Channels */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {loading ? (
            <div className="text-center py-8 text-xs text-slate-400">Đang tải danh sách lớp...</div>
          ) : filteredCourses.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">Không tìm thấy khóa học</div>
          ) : (
            filteredCourses.map((course) => {
              const isSelected = selectedCourse?.courseId === course.courseId;
              const hasActiveMeeting = activeMeetings.some((m) => m.courseId === course.courseId);

              return (
                <div key={course.courseId} className="rounded-xl overflow-hidden border border-slate-100">
                  {/* Course Header Item */}
                  <button
                    onClick={() => handleSelectCourse(course)}
                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between transition-colors ${
                      isSelected ? 'bg-indigo-50 text-indigo-950 font-semibold' : 'bg-slate-50/70 hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {course.courseCode.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{course.title}</p>
                        <p className="text-[10px] text-slate-500 truncate">{course.courseCode}</p>
                      </div>
                    </div>
                    {hasActiveMeeting && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                      </span>
                    )}
                  </button>

                  {/* Channel sub-items (visible when selected) */}
                  {isSelected && (
                    <div className="bg-white py-1 px-2 space-y-0.5 text-xs">
                      <button
                        onClick={() => setSelectedChannel('general')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center gap-2 transition-colors ${
                          selectedChannel === 'general' ? 'bg-indigo-100 text-indigo-800 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-bold text-slate-400">#</span>
                        <span>Kênh thảo luận (General)</span>
                      </button>

                      <button
                        onClick={() => setSelectedChannel('meeting')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors ${
                          selectedChannel === 'meeting' ? 'bg-indigo-100 text-indigo-800 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Video className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Lớp học trực tuyến</span>
                        </div>
                        {hasActiveMeeting && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                      </button>

                      <button
                        onClick={() => setSelectedChannel('whiteboard')}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center gap-2 transition-colors ${
                          selectedChannel === 'whiteboard' ? 'bg-indigo-100 text-indigo-800 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Bảng trắng (Whiteboard)</span>
                      </button>

                      {isLecturerOrAdmin && (
                        <button
                          onClick={() => setSelectedChannel('logs')}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center gap-2 transition-colors ${
                            selectedChannel === 'logs' ? 'bg-indigo-100 text-indigo-800 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Nhật ký & Chống gian lận</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* COLUMN 3: Main Workspace Stage */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden p-3 sm:p-5">
        {selectedCourse ? (
          <div className="flex-1 flex flex-col h-full">
            {/* General Chat Channel */}
            {selectedChannel === 'general' && (
              <ChannelChat courseId={selectedCourse.courseId} courseTitle={selectedCourse.title} />
            )}

            {/* Live Meeting Room */}
            {selectedChannel === 'meeting' && (
              currentMeeting && currentMeeting.status === 'LIVE' ? (
                <MeetingRoom
                  meeting={currentMeeting}
                  currentUser={user}
                  onMeetingEnded={() => {
                    fetchData();
                    setCurrentMeeting(null);
                  }}
                  onLeave={() => {
                    fetchData();
                  }}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                    <Video className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg mb-2">Lớp học trực tuyến: {selectedCourse.title}</h3>
                  <p className="text-slate-500 text-sm max-w-md mb-6">
                    Hỗ trợ gọi video Full HD, micro, chia sẻ màn hình, giơ tay phát biểu và kiểm soát điểm danh chống gian lận.
                  </p>

                  {isLecturerOrAdmin ? (
                    <form onSubmit={handleStartMeeting} className="w-full max-w-md space-y-3">
                      <input
                        type="text"
                        value={newMeetingTitle}
                        onChange={(e) => setNewMeetingTitle(e.target.value)}
                        placeholder="Nhập tiêu đề buổi học (ví dụ: Bài giảng Tuần 5 - Trực tuyến)..."
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                      <button
                        type="submit"
                        disabled={creatingMeeting || !newMeetingTitle.trim()}
                        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>{creatingMeeting ? 'Đang khởi tạo...' : 'Bắt đầu lớp học ngay bây giờ'}</span>
                      </button>
                    </form>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-600 text-sm max-w-md">
                      <Clock className="w-5 h-5 text-indigo-500 mx-auto mb-2" />
                      <p>Hiện chưa có buổi học nào đang diễn ra cho môn này.</p>
                      <p className="text-xs text-slate-400 mt-1">Khi Giảng viên bắt đầu lớp học, hệ thống sẽ tự động gửi thông báo và bạn có thể vào phòng tại đây.</p>
                    </div>
                  )}

                  {/* Past Meetings List */}
                  {courseMeetings.length > 0 && (
                    <div className="mt-8 w-full max-w-2xl text-left border-t border-slate-100 pt-6">
                      <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-3">Lịch sử các buổi học trước</h4>
                      <div className="space-y-2">
                        {courseMeetings.slice(0, 5).map((m) => (
                          <div key={m.meetingId} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                            <div>
                              <p className="font-semibold text-slate-900">{m.title}</p>
                              <p className="text-slate-400 text-[11px]">{new Date(m.startedAt).toLocaleString()}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.status === 'LIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {m.status === 'LIVE' ? 'Đang diễn ra' : 'Đã kết thúc'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Whiteboard Workspace */}
            {selectedChannel === 'whiteboard' && (
              <WhiteboardCanvas courseTitle={selectedCourse.title} />
            )}

            {/* Audit Logs Workspace */}
            {selectedChannel === 'logs' && isLecturerOrAdmin && (
              <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">Báo cáo & Nhật ký điểm danh chống gian lận</h3>
                    <p className="text-xs text-slate-500">Môn học: {selectedCourse.title} ({selectedCourse.courseCode})</p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Hệ thống bảo vệ tự động
                  </span>
                </div>

                {courseMeetings.length === 0 ? (
                  <p className="text-center py-12 text-slate-400 text-sm">Chưa có buổi học nào được tạo trong môn này.</p>
                ) : (
                  <div className="space-y-6">
                    {courseMeetings.map((m) => (
                      <div key={m.meetingId} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{m.title}</h4>
                            <p className="text-xs text-slate-400">Bắt đầu: {new Date(m.startedAt).toLocaleString()}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            m.status === 'LIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {m.status === 'LIVE' ? 'Đang diễn ra' : 'Đã kết thúc'}
                          </span>
                        </div>

                        {m.activeLogs && m.activeLogs.length > 0 ? (
                          <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                <tr>
                                  <th className="px-3 py-2">Họ và tên</th>
                                  <th className="px-3 py-2">MSSV</th>
                                  <th className="px-3 py-2">Thời gian vào</th>
                                  <th className="px-3 py-2">Thời gian ra</th>
                                  <th className="px-3 py-2">Thời lượng</th>
                                  <th className="px-3 py-2">Hoạt động</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {m.activeLogs.map((log) => (
                                  <tr key={log.logId} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-medium text-slate-800">{log.userName}</td>
                                    <td className="px-3 py-2 font-mono text-slate-500">{log.studentCode || '-'}</td>
                                    <td className="px-3 py-2 text-slate-600">
                                      {new Date(log.joinedAt).toLocaleTimeString()}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600">
                                      {log.leftAt ? new Date(log.leftAt).toLocaleTimeString() : <span className="text-emerald-600 font-bold">Online</span>}
                                    </td>
                                    <td className="px-3 py-2 font-semibold text-slate-700">
                                      {Math.floor(log.durationSeconds / 60)}p {log.durationSeconds % 60}s
                                    </td>
                                    <td className="px-3 py-2 text-slate-500">{log.activitySummary || 'Có mặt'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Chưa có sinh viên tham gia buổi học này.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Vui lòng chọn một lớp học từ danh sách bên trái
          </div>
        )}
      </div>
    </div>
  );
};
