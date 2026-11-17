'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import {
  AUDIT_UPDATED_EVENT,
  clearRuntimeAuditLogs,
  getRuntimeAuditLogs,
} from '@/lib/audit-logger';
import { fetchAdminMock } from '@/lib/mock-fetcher';
import type { AuditLogEntry } from '@/mock/types';
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

const STATUS_BADGE: Record<
  AuditLogEntry['status'],
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  SUCCESS: { label: 'Hợp lệ', variant: 'success' },
  WARNING: { label: 'Cảnh báo', variant: 'warning' },
  BLOCKED: { label: 'Đã chặn', variant: 'destructive' },
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  HR_MANAGER: 'Trưởng phòng Nhân sự',
  DEPT_MANAGER: 'Trưởng bộ phận',
  EMPLOYEE: 'Nhân viên chính thức',
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Đăng nhập hệ thống',
  FAILED_LOGIN: 'Đăng nhập thất bại',
  APPROVE: 'Phê duyệt đơn từ',
  APPROVE_LEAVE: 'Phê duyệt đơn từ',
  REJECT: 'Từ chối đơn từ',
  CANCEL: 'Hủy đơn từ',
  LOCK_PAYROLL: 'Chốt bảng lương',
  EXPORT_SALARY: 'Xuất bảng lương',
  EXPORT_PAYROLL: 'Xuất bảng lương',
  UPDATE_PERMISSION: 'Cập nhật phân quyền',
  UPDATE_SETTINGS: 'Cập nhật cấu hình',
  CREATE_RECORD: 'Tạo dữ liệu mới',
  UPDATE_RECORD: 'Cập nhật dữ liệu',
  DELETE_RECORD: 'Xóa dữ liệu',
  AI_CV_SCREEN: 'AI chấm điểm CV',
  UPDATE_CONTRACT: 'Cập nhật hợp đồng',
  CREATE_REQUEST: 'Tạo đơn từ mới',
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

export function AdminAuditView() {
  const { showToast } = useApp();
  const [baseLogs, setBaseLogs] = useState<AuditLogEntry[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = useCallback(async (bypassCache = false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminMock({ bypassCache });
      setBaseLogs(data.MOCK_AUDIT_LOGS);
      setRuntimeLogs(getRuntimeAuditLogs());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không thể tải nhật ký bảo mật.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const handleAuditUpdate = () => {
      setRuntimeLogs(getRuntimeAuditLogs());
    };
    window.addEventListener(AUDIT_UPDATED_EVENT, handleAuditUpdate);
    return () => window.removeEventListener(AUDIT_UPDATED_EVENT, handleAuditUpdate);
  }, []);

  const auditLogs = useMemo(() => [...runtimeLogs, ...baseLogs], [runtimeLogs, baseLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return auditLogs.filter((log) => {
      let matchAction = true;
      if (actionFilter === 'APPROVE') {
        matchAction = log.action === 'APPROVE_LEAVE' || (log.action as string) === 'APPROVE';
      } else if (actionFilter === 'EXPORT_PAYROLL') {
        matchAction =
          log.action === 'EXPORT_SALARY' ||
          log.action === 'LOCK_PAYROLL' ||
          (log.action as string) === 'EXPORT_PAYROLL';
      } else if (actionFilter === 'FAILED_LOGIN') {
        matchAction = log.status === 'BLOCKED' || log.status === 'WARNING';
      } else if (actionFilter !== 'ALL') {
        matchAction = (log.action as string) === actionFilter;
      }

      const matchRole = roleFilter === 'ALL' || log.actor_role === roleFilter;
      const matchQuery =
        !q ||
        log.target_entity.toLowerCase().includes(q) ||
        log.ip_address.toLowerCase().includes(q) ||
        log.actor_name.toLowerCase().includes(q) ||
        log.actor_employee_code.toLowerCase().includes(q) ||
        log.detail.toLowerCase().includes(q);

      return matchAction && matchRole && matchQuery;
    });
  }, [auditLogs, actionFilter, roleFilter, searchQuery]);

  const counts = useMemo(() => {
    const total = auditLogs.length;
    const success = auditLogs.filter((l) => l.status === 'SUCCESS').length;
    const warning = auditLogs.filter((l) => l.status === 'WARNING').length;
    const blocked = auditLogs.filter((l) => l.status === 'BLOCKED').length;
    return { total, success, warning, blocked };
  }, [auditLogs]);

  const handleExportCsv = () => {
    showToast(
      'Đã xuất nhật ký bảo mật',
      `Tệp audit-logs-${new Date().toISOString().slice(0, 10)}.csv (${filteredLogs.length} bản ghi) đã sẵn sàng.`,
      'success'
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
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
            Nhật ký bảo mật (Audit Logs)
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Truy vết toàn bộ thao tác nhạy cảm, thay đổi phân quyền, xuất dữ liệu lương và cảnh báo truy cập trái phép.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runtimeLogs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearRuntimeAuditLogs();
                showToast('Đã xóa log phiên', 'Các bản ghi thao tác trong phiên hiện tại đã được dọn dẹp.', 'default');
              }}
            >
              Xóa log phiên ({runtimeLogs.length})
            </Button>
          )}
          <Button variant="outline" onClick={handleExportCsv} className="shrink-0">
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Xuất nhật ký CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tổng sự kiện ghi nhận
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {counts.total}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400">
              <Activity className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Hợp lệ (Success)
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {counts.success}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Cảnh báo (Warning)
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {counts.warning}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500 dark:border-l-rose-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Đã chặn (Blocked)
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {counts.blocked}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-50 text-rose-600 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-400">
              <ShieldAlert className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Dòng sự kiện kiểm toán hệ thống</CardTitle>
              <CardDescription className="mt-1">
                Hiển thị {filteredLogs.length} / {auditLogs.length} sự kiện theo bộ lọc hiện tại.
              </CardDescription>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
              <div className="relative sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm Target, IP, nhân sự..."
                  className="pl-9"
                />
              </div>
              <Select
                value={actionFilter}
                onValueChange={setActionFilter}
                options={[
                  { label: 'Tất cả hành động', value: 'ALL' },
                  { label: 'Đăng nhập hệ thống', value: 'LOGIN' },
                  { label: 'Phê duyệt đơn từ', value: 'APPROVE' },
                  { label: 'Từ chối đơn từ', value: 'REJECT' },
                  { label: 'Hủy đơn từ', value: 'CANCEL' },
                  { label: 'Tạo đơn mới', value: 'CREATE_REQUEST' },
                  { label: 'Tạo dữ liệu mới', value: 'CREATE_RECORD' },
                  { label: 'Cập nhật dữ liệu', value: 'UPDATE_RECORD' },
                  { label: 'Xóa dữ liệu', value: 'DELETE_RECORD' },
                  { label: 'Cập nhật phân quyền', value: 'UPDATE_PERMISSION' },
                  { label: 'Cập nhật cấu hình', value: 'UPDATE_SETTINGS' },
                  { label: 'Xuất bảng lương', value: 'EXPORT_PAYROLL' },
                  { label: 'AI chấm điểm CV', value: 'AI_CV_SCREEN' },
                  { label: 'Đăng nhập thất bại / Bị chặn', value: 'FAILED_LOGIN' },
                ]}
              />
              <Select
                value={roleFilter}
                onValueChange={setRoleFilter}
                options={[
                  { label: 'Tất cả vai trò', value: 'ALL' },
                  { label: 'Quản trị hệ thống', value: 'SUPER_ADMIN' },
                  { label: 'Trưởng phòng Nhân sự', value: 'HR_MANAGER' },
                  { label: 'Trưởng bộ phận', value: 'DEPT_MANAGER' },
                  { label: 'Nhân viên chính thức', value: 'EMPLOYEE' },
                ]}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <th className="whitespace-nowrap px-4 py-3">Thời gian</th>
                  <th className="whitespace-nowrap px-4 py-3">Mã NV</th>
                  <th className="px-4 py-3">Người thực hiện</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Hành động</th>
                  <th className="px-4 py-3">Đối tượng tác động</th>
                  <th className="whitespace-nowrap px-4 py-3">Địa chỉ IP</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                {filteredLogs.map((log) => {
                  const statusMeta = STATUS_BADGE[log.status];
                  return (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                        {log.actor_employee_code}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {log.actor_name}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className="whitespace-nowrap text-xs">
                          {ROLE_LABELS[log.actor_role] ?? log.actor_role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {ACTION_LABELS[log.action] ?? log.module}
                        </p>
                        <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {log.action}
                        </p>
                      </td>
                      <td className="max-w-xs px-4 py-3.5">
                        <p className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                          {log.target_entity}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {log.detail}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                        {log.ip_address}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                    >
                      Không có bản ghi nhật ký nào phù hợp với điều kiện lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
