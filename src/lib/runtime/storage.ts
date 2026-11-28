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

export function emitRuntimeUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
}

export function cloneJson<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

export function readStorageArray<T>(key: string): T[] | null {
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

export const lastLocalWriteAt: Record<string, number> = {};

export function writeStorageArray<T>(key: string, items: T[]): void {
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

export function matchesDepartmentScope(
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

// ---------------------------------------------------------------------------
// Candidate -> Employee + Onboarding + Asset Assignment + Notification
// ---------------------------------------------------------------------------
export function addTwoMonthsIso(startDateIso: string): string {
  const base = new Date(startDateIso);
  if (Number.isNaN(base.getTime())) {
    return '2027-01-18';
  }
  base.setMonth(base.getMonth() + 2);
  return base.toISOString().slice(0, 10);
}

export function buildInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Shared Helpers: Runtime Departments & Employees
// ---------------------------------------------------------------------------
export function addDaysIso(dateIso: string, days: number): string {
  const parts = dateIso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return utc.toISOString().slice(0, 10);
}

export function addMonthsIso(dateIso: string, months: number): string {
  const parts = dateIso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return '2027-11-30';
  }
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1 + months, parts[2] - 1));
  return utc.toISOString().slice(0, 10);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const f = fromIso.slice(0, 10).split('-').map(Number);
  const t = toIso.slice(0, 10).split('-').map(Number);
  if (f.length !== 3 || t.length !== 3) return 0;
  const fromUtc = Date.UTC(f[0], f[1] - 1, f[2]);
  const toUtc = Date.UTC(t[0], t[1] - 1, t[2]);
  return Math.round((toUtc - fromUtc) / 86400000);
}

export function normalizeEmailSlug(fullName: string): string {
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

export function countWeekdaysInRange(startIso: string, endIso: string): number {
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

export function getMonthBoundsIso(periodMonth: string): {
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
