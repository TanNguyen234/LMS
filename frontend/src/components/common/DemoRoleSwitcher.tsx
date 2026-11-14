import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { getDemoAccountsCached } from '../../api/demo';
import { useAuth } from '../../auth/AuthContext';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import type { DemoAccountItem, User, UserRole } from '../../types';
import { formatRole } from '../../utils/formatters';

export interface DemoRoleSwitcherProps {
  className?: string;
  onSwitched?: (user: User) => void;
}

const ROLE_BADGE_VARIANT: Record<UserRole, BadgeVariant> = {
  ADMIN: 'info',
  LECTURER: 'primary',
  STUDENT: 'success',
};

export const DemoRoleSwitcher: React.FC<DemoRoleSwitcherProps> = ({ className = '', onSwitched }) => {
  const { user, switchDemoAccount } = useAuth();
  const toast = useToast();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [accounts, setAccounts] = useState<DemoAccountItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDemoAccountsCached().then((items) => {
      if (active) {
        setAccounts(items);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!user || !accounts || accounts.length === 0) {
    return null;
  }

  const handleSelect = async (account: DemoAccountItem) => {
    if (account.email.toLowerCase() === user.email.toLowerCase()) {
      setOpen(false);
      return;
    }
    setSwitchingEmail(account.email);
    try {
      const nextUser = await switchDemoAccount(account.email);
      setOpen(false);
      toast.success(`Đã chuyển sang ${nextUser.fullName} (${formatRole(nextUser.role)}).`);
      onSwitched?.(nextUser);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể chuyển tài khoản demo.');
    } finally {
      setSwitchingEmail(null);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={switchingEmail !== null}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--lms-text)] transition hover:bg-[var(--lms-surface-muted)] disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 text-blue-600 ${switchingEmail ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span className="hidden sm:inline">Đổi vai trò demo</span>
        <Badge variant={ROLE_BADGE_VARIANT[user.role]} size="sm">
          {formatRole(user.role)}
        </Badge>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--lms-text-muted)]" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Chọn tài khoản demo"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-1.5 text-[var(--lms-text)] shadow-xl"
        >
          <div className="border-b border-[var(--lms-border)] px-3 py-2 text-xs font-semibold text-[var(--lms-text-muted)]">
            Chuyển nhanh tài khoản phát triển
          </div>
          <div className="mt-1 space-y-0.5">
            {accounts.map((account) => {
              const isCurrent = account.email.toLowerCase() === user.email.toLowerCase();
              const isBusy = switchingEmail === account.email;
              const code = account.studentCode || account.staffCode;
              return (
                <button
                  key={account.email}
                  type="button"
                  role="menuitem"
                  disabled={switchingEmail !== null}
                  onClick={() => handleSelect(account)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-[var(--lms-surface-muted)] disabled:opacity-60 ${
                    isCurrent ? 'bg-[var(--lms-surface-muted)]/70 font-semibold' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-[var(--lms-text)]">{account.fullName}</span>
                      {code && <span className="font-mono text-[11px] text-[var(--lms-text-muted)]">({code})</span>}
                    </div>
                    <div className="truncate text-[11px] text-[var(--lms-text-muted)]">{account.email}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant={ROLE_BADGE_VARIANT[account.role]} size="sm">
                      {formatRole(account.role)}
                    </Badge>
                    {isCurrent && <Check className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />}
                    {isBusy && <span className="text-[11px] text-[var(--lms-text-muted)]">...</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DemoRoleSwitcher;
