import React, { useRef, useState, useEffect } from 'react';
import { Pen, Eraser, Trash2, Download, Palette, Undo } from 'lucide-react';

interface WhiteboardCanvasProps {
  courseTitle?: string;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({ courseTitle }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#2563EB'); // default blue
  const [lineWidth, setLineWidth] = useState(3);
  const [history, setHistory] = useState<ImageData[]>([]);

  const colors = [
    '#000000', // Black
    '#2563EB', // Blue
    '#DC2626', // Red
    '#16A34A', // Green
    '#D97706', // Amber
    '#9333EA', // Purple
  ];

  // Resize canvas to fill container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      // Save current content before resize
      const ctx = canvas.getContext('2d');
      let imgData: ImageData | null = null;
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(rect.width, 800);
      canvas.height = Math.max(rect.height, 500);

      // Re-fill background white
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (imgData) {
          ctx.putImageData(imgData, 0, 0);
        }
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-15), data]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = [...history];
    const previous = newHistory.pop();
    setHistory(newHistory);
    if (previous) {
      ctx.putImageData(previous, 0, 0);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveState();
    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 4 : lineWidth;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.closePath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveState();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const safeTitle = courseTitle ? `${courseTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}-` : '';
    link.download = `whiteboard-${safeTitle}${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Top Toolbar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTool('pen')}
            className={`p-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-all ${
              tool === 'pen'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
            title="Bút vẽ"
          >
            <Pen className="w-4 h-4" />
            <span>Bút vẽ</span>
          </button>

          <button
            onClick={() => setTool('eraser')}
            className={`p-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-all ${
              tool === 'eraser'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
            title="Tẩy xóa"
          >
            <Eraser className="w-4 h-4" />
            <span>Tẩy</span>
          </button>

          {/* Color palette */}
          {tool === 'pen' && (
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200">
              <Palette className="w-4 h-4 text-slate-400 mr-1" />
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-offset-2 ring-indigo-500' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          )}

          {/* Line width */}
          <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-200 text-xs text-slate-600">
            <span>Nét:</span>
            <input
              type="range"
              min="1"
              max="15"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-20 accent-indigo-600"
            />
            <span className="w-4">{lineWidth}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-sm flex items-center gap-1"
            title="Hoàn tác (Undo)"
          >
            <Undo className="w-4 h-4" />
            <span className="hidden sm:inline">Hoàn tác</span>
          </button>

          <button
            onClick={clearCanvas}
            className="p-2 text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg text-sm flex items-center gap-1"
            title="Xóa trắng bảng"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Xóa bảng</span>
          </button>

          <button
            onClick={downloadCanvas}
            className="p-2 text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg text-sm flex items-center gap-1"
            title="Tải ảnh về máy"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Tải ảnh</span>
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div ref={containerRef} className="flex-1 w-full h-full relative cursor-crosshair overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 block touch-none"
        />
      </div>
    </div>
  );
};
