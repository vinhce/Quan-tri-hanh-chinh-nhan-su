import { MOCK_SYSTEM_USERS } from '@/mock/admin';
import { MOCK_CANDIDATES, MOCK_JOB_POSTINGS } from '@/mock/ats';
import {
  MOCK_ANNUAL_LEAVE_BALANCES,
  MOCK_LEAVE_OVERTIME_REQUESTS,
  MOCK_MONTHLY_ATTENDANCE,
  MOCK_WORK_SHIFTS,
} from '@/mock/attendance';
import {
  MOCK_CONTRACTS,
  MOCK_DEPARTMENTS,
  MOCK_EMPLOYEES,
  MOCK_POSITIONS,
} from '@/mock/employees';
import {
  MOCK_COMPANY_ASSETS,
  MOCK_INITIAL_NOTIFICATIONS,
  MOCK_ONBOARDING_RECORDS,
} from '@/mock/onboarding';
import {
  calculateProgressivePitVnd,
  MOCK_PAYROLL_FORMULA,
  MOCK_PAYROLL_RECORDS,
} from '@/mock/payroll';
import { isOfficialEmployeeStatus } from '@/mock/types';
import type {
  AnnualLeaveBalance,
  AssetCategory,
  AssetConditionStatus,
  BiometricCredentialRecord,
  Candidate,
  CareerChangeType,
  CareerHistoryEntry,
  ClearanceAssetItem,
  ClearanceChecklist,
  ClearanceGateStatus,
  CompanyAsset,
  ContractType,
  DailyAttendanceRecord,
  DailyAttendanceStatus,
  Department,
  DepartmentRecruitmentRequest,
  Employee,
  EmployeeAssetAssignment,
  EmploymentContract,
  EmploymentStatus,
  HandoverItem,
  HandoverItemCategory,
  HrmNotification,
  JobPosting,
  LeaveOvertimeRequest,
  ManagerOffboardingDependency,
  MidMonthSalarySplit,
  MonthlyAttendanceSummary,
  MultiStepRequestStatus,
  OnboardingChecklistItem,
  OnboardingRecord,
  OnboardingTaskGroup,
  PayrollRecord,
  PerformanceReview,
  PerformanceReviewCycle,
  PerformanceReviewResult,
  PreboardingInvite,
  PreboardingStatus,
  PreboardingSubmissionData,
  RequestApprovalStatus,
  ResignationNoticeCalculation,
  ResignationReasonCategory,
  ResignationRequest,
  RoleCode,
  SystemUserAccount,
  WifiAttendancePolicy,
  WifiMatchMode,
} from '@/mock/types';
import { recordAuditLog } from './audit-logger';

export { isOfficialEmployeeStatus };

export const HRM_RUNTIME_EVENT = 'hrm-runtime-updated';

export const STORAGE_NOTIFICATIONS_KEY = 'hrm_runtime_notifications_v1';
export const STORAGE_REQUESTS_KEY = 'hrm_runtime_requests_v1';
export const STORAGE_EMPLOYEES_KEY = 'hrm_runtime_employees_v1';
export const STORAGE_CANDIDATES_KEY = 'hrm_runtime_candidates_v1';
export const STORAGE_JOBS_KEY = 'hrm_runtime_jobs_v1';
export const STORAGE_ONBOARDING_KEY = 'hrm_runtime_onboarding_v1';
export const STORAGE_ASSETS_KEY = 'hrm_runtime_assets_v1';
export const STORAGE_DEPT_REQUESTS_KEY = 'hrm_runtime_dept_recruitment_requests_v1';
export const STORAGE_USERS_KEY = 'hrm_runtime_users_v1';
export const STORAGE_PREBOARDING_KEY = 'hrm_runtime_preboarding_v1';
export const STORAGE_EMPLOYEE_ASSETS_KEY = 'hrm_runtime_employee_assets_v1';
export const STORAGE_CONTRACTS_KEY = 'hrm_runtime_contracts_v1';
export const STORAGE_DEPARTMENTS_KEY = 'hrm_runtime_departments_v1';
export const STORAGE_DAILY_ATTENDANCE_KEY = 'hrm_runtime_daily_attendance_v1';
export const STORAGE_MONTHLY_ATTENDANCE_KEY = 'hrm_runtime_monthly_attendance_v1';
export const STORAGE_LEAVE_BALANCES_KEY = 'hrm_runtime_leave_balances_v1';
export const STORAGE_PAYROLLS_KEY = 'hrm_runtime_payrolls_v1';
export const STORAGE_PERFORMANCE_REVIEWS_KEY = 'hrm_runtime_performance_reviews_v1';
export const STORAGE_CAREER_HISTORIES_KEY = 'hrm_runtime_career_histories_v1';
export const STORAGE_RESIGNATIONS_KEY = 'hrm_runtime_resignations_v1';
export const STORAGE_HANDOVER_ITEMS_KEY = 'hrm_runtime_handover_items_v1';
export const STORAGE_CLEARANCE_CHECKLISTS_KEY = 'hrm_runtime_clearance_checklists_v1';
export const STORAGE_BIOMETRIC_CREDS_KEY = 'hrm_runtime_biometric_creds_v1';
export const STORAGE_WIFI_POLICY_KEY = 'hrm_runtime_wifi_policy_v1';

const TECH_SCOPE_IDENTIFIERS = new Set([
  'dept-tech',
  'dept-tech-swe',
  'dept-tech-data',
  'dept-data',
  'Khối Công nghệ',
  'Phòng Kỹ thuật Phần mềm',
  'Phòng Dữ liệu & AI',
]);

const DEPT_CANONICAL_MAP: Record<string, string> = {
  'dept-board': 'dept-board',
  'Ban Điều hành': 'dept-board',
  'dept-hr': 'dept-hr',
  'Phòng Nhân sự & Hành chính': 'dept-hr',
  'dept-fin': 'dept-fin',
  'Phòng Tài chính - Kế toán': 'dept-fin',
  'dept-sales': 'dept-sales',
  'Khối Kinh doanh': 'dept-sales',
};

function emitRuntimeUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
}

function cloneJson<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

function readStorageArray<T>(key: string): T[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

const lastLocalWriteAt: Record<string, number> = {};

function writeStorageArray<T>(key: string, items: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    lastLocalWriteAt[key] = Date.now();
    window.localStorage.setItem(key, JSON.stringify(items));
    emitRuntimeUpdated();
    if (typeof fetch === 'function') {
      fetch('/api/hrm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, items }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (
            data &&
            typeof data.bootEpoch === 'string' &&
            data.bootEpoch.length > 0 &&
            !window.localStorage.getItem(STORAGE_BOOT_EPOCH_KEY)
          ) {
            try {
              window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
            } catch {
              // Ignore storage errors
            }
          }
        })
        .catch(() => {});
    }
  } catch {
    // Ignore storage quota or restricted mode errors
  }
}

function inferDeptForManagerCode(employeeCode: string): string {
  if (employeeCode === 'NV-2024-006') return 'dept-fin';
  if (employeeCode === 'NV-2024-007') return 'dept-sales';
  if (employeeCode === 'NV-2024-002') return 'dept-hr';
  return 'dept-tech';
}

function matchesDepartmentScope(
  targetDepartmentId: string,
  actorDepartmentId: string | undefined,
  actorEmployeeCode: string
): boolean {
  const effectiveActorDept =
    actorDepartmentId && actorDepartmentId.trim().length > 0
      ? actorDepartmentId.trim()
      : inferDeptForManagerCode(actorEmployeeCode);

  const normalizedTarget = targetDepartmentId.trim();
  if (normalizedTarget === effectiveActorDept) return true;

  if (
    TECH_SCOPE_IDENTIFIERS.has(normalizedTarget) &&
    TECH_SCOPE_IDENTIFIERS.has(effectiveActorDept)
  ) {
    return true;
  }

  const canonicalTarget = DEPT_CANONICAL_MAP[normalizedTarget] ?? normalizedTarget;
  const canonicalActor = DEPT_CANONICAL_MAP[effectiveActorDept] ?? effectiveActorDept;
  return canonicalTarget === canonicalActor;
}

function matchesNotificationForActor(
  item: HrmNotification,
  role: RoleCode,
  employeeCode: string,
  departmentId?: string
): boolean {
  const matchedByCode = Boolean(
    employeeCode && item.target_employee_codes?.includes(employeeCode)
  );

  let matchedByRole = false;
  if (item.target_roles?.includes(role)) {
    if (role === 'DEPT_MANAGER' && item.target_department_id) {
      matchedByRole = matchesDepartmentScope(
        item.target_department_id,
        departmentId,
        employeeCode
      );
    } else {
      matchedByRole = true;
    }
  }

  return matchedByCode || matchedByRole;
}

function readAllNotifications(): HrmNotification[] {
  const stored = readStorageArray<HrmNotification>(STORAGE_NOTIFICATIONS_KEY);
  if (stored) return stored;
  return cloneJson(MOCK_INITIAL_NOTIFICATIONS);
}

export function getNotificationsForActor(
  role: RoleCode,
  employeeCode: string,
  departmentId?: string
): (HrmNotification & { isRead: boolean })[] {
  const readKey = `${role}:${employeeCode}`;
  return readAllNotifications()
    .filter((item) => matchesNotificationForActor(item, role, employeeCode, departmentId))
    .map((item) => ({
      ...item,
      isRead: item.read_by.includes(readKey),
    }));
}

export function pushNotification(
  input: Omit<HrmNotification, 'id' | 'created_at' | 'read_by'>
): HrmNotification {
  const randSuffix = Math.random().toString(36).slice(2, 6);
  const created: HrmNotification = {
    ...input,
    id: `ntf-${Date.now()}-${randSuffix}`,
    created_at: new Date().toISOString(),
    read_by: [],
  };

  const existing = readAllNotifications();
  const updated = [created, ...existing].slice(0, 100);
  writeStorageArray(STORAGE_NOTIFICATIONS_KEY, updated);
  return created;
}

export function markNotificationRead(
  notificationId: string,
  role: RoleCode,
  employeeCode: string
): void {
  const readKey = `${role}:${employeeCode}`;
  const existing = readAllNotifications();
  let changed = false;

  const updated = existing.map((item) => {
    if (item.id !== notificationId) return item;
    if (item.read_by.includes(readKey)) return item;
    changed = true;
    return {
      ...item,
      read_by: [...item.read_by, readKey],
    };
  });

  if (changed) {
    writeStorageArray(STORAGE_NOTIFICATIONS_KEY, updated);
  }
}

export function markAllNotificationsRead(
  role: RoleCode,
  employeeCode: string,
  departmentId?: string
): void {
  const readKey = `${role}:${employeeCode}`;
  const existing = readAllNotifications();
  let changed = false;

  const updated = existing.map((item) => {
    if (!matchesNotificationForActor(item, role, employeeCode, departmentId)) {
      return item;
    }
    if (item.read_by.includes(readKey)) {
      return item;
    }
    changed = true;
    return {
      ...item,
      read_by: [...item.read_by, readKey],
    };
  });

  if (changed) {
    writeStorageArray(STORAGE_NOTIFICATIONS_KEY, updated);
  }
}

// ---------------------------------------------------------------------------
// Runtime Leave & Overtime Requests
// ---------------------------------------------------------------------------

function readRuntimeRequests(): LeaveOvertimeRequest[] {
  return readStorageArray<LeaveOvertimeRequest>(STORAGE_REQUESTS_KEY) ?? [];
}

export function mergeWithRuntimeRequests(
  baseRequests: LeaveOvertimeRequest[]
): LeaveOvertimeRequest[] {
  const runtimeList = readRuntimeRequests();
  if (runtimeList.length === 0) return baseRequests;

  const baseIds = new Set(baseRequests.map((r) => r.id));
  const baseCodes = new Set(baseRequests.map((r) => r.request_code));

  const replacedBase = baseRequests.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.request_code === baseItem.request_code
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.request_code)
  );

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeRequest(req: LeaveOvertimeRequest): void {
  const current = readRuntimeRequests();
  const idx = current.findIndex(
    (item) => item.id === req.id || item.request_code === req.request_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? req : item))
      : [req, ...current];
  writeStorageArray(STORAGE_REQUESTS_KEY, updated);
}

// ---------------------------------------------------------------------------
// Runtime Employees
// ---------------------------------------------------------------------------

function readRuntimeEmployees(): Employee[] {
  return readStorageArray<Employee>(STORAGE_EMPLOYEES_KEY) ?? [];
}

export function mergeWithRuntimeEmployees(baseEmployees: Employee[]): Employee[] {
  const runtimeList = readRuntimeEmployees();
  if (runtimeList.length === 0) return baseEmployees;

  const baseIds = new Set(baseEmployees.map((e) => e.id));
  const baseCodes = new Set(baseEmployees.map((e) => e.employee_code));

  const replacedBase = baseEmployees.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.employee_code === baseItem.employee_code
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.employee_code)
  );

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeEmployee(emp: Employee): void {
  const current = readRuntimeEmployees();
  const idx = current.findIndex(
    (item) => item.id === emp.id || item.employee_code === emp.employee_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? emp : item))
      : [emp, ...current];
  writeStorageArray(STORAGE_EMPLOYEES_KEY, updated);
}

export function generateNextEmployeeCode(
  existingEmployees?: Array<{ employee_code: string }>
): string {
  const combined =
    existingEmployees !== undefined
      ? existingEmployees
      : [
          ...getAllRuntimeEmployees(),
          ...getOnboardingRecords(),
          ...getPreboardingInvites(),
        ];

  let maxNumber = 27;
  for (const item of combined) {
    const code = item.employee_code?.trim();
    if (!code) continue;
    const match = /^NV-\d{4}-(\d+)$/i.exec(code);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxNumber) {
        maxNumber = parsed;
      }
    }
  }

  return `NV-2026-${String(maxNumber + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Runtime Candidates
// ---------------------------------------------------------------------------

function sanitizeCandidateData(cand: Candidate): Candidate {
  let cleanCompany = cand.current_company || '';
  if (cleanCompany.includes('·')) {
    cleanCompany = cleanCompany.split('·')[0].trim();
  }

  // Sanitize junk reschedule strings
  let cleanReschedule = cand.reschedule_request;
  if (cleanReschedule) {
    if (
      cleanReschedule.reason &&
      (cleanReschedule.reason.includes('sdajkh') ||
        cleanReschedule.reason.includes('jsdlkaj') ||
        cleanReschedule.reason.length < 5)
    ) {
      cleanReschedule = {
        ...cleanReschedule,
        reason: 'Trùng lịch làm việc đột xuất, kính mong công ty hỗ trợ xếp lại.',
      };
    }
  }

  // Deduplicate notes and activity logs
  let cleanNotes = cand.notes;
  if (Array.isArray(cleanNotes)) {
    const seenContents = new Set<string>();
    cleanNotes = cleanNotes.filter((n) => {
      const key = `${n.author}:${n.content.trim()}`;
      if (seenContents.has(key)) return false;
      seenContents.add(key);
      return true;
    });
  }

  return {
    ...cand,
    current_company: cleanCompany,
    reschedule_request: cleanReschedule,
    notes: cleanNotes,
  };
}

export function readRuntimeCandidates(): Candidate[] {
  const rawList = readStorageArray<Candidate>(STORAGE_CANDIDATES_KEY) ?? [];
  return rawList
    .filter((c) => !c.full_name?.toLowerCase().includes('dasdas'))
    .map(sanitizeCandidateData);
}

export function mergeWithRuntimeCandidates(baseCandidates: Candidate[]): Candidate[] {
  const runtimeList = readRuntimeCandidates();
  if (runtimeList.length === 0) return baseCandidates.map(sanitizeCandidateData);

  const baseIds = new Set(baseCandidates.map((c) => c.id));
  const baseCodes = new Set(baseCandidates.map((c) => c.candidate_code));

  const replacedBase = baseCandidates.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.candidate_code === baseItem.candidate_code
    );
    return override ? sanitizeCandidateData(override) : sanitizeCandidateData(baseItem);
  });

  const brandNew = runtimeList
    .filter((rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.candidate_code))
    .map(sanitizeCandidateData);

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeCandidate(cand: Candidate): void {
  const cleanCand = sanitizeCandidateData(cand);
  const current = readRuntimeCandidates();
  const idx = current.findIndex(
    (item) => item.id === cleanCand.id || item.candidate_code === cleanCand.candidate_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? cleanCand : item))
      : [cleanCand, ...current];
  writeStorageArray(STORAGE_CANDIDATES_KEY, updated);
}

// ---------------------------------------------------------------------------
// Job Postings (ATS & Careers Portal Synchronized Storage)
// ---------------------------------------------------------------------------

export function readRuntimeJobs(): JobPosting[] {
  return readStorageArray<JobPosting>(STORAGE_JOBS_KEY) ?? [];
}

export function mergeWithRuntimeJobs(baseJobs: JobPosting[]): JobPosting[] {
  const runtimeList = readRuntimeJobs();
  if (runtimeList.length === 0) return baseJobs;

  const baseIds = new Set(baseJobs.map((j) => j.id));
  const baseCodes = new Set(baseJobs.map((j) => j.job_code));

  const replacedBase = baseJobs.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.job_code === baseItem.job_code
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.job_code)
  );

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeJob(job: JobPosting): void {
  const current = readRuntimeJobs();
  const idx = current.findIndex(
    (item) => item.id === job.id || item.job_code === job.job_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? job : item))
      : [job, ...current];
  writeStorageArray(STORAGE_JOBS_KEY, updated);
}

export function getJobPostings(fallbackBase?: JobPosting[]): JobPosting[] {
  const base = fallbackBase ?? MOCK_JOB_POSTINGS;
  return mergeWithRuntimeJobs(base);
}

// ---------------------------------------------------------------------------
// Onboarding Records
// ---------------------------------------------------------------------------

export function getOnboardingRecords(): OnboardingRecord[] {
  const stored = readStorageArray<OnboardingRecord>(STORAGE_ONBOARDING_KEY);
  if (stored) return stored;
  return cloneJson(MOCK_ONBOARDING_RECORDS);
}

export function saveOnboardingRecord(record: OnboardingRecord): void {
  const current = getOnboardingRecords();
  const idx = current.findIndex((item) => item.id === record.id);
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? record : item))
      : [record, ...current];
  writeStorageArray(STORAGE_ONBOARDING_KEY, updated);
}

export function toggleOnboardingChecklistItem(
  onboardingId: string,
  itemId: string,
  actorName: string
): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  let itemFound = false;
  let toggledGroup: OnboardingTaskGroup | null = null;
  const nowIso = new Date().toISOString();

  const updatedChecklist = target.checklist.map((chk) => {
    if (chk.id !== itemId) return chk;
    itemFound = true;
    toggledGroup = chk.group;
    const nextCompleted = !chk.completed;
    return {
      ...chk,
      completed: nextCompleted,
      completed_at: nextCompleted ? nowIso : undefined,
      completed_by: nextCompleted ? actorName : undefined,
    };
  });

  if (!itemFound) return null;

  const isAnyUncompleted = updatedChecklist.some((item) => !item.completed);
  const nextStatus =
    isAnyUncompleted && target.status === 'COMPLETED'
      ? 'IN_PROGRESS'
      : target.status;

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: nextStatus,
    checklist: updatedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  if (toggledGroup) {
    const groupAllDone = updatedChecklist
      .filter((c) => c.group === toggledGroup)
      .every((c) => c.completed);
    if (groupAllDone) {
      triggerOnboardingGroupSideEffectInternal(updatedRecord, toggledGroup, actorName);
    }
  }

  return updatedRecord;
}

export function toggleOnboardingChecklistGroup(
  onboardingId: string,
  group: OnboardingTaskGroup,
  targetCompleted: boolean,
  actorName: string
): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  const nowIso = new Date().toISOString();

  const updatedChecklist = target.checklist.map((chk) => {
    if (chk.group !== group) return chk;
    return {
      ...chk,
      completed: targetCompleted,
      completed_at: targetCompleted ? nowIso : undefined,
      completed_by: targetCompleted ? actorName : undefined,
    };
  });

  const isAnyUncompleted = updatedChecklist.some((item) => !item.completed);
  const nextStatus =
    isAnyUncompleted && target.status === 'COMPLETED'
      ? 'IN_PROGRESS'
      : target.status;

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: nextStatus,
    checklist: updatedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  if (targetCompleted) {
    triggerOnboardingGroupSideEffectInternal(updatedRecord, group, actorName);
  }

  return updatedRecord;
}

export function toggleAllOnboardingChecklist(
  onboardingId: string,
  targetCompleted: boolean,
  actorName: string
): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  const nowIso = new Date().toISOString();

  const updatedChecklist = target.checklist.map((chk) => ({
    ...chk,
    completed: targetCompleted,
    completed_at: targetCompleted ? nowIso : undefined,
    completed_by: targetCompleted ? actorName : undefined,
  }));

  const nextStatus =
    !targetCompleted && target.status === 'COMPLETED'
      ? 'IN_PROGRESS'
      : targetCompleted
      ? 'COMPLETED'
      : target.status;

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: nextStatus,
    checklist: updatedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  if (targetCompleted) {
    triggerOnboardingGroupSideEffectInternal(updatedRecord, 'IT', actorName);
    triggerOnboardingGroupSideEffectInternal(updatedRecord, 'HR', actorName);
  }

  return updatedRecord;
}

export function completeOnboardingRecord(onboardingId: string): OnboardingRecord | null {
  const current = getOnboardingRecords();
  const recordIdx = current.findIndex((item) => item.id === onboardingId);
  if (recordIdx < 0) return null;

  const target = current[recordIdx];
  const nowIso = new Date().toISOString();

  const completedChecklist = target.checklist.map((chk) =>
    chk.completed
      ? chk
      : {
          ...chk,
          completed: true,
          completed_at: nowIso,
        }
  );

  const updatedRecord: OnboardingRecord = {
    ...target,
    status: 'COMPLETED',
    checklist: completedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );

  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  // Keep corresponding employee in PROBATION after onboarding completion (never skip directly to ACTIVE/OFFICIAL)
  const allKnownEmployees = mergeWithRuntimeEmployees(MOCK_EMPLOYEES);
  const matchedEmp = allKnownEmployees.find(
    (emp) =>
      emp.id === target.employee_id ||
      emp.employee_code === target.employee_code
  );

  if (
    matchedEmp &&
    (matchedEmp.employment_status === 'PROBATION' ||
      matchedEmp.employment_status === 'PENDING_ONBOARD')
  ) {
    const probationEmployee: Employee = {
      ...matchedEmp,
      employment_status: 'PROBATION',
      contract_status:
        matchedEmp.contract_status === 'PENDING_SIGN'
          ? 'ACTIVE'
          : matchedEmp.contract_status,
    };
    saveRuntimeEmployee(probationEmployee);
    setUserActiveByEmployee({
      employeeId: probationEmployee.id,
      employeeCode: probationEmployee.employee_code,
      email: probationEmployee.email,
      fullName: probationEmployee.full_name,
      departmentName: probationEmployee.department_name,
      positionName: probationEmployee.position_name,
      roleCode: probationEmployee.role_code,
      isActive: true,
      targetStatus: 'ACTIVE',
      actorName: 'Hệ thống Onboarding',
    });
  } else {
    emitRuntimeUpdated();
  }

  return updatedRecord;
}

// ---------------------------------------------------------------------------
// Company Assets
// ---------------------------------------------------------------------------

function inferDefaultAssetValueVnd(category: AssetCategory): number {
  switch (category) {
    case 'LAPTOP':
      return 38000000;
    case 'MONITOR':
      return 11500000;
    case 'PERIPHERAL':
      return 4200000;
    case 'ACCESS_CARD':
    default:
      return 250000;
  }
}

export function getCompanyAssets(): CompanyAsset[] {
  const stored = readStorageArray<CompanyAsset>(STORAGE_ASSETS_KEY);
  if (stored) return stored;
  return cloneJson(MOCK_COMPANY_ASSETS);
}

export function assignCompanyAsset(
  assetId: string,
  employee: { employee_code: string; full_name: string; department_id: string; id?: string },
  assignedDate?: string
): CompanyAsset | null {
  const currentAssets = getCompanyAssets();
  const idx = currentAssets.findIndex(
    (item) => item.id === assetId || item.asset_code === assetId
  );
  if (idx < 0) return null;

  const assignedAtDate = assignedDate ?? new Date().toISOString().slice(0, 10);
  const targetAsset = currentAssets[idx];
  const updatedAsset: CompanyAsset = {
    ...targetAsset,
    status: 'ASSIGNED',
    assigned_to_code: employee.employee_code,
    assigned_to_name: employee.full_name,
    assigned_department_id: employee.department_id,
    assigned_at: assignedAtDate,
  };

  const nextAssets = currentAssets.map((item, i) =>
    i === idx ? updatedAsset : item
  );

  // Also link to matching onboarding record if present
  const onboardingRecords = getOnboardingRecords();
  const onbIdx = onboardingRecords.findIndex(
    (rec) => rec.employee_code === employee.employee_code
  );
  if (
    onbIdx >= 0 &&
    !onboardingRecords[onbIdx].assigned_asset_ids.includes(updatedAsset.id)
  ) {
    const nextOnboarding = onboardingRecords.map((rec, i) =>
      i === onbIdx
        ? {
            ...rec,
            assigned_asset_ids: [...rec.assigned_asset_ids, updatedAsset.id],
          }
        : rec
    );
    writeStorageArray(STORAGE_ONBOARDING_KEY, nextOnboarding);
  }

  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);

  // Record in EmployeeAssetAssignment store
  const matchedEmp = mergeWithRuntimeEmployees(MOCK_EMPLOYEES).find(
    (e) => e.employee_code === employee.employee_code
  );
  const currentAssignments = getEmployeeAssets();
  const existingOpenIdx = currentAssignments.findIndex(
    (a) => a.asset_id === updatedAsset.id && a.status === 'ASSIGNED'
  );
  const newAssignment: EmployeeAssetAssignment = {
    id:
      existingOpenIdx >= 0
        ? currentAssignments[existingOpenIdx].id
        : `eas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    asset_id: updatedAsset.id,
    asset_code: updatedAsset.asset_code,
    asset_name: updatedAsset.name,
    category: updatedAsset.category,
    serial_number: updatedAsset.serial_number,
    employee_id: employee.id ?? matchedEmp?.id ?? `emp-${employee.employee_code}`,
    employee_code: employee.employee_code,
    employee_name: employee.full_name,
    department_id: employee.department_id,
    assigned_date: assignedAtDate,
    assign_condition: updatedAsset.condition_note || 'Hoạt động tốt khi bàn giao',
    asset_value_vnd:
      updatedAsset.asset_value_vnd ?? inferDefaultAssetValueVnd(updatedAsset.category),
    returned_date: null,
    return_condition: null,
    penalty_amount_vnd: 0,
    status: 'ASSIGNED',
  };
  const nextAssignments =
    existingOpenIdx >= 0
      ? currentAssignments.map((item, i) => (i === existingOpenIdx ? newAssignment : item))
      : [newAssignment, ...currentAssignments];
  writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, nextAssignments);

  return updatedAsset;
}

export function revokeCompanyAsset(
  assetId: string,
  conditionNote?: string
): CompanyAsset | null {
  const currentAssets = getCompanyAssets();
  const idx = currentAssets.findIndex(
    (item) => item.id === assetId || item.asset_code === assetId
  );
  if (idx < 0) return null;

  const target = currentAssets[idx];
  const previousEmployeeCode = target.assigned_to_code;

  const updatedAsset: CompanyAsset = {
    ...target,
    status: 'AVAILABLE',
    assigned_to_code: undefined,
    assigned_to_name: undefined,
    assigned_department_id: undefined,
    assigned_at: undefined,
    condition_note: conditionNote?.trim()
      ? conditionNote.trim()
      : target.condition_note,
  };

  const nextAssets = currentAssets.map((item, i) =>
    i === idx ? updatedAsset : item
  );

  if (previousEmployeeCode) {
    const onboardingRecords = getOnboardingRecords();
    const onbIdx = onboardingRecords.findIndex(
      (rec) => rec.employee_code === previousEmployeeCode
    );
    if (
      onbIdx >= 0 &&
      onboardingRecords[onbIdx].assigned_asset_ids.includes(updatedAsset.id)
    ) {
      const nextOnboarding = onboardingRecords.map((rec, i) =>
        i === onbIdx
          ? {
              ...rec,
              assigned_asset_ids: rec.assigned_asset_ids.filter(
                (id) => id !== updatedAsset.id
              ),
            }
          : rec
      );
      writeStorageArray(STORAGE_ONBOARDING_KEY, nextOnboarding);
    }
  }

  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);

  // Sync EmployeeAssetAssignment if open
  const currentAssignments = getEmployeeAssets();
  const openIdx = currentAssignments.findIndex(
    (a) => a.asset_id === updatedAsset.id && a.status === 'ASSIGNED'
  );
  if (openIdx >= 0) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const closedAssignment: EmployeeAssetAssignment = {
      ...currentAssignments[openIdx],
      returned_date: todayIso,
      return_condition: 'GOOD',
      return_note: conditionNote?.trim() || 'Đã thu hồi về kho thiết bị',
      status: 'RETURNED',
    };
    const nextAssignments = currentAssignments.map((item, i) =>
      i === openIdx ? closedAssignment : item
    );
    writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, nextAssignments);
  }

  return updatedAsset;
}

export function createCompanyAsset(
  input: Omit<CompanyAsset, 'id'>
): CompanyAsset {
  const randSuffix = Math.random().toString(36).slice(2, 6);
  const created: CompanyAsset = {
    ...input,
    id: `ast-${Date.now()}-${randSuffix}`,
  };
  const currentAssets = getCompanyAssets();
  writeStorageArray(STORAGE_ASSETS_KEY, [created, ...currentAssets]);
  return created;
}

// ---------------------------------------------------------------------------
// Candidate -> Employee + Onboarding + Asset Assignment + Notification
// ---------------------------------------------------------------------------

function addTwoMonthsIso(startDateIso: string): string {
  const base = new Date(startDateIso);
  if (Number.isNaN(base.getTime())) {
    return '2027-01-18';
  }
  base.setMonth(base.getMonth() + 2);
  return base.toISOString().slice(0, 10);
}

function buildInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function generateNextOnboardingId(existingRecords: OnboardingRecord[]): string {
  let maxSeq = 3;
  for (const rec of existingRecords) {
    const match = /^ONB-\d{4}-(\d+)$/i.exec(rec.id.trim());
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  return `ONB-2026-${String(maxSeq + 1).padStart(3, '0')}`;
}

export function updateCandidateOfferSalary(
  candidateId: string,
  offeredSalaryVnd: number
): Candidate | null {
  const cleanId = candidateId?.trim();
  if (!cleanId) return null;
  if (
    !Number.isFinite(offeredSalaryVnd) ||
    offeredSalaryVnd < 1_000_000 ||
    offeredSalaryVnd > 1_000_000_000
  ) {
    return null;
  }
  const roundedSalary = Math.round(offeredSalaryVnd);
  const merged = mergeWithRuntimeCandidates(MOCK_CANDIDATES);
  const found = merged.find(
    (c) => c.id === cleanId || c.candidate_code === cleanId
  );
  if (!found) return null;

  const updated: Candidate = {
    ...found,
    offered_salary_vnd: roundedSalary,
  };
  saveRuntimeCandidate(updated);
  return updated;
}

export function initiateCandidateOnboarding(params: {
  candidate: Candidate;
  employeeCode: string;
  email: string;
  departmentId: string;
  departmentName: string;
  positionName: string;
  managerName: string;
  startDate: string;
  baseSalaryVnd?: number;
  grossSalaryVnd?: number;
  assetIds: string[];
  actorName: string;
}): { employee: Employee; onboarding: OnboardingRecord; invite: PreboardingInvite } {
  const nowIso = new Date().toISOString();

  // Resolve salary figures & Pre-boarding token first
  const deptRef = getRuntimeDepartments().find((d) => d.id === params.departmentId);
  const shiftCode = params.departmentId.startsWith('dept-tech')
    ? 'HC-08:30'
    : params.departmentId === 'dept-sales'
      ? 'FLEX-09:00'
      : 'HC-08:00';
  const probationEndDate = addTwoMonthsIso(params.startDate);
  const rawBaseSalary =
    params.baseSalaryVnd ??
    (params.grossSalaryVnd !== undefined
      ? Math.round((params.grossSalaryVnd * 85) / 100)
      : Math.round(
          ((params.candidate.offered_salary_vnd ??
            params.candidate.expected_salary_vnd ??
            0) *
            85) /
            100
        ));
  const estimatedOfficialSalary =
    params.grossSalaryVnd ??
    params.candidate.offered_salary_vnd ??
    Math.round(rawBaseSalary / 0.85 / 100000) * 100000;

  const existingInvites = getPreboardingInvites();
  const candEmailLower = (params.candidate.email || '').trim().toLowerCase();
  const existingInviteIdx = existingInvites.findIndex(
    (inv) =>
      (params.candidate.id && inv.candidate_id === params.candidate.id) ||
      (params.candidate.candidate_code &&
        inv.candidate_code === params.candidate.candidate_code) ||
      (candEmailLower &&
        (inv.personal_email.trim().toLowerCase() === candEmailLower ||
          inv.email?.trim().toLowerCase() === candEmailLower))
  );
  const existingInvite =
    existingInviteIdx >= 0 ? existingInvites[existingInviteIdx] : null;
  const inviteToken =
    existingInvite?.token ||
    params.candidate.preboarding_token ||
    generateSecurePreboardingToken();

  // 1. Update candidate stage to ONBOARDED with offered_salary_vnd & preboarding_token
  const updatedCandidate: Candidate = {
    ...params.candidate,
    stage: 'ONBOARDED',
    offered_salary_vnd:
      params.grossSalaryVnd ??
      params.candidate.offered_salary_vnd ??
      estimatedOfficialSalary,
    preboarding_token: inviteToken,
  };
  saveRuntimeCandidate(updatedCandidate);

  // 2. Create PROBATION employee in runtime employees (legal & bank fields left blank for candidate self-fill)
  const personalEmail = (params.candidate.email || params.email).trim();
  const candidatePhone = (params.candidate.phone || '').trim();

  const newEmployee: Employee = {
    id: `emp-rt-${Date.now()}`,
    employee_code: params.employeeCode,
    full_name: params.candidate.full_name,
    email: params.email,
    personal_email: personalEmail,
    phone: candidatePhone || '0901234567',
    gender: 'Nam',
    date_of_birth: '1998-06-15',
    national_id: '',
    tax_code: '',
    social_insurance_no: '',
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: 'pos-04',
    position_name: params.positionName,
    manager_id: deptRef?.manager_id ?? 'emp-003',
    manager_name: params.managerName,
    role_code: 'EMPLOYEE',
    join_date: params.startDate,
    employment_status: 'PROBATION',
    contract_type: 'PROBATION_2M',
    contract_start_date: params.startDate,
    contract_end_date: probationEndDate,
    contract_status: 'ACTIVE',
    base_salary_vnd: rawBaseSalary,
    probation_salary_percent: 85,
    official_salary_vnd: estimatedOfficialSalary,
    probation_end_date: probationEndDate,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 600000,
    allowance_position_vnd: 0,
    dependents_count: 0,
    bank_account_no: '',
    bank_name: '',
    work_shift_code: shiftCode,
    kpi_completion_rate: 88,
    burnout_risk_score: 18,
    burnout_risk_level: 'LOW',
    turnover_risk_score: 14,
    turnover_risk_level: 'LOW',
    ai_retention_note: `Tiếp nhận từ quy trình ATS (${params.candidate.candidate_code}), đang trong lộ trình hội nhập thử việc.`,
    avatar_initials: buildInitials(params.candidate.full_name),
    preboarding_token: inviteToken,
    preboarding_status: 'PENDING',
  };
  saveRuntimeEmployee(newEmployee);

  // 2b. Create or update PreboardingInvite in STORAGE_PREBOARDING_KEY (unlocked PENDING, empty legal/bank fields)
  const invite: PreboardingInvite = {
    id: existingInvite?.id || `pb-${Date.now()}`,
    token: inviteToken,
    preboarding_url: `/preboarding?token=${inviteToken}`,
    candidate_id: params.candidate.id,
    candidate_code: params.candidate.candidate_code,
    employee_id: newEmployee.id,
    employee_code: params.employeeCode,
    full_name: params.candidate.full_name,
    personal_email: personalEmail,
    email: personalEmail,
    phone: candidatePhone,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: newEmployee.position_id,
    position_name: params.positionName,
    position_title: params.positionName,
    manager_id: newEmployee.manager_id,
    manager_name: params.managerName,
    expected_start_date: params.startDate,
    start_date: params.startDate,
    official_salary_vnd: estimatedOfficialSalary,
    probation_salary_percent: 85,
    probation_salary_vnd: rawBaseSalary,
    status: 'PENDING',
    submitted_data: undefined,
    submitted_at: undefined,
    verified_by: undefined,
    verified_at: undefined,
    expires_at: `${addDaysIso(params.startDate, 14)}T23:59:59+07:00`,
    created_at: existingInvite?.created_at || nowIso,
  };
  const nextInvites =
    existingInviteIdx >= 0
      ? existingInvites.map((item, i) => (i === existingInviteIdx ? invite : item))
      : [invite, ...existingInvites];
  writeStorageArray(STORAGE_PREBOARDING_KEY, nextInvites);

  // Create INACTIVE SystemUserAccount awaiting IT task activation
  setUserActiveByEmployee({
    employeeId: newEmployee.id,
    employeeCode: newEmployee.employee_code,
    email: newEmployee.email,
    fullName: newEmployee.full_name,
    departmentName: newEmployee.department_name,
    positionName: newEmployee.position_name,
    roleCode: 'EMPLOYEE',
    isActive: false,
    targetStatus: 'INACTIVE',
    reason: 'Chờ bộ phận IT kích hoạt SSO trong quy trình Onboarding',
    actorName: params.actorName,
  });

  // 3. Assign selected company assets
  const assignedIds: string[] = [];
  let hasAccessCardAssigned = false;
  for (const assetId of params.assetIds) {
    const assigned = assignCompanyAsset(
      assetId,
      {
        id: newEmployee.id,
        employee_code: params.employeeCode,
        full_name: params.candidate.full_name,
        department_id: params.departmentId,
      },
      params.startDate
    );
    if (assigned) {
      assignedIds.push(assigned.id);
      if (assigned.category === 'ACCESS_CARD') {
        hasAccessCardAssigned = true;
      }
    }
  }

  // 4. Create OnboardingRecord with 8 checklist items across 4 groups
  const existingOnboarding = getOnboardingRecords();
  const onboardingId = generateNextOnboardingId(existingOnboarding);
  const hasHardwareAssigned = assignedIds.length > 0;

  const checklist: OnboardingChecklistItem[] = [
    {
      id: `${onboardingId.toLowerCase()}-it-1`,
      group: 'IT',
      task_code: 'IT_EMAIL_SSO',
      title: 'Khởi tạo email doanh nghiệp, tài khoản SSO và quyền truy cập kho lưu trữ',
      assignee_role_label: 'Bộ phận CNTT (IT Helpdesk)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-it-2`,
      group: 'IT',
      task_code: 'IT_VPN_SECURITY',
      title: 'Cấu hình VPN bảo mật, chứng chỉ thiết bị đầu cuối và công cụ chuyên môn',
      assignee_role_label: 'Bộ phận CNTT (IT Security)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-1`,
      group: 'ADMIN',
      task_code: 'ADMIN_HARDWARE',
      title: 'Bàn giao máy tính làm việc và thiết bị công tác tiêu chuẩn',
      assignee_role_label: 'Hành chính & Quản trị thiết bị',
      completed: hasHardwareAssigned,
      completed_at: hasHardwareAssigned ? nowIso : undefined,
      completed_by: hasHardwareAssigned ? params.actorName : undefined,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-2`,
      group: 'ADMIN',
      task_code: 'ADMIN_ACCESS_CARD',
      title: 'Cấp thẻ từ ra vào tòa nhà và đăng ký sinh trắc học chấm công',
      assignee_role_label: 'Hành chính Văn phòng',
      completed: hasAccessCardAssigned,
      completed_at: hasAccessCardAssigned ? nowIso : undefined,
      completed_by: hasAccessCardAssigned ? params.actorName : undefined,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-1`,
      group: 'HR',
      task_code: 'HR_PROBATION_CONTRACT',
      title: 'Ký kết hợp đồng thử việc 02 tháng và thỏa thuận bảo mật thông tin (NDA)',
      assignee_role_label: 'Phòng Nhân sự (C&B)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-2`,
      group: 'HR',
      task_code: 'HR_POLICY_TRAINING',
      title: 'Phổ biến nội quy lao động, chính sách phúc lợi và quy trình đăng ký nghỉ phép',
      assignee_role_label: 'Phòng Nhân sự (L&D)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-1`,
      group: 'MANAGER',
      task_code: 'MGR_ASSIGN_MENTOR',
      title: 'Giới thiệu nhân sự mới với đội ngũ và phân công người đồng hành (Buddy)',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-2`,
      group: 'MANAGER',
      task_code: 'MGR_PROBATION_GOALS',
      title: 'Thống nhất mục tiêu công việc và tiêu chí đánh giá KPI 60 ngày thử việc',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
  ];

  const newOnboarding: OnboardingRecord = {
    id: onboardingId,
    candidate_id: params.candidate.id,
    candidate_code: params.candidate.candidate_code,
    employee_id: newEmployee.id,
    employee_code: params.employeeCode,
    full_name: params.candidate.full_name,
    email: params.email,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_name: params.positionName,
    manager_name: params.managerName,
    start_date: params.startDate,
    status: 'IN_PROGRESS',
    checklist,
    assigned_asset_ids: assignedIds,
    created_at: nowIso,
    probation_salary_percent: 85,
    official_salary_vnd: estimatedOfficialSalary,
    probation_end_date: probationEndDate,
    preboarding_token: inviteToken,
  };

  saveOnboardingRecord(newOnboarding);

  // 5. Notify DEPT_MANAGER (scoped to departmentId), HR_MANAGER, SUPER_ADMIN, CANDIDATE and employee/candidate codes
  const assetSummary =
    assignedIds.length > 0
      ? `, đã bàn giao ${assignedIds.length} thiết bị công tác`
      : '';
  const targetCodes = Array.from(
    new Set([params.employeeCode, params.candidate.candidate_code].filter(Boolean))
  );

  pushNotification({
    title: `Khởi tạo Onboarding nhân sự mới: ${params.candidate.full_name}`,
    message: `Hồ sơ ${onboardingId} (${params.employeeCode} - ${params.positionName}, ${params.departmentName}${assetSummary}) đã mở lộ trình 8 hạng mục hội nhập và cổng Pre-boarding.`,
    category: 'ONBOARDING',
    target_roles: ['DEPT_MANAGER', 'HR_MANAGER', 'SUPER_ADMIN', 'CANDIDATE'],
    target_department_id: params.departmentId,
    target_employee_codes: targetCodes,
    nav_id: 'onboarding',
    entity_id: onboardingId,
    sub_tab: 'progress',
  });

  return {
    employee: newEmployee,
    onboarding: newOnboarding,
    invite,
  };
}

// ---------------------------------------------------------------------------
// Department Recruitment Requests (Đề xuất Tuyển dụng từ các Phòng ban)
// ---------------------------------------------------------------------------

const INITIAL_DEPT_REQUESTS: DepartmentRecruitmentRequest[] = [
  {
    id: 'req-001',
    request_code: 'YC-2026-SWE02',
    department_id: 'dept-tech-swe',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_title: 'Senior Backend Engineer (Go / Node.js)',
    level: 'Senior',
    quantity: 2,
    urgency: 'URGENT',
    reason: 'Mở rộng quy mô hệ thống Microservices & kiến trúc chịu tải 50.000 RPS',
    expected_salary_range: '34.000.000 - 48.000.000 đ',
    deadline_date: '2026-12-15',
    requested_by_name: 'Lê Hoàng Nam (Trưởng phòng)',
    requested_date: '2026-11-10',
    status: 'APPROVED',
    approved_by_name: 'Trần Thị Bích Ngọc (Trưởng phòng Nhân sự)',
    approved_date: '2026-11-12',
    job_code_created: 'JD-2026-SWE04',
  },
  {
    id: 'req-002',
    request_code: 'YC-2026-AI02',
    department_id: 'dept-tech-data',
    department_name: 'Phòng Dữ liệu & AI',
    position_title: 'Kỹ sư Mô hình Ngôn ngữ & RAG (Applied AI Engineer)',
    level: 'Mid - Senior',
    quantity: 1,
    urgency: 'URGENT',
    reason: 'Triển khai dự án AI Agent Copilot doanh nghiệp & trích xuất thông minh CV ứng viên',
    expected_salary_range: '36.000.000 - 52.000.000 đ',
    deadline_date: '2026-12-20',
    requested_by_name: 'Vũ Thị Mai Phương (Trưởng phòng)',
    requested_date: '2026-11-12',
    status: 'APPROVED',
    approved_by_name: 'Trần Thị Bích Ngọc (Trưởng phòng Nhân sự)',
    approved_date: '2026-11-14',
    job_code_created: 'JD-2026-AI02',
  },
  {
    id: 'req-003',
    request_code: 'YC-2026-SALES03',
    department_id: 'dept-sales',
    department_name: 'Khối Kinh doanh',
    position_title: 'Chuyên viên Tư vấn Giải pháp B2B SaaS',
    level: 'Mid',
    quantity: 3,
    urgency: 'NORMAL',
    reason: 'Đẩy mạnh tiếp cận thị trường khách hàng doanh nghiệp sản xuất và bán lẻ khu vực phía Bắc',
    expected_salary_range: '18.000.000 - 30.000.000 đ',
    deadline_date: '2026-12-30',
    requested_by_name: 'Phạm Quang Minh (Trưởng khối)',
    requested_date: '2026-11-18',
    status: 'PENDING',
  },
  {
    id: 'req-004',
    request_code: 'YC-2026-HR02',
    department_id: 'dept-hr',
    department_name: 'Phòng Nhân sự & Hành chính',
    position_title: 'Chuyên viên Đào tạo & Phát triển Tổ chức (L&D)',
    level: 'Mid',
    quantity: 1,
    urgency: 'NORMAL',
    reason: 'Xây dựng khung năng lực và lộ trình đào tạo nội bộ cho toàn thể nhân sự năm 2027',
    expected_salary_range: '16.000.000 - 24.000.000 đ',
    deadline_date: '2026-12-25',
    requested_by_name: 'Trần Thị Bích Ngọc (Trưởng phòng)',
    requested_date: '2026-11-19',
    status: 'PENDING',
  },
];

export function getDepartmentRecruitmentRequests(): DepartmentRecruitmentRequest[] {
  const stored = readStorageArray<DepartmentRecruitmentRequest>(STORAGE_DEPT_REQUESTS_KEY);
  if (stored) return stored;
  return cloneJson(INITIAL_DEPT_REQUESTS);
}

export function saveDepartmentRecruitmentRequest(req: DepartmentRecruitmentRequest): void {
  const current = getDepartmentRecruitmentRequests();
  const exists = current.some((r) => r.id === req.id);
  const updated = exists ? current.map((r) => (r.id === req.id ? req : r)) : [req, ...current];
  writeStorageArray(STORAGE_DEPT_REQUESTS_KEY, updated);
}

export function createDepartmentRecruitmentRequest(
  input: Omit<DepartmentRecruitmentRequest, 'id' | 'request_code' | 'requested_date' | 'status'>
): DepartmentRecruitmentRequest {
  const current = getDepartmentRecruitmentRequests();
  const nextNum = current.length + 1;
  const requestCode = `YC-2026-${String(nextNum).padStart(3, '0')}`;
  const newReq: DepartmentRecruitmentRequest = {
    ...input,
    id: `req-${Date.now()}`,
    request_code: requestCode,
    requested_date: new Date().toISOString().slice(0, 10),
    status: 'PENDING',
  };

  saveDepartmentRecruitmentRequest(newReq);

  // Real-time notification to HR Manager and Director
  pushNotification({
    title: `Đề xuất tuyển dụng mới: ${newReq.position_title}`,
    message: `${newReq.requested_by_name} (${newReq.department_name}) vừa gửi yêu cầu tuyển ${newReq.quantity} nhân sự. Mức độ: ${newReq.urgency === 'URGENT' ? 'Tuyển gấp' : 'Bình thường'}.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'SUPER_ADMIN', 'DIRECTOR'],
    target_department_id: newReq.department_id,
    nav_id: 'recruitment',
    entity_id: newReq.id,
  });

  return newReq;
}

export function approveDepartmentRecruitmentRequest(
  requestId: string,
  approverName: string
): { request: DepartmentRecruitmentRequest; job: JobPosting } | null {
  const requests = getDepartmentRecruitmentRequests();
  const targetReq = requests.find((r) => r.id === requestId);
  if (!targetReq) return null;

  const currentJobs = getJobPostings(MOCK_JOB_POSTINGS);
  const nextJobNum = currentJobs.length + 1;
  const newJobCode = `JD-2026-REQ${String(nextJobNum).padStart(2, '0')}`;

  const approvedReq: DepartmentRecruitmentRequest = {
    ...targetReq,
    status: 'APPROVED',
    approved_by_name: approverName,
    approved_date: new Date().toISOString().slice(0, 10),
    job_code_created: newJobCode,
  };
  saveDepartmentRecruitmentRequest(approvedReq);

  // Auto-generate Job Posting in "Tin tuyển dụng đang mở"
  const createdJob: JobPosting = {
    id: `job-${Date.now()}`,
    job_code: newJobCode,
    title: targetReq.position_title,
    department_id: targetReq.department_id,
    department_name: targetReq.department_name,
    level: targetReq.level,
    headcount_target: targetReq.quantity,
    hired_count: 0,
    applicants_count: 0,
    salary_range_min_vnd: 25000000,
    salary_range_max_vnd: 45000000,
    status: targetReq.urgency === 'URGENT' ? 'URGENT' : 'OPEN',
    hiring_manager_name: targetReq.requested_by_name.split(' (')[0],
    published_date: new Date().toISOString().slice(0, 10),
    closing_date: targetReq.deadline_date || '2026-12-30',
    location: 'Hà Nội / Hybrid',
    work_mode: 'Hybrid',
    employment_type: 'Toàn thời gian',
    overview: `Theo đề xuất tuyển dụng ${targetReq.request_code} từ ${targetReq.department_name}: ${targetReq.reason}.`,
    responsibilities: [
      `Triển khai các nhiệm vụ chuyên môn theo chỉ tiêu của ${targetReq.department_name}.`,
      'Đảm bảo chất lượng công việc, hoàn thành KPI đúng tiến độ.',
      'Phối hợp với các thành viên trong đội ngũ thực hiện mục tiêu chung.',
    ],
    requirements: [
      `Kinh nghiệm thực tế ở cấp bậc ${targetReq.level} trong lĩnh vực liên quan.`,
      'Tư duy logic, giải quyết vấn đề tốt và tinh thần làm việc trách nhiệm.',
      'Khả năng thích ứng nhanh với môi trường công nghệ doanh nghiệp.',
    ],
    benefits: [
      `Thu nhập cạnh tranh theo khung đề xuất ${targetReq.expected_salary_range}.`,
      'Trang bị MacBook Pro M-series làm việc, bảo hiểm sức khỏe VIP.',
      'Lộ trình thăng tiến minh bạch tại Tổng Công ty Lạc Việt.',
    ],
  };
  saveRuntimeJob(createdJob);

  // Real-time notification to the Department Manager
  pushNotification({
    title: `Đề xuất tuyển dụng đã duyệt: ${targetReq.request_code}`,
    message: `${approverName} đã phê duyệt đề xuất và mở tin tuyển dụng ${newJobCode} (${targetReq.position_title}) trên toàn hệ thống.`,
    category: 'ONBOARDING',
    target_roles: ['DEPT_MANAGER', 'SUPER_ADMIN'],
    target_department_id: targetReq.department_id,
    nav_id: 'recruitment',
  });

  return { request: approvedReq, job: createdJob };
}

export function rejectDepartmentRecruitmentRequest(
  requestId: string,
  reason: string,
  rejectorName: string
): DepartmentRecruitmentRequest | null {
  const requests = getDepartmentRecruitmentRequests();
  const targetReq = requests.find((r) => r.id === requestId);
  if (!targetReq) return null;

  const rejectedReq: DepartmentRecruitmentRequest = {
    ...targetReq,
    status: 'REJECTED',
    rejection_reason: reason || 'Chưa phù hợp với ngân sách định biên hiện tại',
    approved_by_name: rejectorName,
    approved_date: new Date().toISOString().slice(0, 10),
  };
  saveDepartmentRecruitmentRequest(rejectedReq);

  // Real-time notification to the Department Manager
  pushNotification({
    title: `Từ chối đề xuất tuyển dụng: ${targetReq.request_code}`,
    message: `Đề xuất vị trí ${targetReq.position_title} chưa được phê duyệt. Lý do: ${rejectedReq.rejection_reason}`,
    category: 'ONBOARDING',
    target_roles: ['DEPT_MANAGER'],
    target_department_id: targetReq.department_id,
    nav_id: 'recruitment',
  });

  return rejectedReq;
}

// ---------------------------------------------------------------------------
// Candidate Stage Real-Time Notification
// ---------------------------------------------------------------------------

export function notifyCandidateStageChange(
  candidate: Candidate,
  targetStage: string,
  stageLabel: string,
  actorName: string
): void {
  // Push notification for candidate
  pushNotification({
    title: `Cập nhật tiến độ hồ sơ: ${stageLabel}`,
    message: `Chào ${candidate.full_name}, hồ sơ ứng tuyển vị trí ${candidate.job_title} của bạn đã chuyển sang bước: "${stageLabel}".`,
    category: 'ONBOARDING',
    target_roles: ['CANDIDATE', 'HR_MANAGER'],
    target_employee_codes: [candidate.candidate_code],
    nav_id: 'candidate',
  });
}

// ---------------------------------------------------------------------------
// Shared Helpers: Runtime Departments & Employees
// ---------------------------------------------------------------------------

function addDaysIso(dateIso: string, days: number): string {
  const parts = dateIso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return utc.toISOString().slice(0, 10);
}

function addMonthsIso(dateIso: string, months: number): string {
  const parts = dateIso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return '2027-11-30';
  }
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1 + months, parts[2] - 1));
  return utc.toISOString().slice(0, 10);
}

function diffDaysIso(fromIso: string, toIso: string): number {
  const f = fromIso.slice(0, 10).split('-').map(Number);
  const t = toIso.slice(0, 10).split('-').map(Number);
  if (f.length !== 3 || t.length !== 3) return 0;
  const fromUtc = Date.UTC(f[0], f[1] - 1, f[2]);
  const toUtc = Date.UTC(t[0], t[1] - 1, t[2]);
  return Math.round((toUtc - fromUtc) / 86400000);
}

function normalizeEmailSlug(fullName: string): string {
  const tokens = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return 'nhanvien.moi';
  if (tokens.length === 1) return tokens[0];
  return `${tokens[tokens.length - 1]}.${tokens[0]}`;
}

export function getRuntimeDepartments(): Department[] {
  const stored = readStorageArray<Department>(STORAGE_DEPARTMENTS_KEY);
  if (!stored || stored.length === 0) return cloneJson(MOCK_DEPARTMENTS);
  return MOCK_DEPARTMENTS.map((base) => {
    const override = stored.find(
      (rt) => rt.id === base.id || rt.department_code === base.department_code
    );
    return override ?? base;
  });
}

export function saveRuntimeDepartment(dept: Department): Department {
  const current = readStorageArray<Department>(STORAGE_DEPARTMENTS_KEY) ?? [];
  const idx = current.findIndex(
    (d) => d.id === dept.id || d.department_code === dept.department_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? dept : item))
      : [dept, ...current];
  writeStorageArray(STORAGE_DEPARTMENTS_KEY, updated);
  return dept;
}

export function getAllRuntimeEmployees(): Employee[] {
  return mergeWithRuntimeEmployees(MOCK_EMPLOYEES);
}

// ---------------------------------------------------------------------------
// Stage 1A: SystemUserAccount Store (is_active + account_status Sync)
// ---------------------------------------------------------------------------

function normalizeSystemUser(user: SystemUserAccount): SystemUserAccount {
  const isActive =
    typeof user.is_active === 'boolean'
      ? user.is_active
      : user.account_status === 'ACTIVE';
  const accountStatus: SystemUserAccount['account_status'] = isActive
    ? 'ACTIVE'
    : user.account_status === 'ACTIVE'
      ? 'LOCKED'
      : user.account_status;
  return {
    ...user,
    is_active: isActive,
    account_status: accountStatus,
  };
}

export function getSystemUsers(
  baseUsers: SystemUserAccount[] = MOCK_SYSTEM_USERS
): SystemUserAccount[] {
  const runtimeUsers = readStorageArray<SystemUserAccount>(STORAGE_USERS_KEY) ?? [];
  if (runtimeUsers.length === 0) {
    return baseUsers.map(normalizeSystemUser);
  }

  const baseIds = new Set(baseUsers.map((u) => u.id));
  const baseEmpCodes = new Set(baseUsers.map((u) => u.employee_code));

  const mergedBase = baseUsers.map((baseItem) => {
    const override = runtimeUsers.find(
      (rt) =>
        rt.id === baseItem.id ||
        rt.employee_code === baseItem.employee_code ||
        rt.email.toLowerCase() === baseItem.email.toLowerCase()
    );
    return normalizeSystemUser(override ?? baseItem);
  });

  const brandNew = runtimeUsers
    .filter((rt) => !baseIds.has(rt.id) && !baseEmpCodes.has(rt.employee_code))
    .map(normalizeSystemUser);

  return [...brandNew, ...mergedBase];
}

export function saveSystemUser(user: SystemUserAccount): SystemUserAccount {
  const normalized = normalizeSystemUser(user);
  const current = readStorageArray<SystemUserAccount>(STORAGE_USERS_KEY) ?? [];
  const idx = current.findIndex(
    (u) =>
      u.id === normalized.id ||
      u.employee_code === normalized.employee_code ||
      u.email.toLowerCase() === normalized.email.toLowerCase()
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? normalized : item))
      : [normalized, ...current];
  writeStorageArray(STORAGE_USERS_KEY, updated);
  return normalized;
}

const INTERNAL_CORPORATE_DOMAINS = new Set([
  'lacviethrm.vn',
  'hrm-enterprise.vn',
]);

function emailsMatchInternalAlias(
  emailA: string | undefined | null,
  emailB: string | undefined | null
): boolean {
  const a = emailA?.trim().toLowerCase();
  const b = emailB?.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const atA = a.lastIndexOf('@');
  const atB = b.lastIndexOf('@');
  if (atA <= 0 || atB <= 0) return false;
  const localA = a.slice(0, atA);
  const domainA = a.slice(atA + 1);
  const localB = b.slice(0, atB);
  const domainB = b.slice(atB + 1);
  return (
    localA === localB &&
    INTERNAL_CORPORATE_DOMAINS.has(domainA) &&
    INTERNAL_CORPORATE_DOMAINS.has(domainB)
  );
}

export function setUserActiveByEmployee(params: {
  employeeId?: string;
  employeeCode: string;
  email?: string;
  fullName?: string;
  departmentName?: string;
  positionName?: string;
  roleCode?: RoleCode;
  isActive: boolean;
  targetStatus?: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  reason?: string;
  actorName?: string;
}): SystemUserAccount {
  const allUsers = getSystemUsers();
  const matchedEmp = getAllRuntimeEmployees().find(
    (e) =>
      (params.employeeId && e.id === params.employeeId) ||
      e.employee_code === params.employeeCode
  );
  const emailToUse =
    params.email ||
    matchedEmp?.email ||
    `${normalizeEmailSlug(params.fullName || matchedEmp?.full_name || params.employeeCode)}@hrm-enterprise.vn`;

  const existing = allUsers.find(
    (u) =>
      u.employee_code === params.employeeCode ||
      emailsMatchInternalAlias(u.email, emailToUse)
  );

  const nextStatus: SystemUserAccount['account_status'] = params.isActive
    ? 'ACTIVE'
    : params.targetStatus ?? 'LOCKED';

  const userRecord: SystemUserAccount = existing
    ? {
        ...existing,
        employee_id: params.employeeId ?? existing.employee_id ?? matchedEmp?.id,
        email: params.email ?? existing.email,
        full_name: params.fullName ?? matchedEmp?.full_name ?? existing.full_name,
        department_name:
          params.departmentName ??
          matchedEmp?.department_name ??
          existing.department_name,
        position_name:
          params.positionName ?? matchedEmp?.position_name ?? existing.position_name,
        role_code: params.roleCode ?? matchedEmp?.role_code ?? existing.role_code,
        is_active: params.isActive,
        account_status: nextStatus,
        locked_reason: params.isActive ? undefined : params.reason,
      }
    : {
        id: `usr-rt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        user_code: `USR-${params.employeeCode.slice(-3)}`,
        employee_id: params.employeeId ?? matchedEmp?.id,
        employee_code: params.employeeCode,
        full_name: params.fullName ?? matchedEmp?.full_name ?? params.employeeCode,
        email: emailToUse,
        department_name:
          params.departmentName ?? matchedEmp?.department_name ?? 'Khối Công nghệ',
        position_name:
          params.positionName ?? matchedEmp?.position_name ?? 'Chuyên viên',
        role_code: params.roleCode ?? matchedEmp?.role_code ?? 'EMPLOYEE',
        mfa_enabled: ['SUPER_ADMIN', 'DIRECTOR', 'HR_MANAGER'].includes(
          params.roleCode ?? matchedEmp?.role_code ?? 'EMPLOYEE'
        ),
        account_status: nextStatus,
        is_active: params.isActive,
        locked_reason: params.isActive ? undefined : params.reason,
        last_login_at: 'Chưa đăng nhập',
        last_login_ip: '-',
      };

  const saved = saveSystemUser(userRecord);

  if (params.actorName) {
    recordAuditLog({
      actor_name: params.actorName,
      actor_code: 'SYS-IAM',
      actor_role: 'SUPER_ADMIN',
      action: params.isActive ? 'ACTIVATE_USER' : 'LOCK_USER',
      target: `${saved.employee_code} (${saved.email})`,
      detail: params.isActive
        ? `Kích hoạt tài khoản hệ thống (${saved.account_status}, is_active=true).`
        : `Khóa/tạm ngưng tài khoản (${saved.account_status}, is_active=false). ${params.reason ?? ''}`.trim(),
      status: params.isActive ? 'SUCCESS' : 'WARNING',
    });
  }

  return saved;
}

export function findSystemUserForLogin(emailOrCode: string): {
  user: SystemUserAccount | null;
  employee: Employee | null;
  canLogin: boolean;
  blockReason?: string;
} {
  const needle = emailOrCode.trim().toLowerCase();
  if (!needle) {
    return { user: null, employee: null, canLogin: true };
  }

  const allUsers = getSystemUsers();
  const allEmployees = getAllRuntimeEmployees();

  const findUserForEmployee = (emp: Employee): SystemUserAccount | null =>
    allUsers.find(
      (u) =>
        u.employee_code === emp.employee_code ||
        (Boolean(u.employee_id) && u.employee_id === emp.id) ||
        emailsMatchInternalAlias(u.email, emp.email)
    ) ?? null;

  const findEmployeeForUser = (usr: SystemUserAccount): Employee | null =>
    allEmployees.find(
      (e) =>
        e.employee_code === usr.employee_code ||
        (Boolean(usr.employee_id) && e.id === usr.employee_id)
    ) ?? null;

  // Match exact employee_code or exact email (only allowing @lacviethrm.vn <-> @hrm-enterprise.vn corporate alias)
  let user =
    allUsers.find(
      (u) =>
        u.employee_code.toLowerCase() === needle ||
        emailsMatchInternalAlias(u.email, needle)
    ) ?? null;

  let employee =
    (user ? findEmployeeForUser(user) : null) ??
    allEmployees.find(
      (e) =>
        e.employee_code.toLowerCase() === needle ||
        emailsMatchInternalAlias(e.email, needle) ||
        (Boolean(e.personal_email) &&
          e.personal_email!.trim().toLowerCase() === needle)
    ) ??
    null;

  // Map back from matched employee (e.g. exact personal_email match) to SystemUserAccount
  if (!user && employee) {
    user = findUserForEmployee(employee);
  }

  if (employee?.employment_status === 'RESIGNED') {
    return {
      user,
      employee,
      canLogin: false,
      blockReason:
        'Tài khoản đã bị thu hồi quyền truy cập do nhân sự đã hoàn tất thủ tục nghỉ việc (RESIGNED).',
    };
  }

  if (user && (!user.is_active || user.account_status !== 'ACTIVE')) {
    return {
      user,
      employee,
      canLogin: false,
      blockReason:
        user.account_status === 'INACTIVE' ||
        employee?.employment_status === 'PENDING_ONBOARD'
          ? 'Tài khoản nhân sự mới đang ở trạng thái chờ bộ phận CNTT (IT) kích hoạt SSO trong quy trình Onboarding.'
          : user.locked_reason ||
            'Tài khoản hiện đang bị khóa bởi Quản trị viên hệ thống.',
    };
  }

  return { user, employee, canLogin: true };
}

export function activateEmployeeAccountIfPreboardingVerified(
  identifierOrEmployeeCode: string
): SystemUserAccount | null {
  const needle = identifierOrEmployeeCode.trim().toLowerCase();
  if (!needle) return null;

  const verifiedInvites = getPreboardingInvites().filter(
    (inv) => inv.status === 'VERIFIED'
  );
  const verifiedInvite =
    verifiedInvites.find((inv) => {
      if (
        inv.id.toLowerCase() === needle ||
        inv.token.toLowerCase() === needle ||
        inv.employee_code.toLowerCase() === needle ||
        (Boolean(inv.employee_id) && inv.employee_id!.toLowerCase() === needle) ||
        inv.personal_email.trim().toLowerCase() === needle
      ) {
        return true;
      }
      const linkedEmp = findLinkedEmployeeForPreboarding(inv);
      if (!linkedEmp) return false;
      return (
        linkedEmp.employee_code.toLowerCase() === needle ||
        linkedEmp.id.toLowerCase() === needle ||
        emailsMatchInternalAlias(linkedEmp.email, needle) ||
        (Boolean(linkedEmp.personal_email) &&
          linkedEmp.personal_email!.trim().toLowerCase() === needle)
      );
    }) ?? null;

  if (!verifiedInvite) return null;

  const matchedEmp = findLinkedEmployeeForPreboarding(verifiedInvite);
  if (!matchedEmp || matchedEmp.employment_status === 'RESIGNED') {
    return null;
  }

  const allUsers = getSystemUsers();
  const existingUser =
    allUsers.find(
      (u) =>
        u.employee_code === matchedEmp.employee_code ||
        (Boolean(u.employee_id) && u.employee_id === matchedEmp.id) ||
        emailsMatchInternalAlias(u.email, matchedEmp.email)
    ) ?? null;

  if (existingUser?.account_status === 'LOCKED') {
    return null;
  }

  if (
    existingUser &&
    existingUser.is_active &&
    existingUser.account_status === 'ACTIVE' &&
    existingUser.role_code !== 'CANDIDATE'
  ) {
    return existingUser;
  }

  return setUserActiveByEmployee({
    employeeId: matchedEmp.id,
    employeeCode: matchedEmp.employee_code,
    email: matchedEmp.email,
    fullName: matchedEmp.full_name,
    departmentName: matchedEmp.department_name,
    positionName: matchedEmp.position_name,
    roleCode: 'EMPLOYEE',
    isActive: true,
    targetStatus: 'ACTIVE',
    actorName: verifiedInvite.verified_by || 'HR Manager',
  });
}

// ---------------------------------------------------------------------------
// Stage 1B: Employment Contracts Store & Employee Asset Assignments Store
// ---------------------------------------------------------------------------

export function getContracts(
  baseContracts: EmploymentContract[] = MOCK_CONTRACTS
): EmploymentContract[] {
  const runtimeList = readStorageArray<EmploymentContract>(STORAGE_CONTRACTS_KEY) ?? [];
  if (runtimeList.length === 0) return cloneJson(baseContracts);

  const baseIds = new Set(baseContracts.map((c) => c.id));
  const baseNumbers = new Set(baseContracts.map((c) => c.contract_number));

  const mergedBase = baseContracts.map((baseItem) => {
    const override = runtimeList.find(
      (rt) =>
        rt.id === baseItem.id || rt.contract_number === baseItem.contract_number
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseNumbers.has(rt.contract_number)
  );

  return [...brandNew, ...mergedBase];
}

export function saveContract(contract: EmploymentContract): EmploymentContract {
  const current = readStorageArray<EmploymentContract>(STORAGE_CONTRACTS_KEY) ?? [];
  const idx = current.findIndex(
    (c) =>
      c.id === contract.id || c.contract_number === contract.contract_number
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? contract : item))
      : [contract, ...current];
  writeStorageArray(STORAGE_CONTRACTS_KEY, updated);
  return contract;
}

function buildSeedEmployeeAssets(): EmployeeAssetAssignment[] {
  return MOCK_COMPANY_ASSETS.filter(
    (a) => a.status === 'ASSIGNED' && a.assigned_to_code
  ).map((asset, index) => {
    const matchedEmp = MOCK_EMPLOYEES.find(
      (e) => e.employee_code === asset.assigned_to_code
    );
    return {
      id: `eas-seed-${String(index + 1).padStart(3, '0')}`,
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      category: asset.category,
      serial_number: asset.serial_number,
      employee_id: matchedEmp?.id ?? `emp-${asset.assigned_to_code}`,
      employee_code: asset.assigned_to_code || '',
      employee_name: asset.assigned_to_name || matchedEmp?.full_name || '',
      department_id:
        asset.assigned_department_id || matchedEmp?.department_id || 'dept-tech',
      assigned_date: asset.assigned_at || '2026-01-10',
      assign_condition: asset.condition_note,
      asset_value_vnd: inferDefaultAssetValueVnd(asset.category),
      returned_date: null,
      return_condition: null,
      penalty_amount_vnd: 0,
      status: 'ASSIGNED',
    };
  });
}

export function getEmployeeAssets(
  employeeCodeOrId?: string
): EmployeeAssetAssignment[] {
  const stored = readStorageArray<EmployeeAssetAssignment>(
    STORAGE_EMPLOYEE_ASSETS_KEY
  );
  const list = stored ?? buildSeedEmployeeAssets();
  if (!employeeCodeOrId) return list;
  return list.filter(
    (item) =>
      item.employee_code === employeeCodeOrId ||
      item.employee_id === employeeCodeOrId
  );
}

export function assignAssetToEmployee(params: {
  assetId: string;
  employeeId?: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  assignedDate?: string;
  assignCondition?: string;
  assetValueVnd?: number;
  actorName?: string;
}): { asset: CompanyAsset; assignment: EmployeeAssetAssignment } | null {
  const assignedAsset = assignCompanyAsset(
    params.assetId,
    {
      id: params.employeeId,
      employee_code: params.employeeCode,
      full_name: params.employeeName,
      department_id: params.departmentId,
    },
    params.assignedDate
  );
  if (!assignedAsset) return null;

  const allAssignments = getEmployeeAssets();
  const targetIdx = allAssignments.findIndex(
    (a) => a.asset_id === assignedAsset.id && a.status === 'ASSIGNED'
  );
  if (targetIdx < 0) return null;

  const enriched: EmployeeAssetAssignment = {
    ...allAssignments[targetIdx],
    assign_condition:
      params.assignCondition?.trim() || allAssignments[targetIdx].assign_condition,
    asset_value_vnd:
      params.assetValueVnd ?? allAssignments[targetIdx].asset_value_vnd,
  };
  const updated = allAssignments.map((item, i) =>
    i === targetIdx ? enriched : item
  );
  writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, updated);

  return { asset: assignedAsset, assignment: enriched };
}

export function returnEmployeeAssetWithPenalty(params: {
  assetId: string;
  returnCondition: AssetConditionStatus;
  penaltyAmountVnd?: number;
  returnNote?: string;
  returnedDate?: string;
  actorName?: string;
}): { asset: CompanyAsset; assignment: EmployeeAssetAssignment | null } | null {
  const currentAssets = getCompanyAssets();
  const assetIdx = currentAssets.findIndex(
    (a) => a.id === params.assetId || a.asset_code === params.assetId
  );
  if (assetIdx < 0) return null;

  const targetAsset = currentAssets[assetIdx];
  const returnedDate = params.returnedDate ?? new Date().toISOString().slice(0, 10);
  const penalty = Math.max(0, Math.round(params.penaltyAmountVnd ?? 0));

  const nextAssetStatus: CompanyAsset['status'] =
    params.returnCondition === 'DAMAGED' || params.returnCondition === 'LOST'
      ? 'MAINTENANCE'
      : 'AVAILABLE';

  const updatedAsset: CompanyAsset = {
    ...targetAsset,
    status: nextAssetStatus,
    assigned_to_code: undefined,
    assigned_to_name: undefined,
    assigned_department_id: undefined,
    assigned_at: undefined,
    condition_note:
      params.returnNote?.trim() ||
      (params.returnCondition === 'LOST'
        ? `Báo mất thiết bị ngày ${returnedDate} (Khấu trừ đền bù: ${penalty.toLocaleString('vi-VN')} đ)`
        : params.returnCondition === 'DAMAGED'
          ? `Thu hồi có hư hỏng ngày ${returnedDate} (Phí khắc phục: ${penalty.toLocaleString('vi-VN')} đ)`
          : `Đã thu hồi nguyên vẹn ngày ${returnedDate}`),
  };

  const nextAssets = currentAssets.map((item, i) =>
    i === assetIdx ? updatedAsset : item
  );
  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);

  const allAssignments = getEmployeeAssets();
  const assignIdx = allAssignments.findIndex(
    (a) => a.asset_id === targetAsset.id && a.status === 'ASSIGNED'
  );
  let closedAssignment: EmployeeAssetAssignment | null = null;
  if (assignIdx >= 0) {
    closedAssignment = {
      ...allAssignments[assignIdx],
      returned_date: returnedDate,
      return_condition: params.returnCondition,
      return_note: params.returnNote?.trim() || updatedAsset.condition_note,
      penalty_amount_vnd: penalty,
      status: params.returnCondition === 'LOST' ? 'LOST' : 'RETURNED',
    };
    const nextAssignments = allAssignments.map((item, i) =>
      i === assignIdx ? (closedAssignment as EmployeeAssetAssignment) : item
    );
    writeStorageArray(STORAGE_EMPLOYEE_ASSETS_KEY, nextAssignments);
  }

  return { asset: updatedAsset, assignment: closedAssignment };
}

// ---------------------------------------------------------------------------
// Stage 1C: Pre-boarding Invite Store & Department Task Auto Side-Effects
// ---------------------------------------------------------------------------

const SEED_PREBOARDING_INVITES: PreboardingInvite[] = [
  {
    id: 'pb-2026-001',
    token: 'pb-demo-2026-hrm01',
    preboarding_url: '/preboarding?token=pb-demo-2026-hrm01',
    candidate_id: 'cand-001',
    candidate_code: 'UV-2026-101',
    employee_id: 'emp-pb-030',
    employee_code: 'NV-2026-030',
    full_name: 'Lê Minh Khôi',
    personal_email: 'khoi.le.dev@gmail.com',
    phone: '0909334455',
    department_id: 'dept-tech-swe',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_id: 'pos-04',
    position_name: 'Senior Backend Engineer (Go / Node.js)',
    manager_id: 'emp-003',
    manager_name: 'Lê Hoàng Nam',
    expected_start_date: '2026-12-01',
    official_salary_vnd: 32000000,
    probation_salary_percent: 85,
    probation_salary_vnd: 27200000,
    status: 'PENDING',
    expires_at: '2026-12-15T23:59:59+07:00',
    created_at: '2026-11-20T09:00:00+07:00',
  },
];

export function getPreboardingInvites(): PreboardingInvite[] {
  const stored = readStorageArray<PreboardingInvite>(STORAGE_PREBOARDING_KEY);
  if (stored) return stored;
  return cloneJson(SEED_PREBOARDING_INVITES);
}

export function getPreboardingByToken(token: string): PreboardingInvite | null {
  const clean = token.trim();
  if (!clean) return null;
  const all = getPreboardingInvites();
  return all.find((item) => item.token === clean || item.id === clean) ?? null;
}

function generateSecurePreboardingToken(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `pb-${hex}`;
  }
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `pb-${cryptoObj.randomUUID().replace(/-/g, '')}`;
  }
  throw new Error('CSPRNG không khả dụng để tạo token Pre-boarding an toàn.');
}

export function createPreboardingInvite(params: {
  candidate?: Candidate;
  fullName?: string;
  personalEmail?: string;
  phone?: string;
  departmentId: string;
  departmentName: string;
  positionId?: string;
  positionName: string;
  managerId?: string | null;
  managerName: string;
  expectedStartDate: string;
  officialSalaryVnd: number;
  probationSalaryPercent?: number;
  actorName: string;
}): {
  invite: PreboardingInvite;
  employee: Employee;
  user: SystemUserAccount;
  onboarding: OnboardingRecord;
} {
  const nowIso = new Date().toISOString();
  const fullName = (
    params.fullName ||
    params.candidate?.full_name ||
    'Nhân sự mới'
  ).trim();
  const personalEmail = (
    params.personalEmail ||
    params.candidate?.email ||
    ''
  ).trim();
  const phone = (params.phone || params.candidate?.phone || '0901234567').trim();

  const personalEmailLower = personalEmail.toLowerCase();
  const hasCandidateId = Boolean(params.candidate?.id);
  const hasCandidateCode = Boolean(params.candidate?.candidate_code);
  const hasCandidateIdentity = hasCandidateId || hasCandidateCode;
  const matchingInvites = getPreboardingInvites().filter((inv) => {
    if (inv.status === 'EXPIRED') {
      return false;
    }
    if (hasCandidateIdentity) {
      if (hasCandidateId && inv.candidate_id === params.candidate!.id) {
        return true;
      }
      if (
        hasCandidateCode &&
        inv.candidate_code === params.candidate!.candidate_code
      ) {
        return true;
      }
      return false;
    }
    const invPersonalLower = (inv.personal_email || '').trim().toLowerCase();
    const invEmailLower = (inv.email || '').trim().toLowerCase();
    return Boolean(
      personalEmailLower &&
        (invPersonalLower === personalEmailLower ||
          invEmailLower === personalEmailLower)
    );
  });

  if (matchingInvites.length > 0) {
    const allEmployees = getAllRuntimeEmployees();
    const allOnboarding = getOnboardingRecords();
    const allUsers = getSystemUsers();

    for (const existingInvite of matchingInvites) {
      const matchedEmployee = allEmployees.find(
        (e) =>
          (existingInvite.employee_id && e.id === existingInvite.employee_id) ||
          (existingInvite.employee_code &&
            e.employee_code === existingInvite.employee_code) ||
          (existingInvite.token && e.preboarding_token === existingInvite.token)
      );
      if (
        !matchedEmployee ||
        matchedEmployee.employment_status === 'RESIGNED' ||
        String(matchedEmployee.employment_status) === 'TERMINATED'
      ) {
        continue;
      }
      const matchedOnboarding = allOnboarding.find(
        (o) =>
          (existingInvite.token && o.preboarding_token === existingInvite.token) ||
          (existingInvite.employee_id &&
            o.employee_id === existingInvite.employee_id) ||
          (existingInvite.employee_code &&
            o.employee_code === existingInvite.employee_code)
      );

      if (matchedOnboarding) {
        const matchedUser =
          allUsers.find(
            (u) =>
              (matchedEmployee.id && u.employee_id === matchedEmployee.id) ||
              u.employee_code === matchedEmployee.employee_code ||
              emailsMatchInternalAlias(u.email, matchedEmployee.email)
          ) ??
          setUserActiveByEmployee({
            employeeId: matchedEmployee.id,
            employeeCode: matchedEmployee.employee_code,
            email: matchedEmployee.email,
            fullName: matchedEmployee.full_name,
            departmentName: matchedEmployee.department_name,
            positionName: matchedEmployee.position_name,
            roleCode: matchedEmployee.role_code,
            isActive: false,
            targetStatus: 'INACTIVE',
            reason: 'Chờ hoàn tất Pre-boarding và IT cấp quyền SSO',
          });

        if (
          params.candidate &&
          (params.candidate.preboarding_token !== existingInvite.token ||
            params.candidate.stage !== 'ONBOARDED')
        ) {
          saveRuntimeCandidate({
            ...params.candidate,
            stage: 'ONBOARDED',
            preboarding_token: existingInvite.token,
          });
        }

        return {
          invite: existingInvite,
          employee: matchedEmployee,
          user: matchedUser,
          onboarding: matchedOnboarding,
        };
      }
    }
  }

  const token = generateSecurePreboardingToken();

  if (params.candidate) {
    saveRuntimeCandidate({
      ...params.candidate,
      stage: 'ONBOARDED',
      preboarding_token: token,
    });
  }

  const employeeCode = generateNextEmployeeCode();
  const salaryPercent = params.probationSalaryPercent ?? 85;
  const probationSalaryVnd = Math.round(
    (params.officialSalaryVnd * salaryPercent) / 100
  );
  const probationEndDate = addTwoMonthsIso(params.expectedStartDate);
  const deptRef = getRuntimeDepartments().find((d) => d.id === params.departmentId);
  const shiftCode = params.departmentId.startsWith('dept-tech')
    ? 'HC-08:30'
    : params.departmentId === 'dept-sales'
      ? 'FLEX-09:00'
      : 'HC-08:00';
  const corporateEmail = `${normalizeEmailSlug(fullName)}.${employeeCode.slice(-3)}@hrm-enterprise.vn`;

  const pendingEmployee: Employee = {
    id: `emp-pb-${Date.now()}`,
    employee_code: employeeCode,
    full_name: fullName,
    email: corporateEmail,
    personal_email: personalEmail,
    phone,
    gender: 'Nam',
    date_of_birth: '1998-01-01',
    national_id: '',
    tax_code: '',
    social_insurance_no: '',
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: params.positionId || 'pos-04',
    position_name: params.positionName,
    manager_id: params.managerId ?? deptRef?.manager_id ?? 'emp-003',
    manager_name: params.managerName,
    role_code: 'EMPLOYEE',
    join_date: params.expectedStartDate,
    employment_status: 'PENDING_ONBOARD',
    contract_type: 'PROBATION_2M',
    contract_start_date: params.expectedStartDate,
    contract_end_date: probationEndDate,
    contract_status: 'PENDING_SIGN',
    base_salary_vnd: probationSalaryVnd,
    probation_salary_percent: salaryPercent,
    official_salary_vnd: params.officialSalaryVnd,
    probation_end_date: probationEndDate,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 600000,
    allowance_position_vnd: 0,
    dependents_count: 0,
    bank_account_no: '',
    bank_name: '',
    work_shift_code: shiftCode,
    kpi_completion_rate: 0,
    burnout_risk_score: 10,
    burnout_risk_level: 'LOW',
    turnover_risk_score: 10,
    turnover_risk_level: 'LOW',
    ai_retention_note: `Hồ sơ Pre-boarding (${employeeCode}), đang chờ ứng viên tự khai báo thông tin pháp lý & nhận việc.`,
    avatar_initials: buildInitials(fullName),
    preboarding_token: token,
    preboarding_status: 'PENDING',
  };
  saveRuntimeEmployee(pendingEmployee);

  const inactiveUser = setUserActiveByEmployee({
    employeeId: pendingEmployee.id,
    employeeCode,
    email: corporateEmail,
    fullName,
    departmentName: params.departmentName,
    positionName: params.positionName,
    roleCode: 'EMPLOYEE',
    isActive: false,
    targetStatus: 'INACTIVE',
    reason: 'Chờ hoàn tất Pre-boarding và IT cấp quyền SSO',
    actorName: params.actorName,
  });

  const existingOnboarding = getOnboardingRecords();
  const onboardingId = generateNextOnboardingId(existingOnboarding);
  const checklist: OnboardingChecklistItem[] = [
    {
      id: `${onboardingId.toLowerCase()}-it-1`,
      group: 'IT',
      task_code: 'IT_EMAIL_SSO',
      title: 'Khởi tạo email doanh nghiệp, tài khoản SSO và kích hoạt đăng nhập',
      assignee_role_label: 'Bộ phận CNTT (IT Helpdesk)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-it-2`,
      group: 'IT',
      task_code: 'IT_VPN_SECURITY',
      title: 'Cấu hình VPN bảo mật và quyền truy cập kho tài nguyên phòng ban',
      assignee_role_label: 'Bộ phận CNTT (IT Security)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-1`,
      group: 'ADMIN',
      task_code: 'ADMIN_HARDWARE',
      title: 'Cấp phát máy tính làm việc và lập biên bản bàn giao thiết bị',
      assignee_role_label: 'Hành chính & Quản trị thiết bị',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-2`,
      group: 'ADMIN',
      task_code: 'ADMIN_ACCESS_CARD',
      title: 'Cấp thẻ từ ra vào tòa nhà và đăng ký sinh trắc học chấm công',
      assignee_role_label: 'Hành chính Văn phòng',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-1`,
      group: 'HR',
      task_code: 'HR_PROBATION_CONTRACT',
      title: `Ký hợp đồng thử việc 02 tháng (${salaryPercent}% lương) và kích hoạt trạng thái PROBATION`,
      assignee_role_label: 'Phòng Nhân sự (C&B)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-2`,
      group: 'HR',
      task_code: 'HR_POLICY_TRAINING',
      title: 'Xác minh hồ sơ Pre-boarding (CCCD/MST/BHXH) và phổ biến nội quy lao động',
      assignee_role_label: 'Phòng Nhân sự (L&D)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-1`,
      group: 'MANAGER',
      task_code: 'MGR_ASSIGN_MENTOR',
      title: 'Phân công người hướng dẫn (Mentor/Buddy) đồng hành 60 ngày đầu',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-2`,
      group: 'MANAGER',
      task_code: 'MGR_PROBATION_GOALS',
      title: 'Giao mục tiêu KPI thử việc 60 ngày và lịch đánh giá định kỳ',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
  ];

  const onboarding: OnboardingRecord = {
    id: onboardingId,
    candidate_id: params.candidate?.id,
    candidate_code: params.candidate?.candidate_code,
    employee_id: pendingEmployee.id,
    employee_code: employeeCode,
    full_name: fullName,
    email: corporateEmail,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_name: params.positionName,
    manager_name: params.managerName,
    start_date: params.expectedStartDate,
    status: 'IN_PROGRESS',
    checklist,
    assigned_asset_ids: [],
    created_at: nowIso,
    probation_salary_percent: salaryPercent,
    official_salary_vnd: params.officialSalaryVnd,
    probation_end_date: probationEndDate,
    preboarding_token: token,
  };
  saveOnboardingRecord(onboarding);

  const invite: PreboardingInvite = {
    id: `pb-${Date.now()}`,
    token,
    preboarding_url: `/preboarding?token=${token}`,
    candidate_id: params.candidate?.id,
    candidate_code: params.candidate?.candidate_code,
    employee_id: pendingEmployee.id,
    employee_code: employeeCode,
    full_name: fullName,
    personal_email: personalEmail,
    phone,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: params.positionId || 'pos-04',
    position_name: params.positionName,
    manager_id: pendingEmployee.manager_id,
    manager_name: params.managerName,
    expected_start_date: params.expectedStartDate,
    official_salary_vnd: params.officialSalaryVnd,
    probation_salary_percent: salaryPercent,
    probation_salary_vnd: probationSalaryVnd,
    status: 'PENDING',
    expires_at: `${addDaysIso(params.expectedStartDate, 14)}T23:59:59+07:00`,
    created_at: nowIso,
  };

  const existingInvites = getPreboardingInvites();
  writeStorageArray(STORAGE_PREBOARDING_KEY, [invite, ...existingInvites]);

  pushNotification({
    title: `Đã mở cổng Pre-boarding cho ${fullName}`,
    message: `Mã nhân sự dự kiến ${employeeCode} (${params.positionName}). Link tự khai báo hồ sơ nhận việc đã sẵn sàng gửi tới ứng viên.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'DEPT_MANAGER', 'SUPER_ADMIN'],
    target_department_id: params.departmentId,
    nav_id: 'onboarding',
    entity_id: onboardingId,
  });

  return {
    invite,
    employee: pendingEmployee,
    user: inactiveUser,
    onboarding,
  };
}

function findLinkedEmployeeForPreboarding(
  targetInvite: PreboardingInvite
): Employee | null {
  const allEmps = getAllRuntimeEmployees();
  const inviteEmailLower = (
    targetInvite.email ||
    targetInvite.personal_email ||
    ''
  )
    .trim()
    .toLowerCase();

  return (
    allEmps.find(
      (e) =>
        (targetInvite.employee_id && e.id === targetInvite.employee_id) ||
        (targetInvite.employee_code &&
          e.employee_code === targetInvite.employee_code) ||
        (inviteEmailLower &&
          (e.email.toLowerCase() === inviteEmailLower ||
            e.personal_email?.toLowerCase() === inviteEmailLower))
    ) ?? null
  );
}

function isEmployeeLockedForVerifiedPreboarding(
  emp: Employee | null | undefined
): boolean {
  if (!emp) return false;
  return (
    emp.employment_status === 'OFFICIAL' ||
    emp.employment_status === 'ACTIVE' ||
    emp.employment_status === 'RESIGNED'
  );
}

export function savePreboardingDraft(
  token: string,
  draft: Partial<PreboardingSubmissionData>
): PreboardingInvite | null {
  const cleanToken = token?.trim();
  if (!cleanToken) return null;

  const invites = getPreboardingInvites();
  const idx = invites.findIndex(
    (item) => item.token === cleanToken || item.id === cleanToken
  );
  if (idx < 0) return null;

  const existing = invites[idx];
  if (existing.status === 'EXPIRED') return null;

  const existingEmp = findLinkedEmployeeForPreboarding(existing);
  const wasVerified = existing.status === 'VERIFIED';
  if (wasVerified && isEmployeeLockedForVerifiedPreboarding(existingEmp)) {
    return null;
  }

  const mergedData: PreboardingSubmissionData = {
    national_id: '',
    tax_code: '',
    bank_name: 'Vietcombank',
    bank_account_no: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    ...existing.submitted_data,
    ...draft,
  };

  const nextStatus: PreboardingStatus = wasVerified ? 'PENDING' : existing.status;
  const updatedInvite: PreboardingInvite = {
    ...existing,
    status: nextStatus,
    submitted_data: mergedData,
    verified_by: wasVerified ? undefined : existing.verified_by,
    verified_at: wasVerified ? undefined : existing.verified_at,
  };

  const nextInvites = invites.map((item, i) => (i === idx ? updatedInvite : item));
  writeStorageArray(STORAGE_PREBOARDING_KEY, nextInvites);

  if (wasVerified && existingEmp) {
    saveRuntimeEmployee({
      ...existingEmp,
      preboarding_status: 'PENDING',
    });
  }

  return updatedInvite;
}

export function submitPreboardingInfo(
  token: string,
  submission: PreboardingSubmissionData
): { invite: PreboardingInvite; employee: Employee | null } {
  const invites = getPreboardingInvites();
  const idx = invites.findIndex(
    (item) => item.token === token.trim() || item.id === token.trim()
  );
  if (idx < 0) {
    throw new Error('Không tìm thấy liên kết Pre-boarding hợp lệ hoặc liên kết đã hết hạn.');
  }

  const targetInvite = invites[idx];
  if (targetInvite.status === 'EXPIRED') {
    throw new Error('Liên kết Pre-boarding đã hết hạn, không thể nộp hồ sơ.');
  }

  const existingEmp = findLinkedEmployeeForPreboarding(targetInvite);
  const wasVerified = targetInvite.status === 'VERIFIED';
  if (wasVerified && isEmployeeLockedForVerifiedPreboarding(existingEmp)) {
    throw new Error(
      'Nhân sự đã ký hợp đồng chính thức hoặc đã nghỉ việc, không thể mở khóa chỉnh sửa hồ sơ Pre-boarding đã xác minh.'
    );
  }

  if (!submission.national_id?.trim() || !submission.bank_account_no?.trim()) {
    throw new Error('Vui lòng điền đầy đủ Số CCCD và Tài khoản ngân hàng nhận lương.');
  }

  const nowIso = new Date().toISOString();
  const updatedInvite: PreboardingInvite = {
    ...targetInvite,
    status: 'SUBMITTED',
    submitted_data: { ...targetInvite.submitted_data, ...submission },
    submitted_at: nowIso,
    verified_by: wasVerified ? undefined : targetInvite.verified_by,
    verified_at: wasVerified ? undefined : targetInvite.verified_at,
  };

  const nextInvites = invites.map((item, i) => (i === idx ? updatedInvite : item));
  writeStorageArray(STORAGE_PREBOARDING_KEY, nextInvites);

  let updatedEmployee: Employee | null = null;
  if (existingEmp) {
    if (wasVerified) {
      // Do NOT overwrite verified legal/payroll fields on Employee until HR re-verifies
      updatedEmployee = {
        ...existingEmp,
        preboarding_status: 'SUBMITTED',
      };
      saveRuntimeEmployee(updatedEmployee);
    } else {
      updatedEmployee = {
        ...existingEmp,
        personal_email: submission.personal_email?.trim() || existingEmp.personal_email,
        phone: submission.phone?.trim() || existingEmp.phone,
        gender: submission.gender || existingEmp.gender,
        date_of_birth: submission.date_of_birth || existingEmp.date_of_birth,
        national_id: submission.national_id.trim(),
        national_id_issue_date: submission.national_id_issue_date,
        national_id_issue_place: submission.national_id_issue_place,
        tax_code: submission.tax_code?.trim() || existingEmp.tax_code,
        social_insurance_no:
          submission.social_insurance_no?.trim() || existingEmp.social_insurance_no,
        bank_name: submission.bank_name.trim(),
        bank_account_no: submission.bank_account_no.trim(),
        dependents_count: submission.dependents_count ?? existingEmp.dependents_count,
        address: submission.address?.trim() || existingEmp.address,
        emergency_contact_name: submission.emergency_contact_name.trim(),
        emergency_contact_phone: submission.emergency_contact_phone.trim(),
        emergency_contact_relation: submission.emergency_contact_relation?.trim(),
        preboarding_status: 'SUBMITTED',
      };
      saveRuntimeEmployee(updatedEmployee);
    }
  }

  pushNotification({
    title: wasVerified
      ? `Ứng viên cập nhật lại hồ sơ Pre-boarding: ${targetInvite.full_name}`
      : `Ứng viên hoàn tất khai báo Pre-boarding: ${targetInvite.full_name}`,
    message: `${targetInvite.full_name} (${targetInvite.employee_code}) đã nộp thông tin CCCD, MST, ngân hàng & liên hệ khẩn cấp. Chờ HR rà soát.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'SUPER_ADMIN'],
    nav_id: 'onboarding',
  });

  recordAuditLog({
    actor_name: targetInvite.full_name,
    actor_code: targetInvite.employee_code,
    actor_role: 'CANDIDATE',
    action: 'PREBOARDING_SUBMIT',
    target: `${targetInvite.employee_code} (${targetInvite.token})`,
    detail: wasVerified
      ? `Ứng viên gửi lại bản chỉnh sửa hồ sơ Pre-boarding (chờ HR duyệt lại trước khi đồng bộ lương/CCCD).`
      : `Ứng viên tự khai báo hoàn tất hồ sơ Pre-boarding trực tuyến (CCCD, MST, Ngân hàng ${submission.bank_name}).`,
  });

  return { invite: updatedInvite, employee: updatedEmployee };
}

export const submitPreboardingInvite = submitPreboardingInfo;

export function hrQuickUpdatePreboarding(
  inviteIdOrToken: string,
  patch: Partial<PreboardingSubmissionData> & {
    verify?: boolean;
    actorName?: string;
  }
): { invite: PreboardingInvite; employee: Employee | null } {
  const invites = getPreboardingInvites();
  const idx = invites.findIndex(
    (item) => item.id === inviteIdOrToken || item.token === inviteIdOrToken
  );
  if (idx < 0) {
    throw new Error('Không tìm thấy hồ sơ Pre-boarding cần cập nhật.');
  }

  const nowIso = new Date().toISOString();
  const target = invites[idx];
  if (target.status === 'EXPIRED') {
    throw new Error('Liên kết Pre-boarding này đã hết hạn, không thể cập nhật hoặc duyệt.');
  }

  const existingEmp = findLinkedEmployeeForPreboarding(target);
  if (patch.verify) {
    if (existingEmp?.employment_status === 'RESIGNED') {
      throw new Error('Nhân sự đã hoàn tất thủ tục nghỉ việc (RESIGNED), không thể duyệt kích hoạt Pre-boarding.');
    }
    const existingUsers = getSystemUsers();
    const linkedLockedUser = existingUsers.find(
      (u) =>
        u.account_status === 'LOCKED' &&
        (u.employee_code === (existingEmp?.employee_code ?? target.employee_code) ||
          (Boolean(existingEmp?.id) && u.employee_id === existingEmp!.id) ||
          (Boolean(existingEmp?.email) && emailsMatchInternalAlias(u.email, existingEmp!.email)))
    );
    if (linkedLockedUser) {
      throw new Error('Tài khoản nhân sự đang bị khóa (LOCKED), không thể duyệt kích hoạt Pre-boarding.');
    }
  }

  const { verify: shouldVerify, actorName: patchActorName, ...cleanPatch } = patch;
  const mergedData: PreboardingSubmissionData = {
    national_id: cleanPatch.national_id ?? target.submitted_data?.national_id ?? '',
    tax_code: cleanPatch.tax_code ?? target.submitted_data?.tax_code ?? '',
    bank_name: cleanPatch.bank_name ?? target.submitted_data?.bank_name ?? 'Vietcombank',
    bank_account_no:
      cleanPatch.bank_account_no ?? target.submitted_data?.bank_account_no ?? '',
    emergency_contact_name:
      cleanPatch.emergency_contact_name ??
      target.submitted_data?.emergency_contact_name ??
      '',
    emergency_contact_phone:
      cleanPatch.emergency_contact_phone ??
      target.submitted_data?.emergency_contact_phone ??
      '',
    ...target.submitted_data,
    ...cleanPatch,
  };

  const nextStatus = shouldVerify ? 'VERIFIED' : target.status === 'PENDING' ? 'SUBMITTED' : target.status;
  const updatedInvite: PreboardingInvite = {
    ...target,
    submitted_data: mergedData,
    status: nextStatus,
    verified_by: shouldVerify ? patchActorName || 'HR Manager' : target.verified_by,
    verified_at: shouldVerify ? nowIso : target.verified_at,
  };

  writeStorageArray(
    STORAGE_PREBOARDING_KEY,
    invites.map((item, i) => (i === idx ? updatedInvite : item))
  );

  let updatedEmployee: Employee | null = null;
  if (existingEmp) {
    updatedEmployee = {
      ...existingEmp,
      personal_email: mergedData.personal_email?.trim() || existingEmp.personal_email,
      phone: mergedData.phone?.trim() || existingEmp.phone,
      gender: mergedData.gender || existingEmp.gender,
      date_of_birth: mergedData.date_of_birth || existingEmp.date_of_birth,
      national_id: mergedData.national_id || existingEmp.national_id,
      national_id_issue_date:
        mergedData.national_id_issue_date ?? existingEmp.national_id_issue_date,
      national_id_issue_place:
        mergedData.national_id_issue_place ?? existingEmp.national_id_issue_place,
      tax_code: mergedData.tax_code || existingEmp.tax_code,
      social_insurance_no:
        mergedData.social_insurance_no || existingEmp.social_insurance_no,
      bank_name: mergedData.bank_name || existingEmp.bank_name,
      bank_account_no: mergedData.bank_account_no || existingEmp.bank_account_no,
      dependents_count: mergedData.dependents_count ?? existingEmp.dependents_count,
      address: mergedData.address ?? existingEmp.address,
      emergency_contact_name:
        mergedData.emergency_contact_name || existingEmp.emergency_contact_name,
      emergency_contact_phone:
        mergedData.emergency_contact_phone || existingEmp.emergency_contact_phone,
      emergency_contact_relation:
        mergedData.emergency_contact_relation ??
        existingEmp.emergency_contact_relation,
      preboarding_status: nextStatus === 'VERIFIED' ? 'VERIFIED' : 'SUBMITTED',
    };
    saveRuntimeEmployee(updatedEmployee);
  }

  if (patch.verify) {
    const actorName = patch.actorName || 'HR Manager';
    const activatedUser = activateEmployeeAccountIfPreboardingVerified(
      updatedEmployee?.employee_code ?? updatedInvite.employee_code
    );

    if (activatedUser) {
      const onboardingRecords = getOnboardingRecords();
      const onbIdx = onboardingRecords.findIndex(
        (rec) =>
          rec.preboarding_token === updatedInvite.token ||
          rec.employee_code ===
            (updatedEmployee?.employee_code ?? updatedInvite.employee_code) ||
          (Boolean(updatedEmployee?.id) && rec.employee_id === updatedEmployee!.id)
      );

      if (onbIdx >= 0) {
        const targetOnb = onboardingRecords[onbIdx];
        let checklistChanged = false;
        const hasSpecificSsoTask = targetOnb.checklist.some(
          (chk) => chk.task_code === 'IT_EMAIL_SSO'
        );
        const updatedChecklist = targetOnb.checklist.map((chk) => {
          const isTargetItTask = hasSpecificSsoTask
            ? chk.task_code === 'IT_EMAIL_SSO'
            : chk.group === 'IT';
          if (!isTargetItTask || chk.completed) return chk;
          checklistChanged = true;
          return {
            ...chk,
            completed: true,
            completed_at: chk.completed_at ?? nowIso,
            completed_by: chk.completed_by ?? actorName,
            side_effect_summary:
              chk.side_effect_summary ??
              `Tự động kích hoạt tài khoản Nhân viên (${activatedUser.role_code}, ACTIVE) khi HR duyệt hồ sơ Pre-boarding.`,
          };
        });

        if (checklistChanged) {
          const allDone = updatedChecklist.every((c) => c.completed);
          const updatedOnb: OnboardingRecord = {
            ...targetOnb,
            status: allDone ? 'COMPLETED' : targetOnb.status,
            checklist: updatedChecklist,
          };
          writeStorageArray(
            STORAGE_ONBOARDING_KEY,
            onboardingRecords.map((item, i) => (i === onbIdx ? updatedOnb : item))
          );
        }
      }
    }
  }

  return { invite: updatedInvite, employee: updatedEmployee };
}

export function verifyPreboardingInvite(
  inviteIdOrToken: string,
  actorName = 'HR Manager'
): { invite: PreboardingInvite; employee: Employee | null } {
  return hrQuickUpdatePreboarding(inviteIdOrToken, {
    verify: true,
    actorName,
  });
}

function triggerOnboardingGroupSideEffectInternal(
  onboarding: OnboardingRecord,
  group: OnboardingTaskGroup,
  actorName: string,
  options?: {
    companyEmail?: string;
    assetId?: string;
    assignCondition?: string;
    mentorId?: string;
    mentorName?: string;
    probationGoals?: string;
    salaryPercent?: number;
    officialSalaryVnd?: number;
  }
): { employee: Employee | null; sideEffects: string[] } {
  const sideEffects: string[] = [];
  const allEmps = getAllRuntimeEmployees();
  let matchedEmp =
    allEmps.find(
      (e) =>
        e.id === onboarding.employee_id ||
        e.employee_code === onboarding.employee_code
    ) ?? null;

  if (group === 'IT') {
    const corpEmail =
      options?.companyEmail?.trim() ||
      (onboarding.email.endsWith('@hrm-enterprise.vn')
        ? onboarding.email
        : `${normalizeEmailSlug(onboarding.full_name)}@hrm-enterprise.vn`);

    if (matchedEmp) {
      matchedEmp = { ...matchedEmp, email: corpEmail };
      saveRuntimeEmployee(matchedEmp);
    }

    setUserActiveByEmployee({
      employeeId: matchedEmp?.id ?? onboarding.employee_id,
      employeeCode: onboarding.employee_code,
      email: corpEmail,
      fullName: onboarding.full_name,
      departmentName: onboarding.department_name,
      positionName: onboarding.position_name,
      roleCode: matchedEmp?.role_code ?? 'EMPLOYEE',
      isActive: true,
      targetStatus: 'ACTIVE',
      actorName,
    });
    sideEffects.push(
      `Đã cấp email ${corpEmail} và kích hoạt tài khoản đăng nhập SSO (is_active = true).`
    );
  } else if (group === 'ADMIN') {
    const assetIdToAssign = options?.assetId;
    if (assetIdToAssign) {
      const assigned = assignAssetToEmployee({
        assetId: assetIdToAssign,
        employeeId: matchedEmp?.id ?? onboarding.employee_id,
        employeeCode: onboarding.employee_code,
        employeeName: onboarding.full_name,
        departmentId: onboarding.department_id,
        assignedDate: onboarding.start_date,
        assignCondition: options?.assignCondition,
        actorName,
      });
      if (assigned) {
        sideEffects.push(
          `Đã gán thiết bị ${assigned.asset.asset_code} (${assigned.asset.name}) vào hồ sơ tài sản nhân viên.`
        );
      }
    }
  } else if (group === 'MANAGER') {
    if (options?.mentorId || options?.mentorName || options?.probationGoals) {
      if (matchedEmp) {
        matchedEmp = {
          ...matchedEmp,
          mentor_id: options.mentorId ?? matchedEmp.mentor_id ?? null,
          mentor_name: options.mentorName ?? matchedEmp.mentor_name ?? null,
        };
        saveRuntimeEmployee(matchedEmp);
      }
      sideEffects.push(
        `Đã phân công Mentor hướng dẫn (${options.mentorName || 'Buddy bộ phận'}) và chốt mục tiêu thử việc 60 ngày.`
      );
    }
  } else if (group === 'HR') {
    const salaryPercent =
      options?.salaryPercent ??
      matchedEmp?.probation_salary_percent ??
      onboarding.probation_salary_percent ??
      85;
    const officialSalary =
      options?.officialSalaryVnd ??
      matchedEmp?.official_salary_vnd ??
      onboarding.official_salary_vnd ??
      (matchedEmp
        ? Math.round(matchedEmp.base_salary_vnd / (salaryPercent / 100))
        : 20000000);
    const probationSalary = Math.round((officialSalary * salaryPercent) / 100);
    const startDate = onboarding.start_date || new Date().toISOString().slice(0, 10);
    const endDate =
      onboarding.probation_end_date || addTwoMonthsIso(startDate);

    if (matchedEmp) {
      const nextStatus: EmploymentStatus =
        matchedEmp.employment_status === 'PENDING_ONBOARD'
          ? 'PROBATION'
          : matchedEmp.employment_status;
      matchedEmp = {
        ...matchedEmp,
        employment_status: nextStatus,
        contract_type:
          nextStatus === 'PROBATION' ? 'PROBATION_2M' : matchedEmp.contract_type,
        contract_start_date: startDate,
        contract_end_date:
          nextStatus === 'PROBATION' ? endDate : matchedEmp.contract_end_date,
        contract_status: 'ACTIVE',
        probation_salary_percent: salaryPercent,
        official_salary_vnd: officialSalary,
        base_salary_vnd:
          nextStatus === 'PROBATION' ? probationSalary : matchedEmp.base_salary_vnd,
        probation_end_date: endDate,
      };
      saveRuntimeEmployee(matchedEmp);
    }

    const existingProbContract = getContracts().find(
      (c) =>
        (c.employee_code === onboarding.employee_code ||
          c.employee_id === onboarding.employee_id) &&
        c.contract_type === 'PROBATION_2M'
    );
    if (!existingProbContract) {
      const daysUntilExpiry = Math.max(
        1,
        diffDaysIso(new Date().toISOString().slice(0, 10), endDate)
      );
      const createdContract: EmploymentContract = {
        id: `hd-prob-${Date.now()}`,
        contract_number: `HDTV-2026-${onboarding.employee_code.slice(-3)}`,
        employee_id: matchedEmp?.id ?? onboarding.employee_id,
        employee_code: onboarding.employee_code,
        full_name: onboarding.full_name,
        department_name: onboarding.department_name,
        position_name: onboarding.position_name,
        contract_type: 'PROBATION_2M',
        start_date: startDate,
        end_date: endDate,
        days_until_expiry: daysUntilExpiry,
        status: daysUntilExpiry <= 30 ? 'EXPIRING_SOON' : 'ACTIVE',
        base_salary_vnd: probationSalary,
        salary_percent: salaryPercent,
        official_salary_vnd: officialSalary,
        signed_date: startDate,
        notes: `Hợp đồng thử việc 02 tháng hưởng ${salaryPercent}% mức lương chính thức.`,
      };
      saveContract(createdContract);
      sideEffects.push(
        `Đã khởi tạo Hợp đồng thử việc ${createdContract.contract_number} (${salaryPercent}% lương = ${probationSalary.toLocaleString('vi-VN')} đ) và chuyển trạng thái sang PROBATION.`
      );
    }
  }

  return { employee: matchedEmp, sideEffects };
}

export function assignOnboardingMentor(params: {
  onboardingId: string;
  mentorId: string;
  mentorName: string;
  probationGoals?: string;
  actorName: string;
}): OnboardingRecord | null {
  const records = getOnboardingRecords();
  const idx = records.findIndex((r) => r.id === params.onboardingId);
  if (idx < 0) return null;

  const target = records[idx];
  const updated: OnboardingRecord = {
    ...target,
    mentor_id: params.mentorId,
    mentor_name: params.mentorName,
    probation_goals: params.probationGoals ?? target.probation_goals,
  };
  const nextRecords = records.map((item, i) => (i === idx ? updated : item));
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  triggerOnboardingGroupSideEffectInternal(updated, 'MANAGER', params.actorName, {
    mentorId: params.mentorId,
    mentorName: params.mentorName,
    probationGoals: params.probationGoals,
  });

  return updated;
}

export function completeOnboardingDeptTask(params: {
  onboardingId: string;
  group: OnboardingTaskGroup;
  itemId?: string;
  companyEmail?: string;
  assetId?: string;
  assignCondition?: string;
  mentorId?: string;
  mentorName?: string;
  probationGoals?: string;
  salaryPercent?: number;
  officialSalaryVnd?: number;
  actorName: string;
}): {
  onboarding: OnboardingRecord;
  employee: Employee | null;
  sideEffects: string[];
} | null {
  const records = getOnboardingRecords();
  const idx = records.findIndex((r) => r.id === params.onboardingId);
  if (idx < 0) return null;

  const nowIso = new Date().toISOString();
  const target = records[idx];
  const updatedChecklist = target.checklist.map((chk) => {
    if (params.itemId) {
      if (chk.id !== params.itemId) return chk;
    } else if (chk.group !== params.group) {
      return chk;
    }
    return {
      ...chk,
      completed: true,
      completed_at: chk.completed_at ?? nowIso,
      completed_by: chk.completed_by ?? params.actorName,
    };
  });

  const allDone = updatedChecklist.every((c) => c.completed);
  const updatedRecord: OnboardingRecord = {
    ...target,
    email: params.companyEmail?.trim() || target.email,
    mentor_id: params.mentorId ?? target.mentor_id,
    mentor_name: params.mentorName ?? target.mentor_name,
    probation_goals: params.probationGoals ?? target.probation_goals,
    probation_salary_percent:
      params.salaryPercent ?? target.probation_salary_percent,
    official_salary_vnd:
      params.officialSalaryVnd ?? target.official_salary_vnd,
    status: allDone ? 'COMPLETED' : target.status,
    checklist: updatedChecklist,
  };

  const nextRecords = records.map((item, i) =>
    i === idx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  const { employee, sideEffects } = triggerOnboardingGroupSideEffectInternal(
    updatedRecord,
    params.group,
    params.actorName,
    {
      companyEmail: params.companyEmail,
      assetId: params.assetId,
      assignCondition: params.assignCondition,
      mentorId: params.mentorId,
      mentorName: params.mentorName,
      probationGoals: params.probationGoals,
      salaryPercent: params.salaryPercent,
      officialSalaryVnd: params.officialSalaryVnd,
    }
  );

  recordAuditLog({
    actor_name: params.actorName,
    actor_code: 'ONB-FLOW',
    actor_role: 'HR_MANAGER',
    action: 'ONBOARDING_TASK',
    target: `${updatedRecord.id} (${updatedRecord.employee_code})`,
    detail: `Hoàn thành tác vụ hội nhập nhóm ${params.group}. ${sideEffects.join(' ')}`.trim(),
  });

  return { onboarding: getOnboardingRecords().find((r) => r.id === params.onboardingId) ?? updatedRecord, employee, sideEffects };
}

export function getExpiringProbationContracts(
  withinDays = 30
): Array<{
  contract: EmploymentContract;
  employee: Employee | null;
  daysRemaining: number;
  hasPassReview: boolean;
}> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const contracts = getContracts();
  const employees = getAllRuntimeEmployees();
  const reviews = getPerformanceReviews();

  return contracts
    .filter(
      (c) =>
        c.contract_type === 'PROBATION_2M' &&
        c.status !== 'EXPIRED' &&
        c.end_date !== null
    )
    .map((contract) => {
      const emp =
        employees.find(
          (e) =>
            e.id === contract.employee_id ||
            e.employee_code === contract.employee_code
        ) ?? null;
      const computedDiff = contract.end_date
        ? diffDaysIso(todayIso, contract.end_date)
        : contract.days_until_expiry ?? 999;
      const daysRemaining =
        contract.days_until_expiry !== null && contract.days_until_expiry !== undefined
          ? Math.min(contract.days_until_expiry, Math.max(0, computedDiff))
          : computedDiff;
      const hasPassReview = reviews.some(
        (r) =>
          (r.employee_id === contract.employee_id ||
            r.employee_code === contract.employee_code) &&
          r.cycle === 'PROBATION' &&
          r.result === 'PASS'
      );
      return { contract, employee: emp, daysRemaining, hasPassReview };
    })
    .filter(
      (item) =>
        item.daysRemaining <= withinDays &&
        (!item.employee || item.employee.employment_status === 'PROBATION')
    )
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function convertProbationToOfficial(params: {
  employeeId: string;
  officialDate?: string;
  officialSalaryVnd?: number;
  contractType?: 'FIXED_TERM_12M' | 'FIXED_TERM_24M' | 'INDEFINITE_TERM';
  reviewerId?: string;
  reviewerName: string;
  kpiScore?: number;
  reviewNote?: string;
  requireManagerPass?: boolean;
}): {
  employee: Employee;
  officialContract: EmploymentContract;
  leaveBalance: AnnualLeaveBalance;
  careerEntry: CareerHistoryEntry;
  review: PerformanceReview;
} {
  const allEmps = getAllRuntimeEmployees();
  const emp = allEmps.find(
    (e) => e.id === params.employeeId || e.employee_code === params.employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy hồ sơ nhân sự thử việc cần chuyển chính thức.');
  }
  if (emp.employment_status !== 'PROBATION') {
    throw new Error(
      'Chỉ nhân sự đang thử việc (PROBATION) mới có thể chuyển chính thức.'
    );
  }

  const existingPassReview = getPerformanceReviews(emp.id).find(
    (r) => r.cycle === 'PROBATION' && r.result === 'PASS'
  );
  if (params.requireManagerPass && !existingPassReview && params.kpiScore === undefined) {
    throw new Error(
      `Nhân sự ${emp.full_name} (${emp.employee_code}) chưa có kết quả đánh giá thử việc ĐẠT (PASS) từ Trưởng bộ phận.`
    );
  }

  const officialDate =
    params.officialDate ||
    (emp.contract_end_date ? addDaysIso(emp.contract_end_date, 1) : new Date().toISOString().slice(0, 10));
  const salaryPercent = emp.probation_salary_percent || 85;
  const computed100Salary =
    params.officialSalaryVnd ??
    emp.official_salary_vnd ??
    Math.round(emp.base_salary_vnd / (salaryPercent / 100) / 100000) * 100000;

  const reviewRecord =
    existingPassReview ??
    savePerformanceReview({
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_id: emp.department_id,
      department_name: emp.department_name,
      position_name: emp.position_name,
      cycle: 'PROBATION',
      period_label: `Thử việc 60 ngày (${emp.join_date.slice(0, 7)})`,
      kpi_score: params.kpiScore ?? Math.max(85, emp.kpi_completion_rate || 88),
      okr_completion_percent: params.kpiScore ?? 90,
      grade: (params.kpiScore ?? 88) >= 90 ? 'A' : 'B+',
      result: 'PASS',
      reviewer_id: params.reviewerId ?? emp.manager_id ?? 'emp-003',
      reviewer_name: params.reviewerName,
      review_note:
        params.reviewNote ||
        'Hoàn thành tốt các mục tiêu thử việc 60 ngày, đủ năng lực chuyển ký HĐLĐ chính thức hưởng 100% lương.',
      suggested_salary_vnd: computed100Salary,
      status: 'APPROVED',
    });

  // Expire probation contract(s)
  const allContracts = getContracts();
  for (const c of allContracts) {
    if (
      (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
      c.contract_type === 'PROBATION_2M' &&
      c.status !== 'EXPIRED'
    ) {
      saveContract({
        ...c,
        status: 'EXPIRED',
        days_until_expiry: 0,
      });
    }
  }

  const nextContractType = params.contractType ?? 'FIXED_TERM_12M';
  const nextEndDate =
    nextContractType === 'INDEFINITE_TERM'
      ? null
      : nextContractType === 'FIXED_TERM_24M'
        ? addMonthsIso(officialDate, 24)
        : addMonthsIso(officialDate, 12);

  const officialContract: EmploymentContract = {
    id: `hd-off-${Date.now()}`,
    contract_number: `HDLD-${officialDate.slice(0, 4)}-${emp.employee_code.slice(-3)}`,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    position_name: emp.position_name,
    contract_type: nextContractType,
    start_date: officialDate,
    end_date: nextEndDate,
    days_until_expiry: nextEndDate ? diffDaysIso(officialDate, nextEndDate) : null,
    status: 'ACTIVE',
    base_salary_vnd: computed100Salary,
    salary_percent: 100,
    official_salary_vnd: computed100Salary,
    signed_date: officialDate,
    notes: 'Chuyển chính thức 100% lương sau đánh giá thử việc ĐẠT (PASS).',
  };
  saveContract(officialContract);

  const updatedEmp: Employee = {
    ...emp,
    employment_status: 'OFFICIAL',
    official_date: officialDate,
    probation_salary_percent: 100,
    official_salary_vnd: computed100Salary,
    base_salary_vnd: computed100Salary,
    contract_type: nextContractType,
    contract_start_date: officialDate,
    contract_end_date: nextEndDate,
    contract_status: 'ACTIVE',
  };
  saveRuntimeEmployee(updatedEmp);

  // Complete matching onboarding record if still in progress
  const onbList = getOnboardingRecords();
  const onbMatch = onbList.find(
    (o) => o.employee_id === emp.id || o.employee_code === emp.employee_code
  );
  if (onbMatch && onbMatch.status !== 'COMPLETED') {
    const nowIso = new Date().toISOString();
    saveOnboardingRecord({
      ...onbMatch,
      status: 'COMPLETED',
      checklist: onbMatch.checklist.map((c) =>
        c.completed
          ? c
          : { ...c, completed: true, completed_at: nowIso, completed_by: params.reviewerName }
      ),
    });
  }

  // Initialize AnnualLeaveBalance (12 days)
  const yearNum = Number.parseInt(officialDate.slice(0, 4), 10) || 2026;
  const storedBalances =
    readStorageArray<AnnualLeaveBalance>(STORAGE_LEAVE_BALANCES_KEY) ?? [];
  const foundBalance =
    storedBalances.find(
      (b) =>
        b.year === yearNum &&
        (b.employee_id === emp.id || b.employee_code === emp.employee_code)
    ) ??
    MOCK_ANNUAL_LEAVE_BALANCES.find(
      (b) =>
        b.year === yearNum &&
        (b.employee_id === emp.id || b.employee_code === emp.employee_code)
    );
  const leaveBalance: AnnualLeaveBalance = foundBalance ?? {
    id: `alb-rt-${Date.now()}-${yearNum}`,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    year: yearNum,
    total_entitled_days: 12,
    carried_over_days: 0,
    used_days: 0,
    pending_days: 0,
    remaining_days: 12,
  };
  saveLeaveBalance(leaveBalance);

  // Append immutable CareerHistoryEntry
  const decisionNo = `QĐ-${officialDate.slice(0, 4)}-${String(getCareerHistories().length + 101)}/LV-NS`;
  const careerEntry: CareerHistoryEntry = {
    id: `ch-rt-${Date.now()}`,
    decision_no: decisionNo,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    change_type: 'PROBATION_TO_OFFICIAL',
    old_department_id: emp.department_id,
    old_department_name: emp.department_name,
    new_department_id: emp.department_id,
    new_department_name: emp.department_name,
    old_position_id: emp.position_id,
    old_position_name: emp.position_name,
    new_position_id: emp.position_id,
    new_position_name: emp.position_name,
    old_salary_vnd: emp.base_salary_vnd,
    new_salary_vnd: computed100Salary,
    old_role_code: emp.role_code,
    new_role_code: emp.role_code,
    effective_date: officialDate,
    reason: `Hoàn thành thử việc ĐẠT (${reviewRecord.kpi_score} điểm), ký HĐLĐ chính thức ${officialContract.contract_number} hưởng 100% lương.`,
    signed_by_name: params.reviewerName,
    addendum_contract_id: officialContract.id,
    addendum_contract_number: officialContract.contract_number,
    created_at: new Date().toISOString(),
  };
  appendCareerHistoryEntryInternal(careerEntry);

  setUserActiveByEmployee({
    employeeId: emp.id,
    employeeCode: emp.employee_code,
    email: emp.email,
    fullName: emp.full_name,
    departmentName: emp.department_name,
    positionName: emp.position_name,
    roleCode: emp.role_code,
    isActive: true,
    targetStatus: 'ACTIVE',
  });

  pushNotification({
    title: `Chúc mừng chuyển chính thức: ${emp.full_name}`,
    message: `Nhân sự ${emp.employee_code} đã ký HĐLĐ chính thức ${officialContract.contract_number} (100% lương: ${computed100Salary.toLocaleString('vi-VN')} đ) và được cấp 12 ngày phép năm.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'DEPT_MANAGER', 'DIRECTOR'],
    target_employee_codes: [emp.employee_code],
    target_department_id: emp.department_id,
    nav_id: 'employees',
  });

  recordAuditLog({
    actor_name: params.reviewerName,
    actor_code: 'HR-CB',
    actor_role: 'HR_MANAGER',
    action: 'PROBATION_TO_OFFICIAL',
    target: `${emp.employee_code} (${emp.full_name})`,
    detail: `Chuyển từ PROBATION sang OFFICIAL từ ${officialDate}, HĐ ${officialContract.contract_number}, lương chính thức ${computed100Salary.toLocaleString('vi-VN')} đ.`,
  });

  return {
    employee: updatedEmp,
    officialContract,
    leaveBalance,
    careerEntry,
    review: reviewRecord,
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Daily Attendance, Leave Balances, Request Side-Effects & Payroll
// ---------------------------------------------------------------------------

export function getTodayDateVN(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
    return new Date(vnMs).toISOString().slice(0, 10);
  }
}

export function getCurrentHHmmVN(now: Date = new Date()): string {
  try {
    const formatted = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    })
      .format(now)
      .replace(/^24:/, '00:');
    const match = formatted.match(/^(\d{2}):(\d{2})$/);
    if (match) return formatted;
  } catch {
    // fallback below
  }
  const vnDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const h = String(vnDate.getUTCHours()).padStart(2, '0');
  const m = String(vnDate.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const DAILY_AUTO_CUTOFF_MINUTES = 22 * 60; // 22:00 (10 giờ đêm)
const DAILY_AUTO_CUTOFF_NOTE =
  'Quá 22:00 chưa chấm công ra — Tự động ngắt ca (Quên chấm công)';

function normalizeHHmm(hhmm: string | null | undefined): string | null {
  if (!hhmm || !hhmm.includes(':')) return hhmm ?? null;
  return hhmm.trim().replace(/^24:/, '00:');
}

function parseHHmmToMinutes(hhmm: string | null | undefined): number | null {
  const normalized = normalizeHHmm(hhmm);
  if (!normalized || !normalized.includes(':')) return null;
  const [hStr, mStr] = normalized.split(':');
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function isAttendanceNightLockWindow(hhmm?: string): boolean {
  const time = (hhmm || getCurrentHHmmVN()).slice(0, 5);
  const minutes = parseHHmmToMinutes(time);
  if (minutes === null) return false;
  return minutes >= 22 * 60 || minutes < 6 * 60;
}

export function evaluateDailyPunch(params: {
  shiftCode: string;
  checkIn: string | null;
  checkOut: string | null;
  date?: string;
  todayDate?: string;
  nowHHmm?: string;
}): {
  late_minutes: number;
  early_leave_minutes: number;
  workday_value: 1 | 0.5 | 0;
  status: DailyAttendanceStatus;
} {
  const shift =
    MOCK_WORK_SHIFTS.find((s) => s.shift_code === params.shiftCode) ??
    MOCK_WORK_SHIFTS[0];
  const inMin = parseHHmmToMinutes(params.checkIn);
  const outMin = parseHHmmToMinutes(params.checkOut);
  const startMin = parseHHmmToMinutes(shift.start_time) ?? 480;
  const endMin = parseHHmmToMinutes(shift.end_time) ?? 1020;

  if (inMin === null && outMin === null) {
    return {
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      status: 'ABSENT',
    };
  }

  if (inMin !== null && outMin === null) {
    const refToday = params.todayDate ?? getTodayDateVN();
    if (params.date && params.date > refToday) {
      const lateMinutes =
        inMin > startMin + shift.late_grace_minutes ? inMin - startMin : 0;
      return {
        late_minutes: lateMinutes,
        early_leave_minutes: 0,
        workday_value: 0,
        status: 'WORKING',
      };
    }
    if (params.date && params.date === refToday) {
      const nowMin = parseHHmmToMinutes(params.nowHHmm ?? getCurrentHHmmVN()) ?? 0;
      // Ca ban ngày (< 22:00) nhưng hiện tại đã quá 22:00 mà chưa check-out -> tự động ngắt ca
      if (inMin < DAILY_AUTO_CUTOFF_MINUTES && nowMin >= DAILY_AUTO_CUTOFF_MINUTES) {
        return {
          late_minutes: 0,
          early_leave_minutes: 0,
          workday_value: 0,
          status: 'MISSING_PUNCH',
        };
      }
      const lateMinutes =
        inMin > startMin + shift.late_grace_minutes ? inMin - startMin : 0;
      return {
        late_minutes: lateMinutes,
        early_leave_minutes: 0,
        workday_value: 0,
        status: 'WORKING',
      };
    }
    return {
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      status: 'MISSING_PUNCH',
    };
  }

  if (inMin === null || outMin === null) {
    return {
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      status: 'MISSING_PUNCH',
    };
  }

  const lateMinutes =
    inMin > startMin + shift.late_grace_minutes ? inMin - startMin : 0;
  const earlyLeaveMinutes = outMin < endMin ? endMin - outMin : 0;

  let rawDuration = Math.max(0, outMin - inMin);
  if (inMin <= 720 && outMin >= 780) {
    rawDuration = Math.max(0, rawDuration - shift.break_minutes);
  }
  const workedHours = rawDuration / 60;

  if (workedHours >= 6.5) {
    return {
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      workday_value: 1,
      status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
    };
  }
  if (workedHours >= 3.5) {
    return {
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      workday_value: 0.5,
      status: 'HALF_DAY',
    };
  }
  return {
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    workday_value: 0,
    status: 'ABSENT',
  };
}

const SEED_DAILY_ATTENDANCES_2026_11: DailyAttendanceRecord[] = [
  {
    id: 'datt-20261118-004',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-18',
    shift_code: 'HC-08:30',
    check_in: '08:28',
    check_out: null,
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 0,
    overtime_hours: 0,
    status: 'MISSING_PUNCH',
    note: 'Quên chấm vân tay lúc ra về do họp khắc phục sự cố production muộn (0 công đến khi duyệt giải trình).',
    source: 'SEED',
  },
  {
    id: 'datt-20261119-004',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-19',
    shift_code: 'HC-08:30',
    check_in: '08:52',
    check_out: '18:05',
    late_minutes: 22,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'LATE',
    note: 'Đi muộn 22 phút so với ca HC-08:30.',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-004',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-20',
    shift_code: 'HC-08:30',
    check_in: '08:24',
    check_out: '19:30',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 2,
    ot_multiplier: 1.5,
    status: 'PRESENT',
    source: 'SEED',
  },
  {
    id: 'datt-20261119-009',
    employee_id: 'emp-009',
    employee_code: 'NV-2025-009',
    full_name: 'Bùi Trọng Nghĩa',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-19',
    shift_code: 'HC-08:30',
    check_in: null,
    check_out: '17:40',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 0,
    overtime_hours: 0,
    status: 'MISSING_PUNCH',
    note: 'Thiếu dữ liệu check-in buổi sáng, tạm tính 0 công chờ giải trình chấm công.',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-009',
    employee_id: 'emp-009',
    employee_code: 'NV-2025-009',
    full_name: 'Bùi Trọng Nghĩa',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-20',
    shift_code: 'HC-08:30',
    check_in: '08:32',
    check_out: '12:30',
    late_minutes: 0,
    early_leave_minutes: 300,
    workday_value: 0.5,
    overtime_hours: 0,
    status: 'HALF_DAY',
    note: 'Làm nửa ngày buổi sáng (0.5 công).',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-011',
    employee_id: 'emp-011',
    employee_code: 'NV-2026-011',
    full_name: 'Trương Gia Huy',
    department_name: 'Phòng Dữ liệu & AI',
    date: '2026-11-20',
    shift_code: 'HC-08:30',
    check_in: '08:22',
    check_out: '17:38',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'PRESENT',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-008',
    employee_id: 'emp-008',
    employee_code: 'NV-2025-008',
    full_name: 'Ngô Thanh Hà',
    department_name: 'Phòng Nhân sự & Hành chính',
    date: '2026-11-20',
    shift_code: 'HC-08:00',
    check_in: '07:54',
    check_out: '17:08',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'PRESENT',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-002',
    employee_id: 'emp-002',
    employee_code: 'NV-2024-002',
    full_name: 'Trần Thị Bích Ngọc',
    department_name: 'Phòng Nhân sự & Hành chính',
    date: '2026-11-20',
    shift_code: 'HC-08:00',
    check_in: '07:56',
    check_out: '17:15',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'PRESENT',
    source: 'SEED',
  },
];

type DailyAttendanceWithMeta = DailyAttendanceRecord & { updated_at?: string };

function getDailyRecordUpdatedMs(rec: DailyAttendanceRecord): number {
  const raw = (rec as DailyAttendanceWithMeta).updated_at;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function deduplicateDailyAttendances(
  records: DailyAttendanceRecord[]
): DailyAttendanceRecord[] {
  const byKey = new Map<string, DailyAttendanceRecord>();
  for (const rec of records) {
    const key =
      rec.employee_code && rec.date
        ? `${rec.employee_code}__${rec.date}`
        : rec.id;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, rec);
      continue;
    }
    const prevTs = getDailyRecordUpdatedMs(prev);
    const nextTs = getDailyRecordUpdatedMs(rec);
    if (nextTs > prevTs) {
      byKey.set(key, rec);
    } else if (nextTs === prevTs && !prev.check_out && rec.check_out) {
      byKey.set(key, rec);
    }
  }
  return Array.from(byKey.values());
}

export function getDailyAttendances(
  periodMonth?: string,
  employeeIdOrCode?: string
): DailyAttendanceRecord[] {
  const stored = readStorageArray<DailyAttendanceRecord>(
    STORAGE_DAILY_ATTENDANCE_KEY
  );
  const all = deduplicateDailyAttendances(
    stored ?? cloneJson(SEED_DAILY_ATTENDANCES_2026_11)
  );
  const todayVN = getTodayDateVN();
  const nowMin = parseHHmmToMinutes(getCurrentHHmmVN()) ?? 0;

  return all
    .map((rec) => {
      const normalizedCheckIn = normalizeHHmm(rec.check_in);
      const normalizedCheckOut = normalizeHHmm(rec.check_out);
      const baseRec =
        normalizedCheckIn !== rec.check_in || normalizedCheckOut !== rec.check_out
          ? { ...rec, check_in: normalizedCheckIn, check_out: normalizedCheckOut }
          : rec;

      if (baseRec.check_in && !baseRec.check_out) {
        if (baseRec.date < todayVN && baseRec.status === 'WORKING') {
          return {
            ...baseRec,
            status: 'MISSING_PUNCH' as const,
            late_minutes: 0,
            workday_value: 0 as const,
          };
        }
        if (baseRec.date === todayVN && baseRec.status === 'WORKING') {
          const inMin = parseHHmmToMinutes(baseRec.check_in);
          if (
            inMin !== null &&
            inMin < DAILY_AUTO_CUTOFF_MINUTES &&
            nowMin >= DAILY_AUTO_CUTOFF_MINUTES
          ) {
            return {
              ...baseRec,
              status: 'MISSING_PUNCH' as const,
              late_minutes: 0,
              workday_value: 0 as const,
              note:
                baseRec.note && baseRec.note.includes('Quá 22:00')
                  ? baseRec.note
                  : DAILY_AUTO_CUTOFF_NOTE,
            };
          }
        }
      }
      return baseRec;
    })
    .filter((rec) => {
      if (periodMonth && !rec.date.startsWith(periodMonth)) return false;
      if (
        employeeIdOrCode &&
        rec.employee_id !== employeeIdOrCode &&
        rec.employee_code !== employeeIdOrCode
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function upsertDailyAttendanceInternal(
  record: DailyAttendanceRecord
): DailyAttendanceRecord {
  const stamped: DailyAttendanceWithMeta = {
    ...record,
    updated_at: new Date().toISOString(),
  };
  const current = deduplicateDailyAttendances(getDailyAttendances());
  const remaining = current.filter(
    (r) =>
      r.id !== stamped.id &&
      !(r.employee_code === stamped.employee_code && r.date === stamped.date)
  );
  const updated = deduplicateDailyAttendances([stamped, ...remaining]);
  writeStorageArray(STORAGE_DAILY_ATTENDANCE_KEY, updated);
  return stamped;
}

export function checkInOutToday(params: {
  employeeId: string;
  date?: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  timeHHmm?: string;
  checkInTimeOverride?: string;
  allowPastDate?: boolean;
  note?: string;
  source?: DailyAttendanceRecord['source'];
  authMethod?: DailyAttendanceRecord['auth_method'];
  biometricDeviceLabel?: string;
  verifiedNetworkIp?: string;
  wifiMatchMode?: WifiMatchMode;
}): DailyAttendanceRecord {
  const emp = getAllRuntimeEmployees().find(
    (e) => e.id === params.employeeId || e.employee_code === params.employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy thông tin nhân viên chấm công.');
  }

  const now = new Date();
  const todayVN = getTodayDateVN(now);
  const isRealtimePunch =
    !params.timeHHmm &&
    !params.allowPastDate &&
    params.source !== 'REQUEST_SYNC';
  const dateStr = isRealtimePunch
    ? params.date && params.date >= todayVN
      ? params.date
      : todayVN
    : params.date ?? todayVN;
  const liveHHmm = getCurrentHHmmVN(now);
  const timeStr = normalizeHHmm(params.timeHHmm ?? liveHHmm) ?? liveHHmm;

  if (params.source !== 'REQUEST_SYNC' && isAttendanceNightLockWindow(timeStr)) {
    throw new Error(
      'Ngoài khung giờ chấm công (Hệ thống tạm khóa chấm công từ 22:00 tối đến 06:00 sáng).'
    );
  }

  const existing = deduplicateDailyAttendances(getDailyAttendances()).find(
    (r) => r.employee_code === emp.employee_code && r.date === dateStr
  );

  // Chế độ thời gian thực: nếu đã có check_in trong ngày thì bấm chấm công lại luôn cập nhật check_out = liveHHmm mới nhất
  const effectiveAction: 'CHECK_IN' | 'CHECK_OUT' =
    isRealtimePunch && Boolean(existing?.check_in)
      ? 'CHECK_OUT'
      : params.action;

  const nextCheckIn =
    effectiveAction === 'CHECK_IN'
      ? timeStr
      : normalizeHHmm(params.checkInTimeOverride ?? existing?.check_in ?? null);
  const nextCheckOut =
    effectiveAction === 'CHECK_OUT'
      ? isRealtimePunch
        ? liveHHmm
        : timeStr
      : normalizeHHmm(existing?.check_out ?? null);
  const evalResult = evaluateDailyPunch({
    shiftCode: emp.work_shift_code || 'HC-08:00',
    checkIn: nextCheckIn,
    checkOut: nextCheckOut,
    date: dateStr,
    todayDate: todayVN,
    nowHHmm: timeStr,
  });

  const resolvedSource = params.source ?? 'WEB_CLOCK';
  const isBiometric =
    resolvedSource === 'BIOMETRIC_FINGERPRINT' ||
    params.authMethod === 'WEBAUTHN_FINGERPRINT';
  const autoCutoffNote =
    evalResult.status === 'MISSING_PUNCH' &&
    nextCheckIn &&
    !nextCheckOut &&
    dateStr === todayVN
      ? DAILY_AUTO_CUTOFF_NOTE
      : undefined;

  const saved = upsertDailyAttendanceInternal({
    id: existing?.id ?? `datt-${dateStr.replace(/-/g, '')}-${emp.employee_code.slice(-3)}`,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    date: dateStr,
    shift_code: emp.work_shift_code || 'HC-08:00',
    check_in: nextCheckIn,
    check_out: nextCheckOut,
    late_minutes: evalResult.late_minutes,
    early_leave_minutes: evalResult.early_leave_minutes,
    workday_value: evalResult.workday_value,
    overtime_hours: existing?.overtime_hours ?? 0,
    status: evalResult.status,
    note: params.note ?? autoCutoffNote ?? existing?.note,
    source: resolvedSource,
    auth_method:
      params.authMethod ??
      (isBiometric ? 'WEBAUTHN_FINGERPRINT' : existing?.auth_method ?? 'MANUAL_WEB'),
    biometric_device_label: params.biometricDeviceLabel ?? existing?.biometric_device_label,
    verified_network_ip: params.verifiedNetworkIp ?? existing?.verified_network_ip,
    wifi_match_mode: params.wifiMatchMode ?? existing?.wifi_match_mode,
  });

  recomputeMonthlyAttendance(dateStr.slice(0, 7), emp.id);

  recordAuditLog({
    actor_name: emp.full_name,
    actor_code: emp.employee_code,
    actor_role: emp.role_code,
    action: isBiometric ? 'BIOMETRIC_CHECK_IN_OUT' : 'CHECK_IN_OUT',
    target: `${emp.employee_code} · ${dateStr}`,
    detail: isBiometric
      ? `Chấm công vân tay ${effectiveAction === 'CHECK_IN' ? 'Check-in' : 'Check-out'} lúc ${timeStr} qua [${params.biometricDeviceLabel || 'Thiết bị sinh trắc học'}] · WiFi IP ${params.verifiedNetworkIp || 'Nội bộ'} (${params.wifiMatchMode || 'SAME_WIFI'}) -> ${saved.status} (${saved.workday_value} công).`
      : `Thực hiện ${effectiveAction === 'CHECK_IN' ? 'Check-in' : 'Check-out'} lúc ${timeStr} -> trạng thái ${saved.status} (${saved.workday_value} công).`,
  });

  return saved;
}

export function importDailyAttendances(
  rows: Array<{
    employee_code: string;
    date: string;
    check_in?: string | null;
    check_out?: string | null;
    shift_code?: string;
    overtime_hours?: number;
    note?: string;
  }>,
  actorName = 'HR Admin'
): {
  importedCount: number;
  missingPunchCount: number;
  records: DailyAttendanceRecord[];
} {
  const allEmps = getAllRuntimeEmployees();
  const current = getDailyAttendances();
  const importedRecords: DailyAttendanceRecord[] = [];
  const affectedMonths = new Set<string>();
  let missingPunchCount = 0;

  const workingMap = new Map<string, DailyAttendanceRecord>();
  for (const item of current) {
    workingMap.set(`${item.employee_code}:${item.date}`, item);
  }

  for (const row of rows) {
    const emp = allEmps.find((e) => e.employee_code === row.employee_code.trim());
    if (!emp) continue;
    const shiftCode = row.shift_code || emp.work_shift_code || 'HC-08:00';
    const evalRes = evaluateDailyPunch({
      shiftCode,
      checkIn: row.check_in ?? null,
      checkOut: row.check_out ?? null,
    });
    if (evalRes.status === 'MISSING_PUNCH') {
      missingPunchCount += 1;
    }
    const key = `${emp.employee_code}:${row.date}`;
    const prev = workingMap.get(key);
    const nextRec: DailyAttendanceRecord = {
      id: prev?.id ?? `datt-imp-${row.date.replace(/-/g, '')}-${emp.employee_code.slice(-3)}`,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      date: row.date,
      shift_code: shiftCode,
      check_in: row.check_in ?? null,
      check_out: row.check_out ?? null,
      late_minutes: evalRes.late_minutes,
      early_leave_minutes: evalRes.early_leave_minutes,
      workday_value: evalRes.workday_value,
      overtime_hours: row.overtime_hours ?? prev?.overtime_hours ?? 0,
      status: evalRes.status,
      note:
        row.note ??
        (evalRes.status === 'MISSING_PUNCH'
          ? 'Thiếu 1 đầu chấm công từ dữ liệu máy sinh trắc học (0 công đến khi duyệt giải trình).'
          : undefined),
      source: 'BIOMETRIC_IMPORT',
    };
    workingMap.set(key, nextRec);
    importedRecords.push(nextRec);
    affectedMonths.add(row.date.slice(0, 7));
  }

  const mergedAll = Array.from(workingMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  writeStorageArray(STORAGE_DAILY_ATTENDANCE_KEY, mergedAll);

  for (const month of Array.from(affectedMonths)) {
    recomputeMonthlyAttendance(month);
  }

  recordAuditLog({
    actor_name: actorName,
    actor_code: 'HR-ATT',
    actor_role: 'HR_MANAGER',
    action: 'ATTENDANCE_IMPORT',
    target: `Import ${importedRecords.length} dòng chấm công`,
    detail: `Đã đồng bộ ${importedRecords.length} bản ghi chấm công máy vân tay (phát hiện ${missingPunchCount} ca quên chấm công MISSING_PUNCH).`,
  });

  return {
    importedCount: importedRecords.length,
    missingPunchCount,
    records: importedRecords,
  };
}

export function getMonthlyAttendances(
  periodMonth?: string
): MonthlyAttendanceSummary[] {
  const runtimeList =
    readStorageArray<MonthlyAttendanceSummary>(STORAGE_MONTHLY_ATTENDANCE_KEY) ?? [];
  const baseList = MOCK_MONTHLY_ATTENDANCE;

  const baseIds = new Set(baseList.map((m) => m.id));
  const merged = [
    ...runtimeList.filter((rt) => !baseIds.has(rt.id)),
    ...baseList.map((base) => runtimeList.find((rt) => rt.id === base.id) ?? base),
  ];

  return periodMonth
    ? merged.filter((m) => m.month_period === periodMonth)
    : merged;
}

export function recomputeMonthlyAttendance(
  periodMonth = '2026-11',
  targetEmployeeIdOrCode?: string
): MonthlyAttendanceSummary[] {
  const allEmployees = getAllRuntimeEmployees();
  const currentMonthly = MOCK_MONTHLY_ATTENDANCE;
  const dailyInMonth = getDailyAttendances(periodMonth);
  const allRequests = mergeWithRuntimeRequests(MOCK_LEAVE_OVERTIME_REQUESTS);

  const employeesToProcess = targetEmployeeIdOrCode
    ? allEmployees.filter(
        (e) =>
          e.id === targetEmployeeIdOrCode ||
          e.employee_code === targetEmployeeIdOrCode
      )
    : allEmployees.filter((e) => e.employment_status !== 'RESIGNED');

  const runtimeSaved =
    readStorageArray<MonthlyAttendanceSummary>(STORAGE_MONTHLY_ATTENDANCE_KEY) ?? [];
  const runtimeMap = new Map<string, MonthlyAttendanceSummary>();
  for (const item of runtimeSaved) {
    runtimeMap.set(`${item.employee_code}:${item.month_period}`, item);
  }

  const seedDailyIds = new Set(SEED_DAILY_ATTENDANCES_2026_11.map((s) => s.id));
  const seedEmployeeIds = new Set(MOCK_EMPLOYEES.map((e) => e.id));
  const seedEmployeeCodes = new Set(MOCK_EMPLOYEES.map((e) => e.employee_code));

  for (const emp of employeesToProcess) {
    const baseSummary = currentMonthly.find(
      (m) =>
        (m.employee_id === emp.id || m.employee_code === emp.employee_code) &&
        m.month_period === periodMonth
    );
    const empDaily = dailyInMonth.filter(
      (d) => d.employee_id === emp.id || d.employee_code === emp.employee_code
    );
    const nonSeedDaily = empDaily.filter(
      (d) => d.source !== 'SEED' || !seedDailyIds.has(d.id)
    );
    const isSeedMockEmployee =
      seedEmployeeIds.has(emp.id) || seedEmployeeCodes.has(emp.employee_code);
    const hasDailyAttendance = isSeedMockEmployee
      ? nonSeedDaily.length > 0
      : empDaily.length > 0;
    const missingCount = empDaily.filter((d) => d.status === 'MISSING_PUNCH').length;

    const approvedRuntimeReqs = allRequests.filter(
      (r) =>
        (r.employee_id === emp.id || r.employee_code === emp.employee_code) &&
        (r.approval_status === 'APPROVED' || r.status === 'APPROVED') &&
        r.start_datetime.startsWith(periodMonth) &&
        r.id !== 'req-005'
    );

    let paidLeaveDelta = 0;
    let unpaidLeaveDelta = 0;
    let otWeekdayDelta = 0;
    let otWeekendDelta = 0;
    let otHolidayDelta = 0;
    let explainedWorkdayGain = 0;

    for (const req of approvedRuntimeReqs) {
      if (req.request_category === 'ANNUAL_LEAVE' || req.request_category === 'SICK_LEAVE') {
        paidLeaveDelta += req.duration_days_or_hours;
      } else if (req.request_category === 'UNPAID_LEAVE') {
        unpaidLeaveDelta += req.duration_days_or_hours;
      } else if (req.request_category === 'OVERTIME') {
        const hrs = req.ot_hours ?? req.duration_days_or_hours;
        if (req.ot_day_type === 'HOLIDAY' || req.ot_multiplier === 3) {
          otHolidayDelta += hrs;
        } else if (req.ot_day_type === 'WEEKEND' || req.ot_multiplier === 2) {
          otWeekendDelta += hrs;
        } else {
          otWeekdayDelta += hrs;
        }
      } else if (req.request_category === 'LATE_EXPLANATION') {
        const fixedRec = empDaily.find((d) => d.explanation_request_id === req.id);
        explainedWorkdayGain += fixedRec ? fixedRec.workday_value : 1;
      }
    }

    const prevRuntime = runtimeMap.get(`${emp.employee_code}:${periodMonth}`);
    if (
      !baseSummary &&
      !prevRuntime &&
      !hasDailyAttendance &&
      approvedRuntimeReqs.length === 0
    ) {
      continue;
    }
    const standardDays = baseSummary?.standard_work_days ?? 22;
    const basePaidLeave = (baseSummary?.paid_leave_days ?? 0) + paidLeaveDelta;
    const baseUnpaidLeave = (baseSummary?.unpaid_leave_days ?? 0) + unpaidLeaveDelta;
    const rawActual =
      baseSummary
        ? Math.max(
            0,
            Math.min(
              standardDays - basePaidLeave - baseUnpaidLeave,
              baseSummary.actual_work_days - missingCount + explainedWorkdayGain
            )
          )
        : Math.max(
            0,
            Math.min(
              standardDays - basePaidLeave - baseUnpaidLeave,
              empDaily
                .filter((d) => d.status !== 'PAID_LEAVE' && d.status !== 'SICK_LEAVE')
                .reduce((acc, d) => acc + d.workday_value, 0)
            )
          );

    const lateCount = Math.max(
      baseSummary?.late_occurrences ?? 0,
      empDaily.filter((d) => d.late_minutes > 0).length
    );
    const earlyCount = Math.max(
      baseSummary?.early_leave_occurrences ?? 0,
      empDaily.filter((d) => d.early_leave_minutes > 0 && d.status !== 'HALF_DAY').length
    );

    const weekdayOt = (baseSummary?.overtime_hours_weekday ?? 0) + otWeekdayDelta;
    const weekendOt = (baseSummary?.overtime_hours_weekend ?? 0) + otWeekendDelta;
    const holidayOt = (baseSummary?.overtime_hours_holiday ?? 0) + otHolidayDelta;

    const summary: MonthlyAttendanceSummary = {
      id:
        baseSummary?.id ??
        prevRuntime?.id ??
        `att-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      position_name: emp.position_name,
      shift_code: emp.work_shift_code || 'HC-08:00',
      month_period: periodMonth,
      standard_work_days: standardDays,
      actual_work_days: rawActual,
      paid_leave_days: basePaidLeave,
      unpaid_leave_days: baseUnpaidLeave,
      late_occurrences: lateCount,
      early_leave_occurrences: earlyCount,
      overtime_hours_weekday: weekdayOt,
      overtime_hours_weekend: weekendOt,
      overtime_hours_holiday: holidayOt,
      total_overtime_hours: weekdayOt + weekendOt + holidayOt,
      attendance_status:
        prevRuntime?.attendance_status === 'LOCKED' ||
        baseSummary?.attendance_status === 'LOCKED'
          ? 'LOCKED'
          : missingCount > 0
            ? 'NEEDS_REVIEW'
            : 'VERIFIED',
    };
    runtimeMap.set(`${emp.employee_code}:${periodMonth}`, summary);
  }

  writeStorageArray(
    STORAGE_MONTHLY_ATTENDANCE_KEY,
    Array.from(runtimeMap.values())
  );
  return getMonthlyAttendances(periodMonth);
}

export function getLeaveBalances(year = 2026): AnnualLeaveBalance[] {
  const runtimeList =
    readStorageArray<AnnualLeaveBalance>(STORAGE_LEAVE_BALANCES_KEY) ?? [];
  const baseList = MOCK_ANNUAL_LEAVE_BALANCES.filter((b) => b.year === year);

  const baseIds = new Set(baseList.map((b) => b.id));
  const baseEmpCodes = new Set(baseList.map((b) => b.employee_code));

  const mergedBase = baseList.map((base) => {
    const override = runtimeList.find(
      (rt) =>
        rt.year === year &&
        (rt.id === base.id || rt.employee_code === base.employee_code)
    );
    return override ?? base;
  });

  const brandNew = runtimeList.filter(
    (rt) =>
      rt.year === year &&
      !baseIds.has(rt.id) &&
      !baseEmpCodes.has(rt.employee_code)
  );

  const allEmployees = getAllRuntimeEmployees();
  const empById = new Map<string, Employee>();
  const empByCode = new Map<string, Employee>();
  for (const emp of allEmployees) {
    if (emp.id) empById.set(emp.id, emp);
    if (emp.employee_code) empByCode.set(emp.employee_code, emp);
  }

  const existing = [...brandNew, ...mergedBase].filter((b) => {
    const emp =
      (b.employee_id ? empById.get(b.employee_id) : undefined) ??
      (b.employee_code ? empByCode.get(b.employee_code) : undefined);
    if (!emp) return false;
    return (
      isOfficialEmployeeStatus(emp.employment_status) ||
      emp.employment_status === 'NOTICE_PERIOD' ||
      emp.employment_status === 'ON_LEAVE'
    );
  });
  const coveredEmpIds = new Set(
    existing.map((b) => b.employee_id).filter(Boolean)
  );
  const coveredEmpCodes = new Set(
    existing.map((b) => b.employee_code).filter(Boolean)
  );

  const officialFallbacks: AnnualLeaveBalance[] = [];
  for (const emp of allEmployees) {
    if (!isOfficialEmployeeStatus(emp.employment_status)) continue;
    if (coveredEmpIds.has(emp.id) || coveredEmpCodes.has(emp.employee_code)) {
      continue;
    }

    const nearestRuntime = runtimeList
      .filter(
        (rt) =>
          rt.employee_id === emp.id || rt.employee_code === emp.employee_code
      )
      .sort(
        (a, b) =>
          Math.abs(a.year - year) - Math.abs(b.year - year) || b.year - a.year
      )[0];

    const fallbackRecord: AnnualLeaveBalance = nearestRuntime
      ? {
          ...nearestRuntime,
          id: `alb-rt-${emp.employee_code || emp.id}-${year}`,
          employee_id: emp.id,
          employee_code: emp.employee_code,
          full_name: emp.full_name,
          department_name: emp.department_name,
          year,
          carried_over_days: 0,
          used_days: 0,
          pending_days: 0,
          remaining_days: nearestRuntime.total_entitled_days,
        }
      : {
          id: `alb-rt-${emp.employee_code || emp.id}-${year}`,
          employee_id: emp.id,
          employee_code: emp.employee_code,
          full_name: emp.full_name,
          department_name: emp.department_name,
          year,
          total_entitled_days: 12,
          carried_over_days: 0,
          used_days: 0,
          pending_days: 0,
          remaining_days: 12,
        };

    coveredEmpIds.add(emp.id);
    coveredEmpCodes.add(emp.employee_code);
    officialFallbacks.push(fallbackRecord);
  }

  return [...existing, ...officialFallbacks];
}

export function saveLeaveBalance(
  balance: AnnualLeaveBalance
): AnnualLeaveBalance {
  const current =
    readStorageArray<AnnualLeaveBalance>(STORAGE_LEAVE_BALANCES_KEY) ?? [];
  const idx = current.findIndex(
    (b) =>
      b.id === balance.id ||
      (b.employee_code === balance.employee_code && b.year === balance.year)
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? balance : item))
      : [balance, ...current];
  writeStorageArray(STORAGE_LEAVE_BALANCES_KEY, updated);
  return balance;
}

export function applyApprovedRequestSideEffects(
  request: LeaveOvertimeRequest
): {
  request: LeaveOvertimeRequest;
  leaveBalance: AnnualLeaveBalance | null;
  dailyRecord: DailyAttendanceRecord | null;
  monthlySummary: MonthlyAttendanceSummary | null;
} {
  const targetDate = (
    request.target_date ||
    request.start_datetime.slice(0, 10)
  ).slice(0, 10);
  const periodMonth = targetDate.slice(0, 7);
  const yearNum = Number.parseInt(targetDate.slice(0, 4), 10) || 2026;

  if (request.side_effects_applied) {
    return {
      request,
      leaveBalance:
        getLeaveBalances(yearNum).find(
          (b) =>
            b.employee_id === request.employee_id ||
            b.employee_code === request.employee_code
        ) ?? null,
      dailyRecord:
        getDailyAttendances(periodMonth, request.employee_code).find(
          (d) => d.date === targetDate
        ) ?? null,
      monthlySummary:
        getMonthlyAttendances(periodMonth).find(
          (m) => m.employee_code === request.employee_code
        ) ?? null,
    };
  }

  let updatedBalance: AnnualLeaveBalance | null = null;
  let updatedDaily: DailyAttendanceRecord | null = null;
  const emp = getAllRuntimeEmployees().find(
    (e) =>
      e.id === request.employee_id || e.employee_code === request.employee_code
  );
  const shiftCode = emp?.work_shift_code || 'HC-08:30';

  if (request.request_category === 'ANNUAL_LEAVE') {
    const balances = getLeaveBalances(yearNum);
    const currentBal =
      balances.find(
        (b) =>
          b.employee_id === request.employee_id ||
          b.employee_code === request.employee_code
      ) ?? {
        id: `alb-rt-${Date.now()}`,
        employee_id: request.employee_id,
        employee_code: request.employee_code,
        full_name: request.full_name,
        department_name: request.department_name,
        year: yearNum,
        total_entitled_days: 12,
        carried_over_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: 12,
      };
    const days = request.duration_days_or_hours;
    updatedBalance = saveLeaveBalance({
      ...currentBal,
      used_days: currentBal.used_days + days,
      pending_days: Math.max(0, currentBal.pending_days - days),
      remaining_days: Math.max(0, currentBal.remaining_days - days),
    });

    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-lv-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: null,
      check_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 1,
      overtime_hours: 0,
      status: 'PAID_LEAVE',
      note: `Nghỉ phép năm đã duyệt (${request.request_code}) — tính 1.0 công hưởng lương.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'UNPAID_LEAVE') {
    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-ulv-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: null,
      check_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      overtime_hours: 0,
      status: 'UNPAID_LEAVE',
      note: `Nghỉ không hưởng lương (${request.request_code}) — tính 0.0 công.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'SICK_LEAVE') {
    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-slv-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: null,
      check_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 1,
      overtime_hours: 0,
      status: 'SICK_LEAVE',
      note: `Nghỉ ốm chế độ BHXH đã duyệt (${request.request_code}).`,
      source: 'REQUEST_SYNC',
    });
  } else if (
    request.request_category === 'REMOTE_WORK' ||
    request.request_category === 'BUSINESS_TRIP' ||
    request.request_category === 'OVERSEAS_BUSINESS_TRIP'
  ) {
    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-wfh-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: '08:30',
      check_out: '17:30',
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 1,
      overtime_hours: 0,
      status: 'REMOTE_WORK',
      note: `${request.category_label} (${request.request_code}) — tính 1.0 công.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'LATE_EXPLANATION') {
    const existingDaily = getDailyAttendances(
      periodMonth,
      request.employee_code
    ).find((d) => d.date === targetDate);
    const resolvedCheckIn =
      request.actual_check_in || existingDaily?.check_in || '08:30';
    const resolvedCheckOut =
      request.actual_check_out || existingDaily?.check_out || '17:30';
    const evalFixed = evaluateDailyPunch({
      shiftCode: existingDaily?.shift_code || shiftCode,
      checkIn: resolvedCheckIn,
      checkOut: resolvedCheckOut,
    });
    const fixedWorkday: 1 | 0.5 | 0 =
      evalFixed.workday_value > 0 ? evalFixed.workday_value : 1;

    updatedDaily = upsertDailyAttendanceInternal({
      id:
        existingDaily?.id ??
        `datt-exp-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: existingDaily?.shift_code || shiftCode,
      check_in: resolvedCheckIn,
      check_out: resolvedCheckOut,
      late_minutes: evalFixed.late_minutes,
      early_leave_minutes: evalFixed.early_leave_minutes,
      workday_value: fixedWorkday,
      overtime_hours: existingDaily?.overtime_hours ?? 0,
      status: fixedWorkday === 0.5 ? 'HALF_DAY' : 'PRESENT',
      explanation_request_id: request.id,
      note: `Đã duyệt giải trình chấm công (${request.request_code}: ${resolvedCheckIn} - ${resolvedCheckOut}) -> phục hồi ${fixedWorkday} công.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'OVERTIME') {
    const otHours = request.ot_hours ?? request.duration_days_or_hours;
    const existingDaily = getDailyAttendances(
      periodMonth,
      request.employee_code
    ).find((d) => d.date === targetDate);
    if (existingDaily) {
      updatedDaily = upsertDailyAttendanceInternal({
        ...existingDaily,
        overtime_hours: (existingDaily.overtime_hours || 0) + otHours,
        ot_multiplier: request.ot_multiplier ?? 1.5,
      });
    }
  }

  const stampedRequest: LeaveOvertimeRequest = {
    ...request,
    leave_deducted:
      request.request_category === 'ANNUAL_LEAVE' ? true : request.leave_deducted,
    side_effects_applied: true,
  };
  saveRuntimeRequest(stampedRequest);

  const monthlyList = recomputeMonthlyAttendance(periodMonth, request.employee_id);
  const monthlySummary =
    monthlyList.find((m) => m.employee_code === request.employee_code) ?? null;

  return {
    request: stampedRequest,
    leaveBalance: updatedBalance,
    dailyRecord: updatedDaily,
    monthlySummary,
  };
}

export function handleRequestLifecycleChange(
  request: LeaveOvertimeRequest,
  prevStatus?: MultiStepRequestStatus | RequestApprovalStatus
): LeaveOvertimeRequest {
  const effectiveStatus = request.status ?? request.approval_status;
  const yearNum =
    Number.parseInt(request.start_datetime.slice(0, 4), 10) || 2026;

  // Newly submitted ANNUAL_LEAVE -> reserve pending_days
  if (
    !prevStatus &&
    (effectiveStatus === 'PENDING' || effectiveStatus === 'IN_PROGRESS') &&
    request.request_category === 'ANNUAL_LEAVE'
  ) {
    const curBal = getLeaveBalances(yearNum).find(
      (b) =>
        b.employee_id === request.employee_id ||
        b.employee_code === request.employee_code
    );
    if (curBal) {
      if (request.duration_days_or_hours > curBal.remaining_days) {
        throw new Error(
          `Số ngày xin nghỉ phép năm (${request.duration_days_or_hours} ngày) vượt quá quỹ phép còn lại (${curBal.remaining_days} ngày). Vui lòng giảm số ngày hoặc tách sang đơn Nghỉ không lương.`
        );
      }
      saveLeaveBalance({
        ...curBal,
        pending_days: curBal.pending_days + request.duration_days_or_hours,
      });
    }
  }

  // Rejected or Cancelled -> release reserved pending_days
  if (
    (prevStatus === 'PENDING' || prevStatus === 'IN_PROGRESS') &&
    (effectiveStatus === 'REJECTED' || effectiveStatus === 'CANCELLED') &&
    request.request_category === 'ANNUAL_LEAVE' &&
    !request.side_effects_applied
  ) {
    const curBal = getLeaveBalances(yearNum).find(
      (b) =>
        b.employee_id === request.employee_id ||
        b.employee_code === request.employee_code
    );
    if (curBal) {
      saveLeaveBalance({
        ...curBal,
        pending_days: Math.max(
          0,
          curBal.pending_days - request.duration_days_or_hours
        ),
      });
    }
  }

  saveRuntimeRequest(request);

  if (
    effectiveStatus === 'APPROVED' ||
    request.approval_status === 'APPROVED'
  ) {
    return applyApprovedRequestSideEffects(request).request;
  }

  return request;
}

function countWeekdaysInRange(startIso: string, endIso: string): number {
  const s = startIso.slice(0, 10).split('-').map(Number);
  const e = endIso.slice(0, 10).split('-').map(Number);
  if (s.length !== 3 || e.length !== 3) return 0;
  let cur = Date.UTC(s[0], s[1] - 1, s[2]);
  const end = Date.UTC(e[0], e[1] - 1, e[2]);
  let count = 0;
  while (cur <= end) {
    const dow = new Date(cur).getUTCDay();
    if (dow >= 1 && dow <= 5) count += 1;
    cur += 86400000;
  }
  return count;
}

function getMonthBoundsIso(periodMonth: string): {
  firstDay: string;
  lastDay: string;
} {
  const [yStr, mStr] = periodMonth.split('-');
  const y = Number.parseInt(yStr, 10) || 2026;
  const m = Number.parseInt(mStr, 10) || 11;
  const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDate = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
  return { firstDay, lastDay };
}

export function getPayrollRecords(periodMonth?: string): PayrollRecord[] {
  const runtimeList = readStorageArray<PayrollRecord>(STORAGE_PAYROLLS_KEY) ?? [];
  const baseList = MOCK_PAYROLL_RECORDS;

  const baseIds = new Set(baseList.map((p) => p.id));
  const baseCodes = new Set(baseList.map((p) => p.payslip_code));

  const mergedBase = baseList.map((baseItem) => {
    const override = runtimeList.find(
      (rt) =>
        rt.id === baseItem.id ||
        rt.payslip_code === baseItem.payslip_code ||
        (rt.employee_code === baseItem.employee_code &&
          rt.period_month === baseItem.period_month &&
          !rt.is_final_settlement)
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) =>
      !baseIds.has(rt.id) &&
      !baseCodes.has(rt.payslip_code) &&
      !baseList.some(
        (b) =>
          b.employee_code === rt.employee_code &&
          b.period_month === rt.period_month &&
          !rt.is_final_settlement
      )
  );

  const combined = [...brandNew, ...mergedBase];
  return periodMonth
    ? combined.filter((p) => p.period_month === periodMonth)
    : combined;
}

export function savePayrollRecord(record: PayrollRecord): PayrollRecord {
  const current = readStorageArray<PayrollRecord>(STORAGE_PAYROLLS_KEY) ?? [];
  const idx = current.findIndex(
    (p) =>
      p.id === record.id ||
      p.payslip_code === record.payslip_code ||
      (p.employee_code === record.employee_code &&
        p.period_month === record.period_month &&
        Boolean(p.is_final_settlement) === Boolean(record.is_final_settlement))
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? record : item))
      : [record, ...current];
  writeStorageArray(STORAGE_PAYROLLS_KEY, updated);
  return record;
}

export function calculateMonthlyPayrolls(
  periodMonth = '2026-11',
  actorName = 'Phòng Nhân sự (C&B)'
): PayrollRecord[] {
  recomputeMonthlyAttendance(periodMonth);
  const allEmps = getAllRuntimeEmployees().filter(
    (e) =>
      e.employment_status !== 'PENDING_ONBOARD' &&
      (e.employment_status !== 'RESIGNED' ||
        (e.resigned_date && e.resigned_date.startsWith(periodMonth)))
  );
  const monthlySummaries = getMonthlyAttendances(periodMonth);
  const contracts = getContracts();
  const existingPayrolls = getPayrollRecords(periodMonth);
  const reviews = getPerformanceReviews();
  const clearances = getClearanceChecklists();
  const { firstDay, lastDay } = getMonthBoundsIso(periodMonth);
  const totalWeekdays = Math.max(1, countWeekdaysInRange(firstDay, lastDay));

  const computedList: PayrollRecord[] = [];

  for (const emp of allEmps) {
    const existingRec = existingPayrolls.find(
      (p) => p.employee_code === emp.employee_code && !p.is_final_settlement
    );
    if (existingRec?.payment_status === 'PAID') {
      computedList.push(existingRec);
      continue;
    }

    const att = monthlySummaries.find(
      (m) => m.employee_code === emp.employee_code || m.employee_id === emp.id
    );
    const standardDays =
      att?.standard_work_days ?? MOCK_PAYROLL_FORMULA.standard_work_days_per_month;
    const paidLeaveDays = att?.paid_leave_days ?? 0;
    const unpaidLeaveDays = att?.unpaid_leave_days ?? 0;
    const actualWorkDays = att?.actual_work_days ?? standardDays - paidLeaveDays - unpaidLeaveDays;
    const actualPaidDays = Math.min(
      standardDays,
      Math.max(0, actualWorkDays + paidLeaveDays)
    );

    const activeContract = contracts.find(
      (c) =>
        (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
        c.status !== 'EXPIRED' &&
        !c.is_addendum
    );
    const isProbation =
      emp.employment_status === 'PROBATION' ||
      activeContract?.contract_type === 'PROBATION_2M' ||
      (emp.contract_type === 'PROBATION_2M' && emp.employment_status !== 'OFFICIAL' && emp.employment_status !== 'ACTIVE');

    // Check CareerHistoryEntry for mid-month salary split inside periodMonth
    const empHistories = getCareerHistories(emp.id).filter(
      (h) =>
        h.effective_date.startsWith(periodMonth) &&
        h.old_salary_vnd !== h.new_salary_vnd
    );
    const splitHistory = empHistories[0] ?? null;

    let proratedBaseVnd = Math.round(
      (emp.base_salary_vnd * actualPaidDays) / standardDays
    );
    let midMonthSplit: MidMonthSalarySplit | null = null;

    if (splitHistory) {
      const dayBeforeEff = addDaysIso(splitHistory.effective_date, -1);
      const weekdaysOld =
        splitHistory.effective_date > firstDay
          ? countWeekdaysInRange(firstDay, dayBeforeEff)
          : 0;
      const weekdaysNew = Math.max(0, totalWeekdays - weekdaysOld);

      if (weekdaysOld > 0 && weekdaysNew > 0) {
        const daysAtOld =
          Math.round((actualPaidDays * (weekdaysOld / totalWeekdays)) * 2) / 2;
        const daysAtNew = Math.max(
          0,
          Number((actualPaidDays - daysAtOld).toFixed(1))
        );
        const oldProrated = Math.round(
          (splitHistory.old_salary_vnd * daysAtOld) / standardDays
        );
        const newProrated = Math.round(
          (splitHistory.new_salary_vnd * daysAtNew) / standardDays
        );
        proratedBaseVnd = oldProrated + newProrated;
        midMonthSplit = {
          effective_date: splitHistory.effective_date,
          decision_no: splitHistory.decision_no,
          old_salary_vnd: splitHistory.old_salary_vnd,
          days_at_old_salary: daysAtOld,
          old_prorated_vnd: oldProrated,
          new_salary_vnd: splitHistory.new_salary_vnd,
          days_at_new_salary: daysAtNew,
          new_prorated_vnd: newProrated,
        };
      }
    }

    const hourlyWage = emp.base_salary_vnd / (standardDays * 8);
    const weekdayOt = att?.overtime_hours_weekday ?? 0;
    const weekendOt = att?.overtime_hours_weekend ?? 0;
    const holidayOt = att?.overtime_hours_holiday ?? 0;
    const totalOtHours = weekdayOt + weekendOt + holidayOt;
    const computedOtPay = Math.round(
      weekdayOt * hourlyWage * 1.5 +
        weekendOt * hourlyWage * 2.0 +
        holidayOt * hourlyWage * 3.0
    );
    const overtimePayVnd =
      att ? computedOtPay : existingRec?.overtime_pay_vnd ?? 0;

    const latestApprovedReview = reviews.find(
      (r) =>
        (r.employee_id === emp.id || r.employee_code === emp.employee_code) &&
        r.status === 'APPROVED' &&
        typeof r.suggested_bonus_vnd === 'number'
    );
    const kpiBonusVnd =
      existingRec && existingRec.kpi_bonus_vnd > 0
        ? existingRec.kpi_bonus_vnd
        : (latestApprovedReview?.suggested_bonus_vnd ?? existingRec?.kpi_bonus_vnd ?? 0);

    const allowanceRatio = actualPaidDays > 0 ? 1 : 0;
    const mealVnd = emp.allowance_meal_vnd * allowanceRatio;
    const transportVnd = emp.allowance_transport_vnd * allowanceRatio;
    const positionVnd = emp.allowance_position_vnd * allowanceRatio;

    const grossSalaryVnd =
      proratedBaseVnd +
      mealVnd +
      transportVnd +
      positionVnd +
      overtimePayVnd +
      kpiBonusVnd;

    const insuranceBaseVnd = isProbation
      ? 0
      : Math.min(
          emp.base_salary_vnd,
          MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd
        );
    const bhxhVnd = isProbation
      ? 0
      : Math.round(insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhxh_employee_rate);
    const bhytVnd = isProbation
      ? 0
      : Math.round(insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhyt_employee_rate);
    const bhtnVnd = isProbation
      ? 0
      : Math.round(insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhtn_employee_rate);
    const totalInsuranceVnd = bhxhVnd + bhytVnd + bhtnVnd;

    const personalDeduction = MOCK_PAYROLL_FORMULA.personal_deduction_vnd;
    const dependentDeduction =
      emp.dependents_count * MOCK_PAYROLL_FORMULA.dependent_deduction_vnd;
    const taxableIncomeVnd = Math.max(
      0,
      grossSalaryVnd - totalInsuranceVnd - personalDeduction - dependentDeduction
    );
    const pitTaxVnd = calculateProgressivePitVnd(taxableIncomeVnd);

    const empClearance = clearances.find(
      (cl) => cl.employee_code === emp.employee_code || cl.employee_id === emp.id
    );
    const advanceDeductionVnd =
      existingRec?.advance_deduction_vnd ??
      empClearance?.advance_deduction_vnd ??
      0;
    const penaltyDeductionVnd =
      existingRec?.penalty_deduction_vnd ?? empClearance?.total_penalty_vnd ?? 0;

    const netSalaryVnd = Math.max(
      0,
      grossSalaryVnd -
        totalInsuranceVnd -
        pitTaxVnd -
        advanceDeductionVnd -
        penaltyDeductionVnd
    );

    const employerInsuranceVnd = isProbation
      ? 0
      : Math.round(insuranceBaseVnd * 0.235);
    const employerTotalCostVnd = grossSalaryVnd + employerInsuranceVnd;

    const nextRecord: PayrollRecord = {
      id:
        existingRec?.id ??
        `pay-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
      payslip_code:
        existingRec?.payslip_code ??
        `PS-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
      period_month: periodMonth,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      position_name: emp.position_name,
      bank_name: emp.bank_name || 'Techcombank',
      bank_account_no: emp.bank_account_no || '-',
      standard_days: standardDays,
      actual_paid_days: actualPaidDays,
      dependents_count: emp.dependents_count,
      base_salary_vnd: emp.base_salary_vnd,
      prorated_base_salary_vnd: proratedBaseVnd,
      allowance_meal_vnd: mealVnd,
      allowance_transport_vnd: transportVnd,
      allowance_position_vnd: positionVnd,
      overtime_pay_vnd: overtimePayVnd,
      kpi_bonus_vnd: kpiBonusVnd,
      gross_salary_vnd: grossSalaryVnd,
      insurance_base_vnd: insuranceBaseVnd,
      bhxh_employee_vnd: bhxhVnd,
      bhyt_employee_vnd: bhytVnd,
      bhtn_employee_vnd: bhtnVnd,
      total_insurance_employee_vnd: totalInsuranceVnd,
      personal_deduction_vnd: personalDeduction,
      dependent_deduction_vnd: dependentDeduction,
      taxable_income_vnd: taxableIncomeVnd,
      pit_tax_vnd: pitTaxVnd,
      net_salary_vnd: netSalaryVnd,
      employer_total_cost_vnd: employerTotalCostVnd,
      payment_status: existingRec?.payment_status ?? 'DRAFT_CALCULATED',
      paid_at: existingRec?.paid_at ?? null,
      contract_type: activeContract?.contract_type ?? emp.contract_type,
      paid_leave_days: paidLeaveDays,
      unpaid_leave_days: unpaidLeaveDays,
      overtime_hours: totalOtHours,
      advance_deduction_vnd: advanceDeductionVnd,
      penalty_deduction_vnd: penaltyDeductionVnd,
      is_final_settlement: false,
      mid_month_split: midMonthSplit,
      calculation_note: isProbation
        ? 'Hợp đồng thử việc (PROBATION_2M): miễn khấu trừ BHXH/BHYT/BHTN 10.5%.'
        : midMonthSplit
          ? `Tách lương giữa kỳ từ ${midMonthSplit.effective_date} theo ${midMonthSplit.decision_no || 'Quyết định điều chỉnh'}.`
          : undefined,
    };

    savePayrollRecord(nextRecord);
    computedList.push(nextRecord);
  }

  recordAuditLog({
    actor_name: actorName,
    actor_code: 'CB-ENGINE',
    actor_role: 'HR_MANAGER',
    action: 'CALCULATE_PAYROLL',
    target: `Bảng lương kỳ ${periodMonth} (${computedList.length} nhân sự)`,
    detail: `Tổng hợp công thực tế, phép năm, tăng ca, tách lương giữa tháng (mid-month split), BHXH 10.5% (miễn thử việc) và thuế TNCN 7 bậc.`,
  });

  return getPayrollRecords(periodMonth);
}

// ---------------------------------------------------------------------------
// Stage 3: Multi-Cycle Performance Reviews & Immutable Career Progression
// ---------------------------------------------------------------------------

const SEED_PERFORMANCE_REVIEWS: PerformanceReview[] = [
  {
    id: 'prv-001',
    review_code: 'PRV-2026-001',
    employee_id: 'emp-011',
    employee_code: 'NV-2026-011',
    full_name: 'Trương Gia Huy',
    department_id: 'dept-tech-data',
    department_name: 'Phòng Dữ liệu & AI',
    position_name: 'Kỹ sư Dữ liệu (Data Engineer)',
    cycle: 'PROBATION',
    period_label: 'Thử việc 60 ngày (10-11/2026)',
    kpi_score: 90,
    okr_completion_percent: 92,
    grade: 'A',
    result: 'PASS',
    reviewer_id: 'emp-005',
    reviewer_name: 'Vũ Thị Mai Phương',
    goals_summary: 'Xây dựng pipeline ETL đồng bộ dữ liệu nhân sự & tối ưu truy vấn báo cáo.',
    strengths: 'Chủ động nắm bắt kiến trúc hệ thống nhanh, chất lượng mã nguồn sạch.',
    improvements: 'Tăng cường viết tài liệu đặc tả luồng dữ liệu cho thành viên mới.',
    review_note:
      'Đạt 90% mục tiêu thử việc 60 ngày, đề xuất chuyển ký HĐLĐ chính thức 12 tháng hưởng 100% lương từ 01/12/2026.',
    suggested_salary_vnd: 21400000,
    suggested_bonus_vnd: 0,
    status: 'APPROVED',
    reviewed_at: '2026-11-18T10:30:00+07:00',
  },
  {
    id: 'prv-002',
    review_code: 'PRV-2026-002',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_id: 'dept-tech-swe',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_name: 'Kỹ sư Phần mềm Cao cấp (Senior Fullstack)',
    cycle: 'QUARTERLY',
    period_label: '2026-Q3',
    kpi_score: 91,
    okr_completion_percent: 94,
    grade: 'A',
    result: 'EXCELLENT',
    reviewer_id: 'emp-003',
    reviewer_name: 'Lê Hoàng Nam',
    review_note:
      'Đảm bảo uptime dịch vụ thanh toán đạt 99.96%, dẫn dắt kỹ thuật nhóm core hiệu quả.',
    suggested_salary_vnd: 26500000,
    suggested_bonus_vnd: 2500000,
    status: 'APPROVED',
    reviewed_at: '2026-10-05T14:00:00+07:00',
  },
  {
    id: 'prv-003',
    review_code: 'PRV-2026-003',
    employee_id: 'emp-005',
    employee_code: 'NV-2024-005',
    full_name: 'Vũ Thị Mai Phương',
    department_id: 'dept-tech-data',
    department_name: 'Phòng Dữ liệu & AI',
    position_name: 'Trưởng nhóm Kỹ thuật Dữ liệu & AI',
    cycle: 'QUARTERLY',
    period_label: '2026-Q3',
    kpi_score: 96,
    okr_completion_percent: 98,
    grade: 'A+',
    result: 'EXCELLENT',
    reviewer_id: 'emp-003',
    reviewer_name: 'Lê Hoàng Nam',
    review_note:
      'Đưa pipeline sàng lọc hồ sơ ứng viên AI ATS vào vận hành, giảm 60% thời gian đọc CV thủ công.',
    suggested_bonus_vnd: 4000000,
    status: 'APPROVED',
    reviewed_at: '2026-10-06T09:15:00+07:00',
  },
  {
    id: 'prv-004',
    review_code: 'PRV-2026-004',
    employee_id: 'emp-008',
    employee_code: 'NV-2025-008',
    full_name: 'Ngô Thanh Hà',
    department_id: 'dept-hr',
    department_name: 'Phòng Nhân sự & Hành chính',
    position_name: 'Chuyên viên Tiền lương & Phúc lợi (C&B)',
    cycle: 'QUARTERLY',
    period_label: '2026-Q3',
    kpi_score: 89,
    okr_completion_percent: 90,
    grade: 'B+',
    result: 'GOOD',
    reviewer_id: 'emp-002',
    reviewer_name: 'Trần Thị Bích Ngọc',
    review_note:
      'Tính lương và đối soát thuế TNCN chính xác 100% cho toàn công ty trong 3 tháng liên tiếp.',
    suggested_bonus_vnd: 1500000,
    status: 'APPROVED',
    reviewed_at: '2026-10-07T11:00:00+07:00',
  },
  {
    id: 'prv-005',
    review_code: 'PRV-2026-005',
    employee_id: 'emp-024',
    employee_code: 'NV-2026-024',
    full_name: 'Trịnh Khánh Vân',
    department_id: 'dept-sales',
    department_name: 'Khối Kinh doanh',
    position_name: 'Chuyên viên Phát triển Khách hàng Doanh nghiệp',
    cycle: 'ANNUAL',
    period_label: '2026',
    kpi_score: 96,
    okr_completion_percent: 97,
    grade: 'A+',
    result: 'EXCELLENT',
    reviewer_id: 'emp-007',
    reviewer_name: 'Hoàng Minh Đức',
    review_note:
      'Đạt 112% chỉ tiêu doanh thu khách hàng B2B năm 2026, đủ tiêu chuẩn xét bổ nhiệm Trưởng nhóm Kinh doanh.',
    suggested_salary_vnd: 20500000,
    suggested_bonus_vnd: 5000000,
    status: 'APPROVED',
    reviewed_at: '2026-11-15T16:20:00+07:00',
  },
];

export function getPerformanceReviews(
  employeeIdOrCode?: string
): PerformanceReview[] {
  const stored = readStorageArray<PerformanceReview>(
    STORAGE_PERFORMANCE_REVIEWS_KEY
  );
  const all = stored ?? cloneJson(SEED_PERFORMANCE_REVIEWS);
  const filtered = employeeIdOrCode
    ? all.filter(
        (r) =>
          r.employee_id === employeeIdOrCode ||
          r.employee_code === employeeIdOrCode
      )
    : all;
  return filtered.sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));
}

export function savePerformanceReview(
  input: Omit<PerformanceReview, 'id' | 'review_code' | 'reviewed_at'> & {
    id?: string;
    review_code?: string;
    reviewed_at?: string;
  }
): PerformanceReview {
  const current = getPerformanceReviews();
  const nowIso = input.reviewed_at ?? new Date().toISOString();
  const existingIdx = input.id
    ? current.findIndex((r) => r.id === input.id)
    : current.findIndex(
        (r) =>
          r.employee_code === input.employee_code &&
          r.cycle === input.cycle &&
          r.period_label === input.period_label
      );

  const saved: PerformanceReview = {
    ...input,
    id:
      input.id ??
      (existingIdx >= 0 ? current[existingIdx].id : `prv-rt-${Date.now()}`),
    review_code:
      input.review_code ??
      (existingIdx >= 0
        ? current[existingIdx].review_code
        : `PRV-2026-${String(current.length + 1).padStart(3, '0')}`),
    reviewed_at: nowIso,
  };

  const nextList =
    existingIdx >= 0
      ? current.map((item, i) => (i === existingIdx ? saved : item))
      : [saved, ...current];
  writeStorageArray(STORAGE_PERFORMANCE_REVIEWS_KEY, nextList);

  if (saved.status === 'APPROVED') {
    const emp = getAllRuntimeEmployees().find(
      (e) =>
        e.id === saved.employee_id || e.employee_code === saved.employee_code
    );
    if (emp) {
      saveRuntimeEmployee({
        ...emp,
        kpi_completion_rate: saved.kpi_score,
      });
    }
  }

  recordAuditLog({
    actor_name: saved.reviewer_name,
    actor_code: saved.reviewer_id,
    actor_role: 'DEPT_MANAGER',
    action: 'PERFORMANCE_REVIEW',
    target: `${saved.employee_code} · ${saved.period_label}`,
    detail: `Ghi nhận kết quả đánh giá ${saved.cycle} (${saved.kpi_score} điểm, xếp loại ${saved.grade}, kết luận ${saved.result}).`,
  });

  return saved;
}

const SEED_CAREER_HISTORIES: CareerHistoryEntry[] = [
  {
    id: 'ch-seed-001',
    decision_no: 'QĐ-2025-042/LV-NS',
    employee_id: 'emp-005',
    employee_code: 'NV-2024-005',
    full_name: 'Vũ Thị Mai Phương',
    change_type: 'PROMOTION',
    old_department_id: 'dept-tech-data',
    old_department_name: 'Phòng Dữ liệu & AI',
    new_department_id: 'dept-tech-data',
    new_department_name: 'Phòng Dữ liệu & AI',
    old_position_id: 'pos-04',
    old_position_name: 'Kỹ sư Dữ liệu Cao cấp (Senior Data Engineer)',
    new_position_id: 'pos-05',
    new_position_name: 'Trưởng nhóm Kỹ thuật Dữ liệu & AI',
    old_salary_vnd: 25000000,
    new_salary_vnd: 31500000,
    old_role_code: 'EMPLOYEE',
    new_role_code: 'DEPT_MANAGER',
    effective_date: '2025-04-01',
    reason: 'Bổ nhiệm Trưởng nhóm phụ trách Phòng Dữ liệu & AI nhờ thành tích triển khai nền tảng AI nội bộ.',
    signed_by_name: 'Trần Quốc Việt',
    addendum_contract_number: 'PLHD-2025-005',
    created_at: '2025-03-28T10:00:00+07:00',
  },
  {
    id: 'ch-seed-002',
    decision_no: 'QĐ-2025-108/LV-NS',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    change_type: 'SALARY_ADJUSTMENT',
    old_department_id: 'dept-tech-swe',
    old_department_name: 'Phòng Kỹ thuật Phần mềm',
    new_department_id: 'dept-tech-swe',
    new_department_name: 'Phòng Kỹ thuật Phần mềm',
    old_position_id: 'pos-04',
    old_position_name: 'Kỹ sư Phần mềm Fullstack',
    new_position_id: 'pos-04',
    new_position_name: 'Kỹ sư Phần mềm Cao cấp (Senior Fullstack)',
    old_salary_vnd: 18500000,
    new_salary_vnd: 22800000,
    old_role_code: 'EMPLOYEE',
    new_role_code: 'EMPLOYEE',
    effective_date: '2025-09-01',
    reason: 'Nâng bậc Senior và điều chỉnh lương định kỳ sau 2 kỳ KPI liên tiếp đạt hạng A.',
    signed_by_name: 'Trần Thị Bích Ngọc',
    addendum_contract_number: 'PLHD-2025-004',
    created_at: '2025-08-29T15:30:00+07:00',
  },
  {
    id: 'ch-seed-003',
    decision_no: 'QĐ-2026-061/LV-NS',
    employee_id: 'emp-019',
    employee_code: 'NV-2026-019',
    full_name: 'Mai Phương Thảo',
    change_type: 'PROBATION_TO_OFFICIAL',
    old_department_id: 'dept-hr',
    old_department_name: 'Phòng Nhân sự & Hành chính',
    new_department_id: 'dept-hr',
    new_department_name: 'Phòng Nhân sự & Hành chính',
    old_position_id: 'pos-08',
    old_position_name: 'Chuyên viên Quan hệ Lao động (Thử việc)',
    new_position_id: 'pos-08',
    new_position_name: 'Chuyên viên Quan hệ Lao động & Văn hóa Nội bộ',
    old_salary_vnd: 11730000,
    new_salary_vnd: 13800000,
    old_role_code: 'EMPLOYEE',
    new_role_code: 'EMPLOYEE',
    effective_date: '2026-08-01',
    reason: 'Hoàn thành xuất sắc 02 tháng thử việc, ký hợp đồng chính thức hưởng 100% lương.',
    signed_by_name: 'Trần Thị Bích Ngọc',
    addendum_contract_number: 'HDLD-2026-019',
    created_at: '2026-07-30T11:00:00+07:00',
  },
];

export function getCareerHistories(
  employeeIdOrCode?: string
): CareerHistoryEntry[] {
  const stored = readStorageArray<CareerHistoryEntry>(
    STORAGE_CAREER_HISTORIES_KEY
  );
  const all = stored ?? cloneJson(SEED_CAREER_HISTORIES);
  const filtered = employeeIdOrCode
    ? all.filter(
        (h) =>
          h.employee_id === employeeIdOrCode ||
          h.employee_code === employeeIdOrCode
      )
    : all;
  return filtered.sort(
    (a, b) =>
      b.effective_date.localeCompare(a.effective_date) ||
      b.created_at.localeCompare(a.created_at)
  );
}

function appendCareerHistoryEntryInternal(
  entry: CareerHistoryEntry
): CareerHistoryEntry {
  // Immutable append-only store: NEVER overwrites or deletes historical entries
  const existing = getCareerHistories();
  writeStorageArray(STORAGE_CAREER_HISTORIES_KEY, [entry, ...existing]);
  return entry;
}

export function promoteOrTransferEmployee(payload: {
  employeeId: string;
  changeType: CareerChangeType;
  newDepartmentId?: string;
  newPositionId?: string;
  newPositionName?: string;
  newSalaryVnd?: number;
  newRoleCode?: RoleCode;
  effectiveDate: string;
  decisionNo?: string;
  reason: string;
  signedByName: string;
}): {
  careerEntry: CareerHistoryEntry;
  employee: Employee;
  addendumContract: EmploymentContract;
  updatedUser: SystemUserAccount;
} {
  const allEmps = getAllRuntimeEmployees();
  const emp = allEmps.find(
    (e) => e.id === payload.employeeId || e.employee_code === payload.employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy nhân sự cần lập quyết định bổ nhiệm/điều chuyển.');
  }

  const depts = getRuntimeDepartments();
  const targetDept =
    depts.find((d) => d.id === (payload.newDepartmentId || emp.department_id)) ??
    depts[0];
  const matchedPos = payload.newPositionId
    ? MOCK_POSITIONS.find((p) => p.id === payload.newPositionId)
    : undefined;

  const newDeptId = targetDept?.id ?? emp.department_id;
  const newDeptName = targetDept?.department_name ?? emp.department_name;
  const newPosId = payload.newPositionId || matchedPos?.id || emp.position_id;
  const newPosName =
    payload.newPositionName?.trim() ||
    matchedPos?.position_name ||
    emp.position_name;
  const newSalaryVnd = payload.newSalaryVnd ?? emp.base_salary_vnd;
  const newRoleCode = payload.newRoleCode ?? emp.role_code;
  const decisionNo =
    payload.decisionNo?.trim() ||
    `QĐ-${payload.effectiveDate.slice(0, 4)}-${String(getCareerHistories().length + 120)}/LV-NS`;

  // 0. Auto-convert active PROBATION_2M / PROBATION to OFFICIAL + FIXED_TERM_12M on promotion
  const allContracts = getContracts();
  const activeProbationContracts = allContracts.filter(
    (c) =>
      (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
      !c.is_addendum &&
      c.contract_type === 'PROBATION_2M' &&
      c.status !== 'EXPIRED'
  );
  const isPromotionAction =
    payload.changeType === 'PROMOTION' ||
    payload.changeType === 'PROBATION_TO_OFFICIAL' ||
    payload.changeType === 'ROLE_CHANGE' ||
    newRoleCode === 'DEPT_MANAGER';
  const shouldConvertProbation =
    isPromotionAction &&
    (activeProbationContracts.length > 0 ||
      emp.employment_status === 'PROBATION' ||
      emp.contract_type === 'PROBATION_2M');

  let resolvedOfficialContract: EmploymentContract | undefined;
  if (shouldConvertProbation) {
    for (const probContract of activeProbationContracts) {
      saveContract({
        ...probContract,
        status: 'EXPIRED',
        days_until_expiry: 0,
      });
    }

    const existingOfficialContract = allContracts.find(
      (c) =>
        (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
        !c.is_addendum &&
        c.contract_type !== 'PROBATION_2M' &&
        c.status !== 'EXPIRED'
    );

    if (existingOfficialContract) {
      resolvedOfficialContract = saveContract({
        ...existingOfficialContract,
        department_name: newDeptName,
        position_name: newPosName,
        status: 'ACTIVE',
        base_salary_vnd: newSalaryVnd,
        salary_percent: 100,
        official_salary_vnd: newSalaryVnd,
      });
    } else {
      const officialEndDate = addMonthsIso(payload.effectiveDate, 12);
      resolvedOfficialContract = saveContract({
        id: `hd-off-${Date.now()}`,
        contract_number: `HDLD-${payload.effectiveDate.slice(0, 4)}-${emp.employee_code.slice(-3)}`,
        employee_id: emp.id,
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        department_name: newDeptName,
        position_name: newPosName,
        contract_type: 'FIXED_TERM_12M',
        start_date: payload.effectiveDate,
        end_date: officialEndDate,
        days_until_expiry: diffDaysIso(payload.effectiveDate, officialEndDate),
        status: 'ACTIVE',
        base_salary_vnd: newSalaryVnd,
        salary_percent: 100,
        official_salary_vnd: newSalaryVnd,
        signed_date: payload.effectiveDate,
        decision_no: decisionNo,
        notes: `Chuyển chính thức và bổ nhiệm theo quyết định ${decisionNo}.`,
      });
    }

    const existingBalances = getLeaveBalances(2026);
    const hasLeaveBalance = existingBalances.some(
      (b) => b.employee_id === emp.id || b.employee_code === emp.employee_code
    );
    if (!hasLeaveBalance) {
      saveLeaveBalance({
        id: `alb-rt-${Date.now()}`,
        employee_id: emp.id,
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        department_name: newDeptName,
        year: 2026,
        total_entitled_days: 12,
        carried_over_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: 12,
      });
    }
  }

  // 1. Create Contract Addendum in STORAGE_CONTRACTS_KEY
  const parentContract =
    resolvedOfficialContract ??
    getContracts().find(
      (c) =>
        (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
        !c.is_addendum &&
        c.status !== 'EXPIRED'
    );
  const addendumNumber = `PLHD-${payload.effectiveDate.slice(0, 4)}-${emp.employee_code.slice(-3)}-${String(getCareerHistories(emp.id).length + 1).padStart(2, '0')}`;
  const addendumContract: EmploymentContract = {
    id: `hd-add-${Date.now()}`,
    contract_number: addendumNumber,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: newDeptName,
    position_name: newPosName,
    contract_type: 'ADDENDUM',
    start_date: payload.effectiveDate,
    end_date: parentContract?.end_date ?? emp.contract_end_date ?? null,
    days_until_expiry: parentContract?.days_until_expiry ?? null,
    status: 'ACTIVE',
    base_salary_vnd: newSalaryVnd,
    salary_percent: 100,
    official_salary_vnd: newSalaryVnd,
    is_addendum: true,
    parent_contract_id: parentContract?.id ?? null,
    decision_no: decisionNo,
    signed_date: payload.effectiveDate,
    notes: `${payload.reason} (Theo quyết định ${decisionNo}).`,
  };
  saveContract(addendumContract);

  // 2. Append immutable CareerHistoryEntry
  const careerEntry: CareerHistoryEntry = {
    id: `ch-rt-${Date.now()}`,
    decision_no: decisionNo,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    change_type: payload.changeType,
    old_department_id: emp.department_id,
    old_department_name: emp.department_name,
    new_department_id: newDeptId,
    new_department_name: newDeptName,
    old_position_id: emp.position_id,
    old_position_name: emp.position_name,
    new_position_id: newPosId,
    new_position_name: newPosName,
    old_salary_vnd: emp.base_salary_vnd,
    new_salary_vnd: newSalaryVnd,
    old_role_code: emp.role_code,
    new_role_code: newRoleCode,
    effective_date: payload.effectiveDate,
    reason: payload.reason.trim(),
    signed_by_name: payload.signedByName,
    addendum_contract_id: addendumContract.id,
    addendum_contract_number: addendumNumber,
    created_at: new Date().toISOString(),
  };
  appendCareerHistoryEntryInternal(careerEntry);

  // 3. Update Department Manager & active employees in newDepartmentId if promoted to DEPT_MANAGER
  if (newRoleCode === 'DEPT_MANAGER' && targetDept) {
    saveRuntimeDepartment({
      ...targetDept,
      manager_id: emp.id,
      manager_name: emp.full_name,
    });
  }
  if (payload.newRoleCode === 'DEPT_MANAGER') {
    for (const deptEmp of getAllRuntimeEmployees()) {
      if (
        deptEmp.id !== emp.id &&
        deptEmp.department_id === newDeptId &&
        deptEmp.employment_status !== 'RESIGNED' &&
        deptEmp.employment_status !== 'NOTICE_PERIOD'
      ) {
        saveRuntimeEmployee({
          ...deptEmp,
          manager_id: emp.id,
          manager_name: emp.full_name,
        });
      }
    }
  }

  // 4. Auto-sync Employee record
  const nextManagerId =
    newRoleCode === 'DEPT_MANAGER'
      ? 'emp-001'
      : newDeptId !== emp.department_id && targetDept
        ? targetDept.manager_id
        : emp.manager_id;
  const nextManagerName =
    newRoleCode === 'DEPT_MANAGER'
      ? 'Nguyễn Văn An'
      : newDeptId !== emp.department_id && targetDept
        ? targetDept.manager_name
        : emp.manager_name;

  const updatedEmp: Employee = {
    ...emp,
    department_id: newDeptId,
    department_name: newDeptName,
    position_id: newPosId,
    position_name: newPosName,
    base_salary_vnd: newSalaryVnd,
    official_salary_vnd: newSalaryVnd,
    role_code: newRoleCode,
    manager_id: nextManagerId,
    manager_name: nextManagerName,
    employment_status:
      shouldConvertProbation ||
      (payload.changeType === 'PROBATION_TO_OFFICIAL' &&
        emp.employment_status === 'PROBATION')
        ? 'OFFICIAL'
        : emp.employment_status,
    official_date:
      emp.official_date ??
      (shouldConvertProbation ? payload.effectiveDate : emp.official_date),
    probation_salary_percent: shouldConvertProbation
      ? 100
      : emp.probation_salary_percent,
    contract_type: shouldConvertProbation
      ? (resolvedOfficialContract?.contract_type ?? 'FIXED_TERM_12M')
      : emp.contract_type,
    contract_start_date: shouldConvertProbation
      ? (resolvedOfficialContract?.start_date ?? payload.effectiveDate)
      : emp.contract_start_date,
    contract_end_date: shouldConvertProbation
      ? (resolvedOfficialContract?.end_date ??
          addMonthsIso(payload.effectiveDate, 12))
      : emp.contract_end_date,
    contract_status: shouldConvertProbation ? 'ACTIVE' : emp.contract_status,
  };
  saveRuntimeEmployee(updatedEmp);

  // 5. Auto-sync SystemUserAccount role_code & profile
  const updatedUser = setUserActiveByEmployee({
    employeeId: updatedEmp.id,
    employeeCode: updatedEmp.employee_code,
    email: updatedEmp.email,
    fullName: updatedEmp.full_name,
    departmentName: updatedEmp.department_name,
    positionName: updatedEmp.position_name,
    roleCode: newRoleCode,
    isActive: updatedEmp.employment_status !== 'RESIGNED',
    targetStatus: 'ACTIVE',
  });

  pushNotification({
    title: `Ban hành Quyết định nhân sự ${decisionNo}: ${updatedEmp.full_name}`,
    message: `${updatedEmp.full_name} (${updatedEmp.employee_code}): ${newPosName} tại ${newDeptName}, mức lương ${newSalaryVnd.toLocaleString('vi-VN')} đ từ ${payload.effectiveDate}.`,
    category: 'PERFORMANCE',
    target_roles: ['HR_MANAGER', 'DIRECTOR', 'DEPT_MANAGER'],
    target_employee_codes: [updatedEmp.employee_code],
    target_department_id: newDeptId,
    nav_id: 'performance',
  });

  recordAuditLog({
    actor_name: payload.signedByName,
    actor_code: 'HR-DECISION',
    actor_role: 'HR_MANAGER',
    action: 'CAREER_PROGRESSION',
    target: `${decisionNo} · ${updatedEmp.employee_code}`,
    detail: `${payload.changeType}: ${emp.position_name} (${emp.base_salary_vnd.toLocaleString('vi-VN')} đ) -> ${newPosName} (${newSalaryVnd.toLocaleString('vi-VN')} đ), hiệu lực ${payload.effectiveDate}, sinh phụ lục ${addendumNumber}.`,
  });

  return {
    careerEntry,
    employee: updatedEmp,
    addendumContract,
    updatedUser,
  };
}

// ---------------------------------------------------------------------------
// Stage 4: Offboarding, 3-Way Handover, Clearance & Final Settlement
// ---------------------------------------------------------------------------

export function calculateResignationNotice(params: {
  contractType: ContractType;
  submittedDate: string;
  desiredLastDay: string;
}): ResignationNoticeCalculation {
  const minimumNoticeDays =
    params.contractType === 'PROBATION_2M'
      ? 3
      : params.contractType === 'INDEFINITE_TERM'
        ? 45
        : 30;
  const earliestLegalLastDay = addDaysIso(
    params.submittedDate,
    minimumNoticeDays
  );
  const diffFromEarliest = diffDaysIso(
    earliestLegalLastDay,
    params.desiredLastDay
  );
  const meetsLegalNotice = diffFromEarliest >= 0;
  const noticeShortfallDays = meetsLegalNotice ? 0 : Math.abs(diffFromEarliest);
  const approvedLastDay = meetsLegalNotice
    ? params.desiredLastDay
    : earliestLegalLastDay;

  return {
    contract_type: params.contractType,
    submitted_date: params.submittedDate,
    desired_last_day: params.desiredLastDay,
    minimum_notice_days: minimumNoticeDays,
    earliest_legal_last_day: earliestLegalLastDay,
    approved_last_day: approvedLastDay,
    notice_shortfall_days: noticeShortfallDays,
    meets_legal_notice: meetsLegalNotice,
  };
}

const SEED_RESIGNATIONS: ResignationRequest[] = [
  {
    id: 'res-seed-001',
    resignation_code: 'RES-2026-001',
    employee_id: 'emp-010',
    employee_code: 'NV-2025-010',
    full_name: 'Đỗ Thùy Linh',
    department_id: 'dept-sales',
    department_name: 'Khối Kinh doanh',
    position_name: 'Chuyên viên Phát triển Khách hàng Doanh nghiệp',
    role_code: 'EMPLOYEE',
    contract_type: 'FIXED_TERM_12M',
    submitted_date: '2026-11-18',
    desired_last_day: '2026-12-20',
    minimum_notice_days: 30,
    earliest_legal_last_day: '2026-12-18',
    approved_last_day: null,
    notice_shortfall_days: 0,
    reason_category: 'CAREER_GROWTH',
    reason: 'Chuyển hướng học chương trình Thạc sĩ Quản trị Kinh doanh toàn thời gian vào đầu năm 2027, cam kết bàn giao đầy đủ danh mục khách hàng B2B.',
    status: 'PENDING_MANAGER',
    created_at: '2026-11-18T14:20:00+07:00',
  },
];

export function getResignations(
  employeeIdOrCode?: string
): ResignationRequest[] {
  const stored = readStorageArray<ResignationRequest>(STORAGE_RESIGNATIONS_KEY);
  const all = stored ?? cloneJson(SEED_RESIGNATIONS);
  const filtered = employeeIdOrCode
    ? all.filter(
        (r) =>
          r.employee_id === employeeIdOrCode ||
          r.employee_code === employeeIdOrCode
      )
    : all;
  return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function saveResignationInternal(req: ResignationRequest): ResignationRequest {
  const current = getResignations();
  const idx = current.findIndex(
    (r) => r.id === req.id || r.resignation_code === req.resignation_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? req : item))
      : [req, ...current];
  writeStorageArray(STORAGE_RESIGNATIONS_KEY, updated);
  return req;
}

export function submitResignation(params: {
  employeeId: string;
  submittedDate?: string;
  desiredLastDay: string;
  reasonCategory: ResignationReasonCategory;
  reason: string;
  actorName?: string;
}): ResignationRequest {
  const emp = getAllRuntimeEmployees().find(
    (e) => e.id === params.employeeId || e.employee_code === params.employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy hồ sơ nhân sự nộp đơn thôi việc.');
  }
  if (emp.employment_status === 'RESIGNED') {
    throw new Error('Nhân sự này đã hoàn tất thủ tục nghỉ việc trước đó.');
  }

  const existingActive = getResignations(emp.id).find(
    (r) =>
      r.status !== 'REJECTED' &&
      r.status !== 'CANCELLED' &&
      r.status !== 'COMPLETED'
  );
  if (existingActive) {
    throw new Error(
      `Nhân sự ${emp.full_name} đang có hồ sơ thôi việc ${existingActive.resignation_code} đang xử lý.`
    );
  }

  const activeContract = getContracts().find(
    (c) =>
      (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
      !c.is_addendum &&
      c.status !== 'EXPIRED'
  );
  const contractType = activeContract?.contract_type ?? emp.contract_type;
  const submittedDate =
    params.submittedDate ?? new Date().toISOString().slice(0, 10);
  const noticeCalc = calculateResignationNotice({
    contractType,
    submittedDate,
    desiredLastDay: params.desiredLastDay,
  });

  const currentList = getResignations();
  const resignation: ResignationRequest = {
    id: `res-rt-${Date.now()}`,
    resignation_code: `RES-2026-${String(currentList.length + 1).padStart(3, '0')}`,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_id: emp.department_id,
    department_name: emp.department_name,
    position_name: emp.position_name,
    role_code: emp.role_code,
    contract_type: contractType,
    submitted_date: submittedDate,
    desired_last_day: params.desiredLastDay,
    minimum_notice_days: noticeCalc.minimum_notice_days,
    earliest_legal_last_day: noticeCalc.earliest_legal_last_day,
    approved_last_day: null,
    notice_shortfall_days: noticeCalc.notice_shortfall_days,
    reason_category: params.reasonCategory,
    reason: params.reason.trim(),
    status: 'PENDING_MANAGER',
    created_at: new Date().toISOString(),
  };

  saveResignationInternal(resignation);

  pushNotification({
    title: `Đơn xin thôi việc mới: ${emp.full_name} (${emp.employee_code})`,
    message: `Loại HĐ ${contractType} (tối thiểu báo trước ${noticeCalc.minimum_notice_days} ngày). Ngày nghỉ mong muốn: ${params.desiredLastDay}.`,
    category: 'OFFBOARDING',
    target_roles: ['DEPT_MANAGER', 'HR_MANAGER', 'DIRECTOR'],
    target_department_id: emp.department_id,
    nav_id: 'offboarding',
    entity_id: resignation.id,
  });

  recordAuditLog({
    actor_name: params.actorName || emp.full_name,
    actor_code: emp.employee_code,
    actor_role: emp.role_code,
    action: 'SUBMIT_RESIGNATION',
    target: `${resignation.resignation_code} (${emp.employee_code})`,
    detail: `Nộp đơn thôi việc ngày ${submittedDate}, ngày làm việc cuối mong muốn ${params.desiredLastDay} (Hạn luật định >= ${noticeCalc.minimum_notice_days} ngày: ${noticeCalc.earliest_legal_last_day}).`,
  });

  return resignation;
}

export function approveResignation(params: {
  resignationId: string;
  approverRole?: 'DEPT_MANAGER' | 'HR_MANAGER' | 'DIRECTOR' | 'SUPER_ADMIN';
  approverName: string;
  approvedLastDay?: string;
  waiveNoticeShortfall?: boolean;
  successorEmployeeId?: string;
  exitInterviewNote?: string;
}): {
  resignation: ResignationRequest;
  clearance: ClearanceChecklist;
  handoverItems: HandoverItem[];
} {
  const existing = getResignations().find(
    (r) =>
      r.id === params.resignationId ||
      r.resignation_code === params.resignationId
  );
  if (!existing) {
    throw new Error('Không tìm thấy đơn xin thôi việc cần phê duyệt.');
  }

  const emp = getAllRuntimeEmployees().find(
    (e) =>
      e.id === existing.employee_id || e.employee_code === existing.employee_code
  );
  if (!emp) {
    throw new Error('Không tìm thấy hồ sơ nhân sự tương ứng với đơn thôi việc.');
  }

  const nowIso = new Date().toISOString();
  const finalLastDay =
    params.approvedLastDay ||
    (params.waiveNoticeShortfall
      ? existing.desired_last_day
      : existing.desired_last_day >= existing.earliest_legal_last_day
        ? existing.desired_last_day
        : existing.earliest_legal_last_day);

  const updatedResignation: ResignationRequest = {
    ...existing,
    approved_last_day: finalLastDay,
    waive_notice_shortfall: params.waiveNoticeShortfall,
    exit_interview_note:
      params.exitInterviewNote ?? existing.exit_interview_note,
    status: 'NOTICE_PERIOD',
    manager_approved_by: existing.manager_approved_by ?? params.approverName,
    manager_approved_at: existing.manager_approved_at ?? nowIso,
    hr_approved_by: params.approverName,
    hr_approved_at: nowIso,
  };
  saveResignationInternal(updatedResignation);

  // Set Employee status to NOTICE_PERIOD
  const updatedEmp: Employee = {
    ...emp,
    employment_status: 'NOTICE_PERIOD',
    approved_last_day: finalLastDay,
  };
  saveRuntimeEmployee(updatedEmp);

  // If successor provided right at approval, execute manager successor transfer
  if (params.successorEmployeeId) {
    executeManagerSuccessorReassign({
      resigningEmployeeId: emp.id,
      successorEmployeeId: params.successorEmployeeId,
      resignationId: updatedResignation.id,
      actorName: params.approverName,
    });
  }

  // Auto-create ClearanceChecklist pre-populated with all assigned assets
  const existingClearances = getClearanceChecklists();
  let clearance =
    existingClearances.find((cl) => cl.resignation_id === updatedResignation.id) ??
    null;

  if (!clearance) {
    const companyAssets = getCompanyAssets().filter(
      (a) => a.status === 'ASSIGNED' && a.assigned_to_code === emp.employee_code
    );
    const empAssignments = getEmployeeAssets(emp.employee_code).filter(
      (ea) => ea.status === 'ASSIGNED'
    );

    const clearanceAssets: ClearanceAssetItem[] = companyAssets.map((ast) => {
      const matchedAssign = empAssignments.find((ea) => ea.asset_id === ast.id);
      return {
        assignment_id: matchedAssign?.id,
        asset_id: ast.id,
        asset_code: ast.asset_code,
        asset_name: ast.name,
        category: ast.category,
        serial_number: ast.serial_number,
        asset_value_vnd:
          matchedAssign?.asset_value_vnd ??
          ast.asset_value_vnd ??
          inferDefaultAssetValueVnd(ast.category),
        returned: false,
        returned_date: null,
        return_condition: null,
        penalty_amount_vnd: 0,
      };
    });

    clearance = {
      id: `clr-rt-${Date.now()}`,
      resignation_id: updatedResignation.id,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      assets: clearanceAssets,
      admin_assets_cleared: clearanceAssets.length === 0,
      admin_signed_by: clearanceAssets.length === 0 ? 'Tự động (0 thiết bị)' : null,
      admin_signed_at: clearanceAssets.length === 0 ? nowIso : null,
      it_access_revoked: false,
      accounting_debt_cleared: false,
      advance_deduction_vnd: 0,
      hr_bhxh_closed: false,
      total_penalty_vnd: 0,
      updated_at: nowIso,
    };
    writeStorageArray(STORAGE_CLEARANCE_CHECKLISTS_KEY, [
      clearance,
      ...existingClearances,
    ]);
  }

  // Auto-create starter HandoverItems (3-way confirmation) if none exist yet
  let handoverItems = getHandoverItems(updatedResignation.id);
  if (handoverItems.length === 0) {
    const starterDefs: Array<{
      category: HandoverItemCategory;
      title: string;
      description: string;
    }> = [
      {
        category: 'PROJECT',
        title: `Bàn giao công việc & hồ sơ dự án đang phụ trách (${emp.position_name})`,
        description:
          'Chuyển giao toàn bộ tiến độ công việc đang mở, đầu mối liên hệ và lịch trình cho nhân sự tiếp nhận.',
      },
      {
        category: 'DOCUMENT',
        title: 'Bàn giao tài liệu chuyên môn, mã nguồn / dữ liệu lưu trữ trên kho chung',
        description:
          'Đảm bảo toàn bộ tài liệu nghiệp vụ đã đẩy lên hệ thống lưu trữ của phòng ban, không lưu cục bộ.',
      },
      {
        category: 'SYSTEM_ACCESS',
        title: 'Chuyển giao tài khoản dịch vụ dùng chung & danh sách quyền hạn nghiệp vụ',
        description:
          'Đối soát quyền quản trị dự án trước khi IT thu hồi tài khoản cá nhân vào ngày làm việc cuối.',
      },
    ];

    const createdHandovers: HandoverItem[] = starterDefs.map((def, idx) => ({
      id: `ho-rt-${Date.now()}-${idx + 1}`,
      resignation_id: updatedResignation.id,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      employee_name: emp.full_name,
      category: def.category,
      title: def.title,
      description: def.description,
      receiver_employee_id: null,
      receiver_employee_code: null,
      receiver_name: null,
      sender_confirmed: false,
      receiver_confirmed: false,
      manager_approved: false,
      status: 'PENDING_RECEIVER',
      created_at: nowIso,
    }));

    const allHandovers = getHandoverItems();
    writeStorageArray(STORAGE_HANDOVER_ITEMS_KEY, [
      ...createdHandovers,
      ...allHandovers,
    ]);
    handoverItems = createdHandovers;
  }

  pushNotification({
    title: `Đã duyệt đơn thôi việc & mở quy trình Bàn giao: ${emp.full_name}`,
    message: `Nhân sự ${emp.employee_code} chuyển sang trạng thái Báo trước (NOTICE_PERIOD) đến ngày ${finalLastDay}. Đã khởi tạo phiếu Clearance & Bàn giao 3 bên.`,
    category: 'OFFBOARDING',
    target_roles: ['HR_MANAGER', 'DEPT_MANAGER', 'SUPER_ADMIN'],
    target_employee_codes: [emp.employee_code],
    target_department_id: emp.department_id,
    nav_id: 'offboarding',
    entity_id: updatedResignation.id,
  });

  recordAuditLog({
    actor_name: params.approverName,
    actor_code: 'HR-OFFB',
    actor_role: params.approverRole ?? 'HR_MANAGER',
    action: 'APPROVE_RESIGNATION',
    target: `${updatedResignation.resignation_code} (${emp.employee_code})`,
    detail: `Phê duyệt đơn thôi việc, chốt ngày làm việc cuối ${finalLastDay}, chuyển sang NOTICE_PERIOD và sinh ${clearance.assets.length} dòng đối soát tài sản.`,
  });

  const refreshedResignation =
    getResignations().find((r) => r.id === updatedResignation.id) ??
    updatedResignation;
  return { resignation: refreshedResignation, clearance, handoverItems };
}

export function rejectResignation(params: {
  resignationId: string;
  rejectorName: string;
  reason: string;
}): ResignationRequest | null {
  const existing = getResignations().find(
    (r) =>
      r.id === params.resignationId ||
      r.resignation_code === params.resignationId
  );
  if (!existing) return null;

  const rejected: ResignationRequest = {
    ...existing,
    status: 'REJECTED',
    rejection_reason:
      params.reason.trim() || 'Đã trao đổi giữ chân nhân sự tiếp tục gắn bó.',
  };
  saveResignationInternal(rejected);
  return rejected;
}

export function getHandoverItems(
  resignationIdOrEmployeeId?: string
): HandoverItem[] {
  const stored =
    readStorageArray<HandoverItem>(STORAGE_HANDOVER_ITEMS_KEY) ?? [];
  if (!resignationIdOrEmployeeId) return stored;
  return stored.filter(
    (h) =>
      h.resignation_id === resignationIdOrEmployeeId ||
      h.employee_id === resignationIdOrEmployeeId ||
      h.employee_code === resignationIdOrEmployeeId
  );
}

function saveHandoverItemInternal(item: HandoverItem): HandoverItem {
  const current = getHandoverItems();
  const idx = current.findIndex((h) => h.id === item.id);
  const updated =
    idx >= 0
      ? current.map((row, i) => (i === idx ? item : row))
      : [item, ...current];
  writeStorageArray(STORAGE_HANDOVER_ITEMS_KEY, updated);
  return item;
}

export function addHandoverItem(params: {
  resignationId: string;
  employeeId: string;
  category?: HandoverItemCategory;
  title: string;
  description?: string;
  receiverEmployeeId?: string | null;
  note?: string;
}): HandoverItem {
  const allEmps = getAllRuntimeEmployees();
  const sender = allEmps.find(
    (e) => e.id === params.employeeId || e.employee_code === params.employeeId
  );
  const receiver = params.receiverEmployeeId
    ? allEmps.find(
        (e) =>
          e.id === params.receiverEmployeeId ||
          e.employee_code === params.receiverEmployeeId
      ) ?? null
    : null;
  const nowIso = new Date().toISOString();

  const created: HandoverItem = {
    id: `ho-rt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    resignation_id: params.resignationId,
    employee_id: sender?.id ?? params.employeeId,
    employee_code: sender?.employee_code ?? params.employeeId,
    employee_name: sender?.full_name ?? 'Nhân sự bàn giao',
    category: params.category ?? 'PROJECT',
    title: params.title.trim(),
    description: params.description?.trim() || '',
    receiver_employee_id: receiver?.id ?? null,
    receiver_employee_code: receiver?.employee_code ?? null,
    receiver_name: receiver?.full_name ?? null,
    sender_confirmed: Boolean(receiver),
    sender_confirmed_at: receiver ? nowIso : null,
    receiver_confirmed: false,
    manager_approved: false,
    status: 'PENDING_RECEIVER',
    note: params.note,
    created_at: nowIso,
  };

  return saveHandoverItemInternal(created);
}

export function assignHandoverReceiver(params: {
  handoverItemId: string;
  receiverEmployeeId: string;
  senderConfirmed?: boolean;
  actorName?: string;
}): HandoverItem | null {
  const existing = getHandoverItems().find(
    (h) => h.id === params.handoverItemId
  );
  if (!existing) return null;

  const receiver = getAllRuntimeEmployees().find(
    (e) =>
      e.id === params.receiverEmployeeId ||
      e.employee_code === params.receiverEmployeeId
  );
  if (!receiver) {
    throw new Error('Không tìm thấy nhân sự nhận bàn giao công việc.');
  }
  if (receiver.id === existing.employee_id) {
    throw new Error('Người nhận bàn giao không được trùng với người xin nghỉ việc.');
  }

  const nowIso = new Date().toISOString();
  const updated: HandoverItem = {
    ...existing,
    receiver_employee_id: receiver.id,
    receiver_employee_code: receiver.employee_code,
    receiver_name: receiver.full_name,
    sender_confirmed: params.senderConfirmed ?? true,
    sender_confirmed_at: nowIso,
    receiver_confirmed: false,
    manager_approved: false,
    status: 'PENDING_RECEIVER',
  };

  const saved = saveHandoverItemInternal(updated);

  pushNotification({
    title: `Yêu cầu xác nhận nhận bàn giao từ ${existing.employee_name}`,
    message: `Hạng mục: "${existing.title}" đang chờ ${receiver.full_name} xác nhận tiếp nhận.`,
    category: 'OFFBOARDING',
    target_employee_codes: [receiver.employee_code],
    nav_id: 'offboarding',
    entity_id: existing.resignation_id,
  });

  return saved;
}

export function confirmHandoverBySender(
  handoverItemId: string,
  note?: string
): HandoverItem | null {
  const existing = getHandoverItems().find((h) => h.id === handoverItemId);
  if (!existing) return null;
  return saveHandoverItemInternal({
    ...existing,
    sender_confirmed: true,
    sender_confirmed_at: new Date().toISOString(),
    note: note ?? existing.note,
  });
}

export function confirmHandoverByReceiver(params: {
  handoverItemId: string;
  receiverName: string;
  note?: string;
}): HandoverItem | null {
  const existing = getHandoverItems().find(
    (h) => h.id === params.handoverItemId
  );
  if (!existing) return null;
  if (!existing.receiver_employee_id) {
    throw new Error('Cần chỉ định người nhận bàn giao trước khi xác nhận.');
  }

  const nowIso = new Date().toISOString();
  const updated: HandoverItem = {
    ...existing,
    sender_confirmed: true,
    sender_confirmed_at: existing.sender_confirmed_at ?? nowIso,
    receiver_confirmed: true,
    receiver_confirmed_at: nowIso,
    status: existing.manager_approved ? 'COMPLETED' : 'PENDING_MANAGER',
    note: params.note ?? existing.note,
  };
  const saved = saveHandoverItemInternal(updated);

  recordAuditLog({
    actor_name: params.receiverName,
    actor_code: existing.receiver_employee_code || 'EMP-RCV',
    actor_role: 'EMPLOYEE',
    action: 'HANDOVER_CONFIRM',
    target: `${existing.id} (${existing.employee_code})`,
    detail: `Người nhận (${params.receiverName}) xác nhận đã tiếp nhận bàn giao hạng mục: "${existing.title}".`,
  });

  return saved;
}

export function approveHandoverByManager(params: {
  handoverItemId: string;
  managerName: string;
  note?: string;
}): HandoverItem | null {
  const existing = getHandoverItems().find(
    (h) => h.id === params.handoverItemId
  );
  if (!existing) return null;
  if (!existing.receiver_confirmed) {
    throw new Error(
      'Người nhận bàn giao phải xác nhận tiếp nhận trước khi Quản lý phê duyệt hoàn tất 3 bên.'
    );
  }

  const nowIso = new Date().toISOString();
  const updated: HandoverItem = {
    ...existing,
    sender_confirmed: true,
    sender_confirmed_at: existing.sender_confirmed_at ?? nowIso,
    manager_approved: true,
    manager_approved_by: params.managerName,
    manager_approved_at: nowIso,
    status: 'COMPLETED',
    note: params.note ?? existing.note,
  };
  const saved = saveHandoverItemInternal(updated);

  recordAuditLog({
    actor_name: params.managerName,
    actor_code: 'MGR-HO',
    actor_role: 'DEPT_MANAGER',
    action: 'HANDOVER_CONFIRM',
    target: `${existing.id} (${existing.employee_code})`,
    detail: `Quản lý (${params.managerName}) nghiệm thu hoàn tất bàn giao 3 bên cho hạng mục: "${existing.title}".`,
  });

  return saved;
}

export function getManagerOffboardingDependencies(
  employeeId: string
): ManagerOffboardingDependency {
  const allEmps = getAllRuntimeEmployees();
  const targetEmp = allEmps.find(
    (e) => e.id === employeeId || e.employee_code === employeeId
  );
  if (!targetEmp) {
    return {
      employee_id: employeeId,
      employee_code: employeeId,
      is_manager: false,
      subordinates: [],
      pending_requests: [],
      requires_successor_reassign: false,
    };
  }

  const subordinates = allEmps
    .filter(
      (e) =>
        e.id !== targetEmp.id &&
        e.employment_status !== 'RESIGNED' &&
        e.manager_id === targetEmp.id
    )
    .map((e) => ({
      id: e.id,
      employee_code: e.employee_code,
      full_name: e.full_name,
      position_name: e.position_name,
    }));

  const subordinateIds = new Set(subordinates.map((s) => s.id));
  const allReqs = mergeWithRuntimeRequests(MOCK_LEAVE_OVERTIME_REQUESTS);
  const pendingRequests = allReqs
    .filter((req) => {
      const st = req.status ?? req.approval_status;
      if (st !== 'PENDING' && st !== 'IN_PROGRESS') return false;
      if (
        req.approver_id === targetEmp.id ||
        req.current_approver_id === targetEmp.id
      ) {
        return true;
      }
      return (
        req.current_step_role === 'DEPT_MANAGER' &&
        subordinateIds.has(req.employee_id)
      );
    })
    .map((r) => ({
      id: r.id,
      request_code: r.request_code,
      full_name: r.full_name,
      request_category: r.request_category,
    }));

  const managedDepts = getRuntimeDepartments().filter(
    (d) => d.manager_id === targetEmp.id
  );

  const isManager =
    targetEmp.role_code === 'DEPT_MANAGER' ||
    targetEmp.role_code === 'DIRECTOR' ||
    subordinates.length > 0 ||
    managedDepts.length > 0;

  return {
    employee_id: targetEmp.id,
    employee_code: targetEmp.employee_code,
    is_manager: isManager,
    subordinates,
    pending_requests: pendingRequests,
    requires_successor_reassign:
      subordinates.length > 0 ||
      pendingRequests.length > 0 ||
      managedDepts.length > 0,
  };
}

export function executeManagerSuccessorReassign(params: {
  resigningEmployeeId: string;
  successorEmployeeId: string;
  resignationId?: string;
  actorName: string;
}): {
  transferredSubordinatesCount: number;
  transferredRequestsCount: number;
  successor: Employee;
} {
  const allEmps = getAllRuntimeEmployees();
  const resigningEmp = allEmps.find(
    (e) =>
      e.id === params.resigningEmployeeId ||
      e.employee_code === params.resigningEmployeeId
  );
  const successorEmp = allEmps.find(
    (e) =>
      e.id === params.successorEmployeeId ||
      e.employee_code === params.successorEmployeeId
  );

  if (!resigningEmp || !successorEmp) {
    throw new Error('Không tìm thấy nhân sự bàn giao hoặc người kế nhiệm quản lý.');
  }
  if (resigningEmp.id === successorEmp.id) {
    throw new Error('Người kế nhiệm phải khác với Quản lý đang làm thủ tục nghỉ việc.');
  }
  if (successorEmp.employment_status === 'RESIGNED') {
    throw new Error('Không thể chọn nhân sự đã nghỉ việc làm người kế nhiệm.');
  }

  // 1. Upgrade successor to DEPT_MANAGER (and detach from resigningEmp if successor was a subordinate)
  const wasDirectSubordinate = successorEmp.manager_id === resigningEmp.id;
  const nextRoleCode: RoleCode =
    successorEmp.role_code === 'EMPLOYEE'
      ? 'DEPT_MANAGER'
      : successorEmp.role_code;
  const updatedSuccessor: Employee = {
    ...successorEmp,
    role_code: nextRoleCode,
    manager_id: wasDirectSubordinate
      ? resigningEmp.manager_id
      : successorEmp.manager_id,
    manager_name: wasDirectSubordinate
      ? resigningEmp.manager_name
      : successorEmp.manager_name,
  };
  saveRuntimeEmployee(updatedSuccessor);
  setUserActiveByEmployee({
    employeeId: updatedSuccessor.id,
    employeeCode: updatedSuccessor.employee_code,
    email: updatedSuccessor.email,
    fullName: updatedSuccessor.full_name,
    departmentName: updatedSuccessor.department_name,
    positionName: updatedSuccessor.position_name,
    roleCode: nextRoleCode,
    isActive: true,
    targetStatus: 'ACTIVE',
  });

  // 2. Re-assign Department manager_id if applicable
  for (const dept of getRuntimeDepartments()) {
    if (dept.manager_id === resigningEmp.id) {
      saveRuntimeDepartment({
        ...dept,
        manager_id: updatedSuccessor.id,
        manager_name: updatedSuccessor.full_name,
      });
    }
  }

  // 3. Transfer all subordinates' manager_id & manager_name
  let transferredSubordinatesCount = 0;
  const subordinateIds = new Set<string>();
  for (const emp of getAllRuntimeEmployees()) {
    if (
      emp.id !== resigningEmp.id &&
      emp.id !== updatedSuccessor.id &&
      emp.employment_status !== 'RESIGNED' &&
      emp.manager_id === resigningEmp.id
    ) {
      subordinateIds.add(emp.id);
      saveRuntimeEmployee({
        ...emp,
        manager_id: updatedSuccessor.id,
        manager_name: updatedSuccessor.full_name,
      });
      transferredSubordinatesCount += 1;
    }
  }

  // 4. Transfer pending LeaveOvertimeRequests to successor
  let transferredRequestsCount = 0;
  const allReqs = mergeWithRuntimeRequests(MOCK_LEAVE_OVERTIME_REQUESTS);
  for (const req of allReqs) {
    const st = req.status ?? req.approval_status;
    if (st !== 'PENDING' && st !== 'IN_PROGRESS') continue;
    const isAssignedToResigning =
      req.approver_id === resigningEmp.id ||
      req.current_approver_id === resigningEmp.id ||
      (req.current_step_role === 'DEPT_MANAGER' &&
        subordinateIds.has(req.employee_id));
    if (!isAssignedToResigning) continue;

    const updatedSteps = req.approval_steps?.map((step) =>
      step.role === 'DEPT_MANAGER' && step.status === 'PENDING'
        ? { ...step, actor_name: updatedSuccessor.full_name }
        : step
    );

    saveRuntimeRequest({
      ...req,
      approver_id:
        req.approver_id === resigningEmp.id
          ? updatedSuccessor.id
          : req.approver_id,
      approver_name:
        req.approver_id === resigningEmp.id
          ? updatedSuccessor.full_name
          : req.approver_name,
      current_approver_id: updatedSuccessor.id,
      approval_steps: updatedSteps,
    });
    transferredRequestsCount += 1;
  }

  // 5. Stamp successor onto ResignationRequest
  const targetResignation =
    (params.resignationId
      ? getResignations().find((r) => r.id === params.resignationId)
      : getResignations(resigningEmp.id).find((r) => r.status !== 'COMPLETED')) ??
    null;
  if (targetResignation) {
    saveResignationInternal({
      ...targetResignation,
      successor_employee_id: updatedSuccessor.id,
      successor_employee_name: updatedSuccessor.full_name,
    });
  }

  pushNotification({
    title: `Chuyển giao quyền Quản lý sang ${updatedSuccessor.full_name}`,
    message: `Đã bàn giao ${transferredSubordinatesCount} nhân sự trực thuộc và ${transferredRequestsCount} đơn từ chờ duyệt từ ${resigningEmp.full_name} sang ${updatedSuccessor.full_name}.`,
    category: 'OFFBOARDING',
    target_roles: ['HR_MANAGER', 'DIRECTOR', 'DEPT_MANAGER'],
    target_employee_codes: [updatedSuccessor.employee_code],
    nav_id: 'offboarding',
  });

  recordAuditLog({
    actor_name: params.actorName,
    actor_code: 'HR-REASSIGN',
    actor_role: 'HR_MANAGER',
    action: 'MANAGER_REASSIGN',
    target: `${resigningEmp.employee_code} -> ${updatedSuccessor.employee_code}`,
    detail: `Chuyển giao kế nhiệm Quản lý: ${transferredSubordinatesCount} nhân sự cấp dưới & ${transferredRequestsCount} đơn từ đang chờ duyệt sang ${updatedSuccessor.full_name}.`,
  });

  return {
    transferredSubordinatesCount,
    transferredRequestsCount,
    successor: updatedSuccessor,
  };
}

export function getClearanceChecklists(
  resignationIdOrEmployeeId?: string
): ClearanceChecklist[] {
  const stored =
    readStorageArray<ClearanceChecklist>(STORAGE_CLEARANCE_CHECKLISTS_KEY) ?? [];
  if (!resignationIdOrEmployeeId) return stored;
  return stored.filter(
    (cl) =>
      cl.resignation_id === resignationIdOrEmployeeId ||
      cl.employee_id === resignationIdOrEmployeeId ||
      cl.employee_code === resignationIdOrEmployeeId
  );
}

function saveClearanceInternal(cl: ClearanceChecklist): ClearanceChecklist {
  const current = getClearanceChecklists();
  const idx = current.findIndex(
    (item) => item.id === cl.id || item.resignation_id === cl.resignation_id
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? cl : item))
      : [cl, ...current];
  writeStorageArray(STORAGE_CLEARANCE_CHECKLISTS_KEY, updated);
  return cl;
}

export function reconcileClearanceAsset(params: {
  checklistId?: string;
  resignationId?: string;
  assetId: string;
  returned: boolean;
  returnCondition: AssetConditionStatus;
  penaltyAmountVnd?: number;
  conditionNote?: string;
  returnedDate?: string;
  actorName: string;
}): ClearanceChecklist | null {
  const all = getClearanceChecklists();
  const target = all.find(
    (cl) =>
      (params.checklistId && cl.id === params.checklistId) ||
      (params.resignationId && cl.resignation_id === params.resignationId)
  );
  if (!target) return null;

  const nowDate = params.returnedDate ?? new Date().toISOString().slice(0, 10);
  const penalty = Math.max(0, Math.round(params.penaltyAmountVnd ?? 0));

  if (params.returned || params.returnCondition === 'LOST') {
    returnEmployeeAssetWithPenalty({
      assetId: params.assetId,
      returnCondition: params.returnCondition,
      penaltyAmountVnd: penalty,
      returnNote: params.conditionNote,
      returnedDate: nowDate,
      actorName: params.actorName,
    });
  }

  const nextAssets = target.assets.map((ast) => {
    if (ast.asset_id !== params.assetId && ast.asset_code !== params.assetId) {
      return ast;
    }
    return {
      ...ast,
      returned: params.returned,
      returned_date:
        params.returned || params.returnCondition === 'LOST' ? nowDate : null,
      return_condition: params.returnCondition,
      penalty_amount_vnd: penalty,
      condition_note: params.conditionNote,
      reconciled_by: params.actorName,
    };
  });

  const totalPenalty = nextAssets.reduce(
    (sum, a) => sum + (a.penalty_amount_vnd || 0),
    0
  );
  const allAssetsReconciled = nextAssets.every(
    (a) => a.returned || a.return_condition === 'LOST'
  );

  const updatedChecklist: ClearanceChecklist = {
    ...target,
    assets: nextAssets,
    total_penalty_vnd: totalPenalty,
    admin_assets_cleared: allAssetsReconciled,
    admin_signed_by: allAssetsReconciled ? params.actorName : target.admin_signed_by,
    admin_signed_at: allAssetsReconciled
      ? new Date().toISOString()
      : target.admin_signed_at,
    updated_at: new Date().toISOString(),
  };

  return saveClearanceInternal(updatedChecklist);
}

export function signOffClearanceDept(params: {
  checklistId?: string;
  resignationId?: string;
  department: 'ADMIN' | 'IT' | 'ACCOUNTING' | 'HR';
  approved: boolean;
  advanceDeductionVnd?: number;
  note?: string;
  actorName: string;
}): ClearanceChecklist | null {
  const all = getClearanceChecklists();
  const target = all.find(
    (cl) =>
      (params.checklistId && cl.id === params.checklistId) ||
      (params.resignationId && cl.resignation_id === params.resignationId)
  );
  if (!target) return null;

  const nowIso = new Date().toISOString();
  let updated: ClearanceChecklist = { ...target, updated_at: nowIso };

  if (params.department === 'ADMIN') {
    const unreconciled = target.assets.filter(
      (a) => !a.returned && a.return_condition !== 'LOST'
    );
    if (params.approved && unreconciled.length > 0) {
      throw new Error(
        `Bộ phận Hành chính chưa thể ký tất toán khi còn ${unreconciled.length} thiết bị chưa đối soát thu hồi/báo mất.`
      );
    }
    updated = {
      ...updated,
      admin_assets_cleared: params.approved,
      admin_signed_by: params.approved ? params.actorName : null,
      admin_signed_at: params.approved ? nowIso : null,
    };
  } else if (params.department === 'IT') {
    updated = {
      ...updated,
      it_access_revoked: params.approved,
      it_signed_by: params.approved ? params.actorName : null,
      it_signed_at: params.approved ? nowIso : null,
      it_note: params.note ?? updated.it_note,
    };
  } else if (params.department === 'ACCOUNTING') {
    updated = {
      ...updated,
      accounting_debt_cleared: params.approved,
      advance_deduction_vnd: Math.max(
        0,
        Math.round(params.advanceDeductionVnd ?? updated.advance_deduction_vnd ?? 0)
      ),
      accounting_signed_by: params.approved ? params.actorName : null,
      accounting_signed_at: params.approved ? nowIso : null,
      accounting_note: params.note ?? updated.accounting_note,
    };
  } else if (params.department === 'HR') {
    updated = {
      ...updated,
      hr_bhxh_closed: params.approved,
      hr_signed_by: params.approved ? params.actorName : null,
      hr_signed_at: params.approved ? nowIso : null,
      hr_note: params.note ?? updated.hr_note,
    };
  }

  const saved = saveClearanceInternal(updated);

  recordAuditLog({
    actor_name: params.actorName,
    actor_code: `CLR-${params.department}`,
    actor_role: 'HR_MANAGER',
    action: 'CLEARANCE_SIGNOFF',
    target: `${saved.employee_code} · ${params.department}`,
    detail: `Xác nhận đối soát thanh lý bộ phận ${params.department}: ${params.approved ? 'ĐÃ HOÀN TẤT' : 'MỞ LẠI'}. ${params.note ?? ''}`.trim(),
  });

  return saved;
}

export function checkClearance100Percent(
  resignationId: string
): ClearanceGateStatus {
  const resignation = getResignations().find(
    (r) => r.id === resignationId || r.resignation_code === resignationId
  );
  if (!resignation) {
    return {
      resignation_id: resignationId,
      employee_id: '',
      is_100_percent_cleared: false,
      completion_percent: 0,
      handover_total: 0,
      handover_completed: 0,
      assets_total: 0,
      assets_reconciled: 0,
      admin_cleared: false,
      it_cleared: false,
      accounting_cleared: false,
      hr_cleared: false,
      manager_dependencies_cleared: false,
      blocking_reasons: ['Không tìm thấy hồ sơ thôi việc hợp lệ.'],
    };
  }

  const handovers = getHandoverItems(resignation.id);
  const handoverTotal = handovers.length;
  const handoverCompleted = handovers.filter(
    (h) =>
      h.sender_confirmed &&
      h.receiver_confirmed &&
      h.manager_approved &&
      h.status === 'COMPLETED'
  ).length;

  const clearance = getClearanceChecklists(resignation.id)[0] ?? null;
  const assetsTotal = clearance?.assets.length ?? 0;
  const assetsReconciled =
    clearance?.assets.filter(
      (a) => a.returned || a.return_condition === 'LOST'
    ).length ?? 0;

  const adminCleared = Boolean(
    clearance &&
      clearance.admin_assets_cleared &&
      assetsReconciled === assetsTotal
  );
  const itCleared = Boolean(clearance?.it_access_revoked);
  const accountingCleared = Boolean(clearance?.accounting_debt_cleared);
  const hrCleared = Boolean(clearance?.hr_bhxh_closed);

  const mgrDep = getManagerOffboardingDependencies(resignation.employee_id);
  const managerDependenciesCleared = !mgrDep.requires_successor_reassign;

  const blockingReasons: string[] = [];
  if (handoverTotal === 0 || handoverCompleted < handoverTotal) {
    blockingReasons.push(
      `Chưa hoàn tất bàn giao công việc 3 bên (${handoverCompleted}/${handoverTotal} hạng mục)`
    );
  }
  if (!managerDependenciesCleared) {
    blockingReasons.push(
      `Chưa chuyển giao người kế nhiệm Quản lý cho ${mgrDep.subordinates.length} nhân sự trực thuộc & ${mgrDep.pending_requests.length} đơn chờ duyệt`
    );
  }
  if (!adminCleared) {
    blockingReasons.push(
      `Hành chính chưa thu hồi/đối soát xong tài sản (${assetsReconciled}/${assetsTotal} thiết bị)`
    );
  }
  if (!itCleared) {
    blockingReasons.push('Bộ phận IT chưa xác nhận thu hồi quyền truy cập & email');
  }
  if (!accountingCleared) {
    blockingReasons.push('Phòng Kế toán chưa xác nhận công nợ / tạm ứng');
  }
  if (!hrCleared) {
    blockingReasons.push('Phòng Nhân sự chưa xác nhận chốt sổ BHXH');
  }

  // Compute weighted completion percent across 6 gates
  let passedChecks = 0;
  const totalChecks = 6;
  if (handoverTotal > 0 && handoverCompleted === handoverTotal) passedChecks += 1;
  if (managerDependenciesCleared) passedChecks += 1;
  if (adminCleared) passedChecks += 1;
  if (itCleared) passedChecks += 1;
  if (accountingCleared) passedChecks += 1;
  if (hrCleared) passedChecks += 1;

  const completionPercent = Math.round((passedChecks / totalChecks) * 100);
  const is100Percent = blockingReasons.length === 0;

  return {
    resignation_id: resignation.id,
    employee_id: resignation.employee_id,
    is_100_percent_cleared: is100Percent,
    completion_percent: completionPercent,
    handover_total: handoverTotal,
    handover_completed: handoverCompleted,
    assets_total: assetsTotal,
    assets_reconciled: assetsReconciled,
    admin_cleared: adminCleared,
    it_cleared: itCleared,
    accounting_cleared: accountingCleared,
    hr_cleared: hrCleared,
    manager_dependencies_cleared: managerDependenciesCleared,
    blocking_reasons: blockingReasons,
  };
}

export function executeFinalSettlement(params: {
  resignationId: string;
  isRehireable: boolean;
  rehireNote?: string;
  actorName: string;
}): {
  resignation: ResignationRequest;
  finalPayroll: PayrollRecord;
  employee: Employee;
  lockedUser: SystemUserAccount;
} {
  const resignation = getResignations().find(
    (r) =>
      r.id === params.resignationId ||
      r.resignation_code === params.resignationId
  );
  if (!resignation) {
    throw new Error('Không tìm thấy hồ sơ thôi việc cần quyết toán.');
  }
  if (resignation.status === 'COMPLETED') {
    throw new Error('Hồ sơ thôi việc này đã hoàn tất quyết toán cuối cùng.');
  }

  // HARD GATE: Must pass 100% of Clearance & 3-way Handover & Manager Re-assign
  const gate = checkClearance100Percent(resignation.id);
  if (!gate.is_100_percent_cleared) {
    throw new Error(
      `Chặn Quyết toán cuối cùng — Hồ sơ mới đạt ${gate.completion_percent}% (yêu cầu đủ 100%): ${gate.blocking_reasons.join('; ')}.`
    );
  }

  const emp = getAllRuntimeEmployees().find(
    (e) =>
      e.id === resignation.employee_id ||
      e.employee_code === resignation.employee_code
  );
  if (!emp) {
    throw new Error('Không tìm thấy hồ sơ nhân sự cần quyết toán nghỉ việc.');
  }

  const clearance = getClearanceChecklists(resignation.id)[0];
  const nowIso = new Date().toISOString();
  const approvedLastDay =
    resignation.approved_last_day || nowIso.slice(0, 10);
  const periodMonth = approvedLastDay.slice(0, 7);
  const yearNum = Number.parseInt(approvedLastDay.slice(0, 4), 10) || 2026;
  const { firstDay } = getMonthBoundsIso(periodMonth);

  const att = getMonthlyAttendances(periodMonth).find(
    (m) => m.employee_code === emp.employee_code || m.employee_id === emp.id
  );
  const standardDays =
    att?.standard_work_days ?? MOCK_PAYROLL_FORMULA.standard_work_days_per_month;
  const estimatedDaysUpToLast = Math.min(
    standardDays,
    Math.max(1, countWeekdaysInRange(firstDay, approvedLastDay))
  );
  const actualPaidDays = att
    ? Math.min(
        standardDays,
        Math.max(1, att.actual_work_days + att.paid_leave_days)
      )
    : estimatedDaysUpToLast;

  // Unused annual leave payout
  const leaveBal = getLeaveBalances(yearNum).find(
    (b) => b.employee_id === emp.id || b.employee_code === emp.employee_code
  );
  const unusedLeaveDays = Math.max(0, leaveBal?.remaining_days ?? 0);
  const dailyWage = emp.base_salary_vnd / standardDays;
  const unusedLeavePayoutVnd = Math.round(unusedLeaveDays * dailyWage);

  if (leaveBal && unusedLeaveDays > 0) {
    saveLeaveBalance({
      ...leaveBal,
      remaining_days: 0,
      pending_days: 0,
    });
  }

  const proratedBaseVnd = Math.round(
    (emp.base_salary_vnd * actualPaidDays) / standardDays
  );
  const allowanceRatio = actualPaidDays / standardDays;
  const mealVnd = Math.round(emp.allowance_meal_vnd * allowanceRatio);
  const transportVnd = Math.round(emp.allowance_transport_vnd * allowanceRatio);
  const positionVnd = Math.round(emp.allowance_position_vnd * allowanceRatio);

  const hourlyWage = emp.base_salary_vnd / (standardDays * 8);
  const otPayVnd = att
    ? Math.round(
        att.overtime_hours_weekday * hourlyWage * 1.5 +
          att.overtime_hours_weekend * hourlyWage * 2.0 +
          att.overtime_hours_holiday * hourlyWage * 3.0
      )
    : 0;

  const grossSalaryVnd =
    proratedBaseVnd +
    mealVnd +
    transportVnd +
    positionVnd +
    otPayVnd +
    unusedLeavePayoutVnd;

  const isProbation =
    resignation.contract_type === 'PROBATION_2M' ||
    emp.employment_status === 'PROBATION';
  const unpaidDaysInMonth = Math.max(0, standardDays - actualPaidDays);
  const exemptInsuranceForShortMonth = unpaidDaysInMonth >= 14;

  const insuranceBaseVnd =
    isProbation || exemptInsuranceForShortMonth
      ? 0
      : Math.min(
          emp.base_salary_vnd,
          MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd
        );
  const bhxhVnd = Math.round(
    insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhxh_employee_rate
  );
  const bhytVnd = Math.round(
    insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhyt_employee_rate
  );
  const bhtnVnd = Math.round(
    insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhtn_employee_rate
  );
  const totalInsuranceVnd = bhxhVnd + bhytVnd + bhtnVnd;

  const personalDeduction = MOCK_PAYROLL_FORMULA.personal_deduction_vnd;
  const dependentDeduction =
    emp.dependents_count * MOCK_PAYROLL_FORMULA.dependent_deduction_vnd;
  const taxableIncomeVnd = Math.max(
    0,
    grossSalaryVnd - totalInsuranceVnd - personalDeduction - dependentDeduction
  );
  const pitTaxVnd = calculateProgressivePitVnd(taxableIncomeVnd);

  const penaltyDeductionVnd = clearance?.total_penalty_vnd ?? 0;
  const advanceDeductionVnd = clearance?.advance_deduction_vnd ?? 0;
  const netSalaryVnd = Math.max(
    0,
    grossSalaryVnd -
      totalInsuranceVnd -
      pitTaxVnd -
      penaltyDeductionVnd -
      advanceDeductionVnd
  );
  const employerTotalCostVnd =
    grossSalaryVnd + Math.round(insuranceBaseVnd * 0.235);

  const finalPayroll: PayrollRecord = {
    id: `pay-final-${Date.now()}`,
    payslip_code: `PS-FINAL-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
    period_month: periodMonth,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    position_name: emp.position_name,
    bank_name: emp.bank_name || 'Vietcombank',
    bank_account_no: emp.bank_account_no || '-',
    standard_days: standardDays,
    actual_paid_days: actualPaidDays,
    dependents_count: emp.dependents_count,
    base_salary_vnd: emp.base_salary_vnd,
    prorated_base_salary_vnd: proratedBaseVnd,
    allowance_meal_vnd: mealVnd,
    allowance_transport_vnd: transportVnd,
    allowance_position_vnd: positionVnd,
    overtime_pay_vnd: otPayVnd,
    kpi_bonus_vnd: 0,
    gross_salary_vnd: grossSalaryVnd,
    insurance_base_vnd: insuranceBaseVnd,
    bhxh_employee_vnd: bhxhVnd,
    bhyt_employee_vnd: bhytVnd,
    bhtn_employee_vnd: bhtnVnd,
    total_insurance_employee_vnd: totalInsuranceVnd,
    personal_deduction_vnd: personalDeduction,
    dependent_deduction_vnd: dependentDeduction,
    taxable_income_vnd: taxableIncomeVnd,
    pit_tax_vnd: pitTaxVnd,
    net_salary_vnd: netSalaryVnd,
    employer_total_cost_vnd: employerTotalCostVnd,
    payment_status: 'PAID',
    paid_at: nowIso,
    contract_type: resignation.contract_type,
    unused_leave_days: unusedLeaveDays,
    unused_leave_payout_vnd: unusedLeavePayoutVnd,
    penalty_deduction_vnd: penaltyDeductionVnd,
    advance_deduction_vnd: advanceDeductionVnd,
    is_final_settlement: true,
    calculation_note: `Quyết toán cuối cùng đến ngày ${approvedLastDay}: +${unusedLeaveDays} ngày phép tồn (${unusedLeavePayoutVnd.toLocaleString('vi-VN')} đ), khấu trừ bồi thường tài sản ${penaltyDeductionVnd.toLocaleString('vi-VN')} đ, tạm ứng ${advanceDeductionVnd.toLocaleString('vi-VN')} đ.`,
  };
  savePayrollRecord(finalPayroll);

  // Expire all active contracts of this employee
  for (const contract of getContracts()) {
    if (
      (contract.employee_id === emp.id ||
        contract.employee_code === emp.employee_code) &&
      contract.status !== 'EXPIRED'
    ) {
      saveContract({
        ...contract,
        status: 'EXPIRED',
        end_date: approvedLastDay,
        days_until_expiry: 0,
      });
    }
  }

  // Transition Employee to RESIGNED while preserving 100% historical records
  const resignedEmployee: Employee = {
    ...emp,
    employment_status: 'RESIGNED',
    resigned_date: approvedLastDay,
    approved_last_day: approvedLastDay,
    contract_status: 'EXPIRED',
    is_rehireable: params.isRehireable,
    rehire_note:
      params.rehireNote?.trim() ||
      (params.isRehireable
        ? 'Nghỉ việc đúng quy định, bàn giao tốt — đủ điều kiện tuyển dụng lại (Re-hire).'
        : 'Không khuyến nghị tuyển dụng lại theo đánh giá khi thanh lý hợp đồng.'),
  };
  saveRuntimeEmployee(resignedEmployee);

  // Lock SystemUserAccount immediately (is_active = false, account_status = 'LOCKED')
  const lockedUser = setUserActiveByEmployee({
    employeeId: emp.id,
    employeeCode: emp.employee_code,
    email: emp.email,
    fullName: emp.full_name,
    departmentName: emp.department_name,
    positionName: emp.position_name,
    roleCode: emp.role_code,
    isActive: false,
    targetStatus: 'LOCKED',
    reason: `Đã tất toán hợp đồng & nghỉ việc từ ngày ${approvedLastDay}`,
    actorName: params.actorName,
  });

  const completedResignation = saveResignationInternal({
    ...resignation,
    status: 'COMPLETED',
    is_rehireable: params.isRehireable,
    rehire_note: resignedEmployee.rehire_note,
    final_payslip_id: finalPayroll.id,
    settled_at: nowIso,
  });

  pushNotification({
    title: `Hoàn tất Quyết toán nghỉ việc: ${emp.full_name} (${emp.employee_code})`,
    message: `Phiếu lương quyết toán ${finalPayroll.payslip_code} (${netSalaryVnd.toLocaleString('vi-VN')} đ) đã khóa & thanh toán. Nhân sự chuyển sang RESIGNED và tài khoản đã khóa.`,
    category: 'OFFBOARDING',
    target_roles: ['HR_MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
    nav_id: 'offboarding',
    entity_id: completedResignation.id,
  });

  recordAuditLog({
    actor_name: params.actorName,
    actor_code: 'HR-SETTLE',
    actor_role: 'HR_MANAGER',
    action: 'FINAL_SETTLEMENT',
    target: `${emp.employee_code} · ${finalPayroll.payslip_code}`,
    detail: `Hoàn tất Quyết toán cuối cùng (Net: ${netSalaryVnd.toLocaleString('vi-VN')} đ, phép tồn: ${unusedLeaveDays} ngày, phạt TS: ${penaltyDeductionVnd.toLocaleString('vi-VN')} đ). Chuyển sang RESIGNED (is_rehireable=${params.isRehireable}) và khóa đăng nhập.`,
  });

  return {
    resignation: completedResignation,
    finalPayroll,
    employee: resignedEmployee,
    lockedUser,
  };
}

export function checkCandidateRehireWarning(params: {
  email?: string;
  nationalId?: string;
  phone?: string;
}): {
  matchedFormerEmployee: Employee | null;
  isRehireable: boolean | null;
  rehireNote?: string;
} {
  const emailNeedle = params.email?.trim().toLowerCase();
  const idNeedle = params.nationalId?.trim();
  const phoneNeedle = params.phone?.trim();

  const former =
    getAllRuntimeEmployees().find((e) => {
      if (e.employment_status !== 'RESIGNED') return false;
      if (
        emailNeedle &&
        (e.email.toLowerCase() === emailNeedle ||
          e.personal_email?.toLowerCase() === emailNeedle)
      ) {
        return true;
      }
      if (idNeedle && e.national_id === idNeedle) return true;
      if (phoneNeedle && e.phone === phoneNeedle) return true;
      return false;
    }) ?? null;

  if (!former) {
    return { matchedFormerEmployee: null, isRehireable: null };
  }

  return {
    matchedFormerEmployee: former,
    isRehireable: former.is_rehireable ?? true,
    rehireNote: former.rehire_note,
  };
}

// ---------------------------------------------------------------------------
// Demo Reset & Cross-Device Sync Registry
// ---------------------------------------------------------------------------

export const STORAGE_BOOT_EPOCH_KEY = 'hrm_runtime_boot_epoch_v1';

export const ALL_RUNTIME_SYNC_KEYS = [
  STORAGE_NOTIFICATIONS_KEY,
  STORAGE_REQUESTS_KEY,
  STORAGE_EMPLOYEES_KEY,
  STORAGE_CANDIDATES_KEY,
  STORAGE_JOBS_KEY,
  STORAGE_ONBOARDING_KEY,
  STORAGE_ASSETS_KEY,
  STORAGE_DEPT_REQUESTS_KEY,
  STORAGE_USERS_KEY,
  STORAGE_PREBOARDING_KEY,
  STORAGE_EMPLOYEE_ASSETS_KEY,
  STORAGE_CONTRACTS_KEY,
  STORAGE_DEPARTMENTS_KEY,
  STORAGE_DAILY_ATTENDANCE_KEY,
  STORAGE_MONTHLY_ATTENDANCE_KEY,
  STORAGE_LEAVE_BALANCES_KEY,
  STORAGE_PAYROLLS_KEY,
  STORAGE_PERFORMANCE_REVIEWS_KEY,
  STORAGE_CAREER_HISTORIES_KEY,
  STORAGE_RESIGNATIONS_KEY,
  STORAGE_HANDOVER_ITEMS_KEY,
  STORAGE_CLEARANCE_CHECKLISTS_KEY,
  STORAGE_BIOMETRIC_CREDS_KEY,
  STORAGE_WIFI_POLICY_KEY,
  'hrm_runtime_audit_logs',
];

// ---------------------------------------------------------------------------
// Biometric Fingerprint Credentials & Same-WiFi Policy Stores
// ---------------------------------------------------------------------------

export const DEFAULT_WIFI_ATTENDANCE_POLICY: WifiAttendancePolicy = {
  id: 'wifi-policy-default',
  wifi_ssid_label: 'WiFi Nội bộ (Cùng mạng Máy chủ)',
  enforce_same_wifi: true,
  require_biometric_for_punch: true,
  allowed_public_ips: [],
  allowed_lan_cidrs: [],
  updated_by: 'Hệ thống HRM',
  updated_at: '2026-11-22T00:00:00Z',
};

export function getBiometricCredentials(
  employeeIdOrCode?: string,
  rpId?: string
): BiometricCredentialRecord[] {
  const all = readStorageArray<BiometricCredentialRecord>(STORAGE_BIOMETRIC_CREDS_KEY) ?? [];
  return all.filter((item) => {
    if (
      employeeIdOrCode &&
      item.employee_id !== employeeIdOrCode &&
      item.employee_code !== employeeIdOrCode
    ) {
      return false;
    }
    if (rpId && item.rp_id !== rpId) {
      return false;
    }
    return true;
  });
}

export function saveBiometricCredential(
  cred: BiometricCredentialRecord
): BiometricCredentialRecord {
  const all = readStorageArray<BiometricCredentialRecord>(STORAGE_BIOMETRIC_CREDS_KEY) ?? [];
  const idx = all.findIndex(
    (item) => item.id === cred.id || item.credential_id === cred.credential_id
  );
  const next =
    idx >= 0 ? all.map((item, i) => (i === idx ? cred : item)) : [cred, ...all];
  writeStorageArray(STORAGE_BIOMETRIC_CREDS_KEY, next);
  return cred;
}

export function removeBiometricCredential(
  idOrCredId: string,
  actorName = 'Nhân sự'
): void {
  const all = readStorageArray<BiometricCredentialRecord>(STORAGE_BIOMETRIC_CREDS_KEY) ?? [];
  const target = all.find(
    (item) => item.id === idOrCredId || item.credential_id === idOrCredId
  );
  if (!target) return;
  const next = all.filter(
    (item) => item.id !== idOrCredId && item.credential_id !== idOrCredId
  );
  writeStorageArray(STORAGE_BIOMETRIC_CREDS_KEY, next);
  recordAuditLog({
    actor_name: actorName,
    actor_code: target.employee_code,
    actor_role: 'EMPLOYEE',
    action: 'BIOMETRIC_REGISTER',
    target: `${target.employee_code} · ${target.device_label}`,
    detail: `Đã gỡ thiết bị vân tay "${target.device_label}" (${target.device_kind} · domain ${target.rp_id}).`,
  });
}

export function getWifiAttendancePolicy(): WifiAttendancePolicy {
  const stored = readStorageArray<WifiAttendancePolicy>(STORAGE_WIFI_POLICY_KEY);
  const first = stored?.[0];
  if (!first) {
    return {
      ...DEFAULT_WIFI_ATTENDANCE_POLICY,
      allowed_public_ips: [],
      allowed_lan_cidrs: [],
    };
  }
  return {
    ...DEFAULT_WIFI_ATTENDANCE_POLICY,
    ...first,
    allowed_public_ips: Array.isArray(first.allowed_public_ips)
      ? first.allowed_public_ips
      : [],
    allowed_lan_cidrs: Array.isArray(first.allowed_lan_cidrs)
      ? first.allowed_lan_cidrs
      : [],
  };
}

export function saveWifiAttendancePolicy(
  patch: Partial<WifiAttendancePolicy>,
  actorName = 'Quản trị hệ thống'
): WifiAttendancePolicy {
  const current = getWifiAttendancePolicy();
  const next: WifiAttendancePolicy = {
    ...current,
    ...patch,
    id: 'wifi-policy-default',
    allowed_public_ips: Array.isArray(patch.allowed_public_ips)
      ? patch.allowed_public_ips
      : current.allowed_public_ips,
    allowed_lan_cidrs: Array.isArray(patch.allowed_lan_cidrs)
      ? patch.allowed_lan_cidrs
      : current.allowed_lan_cidrs,
    updated_by: actorName,
    updated_at: new Date().toISOString(),
  };
  writeStorageArray(STORAGE_WIFI_POLICY_KEY, [next]);
  recordAuditLog({
    actor_name: actorName,
    actor_code: 'SYS-WIFI',
    actor_role: 'SUPER_ADMIN',
    action: 'UPDATE_PERMISSION',
    module: 'Chấm công & Ca làm',
    target: `Chính sách WiFi (${next.wifi_ssid_label})`,
    detail: `Cập nhật chính sách chấm công: Bắt buộc chung WiFi=${next.enforce_same_wifi ? 'BẬT' : 'TẮT'}, Bắt buộc vân tay=${next.require_biometric_for_punch ? 'BẬT' : 'TẮT'}, Public IP=${next.allowed_public_ips.join(', ') || 'Tự động khớp máy chủ'}.`,
  });
  return next;
}

function clearStaleRuntimeAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const savedRole = (window.localStorage.getItem('lacviet_hrm_role') || '').trim();
    const savedProfileRaw = window.localStorage.getItem('lacviet_hrm_profile');
    const savedEmail = (window.localStorage.getItem('lacviet_hrm_email') || '')
      .trim()
      .toLowerCase();
    const appliedCandidateEmail = window.localStorage.getItem('lacviet_applied_candidate_email');

    if (!savedRole && !savedProfileRaw && !savedEmail && !appliedCandidateEmail) {
      return;
    }

    let parsedProfile: { employee_code?: string; email?: string } | null = null;
    if (savedProfileRaw) {
      try {
        parsedProfile = JSON.parse(savedProfileRaw) as {
          employee_code?: string;
          email?: string;
        };
      } catch {
        parsedProfile = null;
      }
    }

    const empCode = (parsedProfile?.employee_code || '').trim().toUpperCase();
    const profileEmail = (parsedProfile?.email || savedEmail).trim().toLowerCase();

    const matchedMockEmp =
      empCode.length > 0 && profileEmail.length > 0
        ? MOCK_EMPLOYEES.find(
            (e) =>
              e.employee_code.trim().toUpperCase() === empCode &&
              e.email.trim().toLowerCase() === profileEmail &&
              e.employment_status === 'ACTIVE'
          )
        : undefined;

    const matchedMockUser =
      empCode.length > 0 && profileEmail.length > 0
        ? MOCK_SYSTEM_USERS.find(
            (u) =>
              u.employee_code.trim().toUpperCase() === empCode &&
              u.email.trim().toLowerCase() === profileEmail &&
              u.account_status === 'ACTIVE'
          )
        : undefined;

    const isLockedMockUser =
      (empCode.length > 0 || profileEmail.length > 0) &&
      MOCK_SYSTEM_USERS.some(
        (u) =>
          (empCode.length > 0 && u.employee_code.trim().toUpperCase() === empCode) ||
          (profileEmail.length > 0 && u.email.trim().toLowerCase() === profileEmail)
      ) &&
      !matchedMockUser;

    const isValidActiveMockSession =
      savedRole !== 'CANDIDATE' &&
      !isLockedMockUser &&
      Boolean(matchedMockEmp || matchedMockUser);

    if (!isValidActiveMockSession) {
      window.localStorage.removeItem('lacviet_hrm_role');
      window.localStorage.removeItem('lacviet_hrm_email');
      window.localStorage.removeItem('lacviet_hrm_profile');
      window.localStorage.removeItem('lacviet_applied_candidate_email');
      if (typeof document !== 'undefined') {
        document.cookie = 'hrm_role=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'hrm_token=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'hrm_active=; path=/; max-age=0; SameSite=Lax';
      }
    }
  } catch {
    // Ignore storage or cookie errors
  }
}

export function resetAllDemoRuntimeData(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const keysToRemove = [...ALL_RUNTIME_SYNC_KEYS, 'hrm_audit_logs_v1'];
    for (const key of keysToRemove) {
      lastLocalWriteAt[key] = now;
      window.localStorage.removeItem(key);
    }
    clearStaleRuntimeAuthSession();
    if (typeof fetch === 'function') {
      const resetPayload: Record<string, unknown[]> = Object.create(null);
      for (const key of ALL_RUNTIME_SYNC_KEYS) {
        if (/^hrm_runtime_[a-z0-9_]+$/.test(key)) {
          resetPayload[key] = [];
        }
      }
      fetch('/api/hrm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: resetPayload, resetStore: true }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.bootEpoch === 'string' && data.bootEpoch.length > 0) {
            try {
              window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
            } catch {
              // Ignore storage errors
            }
          }
        })
        .catch(() => {});
    }
    window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
    window.dispatchEvent(new CustomEvent('hrm-audit-updated'));
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Multi-Device Cross-Device Realtime Sync (PC <-> DevTunnels Mobile)
// ---------------------------------------------------------------------------

function extractSyncIdentity(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const obj = item as Record<string, unknown>;
  if (typeof obj.id === 'string' && obj.id.trim()) return `id:${obj.id.trim()}`;
  if (typeof obj.token === 'string' && obj.token.trim()) return `token:${obj.token.trim()}`;
  if (typeof obj.candidate_code === 'string' && obj.candidate_code.trim()) {
    return `cand:${obj.candidate_code.trim()}`;
  }
  if (typeof obj.employee_code === 'string' && obj.employee_code.trim()) {
    return `emp:${obj.employee_code.trim()}`;
  }
  return '';
}

function mergeServerWithUnsyncedLocal(
  serverItems: unknown[],
  localItems: unknown[] | null
): unknown[] {
  if (!localItems || localItems.length === 0) return serverItems;
  if (serverItems.length === 0) return localItems;

  const serverIdentities = new Set<string>();
  for (const item of serverItems) {
    const identity = extractSyncIdentity(item);
    if (identity) serverIdentities.add(identity);
  }

  const unsyncedLocal: unknown[] = [];
  for (const localItem of localItems) {
    const identity = extractSyncIdentity(localItem);
    if (identity && !serverIdentities.has(identity)) {
      serverIdentities.add(identity);
      unsyncedLocal.push(localItem);
    }
  }

  return unsyncedLocal.length > 0 ? [...unsyncedLocal, ...serverItems] : serverItems;
}

export function initRuntimeSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const ALL_SYNC_KEYS = ALL_RUNTIME_SYNC_KEYS;

  const doSync = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/hrm/sync');
      if (!res.ok) return false;
      const data = await res.json();
      const serverStores =
        data?.stores && typeof data.stores === 'object'
          ? (data.stores as Record<string, unknown>)
          : null;

      if (typeof data?.bootEpoch === 'string' && data.bootEpoch.length > 0) {
        const storedEpoch = window.localStorage.getItem(STORAGE_BOOT_EPOCH_KEY);
        if (storedEpoch !== data.bootEpoch) {
          const serverHasNonEmptyData =
            Boolean(serverStores) &&
            Object.values(serverStores as Record<string, unknown>).some(
              (v) => Array.isArray(v) && v.length > 0
            );
          const hasRecentLocalWrite = Object.values(lastLocalWriteAt).some(
            (ts) => Date.now() - ts < 5 * 60 * 1000
          );
          const shouldResetClientStore =
            Boolean(storedEpoch) || (!serverHasNonEmptyData && !hasRecentLocalWrite);

          if (!shouldResetClientStore) {
            window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
          } else {
            const keysToRemove = [...ALL_RUNTIME_SYNC_KEYS, 'hrm_audit_logs_v1'];
            for (const key of keysToRemove) {
              window.localStorage.removeItem(key);
            }
            for (const k of Object.keys(lastLocalWriteAt)) {
              delete lastLocalWriteAt[k];
            }
            clearStaleRuntimeAuthSession();
            window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
            if (serverStores) {
              for (const [key, items] of Object.entries(serverStores)) {
                if (Array.isArray(items) && items.length > 0) {
                  window.localStorage.setItem(key, JSON.stringify(items));
                }
              }
            }
            emitRuntimeUpdated();
            window.dispatchEvent(new CustomEvent('hrm-audit-updated'));
            return true;
          }
        }
      }

      if (serverStores) {
        let changed = false;
        for (const [key, items] of Object.entries(serverStores)) {
          if (Date.now() - (lastLocalWriteAt[key] || 0) < 4000) {
            continue;
          }
          if (items && Array.isArray(items)) {
            const localItems = readStorageArray<unknown>(key);
            const mergedItems = mergeServerWithUnsyncedLocal(items, localItems);
            const currentStr = window.localStorage.getItem(key);
            const newStr = JSON.stringify(mergedItems);
            if (currentStr !== newStr) {
              window.localStorage.setItem(key, newStr);
              changed = true;
            }
          }
        }
        if (changed) {
          emitRuntimeUpdated();
        }
      }
      return false;
    } catch {
      // Ignore network errors
      return false;
    }
  };

  // 1. Helper: push local items to server only when bootEpoch matches
  const pushIfServerEmpty = async () => {
    try {
      const res = await fetch('/api/hrm/sync');
      if (!res.ok) return;
      const data = await res.json();
      if (
        typeof data?.bootEpoch === 'string' &&
        data.bootEpoch.length > 0 &&
        !window.localStorage.getItem(STORAGE_BOOT_EPOCH_KEY)
      ) {
        window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, data.bootEpoch);
      }
      const serverStores = data?.stores || {};
      const pushPayload: Record<string, unknown> = {};
      for (const k of ALL_SYNC_KEYS) {
        if (!serverStores[k] || (Array.isArray(serverStores[k]) && serverStores[k].length === 0)) {
          const localVal = readStorageArray(k);
          if (localVal && localVal.length > 0) {
            pushPayload[k] = localVal;
          }
        }
      }
      if (Object.keys(pushPayload).length > 0) {
        fetch('/api/hrm/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSync: pushPayload }),
        })
          .then((postRes) => (postRes.ok ? postRes.json() : null))
          .then((postData) => {
            if (
              postData &&
              typeof postData.bootEpoch === 'string' &&
              postData.bootEpoch.length > 0
            ) {
              try {
                window.localStorage.setItem(STORAGE_BOOT_EPOCH_KEY, postData.bootEpoch);
              } catch {
                // Ignore storage errors
              }
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore errors
    }
  };

  // 2. Initial pull sequentially before deciding whether to push local store
  void doSync().then((epochChanged) => {
    if (!epochChanged) {
      void pushIfServerEmpty();
    }
  });

  // 3. Periodic polling every 3s + sync on focus/visibilitychange
  const timer = setInterval(doSync, 3000);
  const handleFocus = () => doSync();
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleFocus);

  return () => {
    clearInterval(timer);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleFocus);
  };
}
