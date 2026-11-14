import type { ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  primary: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800/70',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800/70',
  warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/70',
  danger: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800/70',
  info: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800/70',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-500',
  primary: 'bg-blue-600 dark:bg-blue-400',
  success: 'bg-emerald-600 dark:bg-emerald-400',
  warning: 'bg-amber-600 dark:bg-amber-400',
  danger: 'bg-red-600 dark:bg-red-400',
  info: 'bg-sky-600 dark:bg-sky-400',
};

export function Badge({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  children,
  className = '',
}: BadgeProps) {
  const sizeClass = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium leading-4 ${sizeClass} ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[variant]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

export default Badge;
