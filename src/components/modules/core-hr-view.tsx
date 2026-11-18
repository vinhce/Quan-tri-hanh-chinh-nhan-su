'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  FileText,
  Network,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  generateNextEmployeeCode,
  HRM_RUNTIME_EVENT,
  mergeWithRuntimeEmployees,
  saveRuntimeEmployee,
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import type {
  ContractStatus,
  ContractType,
  Department,
  Employee,
  EmploymentContract,
  EmploymentStatus,
  Position,
} from '@/mock/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge, BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type CoreHrTab = 'employees' | 'org' | 'contracts';

interface CoreHrViewProps {
  defaultTab?: CoreHrTab;
}

const EMP_STATUS_MAP: Record<EmploymentStatus, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Đang làm việc', variant: 'success' },
  PROBATION: { label: 'Thử việc', variant: 'info' },
  ON_LEAVE: { label: 'Nghỉ phép dài hạn', variant: 'warning' },
  RESIGNED: { label: 'Đã nghỉ việc', variant: 'muted' },
};

const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  INDEFINITE_TERM: 'Không xác định thời hạn',
  FIXED_TERM_12M: 'Xác định thời hạn 12 tháng',
  FIXED_TERM_24M: 'Xác định thời hạn 24 tháng',
  PROBATION_2M: 'Thử việc 2 tháng',
};

const CONTRACT_STATUS_MAP: Record<ContractStatus, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Đang hiệu lực', variant: 'success' },
  EXPIRING_SOON: { label: 'Sắp hết hạn', variant: 'warning' },
  EXPIRED: { label: 'Đã hết hạn', variant: 'danger' },
  PENDING_SIGN: { label: 'Chờ ký kết', variant: 'info' },
};

const DEPT_SUGGESTED_SALARY: Record<string, string> = {
  'dept-board': '35000000',
  'dept-tech': '26000000',
  'dept-tech-swe': '20000000',
  'dept-tech-data': '22000000',
  'dept-hr': '15000000',
  'dept-fin': '16500000',
  'dept-sales': '15500000',
};

const DEPT_MANAGER_SCOPE_IDS = new Set(['dept-tech', 'dept-tech-swe', 'dept-tech-data']);

function extractDeptBranch(nodes: Department[], targetId: string): Department[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    if (node.children && node.children.length > 0) {
      const found = extractDeptBranch(node.children, targetId);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function addYearsToIsoDate(isoDate: string | null, years: number): string {
  const base = isoDate ? new Date(isoDate) : new Date('2026-11-18');
  if (Number.isNaN(base.getTime())) {
    return '2027-11-18';
  }
  base.setFullYear(base.getFullYear() + years);
  return base.toISOString().slice(0, 10);
}

export function CoreHrView({ defaultTab = 'employees' }: CoreHrViewProps) {
  const { role, currentUserProfile, showToast } = useApp();
  const isDeptManager = role === 'DEPT_MANAGER';
  const canManageHr = role === 'SUPER_ADMIN' || role === 'HR_MANAGER';
  const canViewContracts = role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'DIRECTOR';
  const canViewOrgChart = role === 'SUPER_ADMIN';
  const hideSalary = isDeptManager;

  const [activeTab, setActiveTab] = useState<CoreHrTab>(defaultTab);
  useEffect(() => {
    if (
      (!canViewContracts && defaultTab === 'contracts') ||
      (!canViewOrgChart && defaultTab === 'org')
    ) {
      setActiveTab('employees');
    } else {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, canViewContracts, canViewOrgChart]);

  useEffect(() => {
    if (
      (!canViewContracts && activeTab === 'contracts') ||
      (!canViewOrgChart && activeTab === 'org')
    ) {
      setActiveTab('employees');
    }
  }, [canViewContracts, canViewOrgChart, activeTab]);

  // Employees state & filters
  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentTree, setDepartmentTree] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false);

  // Edit & Delete Employee state
  const [isEditingEmp, setIsEditingEmp] = useState(false);
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState(false);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpDeptId, setEditEmpDeptId] = useState('');
  const [editEmpPosition, setEditEmpPosition] = useState('');
  const [editEmpStatus, setEditEmpStatus] = useState<EmploymentStatus>('ACTIVE');
  const [editEmpSalary, setEditEmpSalary] = useState('');

  // Add Employee form state
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpDeptId, setNewEmpDeptId] = useState('dept-tech-swe');
  const [newEmpPosition, setNewEmpPosition] = useState('Kỹ sư Phần mềm');
  const [newEmpSalary, setNewEmpSalary] = useState(DEPT_SUGGESTED_SALARY['dept-tech-swe']);
  const [newEmpStatus, setNewEmpStatus] = useState<EmploymentStatus>('PROBATION');

  const handleNewEmpDeptChange = (deptId: string) => {
    setNewEmpDeptId(deptId);
    const suggested = DEPT_SUGGESTED_SALARY[deptId];
    if (suggested) {
      setNewEmpSalary(suggested);
    }
  };

  // Org Tree expand/collapse state
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({
    'dept-board': true,
    'dept-tech': true,
    'dept-tech-swe': true,
    'dept-tech-data': true,
  });

  useEffect(() => {
    setExpandedDepts((prev) => ({
      ...prev,
      'dept-board': true,
      'dept-tech': true,
      'dept-tech-swe': true,
      'dept-tech-data': true,
    }));
  }, [role]);

  // Contracts state & filter
  const [contracts, setContracts] = useState<EmploymentContract[]>([]);
  const [contractFilter, setContractFilter] = useState<'ALL' | 'EXPIRING_SOON' | 'ACTIVE'>('ALL');
  const baseEmployeesRef = useRef<Employee[]>([]);

  const syncRuntimeEmployees = useCallback(() => {
    if (baseEmployeesRef.current.length > 0) {
      setEmployees(mergeWithRuntimeEmployees(baseEmployeesRef.current));
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchEmployeesMock()
      .then((data) => {
        if (!active) return;
        baseEmployeesRef.current = data.MOCK_EMPLOYEES;
        setDepartments(data.MOCK_DEPARTMENTS);
        setDepartmentTree(data.MOCK_DEPARTMENT_TREE);
        setPositions(data.MOCK_POSITIONS);
        setEmployees(mergeWithRuntimeEmployees(data.MOCK_EMPLOYEES));
        setContracts(data.MOCK_CONTRACTS);
        if (data.MOCK_DEPARTMENTS[2]?.id) {
          const defaultDeptId = data.MOCK_DEPARTMENTS[2].id;
          setNewEmpDeptId(defaultDeptId);
          if (DEPT_SUGGESTED_SALARY[defaultDeptId]) {
            setNewEmpSalary(DEPT_SUGGESTED_SALARY[defaultDeptId]);
          }
        }
      })
      .catch(() => {
        if (!active) return;
        showToast('Không thể tải dữ liệu Core HR', 'Vui lòng thử làm mới lại trang.', 'error');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    window.addEventListener(HRM_RUNTIME_EVENT, syncRuntimeEmployees);
    window.addEventListener('storage', syncRuntimeEmployees);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncRuntimeEmployees);
      window.removeEventListener('storage', syncRuntimeEmployees);
    };
  }, [syncRuntimeEmployees]);

  const scopedDepartments = useMemo(
    () =>
      isDeptManager
        ? departments.filter((d) => DEPT_MANAGER_SCOPE_IDS.has(d.id))
        : departments,
    [departments, isDeptManager]
  );

  const scopedEmployees = useMemo(
    () =>
      isDeptManager
        ? employees.filter(
            (emp) =>
              DEPT_MANAGER_SCOPE_IDS.has(emp.department_id) &&
              emp.role_code === 'EMPLOYEE'
          )
        : employees,
    [employees, isDeptManager]
  );

  const scopedDepartmentTree = useMemo(
    () =>
      isDeptManager
        ? extractDeptBranch(departmentTree, 'dept-tech')
        : departmentTree,
    [departmentTree, isDeptManager]
  );

  const scopedPositions = useMemo(
    () =>
      isDeptManager
        ? positions.filter((pos) => DEPT_MANAGER_SCOPE_IDS.has(pos.department_id))
        : positions,
    [positions, isDeptManager]
  );

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedEmployees.filter((emp) => {
      const matchesQuery =
        !q ||
        emp.full_name.toLowerCase().includes(q) ||
        emp.employee_code.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q);
      const matchesDept = deptFilter === 'ALL' || emp.department_id === deptFilter;
      const matchesStatus = statusFilter === 'ALL' || emp.employment_status === statusFilter;
      return matchesQuery && matchesDept && matchesStatus;
    });
  }, [scopedEmployees, searchQuery, deptFilter, statusFilter]);

  const expiringContractsCount = useMemo(
    () =>
      contracts.filter(
        (c) =>
          c.status === 'EXPIRING_SOON' ||
          (c.days_until_expiry !== null && c.days_until_expiry <= 30)
      ).length,
    [contracts]
  );

  const filteredContracts = useMemo(() => {
    if (contractFilter === 'EXPIRING_SOON') {
      return contracts.filter(
        (c) =>
          c.status === 'EXPIRING_SOON' ||
          (c.days_until_expiry !== null && c.days_until_expiry <= 30)
      );
    }
    if (contractFilter === 'ACTIVE') {
      return contracts.filter((c) => c.status === 'ACTIVE');
    }
    return contracts;
  }, [contracts, contractFilter]);

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim()) {
      showToast('Thiếu thông tin bắt buộc', 'Vui lòng nhập họ tên và email công ty.', 'warning');
      return;
    }

    const dept = departments.find((d) => d.id === newEmpDeptId) ?? departments[0];
    if (!dept) return;
    const code = generateNextEmployeeCode(employees);
    const nameParts = newEmpName.trim().split(/\s+/);
    const initials =
      nameParts.length > 1
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
        : nameParts[0].slice(0, 2).toUpperCase();

    const created: Employee = {
      id: `emp-${Date.now()}`,
      employee_code: code,
      full_name: newEmpName.trim(),
      email: newEmpEmail.trim(),
      phone: newEmpPhone.trim() || '0901000999',
      gender: 'Nam',
      date_of_birth: '1997-05-15',
      national_id: '079097009888',
      tax_code: '8459901122',
      social_insurance_no: '7926009911',
      department_id: dept.id,
      department_name: dept.department_name,
      position_id: 'pos-swe-mid',
      position_name: newEmpPosition.trim() || 'Chuyên viên',
      manager_id: dept.manager_id,
      manager_name: dept.manager_name,
      role_code: 'EMPLOYEE',
      join_date: '2026-11-18',
      employment_status: newEmpStatus,
      contract_type: newEmpStatus === 'PROBATION' ? 'PROBATION_2M' : 'FIXED_TERM_12M',
      contract_start_date: '2026-11-18',
      contract_end_date: newEmpStatus === 'PROBATION' ? '2027-01-18' : '2027-11-18',
      contract_status: 'ACTIVE',
      base_salary_vnd: Number(newEmpSalary) || 22000000,
      allowance_meal_vnd: 1000000,
      allowance_transport_vnd: 500000,
      allowance_position_vnd: 0,
      dependents_count: 0,
      bank_account_no: '19038888999901',
      bank_name: 'Techcombank',
      work_shift_code: 'HC-08:30',
      kpi_completion_rate: 85,
      burnout_risk_score: 20,
      burnout_risk_level: 'LOW',
      turnover_risk_score: 18,
      turnover_risk_level: 'LOW',
      ai_retention_note: 'Nhân sự mới tiếp nhận, mức độ ổn định cao.',
      avatar_initials: initials,
    };

    saveRuntimeEmployee(created);
    setEmployees((prev) => [created, ...prev]);
    setIsAddEmpOpen(false);
    setNewEmpName('');
    setNewEmpEmail('');
    setNewEmpPhone('');
    recordAuditLog({
      actor_name: currentUserProfile?.fullName ?? 'Nguyễn Văn An',
      actor_code: currentUserProfile?.employee_code ?? 'NV-2024-001',
      actor_role: role,
      action: 'CREATE_RECORD',
      module: 'Hồ sơ & Tổ chức',
      target: `${created.employee_code} - ${created.full_name}`,
      detail: `Thêm hồ sơ nhân viên mới vào ${dept.department_name} (${created.position_name}).`,
      status: 'SUCCESS',
    });
    showToast(
      'Đã thêm hồ sơ nhân viên mới',
      `${created.full_name} (${created.employee_code}) đã được thêm vào ${dept.department_name}.`,
      'success'
    );
  };

  const startEditEmployee = (emp: Employee) => {
    setEditEmpName(emp.full_name);
    setEditEmpDeptId(emp.department_id);
    setEditEmpPosition(emp.position_name);
    setEditEmpStatus(emp.employment_status);
    setEditEmpSalary(String(emp.base_salary_vnd));
    setConfirmDeleteEmp(false);
    setIsEditingEmp(true);
  };

  const handleSaveEditEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !editEmpName.trim()) {
      showToast('Thiếu họ và tên', 'Vui lòng nhập họ tên nhân viên.', 'warning');
      return;
    }
    const dept = departments.find((d) => d.id === editEmpDeptId) ?? departments[0];
    const nextSalary = Number(editEmpSalary) || selectedEmployee.base_salary_vnd;
    const updated: Employee = {
      ...selectedEmployee,
      full_name: editEmpName.trim(),
      department_id: dept ? dept.id : selectedEmployee.department_id,
      department_name: dept ? dept.department_name : selectedEmployee.department_name,
      position_name: editEmpPosition.trim() || selectedEmployee.position_name,
      employment_status: editEmpStatus,
      base_salary_vnd: nextSalary,
    };

    saveRuntimeEmployee(updated);
    setEmployees((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedEmployee(updated);
    setIsEditingEmp(false);
    recordAuditLog({
      actor_name: currentUserProfile?.fullName ?? 'Nguyễn Văn An',
      actor_code: currentUserProfile?.employee_code ?? 'NV-2024-001',
      actor_role: role,
      action: 'UPDATE_RECORD',
      module: 'Hồ sơ & Tổ chức',
      target: `${updated.employee_code} - ${updated.full_name}`,
      detail: `Cập nhật hồ sơ nhân viên (${updated.department_name} · ${updated.position_name}).`,
      status: 'SUCCESS',
    });
    showToast(
      'Đã cập nhật hồ sơ nhân viên',
      `${updated.full_name} (${updated.employee_code}) đã được lưu thay đổi.`,
      'success'
    );
  };

  const handleDeleteEmployee = (emp: Employee) => {
    if (emp.employee_code === 'NV-2024-001') {
      showToast(
        'Không thể xóa tài khoản quản trị đang đăng nhập',
        'Tài khoản NV-2024-001 đang được sử dụng.',
        'warning'
      );
      return;
    }
    setEmployees((prev) => prev.filter((item) => item.id !== emp.id));
    setSelectedEmployee(null);
    setConfirmDeleteEmp(false);
    setIsEditingEmp(false);
    recordAuditLog({
      actor_name: currentUserProfile?.fullName ?? 'Nguyễn Văn An',
      actor_code: currentUserProfile?.employee_code ?? 'NV-2024-001',
      actor_role: role,
      action: 'DELETE_RECORD',
      module: 'Hồ sơ & Tổ chức',
      target: `${emp.employee_code} - ${emp.full_name}`,
      detail: `Xóa hồ sơ nhân viên khỏi danh sách Core HR (${emp.department_name}).`,
      status: 'WARNING',
    });
    showToast(
      'Đã xóa hồ sơ nhân viên',
      `Hồ sơ ${emp.full_name} (${emp.employee_code}) đã được gỡ khỏi danh sách.`,
      'success'
    );
  };

  const handleRenewContract = (contract: EmploymentContract) => {
    const nextEndDate = addYearsToIsoDate(contract.end_date, 1);
    setContracts((prev) =>
      prev.map((item) =>
        item.id === contract.id
          ? {
              ...item,
              end_date: nextEndDate,
              days_until_expiry: 365,
              status: 'ACTIVE',
              contract_type:
                item.contract_type === 'PROBATION_2M' ? 'FIXED_TERM_12M' : item.contract_type,
            }
          : item
      )
    );
    recordAuditLog({
      actor_name: currentUserProfile?.fullName ?? 'Nguyễn Văn An',
      actor_code: currentUserProfile?.employee_code ?? 'NV-2024-001',
      actor_role: role,
      action: 'UPDATE_RECORD',
      module: 'Hợp đồng & Phụ lục',
      target: `${contract.contract_number} - ${contract.full_name}`,
      detail: `Gia hạn hợp đồng thêm 12 tháng đến ${formatDateVN(nextEndDate)}.`,
      status: 'SUCCESS',
    });
    showToast(
      'Đã gia hạn hợp đồng thành công',
      `Hợp đồng ${contract.contract_number} (${contract.full_name}) được gia hạn đến ${formatDateVN(nextEndDate)}.`,
      'success'
    );
  };

  const toggleDept = (id: string) => {
    setExpandedDepts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderDepartmentNode = (dept: Department, depth = 0) => {
    const hasChildren = Boolean(dept.children && dept.children.length > 0);
    const isExpanded = expandedDepts[dept.id] ?? true;

    return (
      <div key={dept.id} className="space-y-2">
        <div
          className={cn(
            'flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 transition-colors dark:border-zinc-800/80 dark:bg-[#121214] sm:flex-row sm:items-center sm:justify-between',
            depth > 0 && 'ml-5 border-l-2 border-l-teal-700/40 dark:border-l-teal-400/40 sm:ml-8'
          )}
        >
          <div className="flex items-start gap-3">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleDept(dept.id)}
                aria-label={isExpanded ? 'Thu gọn nhánh' : 'Mở rộng nhánh'}
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/80 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            ) : (
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap font-mono text-xs font-medium text-teal-700 dark:text-teal-400">
                  {dept.department_code}
                </span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {dept.department_name}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Trưởng bộ phận: <span className="font-medium text-zinc-700 dark:text-zinc-300">{dept.manager_name}</span> · {dept.location}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pl-9 sm:pl-0">
            <div className="text-right">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Định biên</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatNumberVN(dept.headcount)} nhân sự
              </div>
            </div>
            {!hideSalary && (
              <div className="text-right">
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Ngân sách quỹ lương</div>
                <div className="font-mono text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                  {formatVND(dept.budget_allocated_vnd)}
                </div>
              </div>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-2">
            {dept.children!.map((child) => renderDepartmentNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Quản trị Hồ sơ & Tổ chức (Core HR)
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {isDeptManager
              ? 'Phạm vi: Khối Công nghệ — Danh bạ nhân sự, cơ cấu phòng ban và chức vụ trực thuộc'
              : 'Quản lý danh bạ nhân sự, cơ cấu phòng ban, chức vụ và theo dõi hợp đồng lao động'}
          </p>
        </div>
        {canManageHr && activeTab === 'employees' && (
          <Button variant="primary" size="sm" onClick={() => setIsAddEmpOpen(true)}>
            <UserPlus className="h-4 w-4" strokeWidth={1.5} />
            Thêm nhân viên
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CoreHrTab)}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="employees" className="gap-1.5">
            <Users className="h-4 w-4" strokeWidth={1.5} />
            Hồ sơ nhân viên ({scopedEmployees.length})
          </TabsTrigger>
          {canViewOrgChart && (
            <TabsTrigger value="org" className="gap-1.5">
              <Network className="h-4 w-4" strokeWidth={1.5} />
              Sơ đồ Phòng ban & Chức vụ
            </TabsTrigger>
          )}
          {canViewContracts && (
            <TabsTrigger value="contracts" className="gap-1.5">
              <FileText className="h-4 w-4" strokeWidth={1.5} />
              Hợp đồng & Phụ lục
              {expiringContractsCount > 0 && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  {expiringContractsCount}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab 1: Employees */}
        <TabsContent value="employees" className="space-y-4">
          {(() => {
            const targetDept =
              deptFilter !== 'ALL'
                ? departments.find((d) => d.id === deptFilter)
                : isDeptManager
                ? departments.find((d) => d.id === 'dept-tech')
                : undefined;
            if (!targetDept) return null;
            const childNames = departments
              .filter((d) => d.parent_id === targetDept.id)
              .map((d) => d.department_name);
            return (
              <Card className="border-l-4 border-l-teal-600 dark:border-l-teal-400">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400">
                      <Building2 className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                          {targetDept.department_code}
                        </span>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {targetDept.department_name}
                        </span>
                        {childNames.length > 0 && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            ({childNames.join(', ')})
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                        Trưởng bộ phận: <span className="font-medium">{targetDept.manager_name}</span> · {targetDept.location}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-11 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {isDeptManager ? 'Nhân viên dưới quyền' : 'Nhân sự hiển thị'}
                      </div>
                      <div className="font-mono text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                        {isDeptManager
                          ? `${scopedEmployees.length} nhân viên dưới quyền`
                          : `${filteredEmployees.length} nhân sự trực thuộc`}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Định biên</div>
                      <div className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatNumberVN(targetDept.headcount)} nhân sự
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="relative md:col-span-2">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo họ tên, mã NV (vd: NV-2024-004) hoặc email..."
                    className="pl-9"
                  />
                </div>
                <Select
                  value={deptFilter}
                  onValueChange={setDeptFilter}
                  options={[
                    { label: isDeptManager ? 'Tất cả đơn vị thuộc khối' : 'Tất cả phòng ban', value: 'ALL' },
                    ...scopedDepartments.map((d) => ({
                      label: d.department_name,
                      value: d.id,
                    })),
                  ]}
                />
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  options={[
                    { label: 'Tất cả trạng thái', value: 'ALL' },
                    { label: 'Đang làm việc', value: 'ACTIVE' },
                    { label: 'Thử việc', value: 'PROBATION' },
                    { label: 'Nghỉ phép dài hạn', value: 'ON_LEAVE' },
                    { label: 'Đã nghỉ việc', value: 'RESIGNED' },
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="px-5 py-3">Mã NV</th>
                      <th className="px-4 py-3">Nhân sự</th>
                      <th className="px-4 py-3">Phòng ban & Chức vụ</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      {!hideSalary && <th className="px-4 py-3 text-right">Lương cơ bản</th>}
                      <th className="px-5 py-3 text-right">KPI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hideSalary ? 5 : 6}
                          className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                        >
                          Không tìm thấy nhân viên nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const statusInfo = EMP_STATUS_MAP[emp.employment_status];
                        return (
                          <tr
                            key={emp.id}
                            onClick={() => setSelectedEmployee(emp)}
                            className="cursor-pointer transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                          >
                            <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                              {emp.employee_code}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <Avatar initials={emp.avatar_initials} name={emp.full_name} />
                                <div>
                                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                    {emp.full_name}
                                  </div>
                                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {emp.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="text-zinc-900 dark:text-zinc-100">
                                {emp.department_name}
                              </div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {emp.position_name}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5">
                              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                            </td>
                            {!hideSalary && (
                              <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                                {formatVND(emp.base_salary_vnd)}
                              </td>
                            )}
                            <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                              {emp.kpi_completion_rate}%
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Org Chart & Positions */}
        {canViewOrgChart && (
          <TabsContent value="org" className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Cây cơ cấu tổ chức phòng ban
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Nhấn mũi tên để đóng/mở nhánh trực thuộc
              </span>
            </div>
            <div className="space-y-2">
              {scopedDepartmentTree.map((dept) => renderDepartmentNode(dept, 0))}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Danh mục Chức vụ & Khung cấp bậc</CardTitle>
              <CardDescription>
                Chuẩn hóa chức danh theo hệ thống cấp bậc nội bộ và phòng ban áp dụng
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-y border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="px-5 py-3">Mã chức vụ</th>
                      <th className="px-4 py-3">Tên chức vụ</th>
                      <th className="px-4 py-3">Cấp bậc</th>
                      {!hideSalary && <th className="px-5 py-3 text-right">Dải lương tham chiếu</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {scopedPositions.map((pos) => (
                      <tr
                        key={pos.id}
                        className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                      >
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                          {pos.position_code}
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                          {pos.position_name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {pos.level}
                          </Badge>
                        </td>
                        {!hideSalary && (
                          <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                            {formatVND(pos.salary_band_min_vnd)} — {formatVND(pos.salary_band_max_vnd)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </TabsContent>
        )}

        {/* Tab 3: Contracts */}
        {canViewContracts && (
          <TabsContent value="contracts" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
              <CardContent className="p-4">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Tổng hợp đồng đang quản lý</div>
                <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                  {contracts.length}
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
              <CardContent className="p-4">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Đang hiệu lực ổn định</div>
                <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {contracts.filter((c) => c.status === 'ACTIVE').length}
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
                  <span>Sắp hết hạn (&lt;= 30 ngày)</span>
                  <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {expiringContractsCount}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={contractFilter === 'ALL' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setContractFilter('ALL')}
            >
              Tất cả ({contracts.length})
            </Button>
            <Button
              variant={contractFilter === 'EXPIRING_SOON' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setContractFilter('EXPIRING_SOON')}
            >
              Sắp hết hạn ({expiringContractsCount})
            </Button>
            <Button
              variant={contractFilter === 'ACTIVE' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setContractFilter('ACTIVE')}
            >
              Đang hiệu lực ({contracts.filter((c) => c.status === 'ACTIVE').length})
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="px-5 py-3">Số hợp đồng</th>
                      <th className="px-4 py-3">Nhân sự</th>
                      <th className="px-4 py-3">Loại hợp đồng</th>
                      <th className="px-4 py-3">Thời hạn</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {filteredContracts.map((contract) => {
                      const isExpiring =
                        contract.status === 'EXPIRING_SOON' ||
                        (contract.days_until_expiry !== null && contract.days_until_expiry <= 30);
                      const statusMeta = CONTRACT_STATUS_MAP[contract.status];
                      return (
                        <tr
                          key={contract.id}
                          className={cn(
                            'transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40',
                            isExpiring && 'bg-amber-50/40 dark:bg-amber-950/15'
                          )}
                        >
                          <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                            {contract.contract_number}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {contract.full_name}
                            </div>
                            <div className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                              {contract.employee_code} · {contract.department_name}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-zinc-700 dark:text-zinc-300">
                            {CONTRACT_TYPE_LABEL[contract.contract_type]}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums">
                            <div className="text-zinc-900 dark:text-zinc-100">
                              {formatDateVN(contract.start_date)} —{' '}
                              {contract.end_date ? formatDateVN(contract.end_date) : 'Vô thời hạn'}
                            </div>
                            {contract.days_until_expiry !== null && (
                              <div
                                className={cn(
                                  'mt-0.5 text-[11px]',
                                  isExpiring
                                    ? 'font-semibold text-amber-700 dark:text-amber-400'
                                    : 'text-zinc-500 dark:text-zinc-400'
                                )}
                              >
                                Còn {contract.days_until_expiry} ngày
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-right">
                            {!canManageHr ? (
                              <span className="text-xs text-zinc-400">Chỉ xem</span>
                            ) : contract.end_date ? (
                              <Button
                                variant={isExpiring ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => handleRenewContract(contract)}
                              >
                                <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                                Gia hạn hợp đồng
                              </Button>
                            ) : (
                              <span className="text-xs text-zinc-400">Không cần gia hạn</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Employee Detail Dialog */}
      <Dialog
        open={Boolean(selectedEmployee)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEmployee(null);
            setIsEditingEmp(false);
            setConfirmDeleteEmp(false);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          {selectedEmployee && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar
                    initials={selectedEmployee.avatar_initials}
                    name={selectedEmployee.full_name}
                  />
                  <div>
                    <div>{selectedEmployee.full_name}</div>
                    <div className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {selectedEmployee.employee_code} · {selectedEmployee.position_name}
                    </div>
                  </div>
                </DialogTitle>
                <DialogDescription>
                  {selectedEmployee.department_name} · Ngày vào làm:{' '}
                  {formatDateVN(selectedEmployee.join_date)}
                </DialogDescription>
              </DialogHeader>

              {isEditingEmp ? (
                <form onSubmit={handleSaveEditEmployee} className="mt-4 space-y-3.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Họ và tên *
                    </label>
                    <Input
                      value={editEmpName}
                      onChange={(e) => setEditEmpName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Phòng ban
                      </label>
                      <Select
                        value={editEmpDeptId}
                        onValueChange={setEditEmpDeptId}
                        options={departments.map((d) => ({
                          label: d.department_name,
                          value: d.id,
                        }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Trạng thái làm việc
                      </label>
                      <Select
                        value={editEmpStatus}
                        onValueChange={(v) => setEditEmpStatus(v as EmploymentStatus)}
                        options={[
                          { label: 'Đang làm việc', value: 'ACTIVE' },
                          { label: 'Thử việc', value: 'PROBATION' },
                          { label: 'Nghỉ phép dài hạn', value: 'ON_LEAVE' },
                          { label: 'Đã nghỉ việc', value: 'RESIGNED' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Chức vụ
                      </label>
                      <Input
                        value={editEmpPosition}
                        onChange={(e) => setEditEmpPosition(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Lương cơ bản (VND)
                      </label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={editEmpSalary ? formatNumberVN(Number(editEmpSalary)) : ''}
                        onChange={(e) => setEditEmpSalary(e.target.value.replace(/\D/g, ''))}
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditingEmp(false)}
                    >
                      Hủy
                    </Button>
                    <Button type="submit" variant="primary">
                      Lưu thay đổi
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                      <div className="text-zinc-500 dark:text-zinc-400">Email & Điện thoại</div>
                      <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedEmployee.email}
                      </div>
                      <div className="mt-0.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                        {selectedEmployee.phone}
                      </div>
                    </div>
                    {!isDeptManager && (
                      <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                        <div className="text-zinc-500 dark:text-zinc-400">CCCD / Mã số thuế</div>
                        <div className="mt-1 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                          CCCD: {selectedEmployee.national_id}
                        </div>
                        <div className="mt-0.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                          MST: {selectedEmployee.tax_code} · BHXH: {selectedEmployee.social_insurance_no}
                        </div>
                      </div>
                    )}
                    {!hideSalary && (
                      <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                        <div className="text-zinc-500 dark:text-zinc-400">Chế độ lương & Ngân hàng</div>
                        <div className="mt-1 font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                          {formatVND(selectedEmployee.base_salary_vnd)}
                        </div>
                        <div className="mt-0.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                          {selectedEmployee.bank_name} · {selectedEmployee.bank_account_no}
                        </div>
                      </div>
                    )}
                    <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                      <div className="text-zinc-500 dark:text-zinc-400">Ca làm & Quản lý trực tiếp</div>
                      <div className="mt-1 font-mono text-zinc-900 dark:text-zinc-100">
                        Ca: {selectedEmployee.work_shift_code}
                      </div>
                      <div className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                        Quản lý: {selectedEmployee.manager_name ?? 'Ban Điều hành'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-teal-700/20 bg-teal-50/50 p-3 text-xs dark:border-teal-400/20 dark:bg-teal-950/30">
                    <div className="font-semibold text-teal-800 dark:text-teal-300">
                      Đánh giá AI Retention
                    </div>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {selectedEmployee.ai_retention_note}
                    </p>
                  </div>

                  {confirmDeleteEmp && canManageHr && (
                    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-rose-500/40 bg-rose-50/70 p-3 text-xs dark:border-rose-400/30 dark:bg-rose-950/30 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-rose-800 dark:text-rose-200">
                        Xác nhận xóa hồ sơ {selectedEmployee.full_name} ({selectedEmployee.employee_code})?
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDeleteEmp(false)}
                        >
                          Giữ lại
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleDeleteEmployee(selectedEmployee)}
                          className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500"
                        >
                          Xác nhận xóa
                        </Button>
                      </div>
                    </div>
                  )}

                  <DialogFooter className="sm:justify-between">
                    {canManageHr ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEditEmployee(selectedEmployee)}
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Chỉnh sửa hồ sơ
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={selectedEmployee.employee_code === 'NV-2024-001'}
                          onClick={() => setConfirmDeleteEmp(true)}
                          className="bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-600 dark:hover:bg-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          {selectedEmployee.employee_code === 'NV-2024-001'
                            ? 'Đang đăng nhập'
                            : 'Xóa hồ sơ'}
                        </Button>
                      </div>
                    ) : (
                      <span />
                    )}
                    <Button variant="outline" onClick={() => setSelectedEmployee(null)}>
                      Đóng
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={isAddEmpOpen} onOpenChange={setIsAddEmpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm hồ sơ nhân viên mới</DialogTitle>
            <DialogDescription>
              Thông tin nhân sự mới sẽ được thêm trực tiếp vào danh sách Core HR.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddEmployee} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Họ và tên *
              </label>
              <Input
                value={newEmpName}
                onChange={(e) => setNewEmpName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Minh Khôi"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email công ty *
                </label>
                <Input
                  type="email"
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                  placeholder="khoi.nguyen@company.vn"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Số điện thoại
                </label>
                <Input
                  value={newEmpPhone}
                  onChange={(e) => setNewEmpPhone(e.target.value)}
                  placeholder="0901234567"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Phòng ban
                </label>
                <Select
                  value={newEmpDeptId}
                  onValueChange={handleNewEmpDeptChange}
                  options={departments.map((d) => ({
                    label: d.department_name,
                    value: d.id,
                  }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Trạng thái làm việc
                </label>
                <Select
                  value={newEmpStatus}
                  onValueChange={(v) => setNewEmpStatus(v as EmploymentStatus)}
                  options={[
                    { label: 'Thử việc', value: 'PROBATION' },
                    { label: 'Đang làm việc', value: 'ACTIVE' },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Chức vụ
                </label>
                <Input
                  value={newEmpPosition}
                  onChange={(e) => setNewEmpPosition(e.target.value)}
                  placeholder="Kỹ sư Phần mềm"
                />
              </div>
              {!hideSalary && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Lương cơ bản (VND)
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={newEmpSalary ? formatNumberVN(Number(newEmpSalary)) : ''}
                    onChange={(e) => setNewEmpSalary(e.target.value.replace(/\D/g, ''))}
                    placeholder="22.000.000"
                    className="font-mono tabular-nums"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Gợi ý theo phòng ban:{' '}
                    <span className="font-mono tabular-nums">
                      {formatVND(Number(DEPT_SUGGESTED_SALARY[newEmpDeptId] ?? 20000000))}
                    </span>{' '}
                    (có thể chỉnh sửa)
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddEmpOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Lưu hồ sơ nhân viên
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
