import React, { useId, useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail, RefreshCw, Save, ShieldCheck, User as UserIcon } from 'lucide-react';
import { changeMyPassword, passwordByteLength, updateMyProfile, validatePasswordBytes } from '../api/users';
import { useAuth } from '../auth/AuthContext';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { SkeletonCard } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import type { UserRole } from '../types';
import { formatDateTimeVi, formatRole, formatUserStatus } from '../utils/formatters';

const ROLE_BADGE_VARIANT: Record<UserRole, BadgeVariant> = {
  ADMIN: 'info',
  LECTURER: 'primary',
  STUDENT: 'success',
};

export const ProfilePage: React.FC = () => {
  const { user, isLoading, setCurrentUser, refreshMe } = useAuth();
  const toast = useToast();

  const fullNameId = useId();
  const emailId = useId();
  const codeId = useId();
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  const [editedFullName, setEditedFullName] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const fullName = editedFullName ?? user?.fullName ?? '';

  if (isLoading && !user) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBanner
        title="Không tìm thấy thông tin tài khoản"
        message="Phiên đăng nhập chưa được tải. Vui lòng thử tải lại thông tin."
        onRetry={() => {
          void refreshMe();
        }}
      />
    );
  }

  const accountCode = user.studentCode || user.staffCode || 'Chưa cấp mã';
  const codeLabel = user.role === 'STUDENT' ? 'Mã sinh viên' : 'Mã cán bộ / Giảng viên';
  const newPasswordBytes = passwordByteLength(newPassword);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshMe();
      setEditedFullName(null);
      toast.info('Đã đồng bộ thông tin hồ sơ mới nhất.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileError(null);

    const cleaned = fullName.trim();
    if (!cleaned) {
      setProfileError('Họ và tên không được để trống.');
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await updateMyProfile({ fullName: cleaned });
      setCurrentUser(updated);
      setEditedFullName(null);
      toast.success('Đã cập nhật họ tên hiển thị.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    const bytesMessage = validatePasswordBytes(newPassword);
    if (bytesMessage) {
      setPasswordError(bytesMessage);
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Xác nhận mật khẩu mới chưa khớp.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await changeMyPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(res.message || 'Đổi mật khẩu thành công.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--lms-text)]">Hồ sơ cá nhân</h1>
          <p className="mt-1 text-sm text-[var(--lms-text-muted)]">
            Xem thông tin tài khoản, cập nhật tên hiển thị và bảo mật mật khẩu đăng nhập
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex min-h-[40px] items-center gap-2 self-start rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm font-medium text-[var(--lms-text)] transition hover:bg-[var(--lms-surface-muted)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Làm mới hồ sơ</span>
        </button>
      </div>

      {/* Identity Overview */}
      <section
        aria-label="Thông tin định danh tài khoản"
        className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-6 shadow-xs"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--lms-text)]">{user.fullName}</h2>
                <Badge variant={ROLE_BADGE_VARIANT[user.role]} size="sm">
                  {formatRole(user.role)}
                </Badge>
                <Badge variant={user.isActive ? 'success' : 'danger'} size="sm" dot>
                  {formatUserStatus(user.isActive)}
                </Badge>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--lms-text-muted)]">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{user.email}</span>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 px-4 py-2.5 text-sm">
            <div className="text-xs text-[var(--lms-text-muted)]">{codeLabel}</div>
            <div className="font-mono font-semibold text-[var(--lms-text)]">{accountCode}</div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-[var(--lms-border)] pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--lms-text-muted)]">Vai trò hệ thống</dt>
            <dd className="mt-0.5 font-medium text-[var(--lms-text)]">{formatRole(user.role)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--lms-text-muted)]">Định danh đăng nhập</dt>
            <dd className="mt-0.5 font-medium text-[var(--lms-text)]">
              {user.email}
              {user.studentCode || user.staffCode ? ` / ${accountCode}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--lms-text-muted)]">Ngày tạo tài khoản</dt>
            <dd className="mt-0.5 font-medium text-[var(--lms-text)]">{formatDateTimeVi(user.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile Form */}
        <section
          aria-labelledby="profile-form-heading"
          className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-6 shadow-xs"
        >
          <div className="mb-4 flex items-center gap-2.5">
            <UserIcon className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2 id="profile-form-heading" className="text-lg font-bold text-[var(--lms-text)]">
              Thông tin hiển thị
            </h2>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            {profileError && <ErrorBanner title="Không thể cập nhật" message={profileError} />}

            <div>
              <label htmlFor={fullNameId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Họ và tên
              </label>
              <input
                id={fullNameId}
                name="name"
                type="text"
                required
                maxLength={150}
                autoComplete="name"
                value={fullName}
                onChange={(e) => setEditedFullName(e.target.value)}
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2.5 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label htmlFor={emailId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Email trường
              </label>
              <input
                id={emailId}
                type="email"
                readOnly
                value={user.email}
                className="w-full cursor-not-allowed rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 px-3.5 py-2.5 text-sm text-[var(--lms-text-muted)]"
              />
            </div>

            <div>
              <label htmlFor={codeId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                {codeLabel}
              </label>
              <input
                id={codeId}
                type="text"
                readOnly
                value={accountCode}
                className="w-full cursor-not-allowed rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 px-3.5 py-2.5 font-mono text-sm text-[var(--lms-text-muted)]"
              />
              <p className="mt-1 text-xs text-[var(--lms-text-muted)]">
                Email, vai trò và mã số được quản trị viên hệ thống quản lý.
              </p>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>{savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}</span>
            </button>
          </form>
        </section>

        {/* Change Password Form */}
        <section
          aria-labelledby="password-form-heading"
          className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-6 shadow-xs"
        >
          <div className="mb-4 flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2 id="password-form-heading" className="text-lg font-bold text-[var(--lms-text)]">
              Đổi mật khẩu
            </h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && <ErrorBanner title="Không thể đổi mật khẩu" message={passwordError} />}

            <div>
              <label htmlFor={currentPasswordId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Mật khẩu hiện tại
              </label>
              <div className="relative">
                <input
                  id={currentPasswordId}
                  name="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2.5 pl-3.5 pr-11 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  aria-pressed={showCurrentPassword}
                  aria-controls={currentPasswordId}
                  aria-label={showCurrentPassword ? 'Ẩn mật khẩu hiện tại' : 'Hiện mật khẩu hiện tại'}
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)]"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor={newPasswordId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Mật khẩu mới
              </label>
              <div className="relative">
                <input
                  id={newPasswordId}
                  name="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2.5 pl-3.5 pr-11 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-pressed={showNewPassword}
                  aria-controls={newPasswordId}
                  aria-label={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)]"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--lms-text-muted)]">
                Yêu cầu 6 ký tự đến tối đa 72 byte UTF-8 (hiện tại:{' '}
                <span className="tabular-nums font-semibold">{newPasswordBytes}</span> / 72 byte).
              </p>
            </div>

            <div>
              <label htmlFor={confirmPasswordId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Nhập lại mật khẩu mới
              </label>
              <div className="relative">
                <input
                  id={confirmPasswordId}
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2.5 pl-3.5 pr-11 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-pressed={showConfirmPassword}
                  aria-controls={confirmPasswordId}
                  aria-label={showConfirmPassword ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--lms-text-muted)] hover:bg-[var(--lms-surface-muted)]"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={changingPassword}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{changingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;
