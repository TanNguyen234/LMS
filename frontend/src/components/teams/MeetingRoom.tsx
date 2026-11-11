import React, { useEffect, useRef, useState } from 'react';
import {
  Video,
  Edit3,
  ShieldCheck,
  PhoneOff,
  Copy,
  Check
} from 'lucide-react';
import { api } from '../../api/client';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import type { Meeting, MeetingLog, User as AppUser } from '../../types';

interface MeetingRoomProps {
  meeting: Meeting;
  currentUser: AppUser | null;
  onMeetingEnded?: () => void;
  onLeave?: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  meeting,
  currentUser,
  onMeetingEnded,
  onLeave
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'whiteboard' | 'logs'>('video');
  const [auditLogs, setAuditLogs] = useState<MeetingLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [ending, setEnding] = useState(false);
  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);
  const jitsiApiRef = useRef<any>(null);

  const isHost =
    currentUser?.role === 'ADMIN' ||
    (currentUser?.role === 'LECTURER' && currentUser?.userId === meeting.hostId);

  // Load Jitsi Meet Script and initialize
  useEffect(() => {
    let isMounted = true;

    const initJitsi = () => {
      if (!jitsiContainerRef.current || !window.JitsiMeetExternalAPI) return;

      // Dispose existing instance if any
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {}
      }

      // Safe clean room name
      const roomName = `UniversityLMS_${meeting.roomCode.replace(/[^a-zA-Z0-9]/g, '')}`;
      const domain = 'meet.jit.si';

      const options = {
        roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainerRef.current,
        userInfo: {
          displayName: currentUser?.fullName || 'Người dùng LMS',
          email: currentUser?.email || 'user@university.edu.vn',
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            'microphone',
            'camera',
            'closedcaptions',
            'desktop',
            'fullscreen',
            'fodeviceselection',
            'hangup',
            'profile',
            'chat',
            'recording',
            'livestreaming',
            'etherpad',
            'sharedvideo',
            'settings',
            'raisehand',
            'videoquality',
            'filmstrip',
            'feedback',
            'stats',
            'shortcuts',
            'tileview',
            'videobackgroundblur',
            'download',
            'help',
            'mute-everyone',
          ],
        },
      };

      try {
        const apiInstance = new window.JitsiMeetExternalAPI(domain, options);
        jitsiApiRef.current = apiInstance;

        apiInstance.addEventListener('videoConferenceLeft', () => {
          handleLeaveCall();
        });
      } catch (err) {
        console.error('Failed to create Jitsi instance:', err);
      }
    };

    // Record join in database
    api.joinMeeting(meeting.meetingId).catch(console.error);

    if (window.JitsiMeetExternalAPI) {
      initJitsi();
    } else {
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = () => {
        if (isMounted) initJitsi();
      };
      document.body.appendChild(script);
    }

    return () => {
      isMounted = false;
      // Record leave in database
      api.leaveMeeting(meeting.meetingId, {
        activitySummary: 'Participant ended session',
      }).catch(console.error);

      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
          jitsiApiRef.current = null;
        } catch {}
      }
    };
  }, [meeting.meetingId]);

  const handleLeaveCall = async () => {
    try {
      await api.leaveMeeting(meeting.meetingId, {
        activitySummary: 'Left meeting room',
      });
    } catch {}
    if (onLeave) onLeave();
  };

  const handleEndMeeting = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn kết thúc buổi học này cho tất cả mọi người?')) return;
    setEnding(true);
    try {
      await api.endMeeting(meeting.meetingId);
      if (onMeetingEnded) onMeetingEnded();
    } catch (err) {
      console.error('Failed to end meeting:', err);
      alert('Không thể kết thúc buổi học');
    } finally {
      setEnding(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await api.getMeetingAuditLogs(meeting.meetingId);
      setAuditLogs(data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(meeting.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins} phút ${secs} giây`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white rounded-xl shadow-lg overflow-hidden border border-slate-800">
      {/* Top MS Teams Style Bar */}
      <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-bold text-base text-white tracking-wide">{meeting.title}</h2>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
            {meeting.courseCode || 'Khóa học'}
          </span>
          <button
            onClick={copyRoomCode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
            title="Sao chép mã phòng"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Mã: <strong className="font-mono text-white">{meeting.roomCode}</strong></span>
          </button>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('video')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'video' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Phòng họp Video</span>
          </button>

          <button
            onClick={() => setActiveTab('whiteboard')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'whiteboard' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Bảng trắng (Whiteboard)</span>
          </button>

          {isHost && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'logs' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Nhật ký & Chống gian lận</span>
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isHost && (
            <button
              onClick={handleEndMeeting}
              disabled={ending}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Kết thúc buổi học</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-900">
        {/* Video Call (Jitsi Container) */}
        <div className={`w-full h-full ${activeTab === 'video' ? 'block' : 'hidden'}`}>
          <div ref={jitsiContainerRef} className="w-full h-full" />
        </div>

        {/* Whiteboard Tab */}
        {activeTab === 'whiteboard' && (
          <div className="w-full h-full p-4 bg-slate-900">
            <WhiteboardCanvas courseTitle={meeting.title} />
          </div>
        )}

        {/* Audit Logs Tab (For anti-cheat & participation tracking) */}
        {activeTab === 'logs' && isHost && (
          <div className="w-full h-full p-6 overflow-y-auto bg-slate-900 text-slate-100">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base">Báo cáo kiểm soát tham gia & Chống gian lận</h3>
                    <p className="text-xs text-slate-400">
                      Tự động ghi nhận thời gian vào/ra thực tế, tổng số phút hiện diện và hành vi trong buổi học.
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchAuditLogs}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs rounded-lg text-white"
                >
                  Làm mới nhật ký
                </button>
              </div>

              {loadingLogs ? (
                <div className="text-center py-12 text-slate-400 text-sm">Đang tải nhật ký...</div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">Chưa có bản ghi nhật ký nào.</div>
              ) : (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-700">
                      <tr>
                        <th className="px-4 py-3">Thành viên</th>
                        <th className="px-4 py-3">Vai trò</th>
                        <th className="px-4 py-3">MSSV</th>
                        <th className="px-4 py-3">Thời điểm vào</th>
                        <th className="px-4 py-3">Thời điểm ra</th>
                        <th className="px-4 py-3">Thời lượng</th>
                        <th className="px-4 py-3">Hoạt động / Đánh giá</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {auditLogs.map((log) => (
                        <tr key={log.logId} className="hover:bg-slate-750/50">
                          <td className="px-4 py-3 font-medium text-white">
                            <div>{log.userName}</div>
                            <div className="text-slate-500 text-[11px]">{log.userEmail}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                log.userRole === 'LECTURER'
                                  ? 'bg-indigo-900/60 text-indigo-300'
                                  : 'bg-emerald-900/60 text-emerald-300'
                              }`}
                            >
                              {log.userRole === 'LECTURER' ? 'Giảng viên' : 'Sinh viên'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-400">{log.studentCode || '-'}</td>
                          <td className="px-4 py-3 text-slate-400">
                            {new Date(log.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {log.leftAt
                              ? new Date(log.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : <span className="text-emerald-400 font-semibold">Đang online</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-200">
                            {formatSeconds(log.durationSeconds)}
                          </td>
                          <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                            {log.activitySummary || 'Tham gia bình thường'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
