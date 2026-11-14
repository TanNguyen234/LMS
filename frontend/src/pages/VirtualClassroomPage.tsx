import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  ClipboardList,
  Download,
  Menu,
  MessageSquare,
  PenTool,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Video,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { ApiError } from '../api/http';
import {
  getCourseMeetings,
  getMeetingAuditLogs,
  startMeeting,
  type WhiteboardOp,
} from '../api/realtime';
import { useAuth } from '../auth/AuthContext';
import { ChannelChat } from '../components/teams/ChannelChat';
import { MeetingRoom } from '../components/teams/MeetingRoom';
import { WhiteboardCanvas, type WhiteboardOpEvent } from '../components/teams/WhiteboardCanvas';
import { Badge } from '../components/ui/Badge';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useToast } from '../components/ui/Toast';
import type { Course, Meeting, MeetingLog } from '../types';
import { exportToCsv } from '../utils/exportUtils';
import {
  formatDateTimeVi,
  formatDurationSeconds,
  formatMeetingStatus,
  formatRole,
} from '../utils/formatters';

type ClassroomTab = 'stage' | 'whiteboard' | 'chat' | 'logs';

export function VirtualClassroomPage() {
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const toast = useToast();

  const titleInputId = useId();
  const logMeetingSelectId = useId();

  const canManageMeetings = hasRole(['ADMIN', 'LECTURER']);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    searchParams.get('courseId') || ''
  );
  const [courseMeetings, setCourseMeetings] = useState<Meeting[]>([]);
  const [joinedMeeting, setJoinedMeeting] = useState<Meeting | null>(null);
  const [activeTab, setActiveTab] = useState<ClassroomTab>('stage');

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  // Whiteboard coordination between mounted MeetingRoom WS & WhiteboardCanvas tab
  const [wbOpEvent, setWbOpEvent] = useState<WhiteboardOpEvent | null>(null);
  const [wbSnapshotJson, setWbSnapshotJson] = useState<string | null>(null);
  const meetingWbSenderRef = useRef<((op: WhiteboardOp) => boolean) | null>(null);

  // Real Audit Logs state
  const [selectedLogMeetingId, setSelectedLogMeetingId] = useState<string>('');
  const [loadedLogMeetingId, setLoadedLogMeetingId] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<MeetingLog[]>([]);

  const loadingLogs =
    canManageMeetings &&
    activeTab === 'logs' &&
    Boolean(selectedLogMeetingId) &&
    loadedLogMeetingId !== selectedLogMeetingId;

  const selectedCourse = useMemo(
    () => courses.find((c) => String(c.courseId || c.id) === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const liveMeetingForCourse = useMemo(
    () => courseMeetings.find((m) => m.status === 'LIVE') || null,
    [courseMeetings]
  );

  const paramCourseId = searchParams.get('courseId');

  const fetchCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const list = await api.getCourses();
      setCourses(list);
      setPageError(null);
      if (list.length > 0) {
        const exists = list.some((c) => String(c.courseId || c.id) === paramCourseId);
        const fallbackId = String(list[0].courseId || list[0].id);
        setSelectedCourseId((prev) => (exists && paramCourseId ? paramCourseId : prev || fallbackId));
      }
    } catch (err) {
      setPageError(err instanceof ApiError ? err.detail : 'Không thể tải danh sách lớp học.');
    } finally {
      setLoadingCourses(false);
    }
  }, [paramCourseId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.getCourses();
        if (cancelled) return;
        setCourses(list);
        setPageError(null);
        if (list.length > 0) {
          const exists = list.some((c) => String(c.courseId || c.id) === paramCourseId);
          const fallbackId = String(list[0].courseId || list[0].id);
          setSelectedCourseId((prev) => (exists && paramCourseId ? paramCourseId : prev || fallbackId));
        }
      } catch (err) {
        if (!cancelled) {
          setPageError(err instanceof ApiError ? err.detail : 'Không thể tải danh sách lớp học.');
        }
      } finally {
        if (!cancelled) {
          setLoadingCourses(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramCourseId]);

  const fetchCourseMeetings = useCallback(async (courseId: string) => {
    if (!courseId) return;
    setLoadingMeetings(true);
    try {
      const list = await getCourseMeetings(courseId);
      setCourseMeetings(list);
      setSelectedLogMeetingId((prev) => {
        if (prev && list.some((m) => m.meetingId === prev)) return prev;
        return list[0]?.meetingId || '';
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Không thể tải lịch sử phòng học.');
    } finally {
      setLoadingMeetings(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await getCourseMeetings(selectedCourseId);
        if (cancelled) return;
        setCourseMeetings(list);
        setSelectedLogMeetingId((prev) => {
          if (prev && list.some((m) => m.meetingId === prev)) return prev;
          return list[0]?.meetingId || '';
        });
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.detail : 'Không thể tải lịch sử phòng học.');
        }
      } finally {
        if (!cancelled) {
          setLoadingMeetings(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCourseId, toast]);

  useEffect(() => {
    if (!canManageMeetings || activeTab !== 'logs' || !selectedLogMeetingId) return;
    let cancelled = false;
    void getMeetingAuditLogs(selectedLogMeetingId)
      .then((logs) => {
        if (!cancelled) {
          setAuditLogs(logs);
          setLoadedLogMeetingId(selectedLogMeetingId);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadedLogMeetingId(selectedLogMeetingId);
          toast.error(err instanceof ApiError ? err.detail : 'Không thể tải nhật ký điểm danh.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canManageMeetings, activeTab, selectedLogMeetingId, toast]);

  const handleSelectCourse = (courseId: string) => {
    if (joinedMeeting && joinedMeeting.courseId !== courseId) {
      setJoinedMeeting(null);
    }
    setSelectedCourseId(courseId);
    setSearchParams({ courseId });
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleStartMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !newMeetingTitle.trim() || startingMeeting) return;

    setStartingMeeting(true);
    try {
      const created = await startMeeting({
        courseId: selectedCourseId,
        title: newMeetingTitle.trim(),
        replaceActive: false,
      });
      setNewMeetingTitle('');
      setJoinedMeeting(created);
      setActiveTab('stage');
      toast.success('Đã mở phòng học trực tuyến.');
      void fetchCourseMeetings(selectedCourseId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const replace = await confirm({
          title: 'Lớp học đang có phòng trực tuyến',
          message:
            'Lớp học này hiện có một phòng đang phát sóng. Bạn có muốn đóng phòng cũ và mở phòng học mới thay thế không?',
          confirmText: 'Thay thế phòng cũ',
          cancelText: 'Giữ phòng cũ',
          variant: 'danger',
        });
        if (replace) {
          try {
            const replaced = await startMeeting({
              courseId: selectedCourseId,
              title: newMeetingTitle.trim(),
              replaceActive: true,
            });
            setNewMeetingTitle('');
            setJoinedMeeting(replaced);
            setActiveTab('stage');
            toast.success('Đã mở phòng học mới thay thế phòng cũ.');
            void fetchCourseMeetings(selectedCourseId);
          } catch (retryErr) {
            toast.error(
              retryErr instanceof ApiError ? retryErr.detail : 'Không thể thay thế phòng học.'
            );
          }
        }
      } else {
        toast.error(err instanceof ApiError ? err.detail : 'Không thể mở phòng học trực tuyến.');
      }
    } finally {
      setStartingMeeting(false);
    }
  };

  const handleExportLogsCsv = () => {
    if (auditLogs.length === 0) return;
    const headers = [
      'Họ và tên',
      'Email',
      'Vai trò',
      'Mã sinh viên',
      'Thời điểm vào',
      'Thời điểm rời',
      'Thời lượng (giây)',
      'Số tin nhắn',
      'Số lần giơ tay',
      'Tóm tắt hoạt động',
    ];
    const rows = auditLogs.map((l) => [
      l.userName || '',
      l.userEmail || '',
      formatRole(l.userRole),
      l.studentCode || '',
      formatDateTimeVi(l.joinedAt),
      l.leftAt ? formatDateTimeVi(l.leftAt) : 'Đang trong phòng',
      l.durationSeconds,
      l.chatCount,
      l.handRaisesCount,
      l.activitySummary || '',
    ]);
    exportToCsv(`diem-danh-${selectedLogMeetingId.slice(0, 8)}.csv`, headers, rows);
  };

  const registerWbSender = useCallback((sender: ((op: WhiteboardOp) => boolean) | null) => {
    meetingWbSenderRef.current = sender;
  }, []);

  const tabs: Array<{ id: ClassroomTab; label: string; icon: React.ReactNode }> = [
    { id: 'stage', label: 'Phòng học trực tuyến', icon: <Video className="w-4 h-4" /> },
    { id: 'whiteboard', label: 'Bảng vẽ cộng tác', icon: <PenTool className="w-4 h-4" /> },
    { id: 'chat', label: 'Thảo luận kênh lớp', icon: <MessageSquare className="w-4 h-4" /> },
    ...(canManageMeetings
      ? [{ id: 'logs' as ClassroomTab, label: 'Nhật ký điểm danh', icon: <ClipboardList className="w-4 h-4" /> }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-expanded={sidebarOpen}
            aria-label="Đóng mở danh sách lớp học"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            Danh sách lớp học
          </button>

          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[var(--lms-text)]">
              Lớp học trực tuyến
            </h1>
            <p className="text-xs md:text-sm text-[var(--lms-text-secondary)]">
              Học trực tuyến WebRTC, bảng vẽ vector thời gian thực, thảo luận kênh lớp và điểm danh tự động
            </p>
          </div>
        </div>

        {joinedMeeting && activeTab !== 'stage' && (
          <button
            type="button"
            onClick={() => setActiveTab('stage')}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5" />
            Quay lại phòng đang tham gia
          </button>
        )}
      </div>

      {pageError && <ErrorBanner message={pageError} onRetry={() => void fetchCourses()} />}

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {sidebarOpen && (
          <aside className="w-full md:w-72 shrink-0 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-secondary)]">
                Lớp học của bạn ({courses.length})
              </h2>
              <button
                type="button"
                onClick={() => void fetchCourses()}
                aria-label="Làm mới danh sách lớp"
                className="p-1 rounded text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)] cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingCourses ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingCourses ? (
              <p className="py-6 text-center text-xs text-[var(--lms-text-secondary)]">
                Đang tải danh sách lớp...
              </p>
            ) : courses.length === 0 ? (
              <EmptyState compact title="Chưa có lớp học" description="Bạn chưa được ghi danh vào lớp nào." />
            ) : (
              <nav className="space-y-1.5" aria-label="Chọn lớp học trực tuyến">
                {courses.map((course) => {
                  const cid = String(course.courseId || course.id);
                  const active = cid === selectedCourseId;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => handleSelectCourse(cid)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors border cursor-pointer ${
                        active
                          ? 'border-[var(--lms-primary)] bg-[var(--lms-primary)]/10 text-[var(--lms-text)]'
                          : 'border-transparent hover:bg-[var(--lms-surface-muted)] text-[var(--lms-text)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--lms-primary)]">
                          {course.courseCode || course.code}
                        </span>
                        <BookOpen className="w-3.5 h-3.5 text-[var(--lms-text-secondary)]" />
                      </div>
                      <p className="mt-0.5 text-sm font-medium truncate">{course.title}</p>
                    </button>
                  );
                })}
              </nav>
            )}
          </aside>
        )}

        <main className="flex-1 min-w-0 w-full space-y-4">
          {!selectedCourse ? (
            <EmptyState
              title="Chọn một lớp học"
              description="Chọn lớp học từ danh sách bên trái để tham gia phòng học trực tuyến, vẽ bảng chung hoặc thảo luận."
            />
          ) : (
            <>
              {/* Tab Bar */}
              <div
                className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-1.5 shadow-sm"
                role="tablist"
                aria-label="Khu vực lớp học trực tuyến"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs md:text-sm font-medium transition-colors cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-[var(--lms-primary)] text-white shadow-sm'
                        : 'text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Stage Tab (kept MOUNTED when joinedMeeting exists so tab switches never kill WebRTC/WS) */}
              <div className={activeTab === 'stage' ? 'block space-y-4' : 'hidden'}>
                {joinedMeeting ? (
                  <MeetingRoom
                    meeting={joinedMeeting}
                    courseId={selectedCourseId}
                    isVisible={activeTab === 'stage'}
                    onWhiteboardOp={setWbOpEvent}
                    onWhiteboardSnapshot={setWbSnapshotJson}
                    onRegisterSendWhiteboardOp={registerWbSender}
                    onLeaveRoom={() => {
                      setJoinedMeeting(null);
                      void fetchCourseMeetings(selectedCourseId);
                    }}
                    onMeetingEnded={() => {
                      setJoinedMeeting(null);
                      void fetchCourseMeetings(selectedCourseId);
                    }}
                  />
                ) : (
                  <div className="space-y-4">
                    {/* Live room banner / Join card */}
                    {liveMeetingForCourse ? (
                      <section className="rounded-xl border border-[var(--lms-primary)]/40 bg-[var(--lms-surface)] p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="danger" dot>
                                Đang phát trực tiếp
                              </Badge>
                              <span className="text-xs font-mono text-[var(--lms-text-secondary)]">
                                {liveMeetingForCourse.roomCode}
                              </span>
                            </div>
                            <h2 className="text-lg font-bold text-[var(--lms-text)]">
                              {liveMeetingForCourse.title}
                            </h2>
                            <p className="text-sm text-[var(--lms-text-secondary)]">
                              Chủ trì: {liveMeetingForCourse.hostName || 'Giảng viên'} | Thành viên hiện diện: {liveMeetingForCourse.participantCount}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setJoinedMeeting(liveMeetingForCourse)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[var(--lms-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 cursor-pointer"
                          >
                            <Play className="w-4 h-4" />
                            Vào lớp học trực tuyến
                          </button>
                        </div>
                      </section>
                    ) : (
                      <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-5 shadow-sm">
                        <EmptyState
                          compact
                          title="Hiện chưa có phòng học nào đang phát sóng"
                          description={
                            canManageMeetings
                              ? 'Giảng viên có thể tạo buổi học trực tuyến mới ngay bên dưới.'
                              : 'Khi giảng viên bắt đầu buổi học, nút tham gia sẽ xuất hiện tại đây.'
                          }
                        />
                      </div>
                    )}

                    {/* Lecturer / Admin Start New Room Form */}
                    {canManageMeetings && (
                      <form
                        onSubmit={(e) => void handleStartMeeting(e)}
                        className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 shadow-sm space-y-3"
                      >
                        <h3 className="text-sm font-semibold text-[var(--lms-text)]">
                          Mở buổi học trực tuyến mới cho {selectedCourse.courseCode || selectedCourse.code}
                        </h3>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="flex-1">
                            <label htmlFor={titleInputId} className="sr-only">
                              Tiêu đề buổi học trực tuyến
                            </label>
                            <input
                              id={titleInputId}
                              type="text"
                              value={newMeetingTitle}
                              onChange={(e) => setNewMeetingTitle(e.target.value)}
                              placeholder="Ví dụ: Chương 5 - Cây nhị phân tìm kiếm"
                              className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-3 py-2 text-sm text-[var(--lms-text)] placeholder:text-[var(--lms-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--lms-primary)]"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={startingMeeting || !newMeetingTitle.trim()}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--lms-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            {startingMeeting ? 'Đang khởi tạo...' : 'Bắt đầu buổi học'}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Meeting History */}
                    <section className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[var(--lms-text)]">
                          Lịch sử các buổi học ({courseMeetings.length})
                        </h3>
                        <button
                          type="button"
                          onClick={() => void fetchCourseMeetings(selectedCourseId)}
                          className="text-xs text-[var(--lms-primary)] hover:underline cursor-pointer"
                        >
                          Làm mới
                        </button>
                      </div>

                      {loadingMeetings ? (
                        <p className="text-xs text-[var(--lms-text-secondary)]">Đang tải lịch sử...</p>
                      ) : courseMeetings.length === 0 ? (
                        <p className="text-xs text-[var(--lms-text-secondary)]">
                          Lớp học chưa có buổi học trực tuyến nào.
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--lms-border)]">
                          {courseMeetings.map((item) => (
                            <div
                              key={item.meetingId}
                              className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-[var(--lms-text)] truncate">
                                  {item.title}
                                </p>
                                <p className="text-xs text-[var(--lms-text-secondary)]">
                                  Bắt đầu: {formatDateTimeVi(item.startedAt)}
                                  {item.endedAt ? ` | Kết thúc: ${formatDateTimeVi(item.endedAt)}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={item.status === 'LIVE' ? 'danger' : 'neutral'}>
                                  {formatMeetingStatus(item.status)}
                                </Badge>
                                {item.status === 'LIVE' && (
                                  <button
                                    type="button"
                                    onClick={() => setJoinedMeeting(item)}
                                    className="rounded-lg bg-[var(--lms-primary)] px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
                                  >
                                    Tham gia
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>

              {/* Whiteboard Tab */}
              <div className={activeTab === 'whiteboard' ? 'block' : 'hidden'}>
                <WhiteboardCanvas
                  courseId={selectedCourseId}
                  meetingId={joinedMeeting?.meetingId}
                  isVisible={activeTab === 'whiteboard'}
                  externalOpEvent={wbOpEvent}
                  externalSnapshotJson={wbSnapshotJson}
                  onSendOp={(op) =>
                    meetingWbSenderRef.current ? meetingWbSenderRef.current(op) : false
                  }
                />
              </div>

              {/* Channel Chat Tab */}
              <div className={activeTab === 'chat' ? 'block' : 'hidden'}>
                <ChannelChat
                  courseId={selectedCourseId}
                  courseTitle={`${selectedCourse.courseCode || selectedCourse.code} - ${selectedCourse.title}`}
                />
              </div>

              {/* Real Attendance Audit Logs Tab (Lecturer / Admin only) */}
              {canManageMeetings && activeTab === 'logs' && (
                <section className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-[240px] flex-1">
                      <label
                        htmlFor={logMeetingSelectId}
                        className="block text-xs font-medium text-[var(--lms-text-secondary)] mb-1"
                      >
                        Chọn buổi học cần xem điểm danh
                      </label>
                      <select
                        id={logMeetingSelectId}
                        value={selectedLogMeetingId}
                        onChange={(e) => setSelectedLogMeetingId(e.target.value)}
                        className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-3 py-2 text-sm text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-[var(--lms-primary)]"
                      >
                        {courseMeetings.length === 0 ? (
                          <option value="">Chưa có buổi học nào</option>
                        ) : (
                          courseMeetings.map((m) => (
                            <option key={m.meetingId} value={m.meetingId}>
                              [{formatMeetingStatus(m.status)}] {m.title} ({formatDateTimeVi(m.startedAt)})
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportLogsCsv}
                      disabled={auditLogs.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-3.5 py-2 text-xs font-semibold text-[var(--lms-text)] hover:opacity-90 disabled:opacity-45 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Xuất CSV điểm danh
                    </button>
                  </div>

                  {loadingLogs ? (
                    <p className="py-8 text-center text-sm text-[var(--lms-text-secondary)]">
                      Đang tải dữ liệu điểm danh thực tế từ máy chủ...
                    </p>
                  ) : auditLogs.length === 0 ? (
                    <EmptyState
                      compact
                      title="Chưa có dữ liệu điểm danh"
                      description="Hệ thống tự động ghi nhận khi giảng viên hoặc sinh viên tham gia phòng học trực tuyến."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <caption className="sr-only">
                          Nhật ký điểm danh và tương tác phòng học
                        </caption>
                        <thead>
                          <tr className="border-b border-[var(--lms-border)] text-xs text-[var(--lms-text-secondary)]">
                            <th className="py-2.5 pr-3 font-semibold">Thành viên</th>
                            <th className="py-2.5 px-3 font-semibold">Vai trò</th>
                            <th className="py-2.5 px-3 font-semibold">Vào phòng</th>
                            <th className="py-2.5 px-3 font-semibold">Rời phòng</th>
                            <th className="py-2.5 px-3 font-semibold">Thời lượng</th>
                            <th className="py-2.5 px-3 font-semibold text-right">Tin nhắn</th>
                            <th className="py-2.5 pl-3 font-semibold text-right">Giơ tay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--lms-border)]">
                          {auditLogs.map((log) => (
                            <tr key={log.logId} className="hover:bg-[var(--lms-surface-muted)]/60">
                              <td className="py-2.5 pr-3">
                                <div className="font-medium text-[var(--lms-text)]">
                                  {log.userName || 'Thành viên'}
                                </div>
                                <div className="text-xs text-[var(--lms-text-secondary)]">
                                  {log.studentCode ? `${log.studentCode} · ` : ''}
                                  {log.userEmail}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge variant={log.userRole === 'STUDENT' ? 'neutral' : 'primary'}>
                                  {formatRole(log.userRole)}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-xs text-[var(--lms-text)]">
                                {formatDateTimeVi(log.joinedAt)}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-[var(--lms-text-secondary)]">
                                {log.leftAt ? formatDateTimeVi(log.leftAt) : 'Đang trực tuyến'}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-[var(--lms-text)]">
                                {formatDurationSeconds(log.durationSeconds)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-xs text-[var(--lms-text)]">
                                {log.chatCount}
                              </td>
                              <td className="py-2.5 pl-3 text-right font-mono text-xs text-[var(--lms-text)]">
                                {log.handRaisesCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default VirtualClassroomPage;
