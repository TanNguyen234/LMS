import { useEffect, useRef, useState } from 'react';
import {
  Award,
  Flame,
  Hand,
  Heart,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Pin,
  Smile,
  Sparkles,
  ThumbsUp,
  VolumeX,
} from 'lucide-react';
import type { MeetingPresenceParticipant } from '../../api/realtime';
import { formatRole } from '../../utils/formatters';

export function ClassroomReactionIcon({
  reactionKey,
  className = 'w-4 h-4',
}: {
  reactionKey: string;
  className?: string;
}) {
  switch (reactionKey) {
    case 'heart':
      return <Heart className={`${className} text-rose-400`} aria-hidden="true" />;
    case 'clap':
      return <Award className={`${className} text-amber-400`} aria-hidden="true" />;
    case 'smile':
      return <Smile className={`${className} text-emerald-400`} aria-hidden="true" />;
    case 'wow':
      return <Sparkles className={`${className} text-violet-400`} aria-hidden="true" />;
    case 'flame':
      return <Flame className={`${className} text-orange-400`} aria-hidden="true" />;
    case 'like':
    default:
      return <ThumbsUp className={`${className} text-sky-400`} aria-hidden="true" />;
  }
}

export interface StageVideoTileProps {
  participant: MeetingPresenceParticipant;
  stream: MediaStream | null;
  isSelf: boolean;
  isSpotlight?: boolean;
  isThumbStrip?: boolean;
  isSpeaking?: boolean;
  mirrorSelf?: boolean;
  audioOutputId?: string;
  recentEmoji?: string | null;
  canModerate?: boolean;
  onToggleSpotlight?: () => void;
  onMutePeer?: () => void;
}

export function StageVideoTile({
  participant,
  stream,
  isSelf,
  isSpotlight = false,
  isThumbStrip = false,
  isSpeaking = false,
  mirrorSelf = true,
  audioOutputId = '',
  recentEmoji = null,
  canModerate = false,
  onToggleSpotlight,
  onMutePeer,
}: StageVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [fitContain, setFitContain] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const el = videoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el || isSelf || !audioOutputId || typeof el.setSinkId !== 'function') return;
    void el.setSinkId(audioOutputId).catch(() => {});
  }, [audioOutputId, isSelf, stream]);

  const hasVideoTrack = Boolean(
    stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
  );
  const showVideo = hasVideoTrack || participant.mediaState.video || participant.mediaState.screen;
  const shouldContain = participant.mediaState.screen || fitContain;
  const shouldMirror = isSelf && mirrorSelf && !participant.mediaState.screen;

  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-slate-900 text-white shadow-sm transition-all ${
        isSpeaking
          ? 'border-emerald-400 ring-2 ring-emerald-400/50'
          : participant.handRaised
            ? 'border-amber-400/80 ring-1 ring-amber-400/40'
            : 'border-slate-700/80'
      } ${
        isThumbStrip
          ? 'h-28 w-48 shrink-0 lg:h-32 lg:w-full'
          : 'h-full w-full min-h-[180px]'
      }`}
    >
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className={`absolute inset-0 h-full w-full ${
            shouldContain ? 'object-contain bg-black' : 'object-cover'
          } ${shouldMirror ? '-scale-x-100' : ''} ${
            showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}

      {!showVideo && (
        <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
          <div
            className={`flex items-center justify-center rounded-full border font-bold text-indigo-100 ${
              isThumbStrip
                ? 'h-10 w-10 text-sm bg-indigo-600/30 border-indigo-400/40'
                : 'h-16 w-16 md:h-20 md:w-20 text-xl md:text-2xl bg-indigo-600/30 border-indigo-400/40'
            } ${isSpeaking ? 'ring-4 ring-emerald-400/40 animate-pulse' : ''}`}
          >
            {participant.userName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Top Overlay Badges & Hover Actions */}
      <div className="relative z-10 flex items-start justify-between gap-2 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {participant.handRaised && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-950 shadow">
              <Hand className="w-3 h-3" />
              Giơ tay
            </span>
          )}
          {participant.mediaState.screen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white shadow">
              <MonitorUp className="w-3 h-3" />
              Chia sẻ màn hình
            </span>
          )}
          {recentEmoji && (
            <span className="inline-flex items-center justify-center rounded-full bg-slate-950/85 p-1.5 shadow-lg animate-bounce">
              <ClassroomReactionIcon reactionKey={recentEmoji} className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {showVideo && (
            <button
              type="button"
              onClick={() => setFitContain((v) => !v)}
              title={shouldContain ? 'Phóng đầy khung hình' : 'Hiển thị trọn vẹn không cắt viền'}
              aria-label="Chuyển tỷ lệ khung hình video"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-full bg-slate-950/75 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            >
              {shouldContain ? 'Đầy khung' : 'Vừa khung'}
            </button>
          )}
          {canModerate && !isSelf && participant.mediaState.audio && onMutePeer && (
            <button
              type="button"
              onClick={onMutePeer}
              title={`Tắt micro của ${participant.userName}`}
              aria-label={`Tắt micro của ${participant.userName}`}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-full bg-red-600/85 p-1.5 text-white hover:bg-red-600 transition cursor-pointer"
            >
              <VolumeX className="w-3.5 h-3.5" />
            </button>
          )}
          {onToggleSpotlight && (
            <button
              type="button"
              onClick={onToggleSpotlight}
              title={isSpotlight ? 'Bỏ ghim tiêu điểm' : 'Ghim lên màn hình chính'}
              aria-label={isSpotlight ? 'Bỏ ghim tiêu điểm' : 'Ghim lên màn hình chính'}
              className={`rounded-full p-1.5 transition cursor-pointer ${
                isSpotlight
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950/75 text-slate-200 hover:bg-indigo-600 hover:text-white'
              }`}
            >
              {isSpotlight ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Pin className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bottom Nameplate */}
      <div className="relative z-10 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-950/90 via-slate-950/65 to-transparent px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
              participant.mediaState.audio
                ? isSpeaking
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900/90 text-emerald-400'
                : 'bg-slate-900/90 text-slate-400'
            }`}
          >
            {participant.mediaState.audio ? (
              <Mic className="w-3 h-3" />
            ) : (
              <MicOff className="w-3 h-3" />
            )}
          </span>
          <span className="truncate font-medium">
            {participant.userName} {isSelf ? '(Bạn)' : ''}
          </span>
        </div>
        {!isThumbStrip && (
          <span className="shrink-0 text-[11px] text-slate-300">
            {formatRole(participant.userRole)}
          </span>
        )}
      </div>
    </div>
  );
}
