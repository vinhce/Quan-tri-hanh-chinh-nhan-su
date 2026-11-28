import {
  MOCK_ANNUAL_LEAVE_BALANCES,
} from '@/mock/attendance';
import {
  MOCK_POSITIONS,
} from '@/mock/employees';
import {
  computeNextReviewDate,
  resolveGradeStepForSalary,
} from '@/lib/hrm/salary-band';
import type {
  AnnualLeaveBalance,
  CareerHistoryEntry,
  Employee,
  EmploymentContract,
  PerformanceReview,
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
  saveRuntimeEmployee,
} from './core-entities';
import {
  saveLeaveBalance,
} from './leave-requests';
import {
  pushNotification,
} from './notifications';
import {
  getOnboardingRecords,
  saveOnboardingRecord,
} from './onboarding-store';
import {
  appendCareerHistoryEntryInternal,
  getCareerHistories,
  getPerformanceReviews,
  savePerformanceReview,
} from './performance';
import {
  STORAGE_LEAVE_BALANCES_KEY,
  addDaysIso,
  addMonthsIso,
  diffDaysIso,
  readStorageArray,
} from './storage';
import {
  setUserActiveByEmployee,
} from './users-auth';

export function getExpiringProbationContracts(
  withinDays = 30
): Array<{
  contract: EmploymentContract;
  employee: Employee | null;
  daysRemaining: number;
  hasPassReview: boolean;
}> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const contracts = getContracts();
  const employees = getAllRuntimeEmployees();
  const reviews = getPerformanceReviews();

  return contracts
    .filter(
      (c) =>
        c.contract_type === 'PROBATION_2M' &&
        c.status !== 'EXPIRED' &&
        c.end_date !== null
    )
    .map((contract) => {
      const emp =
        employees.find(
          (e) =>
            e.id === contract.employee_id ||
            e.employee_code === contract.employee_code
        ) ?? null;
      const computedDiff = contract.end_date
        ? diffDaysIso(todayIso, contract.end_date)
        : contract.days_until_expiry ?? 999;
      const daysRemaining =
        contract.days_until_expiry !== null && contract.days_until_expiry !== undefined
          ? Math.min(contract.days_until_expiry, Math.max(0, computedDiff))
          : computedDiff;
      const hasPassReview = reviews.some(
        (r) =>
          (r.employee_id === contract.employee_id ||
            r.employee_code === contract.employee_code) &&
          r.cycle === 'PROBATION' &&
          r.result === 'PASS'
      );
      return { contract, employee: emp, daysRemaining, hasPassReview };
    })
    .filter(
      (item) =>
        item.daysRemaining <= withinDays &&
        (!item.employee || item.employee.employment_status === 'PROBATION')
    )
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function convertProbationToOfficial(params: {
  employeeId: string;
  officialDate?: string;
  officialSalaryVnd?: number;
  contractType?: 'FIXED_TERM_12M' | 'FIXED_TERM_24M' | 'INDEFINITE_TERM';
  reviewerId?: string;
  reviewerName: string;
  kpiScore?: number;
  reviewNote?: string;
  requireManagerPass?: boolean;
}): {
  employee: Employee;
  officialContract: EmploymentContract;
  leaveBalance: AnnualLeaveBalance;
  careerEntry: CareerHistoryEntry;
  review: PerformanceReview;
} {
  const allEmps = getAllRuntimeEmployees();
  const emp = allEmps.find(
    (e) => e.id === params.employeeId || e.employee_code === params.employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy hồ sơ nhân sự thử việc cần chuyển chính thức.');
  }
  if (emp.employment_status !== 'PROBATION') {
    throw new Error(
      'Chỉ nhân sự đang thử việc (PROBATION) mới có thể chuyển chính thức.'
    );
  }

  const existingPassReview = getPerformanceReviews(emp.id).find(
    (r) => r.cycle === 'PROBATION' && r.result === 'PASS'
  );
  if (params.requireManagerPass && !existingPassReview && params.kpiScore === undefined) {
    throw new Error(
      `Nhân sự ${emp.full_name} (${emp.employee_code}) chưa có kết quả đánh giá thử việc ĐẠT (PASS) từ Trưởng bộ phận.`
    );
  }

  const officialDate =
    params.officialDate ||
    (emp.contract_end_date ? addDaysIso(emp.contract_end_date, 1) : new Date().toISOString().slice(0, 10));
  const salaryPercent = emp.probation_salary_percent || 85;
  const computed100Salary =
    params.officialSalaryVnd ??
    emp.official_salary_vnd ??
    Math.round(emp.base_salary_vnd / (salaryPercent / 100) / 100000) * 100000;

  const reviewRecord =
    existingPassReview ??
    savePerformanceReview({
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_id: emp.department_id,
      department_name: emp.department_name,
      position_name: emp.position_name,
      cycle: 'PROBATION',
      period_label: `Thử việc 60 ngày (${emp.join_date.slice(0, 7)})`,
      kpi_score: params.kpiScore ?? Math.max(85, emp.kpi_completion_rate || 88),
      okr_completion_percent: params.kpiScore ?? 90,
      grade: (params.kpiScore ?? 88) >= 90 ? 'A' : 'B+',
      result: 'PASS',
      reviewer_id: params.reviewerId ?? emp.manager_id ?? 'emp-003',
      reviewer_name: params.reviewerName,
      review_note:
        params.reviewNote ||
        'Hoàn thành tốt các mục tiêu thử việc 60 ngày, đủ năng lực chuyển ký HĐLĐ chính thức hưởng 100% lương.',
      suggested_salary_vnd: computed100Salary,
      status: 'APPROVED',
    });

  // Expire probation contract(s)
  const allContracts = getContracts();
  for (const c of allContracts) {
    if (
      (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
      c.contract_type === 'PROBATION_2M' &&
      c.status !== 'EXPIRED'
    ) {
      saveContract({
        ...c,
        status: 'EXPIRED',
        days_until_expiry: 0,
      });
    }
  }

  const nextContractType = params.contractType ?? 'FIXED_TERM_12M';
  const nextEndDate =
    nextContractType === 'INDEFINITE_TERM'
      ? null
      : nextContractType === 'FIXED_TERM_24M'
        ? addMonthsIso(officialDate, 24)
        : addMonthsIso(officialDate, 12);

  const officialContract: EmploymentContract = {
    id: `hd-off-${Date.now()}`,
    contract_number: `HDLD-${officialDate.slice(0, 4)}-${emp.employee_code.slice(-3)}`,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    position_name: emp.position_name,
    contract_type: nextContractType,
    start_date: officialDate,
    end_date: nextEndDate,
    days_until_expiry: nextEndDate ? diffDaysIso(officialDate, nextEndDate) : null,
    status: 'ACTIVE',
    base_salary_vnd: computed100Salary,
    salary_percent: 100,
    official_salary_vnd: computed100Salary,
    signed_date: officialDate,
    notes: 'Chuyển chính thức 100% lương sau đánh giá thử việc ĐẠT (PASS).',
  };
  saveContract(officialContract);

  const matchedOfficialPos = MOCK_POSITIONS.find(
    (p) => p.id === emp.position_id || p.position_name === emp.position_name
  );
  const assignedGradeStep = matchedOfficialPos
    ? resolveGradeStepForSalary(computed100Salary, matchedOfficialPos)
    : emp.grade_step ?? 'S1';
  const nextReviewDate = computeNextReviewDate(officialDate);

  const updatedEmp: Employee = {
    ...emp,
    employment_status: 'OFFICIAL',
    official_date: officialDate,
    grade_step: assignedGradeStep,
    next_review_date: nextReviewDate,
    probation_salary_percent: 100,
    official_salary_vnd: computed100Salary,
    base_salary_vnd: computed100Salary,
    contract_type: nextContractType,
    contract_start_date: officialDate,
    contract_end_date: nextEndDate,
    contract_status: 'ACTIVE',
  };
  saveRuntimeEmployee(updatedEmp);

  // Complete matching onboarding record if still in progress
  const onbList = getOnboardingRecords();
  const onbMatch = onbList.find(
    (o) => o.employee_id === emp.id || o.employee_code === emp.employee_code
  );
  if (onbMatch && onbMatch.status !== 'COMPLETED') {
    const nowIso = new Date().toISOString();
    saveOnboardingRecord({
      ...onbMatch,
      status: 'COMPLETED',
      checklist: onbMatch.checklist.map((c) =>
        c.completed
          ? c
          : { ...c, completed: true, completed_at: nowIso, completed_by: params.reviewerName }
      ),
    });
  }

  // Initialize AnnualLeaveBalance (12 days)
  const yearNum = Number.parseInt(officialDate.slice(0, 4), 10) || 2026;
  const storedBalances =
    readStorageArray<AnnualLeaveBalance>(STORAGE_LEAVE_BALANCES_KEY) ?? [];
  const foundBalance =
    storedBalances.find(
      (b) =>
        b.year === yearNum &&
        (b.employee_id === emp.id || b.employee_code === emp.employee_code)
    ) ??
    MOCK_ANNUAL_LEAVE_BALANCES.find(
      (b) =>
        b.year === yearNum &&
        (b.employee_id === emp.id || b.employee_code === emp.employee_code)
    );
  const leaveBalance: AnnualLeaveBalance = foundBalance ?? {
    id: `alb-rt-${Date.now()}-${yearNum}`,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    year: yearNum,
    total_entitled_days: 12,
    carried_over_days: 0,
    used_days: 0,
    pending_days: 0,
    remaining_days: 12,
  };
  saveLeaveBalance(leaveBalance);

  // Append immutable CareerHistoryEntry
  const decisionNo = `QĐ-${officialDate.slice(0, 4)}-${String(getCareerHistories().length + 101)}/LV-NS`;
  const careerEntry: CareerHistoryEntry = {
    id: `ch-rt-${Date.now()}`,
    decision_no: decisionNo,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    change_type: 'PROBATION_TO_OFFICIAL',
    old_department_id: emp.department_id,
    old_department_name: emp.department_name,
    new_department_id: emp.department_id,
    new_department_name: emp.department_name,
    old_position_id: emp.position_id,
    old_position_name: emp.position_name,
    new_position_id: emp.position_id,
    new_position_name: emp.position_name,
    old_salary_vnd: emp.base_salary_vnd,
    new_salary_vnd: computed100Salary,
    old_role_code: emp.role_code,
    new_role_code: emp.role_code,
    effective_date: officialDate,
    reason: `Hoàn thành thử việc ĐẠT (${reviewRecord.kpi_score} điểm), ký HĐLĐ chính thức ${officialContract.contract_number} hưởng 100% lương.`,
    signed_by_name: params.reviewerName,
    addendum_contract_id: officialContract.id,
    addendum_contract_number: officialContract.contract_number,
    created_at: new Date().toISOString(),
  };
  appendCareerHistoryEntryInternal(careerEntry);

  setUserActiveByEmployee({
    employeeId: emp.id,
    employeeCode: emp.employee_code,
    email: emp.email,
    fullName: emp.full_name,
    departmentName: emp.department_name,
    positionName: emp.position_name,
    roleCode: emp.role_code,
    isActive: true,
    targetStatus: 'ACTIVE',
  });

  pushNotification({
    title: `Chúc mừng chuyển chính thức: ${emp.full_name}`,
    message: `Nhân sự ${emp.employee_code} đã ký HĐLĐ chính thức ${officialContract.contract_number} (100% lương: ${computed100Salary.toLocaleString('vi-VN')} đ) và được cấp 12 ngày phép năm.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'DEPT_MANAGER', 'DIRECTOR'],
    target_employee_codes: [emp.employee_code],
    target_department_id: emp.department_id,
    nav_id: 'employees',
  });

  recordAuditLog({
    actor_name: params.reviewerName,
    actor_code: 'HR-CB',
    actor_role: 'HR_MANAGER',
    action: 'PROBATION_TO_OFFICIAL',
    target: `${emp.employee_code} (${emp.full_name})`,
    detail: `Chuyển từ PROBATION sang OFFICIAL từ ${officialDate}, HĐ ${officialContract.contract_number}, lương chính thức ${computed100Salary.toLocaleString('vi-VN')} đ.`,
  });

  return {
    employee: updatedEmp,
    officialContract,
    leaveBalance,
    careerEntry,
    review: reviewRecord,
  };
}
