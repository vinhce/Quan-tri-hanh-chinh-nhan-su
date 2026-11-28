'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Users,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  getWorkItemsForActor,
  updateWorkItem,
} from '@/lib/hrm/work-items-store';
import type {
  Employee,
  RoleCode,
  WorkItem,
  WorkItemStatus,
} from '@/mock/types';

export interface TodayWorkCardProps {
  role: RoleCode;
  actorEmployee: Employee | null;
  employees: Employee[];
  managedDepartmentIds?: string[];
  workItems: WorkItem[];
  pendingApprovalsCount: number;
  activeHandoversCount: number;
  onNavigate: (navId: string) => void;
}

const STATUS_META: Record<
  WorkItemStatus,
  { label: string; variant: BadgeVariant }
> = {
  TODO: { label: 'Chờ làm', variant: 'secondary' },
  IN_PROGRESS: { label: 'Đang làm', variant: 'teal' },
  BLOCKED: { label: 'Đang vướng', variant: 'warning' },
  DONE: { label: 'Hoàn tất', variant: 'success' },
};

const ROLE_CARD_DESC: Record<string, string> = {
  SUPER_ADMIN: 'Chọn nhân viên để tra cứu đầu việc (chỉ xem), theo dõi bàn giao & vận hành',
  DIRECTOR: 'Chọn nhân viên để theo dõi đầu việc (chỉ xem) & phê duyệt cấp Giám đốc',
  HR_MANAGER: 'Chọn nhân viên để kiểm tra đầu việc, hồ sơ chờ duyệt & bàn giao nhân sự ra',
  DEPT_MANAGER: 'Chọn nhân sự trong phòng ban quản lý để theo dõi & nghiệm thu đầu việc',
  EMPLOYEE: 'Danh sách công việc đang chạy hôm nay của riêng bạn',
};

export function TodayWorkCard({
  role,
  actorEmployee,
  employees,
  managedDepartmentIds,
  workItems,
  pendingApprovalsCount,
  activeHandoversCount,
  onNavigate,
}: TodayWorkCardProps) {
  const isSelectorRole =
    role === 'SUPER_ADMIN' ||
    role === 'DIRECTOR' ||
    role === 'HR_MANAGER' ||
    role === 'DEPT_MANAGER';
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  useEffect(() => {
    setSelectedEmployeeId('');
  }, [role, actorEmployee?.id]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [employees]);

  const allowedDeptIds = useMemo(() => {
    const depts = new Set<string>();
    if (managedDepartmentIds && managedDepartmentIds.length > 0) {
      for (const id of managedDepartmentIds) depts.add(id);
    } else if (actorEmployee?.department_id) {
      depts.add(actorEmployee.department_id);
    }
    return depts;
  }, [managedDepartmentIds, actorEmployee?.department_id]);

  const scopedItems = useMemo(
    () =>
      getWorkItemsForActor({
        role,
        actorEmployee,
        employees,
        managedDepartmentIds,
        allWorkItems: workItems,
      }),
    [role, actorEmployee, employees, managedDepartmentIds, workItems]
  );

  const openCountByEmpId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of scopedItems) {
      if (item.status === 'DONE') continue;
      counts.set(item.owner_employee_id, (counts.get(item.owner_employee_id) ?? 0) + 1);
    }
    return counts;
  }, [scopedItems]);

  const selectableEmployees = useMemo(() => {
    if (!isSelectorRole) return [];
    const base =
      role === 'DEPT_MANAGER'
        ? employees.filter(
            (emp) =>
              emp.id === actorEmployee?.id ||
              emp.manager_id === actorEmployee?.id ||
              Boolean(emp.department_id && allowedDeptIds.has(emp.department_id))
          )
        : employees;
    return [...base].sort((a, b) => {
      const diff = (openCountByEmpId.get(b.id) ?? 0) - (openCountByEmpId.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return a.full_name.localeCompare(b.full_name, 'vi');
    });
  }, [isSelectorRole, role, employees, actorEmployee?.id, allowedDeptIds, openCountByEmpId]);

  const displayedItems = useMemo(() => {
    if (!isSelectorRole) return scopedItems;
    if (selectedEmployeeId) {
      const targetEmp = employeeById.get(selectedEmployeeId);
      return scopedItems.filter(
        (w) =>
          w.owner_employee_id === selectedEmployeeId ||
          Boolean(targetEmp && w.owner_employee_code === targetEmp.employee_code)
      );
    }
    if (!actorEmployee) return [];
    return scopedItems.filter(
      (w) =>
        w.owner_employee_id === actorEmployee.id ||
        w.owner_employee_code === actorEmployee.employee_code
    );
  }, [isSelectorRole, scopedItems, selectedEmployeeId, employeeById, actorEmployee]);

  if (role === 'CANDIDATE') {
    return null;
  }

  const activeItems = displayedItems
    .filter((w) => w.status !== 'DONE')
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const doneCount = displayedItems.length - activeItems.length;
  const blockedCount = activeItems.filter((w) => w.status === 'BLOCKED').length;

  const isViewingOtherReadOnly =
    isSelectorRole &&
    role !== 'DEPT_MANAGER' &&
    Boolean(selectedEmployeeId) &&
    selectedEmployeeId !== actorEmployee?.id;

  const canQuickUpdate = (item: WorkItem): boolean => {
    if (
      actorEmployee &&
      (item.owner_employee_id === actorEmployee.id ||
        item.owner_employee_code === actorEmployee.employee_code)
    ) {
      return true;
    }
    if (role === 'DEPT_MANAGER' && actorEmployee) {
      const ownerEmp = employeeById.get(item.owner_employee_id);
      return Boolean(
        ownerEmp?.manager_id === actorEmployee.id ||
          (ownerEmp?.department_id && allowedDeptIds.has(ownerEmp.department_id)) ||
          (item.department_id && allowedDeptIds.has(item.department_id))
      );
    }
    return false;
  };

  const handleCycleStatus = (item: WorkItem) => {
    if (!canQuickUpdate(item)) return;
    const nextStatus: WorkItemStatus =
      item.status === 'TODO'
        ? 'IN_PROGRESS'
        : item.status === 'IN_PROGRESS'
          ? 'DONE'
          : 'IN_PROGRESS';
    const nextProgress =
      nextStatus === 'DONE'
        ? 100
        : Math.max(item.progress_percent, 25);
    updateWorkItem(item.id, {
      status: nextStatus,
      progress_percent: nextProgress,
    });
  };

  return (
    <Card className="w-[100%] border-[1px] border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-zinc-900/70">
      <CardHeader className="flex flex-col gap-[0.75rem] border-b-[1px] border-[#E1ECE8] pb-[0.875rem] sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div className="space-y-[0.25rem]">
          <CardTitle className="flex items-center gap-[0.5rem] text-[1rem] font-semibold text-[#11221E] dark:text-zinc-100">
            <ClipboardList className="h-[1.125rem] w-[1.125rem] text-[#0F766E] dark:text-teal-400" strokeWidth={1.75} />
            <span>Việc cần làm hôm nay</span>
          </CardTitle>
          <CardDescription className="text-[0.8125rem] text-[#415A54] dark:text-zinc-400">
            {ROLE_CARD_DESC[role] ?? ROLE_CARD_DESC.EMPLOYEE}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-[0.5rem]">
          <Badge variant="teal" className="text-[0.75rem]">
            Đang mở: {activeItems.length}
          </Badge>
          <Badge variant="success" className="text-[0.75rem]">
            Hoàn tất: {doneCount}
          </Badge>
          {blockedCount > 0 && (
            <Badge variant="warning" className="text-[0.75rem]">
              Vướng: {blockedCount}
            </Badge>
          )}
          {(role === 'DEPT_MANAGER' ||
            role === 'HR_MANAGER' ||
            role === 'DIRECTOR' ||
            role === 'SUPER_ADMIN') &&
            pendingApprovalsCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('leaves')}
                className="border-[1px] text-[0.75rem]"
              >
                Đơn chờ duyệt ({pendingApprovalsCount})
                <ArrowUpRight className="ml-[0.25rem] h-[0.875rem] w-[0.875rem]" />
              </Button>
            )}
          {activeHandoversCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('offboarding')}
              className="border-[1px] text-[0.75rem]"
            >
              Bàn giao việc ({activeHandoversCount})
              <ArrowUpRight className="ml-[0.25rem] h-[0.875rem] w-[0.875rem]" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-[0.75rem] p-[1rem]">
        {isSelectorRole && (
          <div className="flex flex-col gap-[0.5rem] rounded-xl border-[1px] border-[#D5E3DF] bg-[#F7FBF9] p-[0.625rem] sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950/60">
            <label
              htmlFor="today-work-employee-select"
              className="flex items-center gap-[0.375rem] text-[0.75rem] font-medium text-[#415A54] dark:text-zinc-300"
            >
              <Users className="h-[0.875rem] w-[0.875rem] text-[#0F766E] dark:text-teal-400" />
              <span>Xem đầu việc theo nhân viên:</span>
            </label>
            <div className="flex w-[100%] items-center gap-[0.5rem] sm:w-[60%]">
              <select
                id="today-work-employee-select"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-[100%] rounded-lg border-[1px] border-[#C6D9D3] bg-[#FFFFFF] px-[0.625rem] py-[0.375rem] text-[0.8125rem] text-[#11221E] focus:outline-none focus:ring-2 focus:ring-[#0F766E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">-- Chọn nhân viên (mặc định: chỉ việc của tôi) --</option>
                {selectableEmployees.map((emp) => {
                  const openCount = openCountByEmpId.get(emp.id) ?? 0;
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_code})
                      {openCount > 0 ? ` · ${openCount} việc mở` : ''}
                    </option>
                  );
                })}
              </select>
              {isViewingOtherReadOnly && (
                <Badge variant="secondary" className="shrink-0 text-[0.75rem]">
                  Chỉ xem
                </Badge>
              )}
            </div>
          </div>
        )}

        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[0.5rem] rounded-xl border-[1px] border-dashed border-[#C6D9D3] py-[1.5rem] text-center dark:border-zinc-800">
            {isSelectorRole && !selectedEmployeeId ? (
              <>
                <Users className="h-[1.5rem] w-[1.5rem] text-[#0F766E] dark:text-teal-400" />
                <p className="text-[0.875rem] font-medium text-[#11221E] dark:text-zinc-200">
                  Chưa chọn nhân viên. Chọn nhân viên từ danh sách phía trên để xem đầu việc chi tiết.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-[1.5rem] w-[1.5rem] text-emerald-600 dark:text-emerald-400" />
                <p className="text-[0.875rem] font-medium text-[#11221E] dark:text-zinc-200">
                  Không còn đầu việc dở dang trong phạm vi của bạn hôm nay.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-[0.625rem]">
            {activeItems.slice(0, 6).map((item) => {
              const meta = STATUS_META[item.status];
              const ownerEmp = employeeById.get(item.owner_employee_id);
              const ownerLabel = ownerEmp
                ? `${ownerEmp.full_name} (${ownerEmp.employee_code})`
                : (item.owner_employee_code ?? item.owner_employee_id);
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-[0.625rem] rounded-xl border-[1px] border-[#D5E3DF] bg-[#F7FBF9] p-[0.75rem] sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950/60"
                >
                  <div className="min-w-0 space-y-[0.25rem]">
                    <div className="flex flex-wrap items-center gap-[0.5rem]">
                      <Badge variant={meta.variant} className="text-[0.75rem]">
                        {meta.label}
                      </Badge>
                      <span className="text-[0.875rem] font-semibold text-[#11221E] dark:text-zinc-100">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-[0.75rem] gap-y-[0.25rem] text-[0.75rem] text-[#415A54] dark:text-zinc-400">
                      {role !== 'EMPLOYEE' && <span>Phụ trách: {ownerLabel}</span>}
                      <span className="inline-flex items-center gap-[0.25rem] font-mono tabular-nums">
                        <Clock3 className="h-[0.75rem] w-[0.75rem]" />
                        Hạn {item.due_date}
                      </span>
                      <span className="font-mono tabular-nums">
                        Tiến độ: {item.progress_percent}% · Trọng số: {item.weight}%
                      </span>
                    </div>
                    {item.handoff_checkpoint && (
                      <p className="flex items-start gap-[0.375rem] text-[0.75rem] text-[#5C7871] dark:text-zinc-400">
                        <AlertCircle className="mt-[0.125rem] h-[0.75rem] w-[0.75rem] shrink-0" />
                        <span className="truncate">{item.handoff_checkpoint}</span>
                      </p>
                    )}
                  </div>

                  {canQuickUpdate(item) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCycleStatus(item)}
                      className="shrink-0 border-[1px] text-[0.75rem]"
                    >
                      {item.status === 'IN_PROGRESS' ? 'Đánh dấu xong' : 'Bắt đầu làm'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
