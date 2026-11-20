import type { Actor, RoleCode } from './types';

export type HrmAction =
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
  | 'view_audit_log';

export function can(
  actor: Actor,
  action: HrmAction,
  entityContext?: {
    departmentId?: string;
    candidateId?: string;
    salary?: number;
    headcount?: number;
  }
): boolean {
  const { role } = actor;

  // SUPER_ADMIN has full permissions
  if (role === 'SUPER_ADMIN') return true;

  switch (action) {
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
      return role === 'CANDIDATE' || role === 'HR_MANAGER' || role === 'DEPT_MANAGER' || role === 'DIRECTOR';

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

    default:
      return false;
  }
}
