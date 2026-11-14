import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  idPrefix?: string;
  className?: string;
}

export function Tabs({
  items,
  activeId,
  onChange,
  ariaLabel = 'Điều hướng thẻ',
  idPrefix = 'lms-tab',
  className = '',
}: TabsProps) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusAndSelect = (targetId: string) => {
    onChange(targetId);
    buttonRefs.current[targetId]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentId: string) => {
    const enabledItems = items.filter((item) => !item.disabled);
    if (enabledItems.length === 0) return;

    const currentIndex = enabledItems.findIndex((item) => item.id === currentId);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % enabledItems.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = enabledItems.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      focusAndSelect(enabledItems[nextIndex].id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center gap-1 border-b border-[var(--lms-border)] pb-px ${className}`.trim()}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(el) => {
              buttonRefs.current[item.id] = el;
            }}
            id={`${idPrefix}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              if (!item.disabled) {
                onChange(item.id);
              }
            }}
            onKeyDown={(event) => handleKeyDown(event, item.id)}
            className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isActive
                ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-[var(--lms-text-muted)] hover:border-[var(--lms-border)] hover:text-[var(--lms-text)]'
            } ${item.disabled ? 'cursor-not-allowed opacity-45' : ''}`.trim()}
          >
            {item.icon && <span className="shrink-0" aria-hidden="true">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span className="rounded-full bg-[var(--lms-surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--lms-text)]">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  activeId: string;
  idPrefix?: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({
  id,
  activeId,
  idPrefix = 'lms-tab',
  children,
  className = '',
}: TabPanelProps) {
  if (id !== activeId) {
    return null;
  }

  return (
    <div
      id={`${idPrefix}-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}

export default Tabs;
