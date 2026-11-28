import type {
  Employee,
  EmploymentContract,
  EmploymentStatus,
  OnboardingRecord,
  OnboardingTaskGroup,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  assignAssetToEmployee,
  getContracts,
  saveContract,
} from './contracts-assets';
import {
  getAllRuntimeEmployees,
  saveRuntimeEmployee,
} from './core-entities';
import {
  getOnboardingRecords,
} from './onboarding-store';
import {
  STORAGE_ONBOARDING_KEY,
  addTwoMonthsIso,
  diffDaysIso,
  normalizeEmailSlug,
  writeStorageArray,
} from './storage';
import {
  setUserActiveByEmployee,
} from './users-auth';

export function triggerOnboardingGroupSideEffectInternal(
  onboarding: OnboardingRecord,
  group: OnboardingTaskGroup,
  actorName: string,
  options?: {
    companyEmail?: string;
    assetId?: string;
    assignCondition?: string;
    mentorId?: string;
    mentorName?: string;
    probationGoals?: string;
    salaryPercent?: number;
    officialSalaryVnd?: number;
  }
): { employee: Employee | null; sideEffects: string[] } {
  const sideEffects: string[] = [];
  const allEmps = getAllRuntimeEmployees();
  let matchedEmp =
    allEmps.find(
      (e) =>
        e.id === onboarding.employee_id ||
        e.employee_code === onboarding.employee_code
    ) ?? null;

  if (group === 'IT') {
    const corpEmail =
      options?.companyEmail?.trim() ||
      (onboarding.email.endsWith('@hrm-enterprise.vn')
        ? onboarding.email
        : `${normalizeEmailSlug(onboarding.full_name)}@hrm-enterprise.vn`);

    if (matchedEmp) {
      matchedEmp = { ...matchedEmp, email: corpEmail };
      saveRuntimeEmployee(matchedEmp);
    }

    setUserActiveByEmployee({
      employeeId: matchedEmp?.id ?? onboarding.employee_id,
      employeeCode: onboarding.employee_code,
      email: corpEmail,
      fullName: onboarding.full_name,
      departmentName: onboarding.department_name,
      positionName: onboarding.position_name,
      roleCode: matchedEmp?.role_code ?? 'EMPLOYEE',
      isActive: true,
      targetStatus: 'ACTIVE',
      actorName,
    });
    sideEffects.push(
      `Đã cấp email ${corpEmail} và kích hoạt tài khoản đăng nhập SSO (is_active = true).`
    );
  } else if (group === 'ADMIN') {
    const assetIdToAssign = options?.assetId;
    if (assetIdToAssign) {
      const assigned = assignAssetToEmployee({
        assetId: assetIdToAssign,
        employeeId: matchedEmp?.id ?? onboarding.employee_id,
        employeeCode: onboarding.employee_code,
        employeeName: onboarding.full_name,
        departmentId: onboarding.department_id,
        assignedDate: onboarding.start_date,
        assignCondition: options?.assignCondition,
        actorName,
      });
      if (assigned) {
        sideEffects.push(
          `Đã gán thiết bị ${assigned.asset.asset_code} (${assigned.asset.name}) vào hồ sơ tài sản nhân viên.`
        );
      }
    }
  } else if (group === 'MANAGER') {
    if (options?.mentorId || options?.mentorName || options?.probationGoals) {
      if (matchedEmp) {
        matchedEmp = {
          ...matchedEmp,
          mentor_id: options.mentorId ?? matchedEmp.mentor_id ?? null,
          mentor_name: options.mentorName ?? matchedEmp.mentor_name ?? null,
        };
        saveRuntimeEmployee(matchedEmp);
      }
      sideEffects.push(
        `Đã phân công Mentor hướng dẫn (${options.mentorName || 'Buddy bộ phận'}) và chốt mục tiêu thử việc 60 ngày.`
      );
    }
  } else if (group === 'HR') {
    const salaryPercent =
      options?.salaryPercent ??
      matchedEmp?.probation_salary_percent ??
      onboarding.probation_salary_percent ??
      85;
    const officialSalary =
      options?.officialSalaryVnd ??
      matchedEmp?.official_salary_vnd ??
      onboarding.official_salary_vnd ??
      (matchedEmp
        ? Math.round(matchedEmp.base_salary_vnd / (salaryPercent / 100))
        : 20000000);
    const probationSalary = Math.round((officialSalary * salaryPercent) / 100);
    const startDate = onboarding.start_date || new Date().toISOString().slice(0, 10);
    const endDate =
      onboarding.probation_end_date || addTwoMonthsIso(startDate);

    if (matchedEmp) {
      const nextStatus: EmploymentStatus =
        matchedEmp.employment_status === 'PENDING_ONBOARD'
          ? 'PROBATION'
          : matchedEmp.employment_status;
      matchedEmp = {
        ...matchedEmp,
        employment_status: nextStatus,
        contract_type:
          nextStatus === 'PROBATION' ? 'PROBATION_2M' : matchedEmp.contract_type,
        contract_start_date: startDate,
        contract_end_date:
          nextStatus === 'PROBATION' ? endDate : matchedEmp.contract_end_date,
        contract_status: 'ACTIVE',
        probation_salary_percent: salaryPercent,
        official_salary_vnd: officialSalary,
        base_salary_vnd:
          nextStatus === 'PROBATION' ? probationSalary : matchedEmp.base_salary_vnd,
        probation_end_date: endDate,
      };
      saveRuntimeEmployee(matchedEmp);
    }

    const existingProbContract = getContracts().find(
      (c) =>
        (c.employee_code === onboarding.employee_code ||
          c.employee_id === onboarding.employee_id) &&
        c.contract_type === 'PROBATION_2M'
    );
    if (!existingProbContract) {
      const daysUntilExpiry = Math.max(
        1,
        diffDaysIso(new Date().toISOString().slice(0, 10), endDate)
      );
      const createdContract: EmploymentContract = {
        id: `hd-prob-${Date.now()}`,
        contract_number: `HDTV-2026-${onboarding.employee_code.slice(-3)}`,
        employee_id: matchedEmp?.id ?? onboarding.employee_id,
        employee_code: onboarding.employee_code,
        full_name: onboarding.full_name,
        department_name: onboarding.department_name,
        position_name: onboarding.position_name,
        contract_type: 'PROBATION_2M',
        start_date: startDate,
        end_date: endDate,
        days_until_expiry: daysUntilExpiry,
        status: daysUntilExpiry <= 30 ? 'EXPIRING_SOON' : 'ACTIVE',
        base_salary_vnd: probationSalary,
        salary_percent: salaryPercent,
        official_salary_vnd: officialSalary,
        signed_date: startDate,
        notes: `Hợp đồng thử việc 02 tháng hưởng ${salaryPercent}% mức lương chính thức.`,
      };
      saveContract(createdContract);
      sideEffects.push(
        `Đã khởi tạo Hợp đồng thử việc ${createdContract.contract_number} (${salaryPercent}% lương = ${probationSalary.toLocaleString('vi-VN')} đ) và chuyển trạng thái sang PROBATION.`
      );
    }
  }

  return { employee: matchedEmp, sideEffects };
}

export function assignOnboardingMentor(params: {
  onboardingId: string;
  mentorId: string;
  mentorName: string;
  probationGoals?: string;
  actorName: string;
}): OnboardingRecord | null {
  const records = getOnboardingRecords();
  const idx = records.findIndex((r) => r.id === params.onboardingId);
  if (idx < 0) return null;

  const target = records[idx];
  const updated: OnboardingRecord = {
    ...target,
    mentor_id: params.mentorId,
    mentor_name: params.mentorName,
    probation_goals: params.probationGoals ?? target.probation_goals,
  };
  const nextRecords = records.map((item, i) => (i === idx ? updated : item));
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  triggerOnboardingGroupSideEffectInternal(updated, 'MANAGER', params.actorName, {
    mentorId: params.mentorId,
    mentorName: params.mentorName,
    probationGoals: params.probationGoals,
  });

  return updated;
}

export function completeOnboardingDeptTask(params: {
  onboardingId: string;
  group: OnboardingTaskGroup;
  itemId?: string;
  companyEmail?: string;
  assetId?: string;
  assignCondition?: string;
  mentorId?: string;
  mentorName?: string;
  probationGoals?: string;
  salaryPercent?: number;
  officialSalaryVnd?: number;
  actorName: string;
}): {
  onboarding: OnboardingRecord;
  employee: Employee | null;
  sideEffects: string[];
} | null {
  const records = getOnboardingRecords();
  const idx = records.findIndex((r) => r.id === params.onboardingId);
  if (idx < 0) return null;

  const nowIso = new Date().toISOString();
  const target = records[idx];
  const updatedChecklist = target.checklist.map((chk) => {
    if (params.itemId) {
      if (chk.id !== params.itemId) return chk;
    } else if (chk.group !== params.group) {
      return chk;
    }
    return {
      ...chk,
      completed: true,
      completed_at: chk.completed_at ?? nowIso,
      completed_by: chk.completed_by ?? params.actorName,
    };
  });

  const allDone = updatedChecklist.every((c) => c.completed);
  const updatedRecord: OnboardingRecord = {
    ...target,
    email: params.companyEmail?.trim() || target.email,
    mentor_id: params.mentorId ?? target.mentor_id,
    mentor_name: params.mentorName ?? target.mentor_name,
    probation_goals: params.probationGoals ?? target.probation_goals,
    probation_salary_percent:
      params.salaryPercent ?? target.probation_salary_percent,
    official_salary_vnd:
      params.officialSalaryVnd ?? target.official_salary_vnd,
    status: allDone ? 'COMPLETED' : target.status,
    checklist: updatedChecklist,
  };

  const nextRecords = records.map((item, i) =>
    i === idx ? updatedRecord : item
  );
  writeStorageArray(STORAGE_ONBOARDING_KEY, nextRecords);

  const { employee, sideEffects } = triggerOnboardingGroupSideEffectInternal(
    updatedRecord,
    params.group,
    params.actorName,
    {
      companyEmail: params.companyEmail,
      assetId: params.assetId,
      assignCondition: params.assignCondition,
      mentorId: params.mentorId,
      mentorName: params.mentorName,
      probationGoals: params.probationGoals,
      salaryPercent: params.salaryPercent,
      officialSalaryVnd: params.officialSalaryVnd,
    }
  );

  recordAuditLog({
    actor_name: params.actorName,
    actor_code: 'ONB-FLOW',
    actor_role: 'HR_MANAGER',
    action: 'ONBOARDING_TASK',
    target: `${updatedRecord.id} (${updatedRecord.employee_code})`,
    detail: `Hoàn thành tác vụ hội nhập nhóm ${params.group}. ${sideEffects.join(' ')}`.trim(),
  });

  return { onboarding: getOnboardingRecords().find((r) => r.id === params.onboardingId) ?? updatedRecord, employee, sideEffects };
}
