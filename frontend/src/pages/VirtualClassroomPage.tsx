import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Video,
  Edit3,
  MessageSquare,
  ShieldCheck,
  Search,
  Play,
  ArrowLeft,
  Maximize2,
  Minimize2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Radio
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ChannelChat } from '../components/teams/ChannelChat';
import { MeetingRoom } from '../components/teams/MeetingRoom';
import { WhiteboardCanvas } from '../components/teams/WhiteboardCanvas';
import type { Course, Meeting } from '../types';

export const VirtualClassroomPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Core Data
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activeMeetings, setActiveMeetings] = useState<Meeting[]>([]);
  const [courseMeetings, setCourseMeetings] = useState<Meeting[]>([]);
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);

  // Tab & View Controls
  const [activeTab, setActiveTab] = useState<'video' | 'whiteboard' | 'chat' | 'logs'>('video');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // Meeting Form
  const [meetingTitle, setMeetingTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isLecturerOrAdmin = user?.role === 'ADMIN' || user?.role === 'LECTURER';

  const fetchData = async () => {
    try {
      setLoading(true);
      const [coursesData, activeData] = await Promise.all([
        api.getCourses(),
        api.getActiveMeetings()
      ]);
      setCourses(coursesData);
      setActiveMeetings(activeData);

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
            setActiveTab('video');
          }
        } else {
          const live = meetings.find((item) => item.status === 'LIVE');
          if (live) setCurrentMeeting(live);
        }
      }
    } catch (err) {
      console.error('Failed to load virtual classroom data:', err);
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
    if (!selectedCourse || !meetingTitle.trim() || creating) return;

    setCreating(true);
    try {
      const meeting = await api.createMeeting({
        courseId: selectedCourse.courseId,
        title: meetingTitle.trim()
      });
      setCurrentMeeting(meeting);
      setActiveTab('video');
      setMeetingTitle('');

      const updated = await api.getCourseMeetings(selectedCourse.courseId);
      setCourseMeetings(updated);
      const actives = await api.getActiveMeetings();
      setActiveMeetings(actives);
    } catch (err) {
      console.error('Failed to start meeting:', err);
      alert('Không thể tạo phòng học trực tuyến. Vui lòng thử lại.');
    } finally {
      setCreating(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const openInNewTab = () => {
    const currentUrl = window.location.href;
    window.open(currentUrl, '_blank');
  };

  const filteredCourses = courses.filter((c) =>
    c.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
    c.courseCode.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const activeMeetingInSelectedCourse = courseMeetings.find((m) => m.status === 'LIVE');

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 text-slate-100 font-sans"
    >
      {/* ====================================================================== */}
      {/* TOP BAR: Navigation, Course Quick-Switch, and Screen Expansion Controls */}
      {/* ====================================================================== */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/courses')}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
            title="Quay lại danh sách khóa học LMS"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Quay lại LMS</span>
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1" />

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-none">
                Phòng Học Trực Tuyến
              </h1>
              <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                Giảng đường ảo & Hội thảo
              </p>
            </div>
          </div>

          {selectedCourse && (
            <div className="hidden md:flex items-center gap-2 ml-4 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-900/60 text-blue-300 border border-blue-700/40">
                {selectedCourse.courseCode}
              </span>
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[280px]">
                {selectedCourse.title}
              </span>
            </div>
          )}
        </div>

        {/* Right Expansion Controls */}
        <div className="flex items-center gap-2">
          {activeMeetingInSelectedCourse && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 border border-emerald-700/50 rounded-lg text-emerald-300 text-xs font-semibold animate-pulse">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Đang học trực tuyến</span>
            </div>
          )}

          {/* Toggle Sidebar Width */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              sidebarOpen
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'bg-blue-600 text-white shadow'
            }`}
            title={sidebarOpen ? 'Thu gọn danh sách môn để mở rộng tối đa' : 'Mở rộng danh sách môn học'}
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span className="hidden lg:inline">{sidebarOpen ? 'Mở rộng không gian' : 'Hiện danh sách'}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition"
            title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* New Tab Button */}
          <button
            onClick={openInNewTab}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition hidden sm:block"
            title="Mở sang tab mới độc lập"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* User Badge */}
          <div className="ml-1 pl-2 border-l border-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold text-xs shadow">
              {user?.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="hidden xl:block text-left">
              <div className="text-xs font-semibold text-slate-200 leading-none">{user?.fullName}</div>
              <div className="text-[10px] text-slate-400 font-medium leading-none mt-1">{user?.role}</div>
            </div>
          </div>
        </div>
      </header>

      {/* ====================================================================== */}
      {/* MAIN WORKSPACE: Collapsible Sidebar + Expansive Interactive Stage      */}
      {/* ====================================================================== */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ==================================================================== */}
        {/* COLLAPSIBLE SIDEBAR: Course Navigation & Meeting Archives           */}
        {/* ==================================================================== */}
        {sidebarOpen && (
          <aside className="w-80 bg-slate-950 border-r border-slate-800/80 flex flex-col flex-shrink-0 z-10 transition-all duration-200">
            {/* Search Box */}
            <div className="p-3 border-b border-slate-800/70">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Tìm kiếm môn học..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Courses List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Khóa học của bạn ({filteredCourses.length})
              </div>

              {loading ? (
                <div className="text-center py-8 text-xs text-slate-500">Đang tải danh sách lớp...</div>
              ) : filteredCourses.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">Không tìm thấy khóa học</div>
              ) : (
                filteredCourses.map((course) => {
                  const isSelected = selectedCourse?.courseId === course.courseId;
                  const hasActiveMeeting = activeMeetings.some((m) => m.courseId === course.courseId);

                  return (
                    <button
                      key={course.courseId}
                      onClick={() => handleSelectCourse(course)}
                      className={`w-full p-2.5 rounded-xl text-left flex items-start gap-2.5 transition-all ${
                        isSelected
                          ? 'bg-blue-600/20 border border-blue-500/50 text-white shadow-sm'
                          : 'bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/40 text-slate-300'
                      }`}
                    >
                      <div className={`p-2 rounded-lg mt-0.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-blue-400">{course.courseCode}</span>
                          {hasActiveMeeting && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold truncate text-slate-200 mt-0.5">
                          {course.title}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {course.credits} Tín chỉ
                        </div>
                      </div>
                    </button>
                  );
                })
              )}

              {/* Previous Meetings Accordion */}
              {selectedCourse && courseMeetings.length > 0 && (
                <div className="pt-4 border-t border-slate-800/80 mt-4 px-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                    <span>Lịch sử buổi học</span>
                    <span className="text-[10px] text-slate-400">{courseMeetings.length}</span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {courseMeetings.map((m) => (
                      <button
                        key={m.meetingId}
                        onClick={() => {
                          setCurrentMeeting(m);
                          setActiveTab('video');
                        }}
                        className={`w-full p-2 rounded-lg text-left text-xs transition flex items-center justify-between ${
                          currentMeeting?.meetingId === m.meetingId
                            ? 'bg-slate-800 text-white border border-slate-700'
                            : 'hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="font-medium truncate">{m.title}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(m.startedAt).toLocaleDateString('vi-VN')}
                          </div>
                        </div>
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                          m.status === 'LIVE'
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {m.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ==================================================================== */}
        {/* EXPANSIVE INTERACTIVE STAGE: Full-Screen Workspace for Learning     */}
        {/* ==================================================================== */}
        <main className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
          {/* Workspace Tabs Navigation Bar */}
          <div className="h-12 bg-slate-950/70 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('video')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                  activeTab === 'video'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Phòng Học Video</span>
                {activeMeetingInSelectedCourse && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>

              <button
                onClick={() => setActiveTab('whiteboard')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                  activeTab === 'whiteboard'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Bảng Vẽ Thông Minh</span>
              </button>

              <button
                onClick={() => setActiveTab('chat')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                  activeTab === 'chat'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Kênh Thảo Luận</span>
              </button>

              {isLecturerOrAdmin && (
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                    activeTab === 'logs'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Điểm Danh & Báo Cáo</span>
                </button>
              )}
            </div>

            {selectedCourse && (
              <div className="text-xs text-slate-400 hidden sm:block">
                Khóa học: <span className="text-slate-200 font-semibold">{selectedCourse.title}</span>
              </div>
            )}
          </div>

          {/* Active Tab View Container */}
          <div className="flex-1 overflow-hidden p-2 sm:p-3 relative">
            {/* ---------------------------------------------------------------- */}
            {/* TAB 1: VIDEO CLASSROOM                                          */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'video' && (
              <div className="h-full w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80 flex flex-col">
                {currentMeeting && currentMeeting.status === 'LIVE' ? (
                  <MeetingRoom
                    meeting={currentMeeting}
                    currentUser={user}
                    onMeetingEnded={() => {
                      setCurrentMeeting(null);
                      if (selectedCourse) handleSelectCourse(selectedCourse);
                    }}
                    onLeave={() => {
                      setCurrentMeeting(null);
                    }}
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mb-4">
                      <Video className="w-8 h-8" />
                    </div>

                    <h2 className="text-lg font-bold text-white mb-1">
                      {selectedCourse ? selectedCourse.title : 'Chưa chọn khóa học'}
                    </h2>
                    <p className="text-xs text-slate-400 max-w-md mb-6">
                      Không gian phòng học trực tuyến độ trễ thấp, hỗ trợ chia sẻ màn hình, bảng vẽ tương tác và ghi nhận chuyên cần thời gian thực.
                    </p>

                    {isLecturerOrAdmin ? (
                      <form onSubmit={handleStartMeeting} className="w-full max-w-md space-y-3">
                        <div className="text-left text-xs font-semibold text-slate-300">
                          Bắt đầu phòng học mới:
                        </div>
                        <input
                          type="text"
                          value={meetingTitle}
                          onChange={(e) => setMeetingTitle(e.target.value)}
                          placeholder="Ví dụ: Buổi 4 - Kiến trúc Microservices và REST API"
                          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                        <button
                          type="submit"
                          disabled={creating || !meetingTitle.trim()}
                          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                        >
                          <Play className="w-4 h-4 fill-white" />
                          <span>{creating ? 'Đang khởi tạo phòng...' : 'Mở phòng học ngay'}</span>
                        </button>
                      </form>
                    ) : (
                      <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-400 max-w-md">
                        Hiện chưa có buổi học trực tuyến nào đang diễn ra cho môn học này. Khi giảng viên mở phòng học, bạn sẽ có thể tham gia ngay tại đây.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* TAB 2: WHITEBOARD CANVAS                                        */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'whiteboard' && (
              <div className="h-full w-full rounded-xl overflow-hidden shadow-lg border border-slate-800">
                <WhiteboardCanvas courseTitle={selectedCourse?.title} />
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* TAB 3: COURSE CHANNEL CHAT                                      */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'chat' && (
              <div className="h-full w-full rounded-xl overflow-hidden bg-white text-slate-900 shadow-lg border border-slate-800">
                {selectedCourse ? (
                  <ChannelChat
                    courseId={selectedCourse.courseId}
                    courseTitle={selectedCourse.title}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Vui lòng chọn môn học để xem kênh trao đổi
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* TAB 4: AUDIT LOGS & ATTENDANCE                                  */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'logs' && isLecturerOrAdmin && (
              <div className="h-full w-full rounded-xl overflow-y-auto bg-slate-950 border border-slate-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <span>Báo cáo chuyên cần & Giám sát lớp học</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ghi nhận tự động thời gian tham gia, thời lượng dự học và mức độ tương tác của sinh viên.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-slate-800 rounded-lg text-xs font-semibold text-slate-300">
                    Môn: {selectedCourse?.courseCode}
                  </span>
                </div>

                {courseMeetings.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500">
                    Chưa có buổi học nào được ghi nhận cho môn học này.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {courseMeetings.map((m) => (
                      <div key={m.meetingId} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-sm text-slate-200">{m.title}</div>
                          <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                            m.status === 'LIVE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {m.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <div>Bắt đầu: {new Date(m.startedAt).toLocaleString('vi-VN')}</div>
                          <div>Mã phòng: <code className="text-blue-400">{m.roomCode}</code></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
