import {
  MOCK_INITIAL_NOTIFICATIONS,
} from '@/mock/onboarding';
import type {
  HrmNotification,
  RoleCode,
} from '@/mock/types';
import {
  STORAGE_NOTIFICATIONS_KEY,
  cloneJson,
  matchesDepartmentScope,
  readStorageArray,
  writeStorageArray,
} from './storage';

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
