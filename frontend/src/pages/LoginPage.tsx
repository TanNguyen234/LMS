import React, { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, BookOpen, Eye, EyeOff, GraduationCap, Shield, User as UserIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getDemoAccountsCached } from '../api/demo';
import type { DemoAccountItem, UserRole } from '../types';

const ROLE_ORDER: UserRole[] = ['ADMIN', 'LECTURER', 'STUDENT'];

const ROLE_META: Record<UserRole, { label: string; icon: React.ElementType; className: string }> = {
  ADMIN: {
    label: 'Quản trị viên',
    icon: Shield,
    className: 'border-purple-300 text-purple-900 hover:bg-purple-50 focus-visible:ring-purple-500',
  },
  LECTURER: {
    label: 'Giảng viên',
    icon: BookOpen,
    className: 'border-blue-300 text-blue-900 hover:bg-blue-50 focus-visible:ring-blue-500',
  },
  STUDENT: {
    label: 'Sinh viên',
    icon: UserIcon,
    className: 'border-emerald-300 text-emerald-900 hover:bg-emerald-50 focus-visible:ring-emerald-500',
  },
};

function pickOnePerRole(accounts: DemoAccountItem[]): DemoAccountItem[] {
  return ROLE_ORDER.map((role) => accounts.find((acc) => acc.role === role)).filter(
    (acc): acc is DemoAccountItem => Boolean(acc),
  );
}

interface LocationState {
  from?: { pathname?: string };
}

export const LoginPage: React.FC = () => {
  const { login, switchDemoAccount, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const identifierId = useId();
  const passwordId = useId();
  const identifierHintId = useId();
  const passwordHintId = useId();
  const errorId = useId();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountItem[]>([]);
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);

  const from = (location.state as LocationState | null)?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (user) {
      navigate(from === '/login' ? '/dashboard' : from, { replace: true });
    }
  }, [user, from, navigate]);

  useEffect(() => {
    let active = true;
    getDemoAccountsCached().then((accounts) => {
      if (active && accounts) setDemoAccounts(pickOnePerRole(accounts));
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Vui lòng nhập email hoặc mã số và mật khẩu.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        /incorrect email or password/i.test(message)
          ? 'Email, mã số hoặc mật khẩu không chính xác.'
          : message || 'Không thể đăng nhập. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (account: DemoAccountItem) => {
    setError(null);
    setDemoLoadingEmail(account.email);
    try {
      await switchDemoAccount(account.email);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập bằng tài khoản demo.');
    } finally {
      setDemoLoadingEmail(null);
    }
  };

  const busy = loading || demoLoadingEmail !== null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-500/30 mb-4">
            <GraduationCap className="w-9 h-9" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Cổng Đào Tạo Trực Tuyến LMS</h1>
          <p className="text-slate-300 text-sm mt-1">Cổng thông tin Đào tạo &amp; Quản lý Học tập</p>
        </div>

        <section
          aria-labelledby="login-heading"
          className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-6 text-[var(--lms-text)] shadow-2xl sm:p-8"
        >
          <h2 id="login-heading" className="text-xl font-bold mb-6">
            Đăng nhập hệ thống
          </h2>

          {error && (
            <div
              id={errorId}
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
            <div>
              <label htmlFor={identifierId} className="mb-1.5 block text-sm font-semibold">
                Email hoặc mã số sinh viên / cán bộ
              </label>
              <input
                id={identifierId}
                name="username"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-describedby={error ? `${identifierHintId} ${errorId}` : identifierHintId}
                aria-invalid={error ? true : undefined}
                className="peer w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2.5 text-sm text-[var(--lms-text)] transition focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 user-invalid:border-red-500"
                placeholder="vd: student1@university.edu.vn hoặc SV001"
              />
              <p id={identifierHintId} className="mt-1 text-xs text-[var(--lms-text-muted)] peer-user-invalid:text-red-700">
                Có thể dùng email trường hoặc mã sinh viên / mã cán bộ.
              </p>
            </div>

            <div>
              <label htmlFor={passwordId} className="mb-1.5 block text-sm font-semibold">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  id={passwordId}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={error ? `${passwordHintId} ${errorId}` : passwordHintId}
                  aria-invalid={error ? true : undefined}
                  className="peer w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2.5 pl-4 pr-12 text-sm text-[var(--lms-text)] transition focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 user-invalid:border-red-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-controls={passwordId}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)] hover:text-[var(--lms-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              <p id={passwordHintId} className="mt-1 text-xs text-[var(--lms-text-muted)]">
                Phân biệt chữ hoa và chữ thường.
              </p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {loading ? (
                <span>Đang xử lý...</span>
              ) : (
                <>
                  <span>Đăng nhập</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {demoAccounts.length > 0 && (
            <div className="mt-8 border-t border-[var(--lms-border)] pt-6">
              <h3 className="mb-1 text-center text-sm font-semibold">Đăng nhập nhanh bằng tài khoản demo</h3>
              <p className="mb-3 text-center text-xs text-[var(--lms-text-muted)]">
                Chỉ hiển thị trong môi trường phát triển. Một chạm để vào đúng vai trò.
              </p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {demoAccounts.map((account) => {
                  const meta = ROLE_META[account.role];
                  const Icon = meta.icon;
                  const isThisLoading = demoLoadingEmail === account.email;
                  return (
                    <li key={account.email}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDemoLogin(account)}
                        aria-label={`Đăng nhập với vai trò ${meta.label}: ${account.fullName}`}
                        className={`flex min-h-[44px] w-full flex-col items-center rounded-xl border bg-white p-2 text-center transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${meta.className}`}
                      >
                        <Icon className="mb-1 h-4 w-4" aria-hidden="true" />
                        <span className="block text-xs font-bold">{isThisLoading ? 'Đang vào...' : meta.label}</span>
                        <span className="w-full truncate text-xs">{account.fullName}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default LoginPage;
