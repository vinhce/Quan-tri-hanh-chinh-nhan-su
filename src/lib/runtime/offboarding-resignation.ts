import {
  syncIncompleteWorkItemsToHandovers,
} from '@/lib/hrm/work-handover-bridge';
import {
  getWorkItems,
} from '@/lib/hrm/work-items-store';
import type {
  ClearanceAssetItem,
  ClearanceChecklist,
  Employee,
  HandoverItem,
  HandoverItemCategory,
  ResignationReasonCategory,
  ResignationRequest,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getCompanyAssets,
  getContracts,
  getEmployeeAssets,
  inferDefaultAssetValueVnd,
} from './contracts-assets';
import {
  getAllRuntimeEmployees,
  saveRuntimeEmployee,
} from './core-entities';
import {
  pushNotification,
} from './notifications';
import {
  calculateResignationNotice,
  getClearanceChecklists,
  getHandoverItems,
  getResignations,
  saveResignationInternal,
} from './offboarding-store';
import {
  executeManagerSuccessorReassign,
} from './offboarding-succession';
import {
  STORAGE_CLEARANCE_CHECKLISTS_KEY,
  STORAGE_HANDOVER_ITEMS_KEY,
  writeStorageArray,
} from './storage';

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

  const syncedWork = syncIncompleteWorkItemsToHandovers({
    employee: emp,
    sourceType: 'RESIGNATION',
    sourceRefId: resignation.id,
    workItems: getWorkItems(emp.id),
    existingHandovers: getHandoverItems(),
    nowIso: resignation.created_at,
  });
  if (syncedWork.createdItems.length > 0) {
    writeStorageArray(STORAGE_HANDOVER_ITEMS_KEY, [
      ...syncedWork.createdItems,
      ...getHandoverItems(),
    ]);
  }

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

  const syncedWork = syncIncompleteWorkItemsToHandovers({
    employee: emp,
    sourceType: 'RESIGNATION',
    sourceRefId: updatedResignation.id,
    workItems: getWorkItems(emp.id),
    existingHandovers: getHandoverItems(),
    defaultReceiver: params.successorEmployeeId
      ? getAllRuntimeEmployees().find(
          (e) =>
            e.id === params.successorEmployeeId ||
            e.employee_code === params.successorEmployeeId
        ) ?? null
      : null,
    nowIso,
  });
  if (syncedWork.createdItems.length > 0) {
    writeStorageArray(STORAGE_HANDOVER_ITEMS_KEY, [
      ...syncedWork.createdItems,
      ...getHandoverItems(),
    ]);
    handoverItems = [...syncedWork.createdItems, ...handoverItems];
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
