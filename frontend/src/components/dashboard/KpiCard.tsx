import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export type KpiAccent = 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose';

const ACCENT_STYLES: Record<KpiAccent, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

export interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accent?: KpiAccent;
  to?: string;
  badge?: React.ReactNode;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtitle,
  icon: Icon,
  accent = 'blue',
  to,
  badge,
}) => {
  const cardBody = (
    <div className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs hover:border-blue-500/40 transition h-full flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ACCENT_STYLES[accent]}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-1.5">
          {badge}
          {to && (
            <ArrowUpRight
              className="w-4 h-4 text-[var(--lms-text-muted)] group-hover:text-[var(--color-primary)] transition"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-2xl font-bold tracking-tight text-[var(--lms-text)] tabular-nums">
          {value}
        </div>
        <div className="text-sm font-medium text-[var(--lms-text)] mt-0.5">{label}</div>
        {subtitle && (
          <div className="text-xs text-[var(--lms-text-muted)] mt-1">{subtitle}</div>
        )}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-2xl">
        {cardBody}
      </Link>
    );
  }

  return cardBody;
};
