import { formatEventId } from './ids';
import type { Actor, AuditLogEntity } from './types';

export const AUDIT_STORAGE_KEY = 'hrm_audit_logs_v1';
export const HRM_AUDIT_EVENT = 'hrm-audit-updated';

function getStoredLogs(): AuditLogEntity[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditLogEntity[]) : [];
  } catch {
    return [];
  }
}

function saveStoredLogs(logs: AuditLogEntity[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent(HRM_AUDIT_EVENT));
  } catch {
    // Ignore quota errors
  }
}

export function logAudit(params: {
  eventId?: string;
  entity: string;
  entityId: string;
  fromState: string;
  toState: string;
  actor: Actor;
  reason?: string;
}): AuditLogEntity {
  const eventId = params.eventId || formatEventId('aud');
  const now = new Date().toISOString();

  const entry: AuditLogEntity = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    event_id: eventId,
    entity: params.entity,
    entity_id: params.entityId,
    from_state: params.fromState,
    to_state: params.toState,
    actor_id: params.actor.id,
    actor_name: params.actor.name,
    actor_role: params.actor.role,
    reason: params.reason,
    at: now,
  };

  const logs = getStoredLogs();
  // Ensure event_id is unique
  if (!logs.some((l) => l.event_id === eventId)) {
    logs.unshift(entry);
    saveStoredLogs(logs);
  }

  return entry;
}

export function getAuditLogsForEntity(entity: string, entityId: string): AuditLogEntity[] {
  const logs = getStoredLogs();
  return logs.filter((l) => l.entity === entity && l.entity_id === entityId);
}

export function getAllAuditLogs(): AuditLogEntity[] {
  return getStoredLogs();
}
