import type {
  Employee,
  RoleCode,
  WorkItem,
  WorkItemStatus,
} from '../../mock/types';
import { MOCK_WORK_ITEMS } from '../../mock/work-items';

export const STORAGE_WORK_ITEMS_KEY = 'hrm_runtime_work_items_v1';
export const WORK_ITEMS_SCHEMA_VERSION = 1;

export interface WorkItemsStorageEnvelope {
  schema_version: number;
  items: WorkItem[];
}

const VALID_STATUSES: ReadonlySet<WorkItemStatus> = new Set<WorkItemStatus>([
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
]);

function normalizeSingleWorkItem(raw: unknown): WorkItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : '';
  const ownerId =
    typeof r.owner_employee_id === 'string' && r.owner_employee_id.trim()
      ? r.owner_employee_id.trim()
      : '';
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : '';
  if (!id || !ownerId || !title) return null;

  const rawStatus = typeof r.status === 'string' ? r.status.trim().toUpperCase() : '';
  const status: WorkItemStatus = VALID_STATUSES.has(rawStatus as WorkItemStatus)
    ? (rawStatus as WorkItemStatus)
    : 'TODO';

  const rawProgress =
    typeof r.progress_percent === 'number' && Number.isFinite(r.progress_percent)
      ? Math.min(100, Math.max(0, Math.round(r.progress_percent)))
      : status === 'DONE'
        ? 100
        : 0;
  const weight =
    typeof r.weight === 'number' && Number.isFinite(r.weight) && r.weight >= 0
      ? Math.round(r.weight)
      : 10;

  return {
    id,
    owner_employee_id: ownerId,
    owner_employee_code:
      typeof r.owner_employee_code === 'string' ? r.owner_employee_code.trim() : undefined,
    department_id:
      typeof r.department_id === 'string' ? r.department_id.trim() : undefined,
    title,
    weight,
    due_date:
      typeof r.due_date === 'string' && r.due_date.trim()
        ? r.due_date.trim()
        : new Date().toISOString().slice(0, 10),
    status,
    progress_percent: status === 'DONE' ? 100 : rawProgress,
    deliverable_url:
      typeof r.deliverable_url === 'string' ? r.deliverable_url.trim() : '',
    handoff_checkpoint:
      typeof r.handoff_checkpoint === 'string' ? r.handoff_checkpoint.trim() : undefined,
    updated_at:
      typeof r.updated_at === 'string' ? r.updated_at : new Date().toISOString(),
  };
}

export function migrateWorkItemsPayload(raw: unknown): WorkItemsStorageEnvelope {
  let listCandidate: unknown[] = [];
  if (Array.isArray(raw)) {
    listCandidate = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      listCandidate = obj.items;
    }
  }

  const normalized = listCandidate
    .map(normalizeSingleWorkItem)
    .filter((item): item is WorkItem => item !== null);

  return {
    schema_version: WORK_ITEMS_SCHEMA_VERSION,
    items: normalized,
  };
}

function readWorkItemsEnvelope(): WorkItemsStorageEnvelope {
  if (typeof window === 'undefined') {
    return {
      schema_version: WORK_ITEMS_SCHEMA_VERSION,
      items: MOCK_WORK_ITEMS.map((item) => ({ ...item })),
    };
  }
  try {
    const rawStr = window.localStorage.getItem(STORAGE_WORK_ITEMS_KEY);
    if (!rawStr) {
      return {
        schema_version: WORK_ITEMS_SCHEMA_VERSION,
        items: MOCK_WORK_ITEMS.map((item) => ({ ...item })),
      };
    }
    const parsed: unknown = JSON.parse(rawStr);
    const migrated = migrateWorkItemsPayload(parsed);
    const needsPersist =
      Array.isArray(parsed) ||
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as Record<string, unknown>).schema_version !== WORK_ITEMS_SCHEMA_VERSION;
    if (needsPersist) {
      writeWorkItemsEnvelope(migrated.items, false);
    }
    return migrated;
  } catch {
    return {
      schema_version: WORK_ITEMS_SCHEMA_VERSION,
      items: MOCK_WORK_ITEMS.map((item) => ({ ...item })),
    };
  }
}

function writeWorkItemsEnvelope(items: WorkItem[], syncRemote = true): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: WorkItemsStorageEnvelope = {
      schema_version: WORK_ITEMS_SCHEMA_VERSION,
      items,
    };
    window.localStorage.setItem(STORAGE_WORK_ITEMS_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('hrm-runtime-updated'));
    if (syncRemote && typeof fetch === 'function') {
      void fetch('/api/hrm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: STORAGE_WORK_ITEMS_KEY, items }),
      }).catch(() => {});
    }
  } catch {
    // Ignore storage errors
  }
}

export function getWorkItems(ownerEmployeeId?: string): WorkItem[] {
  const { items } = readWorkItemsEnvelope();
  if (!ownerEmployeeId) return items;
  return items.filter(
    (w) =>
      w.owner_employee_id === ownerEmployeeId ||
      w.owner_employee_code === ownerEmployeeId
  );
}

export function saveWorkItem(item: WorkItem): WorkItem {
  const normalized = normalizeSingleWorkItem(item) ?? item;
  const current = readWorkItemsEnvelope().items;
  const idx = current.findIndex((w) => w.id === normalized.id);
  const next =
    idx >= 0
      ? current.map((w, i) => (i === idx ? normalized : w))
      : [normalized, ...current];
  writeWorkItemsEnvelope(next, true);
  return normalized;
}

export function updateWorkItem(
  workItemId: string,
  patch: Partial<
    Pick<
      WorkItem,
      'status' | 'progress_percent' | 'deliverable_url' | 'handoff_checkpoint' | 'title' | 'due_date'
    >
  >
): WorkItem | null {
  const current = readWorkItemsEnvelope().items;
  const existing = current.find((w) => w.id === workItemId);
  if (!existing) return null;

  const nextStatus = patch.status ?? existing.status;
  const nextProgress =
    nextStatus === 'DONE'
      ? 100
      : typeof patch.progress_percent === 'number' && Number.isFinite(patch.progress_percent)
        ? Math.min(100, Math.max(0, Math.round(patch.progress_percent)))
        : existing.progress_percent;

  const updated: WorkItem = {
    ...existing,
    ...patch,
    status: nextStatus,
    progress_percent: nextProgress,
    updated_at: new Date().toISOString(),
  };
  return saveWorkItem(updated);
}

export function getWorkItemsForActor(params: {
  role: RoleCode;
  actorEmployee: Employee | null;
  employees: Employee[];
  managedDepartmentIds?: string[];
  allWorkItems?: WorkItem[];
}): WorkItem[] {
  const { role, actorEmployee, employees, managedDepartmentIds, allWorkItems } = params;
  const items = allWorkItems ?? readWorkItemsEnvelope().items;

  if (role === 'SUPER_ADMIN' || role === 'DIRECTOR' || role === 'HR_MANAGER') {
    return items;
  }
  if (role === 'EMPLOYEE') {
    if (!actorEmployee) return [];
    return items.filter(
      (w) =>
        w.owner_employee_id === actorEmployee.id ||
        w.owner_employee_code === actorEmployee.employee_code
    );
  }
  if (role === 'DEPT_MANAGER') {
    if (!actorEmployee) return [];
    const allowedDepts = new Set<string>(
      managedDepartmentIds && managedDepartmentIds.length > 0
        ? managedDepartmentIds
        : actorEmployee.department_id
          ? [actorEmployee.department_id]
          : []
    );
    const allowedEmployeeIds = new Set<string>([actorEmployee.id]);
    for (const emp of employees) {
      if (emp.department_id && allowedDepts.has(emp.department_id)) {
        allowedEmployeeIds.add(emp.id);
      }
    }
    return items.filter(
      (w) =>
        allowedEmployeeIds.has(w.owner_employee_id) ||
        (w.department_id !== undefined && allowedDepts.has(w.department_id))
    );
  }
  return [];
}
