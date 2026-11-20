-- Migration 001: Core Recruitment Schema for Lạc Việt HRM v2.4
-- Database: hrm_ai (MySQL / InnoDB / utf8mb4)

CREATE TABLE IF NOT EXISTS counters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  counter_type VARCHAR(50) NOT NULL,
  year_val INT NOT NULL,
  dept_code VARCHAR(50) NOT NULL DEFAULT '',
  current_val INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_counter (counter_type, year_val, dept_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_proposals (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  department_id VARCHAR(64) NOT NULL,
  department_name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  level VARCHAR(50) NOT NULL,
  headcount INT NOT NULL DEFAULT 1,
  salary_min BIGINT NOT NULL DEFAULT 0,
  salary_max BIGINT NOT NULL DEFAULT 0,
  deadline DATE NOT NULL,
  urgency VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  reject_reason TEXT NULL,
  job_id VARCHAR(64) NULL,
  requested_by_id VARCHAR(64) NOT NULL,
  requested_by_name VARCHAR(255) NOT NULL,
  approved_by_id VARCHAR(64) NULL,
  approved_by_name VARCHAR(255) NULL,
  approved_at DATETIME NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_proposal_status (status),
  INDEX idx_proposal_dept (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_postings (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  proposal_id VARCHAR(64) NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  department_id VARCHAR(64) NOT NULL,
  department_name VARCHAR(255) NOT NULL,
  level VARCHAR(50) NOT NULL,
  headcount_target INT NOT NULL DEFAULT 1,
  hired_count INT NOT NULL DEFAULT 0,
  open_slots INT NOT NULL DEFAULT 1,
  salary_min BIGINT NOT NULL DEFAULT 0,
  salary_max BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  hiring_manager_name VARCHAR(255) NOT NULL,
  published_date DATE NOT NULL,
  deadline DATE NOT NULL,
  location VARCHAR(255) DEFAULT 'Hà Nội / Hybrid',
  work_mode VARCHAR(50) DEFAULT 'Hybrid',
  employment_type VARCHAR(50) DEFAULT 'Toàn thời gian',
  overview TEXT NULL,
  responsibilities JSON NULL,
  requirements JSON NULL,
  benefits JSON NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_status (status),
  INDEX idx_job_dept (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candidates (
  id VARCHAR(64) PRIMARY KEY,
  candidate_code VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(64) PRIMARY KEY,
  owner_type VARCHAR(50) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applications (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  candidate_id VARCHAR(64) NOT NULL,
  job_id VARCHAR(64) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'CareerSite',
  expected_salary BIGINT NOT NULL DEFAULT 0,
  current_company VARCHAR(255) DEFAULT '',
  cv_file_id VARCHAR(64) NULL,
  stage VARCHAR(30) NOT NULL DEFAULT 'new',
  stage_changed_at DATETIME NOT NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  terminal_reason VARCHAR(255) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cand_job (candidate_id, job_id),
  INDEX idx_app_job_stage (job_id, stage),
  INDEX idx_app_stage (stage),
  CONSTRAINT fk_app_candidate FOREIGN KEY (candidate_id) REFERENCES candidates (id) ON DELETE CASCADE,
  CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES job_postings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interviews (
  id VARCHAR(64) PRIMARY KEY,
  application_id VARCHAR(64) NOT NULL,
  slot DATETIME NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'Online',
  location_or_link VARCHAR(500) DEFAULT '',
  interviewer_names VARCHAR(500) DEFAULT '',
  interviewer_ids JSON NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'not_scheduled',
  proposed_slot DATETIME NULL,
  proposed_slot_text VARCHAR(255) NULL,
  reschedule_reason TEXT NULL,
  score INT NULL,
  note TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_interview_app (application_id),
  INDEX idx_interview_status (status),
  CONSTRAINT fk_interview_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offers (
  id VARCHAR(64) PRIMARY KEY,
  application_id VARCHAR(64) NOT NULL UNIQUE,
  salary BIGINT NOT NULL,
  start_date DATE NOT NULL,
  expires_at DATETIME NOT NULL,
  letter_file_id VARCHAR(64) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  approved_by VARCHAR(64) NULL,
  decline_reason TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_offer_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(100) NOT NULL UNIQUE,
  to_user_id VARCHAR(64) NOT NULL,
  type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user_read (to_user_id, read_at),
  INDEX idx_notif_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(100) NOT NULL UNIQUE,
  entity VARCHAR(50) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  from_state VARCHAR(50) NOT NULL,
  to_state VARCHAR(50) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  actor_name VARCHAR(255) NOT NULL DEFAULT '',
  actor_role VARCHAR(50) NOT NULL DEFAULT '',
  reason TEXT NULL,
  at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbox_emails (
  id VARCHAR(64) PRIMARY KEY,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body_html TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
