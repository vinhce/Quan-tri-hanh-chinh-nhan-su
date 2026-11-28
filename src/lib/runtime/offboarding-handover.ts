import {
  syncIncompleteWorkItemsToHandovers,
} from '@/lib/hrm/work-handover-bridge';
import {
  getWorkItems,
} from '@/lib/hrm/work-items-store';
import type {
  HandoverItem,
  HandoverItemCategory,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getAllRuntimeEmployees,
} from './core-entities';
import {
  pushNotification,
} from './notifications';
import {
  getHandoverItems,
  saveHandoverItemInternal,
} from './offboarding-store';
import {
  STORAGE_HANDOVER_ITEMS_KEY,
  writeStorageArray,
} from './storage';

export function prepareDepartmentTransferHandovers(
  employeeId: string,
  transferRefId: string,
  defaultReceiverId?: string
): HandoverItem[] {
  const allEmps = getAllRuntimeEmployees();
  const emp = allEmps.find(
    (e) => e.id === employeeId || e.employee_code === employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy nhân sự cần chuẩn bị bàn giao điều chuyển.');
  }
  const defaultReceiver = defaultReceiverId
    ? allEmps.find(
        (e) => e.id === defaultReceiverId || e.employee_code === defaultReceiverId
      ) ?? null
    : null;
  const syncRes = syncIncompleteWorkItemsToHandovers({
    employee: emp,
    sourceType: 'DEPARTMENT_TRANSFER',
    sourceRefId: transferRefId,
    workItems: getWorkItems(emp.id),
    existingHandovers: getHandoverItems(),
    defaultReceiver,
  });
  if (syncRes.createdItems.length > 0) {
    writeStorageArray(STORAGE_HANDOVER_ITEMS_KEY, [
      ...syncRes.createdItems,
      ...getHandoverItems(),
    ]);
  }
  return syncRes.allForSource;
}

export function addHandoverItem(params: {
  resignationId: string;
  employeeId: string;
  sourceType?: 'RESIGNATION' | 'DEPARTMENT_TRANSFER';
  workItemId?: string | null;
  category?: HandoverItemCategory;
  title: string;
  description?: string;
  progressPercent?: number;
  handoffCheckpoint?: string;
  deliverableUrl?: string;
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
    ...(params.sourceType ? { source_type: params.sourceType } : {}),
    ...(params.workItemId !== undefined ? { work_item_id: params.workItemId } : {}),
    employee_id: sender?.id ?? params.employeeId,
    employee_code: sender?.employee_code ?? params.employeeId,
    employee_name: sender?.full_name ?? 'Nhân sự bàn giao',
    category: params.category ?? 'PROJECT',
    title: params.title.trim(),
    description: params.description?.trim() || '',
    ...(typeof params.progressPercent === 'number'
      ? { progress_percent: params.progressPercent }
      : {}),
    ...(params.handoffCheckpoint !== undefined
      ? { handoff_checkpoint: params.handoffCheckpoint.trim() }
      : {}),
    ...(params.deliverableUrl !== undefined
      ? { deliverable_url: params.deliverableUrl.trim() }
      : {}),
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
