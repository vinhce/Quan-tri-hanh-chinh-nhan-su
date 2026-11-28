import {
  MOCK_LEAVE_OVERTIME_REQUESTS,
} from '@/mock/attendance';
import type {
  Employee,
  ManagerOffboardingDependency,
  RoleCode,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getAllRuntimeEmployees,
  getRuntimeDepartments,
  mergeWithRuntimeRequests,
  saveRuntimeDepartment,
  saveRuntimeEmployee,
  saveRuntimeRequest,
} from './core-entities';
import {
  pushNotification,
} from './notifications';
import {
  getResignations,
  saveResignationInternal,
} from './offboarding-store';
import {
  setUserActiveByEmployee,
} from './users-auth';

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
