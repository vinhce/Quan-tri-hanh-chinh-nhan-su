import { MOCK_DEPARTMENTS, MOCK_EMPLOYEES } from '@/mock/employees';
import {
  MOCK_COMPANY_ASSETS,
  MOCK_INITIAL_NOTIFICATIONS,
  MOCK_ONBOARDING_RECORDS,
} from '@/mock/onboarding';
import type {
  Candidate,
  CompanyAsset,
  Employee,
  HrmNotification,
  LeaveOvertimeRequest,
  OnboardingChecklistItem,
  OnboardingRecord,
  RoleCode,
} from '@/mock/types';

export const HRM_RUNTIME_EVENT = 'hrm-runtime-updated';

const STORAGE_NOTIFICATIONS_KEY = 'hrm_runtime_notifications_v1';
const STORAGE_REQUESTS_KEY = 'hrm_runtime_requests_v1';
const STORAGE_EMPLOYEES_KEY = 'hrm_runtime_employees_v1';
const STORAGE_CANDIDATES_KEY = 'hrm_runtime_candidates_v1';
const STORAGE_ONBOARDING_KEY = 'hrm_runtime_onboarding_v1';
const STORAGE_ASSETS_KEY = 'hrm_runtime_assets_v1';

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

function writeStorageArray<T>(key: string, items: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    emitRuntimeUpdated();
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

export function generateNextEmployeeCode(existingEmployees: Employee[]): string {
  const combined = [
    ...MOCK_EMPLOYEES,
    ...existingEmployees,
    ...readRuntimeEmployees(),
  ];

  let maxNumber = 27;
  for (const emp of combined) {
    const match = /^NV-\d{4}-(\d+)$/i.exec(emp.employee_code.trim());
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

function readRuntimeCandidates(): Candidate[] {
  return readStorageArray<Candidate>(STORAGE_CANDIDATES_KEY) ?? [];
}

export function mergeWithRuntimeCandidates(baseCandidates: Candidate[]): Candidate[] {
  const runtimeList = readRuntimeCandidates();
  if (runtimeList.length === 0) return baseCandidates;

  const baseIds = new Set(baseCandidates.map((c) => c.id));
  const baseCodes = new Set(baseCandidates.map((c) => c.candidate_code));

  const replacedBase = baseCandidates.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.candidate_code === baseItem.candidate_code
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.candidate_code)
  );

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeCandidate(cand: Candidate): void {
  const current = readRuntimeCandidates();
  const idx = current.findIndex(
    (item) => item.id === cand.id || item.candidate_code === cand.candidate_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? cand : item))
      : [cand, ...current];
  writeStorageArray(STORAGE_CANDIDATES_KEY, updated);
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
  const nowIso = new Date().toISOString();

  const updatedChecklist = target.checklist.map((chk) => {
    if (chk.id !== itemId) return chk;
    itemFound = true;
    const nextCompleted = !chk.completed;
    return {
      ...chk,
      completed: nextCompleted,
      completed_at: nextCompleted ? nowIso : undefined,
      completed_by: nextCompleted ? actorName : undefined,
    };
  });

  if (!itemFound) return null;

  const updatedRecord: OnboardingRecord = {
    ...target,
    checklist: updatedChecklist,
  };

  const nextRecords = current.map((item, idx) =>
    idx === recordIdx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);
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

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        STORAGE_ONBOARDING_KEY,
        JSON.stringify(nextRecords)
      );
    } catch {
      // Ignore storage errors
    }
  }

  // Promote corresponding employee from PROBATION to ACTIVE in runtime employees if applicable
  const allKnownEmployees = mergeWithRuntimeEmployees(MOCK_EMPLOYEES);
  const matchedEmp = allKnownEmployees.find(
    (emp) =>
      emp.id === target.employee_id ||
      emp.employee_code === target.employee_code
  );

  if (matchedEmp && matchedEmp.employment_status === 'PROBATION') {
    const promotedEmployee: Employee = {
      ...matchedEmp,
      employment_status: 'ACTIVE',
      contract_type:
        matchedEmp.contract_type === 'PROBATION_2M'
          ? 'FIXED_TERM_12M'
          : matchedEmp.contract_type,
      contract_status: 'ACTIVE',
    };
    saveRuntimeEmployee(promotedEmployee);
  } else {
    emitRuntimeUpdated();
  }

  return updatedRecord;
}

// ---------------------------------------------------------------------------
// Company Assets
// ---------------------------------------------------------------------------

export function getCompanyAssets(): CompanyAsset[] {
  const stored = readStorageArray<CompanyAsset>(STORAGE_ASSETS_KEY);
  if (stored) return stored;
  return cloneJson(MOCK_COMPANY_ASSETS);
}

export function assignCompanyAsset(
  assetId: string,
  employee: { employee_code: string; full_name: string; department_id: string },
  assignedDate?: string
): CompanyAsset | null {
  const currentAssets = getCompanyAssets();
  const idx = currentAssets.findIndex(
    (item) => item.id === assetId || item.asset_code === assetId
  );
  if (idx < 0) return null;

  const assignedAtDate = assignedDate ?? new Date().toISOString().slice(0, 10);
  const updatedAsset: CompanyAsset = {
    ...currentAssets[idx],
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
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          STORAGE_ONBOARDING_KEY,
          JSON.stringify(nextOnboarding)
        );
      } catch {
        // Ignore storage errors
      }
    }
  }

  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);
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
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            STORAGE_ONBOARDING_KEY,
            JSON.stringify(nextOnboarding)
          );
        } catch {
          // Ignore storage errors
        }
      }
    }
  }

  writeStorageArray(STORAGE_ASSETS_KEY, nextAssets);
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

export function initiateCandidateOnboarding(params: {
  candidate: Candidate;
  employeeCode: string;
  email: string;
  departmentId: string;
  departmentName: string;
  positionName: string;
  managerName: string;
  startDate: string;
  baseSalaryVnd: number;
  assetIds: string[];
  actorName: string;
}): { employee: Employee; onboarding: OnboardingRecord } {
  const nowIso = new Date().toISOString();
  const stamp = String(Date.now()).slice(-6);

  // 1. Update candidate stage to ONBOARDED
  const updatedCandidate: Candidate = {
    ...params.candidate,
    stage: 'ONBOARDED',
  };
  saveRuntimeCandidate(updatedCandidate);

  // 2. Create PROBATION employee in runtime employees
  const deptRef = MOCK_DEPARTMENTS.find((d) => d.id === params.departmentId);
  const shiftCode = params.departmentId.startsWith('dept-tech')
    ? 'HC-08:30'
    : params.departmentId === 'dept-sales'
      ? 'FLEX-09:00'
      : 'HC-08:00';

  const newEmployee: Employee = {
    id: `emp-rt-${Date.now()}`,
    employee_code: params.employeeCode,
    full_name: params.candidate.full_name,
    email: params.email,
    phone: params.candidate.phone || '0901234567',
    gender: 'Nam',
    date_of_birth: '1998-06-15',
    national_id: `079098${stamp}`,
    tax_code: `8649${stamp}`,
    social_insurance_no: `7926${stamp}`,
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
    contract_end_date: addTwoMonthsIso(params.startDate),
    contract_status: 'ACTIVE',
    base_salary_vnd: params.baseSalaryVnd,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 600000,
    allowance_position_vnd: 0,
    dependents_count: 0,
    bank_account_no: `190388${stamp}01`,
    bank_name: 'Techcombank',
    work_shift_code: shiftCode,
    kpi_completion_rate: 88,
    burnout_risk_score: 18,
    burnout_risk_level: 'LOW',
    turnover_risk_score: 14,
    turnover_risk_level: 'LOW',
    ai_retention_note: `Tiếp nhận từ quy trình ATS (${params.candidate.candidate_code}), đang trong lộ trình hội nhập thử việc.`,
    avatar_initials: buildInitials(params.candidate.full_name),
  };
  saveRuntimeEmployee(newEmployee);

  // 3. Assign selected company assets
  const assignedIds: string[] = [];
  let hasAccessCardAssigned = false;
  for (const assetId of params.assetIds) {
    const assigned = assignCompanyAsset(
      assetId,
      {
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
      title: 'Khởi tạo email doanh nghiệp, tài khoản SSO và quyền truy cập kho lưu trữ',
      assignee_role_label: 'Bộ phận CNTT (IT Helpdesk)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-it-2`,
      group: 'IT',
      title: 'Cấu hình VPN bảo mật, chứng chỉ thiết bị đầu cuối và công cụ chuyên môn',
      assignee_role_label: 'Bộ phận CNTT (IT Security)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-1`,
      group: 'ADMIN',
      title: 'Bàn giao máy tính làm việc và thiết bị công tác tiêu chuẩn',
      assignee_role_label: 'Hành chính & Quản trị thiết bị',
      completed: hasHardwareAssigned,
      completed_at: hasHardwareAssigned ? nowIso : undefined,
      completed_by: hasHardwareAssigned ? params.actorName : undefined,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-2`,
      group: 'ADMIN',
      title: 'Cấp thẻ từ ra vào tòa nhà và đăng ký sinh trắc học chấm công',
      assignee_role_label: 'Hành chính Văn phòng',
      completed: hasAccessCardAssigned,
      completed_at: hasAccessCardAssigned ? nowIso : undefined,
      completed_by: hasAccessCardAssigned ? params.actorName : undefined,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-1`,
      group: 'HR',
      title: 'Ký kết hợp đồng thử việc 02 tháng và thỏa thuận bảo mật thông tin (NDA)',
      assignee_role_label: 'Phòng Nhân sự (C&B)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-2`,
      group: 'HR',
      title: 'Phổ biến nội quy lao động, chính sách phúc lợi và quy trình đăng ký nghỉ phép',
      assignee_role_label: 'Phòng Nhân sự (L&D)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-1`,
      group: 'MANAGER',
      title: 'Giới thiệu nhân sự mới với đội ngũ và phân công người đồng hành (Buddy)',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-2`,
      group: 'MANAGER',
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
  };

  saveOnboardingRecord(newOnboarding);

  // 5. Notify DEPT_MANAGER (scoped to departmentId), HR_MANAGER, SUPER_ADMIN and new employeeCode
  const assetSummary =
    assignedIds.length > 0
      ? `, đã bàn giao ${assignedIds.length} thiết bị công tác`
      : '';

  pushNotification({
    title: `Khởi tạo Onboarding nhân sự mới: ${params.candidate.full_name}`,
    message: `Hồ sơ ${onboardingId} (${params.employeeCode} - ${params.positionName}, ${params.departmentName}${assetSummary}) đã mở lộ trình 8 hạng mục hội nhập.`,
    category: 'ONBOARDING',
    target_roles: ['DEPT_MANAGER', 'HR_MANAGER', 'SUPER_ADMIN'],
    target_department_id: params.departmentId,
    target_employee_codes: [params.employeeCode],
    nav_id: 'onboarding',
    entity_id: onboardingId,
    sub_tab: 'progress',
  });

  return {
    employee: newEmployee,
    onboarding: newOnboarding,
  };
}

// ---------------------------------------------------------------------------
// Demo Reset
// ---------------------------------------------------------------------------

export function resetAllDemoRuntimeData(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove = [
      STORAGE_NOTIFICATIONS_KEY,
      STORAGE_REQUESTS_KEY,
      STORAGE_EMPLOYEES_KEY,
      STORAGE_CANDIDATES_KEY,
      STORAGE_ONBOARDING_KEY,
      STORAGE_ASSETS_KEY,
      'hrm_audit_logs_v1',
      'hrm_runtime_audit_logs',
    ];
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
    window.dispatchEvent(new CustomEvent('hrm-audit-updated'));
  } catch {
    // Ignore storage errors
  }
}
