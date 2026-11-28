export type RoleCode =
  | 'SUPER_ADMIN'
  | 'DIRECTOR'
  | 'HR_MANAGER'
  | 'DEPT_MANAGER'
  | 'EMPLOYEE'
  | 'CANDIDATE';

export type EmploymentStatus =
  | 'PENDING_ONBOARD'
  | 'PROBATION'
  | 'ACTIVE'
  | 'OFFICIAL'
  | 'ON_LEAVE'
  | 'NOTICE_PERIOD'
  | 'RESIGNED';

export function isOfficialEmployeeStatus(
  status?: EmploymentStatus | string | null
): boolean {
  return status === 'ACTIVE' || status === 'OFFICIAL';
}

export type ContractType =
  | 'INDEFINITE_TERM'
  | 'FIXED_TERM_12M'
  | 'FIXED_TERM_24M'
  | 'PROBATION_2M'
  | 'ADDENDUM';

export type ContractStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'PENDING_SIGN';

export type PreboardingStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'EXPIRED';

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

export type SalaryGradeStepCode = 'S1' | 'S2' | 'S3' | 'S4';

export type PositionQualificationLevel =
  | 'COLLEGE_OR_HIGHER'
  | 'INTERMEDIATE_VOCATIONAL'
  | 'OTHER';

export interface PositionSalaryGradeStep {
  step: SalaryGradeStepCode;
  label: string;
  salary_vnd: number;
}

export interface Position {
  id: string;
  position_code: string;
  position_name: string;
  department_id: string;
  level: 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' | 'MANAGER' | 'DIRECTOR';
  salary_band_min_vnd: number;
  salary_band_max_vnd: number;
  allowance_position_vnd?: number;
  grade_steps?: PositionSalaryGradeStep[];
  qualification_level?: PositionQualificationLevel;
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
  personal_email?: string;
  national_id_issue_date?: string;
  national_id_issue_place?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  mentor_id?: string | null;
  mentor_name?: string | null;
  probation_salary_percent?: number;
  official_salary_vnd?: number;
  probation_end_date?: string | null;
  official_date?: string | null;
  grade_step?: SalaryGradeStepCode;
  next_review_date?: string | null;
  approved_last_day?: string | null;
  resigned_date?: string | null;
  is_rehireable?: boolean;
  rehire_note?: string;
  preboarding_token?: string;
  preboarding_status?: PreboardingStatus;
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
  salary_percent?: number;
  official_salary_vnd?: number;
  is_addendum?: boolean;
  parent_contract_id?: string | null;
  decision_no?: string | null;
  notes?: string;
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
  target_date?: string;
  actual_check_in?: string;
  actual_check_out?: string;
  ot_hours?: number;
  ot_multiplier?: number;
  ot_day_type?: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';
  current_approver_id?: string | null;
  medical_doc_note?: string;
  side_effects_applied?: boolean;
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
  tax_year?: number;
  effective_from?: string;
  bracket_count?: number;
  legal_basis?: string;
}

export interface MidMonthSalarySplit {
  effective_date: string;
  decision_no?: string;
  old_salary_vnd: number;
  days_at_old_salary: number;
  old_prorated_vnd: number;
  new_salary_vnd: number;
  days_at_new_salary: number;
  new_prorated_vnd: number;
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
  contract_type?: ContractType;
  paid_leave_days?: number;
  unpaid_leave_days?: number;
  overtime_hours?: number;
  advance_deduction_vnd?: number;
  penalty_deduction_vnd?: number;
  unused_leave_days?: number;
  unused_leave_payout_vnd?: number;
  is_final_settlement?: boolean;
  mid_month_split?: MidMonthSalarySplit | null;
  calculation_note?: string;
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
  status?: 'not_scheduled' | 'invited' | 'confirmed' | 'reschedule_requested' | 'scheduled' | 'completed' | 'cancelled';
}

export interface CandidateActivityLog {
  id: string;
  event_id: string;
  type: string;
  title: string;
  description: string;
  actor_name: string;
  created_at: string;
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
  offered_salary_vnd?: number;
  preboarding_token?: string;
  current_company: string;
  ai_evaluation: CandidateAiEvaluation;
  notes?: CandidateInterviewNote[];
  activity_logs?: CandidateActivityLog[];
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
  is_active?: boolean;
  employee_id?: string;
  locked_reason?: string;
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

export type AuditActionType =
  | 'LOGIN'
  | 'APPROVE_LEAVE'
  | 'LOCK_PAYROLL'
  | 'EXPORT_SALARY'
  | 'UPDATE_PERMISSION'
  | 'AI_CV_SCREEN'
  | 'UPDATE_CONTRACT'
  | 'CREATE_REQUEST'
  | 'PREBOARDING_SUBMIT'
  | 'ONBOARDING_TASK'
  | 'PROBATION_TO_OFFICIAL'
  | 'CHECK_IN_OUT'
  | 'BIOMETRIC_REGISTER'
  | 'BIOMETRIC_CHECK_IN_OUT'
  | 'WIFI_CHECK_BLOCKED'
  | 'ATTENDANCE_IMPORT'
  | 'CALCULATE_PAYROLL'
  | 'PERFORMANCE_REVIEW'
  | 'CAREER_PROGRESSION'
  | 'SUBMIT_RESIGNATION'
  | 'APPROVE_RESIGNATION'
  | 'HANDOVER_CONFIRM'
  | 'MANAGER_REASSIGN'
  | 'CLEARANCE_SIGNOFF'
  | 'FINAL_SETTLEMENT'
  | 'ACTIVATE_USER'
  | 'LOCK_USER'
  | (string & {});

export interface AuditLogEntry {
  id: string;
  log_code: string;
  timestamp: string;
  actor_employee_code: string;
  actor_name: string;
  actor_role: RoleCode;
  ip_address: string;
  action: AuditActionType;
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

export type NotificationCategory =
  | 'LEAVE_REQUEST'
  | 'PAYROLL'
  | 'ONBOARDING'
  | 'ASSET'
  | 'SYSTEM'
  | 'PERFORMANCE'
  | 'OFFBOARDING';

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
  task_code?: string;
  side_effect_summary?: string;
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
  mentor_id?: string | null;
  mentor_name?: string | null;
  probation_goals?: string;
  probation_salary_percent?: number;
  official_salary_vnd?: number;
  probation_end_date?: string | null;
  preboarding_token?: string;
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
  asset_value_vnd?: number;
}

// ---------------------------------------------------------------------------
// Stage 1: Pre-boarding & Employee Asset Assignment History
// ---------------------------------------------------------------------------

export interface PreboardingSubmissionData {
  personal_email?: string;
  phone?: string;
  gender?: 'Nam' | 'Nữ';
  date_of_birth?: string;
  national_id: string;
  national_id_issue_date?: string;
  national_id_issue_place?: string;
  tax_code: string;
  social_insurance_no?: string;
  bank_name: string;
  bank_account_no: string;
  dependents_count?: number;
  address?: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation?: string;
  id_card_file_name?: string;
  degree_file_name?: string;
}

export interface PreboardingInvite {
  id: string;
  token: string;
  preboarding_url: string;
  candidate_id?: string;
  candidate_code?: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  personal_email: string;
  email?: string;
  phone: string;
  department_id: string;
  department_name: string;
  position_id?: string;
  position_name: string;
  position_title?: string;
  manager_id?: string | null;
  manager_name: string;
  expected_start_date: string;
  start_date?: string;
  official_salary_vnd: number;
  probation_salary_percent: number;
  probation_salary_vnd: number;
  status: PreboardingStatus;
  submitted_data?: PreboardingSubmissionData;
  submitted_at?: string;
  verified_by?: string;
  verified_at?: string;
  expires_at: string;
  created_at: string;
}

export type AssetConditionStatus = 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED' | 'LOST';

export interface EmployeeAssetAssignment {
  id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  category: AssetCategory;
  serial_number: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department_id: string;
  assigned_date: string;
  assign_condition: string;
  asset_value_vnd: number;
  returned_date?: string | null;
  return_condition?: AssetConditionStatus | string | null;
  return_note?: string;
  penalty_amount_vnd: number;
  status: 'ASSIGNED' | 'RETURNED' | 'LOST';
}

// ---------------------------------------------------------------------------
// Stage 2: Daily Attendance Records
// ---------------------------------------------------------------------------

export type DailyAttendanceStatus =
  | 'PRESENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'WORKING'
  | 'MISSING_PUNCH'
  | 'PAID_LEAVE'
  | 'UNPAID_LEAVE'
  | 'SICK_LEAVE'
  | 'REMOTE_WORK'
  | 'HOLIDAY'
  | 'WEEKEND'
  | 'ABSENT';

export type WifiMatchMode =
  | 'HOST_LOCAL'
  | 'SAME_LAN_SUBNET'
  | 'SAME_WIFI_NAT_IP'
  | 'ADMIN_WHITELIST'
  | 'POLICY_DISABLED';

export type BiometricDeviceKind = 'LAPTOP' | 'MOBILE' | 'OTHER';

export interface BiometricCredentialRecord {
  id: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  credential_id: string;
  public_key_spki: string;
  public_key_alg: number;
  rp_id: string;
  device_label: string;
  device_kind: BiometricDeviceKind;
  sign_count: number;
  registered_ip?: string | null;
  last_used_at?: string | null;
  created_at: string;
}

export interface FaceBiometricProfileDto {
  id: string;
  employee_id: string;
  employee_code: string;
  device_label: string;
  embedding_dim: number;
  registered_by_role: RoleCode;
  created_at: string;
  last_used_at: string | null;
  has_periocular_template?: boolean;
  supported_modalities?: Array<'FACE_FULL' | 'PERIOCULAR'>;
}

export interface WifiAttendancePolicy {
  id: string;
  wifi_ssid_label: string;
  enforce_same_wifi: boolean;
  require_biometric_for_punch: boolean;
  allowed_public_ips: string[];
  allowed_lan_cidrs: string[];
  updated_by: string;
  updated_at: string;
}

export interface HostWifiHardwareInfo {
  connected: boolean;
  interfaceName: string | null;
  adapterDescription: string | null;
  macAddress: string | null;
  ssid: string | null;
  bssid: string | null;
  networkType: string | null;
  radioType: string | null;
  band: string | null;
  channel: number | null;
  authentication: string | null;
  cipher: string | null;
  signalPercent: number | null;
  rxRateMbps: number | null;
  txRateMbps: number | null;
  ipv4Address: string | null;
  subnetMask: string | null;
  cidr: string | null;
  defaultGateway: string | null;
  dnsServers: string[];
  dhcpEnabled: boolean | null;
  publicIpv4: string | null;
  publicIpv6Prefix64: string | null;
  probedAt: string;
}

export interface WifiVerificationResult {
  allowed: boolean;
  mode: WifiMatchMode | 'CELLULAR_BLOCKED' | 'WIFI_MISMATCH';
  code?: 'CELLULAR_BLOCKED' | 'WIFI_MISMATCH';
  reason: string;
  verifiedIp: string;
  hostPublicIpv4: string | null;
  hostLanIps: string[];
  clientObservedIp: string | null;
  isRemoteTunnel: boolean;
  policy: WifiAttendancePolicy;
}

export interface DailyAttendanceRecord {
  id: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  date: string;
  shift_code: string;
  check_in: string | null;
  check_out: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  workday_value: 1 | 0.5 | 0;
  overtime_hours: number;
  ot_multiplier?: number;
  status: DailyAttendanceStatus;
  explanation_request_id?: string | null;
  note?: string;
  source:
    | 'WEB_CLOCK'
    | 'BIOMETRIC_FINGERPRINT'
    | 'BIOMETRIC_FACE_IRIS'
    | 'BIOMETRIC_IMPORT'
    | 'REQUEST_SYNC'
    | 'SEED';
  auth_method?: 'WEBAUTHN_FINGERPRINT' | 'CAMERA_FACE_IRIS' | 'MANUAL_WEB' | 'CSV_IMPORT';
  biometric_device_label?: string;
  biometric_modality?: 'FINGERPRINT' | 'FACE_IRIS';
  liveness_score?: number;
  face_match_score?: number;
  verified_network_ip?: string;
  wifi_match_mode?: WifiMatchMode;
}

// ---------------------------------------------------------------------------
// Stage 3: Multi-Cycle Performance Reviews & Immutable Career Histories
// ---------------------------------------------------------------------------

export type PerformanceReviewCycle = 'PROBATION' | 'QUARTERLY' | 'ANNUAL';

export type PerformanceReviewResult =
  | 'PASS'
  | 'EXTEND'
  | 'FAIL'
  | 'EXCELLENT'
  | 'GOOD'
  | 'AVERAGE'
  | 'POOR';

export interface PerformanceReview {
  id: string;
  review_code: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_id: string;
  department_name: string;
  position_name: string;
  cycle: PerformanceReviewCycle;
  period_label: string;
  kpi_score: number;
  okr_completion_percent: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  result: PerformanceReviewResult;
  reviewer_id: string;
  reviewer_name: string;
  goals_summary?: string;
  strengths?: string;
  improvements?: string;
  review_note: string;
  suggested_salary_vnd?: number;
  suggested_bonus_vnd?: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  reviewed_at: string;
}

export type CareerChangeType =
  | 'PROBATION_TO_OFFICIAL'
  | 'PROMOTION'
  | 'TRANSFER'
  | 'DEPARTMENT_TRANSFER'
  | 'SALARY_ADJUSTMENT'
  | 'ROLE_CHANGE';

export interface CareerHistoryEntry {
  id: string;
  decision_no: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  change_type: CareerChangeType;
  old_department_id: string;
  old_department_name: string;
  new_department_id: string;
  new_department_name: string;
  old_position_id: string;
  old_position_name: string;
  new_position_id: string;
  new_position_name: string;
  old_salary_vnd: number;
  new_salary_vnd: number;
  old_role_code: RoleCode;
  new_role_code: RoleCode;
  effective_date: string;
  reason: string;
  signed_by_name: string;
  addendum_contract_id?: string | null;
  addendum_contract_number?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Stage 4: Offboarding, 3-Way Handover, Clearance & Final Settlement
// ---------------------------------------------------------------------------

export type ResignationStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_HR'
  | 'APPROVED'
  | 'NOTICE_PERIOD'
  | 'CLEARANCE_IN_PROGRESS'
  | 'READY_FOR_SETTLEMENT'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type ResignationReasonCategory =
  | 'CAREER_GROWTH'
  | 'COMPENSATION'
  | 'RELOCATION'
  | 'HEALTH_FAMILY'
  | 'CONTRACT_END'
  | 'PROBATION_END'
  | 'OTHER';

export interface ResignationNoticeCalculation {
  contract_type: ContractType;
  submitted_date: string;
  desired_last_day: string;
  minimum_notice_days: number;
  earliest_legal_last_day: string;
  approved_last_day: string;
  notice_shortfall_days: number;
  meets_legal_notice: boolean;
}

export interface ResignationRequest {
  id: string;
  resignation_code: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_id: string;
  department_name: string;
  position_name: string;
  role_code: RoleCode;
  contract_type: ContractType;
  submitted_date: string;
  desired_last_day: string;
  minimum_notice_days: number;
  earliest_legal_last_day: string;
  approved_last_day: string | null;
  notice_shortfall_days: number;
  waive_notice_shortfall?: boolean;
  reason_category: ResignationReasonCategory;
  reason: string;
  exit_interview_note?: string;
  status: ResignationStatus;
  manager_approved_by?: string | null;
  manager_approved_at?: string | null;
  hr_approved_by?: string | null;
  hr_approved_at?: string | null;
  rejection_reason?: string;
  successor_employee_id?: string | null;
  successor_employee_name?: string | null;
  is_rehireable?: boolean;
  rehire_note?: string;
  final_payslip_id?: string | null;
  settled_at?: string | null;
  created_at: string;
}

export type WorkItemStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

export interface WorkItem {
  id: string;
  owner_employee_id: string;
  owner_employee_code?: string;
  department_id?: string;
  title: string;
  weight: number;
  due_date: string;
  status: WorkItemStatus;
  progress_percent: number;
  deliverable_url: string;
  handoff_checkpoint?: string;
  updated_at?: string;
}

export type HandoverItemCategory =
  | 'PROJECT'
  | 'DOCUMENT'
  | 'SYSTEM_ACCESS'
  | 'CLIENT_ACCOUNT'
  | 'MANAGEMENT_DUTY';

export interface HandoverItem {
  id: string;
  resignation_id: string;
  source_type?: 'RESIGNATION' | 'DEPARTMENT_TRANSFER';
  work_item_id?: string | null;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  category: HandoverItemCategory;
  title: string;
  description: string;
  progress_percent?: number;
  handoff_checkpoint?: string;
  deliverable_url?: string;
  receiver_employee_id: string | null;
  receiver_employee_code?: string | null;
  receiver_name: string | null;
  sender_confirmed: boolean;
  sender_confirmed_at?: string | null;
  receiver_confirmed: boolean;
  receiver_confirmed_at?: string | null;
  manager_approved: boolean;
  manager_approved_by?: string | null;
  manager_approved_at?: string | null;
  status: 'PENDING_RECEIVER' | 'PENDING_MANAGER' | 'COMPLETED';
  note?: string;
  created_at: string;
}

export interface ClearanceAssetItem {
  assignment_id?: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  category: AssetCategory;
  serial_number: string;
  asset_value_vnd: number;
  returned: boolean;
  returned_date?: string | null;
  return_condition?: AssetConditionStatus | null;
  penalty_amount_vnd: number;
  condition_note?: string;
  reconciled_by?: string | null;
}

export interface ClearanceChecklist {
  id: string;
  resignation_id: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  assets: ClearanceAssetItem[];
  admin_assets_cleared: boolean;
  admin_signed_by?: string | null;
  admin_signed_at?: string | null;
  it_access_revoked: boolean;
  it_signed_by?: string | null;
  it_signed_at?: string | null;
  it_note?: string;
  accounting_debt_cleared: boolean;
  advance_deduction_vnd: number;
  accounting_signed_by?: string | null;
  accounting_signed_at?: string | null;
  accounting_note?: string;
  hr_bhxh_closed: boolean;
  hr_signed_by?: string | null;
  hr_signed_at?: string | null;
  hr_note?: string;
  total_penalty_vnd: number;
  updated_at: string;
}

export interface ManagerOffboardingDependency {
  employee_id: string;
  employee_code: string;
  is_manager: boolean;
  subordinates: Array<{
    id: string;
    employee_code: string;
    full_name: string;
    position_name: string;
  }>;
  pending_requests: Array<{
    id: string;
    request_code: string;
    full_name: string;
    request_category: RequestCategory;
  }>;
  requires_successor_reassign: boolean;
}

export interface ClearanceGateStatus {
  resignation_id: string;
  employee_id: string;
  is_100_percent_cleared: boolean;
  completion_percent: number;
  handover_total: number;
  handover_completed: number;
  assets_total: number;
  assets_reconciled: number;
  admin_cleared: boolean;
  it_cleared: boolean;
  accounting_cleared: boolean;
  hr_cleared: boolean;
  manager_dependencies_cleared: boolean;
  blocking_reasons: string[];
}
