import { useCallback, useEffect, useRef, useState } from 'react';

export interface ExpandableViewResult<T extends HTMLElement> {
  /** Ref to attach to the container element that expands or enters native fullscreen. */
  containerRef: React.RefObject<T | null>;
  /** True when Focus/Theater mode (fixed full-viewport) is active. */
  isExpanded: boolean;
  /** True when native browser Fullscreen API is active on containerRef. */
  isFullscreen: boolean;
  /** True when either Focus mode or native Fullscreen is active. */
  isWide: boolean;
  toggleExpand: () => void;
  toggleFullscreen: () => Promise<void>;
  exitExpand: () => void;
}

/**
 * Shared hook enabling Focus/Theater expansion and native Browser Fullscreen
 * for learning views, virtual classroom stages, and collaborative whiteboards.
 */
export function useExpandableView<T extends HTMLElement = HTMLDivElement>(): ExpandableViewResult<T> {
  const containerRef = useRef<T | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const el = containerRef.current;
      setIsFullscreen(Boolean(el && document.fullscreenElement === el));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!isExpanded) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  const toggleExpand = useCallback(() => {
    if (document.fullscreenElement && document.fullscreenElement === containerRef.current) {
      void document.exitFullscreen().catch(() => {});
      setIsExpanded(false);
      return;
    }
    setIsExpanded((prev) => !prev);
  }, []);

  const exitExpand = useCallback(() => {
    setIsExpanded(false);
    if (document.fullscreenElement && document.fullscreenElement === containerRef.current) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    if (document.fullscreenElement === el) {
      try {
        await document.exitFullscreen();
      } catch {
        setIsFullscreen(false);
      }
      return;
    }

    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
        setIsExpanded(false);
        return;
      } catch {
        // Fallback to full-viewport Focus mode if browser blocks Fullscreen API
      }
    }
    setIsExpanded((prev) => !prev);
  }, []);

  return {
    containerRef,
    isExpanded,
    isFullscreen,
    isWide: isExpanded || isFullscreen,
    toggleExpand,
    toggleFullscreen,
    exitExpand,
  };
}
