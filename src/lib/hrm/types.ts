export type RoleCode =
  | 'SUPER_ADMIN'
  | 'DIRECTOR'
  | 'HR_MANAGER'
  | 'DEPT_MANAGER'
  | 'EMPLOYEE'
  | 'CANDIDATE';

export type ProposalStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'needs_info'
  | 'posted';

export type JobStatus = 'draft' | 'open' | 'paused' | 'closed';

export type Stage = 'new' | 'screening' | 'interview' | 'offer' | 'hired';

export type TerminalReason =
  | 'rejected_screening'
  | 'rejected_interview'
  | 'offer_declined'
  | 'withdrawn'
  | 'no_show';

export type InterviewStatus =
  | 'not_scheduled'
  | 'invited'
  | 'confirmed'
  | 'reschedule_requested'
  | 'scheduled'
  | 'completed'
  | 'cancelled';

export type OfferStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'expired';

export interface Actor {
  id: string;
  name: string;
  role: RoleCode;
  departmentId?: string;
  email?: string;
}

export interface JobProposal {
  id: string;
  code: string;
  department_id: string;
  department_name: string;
  title: string;
  level: string;
  headcount: number;
  salary_min: number;
  salary_max: number;
  deadline: string;
  urgency: 'NORMAL' | 'URGENT';
  reason: string;
  status: ProposalStatus;
  reject_reason?: string;
  job_id?: string;
  requested_by_id: string;
  requested_by_name: string;
  approved_by_id?: string;
  approved_by_name?: string;
  approved_at?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface JobPostingEntity {
  id: string;
  code: string;
  proposal_id?: string;
  title: string;
  department_id: string;
  department_name: string;
  level: string;
  headcount_target: number;
  hired_count: number;
  open_slots: number;
  salary_min: number;
  salary_max: number;
  status: JobStatus;
  hiring_manager_name: string;
  published_date: string;
  deadline: string;
  location: string;
  work_mode: 'Onsite' | 'Hybrid' | 'Remote';
  employment_type: string;
  overview?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CandidateEntity {
  id: string;
  candidate_code: string;
  email: string;
  full_name: string;
  phone: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationEntity {
  id: string;
  code: string;
  candidate_id: string;
  job_id: string;
  source: 'LinkedIn' | 'TopCV' | 'ITviec' | 'Referral' | 'CareerSite';
  expected_salary: number;
  current_company: string;
  cv_file_id?: string;
  cv_url?: string;
  stage: Stage;
  stage_changed_at: string;
  archived: boolean;
  terminal_reason?: TerminalReason;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface InterviewEntity {
  id: string;
  application_id: string;
  slot?: string; // ISO datetime
  mode: 'Online' | 'Offline';
  location_or_link: string;
  interviewer_names: string;
  interviewer_ids?: string[];
  status: InterviewStatus;
  proposed_slot?: string;
  proposed_slot_text?: string;
  reschedule_reason?: string;
  score?: number;
  note?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface OfferEntity {
  id: string;
  application_id: string;
  salary: number;
  start_date: string;
  expires_at: string;
  letter_file_id?: string;
  status: OfferStatus;
  approved_by?: string;
  decline_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationEntity {
  id: string;
  event_id: string;
  to_user_id: string;
  type: string;
  entity_id: string;
  title: string;
  message: string;
  read_at?: string;
  created_at: string;
}

export interface AuditLogEntity {
  id: string;
  event_id: string;
  entity: string;
  entity_id: string;
  from_state: string;
  to_state: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  reason?: string;
  at: string;
}

export interface UploadedFileEntity {
  id: string;
  owner_type: string;
  owner_id: string;
  original_name: string;
  stored_filename: string;
  path: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string;
}

export interface CounterEntity {
  counter_type: string;
  year_val: number;
  dept_code: string;
  current_val: number;
}
