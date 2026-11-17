import React, { useEffect, useState } from 'react';
import { Camera, Mic, Sparkles, Volume2, X } from 'lucide-react';
import {
  VIDEO_QUALITY_PRESETS,
  type BackgroundEffectMode,
  type VideoQualityPreset,
} from '../../utils/classroomMedia';

export interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioInputId: string;
  videoInputId: string;
  audioOutputId: string;
  videoQuality: VideoQualityPreset;
  backgroundMode: BackgroundEffectMode;
  mirrorSelfVideo: boolean;
  soundAlertsEnabled: boolean;
  onApply: (next: {
    audioInputId: string;
    videoInputId: string;
    audioOutputId: string;
    videoQuality: VideoQualityPreset;
    backgroundMode: BackgroundEffectMode;
    mirrorSelfVideo: boolean;
    soundAlertsEnabled: boolean;
  }) => void;
}

const BG_OPTIONS: Array<{ id: BackgroundEffectMode; label: string; desc: string }> = [
  { id: 'none', label: 'Nền gốc', desc: 'Hiển thị trực tiếp từ camera' },
  { id: 'blur-light', label: 'Làm mờ nhẹ', desc: 'Làm dịu hậu cảnh phía sau' },
  { id: 'blur-strong', label: 'Làm mờ mạnh', desc: 'Tập trung tối đa vào người nói' },
  { id: 'studio-gradient', label: 'Phòng thu LMS', desc: 'Hậu cảnh tối chuyên nghiệp' },
];

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
  audioInputId,
  videoInputId,
  audioOutputId,
  videoQuality,
  backgroundMode,
  mirrorSelfVideo,
  soundAlertsEnabled,
  onApply,
}) => {
  if (!isOpen) return null;

  return (
    <DeviceSettingsDialogBody
      onClose={onClose}
      audioInputId={audioInputId}
      videoInputId={videoInputId}
      audioOutputId={audioOutputId}
      videoQuality={videoQuality}
      backgroundMode={backgroundMode}
      mirrorSelfVideo={mirrorSelfVideo}
      soundAlertsEnabled={soundAlertsEnabled}
      onApply={onApply}
    />
  );
};

const DeviceSettingsDialogBody: React.FC<Omit<DeviceSettingsModalProps, 'isOpen'>> = ({
  onClose,
  audioInputId,
  videoInputId,
  audioOutputId,
  videoQuality,
  backgroundMode,
  mirrorSelfVideo,
  soundAlertsEnabled,
  onApply,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [draftAudioIn, setDraftAudioIn] = useState(audioInputId);
  const [draftVideoIn, setDraftVideoIn] = useState(videoInputId);
  const [draftAudioOut, setDraftAudioOut] = useState(audioOutputId);
  const [draftQuality, setDraftQuality] = useState<VideoQualityPreset>(videoQuality);
  const [draftBg, setDraftBg] = useState<BackgroundEffectMode>(backgroundMode);
  const [draftMirror, setDraftMirror] = useState(mirrorSelfVideo);
  const [draftSoundAlerts, setDraftSoundAlerts] = useState(soundAlertsEnabled);

  useEffect(() => {
    let active = true;
    if (navigator.mediaDevices?.enumerateDevices) {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (active) setDevices(list);
        })
        .catch(() => {
          if (active) setDevices([]);
        });
    }
    return () => {
      active = false;
    };
  }, []);

  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');
  const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      audioInputId: draftAudioIn,
      videoInputId: draftVideoIn,
      audioOutputId: draftAudioOut,
      videoQuality: draftQuality,
      backgroundMode: draftBg,
      mirrorSelfVideo: draftMirror,
      soundAlertsEnabled: draftSoundAlerts,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt thiết bị và hiệu ứng"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <h3 className="text-sm font-bold">Cài đặt âm thanh, hình ảnh &amp; nền ảo</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cài đặt"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-200">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Micro thu âm
            </label>
            <select
              value={draftAudioIn}
              onChange={(e) => setDraftAudioIn(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            >
              <option value="">Thiết bị mặc định của hệ thống</option>
              {audioInputs.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Micro ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-200">
              <Camera className="w-3.5 h-3.5 text-blue-400" />
              Camera
            </label>
            <select
              value={draftVideoIn}
              onChange={(e) => setDraftVideoIn(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            >
              <option value="">Camera mặc định</option>
              {videoInputs.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>

          {audioOutputs.length > 0 && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-200">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                Loa / Tai nghe phát âm
              </label>
              <select
                value={draftAudioOut}
                onChange={(e) => setDraftAudioOut(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              >
                <option value="">Loa mặc định của trình duyệt</option>
                {audioOutputs.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Loa ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block font-semibold text-slate-200">
              Chất lượng truyền tải video
            </label>
            <select
              value={draftQuality}
              onChange={(e) => setDraftQuality(e.target.value as VideoQualityPreset)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
            >
              {(Object.keys(VIDEO_QUALITY_PRESETS) as VideoQualityPreset[]).map((key) => (
                <option key={key} value={key}>
                  {VIDEO_QUALITY_PRESETS[key].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Hiệu ứng nền ảo (tự xử lý cục bộ)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {BG_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraftBg(opt.id)}
                  className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                    draftBg === opt.id
                      ? 'border-indigo-500 bg-indigo-600/20 text-white'
                      : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-slate-200">Lật gương camera của tôi (Self-view)</span>
              <input
                type="checkbox"
                checked={draftMirror}
                onChange={(e) => setDraftMirror(e.target.checked)}
                className="accent-indigo-500"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-slate-200">Âm báo khi có người giơ tay hoặc tin mới</span>
              <input
                type="checkbox"
                checked={draftSoundAlerts}
                onChange={(e) => setDraftSoundAlerts(e.target.checked)}
                className="accent-indigo-500"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Áp dụng cài đặt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
