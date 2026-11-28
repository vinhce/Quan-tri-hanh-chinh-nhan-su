import type {
  CareerHistoryEntry,
  PerformanceReview,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getAllRuntimeEmployees,
  saveRuntimeEmployee,
} from './core-entities';
import {
  STORAGE_CAREER_HISTORIES_KEY,
  STORAGE_PERFORMANCE_REVIEWS_KEY,
  cloneJson,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Stage 3: Multi-Cycle Performance Reviews & Immutable Career Progression
// ---------------------------------------------------------------------------
const SEED_PERFORMANCE_REVIEWS: PerformanceReview[] = [
  {
    id: 'prv-001',
    review_code: 'PRV-2026-001',
    employee_id: 'emp-011',
    employee_code: 'NV-2026-011',
    full_name: 'Trương Gia Huy',
    department_id: 'dept-tech-data',
    department_name: 'Phòng Dữ liệu & AI',
    position_name: 'Kỹ sư Dữ liệu (Data Engineer)',
    cycle: 'PROBATION',
    period_label: 'Thử việc 60 ngày (10-11/2026)',
    kpi_score: 90,
    okr_completion_percent: 92,
    grade: 'A',
    result: 'PASS',
    reviewer_id: 'emp-005',
    reviewer_name: 'Vũ Thị Mai Phương',
    goals_summary: 'Xây dựng pipeline ETL đồng bộ dữ liệu nhân sự & tối ưu truy vấn báo cáo.',
    strengths: 'Chủ động nắm bắt kiến trúc hệ thống nhanh, chất lượng mã nguồn sạch.',
    improvements: 'Tăng cường viết tài liệu đặc tả luồng dữ liệu cho thành viên mới.',
    review_note:
      'Đạt 90% mục tiêu thử việc 60 ngày, đề xuất chuyển ký HĐLĐ chính thức 12 tháng hưởng 100% lương từ 01/12/2026.',
    suggested_salary_vnd: 21400000,
    suggested_bonus_vnd: 0,
    status: 'APPROVED',
    reviewed_at: '2026-11-18T10:30:00+07:00',
  },
  {
    id: 'prv-002',
    review_code: 'PRV-2026-002',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_id: 'dept-tech-swe',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_name: 'Kỹ sư Phần mềm Cao cấp (Senior Fullstack)',
    cycle: 'QUARTERLY',
    period_label: '2026-Q3',
    kpi_score: 91,
    okr_completion_percent: 94,
    grade: 'A',
    result: 'EXCELLENT',
    reviewer_id: 'emp-003',
    reviewer_name: 'Lê Hoàng Nam',
    review_note:
      'Đảm bảo uptime dịch vụ thanh toán đạt 99.96%, dẫn dắt kỹ thuật nhóm core hiệu quả.',
    suggested_salary_vnd: 26500000,
    suggested_bonus_vnd: 2500000,
    status: 'APPROVED',
    reviewed_at: '2026-10-05T14:00:00+07:00',
  },
  {
    id: 'prv-003',
    review_code: 'PRV-2026-003',
    employee_id: 'emp-005',
    employee_code: 'NV-2024-005',
    full_name: 'Vũ Thị Mai Phương',
    department_id: 'dept-tech-data',
    department_name: 'Phòng Dữ liệu & AI',
    position_name: 'Trưởng nhóm Kỹ thuật Dữ liệu & AI',
    cycle: 'QUARTERLY',
    period_label: '2026-Q3',
    kpi_score: 96,
    okr_completion_percent: 98,
    grade: 'A+',
    result: 'EXCELLENT',
    reviewer_id: 'emp-003',
    reviewer_name: 'Lê Hoàng Nam',
    review_note:
      'Đưa pipeline sàng lọc hồ sơ ứng viên AI ATS vào vận hành, giảm 60% thời gian đọc CV thủ công.',
    suggested_bonus_vnd: 4000000,
    status: 'APPROVED',
    reviewed_at: '2026-10-06T09:15:00+07:00',
  },
  {
    id: 'prv-004',
    review_code: 'PRV-2026-004',
    employee_id: 'emp-008',
    employee_code: 'NV-2025-008',
    full_name: 'Ngô Thanh Hà',
    department_id: 'dept-hr',
    department_name: 'Phòng Nhân sự & Hành chính',
    position_name: 'Chuyên viên Tiền lương & Phúc lợi (C&B)',
    cycle: 'QUARTERLY',
    period_label: '2026-Q3',
    kpi_score: 89,
    okr_completion_percent: 90,
    grade: 'B+',
    result: 'GOOD',
    reviewer_id: 'emp-002',
    reviewer_name: 'Trần Thị Bích Ngọc',
    review_note:
      'Tính lương và đối soát thuế TNCN chính xác 100% cho toàn công ty trong 3 tháng liên tiếp.',
    suggested_bonus_vnd: 1500000,
    status: 'APPROVED',
    reviewed_at: '2026-10-07T11:00:00+07:00',
  },
  {
    id: 'prv-005',
    review_code: 'PRV-2026-005',
    employee_id: 'emp-024',
    employee_code: 'NV-2026-024',
    full_name: 'Trịnh Khánh Vân',
    department_id: 'dept-sales',
    department_name: 'Khối Kinh doanh',
    position_name: 'Chuyên viên Phát triển Khách hàng Doanh nghiệp',
    cycle: 'ANNUAL',
    period_label: '2026',
    kpi_score: 96,
    okr_completion_percent: 97,
    grade: 'A+',
    result: 'EXCELLENT',
    reviewer_id: 'emp-007',
    reviewer_name: 'Hoàng Minh Đức',
    review_note:
      'Đạt 112% chỉ tiêu doanh thu khách hàng B2B năm 2026, đủ tiêu chuẩn xét bổ nhiệm Trưởng nhóm Kinh doanh.',
    suggested_salary_vnd: 20500000,
    suggested_bonus_vnd: 5000000,
    status: 'APPROVED',
    reviewed_at: '2026-11-15T16:20:00+07:00',
  },
];

export function getPerformanceReviews(
  employeeIdOrCode?: string
): PerformanceReview[] {
  const stored = readStorageArray<PerformanceReview>(
    STORAGE_PERFORMANCE_REVIEWS_KEY
  );
  const all = stored ?? cloneJson(SEED_PERFORMANCE_REVIEWS);
  const filtered = employeeIdOrCode
    ? all.filter(
        (r) =>
          r.employee_id === employeeIdOrCode ||
          r.employee_code === employeeIdOrCode
      )
    : all;
  return filtered.sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));
}

export function savePerformanceReview(
  input: Omit<PerformanceReview, 'id' | 'review_code' | 'reviewed_at'> & {
    id?: string;
    review_code?: string;
    reviewed_at?: string;
  }
): PerformanceReview {
  const current = getPerformanceReviews();
  const nowIso = input.reviewed_at ?? new Date().toISOString();
  const existingIdx = input.id
    ? current.findIndex((r) => r.id === input.id)
    : current.findIndex(
        (r) =>
          r.employee_code === input.employee_code &&
          r.cycle === input.cycle &&
          r.period_label === input.period_label
      );

  const saved: PerformanceReview = {
    ...input,
    id:
      input.id ??
      (existingIdx >= 0 ? current[existingIdx].id : `prv-rt-${Date.now()}`),
    review_code:
      input.review_code ??
      (existingIdx >= 0
        ? current[existingIdx].review_code
        : `PRV-2026-${String(current.length + 1).padStart(3, '0')}`),
    reviewed_at: nowIso,
  };

  const nextList =
    existingIdx >= 0
      ? current.map((item, i) => (i === existingIdx ? saved : item))
      : [saved, ...current];
  writeStorageArray(STORAGE_PERFORMANCE_REVIEWS_KEY, nextList);

  if (saved.status === 'APPROVED') {
    const emp = getAllRuntimeEmployees().find(
      (e) =>
        e.id === saved.employee_id || e.employee_code === saved.employee_code
    );
    if (emp) {
      saveRuntimeEmployee({
        ...emp,
        kpi_completion_rate: saved.kpi_score,
      });
    }
  }

  recordAuditLog({
    actor_name: saved.reviewer_name,
    actor_code: saved.reviewer_id,
    actor_role: 'DEPT_MANAGER',
    action: 'PERFORMANCE_REVIEW',
    target: `${saved.employee_code} · ${saved.period_label}`,
    detail: `Ghi nhận kết quả đánh giá ${saved.cycle} (${saved.kpi_score} điểm, xếp loại ${saved.grade}, kết luận ${saved.result}).`,
  });

  return saved;
}

const SEED_CAREER_HISTORIES: CareerHistoryEntry[] = [
  {
    id: 'ch-seed-001',
    decision_no: 'QĐ-2025-042/LV-NS',
    employee_id: 'emp-005',
    employee_code: 'NV-2024-005',
    full_name: 'Vũ Thị Mai Phương',
    change_type: 'PROMOTION',
    old_department_id: 'dept-tech-data',
    old_department_name: 'Phòng Dữ liệu & AI',
    new_department_id: 'dept-tech-data',
    new_department_name: 'Phòng Dữ liệu & AI',
    old_position_id: 'pos-04',
    old_position_name: 'Kỹ sư Dữ liệu Cao cấp (Senior Data Engineer)',
    new_position_id: 'pos-05',
    new_position_name: 'Trưởng nhóm Kỹ thuật Dữ liệu & AI',
    old_salary_vnd: 25000000,
    new_salary_vnd: 31500000,
    old_role_code: 'EMPLOYEE',
    new_role_code: 'DEPT_MANAGER',
    effective_date: '2025-04-01',
    reason: 'Bổ nhiệm Trưởng nhóm phụ trách Phòng Dữ liệu & AI nhờ thành tích triển khai nền tảng AI nội bộ.',
    signed_by_name: 'Trần Quốc Việt',
    addendum_contract_number: 'PLHD-2025-005',
    created_at: '2025-03-28T10:00:00+07:00',
  },
  {
    id: 'ch-seed-002',
    decision_no: 'QĐ-2025-108/LV-NS',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    change_type: 'SALARY_ADJUSTMENT',
    old_department_id: 'dept-tech-swe',
    old_department_name: 'Phòng Kỹ thuật Phần mềm',
    new_department_id: 'dept-tech-swe',
    new_department_name: 'Phòng Kỹ thuật Phần mềm',
    old_position_id: 'pos-04',
    old_position_name: 'Kỹ sư Phần mềm Fullstack',
    new_position_id: 'pos-04',
    new_position_name: 'Kỹ sư Phần mềm Cao cấp (Senior Fullstack)',
    old_salary_vnd: 18500000,
    new_salary_vnd: 22800000,
    old_role_code: 'EMPLOYEE',
    new_role_code: 'EMPLOYEE',
    effective_date: '2025-09-01',
    reason: 'Nâng bậc Senior và điều chỉnh lương định kỳ sau 2 kỳ KPI liên tiếp đạt hạng A.',
    signed_by_name: 'Trần Thị Bích Ngọc',
    addendum_contract_number: 'PLHD-2025-004',
    created_at: '2025-08-29T15:30:00+07:00',
  },
  {
    id: 'ch-seed-003',
    decision_no: 'QĐ-2026-061/LV-NS',
    employee_id: 'emp-019',
    employee_code: 'NV-2026-019',
    full_name: 'Mai Phương Thảo',
    change_type: 'PROBATION_TO_OFFICIAL',
    old_department_id: 'dept-hr',
    old_department_name: 'Phòng Nhân sự & Hành chính',
    new_department_id: 'dept-hr',
    new_department_name: 'Phòng Nhân sự & Hành chính',
    old_position_id: 'pos-08',
    old_position_name: 'Chuyên viên Quan hệ Lao động (Thử việc)',
    new_position_id: 'pos-08',
    new_position_name: 'Chuyên viên Quan hệ Lao động & Văn hóa Nội bộ',
    old_salary_vnd: 11730000,
    new_salary_vnd: 13800000,
    old_role_code: 'EMPLOYEE',
    new_role_code: 'EMPLOYEE',
    effective_date: '2026-08-01',
    reason: 'Hoàn thành xuất sắc 02 tháng thử việc, ký hợp đồng chính thức hưởng 100% lương.',
    signed_by_name: 'Trần Thị Bích Ngọc',
    addendum_contract_number: 'HDLD-2026-019',
    created_at: '2026-07-30T11:00:00+07:00',
  },
];

export function getCareerHistories(
  employeeIdOrCode?: string
): CareerHistoryEntry[] {
  const stored = readStorageArray<CareerHistoryEntry>(
    STORAGE_CAREER_HISTORIES_KEY
  );
  const all = stored ?? cloneJson(SEED_CAREER_HISTORIES);
  const filtered = employeeIdOrCode
    ? all.filter(
        (h) =>
          h.employee_id === employeeIdOrCode ||
          h.employee_code === employeeIdOrCode
      )
    : all;
  return filtered.sort(
    (a, b) =>
      b.effective_date.localeCompare(a.effective_date) ||
      b.created_at.localeCompare(a.created_at)
  );
}

export function appendCareerHistoryEntryInternal(
  entry: CareerHistoryEntry
): CareerHistoryEntry {
  // Immutable append-only store: NEVER overwrites or deletes historical entries
  const existing = getCareerHistories();
  writeStorageArray(STORAGE_CAREER_HISTORIES_KEY, [entry, ...existing]);
  return entry;
}
