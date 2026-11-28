import {
  MOCK_POSITIONS,
} from '@/mock/employees';
import {
  evaluateTransferHandoverPolicy,
  resolveTransferHandoverPolicyLevel,
  syncIncompleteWorkItemsToHandovers,
  type TransferHandoverPolicyLevel,
} from '@/lib/hrm/work-handover-bridge';
import {
  getWorkItems,
} from '@/lib/hrm/work-items-store';
import type {
  CareerChangeType,
  CareerHistoryEntry,
  Employee,
  EmploymentContract,
  RoleCode,
  SystemUserAccount,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getContracts,
  saveContract,
} from './contracts-assets';
import {
  getAllRuntimeEmployees,
  getRuntimeDepartments,
  saveRuntimeDepartment,
  saveRuntimeEmployee,
} from './core-entities';
import {
  getLeaveBalances,
  saveLeaveBalance,
} from './leave-requests';
import {
  pushNotification,
} from './notifications';
import {
  getHandoverItems,
} from './offboarding-store';
import {
  appendCareerHistoryEntryInternal,
  getCareerHistories,
} from './performance';
import {
  STORAGE_HANDOVER_ITEMS_KEY,
  addMonthsIso,
  diffDaysIso,
  writeStorageArray,
} from './storage';
import {
  setUserActiveByEmployee,
} from './users-auth';

export function promoteOrTransferEmployee(payload: {
  employeeId: string;
  changeType: CareerChangeType;
  newDepartmentId?: string;
  newPositionId?: string;
  newPositionName?: string;
  newSalaryVnd?: number;
  newRoleCode?: RoleCode;
  effectiveDate: string;
  decisionNo?: string;
  reason: string;
  signedByName: string;
}): {
  careerEntry: CareerHistoryEntry;
  employee: Employee;
  addendumContract: EmploymentContract;
  updatedUser: SystemUserAccount;
  handoverPolicyLevel: TransferHandoverPolicyLevel;
  transferWarnings: string[];
} {
  const allEmps = getAllRuntimeEmployees();
  const emp = allEmps.find(
    (e) => e.id === payload.employeeId || e.employee_code === payload.employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy nhân sự cần lập quyết định bổ nhiệm/điều chuyển.');
  }

  const depts = getRuntimeDepartments();
  const targetDept =
    depts.find((d) => d.id === (payload.newDepartmentId || emp.department_id)) ??
    depts[0];
  const matchedPos = payload.newPositionId
    ? MOCK_POSITIONS.find((p) => p.id === payload.newPositionId)
    : undefined;

  const newDeptId = targetDept?.id ?? emp.department_id;
  const newDeptName = targetDept?.department_name ?? emp.department_name;
  const newPosId = payload.newPositionId || matchedPos?.id || emp.position_id;
  const newPosName =
    payload.newPositionName?.trim() ||
    matchedPos?.position_name ||
    emp.position_name;
  const newSalaryVnd = payload.newSalaryVnd ?? emp.base_salary_vnd;
  const newRoleCode = payload.newRoleCode ?? emp.role_code;
  const decisionNo =
    payload.decisionNo?.trim() ||
    `QĐ-${payload.effectiveDate.slice(0, 4)}-${String(getCareerHistories().length + 120)}/LV-NS`;

  const policyInput = {
    changeType: payload.changeType,
    currentDepartmentId: emp.department_id,
    newDepartmentId: newDeptId,
    currentPositionId: emp.position_id,
    newPositionId: newPosId,
    currentPositionName: emp.position_name,
    newPositionName: newPosName,
    currentRoleCode: emp.role_code,
    newRoleCode,
  };
  const policyLevel = resolveTransferHandoverPolicyLevel(policyInput);
  let transferWarnings: string[] = [];

  if (policyLevel === 'HARD_BLOCK') {
    const syncRes = syncIncompleteWorkItemsToHandovers({
      employee: emp,
      sourceType: 'DEPARTMENT_TRANSFER',
      sourceRefId: decisionNo,
      workItems: getWorkItems(emp.id),
      existingHandovers: getHandoverItems(),
    });
    if (syncRes.createdItems.length > 0) {
      writeStorageArray(STORAGE_HANDOVER_ITEMS_KEY, [
        ...syncRes.createdItems,
        ...getHandoverItems(),
      ]);
    }
    const policyEval = evaluateTransferHandoverPolicy({
      ...policyInput,
      transferRefId: decisionNo,
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      workItems: getWorkItems(emp.id),
      handovers: getHandoverItems(),
    });
    if (policyEval.blocked) {
      throw new Error(
        `Chặn điều chuyển phòng ban (${decisionNo}): ${policyEval.blockingReasons[0]}`
      );
    }
  } else if (policyLevel === 'SOFT_WARNING') {
    const policyEval = evaluateTransferHandoverPolicy({
      ...policyInput,
      transferRefId: decisionNo,
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      workItems: getWorkItems(emp.id),
      handovers: [],
    });
    transferWarnings = policyEval.warnings;
  }

  // 0. Auto-convert active PROBATION_2M / PROBATION to OFFICIAL + FIXED_TERM_12M on promotion
  const allContracts = getContracts();
  const activeProbationContracts = allContracts.filter(
    (c) =>
      (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
      !c.is_addendum &&
      c.contract_type === 'PROBATION_2M' &&
      c.status !== 'EXPIRED'
  );
  const isPromotionAction =
    payload.changeType === 'PROMOTION' ||
    payload.changeType === 'PROBATION_TO_OFFICIAL' ||
    payload.changeType === 'ROLE_CHANGE' ||
    newRoleCode === 'DEPT_MANAGER';
  const shouldConvertProbation =
    isPromotionAction &&
    (activeProbationContracts.length > 0 ||
      emp.employment_status === 'PROBATION' ||
      emp.contract_type === 'PROBATION_2M');

  let resolvedOfficialContract: EmploymentContract | undefined;
  if (shouldConvertProbation) {
    for (const probContract of activeProbationContracts) {
      saveContract({
        ...probContract,
        status: 'EXPIRED',
        days_until_expiry: 0,
      });
    }

    const existingOfficialContract = allContracts.find(
      (c) =>
        (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
        !c.is_addendum &&
        c.contract_type !== 'PROBATION_2M' &&
        c.status !== 'EXPIRED'
    );

    if (existingOfficialContract) {
      resolvedOfficialContract = saveContract({
        ...existingOfficialContract,
        department_name: newDeptName,
        position_name: newPosName,
        status: 'ACTIVE',
        base_salary_vnd: newSalaryVnd,
        salary_percent: 100,
        official_salary_vnd: newSalaryVnd,
      });
    } else {
      const officialEndDate = addMonthsIso(payload.effectiveDate, 12);
      resolvedOfficialContract = saveContract({
        id: `hd-off-${Date.now()}`,
        contract_number: `HDLD-${payload.effectiveDate.slice(0, 4)}-${emp.employee_code.slice(-3)}`,
        employee_id: emp.id,
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        department_name: newDeptName,
        position_name: newPosName,
        contract_type: 'FIXED_TERM_12M',
        start_date: payload.effectiveDate,
        end_date: officialEndDate,
        days_until_expiry: diffDaysIso(payload.effectiveDate, officialEndDate),
        status: 'ACTIVE',
        base_salary_vnd: newSalaryVnd,
        salary_percent: 100,
        official_salary_vnd: newSalaryVnd,
        signed_date: payload.effectiveDate,
        decision_no: decisionNo,
        notes: `Chuyển chính thức và bổ nhiệm theo quyết định ${decisionNo}.`,
      });
    }

    const existingBalances = getLeaveBalances(2026);
    const hasLeaveBalance = existingBalances.some(
      (b) => b.employee_id === emp.id || b.employee_code === emp.employee_code
    );
    if (!hasLeaveBalance) {
      saveLeaveBalance({
        id: `alb-rt-${Date.now()}`,
        employee_id: emp.id,
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        department_name: newDeptName,
        year: 2026,
        total_entitled_days: 12,
        carried_over_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: 12,
      });
    }
  }

  // 1. Create Contract Addendum in STORAGE_CONTRACTS_KEY
  const parentContract =
    resolvedOfficialContract ??
    getContracts().find(
      (c) =>
        (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
        !c.is_addendum &&
        c.status !== 'EXPIRED'
    );
  const addendumNumber = `PLHD-${payload.effectiveDate.slice(0, 4)}-${emp.employee_code.slice(-3)}-${String(getCareerHistories(emp.id).length + 1).padStart(2, '0')}`;
  const addendumContract: EmploymentContract = {
    id: `hd-add-${Date.now()}`,
    contract_number: addendumNumber,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: newDeptName,
    position_name: newPosName,
    contract_type: 'ADDENDUM',
    start_date: payload.effectiveDate,
    end_date: parentContract?.end_date ?? emp.contract_end_date ?? null,
    days_until_expiry: parentContract?.days_until_expiry ?? null,
    status: 'ACTIVE',
    base_salary_vnd: newSalaryVnd,
    salary_percent: 100,
    official_salary_vnd: newSalaryVnd,
    is_addendum: true,
    parent_contract_id: parentContract?.id ?? null,
    decision_no: decisionNo,
    signed_date: payload.effectiveDate,
    notes: `${payload.reason} (Theo quyết định ${decisionNo}).`,
  };
  saveContract(addendumContract);

  // 2. Append immutable CareerHistoryEntry
  const careerEntry: CareerHistoryEntry = {
    id: `ch-rt-${Date.now()}`,
    decision_no: decisionNo,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    change_type: payload.changeType,
    old_department_id: emp.department_id,
    old_department_name: emp.department_name,
    new_department_id: newDeptId,
    new_department_name: newDeptName,
    old_position_id: emp.position_id,
    old_position_name: emp.position_name,
    new_position_id: newPosId,
    new_position_name: newPosName,
    old_salary_vnd: emp.base_salary_vnd,
    new_salary_vnd: newSalaryVnd,
    old_role_code: emp.role_code,
    new_role_code: newRoleCode,
    effective_date: payload.effectiveDate,
    reason: payload.reason.trim(),
    signed_by_name: payload.signedByName,
    addendum_contract_id: addendumContract.id,
    addendum_contract_number: addendumNumber,
    created_at: new Date().toISOString(),
  };
  appendCareerHistoryEntryInternal(careerEntry);

  // 3. Update Department Manager & active employees in newDepartmentId if promoted to DEPT_MANAGER
  if (newRoleCode === 'DEPT_MANAGER' && targetDept) {
    saveRuntimeDepartment({
      ...targetDept,
      manager_id: emp.id,
      manager_name: emp.full_name,
    });
  }
  if (payload.newRoleCode === 'DEPT_MANAGER') {
    for (const deptEmp of getAllRuntimeEmployees()) {
      if (
        deptEmp.id !== emp.id &&
        deptEmp.department_id === newDeptId &&
        deptEmp.employment_status !== 'RESIGNED' &&
        deptEmp.employment_status !== 'NOTICE_PERIOD'
      ) {
        saveRuntimeEmployee({
          ...deptEmp,
          manager_id: emp.id,
          manager_name: emp.full_name,
        });
      }
    }
  }

  // 4. Auto-sync Employee record
  const nextManagerId =
    newRoleCode === 'DEPT_MANAGER'
      ? 'emp-001'
      : newDeptId !== emp.department_id && targetDept
        ? targetDept.manager_id
        : emp.manager_id;
  const nextManagerName =
    newRoleCode === 'DEPT_MANAGER'
      ? 'Nguyễn Văn An'
      : newDeptId !== emp.department_id && targetDept
        ? targetDept.manager_name
        : emp.manager_name;

  const updatedEmp: Employee = {
    ...emp,
    department_id: newDeptId,
    department_name: newDeptName,
    position_id: newPosId,
    position_name: newPosName,
    base_salary_vnd: newSalaryVnd,
    official_salary_vnd: newSalaryVnd,
    role_code: newRoleCode,
    manager_id: nextManagerId,
    manager_name: nextManagerName,
    employment_status:
      shouldConvertProbation ||
      (payload.changeType === 'PROBATION_TO_OFFICIAL' &&
        emp.employment_status === 'PROBATION')
        ? 'OFFICIAL'
        : emp.employment_status,
    official_date:
      emp.official_date ??
      (shouldConvertProbation ? payload.effectiveDate : emp.official_date),
    probation_salary_percent: shouldConvertProbation
      ? 100
      : emp.probation_salary_percent,
    contract_type: shouldConvertProbation
      ? (resolvedOfficialContract?.contract_type ?? 'FIXED_TERM_12M')
      : emp.contract_type,
    contract_start_date: shouldConvertProbation
      ? (resolvedOfficialContract?.start_date ?? payload.effectiveDate)
      : emp.contract_start_date,
    contract_end_date: shouldConvertProbation
      ? (resolvedOfficialContract?.end_date ??
          addMonthsIso(payload.effectiveDate, 12))
      : emp.contract_end_date,
    contract_status: shouldConvertProbation ? 'ACTIVE' : emp.contract_status,
  };
  saveRuntimeEmployee(updatedEmp);

  // 5. Auto-sync SystemUserAccount role_code & profile
  const updatedUser = setUserActiveByEmployee({
    employeeId: updatedEmp.id,
    employeeCode: updatedEmp.employee_code,
    email: updatedEmp.email,
    fullName: updatedEmp.full_name,
    departmentName: updatedEmp.department_name,
    positionName: updatedEmp.position_name,
    roleCode: newRoleCode,
    isActive: updatedEmp.employment_status !== 'RESIGNED',
    targetStatus: 'ACTIVE',
  });

  pushNotification({
    title: `Ban hành Quyết định nhân sự ${decisionNo}: ${updatedEmp.full_name}`,
    message: `${updatedEmp.full_name} (${updatedEmp.employee_code}): ${newPosName} tại ${newDeptName}, mức lương ${newSalaryVnd.toLocaleString('vi-VN')} đ từ ${payload.effectiveDate}.`,
    category: 'PERFORMANCE',
    target_roles: ['HR_MANAGER', 'DIRECTOR', 'DEPT_MANAGER'],
    target_employee_codes: [updatedEmp.employee_code],
    target_department_id: newDeptId,
    nav_id: 'performance',
  });

  recordAuditLog({
    actor_name: payload.signedByName,
    actor_code: 'HR-DECISION',
    actor_role: 'HR_MANAGER',
    action: 'CAREER_PROGRESSION',
    target: `${decisionNo} · ${updatedEmp.employee_code}`,
    detail: `${payload.changeType}: ${emp.position_name} (${emp.base_salary_vnd.toLocaleString('vi-VN')} đ) -> ${newPosName} (${newSalaryVnd.toLocaleString('vi-VN')} đ), hiệu lực ${payload.effectiveDate}, sinh phụ lục ${addendumNumber}.`,
  });

  return {
    careerEntry,
    employee: updatedEmp,
    addendumContract,
    updatedUser,
    handoverPolicyLevel: policyLevel,
    transferWarnings,
  };
}
