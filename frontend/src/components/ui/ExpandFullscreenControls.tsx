import React from 'react';
import { Expand, Maximize2, Minimize2, Shrink } from 'lucide-react';

export interface ExpandFullscreenControlsProps {
  isExpanded: boolean;
  isFullscreen: boolean;
  onToggleExpand: () => void;
  onToggleFullscreen: () => void;
  darkSurface?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
}

/**
 * Reusable pair of Focus-expand and native Fullscreen toggle buttons.
 */
export const ExpandFullscreenControls: React.FC<ExpandFullscreenControlsProps> = ({
  isExpanded,
  isFullscreen,
  onToggleExpand,
  onToggleFullscreen,
  darkSurface = false,
  expandLabel = 'Mở rộng',
  collapseLabel = 'Thu nhỏ',
}) => {
  const baseBtn = darkSurface
    ? 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
    : 'border-[var(--lms-border)] bg-[var(--lms-surface)] text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]';

  const activeBtn = 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700';

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-pressed={isExpanded}
        title={isExpanded ? 'Thu nhỏ khung làm việc (Esc)' : 'Mở rộng tràn cửa sổ trình duyệt'}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
          isExpanded ? activeBtn : baseBtn
        }`}
      >
        {isExpanded ? <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />}
        <span>{isExpanded ? collapseLabel : expandLabel}</span>
      </button>

      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-pressed={isFullscreen}
        title={isFullscreen ? 'Thoát toàn màn hình (Esc)' : 'Phóng to toàn màn hình'}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
          isFullscreen ? activeBtn : baseBtn
        }`}
      >
        {isFullscreen ? <Shrink className="w-3.5 h-3.5" aria-hidden="true" /> : <Expand className="w-3.5 h-3.5" aria-hidden="true" />}
        <span>{isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}</span>
      </button>
    </div>
  );
};
