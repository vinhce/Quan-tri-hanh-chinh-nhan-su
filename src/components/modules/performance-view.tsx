'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileCheck2,
  FileSignature,
  History,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import { formatDecisionNo } from '@/lib/hrm/ids';
import { fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  convertProbationToOfficial,
  getAllRuntimeEmployees,
  getCareerHistories,
  getPerformanceReviews,
  getRuntimeDepartments,
  HRM_RUNTIME_EVENT,
  isOfficialEmployeeStatus,
  promoteOrTransferEmployee,
  pushNotification,
  savePerformanceReview,
} from '@/lib/runtime-store';
import { alertSwal, confirmSwal, promptTextSwal } from '@/lib/swal';
import { MOCK_POSITIONS } from '@/mock/employees';
import type {
  BurnoutTurnoverAlert,
  CareerChangeType,
  CareerHistoryEntry,
  Department,
  Employee,
  EmploymentStatus,
  PerformanceReview,
  PerformanceReviewCycle,
  PerformanceReviewResult,
  RoleCode,
} from '@/mock/types';
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

type PerformanceTabKey = 'reviews' | 'career' | 'burnout';
type CycleFilterKey = 'ALL' | PerformanceReviewCycle;
type DecisionModalChangeType =
  | 'PROMOTION'
  | 'DEPARTMENT_TRANSFER'
  | 'SALARY_ADJUSTMENT'
  | 'ROLE_CHANGE';

const GRADE_BADGE: Record<PerformanceReview['grade'], BadgeVariant> = {
  'A+': 'teal',
  A: 'success',
  'B+': 'default',
  B: 'secondary',
  C: 'warning',
};

const CYCLE_META: Record<
  PerformanceReviewCycle,
  { label: string; shortLabel: string; variant: BadgeVariant; defaultPeriod: string }
> = {
  PROBATION: {
    label: 'Đánh giá thử việc',
    shortLabel: 'Thử việc',
    variant: 'warning',
    defaultPeriod: 'Thử việc T10-T11/2026',
  },
  QUARTERLY: {
    label: 'Đánh giá Quý',
    shortLabel: 'Định kỳ Quý',
    variant: 'teal',
    defaultPeriod: '2026-Q4',
  },
  ANNUAL: {
    label: 'Đánh giá Năm',
    shortLabel: 'Tổng kết Năm',
    variant: 'default',
    defaultPeriod: 'Năm 2026',
  },
};

const RESULT_META: Record<
  PerformanceReviewResult,
  { label: string; variant: BadgeVariant }
> = {
  PASS: { label: 'Đạt thử việc', variant: 'success' },
  EXTEND: { label: 'Gia hạn thử việc', variant: 'warning' },
  FAIL: { label: 'Không đạt', variant: 'destructive' },
  EXCELLENT: { label: 'Xuất sắc', variant: 'teal' },
  GOOD: { label: 'Hoàn thành tốt', variant: 'success' },
  AVERAGE: { label: 'Đạt yêu cầu', variant: 'secondary' },
  POOR: { label: 'Cần cải thiện', variant: 'warning' },
};

const REVIEW_STATUS_META: Record<
  PerformanceReview['status'],
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Bản nháp', variant: 'muted' },
  SUBMITTED: { label: 'Chờ phê duyệt', variant: 'warning' },
  APPROVED: { label: 'Đã phê duyệt', variant: 'success' },
};

const CHANGE_TYPE_META: Record<
  CareerChangeType,
  { label: string; variant: BadgeVariant; prefix: string }
> = {
  PROMOTION: { label: 'Thăng chức', variant: 'teal', prefix: 'BN' },
  DEPARTMENT_TRANSFER: { label: 'Điều chuyển phòng ban', variant: 'info', prefix: 'DC' },
  TRANSFER: { label: 'Điều chuyển phòng ban', variant: 'info', prefix: 'DC' },
  SALARY_ADJUSTMENT: { label: 'Điều chỉnh lương', variant: 'success', prefix: 'TL' },
  PROBATION_TO_OFFICIAL: { label: 'Chuyển chính thức', variant: 'default', prefix: 'CT' },
  ROLE_CHANGE: { label: 'Nâng quyền quản lý', variant: 'warning', prefix: 'PQ' },
};

const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  DIRECTOR: 'Giám đốc',
  HR_MANAGER: 'Quản trị Nhân sự',
  DEPT_MANAGER: 'Trưởng bộ phận',
  EMPLOYEE: 'Nhân viên',
  CANDIDATE: 'Ứng viên',
};

const ROLE_SHORT_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  DIRECTOR: 'Giám đốc',
  HR_MANAGER: 'Quản trị Nhân sự',
  DEPT_MANAGER: 'Trưởng bộ phận',
  EMPLOYEE: 'Nhân viên',
  CANDIDATE: 'Ứng viên',
};

const EMPLOYMENT_STATUS_META: Record<
  EmploymentStatus,
  { label: string; variant: BadgeVariant }
> = {
  PENDING_ONBOARD: { label: 'Chờ nhận việc', variant: 'muted' },
  PROBATION: { label: 'Đang thử việc', variant: 'warning' },
  ACTIVE: { label: 'Chính thức', variant: 'success' },
  OFFICIAL: { label: 'Chính thức', variant: 'success' },
  ON_LEAVE: { label: 'Nghỉ dài hạn', variant: 'secondary' },
  NOTICE_PERIOD: { label: 'Đang báo trước nghỉ', variant: 'warning' },
  RESIGNED: { label: 'Đã nghỉ việc', variant: 'destructive' },
};

const RISK_BADGE: Record<
  BurnoutTurnoverAlert['risk_level'],
  { label: string; variant: 'destructive' | 'warning' | 'secondary' | 'success' }
> = {
  CRITICAL: { label: 'Nguy cấp', variant: 'destructive' },
  HIGH: { label: 'Rủi ro cao', variant: 'warning' },
  MEDIUM: { label: 'Theo dõi', variant: 'secondary' },
  LOW: { label: 'Ổn định', variant: 'success' },
};

const DEFAULT_EMPLOYEE_OKR_OBJECTIVES: Record<
  string,
  Array<{ title: string; progress: number }>
> = {
  '2026-Q3': [
    { title: 'Duy trì uptime cổng thanh toán >= 99.95%', progress: 100 },
    { title: 'Hoàn thành tái cấu trúc API chấm công v2', progress: 92 },
    { title: 'Mentoring 2 kỹ sư Junior đạt chuẩn code review', progress: 90 },
  ],
  '2026-Q2': [
    { title: 'Giảm thời gian phản hồi API dưới 180ms', progress: 95 },
    { title: 'Tăng tỷ lệ test coverage module lương lên 85%', progress: 87 },
  ],
};

function normalizeVN(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVnd(amount: number): string {
  return `${Math.round(amount || 0).toLocaleString('vi-VN')} đ`;
}

function formatSalaryInputVnd(rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDateDisplay(iso: string | undefined | null): string {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function calcSalaryIncreaseInfo(
  oldSalary: number,
  newSalary: number
): { label: string; diffVnd: number; isIncrease: boolean; isDecrease: boolean } {
  const diffVnd = Math.round((newSalary || 0) - (oldSalary || 0));
  if (!oldSalary || oldSalary <= 0 || diffVnd === 0) {
    return { label: '0%', diffVnd: 0, isIncrease: false, isDecrease: false };
  }
  const pct = (diffVnd / oldSalary) * 100;
  const sign = pct > 0 ? '+' : '';
  return {
    label: `${sign}${pct.toFixed(1)}%`,
    diffVnd,
    isIncrease: pct > 0,
    isDecrease: pct < 0,
  };
}

function inferGradeFromScore(score: number): PerformanceReview['grade'] {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 75) return 'B';
  return 'C';
}

function isMidMonthEffectiveDate(dateIso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const day = Number.parseInt(dateIso.slice(8, 10), 10);
  return !Number.isNaN(day) && day > 1;
}

export function PerformanceView() {
  const {
    role,
    setActiveNav,
    currentUserEmail,
    currentUserProfile,
    navIntent,
    clearNavIntent,
    showToast,
  } = useApp();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [careerHistories, setCareerHistories] = useState<CareerHistoryEntry[]>([]);
  const [burnoutAlerts, setBurnoutAlerts] = useState<BurnoutTurnoverAlert[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<PerformanceTabKey>('reviews');
  const [cycleFilter, setCycleFilter] = useState<CycleFilterKey>('ALL');
  const [reviewSearch, setReviewSearch] = useState<string>('');
  const [careerTypeFilter, setCareerTypeFilter] = useState<string>('ALL');
  const [careerSearch, setCareerSearch] = useState<string>('');
  const [selectedSelfPeriod, setSelectedSelfPeriod] = useState<string>('');

  // Create / Edit / Approve Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState<boolean>(false);
  const [editingReview, setEditingReview] = useState<PerformanceReview | null>(null);
  const [formEmployeeId, setFormEmployeeId] = useState<string>('');
  const [formCycle, setFormCycle] = useState<PerformanceReviewCycle>('QUARTERLY');
  const [formPeriodLabel, setFormPeriodLabel] = useState<string>('2026-Q4');
  const [formKpiScore, setFormKpiScore] = useState<string>('90');
  const [formOkrPercent, setFormOkrPercent] = useState<string>('92');
  const [formGrade, setFormGrade] = useState<PerformanceReview['grade']>('A');
  const [formResult, setFormResult] = useState<PerformanceReviewResult>('EXCELLENT');
  const [formBonusVnd, setFormBonusVnd] = useState<string>('2000000');
  const [formReviewStatus, setFormReviewStatus] =
    useState<PerformanceReview['status']>('APPROVED');
  const [formReviewNote, setFormReviewNote] = useState<string>('');
  const [isSavingReview, setIsSavingReview] = useState<boolean>(false);

  // Career Progression / Decision Issuance Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState<boolean>(false);
  const [decEmployeeId, setDecEmployeeId] = useState<string>('');
  const [decChangeType, setDecChangeType] =
    useState<DecisionModalChangeType>('PROMOTION');
  const [decDecisionNo, setDecDecisionNo] = useState<string>('');
  const [decDecisionNoTouched, setDecDecisionNoTouched] = useState<boolean>(false);
  const [decEffectiveDate, setDecEffectiveDate] = useState<string>('2026-11-16');
  const [decNewDeptId, setDecNewDeptId] = useState<string>('');
  const [decNewPositionName, setDecNewPositionName] = useState<string>('');
  const [decNewSalaryVnd, setDecNewSalaryVnd] = useState<string>('');
  const [decNewRoleCode, setDecNewRoleCode] = useState<RoleCode>('EMPLOYEE');
  const [decReason, setDecReason] = useState<string>('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<boolean>(false);

  const canManageCareerDecisions =
    role === 'HR_MANAGER' || role === 'DIRECTOR' || role === 'SUPER_ADMIN';
  const canApproveExecutiveDecision =
    role === 'DIRECTOR' || role === 'SUPER_ADMIN';
  const canEvaluateReviews =
    role === 'DEPT_MANAGER' ||
    role === 'HR_MANAGER' ||
    role === 'DIRECTOR' ||
    role === 'SUPER_ADMIN';
  const canApproveReviews =
    role === 'HR_MANAGER' || role === 'DIRECTOR' || role === 'SUPER_ADMIN';
  const canViewAllSalaries =
    role === 'HR_MANAGER' || role === 'DIRECTOR' || role === 'SUPER_ADMIN';

  const syncRuntimeState = useCallback(() => {
    setEmployees(getAllRuntimeEmployees());
    setDepartments(getRuntimeDepartments());
    setReviews(getPerformanceReviews());
    setCareerHistories(getCareerHistories());
  }, []);

  const loadData = useCallback(
    async (bypassCache = false) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const mockData = await fetchEmployeesMock({ bypassCache });
        setBurnoutAlerts(mockData.MOCK_BURNOUT_ALERTS);
        syncRuntimeState();
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Không thể tải dữ liệu Đánh giá hiệu suất & Lộ trình công tác.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [syncRuntimeState]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const handleRuntimeUpdate = () => {
      syncRuntimeState();
    };
    window.addEventListener(HRM_RUNTIME_EVENT, handleRuntimeUpdate);
    window.addEventListener('storage', handleRuntimeUpdate);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, handleRuntimeUpdate);
      window.removeEventListener('storage', handleRuntimeUpdate);
    };
  }, [syncRuntimeState]);

  // Dynamic Actor Resolution (Replaces hardcoded emp-004 / emp-003)
  const actorEmployee = useMemo(() => {
    if (employees.length === 0) return null;

    const rawProfileCode = currentUserProfile?.employee_code?.trim();
    const codeNeedle = rawProfileCode?.toLowerCase();
    const hasExplicitEmployeeCode = Boolean(
      codeNeedle && !codeNeedle.startsWith('uv-')
    );

    if (hasExplicitEmployeeCode && codeNeedle) {
      const byProfileCode = employees.find(
        (e) => e.employee_code.trim().toLowerCase() === codeNeedle
      );
      if (byProfileCode) return byProfileCode;
    }

    const emailCandidate = (currentUserEmail || currentUserProfile?.email || '')
      .trim()
      .toLowerCase();
    if (emailCandidate) {
      const localPart = emailCandidate.split('@')[0];
      const byExactEmail = employees.find(
        (e) =>
          e.email.trim().toLowerCase() === emailCandidate ||
          e.personal_email?.trim().toLowerCase() === emailCandidate
      );
      if (byExactEmail) return byExactEmail;

      if (
        emailCandidate.endsWith('@lacviethrm.vn') ||
        emailCandidate.endsWith('@hrm-enterprise.vn')
      ) {
        const byCorporateSlug = employees.find(
          (e) => e.email.split('@')[0].toLowerCase() === localPart
        );
        if (byCorporateSlug) return byCorporateSlug;
      }
    }

    if (hasExplicitEmployeeCode) {
      return null;
    }

    const fallbackCode = ROLE_DEFAULT_PROFILES[role]?.employee_code;
    if (fallbackCode) {
      const byDefaultRole = employees.find(
        (e) => e.employee_code === fallbackCode
      );
      if (byDefaultRole) return byDefaultRole;
    }

    return null;
  }, [employees, currentUserProfile, currentUserEmail, role]);

  const actorIdentity = useMemo(() => {
    const fallbackProfile = ROLE_DEFAULT_PROFILES[role];
    const resolvedCode =
      currentUserProfile?.employee_code ||
      actorEmployee?.employee_code ||
      fallbackProfile.employee_code;
    const resolvedName =
      currentUserProfile?.fullName ||
      actorEmployee?.full_name ||
      fallbackProfile.fullName;
    return {
      id: actorEmployee?.id ?? currentUserProfile?.employee_code ?? 'emp-self',
      code: resolvedCode,
      name: resolvedName,
      employeeCode: resolvedCode,
      fullName: resolvedName,
      positionName:
        actorEmployee?.position_name ??
        currentUserProfile?.title ??
        fallbackProfile.title,
      departmentId:
        actorEmployee?.department_id ??
        currentUserProfile?.department_id ??
        '',
      departmentName:
        actorEmployee?.department_name ??
        currentUserProfile?.department ??
        fallbackProfile.department,
    };
  }, [actorEmployee, currentUserProfile, role]);

  // Handle cross-module navigation intents (notifications / deep links)
  useEffect(() => {
    if (!navIntent) return;
    if (navIntent.navId !== 'kpi' && navIntent.navId !== 'performance') return;

    if (
      navIntent.subTab === 'reviews' ||
      navIntent.subTab === 'career' ||
      navIntent.subTab === 'burnout'
    ) {
      if (role === 'EMPLOYEE' && navIntent.subTab === 'burnout') {
        setActiveTab('reviews');
      } else {
        setActiveTab(navIntent.subTab);
      }
    }

    if (navIntent.entityId && employees.length > 0) {
      const matched = employees.find(
        (e) =>
          e.id === navIntent.entityId || e.employee_code === navIntent.entityId
      );
      const queryValue = matched ? matched.employee_code : navIntent.entityId;
      setReviewSearch(queryValue);
      setCareerSearch(queryValue);
    }

    clearNavIntent();
  }, [navIntent, clearNavIntent, employees, role]);

  // Reset tab safely if switching to EMPLOYEE while on 'burnout'
  useEffect(() => {
    if (role === 'EMPLOYEE' && activeTab === 'burnout') {
      setActiveTab('reviews');
    }
  }, [role, activeTab]);

  // Dynamic Department Scope for DEPT_MANAGER
  const managerDepartmentScope = useMemo(() => {
    const allowedDeptIds = new Set<string>();
    const allowedDeptNames = new Set<string>();

    if (role !== 'DEPT_MANAGER') {
      departments.forEach((d) => {
        allowedDeptIds.add(d.id);
        allowedDeptNames.add(d.department_name);
      });
      return {
        deptIds: allowedDeptIds,
        deptNames: allowedDeptNames,
        scopeLabel: 'Toàn công ty',
      };
    }

    const explicitDeptId = currentUserProfile?.department_id?.trim();
    if (explicitDeptId) {
      allowedDeptIds.add(explicitDeptId);
    }
    if (
      actorEmployee &&
      (!explicitDeptId || actorEmployee.department_id === explicitDeptId)
    ) {
      if (actorEmployee.department_id) {
        allowedDeptIds.add(actorEmployee.department_id);
      }
      for (const d of departments) {
        if (d.manager_id === actorEmployee.id) {
          allowedDeptIds.add(d.id);
        }
      }
    }

    for (const d of departments) {
      if (allowedDeptIds.has(d.id)) {
        allowedDeptNames.add(d.department_name);
      }
    }

    const primaryDept =
      departments.find((d) => d.id === actorEmployee?.department_id) ??
      departments.find((d) => allowedDeptIds.has(d.id));

    return {
      deptIds: allowedDeptIds,
      deptNames: allowedDeptNames,
      scopeLabel:
        primaryDept?.department_name ??
        actorEmployee?.department_name ??
        'Phòng ban phụ trách',
    };
  }, [role, departments, actorEmployee, currentUserProfile?.department_id]);

  const employeeMapById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.id, emp);
      map.set(emp.employee_code, emp);
    }
    return map;
  }, [employees]);

  // Employees visible to current actor
  const scopedEmployees = useMemo(() => {
    if (role === 'EMPLOYEE') {
      return actorEmployee ? [actorEmployee] : [];
    }
    if (role === 'DEPT_MANAGER') {
      return employees.filter(
        (emp) =>
          emp.employment_status !== 'RESIGNED' &&
          (managerDepartmentScope.deptIds.has(emp.department_id) ||
            managerDepartmentScope.deptNames.has(emp.department_name))
      );
    }
    return employees;
  }, [role, employees, actorEmployee, managerDepartmentScope]);

  // Subordinates table for DEPT_MANAGER (excluding self, strictly hiding salary)
  const managerTeamMembers = useMemo(() => {
    if (role !== 'DEPT_MANAGER') return [];
    return scopedEmployees.filter(
      (emp) => !actorEmployee || emp.id !== actorEmployee.id
    );
  }, [role, scopedEmployees, actorEmployee]);

  const evaluableEmployees = useMemo(() => {
    return scopedEmployees.filter((emp) => emp.employment_status !== 'RESIGNED');
  }, [scopedEmployees]);

  // Scoped Performance Reviews
  const roleScopedReviews = useMemo(() => {
    if (role === 'EMPLOYEE') {
      return reviews.filter(
        (r) =>
          (actorEmployee && r.employee_id === actorEmployee.id) ||
          r.employee_code === actorIdentity.employeeCode
      );
    }
    if (role === 'DEPT_MANAGER') {
      const teamIds = new Set(scopedEmployees.map((e) => e.id));
      const teamCodes = new Set(scopedEmployees.map((e) => e.employee_code));
      return reviews.filter((r) => {
        const liveEmp =
          employeeMapById.get(r.employee_id) ??
          employeeMapById.get(r.employee_code);
        if (liveEmp) {
          return (
            managerDepartmentScope.deptIds.has(liveEmp.department_id) ||
            managerDepartmentScope.deptNames.has(liveEmp.department_name)
          );
        }
        return (
          teamIds.has(r.employee_id) ||
          teamCodes.has(r.employee_code) ||
          managerDepartmentScope.deptIds.has(r.department_id) ||
          managerDepartmentScope.deptNames.has(r.department_name)
        );
      });
    }
    return reviews;
  }, [
    role,
    reviews,
    actorEmployee,
    actorIdentity,
    scopedEmployees,
    employeeMapById,
    managerDepartmentScope,
  ]);

  const filteredReviews = useMemo(() => {
    const q = normalizeVN(reviewSearch);
    return roleScopedReviews.filter((rec) => {
      if (cycleFilter !== 'ALL' && rec.cycle !== cycleFilter) return false;
      if (!q) return true;
      const haystack = normalizeVN(
        `${rec.review_code} ${rec.employee_code} ${rec.full_name} ${rec.department_name} ${rec.position_name} ${rec.period_label} ${rec.reviewer_name}`
      );
      return haystack.includes(q);
    });
  }, [roleScopedReviews, cycleFilter, reviewSearch]);

  // Scoped Career Histories (Immutable Append-Only Ledger)
  const roleScopedCareerHistories = useMemo(() => {
    if (role === 'EMPLOYEE') {
      return careerHistories.filter(
        (h) =>
          (actorEmployee && h.employee_id === actorEmployee.id) ||
          h.employee_code === actorIdentity.employeeCode
      );
    }
    if (role === 'DEPT_MANAGER') {
      const teamIds = new Set(scopedEmployees.map((e) => e.id));
      const teamCodes = new Set(scopedEmployees.map((e) => e.employee_code));
      return careerHistories.filter((h) => {
        const liveEmp =
          employeeMapById.get(h.employee_id) ??
          employeeMapById.get(h.employee_code);
        if (liveEmp) {
          return (
            managerDepartmentScope.deptIds.has(liveEmp.department_id) ||
            managerDepartmentScope.deptNames.has(liveEmp.department_name)
          );
        }
        return (
          teamIds.has(h.employee_id) ||
          teamCodes.has(h.employee_code) ||
          managerDepartmentScope.deptIds.has(h.new_department_id)
        );
      });
    }
    return careerHistories;
  }, [
    role,
    careerHistories,
    actorEmployee,
    actorIdentity,
    scopedEmployees,
    employeeMapById,
    managerDepartmentScope,
  ]);

  const filteredCareerHistories = useMemo(() => {
    const q = normalizeVN(careerSearch);
    return roleScopedCareerHistories.filter((entry) => {
      if (careerTypeFilter !== 'ALL') {
        if (
          careerTypeFilter === 'DEPARTMENT_TRANSFER' &&
          entry.change_type !== 'DEPARTMENT_TRANSFER' &&
          entry.change_type !== 'TRANSFER'
        ) {
          return false;
        } else if (
          careerTypeFilter !== 'DEPARTMENT_TRANSFER' &&
          entry.change_type !== careerTypeFilter
        ) {
          return false;
        }
      }
      if (!q) return true;
      const haystack = normalizeVN(
        `${entry.decision_no} ${entry.employee_code} ${entry.full_name} ${entry.old_department_name} ${entry.new_department_name} ${entry.old_position_name} ${entry.new_position_name} ${entry.addendum_contract_number ?? ''} ${entry.reason}`
      );
      return haystack.includes(q);
    });
  }, [roleScopedCareerHistories, careerTypeFilter, careerSearch]);

  // Scoped Burnout & Turnover Alerts (Enriched with live runtime employee info)
  const visibleAlerts = useMemo(() => {
    const enriched = burnoutAlerts
      .map((alert) => {
        const liveEmp =
          employeeMapById.get(alert.employee_id) ??
          employeeMapById.get(alert.employee_code);
        if (liveEmp && liveEmp.employment_status === 'RESIGNED') {
          return null;
        }
        return liveEmp
          ? {
              ...alert,
              full_name: liveEmp.full_name,
              department_name: liveEmp.department_name,
              position_name: liveEmp.position_name,
            }
          : alert;
      })
      .filter((item): item is BurnoutTurnoverAlert => item !== null);

    if (role === 'DEPT_MANAGER') {
      const teamIds = new Set(scopedEmployees.map((e) => e.id));
      const teamCodes = new Set(scopedEmployees.map((e) => e.employee_code));
      return enriched.filter(
        (a) => teamIds.has(a.employee_id) || teamCodes.has(a.employee_code)
      );
    }
    return enriched;
  }, [burnoutAlerts, employeeMapById, role, scopedEmployees]);

  // Pending Probation -> Official conversions (PROBATION review PASS & employee still PROBATION)
  const pendingProbationConversions = useMemo(() => {
    return roleScopedReviews.filter((r) => {
      if (r.cycle !== 'PROBATION' || r.result !== 'PASS') return false;
      const emp =
        employeeMapById.get(r.employee_id) ??
        employeeMapById.get(r.employee_code);
      return emp?.employment_status === 'PROBATION';
    });
  }, [roleScopedReviews, employeeMapById]);

  // Personal OKR periods for EMPLOYEE view
  const employeeOkrPeriods = useMemo(() => {
    if (role !== 'EMPLOYEE') return [];

    const fromReviews = roleScopedReviews.map((rev) => {
      const presetObjs = DEFAULT_EMPLOYEE_OKR_OBJECTIVES[rev.period_label];
      const dynamicObjs = presetObjs ?? [
        {
          title:
            rev.goals_summary ||
            `Hoàn thành mục tiêu trọng tâm chu kỳ ${rev.period_label} (${rev.position_name})`,
          progress: rev.okr_completion_percent,
        },
        ...(rev.strengths
          ? [{ title: `Điểm mạnh ghi nhận: ${rev.strengths}`, progress: rev.kpi_score }]
          : [
              {
                title: `Đảm bảo chất lượng chuyên môn & phối hợp tại ${rev.department_name}`,
                progress: rev.kpi_score,
              },
            ]),
      ];

      return {
        period: rev.period_label,
        cycle: rev.cycle,
        kpi_score: rev.kpi_score,
        okr_completion_percent: rev.okr_completion_percent,
        grade: rev.grade,
        result: rev.result,
        reviewer: rev.reviewer_name,
        note: rev.review_note,
        bonus_vnd: rev.suggested_bonus_vnd ?? 0,
        objectives: dynamicObjs,
      };
    });

    // Preserve historical 2026-Q2 OKR for NV-2024-004 if not already in runtime reviews
    if (
      actorIdentity.employeeCode === 'NV-2024-004' &&
      !fromReviews.some((p) => p.period === '2026-Q2')
    ) {
      fromReviews.push({
        period: '2026-Q2',
        cycle: 'QUARTERLY',
        kpi_score: 89,
        okr_completion_percent: 91,
        grade: 'B+',
        result: 'GOOD',
        reviewer: 'Lê Hoàng Nam',
        note: 'Triển khai thành công phân hệ đồng bộ bảng công đúng tiến độ.',
        bonus_vnd: 1500000,
        objectives: DEFAULT_EMPLOYEE_OKR_OBJECTIVES['2026-Q2'],
      });
    }

    if (fromReviews.length === 0) {
      const fallbackScore = actorEmployee?.kpi_completion_rate || 88;
      fromReviews.push({
        period: '2026-Q4 (Đang thực hiện)',
        cycle: 'QUARTERLY',
        kpi_score: fallbackScore,
        okr_completion_percent: fallbackScore,
        grade: inferGradeFromScore(fallbackScore),
        result: 'GOOD',
        reviewer: actorEmployee?.manager_name || 'Trưởng bộ phận trực tiếp',
        note: 'Đang theo dõi tiến độ hoàn thành mục tiêu công việc trong kỳ hiện tại.',
        bonus_vnd: 0,
        objectives: [
          {
            title: `Hoàn thành chỉ tiêu chuyên môn vị trí ${actorIdentity.positionName}`,
            progress: fallbackScore,
          },
          {
            title: 'Tuân thủ quy trình phối hợp liên phòng ban và chất lượng bàn giao',
            progress: Math.min(100, fallbackScore + 4),
          },
        ],
      });
    }

    return fromReviews;
  }, [role, roleScopedReviews, actorIdentity, actorEmployee]);

  useEffect(() => {
    if (role === 'EMPLOYEE' && employeeOkrPeriods.length > 0) {
      if (!employeeOkrPeriods.some((p) => p.period === selectedSelfPeriod)) {
        setSelectedSelfPeriod(employeeOkrPeriods[0].period);
      }
    }
  }, [role, employeeOkrPeriods, selectedSelfPeriod]);

  // Helper: Compute auto-suggested Decision No (e.g. QD-2026-BN004)
  const buildSuggestedDecisionNo = useCallback(
    (changeType: DecisionModalChangeType, effectiveDateIso: string) => {
      const year = Number.parseInt(effectiveDateIso.slice(0, 4), 10) || 2026;
      const prefix = CHANGE_TYPE_META[changeType]?.prefix || 'BN';
      const nextSequence = careerHistories.length + 1;
      return formatDecisionNo(year, nextSequence, prefix);
    },
    [careerHistories.length]
  );

  // Open Create / Edit Review Modal
  const openCreateReviewModal = (preselectEmp?: Employee, presetCycle?: PerformanceReviewCycle) => {
    const targetEmp = preselectEmp ?? evaluableEmployees[0] ?? null;
    const initialCycle: PerformanceReviewCycle =
      presetCycle ??
      (targetEmp?.employment_status === 'PROBATION' ? 'PROBATION' : 'QUARTERLY');

    setEditingReview(null);
    setFormEmployeeId(targetEmp?.id ?? '');
    setFormCycle(initialCycle);
    setFormPeriodLabel(CYCLE_META[initialCycle].defaultPeriod);
    const defaultScore = targetEmp?.kpi_completion_rate || 90;
    setFormKpiScore(String(defaultScore));
    setFormOkrPercent(String(Math.min(100, defaultScore + 2)));
    setFormGrade(inferGradeFromScore(defaultScore));
    setFormResult(initialCycle === 'PROBATION' ? 'PASS' : 'EXCELLENT');
    setFormBonusVnd(initialCycle === 'PROBATION' ? '0' : '2000000');
    setFormReviewStatus(canApproveReviews ? 'APPROVED' : 'SUBMITTED');
    setFormReviewNote('');
    setReviewModalOpen(true);
  };

  const openEditReviewModal = (review: PerformanceReview) => {
    if (!canApproveReviews && review.status === 'APPROVED') {
      showToast(
        'Phiếu đánh giá đã phê duyệt',
        'Chỉ bộ phận Nhân sự (HR Manager) hoặc Ban Giám đốc mới được điều chỉnh phiếu đánh giá đã phê duyệt.',
        'warning'
      );
      return;
    }
    setEditingReview(review);
    setFormEmployeeId(review.employee_id);
    setFormCycle(review.cycle);
    setFormPeriodLabel(review.period_label);
    setFormKpiScore(String(review.kpi_score));
    setFormOkrPercent(String(review.okr_completion_percent));
    setFormGrade(review.grade);
    setFormResult(review.result);
    setFormBonusVnd(String(review.suggested_bonus_vnd ?? 0));
    setFormReviewStatus(
      canApproveReviews
        ? review.status
        : review.status === 'DRAFT'
          ? 'DRAFT'
          : 'SUBMITTED'
    );
    setFormReviewNote(review.review_note);
    setReviewModalOpen(true);
  };

  const handleFormCycleChange = (nextCycle: PerformanceReviewCycle) => {
    setFormCycle(nextCycle);
    if (!editingReview) {
      setFormPeriodLabel(CYCLE_META[nextCycle].defaultPeriod);
    }
    if (nextCycle === 'PROBATION') {
      if (!['PASS', 'EXTEND', 'FAIL'].includes(formResult)) {
        setFormResult('PASS');
      }
    } else {
      if (['PASS', 'EXTEND', 'FAIL'].includes(formResult)) {
        setFormResult(Number(formKpiScore) >= 90 ? 'EXCELLENT' : 'GOOD');
      }
    }
  };

  const handleSaveReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp =
      employeeMapById.get(formEmployeeId) ??
      (editingReview
        ? employeeMapById.get(editingReview.employee_code)
        : undefined);

    if (!targetEmp && !editingReview) {
      await alertSwal({
        icon: 'warning',
        title: 'Chưa chọn nhân sự',
        text: 'Vui lòng chọn nhân sự cần lập phiếu đánh giá định kỳ.',
      });
      return;
    }

    const cleanPeriod = formPeriodLabel.trim();
    if (!cleanPeriod) {
      await alertSwal({
        icon: 'warning',
        title: 'Thiếu nhãn kỳ đánh giá',
        text: 'Vui lòng nhập kỳ đánh giá (ví dụ: Thử việc T10-T11/2026, 2026-Q4, Năm 2026).',
      });
      return;
    }

    const cleanNote = formReviewNote.trim();
    if (cleanNote.length < 5) {
      await alertSwal({
        icon: 'warning',
        title: 'Nhận xét quá ngắn',
        text: 'Vui lòng nhập nhận xét chi tiết tối thiểu 5 ký tự để lưu hồ sơ đánh giá.',
      });
      return;
    }

    const nextScore = Math.min(100, Math.max(0, Math.round(Number(formKpiScore) || 0)));
    const nextOkr = Math.min(100, Math.max(0, Math.round(Number(formOkrPercent) || 0)));
    const nextBonus = Math.max(0, Math.round(Number(formBonusVnd) || 0));

    setIsSavingReview(true);
    try {
      const saved = savePerformanceReview({
        id: editingReview?.id,
        review_code: editingReview?.review_code,
        employee_id: targetEmp?.id ?? editingReview!.employee_id,
        employee_code: targetEmp?.employee_code ?? editingReview!.employee_code,
        full_name: targetEmp?.full_name ?? editingReview!.full_name,
        department_id: targetEmp?.department_id ?? editingReview!.department_id,
        department_name: targetEmp?.department_name ?? editingReview!.department_name,
        position_name: targetEmp?.position_name ?? editingReview!.position_name,
        cycle: formCycle,
        period_label: cleanPeriod,
        kpi_score: nextScore,
        okr_completion_percent: nextOkr,
        grade: formGrade,
        result: formResult,
        reviewer_id: editingReview?.reviewer_id ?? actorIdentity.id,
        reviewer_name: editingReview?.reviewer_name ?? actorIdentity.fullName,
        goals_summary: editingReview?.goals_summary,
        strengths: editingReview?.strengths,
        improvements: editingReview?.improvements,
        review_note: cleanNote,
        suggested_salary_vnd: editingReview?.suggested_salary_vnd,
        suggested_bonus_vnd: nextBonus,
        status: canApproveReviews
          ? formReviewStatus
          : formReviewStatus === 'DRAFT'
            ? 'DRAFT'
            : 'SUBMITTED',
      });

      syncRuntimeState();
      setReviewModalOpen(false);
      showToast(
        editingReview ? 'Đã cập nhật phiếu đánh giá' : 'Đã tạo phiếu đánh giá mới',
        `${saved.full_name} (${saved.employee_code}) · Kỳ ${saved.period_label}: ${saved.kpi_score}/100 (Hạng ${saved.grade}).`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        icon: 'error',
        title: 'Không thể lưu đánh giá',
        text: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi lưu phiếu đánh giá.',
      });
    } finally {
      setIsSavingReview(false);
    }
  };

  const handleQuickApproveReview = async (review: PerformanceReview) => {
    if (!canApproveReviews) return;
    const confirmed = await confirmSwal({
      title: `Phê duyệt kết quả đánh giá ${review.review_code}?`,
      html: `Xác nhận phê duyệt phiếu đánh giá kỳ <strong>${escapeHtml(review.period_label)}</strong> của <strong>${escapeHtml(review.full_name)}</strong> (${escapeHtml(review.employee_code)}) với điểm KPI <strong>${review.kpi_score}/100</strong> — Xếp loại <strong>${review.grade}</strong>.`,
      confirmText: 'Phê duyệt chính thức',
    });
    if (!confirmed) return;

    savePerformanceReview({
      ...review,
      status: 'APPROVED',
    });
    syncRuntimeState();
    showToast(
      'Đã phê duyệt phiếu đánh giá',
      `Phiếu ${review.review_code} của ${review.full_name} đã chuyển sang trạng thái Đã phê duyệt.`,
      'success'
    );
  };

  // Action Shortcut 1: Convert Probation -> Official (convertProbationToOfficial)
  const handleConvertProbationOfficial = async (review: PerformanceReview) => {
    const emp =
      employeeMapById.get(review.employee_id) ??
      employeeMapById.get(review.employee_code);

    if (!emp) {
      await alertSwal({
        icon: 'error',
        title: 'Không tìm thấy hồ sơ nhân sự',
        text: 'Không thể đối chiếu hồ sơ nhân sự tương ứng để chuyển chính thức.',
      });
      return;
    }

    if (!canManageCareerDecisions) {
      const confirmedProposal = await confirmSwal({
        title: 'Gửi đề xuất chuyển chính thức lên Phòng Nhân sự?',
        html: `Nhân sự <strong>${escapeHtml(emp.full_name)}</strong> (${escapeHtml(emp.employee_code)}) đã đạt kết quả thử việc <strong>Đạt (${review.kpi_score}/100 điểm)</strong>.<br/>Hệ thống sẽ gửi thông báo để Phòng Nhân sự phát hành Hợp đồng chính thức 100% lương và khởi tạo quỹ phép năm.`,
        confirmText: 'Gửi đề xuất cho HR',
      });
      if (!confirmedProposal) return;

      pushNotification({
        title: `Đề xuất chuyển chính thức: ${emp.full_name} (${emp.employee_code})`,
        message: `${actorIdentity.fullName} đề xuất ký HĐLĐ chính thức cho ${emp.full_name} sau kỳ đánh giá thử việc đạt ${review.kpi_score}/100 điểm.`,
        category: 'PERFORMANCE',
        target_roles: ['HR_MANAGER', 'DIRECTOR'],
        target_department_id: emp.department_id,
        nav_id: 'kpi',
        entity_id: emp.id,
        sub_tab: 'reviews',
      });

      await alertSwal({
        icon: 'success',
        title: 'Đã gửi đề xuất lên Phòng Nhân sự',
        text: `Phòng Nhân sự & Ban Giám đốc đã nhận được thông báo phê duyệt chuyển chính thức cho ${emp.full_name}.`,
      });
      return;
    }

    const salaryPercent = emp.probation_salary_percent || 85;
    const officialSalary =
      review.suggested_salary_vnd ??
      emp.official_salary_vnd ??
      Math.round(emp.base_salary_vnd / (salaryPercent / 100) / 100000) * 100000;

    if (!canApproveExecutiveDecision && officialSalary > 50_000_000) {
      await alertSwal({
        icon: 'warning',
        title: 'Cần Giám đốc phê duyệt',
        text: 'Chuyển chính thức nhân sự có mức lương trên 50.000.000 VNĐ yêu cầu Giám đốc hoặc Quản trị hệ thống phê duyệt.',
      });
      return;
    }

    const confirmed = await confirmSwal({
      title: `Chuyển chính thức nhân sự ${emp.full_name}?`,
      html: `
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
          <div>Nhân sự: <strong>${escapeHtml(emp.full_name)}</strong> (<span style="font-family:monospace;">${escapeHtml(emp.employee_code)}</span>) · Kết quả thử việc: <strong>Đạt (${review.kpi_score}/100)</strong></div>
          <div style="padding:10px 12px;border-radius:8px;border:1px solid #C6D9D3;background:rgba(15,118,110,0.06);font-size:13px;line-height:1.55;">
            <strong>Đồng bộ tự động ngay sau khi xác nhận:</strong>
            <ol style="margin:6px 0 0 18px;padding:0;">
              <li>Hồ sơ nhân sự: Chuyển từ <strong>Thử việc</strong> sang <strong>Chính thức</strong>.</li>
              <li>Hợp đồng lao động: Tạo mới <strong>HĐLĐ xác định thời hạn 12 tháng</strong> hưởng <strong>100% lương (${escapeHtml(formatVnd(officialSalary))})</strong>.</li>
              <li>Quỹ phép năm: Khởi tạo tiêu chuẩn <strong>12 ngày phép/năm</strong>.</li>
              <li>Lịch sử công tác: Ghi nhận Quyết định chuyển chính thức.</li>
            </ol>
          </div>
        </div>
      `,
      confirmText: 'Xác nhận chuyển chính thức',
    });

    if (!confirmed) return;

    try {
      const result = convertProbationToOfficial({
        employeeId: emp.id,
        officialSalaryVnd: officialSalary,
        contractType: 'FIXED_TERM_12M',
        reviewerId: actorIdentity.id,
        reviewerName: actorIdentity.fullName,
        kpiScore: review.kpi_score,
        reviewNote: review.review_note,
        requireManagerPass: true,
      });

      syncRuntimeState();
      showToast(
        'Đã chuyển chính thức thành công',
        `${result.employee.full_name} đã ký ${result.officialContract.contract_number} (100% lương: ${formatVnd(result.employee.base_salary_vnd)}) & cấp ${result.leaveBalance.remaining_days} ngày phép.`,
        'success'
      );

      await alertSwal({
        icon: 'success',
        title: 'Hoàn tất chuyển nhân sự Chính thức',
        html: `
          <ul style="margin:6px 0 0 18px;padding:0;line-height:1.6;">
            <li>Quyết định công tác: <code>${escapeHtml(result.careerEntry.decision_no)}</code></li>
            <li>Hợp đồng mới (100% lương): <code>${escapeHtml(result.officialContract.contract_number)}</code> — <strong>${escapeHtml(formatVnd(result.employee.base_salary_vnd))}</strong></li>
            <li>Quỹ phép năm ${result.leaveBalance.year}: <strong>${result.leaveBalance.total_entitled_days} ngày</strong> khả dụng</li>
            <li>Trạng thái nhân sự: <strong>Chính thức</strong></li>
          </ul>
        `,
      });
    } catch (err) {
      await alertSwal({
        icon: 'error',
        title: 'Không thể chuyển chính thức',
        text: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi chuyển trạng thái nhân sự.',
      });
    }
  };

  // Open Career Progression Decision Modal (with optional prefill from High-Grade Review or Burnout Alert)
  const isLeadershipPositionName = useCallback((positionName: string): boolean => {
    const normalized = positionName.trim().toLowerCase();
    return (
      normalized.includes('trưởng') ||
      normalized.includes('quản lý') ||
      normalized.includes('giám đốc') ||
      normalized.includes('manager') ||
      normalized.includes('lead')
    );
  }, []);

  const openDecisionModal = useCallback(
    (prefill?: {
      employee?: Employee;
      review?: PerformanceReview;
      defaultChangeType?: DecisionModalChangeType;
      customReason?: string;
    }) => {
      const candidates = employees.filter(
        (e) => e.employment_status !== 'RESIGNED'
      );
      const targetEmp = prefill?.employee ?? candidates[0] ?? null;
      const initialType: DecisionModalChangeType =
        prefill?.defaultChangeType ?? 'PROMOTION';
      const defaultEffDate = '2026-11-16';

      setDecEmployeeId(targetEmp?.id ?? '');
      setDecChangeType(initialType);
      setDecEffectiveDate(defaultEffDate);
      setDecDecisionNo(buildSuggestedDecisionNo(initialType, defaultEffDate));
      setDecDecisionNoTouched(false);

      if (targetEmp) {
        setDecNewDeptId(targetEmp.department_id);
        setDecNewPositionName(targetEmp.position_name);

        const suggestedSalary =
          prefill?.review?.suggested_salary_vnd &&
          prefill.review.suggested_salary_vnd > targetEmp.base_salary_vnd
            ? prefill.review.suggested_salary_vnd
            : Math.round((targetEmp.base_salary_vnd * 1.15) / 100000) * 100000;

        setDecNewSalaryVnd(String(suggestedSalary));
        setDecNewRoleCode(
          canApproveExecutiveDecision &&
            (initialType === 'PROMOTION' ||
              initialType === 'ROLE_CHANGE' ||
              isLeadershipPositionName(targetEmp.position_name)) &&
            targetEmp.role_code === 'EMPLOYEE'
            ? 'DEPT_MANAGER'
            : targetEmp.role_code
        );
      } else {
        setDecNewDeptId(departments[0]?.id ?? 'dept-tech');
        setDecNewPositionName('');
        setDecNewSalaryVnd('20000000');
        setDecNewRoleCode('EMPLOYEE');
      }

      if (prefill?.customReason) {
        setDecReason(prefill.customReason);
      } else if (prefill?.review && targetEmp) {
        setDecReason(
          `Căn cứ kết quả đánh giá kỳ ${prefill.review.period_label} đạt ${prefill.review.kpi_score}/100 điểm (Xếp loại ${prefill.review.grade}). ${prefill.review.review_note}`
        );
      } else {
        setDecReason('');
      }

      setDecisionModalOpen(true);
    },
    [
      employees,
      departments,
      buildSuggestedDecisionNo,
      canApproveExecutiveDecision,
      isLeadershipPositionName,
    ]
  );

  // Action Shortcut 2: Propose Promotion / Salary Increase from A+ / A Review
  const handleProposePromotionFromReview = async (review: PerformanceReview) => {
    const emp =
      employeeMapById.get(review.employee_id) ??
      employeeMapById.get(review.employee_code);

    if (!emp) {
      await alertSwal({
        icon: 'error',
        title: 'Không tìm thấy nhân sự',
        text: 'Không tìm thấy hồ sơ nhân sự tương ứng với phiếu đánh giá này.',
      });
      return;
    }

    if (canManageCareerDecisions) {
      openDecisionModal({
        employee: emp,
        review,
        defaultChangeType: 'PROMOTION',
      });
      return;
    }

    // For DEPT_MANAGER: submit proposal to HR & Director without exposing confidential peer salary
    const proposalReason = await promptTextSwal({
      title: `Đề xuất Thăng chức / Tăng lương — ${emp.full_name}`,
      label: 'Nội dung đề xuất gửi Phòng Nhân sự & Ban Giám đốc',
      html: `Nhân sự <strong>${escapeHtml(emp.full_name)}</strong> (${escapeHtml(emp.employee_code)}) đạt <strong>Hạng ${review.grade} (${review.kpi_score}/100 điểm)</strong> tại kỳ <strong>${escapeHtml(review.period_label)}</strong>.`,
      defaultValue: `Đề xuất xét thăng chức / điều chỉnh bậc lương cho ${emp.full_name} dựa trên thành tích xuất sắc kỳ ${review.period_label} (KPI ${review.kpi_score}/100, OKR ${review.okr_completion_percent}%).`,
      confirmText: 'Gửi đề xuất phê duyệt',
    });

    if (!proposalReason) return;

    pushNotification({
      title: `Đề xuất Thăng chức / Tăng lương: ${emp.full_name} (Hạng ${review.grade})`,
      message: `${actorIdentity.fullName} đề xuất xét thăng tiến/tăng lương cho ${emp.full_name} (${emp.employee_code}): ${proposalReason}`,
      category: 'PERFORMANCE',
      target_roles: ['HR_MANAGER', 'DIRECTOR'],
      target_department_id: emp.department_id,
      nav_id: 'kpi',
      entity_id: emp.id,
      sub_tab: 'career',
    });

    showToast(
      'Đã gửi đề xuất Thăng chức / Tăng lương',
      `Đề xuất cho ${emp.full_name} (${emp.employee_code}) đã được chuyển tới Phòng Nhân sự & Ban Giám đốc.`,
      'success'
    );
  };

  const handleDecisionEmployeeChange = (nextEmpId: string) => {
    setDecEmployeeId(nextEmpId);
    const emp = employeeMapById.get(nextEmpId);
    if (!emp) return;

    setDecNewDeptId(emp.department_id);
    setDecNewPositionName(emp.position_name);
    const suggestedSal =
      decChangeType === 'PROMOTION' || decChangeType === 'SALARY_ADJUSTMENT'
        ? Math.round((emp.base_salary_vnd * 1.12) / 100000) * 100000
        : emp.base_salary_vnd;
    setDecNewSalaryVnd(String(suggestedSal));
    setDecNewRoleCode(
      canApproveExecutiveDecision &&
        (decChangeType === 'PROMOTION' ||
          decChangeType === 'ROLE_CHANGE' ||
          isLeadershipPositionName(emp.position_name)) &&
        emp.role_code === 'EMPLOYEE'
        ? 'DEPT_MANAGER'
        : emp.role_code
    );
  };

  const handleDecisionChangeTypeChange = (nextType: DecisionModalChangeType) => {
    setDecChangeType(nextType);
    if (!decDecisionNoTouched) {
      setDecDecisionNo(buildSuggestedDecisionNo(nextType, decEffectiveDate));
    }
    const emp = employeeMapById.get(decEmployeeId);
    if (
      canApproveExecutiveDecision &&
      emp &&
      (nextType === 'PROMOTION' || nextType === 'ROLE_CHANGE') &&
      emp.role_code === 'EMPLOYEE'
    ) {
      setDecNewRoleCode('DEPT_MANAGER');
    }
  };

  const handleDecisionPositionNameChange = (nextPosName: string) => {
    setDecNewPositionName(nextPosName);
    if (
      canApproveExecutiveDecision &&
      isLeadershipPositionName(nextPosName) &&
      decNewRoleCode === 'EMPLOYEE'
    ) {
      setDecNewRoleCode('DEPT_MANAGER');
    }
  };

  const handleDecisionEffectiveDateChange = (nextDate: string) => {
    setDecEffectiveDate(nextDate);
    if (!decDecisionNoTouched && /^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      setDecDecisionNo(buildSuggestedDecisionNo(decChangeType, nextDate));
    }
  };

  const selectedDecisionEmployee = useMemo(
    () => employeeMapById.get(decEmployeeId) ?? null,
    [employeeMapById, decEmployeeId]
  );

  const handleIssueDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCareerDecisions) return;

    const emp = selectedDecisionEmployee;
    if (!emp) {
      await alertSwal({
        icon: 'warning',
        title: 'Chưa chọn nhân sự',
        text: 'Vui lòng chọn nhân sự áp dụng quyết định công tác.',
      });
      return;
    }

    const cleanDecisionNo = decDecisionNo.trim();
    if (!cleanDecisionNo) {
      await alertSwal({
        icon: 'warning',
        title: 'Thiếu số Quyết định',
        text: 'Vui lòng nhập số Quyết định (ví dụ: QD-2026-BN004).',
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(decEffectiveDate)) {
      await alertSwal({
        icon: 'warning',
        title: 'Ngày hiệu lực không hợp lệ',
        text: 'Vui lòng chọn ngày hiệu lực theo định dạng YYYY-MM-DD.',
      });
      return;
    }

    const cleanPosName = decNewPositionName.trim();
    if (!cleanPosName) {
      await alertSwal({
        icon: 'warning',
        title: 'Thiếu chức danh mới',
        text: 'Vui lòng nhập chức danh công tác mới cho nhân sự.',
      });
      return;
    }

    const parsedSalary = Math.round(Number(decNewSalaryVnd) || 0);
    if (parsedSalary <= 0) {
      await alertSwal({
        icon: 'warning',
        title: 'Mức lương không hợp lệ',
        text: 'Mức lương cơ bản mới phải lớn hơn 0 đ.',
      });
      return;
    }

    const isLeadershipTargetRole =
      decNewRoleCode === 'DEPT_MANAGER' ||
      decNewRoleCode === 'HR_MANAGER' ||
      decNewRoleCode === 'DIRECTOR' ||
      decNewRoleCode === 'SUPER_ADMIN';
    if (
      !canApproveExecutiveDecision &&
      (parsedSalary > 50_000_000 || isLeadershipTargetRole)
    ) {
      await alertSwal({
        icon: 'warning',
        title: 'Cần Giám đốc phê duyệt',
        text: 'Quyết định có mức lương trên 50.000.000 VNĐ hoặc bổ nhiệm vai trò Trưởng bộ phận / Quản lý / Giám đốc bắt buộc do Giám đốc hoặc Quản trị hệ thống ký ban hành.',
      });
      return;
    }

    const cleanReason = decReason.trim();
    if (cleanReason.length < 5) {
      await alertSwal({
        icon: 'warning',
        title: 'Thiếu lý do ban hành',
        text: 'Vui lòng ghi rõ căn cứ / lý do ban hành quyết định (tối thiểu 5 ký tự).',
      });
      return;
    }

    const targetDept =
      departments.find((d) => d.id === decNewDeptId) ?? departments[0];
    const matchedPos = MOCK_POSITIONS.find(
      (p) => p.position_name.toLowerCase() === cleanPosName.toLowerCase()
    );
    const salaryDelta = calcSalaryIncreaseInfo(emp.base_salary_vnd, parsedSalary);
    const midMonthArmed = isMidMonthEffectiveDate(decEffectiveDate);
    const effectiveDateDisplay = formatDateDisplay(decEffectiveDate);

    const confirmed = await confirmSwal({
      title: `Xác nhận ban hành Quyết định ${cleanDecisionNo}?`,
      html: `
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;font-size:13px;line-height:1.55;">
          <div>
            Nhân sự: <strong>${escapeHtml(emp.full_name)}</strong> (${escapeHtml(emp.employee_code)}) · Loại: <strong>${escapeHtml(CHANGE_TYPE_META[decChangeType].label)}</strong> · Hiệu lực: <strong>${escapeHtml(effectiveDateDisplay)}</strong>
          </div>
          <div style="padding:10px 12px;border-radius:8px;border:1px solid #C6D9D3;background:rgba(15,118,110,0.06);">
            <strong>Nội dung cập nhật tự động:</strong>
            <ol style="margin:6px 0 0 18px;padding:0;">
              <li><strong>Hồ sơ nhân sự:</strong> ${escapeHtml(emp.department_name)} → <strong>${escapeHtml(targetDept?.department_name ?? emp.department_name)}</strong> · Chức danh: <strong>${escapeHtml(cleanPosName)}</strong> · Lương: <strong>${escapeHtml(formatVnd(parsedSalary))} (${escapeHtml(salaryDelta.label)})</strong>.</li>
              <li><strong>Hợp đồng lao động:</strong> Tự động tạo Phụ lục hợp đồng gắn số quyết định <code>${escapeHtml(cleanDecisionNo)}</code>.</li>
              <li><strong>Phân quyền hệ thống:</strong> ${escapeHtml(ROLE_SHORT_LABELS[emp.role_code])} → <strong>${escapeHtml(ROLE_SHORT_LABELS[decNewRoleCode])}</strong>${decNewRoleCode === 'DEPT_MANAGER' ? ' (mở quyền phê duyệt đơn nghỉ phép và tăng ca bộ phận)' : ''}.</li>
              <li><strong>Bảng lương tháng:</strong> ${midMonthArmed ? `Tách lương giữa kỳ theo ngày <strong>${escapeHtml(effectiveDateDisplay)}</strong>` : `Áp dụng mức lương mới từ ngày <strong>${escapeHtml(effectiveDateDisplay)}</strong>`}.</li>
            </ol>
          </div>
        </div>
      `,
      confirmText: 'Ký & Ban hành Quyết định',
    });

    if (!confirmed) return;

    setIsSubmittingDecision(true);
    try {
      const issued = promoteOrTransferEmployee({
        employeeId: emp.id,
        changeType: decChangeType,
        newDepartmentId: targetDept?.id ?? emp.department_id,
        newPositionId: matchedPos?.id,
        newPositionName: cleanPosName,
        newSalaryVnd: parsedSalary,
        newRoleCode: decNewRoleCode,
        effectiveDate: decEffectiveDate,
        decisionNo: cleanDecisionNo,
        reason: cleanReason,
        signedByName: actorIdentity.fullName,
      });

      syncRuntimeState();
      setDecisionModalOpen(false);
      setActiveTab('career');

      if (issued.transferWarnings && issued.transferWarnings.length > 0) {
        showToast(
          `Đã ban hành QĐ ${issued.careerEntry.decision_no} (lưu ý bàn giao nội bộ)`,
          issued.transferWarnings[0],
          'warning'
        );

        await alertSwal({
          icon: 'warning',
          title: `Đã ban hành Quyết định ${issued.careerEntry.decision_no} (Lưu ý bàn giao)`,
          text: [
            `Hồ sơ ${issued.employee.full_name} (${issued.employee.position_name} · ${issued.employee.department_name}) đã được cập nhật và sinh phụ lục ${issued.addendumContract.contract_number}.`,
            ...issued.transferWarnings,
          ].join('\n\n'),
        });
      } else {
        showToast(
          `Đã ban hành Quyết định ${issued.careerEntry.decision_no}`,
          `Đã đồng bộ hồ sơ ${issued.employee.full_name}, sinh phụ lục ${issued.addendumContract.contract_number} và cập nhật quyền ${ROLE_SHORT_LABELS[issued.updatedUser.role_code]}.`,
          'success'
        );

        await alertSwal({
          icon: 'success',
          title: `Ban hành thành công ${issued.careerEntry.decision_no}`,
          html: `
          <div style="font-size:13px;line-height:1.6;">
            <p style="margin:0 0 6px 0;">Các thay đổi nghiệp vụ đã được ghi nhận đồng bộ:</p>
            <ol style="margin:0 0 0 18px;padding:0;">
              <li><strong>Hồ sơ nhân sự:</strong> Cập nhật <strong>${escapeHtml(issued.employee.position_name)}</strong> (${escapeHtml(issued.employee.department_name)}) · Lương <strong>${escapeHtml(formatVnd(issued.employee.base_salary_vnd))}</strong>.</li>
              <li><strong>Hợp đồng lao động:</strong> Tự động tạo Phụ lục hợp đồng <code>${escapeHtml(issued.addendumContract.contract_number)}</code> gắn số quyết định <code>${escapeHtml(issued.careerEntry.decision_no)}</code>.</li>
              <li><strong>Phân quyền hệ thống:</strong> Quyền hiện tại là <strong>${escapeHtml(ROLE_SHORT_LABELS[issued.updatedUser.role_code])}</strong>.</li>
              <li><strong>Bảng lương tháng:</strong> ${midMonthArmed ? `Tách lương giữa kỳ theo ngày <strong>${escapeHtml(effectiveDateDisplay)}</strong>.` : `Đã cập nhật mức lương tính công từ ngày <strong>${escapeHtml(effectiveDateDisplay)}</strong>.`}</li>
            </ol>
          </div>
        `,
        });
      }
    } catch (err) {
      await alertSwal({
        icon: 'error',
        title: 'Không thể ban hành Quyết định',
        text:
          err instanceof Error
            ? err.message
            : 'Đã xảy ra lỗi khi đồng bộ quyết định nhân sự.',
      });
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Can current user see exact salary on a specific CareerHistoryEntry?
  const canViewHistorySalary = useCallback(
    (entry: CareerHistoryEntry): boolean => {
      if (canViewAllSalaries) return true;
      if (
        (actorEmployee && entry.employee_id === actorEmployee.id) ||
        entry.employee_code === actorIdentity.employeeCode
      ) {
        return true;
      }
      return false;
    },
    [canViewAllSalaries, actorEmployee, actorIdentity.employeeCode]
  );

  // Access control guard: Only SUPER_ADMIN, DIRECTOR, HR_MANAGER, DEPT_MANAGER can view Performance & Career Progression
  const hasModuleAccess = [
    'SUPER_ADMIN',
    'DIRECTOR',
    'HR_MANAGER',
    'DEPT_MANAGER',
  ].includes(role as string);
  if (!hasModuleAccess) {
    return (
      <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#0F766E]/25 bg-[#E4EEEB] text-[#0F766E] dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-400">
            <Lock className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
            Không đủ quyền truy cập Đánh giá &amp; Thăng tiến (403)
          </p>
          <p className="max-w-md text-xs text-[#5C7871] dark:text-zinc-400">
            Phân hệ Đánh giá Hiệu suất &amp; Quyết định Thăng tiến chỉ dành cho Ban Giám đốc, Quản trị Nhân sự và Trưởng bộ phận.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-1"
            onClick={() => setActiveNav('dashboard')}
          >
            Quay về Tổng quan
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Loading & Error States (4 dynamic UI states compliance)
  if (isLoading) {
    return (
      <div className="space-y-6 pt-1">
        <Skeleton className="h-9 w-80" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <AlertTriangle
            className="h-6 w-6 text-red-600 dark:text-red-400"
            strokeWidth={1.5}
          />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {loadError}
          </p>
          <Button variant="outline" onClick={() => void loadData(true)}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Shared Career Progression Ledger & Timeline Renderer (used in Tab 2 for all roles)
  const renderCareerHistoriesSection = () => {
    return (
      <div className="space-y-5">
        {/* Immutable Ledger Notice & Filter Toolbar */}
        <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#0F766E]/25 bg-[#E4EEEB] text-[#0F766E] dark:border-teal-400/20 dark:bg-teal-950/40 dark:text-teal-400">
                <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                    Sổ cái Lịch sử Công tác &amp; Quyết định Nhân sự Bất biến
                  </p>
                  <Badge variant="teal">Lưu vết lịch sử · Cấm sửa/xóa lịch sử</Badge>
                </div>
                <p className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                  Mọi quyết định thăng chức, điều chuyển, điều chỉnh lương hoặc chuyển chính thức đều lưu snapshot Trước → Sau và giữ nguyên lịch sử gốc phục vụ kiểm toán &amp; tính lương tách kỳ.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              {role !== 'EMPLOYEE' && (
                <div className="relative w-full sm:w-56">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C7871] dark:text-zinc-400"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={careerSearch}
                    onChange={(e) => setCareerSearch(e.target.value)}
                    placeholder="Tìm số QĐ, tên, mã NV..."
                    aria-label="Tìm kiếm lịch sử công tác"
                    className="pl-9"
                  />
                </div>
              )}
              <div className="w-full sm:w-48">
                <Select
                  value={careerTypeFilter}
                  onValueChange={setCareerTypeFilter}
                  aria-label="Lọc theo loại quyết định"
                  options={[
                    { label: 'Tất cả loại quyết định', value: 'ALL' },
                    { label: 'Thăng chức', value: 'PROMOTION' },
                    { label: 'Điều chuyển phòng ban', value: 'DEPARTMENT_TRANSFER' },
                    { label: 'Điều chỉnh lương', value: 'SALARY_ADJUSTMENT' },
                    { label: 'Chuyển chính thức', value: 'PROBATION_TO_OFFICIAL' },
                    { label: 'Nâng quyền quản lý', value: 'ROLE_CHANGE' },
                  ]}
                />
              </div>
              {canManageCareerDecisions && (
                <Button onClick={() => openDecisionModal()}>
                  <FileSignature className="h-4 w-4" strokeWidth={1.5} />
                  Ban hành Quyết định
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {filteredCareerHistories.length === 0 ? (
          <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
            <CardContent className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <History className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                Chưa có bản ghi Quyết định công tác phù hợp
              </p>
              <p className="max-w-md text-xs text-[#415A54] dark:text-zinc-400">
                {role === 'EMPLOYEE'
                  ? 'Các quyết định chuyển chính thức, điều chỉnh lương hoặc bổ nhiệm của bạn sẽ tự động hiển thị tại dòng thời gian này.'
                  : 'Thử thay đổi bộ lọc tìm kiếm hoặc nhấn "Ban hành Quyết định" để lập quyết định bổ nhiệm, điều chuyển hoặc điều chỉnh lương mới.'}
              </p>
              {canManageCareerDecisions && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => openDecisionModal()}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Lập Quyết định đầu tiên
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Structured Immutable Ledger Table */}
            <Card className="overflow-hidden rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800 dark:bg-[#121214] dark:shadow-none">
              <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileCheck2
                        className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                        strokeWidth={1.5}
                      />
                      Bảng Sổ cái Quyết định Thăng tiến &amp; Điều chuyển (
                      <span className="font-mono tabular-nums">
                        {filteredCareerHistories.length}
                      </span>
                      )
                    </CardTitle>
                    <CardDescription>
                      Đối chiếu chi tiết thay đổi Phòng ban, Chức danh, Mức lương, Quyền hệ thống và Phụ lục hợp đồng đi kèm.
                    </CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#415A54] dark:text-zinc-400">
                    <Lock className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Bản ghi chỉ xem
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                        <th className="whitespace-nowrap px-4 py-3">
                          Số QĐ &amp; Hiệu lực
                        </th>
                        <th className="px-4 py-3">Nhân sự</th>
                        <th className="whitespace-nowrap px-4 py-3">Loại biến động</th>
                        <th className="px-4 py-3">Phòng ban &amp; Chức danh (Cũ → Mới)</th>
                        <th className="px-4 py-3">Điều chỉnh lương &amp; Quyền</th>
                        <th className="whitespace-nowrap px-4 py-3">Phụ lục HĐ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                      {filteredCareerHistories.map((entry) => {
                        const typeMeta =
                          CHANGE_TYPE_META[entry.change_type] ??
                          CHANGE_TYPE_META.PROMOTION;
                        const showSalary = canViewHistorySalary(entry);
                        const salDelta = calcSalaryIncreaseInfo(
                          entry.old_salary_vnd,
                          entry.new_salary_vnd
                        );
                        const midMonth = isMidMonthEffectiveDate(entry.effective_date);
                        const deptChanged =
                          entry.old_department_name !== entry.new_department_name;
                        const roleChanged =
                          entry.old_role_code !== entry.new_role_code;

                        return (
                          <tr
                            key={entry.id}
                            className="transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 align-top">
                              <p className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                                {entry.decision_no}
                              </p>
                              <p className="mt-1 flex items-center gap-1 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                                <Calendar className="h-3 w-3" strokeWidth={1.5} />
                                {entry.effective_date}
                              </p>
                              {midMonth && (
                                <Badge variant="warning" className="mt-1.5 text-[11px]">
                                  Tách lương giữa kỳ
                                </Badge>
                              )}
                            </td>

                            <td className="px-4 py-3.5 align-top">
                              <p className="font-semibold text-[#11221E] dark:text-zinc-100">
                                {entry.full_name}
                              </p>
                              <p className="mt-0.5 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                                {entry.employee_code}
                              </p>
                              <p className="mt-1 text-[11px] text-[#5C7871] dark:text-zinc-500">
                                Ký bởi: {entry.signed_by_name}
                              </p>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5 align-top">
                              <Badge variant={typeMeta.variant}>{typeMeta.label}</Badge>
                            </td>

                            <td className="max-w-xs px-4 py-3.5 align-top text-xs">
                              <div className="flex flex-wrap items-center gap-1.5 text-[#415A54] dark:text-zinc-300">
                                <Building2
                                  className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400"
                                  strokeWidth={1.5}
                                />
                                <span>{entry.old_department_name}</span>
                                <ArrowRight
                                  className="h-3 w-3 shrink-0 text-[#5C7871] dark:text-zinc-500"
                                  strokeWidth={1.5}
                                />
                                <span
                                  className={
                                    deptChanged
                                      ? 'font-semibold text-[#0F766E] dark:text-teal-400'
                                      : 'font-medium text-[#11221E] dark:text-zinc-200'
                                  }
                                >
                                  {entry.new_department_name}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[#415A54] dark:text-zinc-400">
                                <Briefcase
                                  className="h-3.5 w-3.5 shrink-0 text-[#5C7871] dark:text-zinc-400"
                                  strokeWidth={1.5}
                                />
                                <span>{entry.old_position_name}</span>
                                <ArrowRight
                                  className="h-3 w-3 shrink-0 text-[#5C7871] dark:text-zinc-500"
                                  strokeWidth={1.5}
                                />
                                <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                                  {entry.new_position_name}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3.5 align-top text-xs">
                              {showSalary ? (
                                <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                                  <span className="text-[#415A54] dark:text-zinc-400">
                                    {formatVnd(entry.old_salary_vnd)}
                                  </span>
                                  <ArrowRight
                                    className="h-3 w-3 shrink-0 text-[#5C7871] dark:text-zinc-500"
                                    strokeWidth={1.5}
                                  />
                                  <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                                    {formatVnd(entry.new_salary_vnd)}
                                  </span>
                                  {salDelta.isIncrease && (
                                    <Badge variant="success" className="font-mono text-[11px]">
                                      {salDelta.label}
                                    </Badge>
                                  )}
                                  {salDelta.isDecrease && (
                                    <Badge variant="warning" className="font-mono text-[11px]">
                                      {salDelta.label}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 text-[#5C7871] dark:text-zinc-400">
                                  <Lock className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  <span>Bảo mật lương theo phân quyền</span>
                                </div>
                              )}

                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#415A54] dark:text-zinc-400">
                                <span>Quyền: {ROLE_SHORT_LABELS[entry.old_role_code]}</span>
                                <ArrowRight
                                  className="h-3 w-3 shrink-0"
                                  strokeWidth={1.5}
                                />
                                <span
                                  className={
                                    roleChanged
                                      ? 'font-semibold text-[#0F766E] dark:text-teal-400'
                                      : 'text-[#11221E] dark:text-zinc-200'
                                  }
                                >
                                  {ROLE_SHORT_LABELS[entry.new_role_code]}
                                </span>
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5 align-top">
                              {entry.addendum_contract_number ||
                              entry.addendum_contract_id ? (
                                <div>
                                  <Badge variant="outline" className="font-mono tabular-nums">
                                    {entry.addendum_contract_number ||
                                      entry.addendum_contract_id}
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-xs text-[#5C7871] dark:text-zinc-500">
                                  —
                                </span>
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

            {/* Visual Career Progression Timeline */}
            <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
              <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
                <CardTitle className="flex items-center gap-2">
                  <History
                    className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                    strokeWidth={1.5}
                  />
                  Dòng thời gian Thăng tiến &amp; Lộ trình Công tác
                </CardTitle>
                <CardDescription>
                   Chuỗi mốc sự kiện nhân sự theo trình tự thời gian hiệu lực mới nhất lên đầu.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-[#C6D9D3] dark:before:bg-zinc-800">
                  {filteredCareerHistories.map((entry) => {
                    const typeMeta =
                      CHANGE_TYPE_META[entry.change_type] ??
                      CHANGE_TYPE_META.PROMOTION;
                    const showSalary = canViewHistorySalary(entry);
                    const salDelta = calcSalaryIncreaseInfo(
                      entry.old_salary_vnd,
                      entry.new_salary_vnd
                    );

                    return (
                      <div key={`tl-${entry.id}`} className="relative pl-10">
                        <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#0F766E]/35 bg-[#E4EEEB] text-[#0F766E] dark:border-teal-400/30 dark:bg-zinc-900 dark:text-teal-400">
                          <Award className="h-4 w-4" strokeWidth={1.5} />
                        </div>

                        <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/65 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                                {entry.decision_no}
                              </span>
                              <Badge variant={typeMeta.variant}>{typeMeta.label}</Badge>
                              <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                                {entry.full_name}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                                ({entry.employee_code})
                              </span>
                            </div>
                            <span className="font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                              Hiệu lực: {formatDateDisplay(entry.effective_date)}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs md:grid-cols-3">
                            <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 dark:border-zinc-800 dark:bg-[#121214]">
                              <p className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">
                                Phòng ban &amp; Chức danh
                              </p>
                              <p className="mt-1 font-medium text-[#11221E] dark:text-zinc-200">
                                {entry.old_department_name} → {entry.new_department_name}
                              </p>
                              <p className="mt-0.5 text-[#415A54] dark:text-zinc-400">
                                {entry.old_position_name} →{' '}
                                <strong className="text-[#11221E] dark:text-zinc-100">
                                  {entry.new_position_name}
                                </strong>
                              </p>
                            </div>

                            <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 dark:border-zinc-800 dark:bg-[#121214]">
                              <p className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">
                                Mức lương cơ bản
                              </p>
                              {showSalary ? (
                                <p className="mt-1 font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                                  {formatVnd(entry.old_salary_vnd)} →{' '}
                                  <span className="text-[#0F766E] dark:text-teal-400">
                                    {formatVnd(entry.new_salary_vnd)}
                                  </span>{' '}
                                  {salDelta.diffVnd !== 0 && `(${salDelta.label})`}
                                </p>
                              ) : (
                                <p className="mt-1 inline-flex items-center gap-1 text-[#5C7871] dark:text-zinc-400">
                                  <Lock className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  Ẩn theo phân quyền Quản lý bộ phận
                                </p>
                              )}
                            </div>

                            <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 dark:border-zinc-800 dark:bg-[#121214]">
                              <p className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">
                                Quyền hệ thống &amp; Phụ lục HĐ
                              </p>
                              <p className="mt-1 text-[#11221E] dark:text-zinc-200">
                                {ROLE_SHORT_LABELS[entry.old_role_code]} → {ROLE_SHORT_LABELS[entry.new_role_code]}
                              </p>
                              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
                                Phụ lục:{' '}
                                {entry.addendum_contract_number ||
                                  entry.addendum_contract_id ||
                                  '—'}
                              </p>
                            </div>
                          </div>

                          <p className="mt-2.5 text-xs text-[#415A54] dark:text-zinc-300">
                            <span className="font-medium text-[#11221E] dark:text-zinc-200">
                              Căn cứ quyết định:
                            </span>{' '}
                            {entry.reason} ·{' '}
                            <span className="text-[#5C7871] dark:text-zinc-400">
                              Người ký: {entry.signed_by_name}
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  };

  // ============================================================================
  // EMPLOYEE SELF-SERVICE VIEW (Dynamic identity, OKRs, Multi-cycle Reviews & Career Timeline)
  // ============================================================================
  if (role === 'EMPLOYEE') {
    const activePeriod =
      employeeOkrPeriods.find((p) => p.period === selectedSelfPeriod) ??
      employeeOkrPeriods[0];
    const empStatusMeta = actorEmployee
      ? EMPLOYMENT_STATUS_META[actorEmployee.employment_status]
      : EMPLOYMENT_STATUS_META.ACTIVE;

    return (
      <div className="space-y-6 pt-1">
        {/* Dynamic Employee Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                Đánh giá Hiệu suất &amp; Lộ trình Công tác Cá nhân
              </h1>
              <Badge variant={empStatusMeta.variant}>{empStatusMeta.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
              {actorIdentity.fullName} (
              <span className="font-mono tabular-nums">
                {actorIdentity.employeeCode}
              </span>
              ) · {actorIdentity.positionName} · {actorIdentity.departmentName}
            </p>
          </div>

          {activeTab === 'reviews' && employeeOkrPeriods.length > 0 && (
            <div className="w-full sm:w-56">
              <Select
                value={activePeriod.period}
                onValueChange={setSelectedSelfPeriod}
                aria-label="Chọn kỳ xem OKR cá nhân"
                options={employeeOkrPeriods.map((q) => ({
                  label: `Kỳ ${q.period}`,
                  value: q.period,
                }))}
              />
            </div>
          )}
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-[#0F766E] dark:border-l-teal-400">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Điểm KPI ({activePeriod.period})
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                  {activePeriod.kpi_score} / 100
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#0F766E]/20 bg-[#E4EEEB] text-[#0F766E] dark:border-teal-400/20 dark:bg-teal-950/30 dark:text-teal-400">
                <Target className="h-4 w-4" strokeWidth={1.5} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-600 dark:border-l-emerald-400">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Tiến độ hoàn thành OKR
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {activePeriod.okr_completion_percent}%
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-600 dark:border-l-blue-400">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Xếp loại &amp; Kết luận
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant={GRADE_BADGE[activePeriod.grade]}>
                    Hạng {activePeriod.grade}
                  </Badge>
                  <Badge variant={RESULT_META[activePeriod.result].variant}>
                    {RESULT_META[activePeriod.result].label}
                  </Badge>
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400">
                <Award className="h-4 w-4" strokeWidth={1.5} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Quyết định Thăng tiến / Lương
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {roleScopedCareerHistories.length}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-400">
                <History className="h-4 w-4" strokeWidth={1.5} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as PerformanceTabKey)}
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
            <TabsTrigger value="reviews" className="gap-1.5 px-3.5 py-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              Đánh giá định kỳ &amp; OKR ({roleScopedReviews.length})
            </TabsTrigger>
            <TabsTrigger value="career" className="gap-1.5 px-3.5 py-1.5">
              <History className="h-3.5 w-3.5" strokeWidth={1.5} />
              Lịch sử công tác &amp; Quyết định ({roleScopedCareerHistories.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reviews" className="space-y-5">
            {/* OKR Progress Card */}
            <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
              <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
                <CardTitle>
                  Chi tiết mục tiêu OKR &amp; Nhận xét quản lý ({activePeriod.period})
                </CardTitle>
                <CardDescription>
                  Người đánh giá: {activePeriod.reviewer} · Nhận xét: {activePeriod.note}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                {activePeriod.objectives.map((obj) => (
                  <div
                    key={obj.title}
                    className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                        {obj.title}
                      </p>
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                        {obj.progress}%
                      </span>
                    </div>
                    <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#E4EEEB] dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-[#0F766E] dark:bg-teal-400"
                        style={{ width: `${obj.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Personal Multi-Cycle Reviews Table */}
            <Card className="overflow-hidden rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
              <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Hồ sơ Đánh giá định kỳ của tôi</CardTitle>
                    <CardDescription>
                      Tổng hợp kết quả đánh giá Thử việc, Quý và Năm đã được ghi nhận trên hệ thống.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { key: 'ALL', label: 'Tất cả' },
                        { key: 'PROBATION', label: 'Thử việc' },
                        { key: 'QUARTERLY', label: 'Quý' },
                        { key: 'ANNUAL', label: 'Năm' },
                      ] as const
                    ).map((item) => (
                      <Button
                        key={item.key}
                        size="sm"
                        variant={cycleFilter === item.key ? 'default' : 'outline'}
                        onClick={() => setCycleFilter(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredReviews.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#415A54] dark:text-zinc-400">
                    Chưa có phiếu đánh giá nào thuộc chu kỳ đã chọn.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                          <th className="whitespace-nowrap px-4 py-3">Mã phiếu</th>
                          <th className="whitespace-nowrap px-4 py-3">Chu kỳ &amp; Kỳ</th>
                          <th className="px-4 py-3 text-right">Điểm KPI</th>
                          <th className="px-4 py-3 text-right">OKR (%)</th>
                          <th className="px-4 py-3">Xếp loại &amp; Kết luận</th>
                          <th className="px-4 py-3 text-right">Thưởng KPI</th>
                          <th className="px-4 py-3">Người đánh giá &amp; Nhận xét</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                        {filteredReviews.map((rec) => (
                          <tr
                            key={rec.id}
                            className="odd:bg-[#FCFEFD] even:bg-[#F5FAF8] dark:odd:bg-transparent dark:even:bg-transparent"
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-[#0F766E] dark:text-teal-400">
                              {rec.review_code}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5">
                              <Badge variant={CYCLE_META[rec.cycle].variant}>
                                {CYCLE_META[rec.cycle].shortLabel}
                              </Badge>
                              <p className="mt-1 font-mono text-xs tabular-nums text-[#11221E] dark:text-zinc-200">
                                {rec.period_label}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                              {rec.kpi_score} / 100
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                              {rec.okr_completion_percent}%
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant={GRADE_BADGE[rec.grade]}>
                                  {rec.grade}
                                </Badge>
                                <Badge variant={RESULT_META[rec.result].variant}>
                                  {RESULT_META[rec.result].label}
                                </Badge>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs tabular-nums text-[#11221E] dark:text-zinc-200">
                              {rec.suggested_bonus_vnd && rec.suggested_bonus_vnd > 0
                                ? formatVnd(rec.suggested_bonus_vnd)
                                : '—'}
                            </td>
                            <td className="max-w-xs px-4 py-3.5 text-xs text-[#415A54] dark:text-zinc-400">
                              <p className="font-medium text-[#11221E] dark:text-zinc-200">
                                {rec.reviewer_name}
                              </p>
                              <p className="mt-0.5 line-clamp-2">{rec.review_note}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="career">{renderCareerHistoriesSection()}</TabsContent>
        </Tabs>
      </div>
    );
  }

  // ============================================================================
  // DEPT_MANAGER, HR_MANAGER, DIRECTOR, SUPER_ADMIN VIEW
  // ============================================================================
  const avgKpi = Math.round(
    roleScopedReviews.reduce((sum, r) => sum + r.kpi_score, 0) /
      Math.max(1, roleScopedReviews.length)
  );
  const highPerformersCount = roleScopedReviews.filter(
    (r) => r.grade === 'A+' || r.grade === 'A'
  ).length;

  return (
    <div className="space-y-6 pt-1">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
              {role === 'DEPT_MANAGER'
                ? `Đánh giá Hiệu suất & Lộ trình Nhân sự · ${managerDepartmentScope.scopeLabel}`
                : 'Quản trị Đánh giá Định kỳ, Thăng tiến & Cảnh báo AI Burnout'}
            </h1>
            <Badge variant="teal">
              Phạm vi: {managerDepartmentScope.scopeLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            {role === 'DEPT_MANAGER'
              ? `Người phụ trách: ${actorIdentity.fullName} (${actorIdentity.employeeCode}). Chấm điểm KPI/OKR bộ phận, đánh giá thử việc và đề xuất thăng tiến (lương cơ bản đồng cấp/cấp dưới được bảo mật).`
              : `Điều hành bởi ${actorIdentity.fullName} (${actorIdentity.employeeCode}) · Đồng bộ trực tiếp kết quả đánh giá Thử việc/Quý/Năm sang Hợp đồng, Quỹ phép, Phân quyền hệ thống và Bảng lương tách kỳ.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEvaluateReviews && (
            <Button variant="outline" onClick={() => openCreateReviewModal()}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Tạo đánh giá định kỳ
            </Button>
          )}
          {canManageCareerDecisions && (
            <Button onClick={() => openDecisionModal()}>
              <FileSignature className="h-4 w-4" strokeWidth={1.5} />
              Ban hành Quyết định nhân sự
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-[#0F766E] dark:border-l-teal-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tổng phiếu đánh giá định kỳ
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                {roleScopedReviews.length}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-400">
                {pendingProbationConversions.length > 0
                  ? `${pendingProbationConversions.length} thử việc đạt chuẩn chờ lên chính thức`
                  : `${highPerformersCount} nhân sự đạt hạng A / A+`}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#0F766E]/20 bg-[#E4EEEB] text-[#0F766E] dark:border-teal-400/20 dark:bg-teal-950/30 dark:text-teal-400">
              <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 dark:border-l-emerald-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Điểm KPI trung bình
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {avgKpi} / 100
              </p>
              <p className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-400">
                {role === 'DEPT_MANAGER'
                  ? `${managerTeamMembers.length} thành viên trực thuộc`
                  : `${evaluableEmployees.length} nhân sự đang làm việc`}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-600 dark:border-l-blue-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Quyết định công tác bất biến
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                {roleScopedCareerHistories.length}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-400">
                Lưu vết lịch sử · Tự động sinh PLHĐ
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400">
              <History className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Cảnh báo Burnout / Turnover
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {visibleAlerts.length}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-400">
                Phân tích từ OT 30 ngày &amp; KPI
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3-Tab Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as PerformanceTabKey)}
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
          <TabsTrigger value="reviews" className="gap-1.5 px-3.5 py-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
            Đánh giá định kỳ ({roleScopedReviews.length})
          </TabsTrigger>
          <TabsTrigger value="career" className="gap-1.5 px-3.5 py-1.5">
            <History className="h-3.5 w-3.5" strokeWidth={1.5} />
            Lịch sử công tác &amp; Thăng tiến ({roleScopedCareerHistories.length})
          </TabsTrigger>
          <TabsTrigger value="burnout" className="gap-1.5 px-3.5 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
            Cảnh báo AI Burnout &amp; Biến động ({visibleAlerts.length})
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================== */}
        {/* TAB 1: ĐÁNH GIÁ ĐỊNH KỲ (THỬ VIỆC / QUÝ / NĂM)                       */}
        {/* ==================================================================== */}
        <TabsContent value="reviews" className="space-y-5">
          {/* Probation PASS Callout Banner */}
          {pendingProbationConversions.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-[#0F766E]/35 bg-[#E4EEEB]/75 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-teal-400/25 dark:bg-teal-950/25">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0F766E] text-[#FCFEFD] dark:bg-teal-400 dark:text-zinc-950">
                  <UserCheck className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                    Nhân sự thử việc đã Đạt đánh giá — Sẵn sàng chuyển chính thức
                  </p>
                  <p className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-300">
                    {pendingProbationConversions
                      .map((r) => `${r.full_name} (${r.employee_code} · ${r.kpi_score} điểm)`)
                      .join(', ')}{' '}
                    đang ở trạng thái Thử việc. Chuyển chính thức sẽ tự động sinh HĐLĐ 100% lương và khởi tạo 12 ngày phép năm.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void handleConvertProbationOfficial(pendingProbationConversions[0])
                  }
                >
                  <UserCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {canManageCareerDecisions
                    ? 'Chuyển chính thức ngay'
                    : 'Đề xuất chuyển chính thức'}
                </Button>
              </div>
            </div>
          )}

          {/* DEPT_MANAGER Team Overview Table (Strictly NO Salary Column) */}
          {role === 'DEPT_MANAGER' && (
            <Card className="overflow-hidden rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800 dark:bg-[#121214] dark:shadow-none">
              <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users
                        className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                        strokeWidth={1.5}
                      />
                      Danh sách nhân sự trực thuộc · {managerDepartmentScope.scopeLabel}
                    </CardTitle>
                    <CardDescription>
                      Theo dõi ca làm việc, trạng thái hợp đồng, tiến độ KPI và rủi ro kiệt sức của thành viên (ẩn thông tin lương cơ bản theo phân quyền).
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {managerTeamMembers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#415A54] dark:text-zinc-400">
                    Chưa có nhân sự trực thuộc trong phạm vi phòng ban này.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                          <th className="whitespace-nowrap px-4 py-3">Mã NV</th>
                          <th className="px-4 py-3">Họ và tên</th>
                          <th className="px-4 py-3">Phòng ban &amp; Chức danh</th>
                          <th className="whitespace-nowrap px-4 py-3">Trạng thái</th>
                          <th className="whitespace-nowrap px-4 py-3">Ca làm việc</th>
                          <th className="px-4 py-3 text-right">Hoàn thành KPI</th>
                          <th className="px-4 py-3">Rủi ro Burnout</th>
                          <th className="px-4 py-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                        {managerTeamMembers.map((emp) => {
                          const riskMeta = RISK_BADGE[emp.burnout_risk_level];
                          const statusMeta =
                            EMPLOYMENT_STATUS_META[emp.employment_status];
                          return (
                            <tr
                              key={emp.id}
                              className="transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                                {emp.employee_code}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-[#11221E] dark:text-zinc-100">
                                  {emp.full_name}
                                </p>
                                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                                  {emp.email}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <p className="font-semibold text-[#11221E] dark:text-zinc-300">
                                  {emp.department_name}
                                </p>
                                <p className="text-[#415A54] dark:text-zinc-400">
                                  {emp.position_name}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <Badge variant={statusMeta.variant}>
                                  {statusMeta.label}
                                </Badge>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                                {emp.work_shift_code}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                                {emp.kpi_completion_rate}%
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={riskMeta.variant}>
                                  {riskMeta.label} ({emp.burnout_risk_score})
                                </Badge>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openCreateReviewModal(emp)}
                                >
                                  <ClipboardCheck
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.5}
                                  />
                                  Đánh giá
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Multi-Cycle Performance Reviews Table */}
          <Card className="overflow-hidden rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800 dark:bg-[#121214] dark:shadow-none">
            <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck
                      className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                      strokeWidth={1.5}
                    />
                    Bảng Đánh giá Định kỳ (Thử việc · Quý · Năm)
                  </CardTitle>
                  <CardDescription>
                    Lưu trữ đồng bộ kết quả KPI/OKR, phê duyệt chuyển chính thức từ thử việc và đề xuất thăng chức / điều chỉnh lương.
                  </CardDescription>
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-56">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C7871] dark:text-zinc-400"
                      strokeWidth={1.5}
                    />
                    <Input
                      value={reviewSearch}
                      onChange={(e) => setReviewSearch(e.target.value)}
                      placeholder="Tìm nhân sự, mã phiếu, kỳ..."
                      aria-label="Tìm kiếm phiếu đánh giá"
                      className="pl-9"
                    />
                  </div>
                  <Button size="sm" onClick={() => openCreateReviewModal()}>
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Tạo phiếu đánh giá
                  </Button>
                </div>
              </div>

              {/* Cycle Filter Pills */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'ALL', label: 'Tất cả chu kỳ' },
                    { key: 'PROBATION', label: 'Đánh giá thử việc' },
                    { key: 'QUARTERLY', label: 'Đánh giá Quý' },
                    { key: 'ANNUAL', label: 'Đánh giá Năm' },
                  ] as const
                ).map((item) => {
                  const count =
                    item.key === 'ALL'
                      ? roleScopedReviews.length
                      : roleScopedReviews.filter((r) => r.cycle === item.key).length;
                  return (
                    <Button
                      key={item.key}
                      size="sm"
                      variant={cycleFilter === item.key ? 'default' : 'outline'}
                      onClick={() => setCycleFilter(item.key)}
                    >
                      <span>{item.label}</span>
                      <span className="font-mono text-[11px] tabular-nums opacity-80">
                        ({count})
                      </span>
                    </Button>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredReviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <p className="text-sm font-medium text-[#11221E] dark:text-zinc-200">
                    Không tìm thấy phiếu đánh giá phù hợp
                  </p>
                  <p className="text-xs text-[#415A54] dark:text-zinc-400">
                    Thử chọn chu kỳ khác hoặc tạo phiếu đánh giá mới cho nhân sự.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                        <th className="whitespace-nowrap px-4 py-3">Mã &amp; Chu kỳ</th>
                        <th className="px-4 py-3">Nhân sự</th>
                        <th className="px-4 py-3 text-right">Điểm KPI</th>
                        <th className="px-4 py-3 text-right">OKR (%)</th>
                        <th className="px-4 py-3">Xếp loại &amp; Kết luận</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          Thưởng KPI
                        </th>
                        <th className="px-4 py-3">Trạng thái &amp; Nhận xét</th>
                        <th className="px-4 py-3 text-right">Thao tác nghiệp vụ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                      {filteredReviews.map((rec) => {
                        const liveEmp =
                          employeeMapById.get(rec.employee_id) ??
                          employeeMapById.get(rec.employee_code);
                        const isProbationPassConvertible =
                          rec.cycle === 'PROBATION' &&
                          rec.result === 'PASS' &&
                          liveEmp?.employment_status === 'PROBATION';
                        const isAlreadyConvertedOfficial =
                          rec.cycle === 'PROBATION' &&
                          rec.result === 'PASS' &&
                          liveEmp &&
                          isOfficialEmployeeStatus(liveEmp.employment_status);
                        const isHighGrade =
                          rec.grade === 'A+' || rec.grade === 'A';
                        const statusMeta = REVIEW_STATUS_META[rec.status];

                        return (
                          <tr
                            key={rec.id}
                            className="transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 align-top">
                              <p className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                                {rec.review_code}
                              </p>
                              <div className="mt-1">
                                <Badge variant={CYCLE_META[rec.cycle].variant}>
                                  {CYCLE_META[rec.cycle].shortLabel}
                                </Badge>
                              </div>
                              <p className="mt-1 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                                {rec.period_label}
                              </p>
                            </td>

                            <td className="px-4 py-3.5 align-top">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="font-semibold text-[#11221E] dark:text-zinc-100">
                                  {liveEmp?.full_name ?? rec.full_name}
                                </p>
                                {liveEmp?.employment_status === 'PROBATION' && (
                                  <Badge variant="warning" className="text-[11px]">
                                    Thử việc
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                                {rec.employee_code} ·{' '}
                                {liveEmp?.department_name ?? rec.department_name}
                              </p>
                              <p className="mt-0.5 text-xs text-[#5C7871] dark:text-zinc-400">
                                {liveEmp?.position_name ?? rec.position_name}
                              </p>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5 text-right align-top font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                              {rec.kpi_score} / 100
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5 text-right align-top font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                              {rec.okr_completion_percent}%
                            </td>

                            <td className="px-4 py-3.5 align-top">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant={GRADE_BADGE[rec.grade]}>
                                  Hạng {rec.grade}
                                </Badge>
                                <Badge variant={RESULT_META[rec.result].variant}>
                                  {RESULT_META[rec.result].label}
                                </Badge>
                              </div>
                              {isAlreadyConvertedOfficial && (
                                <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                                  Đã ký HĐ chính thức
                                </p>
                              )}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5 text-right align-top font-mono text-xs tabular-nums text-[#11221E] dark:text-zinc-200">
                              {rec.suggested_bonus_vnd && rec.suggested_bonus_vnd > 0
                                ? formatVnd(rec.suggested_bonus_vnd)
                                : '0 đ'}
                            </td>

                            <td className="max-w-xs px-4 py-3.5 align-top text-xs text-[#415A54] dark:text-zinc-400">
                              <div className="flex items-center gap-1.5">
                                <Badge variant={statusMeta.variant}>
                                  {statusMeta.label}
                                </Badge>
                                <span className="text-[11px] text-[#5C7871] dark:text-zinc-500">
                                  · {rec.reviewer_name}
                                </span>
                              </div>
                              <p className="mt-1.5 line-clamp-2">{rec.review_note}</p>
                            </td>

                            <td className="px-4 py-3.5 text-right align-top">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {isProbationPassConvertible && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      void handleConvertProbationOfficial(rec)
                                    }
                                  >
                                    <UserCheck
                                      className="h-3.5 w-3.5"
                                      strokeWidth={1.5}
                                    />
                                    {canManageCareerDecisions
                                      ? 'Chuyển chính thức'
                                      : 'Đề xuất chuyển chính thức'}
                                  </Button>
                                )}

                                {isHighGrade && !isProbationPassConvertible && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      void handleProposePromotionFromReview(rec)
                                    }
                                  >
                                    <TrendingUp
                                      className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400"
                                      strokeWidth={1.5}
                                    />
                                    Đề xuất Thăng chức / Tăng lương
                                  </Button>
                                )}

                                {canApproveReviews && rec.status !== 'APPROVED' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleQuickApproveReview(rec)}
                                  >
                                    <CheckCircle2
                                      className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
                                      strokeWidth={1.5}
                                    />
                                    Duyệt
                                  </Button>
                                )}

                                {(canApproveReviews || rec.status !== 'APPROVED') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditReviewModal(rec)}
                                  >
                                    <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    Cập nhật
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================================================================== */}
        {/* TAB 2: LỊCH SỬ CÔNG TÁC & QUYẾT ĐỊNH THĂNG TIẾN / ĐIỀU CHUYỂN         */}
        {/* ==================================================================== */}
        <TabsContent value="career">{renderCareerHistoriesSection()}</TabsContent>

        {/* ==================================================================== */}
        {/* TAB 3: CẢNH BÁO AI BURNOUT & BIẾN ĐỘNG NHÂN SỰ                        */}
        {/* ==================================================================== */}
        <TabsContent value="burnout" className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
                Radar Cảnh báo AI nguy cơ nghỉ việc &amp; Kiệt sức (Burnout)
              </h2>
              <p className="text-xs text-[#5C7871] dark:text-zinc-400">
                Phân tích tổng hợp từ giờ tăng ca 30 ngày gần nhất, tần suất đi muộn, chu kỳ tái ký hợp đồng và xu hướng KPI.
              </p>
            </div>
            <Badge variant="warning">
              {visibleAlerts.length} hồ sơ cần theo dõi sát
            </Badge>
          </div>

          {visibleAlerts.length === 0 ? (
            <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
              <CardContent className="py-12 text-center text-sm text-[#415A54] dark:text-zinc-400">
                Không có cảnh báo Burnout hoặc rủi ro biến động nhân sự nào trong phạm vi hiện tại.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visibleAlerts.map((alert) => {
                const riskMeta = RISK_BADGE[alert.risk_level];
                const liveEmp =
                  employeeMapById.get(alert.employee_id) ??
                  employeeMapById.get(alert.employee_code);

                return (
                  <Card
                    key={alert.id}
                    className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">
                            {alert.full_name}{' '}
                            <span className="font-mono text-xs font-normal tabular-nums text-[#415A54] dark:text-zinc-400">
                              ({alert.employee_code})
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-0.5">
                            {alert.position_name} · {alert.department_name}
                          </CardDescription>
                        </div>
                        <Badge variant={riskMeta.variant}>{riskMeta.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                        <div>
                          <p className="text-[#5C7871] dark:text-zinc-400">Burnout</p>
                          <p className="mt-0.5 font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                            {alert.burnout_risk_score}/100
                          </p>
                        </div>
                        <div>
                          <p className="text-[#5C7871] dark:text-zinc-400">Turnover</p>
                          <p className="mt-0.5 font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                            {alert.turnover_risk_score}/100
                          </p>
                        </div>
                        <div>
                          <p className="text-[#5C7871] dark:text-zinc-400">OT 30 ngày</p>
                          <p className="mt-0.5 font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                            {alert.overtime_hours_last_30d} giờ
                          </p>
                        </div>
                      </div>

                      <ul className="space-y-1.5 text-xs text-[#415A54] dark:text-zinc-400">
                        {alert.key_factors.map((factor) => (
                          <li key={factor} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                            <span>{factor}</span>
                          </li>
                        ))}
                      </ul>

                      {alert.recommended_action && (
                        <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/60 p-2.5 text-xs text-[#11221E] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
                          <span className="font-semibold text-[#0F766E] dark:text-teal-400">
                            Khuyến nghị giữ chân nhân tài:
                          </span>{' '}
                          {alert.recommended_action}
                        </div>
                      )}

                      {canManageCareerDecisions && liveEmp && (
                        <div className="flex justify-end pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              openDecisionModal({
                                employee: liveEmp,
                                defaultChangeType: 'SALARY_ADJUSTMENT',
                                customReason: `Điều chỉnh đãi ngộ giữ chân nhân sự chủ chốt (${alert.recommended_action})`,
                              })
                            }
                          >
                            <FileSignature className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Lập Quyết định giữ chân / Điều chỉnh lương
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ====================================================================== */}
      {/* MODAL 1: CREATE / EDIT / APPROVE PERFORMANCE REVIEW                    */}
      {/* ====================================================================== */}
      <Dialog
        open={reviewModalOpen}
        onOpenChange={(open) => !open && setReviewModalOpen(false)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingReview
                ? `Cập nhật / Phê duyệt Phiếu đánh giá ${editingReview.review_code}`
                : 'Tạo Phiếu Đánh giá Định kỳ (Thử việc · Quý · Năm)'}
            </DialogTitle>
            <DialogDescription>
              Lưu đồng bộ vào kho đánh giá hiệu suất. Khi phê duyệt, điểm KPI tự động cập nhật sang hồ sơ nhân sự và thưởng KPI kỳ lương.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => void handleSaveReviewSubmit(e)}
            className="mt-3 max-h-[70dvh] space-y-4 overflow-y-auto pr-1"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="rev-employee"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Nhân sự được đánh giá
                </label>
                <Select
                  id="rev-employee"
                  value={formEmployeeId}
                  disabled={Boolean(editingReview)}
                  onValueChange={(val) => {
                    setFormEmployeeId(val);
                    const emp = employeeMapById.get(val);
                    if (emp && !editingReview) {
                      const nextCycle: PerformanceReviewCycle =
                        emp.employment_status === 'PROBATION'
                          ? 'PROBATION'
                          : formCycle;
                      handleFormCycleChange(nextCycle);
                    }
                  }}
                  options={evaluableEmployees.map((emp) => ({
                    label: `${emp.employee_code} — ${emp.full_name} (${emp.position_name} · ${emp.employment_status === 'PROBATION' ? 'Thử việc' : emp.department_name})`,
                    value: emp.id,
                  }))}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="rev-cycle"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Chu kỳ đánh giá
                </label>
                <Select
                  id="rev-cycle"
                  value={formCycle}
                  onValueChange={(val) =>
                    handleFormCycleChange(val as PerformanceReviewCycle)
                  }
                  options={[
                    { label: 'Đánh giá thử việc', value: 'PROBATION' },
                    { label: 'Đánh giá Quý', value: 'QUARTERLY' },
                    { label: 'Đánh giá Năm', value: 'ANNUAL' },
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="rev-period-label"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Nhãn kỳ đánh giá
                </label>
                <Input
                  id="rev-period-label"
                  value={formPeriodLabel}
                  onChange={(e) => setFormPeriodLabel(e.target.value)}
                  placeholder="VD: Thử việc T10-T11/2026, 2026-Q4, Năm 2026"
                  className="font-mono tabular-nums"
                />
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {(formCycle === 'PROBATION'
                    ? ['Thử việc T10-T11/2026', 'Thử việc 60 ngày (11-12/2026)']
                    : formCycle === 'QUARTERLY'
                      ? ['2026-Q4', '2026-Q3']
                      : ['Năm 2026', 'Năm 2025']
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormPeriodLabel(preset)}
                      className="rounded border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-0.5 font-mono text-[11px] text-[#415A54] hover:border-[#0F766E] hover:text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="rev-kpi-score"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Điểm KPI (0–100)
                </label>
                <Input
                  id="rev-kpi-score"
                  type="number"
                  min={0}
                  max={100}
                  value={formKpiScore}
                  onChange={(e) => {
                    setFormKpiScore(e.target.value);
                    const numeric = Number(e.target.value);
                    if (!Number.isNaN(numeric)) {
                      setFormGrade(inferGradeFromScore(numeric));
                    }
                  }}
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="rev-okr-percent"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Hoàn thành OKR (0–100%)
                </label>
                <Input
                  id="rev-okr-percent"
                  type="number"
                  min={0}
                  max={100}
                  value={formOkrPercent}
                  onChange={(e) => setFormOkrPercent(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="rev-grade"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Xếp loại
                </label>
                <Select
                  id="rev-grade"
                  value={formGrade}
                  onValueChange={(val) =>
                    setFormGrade(val as PerformanceReview['grade'])
                  }
                  options={[
                    { label: 'Hạng A+ (Xuất sắc dẫn đầu)', value: 'A+' },
                    { label: 'Hạng A (Vượt kỳ vọng)', value: 'A' },
                    { label: 'Hạng B+ (Hoàn thành tốt)', value: 'B+' },
                    { label: 'Hạng B (Đạt chuẩn)', value: 'B' },
                    { label: 'Hạng C (Cần cải thiện)', value: 'C' },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="rev-result"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Kết luận đánh giá
                </label>
                <Select
                  id="rev-result"
                  value={formResult}
                  onValueChange={(val) =>
                    setFormResult(val as PerformanceReviewResult)
                  }
                  options={
                    formCycle === 'PROBATION'
                      ? [
                          { label: 'Đạt thử việc', value: 'PASS' },
                          { label: 'Gia hạn thử việc', value: 'EXTEND' },
                          { label: 'Không đạt thử việc', value: 'FAIL' },
                        ]
                      : [
                          { label: 'Xuất sắc', value: 'EXCELLENT' },
                          { label: 'Hoàn thành tốt', value: 'GOOD' },
                          { label: 'Đạt yêu cầu', value: 'AVERAGE' },
                          { label: 'Chưa đạt yêu cầu', value: 'POOR' },
                        ]
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="rev-bonus-vnd"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Thưởng KPI đề xuất (VNĐ)
                </label>
                <Input
                  id="rev-bonus-vnd"
                  type="number"
                  min={0}
                  step={100000}
                  value={formBonusVnd}
                  onChange={(e) => setFormBonusVnd(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="rev-status"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Trạng thái phê duyệt
                </label>
                <Select
                  id="rev-status"
                  value={formReviewStatus}
                  onValueChange={(val) =>
                    setFormReviewStatus(val as PerformanceReview['status'])
                  }
                  options={
                    canApproveReviews
                      ? [
                          { label: 'Đã phê duyệt', value: 'APPROVED' },
                          { label: 'Chờ phê duyệt', value: 'SUBMITTED' },
                          { label: 'Lưu nháp', value: 'DRAFT' },
                        ]
                      : [
                          { label: 'Gửi chờ phê duyệt', value: 'SUBMITTED' },
                          { label: 'Lưu nháp', value: 'DRAFT' },
                        ]
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="rev-note"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Nhận xét chi tiết &amp; Đề xuất của Người đánh giá
              </label>
              <textarea
                id="rev-note"
                rows={3}
                value={formReviewNote}
                onChange={(e) => setFormReviewNote(e.target.value)}
                placeholder="Ghi nhận kết quả thực hiện mục tiêu, điểm mạnh, hạn chế cần khắc phục và đề xuất đãi ngộ..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] transition-colors placeholder:text-[#5C7871] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-teal-400"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReviewModalOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button type="submit" disabled={isSavingReview}>
                {isSavingReview
                  ? 'Đang lưu...'
                  : editingReview
                    ? 'Lưu cập nhật đánh giá'
                    : 'Lưu phiếu đánh giá'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ====================================================================== */}
      {/* MODAL 2: BAN HÀNH QUYẾT ĐỊNH THĂNG CHỨC / ĐIỀU CHUYỂN / TĂNG LƯƠNG      */}
      {/* ====================================================================== */}
      <Dialog
        open={decisionModalOpen}
        onOpenChange={(open) => !open && setDecisionModalOpen(false)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Ban hành Quyết định Thăng chức / Điều chuyển / Tăng lương
            </DialogTitle>
            <DialogDescription>
              Quyết định có hiệu lực sẽ tự động lưu lịch sử công tác, cập nhật Hồ sơ nhân sự, sinh Phụ lục hợp đồng, cập nhật phân quyền hệ thống và kích hoạt tách lương giữa kỳ nếu chọn ngày giữa tháng.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => void handleIssueDecisionSubmit(e)}
            className="mt-3 max-h-[72dvh] space-y-4 overflow-y-auto pr-1"
          >
            {/* Employee & Current Snapshot */}
            <div className="space-y-2">
              <label
                htmlFor="dec-employee"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Nhân sự áp dụng Quyết định
              </label>
              <Select
                id="dec-employee"
                value={decEmployeeId}
                onValueChange={handleDecisionEmployeeChange}
                options={employees
                  .filter((e) => e.employment_status !== 'RESIGNED')
                  .map((emp) => ({
                    label: `${emp.employee_code} — ${emp.full_name} (${emp.position_name} · ${emp.department_name})`,
                    value: emp.id,
                  }))}
              />

              {selectedDecisionEmployee && (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3 text-xs sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div>
                    <p className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                      Phòng ban hiện tại
                    </p>
                    <p className="mt-0.5 font-semibold text-[#11221E] dark:text-zinc-200">
                      {selectedDecisionEmployee.department_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                      Chức danh hiện tại
                    </p>
                    <p className="mt-0.5 font-semibold text-[#11221E] dark:text-zinc-200">
                      {selectedDecisionEmployee.position_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                      Lương cơ bản cũ
                    </p>
                    <p className="mt-0.5 font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                      {formatVnd(selectedDecisionEmployee.base_salary_vnd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                      Quyền hệ thống hiện tại
                    </p>
                    <p className="mt-0.5 font-semibold text-[#11221E] dark:text-zinc-200">
                      {ROLE_SHORT_LABELS[selectedDecisionEmployee.role_code]}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="dec-change-type"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Loại Quyết định nhân sự
                </label>
                <Select
                  id="dec-change-type"
                  value={decChangeType}
                  onValueChange={(val) =>
                    handleDecisionChangeTypeChange(val as DecisionModalChangeType)
                  }
                  options={[
                    { label: 'Thăng chức / Bổ nhiệm', value: 'PROMOTION' },
                    {
                      label: 'Điều chuyển phòng ban',
                      value: 'DEPARTMENT_TRANSFER',
                    },
                    {
                      label: 'Điều chỉnh bậc lương',
                      value: 'SALARY_ADJUSTMENT',
                    },
                    {
                      label: 'Thay đổi phân quyền hệ thống',
                      value: 'ROLE_CHANGE',
                    },
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dec-decision-no"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Số Quyết định (Tự động gợi ý chuẩn hành chính)
                </label>
                <Input
                  id="dec-decision-no"
                  value={decDecisionNo}
                  onChange={(e) => {
                    setDecDecisionNo(e.target.value);
                    setDecDecisionNoTouched(true);
                  }}
                  placeholder="VD: QD-2026-BN004"
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Effective Date + Mid-month Payroll Proration Helper */}
            <div className="space-y-1.5 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label
                  htmlFor="dec-effective-date"
                  className="text-xs font-semibold text-[#11221E] dark:text-zinc-200"
                >
                  Ngày có hiệu lực
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDecisionEffectiveDateChange('2026-11-16')}
                    className="rounded border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 font-mono text-[11px] tabular-nums text-[#0F766E] hover:border-[#0F766E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-teal-400"
                  >
                    Giữa tháng: 16/11/2026
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecisionEffectiveDateChange('2026-12-01')}
                    className="rounded border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 font-mono text-[11px] tabular-nums text-[#415A54] hover:border-[#0F766E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    Đầu tháng: 01/12/2026
                  </button>
                </div>
              </div>

              <Input
                id="dec-effective-date"
                type="date"
                value={decEffectiveDate}
                onChange={(e) => handleDecisionEffectiveDateChange(e.target.value)}
                className="font-mono tabular-nums"
              />

              <p className="text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Lưu ý tính lương: Nếu chọn ngày hiệu lực giữa tháng (ví dụ: 16/11/2026), hệ thống sẽ tự động tách bảng lương tháng 11 thành 2 giai đoạn: số ngày công trước ngày hiệu lực hưởng mức lương cũ và từ ngày hiệu lực trở đi hưởng mức lương mới.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="dec-new-dept"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Phòng ban công tác mới
                </label>
                <Select
                  id="dec-new-dept"
                  value={decNewDeptId}
                  onValueChange={setDecNewDeptId}
                  options={departments.map((d) => ({
                    label: d.department_name,
                    value: d.id,
                  }))}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dec-new-position"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Chức danh mới
                </label>
                <Input
                  id="dec-new-position"
                  list="hrm-position-suggestions"
                  value={decNewPositionName}
                  onChange={(e) => handleDecisionPositionNameChange(e.target.value)}
                  placeholder="Nhập hoặc chọn chức danh mới..."
                />
                <datalist id="hrm-position-suggestions">
                  {MOCK_POSITIONS.map((pos) => (
                    <option key={pos.id} value={pos.position_name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="dec-new-salary"
                    className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Mức lương cơ bản mới (VNĐ)
                  </label>
                  {selectedDecisionEmployee && (
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                      {
                        calcSalaryIncreaseInfo(
                          selectedDecisionEmployee.base_salary_vnd,
                          Number(decNewSalaryVnd) || 0
                        ).label
                      }
                    </span>
                  )}
                </div>
                <Input
                  id="dec-new-salary"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="VD: 26.500.000"
                  value={formatSalaryInputVnd(decNewSalaryVnd)}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, '')
                      .replace(/^0+(?=\d)/, '')
                      .slice(0, 12);
                    setDecNewSalaryVnd(digits);
                  }}
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dec-new-role"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Phân quyền hệ thống mới
                </label>
                <Select
                  id="dec-new-role"
                  value={decNewRoleCode}
                  onValueChange={(val) => setDecNewRoleCode(val as RoleCode)}
                  options={
                    canApproveExecutiveDecision
                      ? [
                          { label: ROLE_LABELS.EMPLOYEE, value: 'EMPLOYEE' },
                          { label: ROLE_LABELS.DEPT_MANAGER, value: 'DEPT_MANAGER' },
                          { label: ROLE_LABELS.HR_MANAGER, value: 'HR_MANAGER' },
                          { label: ROLE_LABELS.DIRECTOR, value: 'DIRECTOR' },
                        ]
                      : [
                          { label: ROLE_LABELS.EMPLOYEE, value: 'EMPLOYEE' },
                          {
                            label: `${ROLE_LABELS.DEPT_MANAGER} (Cần Giám đốc duyệt)`,
                            value: 'DEPT_MANAGER',
                          },
                          {
                            label: `${ROLE_LABELS.HR_MANAGER} (Cần Giám đốc duyệt)`,
                            value: 'HR_MANAGER',
                          },
                          {
                            label: `${ROLE_LABELS.DIRECTOR} (Cần Giám đốc duyệt)`,
                            value: 'DIRECTOR',
                          },
                        ]
                  }
                />
                {!canApproveExecutiveDecision &&
                ((Number(decNewSalaryVnd) || 0) > 50_000_000 ||
                  decNewRoleCode === 'DEPT_MANAGER' ||
                  decNewRoleCode === 'HR_MANAGER' ||
                  decNewRoleCode === 'DIRECTOR' ||
                  decNewRoleCode === 'SUPER_ADMIN') ? (
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    Cần Giám đốc duyệt: Mức lương trên 50.000.000 VNĐ hoặc bổ nhiệm vai trò Trưởng phòng / Quản lý / Giám đốc yêu cầu Giám đốc / Quản trị hệ thống ký ban hành.
                  </p>
                ) : (
                  <p className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                    Nâng quyền từ Nhân viên → Trưởng bộ phận sẽ tự động mở quyền phê duyệt đơn nghỉ phép và tăng ca của nhân viên trong bộ phận.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="dec-reason"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Lý do &amp; Căn cứ ban hành Quyết định
              </label>
              <textarea
                id="dec-reason"
                rows={3}
                value={decReason}
                onChange={(e) => setDecReason(e.target.value)}
                placeholder="Nhập căn cứ đánh giá năng lực, nhu cầu tổ chức hoặc quyết định điều chỉnh bậc lương..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] transition-colors placeholder:text-[#5C7871] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-teal-400"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDecisionModalOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmittingDecision ||
                  (!canApproveExecutiveDecision &&
                    ((Number(decNewSalaryVnd) || 0) > 50_000_000 ||
                      decNewRoleCode === 'DEPT_MANAGER' ||
                      decNewRoleCode === 'HR_MANAGER' ||
                      decNewRoleCode === 'DIRECTOR' ||
                      decNewRoleCode === 'SUPER_ADMIN'))
                }
              >
                <FileSignature className="h-4 w-4" strokeWidth={1.5} />
                {isSubmittingDecision
                  ? 'Đang ban hành...'
                  : !canApproveExecutiveDecision &&
                      ((Number(decNewSalaryVnd) || 0) > 50_000_000 ||
                        decNewRoleCode === 'DEPT_MANAGER' ||
                        decNewRoleCode === 'HR_MANAGER' ||
                        decNewRoleCode === 'DIRECTOR' ||
                        decNewRoleCode === 'SUPER_ADMIN')
                    ? 'Cần Giám đốc duyệt'
                    : 'Xác nhận & Ban hành Quyết định'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
