export type BackgroundEffectMode = 'none' | 'blur-light' | 'blur-strong' | 'studio-gradient';

export type VideoQualityPreset = '360p' | '720p' | '1080p';

export interface VideoQualitySpec {
  label: string;
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}

export const VIDEO_QUALITY_PRESETS: Record<VideoQualityPreset, VideoQualitySpec> = {
  '360p': {
    label: 'Tiết kiệm băng thông (360p)',
    width: 640,
    height: 360,
    frameRate: 24,
    maxBitrate: 450_000,
  },
  '720p': {
    label: 'Tiêu chuẩn HD (720p)',
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 1_500_000,
  },
  '1080p': {
    label: 'Chất lượng cao Full HD (1080p)',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 2_800_000,
  },
};

export interface ProcessedTrackHandle {
  track: MediaStreamTrack;
  cleanup: () => void;
}

/**
 * Wraps a raw camera MediaStreamTrack with a lightweight Canvas effect pipeline
 * (background blur vignette or studio backdrop) without external dependencies.
 */
export function createBackgroundEffectTrack(
  rawTrack: MediaStreamTrack,
  mode: BackgroundEffectMode,
  options: { mirror?: boolean } = {}
): ProcessedTrackHandle {
  if (mode === 'none') {
    return {
      track: rawTrack,
      cleanup: () => {
        rawTrack.stop();
      },
    };
  }

  const settings = rawTrack.getSettings();
  const width = Math.min(1280, Math.max(480, settings.width || 640));
  const height = Math.min(720, Math.max(360, settings.height || 360));

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([rawTrack]);
  void video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  let rafId = 0;
  let stopped = false;

  const drawFrame = () => {
    if (stopped || !ctx) return;

    if (video.readyState >= 2) {
      ctx.save();
      if (options.mirror) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      if (mode === 'studio-gradient') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1e1b4b');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.save();
        ctx.filter = mode === 'blur-strong' ? 'blur(16px)' : 'blur(8px)';
        ctx.drawImage(video, -16, -16, width + 32, height + 32);
        ctx.restore();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
        ctx.fillRect(0, 0, width, height);
      }

      // Crisp focus oval in the center/foreground where the speaker sits
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        width * 0.5,
        height * 0.56,
        width * 0.34,
        height * 0.44,
        0,
        0,
        Math.PI * 2
      );
      ctx.clip();
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();

      ctx.restore();
    }

    rafId = window.requestAnimationFrame(drawFrame);
  };

  rafId = window.requestAnimationFrame(drawFrame);

  const outputStream = canvas.captureStream(24);
  const processedTrack = outputStream.getVideoTracks()[0];

  return {
    track: processedTrack || rawTrack,
    cleanup: () => {
      stopped = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (processedTrack && processedTrack !== rawTrack) {
        processedTrack.stop();
      }
      rawTrack.stop();
      video.srcObject = null;
    },
  };
}

/**
 * Formats seconds into HH:MM:SS or MM:SS call duration string.
 */
export function formatElapsedSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
