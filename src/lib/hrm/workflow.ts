import { logAudit } from './audit';
import { formatEventId } from './ids';
import { can, type HrmAction } from './permissions';
import type {
  Actor,
  ApplicationEntity,
  InterviewEntity,
  InterviewStatus,
  JobPostingEntity,
  JobProposal,
  OfferEntity,
  ProposalStatus,
  Stage,
  TerminalReason,
} from './types';

export class WorkflowError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 1. Legal Transitions Maps
// ---------------------------------------------------------------------------

export const LEGAL_PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected', 'needs_info'],
  needs_info: ['pending_approval', 'rejected'],
  approved: ['posted'],
  rejected: ['draft'], // allow manager to revise rejected draft
  posted: [],
};

export const LEGAL_STAGE_TRANSITIONS: Record<Stage, Stage[]> = {
  new: ['screening'],
  screening: ['interview'],
  interview: ['offer'],
  offer: ['hired'],
  hired: [],
};

export const LEGAL_INTERVIEW_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  not_scheduled: ['invited', 'cancelled'],
  invited: ['confirmed', 'reschedule_requested', 'scheduled', 'cancelled'],
  confirmed: ['completed', 'reschedule_requested', 'cancelled'],
  reschedule_requested: ['scheduled', 'invited', 'confirmed', 'cancelled'],
  scheduled: ['confirmed', 'reschedule_requested', 'completed', 'cancelled'],
  completed: [],
  cancelled: ['invited'],
};

// ---------------------------------------------------------------------------
// 2. Proposal Workflow Transitions
// ---------------------------------------------------------------------------

export function transitionProposal(params: {
  proposal: JobProposal;
  toStatus: ProposalStatus;
  actor: Actor;
  reason?: string;
  expectedVersion?: number;
}): { proposal: JobProposal; eventId: string } {
  const { proposal, toStatus, actor, reason, expectedVersion } = params;

  // Version check (optimistic concurrency)
  if (expectedVersion !== undefined && proposal.version !== expectedVersion) {
    throw new WorkflowError('Dữ liệu đề xuất đã bị thay đổi bởi người khác, vui lòng tải lại trang.', 'VERSION_MISMATCH');
  }

  // Legal transition check
  const allowed = LEGAL_PROPOSAL_TRANSITIONS[proposal.status];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new WorkflowError(
      `Không thể chuyển trạng thái đề xuất từ '${proposal.status}' sang '${toStatus}'.`,
      'INVALID_TRANSITION'
    );
  }

  // Permission check
  let action: HrmAction = 'edit_proposal';
  if (toStatus === 'pending_approval') action = 'submit_proposal';
  else if (toStatus === 'approved') action = 'approve_proposal';
  else if (toStatus === 'rejected') action = 'reject_proposal';

  const hasPerm = can(actor, action, {
    departmentId: proposal.department_id,
    headcount: proposal.headcount,
    salary: proposal.salary_max,
  });

  if (!hasPerm) {
    throw new WorkflowError('Bạn không có quyền thực hiện thao tác này trên đề xuất tuyển dụng.', 'PERMISSION_DENIED');
  }

  // Reject requires reason
  if (toStatus === 'rejected' && (!reason || reason.trim().length === 0)) {
    throw new WorkflowError('Bắt buộc phải nhập lý do khi từ chối đề xuất tuyển dụng.', 'REJECTION_REASON_REQUIRED');
  }

  const eventId = formatEventId('evt-prop');
  const now = new Date().toISOString();

  const updated: JobProposal = {
    ...proposal,
    status: toStatus,
    reject_reason: toStatus === 'rejected' ? reason : proposal.reject_reason,
    approved_by_id: toStatus === 'approved' ? actor.id : proposal.approved_by_id,
    approved_by_name: toStatus === 'approved' ? actor.name : proposal.approved_by_name,
    approved_at: toStatus === 'approved' ? now : proposal.approved_at,
    version: proposal.version + 1,
    updated_at: now,
  };

  logAudit({
    eventId,
    entity: 'job_proposal',
    entityId: proposal.id,
    fromState: proposal.status,
    toState: toStatus,
    actor,
    reason,
  });

  return { proposal: updated, eventId };
}

// ---------------------------------------------------------------------------
// 3. Application Stage Transitions
// ---------------------------------------------------------------------------

export function transitionApplicationStage(params: {
  application: ApplicationEntity;
  toStage: Stage;
  actor: Actor;
  interview?: InterviewEntity;
  terminalReason?: TerminalReason;
  reason?: string;
  expectedVersion?: number;
}): { application: ApplicationEntity; eventId: string } {
  const { application, toStage, actor, interview, terminalReason, reason, expectedVersion } = params;

  if (expectedVersion !== undefined && application.version !== expectedVersion) {
    throw new WorkflowError('Hồ sơ ứng viên đã bị thay đổi, vui lòng tải lại.', 'VERSION_MISMATCH');
  }

  // Check if terminal transition
  if (terminalReason) {
    const eventId = formatEventId('evt-app');
    const now = new Date().toISOString();
    const updated: ApplicationEntity = {
      ...application,
      archived: true,
      terminal_reason: terminalReason,
      version: application.version + 1,
      updated_at: now,
    };
    logAudit({
      eventId,
      entity: 'application',
      entityId: application.id,
      fromState: application.stage,
      toState: `TERMINAL_${terminalReason}`,
      actor,
      reason,
    });
    return { application: updated, eventId };
  }

  const allowed = LEGAL_STAGE_TRANSITIONS[application.stage];
  if (!allowed || !allowed.includes(toStage)) {
    throw new WorkflowError(
      `Không thể chuyển bước tuyển dụng từ '${application.stage}' sang '${toStage}'.`,
      'INVALID_STAGE_TRANSITION'
    );
  }

  // Strict check: stage -> interview requires interview record
  if (toStage === 'interview') {
    if (!interview || (!interview.slot && interview.status === 'not_scheduled')) {
      throw new WorkflowError(
        'Không thể chuyển sang bước Phỏng vấn khi chưa thiết lập lịch phỏng vấn.',
        'INTERVIEW_SCHEDULE_REQUIRED'
      );
    }
  }

  // Permission check
  let action: HrmAction = 'screen_candidate';
  if (toStage === 'interview') action = 'schedule_interview';
  else if (toStage === 'offer') action = 'create_offer';
  else if (toStage === 'hired') action = 'hire_candidate';

  if (!can(actor, action)) {
    throw new WorkflowError('Bạn không có quyền chuyển bước hồ sơ ứng viên này.', 'PERMISSION_DENIED');
  }

  const eventId = formatEventId('evt-stage');
  const now = new Date().toISOString();

  const updated: ApplicationEntity = {
    ...application,
    stage: toStage,
    stage_changed_at: now,
    version: application.version + 1,
    updated_at: now,
  };

  logAudit({
    eventId,
    entity: 'application',
    entityId: application.id,
    fromState: application.stage,
    toState: toStage,
    actor,
    reason,
  });

  return { application: updated, eventId };
}

// ---------------------------------------------------------------------------
// 4. Interview State Transitions (Solves B2, B3, B4)
// ---------------------------------------------------------------------------

export function transitionInterview(params: {
  interview: InterviewEntity;
  toStatus: InterviewStatus;
  actor: Actor;
  payload?: {
    slot?: string;
    mode?: 'Online' | 'Offline';
    location_or_link?: string;
    interviewer_names?: string;
    proposed_slot?: string;
    proposed_slot_text?: string;
    reschedule_reason?: string;
    score?: number;
    note?: string;
  };
  reason?: string;
  expectedVersion?: number;
}): { interview: InterviewEntity; eventId: string } {
  const { interview, toStatus, actor, payload, reason, expectedVersion } = params;

  if (expectedVersion !== undefined && interview.version !== expectedVersion) {
    throw new WorkflowError('Dữ liệu lịch phỏng vấn đã thay đổi, vui lòng tải lại.', 'VERSION_MISMATCH');
  }

  const allowed = LEGAL_INTERVIEW_TRANSITIONS[interview.status];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new WorkflowError(
      `Không thể chuyển trạng thái lịch từ '${interview.status}' sang '${toStatus}'.`,
      'INVALID_INTERVIEW_TRANSITION'
    );
  }

  // Permission check
  if (toStatus === 'confirmed' && !can(actor, 'confirm_interview')) {
    throw new WorkflowError('Chỉ ứng viên hoặc nhân sự phụ trách mới được xác nhận lịch phỏng vấn.', 'PERMISSION_DENIED');
  }

  if (toStatus === 'reschedule_requested' && !can(actor, 'reschedule_interview')) {
    throw new WorkflowError('Bạn không có quyền gửi đề xuất dời lịch.', 'PERMISSION_DENIED');
  }

  const eventId = formatEventId('evt-interview');
  const now = new Date().toISOString();

  const updated: InterviewEntity = {
    ...interview,
    status: toStatus,
    slot: payload?.slot ?? interview.slot,
    mode: payload?.mode ?? interview.mode,
    location_or_link: payload?.location_or_link ?? interview.location_or_link,
    interviewer_names: payload?.interviewer_names ?? interview.interviewer_names,
    proposed_slot: payload?.proposed_slot ?? interview.proposed_slot,
    proposed_slot_text: payload?.proposed_slot_text ?? interview.proposed_slot_text,
    reschedule_reason: payload?.reschedule_reason ?? interview.reschedule_reason,
    score: payload?.score ?? interview.score,
    note: payload?.note ?? interview.note,
    version: interview.version + 1,
    updated_at: now,
  };

  logAudit({
    eventId,
    entity: 'interview',
    entityId: interview.id,
    fromState: interview.status,
    toState: toStatus,
    actor,
    reason: reason || payload?.reschedule_reason,
  });

  return { interview: updated, eventId };
}
