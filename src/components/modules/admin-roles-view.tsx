'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Lock,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Unlock,
  Users,
} from 'lucide-react';
import { useApp, type RoleCode } from '@/context/app-context';
import { fetchAdminMock } from '@/lib/mock-fetcher';
import type {
  PermissionMatrixRow,
  RoleDefinition,
  SystemUserAccount,
} from '@/mock/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type PermissionActionKey = 'view' | 'create' | 'edit' | 'approve' | 'delete' | 'export';

const PERMISSION_COLUMNS: Array<{ key: PermissionActionKey; label: string }> = [
  { key: 'view', label: 'Xem' },
  { key: 'create', label: 'Tạo mới' },
  { key: 'edit', label: 'Chỉnh sửa' },
  { key: 'approve', label: 'Phê duyệt' },
  { key: 'delete', label: 'Xóa' },
  { key: 'export', label: 'Xuất file' },
];

const ROLE_BADGE_MAP: Record<RoleCode, { label: string; variant: 'teal' | 'default' | 'secondary' | 'outline' }> = {
  SUPER_ADMIN: { label: 'SUPER_ADMIN', variant: 'teal' },
  HR_MANAGER: { label: 'HR_MANAGER', variant: 'default' },
  DEPT_MANAGER: { label: 'DEPT_MANAGER', variant: 'secondary' },
  EMPLOYEE: { label: 'EMPLOYEE', variant: 'outline' },
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function AdminRolesView() {
  const { showToast, currentUserEmail, currentUserProfile } = useApp();
  const [selectedRole, setSelectedRole] = useState<RoleCode>('HR_MANAGER');
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [matrix, setMatrix] = useState<PermissionMatrixRow[]>([]);
  const [users, setUsers] = useState<SystemUserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const loadData = useCallback(async (bypassCache = false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminMock({ bypassCache });
      setRoles(data.MOCK_ROLES);
      setMatrix(
        data.MOCK_PERMISSION_MATRIX.map((row) => ({
          ...row,
          permissions: {
            SUPER_ADMIN: { ...row.permissions.SUPER_ADMIN },
            HR_MANAGER: { ...row.permissions.HR_MANAGER },
            DEPT_MANAGER: { ...row.permissions.DEPT_MANAGER },
            EMPLOYEE: { ...row.permissions.EMPLOYEE },
          },
        }))
      );
      setUsers([...data.MOCK_SYSTEM_USERS]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không thể tải dữ liệu phân quyền.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeRoleInfo = useMemo(
    () => roles.find((r) => r.role_code === selectedRole) ?? roles[0],
    [roles, selectedRole]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      const matchRole = roleFilter === 'ALL' || u.role_code === roleFilter;
      const matchQuery =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.employee_code.toLowerCase().includes(q) ||
        u.department_name.toLowerCase().includes(q);
      return matchRole && matchQuery;
    });
  }, [users, userSearch, roleFilter]);

  const activeUsersCount = useMemo(
    () => users.filter((u) => u.account_status === 'ACTIVE').length,
    [users]
  );
  const mfaUsersCount = useMemo(() => users.filter((u) => u.mfa_enabled).length, [users]);

  const isSuperAdminSelected = selectedRole === 'SUPER_ADMIN';

  const handleTogglePermission = (
    moduleCode: string,
    action: PermissionActionKey,
    nextVal: boolean
  ) => {
    if (selectedRole === 'SUPER_ADMIN') return;
    setMatrix((prev) =>
      prev.map((row) => {
        if (row.module_code !== moduleCode) return row;
        return {
          ...row,
          permissions: {
            ...row.permissions,
            [selectedRole]: {
              ...row.permissions[selectedRole],
              [action]: nextVal,
            },
          },
        };
      })
    );
  };

  const handleSaveMatrix = () => {
    showToast(
      'Đã lưu ma trận phân quyền RBAC',
      `Cập nhật quyền truy cập cho vai trò ${selectedRole} thành công.`,
      'success'
    );
  };

  const handleToggleLockUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const isSelf =
      target.employee_code === 'NV-2024-001' ||
      (Boolean(currentUserEmail) &&
        target.email.toLowerCase() === currentUserEmail?.toLowerCase()) ||
      (Boolean(currentUserProfile?.employee_code) &&
        target.employee_code === currentUserProfile?.employee_code);
    if (isSelf) return;
    const nextStatus = target.account_status === 'LOCKED' ? 'ACTIVE' : 'LOCKED';
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, account_status: nextStatus } : u))
    );
    showToast(
      nextStatus === 'LOCKED' ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản',
      `${target.full_name} (${target.employee_code}) hiện ở trạng thái ${
        nextStatus === 'LOCKED' ? 'Tạm khóa' : 'Hoạt động'
      }.`,
      nextStatus === 'LOCKED' ? 'warning' : 'success'
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{loadError}</p>
          <Button variant="outline" onClick={() => void loadData(true)}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Phân quyền RBAC & Tài khoản hệ thống
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Kiểm soát quyền hạn chi tiết theo vai trò và trạng thái bảo mật tài khoản nội bộ.
          </p>
        </div>
        <Button onClick={handleSaveMatrix} className="shrink-0">
          <Save className="h-4 w-4" strokeWidth={1.5} />
          Lưu ma trận phân quyền
        </Button>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tổng vai trò RBAC
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {roles.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400">
              <Shield className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tài khoản đang hoạt động
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {activeUsersCount} / {users.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-400">
              <Users className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500 dark:border-l-violet-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tài khoản bật xác thực MFA
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                {mfaUsersCount} / {users.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-950/30 dark:text-violet-400">
              <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix">Ma trận phân quyền RBAC</TabsTrigger>
          <TabsTrigger value="accounts">Danh sách tài khoản ({users.length})</TabsTrigger>
        </TabsList>

        {/* Tab 1: RBAC Matrix */}
        <TabsContent value="matrix" className="space-y-4">
          {/* Role selector cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {roles.map((roleDef) => {
              const isSelected = roleDef.role_code === selectedRole;
              return (
                <button
                  key={roleDef.role_code}
                  type="button"
                  onClick={() => setSelectedRole(roleDef.role_code)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-teal-700 bg-teal-50/50 dark:border-teal-400 dark:bg-teal-950/20'
                      : 'border-zinc-200/80 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:bg-[#121214] dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={isSelected ? 'teal' : 'secondary'}>
                      {roleDef.role_code}
                    </Badge>
                    <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      {roleDef.users_count} người dùng
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {roleDef.role_name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                    {roleDef.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Matrix Table */}
          <Card>
            <CardHeader className="flex flex-col gap-2 border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
                  Ma trận quyền hạn: {activeRoleInfo?.role_name ?? selectedRole}
                </CardTitle>
                <CardDescription className="mt-1">
                  Bật hoặc tắt trực tiếp từng thao tác trên các phân hệ cho vai trò{' '}
                  <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                    {selectedRole}
                  </span>
                  .
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleSaveMatrix} disabled={isSuperAdminSelected}>
                <Save className="h-4 w-4" strokeWidth={1.5} />
                Lưu thay đổi
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isSuperAdminSelected && (
                <div className="border-b border-teal-500/20 bg-teal-50/60 px-5 py-2.5 text-xs font-medium text-teal-800 dark:border-teal-400/20 dark:bg-teal-950/20 dark:text-teal-300">
                  Quản trị Hệ thống (Super Admin) có toàn quyền mặc định và không thể tự tắt quyền của bản thân.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="px-5 py-3">Phân hệ chức năng</th>
                      <th className="px-4 py-3">Nhóm</th>
                      {PERMISSION_COLUMNS.map((col) => (
                        <th key={col.key} className="px-4 py-3 text-center">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                    {matrix.map((row) => {
                      const rolePerms = row.permissions[selectedRole];
                      return (
                        <tr
                          key={row.module_code}
                          className="transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">
                              {row.module_name}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                              {row.module_code}
                            </p>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant="outline" className="whitespace-nowrap">
                              {row.category}
                            </Badge>
                          </td>
                          {PERMISSION_COLUMNS.map((col) => (
                            <td key={col.key} className="px-4 py-3.5 text-center">
                              <div className="inline-flex items-center justify-center">
                                <Switch
                                  checked={isSuperAdminSelected ? true : rolePerms[col.key]}
                                  disabled={isSuperAdminSelected}
                                  onCheckedChange={(checked) =>
                                    handleTogglePermission(row.module_code, col.key, checked)
                                  }
                                  aria-label={`${col.label} - ${row.module_name}`}
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: System Accounts */}
        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Tài khoản truy cập hệ thống</CardTitle>
                  <CardDescription className="mt-1">
                    Theo dõi phiên đăng nhập gần nhất, trạng thái MFA và khóa/mở khóa tài khoản.
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-64">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                      strokeWidth={1.5}
                    />
                    <Input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Tìm tên, email, mã NV..."
                      className="pl-9"
                    />
                  </div>
                  <div className="w-full sm:w-44">
                    <Select
                      value={roleFilter}
                      onValueChange={setRoleFilter}
                      options={[
                        { label: 'Tất cả vai trò', value: 'ALL' },
                        { label: 'SUPER_ADMIN', value: 'SUPER_ADMIN' },
                        { label: 'HR_MANAGER', value: 'HR_MANAGER' },
                        { label: 'DEPT_MANAGER', value: 'DEPT_MANAGER' },
                        { label: 'EMPLOYEE', value: 'EMPLOYEE' },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="whitespace-nowrap px-4 py-3">Mã NV</th>
                      <th className="px-4 py-3">Nhân sự</th>
                      <th className="px-4 py-3">Phòng ban</th>
                      <th className="px-4 py-3">Vai trò</th>
                      <th className="px-4 py-3">MFA</th>
                      <th className="px-4 py-3">Đăng nhập gần nhất</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                    {filteredUsers.map((account) => {
                      const roleMeta = ROLE_BADGE_MAP[account.role_code];
                      const isLocked = account.account_status === 'LOCKED';
                      const isSelfAccount =
                        account.employee_code === 'NV-2024-001' ||
                        (Boolean(currentUserEmail) &&
                          account.email.toLowerCase() === currentUserEmail?.toLowerCase()) ||
                        (Boolean(currentUserProfile?.employee_code) &&
                          account.employee_code === currentUserProfile?.employee_code);
                      return (
                        <tr
                          key={account.id}
                          className="transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                        >
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                            {account.employee_code}
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">
                              {account.full_name}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {account.email}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-zinc-600 dark:text-zinc-300">
                            {account.department_name}
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant={roleMeta.variant}>{roleMeta.label}</Badge>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant={account.mfa_enabled ? 'success' : 'warning'}>
                              {account.mfa_enabled ? 'Đã bật' : 'Chưa bật'}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                            {formatTimestamp(account.last_login_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                            {account.last_login_ip}
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant={isLocked ? 'destructive' : 'success'}>
                              {isLocked ? 'Đã khóa' : 'Hoạt động'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {isSelfAccount ? (
                              <Button variant="outline" size="sm" disabled>
                                Đang đăng nhập
                              </Button>
                            ) : (
                              <Button
                                variant={isLocked ? 'outline' : 'secondary'}
                                size="sm"
                                onClick={() => handleToggleLockUser(account.id)}
                              >
                                {isLocked ? (
                                  <>
                                    <Unlock className="h-4 w-4" strokeWidth={1.5} />
                                    Mở khóa
                                  </>
                                ) : (
                                  <>
                                    <Lock className="h-4 w-4" strokeWidth={1.5} />
                                    Khóa
                                  </>
                                )}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                        >
                          Không tìm thấy tài khoản nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
