import React, { useState, useEffect, useMemo } from 'react';
import {
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  X,
  AlertCircle,
  Pencil,
  Eye,
  EyeOff,
  UploadCloud,
  Download,
  Layers,
  Check,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../api/client';
import type { User, UserRole } from '../types';

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [cohortFilter, setCohortFilter] = useState<string>('ALL');
  const [majorFilter, setMajorFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Multi-select for Batch Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Single User Create/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('STUDENT');
  const [newPassword, setNewPassword] = useState('Demo@123');
  const [newCohort, setNewCohort] = useState('');
  const [newMajor, setNewMajor] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Bulk Import CSV Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    totalProcessed: number;
    createdCount: number;
    updatedCount: number;
    errorCount: number;
    errors: string[];
  } | null>(null);

  // Quick Batch Provisioning Modal
  const [isBatchGenModalOpen, setIsBatchGenModalOpen] = useState(false);
  const [genPrefix, setGenPrefix] = useState('SV24CN');
  const [genStart, setGenStart] = useState(1);
  const [genEnd, setGenEnd] = useState(40);
  const [genClassName, setGenClassName] = useState('24CNTT01');
  const [genMajor, setGenMajor] = useState('Công nghệ thông tin (CNTT)');
  const [genCohort, setGenCohort] = useState('Khối B (K2024)');
  const [genSubmitting, setGenSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getUsers(roleFilter === 'ALL' ? undefined : roleFilter);
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách người dùng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [search, roleFilter, cohortFilter, majorFilter, classFilter, statusFilter]);

  const handleToggleStatus = async (userId: string | number) => {
    try {
      const targetUser = users.find((u) => u.id === userId);
      if (!targetUser) return;
      const currentActive = targetUser.isActive ?? targetUser.is_active;
      await api.toggleUserStatus(userId, currentActive);
      const nextActive = !currentActive;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: nextActive, is_active: nextActive } : u)));
    } catch (err: any) {
      alert('Lỗi cập nhật trạng thái: ' + err.message);
    }
  };

  const handleBatchAction = async (action: 'ACTIVATE' | 'DEACTIVATE' | 'RESET_PASSWORD') => {
    if (selectedIds.size === 0) return;
    const confirmText =
      action === 'ACTIVATE'
        ? `Kích hoạt ${selectedIds.size} tài khoản đã chọn?`
        : action === 'DEACTIVATE'
        ? `Tạm khóa ${selectedIds.size} tài khoản đã chọn?`
        : `Đặt lại mật khẩu về "Demo@123" cho ${selectedIds.size} tài khoản?`;

    if (!window.confirm(confirmText)) return;

    try {
      setBatchActionLoading(true);
      const res = await api.batchUserActions(Array.from(selectedIds), action, 'Demo@123');
      setActionSuccessMsg(res.message);
      setSelectedIds(new Set());
      await fetchUsers();
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Lỗi thao tác hàng loạt: ' + err.message);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenSubmitting(true);
    try {
      const res = await api.generateBatchUsers({
        codePrefix: genPrefix,
        startNumber: Number(genStart),
        endNumber: Number(genEnd),
        className: genClassName,
        major: genMajor,
        cohort: genCohort,
        defaultPassword: 'Demo@123',
      });
      alert(res.message);
      setIsBatchGenModalOpen(false);
      await fetchUsers();
    } catch (err: any) {
      alert('Lỗi sinh tài khoản tự động: ' + err.message);
    } finally {
      setGenSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredUsers.length === 0) {
      alert('Không có dữ liệu để xuất.');
      return;
    }
    const headers = ['Email', 'FullName', 'Role', 'StudentCode', 'Cohort', 'Major', 'ClassName', 'Status'];
    const rows = filteredUsers.map((u) => [
      `"${u.email}"`,
      `"${u.full_name || ''}"`,
      `"${u.role}"`,
      `"${u.studentCode || ''}"`,
      `"${u.cohort || ''}"`,
      `"${u.major || ''}"`,
      `"${u.className || ''}"`,
      `"${(u.isActive ?? u.is_active) ? 'ACTIVE' : 'INACTIVE'}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `danh_sach_nguoi_dung_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetUserForm = () => {
    setNewUsername('');
    setNewEmail('');
    setNewFullName('');
    setNewPassword('Demo@123');
    setNewRole('STUDENT');
    setNewCohort('');
    setNewMajor('');
    setNewClassName('');
    setEditingUser(null);
    setShowPassword(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        const updated = await api.updateUser(editingUser.id, {
          email: newEmail,
          fullName: newFullName,
          cohort: newCohort || undefined,
          major: newMajor || undefined,
          className: newClassName || undefined,
        });
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      } else {
        const created = await api.createUser({
          username: newUsername,
          email: newEmail,
          full_name: newFullName,
          role: newRole,
          password: newPassword,
          cohort: newCohort || undefined,
          major: newMajor || undefined,
          className: newClassName || undefined,
        });
        setUsers((prev) => [created, ...prev]);
      }
      setIsModalOpen(false);
      resetUserForm();
    } catch (err: any) {
      alert((editingUser ? 'Lỗi cập nhật người dùng: ' : 'Lỗi tạo người dùng: ') + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) {
      alert('Vui lòng chọn tệp CSV để nhập dữ liệu.');
      return;
    }
    setBulkSubmitting(true);
    setBulkResult(null);
    try {
      const result = await api.bulkImportUsersCsv(bulkFile);
      setBulkResult(result);
      await fetchUsers();
    } catch (err: any) {
      alert('Lỗi nhập dữ liệu CSV: ' + err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Unique cohorts, majors, classes
  const uniqueCohorts = useMemo(() => Array.from(new Set(users.map((u) => u.cohort).filter(Boolean))) as string[], [users]);
  const uniqueMajors = useMemo(() => Array.from(new Set(users.map((u) => u.major).filter(Boolean))) as string[], [users]);
  const uniqueClasses = useMemo(() => Array.from(new Set(users.map((u) => u.className).filter(Boolean))) as string[], [users]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const query = search.toLowerCase();
      const matchesSearch =
        (u.full_name || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query) ||
        (u.studentCode || '').toLowerCase().includes(query) ||
        (u.className || '').toLowerCase().includes(query) ||
        (u.username || '').toLowerCase().includes(query);

      const matchesCohort = cohortFilter === 'ALL' || u.cohort === cohortFilter;
      const matchesMajor = majorFilter === 'ALL' || u.major === majorFilter;
      const matchesClass = classFilter === 'ALL' || u.className === classFilter;
      const isActive = u.isActive ?? u.is_active;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && isActive) ||
        (statusFilter === 'INACTIVE' && !isActive);

      return matchesSearch && matchesCohort && matchesMajor && matchesClass && matchesStatus;
    });
  }, [users, search, cohortFilter, majorFilter, classFilter, statusFilter]);

  // Paginated Users
  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Select all on current page
  const allCurrentPageSelected = paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedIds.has(String(u.id)));

  const toggleSelectAllCurrentPage = () => {
    const next = new Set(selectedIds);
    if (allCurrentPageSelected) {
      paginatedUsers.forEach((u) => next.delete(String(u.id)));
    } else {
      paginatedUsers.forEach((u) => next.add(String(u.id)));
    }
    setSelectedIds(next);
  };

  const toggleSelectUser = (id: string | number) => {
    const key = String(id);
    const next = new Set(selectedIds);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedIds(next);
  };

  const activeAdvancedCount = (cohortFilter !== 'ALL' ? 1 : 0) + (majorFilter !== 'ALL' ? 1 : 0) + (classFilter !== 'ALL' ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header & Automated Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Quản lý Tài khoản & Phân cấp</h1>
          <p className="text-sm text-slate-500">
            Tự động hóa quản trị sinh viên, phân bổ theo lớp sinh hoạt và nhập/xuất dữ liệu quy mô lớn
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Auto-Provisioning */}
          <button
            onClick={() => setIsBatchGenModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
            title="Tự động sinh tài khoản theo dải mã sinh viên mà không cần file Excel"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Sinh tài khoản tự động</span>
          </button>

          {/* Bulk Import */}
          <button
            onClick={() => {
              setBulkFile(null);
              setBulkResult(null);
              setIsBulkModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            <UploadCloud className="w-4 h-4 text-slate-600" />
            <span>Nhập CSV / Excel</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
            title="Xuất danh sách sinh viên theo bộ lọc hiện tại"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>Xuất CSV</span>
          </button>

          {/* Manual Single Create */}
          <button
            onClick={() => {
              resetUserForm();
              setIsModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tạo lẻ</span>
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        {/* Row 1: Search + Quick Role Chips + Advanced Toggle */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm họ tên, thư điện tử, mã SV, lớp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          {/* Role Chips */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'STUDENT', label: 'Sinh viên' },
              { id: 'LECTURER', label: 'Giảng viên' },
              { id: 'ADMIN', label: 'Quản trị' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setRoleFilter(chip.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  roleFilter === chip.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                showAdvancedFilters || activeAdvancedCount > 0
                  ? 'border-blue-300 bg-blue-50/60 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Phân cấp</span>
              {activeAdvancedCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeAdvancedCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Advanced Hierarchy Drawer / Collapsible */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs animate-in fade-in">
            <div className="flex items-center space-x-1.5 text-slate-500 font-semibold">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Lọc chi tiết:</span>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-slate-400">Khối:</span>
              <select
                value={cohortFilter}
                onChange={(e) => setCohortFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50/50 focus:bg-white"
              >
                <option value="ALL">Tất cả khối</option>
                {uniqueCohorts.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-slate-400">Ngành:</span>
              <select
                value={majorFilter}
                onChange={(e) => setMajorFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50/50 focus:bg-white"
              >
                <option value="ALL">Tất cả ngành</option>
                {uniqueMajors.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-slate-400">Lớp:</span>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50/50 focus:bg-white"
              >
                <option value="ALL">Tất cả lớp ({uniqueClasses.length})</option>
                {uniqueClasses.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-slate-400">Trạng thái:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50/50 focus:bg-white"
              >
                <option value="ALL">Tất cả</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="INACTIVE">Tạm khóa</option>
              </select>
            </div>

            {activeAdvancedCount > 0 && (
              <button
                onClick={() => {
                  setCohortFilter('ALL');
                  setMajorFilter('ALL');
                  setClassFilter('ALL');
                  setStatusFilter('ALL');
                }}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating / Sticky Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span>tài khoản đang được chọn</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBatchAction('ACTIVATE')}
              disabled={batchActionLoading}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Kích hoạt ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBatchAction('DEACTIVATE')}
              disabled={batchActionLoading}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Tạm khóa ({selectedIds.size})
            </button>
            <button
              onClick={() => handleBatchAction('RESET_PASSWORD')}
              disabled={batchActionLoading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Reset Pass
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={toggleSelectAllCurrentPage}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    title="Chọn tất cả trên trang này"
                  />
                </th>
                <th className="py-3 px-4">Họ và tên & Mã</th>
                <th className="py-3 px-4">Thư điện tử trường</th>
                <th className="py-3 px-4">Vai trò</th>
                <th className="py-3 px-4">Khối & Chuyên ngành</th>
                <th className="py-3 px-4">Lớp sinh hoạt</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Đang tải danh sách người dùng...
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Không tìm thấy người dùng phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const isSelected = selectedIds.has(String(u.id));
                  const isActive = u.isActive ?? u.is_active;
                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-50/60 transition ${isSelected ? 'bg-blue-50/30' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectUser(u.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 text-xs">{u.full_name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{u.studentCode || u.staffCode || `#${u.id}`}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                      <td className="py-3 px-4">
                        {u.role === 'ADMIN' && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-purple-100 text-purple-700">
                            Quản trị viên
                          </span>
                        )}
                        {u.role === 'LECTURER' && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-blue-100 text-blue-700">
                            Giảng viên
                          </span>
                        )}
                        {u.role === 'STUDENT' && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-100 text-emerald-700">
                            Sinh viên
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{u.major || '—'}</div>
                        <div className="text-[10px] text-slate-400">{u.cohort || ''}</div>
                      </td>
                      <td className="py-3 px-4">
                        {u.className ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700">
                            {u.className}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Chưa gán</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Hoạt động
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 mr-1" /> Tạm khóa
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          <button
                            onClick={() => {
                              setEditingUser(u);
                              setNewUsername(u.username || u.email.split('@')[0]);
                              setNewEmail(u.email);
                              setNewFullName(u.full_name || '');
                              setNewRole(u.role);
                              setNewCohort(u.cohort || '');
                              setNewMajor(u.major || '');
                              setNewClassName(u.className || '');
                              setIsModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition"
                            title="Sửa thông tin"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u.id)}
                            className={`p-1 rounded-lg transition ${
                              isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'
                            }`}
                            title={isActive ? 'Nhấn để tạm khóa' : 'Nhấn để kích hoạt'}
                          >
                            {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Hiển thị <strong>{paginatedUsers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> -{' '}
            <strong>{Math.min(currentPage * pageSize, filteredUsers.length)}</strong> trên tổng số{' '}
            <strong>{filteredUsers.length}</strong> tài khoản
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && p - arr[idx - 1] > 1 && <span className="px-1 text-slate-400">...</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    className={`w-7 h-7 rounded-lg font-semibold text-xs transition ${
                      currentPage === p
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Trang sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: Auto-Provisioning Batch Generator */}
      {isBatchGenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Sinh tài khoản tự động theo dải mã</h3>
                  <p className="text-xs text-slate-400">Tạo hàng loạt sinh viên cho một lớp chỉ với 1 cú click</p>
                </div>
              </div>
              <button onClick={() => setIsBatchGenModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleGenerateBatch} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Tiền tố mã SV</label>
                  <input
                    type="text"
                    required
                    value={genPrefix}
                    onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
                    placeholder="SV24CN"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold text-blue-600 uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Từ số</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={genStart}
                    onChange={(e) => setGenStart(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Đến số</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    required
                    value={genEnd}
                    onChange={(e) => setGenEnd(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Lớp sinh hoạt</label>
                <input
                  type="text"
                  required
                  value={genClassName}
                  onChange={(e) => setGenClassName(e.target.value)}
                  placeholder="24CNTT01"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Chuyên ngành</label>
                  <input
                    type="text"
                    value={genMajor}
                    onChange={(e) => setGenMajor(e.target.value)}
                    placeholder="Công nghệ thông tin"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Khối đào tạo</label>
                  <input
                    type="text"
                    value={genCohort}
                    onChange={(e) => setGenCohort(e.target.value)}
                    placeholder="Khối B (K2024)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-500">
                <p className="font-semibold text-slate-700">Dự kiến sinh ra:</p>
                <p>• Số lượng: <strong>{Math.max(0, genEnd - genStart + 1)}</strong> tài khoản</p>
                <p>• Mã mẫu: <code>{genPrefix}{String(genStart).padStart(2, '0')}</code> đến <code>{genPrefix}{String(genEnd).padStart(2, '0')}</code></p>
                <p>• Email mẫu: <code>{genPrefix.toLowerCase()}{String(genStart).padStart(2, '0')}@university.edu.vn</code></p>
                <p>• Mật khẩu mặc định: <code>Demo@123</code></p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBatchGenModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={genSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50 flex items-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{genSubmitting ? 'Đang khởi tạo...' : 'Tạo hàng loạt ngay'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Single User Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editingUser ? 'Cập nhật tài khoản' : 'Thêm người dùng mới'}
              </h3>
              <button onClick={() => { setIsModalOpen(false); resetUserForm(); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Vai trò</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    disabled={!!editingUser}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="STUDENT">Sinh viên</option>
                    <option value="LECTURER">Giảng viên</option>
                    <option value="ADMIN">Quản trị viên</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Thư điện tử trường</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="sv01@university.edu.vn"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Mật khẩu ban đầu</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Lớp sinh hoạt</label>
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="23CNTT01"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Chuyên ngành</label>
                  <input
                    type="text"
                    value={newMajor}
                    onChange={(e) => setNewMajor(e.target.value)}
                    placeholder="CNTT"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Khối</label>
                  <input
                    type="text"
                    value={newCohort}
                    onChange={(e) => setNewCohort(e.target.value)}
                    placeholder="Khối A (K2023)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); resetUserForm(); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Bulk CSV Import */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">Nhập tài khoản từ tệp CSV / Excel</h3>
              <button onClick={() => setIsBulkModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleBulkImportSubmit} className="space-y-4 mt-4 text-xs">
              <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-5 bg-slate-50/50 hover:bg-blue-50/20 transition text-center">
                <input
                  type="file"
                  id="bulkFileInput"
                  className="hidden"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setBulkFile(e.target.files[0]);
                      setBulkResult(null);
                    }
                  }}
                />

                {bulkFile ? (
                  <div className="bg-white p-3 rounded-xl border border-blue-200 flex items-center justify-between shadow-2xs">
                    <div className="text-left min-w-0">
                      <p className="font-bold text-slate-800 truncate">{bulkFile.name}</p>
                      <p className="text-slate-400">{(bulkFile.size / 1024).toFixed(1)} KB • Sẵn sàng nạp</p>
                    </div>
                    <label
                      htmlFor="bulkFileInput"
                      className="cursor-pointer px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                    >
                      Đổi tệp
                    </label>
                  </div>
                ) : (
                  <label htmlFor="bulkFileInput" className="cursor-pointer block">
                    <UploadCloud className="w-10 h-10 text-blue-500 mx-auto mb-2" />
                    <p className="font-bold text-slate-700">Nhấn để chọn tệp CSV từ máy tính</p>
                    <p className="text-slate-400 mt-1">Định dạng chuẩn: Email, FullName, Role, StudentCode, Cohort, Major, ClassName</p>
                  </label>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-xl text-slate-600 space-y-1">
                <div className="font-semibold text-slate-700 flex items-center justify-between">
                  <span>Quy cách tệp CSV chuẩn:</span>
                  <a
                    href="/sample_users_bulk_import.csv"
                    download
                    className="text-blue-600 hover:underline inline-flex items-center space-x-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải mẫu</span>
                  </a>
                </div>
                <p>• Nếu tài khoản đã tồn tại (trùng email), hệ thống sẽ cập nhật Khối, Ngành, Lớp.</p>
                <p>• Mật khẩu nếu để trống sẽ tự động đặt mặc định là <code>Demo@123</code>.</p>
              </div>

              {bulkResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Nhập dữ liệu thành công!</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-slate-400 text-[10px]">Đã xử lý</div>
                      <div className="text-sm font-bold text-slate-800">{bulkResult.totalProcessed}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-slate-400 text-[10px]">Tạo mới</div>
                      <div className="text-sm font-bold text-emerald-600">+{bulkResult.createdCount}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-slate-400 text-[10px]">Cập nhật</div>
                      <div className="text-sm font-bold text-blue-600">{bulkResult.updatedCount}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting || !bulkFile}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{bulkSubmitting ? 'Đang nhập...' : 'Bắt đầu nạp dữ liệu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
