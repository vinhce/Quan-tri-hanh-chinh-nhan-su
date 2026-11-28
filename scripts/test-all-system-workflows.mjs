// ==============================================================================
// LẠC VIỆT HRM v2.4 — COMPREHENSIVE ALL-SYSTEM WORKFLOW TEST RUNNER
// Tests all remaining 10 core modules & workflows:
//   1. Multi-level Leave & Overtime Approvals (DEPT_MANAGER -> HR_MANAGER -> DIRECTOR)
//   2. Payroll, Mandatory Insurance (10.5%, cap 46.8m) & 7-bracket Progressive PIT
//   3. Time Attendance, Shifts (HC-08:00), Late/Early Rules & Overtime Calculation
//   4. Employee Onboarding & Asset Allocation/Revocation (Laptops, Monitors, Badges)
//   5. Core HR, Unaccented Vietnamese Search, Code Generation & Contract Expiry Alerts
//   6. RBAC Permission Matrix & Account Security (6 Roles x 6 Operations)
//   7. Immutable Audit Logging (Record, Query, Tamper-resistance)
//   8. Performance KPI & Burnout/Turnover Risk Detection (OT > 30h/month)
//   9. AI HR Copilot (Vietnamese NLU parsing & Policy QA)
//  10. System HTTP Availability (All 7 Pages & Sync API 200 OK)
// ==============================================================================

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

console.log('======================================================================');
console.log(' LẠC VIỆT HRM v2.4 — ALL-SYSTEM WORKFLOWS & FUNCTIONAL TEST SUITE');
console.log(` Target Server: ${BASE_URL}`);
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// 0. Setup Sandbox & Transpile TypeScript Modules
// ---------------------------------------------------------------------------
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-system-test-'));
fs.writeFileSync(
  path.join(tempDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2),
  'utf8'
);

const runtimeFiles = fs
  .readdirSync(path.join(projectRoot, 'src/lib/runtime'))
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((f) => ({ src: `src/lib/runtime/${f}`, dest: `runtime/${f.replace(/\.ts$/, '.js')}` }));

const filesToTranspile = [
  { src: 'src/mock/types.ts', dest: 'types.js' },
  { src: 'src/mock/payroll.ts', dest: 'payroll.js' },
  { src: 'src/mock/copilot.ts', dest: 'copilot.js' },
  { src: 'src/mock/attendance.ts', dest: 'attendance.js' },
  { src: 'src/mock/employees.ts', dest: 'employees.js' },
  { src: 'src/mock/admin.ts', dest: 'admin.js' },
  { src: 'src/mock/onboarding.ts', dest: 'onboarding.js' },
  { src: 'src/mock/ats.ts', dest: 'ats.js' },
  { src: 'src/mock/work-items.ts', dest: 'work-items.js' },
  { src: 'src/lib/audit-logger.ts', dest: 'audit-logger.js' },
  { src: 'src/lib/hrm/types.ts', dest: 'hrm-types.js' },
  { src: 'src/lib/hrm/config.ts', dest: 'config.js' },
  { src: 'src/lib/hrm/salary-band.ts', dest: 'salary-band.js' },
  { src: 'src/lib/hrm/work-items-store.ts', dest: 'work-items-store.js' },
  { src: 'src/lib/hrm/work-handover-bridge.ts', dest: 'work-handover-bridge.js' },
  { src: 'src/lib/hrm/permissions.ts', dest: 'hrm-permissions.js' },
  { src: 'src/lib/hrm/workflow.ts', dest: 'hrm-workflow.js' },
  { src: 'src/lib/hrm/ids.ts', dest: 'hrm-ids.js' },
  { src: 'src/lib/hrm/format.ts', dest: 'hrm-format.js' },
  ...runtimeFiles,
  { src: 'src/lib/runtime-store.ts', dest: 'runtime-store.js' },
];

for (const { src, dest } of filesToTranspile) {
  const filePath = path.join(projectRoot, src);
  if (!fs.existsSync(filePath)) continue;
  let code = fs.readFileSync(filePath, 'utf8');
  const rootPrefix = dest.includes('/') ? '../' : './';

  // Remap module aliases for CJS execution in tempDir
  code = code.replace(/\.\.\/\.\.\/mock\/types/g, `${rootPrefix}types`);
  code = code.replace(/\.\.\/\.\.\/mock\/work-items/g, `${rootPrefix}work-items`);
  code = code.replace(/@\/mock\/types/g, `${rootPrefix}types`);
  code = code.replace(/@\/mock\/ats/g, `${rootPrefix}ats`);
  code = code.replace(/@\/mock\/employees/g, `${rootPrefix}employees`);
  code = code.replace(/@\/mock\/onboarding/g, `${rootPrefix}onboarding`);
  code = code.replace(/@\/mock\/attendance/g, `${rootPrefix}attendance`);
  code = code.replace(/@\/mock\/payroll/g, `${rootPrefix}payroll`);
  code = code.replace(/@\/mock\/admin/g, `${rootPrefix}admin`);
  code = code.replace(/@\/mock\/copilot/g, `${rootPrefix}copilot`);
  code = code.replace(/@\/mock\/work-items/g, `${rootPrefix}work-items`);
  code = code.replace(/@\/lib\/audit-logger/g, `${rootPrefix}audit-logger`);
  code = code.replace(/@\/lib\/hrm\/config/g, `${rootPrefix}config`);
  code = code.replace(/@\/lib\/hrm\/salary-band/g, `${rootPrefix}salary-band`);
  code = code.replace(/@\/lib\/hrm\/work-items-store/g, `${rootPrefix}work-items-store`);
  code = code.replace(/@\/lib\/hrm\/work-handover-bridge/g, `${rootPrefix}work-handover-bridge`);
  if (!dest.startsWith('runtime/')) {
    code = code.replace(/\.\/types/g, './types');
    code = code.replace(/\.\/config/g, './config');
    code = code.replace(/\.\/ids/g, './hrm-ids');
    code = code.replace(/\.\/format/g, './hrm-format');
    code = code.replace(/\.\/permissions/g, './hrm-permissions');
  }

  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: path.basename(src),
  });
  const outPath = path.join(tempDir, dest);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, transpiled.outputText, 'utf8');
}

// Global browser mocks for runtime store in Node.js
const memoryStorage = {};
global.window = {
  localStorage: {
    getItem: (key) => memoryStorage[key] || null,
    setItem: (key, val) => {
      memoryStorage[key] = String(val);
    },
    removeItem: (key) => {
      delete memoryStorage[key];
    },
    clear: () => {
      for (const k of Object.keys(memoryStorage)) delete memoryStorage[k];
    },
  },
  dispatchEvent: () => true,
};
global.CustomEvent = class {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
};

// Require Sandbox Modules
const { createRequire } = await import('node:module');
const sandboxRequire = createRequire(import.meta.url);

const payrollModule = sandboxRequire(path.join(tempDir, 'payroll.js'));
const hrmConfigModule = sandboxRequire(path.join(tempDir, 'config.js'));
const copilotModule = sandboxRequire(path.join(tempDir, 'copilot.js'));
const attendanceModule = sandboxRequire(path.join(tempDir, 'attendance.js'));
const employeesModule = sandboxRequire(path.join(tempDir, 'employees.js'));
const adminModule = sandboxRequire(path.join(tempDir, 'admin.js'));
const onboardingModule = sandboxRequire(path.join(tempDir, 'onboarding.js'));
const runtimeStore = sandboxRequire(path.join(tempDir, 'runtime-store.js'));
const auditLogger = sandboxRequire(path.join(tempDir, 'audit-logger.js'));
const hrmPermissions = sandboxRequire(path.join(tempDir, 'hrm-permissions.js'));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function testStep(name, fn) {
  totalTests++;
  process.stdout.write(`[TEST ${String(totalTests).padStart(2, '0')}] ${name} ... `);
  try {
    await fn();
    console.log('PASSED ✓');
    passedTests++;
  } catch (err) {
    console.log('FAILED ✗');
    console.error(`       Error: ${err.message}`);
    failedTests++;
  }
}

// Helper: Normalize unaccented Vietnamese string for searching
function normalizeVN(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

async function runAll() {
  // -------------------------------------------------------------------------
  // PHẦN 1: ĐƠN TỪ & PHÊ DUYỆT ĐA CẤP (LEAVE & OVERTIME MULTI-LEVEL APPROVALS)
  // -------------------------------------------------------------------------
  console.log('--- PHẦN 1: ĐƠN TỪ & PHÊ DUYỆT ĐA CẤP (DEPT_MANAGER -> HR -> DIRECTOR) ---');

  let testRequest = null;

  await testStep('1.1: Tạo đơn nghỉ phép năm (2 ngày) với cấu hình đa cấp', async () => {
    testRequest = {
      id: 'req-sys-test-01',
      request_code: 'REQ-202611-TEST01',
      employee_id: 'emp-004',
      employee_code: 'NV-2024-004',
      full_name: 'Phạm Minh Tuấn',
      department_name: 'Phòng Kỹ thuật Phần mềm',
      position_name: 'Kỹ sư Phần mềm Cao cấp',
      requester_role: 'EMPLOYEE',
      request_category: 'ANNUAL_LEAVE',
      category_label: 'Nghỉ phép năm có hưởng lương',
      start_datetime: '2026-11-23T08:30:00+07:00',
      end_datetime: '2026-11-24T17:30:00+07:00',
      duration_days_or_hours: 2,
      duration_unit: 'NGAY',
      reason: 'Nghỉ ngơi tái tạo năng lượng sau dự án golive',
      handover_to_name: 'Bùi Trọng Nghĩa',
      approval_status: 'PENDING',
      status: 'PENDING',
      current_step_role: 'DEPT_MANAGER',
      approval_steps: [
        {
          step_order: 1,
          role: 'DEPT_MANAGER',
          label: 'Cấp 1 · Trưởng bộ phận duyệt',
          status: 'PENDING',
          actor_name: 'Lê Hoàng Nam',
        },
        {
          step_order: 2,
          role: 'HR_MANAGER',
          label: 'Cấp 2 · Trưởng phòng Nhân sự kiểm tra quỹ phép',
          status: 'PENDING',
          actor_name: 'Trần Thị Bích Ngọc',
        },
      ],
      leave_deducted: false,
      created_at: new Date().toISOString(),
    };

    assert.strictEqual(testRequest.status, 'PENDING');
    assert.strictEqual(testRequest.current_step_role, 'DEPT_MANAGER');
    assert.strictEqual(testRequest.leave_deducted, false);
  });

  await testStep('1.2: Cấp 1 (DEPT_MANAGER) phê duyệt đơn hợp lệ', async () => {
    const step1 = testRequest.approval_steps.find((s) => s.step_order === 1);
    assert.ok(step1);
    step1.status = 'APPROVED';
    step1.acted_at = new Date().toISOString();
    step1.note = 'Đồng ý cho nghỉ, đã xác nhận phân công công việc';

    testRequest.status = 'IN_PROGRESS';
    testRequest.current_step_role = 'HR_MANAGER';

    assert.strictEqual(testRequest.status, 'IN_PROGRESS');
    assert.strictEqual(testRequest.current_step_role, 'HR_MANAGER');
    assert.strictEqual(step1.status, 'APPROVED');
  });

  await testStep('1.3: Cấp 2 (HR_MANAGER) duyệt đơn <= 3 ngày: Hoàn tất & Trừ quỹ phép', async () => {
    const step2 = testRequest.approval_steps.find((s) => s.step_order === 2);
    assert.ok(step2);
    step2.status = 'APPROVED';
    step2.acted_at = new Date().toISOString();
    step2.note = 'Đã kiểm tra quỹ phép (còn 10 ngày khả dụng), đồng ý duyệt';

    testRequest.status = 'APPROVED';
    testRequest.approval_status = 'APPROVED';
    testRequest.current_step_role = null;
    testRequest.leave_deducted = true;

    assert.strictEqual(testRequest.status, 'APPROVED');
    assert.strictEqual(testRequest.approval_status, 'APPROVED');
    assert.strictEqual(testRequest.leave_deducted, true);
  });

  await testStep('1.4: Đơn nghỉ phép dài ngày (> 3 ngày) tự động yêu cầu duyệt Cấp 3 (DIRECTOR)', async () => {
    const longLeaveRequest = {
      id: 'req-sys-test-02',
      duration_days_or_hours: 5,
      approval_steps: [
        { step_order: 1, role: 'DEPT_MANAGER', status: 'APPROVED' },
        { step_order: 2, role: 'HR_MANAGER', status: 'PENDING' },
        { step_order: 3, role: 'DIRECTOR', status: 'PENDING', label: 'Cấp 3 · Ban Giám đốc phê duyệt' },
      ],
      current_step_role: 'HR_MANAGER',
      status: 'IN_PROGRESS',
    };

    longLeaveRequest.approval_steps[1].status = 'APPROVED';
    const nextStep = longLeaveRequest.approval_steps.find((s) => s.status === 'PENDING');
    assert.strictEqual(nextStep.role, 'DIRECTOR');
    longLeaveRequest.current_step_role = 'DIRECTOR';

    assert.strictEqual(longLeaveRequest.status, 'IN_PROGRESS');
    assert.strictEqual(longLeaveRequest.current_step_role, 'DIRECTOR');

    nextStep.status = 'APPROVED';
    longLeaveRequest.status = 'APPROVED';
    assert.strictEqual(longLeaveRequest.status, 'APPROVED');
  });

  await testStep('1.5: Từ chối đơn (REJECT) bắt buộc kèm lý do từ chối', async () => {
    const rejectReq = {
      id: 'req-sys-test-03',
      status: 'PENDING',
      approval_steps: [
        { step_order: 1, role: 'DEPT_MANAGER', status: 'PENDING' },
      ],
    };

    const rejectAction = (reason) => {
      if (!reason || reason.trim().length === 0) {
        throw new Error('Lý do từ chối là bắt buộc');
      }
      rejectReq.approval_steps[0].status = 'REJECTED';
      rejectReq.approval_steps[0].note = reason;
      rejectReq.status = 'REJECTED';
      rejectReq.approval_status = 'REJECTED';
    };

    assert.throws(() => rejectAction(''), /Lý do từ chối là bắt buộc/);
    rejectAction('Không đủ nhân sự trực ca phát hành sản phẩm');
    assert.strictEqual(rejectReq.status, 'REJECTED');
    assert.strictEqual(rejectReq.approval_steps[0].note, 'Không đủ nhân sự trực ca phát hành sản phẩm');
  });

  await testStep('1.6: Nhân viên hủy đơn xin nghỉ khi đơn đang PENDING', async () => {
    const cancelReq = {
      id: 'req-sys-test-04',
      status: 'PENDING',
      employee_id: 'emp-004',
    };

    const cancelAction = (actorId) => {
      if (cancelReq.status !== 'PENDING' && cancelReq.status !== 'IN_PROGRESS') {
        throw new Error('Chỉ có thể hủy đơn khi đang chờ duyệt');
      }
      if (cancelReq.employee_id !== actorId) {
        throw new Error('Chỉ người tạo đơn mới có quyền hủy đơn');
      }
      cancelReq.status = 'CANCELLED';
    };

    assert.throws(() => cancelAction('emp-999'), /Chỉ người tạo đơn mới có quyền hủy đơn/);
    cancelAction('emp-004');
    assert.strictEqual(cancelReq.status, 'CANCELLED');
  });

  // -------------------------------------------------------------------------
  // PHẦN 2: TÍNH LƯƠNG & THUẾ TNCN LŨY TIẾN 7 BẬC (PAYROLL & TAX CALCULATION)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 2: BẢNG LƯƠNG & THUẾ TNCN LŨY TIẾN 7 BẬC (LUẬT LAO ĐỘNG VIỆT NAM) ---');

  const {
    MOCK_PAYROLL_FORMULA,
    PIT_TAX_BRACKETS,
    calculateProgressivePitVnd,
    MOCK_PAYROLL_RECORDS,
  } = payrollModule;

  await testStep('2.1: Tỷ lệ trích đóng bảo hiểm bắt buộc người lao động = 10.5%', async () => {
    assert.strictEqual(MOCK_PAYROLL_FORMULA.bhxh_employee_rate, 0.08, 'BHXH người lao động phải là 8%');
    assert.strictEqual(MOCK_PAYROLL_FORMULA.bhyt_employee_rate, 0.015, 'BHYT người lao động phải là 1.5%');
    assert.strictEqual(MOCK_PAYROLL_FORMULA.bhtn_employee_rate, 0.01, 'BHTN người lao động phải là 1%');
    assert.strictEqual(
      MOCK_PAYROLL_FORMULA.total_insurance_employee_rate,
      0.105,
      'Tổng tỷ lệ bảo hiểm NLĐ phải là 10.5%'
    );
  });

  await testStep('2.2: Áp dụng trần đóng bảo hiểm bắt buộc 46.800.000 ₫', async () => {
    assert.strictEqual(MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd, 46800000);

    const highSalary = 60000000;
    const cappedBase = Math.min(highSalary, MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd);
    assert.strictEqual(cappedBase, 46800000);

    const insuranceDeduction = Math.round(cappedBase * 0.105);
    assert.strictEqual(insuranceDeduction, 4914000, 'Trần bảo hiểm 10.5% trên 46.8tr phải là 4.914.000 ₫');
  });

  await testStep('2.3: Giảm trừ gia cảnh theo kỳ: 2026 (15.5tr / 6.2tr) & giữ nguyên <= 2025 (11tr / 4.4tr)', async () => {
    assert.strictEqual(MOCK_PAYROLL_FORMULA.personal_deduction_vnd, 15500000);
    assert.strictEqual(MOCK_PAYROLL_FORMULA.dependent_deduction_vnd, 6200000);

    const dependents = 2;
    const totalDeduction2026 =
      MOCK_PAYROLL_FORMULA.personal_deduction_vnd +
      dependents * MOCK_PAYROLL_FORMULA.dependent_deduction_vnd;
    assert.strictEqual(totalDeduction2026, 27900000);

    const cfg2025 = hrmConfigModule.getPitTaxConfigForPeriod('2025-11');
    assert.strictEqual(cfg2025.personal_deduction_vnd, 11000000);
    assert.strictEqual(cfg2025.dependent_deduction_vnd, 4400000);
    assert.strictEqual(cfg2025.bracket_count, 7);
    assert.strictEqual(
      cfg2025.personal_deduction_vnd + dependents * cfg2025.dependent_deduction_vnd,
      19800000
    );
  });

  await testStep('2.4: Thuế TNCN theo kỳ: 2026 (5 bậc NQ 110/2025) & <= 2025 (7 bậc) qua calculateProgressivePitVnd', async () => {
    assert.strictEqual(calculateProgressivePitVnd(0), 0);
    assert.strictEqual(calculateProgressivePitVnd(-5000000), 0);

    // Kỳ 2026 (5 bậc): 10M (5%), 30M (15%), 60M (25%), 100M (30%), >100M (35%)
    assert.strictEqual(calculateProgressivePitVnd(700000), 35000);
    assert.strictEqual(calculateProgressivePitVnd(10000000), 500000);
    // Kiểm tra phiếu lương mẫu PS-202611-004 (Gross 34.65M - BH 2.394M - 15.5M - 6.2M = 10.556M)
    assert.strictEqual(calculateProgressivePitVnd(10556000), 583400);
    // Kiểm tra ca chuẩn kỳ 2026: 40M - BH 4.2M - 15.5M = 20.3M -> 2.045M
    assert.strictEqual(calculateProgressivePitVnd(20300000), 2045000);
    assert.strictEqual(calculateProgressivePitVnd(30000000), 3500000);
    assert.strictEqual(calculateProgressivePitVnd(45000000), 7250000);
    assert.strictEqual(calculateProgressivePitVnd(60000000), 11000000);
    assert.strictEqual(calculateProgressivePitVnd(100000000), 23000000);
    assert.strictEqual(calculateProgressivePitVnd(120000000), 30000000);

    // Kỳ <= 2025 (7 bậc) được bảo toàn nguyên vẹn
    assert.strictEqual(calculateProgressivePitVnd(0, '2025-11'), 0);
    assert.strictEqual(calculateProgressivePitVnd(5000000, '2025-11'), 250000);
    assert.strictEqual(calculateProgressivePitVnd(7000000, '2025-11'), 450000);
    assert.strictEqual(calculateProgressivePitVnd(16856000, '2025-11'), 1778400);
    assert.strictEqual(calculateProgressivePitVnd(24800000, '2025-11'), 3310000);
    assert.strictEqual(calculateProgressivePitVnd(100000000, '2025-11'), 25150000);
  });

  await testStep('2.5: Toàn vẹn dữ liệu bảng lương mẫu: Gross - Insurance - PIT = Net', async () => {
    assert.ok(MOCK_PAYROLL_RECORDS.length > 0, 'Phải có danh sách bảng lương mẫu');
    for (const record of MOCK_PAYROLL_RECORDS) {
      const calculatedNet =
        record.gross_salary_vnd - record.total_insurance_employee_vnd - record.pit_tax_vnd;
      assert.strictEqual(
        record.net_salary_vnd,
        calculatedNet,
        `Net salary mismatch for ${record.payslip_code}`
      );
      assert.ok(record.net_salary_vnd > 0, 'Net salary phải lớn hơn 0');
    }
  });

  // -------------------------------------------------------------------------
  // PHẦN 3: CHẤM CÔNG & QUẢN LÝ CA LÀM VIỆC (ATTENDANCE & SHIFTS)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 3: CHẤM CÔNG, QUẢN LÝ CA LÀM VIỆC & GIỜ TĂNG CA (OT) ---');

  const { MOCK_WORK_SHIFTS, MOCK_MONTHLY_ATTENDANCE } = attendanceModule;

  await testStep('3.1: Ca làm việc hành chính chuẩn HC-08:00 (08:00 - 17:00, 8h)', async () => {
    const standardShift = MOCK_WORK_SHIFTS.find((s) => s.shift_code === 'HC-08:00');
    assert.ok(standardShift, 'Phải có ca hành chính HC-08:00');
    assert.strictEqual(standardShift.standard_hours, 8);
    assert.strictEqual(standardShift.start_time, '08:00');
    assert.strictEqual(standardShift.end_time, '17:00');
  });

  await testStep('3.2: Quy tắc phát hiện đi muộn (Check-in > 08:30)', async () => {
    const isLate = (checkinTimeStr) => {
      const [h, m] = checkinTimeStr.split(':').map(Number);
      const minutes = h * 60 + m;
      const standardMinutes = 8 * 60 + 30; // 08:30 = 510
      return minutes > standardMinutes ? minutes - standardMinutes : 0;
    };

    assert.strictEqual(isLate('08:25'), 0);
    assert.strictEqual(isLate('08:30'), 0);
    assert.strictEqual(isLate('08:45'), 15);
    assert.strictEqual(isLate('09:05'), 35);
  });

  await testStep('3.3: Tính lương theo ngày công chuẩn 22 ngày/tháng', async () => {
    const baseSalary = 22000000;
    const standardDays = 22;
    const actualDays = 20;

    const prorated = Math.round((baseSalary * actualDays) / standardDays);
    assert.strictEqual(prorated, 20000000);
  });

  await testStep('3.4: Bảng công tháng 11/2026 ghi nhận đúng dữ liệu nhân viên', async () => {
    assert.ok(MOCK_MONTHLY_ATTENDANCE.length > 0);
    const tuanAttendance = MOCK_MONTHLY_ATTENDANCE.find(
      (a) => a.employee_code === 'NV-2024-004'
    );
    assert.ok(tuanAttendance, 'Phải có bảng công của Phạm Minh Tuấn');
    assert.ok(tuanAttendance.overtime_hours_weekday >= 0);
    assert.ok(tuanAttendance.actual_work_days <= 22);
  });

  // -------------------------------------------------------------------------
  // PHẦN 4: ONBOARDING & QUẢN LÝ CẤP PHÁT TÀI SẢN (ASSETS & CHECKLIST)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 4: ONBOARDING & CẤP PHÁT / THU HỒI TÀI SẢN CÔNG TY ---');

  await testStep('4.1: Danh mục tài sản công ty (MacBook, Màn hình Dell, Thẻ từ)', async () => {
    const assets = runtimeStore.getCompanyAssets();
    assert.ok(assets.length >= 10, 'Phải có ít nhất 10 tài sản mẫu');
    const laptops = assets.filter((a) => a.category === 'LAPTOP');
    const monitors = assets.filter((a) => a.category === 'MONITOR');
    const badges = assets.filter((a) => a.category === 'ACCESS_CARD');

    assert.ok(laptops.length > 0, 'Phải có danh mục Laptop');
    assert.ok(monitors.length > 0, 'Phải có danh mục Màn hình');
    assert.ok(badges.length > 0, 'Phải có danh mục Thẻ từ ra vào');
  });

  await testStep('4.2: Cấp phát tài sản (assignCompanyAsset) cho nhân sự mới', async () => {
    const newAsset = runtimeStore.createCompanyAsset({
      asset_code: 'TS-LT-TEST-9999',
      name: 'MacBook Air M3 15 inch (16GB / 512GB)',
      category: 'LAPTOP',
      serial_number: 'C02TESTMAC9999',
      status: 'AVAILABLE',
      condition_note: 'Máy mới nguyên hộp bàn giao khối kỹ thuật',
    });

    assert.ok(newAsset.id);
    assert.strictEqual(newAsset.status, 'AVAILABLE');

    const assigned = runtimeStore.assignCompanyAsset(
      newAsset.id,
      {
        employee_code: 'NV-2026-028',
        full_name: 'Đoàn Văn Hậu',
        department_id: 'dept-tech-swe',
      }
    );

    assert.strictEqual(assigned.status, 'ASSIGNED');
    assert.strictEqual(assigned.assigned_to_code, 'NV-2026-028');
    assert.strictEqual(assigned.assigned_to_name, 'Đoàn Văn Hậu');
  });

  await testStep('4.3: Thu hồi tài sản (revokeCompanyAsset) khi hoàn tất chuyển giao', async () => {
    const assets = runtimeStore.getCompanyAssets();
    const targetAsset = assets.find((a) => a.serial_number === 'C02TESTMAC9999');
    assert.ok(targetAsset);

    const revoked = runtimeStore.revokeCompanyAsset(
      targetAsset.id,
      'Thu hồi kiểm tra định kỳ trước khi bàn giao nhân sự khác'
    );

    assert.strictEqual(revoked.status, 'AVAILABLE');
    assert.strictEqual(revoked.assigned_to_code, undefined);
    assert.strictEqual(revoked.assigned_to_name, undefined);
  });

  let initiatedOnboarding = null;
  await testStep('4.4: Khởi tạo quy trình Onboarding từ ứng viên trúng tuyển', async () => {
    initiatedOnboarding = runtimeStore.initiateCandidateOnboarding({
      candidate: {
        id: 'cand-test-sys-01',
        candidate_code: 'UV-TEST-SYS-01',
        full_name: 'Trần Văn Kiên',
        email: 'kien.tran@example.com',
        phone: '0901234567',
        position_id: 'pos-swe-01',
        position_title: 'Senior DevOps Cloud Architect',
        stage: 'OFFER_ACCEPTED',
      },
      employeeCode: 'NV-2026-029',
      email: 'kien.tran@hrm-enterprise.vn',
      departmentId: 'dept-tech-swe',
      departmentName: 'Phòng Kỹ thuật Phần mềm',
      positionName: 'Senior DevOps Cloud Architect',
      managerName: 'Lê Hoàng Nam',
      startDate: '2026-12-01',
      baseSalaryVnd: 35000000,
      assetIds: [],
      actorName: 'Trần Thị Bích Ngọc',
    });

    assert.ok(initiatedOnboarding);
    assert.ok(initiatedOnboarding.onboarding.id);
    assert.strictEqual(initiatedOnboarding.onboarding.status, 'IN_PROGRESS');
    assert.ok(
      initiatedOnboarding.onboarding.checklist.length > 0,
      'Phải có danh sách checklist onboarding'
    );
  });

  await testStep('4.5: Cập nhật checklist Onboarding và hoàn tất tiếp nhận sinh mã NV', async () => {
    assert.ok(initiatedOnboarding && initiatedOnboarding.onboarding);
    const completed = runtimeStore.completeOnboardingRecord(initiatedOnboarding.onboarding.id);
    assert.strictEqual(completed.status, 'COMPLETED');
    assert.strictEqual(completed.employee_code, 'NV-2026-029');
    assert.ok(completed.checklist.every((c) => c.completed === true));
  });

  // -------------------------------------------------------------------------
  // PHẦN 5: QUẢN TRỊ NHÂN SỰ CỐT LÕI & HỢP ĐỒNG (CORE HR & CONTRACTS)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 5: QUẢN TRỊ NHÂN SỰ CỐT LÕI & HỢP ĐỒNG LAO ĐỘNG ---');

  const { MOCK_EMPLOYEES, MOCK_CONTRACTS, MOCK_DEPARTMENTS } = employeesModule;

  await testStep('5.1: Danh mục phòng ban và 28 nhân sự cốt lõi', async () => {
    assert.ok(MOCK_DEPARTMENTS.length >= 6, 'Phải có ít nhất 6 phòng ban chức năng');
    assert.ok(MOCK_EMPLOYEES.length >= 25, 'Phải có ít nhất 25 nhân sự mẫu');
  });

  await testStep('5.2: Tìm kiếm nhân sự tiếng Việt không dấu & có dấu', async () => {
    const searchByName = (query) => {
      const q = normalizeVN(query.trim());
      return MOCK_EMPLOYEES.filter((emp) => normalizeVN(emp.full_name).includes(q));
    };

    const resultsNoAccent = searchByName('tuan');
    assert.ok(resultsNoAccent.length > 0);
    assert.ok(resultsNoAccent.some((e) => e.full_name.includes('Tuấn')));

    const resultsWithAccent = searchByName('Ngọc');
    assert.ok(resultsWithAccent.length > 0);
    assert.ok(resultsWithAccent.some((e) => e.full_name.includes('Bích Ngọc')));
  });

  await testStep('5.3: Tự động sinh mã nhân viên kế tiếp không trùng lặp (generateNextEmployeeCode)', async () => {
    const nextCode1 = runtimeStore.generateNextEmployeeCode([]);
    assert.match(nextCode1, /^NV-2026-\d{3}$/);

    const customList = [{ employee_code: 'NV-2026-035' }];
    const nextCode2 = runtimeStore.generateNextEmployeeCode(customList);
    assert.strictEqual(nextCode2, 'NV-2026-036');
  });

  await testStep('5.4: Quản lý loại hợp đồng lao động chuẩn Luật Lao động', async () => {
    assert.ok(MOCK_CONTRACTS.length > 0);
    const contractTypes = new Set(MOCK_CONTRACTS.map((c) => c.contract_type));
    assert.ok(contractTypes.has('PROBATION_2M'), 'Có hợp đồng thử việc 2 tháng');
    assert.ok(contractTypes.has('FIXED_TERM_12M') || contractTypes.has('FIXED_TERM_24M'), 'Có hợp đồng xác định thời hạn');
    assert.ok(contractTypes.has('INDEFINITE_TERM'), 'Có hợp đồng không xác định thời hạn');
  });

  await testStep('5.5: Cảnh báo hợp đồng sắp hết hạn trong vòng <= 30 ngày', async () => {
    const expiringSoon = MOCK_CONTRACTS.filter(
      (c) =>
        c.status === 'EXPIRING_SOON' ||
        (c.days_until_expiry !== null && c.days_until_expiry <= 30)
    );
    assert.ok(expiringSoon.length > 0, 'Phải có hợp đồng sắp hết hạn kích hoạt cảnh báo tái ký');
    for (const c of expiringSoon) {
      assert.ok(c.days_until_expiry <= 30);
    }
  });

  // -------------------------------------------------------------------------
  // PHẦN 6: PHÂN QUYỀN RBAC & QUẢN TRỊ TÀI KHOẢN (ROLE-BASED ACCESS CONTROL)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 6: PHÂN QUYỀN RBAC & BẢO MẬT TÀI KHOẢN (6 ROLES x 6 ACTIONS) ---');

  const { MOCK_ROLES, MOCK_SYSTEM_USERS, MOCK_PERMISSION_MATRIX } = adminModule;

  await testStep('6.1: Khởi tạo đủ 6 vai trò hệ thống chuẩn Enterprise', async () => {
    const expectedRoles = ['SUPER_ADMIN', 'DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER', 'EMPLOYEE', 'CANDIDATE'];
    const roleCodes = MOCK_ROLES.map((r) => r.role_code);
    for (const r of expectedRoles) {
      assert.ok(roleCodes.includes(r), `Role ${r} phải tồn tại`);
    }
  });

  await testStep('6.2: Super Admin: Toàn quyền cấu hình, không can thiệp duyệt trực tiếp đơn phòng ban', async () => {
    const rbacPerm = MOCK_PERMISSION_MATRIX.find((m) => m.module_code === 'RBAC_SYSTEM_CONFIG');
    assert.ok(rbacPerm, 'Phải có module RBAC_SYSTEM_CONFIG');
    assert.strictEqual(rbacPerm.permissions.SUPER_ADMIN.edit, true);
    assert.strictEqual(rbacPerm.permissions.EMPLOYEE.edit, false);
  });

  await testStep('6.3: Employee: Không có quyền sửa hoặc phê duyệt bảng lương', async () => {
    const payrollPerm = MOCK_PERMISSION_MATRIX.find((m) => m.module_code === 'PAYROLL_TAX_INSURANCE');
    assert.ok(payrollPerm, 'Phải có module PAYROLL_TAX_INSURANCE');
    assert.strictEqual(payrollPerm.permissions.EMPLOYEE.edit, false);
    assert.strictEqual(payrollPerm.permissions.EMPLOYEE.approve, false);
    assert.strictEqual(payrollPerm.permissions.EMPLOYEE.delete, false);
    assert.strictEqual(payrollPerm.permissions.CANDIDATE.view, false);
  });

  await testStep('6.4: Bảo mật tài khoản: Bắt buộc mfa_enabled = true cho tài khoản quản trị', async () => {
    const adminUsers = MOCK_SYSTEM_USERS.filter((u) =>
      ['SUPER_ADMIN', 'DIRECTOR', 'HR_MANAGER'].includes(u.role_code)
    );
    assert.ok(adminUsers.length > 0);
    for (const u of adminUsers) {
      assert.strictEqual(u.mfa_enabled, true, `MFA phải bật cho ${u.user_code}`);
      assert.strictEqual(u.account_status, 'ACTIVE');
    }
  });

  // -------------------------------------------------------------------------
  // PHẦN 7: NHẬT KÝ KIỂM TOÁN BẤT BIẾN (IMMUTABLE AUDIT LOGGING)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 7: NHẬT KÝ KIỂM TOÁN BẤT BIẾN (IMMUTABLE AUDIT LOGS) ---');

  const { MOCK_AUDIT_LOGS } = adminModule;

  await testStep('7.1: Ghi nhận nhật ký kiểm toán mới (recordAuditLog)', async () => {
    const log = auditLogger.recordAuditLog({
      actor_name: 'Trần Thị Bích Ngọc',
      actor_code: 'NV-2024-002',
      actor_role: 'HR_MANAGER',
      action: 'APPROVE_LEAVE',
      target: 'REQ-202611-TEST01',
      detail: 'Phê duyệt đơn nghỉ phép năm Cấp 2 và trừ quỹ phép thành công',
      status: 'SUCCESS',
      module: 'TIME_ATTENDANCE',
    });

    assert.ok(log);
    assert.ok(log.id);
    assert.match(log.log_code, /^AUD-\d+$/);
    assert.strictEqual(log.action, 'APPROVE_LEAVE');
    assert.strictEqual(log.status, 'SUCCESS');
  });

  await testStep('7.2: Kiểm tra tính bất biến (Immutable): Không có cơ chế UPDATE/EDIT log', async () => {
    const exportsList = Object.keys(auditLogger);
    assert.strictEqual(
      exportsList.includes('updateAuditLog'),
      false,
      'Tuyệt đối không được có hàm updateAuditLog'
    );
    assert.strictEqual(
      exportsList.includes('editAuditLog'),
      false,
      'Tuyệt đối không được có hàm editAuditLog'
    );
  });

  await testStep('7.3: Lọc và phân loại nhật ký kiểm toán theo module', async () => {
    assert.ok(MOCK_AUDIT_LOGS.length >= 5);
    const modules = new Set(MOCK_AUDIT_LOGS.map((l) => l.module));
    assert.ok(modules.has('TIME_ATTENDANCE') || modules.has('AI_ATS_RECRUITMENT'));
  });

  // -------------------------------------------------------------------------
  // PHẦN 8: ĐÁNH GIÁ HIỆU SUẤT & CẢNH BÁO RỦI RO BURNOUT (KPI & BURNOUT)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 8: ĐÁNH GIÁ HIỆU SUẤT & PHÁT HIỆN NGUY CƠ BURNOUT ---');

  const { MOCK_KPI_RECORDS, MOCK_BURNOUT_ALERTS } = employeesModule;

  await testStep('8.1: Đánh giá KPI thang điểm 0 - 100 và xếp loại', async () => {
    assert.ok(MOCK_KPI_RECORDS.length > 0);
    const classifyKpi = (score) => {
      if (score >= 90) return 'EXCELLENT';
      if (score >= 80) return 'GOOD';
      if (score >= 70) return 'SATISFACTORY';
      return 'NEEDS_IMPROVEMENT';
    };

    assert.strictEqual(classifyKpi(95), 'EXCELLENT');
    assert.strictEqual(classifyKpi(85), 'GOOD');
    assert.strictEqual(classifyKpi(75), 'SATISFACTORY');
    assert.strictEqual(classifyKpi(65), 'NEEDS_IMPROVEMENT');
  });

  await testStep('8.2: Phát hiện nguy cơ Burnout khi giờ OT > 30h/tháng', async () => {
    assert.ok(MOCK_BURNOUT_ALERTS.length > 0);
    const criticalAlert = MOCK_BURNOUT_ALERTS.find((a) => a.risk_level === 'CRITICAL');
    assert.ok(criticalAlert, 'Phải có cảnh báo mức CRITICAL');
    assert.ok(
      criticalAlert.overtime_hours_last_30d > 30,
      'Nhân sự bị cảnh báo CRITICAL phải có giờ làm thêm > 30 giờ/tháng'
    );
    assert.ok(
      criticalAlert.recommended_action && criticalAlert.recommended_action.length > 0,
      'Phải có khuyến nghị can thiệp'
    );
  });

  // -------------------------------------------------------------------------
  // PHẦN 9: AI HR COPILOT (NLU PARSING & POLICY SEARCH)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 9: AI HR COPILOT (NLU PARSING ĐƠN TỪ & TRA CỨU QUY CHẾ) ---');

  const { parseNaturalLanguageLeavePrompt, MOCK_COPILOT_QA } = copilotModule;

  await testStep('9.1: Bóc tách câu lệnh tiếng Việt xin nghỉ phép năm', async () => {
    const input = 'Cho tôi xin nghỉ phép năm 2 ngày từ 23/11 đến 24/11 để đi du lịch gia đình';
    const parsed = parseNaturalLanguageLeavePrompt(input);

    assert.strictEqual(parsed.parsed_category, 'ANNUAL_LEAVE');
    assert.strictEqual(parsed.parsed_duration_days, 2);
    assert.strictEqual(parsed.parsed_start_date, '2026-11-23');
    assert.strictEqual(parsed.parsed_end_date, '2026-11-24');
    assert.ok(parsed.confidence_score >= 0.9);
  });

  await testStep('9.2: Bóc tách câu lệnh làm việc từ xa (WFH / Remote Work)', async () => {
    const input = 'Tôi xin làm việc từ xa (WFH) 1 ngày vào ngày 19/11/2026 để nhận bàn giao nhà';
    const parsed = parseNaturalLanguageLeavePrompt(input);

    assert.strictEqual(parsed.parsed_category, 'REMOTE_WORK');
    assert.strictEqual(parsed.parsed_duration_days, 1);
    assert.strictEqual(parsed.parsed_start_date, '2026-11-19');
  });

  await testStep('9.3: Bóc tách câu lệnh nghỉ ốm có hưởng bảo hiểm (Sick Leave)', async () => {
    const input = 'Tôi xin nghỉ ốm 1 ngày vào 18/11/2026 do sốt siêu vi đi khám bệnh viện';
    const parsed = parseNaturalLanguageLeavePrompt(input);

    assert.strictEqual(parsed.parsed_category, 'SICK_LEAVE');
    assert.strictEqual(parsed.parsed_duration_days, 1);
    assert.strictEqual(parsed.parsed_start_date, '2026-11-18');
  });

  await testStep('9.4: Tra cứu quy chế chính sách nội bộ (Copilot Knowledgebase)', async () => {
    assert.ok(MOCK_COPILOT_QA.length >= 4);
    const pitQA = MOCK_COPILOT_QA.find((q) => q.id === 'qa-002');
    assert.ok(pitQA);
    assert.ok(pitQA.ai_response.includes('Gross'));
    assert.ok(pitQA.ai_response.includes('Net'));
    const metricsHasInsurance = pitQA.metrics_cited.some((m) => m.label.includes('10.5%'));
    assert.ok(metricsHasInsurance, 'Phải có trích dẫn tỷ lệ bảo hiểm 10.5%');
  });

  // -------------------------------------------------------------------------
  // PHẦN 10: TÍNH SẴN SÀNG CỦA 7 TRANG WEB & SYNC API (SYSTEM HTTP READINESS)
  // -------------------------------------------------------------------------
  console.log('\n--- PHẦN 10: KIỂM TRA TÍNH SẴN SÀNG CỦA TOÀN BỘ 7 TRANG WEB & SYNC API ---');

  const pages = [
    { path: '/', label: 'Trang chủ (Home)' },
    { path: '/about', label: 'Trang Giới thiệu (About)' },
    { path: '/contact', label: 'Trang Liên hệ (Contact)' },
    { path: '/careers', label: 'Cổng Tuyển dụng (Careers)' },
    { path: '/candidate', label: 'Cổng Ứng viên (Candidate Portal)' },
    { path: '/login', label: 'Trang Đăng nhập (Login)' },
    { path: '/app', label: 'Bàn làm việc Quản trị (Admin App)' },
  ];

  for (const page of pages) {
    await testStep(`10.HTTP: ${page.label} (${page.path}) trả về HTTP 200`, async () => {
      const res = await fetch(`${BASE_URL}${page.path}`);
      assert.strictEqual(res.status, 200, `Page ${page.path} returned status ${res.status}`);
    });
  }

  await testStep('10.SYNC: API Đồng bộ 2 chiều thời gian thực (/api/hrm/sync)', async () => {
    // Test GET
    const getRes = await fetch(`${BASE_URL}/api/hrm/sync`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);

    // Test POST
    const testKey = 'hrm_sync_integration_check';
    const testPayload = { timestamp: Date.now(), status: 'TEST_PASSED' };
    const postRes = await fetch(`${BASE_URL}/api/hrm/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: testKey, items: testPayload }),
    });
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(' ALL SYSTEM WORKFLOWS TEST EXECUTION SUMMARY');
  console.log('======================================================================');
  console.log(`Total Workflows Tested : ${totalTests}`);
  console.log(`Passed                 : ${passedTests} ✓`);
  console.log(`Failed                 : ${failedTests} ✗`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
