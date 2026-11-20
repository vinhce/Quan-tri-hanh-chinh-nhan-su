export type RoleCode =
  | 'SUPER_ADMIN'
  | 'DIRECTOR'
  | 'HR_MANAGER'
  | 'DEPT_MANAGER'
  | 'EMPLOYEE'
  | 'CANDIDATE';

export type EmploymentStatus = 'ACTIVE' | 'PROBATION' | 'ON_LEAVE' | 'RESIGNED';

export type ContractType = 'INDEFINITE_TERM' | 'FIXED_TERM_12M' | 'FIXED_TERM_24M' | 'PROBATION_2M';

export type ContractStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'PENDING_SIGN';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Department {
  id: string;
  department_code: string;
  department_name: string;
  parent_id: string | null;
  manager_id: string;
  manager_name: string;
  headcount: number;
  budget_allocated_vnd: number;
  location: string;
  children?: Department[];
}

export interface Position {
  id: string;
  position_code: string;
  position_name: string;
  department_id: string;
  level: 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' | 'MANAGER' | 'DIRECTOR';
  salary_band_min_vnd: number;
  salary_band_max_vnd: number;
}

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string;
  gender: 'Nam' | 'Nữ';
  date_of_birth: string;
  national_id: string;
  tax_code: string;
  social_insurance_no: string;
  department_id: string;
  department_name: string;
  position_id: string;
  position_name: string;
  manager_id: string | null;
  manager_name: string | null;
  role_code: RoleCode;
  join_date: string;
  employment_status: EmploymentStatus;
  contract_type: ContractType;
  contract_start_date: string;
  contract_end_date: string | null;
  contract_status: ContractStatus;
  base_salary_vnd: number;
  allowance_meal_vnd: number;
  allowance_transport_vnd: number;
  allowance_position_vnd: number;
  dependents_count: number;
  bank_account_no: string;
  bank_name: string;
  work_shift_code: string;
  kpi_completion_rate: number;
  burnout_risk_score: number;
  burnout_risk_level: RiskLevel;
  turnover_risk_score: number;
  turnover_risk_level: RiskLevel;
  ai_retention_note: string;
  avatar_initials: string;
}

export interface EmploymentContract {
  id: string;
  contract_number: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  position_name: string;
  contract_type: ContractType;
  start_date: string;
  end_date: string | null;
  days_until_expiry: number | null;
  status: ContractStatus;
  base_salary_vnd: number;
  signed_date: string;
}

export interface BurnoutTurnoverAlert {
  id: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  position_name: string;
  alert_type: 'BURNOUT' | 'TURNOVER' | 'BOTH';
  burnout_risk_score: number;
  turnover_risk_score: number;
  risk_level: RiskLevel;
  overtime_hours_last_30d: number;
  late_count_last_30d: number;
  months_since_last_promotion: number;
  kpi_trend: 'UP' | 'STABLE' | 'DOWN';
  key_factors: string[];
  recommended_action: string;
  detected_at: string;
}

export interface EmployeeKpiRecord {
  id: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  position_name: string;
  period: string;
  kpi_score: number;
  okr_completion_percent: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  reviewer_name: string;
  review_note: string;
}

export interface WorkShift {
  id: string;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  standard_hours: number;
  late_grace_minutes: number;
  department_scope: string;
}

export interface MonthlyAttendanceSummary {
  id: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  position_name: string;
  shift_code: string;
  month_period: string;
  standard_work_days: number;
  actual_work_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  late_occurrences: number;
  early_leave_occurrences: number;
  overtime_hours_weekday: number;
  overtime_hours_weekend: number;
  overtime_hours_holiday: number;
  total_overtime_hours: number;
  attendance_status: 'VERIFIED' | 'NEEDS_REVIEW' | 'LOCKED';
}

export type RequestCategory =
  | 'ANNUAL_LEAVE'
  | 'SICK_LEAVE'
  | 'UNPAID_LEAVE'
  | 'OVERTIME'
  | 'REMOTE_WORK'
  | 'LATE_EXPLANATION'
  | 'BUSINESS_TRIP'
  | 'OVERSEAS_BUSINESS_TRIP';

export type LeaveRequestType = RequestCategory;

export type RequestApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type MultiStepRequestStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ApprovalStep {
  step_order: number;
  role: 'DEPT_MANAGER' | 'HR_MANAGER' | 'DIRECTOR';
  label: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  actor_name?: string;
  acted_at?: string;
  note?: string;
}

export interface LeaveOvertimeRequest {
  id: string;
  request_code: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  position_name: string;
  requester_role?: RoleCode;
  request_category: RequestCategory;
  category_label: string;
  start_datetime: string;
  end_datetime: string;
  duration_days_or_hours: number;
  duration_unit: 'NGAY' | 'GIO';
  reason: string;
  handover_to_name: string | null;
  approver_id: string;
  approver_name: string;
  approval_status: RequestApprovalStatus;
  status?: MultiStepRequestStatus;
  current_step_role?: 'DEPT_MANAGER' | 'HR_MANAGER' | 'DIRECTOR' | null;
  approval_steps?: ApprovalStep[];
  leave_deducted?: boolean;
  rejection_reason?: string;
  created_at: string;
  responded_at: string | null;
  source: 'MANUAL_FORM' | 'AI_COPILOT';
}

export interface AnnualLeaveBalance {
  id: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  year: number;
  total_entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
}

export interface PayrollFormulaConfig {
  bhxh_employee_rate: number;
  bhyt_employee_rate: number;
  bhtn_employee_rate: number;
  total_insurance_employee_rate: number;
  bhxh_employer_rate: number;
  bhyt_employer_rate: number;
  bhtn_employer_rate: number;
  union_fee_employer_rate: number;
  insurance_salary_cap_vnd: number;
  personal_deduction_vnd: number;
  dependent_deduction_vnd: number;
  standard_work_days_per_month: number;
}

export interface PayrollRecord {
  id: string;
  payslip_code: string;
  period_month: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  position_name: string;
  bank_name: string;
  bank_account_no: string;
  standard_days: number;
  actual_paid_days: number;
  dependents_count: number;
  base_salary_vnd: number;
  prorated_base_salary_vnd: number;
  allowance_meal_vnd: number;
  allowance_transport_vnd: number;
  allowance_position_vnd: number;
  overtime_pay_vnd: number;
  kpi_bonus_vnd: number;
  gross_salary_vnd: number;
  insurance_base_vnd: number;
  bhxh_employee_vnd: number;
  bhyt_employee_vnd: number;
  bhtn_employee_vnd: number;
  total_insurance_employee_vnd: number;
  personal_deduction_vnd: number;
  dependent_deduction_vnd: number;
  taxable_income_vnd: number;
  pit_tax_vnd: number;
  net_salary_vnd: number;
  employer_total_cost_vnd: number;
  payment_status: 'PAID' | 'APPROVED' | 'DRAFT_CALCULATED';
  paid_at: string | null;
}

export type AtsStage = 'APPLIED' | 'AI_SCREENED' | 'INTERVIEW' | 'OFFER' | 'ONBOARDED' | 'REJECTED';

export interface JobPosting {
  id: string;
  job_code: string;
  title: string;
  department_id: string;
  department_name: string;
  level: string;
  headcount_target: number;
  hired_count: number;
  applicants_count: number;
  salary_range_min_vnd: number;
  salary_range_max_vnd: number;
  status: 'OPEN' | 'URGENT' | 'CLOSED';
  hiring_manager_name: string;
  published_date: string;
  closing_date: string;
  location?: string;
  work_mode?: 'Onsite' | 'Hybrid' | 'Remote';
  employment_type?: 'Toàn thời gian' | 'Bán thời gian' | 'Thực tập';
  overview?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
}

export interface DepartmentRecruitmentRequest {
  id: string;
  request_code: string;
  department_id: string;
  department_name: string;
  position_title: string;
  level: string;
  quantity: number;
  urgency: 'NORMAL' | 'URGENT';
  reason: string;
  expected_salary_range: string;
  deadline_date: string;
  requested_by_name: string;
  requested_date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by_name?: string;
  approved_date?: string;
  job_code_created?: string;
  rejection_reason?: string;
}

export interface CandidateAiEvaluation {
  match_score: number;
  education_fit: string;
  experience_years: number;
  key_skills_matched: string[];
  strengths: string[];
  gaps: string[];
  interview_questions: string[];
  ai_recommendation: 'STRONG_HIRE' | 'PROCEED_INTERVIEW' | 'HOLD' | 'REJECT';
  evaluated_by_model: string;
}

export interface CandidateInterviewNote {
  id: string;
  author: string;
  content: string;
  created_at: string;
  rating?: number;
}

export interface CandidateInterviewSchedule {
  date: string;
  time: string;
  format: 'Online' | 'Offline';
  interviewer: string;
  send_notification: boolean;
  location_or_link: string;
  scheduled_at?: string;
}

export interface CandidateRescheduleRequest {
  reason: string;
  proposed_time: string;
  requested_at: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

export interface Candidate {
  id: string;
  candidate_code: string;
  full_name: string;
  email: string;
  phone: string;
  job_id: string;
  job_code: string;
  job_title: string;
  department_name: string;
  stage: AtsStage;
  applied_date: string;
  source: 'LinkedIn' | 'TopCV' | 'ITviec' | 'Referral' | 'CareerSite';
  expected_salary_vnd: number;
  current_company: string;
  ai_evaluation: CandidateAiEvaluation;
  notes?: CandidateInterviewNote[];
  cv_url?: string;
  interview_schedule?: CandidateInterviewSchedule;
  reschedule_request?: CandidateRescheduleRequest;
}

export interface RoleDefinition {
  role_code: RoleCode;
  role_name: string;
  description: string;
  users_count: number;
  default_employee_code: string;
  default_user_name: string;
  default_user_title: string;
  default_department: string;
}

export interface PermissionMatrixRow {
  module_code: string;
  module_name: string;
  category: 'Quản trị cốt lõi' | 'Vận hành' | 'Hệ thống';
  permissions: Record<
    RoleCode,
    {
      view: boolean;
      create: boolean;
      edit: boolean;
      approve: boolean;
      delete: boolean;
      export: boolean;
    }
  >;
}

export interface SystemUserAccount {
  id: string;
  user_code: string;
  employee_code: string;
  full_name: string;
  email: string;
  department_name: string;
  position_name: string;
  role_code: RoleCode;
  mfa_enabled: boolean;
  account_status: 'ACTIVE' | 'LOCKED' | 'INACTIVE';
  last_login_at: string;
  last_login_ip: string;
}

export interface SystemConfiguration {
  company_legal_name: string;
  company_tax_code: string;
  headquarters_address: string;
  work_hours_start: string;
  work_hours_end: string;
  lunch_break_start: string;
  lunch_break_end: string;
  late_grace_threshold_minutes: number;
  annual_leave_base_days: number;
  seniority_extra_day_per_years: number;
  director_approval_min_days: number;
  payroll_cutoff_day: number;
  payroll_payout_day: number;
  bhxh_employee_percent: number;
  bhyt_employee_percent: number;
  bhtn_employee_percent: number;
  personal_deduction_vnd: number;
  dependent_deduction_vnd: number;
  public_holidays_2026: Array<{
    holiday_code: string;
    holiday_name: string;
    start_date: string;
    end_date: string;
    paid_days: number;
  }>;
  ai_engine_config: {
    provider: string;
    primary_model: string;
    temperature: number;
    max_tokens_per_request: number;
    monthly_token_budget: number;
    tokens_used_month: number;
    pii_masking_enabled: boolean;
    burnout_scan_schedule: string;
  };
}

export interface AuditLogEntry {
  id: string;
  log_code: string;
  timestamp: string;
  actor_employee_code: string;
  actor_name: string;
  actor_role: RoleCode;
  ip_address: string;
  action: 'LOGIN' | 'APPROVE_LEAVE' | 'LOCK_PAYROLL' | 'EXPORT_SALARY' | 'UPDATE_PERMISSION' | 'AI_CV_SCREEN' | 'UPDATE_CONTRACT' | 'CREATE_REQUEST';
  module: string;
  target_entity: string;
  status: 'SUCCESS' | 'BLOCKED' | 'WARNING';
  detail: string;
}

export interface CopilotSampleQA {
  id: string;
  role_scope: RoleCode | 'ALL';
  prompt_label: string;
  user_query: string;
  ai_response: string;
  referenced_policy: string;
  metrics_cited?: Array<{ label: string; value: string }>;
}

export interface NaturalLanguageLeaveDraft {
  id: string;
  sample_input: string;
  parsed_category: RequestCategory;
  parsed_category_label: string;
  parsed_start_date: string;
  parsed_end_date: string;
  parsed_duration_days: number;
  parsed_reason: string;
  parsed_handover_to: string;
  confidence_score: number;
}

export type NotificationCategory = 'LEAVE_REQUEST' | 'PAYROLL' | 'ONBOARDING' | 'ASSET' | 'SYSTEM';

export interface HrmNotification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  created_at: string;
  target_roles?: RoleCode[];
  target_employee_codes?: string[];
  target_department_id?: string;
  read_by: string[];
  nav_id: string;
  entity_id?: string;
  sub_tab?: string;
}

export type OnboardingTaskGroup = 'IT' | 'ADMIN' | 'HR' | 'MANAGER';

export interface OnboardingChecklistItem {
  id: string;
  group: OnboardingTaskGroup;
  title: string;
  assignee_role_label: string;
  completed: boolean;
  completed_at?: string;
  completed_by?: string;
}

export type OnboardingStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface OnboardingRecord {
  id: string;
  candidate_id?: string;
  candidate_code?: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  email: string;
  department_id: string;
  department_name: string;
  position_name: string;
  manager_name: string;
  start_date: string;
  status: OnboardingStatus;
  checklist: OnboardingChecklistItem[];
  assigned_asset_ids: string[];
  created_at: string;
}

export type AssetCategory = 'LAPTOP' | 'MONITOR' | 'ACCESS_CARD' | 'PERIPHERAL';
export type AssetStatus = 'ASSIGNED' | 'AVAILABLE' | 'MAINTENANCE';

export interface CompanyAsset {
  id: string;
  asset_code: string;
  name: string;
  category: AssetCategory;
  serial_number: string;
  status: AssetStatus;
  assigned_to_code?: string;
  assigned_to_name?: string;
  assigned_department_id?: string;
  assigned_at?: string;
  condition_note: string;
}
