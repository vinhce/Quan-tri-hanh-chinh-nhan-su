import type { AuditLogEntry, RoleCode } from '@/mock/types';

const STORAGE_AUDIT_KEY = 'hrm_runtime_audit_logs';
const MAX_AUDIT_LOGS = 100;
export const AUDIT_UPDATED_EVENT = 'hrm-audit-updated';

export interface RecordAuditLogInput {
  actor_name: string;
  actor_code: string;
  actor_role: RoleCode;
  action: AuditLogEntry['action'] | string;
  target: string;
  detail: string;
  status?: 'SUCCESS' | 'WARNING' | 'BLOCKED';
  module?: string;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function inferModuleFromAction(action: string): string {
  switch (action) {
    case 'LOGIN':
    case 'ACTIVATE_USER':
    case 'LOCK_USER':
      return 'Xác thực & Phiên';
    case 'APPROVE_LEAVE':
    case 'CREATE_REQUEST':
    case 'CHECK_IN_OUT':
    case 'BIOMETRIC_REGISTER':
    case 'BIOMETRIC_CHECK_IN_OUT':
    case 'WIFI_CHECK_BLOCKED':
    case 'ATTENDANCE_IMPORT':
      return 'TIME_ATTENDANCE';
    case 'LOCK_PAYROLL':
    case 'EXPORT_SALARY':
    case 'CALCULATE_PAYROLL':
      return 'PAYROLL_TAX_INSURANCE';
    case 'UPDATE_PERMISSION':
      return 'RBAC_SYSTEM_CONFIG';
    case 'AI_CV_SCREEN':
      return 'AI_ATS_RECRUITMENT';
    case 'UPDATE_CONTRACT':
    case 'PREBOARDING_SUBMIT':
    case 'ONBOARDING_TASK':
    case 'PROBATION_TO_OFFICIAL':
      return 'CORE_HR_PROFILE';
    case 'PERFORMANCE_REVIEW':
    case 'CAREER_PROGRESSION':
      return 'PERFORMANCE_CAREER';
    case 'SUBMIT_RESIGNATION':
    case 'APPROVE_RESIGNATION':
    case 'HANDOVER_CONFIRM':
    case 'MANAGER_REASSIGN':
    case 'CLEARANCE_SIGNOFF':
    case 'FINAL_SETTLEMENT':
      return 'OFFBOARDING_SETTLEMENT';
    default:
      return 'Hệ thống';
  }
}

export function getRuntimeAuditLogs(): AuditLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordAuditLog(entry: RecordAuditLogInput): AuditLogEntry | null {
  if (typeof window === 'undefined') return null;
  const now = new Date();
  const randSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const newLog: AuditLogEntry = {
    id: `aud-rt-${now.getTime()}-${randSuffix}`,
    log_code: `AUD-${String(now.getTime()).slice(-6)}`,
    timestamp: formatTimestamp(now),
    actor_employee_code: entry.actor_code,
    actor_name: entry.actor_name,
    actor_role: entry.actor_role,
    ip_address: '10.24.18.42',
    action: entry.action as AuditLogEntry['action'],
    module: entry.module ?? inferModuleFromAction(entry.action),
    target_entity: entry.target,
    status: entry.status ?? 'SUCCESS',
    detail: entry.detail,
  };

  try {
    const existing = getRuntimeAuditLogs();
    const updated = [newLog, ...existing].slice(0, MAX_AUDIT_LOGS);
    window.localStorage.setItem(STORAGE_AUDIT_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(AUDIT_UPDATED_EVENT));
    if (typeof fetch === 'function') {
      fetch('/api/hrm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: STORAGE_AUDIT_KEY, items: updated }),
      }).catch(() => {});
    }
  } catch {
    // Ignore storage quota / access errors
  }

  return newLog;
}

export function clearRuntimeAuditLogs(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_AUDIT_KEY);
    window.dispatchEvent(new CustomEvent(AUDIT_UPDATED_EVENT));
  } catch {
    // Ignore storage errors
  }
}
