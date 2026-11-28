import type {
  Candidate,
  Employee,
  OnboardingChecklistItem,
  OnboardingRecord,
  PreboardingInvite,
  SystemUserAccount,
} from '@/mock/types';
import {
  generateNextEmployeeCode,
  getAllRuntimeEmployees,
  getRuntimeDepartments,
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
  normalizeEmailSlug,
  writeStorageArray,
} from './storage';
import {
  emailsMatchInternalAlias,
  getSystemUsers,
  setUserActiveByEmployee,
} from './users-auth';

export function createPreboardingInvite(params: {
  candidate?: Candidate;
  fullName?: string;
  personalEmail?: string;
  phone?: string;
  departmentId: string;
  departmentName: string;
  positionId?: string;
  positionName: string;
  managerId?: string | null;
  managerName: string;
  expectedStartDate: string;
  officialSalaryVnd: number;
  probationSalaryPercent?: number;
  actorName: string;
}): {
  invite: PreboardingInvite;
  employee: Employee;
  user: SystemUserAccount;
  onboarding: OnboardingRecord;
} {
  const nowIso = new Date().toISOString();
  const fullName = (
    params.fullName ||
    params.candidate?.full_name ||
    'Nhân sự mới'
  ).trim();
  const personalEmail = (
    params.personalEmail ||
    params.candidate?.email ||
    ''
  ).trim();
  const phone = (params.phone || params.candidate?.phone || '0901234567').trim();

  const personalEmailLower = personalEmail.toLowerCase();
  const hasCandidateId = Boolean(params.candidate?.id);
  const hasCandidateCode = Boolean(params.candidate?.candidate_code);
  const hasCandidateIdentity = hasCandidateId || hasCandidateCode;
  const matchingInvites = getPreboardingInvites().filter((inv) => {
    if (inv.status === 'EXPIRED') {
      return false;
    }
    if (hasCandidateIdentity) {
      if (hasCandidateId && inv.candidate_id === params.candidate!.id) {
        return true;
      }
      if (
        hasCandidateCode &&
        inv.candidate_code === params.candidate!.candidate_code
      ) {
        return true;
      }
      return false;
    }
    const invPersonalLower = (inv.personal_email || '').trim().toLowerCase();
    const invEmailLower = (inv.email || '').trim().toLowerCase();
    return Boolean(
      personalEmailLower &&
        (invPersonalLower === personalEmailLower ||
          invEmailLower === personalEmailLower)
    );
  });

  if (matchingInvites.length > 0) {
    const allEmployees = getAllRuntimeEmployees();
    const allOnboarding = getOnboardingRecords();
    const allUsers = getSystemUsers();

    for (const existingInvite of matchingInvites) {
      const matchedEmployee = allEmployees.find(
        (e) =>
          (existingInvite.employee_id && e.id === existingInvite.employee_id) ||
          (existingInvite.employee_code &&
            e.employee_code === existingInvite.employee_code) ||
          (existingInvite.token && e.preboarding_token === existingInvite.token)
      );
      if (
        !matchedEmployee ||
        matchedEmployee.employment_status === 'RESIGNED' ||
        String(matchedEmployee.employment_status) === 'TERMINATED'
      ) {
        continue;
      }
      const matchedOnboarding = allOnboarding.find(
        (o) =>
          (existingInvite.token && o.preboarding_token === existingInvite.token) ||
          (existingInvite.employee_id &&
            o.employee_id === existingInvite.employee_id) ||
          (existingInvite.employee_code &&
            o.employee_code === existingInvite.employee_code)
      );

      if (matchedOnboarding) {
        const matchedUser =
          allUsers.find(
            (u) =>
              (matchedEmployee.id && u.employee_id === matchedEmployee.id) ||
              u.employee_code === matchedEmployee.employee_code ||
              emailsMatchInternalAlias(u.email, matchedEmployee.email)
          ) ??
          setUserActiveByEmployee({
            employeeId: matchedEmployee.id,
            employeeCode: matchedEmployee.employee_code,
            email: matchedEmployee.email,
            fullName: matchedEmployee.full_name,
            departmentName: matchedEmployee.department_name,
            positionName: matchedEmployee.position_name,
            roleCode: matchedEmployee.role_code,
            isActive: false,
            targetStatus: 'INACTIVE',
            reason: 'Chờ hoàn tất Pre-boarding và IT cấp quyền SSO',
          });

        if (
          params.candidate &&
          (params.candidate.preboarding_token !== existingInvite.token ||
            params.candidate.stage !== 'ONBOARDED')
        ) {
          saveRuntimeCandidate({
            ...params.candidate,
            stage: 'ONBOARDED',
            preboarding_token: existingInvite.token,
          });
        }

        return {
          invite: existingInvite,
          employee: matchedEmployee,
          user: matchedUser,
          onboarding: matchedOnboarding,
        };
      }
    }
  }

  const token = generateSecurePreboardingToken();

  if (params.candidate) {
    saveRuntimeCandidate({
      ...params.candidate,
      stage: 'ONBOARDED',
      preboarding_token: token,
    });
  }

  const employeeCode = generateNextEmployeeCode();
  const salaryPercent = params.probationSalaryPercent ?? 85;
  const probationSalaryVnd = Math.round(
    (params.officialSalaryVnd * salaryPercent) / 100
  );
  const probationEndDate = addTwoMonthsIso(params.expectedStartDate);
  const deptRef = getRuntimeDepartments().find((d) => d.id === params.departmentId);
  const shiftCode = params.departmentId.startsWith('dept-tech')
    ? 'HC-08:30'
    : params.departmentId === 'dept-sales'
      ? 'FLEX-09:00'
      : 'HC-08:00';
  const corporateEmail = `${normalizeEmailSlug(fullName)}.${employeeCode.slice(-3)}@hrm-enterprise.vn`;

  const pendingEmployee: Employee = {
    id: `emp-pb-${Date.now()}`,
    employee_code: employeeCode,
    full_name: fullName,
    email: corporateEmail,
    personal_email: personalEmail,
    phone,
    gender: 'Nam',
    date_of_birth: '1998-01-01',
    national_id: '',
    tax_code: '',
    social_insurance_no: '',
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: params.positionId || 'pos-04',
    position_name: params.positionName,
    manager_id: params.managerId ?? deptRef?.manager_id ?? 'emp-003',
    manager_name: params.managerName,
    role_code: 'EMPLOYEE',
    join_date: params.expectedStartDate,
    employment_status: 'PENDING_ONBOARD',
    contract_type: 'PROBATION_2M',
    contract_start_date: params.expectedStartDate,
    contract_end_date: probationEndDate,
    contract_status: 'PENDING_SIGN',
    base_salary_vnd: probationSalaryVnd,
    probation_salary_percent: salaryPercent,
    official_salary_vnd: params.officialSalaryVnd,
    probation_end_date: probationEndDate,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 600000,
    allowance_position_vnd: 0,
    dependents_count: 0,
    bank_account_no: '',
    bank_name: '',
    work_shift_code: shiftCode,
    kpi_completion_rate: 0,
    burnout_risk_score: 10,
    burnout_risk_level: 'LOW',
    turnover_risk_score: 10,
    turnover_risk_level: 'LOW',
    ai_retention_note: `Hồ sơ Pre-boarding (${employeeCode}), đang chờ ứng viên tự khai báo thông tin pháp lý & nhận việc.`,
    avatar_initials: buildInitials(fullName),
    preboarding_token: token,
    preboarding_status: 'PENDING',
  };
  saveRuntimeEmployee(pendingEmployee);

  const inactiveUser = setUserActiveByEmployee({
    employeeId: pendingEmployee.id,
    employeeCode,
    email: corporateEmail,
    fullName,
    departmentName: params.departmentName,
    positionName: params.positionName,
    roleCode: 'EMPLOYEE',
    isActive: false,
    targetStatus: 'INACTIVE',
    reason: 'Chờ hoàn tất Pre-boarding và IT cấp quyền SSO',
    actorName: params.actorName,
  });

  const existingOnboarding = getOnboardingRecords();
  const onboardingId = generateNextOnboardingId(existingOnboarding);
  const checklist: OnboardingChecklistItem[] = [
    {
      id: `${onboardingId.toLowerCase()}-it-1`,
      group: 'IT',
      task_code: 'IT_EMAIL_SSO',
      title: 'Khởi tạo email doanh nghiệp, tài khoản SSO và kích hoạt đăng nhập',
      assignee_role_label: 'Bộ phận CNTT (IT Helpdesk)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-it-2`,
      group: 'IT',
      task_code: 'IT_VPN_SECURITY',
      title: 'Cấu hình VPN bảo mật và quyền truy cập kho tài nguyên phòng ban',
      assignee_role_label: 'Bộ phận CNTT (IT Security)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-1`,
      group: 'ADMIN',
      task_code: 'ADMIN_HARDWARE',
      title: 'Cấp phát máy tính làm việc và lập biên bản bàn giao thiết bị',
      assignee_role_label: 'Hành chính & Quản trị thiết bị',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-adm-2`,
      group: 'ADMIN',
      task_code: 'ADMIN_ACCESS_CARD',
      title: 'Cấp thẻ từ ra vào tòa nhà và đăng ký sinh trắc học chấm công',
      assignee_role_label: 'Hành chính Văn phòng',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-1`,
      group: 'HR',
      task_code: 'HR_PROBATION_CONTRACT',
      title: `Ký hợp đồng thử việc 02 tháng (${salaryPercent}% lương) và kích hoạt trạng thái PROBATION`,
      assignee_role_label: 'Phòng Nhân sự (C&B)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-hr-2`,
      group: 'HR',
      task_code: 'HR_POLICY_TRAINING',
      title: 'Xác minh hồ sơ Pre-boarding (CCCD/MST/BHXH) và phổ biến nội quy lao động',
      assignee_role_label: 'Phòng Nhân sự (L&D)',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-1`,
      group: 'MANAGER',
      task_code: 'MGR_ASSIGN_MENTOR',
      title: 'Phân công người hướng dẫn (Mentor/Buddy) đồng hành 60 ngày đầu',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
    {
      id: `${onboardingId.toLowerCase()}-mgr-2`,
      group: 'MANAGER',
      task_code: 'MGR_PROBATION_GOALS',
      title: 'Giao mục tiêu KPI thử việc 60 ngày và lịch đánh giá định kỳ',
      assignee_role_label: 'Trưởng bộ phận trực tiếp',
      completed: false,
    },
  ];

  const onboarding: OnboardingRecord = {
    id: onboardingId,
    candidate_id: params.candidate?.id,
    candidate_code: params.candidate?.candidate_code,
    employee_id: pendingEmployee.id,
    employee_code: employeeCode,
    full_name: fullName,
    email: corporateEmail,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_name: params.positionName,
    manager_name: params.managerName,
    start_date: params.expectedStartDate,
    status: 'IN_PROGRESS',
    checklist,
    assigned_asset_ids: [],
    created_at: nowIso,
    probation_salary_percent: salaryPercent,
    official_salary_vnd: params.officialSalaryVnd,
    probation_end_date: probationEndDate,
    preboarding_token: token,
  };
  saveOnboardingRecord(onboarding);

  const invite: PreboardingInvite = {
    id: `pb-${Date.now()}`,
    token,
    preboarding_url: `/preboarding?token=${token}`,
    candidate_id: params.candidate?.id,
    candidate_code: params.candidate?.candidate_code,
    employee_id: pendingEmployee.id,
    employee_code: employeeCode,
    full_name: fullName,
    personal_email: personalEmail,
    phone,
    department_id: params.departmentId,
    department_name: params.departmentName,
    position_id: params.positionId || 'pos-04',
    position_name: params.positionName,
    manager_id: pendingEmployee.manager_id,
    manager_name: params.managerName,
    expected_start_date: params.expectedStartDate,
    official_salary_vnd: params.officialSalaryVnd,
    probation_salary_percent: salaryPercent,
    probation_salary_vnd: probationSalaryVnd,
    status: 'PENDING',
    expires_at: `${addDaysIso(params.expectedStartDate, 14)}T23:59:59+07:00`,
    created_at: nowIso,
  };

  const existingInvites = getPreboardingInvites();
  writeStorageArray(STORAGE_PREBOARDING_KEY, [invite, ...existingInvites]);

  pushNotification({
    title: `Đã mở cổng Pre-boarding cho ${fullName}`,
    message: `Mã nhân sự dự kiến ${employeeCode} (${params.positionName}). Link tự khai báo hồ sơ nhận việc đã sẵn sàng gửi tới ứng viên.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'DEPT_MANAGER', 'SUPER_ADMIN'],
    target_department_id: params.departmentId,
    nav_id: 'onboarding',
    entity_id: onboardingId,
  });

  return {
    invite,
    employee: pendingEmployee,
    user: inactiveUser,
    onboarding,
  };
}
