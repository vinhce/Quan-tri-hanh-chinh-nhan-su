-- =============================================================================
-- Migration 002: Full Employee Lifecycle Schema (Onboarding -> C&B -> Career -> Offboarding)
-- System: Lạc Việt HRM v2.4
-- Engine: MySQL 8.0+ / MariaDB 10.6+ (InnoDB / utf8mb4_unicode_ci)
-- Note: Preserves 001_recruitment_core.sql completely. Uses ON DELETE RESTRICT
--       for all core employee, contract, payroll, and career history relations
--       so historical records are never destroyed.
-- =============================================================================

SET NAMES utf8mb4;

-- =============================================================================
-- [UP MIGRATION] — 1. CORE ORGANIZATION & AUTHENTICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  manager_id VARCHAR(64) NULL,
  parent_id VARCHAR(64) NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dept_manager (manager_id),
  INDEX idx_dept_parent (parent_id),
  CONSTRAINT fk_dept_parent FOREIGN KEY (parent_id) REFERENCES departments (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS positions (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  department_id VARCHAR(64) NOT NULL,
  level VARCHAR(50) NOT NULL DEFAULT 'Staff',
  is_managerial TINYINT(1) NOT NULL DEFAULT 0,
  base_salary_min BIGINT NOT NULL DEFAULT 0,
  base_salary_max BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pos_dept (department_id),
  INDEX idx_pos_managerial (is_managerial),
  CONSTRAINT fk_pos_dept FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(64) PRIMARY KEY,
  employee_code VARCHAR(50) NOT NULL UNIQUE,
  candidate_id VARCHAR(64) NULL,
  application_id VARCHAR(64) NULL,
  full_name VARCHAR(255) NOT NULL,
  personal_email VARCHAR(255) NULL,
  company_email VARCHAR(255) NULL UNIQUE,
  phone VARCHAR(50) NOT NULL,
  dob DATE NULL,
  gender VARCHAR(20) NULL,
  address VARCHAR(500) NULL,
  department_id VARCHAR(64) NOT NULL,
  position_id VARCHAR(64) NOT NULL,
  manager_id VARCHAR(64) NULL,
  mentor_id VARCHAR(64) NULL,
  status ENUM('PENDING_ONBOARD', 'PROBATION', 'OFFICIAL', 'NOTICE_PERIOD', 'RESIGNED') NOT NULL DEFAULT 'PENDING_ONBOARD',
  join_date DATE NOT NULL,
  probation_end_date DATE NULL,
  official_date DATE NULL,
  approved_last_day DATE NULL,
  resign_date DATE NULL,
  is_rehireable TINYINT(1) NULL DEFAULT NULL,
  rehire_note TEXT NULL,
  id_card_no VARCHAR(20) NULL COMMENT 'Số CCCD / CMND',
  id_card_date DATE NULL,
  id_card_place VARCHAR(255) NULL,
  tax_code VARCHAR(30) NULL COMMENT 'Mã số thuế TNCN (MST)',
  bhxh_no VARCHAR(30) NULL COMMENT 'Mã số BHXH',
  bank_account_no VARCHAR(50) NULL,
  bank_name VARCHAR(120) NULL,
  bank_branch VARCHAR(120) NULL,
  emergency_contact_name VARCHAR(255) NULL,
  emergency_contact_phone VARCHAR(50) NULL,
  emergency_contact_relation VARCHAR(100) NULL,
  preboarding_token VARCHAR(128) NULL UNIQUE,
  preboarding_status ENUM('PENDING', 'SUBMITTED', 'VERIFIED') NULL DEFAULT 'PENDING',
  preboarding_expires_at DATETIME NULL,
  preboarding_completed_at DATETIME NULL,
  probation_salary_percent INT NOT NULL DEFAULT 85,
  base_salary BIGINT NOT NULL DEFAULT 0,
  allowances BIGINT NOT NULL DEFAULT 0,
  dependents_count INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_emp_status (status),
  INDEX idx_emp_dept (department_id),
  INDEX idx_emp_position (position_id),
  INDEX idx_emp_manager (manager_id),
  INDEX idx_emp_mentor (mentor_id),
  INDEX idx_emp_id_card (id_card_no),
  INDEX idx_emp_tax_code (tax_code),
  CONSTRAINT fk_emp_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_emp_position FOREIGN KEY (position_id) REFERENCES positions (id) ON DELETE RESTRICT,
  CONSTRAINT fk_emp_manager FOREIGN KEY (manager_id) REFERENCES employees (id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_mentor FOREIGN KEY (mentor_id) REFERENCES employees (id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_candidate FOREIGN KEY (candidate_id) REFERENCES candidates (id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'EMPLOYEE',
  account_status ENUM('INACTIVE', 'ACTIVE', 'LOCKED') NOT NULL DEFAULT 'INACTIVE',
  is_active TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0 cho PENDING_ONBOARD / RESIGNED, 1 khi IT kích hoạt',
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  activated_at DATETIME NULL,
  last_login_at DATETIME NULL,
  locked_at DATETIME NULL,
  locked_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_active (role, is_active),
  INDEX idx_users_account_status (account_status),
  CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- [UP MIGRATION] — 2. STAGE 1: ONBOARDING, ASSETS, CONTRACTS & LEAVE BALANCES
-- =============================================================================

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  dept_scope ENUM('IT', 'ADMIN', 'MANAGER', 'HR') NOT NULL,
  task_code VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  assignee_id VARCHAR(64) NULL,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('PENDING', 'IN_PROGRESS', 'DONE') NOT NULL DEFAULT 'PENDING',
  due_date DATE NULL,
  completed_by VARCHAR(64) NULL,
  completed_at DATETIME NULL,
  meta_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_onb_emp_scope (employee_id, dept_scope),
  INDEX idx_onb_status (status),
  CONSTRAINT fk_onb_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_onb_assignee FOREIGN KEY (assignee_id) REFERENCES employees (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(64) PRIMARY KEY,
  asset_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  serial_no VARCHAR(100) NULL UNIQUE,
  value_amount BIGINT NOT NULL DEFAULT 0,
  purchase_date DATE NULL,
  status ENUM('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'LOST', 'DAMAGED') NOT NULL DEFAULT 'AVAILABLE',
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assets_status (status),
  INDEX idx_assets_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_assets (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  asset_id VARCHAR(64) NOT NULL,
  assigned_date DATE NOT NULL,
  returned_date DATE NULL,
  assign_condition VARCHAR(255) NOT NULL DEFAULT 'Tốt / Nguyên vẹn',
  return_condition VARCHAR(255) NULL,
  penalty_amount BIGINT NOT NULL DEFAULT 0,
  status ENUM('ASSIGNED', 'RETURNED', 'DAMAGED', 'LOST') NOT NULL DEFAULT 'ASSIGNED',
  assigned_by VARCHAR(64) NULL,
  received_back_by VARCHAR(64) NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_emp_assets_emp_status (employee_id, status),
  INDEX idx_emp_assets_asset_status (asset_id, status),
  CONSTRAINT fk_emp_assets_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_emp_assets_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contracts (
  id VARCHAR(64) PRIMARY KEY,
  contract_code VARCHAR(64) NOT NULL UNIQUE,
  employee_id VARCHAR(64) NOT NULL,
  parent_contract_id VARCHAR(64) NULL,
  contract_type ENUM('PROBATION', 'FIXED_TERM', 'INDEFINITE', 'ADDENDUM') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  base_salary BIGINT NOT NULL DEFAULT 0,
  salary_percent INT NOT NULL DEFAULT 100 COMMENT '85 cho thử việc, 100 cho chính thức',
  allowances BIGINT NOT NULL DEFAULT 0,
  file_id VARCHAR(64) NULL,
  status ENUM('DRAFT', 'PENDING_SIGN', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
  signed_by VARCHAR(64) NULL,
  signed_at DATETIME NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contracts_emp_status (employee_id, status),
  INDEX idx_contracts_type (contract_type),
  INDEX idx_contracts_end_date (end_date),
  CONSTRAINT fk_contracts_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_contracts_parent FOREIGN KEY (parent_contract_id) REFERENCES contracts (id) ON DELETE RESTRICT,
  CONSTRAINT fk_contracts_file FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_balances (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  year INT NOT NULL,
  total_days DECIMAL(4,1) NOT NULL DEFAULT 12.0,
  seniority_bonus_days DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  carry_over_days DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  used_days DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  pending_days DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  remaining_days DECIMAL(4,1) NOT NULL DEFAULT 12.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leave_balance_emp_year (employee_id, year),
  INDEX idx_leave_balance_year (year),
  CONSTRAINT fk_leave_balances_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- [UP MIGRATION] — 3. STAGE 2: ATTENDANCE, LEAVE/OT/EXPLANATION & PAYROLL
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendances (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  work_date DATE NOT NULL,
  shift_code VARCHAR(30) NOT NULL DEFAULT 'HC-0830',
  check_in VARCHAR(10) NULL COMMENT 'HH:mm',
  check_out VARCHAR(10) NULL COMMENT 'HH:mm',
  late_minutes INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  workday_value DECIMAL(3,2) NOT NULL DEFAULT 0.00 COMMENT '1.00 | 0.50 | 0.00',
  ot_hours DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  status ENUM('PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE_PAID', 'LEAVE_UNPAID', 'MISSING_PUNCH', 'WFH', 'HOLIDAY') NOT NULL DEFAULT 'ABSENT',
  source ENUM('WEB', 'IMPORT', 'EXPLANATION', 'SYSTEM') NOT NULL DEFAULT 'WEB',
  explanation_request_id VARCHAR(64) NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_emp_date (employee_id, work_date),
  INDEX idx_att_date_status (work_date, status),
  INDEX idx_att_emp_status (employee_id, status),
  CONSTRAINT fk_attendances_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_requests (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  employee_id VARCHAR(64) NOT NULL,
  request_type ENUM('ANNUAL_LEAVE', 'UNPAID_LEAVE', 'SICK_LEAVE', 'OT', 'WFH', 'EXPLANATION', 'BUSINESS_TRIP', 'OVERSEAS_BUSINESS_TRIP') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  ot_hours DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  ot_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.50,
  fixed_check_in VARCHAR(10) NULL,
  fixed_check_out VARCHAR(10) NULL,
  attachment_file_id VARCHAR(64) NULL,
  reason TEXT NOT NULL,
  current_approver_id VARCHAR(64) NULL COMMENT 'Người duyệt hiện tại — tự động re-assign khi Quản lý nghỉ việc',
  manager_approved_by VARCHAR(64) NULL,
  manager_approved_at DATETIME NULL,
  hr_approved_by VARCHAR(64) NULL,
  hr_approved_at DATETIME NULL,
  director_approved_by VARCHAR(64) NULL,
  director_approved_at DATETIME NULL,
  status ENUM('PENDING', 'MANAGER_APPROVED', 'HR_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  reject_reason TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leave_req_emp_status (employee_id, status),
  INDEX idx_leave_req_approver (current_approver_id, status),
  INDEX idx_leave_req_type_dates (request_type, start_date, end_date),
  CONSTRAINT fk_leave_req_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_leave_req_approver FOREIGN KEY (current_approver_id) REFERENCES employees (id) ON DELETE SET NULL,
  CONSTRAINT fk_leave_req_file FOREIGN KEY (attachment_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payrolls (
  id VARCHAR(64) PRIMARY KEY,
  payroll_code VARCHAR(64) NOT NULL UNIQUE,
  employee_id VARCHAR(64) NOT NULL,
  period_month VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  standard_workdays INT NOT NULL DEFAULT 22,
  actual_workdays DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  paid_leave_days DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  unpaid_leave_days DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  ot_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  ot_amount BIGINT NOT NULL DEFAULT 0,
  base_salary_snapshot BIGINT NOT NULL DEFAULT 0,
  split_salary_json JSON NULL COMMENT 'Chi tiết tách lương giữa tháng khi chuyển chính thức / thăng chức',
  workday_salary BIGINT NOT NULL DEFAULT 0,
  allowances_amount BIGINT NOT NULL DEFAULT 0,
  kpi_bonus BIGINT NOT NULL DEFAULT 0,
  unused_leave_payout BIGINT NOT NULL DEFAULT 0 COMMENT 'Thanh toán tiền phép năm chưa dùng khi quyết toán',
  gross_income BIGINT NOT NULL DEFAULT 0,
  bhxh_deduction BIGINT NOT NULL DEFAULT 0,
  pit_deduction BIGINT NOT NULL DEFAULT 0,
  advance_deduction BIGINT NOT NULL DEFAULT 0,
  penalty_amount BIGINT NOT NULL DEFAULT 0 COMMENT 'Khấu trừ phạt đi muộn + bồi thường tài sản hư hỏng/mất',
  net_salary BIGINT NOT NULL DEFAULT 0,
  is_final_settlement TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 nếu là phiếu quyết toán nghỉ việc cuối kỳ',
  status ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID') NOT NULL DEFAULT 'DRAFT',
  approved_by VARCHAR(64) NULL,
  approved_at DATETIME NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_emp_period_final (employee_id, period_month, is_final_settlement),
  INDEX idx_payrolls_period_status (period_month, status),
  INDEX idx_payrolls_final (is_final_settlement, status),
  CONSTRAINT fk_payrolls_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- [UP MIGRATION] — 4. STAGE 3: PERFORMANCE REVIEWS & IMMUTABLE CAREER HISTORIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS performance_reviews (
  id VARCHAR(64) PRIMARY KEY,
  review_code VARCHAR(50) NOT NULL UNIQUE,
  employee_id VARCHAR(64) NOT NULL,
  review_cycle ENUM('PROBATION', 'QUARTERLY', 'ANNUAL') NOT NULL,
  period_label VARCHAR(50) NOT NULL,
  reviewer_id VARCHAR(64) NOT NULL,
  kpi_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  okr_completion_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  competency_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  final_result ENUM('PASS', 'EXTEND', 'FAIL', 'EXCELLENT', 'GOOD', 'AVERAGE', 'POOR') NOT NULL,
  kpi_bonus_amount BIGINT NOT NULL DEFAULT 0,
  recommendation VARCHAR(50) NULL,
  comment TEXT NULL,
  status ENUM('DRAFT', 'SUBMITTED', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
  approved_by VARCHAR(64) NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_perf_emp_cycle (employee_id, review_cycle),
  INDEX idx_perf_period_status (period_label, status),
  CONSTRAINT fk_perf_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_perf_reviewer FOREIGN KEY (reviewer_id) REFERENCES employees (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS career_histories (
  id VARCHAR(64) PRIMARY KEY,
  decision_no VARCHAR(64) NOT NULL UNIQUE,
  employee_id VARCHAR(64) NOT NULL,
  action_type ENUM('ONBOARD', 'PROBATION_PASS', 'PROMOTION', 'TRANSFER', 'SALARY_CHANGE', 'ROLE_CHANGE', 'OFFBOARD') NOT NULL,
  effective_date DATE NOT NULL,
  old_department_id VARCHAR(64) NULL,
  new_department_id VARCHAR(64) NULL,
  old_position_id VARCHAR(64) NULL,
  new_position_id VARCHAR(64) NULL,
  old_salary BIGINT NOT NULL DEFAULT 0,
  new_salary BIGINT NOT NULL DEFAULT 0,
  old_role VARCHAR(30) NULL,
  new_role VARCHAR(30) NULL,
  addendum_contract_id VARCHAR(64) NULL,
  reason TEXT NULL,
  signed_by VARCHAR(64) NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_career_emp_eff (employee_id, effective_date),
  INDEX idx_career_action (action_type),
  CONSTRAINT fk_career_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_career_old_dept FOREIGN KEY (old_department_id) REFERENCES departments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_career_new_dept FOREIGN KEY (new_department_id) REFERENCES departments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_career_old_pos FOREIGN KEY (old_position_id) REFERENCES positions (id) ON DELETE RESTRICT,
  CONSTRAINT fk_career_new_pos FOREIGN KEY (new_position_id) REFERENCES positions (id) ON DELETE RESTRICT,
  CONSTRAINT fk_career_addendum FOREIGN KEY (addendum_contract_id) REFERENCES contracts (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- [UP MIGRATION] — 5. STAGE 4: RESIGNATIONS, 3-WAY HANDOVER & CLEARANCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS resignations (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  employee_id VARCHAR(64) NOT NULL,
  contract_type_snapshot VARCHAR(30) NOT NULL,
  required_notice_days INT NOT NULL DEFAULT 30 COMMENT '3 (Thử việc) | 30 (Có thời hạn) | 45 (Không thời hạn)',
  submitted_date DATE NOT NULL,
  requested_last_day DATE NOT NULL,
  approved_last_day DATE NULL,
  is_notice_compliant TINYINT(1) NOT NULL DEFAULT 1,
  notice_violation_days INT NOT NULL DEFAULT 0,
  early_override_reason TEXT NULL,
  reason_category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
  reason TEXT NOT NULL,
  successor_manager_id VARCHAR(64) NULL COMMENT 'Người kế nhiệm nhận cấp dưới & đơn tồn khi Quản lý nghỉ việc',
  manager_approved_by VARCHAR(64) NULL,
  manager_approved_at DATETIME NULL,
  hr_approved_by VARCHAR(64) NULL,
  hr_approved_at DATETIME NULL,
  is_rehireable TINYINT(1) NULL DEFAULT NULL,
  rehire_note TEXT NULL,
  status ENUM('PENDING', 'MANAGER_APPROVED', 'NOTICE_PERIOD', 'CLEARANCE_IN_PROGRESS', 'READY_FOR_SETTLEMENT', 'COMPLETED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  reject_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_resign_emp_status (employee_id, status),
  INDEX idx_resign_approved_last_day (approved_last_day),
  CONSTRAINT fk_resign_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_resign_successor FOREIGN KEY (successor_manager_id) REFERENCES employees (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS handover_items (
  id VARCHAR(64) PRIMARY KEY,
  resignation_id VARCHAR(64) NOT NULL,
  employee_id VARCHAR(64) NOT NULL,
  handover_to_id VARCHAR(64) NOT NULL,
  item_type ENUM('WORK', 'PROJECT', 'DOCUMENT', 'ACCOUNT_CREDENTIAL', 'SUBORDINATE_TRANSFER', 'PENDING_APPROVAL_TRANSFER') NOT NULL DEFAULT 'WORK',
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  employee_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  employee_confirmed_at DATETIME NULL,
  receiver_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  receiver_confirmed_at DATETIME NULL,
  manager_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  manager_confirmed_by VARCHAR(64) NULL,
  manager_confirmed_at DATETIME NULL,
  status ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_handover_resign_status (resignation_id, status),
  INDEX idx_handover_receiver (handover_to_id, status),
  CONSTRAINT fk_handover_resignation FOREIGN KEY (resignation_id) REFERENCES resignations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_handover_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_handover_receiver FOREIGN KEY (handover_to_id) REFERENCES employees (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clearance_checklists (
  id VARCHAR(64) PRIMARY KEY,
  resignation_id VARCHAR(64) NOT NULL,
  employee_id VARCHAR(64) NOT NULL,
  dept_scope ENUM('ADMIN_ASSET', 'IT_ACCOUNT', 'ACCOUNTING_DEBT', 'HR_FINAL') NOT NULL,
  item_title VARCHAR(255) NOT NULL,
  employee_asset_id VARCHAR(64) NULL,
  returned_date DATE NULL,
  return_condition VARCHAR(255) NULL,
  penalty_amount BIGINT NOT NULL DEFAULT 0,
  advance_deduction_amount BIGINT NOT NULL DEFAULT 0,
  it_signed_by VARCHAR(64) NULL,
  it_signed_at DATETIME NULL,
  accounting_signed_by VARCHAR(64) NULL,
  accounting_signed_at DATETIME NULL,
  hr_signed_by VARCHAR(64) NULL,
  hr_signed_at DATETIME NULL,
  cleared_by VARCHAR(64) NULL,
  cleared_at DATETIME NULL,
  status ENUM('PENDING', 'CLEARED', 'PENALTY_APPLIED') NOT NULL DEFAULT 'PENDING',
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_clearance_resign_scope (resignation_id, dept_scope, status),
  INDEX idx_clearance_emp_status (employee_id, status),
  CONSTRAINT fk_clearance_resignation FOREIGN KEY (resignation_id) REFERENCES resignations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_clearance_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
  CONSTRAINT fk_clearance_emp_asset FOREIGN KEY (employee_asset_id) REFERENCES employee_assets (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- [SAFE IDEMPOTENT ALTER TABLE BLOCKS]
-- Ensures brownfield databases that already had older `users`, `employees`,
-- `contracts`, or `payrolls` tables safely gain any missing lifecycle columns.
-- =============================================================================

SET @db_name = DATABASE();

-- 1. users.is_active
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0 AFTER role',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. employees.official_date
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'official_date';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE employees ADD COLUMN official_date DATE NULL AFTER join_date',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. employees.mentor_id
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'mentor_id';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE employees ADD COLUMN mentor_id VARCHAR(64) NULL AFTER manager_id',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. employees.preboarding_token
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'preboarding_token';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE employees ADD COLUMN preboarding_token VARCHAR(128) NULL UNIQUE',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. employees.is_rehireable
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'is_rehireable';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE employees ADD COLUMN is_rehireable TINYINT(1) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. contracts.salary_percent
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'salary_percent';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE contracts ADD COLUMN salary_percent INT NOT NULL DEFAULT 100 AFTER base_salary',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. payrolls.is_final_settlement
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'payrolls' AND COLUMN_NAME = 'is_final_settlement';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE payrolls ADD COLUMN is_final_settlement TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. payrolls.unused_leave_payout
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'payrolls' AND COLUMN_NAME = 'unused_leave_payout';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE payrolls ADD COLUMN unused_leave_payout BIGINT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9. payrolls.penalty_amount
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'payrolls' AND COLUMN_NAME = 'penalty_amount';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE payrolls ADD COLUMN penalty_amount BIGINT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. payrolls.split_salary_json
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'payrolls' AND COLUMN_NAME = 'split_salary_json';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE payrolls ADD COLUMN split_salary_json JSON NULL',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================================================
-- [UP MIGRATION] — 7. BIOMETRIC FINGERPRINT (WEBAUTHN) & SAME-WIFI POLICY
-- =============================================================================

CREATE TABLE IF NOT EXISTS biometric_credentials (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  credential_id VARCHAR(255) NOT NULL UNIQUE,
  public_key_spki TEXT NOT NULL,
  public_key_alg INT NOT NULL DEFAULT -7,
  rp_id VARCHAR(255) NOT NULL,
  device_label VARCHAR(255) NOT NULL,
  device_kind ENUM('LAPTOP', 'MOBILE', 'OTHER') NOT NULL DEFAULT 'LAPTOP',
  sign_count BIGINT NOT NULL DEFAULT 0,
  registered_ip VARCHAR(64) NULL,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_biometric_emp_rp (employee_id, rp_id),
  CONSTRAINT fk_biometric_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wifi_attendance_policies (
  id VARCHAR(64) PRIMARY KEY,
  wifi_ssid_label VARCHAR(120) NOT NULL DEFAULT 'WiFi Nội bộ (Cùng mạng Máy chủ)',
  enforce_same_wifi TINYINT(1) NOT NULL DEFAULT 1,
  require_biometric_for_punch TINYINT(1) NOT NULL DEFAULT 1,
  allowed_public_ips JSON NULL,
  allowed_lan_cidrs JSON NULL,
  updated_by VARCHAR(120) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. attendances.biometric_credential_id
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'attendances' AND COLUMN_NAME = 'biometric_credential_id';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE attendances ADD COLUMN biometric_credential_id VARCHAR(64) NULL AFTER source',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 12. attendances.device_label
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'attendances' AND COLUMN_NAME = 'device_label';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE attendances ADD COLUMN device_label VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 13. attendances.verified_ip
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'attendances' AND COLUMN_NAME = 'verified_ip';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE attendances ADD COLUMN verified_ip VARCHAR(64) NULL',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 14. attendances.wifi_match_mode
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'attendances' AND COLUMN_NAME = 'wifi_match_mode';
SET @alter_sql = IF(@col_exists = 0,
  'ALTER TABLE attendances ADD COLUMN wifi_match_mode VARCHAR(40) NULL',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 15. attendances.source (mở rộng ENUM hỗ trợ BIOMETRIC_FINGERPRINT)
SELECT COLUMN_TYPE INTO @att_source_type FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'attendances' AND COLUMN_NAME = 'source';
SET @alter_sql = IF(@att_source_type NOT LIKE '%BIOMETRIC_FINGERPRINT%',
  'ALTER TABLE attendances MODIFY COLUMN source ENUM(''WEB'', ''BIOMETRIC_FINGERPRINT'', ''IMPORT'', ''EXPLANATION'', ''SYSTEM'') NOT NULL DEFAULT ''WEB''',
  'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================================================
-- [DOWN / ROLLBACK INSTRUCTIONS — MANUAL DBA EXECUTION IN REVERSE FK ORDER]
-- WARNING: Never run rollback in production without full encrypted snapshot!
-- =============================================================================
-- -- Step 0: Reverse Biometric & WiFi Policy
-- -- DROP TABLE IF EXISTS wifi_attendance_policies;
-- -- DROP TABLE IF EXISTS biometric_credentials;
-- -- Step 1: Reverse Stage 4 (Offboarding & Clearance)
-- -- DROP TABLE IF EXISTS clearance_checklists;
-- -- DROP TABLE IF EXISTS handover_items;
-- -- DROP TABLE IF EXISTS resignations;
--
-- -- Step 2: Reverse Stage 3 (Career Progression & Performance)
-- -- DROP TABLE IF EXISTS career_histories;
-- -- DROP TABLE IF EXISTS performance_reviews;
--
-- -- Step 3: Reverse Stage 2 (Payroll, Leave Requests & Attendance)
-- -- DROP TABLE IF EXISTS payrolls;
-- -- DROP TABLE IF EXISTS leave_requests;
-- -- DROP TABLE IF EXISTS attendances;
--
-- -- Step 4: Reverse Stage 1 (Leave Balances, Contracts, Assets & Onboarding)
-- -- DROP TABLE IF EXISTS leave_balances;
-- -- DROP TABLE IF EXISTS contracts;
-- -- DROP TABLE IF EXISTS employee_assets;
-- -- DROP TABLE IF EXISTS assets;
-- -- DROP TABLE IF EXISTS onboarding_tasks;
--
-- -- Step 5: Reverse Core Auth & Organization
-- -- DROP TABLE IF EXISTS users;
-- -- DROP TABLE IF EXISTS employees;
-- -- DROP TABLE IF EXISTS positions;
-- -- DROP TABLE IF EXISTS departments;
