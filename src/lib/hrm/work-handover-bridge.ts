import type {
  CareerChangeType,
  Employee,
  HandoverItem,
  RoleCode,
  WorkItem,
} from '../../mock/types';

export interface WorkHandoverValidationResult {
  valid: boolean;
  missingFields: string[];
  missingConfirmations: string[];
}

export interface WorkHandoverGateEvaluation {
  passed: boolean;
  incompleteWorkCount: number;
  completedHandoverCount: number;
  blockingReasons: string[];
}

export function isWorkItemIncomplete(item: WorkItem): boolean {
  return item.status !== 'DONE';
}

export function validateWorkHandoverItem(
  item: HandoverItem
): WorkHandoverValidationResult {
  const missingFields: string[] = [];
  const missingConfirmations: string[] = [];

  if (
    typeof item.progress_percent !== 'number' ||
    !Number.isFinite(item.progress_percent) ||
    item.progress_percent < 0 ||
    item.progress_percent > 100
  ) {
    missingFields.push('% đã làm (progress_percent)');
  }
  if (!item.handoff_checkpoint || !item.handoff_checkpoint.trim()) {
    missingFields.push('điểm dừng (handoff_checkpoint)');
  }
  if (!item.deliverable_url || !item.deliverable_url.trim()) {
    missingFields.push('tài liệu/source đang làm dở (deliverable_url)');
  }
  if (!item.receiver_employee_id || !item.receiver_employee_id.trim()) {
    missingFields.push('người nhận kế nhiệm (receiver_employee_id)');
  }

  if (!item.sender_confirmed) {
    missingConfirmations.push('người giao xác nhận');
  }
  if (!item.receiver_confirmed) {
    missingConfirmations.push('người nhận xác nhận');
  }
  if (!item.manager_approved || item.status !== 'COMPLETED') {
    missingConfirmations.push('quản lý nghiệm thu');
  }

  return {
    valid: missingFields.length === 0 && missingConfirmations.length === 0,
    missingFields,
    missingConfirmations,
  };
}

export function syncIncompleteWorkItemsToHandovers(params: {
  employee: Employee;
  sourceType: 'RESIGNATION' | 'DEPARTMENT_TRANSFER';
  sourceRefId: string;
  workItems: WorkItem[];
  existingHandovers: HandoverItem[];
  defaultReceiver?: Employee | null;
  nowIso?: string;
}): {
  createdItems: HandoverItem[];
  allForSource: HandoverItem[];
} {
  const {
    employee,
    sourceType,
    sourceRefId,
    workItems,
    existingHandovers,
    defaultReceiver,
    nowIso = new Date().toISOString(),
  } = params;

  const incomplete = workItems.filter(
    (w) =>
      (w.owner_employee_id === employee.id ||
        w.owner_employee_code === employee.employee_code) &&
      isWorkItemIncomplete(w)
  );

  const existingForSource = existingHandovers.filter(
    (h) => h.resignation_id === sourceRefId
  );
  const existingWorkIds = new Set(
    existingForSource
      .map((h) => h.work_item_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  const createdItems: HandoverItem[] = [];
  for (let i = 0; i < incomplete.length; i += 1) {
    const work = incomplete[i];
    if (existingWorkIds.has(work.id)) {
      continue;
    }
    const checkpointText =
      work.handoff_checkpoint?.trim() ||
      `Điểm dừng tại ${work.progress_percent}% (${work.status}) — hạn ${work.due_date}`;
    const hasReceiver = Boolean(defaultReceiver);
    const created: HandoverItem = {
      id: `ho-wi-${sourceType === 'DEPARTMENT_TRANSFER' ? 'tr' : 'rs'}-${work.id}-${sourceRefId}`,
      resignation_id: sourceRefId,
      source_type: sourceType,
      work_item_id: work.id,
      employee_id: employee.id,
      employee_code: employee.employee_code,
      employee_name: employee.full_name,
      category: 'PROJECT',
      title: `[Việc dở dang ${work.progress_percent}%] ${work.title}`,
      description: `Hạn: ${work.due_date} · Trọng số: ${work.weight}% · Điểm dừng: ${checkpointText}`,
      progress_percent: work.progress_percent,
      handoff_checkpoint: checkpointText,
      deliverable_url: work.deliverable_url,
      receiver_employee_id: defaultReceiver?.id ?? null,
      receiver_employee_code: defaultReceiver?.employee_code ?? null,
      receiver_name: defaultReceiver?.full_name ?? null,
      sender_confirmed: hasReceiver,
      sender_confirmed_at: hasReceiver ? nowIso : null,
      receiver_confirmed: false,
      manager_approved: false,
      status: 'PENDING_RECEIVER',
      created_at: nowIso,
    };
    existingWorkIds.add(work.id);
    createdItems.push(created);
  }

  return {
    createdItems,
    allForSource: [...createdItems, ...existingForSource],
  };
}

function evaluateWorkItemsAgainstHandovers(params: {
  sourceRefId: string;
  sourceType: 'RESIGNATION' | 'DEPARTMENT_TRANSFER';
  employeeId: string;
  employeeCode?: string;
  workItems: WorkItem[];
  handovers: HandoverItem[];
  actionLabel: string;
}): WorkHandoverGateEvaluation {
  const {
    sourceRefId,
    sourceType,
    employeeId,
    employeeCode,
    workItems,
    handovers,
    actionLabel,
  } = params;

  const incomplete = workItems.filter(
    (w) =>
      (w.owner_employee_id === employeeId ||
        (employeeCode && w.owner_employee_code === employeeCode)) &&
      isWorkItemIncomplete(w)
  );

  if (incomplete.length === 0) {
    return {
      passed: true,
      incompleteWorkCount: 0,
      completedHandoverCount: 0,
      blockingReasons: [],
    };
  }

  const scopedHandovers = handovers.filter(
    (h) =>
      h.resignation_id === sourceRefId &&
      (h.source_type ?? 'RESIGNATION') === sourceType
  );

  const blockingReasons: string[] = [];
  let completedCount = 0;

  for (const work of incomplete) {
    const matched = scopedHandovers.find((h) => h.work_item_id === work.id);
    if (!matched) {
      blockingReasons.push(
        `Việc dở dang "${work.title}" chưa được tạo phiếu bàn giao cho ${actionLabel}.`
      );
      continue;
    }
    const check = validateWorkHandoverItem(matched);
    if (!check.valid) {
      const details = [...check.missingFields, ...check.missingConfirmations].join(', ');
      blockingReasons.push(
        `Việc dở dang "${work.title}" chưa đủ điều kiện ${actionLabel} (thiếu: ${details}).`
      );
      continue;
    }
    completedCount += 1;
  }

  return {
    passed: blockingReasons.length === 0,
    incompleteWorkCount: incomplete.length,
    completedHandoverCount: completedCount,
    blockingReasons,
  };
}

export function evaluateResignationWorkHandoverGate(params: {
  resignationId: string;
  employeeId: string;
  employeeCode?: string;
  workItems: WorkItem[];
  handovers: HandoverItem[];
}): WorkHandoverGateEvaluation {
  return evaluateWorkItemsAgainstHandovers({
    sourceRefId: params.resignationId,
    sourceType: 'RESIGNATION',
    employeeId: params.employeeId,
    employeeCode: params.employeeCode,
    workItems: params.workItems,
    handovers: params.handovers,
    actionLabel: 'Clearance nghỉ việc',
  });
}

export function evaluateTransferWorkHandoverGate(params: {
  transferRefId: string;
  employeeId: string;
  employeeCode?: string;
  workItems: WorkItem[];
  handovers: HandoverItem[];
}): WorkHandoverGateEvaluation {
  return evaluateWorkItemsAgainstHandovers({
    sourceRefId: params.transferRefId,
    sourceType: 'DEPARTMENT_TRANSFER',
    employeeId: params.employeeId,
    employeeCode: params.employeeCode,
    workItems: params.workItems,
    handovers: params.handovers,
    actionLabel: 'Điều chuyển phòng ban',
  });
}

export type TransferHandoverPolicyLevel = 'NONE' | 'SOFT_WARNING' | 'HARD_BLOCK';

export interface TransferHandoverPolicyInput {
  changeType: CareerChangeType;
  currentDepartmentId: string;
  newDepartmentId?: string;
  currentPositionId?: string;
  newPositionId?: string;
  currentPositionName?: string;
  newPositionName?: string;
  currentRoleCode?: RoleCode;
  newRoleCode?: RoleCode;
}

export interface TransferHandoverPolicyEvaluation {
  level: TransferHandoverPolicyLevel;
  blocked: boolean;
  incompleteWorkCount: number;
  blockingReasons: string[];
  warnings: string[];
  gateEvaluation: WorkHandoverGateEvaluation | null;
}

/** Determine 3-tier handover enforcement level for career changes. */
export function resolveTransferHandoverPolicyLevel(
  input: TransferHandoverPolicyInput
): TransferHandoverPolicyLevel {
  if (input.changeType === 'PROMOTION' || input.changeType === 'PROBATION_TO_OFFICIAL') {
    return 'NONE';
  }
  if (input.newDepartmentId && input.newDepartmentId !== input.currentDepartmentId) {
    return 'HARD_BLOCK';
  }
  const posIdChanged = Boolean(
    input.newPositionId && input.currentPositionId && input.newPositionId !== input.currentPositionId
  );
  const posNameChanged = Boolean(
    input.newPositionName &&
      input.currentPositionName &&
      input.newPositionName.trim().toLowerCase() !== input.currentPositionName.trim().toLowerCase()
  );
  const roleChanged = Boolean(
    input.newRoleCode && input.currentRoleCode && input.newRoleCode !== input.currentRoleCode
  );
  const isTransferOrRoleChange =
    input.changeType === 'DEPARTMENT_TRANSFER' ||
    input.changeType === 'TRANSFER' ||
    input.changeType === 'ROLE_CHANGE';
  return posIdChanged || posNameChanged || roleChanged || isTransferOrRoleChange
    ? 'SOFT_WARNING'
    : 'NONE';
}

/** Evaluate incomplete work handover requirements under the 3-tier transfer policy. */
export function evaluateTransferHandoverPolicy(
  params: TransferHandoverPolicyInput & {
    transferRefId: string;
    employeeId: string;
    employeeCode?: string;
    workItems: WorkItem[];
    handovers: HandoverItem[];
  }
): TransferHandoverPolicyEvaluation {
  const level = resolveTransferHandoverPolicyLevel(params);
  if (level === 'NONE') {
    return { level, blocked: false, incompleteWorkCount: 0, blockingReasons: [], warnings: [], gateEvaluation: null };
  }
  if (level === 'SOFT_WARNING') {
    const incomplete = params.workItems.filter(
      (w) =>
        (w.owner_employee_id === params.employeeId ||
          (Boolean(params.employeeCode) && w.owner_employee_code === params.employeeCode)) &&
        isWorkItemIncomplete(w)
    );
    if (incomplete.length === 0) {
      return { level, blocked: false, incompleteWorkCount: 0, blockingReasons: [], warnings: [], gateEvaluation: null };
    }
    const previewTitles = incomplete.slice(0, 3).map((w) => `"${w.title}"`).join(', ');
    const suffix = incomplete.length > 3 ? ` và ${incomplete.length - 3} việc khác` : '';
    return {
      level,
      blocked: false,
      incompleteWorkCount: incomplete.length,
      blockingReasons: [],
      warnings: [
        `Nhân sự còn ${incomplete.length} đầu việc dở dang khi đổi vị trí/nhóm cùng phòng (${previewTitles}${suffix}). Khuyến nghị bàn giao nội bộ trong phòng; quyết định vẫn được thực thi.`,
      ],
      gateEvaluation: null,
    };
  }
  const gate = evaluateTransferWorkHandoverGate({
    transferRefId: params.transferRefId,
    employeeId: params.employeeId,
    employeeCode: params.employeeCode,
    workItems: params.workItems,
    handovers: params.handovers,
  });
  return {
    level,
    blocked: !gate.passed,
    incompleteWorkCount: gate.incompleteWorkCount,
    blockingReasons: gate.blockingReasons,
    warnings: [],
    gateEvaluation: gate,
  };
}
