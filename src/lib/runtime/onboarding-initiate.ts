import {
  MOCK_CANDIDATES,
} from '@/mock/ats';
import type {
  Candidate,
  Employee,
  OnboardingChecklistItem,
  OnboardingRecord,
  PreboardingInvite,
} from '@/mock/types';
import {
  assignCompanyAsset,
} from './contracts-assets';
import {
  getRuntimeDepartments,
  mergeWithRuntimeCandidates,
  saveRuntimeCandidate,
  saveRuntimeEmployee,
} from './core-entities';
import {
  pushNotification,
} from './notifications';
import {
  generateNextOnboardingId,
  generateSecurePreboardingToken,
  getOnboardingRecords,
  getPreboardingInvites,
  saveOnboardingRecord,
} from './onboarding-store';
import {
  STORAGE_PREBOARDING_KEY,
  addDaysIso,
  addTwoMonthsIso,
  buildInitials,
  writeStorageArray,
} from './storage';
import {
  setUserActiveByEmployee,
} from './users-auth';

export function updateCandidateOfferSalary(
  candidateId: string,
  offeredSalaryVnd: number
): Candidate | null {
  const cleanId = candidateId?.trim();
  if (!cleanId) return null;
  if (
    !Number.isFinite(offeredSalaryVnd) ||
    offeredSalaryVnd < 1_000_000 ||
    offeredSalaryVnd > 1_000_000_000
  ) {
    return null;
  }
  const roundedSalary = Math.round(offeredSalaryVnd);
  const merged = mergeWithRuntimeCandidates(MOCK_CANDIDATES);
  const found = merged.find(
    (c) => c.id === cleanId || c.candidate_code === cleanId
  );
  if (!found) return null;

  const updated: Candidate = {
    ...found,
    offered_salary_vnd: roundedSalary,
  };
  saveRuntimeCandidate(updated);
  return updated;
}

export function initiateCandidateOnboarding(params: {
  candidate: Candidate;
  employeeCode: string;
  email: string;
  departmentId: string;
  departmentName: string;
  positionName: string;
  managerName: string;
  startDate: string;
  baseSalaryVnd?: number;
  grossSalaryVnd?: number;
  assetIds: string[];
  actorName: string;
}): { employee: Employee; onboarding: OnboardingRecord; invite: PreboardingInvite } {
  const nowIso = new Date().toISOString();

  // Resolve salary figures & Pre-boarding token first
  const deptRef = getRuntimeDepartments().find((d) => d.id === params.departmentId);
  const shiftCode = params.departmentId.startsWith('dept-tech')
    ? 'HC-08:30'
    : params.departmentId === 'dept-sales'
      ? 'FLEX-09:00'
      : 'HC-08:00';
  const probationEndDate = addTwoMonthsIso(params.startDate);
  const rawBaseSalary =
    params.baseSalaryVnd ??
    (params.grossSalaryVnd !== undefined
      ? Math.round((params.grossSalaryVnd * 85) / 100)
      : Math.round(
          ((params.candidate.offered_salary_vnd ??
            params.candidate.expected_salary_vnd ??
            0) *
            85) /
            100
        ));
  const estimatedOfficialSalary =
    params.grossSalaryVnd ??
    params.candidate.offered_salary_vnd ??
    Math.round(rawBaseSalary / 0.85 / 100000) * 100000;

  const existingInvites = getPreboardingInvites();
  const candEmailLower = (params.candidate.email || '').trim().toLowerCase();
  const existingInviteIdx = existingInvites.findIndex(
    (inv) =>
      (params.candidate.id && inv.candidate_id === params.candidate.id) ||
      (params.candidate.candidate_code &&
        inv.candidate_code === params.candidate.candidate_code) ||
      (candEmailLower &&
        (inv.personal_email.trim().toLowerCase() === candEmailLower ||
          inv.email?.trim().toLowerCase() === candEmailLower))
  );
  const existingInvite =
    existingInviteIdx >= 0 ? existingInvites[existingInviteIdx] : null;
  const inviteToken =
    existingInvite?.token ||
    params.candidate.preboarding_token ||
    generateSecurePreboardingToken();

  // 1. Update candidate stage to ONBOARDED with offered_salary_vnd & preboarding_token
  const updatedCandidate: Candidate = {
    ...params.candidate,
    stage: 'ONBOARDED',
    offered_salary_vnd:
      params.grossSalaryVnd ??
      params.candidate.offered_salary_vnd ??
      estimatedOfficialSalary,
    preboarding_token: inviteToken,
  };
  saveRuntimeCandidate(updatedCandidate);

  // 2. Create PROBATION employee in runtime employees (legal & bank fields left blank for candidate self-fill)
  const personalEmail = (params.candidate.email || params.email).trim();
  const candidatePhone = (params.candidate.phone || '').trim();

  const newEmployee: Employee = {
    id: `emp-rt-${Date.now()}`,
    employee_code: params.employeeCode,
    full_name: params.candidate.full_name,
    email: params.email,
    personal_email: personalEmail,
    phone: candidatePhone || '0901234567',
    gender: 'Nam',
    date_of_birth: '1998-06-15',
    national_id: '',
    tax_code: '',
    social_insurance_no: '',
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: 'pos-04',
    position_name: params.positionName,
    manager_id: deptRef?.manager_id ?? 'emp-003',
    manager_name: params.managerName,
    role_code: 'EMPLOYEE',
    join_date: params.startDate,
    employment_status: 'PROBATION',
    contract_type: 'PROBATION_2M',
    contract_start_date: params.startDate,
    contract_end_date: probationEndDate,
    contract_status: 'ACTIVE',
    base_salary_vnd: rawBaseSalary,
    probation_salary_percent: 85,
    official_salary_vnd: estimatedOfficialSalary,
    probation_end_date: probationEndDate,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 600000,
    allowance_position_vnd: 0,
    dependents_count: 0,
    bank_account_no: '',
    bank_name: '',
    work_shift_code: shiftCode,
    kpi_completion_rate: 88,
    burnout_risk_score: 18,
    burnout_risk_level: 'LOW',
    turnover_risk_score: 14,
    turnover_risk_level: 'LOW',
    ai_retention_note: `Tiếp nhận từ quy trình ATS (${params.candidate.candidate_code}), đang trong lộ trình hội nhập thử việc.`,
    avatar_initials: buildInitials(params.candidate.full_name),
    preboarding_token: inviteToken,
    preboarding_status: 'PENDING',
  };
  saveRuntimeEmployee(newEmployee);

  // 2b. Create or update PreboardingInvite in STORAGE_PREBOARDING_KEY (unlocked PENDING, empty legal/bank fields)
  const invite: PreboardingInvite = {
    id: existingInvite?.id || `pb-${Date.now()}`,
    token: inviteToken,
    preboarding_url: `/preboarding?token=${inviteToken}`,
    candidate_id: params.candidate.id,
    candidate_code: params.candidate.candidate_code,
    employee_id: newEmployee.id,
    employee_code: params.employeeCode,
    full_name: params.candidate.full_name,
    personal_email: personalEmail,
    email: personalEmail,
    phone: candidatePhone,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: newEmployee.position_id,
    position_name: params.positionName,
    position_title: params.positionName,
    manager_id: newEmployee.manager_id,
    manager_name: params.managerName,
    expected_start_date: params.startDate,
    start_date: params.startDate,
    official_salary_vnd: estimatedOfficialSalary,
    probation_salary_percent: 85,
    probation_salary_vnd: rawBaseSalary,
    status: 'PENDING',
    submitted_data: undefined,
    submitted_at: undefined,
    verified_by: undefined,
    verified_at: undefined,
    expires_at: `${addDaysIso(params.startDate, 14)}T23:59:59+07:00`,
    created_at: existingInvite?.created_at || nowIso,
  };
  const nextInvites =
    existingInviteIdx >= 0
      ? existingInvites.map((item, i) => (i === existingInviteIdx ? invite : item))
      : [invite, ...existingInvites];
  writeStorageArray(STORAGE_PREBOARDING_KEY, nextInvites);

  // Create INACTIVE SystemUserAccount awaiting IT task activation
  setUserActiveByEmployee({
    employeeId: newEmployee.id,
    employeeCode: newEmployee.employee_code,
    email: newEmployee.email,
    fullName: newEmployee.full_name,
    departmentName: newEmployee.department_name,
    positionName: newEmployee.position_name,
    roleCode: 'EMPLOYEE',
    isActive: false,
    targetStatus: 'INACTIVE',
    reason: 'Chờ bộ phận IT kích hoạt SSO trong quy trình Onboarding',
    actorName: params.actorName,
  });

  // 3. Assign selected company assets
  const assignedIds: string[] = [];
  let hasAccessCardAssigned = false;
  for (const assetId of params.assetIds) {
    const assigned = assignCompanyAsset(
      assetId,
      {
        id: newEmployee.id,
        employee_code: params.employeeCode,
        full_name: params.candidate.full_name,
        department_id: params.departmentId,
      },
      params.startDate
    );
    if (assigned) {
      assignedIds.push(assigned.id);
      if (assigned.category === 'ACCESS_CARD') {
        hasAccessCardAssigned = true;
      }
    }
  }

  // 4. Create OnboardingRecord with 8 checklist items across 4 groups
  const existingOnboarding = getOnboardingRecords();
  const onboardingId = generateNextOnboardingId(existingOnboarding);
  const hasHardwareAssigned = assignedIds.length > 0;

  const checklist: OnboardingChecklistItem[] = [
    {
      id: `${onboardingId.toLowerCase()}-it-1`,
      group: 'IT',
      task_code: 'IT_EMAIL_SSO',
      title: 'Khởi tạo email doanh nghiệp, tài khoản SSO và quyền truy cập kho lưu trữ',
      assignee_role_label: 'Bộ phận CNTT (IT Helpdesk)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-it-2`,
      group: 'IT',
      task_code: 'IT_VPN_SECURITY',
      title: 'Cấu hình VPN bảo mật, chứng chỉ thiết bị đầu cuối và công cụ chuyên môn',
      assignee_role_label: 'Bộ phận CNTT (IT Security)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-1`,
      group: 'ADMIN',
      task_code: 'ADMIN_HARDWARE',
      title: 'Bàn giao máy tính làm việc và thiết bị công tác tiêu chuẩn',
      assignee_role_label: 'Hành chính & Quản trị thiết bị',
      completed: hasHardwareAssigned,
      completed_at: hasHardwareAssigned ? nowIso : undefined,
      completed_by: hasHardwareAssigned ? params.actorName : undefined,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-2`,
      group: 'ADMIN',
      task_code: 'ADMIN_ACCESS_CARD',
      title: 'Cấp thẻ từ ra vào tòa nhà và đăng ký sinh trắc học chấm công',
      assignee_role_label: 'Hành chính Văn phòng',
      completed: hasAccessCardAssigned,
      completed_at: hasAccessCardAssigned ? nowIso : undefined,
      completed_by: hasAccessCardAssigned ? params.actorName : undefined,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-1`,
      group: 'HR',
      task_code: 'HR_PROBATION_CONTRACT',
      title: 'Ký kết hợp đồng thử việc 02 tháng và thỏa thuận bảo mật thông tin (NDA)',
      assignee_role_label: 'Phòng Nhân sự (C&B)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-2`,
      group: 'HR',
      task_code: 'HR_POLICY_TRAINING',
      title: 'Phổ biến nội quy lao động, chính sách phúc lợi và quy trình đăng ký nghỉ phép',
      assignee_role_label: 'Phòng Nhân sự (L&D)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-1`,
      group: 'MANAGER',
      task_code: 'MGR_ASSIGN_MENTOR',
      title: 'Giới thiệu nhân sự mới với đội ngũ và phân công người đồng hành (Buddy)',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-2`,
      group: 'MANAGER',
      task_code: 'MGR_PROBATION_GOALS',
      title: 'Thống nhất mục tiêu công việc và tiêu chí đánh giá KPI 60 ngày thử việc',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
  ];

  const newOnboarding: OnboardingRecord = {
    id: onboardingId,
    candidate_id: params.candidate.id,
    candidate_code: params.candidate.candidate_code,
    employee_id: newEmployee.id,
    employee_code: params.employeeCode,
    full_name: params.candidate.full_name,
    email: params.email,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_name: params.positionName,
    manager_name: params.managerName,
    start_date: params.startDate,
    status: 'IN_PROGRESS',
    checklist,
    assigned_asset_ids: assignedIds,
    created_at: nowIso,
    probation_salary_percent: 85,
    official_salary_vnd: estimatedOfficialSalary,
    probation_end_date: probationEndDate,
    preboarding_token: inviteToken,
  };

  saveOnboardingRecord(newOnboarding);

  // 5. Notify DEPT_MANAGER (scoped to departmentId), HR_MANAGER, SUPER_ADMIN, CANDIDATE and employee/candidate codes
  const assetSummary =
    assignedIds.length > 0
      ? `, đã bàn giao ${assignedIds.length} thiết bị công tác`
      : '';
  const targetCodes = Array.from(
    new Set([params.employeeCode, params.candidate.candidate_code].filter(Boolean))
  );

  pushNotification({
    title: `Khởi tạo Onboarding nhân sự mới: ${params.candidate.full_name}`,
    message: `Hồ sơ ${onboardingId} (${params.employeeCode} - ${params.positionName}, ${params.departmentName}${assetSummary}) đã mở lộ trình 8 hạng mục hội nhập và cổng Pre-boarding.`,
    category: 'ONBOARDING',
    target_roles: ['DEPT_MANAGER', 'HR_MANAGER', 'SUPER_ADMIN', 'CANDIDATE'],
    target_department_id: params.departmentId,
    target_employee_codes: targetCodes,
    nav_id: 'onboarding',
    entity_id: onboardingId,
    sub_tab: 'progress',
  });

  return {
    employee: newEmployee,
    onboarding: newOnboarding,
    invite,
  };
}
