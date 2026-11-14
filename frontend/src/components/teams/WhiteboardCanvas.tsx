import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eraser,
  Highlighter,
  PenTool,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { ApiError } from '../../api/http';
import {
  getCourseWhiteboard,
  saveCourseWhiteboard,
  type WhiteboardOp,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from '../../api/realtime';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

export interface WhiteboardOpEvent {
  seq: number;
  op: WhiteboardOp;
  userId?: string;
  userName?: string;
}

export interface WhiteboardCanvasProps {
  courseId: string;
  meetingId?: string;
  isVisible?: boolean;
  externalOpEvent?: WhiteboardOpEvent | null;
  externalSnapshotJson?: string | null;
  onSendOp?: (op: WhiteboardOp) => boolean;
}

const PALETTE_COLORS = [
  { hex: '#0f172a', label: 'Đen đậm' },
  { hex: '#2563eb', label: 'Xanh dương' },
  { hex: '#dc2626', label: 'Đỏ' },
  { hex: '#059669', label: 'Xanh lục' },
  { hex: '#d97706', label: 'Cam hổ phách' },
  { hex: '#7c3aed', label: 'Tím' },
];

function applyWhiteboardOp(
  prev: WhiteboardStroke[],
  op: WhiteboardOp,
  actorUserId?: string
): WhiteboardStroke[] {
  if (op.action === 'add') {
    if (prev.some((s) => s.id === op.stroke.id)) return prev;
    return [...prev, op.stroke];
  }
  if (op.action === 'remove' || op.action === 'delete') {
    return prev.filter((s) => s.id !== op.strokeId);
  }
  if (op.action === 'undo') {
    if (op.strokeId) {
      return prev.filter((s) => s.id !== op.strokeId);
    }
    if (!actorUserId) return prev;
    for (let i = prev.length - 1; i >= 0; i -= 1) {
      if (prev[i].authorId === actorUserId) {
        return [...prev.slice(0, i), ...prev.slice(i + 1)];
      }
    }
    return prev;
  }
  if (op.action === 'clear') {
    return [];
  }
  if (op.action === 'replace') {
    return Array.isArray(op.strokes) ? op.strokes : prev;
  }
  return prev;
}

function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: WhiteboardStroke[],
  width: number,
  height: number
) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const scaleFactor = Math.max(0.75, Math.min(2, width / 960));

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const tool = stroke.tool ?? 'pen';
    if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(8, stroke.width * 2.6) * scaleFactor;
    } else if (tool === 'highlighter') {
      ctx.strokeStyle = stroke.color || '#d97706';
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = Math.max(8, stroke.width * 3.2) * scaleFactor;
    } else {
      ctx.strokeStyle = stroke.color || '#0f172a';
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1.5, stroke.width) * scaleFactor;
    }

    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x * width, first.y * height);

    if (stroke.points.length === 1) {
      ctx.lineTo(first.x * width + 0.01, first.y * height + 0.01);
    } else {
      for (let i = 1; i < stroke.points.length; i += 1) {
        const pt = stroke.points[i];
        ctx.lineTo(pt.x * width, pt.y * height);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function WhiteboardCanvas({
  courseId,
  meetingId,
  isVisible = true,
  externalOpEvent = null,
  externalSnapshotJson = null,
  onSendOp,
}: WhiteboardCanvasProps) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const widthInputId = useId();

  const currentUserId = String(user?.userId ?? user?.id ?? '');
  const currentUserName = user?.fullName ?? user?.full_name ?? 'Thành viên';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef<{ width: number; height: number }>({ width: 800, height: 450 });
  const activeStrokeRef = useRef<WhiteboardStroke | null>(null);
  const lastSeqRef = useRef<number>(-1);
  const strokesRef = useRef<WhiteboardStroke[]>([]);

  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [loadedCourseId, setLoadedCourseId] = useState<string>('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState<string>('#2563eb');
  const [lineWidth, setLineWidth] = useState<number>(3);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const loadingSnapshot = loadedCourseId !== courseId;

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const paint = useCallback(
    (draftStroke?: WhiteboardStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = sizeRef.current;
      if (width <= 0 || height <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.floor(width * dpr));
      const targetH = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const list = draftStroke ? [...strokesRef.current, draftStroke] : strokesRef.current;
      renderStrokes(ctx, list, width, height);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getCourseWhiteboard(courseId);
        if (cancelled) return;
        const parsed = JSON.parse(snap.strokesJson || '[]');
        if (Array.isArray(parsed)) {
          setStrokes(parsed);
          strokesRef.current = parsed;
          paint();
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.detail : 'Không thể tải dữ liệu bảng vẽ.');
        }
      } finally {
        if (!cancelled) {
          setLoadedCourseId(courseId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, paint, toast, refreshTick]);

  // Apply external full snapshot broadcast asynchronously to avoid sync setState in effect
  useEffect(() => {
    if (!externalSnapshotJson) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const parsed = JSON.parse(externalSnapshotJson);
        if (Array.isArray(parsed)) {
          setStrokes(parsed);
          strokesRef.current = parsed;
          paint(activeStrokeRef.current);
        }
      } catch {
        // ignore malformed snapshot
      }
    });
    return () => {
      cancelled = true;
    };
  }, [externalSnapshotJson, paint]);

  // Apply external incremental whiteboard.op
  useEffect(() => {
    if (!externalOpEvent || externalOpEvent.seq === lastSeqRef.current) return;
    lastSeqRef.current = externalOpEvent.seq;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setStrokes((prev) => {
        const next = applyWhiteboardOp(prev, externalOpEvent.op, externalOpEvent.userId);
        strokesRef.current = next;
        paint(activeStrokeRef.current);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [externalOpEvent, paint]);

  // ResizeObserver keeps DPR crisp & preserves drawings across layout/tab visibility changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        sizeRef.current = { width: rect.width, height: rect.height };
        paint(activeStrokeRef.current);
      }
    };

    updateSize();
    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [paint, isVisible]);

  useEffect(() => {
    if (isVisible) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        sizeRef.current = { width: rect.width, height: rect.height };
      }
      paint(activeStrokeRef.current);
    }
  }, [isVisible, strokes, paint]);

  const persistSnapshotFallback = useCallback(
    async (nextStrokes: WhiteboardStroke[], showFeedback = false) => {
      try {
        setSavingSnapshot(true);
        await saveCourseWhiteboard(courseId, {
          meetingId,
          strokesJson: JSON.stringify(nextStrokes),
        });
        if (showFeedback) {
          toast.success('Đã lưu bản chụp bảng vẽ.');
        }
      } catch (err) {
        if (showFeedback) {
          toast.error(err instanceof ApiError ? err.detail : 'Không thể lưu bảng vẽ.');
        }
      } finally {
        setSavingSnapshot(false);
      }
    },
    [courseId, meetingId, toast]
  );

  const dispatchOp = useCallback(
    (op: WhiteboardOp) => {
      const next = applyWhiteboardOp(strokesRef.current, op, currentUserId);
      strokesRef.current = next;
      setStrokes(next);
      paint();

      const sentRealtime = onSendOp ? onSendOp(op) : false;
      if (!sentRealtime) {
        void persistSnapshotFallback(next, false);
      }
    },
    [currentUserId, onSendOp, paint, persistSnapshotFallback]
  );

  const normalizePointer = (e: React.PointerEvent<HTMLCanvasElement>): WhiteboardPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return {
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const pt = normalizePointer(e);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const strokeId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const draft: WhiteboardStroke = {
      id: strokeId,
      color,
      width: lineWidth,
      tool,
      points: [pt],
      authorId: currentUserId || undefined,
      authorName: currentUserName,
    };
    activeStrokeRef.current = draft;
    paint(draft);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active) return;
    const pt = normalizePointer(e);
    if (!pt) return;

    const lastPt = active.points[active.points.length - 1];
    if (lastPt && Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) < 0.0025) return;

    active.points.push(pt);
    paint(active);
  };

  const finalizeStroke = () => {
    const active = activeStrokeRef.current;
    if (!active) return;
    activeStrokeRef.current = null;
    dispatchOp({ action: 'add', stroke: active });
  };

  const myLastStroke = useMemo(() => {
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      if (strokes[i].authorId === currentUserId) {
        return strokes[i];
      }
    }
    return null;
  }, [strokes, currentUserId]);

  const handleUndo = () => {
    if (!myLastStroke) return;
    dispatchOp({ action: 'undo', strokeId: myLastStroke.id });
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: 'Xóa toàn bộ bảng vẽ?',
      message: 'Toàn bộ nét vẽ hiện tại sẽ bị xóa khỏi bảng chung của lớp học.',
      confirmText: 'Xóa bảng vẽ',
      cancelText: 'Giữ lại',
      variant: 'danger',
    });
    if (!ok) return;
    dispatchOp({ action: 'clear' });
  };

  const handleExportPng = () => {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1600;
    exportCanvas.height = 900;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;
    renderStrokes(ctx, strokesRef.current, exportCanvas.width, exportCanvas.height);

    const url = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `bang-ve-${courseId.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <section
      className="flex flex-col rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] shadow-sm overflow-hidden"
      aria-label="Bảng vẽ vector cộng tác"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--lms-border)] bg-[var(--lms-surface-muted)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border cursor-pointer ${
              tool === 'pen'
                ? 'border-[var(--lms-primary)] bg-[var(--lms-primary)] text-white'
                : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            Bút vẽ
          </button>

          <button
            type="button"
            onClick={() => setTool('highlighter')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border cursor-pointer ${
              tool === 'highlighter'
                ? 'border-[var(--lms-primary)] bg-[var(--lms-primary)] text-white'
                : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
            Đánh dấu
          </button>

          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border cursor-pointer ${
              tool === 'eraser'
                ? 'border-[var(--lms-primary)] bg-[var(--lms-primary)] text-white'
                : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            Tẩy
          </button>

          <span className="mx-1 h-5 w-px bg-[var(--lms-border)] hidden sm:inline-block" aria-hidden="true" />

          <div className="flex items-center gap-1.5" role="group" aria-label="Bảng màu bút">
            {PALETTE_COLORS.map((item) => (
              <button
                key={item.hex}
                type="button"
                onClick={() => {
                  setColor(item.hex);
                  if (tool === 'eraser') setTool('pen');
                }}
                aria-label={item.label}
                title={item.label}
                className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                  color === item.hex && tool !== 'eraser'
                    ? 'scale-110 border-[var(--lms-primary)] ring-2 ring-[var(--lms-primary)]/30'
                    : 'border-white shadow-sm hover:scale-105'
                }`}
                style={{ backgroundColor: item.hex }}
              />
            ))}
          </div>

          <span className="mx-1 h-5 w-px bg-[var(--lms-border)] hidden sm:inline-block" aria-hidden="true" />

          <div className="flex items-center gap-2">
            <label htmlFor={widthInputId} className="text-xs text-[var(--lms-text-secondary)]">
              Cỡ nét ({lineWidth})
            </label>
            <input
              id={widthInputId}
              type="range"
              min={1}
              max={10}
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-20 accent-[var(--lms-primary)] cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!myLastStroke}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-45 cursor-pointer"
            title="Hoàn tác nét vẽ gần nhất của bạn"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Hoàn tác
          </button>

          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={strokes.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-45 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa bảng
          </button>

          <button
            type="button"
            onClick={() => void persistSnapshotFallback(strokesRef.current, true)}
            disabled={savingSnapshot}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSnapshot ? 'Đang lưu...' : 'Lưu'}
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất PNG
          </button>

          <button
            type="button"
            onClick={() => {
              setLoadedCourseId('');
              setRefreshTick((n) => n + 1);
            }}
            disabled={loadingSnapshot}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2 py-1.5 text-xs text-[var(--lms-text-secondary)] hover:text-[var(--lms-text)] cursor-pointer"
            title="Đồng bộ lại từ máy chủ"
            aria-label="Tải lại bảng vẽ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSnapshot ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full min-h-[380px] md:min-h-[480px] bg-white select-none"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finalizeStroke}
          onPointerCancel={finalizeStroke}
          style={{ touchAction: 'none' }}
          className="block w-full h-full cursor-crosshair"
        />

        {loadingSnapshot && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-medium text-slate-600">
            Đang đồng bộ bảng vẽ...
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--lms-border)] bg-[var(--lms-surface-muted)] text-xs text-[var(--lms-text-secondary)]">
        <span>Số nét vẽ trên bảng: {strokes.length}</span>
        <span>Chuẩn vector tỷ lệ khung hình (đồng bộ theo thời gian thực)</span>
      </footer>
    </section>
  );
}

export default WhiteboardCanvas;
