import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Pencil,
  RotateCcw,
  Search,
  Unlock,
  Upload,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  CSV_IMPORT_COLUMNS,
  createUser,
  importUsersCsv,
  listUsers,
  passwordByteLength,
  setUserActive,
  updateUser,
  validatePasswordBytes,
  type UserImportReport,
  type UserStatusFilter,
} from '../api/users';
import { useAuth } from '../auth/AuthContext';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import type { User, UserRole } from '../types';
import { formatDateTimeVi, formatRole, formatUserStatus } from '../utils/formatters';

const ROLE_BADGE_VARIANT: Record<UserRole, BadgeVariant> = {
  ADMIN: 'info',
  LECTURER: 'primary',
  STUDENT: 'success',
};

function getDisplayCode(u: User): string {
  if (u.studentCode && u.staffCode) return `${u.studentCode} / ${u.staffCode}`;
  return u.studentCode || u.staffCode || 'Chưa cấp mã';
}

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const searchInputId = useId();
  const roleSelectId = useId();
  const statusSelectId = useId();
  const pageSizeSelectId = useId();

  // Table & server-side pagination state
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter | ''>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);

  // Create / Edit modal state
  const userFormId = useId();
  const formEmailId = useId();
  const formFullNameId = useId();
  const formRoleId = useId();
  const formStudentCodeId = useId();
  const formStaffCodeId = useId();
  const formPasswordId = useId();
  const formActiveId = useId();

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('STUDENT');
  const [formStudentCode, setFormStudentCode] = useState('');
  const [formStaffCode, setFormStaffCode] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // CSV Import modal state
  const csvInputId = useId();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<UserImportReport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setReloadSeq((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listUsers({
          page,
          pageSize,
          search: debouncedSearch,
          role: roleFilter,
          status: statusFilter,
        });
        if (cancelled) return;
        const maxPage = Math.max(1, Math.ceil(res.total / pageSize));
        if (page > maxPage && res.total > 0) {
          setPage(maxPage);
          return;
        }
        setUsers(res.items);
        setTotal(res.total);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Không thể tải danh sách người dùng.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, debouncedSearch, roleFilter, statusFilter, reloadSeq]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openCreateModal = () => {
    setEditingUser(null);
    setFormEmail('');
    setFormFullName('');
    setFormRole('STUDENT');
    setFormStudentCode('');
    setFormStaffCode('');
    setFormPassword('');
    setFormActive(true);
    setFormError(null);
    setIsUserModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setFormEmail(u.email);
    setFormFullName(u.fullName);
    setFormRole(u.role);
    setFormStudentCode(u.studentCode ?? '');
    setFormStaffCode(u.staffCode ?? '');
    setFormPassword('');
    setFormActive(u.isActive);
    setFormError(null);
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const emailClean = formEmail.trim();
    const fullNameClean = formFullName.trim();
    if (!emailClean || !fullNameClean) {
      setFormError('Vui lòng nhập đầy đủ email và họ tên.');
      return;
    }

    if (!editingUser || formPassword.length > 0) {
      const pwMsg = validatePasswordBytes(formPassword);
      if (pwMsg) {
        setFormError(pwMsg);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.userId, {
          email: emailClean,
          fullName: fullNameClean,
          role: formRole,
          isActive: formActive,
          studentCode: formStudentCode.trim(),
          staffCode: formStaffCode.trim(),
          ...(formPassword.length > 0 ? { password: formPassword } : {}),
        });
        toast.success(`Đã cập nhật tài khoản ${emailClean}.`);
      } else {
        await createUser({
          email: emailClean,
          fullName: fullNameClean,
          role: formRole,
          password: formPassword,
          isActive: formActive,
          studentCode: formStudentCode.trim() || null,
          staffCode: formStaffCode.trim() || null,
        });
        toast.success(`Đã tạo tài khoản ${emailClean}.`);
      }
      setIsUserModalOpen(false);
      await fetchUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu thông tin người dùng.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (u: User) => {
    if (currentUser?.userId === u.userId && u.isActive) {
      toast.warning('Không thể tự khóa tài khoản quản trị đang đăng nhập.');
      return;
    }

    const willLock = u.isActive;
    const accepted = await confirm({
      title: willLock ? 'Khóa tài khoản người dùng' : 'Mở khóa tài khoản người dùng',
      message: willLock
        ? `Tài khoản ${u.fullName} (${u.email}) sẽ không thể đăng nhập hoặc thao tác cho tới khi được mở khóa lại.`
        : `Cho phép ${u.fullName} (${u.email}) đăng nhập và sử dụng hệ thống trở lại?`,
      confirmText: willLock ? 'Khóa tài khoản' : 'Mở khóa',
      cancelText: 'Hủy',
      variant: willLock ? 'danger' : 'primary',
    });

    if (!accepted) return;

    try {
      setTogglingId(u.userId);
      await setUserActive(u.userId, !u.isActive);
      toast.success(willLock ? `Đã khóa tài khoản ${u.email}.` : `Đã mở khóa tài khoản ${u.email}.`);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể thay đổi trạng thái tài khoản.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleOpenImportModal = () => {
    setCsvFile(null);
    setImportError(null);
    setImportReport(null);
    setImportProgress(null);
    setIsImportModalOpen(true);
  };

  const handleDownloadCsvSample = () => {
    const header = CSV_IMPORT_COLUMNS.join(',');
    const rows = [
      'sinhvien.moi1@university.edu.vn,Nguyễn Minh Tuấn,STUDENT,SV101,,Demo@123',
      'giangvien.moi1@university.edu.vn,ThS. Phạm Lan Anh,LECTURER,,GV101,Demo@123',
    ];
    const bom = '\ufeff';
    const blob = new Blob([bom + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau_nhap_nguoi_dung.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!csvFile) {
      setImportError('Vui lòng chọn tệp CSV trước khi tải lên.');
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportProgress(0);
    try {
      const report = await importUsersCsv(csvFile, (percent) => setImportProgress(percent));
      setImportReport(report);
      if (report.created > 0) {
        toast.success(`Đã nhập thành công ${report.created} tài khoản mới.`);
        await fetchUsers();
      } else {
        toast.info('Không có tài khoản mới nào được tạo từ tệp CSV.');
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Nhập CSV thất bại.');
    } finally {
      setImporting(false);
    }
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const columns: DataTableColumn<User>[] = [
    {
      key: 'code',
      header: 'Mã số',
      sortable: true,
      sortValue: (u) => u.studentCode || u.staffCode || '',
      render: (u) => (
        <span className="font-mono text-xs font-semibold text-[var(--lms-text)]">{getDisplayCode(u)}</span>
      ),
    },
    {
      key: 'fullName',
      header: 'Người dùng',
      sortable: true,
      sortValue: (u) => u.fullName,
      render: (u) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--lms-text)]">{u.fullName}</span>
            {currentUser?.userId === u.userId && (
              <Badge variant="neutral" size="sm">
                Bạn
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-[var(--lms-text-muted)]">{u.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Vai trò',
      sortable: true,
      sortValue: (u) => u.role,
      render: (u) => (
        <Badge variant={ROLE_BADGE_VARIANT[u.role]} size="sm">
          {formatRole(u.role)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      sortable: true,
      sortValue: (u) => (u.isActive ? 1 : 0),
      render: (u) => (
        <Badge variant={u.isActive ? 'success' : 'danger'} size="sm" dot>
          {formatUserStatus(u.isActive)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Ngày tạo',
      sortable: true,
      sortValue: (u) => u.createdAt,
      render: (u) => <span className="text-xs text-[var(--lms-text-muted)]">{formatDateTimeVi(u.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (u) => {
        const isSelf = currentUser?.userId === u.userId;
        const isBusy = togglingId === u.userId;
        return (
          <div className="inline-flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => openEditModal(u)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--lms-text)] transition hover:bg-[var(--lms-surface-muted)]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sửa / Đặt lại MK</span>
            </button>
            <button
              type="button"
              disabled={isBusy || (isSelf && u.isActive)}
              onClick={() => handleToggleStatus(u)}
              title={isSelf && u.isActive ? 'Không thể tự khóa tài khoản đang đăng nhập' : undefined}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                u.isActive
                  ? 'border-red-300 bg-[var(--lms-surface)] [color:light-dark(#b91c1c,#fca5a5)] hover:[background:light-dark(#fef2f2,rgba(127,29,29,0.28))]'
                  : 'border-emerald-300 bg-[var(--lms-surface)] [color:light-dark(#047857,#6ee7b7)] hover:[background:light-dark(#ecfdf5,rgba(6,78,59,0.28))]'
              }`}
            >
              {u.isActive ? (
                <>
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isBusy ? 'Đang xử lý...' : 'Khóa'}</span>
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isBusy ? 'Đang xử lý...' : 'Mở khóa'}</span>
                </>
              )}
            </button>
          </div>
        );
      },
    },
  ];

  const isEditingSelf = Boolean(editingUser && currentUser?.userId === editingUser.userId);
  const currentPasswordBytes = passwordByteLength(formPassword);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--lms-text)]">Quản lý Người dùng</h1>
          <p className="mt-1 text-sm text-[var(--lms-text-muted)]">
            Tìm kiếm, phân quyền, cấp mã sinh viên/cán bộ, đặt lại mật khẩu và nhập danh sách CSV
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenImportModal}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-semibold text-[var(--lms-text)] transition hover:bg-[var(--lms-surface-muted)]"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>Nhập CSV</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>Thêm người dùng</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <section
        aria-label="Bộ lọc danh sách người dùng"
        className="rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4 shadow-xs"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-5">
            <label htmlFor={searchInputId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
              Tìm theo tên, email hoặc mã số
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lms-text-muted)]" aria-hidden="true" />
              <input
                id={searchInputId}
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter') {
                    setDebouncedSearch(searchInput.trim());
                    setPage(1);
                  }
                }}
                placeholder="VD: Nguyễn An, SV001, GV001, @university.edu.vn"
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] py-2 pl-9 pr-3 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label htmlFor={roleSelectId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
              Vai trò
            </label>
            <select
              id={roleSelectId}
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as UserRole | '');
                setPage(1);
              }}
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Tất cả vai trò</option>
              <option value="ADMIN">Quản trị viên</option>
              <option value="LECTURER">Giảng viên</option>
              <option value="STUDENT">Sinh viên</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor={statusSelectId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
              Trạng thái
            </label>
            <select
              id={statusSelectId}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as UserStatusFilter | '');
                setPage(1);
              }}
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-2 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Đã khóa</option>
            </select>
          </div>

          <div className="flex items-end md:col-span-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/60 px-3 py-2 text-sm font-medium text-[var(--lms-text)] transition hover:bg-[var(--lms-surface-muted)]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Đặt lại</span>
            </button>
          </div>
        </div>
      </section>

      {loadError && <ErrorBanner message={loadError} onRetry={fetchUsers} />}

      <DataTable
        caption="Danh sách tài khoản người dùng trong hệ thống"
        columns={columns}
        data={users}
        getRowKey={(u) => u.userId}
        loading={loading}
        emptyTitle="Không tìm thấy tài khoản phù hợp"
        emptyDescription="Thử thay đổi từ khóa tìm kiếm, vai trò hoặc tạo tài khoản mới."
        emptyAction={
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
          >
            Xóa bộ lọc
          </button>
        }
      />

      {/* Server-side pagination footer */}
      <nav
        aria-label="Phân trang danh sách người dùng"
        className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-3 text-sm sm:flex-row"
      >
        <div className="text-[var(--lms-text-muted)]">
          Tổng số <strong className="tabular-nums text-[var(--lms-text)]">{total}</strong> tài khoản — Trang{' '}
          <strong className="tabular-nums text-[var(--lms-text)]">{page}</strong> /{' '}
          <strong className="tabular-nums text-[var(--lms-text)]">{totalPages}</strong>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor={pageSizeSelectId} className="text-xs text-[var(--lms-text-muted)]">
              Mỗi trang
            </label>
            <select
              id={pageSizeSelectId}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2 py-1 text-sm text-[var(--lms-text)]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Trang trước"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 text-sm font-medium text-[var(--lms-text)] transition hover:bg-[var(--lms-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span>Trước</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Trang sau"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 text-sm font-medium text-[var(--lms-text)] transition hover:bg-[var(--lms-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Sau</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => !submitting && setIsUserModalOpen(false)}
        title={editingUser ? 'Cập nhật tài khoản người dùng' : 'Tạo tài khoản mới'}
        subtitle={
          editingUser
            ? `Chỉnh sửa thông tin, mã số, phân quyền hoặc đặt lại mật khẩu cho ${editingUser.email}`
            : 'Điền thông tin tài khoản. Mật khẩu hợp lệ từ 6 ký tự đến tối đa 72 byte UTF-8.'
        }
        size="md"
        footer={
          <>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setIsUserModalOpen(false)}
              className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
            >
              Hủy
            </button>
            <button
              type="submit"
              form={userFormId}
              disabled={submitting}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? 'Đang lưu...' : editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </button>
          </>
        }
      >
        <form id={userFormId} onSubmit={handleSaveUser} className="space-y-4">
          {formError && <ErrorBanner title="Không thể lưu" message={formError} />}

          <div>
            <label htmlFor={formFullNameId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
              Họ và tên
            </label>
            <input
              id={formFullNameId}
              type="text"
              required
              maxLength={150}
              value={formFullName}
              onChange={(e) => setFormFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn An"
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={formEmailId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Email đăng nhập
              </label>
              <input
                id={formEmailId}
                type="email"
                required
                maxLength={150}
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="ten@university.edu.vn"
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label htmlFor={formRoleId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Vai trò
              </label>
              <select
                id={formRoleId}
                value={formRole}
                disabled={isEditingSelf}
                onChange={(e) => setFormRole(e.target.value as UserRole)}
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
              >
                <option value="STUDENT">Sinh viên</option>
                <option value="LECTURER">Giảng viên</option>
                <option value="ADMIN">Quản trị viên</option>
              </select>
              {isEditingSelf && (
                <p className="mt-1 text-xs text-[var(--lms-text-muted)]">Không thể tự thay đổi vai trò quản trị của chính mình.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={formStudentCodeId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Mã sinh viên
              </label>
              <input
                id={formStudentCodeId}
                type="text"
                maxLength={30}
                value={formStudentCode}
                onChange={(e) => setFormStudentCode(e.target.value)}
                placeholder="VD: SV015"
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 font-mono text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label htmlFor={formStaffCodeId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Mã cán bộ / Giảng viên
              </label>
              <input
                id={formStaffCodeId}
                type="text"
                maxLength={30}
                value={formStaffCode}
                onChange={(e) => setFormStaffCode(e.target.value)}
                placeholder="VD: GV012"
                className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 font-mono text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label htmlFor={formPasswordId} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--lms-text)]">
              <KeyRound className="h-4 w-4 text-[var(--lms-text-muted)]" aria-hidden="true" />
              <span>{editingUser ? 'Đặt lại mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu khởi tạo'}</span>
            </label>
            <input
              id={formPasswordId}
              type="password"
              required={!editingUser}
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={editingUser ? 'Nhập mật khẩu mới nếu muốn đặt lại' : 'Tối thiểu 6 ký tự, tối đa 72 byte'}
              className="w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3.5 py-2 text-sm text-[var(--lms-text)] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="mt-1 text-xs text-[var(--lms-text-muted)]">
              Độ dài hiện tại: <span className="tabular-nums font-semibold">{currentPasswordBytes}</span> / 72 byte UTF-8.
            </p>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <input
              id={formActiveId}
              type="checkbox"
              checked={formActive}
              disabled={isEditingSelf}
              onChange={(e) => setFormActive(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--lms-border)] text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor={formActiveId} className="text-sm font-medium text-[var(--lms-text)]">
              Tài khoản đang hoạt động (cho phép đăng nhập)
            </label>
          </div>
        </form>
      </Modal>

      {/* CSV Bulk Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => !importing && setIsImportModalOpen(false)}
        title="Nhập danh sách người dùng từ CSV"
        subtitle="Hỗ trợ tệp UTF-8 (có hoặc không có BOM). Dòng trùng email sẽ tự động bỏ qua an toàn."
        size="lg"
        footer={
          <button
            type="button"
            disabled={importing}
            onClick={() => setIsImportModalOpen(false)}
            className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
          >
            Đóng
          </button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/50 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-[var(--lms-text)]">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>Định dạng cột chuẩn</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadCsvSample}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Tải tệp mẫu</span>
              </button>
            </div>
            <p className="mt-2 font-mono text-xs text-[var(--lms-text)]">{CSV_IMPORT_COLUMNS.join(', ')}</p>
            <p className="mt-1 text-xs text-[var(--lms-text-muted)]">
              Bắt buộc: <code className="font-mono">email</code>, <code className="font-mono">fullName</code>,{' '}
              <code className="font-mono">role</code> (ADMIN | LECTURER | STUDENT). Nếu bỏ trống{' '}
              <code className="font-mono">password</code>, hệ thống gán mật khẩu mặc định <code className="font-mono">Demo@123</code>.
            </p>
          </div>

          <form onSubmit={handleImportCsv} className="space-y-3">
            <div>
              <label htmlFor={csvInputId} className="mb-1.5 block text-sm font-semibold text-[var(--lms-text)]">
                Chọn tệp CSV
              </label>
              <input
                id={csvInputId}
                type="file"
                accept=".csv,text/csv"
                disabled={importing}
                onChange={(e) => {
                  setCsvFile(e.target.files?.[0] ?? null);
                  setImportError(null);
                }}
                className="block w-full rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-2 text-sm text-[var(--lms-text)] file:mr-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-800"
              />
            </div>

            {importProgress !== null && importing && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-[var(--lms-text-muted)]">
                  <span>Đang tải lên và xử lý...</span>
                  <span className="tabular-nums">{importProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--lms-surface-muted)]">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${importProgress}%` }} />
                </div>
              </div>
            )}

            {importError && <ErrorBanner title="Không thể nhập CSV" message={importError} />}

            <button
              type="submit"
              disabled={importing || !csvFile}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>{importing ? 'Đang nhập dữ liệu...' : 'Bắt đầu nhập CSV'}</span>
            </button>
          </form>

          {importReport && (
            <div className="space-y-3 border-t border-[var(--lms-border)] pt-4">
              <h3 className="text-sm font-bold text-[var(--lms-text)]">Kết quả nhập danh sách</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3">
                  <div className="text-xs text-[var(--lms-text-muted)]">Đã tạo mới</div>
                  <div className="mt-1 text-xl font-bold tabular-nums [color:light-dark(#047857,#6ee7b7)]">{importReport.created}</div>
                </div>
                <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3">
                  <div className="text-xs text-[var(--lms-text-muted)]">Đã bỏ qua (trùng)</div>
                  <div className="mt-1 text-xl font-bold tabular-nums [color:light-dark(#b45309,#fcd34d)]">{importReport.skipped}</div>
                </div>
                <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-3">
                  <div className="text-xs text-[var(--lms-text-muted)]">Dòng lỗi</div>
                  <div className="mt-1 text-xl font-bold tabular-nums [color:light-dark(#b91c1c,#fca5a5)]">{importReport.errors.length}</div>
                </div>
              </div>

              {importReport.skippedRows.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
                    Danh sách bỏ qua
                  </h4>
                  <ul className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-[var(--lms-border)] p-2.5 text-xs">
                    {importReport.skippedRows.map((item) => (
                      <li key={`${item.row}-${item.email}`} className="flex justify-between gap-2">
                        <span className="font-mono">
                          Dòng {item.row}: {item.email}
                        </span>
                        <span className="text-[var(--lms-text-muted)]">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importReport.errors.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide [color:light-dark(#b91c1c,#fca5a5)]">
                    Chi tiết dòng lỗi
                  </h4>
                  <ul className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border p-3 text-xs [border-color:light-dark(#fecaca,#991b1b)] [background:light-dark(#fef2f2,rgba(127,29,29,0.25))] [color:light-dark(#7f1d1d,#fecaca)]">
                    {importReport.errors.map((item) => (
                      <li key={`${item.row}-${item.email ?? 'err'}`}>
                        <strong>Dòng {item.row}</strong>
                        {item.email ? ` (${item.email})` : ''}: {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AdminUsersPage;
