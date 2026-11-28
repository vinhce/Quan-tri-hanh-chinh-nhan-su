'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  FilePlus2,
  FileText,
  History,
  Lock,
  Network,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  createPreboardingInvite,
  generateNextEmployeeCode,
  getCareerHistories,
  getContracts,
  getExpiringProbationContracts,
  getPreboardingInvites,
  getRuntimeDepartments,
  HRM_RUNTIME_EVENT,
  hrQuickUpdatePreboarding,
  isOfficialEmployeeStatus,
  mergeWithRuntimeEmployees,
  saveContract,
  saveRuntimeEmployee,
} from '@/lib/runtime-store';
import { alertSwal, confirmSwal } from '@/lib/swal';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import type {
  CareerChangeType,
  CareerHistoryEntry,
  ContractStatus,
  ContractType,
  Department,
  Employee,
  EmploymentContract,
  EmploymentStatus,
  Position,
  PreboardingInvite,
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
  PENDING_ONBOARD: { label: 'Chờ nhận việc', variant: 'warning' },
  PROBATION: { label: 'Thử việc', variant: 'info' },
  ACTIVE: { label: 'Chính thức', variant: 'success' },
  OFFICIAL: { label: 'Chính thức', variant: 'success' },
  ON_LEAVE: { label: 'Nghỉ dài hạn', variant: 'warning' },
  NOTICE_PERIOD: { label: 'Đang báo trước nghỉ việc', variant: 'warning' },
  RESIGNED: { label: 'Đã nghỉ việc', variant: 'muted' },
};

const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  INDEFINITE_TERM: 'Không xác định thời hạn',
  FIXED_TERM_12M: 'Xác định thời hạn 12 tháng',
  FIXED_TERM_24M: 'Xác định thời hạn 24 tháng',
  PROBATION_2M: 'Thử việc 2 tháng',
  ADDENDUM: 'Phụ lục Hợp đồng lao động',
};

const CONTRACT_STATUS_MAP: Record<ContractStatus, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Đang hiệu lực', variant: 'success' },
  EXPIRING_SOON: { label: 'Sắp hết hạn', variant: 'warning' },
  EXPIRED: { label: 'Đã hết hạn', variant: 'danger' },
  PENDING_SIGN: { label: 'Chờ ký kết', variant: 'info' },
};

const CAREER_CHANGE_LABEL: Record<
  CareerChangeType,
  { label: string; variant: BadgeVariant }
> = {
  PROBATION_TO_OFFICIAL: { label: 'Chuyển chính thức', variant: 'success' },
  PROMOTION: { label: 'Thăng chức / Bổ nhiệm', variant: 'teal' },
  TRANSFER: { label: 'Điều chuyển vị trí', variant: 'info' },
  DEPARTMENT_TRANSFER: { label: 'Điều chuyển phòng ban', variant: 'info' },
  SALARY_ADJUSTMENT: { label: 'Điều chỉnh lương', variant: 'warning' },
  ROLE_CHANGE: { label: 'Thay đổi vai trò hệ thống', variant: 'secondary' },
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

function pruneDeptTreeForScope(
  nodes: Department[],
  allowedIds: Set<string>
): Department[] {
  const result: Department[] = [];
  for (const node of nodes) {
    const prunedChildren = node.children
      ? pruneDeptTreeForScope(node.children, allowedIds)
      : [];
    if (allowedIds.has(node.id)) {
      result.push({
        ...node,
        children: prunedChildren.length > 0 ? prunedChildren : undefined,
      });
    } else if (prunedChildren.length > 0) {
      result.push(...prunedChildren);
    }
  }
  return result;
}

function hydrateDeptTreeWithRuntime(
  nodes: Department[],
  runtimeDepts: Department[]
): Department[] {
  const byId = new Map(runtimeDepts.map((d) => [d.id, d]));
  const walk = (list: Department[]): Department[] =>
    list.map((node) => {
      const override = byId.get(node.id);
      return {
        ...(override ?? node),
        children: node.children ? walk(node.children) : undefined,
      };
    });
  return walk(nodes);
}

function addYearsToIsoDate(isoDate: string | null, years: number): string {
  const base = isoDate ? new Date(isoDate) : new Date('2026-11-21');
  if (Number.isNaN(base.getTime())) {
    return '2027-11-21';
  }
  base.setFullYear(base.getFullYear() + years);
  return base.toISOString().slice(0, 10);
}

function addMonthsToIsoDate(isoDate: string, months: number): string {
  const parts = isoDate.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return '2027-11-21';
  }
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1 + months, parts[2] - 1));
  return utc.toISOString().slice(0, 10);
}

type ContractTabFilter =
  | 'ALL'
  | 'EXPIRING_SOON'
  | 'ACTIVE'
  | 'PROBATION_2M'
  | 'ADDENDUM';

export function CoreHrView({ defaultTab = 'employees' }: CoreHrViewProps) {
  const {
    role,
    currentUserProfile,
    currentUserEmail,
    showToast,
    navIntent,
    clearNavIntent,
    navigateWithIntent,
    setActiveNav,
  } = useApp();

  const isAccessDenied = role === 'EMPLOYEE' || role === 'CANDIDATE';
  const isDeptManager = role === 'DEPT_MANAGER';
  const canManageHr =
    role === 'SUPER_ADMIN' || role === 'DIRECTOR' || role === 'HR_MANAGER';
  const canApproveHighSalary = role === 'SUPER_ADMIN' || role === 'DIRECTOR';
  const canViewContracts =
    role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'DIRECTOR';
  const canViewOrgChart =
    role === 'SUPER_ADMIN' ||
    role === 'DIRECTOR' ||
    role === 'HR_MANAGER' ||
    role === 'DEPT_MANAGER';
  const hideSalary = isDeptManager;

  const actorName =
    currentUserProfile?.fullName ?? ROLE_DEFAULT_PROFILES[role]?.fullName ?? 'Người dùng';
  const actorCode =
    currentUserProfile?.employee_code ?? ROLE_DEFAULT_PROFILES[role]?.employee_code ?? '';

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

  // Employees & Org state
  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [baseDepartmentTree, setBaseDepartmentTree] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contracts, setContracts] = useState<EmploymentContract[]>([]);
  const [careerHistories, setCareerHistories] = useState<CareerHistoryEntry[]>([]);
  const [preboardingInvites, setPreboardingInvites] = useState<PreboardingInvite[]>([]);
  const [expiringProbations, setExpiringProbations] = useState<
    ReturnType<typeof getExpiringProbationContracts>
  >([]);

  const baseEmployeesRef = useRef<Employee[]>([]);
  const baseContractsRef = useRef<EmploymentContract[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [copiedTokenKey, setCopiedTokenKey] = useState<string | null>(null);

  // Edit Employee Personal & Legal state
  const [isEditingEmp, setIsEditingEmp] = useState(false);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpEmail, setEditEmpEmail] = useState('');
  const [editEmpPersonalEmail, setEditEmpPersonalEmail] = useState('');
  const [editEmpPhone, setEditEmpPhone] = useState('');
  const [editEmpGender, setEditEmpGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [editEmpDob, setEditEmpDob] = useState('1997-05-15');
  const [editEmpDeptId, setEditEmpDeptId] = useState('');
  const [editEmpPosition, setEditEmpPosition] = useState('');
  const [editEmpStatus, setEditEmpStatus] = useState<EmploymentStatus>('OFFICIAL');
  const [editEmpSalary, setEditEmpSalary] = useState('');
  const [editEmpShift, setEditEmpShift] = useState('HC-08:30');
  const [editNationalId, setEditNationalId] = useState('');
  const [editNationalIdDate, setEditNationalIdDate] = useState('');
  const [editNationalIdPlace, setEditNationalIdPlace] = useState('');
  const [editTaxCode, setEditTaxCode] = useState('');
  const [editBhxhNo, setEditBhxhNo] = useState('');
  const [editDependents, setEditDependents] = useState('0');
  const [editBankName, setEditBankName] = useState('Vietcombank');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEmgName, setEditEmgName] = useState('');
  const [editEmgPhone, setEditEmgPhone] = useState('');
  const [editEmgRelation, setEditEmgRelation] = useState('Vợ/Chồng');
  const [editVerifyPreboarding, setEditVerifyPreboarding] = useState(false);

  // Add Employee / Create Pre-boarding Invite modal state
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false);
  const [addMode, setAddMode] = useState<'PREBOARDING' | 'DIRECT'>('PREBOARDING');
  const [createdInviteResult, setCreatedInviteResult] =
    useState<PreboardingInvite | null>(null);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpDeptId, setNewEmpDeptId] = useState('dept-tech-swe');
  const [newEmpPosition, setNewEmpPosition] = useState('Kỹ sư Phần mềm');
  const [newEmpStartDate, setNewEmpStartDate] = useState('2026-12-01');
  const [newEmpSalary, setNewEmpSalary] = useState(DEPT_SUGGESTED_SALARY['dept-tech-swe']);
  const [newEmpProbationPct, setNewEmpProbationPct] = useState('85');
  const [newEmpStatus, setNewEmpStatus] = useState<EmploymentStatus>('PROBATION');
  const [newNationalId, setNewNationalId] = useState('');
  const [newNationalIdDate, setNewNationalIdDate] = useState('2022-05-10');
  const [newNationalIdPlace, setNewNationalIdPlace] = useState(
    'Cục Cảnh sát QLHC về TTXH'
  );
  const [newTaxCode, setNewTaxCode] = useState('');
  const [newBhxhNo, setNewBhxhNo] = useState('');
  const [newDependents, setNewDependents] = useState('0');
  const [newBankName, setNewBankName] = useState('Vietcombank');
  const [newBankAccount, setNewBankAccount] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newEmgName, setNewEmgName] = useState('');
  const [newEmgPhone, setNewEmgPhone] = useState('');
  const [newEmgRelation, setNewEmgRelation] = useState('Vợ/Chồng');

  // Create Contract / Addendum modal state
  const [contractFilter, setContractFilter] = useState<ContractTabFilter>('ALL');
  const [isAddContractOpen, setIsAddContractOpen] = useState(false);
  const [newContractEmpId, setNewContractEmpId] = useState('');
  const [newContractType, setNewContractType] =
    useState<ContractType>('FIXED_TERM_12M');
  const [newContractStartDate, setNewContractStartDate] = useState('2026-12-01');
  const [newContractSalaryVnd, setNewContractSalaryVnd] = useState('22000000');
  const [newContractSalaryPct, setNewContractSalaryPct] = useState('85');
  const [newContractDecisionNo, setNewContractDecisionNo] = useState('');
  const [newContractNotes, setNewContractNotes] = useState('');

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

  const syncRuntimeAll = useCallback(() => {
    const rtDepts = getRuntimeDepartments();
    if (rtDepts.length > 0) {
      setDepartments(rtDepts);
    }
    if (baseEmployeesRef.current.length > 0) {
      const mergedEmps = mergeWithRuntimeEmployees(baseEmployeesRef.current);
      setEmployees(mergedEmps);
      setSelectedEmployee((prev) =>
        prev ? mergedEmps.find((e) => e.id === prev.id) ?? prev : null
      );
    }
    if (baseContractsRef.current.length > 0) {
      setContracts(getContracts(baseContractsRef.current));
    } else {
      setContracts(getContracts());
    }
    setCareerHistories(getCareerHistories());
    setPreboardingInvites(getPreboardingInvites());
    setExpiringProbations(getExpiringProbationContracts(30));
  }, []);

  useEffect(() => {
    let active = true;
    fetchEmployeesMock()
      .then((data) => {
        if (!active) return;
        baseEmployeesRef.current = data.MOCK_EMPLOYEES;
        baseContractsRef.current = data.MOCK_CONTRACTS;
        const rtDepts = getRuntimeDepartments();
        setDepartments(rtDepts.length > 0 ? rtDepts : data.MOCK_DEPARTMENTS);
        setBaseDepartmentTree(data.MOCK_DEPARTMENT_TREE);
        setPositions(data.MOCK_POSITIONS);
        const mergedEmps = mergeWithRuntimeEmployees(data.MOCK_EMPLOYEES);
        setEmployees(mergedEmps);
        setContracts(getContracts(data.MOCK_CONTRACTS));
        setCareerHistories(getCareerHistories());
        setPreboardingInvites(getPreboardingInvites());
        setExpiringProbations(getExpiringProbationContracts(30));
        if (mergedEmps[0]?.id) {
          setNewContractEmpId(mergedEmps[0].id);
          setNewContractSalaryVnd(String(mergedEmps[0].base_salary_vnd));
        }
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
        showToast(
          'Không thể tải dữ liệu Core HR',
          'Vui lòng thử làm mới lại trang.',
          'error'
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    window.addEventListener(HRM_RUNTIME_EVENT, syncRuntimeAll);
    window.addEventListener('storage', syncRuntimeAll);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncRuntimeAll);
      window.removeEventListener('storage', syncRuntimeAll);
    };
  }, [syncRuntimeAll]);

  const actorEmployee = useMemo(() => {
    if (isAccessDenied) return null;
    const explicitCode = currentUserProfile?.employee_code?.trim();
    if (explicitCode && !explicitCode.toUpperCase().startsWith('UV-')) {
      const byCode = employees.find(
        (e) => e.employee_code.toLowerCase() === explicitCode.toLowerCase()
      );
      if (byCode) return byCode;
    }
    const rawEmail = (currentUserProfile?.email || currentUserEmail || '')
      .trim()
      .toLowerCase();
    if (rawEmail) {
      const byEmail = employees.find(
        (e) =>
          e.email.toLowerCase() === rawEmail ||
          (e.personal_email && e.personal_email.toLowerCase() === rawEmail)
      );
      if (byEmail) return byEmail;
      if (
        rawEmail.endsWith('@lacviethrm.vn') ||
        rawEmail.endsWith('@hrm-enterprise.vn')
      ) {
        const local = rawEmail.split('@')[0];
        const byLocal = employees.find(
          (e) => e.email.toLowerCase().split('@')[0] === local
        );
        if (byLocal) return byLocal;
      }
    }
    if (!explicitCode && !rawEmail) {
      const defCode = ROLE_DEFAULT_PROFILES[role]?.employee_code;
      if (defCode && !defCode.startsWith('UV-')) {
        return employees.find((e) => e.employee_code === defCode) ?? null;
      }
    }
    return null;
  }, [isAccessDenied, currentUserProfile, currentUserEmail, employees, role]);

  const managerDeptIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isDeptManager) return ids;
    const explicitDeptId = currentUserProfile?.department_id?.trim();
    if (explicitDeptId) {
      ids.add(explicitDeptId);
    }
    if (
      actorEmployee &&
      (!explicitDeptId || actorEmployee.department_id === explicitDeptId)
    ) {
      if (actorEmployee.department_id) ids.add(actorEmployee.department_id);
      for (const d of departments) {
        if (d.manager_id === actorEmployee.id) {
          ids.add(d.id);
        }
      }
    }
    return ids;
  }, [isDeptManager, currentUserProfile?.department_id, actorEmployee, departments]);

  const departmentTree = useMemo(
    () => hydrateDeptTreeWithRuntime(baseDepartmentTree, departments),
    [baseDepartmentTree, departments]
  );

  const scopedDepartments = useMemo(
    () =>
      isDeptManager
        ? departments.filter((d) => managerDeptIds.has(d.id))
        : departments,
    [departments, isDeptManager, managerDeptIds]
  );

  const scopedEmployees = useMemo(
    () =>
      isDeptManager
        ? employees.filter(
            (emp) =>
              managerDeptIds.has(emp.department_id) &&
              (emp.role_code === 'EMPLOYEE' || emp.id === actorEmployee?.id)
          )
        : employees,
    [employees, isDeptManager, managerDeptIds, actorEmployee]
  );

  const scopedDepartmentTree = useMemo(
    () =>
      isDeptManager
        ? pruneDeptTreeForScope(departmentTree, managerDeptIds)
        : departmentTree,
    [departmentTree, isDeptManager, managerDeptIds]
  );

  const scopedPositions = useMemo(
    () =>
      isDeptManager
        ? positions.filter((pos) => managerDeptIds.has(pos.department_id))
        : positions,
    [positions, isDeptManager, managerDeptIds]
  );

  // Handle cross-module deep link intent
  useEffect(() => {
    if (
      isLoading ||
      isAccessDenied ||
      !navIntent ||
      !['core-hr', 'employees', 'contracts'].includes(navIntent.navId)
    ) {
      return;
    }

    if (navIntent.navId === 'contracts' || navIntent.subTab === 'contracts') {
      if (canViewContracts) setActiveTab('contracts');
    } else if (navIntent.subTab === 'org' && canViewOrgChart) {
      setActiveTab('org');
    } else {
      setActiveTab('employees');
    }

    const eid = navIntent.entityId?.trim();
    if (eid) {
      const targetEmp = scopedEmployees.find(
        (e) =>
          e.id.toLowerCase() === eid.toLowerCase() ||
          e.employee_code.toLowerCase() === eid.toLowerCase()
      );
      if (targetEmp) {
        setSelectedEmployee(targetEmp);
      }
    }

    clearNavIntent();
  }, [
    isLoading,
    isAccessDenied,
    navIntent,
    scopedEmployees,
    canViewContracts,
    canViewOrgChart,
    clearNavIntent,
  ]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedEmployees.filter((emp) => {
      const matchesQuery =
        !q ||
        emp.full_name.toLowerCase().includes(q) ||
        emp.employee_code.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        (emp.personal_email && emp.personal_email.toLowerCase().includes(q));
      const matchesDept = deptFilter === 'ALL' || emp.department_id === deptFilter;
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'OFFICIAL_GROUP' ||
              statusFilter === 'OFFICIAL' ||
              statusFilter === 'ACTIVE'
            ? isOfficialEmployeeStatus(emp.employment_status)
            : emp.employment_status === statusFilter;
      return matchesQuery && matchesDept && matchesStatus;
    });
  }, [scopedEmployees, searchQuery, deptFilter, statusFilter]);

  const expiringContractsCount = useMemo(
    () =>
      contracts.filter(
        (c) =>
          c.status !== 'EXPIRED' &&
          (c.status === 'EXPIRING_SOON' ||
            (c.days_until_expiry !== null && c.days_until_expiry <= 30))
      ).length,
    [contracts]
  );

  const filteredContracts = useMemo(() => {
    if (contractFilter === 'EXPIRING_SOON') {
      return contracts.filter(
        (c) =>
          c.status !== 'EXPIRED' &&
          (c.status === 'EXPIRING_SOON' ||
            (c.days_until_expiry !== null && c.days_until_expiry <= 30))
      );
    }
    if (contractFilter === 'ACTIVE') {
      return contracts.filter((c) => c.status === 'ACTIVE');
    }
    if (contractFilter === 'PROBATION_2M') {
      return contracts.filter((c) => c.contract_type === 'PROBATION_2M');
    }
    if (contractFilter === 'ADDENDUM') {
      return contracts.filter(
        (c) => c.contract_type === 'ADDENDUM' || Boolean(c.is_addendum)
      );
    }
    return contracts;
  }, [contracts, contractFilter]);

  const selectedEmployeeCareerHistories = useMemo(() => {
    if (!selectedEmployee) return [];
    return careerHistories.filter(
      (h) =>
        h.employee_id === selectedEmployee.id ||
        h.employee_code === selectedEmployee.employee_code
    );
  }, [selectedEmployee, careerHistories]);

  const selectedEmployeeInvite = useMemo(() => {
    if (!selectedEmployee) return null;
    return (
      preboardingInvites.find(
        (inv) =>
          (selectedEmployee.preboarding_token &&
            inv.token === selectedEmployee.preboarding_token) ||
          inv.employee_id === selectedEmployee.id ||
          inv.employee_code === selectedEmployee.employee_code
      ) ?? null
    );
  }, [selectedEmployee, preboardingInvites]);

  const handleCopyPreboardingLink = async (token: string) => {
    const relativePath = `/preboarding?token=${encodeURIComponent(token)}`;
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${relativePath}`
        : relativePath;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedTokenKey(token);
      window.setTimeout(() => setCopiedTokenKey(null), 2200);
      showToast(
        'Đã sao chép liên kết Pre-boarding',
        fullUrl,
        'success'
      );
    } catch {
      showToast('Liên kết Pre-boarding', relativePath, 'info');
    }
  };

  const openAddEmployeeModal = () => {
    setCreatedInviteResult(null);
    setAddMode('PREBOARDING');
    setNewEmpName('');
    setNewEmpEmail('');
    setNewEmpPhone('');
    setNewEmpStartDate('2026-12-01');
    setNewEmpProbationPct('85');
    setNewEmpStatus('PROBATION');
    setNewNationalId('');
    setNewTaxCode('');
    setNewBhxhNo('');
    setNewDependents('0');
    setNewBankName('Vietcombank');
    setNewBankAccount('');
    setNewAddress('');
    setNewEmgName('');
    setNewEmgPhone('');
    setIsAddEmpOpen(true);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageHr) return;
    if (!newEmpName.trim() || !newEmpEmail.trim()) {
      showToast(
        'Thiếu thông tin bắt buộc',
        'Vui lòng nhập đầy đủ họ tên và địa chỉ email.',
        'warning'
      );
      return;
    }

    const dept = departments.find((d) => d.id === newEmpDeptId) ?? departments[0];
    if (!dept) return;

    const salaryNum = Number(newEmpSalary) || 22000000;
    if (!canApproveHighSalary && salaryNum > 50_000_000) {
      showToast(
        'Cần Giám đốc phê duyệt',
        'Hồ sơ / Hợp đồng có mức lương trên 50.000.000 VNĐ vượt thẩm quyền HR Manager — cần Giám đốc (DIRECTOR) hoặc Quản trị hệ thống phê duyệt.',
        'warning'
      );
      return;
    }
    const probPct = Math.min(100, Math.max(50, Number(newEmpProbationPct) || 85));

    if (addMode === 'PREBOARDING') {
      const result = createPreboardingInvite({
        fullName: newEmpName.trim(),
        personalEmail: newEmpEmail.trim(),
        phone: newEmpPhone.trim() || '0901234567',
        departmentId: dept.id,
        departmentName: dept.department_name,
        positionId:
          positions.find((p) => p.department_id === dept.id)?.id ?? 'pos-04',
        positionName: newEmpPosition.trim() || 'Chuyên viên',
        managerId: dept.manager_id,
        managerName: dept.manager_name,
        expectedStartDate: newEmpStartDate || '2026-12-01',
        officialSalaryVnd: salaryNum,
        probationSalaryPercent: probPct,
        actorName,
      });

      syncRuntimeAll();
      setCreatedInviteResult(result.invite);

      recordAuditLog({
        actor_name: actorName,
        actor_code: actorCode,
        actor_role: role,
        action: 'CREATE_REQUEST',
        module: 'Hồ sơ & Tổ chức',
        target: `${result.employee.employee_code} - ${result.employee.full_name}`,
        detail: `Khởi tạo nhân sự PENDING_ONBOARD và mở cổng Pre-boarding (${result.invite.preboarding_url}).`,
        status: 'SUCCESS',
      });

      showToast(
        'Đã tạo hồ sơ Chờ nhận việc & Link Pre-boarding',
        `${result.employee.full_name} (${result.employee.employee_code}) — Tài khoản tạm khóa chờ IT kích hoạt.`,
        'success'
      );
      return;
    }

    // Mode DIRECT: create PROBATION or OFFICIAL employee with full legal fields
    const code = generateNextEmployeeCode(employees);
    const nameParts = newEmpName.trim().split(/\s+/);
    const initials =
      nameParts.length > 1
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
        : nameParts[0].slice(0, 2).toUpperCase();
    const startDate = newEmpStartDate || '2026-11-21';
    const isProb = newEmpStatus === 'PROBATION';
    const baseSalary = isProb
      ? Math.round((salaryNum * probPct) / 100)
      : salaryNum;
    const contractEndDate = isProb
      ? addMonthsToIsoDate(startDate, 2)
      : addMonthsToIsoDate(startDate, 12);

    const created: Employee = {
      id: `emp-${Date.now()}`,
      employee_code: code,
      full_name: newEmpName.trim(),
      email: newEmpEmail.trim(),
      personal_email: newEmpEmail.trim(),
      phone: newEmpPhone.trim() || '0901000999',
      gender: 'Nam',
      date_of_birth: '1997-05-15',
      national_id: newNationalId.trim() || '079097009888',
      national_id_issue_date: newNationalIdDate || '2022-05-10',
      national_id_issue_place:
        newNationalIdPlace.trim() || 'Cục Cảnh sát QLHC về TTXH',
      tax_code: newTaxCode.trim() || '8459901122',
      social_insurance_no: newBhxhNo.trim() || '7926009911',
      department_id: dept.id,
      department_name: dept.department_name,
      position_id:
        positions.find((p) => p.department_id === dept.id)?.id ?? 'pos-04',
      position_name: newEmpPosition.trim() || 'Chuyên viên',
      manager_id: dept.manager_id,
      manager_name: dept.manager_name,
      role_code: 'EMPLOYEE',
      join_date: startDate,
      official_date: isOfficialEmployeeStatus(newEmpStatus) ? startDate : null,
      employment_status: newEmpStatus,
      contract_type: isProb ? 'PROBATION_2M' : 'FIXED_TERM_12M',
      contract_start_date: startDate,
      contract_end_date: contractEndDate,
      contract_status: 'ACTIVE',
      base_salary_vnd: baseSalary,
      official_salary_vnd: salaryNum,
      probation_salary_percent: isProb ? probPct : 100,
      probation_end_date: isProb ? contractEndDate : null,
      allowance_meal_vnd: 900000,
      allowance_transport_vnd: 600000,
      allowance_position_vnd: 0,
      dependents_count: Math.max(0, Number.parseInt(newDependents, 10) || 0),
      bank_account_no: newBankAccount.trim() || '0071009988776',
      bank_name: newBankName.trim() || 'Vietcombank',
      address: newAddress.trim() || 'TP. Hồ Chí Minh',
      emergency_contact_name: newEmgName.trim() || 'Người thân liên hệ',
      emergency_contact_phone: newEmgPhone.trim() || '0908112233',
      emergency_contact_relation: newEmgRelation,
      work_shift_code: 'HC-08:30',
      kpi_completion_rate: 85,
      burnout_risk_score: 18,
      burnout_risk_level: 'LOW',
      turnover_risk_score: 15,
      turnover_risk_level: 'LOW',
      ai_retention_note: 'Nhân sự mới tiếp nhận trực tiếp đầy đủ hồ sơ pháp lý.',
      avatar_initials: initials,
      preboarding_status: 'VERIFIED',
    };

    saveRuntimeEmployee(created);

    const newContract: EmploymentContract = {
      id: `hd-new-${Date.now()}`,
      contract_number: `${isProb ? 'HDTV' : 'HDLD'}-${startDate.slice(0, 4)}-${code.slice(-3)}`,
      employee_id: created.id,
      employee_code: created.employee_code,
      full_name: created.full_name,
      department_name: created.department_name,
      position_name: created.position_name,
      contract_type: created.contract_type,
      start_date: startDate,
      end_date: contractEndDate,
      days_until_expiry: isProb ? 60 : 365,
      status: 'ACTIVE',
      base_salary_vnd: baseSalary,
      salary_percent: isProb ? probPct : 100,
      official_salary_vnd: salaryNum,
      signed_date: startDate,
      notes: isProb
        ? `Hợp đồng thử việc 02 tháng hưởng ${probPct}% mức lương thỏa thuận.`
        : 'Hợp đồng lao động xác định thời hạn 12 tháng hưởng 100% lương.',
    };
    saveContract(newContract);

    syncRuntimeAll();
    setIsAddEmpOpen(false);

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Hồ sơ & Tổ chức',
      target: `${created.employee_code} - ${created.full_name}`,
      detail: `Tạo trực tiếp hồ sơ nhân sự (${EMP_STATUS_MAP[created.employment_status].label}) kèm hợp đồng ${newContract.contract_number}.`,
      status: 'SUCCESS',
    });

    await alertSwal({
      title: 'Đã lưu hồ sơ nhân sự & Hợp đồng',
      html: `Đã tạo mã nhân viên <span class="font-mono">${created.employee_code}</span> — <strong>${created.full_name}</strong> (${created.department_name}) kèm hợp đồng <span class="font-mono">${newContract.contract_number}</span>.`,
      icon: 'success',
    });
  };

  const startEditEmployee = (emp: Employee) => {
    const invSub = selectedEmployeeInvite?.submitted_data;
    setEditEmpName(emp.full_name);
    setEditEmpEmail(emp.email);
    setEditEmpPersonalEmail(emp.personal_email ?? invSub?.personal_email ?? '');
    setEditEmpPhone(emp.phone || invSub?.phone || '');
    setEditEmpGender(emp.gender || 'Nam');
    setEditEmpDob(emp.date_of_birth || '1997-05-15');
    setEditEmpDeptId(emp.department_id);
    setEditEmpPosition(emp.position_name);
    setEditEmpStatus(emp.employment_status);
    setEditEmpSalary(String(emp.base_salary_vnd));
    setEditEmpShift(emp.work_shift_code || 'HC-08:30');
    setEditNationalId(emp.national_id || invSub?.national_id || '');
    setEditNationalIdDate(
      emp.national_id_issue_date || invSub?.national_id_issue_date || '2022-04-15'
    );
    setEditNationalIdPlace(
      emp.national_id_issue_place ||
        invSub?.national_id_issue_place ||
        'Cục Cảnh sát QLHC về TTXH'
    );
    setEditTaxCode(emp.tax_code || invSub?.tax_code || '');
    setEditBhxhNo(emp.social_insurance_no || invSub?.social_insurance_no || '');
    setEditDependents(String(emp.dependents_count ?? invSub?.dependents_count ?? 0));
    setEditBankName(emp.bank_name || invSub?.bank_name || 'Vietcombank');
    setEditBankAccount(emp.bank_account_no || invSub?.bank_account_no || '');
    setEditAddress(emp.address || invSub?.address || '');
    setEditEmgName(
      emp.emergency_contact_name || invSub?.emergency_contact_name || ''
    );
    setEditEmgPhone(
      emp.emergency_contact_phone || invSub?.emergency_contact_phone || ''
    );
    setEditEmgRelation(
      emp.emergency_contact_relation ||
        invSub?.emergency_contact_relation ||
        'Vợ/Chồng'
    );
    setEditVerifyPreboarding(
      emp.preboarding_status === 'VERIFIED' ||
        selectedEmployeeInvite?.status === 'VERIFIED'
    );
    setIsEditingEmp(true);
  };

  const handleSaveEditEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageHr) return;
    if (!selectedEmployee || !editEmpName.trim()) {
      showToast('Thiếu họ và tên', 'Vui lòng nhập họ tên nhân viên.', 'warning');
      return;
    }

    const dept = departments.find((d) => d.id === editEmpDeptId) ?? departments[0];
    const nextSalary = Number(editEmpSalary) || selectedEmployee.base_salary_vnd;
    if (!canApproveHighSalary && nextSalary > 50_000_000) {
      showToast(
        'Cần Giám đốc phê duyệt',
        'Cập nhật mức lương trên 50.000.000 VNĐ yêu cầu Giám đốc (DIRECTOR) hoặc Quản trị hệ thống phê duyệt.',
        'warning'
      );
      return;
    }
    const parsedDep = Math.max(0, Number.parseInt(editDependents, 10) || 0);

    const updated: Employee = {
      ...selectedEmployee,
      full_name: editEmpName.trim(),
      email: editEmpEmail.trim() || selectedEmployee.email,
      personal_email: editEmpPersonalEmail.trim() || undefined,
      phone: editEmpPhone.trim() || selectedEmployee.phone,
      gender: editEmpGender,
      date_of_birth: editEmpDob || selectedEmployee.date_of_birth,
      department_id: dept ? dept.id : selectedEmployee.department_id,
      department_name: dept ? dept.department_name : selectedEmployee.department_name,
      position_name: editEmpPosition.trim() || selectedEmployee.position_name,
      employment_status: editEmpStatus,
      base_salary_vnd: nextSalary,
      work_shift_code: editEmpShift || selectedEmployee.work_shift_code,
      national_id: editNationalId.trim(),
      national_id_issue_date: editNationalIdDate || undefined,
      national_id_issue_place: editNationalIdPlace.trim() || undefined,
      tax_code: editTaxCode.trim(),
      social_insurance_no: editBhxhNo.trim(),
      dependents_count: parsedDep,
      bank_name: editBankName.trim(),
      bank_account_no: editBankAccount.trim(),
      address: editAddress.trim() || undefined,
      emergency_contact_name: editEmgName.trim() || undefined,
      emergency_contact_phone: editEmgPhone.trim() || undefined,
      emergency_contact_relation: editEmgRelation.trim() || undefined,
      preboarding_status: editVerifyPreboarding
        ? 'VERIFIED'
        : selectedEmployee.preboarding_status,
    };

    saveRuntimeEmployee(updated);

    if (selectedEmployeeInvite) {
      try {
        hrQuickUpdatePreboarding(selectedEmployeeInvite.token, {
          personal_email: updated.personal_email,
          phone: updated.phone,
          gender: updated.gender,
          date_of_birth: updated.date_of_birth,
          national_id: updated.national_id,
          national_id_issue_date: updated.national_id_issue_date,
          national_id_issue_place: updated.national_id_issue_place,
          tax_code: updated.tax_code,
          social_insurance_no: updated.social_insurance_no,
          dependents_count: updated.dependents_count,
          bank_name: updated.bank_name,
          bank_account_no: updated.bank_account_no,
          address: updated.address,
          emergency_contact_name: updated.emergency_contact_name ?? '',
          emergency_contact_phone: updated.emergency_contact_phone ?? '',
          emergency_contact_relation: updated.emergency_contact_relation,
          verify: editVerifyPreboarding,
          actorName,
        });
      } catch {
        // Ignore if invite not found
      }
    }

    syncRuntimeAll();
    setSelectedEmployee(updated);
    setIsEditingEmp(false);

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Hồ sơ & Tổ chức',
      target: `${updated.employee_code} - ${updated.full_name}`,
      detail: `Cập nhật hồ sơ pháp lý & cá nhân (CCCD: ${updated.national_id || '—'}, MST: ${updated.tax_code || '—'}, NH: ${updated.bank_name || '—'}, NPT: ${updated.dependents_count}).`,
      status: 'SUCCESS',
    });

    showToast(
      'Đã lưu hồ sơ nhân sự',
      `${updated.full_name} (${updated.employee_code}) đã được đồng bộ dữ liệu pháp lý.`,
      'success'
    );
  };

  const handleStartOffboarding = (emp: Employee) => {
    setSelectedEmployee(null);
    setIsEditingEmp(false);
    navigateWithIntent('offboarding', { entityId: emp.id });
  };

  const handleRenewContract = async (contract: EmploymentContract) => {
    if (!canManageHr) return;
    const nextEndDate = addYearsToIsoDate(contract.end_date, 1);
    const nextType: ContractType =
      contract.contract_type === 'PROBATION_2M'
        ? 'FIXED_TERM_12M'
        : contract.contract_type;
    const nextSalary =
      contract.contract_type === 'PROBATION_2M' && contract.official_salary_vnd
        ? contract.official_salary_vnd
        : contract.base_salary_vnd;
    if (
      !canApproveHighSalary &&
      (nextSalary > 50_000_000 || (contract.official_salary_vnd ?? 0) > 50_000_000)
    ) {
      showToast(
        'Cần Giám đốc phê duyệt',
        'Gia hạn hợp đồng có mức lương trên 50.000.000 VNĐ yêu cầu Giám đốc (DIRECTOR) hoặc Quản trị hệ thống phê duyệt.',
        'warning'
      );
      return;
    }

    const ok = await confirmSwal({
      title: 'Gia hạn Hợp đồng lao động thêm 12 tháng?',
      html: `Hợp đồng <span class="font-mono">${contract.contract_number}</span> của <strong>${contract.full_name}</strong> (<span class="font-mono">${contract.employee_code}</span>) sẽ chuyển sang hiệu lực đến ngày <span class="font-mono">${formatDateVN(nextEndDate)}</span> với mức lương <span class="font-mono">${formatVND(nextSalary)}</span>.`,
      confirmText: 'Xác nhận gia hạn',
      cancelText: 'Hủy',
    });
    if (!ok) return;

    const updatedContract: EmploymentContract = {
      ...contract,
      end_date: nextEndDate,
      days_until_expiry: 365,
      status: 'ACTIVE',
      contract_type: nextType,
      base_salary_vnd: nextSalary,
      salary_percent: 100,
    };

    saveContract(updatedContract);

    const matchedEmp = employees.find(
      (e) =>
        e.id === contract.employee_id || e.employee_code === contract.employee_code
    );
    if (matchedEmp) {
      saveRuntimeEmployee({
        ...matchedEmp,
        contract_type: nextType,
        contract_end_date: nextEndDate,
        contract_status: 'ACTIVE',
        base_salary_vnd: nextSalary,
        employment_status:
          matchedEmp.employment_status === 'PROBATION'
            ? 'OFFICIAL'
            : matchedEmp.employment_status,
      });
    }

    syncRuntimeAll();

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Hợp đồng & Phụ lục',
      target: `${contract.contract_number} - ${contract.full_name}`,
      detail: `Gia hạn hợp đồng thêm 12 tháng đến ${formatDateVN(nextEndDate)}.`,
      status: 'SUCCESS',
    });

    showToast(
      'Đã gia hạn hợp đồng thành công',
      `Hợp đồng ${contract.contract_number} (${contract.full_name}) hiệu lực đến ${formatDateVN(nextEndDate)}.`,
      'success'
    );
  };

  const handleCreateContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageHr) return;
    const emp = employees.find((item) => item.id === newContractEmpId);
    if (!emp) return;

    const startIso = newContractStartDate || '2026-12-01';
    const fullSalary = Number(newContractSalaryVnd) || emp.base_salary_vnd;
    const pct =
      newContractType === 'PROBATION_2M'
        ? Math.min(100, Math.max(50, Number(newContractSalaryPct) || 85))
        : 100;
    const effectiveBase =
      newContractType === 'PROBATION_2M'
        ? Math.round((fullSalary * pct) / 100)
        : fullSalary;
    if (
      !canApproveHighSalary &&
      (fullSalary > 50_000_000 || effectiveBase > 50_000_000)
    ) {
      showToast(
        'Cần Giám đốc phê duyệt',
        'Tạo Hợp đồng / Phụ lục có mức lương trên 50.000.000 VNĐ yêu cầu Giám đốc (DIRECTOR) hoặc Quản trị hệ thống phê duyệt.',
        'warning'
      );
      return;
    }

    const isAddendum = newContractType === 'ADDENDUM';
    const endDate =
      newContractType === 'INDEFINITE_TERM'
        ? null
        : newContractType === 'PROBATION_2M'
          ? addMonthsToIsoDate(startIso, 2)
          : newContractType === 'FIXED_TERM_24M'
            ? addMonthsToIsoDate(startIso, 24)
            : isAddendum
              ? emp.contract_end_date
              : addMonthsToIsoDate(startIso, 12);

    const prefix = isAddendum
      ? 'PLHD'
      : newContractType === 'PROBATION_2M'
        ? 'HDTV'
        : 'HDLD';
    const seqSuffix = String(contracts.length + 1).padStart(2, '0');
    const contractNo = `${prefix}-${startIso.slice(0, 4)}-${emp.employee_code.slice(-3)}-${seqSuffix}`;

    const parentContract = isAddendum
      ? contracts.find(
          (c) =>
            (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
            !c.is_addendum &&
            c.status !== 'EXPIRED'
        )
      : null;

    const created: EmploymentContract = {
      id: `hd-rt-${Date.now()}`,
      contract_number: contractNo,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      position_name: emp.position_name,
      contract_type: newContractType,
      start_date: startIso,
      end_date: endDate,
      days_until_expiry:
        endDate === null
          ? null
          : newContractType === 'PROBATION_2M'
            ? 60
            : newContractType === 'FIXED_TERM_24M'
              ? 730
              : 365,
      status: 'ACTIVE',
      base_salary_vnd: effectiveBase,
      salary_percent: pct,
      official_salary_vnd: fullSalary,
      is_addendum: isAddendum,
      parent_contract_id: parentContract?.id ?? null,
      decision_no: newContractDecisionNo.trim() || undefined,
      signed_date: startIso,
      notes:
        newContractNotes.trim() ||
        (isAddendum
          ? 'Phụ lục điều chỉnh mức lương và chế độ đãi ngộ.'
          : `${CONTRACT_TYPE_LABEL[newContractType]} (${pct}% lương).`),
    };

    saveContract(created);

    saveRuntimeEmployee({
      ...emp,
      base_salary_vnd: effectiveBase,
      official_salary_vnd: fullSalary,
      probation_salary_percent: pct,
      ...(isAddendum
        ? {}
        : {
            contract_type: newContractType,
            contract_start_date: startIso,
            contract_end_date: endDate,
            contract_status: 'ACTIVE',
          }),
    });

    syncRuntimeAll();
    setIsAddContractOpen(false);
    setNewContractDecisionNo('');
    setNewContractNotes('');

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Hợp đồng & Phụ lục',
      target: `${created.contract_number} - ${emp.full_name}`,
      detail: `Phát hành ${CONTRACT_TYPE_LABEL[newContractType]} (${formatVND(effectiveBase)}).`,
      status: 'SUCCESS',
    });

    showToast(
      isAddendum ? 'Đã phát hành Phụ lục HĐLĐ' : 'Đã tạo Hợp đồng lao động mới',
      `${created.contract_number} — ${emp.full_name} (${formatVND(effectiveBase)})`,
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
            'flex flex-col gap-3 rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] p-4 shadow-[0_1px_3px_rgba(17,34,30,0.05)] transition-colors dark:border-zinc-800/80 dark:bg-[#121214] dark:shadow-none sm:flex-row sm:items-center sm:justify-between',
            depth > 0 &&
              'ml-5 border-l-2 border-l-[#0F766E]/50 dark:border-l-teal-400/40 sm:ml-8'
          )}
        >
          <div className="flex items-start gap-3">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleDept(dept.id)}
                aria-label={isExpanded ? 'Thu gọn nhánh' : 'Mở rộng nhánh'}
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] hover:bg-[#E8F3EF] hover:text-[#11221E] dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            ) : (
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#C6D9D3] bg-[#E4EEEB] text-[#0B4F4A] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-400">
                <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap font-mono text-xs font-medium text-[#0F766E] dark:text-teal-400">
                  {dept.department_code}
                </span>
                <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  {dept.department_name}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                Trưởng bộ phận:{' '}
                <span className="font-medium text-[#11221E] dark:text-zinc-300">
                  {dept.manager_name}
                </span>{' '}
                · {dept.location}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pl-9 sm:pl-0">
            <div className="text-right">
              <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">Định biên</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                {formatNumberVN(dept.headcount)} nhân sự
              </div>
            </div>
            {!hideSalary && (
              <div className="text-right">
                <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                  Ngân sách quỹ lương
                </div>
                <div className="font-mono text-sm font-medium tabular-nums text-[#415A54] dark:text-zinc-300">
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

  if (isAccessDenied) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-950/15">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <Lock className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Không đủ quyền truy cập Hồ sơ &amp; Tổ chức (403)
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Phân hệ Quản trị Hồ sơ Nhân sự &amp; Hợp đồng lao động chỉ dành cho Ban Giám đốc, Quản trị Nhân sự và Trưởng bộ phận.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setActiveNav('dashboard')}
            >
              Quay về Bảng điều khiển
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const managerPrimaryDept =
    scopedDepartments.find((d) => d.id === actorEmployee?.department_id) ??
    scopedDepartments[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Quản trị Hồ sơ &amp; Tổ chức (Core HR)
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            {isDeptManager
              ? `Phạm vi: ${managerPrimaryDept?.department_name ?? 'Phòng ban phụ trách'} — Danh bạ nhân sự, cơ cấu phòng ban và chức vụ trực thuộc`
              : 'Quản lý vòng đời hồ sơ pháp lý, cổng Pre-boarding, sơ đồ tổ chức và hợp đồng lao động'}
          </p>
        </div>

        {canManageHr && (
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'contracts' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsAddContractOpen(true)}
              >
                <FilePlus2 className="h-4 w-4" strokeWidth={1.5} />
                Tạo Hợp đồng / Phụ lục
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={openAddEmployeeModal}>
                <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                Tiếp nhận / Mở Pre-boarding
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CoreHrTab)}>
        <TabsList className="w-full justify-start overflow-x-auto border border-[#C6D9D3] bg-[#E4EEEB] dark:border-zinc-800/80 dark:bg-zinc-900 sm:w-auto">
          <TabsTrigger
            value="employees"
            className={cn(
              'gap-1.5',
              activeTab === 'employees'
                ? 'border border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <Users className="h-4 w-4" strokeWidth={1.5} />
            Hồ sơ nhân viên ({scopedEmployees.length})
          </TabsTrigger>
          {canViewOrgChart && (
            <TabsTrigger
              value="org"
              className={cn(
                'gap-1.5',
                activeTab === 'org'
                  ? 'border border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200'
              )}
            >
              <Network className="h-4 w-4" strokeWidth={1.5} />
              Sơ đồ Phòng ban &amp; Chức vụ
            </TabsTrigger>
          )}
          {canViewContracts && (
            <TabsTrigger
              value="contracts"
              className={cn(
                'gap-1.5',
                activeTab === 'contracts'
                  ? 'border border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200'
              )}
            >
              <FileText className="h-4 w-4" strokeWidth={1.5} />
              Hợp đồng &amp; Phụ lục
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
                ? scopedDepartments.find((d) => d.id === deptFilter)
                : isDeptManager
                  ? managerPrimaryDept
                  : undefined;
            if (!targetDept) return null;
            const childNames = scopedDepartments
              .filter((d) => d.parent_id === targetDept.id)
              .map((d) => d.department_name);
            return (
              <Card className="rounded-[12px] border border-[#C6D9D3] border-l-4 border-l-[#0F766E] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:border-l-teal-400 dark:bg-[#121214] dark:shadow-none">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#E4EEEB] text-[#0B4F4A] dark:border-transparent dark:bg-teal-950/50 dark:text-teal-400">
                      <Building2 className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-[#0F766E] dark:text-teal-400">
                          {targetDept.department_code}
                        </span>
                        <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                          {targetDept.department_name}
                        </span>
                        {childNames.length > 0 && (
                          <span className="text-xs text-[#5C7871] dark:text-zinc-400">
                            ({childNames.join(', ')})
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-300">
                        Trưởng bộ phận:{' '}
                        <span className="font-medium text-[#11221E] dark:text-zinc-100">
                          {targetDept.manager_name}
                        </span>{' '}
                        · {targetDept.location}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-11 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                        {isDeptManager ? 'Nhân viên dưới quyền' : 'Nhân sự hiển thị'}
                      </div>
                      <div className="font-mono text-sm font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                        {isDeptManager
                          ? `${scopedEmployees.length} nhân viên dưới quyền`
                          : `${filteredEmployees.length} nhân sự trực thuộc`}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                        Định biên
                      </div>
                      <div className="font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatNumberVN(targetDept.headcount)} nhân sự
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Card className="rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214] dark:shadow-none">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="relative md:col-span-2">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
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
                    {
                      label: isDeptManager
                        ? 'Tất cả đơn vị thuộc khối'
                        : 'Tất cả phòng ban',
                      value: 'ALL',
                    },
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
                    { label: 'Tất cả trạng thái vòng đời', value: 'ALL' },
                    { label: 'Chờ nhận việc (PENDING_ONBOARD)', value: 'PENDING_ONBOARD' },
                    { label: 'Thử việc (PROBATION)', value: 'PROBATION' },
                    { label: 'Chính thức (OFFICIAL / ACTIVE)', value: 'OFFICIAL_GROUP' },
                    { label: 'Nghỉ dài hạn (ON_LEAVE)', value: 'ON_LEAVE' },
                    { label: 'Đang báo trước nghỉ việc (NOTICE_PERIOD)', value: 'NOTICE_PERIOD' },
                    { label: 'Đã nghỉ việc (RESIGNED)', value: 'RESIGNED' },
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214] dark:shadow-none">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="px-5 py-3">Mã NV</th>
                      <th className="px-4 py-3">Nhân sự</th>
                      <th className="px-4 py-3">Phòng ban &amp; Chức vụ</th>
                      <th className="px-4 py-3">Trạng thái vòng đời</th>
                      {!hideSalary && <th className="px-4 py-3 text-right">Lương cơ bản</th>}
                      <th className="px-5 py-3 text-right">KPI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/80">
                    {filteredEmployees.length === 0 ? (
                      <tr className="bg-[#FCFEFD] dark:bg-transparent">
                        <td
                          colSpan={hideSalary ? 5 : 6}
                          className="px-5 py-10 text-center text-sm text-[#415A54] dark:text-zinc-400"
                        >
                          Không tìm thấy nhân viên nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const statusInfo =
                          EMP_STATUS_MAP[emp.employment_status] ??
                          EMP_STATUS_MAP.OFFICIAL;
                        const isOfficial = isOfficialEmployeeStatus(emp.employment_status);
                        const isRehireable = emp.is_rehireable ?? true;

                        return (
                          <tr
                            key={emp.id}
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setIsEditingEmp(false);
                            }}
                            className="cursor-pointer transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                          >
                            <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                              {emp.employee_code}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  initials={emp.avatar_initials}
                                  name={emp.full_name}
                                  className="border-[#C6D9D3] bg-[#E4EEEB] font-semibold text-[#0B4F4A] dark:border-zinc-800/80 dark:bg-zinc-800 dark:text-zinc-200"
                                />
                                <div>
                                  <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                                    {emp.full_name}
                                  </div>
                                  <div className="text-xs text-[#415A54] dark:text-zinc-400">
                                    {emp.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                                {emp.department_name}
                              </div>
                              <div className="text-xs text-[#415A54] dark:text-zinc-400">
                                {emp.position_name}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant={statusInfo.variant}
                                  className={
                                    isOfficial
                                      ? 'border-[#6EE7B7] bg-[#D1FAE5] font-semibold text-[#065F46] dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : undefined
                                  }
                                >
                                  {statusInfo.label}
                                </Badge>

                                {emp.employment_status === 'RESIGNED' && (
                                  <Badge
                                    variant={isRehireable ? 'teal' : 'danger'}
                                    className="text-[11px]"
                                  >
                                    {isRehireable ? 'Có thể tuyển lại' : 'Không tuyển lại'}
                                  </Badge>
                                )}

                                {emp.employment_status === 'PENDING_ONBOARD' &&
                                  emp.preboarding_status && (
                                    <Badge variant="outline" className="text-[11px]">
                                      Pre-boarding: {emp.preboarding_status}
                                    </Badge>
                                  )}
                              </div>
                            </td>
                            {!hideSalary && (
                              <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                                <div>{formatVND(emp.base_salary_vnd)}</div>
                                {emp.employment_status === 'PROBATION' &&
                                  emp.probation_salary_percent &&
                                  emp.probation_salary_percent < 100 && (
                                    <div className="text-[11px] font-normal text-[#0F766E] dark:text-teal-400">
                                      Hưởng {emp.probation_salary_percent}% thử việc
                                    </div>
                                  )}
                              </td>
                            )}
                            <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-xs font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
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

        {/* Tab 2: Org Chart & Positions (SUPER_ADMIN, DIRECTOR, HR_MANAGER, DEPT_MANAGER) */}
        {canViewOrgChart && (
          <TabsContent value="org" className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  Cây cơ cấu tổ chức phòng ban
                </h2>
                <span className="text-xs text-[#5C7871] dark:text-zinc-400">
                  Nhấn mũi tên để đóng/mở nhánh trực thuộc
                </span>
              </div>
              <div className="space-y-2">
                {scopedDepartmentTree.map((dept) => renderDepartmentNode(dept, 0))}
              </div>
            </div>

            <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214] dark:shadow-none">
              <CardHeader>
                <CardTitle>Danh mục Chức vụ &amp; Khung cấp bậc</CardTitle>
                <CardDescription>
                  Chuẩn hóa chức danh theo hệ thống cấp bậc nội bộ và phòng ban áp dụng
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-y border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                        <th className="px-5 py-3">Mã chức vụ</th>
                        <th className="px-4 py-3">Tên chức vụ</th>
                        <th className="px-4 py-3">Cấp bậc</th>
                        {!hideSalary && (
                          <th className="px-5 py-3 text-right">Dải lương tham chiếu</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/80">
                      {scopedPositions.map((pos) => (
                        <tr
                          key={pos.id}
                          className="transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                        >
                          <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                            {pos.position_code}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#11221E] dark:text-zinc-100">
                            {pos.position_name}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {pos.level}
                            </Badge>
                          </td>
                          {!hideSalary && (
                            <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-xs font-medium tabular-nums text-[#415A54] dark:text-zinc-300">
                              {formatVND(pos.salary_band_min_vnd)} —{' '}
                              {formatVND(pos.salary_band_max_vnd)}
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

        {/* Tab 3: Contracts & Addenda */}
        {canViewContracts && (
          <TabsContent value="contracts" className="space-y-4">
            {/* Expiring Probation Warning Banner */}
            {expiringProbations.length > 0 && (
              <Card className="border-l-4 border-l-amber-500 bg-[#FCFEFD] dark:border-l-amber-400 dark:bg-[#121214]">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
                      <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span>
                        Cảnh báo Hợp đồng Thử việc sắp đến hạn đánh giá ({expiringProbations.length} nhân sự trong 30 ngày tới)
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigateWithIntent('onboarding', { subTab: 'progress' })}
                    >
                      Mở phân hệ Onboarding &amp; Xét chính thức
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {expiringProbations.map((item) => (
                      <div
                        key={item.contract.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/80 px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/60"
                      >
                        <div>
                          <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                            {item.contract.full_name}{' '}
                            <span className="font-mono font-normal text-[#415A54] dark:text-zinc-400">
                              ({item.contract.employee_code})
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                            {item.contract.contract_number} · Hết hạn:{' '}
                            {formatDateVN(item.contract.end_date || '')} · Còn{' '}
                            <strong className="text-amber-800 dark:text-amber-300">
                              {item.daysRemaining} ngày
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.hasPassReview ? (
                            <Badge variant="success">Quản lý đánh giá: ĐẠT</Badge>
                          ) : (
                            <Badge variant="warning">Chờ đánh giá thử việc</Badge>
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              navigateWithIntent('onboarding', {
                                entityId: item.contract.employee_code,
                                subTab: 'progress',
                              })
                            }
                          >
                            Xử lý
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
                <CardContent className="p-4">
                  <div className="text-xs text-[#415A54] dark:text-zinc-400">
                    Tổng HĐ &amp; Phụ lục
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                    {contracts.length}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
                <CardContent className="p-4">
                  <div className="text-xs text-[#415A54] dark:text-zinc-400">
                    Đang hiệu lực ổn định
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {contracts.filter((c) => c.status === 'ACTIVE').length}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-[#0F766E] dark:border-l-teal-400">
                <CardContent className="p-4">
                  <div className="text-xs text-[#415A54] dark:text-zinc-400">
                    Phụ lục điều chỉnh (ADDENDUM)
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {
                      contracts.filter(
                        (c) => c.contract_type === 'ADDENDUM' || Boolean(c.is_addendum)
                      ).length
                    }
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

            <div className="flex flex-wrap items-center justify-between gap-2">
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
                  variant={contractFilter === 'PROBATION_2M' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setContractFilter('PROBATION_2M')}
                >
                  HĐ Thử việc (
                  {contracts.filter((c) => c.contract_type === 'PROBATION_2M').length})
                </Button>
                <Button
                  variant={contractFilter === 'ADDENDUM' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setContractFilter('ADDENDUM')}
                >
                  Phụ lục HĐLĐ (
                  {
                    contracts.filter(
                      (c) => c.contract_type === 'ADDENDUM' || Boolean(c.is_addendum)
                    ).length
                  }
                  )
                </Button>
                <Button
                  variant={contractFilter === 'ACTIVE' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setContractFilter('ACTIVE')}
                >
                  Đang hiệu lực ({contracts.filter((c) => c.status === 'ACTIVE').length})
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214] dark:shadow-none">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                        <th className="px-5 py-3">Số hợp đồng / Phụ lục</th>
                        <th className="px-4 py-3">Nhân sự</th>
                        <th className="px-4 py-3">Loại văn bản &amp; Tỷ lệ hưởng</th>
                        <th className="px-4 py-3 text-right">Mức lương ghi nhận</th>
                        <th className="px-4 py-3">Hiệu lực</th>
                        <th className="px-4 py-3">Trạng thái</th>
                        <th className="px-5 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/80">
                      {filteredContracts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-5 py-10 text-center text-sm text-[#415A54] dark:text-zinc-400"
                          >
                            Không có hợp đồng hoặc phụ lục nào trong phân nhóm đang chọn.
                          </td>
                        </tr>
                      ) : (
                        filteredContracts.map((contract) => {
                          const isExpiring =
                            contract.status !== 'EXPIRED' &&
                            (contract.status === 'EXPIRING_SOON' ||
                              (contract.days_until_expiry !== null &&
                                contract.days_until_expiry <= 30));
                          const statusMeta = CONTRACT_STATUS_MAP[contract.status];
                          const isProbation = contract.contract_type === 'PROBATION_2M';
                          const isAddendum =
                            contract.contract_type === 'ADDENDUM' ||
                            Boolean(contract.is_addendum);
                          const salaryPct =
                            contract.salary_percent ?? (isProbation ? 85 : 100);

                          return (
                            <tr
                              key={contract.id}
                              className={cn(
                                'transition-colors hover:bg-[#E8F3EF] dark:hover:bg-zinc-900/40',
                                isExpiring
                                  ? 'bg-amber-50/60 dark:bg-amber-950/15'
                                  : 'odd:bg-[#FCFEFD] even:bg-[#F5FAF8] dark:odd:bg-transparent dark:even:bg-transparent'
                              )}
                            >
                              <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-[#11221E] dark:text-zinc-200">
                                <div className="font-semibold">{contract.contract_number}</div>
                                {contract.decision_no && (
                                  <div className="mt-0.5 text-[11px] text-[#0F766E] dark:text-teal-400">
                                    QĐ: {contract.decision_no}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                                  {contract.full_name}
                                </div>
                                <div className="font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                                  {contract.employee_code} · {contract.position_name}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-xs text-[#415A54] dark:text-zinc-300">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-[#11221E] dark:text-zinc-100">
                                    {CONTRACT_TYPE_LABEL[contract.contract_type]}
                                  </span>
                                  {isProbation && (
                                    <Badge variant="info" className="font-mono text-[11px]">
                                      {salaryPct}% lương
                                    </Badge>
                                  )}
                                  {isAddendum && (
                                    <Badge variant="teal" className="text-[11px]">
                                      Phụ lục
                                    </Badge>
                                  )}
                                </div>
                                {contract.notes && (
                                  <div className="mt-0.5 max-w-xs truncate text-[11px] text-[#5C7871] dark:text-zinc-400">
                                    {contract.notes}
                                  </div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs tabular-nums">
                                <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                                  {formatVND(contract.base_salary_vnd)}
                                </div>
                                {isProbation && contract.official_salary_vnd && (
                                  <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                                    100%: {formatVND(contract.official_salary_vnd)}
                                  </div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums">
                                <div className="text-[#11221E] dark:text-zinc-100">
                                  {formatDateVN(contract.start_date)} —{' '}
                                  {contract.end_date
                                    ? formatDateVN(contract.end_date)
                                    : 'Vô thời hạn'}
                                </div>
                                {contract.days_until_expiry !== null &&
                                  contract.status !== 'EXPIRED' && (
                                    <div
                                      className={cn(
                                        'mt-0.5 text-[11px]',
                                        isExpiring
                                          ? 'font-semibold text-amber-700 dark:text-amber-400'
                                          : 'text-[#5C7871] dark:text-zinc-400'
                                      )}
                                    >
                                      Còn {contract.days_until_expiry} ngày
                                    </div>
                                  )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5">
                                <Badge variant={statusMeta.variant}>
                                  {statusMeta.label}
                                </Badge>
                              </td>
                              <td className="whitespace-nowrap px-5 py-3.5 text-right">
                                {!canManageHr ? (
                                  <span className="text-xs text-[#5C7871] dark:text-zinc-400">
                                    Chỉ xem
                                  </span>
                                ) : contract.status === 'EXPIRED' ? (
                                  <span className="text-xs text-[#5C7871] dark:text-zinc-500">
                                    Đã kết thúc
                                  </span>
                                ) : isProbation ? (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() =>
                                      navigateWithIntent('onboarding', {
                                        entityId: contract.employee_code,
                                        subTab: 'progress',
                                      })
                                    }
                                  >
                                    Xét chính thức
                                  </Button>
                                ) : contract.end_date && !isAddendum ? (
                                  !canApproveHighSalary &&
                                  ((contract.official_salary_vnd ?? contract.base_salary_vnd) >
                                    50_000_000 ||
                                    contract.base_salary_vnd > 50_000_000) ? (
                                    <Badge variant="warning">Cần Giám đốc duyệt</Badge>
                                  ) : (
                                    <Button
                                      variant={isExpiring ? 'primary' : 'outline'}
                                      size="sm"
                                      onClick={() => void handleRenewContract(contract)}
                                    >
                                      <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                                      Gia hạn +1 năm
                                    </Button>
                                  )
                                ) : (
                                  <span className="text-xs text-[#5C7871] dark:text-zinc-400">
                                    Đang lưu hành
                                  </span>
                                )}
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
        )}
      </Tabs>

      {/* DIALOG 1: EMPLOYEE 360 DETAIL & FULL LEGAL EDIT */}
      <Dialog
        open={Boolean(selectedEmployee)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEmployee(null);
            setIsEditingEmp(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col overflow-hidden p-0">
          {selectedEmployee && (
            <>
              <div className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800/80">
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center justify-between gap-3 pr-6">
                    <div className="flex items-center gap-3">
                      <Avatar
                        initials={selectedEmployee.avatar_initials}
                        name={selectedEmployee.full_name}
                        className="border-[#C6D9D3] bg-[#E4EEEB] font-semibold text-[#0B4F4A] dark:border-zinc-800/80 dark:bg-zinc-800 dark:text-zinc-200"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
                            {selectedEmployee.full_name}
                          </span>
                          <Badge
                            variant={
                              EMP_STATUS_MAP[selectedEmployee.employment_status]?.variant ??
                              'success'
                            }
                          >
                            {EMP_STATUS_MAP[selectedEmployee.employment_status]?.label ??
                              selectedEmployee.employment_status}
                          </Badge>
                          {selectedEmployee.employment_status === 'RESIGNED' && (
                            <Badge
                              variant={
                                (selectedEmployee.is_rehireable ?? true) ? 'teal' : 'danger'
                              }
                            >
                              {(selectedEmployee.is_rehireable ?? true)
                                ? 'Có thể tuyển lại'
                                : 'Không tuyển lại'}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-xs font-normal tabular-nums text-[#415A54] dark:text-zinc-400">
                          {selectedEmployee.employee_code} · {selectedEmployee.position_name}
                        </div>
                      </div>
                    </div>
                  </DialogTitle>
                  <DialogDescription>
                    {selectedEmployee.department_name} · Ngày gia nhập:{' '}
                    <span className="font-mono tabular-nums">
                      {formatDateVN(selectedEmployee.join_date)}
                    </span>
                    {selectedEmployee.official_date && (
                      <>
                        {' '}
                        · Ngày chính thức:{' '}
                        <span className="font-mono tabular-nums">
                          {formatDateVN(selectedEmployee.official_date)}
                        </span>
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {isEditingEmp ? (
                  <form
                    id="edit-employee-legal-form"
                    onSubmit={handleSaveEditEmployee}
                    className="space-y-4 text-xs"
                  >
                    <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                        1. Thông tin cơ bản &amp; Vị trí công tác
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Họ và tên *
                          </label>
                          <Input
                            value={editEmpName}
                            onChange={(e) => setEditEmpName(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Trạng thái vòng đời
                          </label>
                          <Select
                            value={editEmpStatus}
                            onValueChange={(v) => setEditEmpStatus(v as EmploymentStatus)}
                            options={[
                              { label: 'Chờ nhận việc (PENDING_ONBOARD)', value: 'PENDING_ONBOARD' },
                              { label: 'Thử việc (PROBATION)', value: 'PROBATION' },
                              { label: 'Chính thức (OFFICIAL)', value: 'OFFICIAL' },
                              { label: 'Chính thức (ACTIVE)', value: 'ACTIVE' },
                              { label: 'Nghỉ dài hạn (ON_LEAVE)', value: 'ON_LEAVE' },
                              { label: 'Đang báo trước nghỉ việc (NOTICE_PERIOD)', value: 'NOTICE_PERIOD' },
                              { label: 'Đã nghỉ việc (RESIGNED)', value: 'RESIGNED' },
                            ]}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Email công ty (SSO)
                          </label>
                          <Input
                            type="email"
                            value={editEmpEmail}
                            onChange={(e) => setEditEmpEmail(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Email cá nhân
                          </label>
                          <Input
                            type="email"
                            value={editEmpPersonalEmail}
                            onChange={(e) => setEditEmpPersonalEmail(e.target.value)}
                            placeholder="ungvien@gmail.com"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Số điện thoại
                          </label>
                          <Input
                            value={editEmpPhone}
                            onChange={(e) => setEditEmpPhone(e.target.value)}
                            className="font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Giới tính
                          </label>
                          <Select
                            value={editEmpGender}
                            onValueChange={(v) => setEditEmpGender(v as 'Nam' | 'Nữ')}
                            options={[
                              { label: 'Nam', value: 'Nam' },
                              { label: 'Nữ', value: 'Nữ' },
                            ]}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Ngày sinh
                          </label>
                          <Input
                            type="date"
                            value={editEmpDob}
                            onChange={(e) => setEditEmpDob(e.target.value)}
                            className="font-mono tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
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
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Chức danh
                          </label>
                          <Input
                            value={editEmpPosition}
                            onChange={(e) => setEditEmpPosition(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Lương cơ bản hiện hưởng (VND)
                          </label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={editEmpSalary ? formatNumberVN(Number(editEmpSalary)) : ''}
                            onChange={(e) =>
                              setEditEmpSalary(e.target.value.replace(/\D/g, ''))
                            }
                            className="font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Ca làm việc chuẩn
                          </label>
                          <Input
                            value={editEmpShift}
                            onChange={(e) => setEditEmpShift(e.target.value)}
                            className="font-mono tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                        2. Định danh pháp lý: CCCD, Mã số thuế, BHXH &amp; Ngân hàng
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Số CCCD (12 số)
                          </label>
                          <Input
                            value={editNationalId}
                            onChange={(e) =>
                              setEditNationalId(e.target.value.replace(/\D/g, ''))
                            }
                            maxLength={12}
                            className="font-mono tabular-nums"
                            placeholder="079097014582"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Ngày cấp CCCD
                          </label>
                          <Input
                            type="date"
                            value={editNationalIdDate}
                            onChange={(e) => setEditNationalIdDate(e.target.value)}
                            className="font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Nơi cấp CCCD
                          </label>
                          <Input
                            value={editNationalIdPlace}
                            onChange={(e) => setEditNationalIdPlace(e.target.value)}
                            placeholder="Cục Cảnh sát QLHC về TTXH"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Mã số thuế TNCN
                          </label>
                          <Input
                            value={editTaxCode}
                            onChange={(e) => setEditTaxCode(e.target.value)}
                            className="font-mono tabular-nums"
                            placeholder="8462910384"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Mã số BHXH
                          </label>
                          <Input
                            value={editBhxhNo}
                            onChange={(e) => setEditBhxhNo(e.target.value)}
                            className="font-mono tabular-nums"
                            placeholder="7924819205"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Số người phụ thuộc
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            value={editDependents}
                            onChange={(e) => setEditDependents(e.target.value)}
                            className="font-mono tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Ngân hàng nhận lương
                          </label>
                          <Input
                            value={editBankName}
                            onChange={(e) => setEditBankName(e.target.value)}
                            placeholder="Vietcombank"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Số tài khoản ngân hàng
                          </label>
                          <Input
                            value={editBankAccount}
                            onChange={(e) => setEditBankAccount(e.target.value)}
                            className="font-mono tabular-nums"
                            placeholder="0071001298456"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                        3. Địa chỉ cư trú &amp; Liên hệ khẩn cấp
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Địa chỉ cư trú hiện tại
                        </label>
                        <Input
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          placeholder="Số nhà, đường, Phường/Xã, Quận/Huyện, Tỉnh/TP"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Người liên hệ khẩn cấp
                          </label>
                          <Input
                            value={editEmgName}
                            onChange={(e) => setEditEmgName(e.target.value)}
                            placeholder="Họ tên người thân"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            SĐT khẩn cấp
                          </label>
                          <Input
                            value={editEmgPhone}
                            onChange={(e) => setEditEmgPhone(e.target.value)}
                            className="font-mono tabular-nums"
                            placeholder="0908667788"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                            Mối quan hệ
                          </label>
                          <Input
                            value={editEmgRelation}
                            onChange={(e) => setEditEmgRelation(e.target.value)}
                            placeholder="Vợ/Chồng, Cha/Mẹ..."
                          />
                        </div>
                      </div>

                      {(selectedEmployeeInvite ||
                        selectedEmployee.employment_status === 'PENDING_ONBOARD') && (
                        <label className="flex items-center gap-2 pt-1 text-xs font-medium text-[#0F766E] dark:text-teal-400">
                          <input
                            type="checkbox"
                            checked={editVerifyPreboarding}
                            onChange={(e) => setEditVerifyPreboarding(e.target.checked)}
                            className="h-4 w-4 rounded border-[#C6D9D3] accent-[#0F766E]"
                          />
                          <span>
                            Xác nhận HR đã đối chiếu hợp lệ toàn bộ hồ sơ Pre-boarding
                          </span>
                        </label>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    {/* Pre-boarding Link Banner if applicable */}
                    {!isDeptManager &&
                      (selectedEmployeeInvite || selectedEmployee.preboarding_token) && (
                      <div className="flex flex-col gap-2 rounded-xl border border-[#0F766E]/30 bg-[#CBE8E2]/45 p-3.5 text-xs dark:border-teal-400/25 dark:bg-teal-950/25 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 font-semibold text-[#0B4F4A] dark:text-teal-300">
                            <span>Liên kết Cổng tự khai báo Pre-boarding</span>
                            <Badge variant="teal">
                              {selectedEmployeeInvite?.status ??
                                selectedEmployee.preboarding_status ??
                                'PENDING'}
                            </Badge>
                          </div>
                          <div className="mt-1 font-mono text-[11px] tabular-nums text-[#11221E] dark:text-zinc-300">
                            /preboarding?token=
                            {selectedEmployeeInvite?.token ??
                              selectedEmployee.preboarding_token}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void handleCopyPreboardingLink(
                                (selectedEmployeeInvite?.token ??
                                  selectedEmployee.preboarding_token)!
                              )
                            }
                          >
                            {copiedTokenKey ===
                            (selectedEmployeeInvite?.token ??
                              selectedEmployee.preboarding_token) ? (
                              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                            ) : (
                              <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={1.5} />
                            )}
                            Sao chép link
                          </Button>
                          <Link
                            href={`/preboarding?token=${encodeURIComponent(
                              (selectedEmployeeInvite?.token ??
                                selectedEmployee.preboarding_token)!
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button type="button" variant="primary" size="sm">
                              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Mở cổng
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Resigned Rehire Callout */}
                    {selectedEmployee.employment_status === 'RESIGNED' && (
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                            Hồ sơ nhân sự đã nghỉ việc (Lưu trữ lịch sử vĩnh viễn — Không xóa vật lý)
                          </span>
                          <Badge
                            variant={
                              (selectedEmployee.is_rehireable ?? true) ? 'teal' : 'danger'
                            }
                          >
                            {(selectedEmployee.is_rehireable ?? true)
                              ? 'Đủ điều kiện tuyển dụng lại'
                              : 'Danh sách hạn chế tuyển lại'}
                          </Badge>
                        </div>
                        {selectedEmployee.resigned_date && (
                          <div className="mt-1 font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                            Ngày chấm dứt HĐLĐ: {formatDateVN(selectedEmployee.resigned_date)}
                            {selectedEmployee.rehire_note
                              ? ` · Ghi chú HR: ${selectedEmployee.rehire_note}`
                              : ''}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Full Personal & Legal Info Grid */}
                    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                        <div className="text-[#5C7871] dark:text-zinc-400">
                          Liên hệ &amp; Thông tin cá nhân
                        </div>
                        <div className="mt-1 font-medium text-[#11221E] dark:text-zinc-100">
                          {selectedEmployee.email}
                        </div>
                        {selectedEmployee.personal_email && (
                          <div className="mt-0.5 text-[#415A54] dark:text-zinc-400">
                            Cá nhân: {selectedEmployee.personal_email}
                          </div>
                        )}
                        <div className="mt-0.5 font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                          SĐT: {selectedEmployee.phone} · {selectedEmployee.gender} · Sinh:{' '}
                          {formatDateVN(selectedEmployee.date_of_birth)}
                        </div>
                      </div>

                      {!isDeptManager && (
                        <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                          <div className="text-[#5C7871] dark:text-zinc-400">
                            Định danh CCCD, Thuế TNCN &amp; BHXH
                          </div>
                          <div className="mt-1 font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                            CCCD: {selectedEmployee.national_id || 'Chưa khai báo'}
                          </div>
                          {(selectedEmployee.national_id_issue_date ||
                            selectedEmployee.national_id_issue_place) && (
                            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                              Cấp:{' '}
                              {selectedEmployee.national_id_issue_date
                                ? formatDateVN(selectedEmployee.national_id_issue_date)
                                : '—'}{' '}
                              · {selectedEmployee.national_id_issue_place || '—'}
                            </div>
                          )}
                          <div className="mt-0.5 font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                            MST: {selectedEmployee.tax_code || '—'} · BHXH:{' '}
                            {selectedEmployee.social_insurance_no || '—'}
                          </div>
                        </div>
                      )}

                      {!hideSalary && (
                        <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                          <div className="text-[#5C7871] dark:text-zinc-400">
                            Chế độ lương, Ngân hàng &amp; Giảm trừ
                          </div>
                          <div className="mt-1 font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                            {formatVND(selectedEmployee.base_salary_vnd)}
                            {selectedEmployee.employment_status === 'PROBATION' &&
                              selectedEmployee.probation_salary_percent && (
                                <span className="ml-1.5 text-[11px] font-normal text-[#0F766E] dark:text-teal-400">
                                  ({selectedEmployee.probation_salary_percent}% thử việc)
                                </span>
                              )}
                          </div>
                          <div className="mt-0.5 font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                            {selectedEmployee.bank_name || 'Chưa cập nhật NH'} · STK:{' '}
                            {selectedEmployee.bank_account_no || '—'}
                          </div>
                          <div className="mt-0.5 font-mono tabular-nums text-[#5C7871] dark:text-zinc-400">
                            Người phụ thuộc: {selectedEmployee.dependents_count} người
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                        <div className="text-[#5C7871] dark:text-zinc-400">
                          Tổ chức, Ca làm &amp; Liên hệ khẩn cấp
                        </div>
                        <div className="mt-1 font-mono text-[#11221E] dark:text-zinc-100">
                          Ca: {selectedEmployee.work_shift_code} · Quản lý:{' '}
                          <span className="font-sans font-medium">
                            {selectedEmployee.manager_name ?? 'Ban Điều hành'}
                          </span>
                        </div>
                        {selectedEmployee.mentor_name && (
                          <div className="mt-0.5 text-[#0F766E] dark:text-teal-400">
                            Mentor hướng dẫn: {selectedEmployee.mentor_name}
                          </div>
                        )}
                        <div className="mt-0.5 text-[#415A54] dark:text-zinc-400">
                          Khẩn cấp:{' '}
                          {selectedEmployee.emergency_contact_name
                            ? `${selectedEmployee.emergency_contact_name} (${selectedEmployee.emergency_contact_relation || 'Người thân'}) · `
                            : 'Chưa khai báo '}
                          {selectedEmployee.emergency_contact_phone && (
                            <span className="font-mono tabular-nums">
                              {selectedEmployee.emergency_contact_phone}
                            </span>
                          )}
                        </div>
                        {selectedEmployee.address && (
                          <div className="mt-0.5 truncate text-[#5C7871] dark:text-zinc-400">
                            Đ/c: {selectedEmployee.address}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Immutable Career History & Progression Timeline */}
                    <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/40">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D5E3DF] pb-2.5 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <History
                            className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                            strokeWidth={1.5}
                          />
                          <h3 className="text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                            Lịch sử công tác &amp; Thăng tiến (Bất biến ·{' '}
                            {selectedEmployeeCareerHistories.length} quyết định)
                          </h3>
                        </div>
                        <Badge variant="outline" className="text-[11px]">
                          <ShieldCheck className="h-3 w-3" strokeWidth={1.5} />
                          Lưu vết lịch sử
                        </Badge>
                      </div>

                      {selectedEmployeeCareerHistories.length === 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5]/50 p-3 text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                          <div>
                            Mốc gốc: Tiếp nhận vào <strong>{selectedEmployee.department_name}</strong> ({selectedEmployee.position_name}) từ ngày{' '}
                            <span className="font-mono tabular-nums">
                              {formatDateVN(selectedEmployee.join_date)}
                            </span>
                            . Chưa phát sinh quyết định điều chuyển hoặc thăng tiến mới.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2.5">
                          {selectedEmployeeCareerHistories.map((entry) => {
                            const changeMeta = CAREER_CHANGE_LABEL[entry.change_type] ?? {
                              label: entry.change_type,
                              variant: 'secondary' as BadgeVariant,
                            };
                            return (
                              <div
                                key={entry.id}
                                className="rounded-lg border border-[#C6D9D3] border-l-4 border-l-[#0F766E] bg-[#F2F7F5]/65 p-3 text-xs dark:border-zinc-800 dark:border-l-teal-400 dark:bg-zinc-900/70"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                                      {entry.decision_no}
                                    </span>
                                    <Badge variant={changeMeta.variant}>
                                      {changeMeta.label}
                                    </Badge>
                                    {entry.addendum_contract_number && (
                                      <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                                        HĐ/PL: {entry.addendum_contract_number}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
                                    Hiệu lực: {formatDateVN(entry.effective_date)}
                                  </span>
                                </div>

                                <div className="mt-1.5 text-[#11221E] dark:text-zinc-200">
                                  <span className="text-[#5C7871] dark:text-zinc-400">
                                    Chức danh:
                                  </span>{' '}
                                  {entry.old_position_name} →{' '}
                                  <strong>{entry.new_position_name}</strong>
                                  {entry.old_department_name !== entry.new_department_name && (
                                    <>
                                      {' '}
                                      · <span className="text-[#5C7871]">Đơn vị:</span>{' '}
                                      {entry.old_department_name} →{' '}
                                      <strong>{entry.new_department_name}</strong>
                                    </>
                                  )}
                                </div>

                                {!hideSalary && entry.old_salary_vnd !== entry.new_salary_vnd && (
                                  <div className="mt-1 font-mono text-[11px] tabular-nums text-[#11221E] dark:text-zinc-200">
                                    Lương cơ bản: {formatVND(entry.old_salary_vnd)} →{' '}
                                    <strong className="text-[#0F766E] dark:text-teal-400">
                                      {formatVND(entry.new_salary_vnd)}
                                    </strong>
                                  </div>
                                )}

                                <p className="mt-1 text-[#415A54] dark:text-zinc-400">
                                  {entry.reason} · Người ký:{' '}
                                  <span className="font-medium text-[#11221E] dark:text-zinc-300">
                                    {entry.signed_by_name}
                                  </span>
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* AI Retention Insight */}
                    {!isDeptManager && (
                      <div className="rounded-xl border border-[#0F766E]/25 bg-[#CBE8E2]/45 p-3 text-xs dark:border-teal-400/20 dark:bg-teal-950/30">
                        <div className="font-semibold text-[#0B4F4A] dark:text-teal-300">
                          Đánh giá AI Retention
                        </div>
                        <p className="mt-1 text-[#11221E] dark:text-zinc-300">
                          {selectedEmployee.ai_retention_note}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sticky Modal Footer — NO hard delete, Offboarding workflow instead */}
              <div className="shrink-0 border-t border-[#C6D9D3] bg-[#FCFEFD] px-6 py-3.5 dark:border-zinc-800/80 dark:bg-[#121214]">
                {isEditingEmp ? (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingEmp(false)}
                    >
                      Hủy bỏ
                    </Button>
                    <Button
                      type="submit"
                      form="edit-employee-legal-form"
                      variant="primary"
                      size="sm"
                    >
                      Lưu hồ sơ pháp lý
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {canManageHr ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEditEmployee(selectedEmployee)}
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Cập nhật pháp lý &amp; Hồ sơ
                        </Button>

                        {selectedEmployee.employment_status === 'RESIGNED' ? (
                          <Button type="button" variant="outline" size="sm" disabled>
                            Đã hoàn tất nghỉ việc
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={selectedEmployee.employee_code === 'NV-2024-001'}
                            onClick={() => handleStartOffboarding(selectedEmployee)}
                            className="border-amber-600/40 bg-amber-50/70 text-amber-900 hover:bg-amber-100/80 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-300"
                          >
                            <UserMinus className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {selectedEmployee.employment_status === 'NOTICE_PERIOD'
                              ? 'Theo dõi Offboarding'
                              : 'Khởi tạo nghỉ việc (Offboarding)'}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span />
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedEmployee(null)}
                    >
                      Đóng
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: ADD EMPLOYEE / CREATE PRE-BOARDING INVITE */}
      <Dialog
        open={isAddEmpOpen}
        onOpenChange={(open) => {
          setIsAddEmpOpen(open);
          if (!open) setCreatedInviteResult(null);
        }}
      >
        <DialogContent className="flex max-h-[88dvh] max-w-2xl flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800/80">
            <DialogHeader>
              <DialogTitle>Tiếp nhận Nhân sự mới &amp; Khởi tạo Pre-boarding</DialogTitle>
              <DialogDescription>
                Mở liên kết tự khai báo Pre-boarding cho nhân sự chờ nhận việc (PENDING_ONBOARD) hoặc nhập trực tiếp hồ sơ pháp lý
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {createdInviteResult ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#6EE7B7] bg-[#D1FAE5]/60 p-4 text-xs text-[#065F46] dark:border-emerald-400/25 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <div className="text-sm font-semibold">
                    Đã khởi tạo hồ sơ Chờ nhận việc ({createdInviteResult.employee_code}) &amp; Cổng Pre-boarding!
                  </div>
                  <p className="mt-1">
                    Nhân sự <strong>{createdInviteResult.full_name}</strong> đã được ghi nhận ở trạng thái chờ nhận việc, tài khoản SSO tạm khóa chờ IT kích hoạt và tạo sẵn lộ trình 8 hạng mục Onboarding.
                  </p>
                </div>

                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 space-y-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                    Đường dẫn Cổng tự khai báo gửi cho ứng viên:
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      readOnly
                      value={createdInviteResult.preboarding_url}
                      className="font-mono text-xs tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        void handleCopyPreboardingLink(createdInviteResult.token)
                      }
                    >
                      {copiedTokenKey === createdInviteResult.token ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                      ) : (
                        <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={1.5} />
                      )}
                      Sao chép liên kết
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[#415A54] dark:text-zinc-400">
                    <span className="font-mono tabular-nums">
                      Token: {createdInviteResult.token} · Nhận việc:{' '}
                      {formatDateVN(createdInviteResult.expected_start_date)}
                    </span>
                    <Link
                      href={createdInviteResult.preboarding_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#0F766E] hover:underline dark:text-teal-400"
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Mở thử trang Pre-boarding ngay
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <form
                id="add-employee-form"
                onSubmit={(e) => void handleAddEmployee(e)}
                className="space-y-4 text-xs"
              >
                {/* Mode Switcher */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setAddMode('PREBOARDING')}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      addMode === 'PREBOARDING'
                        ? 'border-[#0F766E] bg-[#E8F3EF] dark:border-teal-400 dark:bg-teal-950/30'
                        : 'border-[#C6D9D3] bg-[#FCFEFD] hover:bg-[#F2F7F5] dark:border-zinc-800 dark:bg-zinc-900'
                    )}
                  >
                    <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                      1. Gửi link Pre-boarding (PENDING_ONBOARD)
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">
                      Sinh link /preboarding?token=... để ứng viên tự điền CCCD, MST, STK ngân hàng
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddMode('DIRECT')}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      addMode === 'DIRECT'
                        ? 'border-[#0F766E] bg-[#E8F3EF] dark:border-teal-400 dark:bg-teal-950/30'
                        : 'border-[#C6D9D3] bg-[#FCFEFD] hover:bg-[#F2F7F5] dark:border-zinc-800 dark:bg-zinc-900'
                    )}
                  >
                    <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                      2. Tạo trực tiếp hồ sơ đầy đủ
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">
                      HR nhập ngay CCCD, MST, BHXH, Ngân hàng và phát hành hợp đồng
                    </p>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Họ và tên nhân sự *
                    </label>
                    <Input
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Minh Khôi"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      {addMode === 'PREBOARDING'
                        ? 'Email cá nhân nhận link *'
                        : 'Email công ty *'}
                    </label>
                    <Input
                      type="email"
                      value={newEmpEmail}
                      onChange={(e) => setNewEmpEmail(e.target.value)}
                      placeholder={
                        addMode === 'PREBOARDING'
                          ? 'khoi.nguyen@gmail.com'
                          : 'khoi.nguyen@hrm-enterprise.vn'
                      }
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Số điện thoại
                    </label>
                    <Input
                      value={newEmpPhone}
                      onChange={(e) => setNewEmpPhone(e.target.value)}
                      className="font-mono tabular-nums"
                      placeholder="0901234567"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Ngày dự kiến nhận việc
                    </label>
                    <Input
                      type="date"
                      value={newEmpStartDate}
                      onChange={(e) => setNewEmpStartDate(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Phòng ban tiếp nhận
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
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Chức danh công việc
                    </label>
                    <Input
                      value={newEmpPosition}
                      onChange={(e) => setNewEmpPosition(e.target.value)}
                      placeholder="Kỹ sư Phần mềm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Mức lương chính thức 100% (VND)
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={newEmpSalary ? formatNumberVN(Number(newEmpSalary)) : ''}
                      onChange={(e) =>
                        setNewEmpSalary(e.target.value.replace(/\D/g, ''))
                      }
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Tỷ lệ hưởng lương thử việc (%)
                    </label>
                    <Select
                      value={newEmpProbationPct}
                      onValueChange={setNewEmpProbationPct}
                      options={[
                        { label: '85% mức lương chính thức (Chuẩn Luật LĐ)', value: '85' },
                        { label: '90% mức lương chính thức', value: '90' },
                        { label: '100% mức lương chính thức', value: '100' },
                      ]}
                    />
                  </div>
                </div>

                {addMode === 'DIRECT' && (
                  <div className="space-y-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                      Thông tin Pháp lý, Ngân hàng &amp; Liên hệ khẩn cấp
                    </div>

                    <div>
                      <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                        Trạng thái khởi tạo
                      </label>
                      <Select
                        value={newEmpStatus}
                        onValueChange={(v) => setNewEmpStatus(v as EmploymentStatus)}
                        options={[
                          { label: 'Thử việc (PROBATION)', value: 'PROBATION' },
                          { label: 'Chính thức (OFFICIAL)', value: 'OFFICIAL' },
                        ]}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Số CCCD
                        </label>
                        <Input
                          value={newNationalId}
                          onChange={(e) =>
                            setNewNationalId(e.target.value.replace(/\D/g, ''))
                          }
                          maxLength={12}
                          className="font-mono tabular-nums"
                          placeholder="079097009888"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Ngày cấp
                        </label>
                        <Input
                          type="date"
                          value={newNationalIdDate}
                          onChange={(e) => setNewNationalIdDate(e.target.value)}
                          className="font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Nơi cấp
                        </label>
                        <Input
                          value={newNationalIdPlace}
                          onChange={(e) => setNewNationalIdPlace(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Mã số thuế TNCN
                        </label>
                        <Input
                          value={newTaxCode}
                          onChange={(e) => setNewTaxCode(e.target.value)}
                          className="font-mono tabular-nums"
                          placeholder="8459901122"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Mã số BHXH
                        </label>
                        <Input
                          value={newBhxhNo}
                          onChange={(e) => setNewBhxhNo(e.target.value)}
                          className="font-mono tabular-nums"
                          placeholder="7926009911"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Người phụ thuộc
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          value={newDependents}
                          onChange={(e) => setNewDependents(e.target.value)}
                          className="font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Ngân hàng
                        </label>
                        <Input
                          value={newBankName}
                          onChange={(e) => setNewBankName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Số tài khoản
                        </label>
                        <Input
                          value={newBankAccount}
                          onChange={(e) => setNewBankAccount(e.target.value)}
                          className="font-mono tabular-nums"
                          placeholder="0071009988776"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                        Địa chỉ cư trú
                      </label>
                      <Input
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        placeholder="Số nhà, đường, Quận/Huyện, Tỉnh/TP"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Liên hệ khẩn cấp
                        </label>
                        <Input
                          value={newEmgName}
                          onChange={(e) => setNewEmgName(e.target.value)}
                          placeholder="Họ tên người thân"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          SĐT khẩn cấp
                        </label>
                        <Input
                          value={newEmgPhone}
                          onChange={(e) => setNewEmgPhone(e.target.value)}
                          className="font-mono tabular-nums"
                          placeholder="0908112233"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                          Quan hệ
                        </label>
                        <Input
                          value={newEmgRelation}
                          onChange={(e) => setNewEmgRelation(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          <div className="shrink-0 border-t border-[#C6D9D3] bg-[#FCFEFD] px-6 py-3.5 dark:border-zinc-800/80 dark:bg-[#121214]">
            <DialogFooter>
              {createdInviteResult ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsAddEmpOpen(false);
                    setCreatedInviteResult(null);
                  }}
                >
                  Hoàn tất
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddEmpOpen(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    form="add-employee-form"
                    variant="primary"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                    {addMode === 'PREBOARDING'
                      ? 'Khởi tạo & Sinh link Pre-boarding'
                      : 'Lưu hồ sơ & Phát hành HĐ'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: CREATE CONTRACT OR ADDENDUM */}
      <Dialog open={isAddContractOpen} onOpenChange={setIsAddContractOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Phát hành Hợp đồng lao động / Phụ lục điều chỉnh</DialogTitle>
            <DialogDescription>
              Lưu đồng bộ vào kho hợp đồng toàn công ty và cập nhật thông tin lương của nhân sự
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateContract} className="mt-4 space-y-3.5 text-xs">
            <div>
              <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                Nhân sự áp dụng *
              </label>
              <Select
                value={newContractEmpId}
                onValueChange={(val) => {
                  setNewContractEmpId(val);
                  const found = employees.find((e) => e.id === val);
                  if (found) {
                    setNewContractSalaryVnd(
                      String(found.official_salary_vnd ?? found.base_salary_vnd)
                    );
                  }
                }}
                options={employees
                  .filter((e) => e.employment_status !== 'RESIGNED')
                  .map((e) => ({
                    label: `${e.employee_code} — ${e.full_name} (${e.department_name})`,
                    value: e.id,
                  }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Loại Hợp đồng / Phụ lục *
                </label>
                <Select
                  value={newContractType}
                  onValueChange={(v) => setNewContractType(v as ContractType)}
                  options={[
                    { label: 'Hợp đồng thử việc 2 tháng', value: 'PROBATION_2M' },
                    { label: 'Xác định thời hạn 12 tháng', value: 'FIXED_TERM_12M' },
                    { label: 'Xác định thời hạn 24 tháng', value: 'FIXED_TERM_24M' },
                    { label: 'Không xác định thời hạn', value: 'INDEFINITE_TERM' },
                    { label: 'Phụ lục điều chỉnh lương/chức danh', value: 'ADDENDUM' },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Ngày hiệu lực *
                </label>
                <Input
                  type="date"
                  value={newContractStartDate}
                  onChange={(e) => setNewContractStartDate(e.target.value)}
                  className="font-mono tabular-nums"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Mức lương chính thức 100% (VND) *
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={
                    newContractSalaryVnd
                      ? formatNumberVN(Number(newContractSalaryVnd))
                      : ''
                  }
                  onChange={(e) =>
                    setNewContractSalaryVnd(e.target.value.replace(/\D/g, ''))
                  }
                  className="font-mono tabular-nums"
                  required
                />
              </div>

              {newContractType === 'PROBATION_2M' ? (
                <div>
                  <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                    Tỷ lệ hưởng thử việc (%)
                  </label>
                  <Select
                    value={newContractSalaryPct}
                    onValueChange={setNewContractSalaryPct}
                    options={[
                      { label: '85% lương chính thức', value: '85' },
                      { label: '90% lương chính thức', value: '90' },
                      { label: '100% lương chính thức', value: '100' },
                    ]}
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                    Số Quyết định đính kèm (nếu có)
                  </label>
                  <Input
                    value={newContractDecisionNo}
                    onChange={(e) => setNewContractDecisionNo(e.target.value)}
                    className="font-mono tabular-nums"
                    placeholder="QĐ-2026-125/LV-NS"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                Ghi chú điều khoản
              </label>
              <Input
                value={newContractNotes}
                onChange={(e) => setNewContractNotes(e.target.value)}
                placeholder="Nội dung thỏa thuận chính hoặc phụ lục điều chỉnh..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddContractOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Lưu Hợp đồng / Phụ lục
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
