import { useEffect, useRef } from 'react';

export interface SafeHtmlProps {
  html?: string | null;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'span';
}

interface SanitizerCapableElement extends HTMLElement {
  setHTML?: (input: string) => void;
}

export function SafeHtml({ html, className = '', as = 'div' }: SafeHtmlProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current as SanitizerCapableElement | null;
    if (!el) return;

    const raw = html ?? '';
    if (!raw) {
      el.textContent = '';
      return;
    }

    if (typeof el.setHTML === 'function') {
      el.setHTML(raw);
      return;
    }

    let cancelled = false;
    void import('dompurify').then(({ default: DOMPurify }) => {
      if (cancelled || !ref.current) return;
      const sanitized = DOMPurify.sanitize(raw, {
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
        KEEP_CONTENT: false,
      });
      ref.current.innerHTML = sanitized;
    });

    return () => {
      cancelled = true;
    };
  }, [html]);

  const Tag = as;
  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={`lms-rich-content ${className}`.trim()}
    />
  );
}

export default SafeHtml;
