import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  Hand,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Radio,
  Users,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ApiError } from '../../api/http';
import {
  endMeeting,
  leaveMeeting,
  type MeetingMediaState,
  type MeetingPresenceParticipant,
  type WhiteboardOp,
} from '../../api/realtime';
import { useAuth } from '../../auth/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { CourseMessage, Meeting } from '../../types';
import { formatRole } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { ChannelChat } from './ChannelChat';
import type { WhiteboardOpEvent } from './WhiteboardCanvas';

export interface MeetingRoomProps {
  meeting: Meeting;
  courseId: string;
  isVisible?: boolean;
  onMeetingEnded?: (meeting?: Meeting) => void;
  onLeaveRoom?: () => void;
  onWhiteboardOp?: (event: WhiteboardOpEvent) => void;
  onWhiteboardSnapshot?: (strokesJson: string) => void;
  onRegisterSendWhiteboardOp?: (sender: ((op: WhiteboardOp) => boolean) | null) => void;
}

const RTC_ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

interface StageTileProps {
  participant: MeetingPresenceParticipant;
  stream: MediaStream | null;
  isSelf: boolean;
}

function StageVideoTile({ participant, stream, isSelf }: StageTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  const hasVideoTrack = Boolean(
    stream &&
      stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
  );
  const showVideo = hasVideoTrack || participant.mediaState.video || participant.mediaState.screen;

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-700 bg-slate-900 aspect-video text-white shadow-sm">
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className={`absolute inset-0 h-full w-full object-cover ${showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        />
      )}

      {!showVideo && (
        <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/25 border border-blue-400/40 text-lg font-bold text-blue-200">
            {participant.userName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      <div className="relative z-10 flex items-start justify-between p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {participant.handRaised && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-slate-950 shadow">
              <Hand className="w-3 h-3" />
              Giơ tay
            </span>
          )}
          {participant.mediaState.screen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white shadow">
              Chia sẻ màn hình
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-xs">
          {participant.mediaState.audio ? (
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 bg-slate-950/75 px-3 py-1.5 text-xs">
        <span className="truncate font-medium">
          {participant.userName} {isSelf ? '(Bạn)' : ''}
        </span>
        <span className="shrink-0 text-[11px] text-slate-300">
          {formatRole(participant.userRole)}
        </span>
      </div>
    </div>
  );
}

export function MeetingRoom({
  meeting,
  courseId,
  isVisible = true,
  onMeetingEnded,
  onLeaveRoom,
  onWhiteboardOp,
  onWhiteboardSnapshot,
  onRegisterSendWhiteboardOp,
}: MeetingRoomProps) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const currentUserId = String(user?.userId ?? user?.id ?? '');
  const canEndMeeting =
    user?.role === 'ADMIN' || user?.role === 'LECTURER' || meeting.hostId === currentUserId;

  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MeetingPresenceParticipant[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const [mediaState, setMediaState] = useState<MeetingMediaState>({
    audio: false,
    video: false,
    screen: false,
  });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [deviceNotice, setDeviceNotice] = useState<string>(
    'Đang tham gia ở chế độ điểm danh không cần camera/micro. Bạn có thể bật micro, camera hoặc chia sẻ màn hình bất kỳ lúc nào.'
  );
  const [sidePanel, setSidePanel] = useState<'chat' | 'participants'>('participants');
  const [showJitsiBackup, setShowJitsiBackup] = useState(false);
  const [meetingChatMessages, setMeetingChatMessages] = useState<CourseMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [ending, setEnding] = useState(false);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const selfPeerIdRef = useRef<string | null>(null);
  const wbSeqRef = useRef(0);
  const sendJsonRef = useRef<(payload: unknown) => boolean>(() => false);

  useEffect(() => {
    selfPeerIdRef.current = selfPeerId;
  }, [selfPeerId]);

  const stopAllLocalMedia = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setMediaState({ audio: false, video: false, screen: false });
  }, []);

  const closeAllPeerConnections = useCallback(() => {
    for (const pc of peersRef.current.values()) {
      try {
        pc.close();
      } catch {
        // ignore close failure
      }
    }
    peersRef.current.clear();
    setRemoteStreams({});
  }, []);

  const ensurePeerConnection = useCallback(
    (remotePeerId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(remotePeerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_ICE_CONFIG);
      peersRef.current.set(remotePeerId, pc);

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendJsonRef.current({
            type: 'rtc.ice',
            targetPeerId: remotePeerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        setRemoteStreams((prev) => ({
          ...prev,
          [remotePeerId]: stream,
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setRemoteStreams((prev) => {
            if (!prev[remotePeerId]) return prev;
            const copy = { ...prev };
            delete copy[remotePeerId];
            return copy;
          });
        }
      };

      return pc;
    },
    []
  );

  const renegotiateWithPeers = useCallback(async () => {
    const myPeer = selfPeerIdRef.current;
    if (!myPeer) return;
    for (const [remotePeerId, pc] of peersRef.current.entries()) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendJsonRef.current({
          type: 'rtc.offer',
          targetPeerId: remotePeerId,
          sdp: pc.localDescription,
        });
      } catch {
        // ignore transient negotiation errors
      }
    }
  }, []);

  const syncLocalStreamToPeers = useCallback(
    async (stream: MediaStream | null) => {
      for (const pc of peersRef.current.values()) {
        const senders = pc.getSenders();
        const tracks = stream ? stream.getTracks() : [];

        for (const sender of senders) {
          const matching = sender.track
            ? tracks.find((t) => t.id === sender.track?.id)
            : undefined;
          if (!matching && sender.track) {
            try {
              pc.removeTrack(sender);
            } catch {
              // ignore
            }
          }
        }

        if (stream) {
          for (const track of tracks) {
            const alreadySending = pc.getSenders().some((s) => s.track?.id === track.id);
            if (!alreadySending) {
              pc.addTrack(track, stream);
            }
          }
        }
      }
      await renegotiateWithPeers();
    },
    [renegotiateWithPeers]
  );

  const handleWsEvent = useCallback(
    async (data: any) => {
      if (!data || typeof data !== 'object') return;

      if (data.type === 'presence.state') {
        const myPeer = String(data.selfPeerId || '');
        const list = Array.isArray(data.participants)
          ? (data.participants as MeetingPresenceParticipant[])
          : [];
        setSelfPeerId(myPeer);
        setParticipants(list);

        const activePeerIds = new Set(list.map((p) => p.peerId));
        for (const [peerId, pc] of Array.from(peersRef.current.entries())) {
          if (!activePeerIds.has(peerId)) {
            pc.close();
            peersRef.current.delete(peerId);
            setRemoteStreams((prev) => {
              const copy = { ...prev };
              delete copy[peerId];
              return copy;
            });
          }
        }

        for (const p of list) {
          if (p.peerId === myPeer) continue;
          const isNewPeer = !peersRef.current.has(p.peerId);
          const pc = ensurePeerConnection(p.peerId);
          // Smaller peerId initiates offer deterministically to prevent WebRTC glare
          if (isNewPeer && myPeer && myPeer < p.peerId) {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendJsonRef.current({
                type: 'rtc.offer',
                targetPeerId: p.peerId,
                sdp: pc.localDescription,
              });
            } catch {
              // fallback silently; user can still use audio-less classroom tools
            }
          }
        }
      } else if (data.type === 'hand.state') {
        const peerId = String(data.peerId || '');
        const raised = Boolean(data.raised);
        if (peerId && peerId === selfPeerIdRef.current) {
          setHandRaised(raised);
        }
        setParticipants((prev) =>
          prev.map((p) => (p.peerId === peerId ? { ...p, handRaised: raised } : p))
        );
      } else if (data.type === 'media.state') {
        const peerId = String(data.peerId || '');
        const state = data.mediaState as MeetingMediaState;
        if (peerId && state) {
          setParticipants((prev) =>
            prev.map((p) => (p.peerId === peerId ? { ...p, mediaState: state } : p))
          );
        }
      } else if (data.type === 'chat.message' && data.message) {
        const incoming = data.message as CourseMessage;
        setMeetingChatMessages((prev) =>
          prev.some((m) => m.messageId === incoming.messageId) ? prev : [...prev, incoming]
        );
      } else if (data.type === 'typing' && data.peerId !== selfPeerIdRef.current) {
        const name = String(data.userName || 'Thành viên');
        setTypingUsers((prev) => (prev.includes(name) ? prev : [...prev, name]));
        window.setTimeout(() => {
          setTypingUsers((prev) => prev.filter((item) => item !== name));
        }, 3000);
      } else if (data.type === 'whiteboard.op' && data.op) {
        wbSeqRef.current += 1;
        onWhiteboardOp?.({
          seq: wbSeqRef.current,
          op: data.op as WhiteboardOp,
          userId: data.userId,
          userName: data.userName,
        });
      } else if (data.type === 'whiteboard.snapshot' && typeof data.strokesJson === 'string') {
        onWhiteboardSnapshot?.(data.strokesJson);
      } else if (data.type === 'rtc.offer' && data.fromPeerId && data.sdp) {
        const fromPeerId = String(data.fromPeerId);
        const pc = ensurePeerConnection(fromPeerId);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendJsonRef.current({
            type: 'rtc.answer',
            targetPeerId: fromPeerId,
            sdp: pc.localDescription,
          });
        } catch {
          // ignore invalid/stale SDP offer
        }
      } else if (data.type === 'rtc.answer' && data.fromPeerId && data.sdp) {
        const fromPeerId = String(data.fromPeerId);
        const pc = peersRef.current.get(fromPeerId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          } catch {
            // ignore stale SDP answer
          }
        }
      } else if (data.type === 'rtc.ice' && data.fromPeerId && data.candidate) {
        const fromPeerId = String(data.fromPeerId);
        const pc = ensurePeerConnection(fromPeerId);
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          // ignore ICE timing errors before remote description
        }
      } else if (data.type === 'meeting.ended') {
        toast.info('Buổi học trực tuyến đã kết thúc.');
        stopAllLocalMedia();
        closeAllPeerConnections();
        onMeetingEnded?.();
      } else if (data.type === 'error' && data.detail) {
        toast.error(String(data.detail));
      }
    },
    [
      closeAllPeerConnections,
      ensurePeerConnection,
      onMeetingEnded,
      onWhiteboardOp,
      onWhiteboardSnapshot,
      stopAllLocalMedia,
      toast,
    ]
  );

  const { status: wsStatus, sendJson } = useWebSocket({
    path: meeting.status === 'LIVE' ? `/ws/meetings/${meeting.meetingId}` : null,
    enabled: meeting.status === 'LIVE',
    onMessage: (payload) => {
      void handleWsEvent(payload);
    },
  });

  useEffect(() => {
    sendJsonRef.current = sendJson;
  }, [sendJson]);

  useEffect(() => {
    if (!onRegisterSendWhiteboardOp) return;
    if (wsStatus === 'open') {
      onRegisterSendWhiteboardOp((op: WhiteboardOp) =>
        sendJson({ type: 'whiteboard.op', op })
      );
    } else {
      onRegisterSendWhiteboardOp(null);
    }
    return () => onRegisterSendWhiteboardOp(null);
  }, [onRegisterSendWhiteboardOp, sendJson, wsStatus]);

  useEffect(() => {
    return () => {
      stopAllLocalMedia();
      closeAllPeerConnections();
    };
  }, [closeAllPeerConnections, stopAllLocalMedia]);

  const emitMediaState = (next: MeetingMediaState) => {
    setMediaState(next);
    sendJson({ type: 'media.state', ...next });
  };

  const toggleMicrophone = async () => {
    if (mediaState.audio && localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        track.stop();
        localStreamRef.current.removeTrack(track);
      }
      const next = { ...mediaState, audio: false };
      emitMediaState(next);
      setLocalStream(
        localStreamRef.current.getTracks().length > 0 ? new MediaStream(localStreamRef.current.getTracks()) : null
      );
      await syncLocalStreamToPeers(localStreamRef.current);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceNotice('Trình duyệt không hỗ trợ truy cập micro; bạn vẫn điểm danh và tương tác bình thường.');
      toast.warning('Thiết bị hoặc trình duyệt không hỗ trợ micro.');
      return;
    }

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const combined = localStreamRef.current ?? new MediaStream();
      for (const track of audioStream.getAudioTracks()) {
        combined.addTrack(track);
      }
      localStreamRef.current = combined;
      setLocalStream(new MediaStream(combined.getTracks()));
      setDeviceNotice('Đã kết nối micro. Đang truyền âm thanh trực tiếp qua WebRTC.');
      emitMediaState({ ...mediaState, audio: true });
      await syncLocalStreamToPeers(combined);
    } catch {
      setDeviceNotice('Không tìm thấy hoặc bị từ chối quyền micro. Bạn vẫn điểm danh và chat bình thường.');
      toast.info('Đang tiếp tục ở chế độ không micro.');
    }
  };

  const toggleCamera = async () => {
    if (mediaState.video && localStreamRef.current) {
      for (const track of localStreamRef.current.getVideoTracks()) {
        if (screenTrackRef.current && track.id === screenTrackRef.current.id) continue;
        track.stop();
        localStreamRef.current.removeTrack(track);
      }
      const next = { ...mediaState, video: false };
      emitMediaState(next);
      const remaining = localStreamRef.current.getTracks();
      setLocalStream(remaining.length > 0 ? new MediaStream(remaining) : null);
      await syncLocalStreamToPeers(localStreamRef.current);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceNotice('Trình duyệt không hỗ trợ camera; bạn vẫn có thể theo dõi bài giảng và chia sẻ bảng vẽ.');
      toast.warning('Thiết bị không hỗ trợ camera.');
      return;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const combined = localStreamRef.current ?? new MediaStream();
      for (const track of videoStream.getVideoTracks()) {
        combined.addTrack(track);
      }
      localStreamRef.current = combined;
      setLocalStream(new MediaStream(combined.getTracks()));
      setDeviceNotice('Camera đang phát trực tiếp trong phòng học.');
      emitMediaState({ ...mediaState, video: true });
      await syncLocalStreamToPeers(combined);
    } catch {
      setDeviceNotice('Không tìm thấy hoặc bị từ chối quyền camera. Bạn vẫn đang tham gia lớp học bình thường.');
      toast.info('Đang tiếp tục ở chế độ không camera.');
    }
  };

  const toggleScreenShare = async () => {
    if (mediaState.screen && screenTrackRef.current && localStreamRef.current) {
      screenTrackRef.current.stop();
      localStreamRef.current.removeTrack(screenTrackRef.current);
      screenTrackRef.current = null;
      const remaining = localStreamRef.current.getTracks();
      setLocalStream(remaining.length > 0 ? new MediaStream(remaining) : null);
      emitMediaState({ ...mediaState, screen: false });
      await syncLocalStreamToPeers(localStreamRef.current);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.warning('Trình duyệt hiện tại không hỗ trợ chia sẻ màn hình.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrackRef.current = screenTrack;
      const combined = localStreamRef.current ?? new MediaStream();
      combined.addTrack(screenTrack);
      localStreamRef.current = combined;
      setLocalStream(new MediaStream(combined.getTracks()));
      emitMediaState({ ...mediaState, screen: true });
      await syncLocalStreamToPeers(combined);

      screenTrack.onended = () => {
        if (localStreamRef.current && screenTrackRef.current) {
          localStreamRef.current.removeTrack(screenTrackRef.current);
          screenTrackRef.current = null;
          const rest = localStreamRef.current.getTracks();
          setLocalStream(rest.length > 0 ? new MediaStream(rest) : null);
          emitMediaState({ ...mediaState, screen: false });
          void syncLocalStreamToPeers(localStreamRef.current);
        }
      };
    } catch {
      toast.info('Đã hủy thao tác chia sẻ màn hình.');
    }
  };

  const toggleRaiseHand = () => {
    const nextRaised = !handRaised;
    const sent = sendJson({ type: nextRaised ? 'hand.raise' : 'hand.lower' });
    if (sent) {
      setHandRaised(nextRaised);
    } else {
      toast.error('Kết nối phòng học chưa sẵn sàng.');
    }
  };

  const handleLeave = async () => {
    try {
      await leaveMeeting(meeting.meetingId, {
        activitySummary: 'Tham gia lớp học trực tuyến',
      });
    } catch {
      // ignore if already ended or disconnected
    } finally {
      stopAllLocalMedia();
      closeAllPeerConnections();
      onLeaveRoom?.();
    }
  };

  const handleEnd = async () => {
    const ok = await confirm({
      title: 'Kết thúc buổi học trực tuyến?',
      message: 'Tất cả thành viên sẽ rời phòng và hệ thống sẽ chốt dữ liệu điểm danh.',
      confirmText: 'Kết thúc buổi học',
      cancelText: 'Tiếp tục dạy',
      variant: 'danger',
    });
    if (!ok) return;

    setEnding(true);
    try {
      const updated = await endMeeting(meeting.meetingId);
      stopAllLocalMedia();
      closeAllPeerConnections();
      toast.success('Đã kết thúc buổi học và lưu nhật ký điểm danh.');
      onMeetingEnded?.(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Không thể kết thúc buổi học.');
    } finally {
      setEnding(false);
    }
  };

  const safeJitsiRoom = useMemo(() => {
    const cleaned = (meeting.roomCode || meeting.meetingId).replace(/[^A-Za-z0-9_-]/g, '');
    return `UnivLMS-${cleaned || 'Classroom'}`;
  }, [meeting.meetingId, meeting.roomCode]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
      if (a.peerId === selfPeerId) return -1;
      if (b.peerId === selfPeerId) return 1;
      return a.userName.localeCompare(b.userName, 'vi');
    });
  }, [participants, selfPeerId]);

  const raisedCount = useMemo(
    () => participants.filter((p) => p.handRaised).length,
    [participants]
  );

  return (
    <div
      className="flex flex-col gap-4"
      data-stage-visible={isVisible ? 'true' : 'false'}
    >
      {/* Top Room Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="danger" dot>
              <span className="inline-flex items-center gap-1">
                <Radio className="w-3 h-3" />
                Đang phát trực tiếp
              </span>
            </Badge>
            <span className="text-xs font-mono text-[var(--lms-text-secondary)]">
              Mã phòng: {meeting.roomCode}
            </span>
            <Badge variant={wsStatus === 'open' ? 'success' : 'warning'}>
              <span className="inline-flex items-center gap-1">
                {wsStatus === 'open' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {wsStatus === 'open' ? 'WebRTC + WS sẵn sàng' : 'Đang đồng bộ kết nối'}
              </span>
            </Badge>
          </div>
          <h2 className="mt-1 text-lg font-bold text-[var(--lms-text)] truncate">
            {meeting.title}
          </h2>
          <p className="text-xs text-[var(--lms-text-secondary)]">
            Chủ trì: {meeting.hostName || 'Giảng viên'} | Thành viên hiện diện: {Math.max(participants.length, meeting.participantCount)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowJitsiBackup((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--lms-text)] hover:opacity-90 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {showJitsiBackup ? 'Ẩn kênh Jitsi dự phòng' : 'Mở Jitsi dự phòng'}
          </button>

          <button
            type="button"
            onClick={() => void handleLeave()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Rời phòng
          </button>

          {canEndMeeting && (
            <button
              type="button"
              disabled={ending}
              onClick={() => void handleEnd()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              {ending ? 'Đang kết thúc...' : 'Kết thúc buổi học'}
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Stage + Drawer */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 flex flex-col gap-3">
          <div className="rounded-xl border border-[var(--lms-border)] bg-slate-950 p-3 shadow-sm">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              <span>{deviceNotice}</span>
              {raisedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 font-medium text-amber-300">
                  <Hand className="w-3.5 h-3.5" />
                  {raisedCount} người đang giơ tay
                </span>
              )}
            </div>

            {showJitsiBackup ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-200">
                  <span>Kênh dự phòng Jitsi Meet (chỉ dùng khi tường lửa chặn WebRTC trực tiếp)</span>
                  <a
                    href={`https://meet.jit.si/${safeJitsiRoom}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-400 underline"
                  >
                    Mở trong thẻ mới
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <iframe
                  title={`Jitsi Backup - ${meeting.title}`}
                  src={`https://meet.jit.si/${safeJitsiRoom}#config.prejoinPageEnabled=false`}
                  allow="camera; microphone; fullscreen; display-capture; autoplay"
                  className="h-[420px] w-full rounded-lg border border-slate-800 bg-black"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sortedParticipants.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 py-14 text-center text-slate-300">
                    <Video className="w-8 h-8 mb-2 text-blue-400" />
                    <p className="text-sm font-medium">Đang kết nối vào sân khấu lớp học...</p>
                  </div>
                ) : (
                  sortedParticipants.map((participant) => {
                    const isSelf = participant.peerId === selfPeerId;
                    const stream = isSelf
                      ? localStream
                      : remoteStreams[participant.peerId] ?? null;
                    return (
                      <StageVideoTile
                        key={participant.peerId}
                        participant={participant}
                        stream={stream}
                        isSelf={isSelf}
                      />
                    );
                  })
                )}
              </div>
            )}

            {/* Media & Interaction Bar */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => void toggleMicrophone()}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
                  mediaState.audio
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {mediaState.audio ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {mediaState.audio ? 'Tắt Micro' : 'Bật Micro'}
              </button>

              <button
                type="button"
                onClick={() => void toggleCamera()}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
                  mediaState.video
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {mediaState.video ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                {mediaState.video ? 'Tắt Camera' : 'Bật Camera'}
              </button>

              <button
                type="button"
                onClick={() => void toggleScreenShare()}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
                  mediaState.screen
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <MonitorUp className="w-4 h-4" />
                {mediaState.screen ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
              </button>

              <button
                type="button"
                onClick={toggleRaiseHand}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium cursor-pointer ${
                  handRaised
                    ? 'bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Hand className="w-4 h-4" />
                {handRaised ? 'Hạ tay' : 'Giơ tay phát biểu'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side Drawer: Live Presence or In-Room Chat */}
        <aside className="xl:col-span-4 flex flex-col gap-3">
          <div className="flex rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] p-1">
            <button
              type="button"
              onClick={() => setSidePanel('participants')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer ${
                sidePanel === 'participants'
                  ? 'bg-[var(--lms-surface)] text-[var(--lms-text)] shadow-sm'
                  : 'text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Hiện diện ({participants.length})
            </button>
            <button
              type="button"
              onClick={() => setSidePanel('chat')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer ${
                sidePanel === 'chat'
                  ? 'bg-[var(--lms-surface)] text-[var(--lms-text)] shadow-sm'
                  : 'text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Trò chuyện phòng
            </button>
          </div>

          {sidePanel === 'participants' ? (
            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-3 shadow-sm h-[420px] overflow-y-auto space-y-2">
              {sortedParticipants.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--lms-text-secondary)]">
                  Đang cập nhật danh sách thành viên...
                </p>
              ) : (
                sortedParticipants.map((p) => (
                  <div
                    key={p.peerId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-[var(--lms-text)]">
                          {p.userName}
                        </span>
                        {p.peerId === selfPeerId && (
                          <Badge variant="primary">Bạn</Badge>
                        )}
                      </div>
                      <span className="text-xs text-[var(--lms-text-secondary)]">
                        {formatRole(p.userRole)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.handRaised && (
                        <Badge variant="warning">
                          <span className="inline-flex items-center gap-1">
                            <Hand className="w-3 h-3" />
                            Giơ tay
                          </span>
                        </Badge>
                      )}
                      {p.mediaState.audio ? (
                        <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <MicOff className="w-3.5 h-3.5 text-[var(--lms-text-secondary)]" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <ChannelChat
              courseId={courseId}
              meetingId={meeting.meetingId}
              compact
              enableOwnWebSocket={false}
              incomingMessages={meetingChatMessages}
              onSendViaMeetingWs={(payload) =>
                sendJson({ type: 'chat.send', ...payload })
              }
              onTypingViaMeetingWs={(isTyping) =>
                sendJson({ type: 'typing', isTyping })
              }
              typingUsersFromMeeting={typingUsers}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

export default MeetingRoom;
