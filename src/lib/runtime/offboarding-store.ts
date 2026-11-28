import type {
  ClearanceChecklist,
  ContractType,
  HandoverItem,
  ResignationNoticeCalculation,
  ResignationRequest,
} from '@/mock/types';
import {
  STORAGE_CLEARANCE_CHECKLISTS_KEY,
  STORAGE_HANDOVER_ITEMS_KEY,
  STORAGE_RESIGNATIONS_KEY,
  addDaysIso,
  cloneJson,
  diffDaysIso,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Stage 4: Offboarding, 3-Way Handover, Clearance & Final Settlement
// ---------------------------------------------------------------------------
export function calculateResignationNotice(params: {
  contractType: ContractType;
  submittedDate: string;
  desiredLastDay: string;
}): ResignationNoticeCalculation {
  const minimumNoticeDays =
    params.contractType === 'PROBATION_2M'
      ? 3
      : params.contractType === 'INDEFINITE_TERM'
        ? 45
        : 30;
  const earliestLegalLastDay = addDaysIso(
    params.submittedDate,
    minimumNoticeDays
  );
  const diffFromEarliest = diffDaysIso(
    earliestLegalLastDay,
    params.desiredLastDay
  );
  const meetsLegalNotice = diffFromEarliest >= 0;
  const noticeShortfallDays = meetsLegalNotice ? 0 : Math.abs(diffFromEarliest);
  const approvedLastDay = meetsLegalNotice
    ? params.desiredLastDay
    : earliestLegalLastDay;

  return {
    contract_type: params.contractType,
    submitted_date: params.submittedDate,
    desired_last_day: params.desiredLastDay,
    minimum_notice_days: minimumNoticeDays,
    earliest_legal_last_day: earliestLegalLastDay,
    approved_last_day: approvedLastDay,
    notice_shortfall_days: noticeShortfallDays,
    meets_legal_notice: meetsLegalNotice,
  };
}

const SEED_RESIGNATIONS: ResignationRequest[] = [
  {
    id: 'res-seed-001',
    resignation_code: 'RES-2026-001',
    employee_id: 'emp-010',
    employee_code: 'NV-2025-010',
    full_name: 'Đỗ Thùy Linh',
    department_id: 'dept-sales',
    department_name: 'Khối Kinh doanh',
    position_name: 'Chuyên viên Phát triển Khách hàng Doanh nghiệp',
    role_code: 'EMPLOYEE',
    contract_type: 'FIXED_TERM_12M',
    submitted_date: '2026-11-18',
    desired_last_day: '2026-12-20',
    minimum_notice_days: 30,
    earliest_legal_last_day: '2026-12-18',
    approved_last_day: null,
    notice_shortfall_days: 0,
    reason_category: 'CAREER_GROWTH',
    reason: 'Chuyển hướng học chương trình Thạc sĩ Quản trị Kinh doanh toàn thời gian vào đầu năm 2027, cam kết bàn giao đầy đủ danh mục khách hàng B2B.',
    status: 'PENDING_MANAGER',
    created_at: '2026-11-18T14:20:00+07:00',
  },
];

export function getResignations(
  employeeIdOrCode?: string
): ResignationRequest[] {
  const stored = readStorageArray<ResignationRequest>(STORAGE_RESIGNATIONS_KEY);
  const all = stored ?? cloneJson(SEED_RESIGNATIONS);
  const filtered = employeeIdOrCode
    ? all.filter(
        (r) =>
          r.employee_id === employeeIdOrCode ||
          r.employee_code === employeeIdOrCode
      )
    : all;
  return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function saveResignationInternal(req: ResignationRequest): ResignationRequest {
  const current = getResignations();
  const idx = current.findIndex(
    (r) => r.id === req.id || r.resignation_code === req.resignation_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? req : item))
      : [req, ...current];
  writeStorageArray(STORAGE_RESIGNATIONS_KEY, updated);
  return req;
}

export function getHandoverItems(
  resignationIdOrEmployeeId?: string
): HandoverItem[] {
  const stored =
    readStorageArray<HandoverItem>(STORAGE_HANDOVER_ITEMS_KEY) ?? [];
  if (!resignationIdOrEmployeeId) return stored;
  return stored.filter(
    (h) =>
      h.resignation_id === resignationIdOrEmployeeId ||
      h.employee_id === resignationIdOrEmployeeId ||
      h.employee_code === resignationIdOrEmployeeId
  );
}

export function saveHandoverItemInternal(item: HandoverItem): HandoverItem {
  const current = getHandoverItems();
  const idx = current.findIndex((h) => h.id === item.id);
  const updated =
    idx >= 0
      ? current.map((row, i) => (i === idx ? item : row))
      : [item, ...current];
  writeStorageArray(STORAGE_HANDOVER_ITEMS_KEY, updated);
  return item;
}

export function getClearanceChecklists(
  resignationIdOrEmployeeId?: string
): ClearanceChecklist[] {
  const stored =
    readStorageArray<ClearanceChecklist>(STORAGE_CLEARANCE_CHECKLISTS_KEY) ?? [];
  if (!resignationIdOrEmployeeId) return stored;
  return stored.filter(
    (cl) =>
      cl.resignation_id === resignationIdOrEmployeeId ||
      cl.employee_id === resignationIdOrEmployeeId ||
      cl.employee_code === resignationIdOrEmployeeId
  );
}

export function saveClearanceInternal(cl: ClearanceChecklist): ClearanceChecklist {
  const current = getClearanceChecklists();
  const idx = current.findIndex(
    (item) => item.id === cl.id || item.resignation_id === cl.resignation_id
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? cl : item))
      : [cl, ...current];
  writeStorageArray(STORAGE_CLEARANCE_CHECKLISTS_KEY, updated);
  return cl;
}
