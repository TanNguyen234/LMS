import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, UserCheck } from 'lucide-react';
import type { User } from '../../types';

export interface LecturerComboboxProps {
  lecturers: User[];
  value: string;
  onChange: (lecturerId: string) => void;
  courseCountByLecturer?: Record<string, number>;
  label?: string;
  required?: boolean;
}

/**
 * Searchable lecturer selector designed for large faculties (filters by StaffCode, full name, or email).
 */
export const LecturerCombobox: React.FC<LecturerComboboxProps> = ({
  lecturers,
  value,
  onChange,
  courseCountByLecturer = {},
  label = 'Phân công giảng viên',
  required = false,
}) => {
  const inputId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLecturer = useMemo(
    () => lecturers.find((l) => String(l.userId ?? l.id) === value) ?? null,
    [lecturers, value],
  );

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lecturers;
    return lecturers.filter((l) => {
      const name = (l.fullName ?? l.full_name ?? '').toLowerCase();
      const email = (l.email ?? '').toLowerCase();
      const staff = (l.staffCode ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || staff.includes(q);
    });
  }, [lecturers, query]);

  const selectedLabel = selectedLecturer
    ? `${selectedLecturer.staffCode ? `[${selectedLecturer.staffCode}] ` : ''}${selectedLecturer.fullName ?? selectedLecturer.full_name} (${selectedLecturer.email})`
    : '-- Chọn giảng viên phụ trách --';

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-[var(--lms-text-muted)] uppercase mb-1"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <button
        id={inputId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] text-left text-sm text-[var(--lms-text)] hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <UserCheck className="w-4 h-4 text-[var(--lms-text-muted)] shrink-0" aria-hidden="true" />
          <span className={`truncate ${selectedLecturer ? 'font-medium' : 'text-[var(--lms-text-muted)]'}`}>
            {selectedLabel}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-[var(--lms-text-muted)] shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lms-text-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo mã GV (GV001), họ tên hoặc email..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-xs text-[var(--lms-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <ul role="listbox" className="max-h-56 overflow-y-auto divide-y divide-[var(--lms-border)]/40">
            {filtered.length === 0 ? (
              <li className="px-3.5 py-4 text-center text-xs text-[var(--lms-text-muted)]">
                Không tìm thấy giảng viên phù hợp với &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((lec) => {
                const lecId = String(lec.userId ?? lec.id);
                const lecName = lec.fullName ?? lec.full_name ?? lec.email;
                const isSelected = lecId === value;
                const loadCount = courseCountByLecturer[lecId] ?? 0;

                return (
                  <li key={lecId} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(lecId);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-[var(--lms-surface-muted)] text-[var(--lms-text)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {lec.staffCode && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 font-mono text-[11px] font-semibold">
                              {lec.staffCode}
                            </span>
                          )}
                          <span className="font-semibold truncate">{lecName}</span>
                        </div>
                        <div className="text-[11px] text-[var(--lms-text-muted)] truncate mt-0.5">
                          {lec.email} · Đang phụ trách {loadCount} lớp
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
