import type { Actor, RoleCode } from './types';

export type HrmAction =
  // Recruitment (ATS) Actions
  | 'create_proposal'
  | 'edit_proposal'
  | 'submit_proposal'
  | 'approve_proposal'
  | 'reject_proposal'
  | 'create_job'
  | 'edit_job'
  | 'close_job'
  | 'apply_job'
  | 'screen_candidate'
  | 'schedule_interview'
  | 'reschedule_interview'
  | 'confirm_interview'
  | 'submit_interview_score'
  | 'create_offer'
  | 'approve_offer'
  | 'accept_offer'
  | 'decline_offer'
  | 'hire_candidate'
  | 'withdraw_application'
  | 'reject_application'
  | 'view_audit_log'
  // Stage 1: Pre-boarding, Onboarding, Assets, Contracts & Probation
  | 'create_preboarding_invite'
  | 'submit_preboarding_info'
  | 'verify_preboarding'
  | 'complete_onboarding_task'
  | 'assign_onboarding_mentor'
  | 'manage_assets'
  | 'manage_contracts'
  | 'evaluate_probation'
  | 'convert_probation_to_official'
  // Stage 2: Attendance, Leave/OT/Explanation & Payroll (C&B)
  | 'check_in_out'
  | 'import_attendance'
  | 'lock_attendance'
  | 'create_leave_request'
  | 'approve_leave_manager'
  | 'approve_leave_hr'
  | 'approve_leave_director'
  | 'calculate_payroll'
  | 'approve_payroll'
  | 'view_self_payslip'
  // Stage 3: Performance Reviews & Career Progression
  | 'submit_performance_review'
  | 'approve_performance_review'
  | 'propose_promotion_or_transfer'
  | 'approve_promotion_or_salary_change'
  // Stage 4: Offboarding, 3-Way Handover, Clearance & Final Settlement
  | 'submit_resignation'
  | 'approve_resignation_manager'
  | 'approve_resignation_hr'
  | 'reassign_manager_subordinates'
  | 'confirm_handover_sender'
  | 'confirm_handover_receiver'
  | 'confirm_handover_manager'
  | 'sign_clearance_it'
  | 'sign_clearance_admin_asset'
  | 'sign_clearance_accounting'
  | 'sign_clearance_hr'
  | 'execute_final_settlement';

export interface EntityPermissionContext {
  departmentId?: string;
  candidateId?: string;
  employeeId?: string;
  salary?: number;
  headcount?: number;
  daysCount?: number;
  deptScope?: 'IT' | 'ADMIN' | 'MANAGER' | 'HR';
  newRole?: RoleCode;
  isFinalSettlement?: boolean;
}

export function can(
  actor: Actor,
  action: HrmAction,
  entityContext?: EntityPermissionContext
): boolean {
  const { role } = actor;

  // SUPER_ADMIN has full permissions across system
  if (role === 'SUPER_ADMIN') return true;

  switch (action) {
    // --- ATS / Recruitment ---
    case 'create_proposal':
    case 'edit_proposal':
    case 'submit_proposal':
      return role === 'DEPT_MANAGER' || role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_proposal':
      if (role === 'DIRECTOR') return true;
      if (role === 'HR_MANAGER') {
        // High budget or headcount requires Director
        if (
          (entityContext?.headcount && entityContext.headcount > 3) ||
          (entityContext?.salary && entityContext.salary > 50_000_000)
        ) {
          return false;
        }
        return true;
      }
      return false;

    case 'reject_proposal':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'create_job':
    case 'edit_job':
    case 'close_job':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'apply_job':
      return true; // Public / candidates can apply

    case 'screen_candidate':
      return role === 'HR_MANAGER' || role === 'DEPT_MANAGER' || role === 'DIRECTOR';

    case 'schedule_interview':
    case 'submit_interview_score':
      return role === 'HR_MANAGER' || role === 'DEPT_MANAGER' || role === 'DIRECTOR';

    case 'reschedule_interview':
      // Candidate can request reschedule, HR/Dept can re-schedule
      return (
        role === 'CANDIDATE' ||
        role === 'HR_MANAGER' ||
        role === 'DEPT_MANAGER' ||
        role === 'DIRECTOR'
      );

    case 'confirm_interview':
      return role === 'CANDIDATE' || role === 'HR_MANAGER';

    case 'create_offer':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_offer':
      return role === 'DIRECTOR' || role === 'HR_MANAGER';

    case 'accept_offer':
    case 'decline_offer':
    case 'withdraw_application':
      return role === 'CANDIDATE';

    case 'hire_candidate':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'reject_application':
      return role === 'HR_MANAGER' || role === 'DEPT_MANAGER' || role === 'DIRECTOR';

    case 'view_audit_log':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    // --- Stage 1: Pre-boarding, Onboarding, Assets, Contracts & Probation ---
    case 'create_preboarding_invite':
    case 'verify_preboarding':
    case 'manage_assets':
    case 'manage_contracts':
    case 'convert_probation_to_official':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'submit_preboarding_info':
      return true; // Public token link or candidate/HR self-service

    case 'complete_onboarding_task':
      if (entityContext?.deptScope === 'MANAGER') {
        return role === 'DEPT_MANAGER' || role === 'HR_MANAGER' || role === 'DIRECTOR';
      }
      return role === 'HR_MANAGER' || role === 'DEPT_MANAGER' || role === 'DIRECTOR';

    case 'assign_onboarding_mentor':
    case 'evaluate_probation':
      return role === 'DEPT_MANAGER' || role === 'HR_MANAGER' || role === 'DIRECTOR';

    // --- Stage 2: Attendance, Leave/OT/Explanation & Payroll ---
    case 'check_in_out':
    case 'create_leave_request':
    case 'view_self_payslip':
      return (
        role === 'EMPLOYEE' ||
        role === 'DEPT_MANAGER' ||
        role === 'HR_MANAGER' ||
        role === 'DIRECTOR'
      );

    case 'import_attendance':
    case 'lock_attendance':
    case 'calculate_payroll':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_leave_manager':
      return role === 'DEPT_MANAGER' || role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_leave_hr':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_leave_director':
      return role === 'DIRECTOR';

    case 'approve_payroll':
      return role === 'DIRECTOR' || role === 'HR_MANAGER';

    // --- Stage 3: Performance Reviews & Career Progression ---
    case 'submit_performance_review':
    case 'propose_promotion_or_transfer':
      return role === 'DEPT_MANAGER' || role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_performance_review':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_promotion_or_salary_change':
      if (role === 'DIRECTOR') return true;
      if (role === 'HR_MANAGER') {
        if (
          entityContext?.newRole === 'DEPT_MANAGER' ||
          entityContext?.newRole === 'DIRECTOR' ||
          (entityContext?.salary && entityContext.salary > 50_000_000)
        ) {
          return false;
        }
        return true;
      }
      return false;

    // --- Stage 4: Offboarding, 3-Way Handover, Clearance & Final Settlement ---
    case 'submit_resignation':
      return role === 'EMPLOYEE' || role === 'DEPT_MANAGER' || role === 'HR_MANAGER';

    case 'approve_resignation_manager':
    case 'confirm_handover_manager':
      return role === 'DEPT_MANAGER' || role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'approve_resignation_hr':
    case 'reassign_manager_subordinates':
    case 'sign_clearance_admin_asset':
    case 'sign_clearance_accounting':
    case 'sign_clearance_hr':
    case 'execute_final_settlement':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'sign_clearance_it':
      return role === 'HR_MANAGER' || role === 'DIRECTOR';

    case 'confirm_handover_sender':
    case 'confirm_handover_receiver':
      return (
        role === 'EMPLOYEE' ||
        role === 'DEPT_MANAGER' ||
        role === 'HR_MANAGER' ||
        role === 'DIRECTOR'
      );

    default:
      return false;
  }
}

export function canRole(
  role: RoleCode,
  action: HrmAction,
  entityContext?: EntityPermissionContext
): boolean {
  return can({ id: `role-${role}`, name: role, role }, action, entityContext);
}
