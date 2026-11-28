import {
  MOCK_SYSTEM_USERS,
} from '@/mock/admin';
import type {
  Employee,
  PreboardingInvite,
  RoleCode,
  SystemUserAccount,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getAllRuntimeEmployees,
} from './core-entities';
import {
  getPreboardingInvites,
} from './onboarding-store';
import {
  STORAGE_USERS_KEY,
  normalizeEmailSlug,
  readStorageArray,
  writeStorageArray,
} from './storage';

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

export function emailsMatchInternalAlias(
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

export function findLinkedEmployeeForPreboarding(
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
