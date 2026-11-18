import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart2,
  Captions,
  Check,
  Circle,
  Copy,
  Grid,
  Hand,
  HelpCircle,
  Info,
  LayoutPanelLeft,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  PhoneOff,
  Radio,
  Search,
  Settings,
  Smile,
  Square,
  Users,
  Video,
  VideoOff,
  VolumeX,
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
import { useExpandableView } from '../../hooks/useExpandableView';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { CourseMessage, Meeting } from '../../types';
import {
  CLASSROOM_REACTIONS,
  createBackgroundEffectTrack,
  formatElapsedSeconds,
  VIDEO_QUALITY_PRESETS,
  type BackgroundEffectMode,
  type ProcessedTrackHandle,
  type VideoQualityPreset,
} from '../../utils/classroomMedia';
import { formatRole } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { ExpandFullscreenControls } from '../ui/ExpandFullscreenControls';
import { ThemeToggle, useTheme } from '../ui/ThemeToggle';
import { useToast } from '../ui/Toast';
import { ChannelChat } from './ChannelChat';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import { RoomPollsPanel, type RoomPoll } from './RoomPollsPanel';
import { ClassroomReactionIcon, StageVideoTile } from './StageVideoTile';
import { WhiteboardCanvas, type WhiteboardOpEvent } from './WhiteboardCanvas';

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

type StageLayout = 'gallery' | 'spotlight' | 'whiteboard';
type DrawerTab = 'participants' | 'chat' | 'polls' | 'info' | null;

interface FloatingReaction {
  id: string;
  emoji: string;
  userName: string;
  peerId: string;
}

interface CaptionLine {
  id: string;
  userName: string;
  text: string;
}

interface PeerStatsInfo {
  peerId: string;
  userName: string;
  connectionState: string;
  rttMs: number | null;
  packetsLost: number;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const RTC_ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

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
  const { resolvedTheme } = useTheme();
  const isDarkSurface = resolvedTheme === 'dark';
  const toast = useToast();

  const currentUserId = String(user?.userId ?? user?.id ?? '');
  const canModerate =
    user?.role === 'ADMIN' || user?.role === 'LECTURER' || meeting.hostId === currentUserId;

  const {
    containerRef: meetingRootRef,
    isExpanded,
    isFullscreen,
    isWide,
    toggleExpand,
    toggleFullscreen,
    exitExpand,
  } = useExpandableView<HTMLDivElement>();

  // Presence & Room state
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
  const [speakingPeerIds, setSpeakingPeerIds] = useState<Set<string>>(() => new Set());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    const startMs = meeting.startedAt ? new Date(meeting.startedAt).getTime() : Date.now();
    return Number.isFinite(startMs) ? Math.max(0, Math.floor((Date.now() - startMs) / 1000)) : 0;
  });

  // Layout & Panels (MS Teams Workspace)
  const [stageLayout, setStageLayout] = useState<StageLayout>('gallery');
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'participants' : null
  );
  const [spotlightPeerId, setSpotlightPeerId] = useState<string | null>(null);

  const activateWhiteboardStage = useCallback(() => {
    setStageLayout('whiteboard');
    setShowFilmstrip(false);
    setDrawerTab((cur) => (cur === 'participants' ? null : cur));
  }, []);

  const toggleWhiteboardStage = useCallback(() => {
    setStageLayout((cur) => {
      if (cur === 'whiteboard') {
        setShowFilmstrip(true);
        return 'gallery';
      }
      setShowFilmstrip(false);
      setDrawerTab((tab) => (tab === 'participants' ? null : tab));
      return 'whiteboard';
    });
  }, []);
  const [participantSearch, setParticipantSearch] = useState('');
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Interactive Jitsi-grade Self-Built Features
  const [meetingChatMessages, setMeetingChatMessages] = useState<CourseMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [tileEmojis, setTileEmojis] = useState<Record<string, string>>({});
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activePoll, setActivePoll] = useState<RoomPoll | null>(null);
  const [myPollVote, setMyPollVote] = useState<{ pollId: string; optionIndex: number } | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);

  // Device / Media Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioInputId, setAudioInputId] = useState('');
  const [videoInputId, setVideoInputId] = useState('');
  const [audioOutputId, setAudioOutputId] = useState('');
  const [videoQuality, setVideoQuality] = useState<VideoQualityPreset>('720p');
  const [backgroundMode, setBackgroundMode] = useState<BackgroundEffectMode>('none');
  const [mirrorSelfVideo, setMirrorSelfVideo] = useState(true);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [peerStats, setPeerStats] = useState<PeerStatsInfo[]>([]);

  // Whiteboard coordination when opened inside MeetingRoom
  const [inlineWbOpEvent, setInlineWbOpEvent] = useState<WhiteboardOpEvent | null>(null);
  const [inlineWbSnapshotJson, setInlineWbSnapshotJson] = useState<string | null>(null);

  // Refs
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackHandleRef = useRef<ProcessedTrackHandle | null>(null);
  const selfPeerIdRef = useRef<string | null>(null);
  const handRaisedRef = useRef(handRaised);
  const wbSeqRef = useRef(0);
  const drawerTabRef = useRef<DrawerTab>(drawerTab);
  const mediaStateRef = useRef<MeetingMediaState>(mediaState);
  const soundAlertsRef = useRef(soundAlertsEnabled);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<SpeechRecognitionLike | null>(null);
  const sendJsonRef = useRef<(payload: unknown) => boolean>(() => false);
  const participantsRef = useRef<MeetingPresenceParticipant[]>([]);
  const pttHoldRef = useRef(false);

  useEffect(() => {
    selfPeerIdRef.current = selfPeerId;
  }, [selfPeerId]);

  useEffect(() => {
    handRaisedRef.current = handRaised;
  }, [handRaised]);

  useEffect(() => {
    drawerTabRef.current = drawerTab;
  }, [drawerTab]);

  useEffect(() => {
    mediaStateRef.current = mediaState;
  }, [mediaState]);

  useEffect(() => {
    soundAlertsRef.current = soundAlertsEnabled;
  }, [soundAlertsEnabled]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Call elapsed timer + recording timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (isRecording) {
        setRecordingSeconds((prev) => prev + 1);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const playSubtleTone = useCallback((freq = 660) => {
    if (!soundAlertsRef.current || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.17);
      window.setTimeout(() => void ctx.close().catch(() => {}), 250);
    } catch {
      // ignore autoplay blocks
    }
  }, []);

  const stopDisplayStreamOnly = useCallback(() => {
    if (displayStreamRef.current) {
      for (const track of displayStreamRef.current.getTracks()) {
        track.onended = null;
        track.stop();
        localStreamRef.current?.removeTrack(track);
      }
      displayStreamRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      localStreamRef.current?.removeTrack(screenTrackRef.current);
      screenTrackRef.current = null;
    }
  }, []);

  const stopCameraTrackOnly = useCallback(() => {
    if (cameraTrackHandleRef.current) {
      const activeCamTrack = cameraTrackHandleRef.current.track;
      if (localStreamRef.current) {
        localStreamRef.current.removeTrack(activeCamTrack);
      }
      cameraTrackHandleRef.current.cleanup();
      cameraTrackHandleRef.current = null;
    }
  }, []);

  const stopAllLocalMedia = useCallback(() => {
    stopDisplayStreamOnly();
    stopCameraTrackOnly();
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore stop failure
      }
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore speech stop
      }
      speechRecRef.current = null;
    }
    setLocalStream(null);
    setMediaState({ audio: false, video: false, screen: false });
  }, [stopCameraTrackOnly, stopDisplayStreamOnly]);

  const closeAllPeerConnections = useCallback(() => {
    for (const pc of peersRef.current.values()) {
      try {
        pc.close();
      } catch {
        // ignore close failure
      }
    }
    peersRef.current.clear();
    makingOfferRef.current.clear();
    setRemoteStreams({});
  }, []);

  const ensurePeerConnection = useCallback((remotePeerId: string): RTCPeerConnection => {
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
  }, []);

  const renegotiateWithPeers = useCallback(async () => {
    const myPeer = selfPeerIdRef.current;
    if (!myPeer) return;
    const maxBitrate = VIDEO_QUALITY_PRESETS[videoQuality].maxBitrate;

    for (const [remotePeerId, pc] of peersRef.current.entries()) {
      if (pc.signalingState !== 'stable' || makingOfferRef.current.has(remotePeerId)) {
        continue;
      }
      makingOfferRef.current.add(remotePeerId);
      try {
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'video') {
            const params = sender.getParameters();
            if (params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = maxBitrate;
              void sender.setParameters(params).catch(() => {});
            }
          }
        }
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') continue;
        await pc.setLocalDescription(offer);
        sendJsonRef.current({
          type: 'rtc.offer',
          targetPeerId: remotePeerId,
          sdp: pc.localDescription,
        });
      } catch {
        // ignore transient negotiation errors
      } finally {
        makingOfferRef.current.delete(remotePeerId);
      }
    }
  }, [videoQuality]);

  const syncLocalStreamToPeers = useCallback(
    async (stream: MediaStream | null) => {
      let needsNegotiation = false;
      const tracks = stream ? stream.getTracks() : [];
      const nextVideoTrack = tracks.find((t) => t.kind === 'video') ?? null;

      for (const pc of peersRef.current.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');

        if (videoSender && nextVideoTrack && videoSender.track?.id !== nextVideoTrack.id) {
          try {
            await videoSender.replaceTrack(nextVideoTrack);
          } catch {
            needsNegotiation = true;
          }
        }

        for (const sender of pc.getSenders()) {
          const matching = sender.track
            ? tracks.find((t) => t.id === sender.track?.id)
            : undefined;
          if (!matching && sender.track) {
            try {
              pc.removeTrack(sender);
              needsNegotiation = true;
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
              needsNegotiation = true;
            }
          }
        }
      }

      if (needsNegotiation) {
        await renegotiateWithPeers();
      }
    },
    [renegotiateWithPeers]
  );

  const emitMediaState = useCallback((next: MeetingMediaState) => {
    setMediaState(next);
    sendJsonRef.current({ type: 'media.state', ...next });
  }, []);

  const forceMuteLocalMic = useCallback(async () => {
    if (localStreamRef.current) {
      const displayAudioIds = new Set(
        displayStreamRef.current?.getAudioTracks().map((t) => t.id) ?? []
      );
      for (const track of localStreamRef.current.getAudioTracks()) {
        if (displayAudioIds.has(track.id)) continue;
        track.stop();
        localStreamRef.current.removeTrack(track);
      }
      const rest = localStreamRef.current.getTracks();
      setLocalStream(rest.length > 0 ? new MediaStream(rest) : null);
    }
    setMediaState((prev) => ({ ...prev, audio: false }));
    await syncLocalStreamToPeers(localStreamRef.current);
  }, [syncLocalStreamToPeers]);

  const triggerReactionVisual = useCallback((peerId: string, userName: string, emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setReactions((prev) => [...prev.slice(-14), { id, emoji, userName, peerId }]);
    setTileEmojis((prev) => ({ ...prev, [peerId]: emoji }));
    window.setTimeout(() => {
      setReactions((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
    window.setTimeout(() => {
      setTileEmojis((prev) => {
        if (prev[peerId] !== emoji) return prev;
        const copy = { ...prev };
        delete copy[peerId];
        return copy;
      });
    }, 3000);
  }, []);

  const handleWsEvent = useCallback(
    async (rawPayload: unknown) => {
      if (!rawPayload || typeof rawPayload !== 'object') return;
      const data = rawPayload as Record<string, unknown>;

      if (data.type === 'presence.state') {
        const myPeer = String(data.selfPeerId || '');
        const prevPeer = selfPeerIdRef.current;
        const list = Array.isArray(data.participants)
          ? (data.participants as MeetingPresenceParticipant[])
          : [];
        if (prevPeer && myPeer && prevPeer !== myPeer) {
          closeAllPeerConnections();
        }
        selfPeerIdRef.current = myPeer;
        setSelfPeerId(myPeer);
        setParticipants(list);

        const me = list.find((p) => p.peerId === myPeer);
        if (me) {
          if (prevPeer && prevPeer !== myPeer && handRaisedRef.current) {
            sendJsonRef.current({ type: 'hand.raise' });
          } else {
            setHandRaised(me.handRaised);
          }
        }

        const activePeerIds = new Set(list.map((p) => p.peerId));
        for (const [peerId, pc] of Array.from(peersRef.current.entries())) {
          if (!activePeerIds.has(peerId)) {
            pc.close();
            peersRef.current.delete(peerId);
            makingOfferRef.current.delete(peerId);
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
          if (isNewPeer && myPeer && myPeer < p.peerId) {
            makingOfferRef.current.add(p.peerId);
            try {
              const offer = await pc.createOffer();
              if (pc.signalingState === 'stable') {
                await pc.setLocalDescription(offer);
                sendJsonRef.current({
                  type: 'rtc.offer',
                  targetPeerId: p.peerId,
                  sdp: pc.localDescription,
                });
              }
            } catch {
              // ignore signaling retry
            } finally {
              makingOfferRef.current.delete(p.peerId);
            }
          }
        }
      } else if (data.type === 'hand.state') {
        const peerId = String(data.peerId || '');
        const raised = Boolean(data.raised);
        if (peerId && peerId === selfPeerIdRef.current) {
          setHandRaised(raised);
        } else if (raised) {
          playSubtleTone(740);
        }
        setParticipants((prev) =>
          prev.map((p) => (p.peerId === peerId ? { ...p, handRaised: raised } : p))
        );
      } else if (data.type === 'media.state') {
        const peerId = String(data.peerId || '');
        const state = data.mediaState as MeetingMediaState | undefined;
        if (peerId && state) {
          setParticipants((prev) =>
            prev.map((p) => (p.peerId === peerId ? { ...p, mediaState: state } : p))
          );
          if (state.screen && peerId !== selfPeerIdRef.current) {
            setSpotlightPeerId(peerId);
            setStageLayout((cur) => (cur === 'gallery' ? 'spotlight' : cur));
          }
        }
      } else if (data.type === 'moderation.force_mute') {
        const byName = String(data.byUserName || 'Giảng viên');
        void forceMuteLocalMic();
        toast.info(`${byName} đã tắt micro của bạn.`);
      } else if (data.type === 'reaction.event') {
        triggerReactionVisual(
          String(data.peerId || ''),
          String(data.userName || 'Thành viên'),
          String(data.emoji || 'like')
        );
      } else if (data.type === 'caption.event') {
        const line: CaptionLine = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userName: String(data.userName || 'Thành viên'),
          text: String(data.text || ''),
        };
        if (line.text) {
          setCaptionLines((prev) => [...prev.slice(-2), line]);
          window.setTimeout(() => {
            setCaptionLines((prev) => prev.filter((item) => item.id !== line.id));
          }, 6000);
        }
      } else if (data.type === 'poll.state' && data.poll) {
        setActivePoll(data.poll as RoomPoll);
        if (drawerTabRef.current !== 'polls') {
          playSubtleTone(587);
        }
      } else if (data.type === 'chat.message' && data.message) {
        const incoming = data.message as CourseMessage;
        setMeetingChatMessages((prev) =>
          prev.some((m) => m.messageId === incoming.messageId) ? prev : [...prev, incoming]
        );
        if (drawerTabRef.current !== 'chat' && incoming.senderId !== currentUserId) {
          setUnreadChatCount((n) => n + 1);
          playSubtleTone(523);
        }
      } else if (data.type === 'typing' && data.peerId !== selfPeerIdRef.current) {
        const name = String(data.userName || 'Thành viên');
        setTypingUsers((prev) => (prev.includes(name) ? prev : [...prev, name]));
        window.setTimeout(() => {
          setTypingUsers((prev) => prev.filter((item) => item !== name));
        }, 3000);
      } else if (data.type === 'whiteboard.op' && data.op) {
        wbSeqRef.current += 1;
        const ev: WhiteboardOpEvent = {
          seq: wbSeqRef.current,
          op: data.op as WhiteboardOp,
          userId: typeof data.userId === 'string' ? data.userId : undefined,
          userName: typeof data.userName === 'string' ? data.userName : undefined,
        };
        setInlineWbOpEvent(ev);
        onWhiteboardOp?.(ev);
      } else if (data.type === 'whiteboard.snapshot' && typeof data.strokesJson === 'string') {
        setInlineWbSnapshotJson(data.strokesJson);
        onWhiteboardSnapshot?.(data.strokesJson);
      } else if (data.type === 'rtc.offer' && data.fromPeerId && data.sdp) {
        const fromPeerId = String(data.fromPeerId);
        const pc = ensurePeerConnection(fromPeerId);
        const myPeer = selfPeerIdRef.current;
        const isPolite = !myPeer || myPeer > fromPeerId;
        const offerCollision =
          makingOfferRef.current.has(fromPeerId) || pc.signalingState !== 'stable';
        if (offerCollision && !isPolite) {
          return;
        }
        try {
          const remoteDesc = new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit);
          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription(remoteDesc),
            ]);
          } else {
            await pc.setRemoteDescription(remoteDesc);
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendJsonRef.current({
            type: 'rtc.answer',
            targetPeerId: fromPeerId,
            sdp: pc.localDescription,
          });
        } catch {
          // ignore stale offer
        }
      } else if (data.type === 'rtc.answer' && data.fromPeerId && data.sdp) {
        const fromPeerId = String(data.fromPeerId);
        const pc = peersRef.current.get(fromPeerId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
          } catch {
            // ignore stale answer
          }
        }
      } else if (data.type === 'rtc.ice' && data.fromPeerId && data.candidate) {
        const fromPeerId = String(data.fromPeerId);
        const pc = ensurePeerConnection(fromPeerId);
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit));
        } catch {
          // ignore ICE timing errors
        }
      } else if (data.type === 'meeting.ended') {
        toast.info('Buổi học trực tuyến đã kết thúc.');
        stopAllLocalMedia();
        closeAllPeerConnections();
        exitExpand();
        onMeetingEnded?.();
      } else if (data.type === 'error' && data.detail) {
        toast.error(String(data.detail));
      }
    },
    [
      closeAllPeerConnections,
      currentUserId,
      ensurePeerConnection,
      exitExpand,
      forceMuteLocalMic,
      onMeetingEnded,
      onWhiteboardOp,
      onWhiteboardSnapshot,
      playSubtleTone,
      stopAllLocalMedia,
      toast,
      triggerReactionVisual,
    ]
  );

  const { status: wsStatus, sendJson } = useWebSocket({
    path: meeting.status === 'LIVE' ? `/ws/meetings/${meeting.meetingId}` : null,
    enabled: meeting.status === 'LIVE',
    onOpen: () => {
      const currentMedia = mediaStateRef.current;
      if (currentMedia.audio || currentMedia.video || currentMedia.screen) {
        sendJsonRef.current({ type: 'media.state', ...currentMedia });
      }
      if (handRaisedRef.current) {
        sendJsonRef.current({ type: 'hand.raise' });
      }
    },
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

  // Active speaker volume detection (Web Audio API)
  useEffect(() => {
    const entries: Array<{ peerId: string; stream: MediaStream }> = [];
    if (selfPeerId && localStream && localStream.getAudioTracks().length > 0) {
      entries.push({ peerId: selfPeerId, stream: localStream });
    }
    for (const [peerId, stream] of Object.entries(remoteStreams)) {
      if (stream.getAudioTracks().length > 0) {
        entries.push({ peerId, stream });
      }
    }
    if (entries.length === 0) return undefined;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return undefined;

    const ctx = new AudioCtx();
    const analysers: Array<{ peerId: string; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }> = [];
    const sources: MediaStreamAudioSourceNode[] = [];

    for (const item of entries) {
      try {
        const src = ctx.createMediaStreamSource(item.stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        sources.push(src);
        analysers.push({ peerId: item.peerId, analyser, data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) });
      } catch {
        // ignore unreadable audio stream
      }
    }

    const interval = window.setInterval(() => {
      const nextSpeaking = new Set<string>();
      for (const a of analysers) {
        a.analyser.getByteFrequencyData(a.data);
        let sum = 0;
        for (let i = 0; i < a.data.length; i += 1) sum += a.data[i];
        const avg = a.data.length > 0 ? sum / a.data.length : 0;
        if (avg > 18) nextSpeaking.add(a.peerId);
      }
      setSpeakingPeerIds(nextSpeaking);
    }, 300);

    return () => {
      window.clearInterval(interval);
      for (const s of sources) {
        try {
          s.disconnect();
        } catch {
          // ignore
        }
      }
      void ctx.close().catch(() => {});
      setSpeakingPeerIds(new Set());
    };
  }, [localStream, remoteStreams, selfPeerId]);

  // WebRTC stats polling when Info/Stats tab is open
  useEffect(() => {
    if (drawerTab !== 'info') return undefined;
    const pollStats = async () => {
      const results: PeerStatsInfo[] = [];
      for (const [peerId, pc] of peersRef.current.entries()) {
        let rttMs: number | null = null;
        let packetsLost = 0;
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
            if (report.type === 'inbound-rtp' && typeof report.packetsLost === 'number') {
              packetsLost += report.packetsLost;
            }
          });
        } catch {
          // ignore
        }
        const matched = participantsRef.current.find((p) => p.peerId === peerId);
        results.push({
          peerId,
          userName: matched?.userName || peerId.slice(0, 8),
          connectionState: pc.connectionState,
          rttMs,
          packetsLost,
        });
      }
      setPeerStats(results);
    };
    void pollStats();
    const timer = window.setInterval(() => void pollStats(), 2500);
    return () => window.clearInterval(timer);
  }, [drawerTab]);

  // Media Controls
  const startMicrophone = useCallback(
    async (deviceIdOverride?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.warning('Trình duyệt không hỗ trợ micro.');
        return false;
      }
      try {
        const chosenAudio = deviceIdOverride ?? audioInputId;
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: chosenAudio ? { deviceId: { exact: chosenAudio } } : true,
        });
        const combined = localStreamRef.current ?? new MediaStream();
        const displayAudioIds = new Set(
          displayStreamRef.current?.getAudioTracks().map((t) => t.id) ?? []
        );
        for (const oldTrack of combined.getAudioTracks()) {
          if (displayAudioIds.has(oldTrack.id)) continue;
          oldTrack.stop();
          combined.removeTrack(oldTrack);
        }
        for (const track of audioStream.getAudioTracks()) {
          combined.addTrack(track);
        }
        localStreamRef.current = combined;
        setLocalStream(new MediaStream(combined.getTracks()));
        emitMediaState({ ...mediaStateRef.current, audio: true });
        await syncLocalStreamToPeers(combined);
        return true;
      } catch {
        toast.info('Không tìm thấy hoặc bị từ chối quyền micro.');
        return false;
      }
    },
    [audioInputId, emitMediaState, syncLocalStreamToPeers, toast]
  );

  const stopMicrophone = useCallback(async () => {
    if (localStreamRef.current) {
      const displayAudioIds = new Set(
        displayStreamRef.current?.getAudioTracks().map((t) => t.id) ?? []
      );
      for (const track of localStreamRef.current.getAudioTracks()) {
        if (displayAudioIds.has(track.id)) continue;
        track.stop();
        localStreamRef.current.removeTrack(track);
      }
      const rest = localStreamRef.current.getTracks();
      setLocalStream(rest.length > 0 ? new MediaStream(rest) : null);
    }
    emitMediaState({ ...mediaStateRef.current, audio: false });
    await syncLocalStreamToPeers(localStreamRef.current);
  }, [emitMediaState, syncLocalStreamToPeers]);

  const toggleMicrophone = useCallback(async () => {
    if (mediaStateRef.current.audio) {
      await stopMicrophone();
    } else {
      await startMicrophone();
    }
  }, [startMicrophone, stopMicrophone]);

  const startCamera = useCallback(
    async (
      overrides: {
        deviceId?: string;
        quality?: VideoQualityPreset;
        bgMode?: BackgroundEffectMode;
      } = {}
    ) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.warning('Thiết bị không hỗ trợ camera.');
        return false;
      }
      const chosenVideo = overrides.deviceId ?? videoInputId;
      const qualityKey = overrides.quality ?? videoQuality;
      const spec = VIDEO_QUALITY_PRESETS[qualityKey];
      const bg = overrides.bgMode ?? backgroundMode;

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(chosenVideo ? { deviceId: { exact: chosenVideo } } : {}),
            width: { ideal: spec.width },
            height: { ideal: spec.height },
            frameRate: { ideal: spec.frameRate },
          },
        });
        const rawTrack = videoStream.getVideoTracks()[0];
        if (!rawTrack) return false;

        stopCameraTrackOnly();
        const handle = createBackgroundEffectTrack(rawTrack, bg);
        cameraTrackHandleRef.current = handle;

        const combined = localStreamRef.current ?? new MediaStream();
        if (!screenTrackRef.current) {
          combined.addTrack(handle.track);
        }
        localStreamRef.current = combined;
        setLocalStream(new MediaStream(combined.getTracks()));
        emitMediaState({ ...mediaStateRef.current, video: true });
        await syncLocalStreamToPeers(combined);
        return true;
      } catch {
        toast.info('Không tìm thấy hoặc bị từ chối quyền camera.');
        return false;
      }
    },
    [
      backgroundMode,
      emitMediaState,
      stopCameraTrackOnly,
      syncLocalStreamToPeers,
      toast,
      videoInputId,
      videoQuality,
    ]
  );

  const toggleCamera = useCallback(async () => {
    if (mediaStateRef.current.video) {
      stopCameraTrackOnly();
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getVideoTracks()) {
          if (screenTrackRef.current && track.id === screenTrackRef.current.id) continue;
          track.stop();
          localStreamRef.current.removeTrack(track);
        }
        const remaining = localStreamRef.current.getTracks();
        setLocalStream(remaining.length > 0 ? new MediaStream(remaining) : null);
      }
      emitMediaState({ ...mediaStateRef.current, video: false });
      await syncLocalStreamToPeers(localStreamRef.current);
      return;
    }
    await startCamera();
  }, [emitMediaState, startCamera, stopCameraTrackOnly, syncLocalStreamToPeers]);

  const finishScreenShare = useCallback(async () => {
    stopDisplayStreamOnly();
    const combined = localStreamRef.current ?? new MediaStream();
    if (
      mediaStateRef.current.video &&
      cameraTrackHandleRef.current &&
      cameraTrackHandleRef.current.track.readyState === 'live'
    ) {
      const camTrack = cameraTrackHandleRef.current.track;
      if (!combined.getVideoTracks().some((t) => t.id === camTrack.id)) {
        combined.addTrack(camTrack);
      }
    }
    const remaining = combined.getTracks();
    localStreamRef.current = remaining.length > 0 ? combined : null;
    setLocalStream(remaining.length > 0 ? new MediaStream(remaining) : null);
    emitMediaState({ ...mediaStateRef.current, screen: false });
    await syncLocalStreamToPeers(localStreamRef.current);
  }, [emitMediaState, stopDisplayStreamOnly, syncLocalStreamToPeers]);

  const toggleScreenShare = useCallback(async () => {
    if (mediaStateRef.current.screen) {
      await finishScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.warning('Trình duyệt không hỗ trợ chia sẻ màn hình.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) {
        for (const t of displayStream.getTracks()) t.stop();
        return;
      }

      stopDisplayStreamOnly();
      displayStreamRef.current = displayStream;
      screenTrackRef.current = screenTrack;

      const combined = localStreamRef.current ?? new MediaStream();
      if (cameraTrackHandleRef.current) {
        combined.removeTrack(cameraTrackHandleRef.current.track);
      }
      for (const oldVideo of combined.getVideoTracks()) {
        if (oldVideo.id !== screenTrack.id) {
          combined.removeTrack(oldVideo);
        }
      }
      combined.addTrack(screenTrack);
      for (const displayAudioTrack of displayStream.getAudioTracks()) {
        combined.addTrack(displayAudioTrack);
      }

      localStreamRef.current = combined;
      setLocalStream(new MediaStream(combined.getTracks()));
      emitMediaState({ ...mediaStateRef.current, screen: true });
      if (selfPeerIdRef.current) {
        setSpotlightPeerId(selfPeerIdRef.current);
        setStageLayout('spotlight');
      }
      await syncLocalStreamToPeers(combined);

      screenTrack.onended = () => {
        void finishScreenShare();
      };
    } catch {
      toast.info('Đã hủy thao tác chia sẻ màn hình.');
    }
  }, [emitMediaState, finishScreenShare, stopDisplayStreamOnly, syncLocalStreamToPeers, toast]);

  const toggleRaiseHand = useCallback(() => {
    const nextRaised = !handRaised;
    const sent = sendJson({ type: nextRaised ? 'hand.raise' : 'hand.lower' });
    if (sent) {
      setHandRaised(nextRaised);
    } else {
      toast.error('Kết nối phòng học chưa sẵn sàng.');
    }
  }, [handRaised, sendJson, toast]);

  const sendReaction = useCallback(
    (emoji: string) => {
      sendJson({ type: 'reaction.send', emoji });
      setShowReactionPicker(false);
    },
    [sendJson]
  );

  // Live Captions (Web Speech API)
  const toggleLiveCaptions = useCallback(() => {
    if (captionsEnabled) {
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {
          // ignore
        }
        speechRecRef.current = null;
      }
      setCaptionsEnabled(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecCtor) {
      toast.warning('Trình duyệt hiện tại không hỗ trợ nhận diện giọng nói tạo phụ đề.');
      return;
    }

    try {
      const rec = new SpeechRecCtor();
      rec.lang = 'vi-VN';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          if (res?.isFinal && res[0]?.transcript) {
            const text = res[0].transcript.trim();
            if (text) {
              sendJsonRef.current({ type: 'caption.send', text, isFinal: true });
            }
          }
        }
      };
      rec.onerror = () => {
        toast.info('Tạm dừng phụ đề do không nhận được tín hiệu giọng nói.');
        setCaptionsEnabled(false);
      };
      rec.onend = () => {
        setCaptionsEnabled(false);
      };
      rec.start();
      speechRecRef.current = rec;
      setCaptionsEnabled(true);
      toast.success('Đã bật phụ đề trực tiếp (vi-VN).');
    } catch {
      toast.error('Không thể khởi động trình tạo phụ đề.');
    }
  }, [captionsEnabled, toast]);

  // Local Session Recording (MediaRecorder -> .webm download)
  const toggleLocalRecording = useCallback(async () => {
    if (isRecording && mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      toast.warning('Trình duyệt không hỗ trợ ghi hình MediaRecorder.');
      return;
    }

    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (localStreamRef.current) {
        for (const aTrack of localStreamRef.current.getAudioTracks()) {
          capture.addTrack(aTrack.clone());
        }
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(capture, { mimeType });
      recorderChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recorderChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        for (const t of capture.getTracks()) t.stop();
        const blob = new Blob(recorderChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `buoi-hoc-${meeting.roomCode || 'lms'}-${new Date().toISOString().slice(0, 16)}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Đã lưu video ghi hình buổi học (.webm).');
        }
        setIsRecording(false);
        setRecordingSeconds(0);
        mediaRecorderRef.current = null;
      };
      capture.getVideoTracks()[0].onended = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecordingSeconds(0);
      setIsRecording(true);
      toast.info('Đang ghi hình buổi học trực tiếp.');
    } catch {
      toast.info('Đã hủy ghi hình.');
    }
  }, [isRecording, meeting.roomCode, toast]);

  const handleApplyDeviceSettings = useCallback(
    async (next: {
      audioInputId: string;
      videoInputId: string;
      audioOutputId: string;
      videoQuality: VideoQualityPreset;
      backgroundMode: BackgroundEffectMode;
      mirrorSelfVideo: boolean;
      soundAlertsEnabled: boolean;
    }) => {
      setAudioInputId(next.audioInputId);
      setVideoInputId(next.videoInputId);
      setAudioOutputId(next.audioOutputId);
      setVideoQuality(next.videoQuality);
      setBackgroundMode(next.backgroundMode);
      setMirrorSelfVideo(next.mirrorSelfVideo);
      setSoundAlertsEnabled(next.soundAlertsEnabled);

      if (mediaStateRef.current.audio) {
        await startMicrophone(next.audioInputId);
      }
      if (mediaStateRef.current.video) {
        await startCamera({
          deviceId: next.videoInputId,
          quality: next.videoQuality,
          bgMode: next.backgroundMode,
        });
      }
      toast.success('Đã cập nhật thiết bị và hiệu ứng phòng học.');
    },
    [startCamera, startMicrophone, toast]
  );

  // Keyboard shortcuts + Space Push-to-Talk
  useEffect(() => {
    if (!isVisible) return undefined;
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space' && !e.repeat && !mediaStateRef.current.audio && !pttHoldRef.current) {
        e.preventDefault();
        pttHoldRef.current = true;
        setPushToTalkActive(true);
        void startMicrophone();
        return;
      }
      if (k === 'm') {
        e.preventDefault();
        void toggleMicrophone();
      } else if (k === 'v') {
        e.preventDefault();
        void toggleCamera();
      } else if (k === 's') {
        e.preventDefault();
        void toggleScreenShare();
      } else if (k === 'h') {
        e.preventDefault();
        toggleRaiseHand();
      } else if (k === 'w') {
        e.preventDefault();
        toggleWhiteboardStage();
      } else if (k === 'c') {
        e.preventDefault();
        setDrawerTab((cur) => {
          if (cur === 'chat') return null;
          setUnreadChatCount(0);
          return 'chat';
        });
      } else if (k === 'p') {
        e.preventDefault();
        setDrawerTab((cur) => (cur === 'participants' ? null : 'participants'));
      } else if (k === 'f') {
        e.preventDefault();
        toggleExpand();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && pttHoldRef.current) {
        e.preventDefault();
        pttHoldRef.current = false;
        setPushToTalkActive(false);
        void stopMicrophone();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    isVisible,
    startMicrophone,
    stopMicrophone,
    toggleCamera,
    toggleExpand,
    toggleMicrophone,
    toggleRaiseHand,
    toggleScreenShare,
    toggleWhiteboardStage,
  ]);

  const handleLeave = async () => {
    try {
      await leaveMeeting(meeting.meetingId, {
        activitySummary: 'Tham gia lớp học trực tuyến',
      });
    } catch {
      // ignore
    } finally {
      stopAllLocalMedia();
      closeAllPeerConnections();
      exitExpand();
      onLeaveRoom?.();
    }
  };

  const confirmAndEndMeeting = async () => {
    setEnding(true);
    try {
      const updated = await endMeeting(meeting.meetingId);
      stopAllLocalMedia();
      closeAllPeerConnections();
      setEndConfirmOpen(false);
      exitExpand();
      toast.success('Đã kết thúc buổi học và lưu nhật ký điểm danh.');
      onMeetingEnded?.(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Không thể kết thúc buổi học.');
    } finally {
      setEnding(false);
    }
  };

  const handleEnd = () => {
    setEndConfirmOpen(true);
  };

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/classroom?courseId=${encodeURIComponent(courseId)}`;
    const text = `Tham gia lớp "${meeting.title}"\nMã phòng: ${meeting.roomCode}\nLiên kết: ${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedInvite(true);
      toast.success('Đã sao chép thông tin mời vào lớp.');
      window.setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      toast.info(`Mã phòng: ${meeting.roomCode}`);
    }
  };

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
      if (a.mediaState.screen !== b.mediaState.screen) return a.mediaState.screen ? -1 : 1;
      if (a.peerId === selfPeerId) return -1;
      if (b.peerId === selfPeerId) return 1;
      return a.userName.localeCompare(b.userName, 'vi');
    });
  }, [participants, selfPeerId]);

  const filteredParticipants = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    if (!q) return sortedParticipants;
    return sortedParticipants.filter(
      (p) =>
        p.userName.toLowerCase().includes(q) ||
        formatRole(p.userRole).toLowerCase().includes(q)
    );
  }, [participantSearch, sortedParticipants]);

  const raisedCount = useMemo(
    () => participants.filter((p) => p.handRaised).length,
    [participants]
  );

  // Determine active spotlight participant if spotlight layout or pin selected
  const effectiveSpotlightParticipant = useMemo(() => {
    if (sortedParticipants.length === 0) return null;
    if (spotlightPeerId) {
      const pinned = sortedParticipants.find((p) => p.peerId === spotlightPeerId);
      if (pinned) return pinned;
    }
    const sharer = sortedParticipants.find((p) => p.mediaState.screen);
    if (sharer) return sharer;
    const host = sortedParticipants.find((p) => p.userId === meeting.hostId);
    return host || sortedParticipants[0];
  }, [meeting.hostId, sortedParticipants, spotlightPeerId]);

  // Adaptive Gallery grid classes based on participant count so tiles fill stage completely
  const galleryGridClass = useMemo(() => {
    const n = sortedParticipants.length;
    if (n <= 1) return 'grid-cols-1 grid-rows-1';
    if (n === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1';
    if (n <= 4) return 'grid-cols-2 grid-rows-2';
    if (n <= 6) return 'grid-cols-2 lg:grid-cols-3 grid-rows-3 lg:grid-rows-2';
    if (n <= 9) return 'grid-cols-3 grid-rows-3';
    return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 auto-rows-fr';
  }, [sortedParticipants.length]);

  const openDrawer = (tab: Exclude<DrawerTab, null>) => {
    setDrawerTab((cur) => {
      const next = cur === tab ? null : tab;
      if (next === 'chat') setUnreadChatCount(0);
      return next;
    });
  };

  const myPollVoteIndex =
    activePoll && myPollVote && myPollVote.pollId === activePoll.pollId
      ? myPollVote.optionIndex
      : null;

  const dockNeutralBtn =
    'bg-slate-200/85 text-slate-800 hover:bg-slate-300/85 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

  return (
    <div
      ref={meetingRootRef}
      data-stage-visible={isVisible ? 'true' : 'false'}
      data-room-wide={isWide ? 'true' : 'false'}
      className={
        isExpanded
          ? 'fixed inset-0 z-50 flex h-screen w-screen flex-col bg-slate-100 text-slate-900 dark:bg-[#0b1120] dark:text-slate-100 overflow-hidden'
          : isFullscreen
            ? 'flex h-screen w-screen flex-col bg-slate-100 text-slate-900 dark:bg-[#0b1120] dark:text-slate-100 overflow-hidden'
            : 'flex flex-col rounded-2xl border border-[var(--lms-border)] bg-slate-100 text-slate-900 dark:border-slate-800 dark:bg-[#0b1120] dark:text-slate-100 shadow-lg overflow-hidden h-[calc(100vh-11rem)] min-h-[620px]'
      }
    >
      {/* 1. Slim MS Teams Top Bar */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--lms-border)] bg-[var(--lms-surface)]/95 dark:border-slate-800/90 dark:bg-slate-950/95 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/12 border border-red-500/35 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-600/20 dark:border-red-500/40 dark:text-red-300">
            <Radio className="w-3 h-3 animate-pulse text-red-600 dark:text-red-400" />
            LIVE · <span className="tabular-nums">{formatElapsedSeconds(elapsedSeconds)}</span>
          </span>

          {isRecording && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white animate-pulse">
              <Circle className="w-2.5 h-2.5 fill-white" />
              REC {formatElapsedSeconds(recordingSeconds)}
            </span>
          )}

          <h2 className="truncate text-sm font-bold text-[var(--lms-text)] max-w-[220px] sm:max-w-xs md:max-w-md">
            {meeting.title}
          </h2>

          <button
            type="button"
            onClick={() => void handleCopyInvite()}
            title="Sao chép mã phòng & liên kết mời"
            className="hidden sm:inline-flex items-center gap-1 rounded-md border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/70 px-2 py-0.5 text-[11px] font-mono text-[var(--lms-text-muted)] hover:border-indigo-500 hover:text-[var(--lms-text)] cursor-pointer"
          >
            {copiedInvite ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {meeting.roomCode}
          </button>

          <span
            className={`hidden md:inline-flex items-center gap-1 text-[11px] ${
              wsStatus === 'open' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
            title={wsStatus === 'open' ? 'Kết nối WebRTC + WebSocket ổn định' : 'Đang đồng bộ kết nối'}
          >
            {wsStatus === 'open' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {wsStatus === 'open' ? 'Sẵn sàng' : 'Đang nối'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Layout Switcher */}
          <div
            className="inline-flex items-center rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/80 dark:border-slate-800 dark:bg-slate-900 p-0.5 text-xs"
            role="group"
            aria-label="Chế độ hiển thị sân khấu"
          >
            <button
              type="button"
              onClick={() => {
                setSpotlightPeerId(null);
                setShowFilmstrip(true);
                setStageLayout('gallery');
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium cursor-pointer transition ${
                stageLayout === 'gallery'
                  ? 'bg-indigo-600 text-white'
                  : 'text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
              }`}
              title="Xem dạng lưới tự động"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lưới</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowFilmstrip(true);
                setStageLayout('spotlight');
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium cursor-pointer transition ${
                stageLayout === 'spotlight'
                  ? 'bg-indigo-600 text-white'
                  : 'text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
              }`}
              title="Phóng to người thuyết trình / màn hình chia sẻ"
            >
              <LayoutPanelLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tiêu điểm</span>
            </button>

            <button
              type="button"
              onClick={activateWhiteboardStage}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium cursor-pointer transition ${
                stageLayout === 'whiteboard'
                  ? 'bg-indigo-600 text-white'
                  : 'text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
              }`}
              title="Mở bảng vẽ cộng tác ngay trong phòng (W)"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bảng trắng</span>
            </button>
          </div>

          {stageLayout !== 'gallery' && sortedParticipants.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFilmstrip((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                showFilmstrip
                  ? 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
                  : 'border-indigo-500/55 bg-indigo-500/12 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-600/20 dark:text-indigo-200'
              }`}
              title="Ẩn/hiện dải video thành viên"
            >
              {showFilmstrip ? 'Ẩn dải video' : 'Hiện dải video'}
            </button>
          )}

          <ThemeToggle className="!h-7 !px-2 !text-xs" />

          <ExpandFullscreenControls
            darkSurface={isDarkSurface}
            isExpanded={isExpanded}
            isFullscreen={isFullscreen}
            onToggleExpand={toggleExpand}
            onToggleFullscreen={() => void toggleFullscreen()}
            expandLabel="Tràn cửa sổ"
            collapseLabel="Thu khung"
          />

          <button
            type="button"
            onClick={() => setDrawerTab((cur) => (cur ? null : 'participants'))}
            title={drawerTab ? 'Ẩn thanh bên để mở rộng sân khấu' : 'Mở thanh bên'}
            aria-label="Đóng mở thanh bên phòng học"
            className="inline-flex items-center rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] p-1.5 text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
          >
            {drawerTab ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 2. Center Workspace: Adaptive Stage + Optional Right Drawer */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Main Stage */}
        <div className="relative flex flex-1 min-w-0 min-h-0 flex-col overflow-hidden p-2 md:p-3">
          {stageLayout === 'whiteboard' ? (
            <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-2.5 overflow-hidden">
              <div className="flex flex-1 min-w-0 min-h-0 rounded-xl overflow-hidden border border-[var(--lms-border)]">
                <WhiteboardCanvas
                  courseId={courseId}
                  meetingId={meeting.meetingId}
                  isVisible={isVisible}
                  fillParent
                  externalOpEvent={inlineWbOpEvent}
                  externalSnapshotJson={inlineWbSnapshotJson}
                  onSendOp={(op) => sendJson({ type: 'whiteboard.op', op })}
                />
              </div>
              {showFilmstrip && sortedParticipants.length > 0 && (
                <div className="flex lg:w-56 shrink-0 flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto">
                  {sortedParticipants.map((participant) => {
                    const isSelf = participant.peerId === selfPeerId;
                    return (
                      <StageVideoTile
                        key={participant.peerId}
                        participant={participant}
                        stream={isSelf ? localStream : remoteStreams[participant.peerId] ?? null}
                        isSelf={isSelf}
                        isThumbStrip
                        isSpeaking={speakingPeerIds.has(participant.peerId)}
                        mirrorSelf={mirrorSelfVideo}
                        audioOutputId={audioOutputId}
                        recentEmoji={tileEmojis[participant.peerId] ?? null}
                        canModerate={canModerate}
                        onMutePeer={() =>
                          sendJson({ type: 'moderation.mute_peer', targetPeerId: participant.peerId })
                        }
                        onToggleSpotlight={() => {
                          setSpotlightPeerId(participant.peerId);
                          setStageLayout('spotlight');
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : stageLayout === 'spotlight' && effectiveSpotlightParticipant ? (
            <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-2.5 overflow-hidden">
              <div className="flex-1 min-w-0 min-h-0">
                <StageVideoTile
                  participant={effectiveSpotlightParticipant}
                  stream={
                    effectiveSpotlightParticipant.peerId === selfPeerId
                      ? localStream
                      : remoteStreams[effectiveSpotlightParticipant.peerId] ?? null
                  }
                  isSelf={effectiveSpotlightParticipant.peerId === selfPeerId}
                  isSpotlight
                  isSpeaking={speakingPeerIds.has(effectiveSpotlightParticipant.peerId)}
                  mirrorSelf={mirrorSelfVideo}
                  audioOutputId={audioOutputId}
                  recentEmoji={tileEmojis[effectiveSpotlightParticipant.peerId] ?? null}
                  canModerate={canModerate}
                  onMutePeer={() =>
                    sendJson({
                      type: 'moderation.mute_peer',
                      targetPeerId: effectiveSpotlightParticipant.peerId,
                    })
                  }
                  onToggleSpotlight={() => {
                    setSpotlightPeerId(null);
                    setStageLayout('gallery');
                  }}
                />
              </div>

              {showFilmstrip && sortedParticipants.length > 1 && (
                <div className="flex lg:w-56 shrink-0 flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto">
                  {sortedParticipants
                    .filter((p) => p.peerId !== effectiveSpotlightParticipant.peerId)
                    .map((participant) => {
                      const isSelf = participant.peerId === selfPeerId;
                      return (
                        <StageVideoTile
                          key={participant.peerId}
                          participant={participant}
                          stream={isSelf ? localStream : remoteStreams[participant.peerId] ?? null}
                          isSelf={isSelf}
                          isThumbStrip
                          isSpeaking={speakingPeerIds.has(participant.peerId)}
                          mirrorSelf={mirrorSelfVideo}
                          audioOutputId={audioOutputId}
                          recentEmoji={tileEmojis[participant.peerId] ?? null}
                          canModerate={canModerate}
                          onMutePeer={() =>
                            sendJson({
                              type: 'moderation.mute_peer',
                              targetPeerId: participant.peerId,
                            })
                          }
                          onToggleSpotlight={() => setSpotlightPeerId(participant.peerId)}
                        />
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <div className={`grid flex-1 min-h-0 gap-2.5 overflow-y-auto ${galleryGridClass}`}>
              {sortedParticipants.length === 0 ? (
                <div className="col-span-full flex h-full flex-col items-center justify-center rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-8 text-center text-[var(--lms-text)]">
                  <Video className="w-10 h-10 mb-3 text-indigo-600 dark:text-indigo-400" />
                  <p className="text-sm font-semibold">Đang đồng bộ sân khấu lớp học WebRTC...</p>
                  <p className="mt-1 text-xs text-[var(--lms-text-muted)]">
                    Đang điểm danh tự động. Bật micro, camera hoặc mở bảng trắng bất kỳ lúc nào.
                  </p>
                </div>
              ) : (
                sortedParticipants.map((participant) => {
                  const isSelf = participant.peerId === selfPeerId;
                  return (
                    <StageVideoTile
                      key={participant.peerId}
                      participant={participant}
                      stream={isSelf ? localStream : remoteStreams[participant.peerId] ?? null}
                      isSelf={isSelf}
                      isSpeaking={speakingPeerIds.has(participant.peerId)}
                      mirrorSelf={mirrorSelfVideo}
                      audioOutputId={audioOutputId}
                      recentEmoji={tileEmojis[participant.peerId] ?? null}
                      canModerate={canModerate}
                      onMutePeer={() =>
                        sendJson({
                          type: 'moderation.mute_peer',
                          targetPeerId: participant.peerId,
                        })
                      }
                      onToggleSpotlight={() => {
                        setSpotlightPeerId(participant.peerId);
                        setShowFilmstrip(true);
                        setStageLayout('spotlight');
                      }}
                    />
                  );
                })
              )}
            </div>
          )}

          {/* Floating Reactions Stream */}
          {reactions.length > 0 && (
            <div className="pointer-events-none absolute bottom-16 left-4 z-20 flex flex-col gap-1.5">
              {reactions.map((rx) => (
                <div
                  key={rx.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lms-surface)]/95 border border-[var(--lms-border)] px-3 py-1.5 text-xs text-[var(--lms-text)] dark:bg-slate-950/85 dark:border-slate-700/70 dark:text-white shadow-lg animate-bounce"
                >
                  <ClassroomReactionIcon reactionKey={rx.emoji} className="w-4 h-4" />
                  <span className="font-medium">{rx.userName}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live Captions Overlay */}
          {(captionsEnabled || captionLines.length > 0) && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-[92%] max-w-2xl -translate-x-1/2 rounded-xl bg-slate-950/85 px-4 py-2 text-center text-xs md:text-sm text-white shadow-xl border border-slate-700/60">
              {captionLines.length === 0 ? (
                <span className="text-slate-300">Đang lắng nghe giọng nói (Phụ đề trực tiếp)...</span>
              ) : (
                captionLines.map((line) => (
                  <p key={line.id} className="leading-relaxed">
                    <span className="font-semibold text-indigo-300">{line.userName}: </span>
                    <span>{line.text}</span>
                  </p>
                ))
              )}
            </div>
          )}
        </div>

        {/* Collapsible Right Drawer (Works cleanly inside Normal, Expanded, and Native Fullscreen!) */}
        {drawerTab && (
          <aside className="flex w-full sm:w-80 xl:w-96 shrink-0 flex-col border-l border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] h-full min-h-0 overflow-hidden">
            {/* Drawer Inner Tabs */}
            <div className="flex shrink-0 items-center border-b border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/70 px-2 pt-2 gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setDrawerTab('participants')}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-t-lg px-2 py-2 font-semibold cursor-pointer ${
                  drawerTab === 'participants'
                    ? 'bg-[var(--lms-surface)] text-[var(--lms-text)] border-t border-x border-[var(--lms-border)]'
                    : 'text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>({participants.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUnreadChatCount(0);
                  setDrawerTab('chat');
                }}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-t-lg px-2 py-2 font-semibold cursor-pointer ${
                  drawerTab === 'chat'
                    ? 'bg-[var(--lms-surface)] text-[var(--lms-text)] border-t border-x border-[var(--lms-border)]'
                    : 'text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('polls')}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-t-lg px-2 py-2 font-semibold cursor-pointer ${
                  drawerTab === 'polls'
                    ? 'bg-[var(--lms-surface)] text-[var(--lms-text)] border-t border-x border-[var(--lms-border)]'
                    : 'text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Bình chọn</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('info')}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-t-lg px-2 py-2 font-semibold cursor-pointer ${
                  drawerTab === 'info'
                    ? 'bg-[var(--lms-surface)] text-[var(--lms-text)] border-t border-x border-[var(--lms-border)]'
                    : 'text-[var(--lms-text-muted)] hover:text-[var(--lms-text)]'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Thông số</span>
              </button>
            </div>

            {drawerTab === 'participants' && (
              <div className="flex flex-1 min-h-0 flex-col p-3 gap-2.5 overflow-hidden">
                <div className="relative shrink-0">
                  <Search className="w-3.5 h-3.5 text-[var(--lms-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder="Tìm tên hoặc vai trò thành viên..."
                    className="w-full rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--lms-text)] placeholder:text-[var(--lms-text-muted)] focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {canModerate && participants.length > 1 && (
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        sendJson({ type: 'moderation.mute_all' });
                        toast.info('Đã gửi lệnh tắt micro toàn bộ thành viên.');
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 px-2 py-1.5 text-[11px] font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
                    >
                      <VolumeX className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                      Tắt mic tất cả
                    </button>
                    {raisedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => sendJson({ type: 'moderation.lower_all_hands' })}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 cursor-pointer"
                      >
                        <Hand className="w-3.5 h-3.5" />
                        Hạ tất cả tay ({raisedCount})
                      </button>
                    )}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
                  {filteredParticipants.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--lms-text-muted)]">
                      Không tìm thấy thành viên phù hợp.
                    </p>
                  ) : (
                    filteredParticipants.map((p) => {
                      const isSelf = p.peerId === selfPeerId;
                      return (
                        <div
                          key={p.peerId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-semibold text-[var(--lms-text)]">
                                {p.userName}
                              </span>
                              {isSelf && <Badge variant="primary">Bạn</Badge>}
                            </div>
                            <span className="text-[11px] text-[var(--lms-text-muted)]">
                              {formatRole(p.userRole)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {p.handRaised && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                <Hand className="w-3 h-3" />
                              </span>
                            )}
                            {canModerate && !isSelf && p.mediaState.audio && (
                              <button
                                type="button"
                                onClick={() =>
                                  sendJson({ type: 'moderation.mute_peer', targetPeerId: p.peerId })
                                }
                                title={`Tắt micro của ${p.userName}`}
                                className="rounded p-1 text-red-600 hover:bg-[var(--lms-surface-muted)] dark:text-red-400 cursor-pointer"
                              >
                                <VolumeX className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {p.mediaState.audio ? (
                              <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <MicOff className="w-3.5 h-3.5 text-[var(--lms-text-muted)]" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {drawerTab === 'chat' && (
              <div className="flex flex-1 min-h-0 flex-col bg-[var(--lms-surface)] text-[var(--lms-text)]">
                <ChannelChat
                  courseId={courseId}
                  meetingId={meeting.meetingId}
                  fillParent
                  hideHeader
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
              </div>
            )}

            {drawerTab === 'polls' && (
              <RoomPollsPanel
                poll={activePoll}
                canManage={canModerate}
                myVoteIndex={myPollVoteIndex}
                onCreatePoll={(question, options) =>
                  sendJson({ type: 'poll.create', question, options })
                }
                onVote={(pollId, optionIndex) => {
                  setMyPollVote({ pollId, optionIndex });
                  sendJson({ type: 'poll.vote', pollId, optionIndex });
                }}
                onClosePoll={(pollId) => sendJson({ type: 'poll.close', pollId })}
              />
            )}

            {drawerTab === 'info' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 text-xs">
                <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--lms-text)]">
                    <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Thông tin phòng học
                  </div>
                  <p className="text-[var(--lms-text-muted)]">Chủ trì: {meeting.hostName || 'Giảng viên'}</p>
                  <p className="text-[var(--lms-text-muted)] font-mono">Mã phòng: {meeting.roomCode}</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyInvite()}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Sao chép thông tin mời vào lớp
                  </button>
                </div>

                <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--lms-text)]">
                    <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Thống kê kết nối WebRTC ({peerStats.length} peer)
                  </div>
                  {peerStats.length === 0 ? (
                    <p className="text-[var(--lms-text-muted)]">
                      Chưa có kết nối P2P nào khác ngoài bạn. Các chỉ số độ trễ sẽ hiển thị khi có thành viên khác tham gia.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {peerStats.map((st) => (
                        <div
                          key={st.peerId}
                          className="flex items-center justify-between rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5"
                        >
                          <span className="truncate font-medium text-[var(--lms-text)]">{st.userName}</span>
                          <span className="shrink-0 tabular-nums text-[11px] text-[var(--lms-text-muted)]">
                            {st.connectionState} · {st.rttMs !== null ? `${st.rttMs} ms` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 p-3 space-y-1.5">
                  <div className="font-semibold text-[var(--lms-text)] mb-1">Phím tắt nhanh</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-[var(--lms-text-muted)]">
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">M</kbd> Micro</span>
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">V</kbd> Camera</span>
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">S</kbd> Chia sẻ màn hình</span>
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">H</kbd> Giơ tay</span>
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">W</kbd> Bảng trắng</span>
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">C</kbd> Trò chuyện</span>
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">F</kbd> Tràn cửa sổ</span>
                    <span><kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface)] px-1.5 py-0.5 text-[var(--lms-text)]">Space</kbd> Nhấn để nói</span>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* 3. MS Teams Bottom Control Dock */}
      <footer className="relative z-30 flex min-h-14 shrink-0 flex-wrap lg:flex-nowrap items-center justify-between gap-2 border-t border-[var(--lms-border)] bg-[var(--lms-surface)]/95 dark:border-slate-800/90 dark:bg-slate-950/95 px-3 md:px-4 py-2">
        {/* Left hint */}
        <div className="hidden 2xl:flex shrink-0 items-center gap-2 text-[11px] text-[var(--lms-text-muted)]">
          {pushToTalkActive ? (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              Đang giữ Space để nói...
            </span>
          ) : (
            <span>
              Giữ <kbd className="rounded border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] px-1.5 py-0.5 text-[var(--lms-text)]">Space</kbd> nói nhanh · {videoQuality}
            </span>
          )}
        </div>

        {/* Center primary call dock */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mx-auto">
          <button
            type="button"
            onClick={() => void toggleMicrophone()}
            title="Bật / Tắt Micro (M)"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              mediaState.audio
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : dockNeutralBtn
            }`}
          >
            {mediaState.audio ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{mediaState.audio ? 'Tắt Mic' : 'Bật Mic'}</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleCamera()}
            title="Bật / Tắt Camera (V)"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              mediaState.video
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : dockNeutralBtn
            }`}
          >
            {mediaState.video ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{mediaState.video ? 'Tắt Cam' : 'Bật Cam'}</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            title="Chia sẻ màn hình (S)"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              mediaState.screen
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : dockNeutralBtn
            }`}
          >
            <MonitorUp className="w-4 h-4" />
            <span className="hidden md:inline">
              {mediaState.screen ? 'Dừng chia sẻ' : 'Chia sẻ'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleRaiseHand}
            title="Giơ tay phát biểu (H)"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              handRaised
                ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                : dockNeutralBtn
            }`}
          >
            <Hand className="w-4 h-4" />
            <span className="hidden md:inline">{handRaised ? 'Hạ tay' : 'Giơ tay'}</span>
          </button>

          {/* Reactions Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReactionPicker((v) => !v)}
              title="Thả biểu cảm"
              aria-label="Thả biểu cảm"
              className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
                showReactionPicker
                  ? 'bg-indigo-600 text-white'
                  : dockNeutralBtn
              }`}
            >
              <Smile className="w-4 h-4" />
            </button>
            {showReactionPicker && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 shadow-2xl">
                {CLASSROOM_REACTIONS.map((reaction) => (
                  <button
                    key={reaction.key}
                    type="button"
                    title={reaction.label}
                    aria-label={reaction.label}
                    onClick={() => sendReaction(reaction.key)}
                    className="rounded-full p-1.5 hover:scale-125 hover:bg-[var(--lms-surface-muted)] transition cursor-pointer"
                  >
                    <ClassroomReactionIcon reactionKey={reaction.key} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleLiveCaptions}
            title="Bật/tắt phụ đề trực tiếp"
            className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              captionsEnabled
                ? 'bg-indigo-600 text-white'
                : dockNeutralBtn
            }`}
          >
            <Captions className="w-4 h-4" />
            <span className="hidden xl:inline">Phụ đề</span>
          </button>

          <button
            type="button"
            onClick={toggleWhiteboardStage}
            title="Bảng vẽ cộng tác trong phòng (W)"
            className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              stageLayout === 'whiteboard'
                ? 'bg-indigo-600 text-white'
                : dockNeutralBtn
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span className="hidden xl:inline">Bảng vẽ</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleLocalRecording()}
            title={isRecording ? 'Dừng và tải video ghi hình' : 'Ghi hình buổi học cục bộ (.webm)'}
            className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              isRecording
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : dockNeutralBtn
            }`}
          >
            {isRecording ? <Square className="w-3.5 h-3.5 fill-white" /> : <Circle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />}
            <span className="hidden xl:inline">{isRecording ? 'Dừng ghi' : 'Ghi hình'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Cài đặt Micro, Camera, Loa & Nền ảo"
            aria-label="Cài đặt thiết bị và nền ảo"
            className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${dockNeutralBtn}`}
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Drawer Toggles inside dock so accessible in Fullscreen */}
          <span className="mx-0.5 h-5 w-px bg-[var(--lms-border)] hidden sm:inline-block" aria-hidden="true" />

          <button
            type="button"
            onClick={() => openDrawer('participants')}
            title="Thành viên & Điều phối (P)"
            className={`relative inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              drawerTab === 'participants'
                ? 'bg-indigo-600 text-white'
                : dockNeutralBtn
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{participants.length}</span>
            {raisedCount > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-950">
                {raisedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => openDrawer('chat')}
            title="Trò chuyện phòng (C)"
            className={`relative inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              drawerTab === 'chat'
                ? 'bg-indigo-600 text-white'
                : dockNeutralBtn
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadChatCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => openDrawer('polls')}
            title="Bình chọn nhanh"
            aria-label="Bình chọn nhanh"
            className={`relative inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
              drawerTab === 'polls'
                ? 'bg-indigo-600 text-white'
                : dockNeutralBtn
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            {activePoll?.isOpen && (
              <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowShortcuts((v) => !v);
              if (drawerTab !== 'info') setDrawerTab('info');
            }}
            title="Thông số kết nối & Phím tắt"
            aria-label="Thông số kết nối và phím tắt"
            className={`inline-flex items-center rounded-xl px-2.5 py-2 text-xs cursor-pointer transition ${
              drawerTab === 'info' || showShortcuts
                ? 'bg-indigo-600 text-white'
                : dockNeutralBtn
            }`}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Right Hangup Actions */}
        <div className="flex shrink-0 items-center gap-1.5 ml-auto lg:ml-0">
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rời phòng</span>
          </button>

          {canModerate && (
            <button
              type="button"
              disabled={ending}
              onClick={handleEnd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>{ending ? 'Đang kết thúc...' : 'Kết thúc'}</span>
            </button>
          )}
        </div>
      </footer>

      <DeviceSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        audioInputId={audioInputId}
        videoInputId={videoInputId}
        audioOutputId={audioOutputId}
        videoQuality={videoQuality}
        backgroundMode={backgroundMode}
        mirrorSelfVideo={mirrorSelfVideo}
        soundAlertsEnabled={soundAlertsEnabled}
        onApply={(next) => void handleApplyDeviceSettings(next)}
      />

      {endConfirmOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận kết thúc buổi học"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-5 text-[var(--lms-text)] shadow-2xl space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[var(--lms-text)]">Kết thúc buổi học trực tuyến?</h3>
              <p className="text-xs text-[var(--lms-text-muted)] leading-relaxed">
                Tất cả thành viên sẽ rời phòng và hệ thống sẽ chốt dữ liệu điểm danh tự động.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={ending}
                onClick={() => setEndConfirmOpen(false)}
                className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
              >
                Tiếp tục dạy
              </button>
              <button
                type="button"
                disabled={ending}
                onClick={() => void confirmAndEndMeeting()}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {ending ? 'Đang kết thúc...' : 'Kết thúc buổi học'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MeetingRoom;
