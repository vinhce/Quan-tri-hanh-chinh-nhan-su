// ==============================================================================
// LẠC VIỆT HRM v2.4 — END-TO-END 4-STAGE EMPLOYEE LIFECYCLE TEST RUNNER
// Covers:
//   0. SQL Migration 002 Schema, Idempotent ALTER TABLE, HRM Config/IDs & RBAC
//   1. Stage 1: Pre-boarding -> Login Block -> 4-Dept Tasks -> PASS -> OFFICIAL
//   2. Stage 2: Punch/Import -> MISSING_PUNCH -> Explanation -> Leave/OT -> Payroll
//   3. Stage 3: Performance Review -> Immutable Career History -> Mid-month Split
//   4. Stage 4: Notice (3/30/45d) -> Manager Re-assign -> 3-Way Handover ->
//               Asset Penalty -> 100% Hard Gate -> Final Settlement -> RESIGNED
//   5. Lifecycle API Route (/api/hrm/lifecycle) GET/POST Contract Verification
// ==============================================================================

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('======================================================================');
console.log(' LẠC VIỆT HRM v2.4 — 4-STAGE EMPLOYEE LIFECYCLE E2E TEST SUITE');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// 0. Setup Isolated Temp CJS Sandbox & Transpile TypeScript Modules
// ---------------------------------------------------------------------------
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-lifecycle-test-'));
const sandboxDataDir = path.join(tempDir, '.data');

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
    console.error(`       Error: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
    failedTests++;
  }
}

async function runLifecycleSuite() {
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2),
    'utf8'
  );

  // Minimal NextResponse shim so src/app/api/hrm/lifecycle/route.ts runs standalone in Node
  fs.writeFileSync(
    path.join(tempDir, 'next-server-shim.js'),
    `
class MockNextResponse {
  static json(body, init) {
    return new Response(JSON.stringify(body), {
      status: (init && init.status) || 200,
      headers: { 'content-type': 'application/json' },
    });
  }
}
module.exports = { NextResponse: MockNextResponse };
`,
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
    { src: 'src/app/api/hrm/lifecycle/route.ts', dest: 'lifecycle-route.js' },
  ];

  for (const { src, dest } of filesToTranspile) {
    const filePath = path.join(projectRoot, src);
    assert.ok(fs.existsSync(filePath), `Missing required source file: ${src}`);
    let code = fs.readFileSync(filePath, 'utf8');
    const rootPrefix = dest.includes('/') ? '../' : './';

    // Remap path aliases for sandbox execution
    code = code.replace(/next\/server/g, './next-server-shim');
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
    code = code.replace(/@\/lib\/hrm\/ids/g, `${rootPrefix}hrm-ids`);
    code = code.replace(/@\/lib\/hrm\/permissions/g, `${rootPrefix}hrm-permissions`);
    code = code.replace(/@\/lib\/hrm\/types/g, `${rootPrefix}hrm-types`);
    if (!dest.startsWith('runtime/')) {
      code = code.replace(/\.\/config/g, './config');
      code = code.replace(/\.\/ids/g, './hrm-ids');
      code = code.replace(/\.\/format/g, './hrm-format');
      code = code.replace(/\.\/permissions/g, './hrm-permissions');
    }

    if (src.endsWith('lifecycle/route.ts')) {
      code = code.replace(
        /path\.join\(process\.cwd\(\),\s*'\.data'\)/g,
        JSON.stringify(sandboxDataDir)
      );
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

  // Global browser mocks for runtime-store & audit-logger in Node.js
  const memoryStorage = {};
  global.window = {
    localStorage: {
      getItem: (key) => (key in memoryStorage ? memoryStorage[key] : null),
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
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  global.CustomEvent = class {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };

  // Intercept relative '/api/hrm/sync' background fetches cleanly inside sandbox
  const realFetch = global.fetch;
  global.fetch = async (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return realFetch(input, init);
  };

  const sandboxRequire = createRequire(import.meta.url);
  const hrmConfig = sandboxRequire(path.join(tempDir, 'config.js'));
  const hrmIds = sandboxRequire(path.join(tempDir, 'hrm-ids.js'));
  const hrmPermissions = sandboxRequire(path.join(tempDir, 'hrm-permissions.js'));
  const payrollMock = sandboxRequire(path.join(tempDir, 'payroll.js'));
  const employeesMock = sandboxRequire(path.join(tempDir, 'employees.js'));
  const auditLogger = sandboxRequire(path.join(tempDir, 'audit-logger.js'));
  const runtimeStore = sandboxRequire(path.join(tempDir, 'runtime-store.js'));
  const lifecycleRoute = sandboxRequire(path.join(tempDir, 'lifecycle-route.js'));

  // =========================================================================
  // PHẦN 0: KIỂM TRA SQL SCHEMA (002_employee_lifecycle.sql), CONFIG, IDS & RBAC
  // =========================================================================
  console.log('--- PHẦN 0: KIỂM TRA MIGRATION SQL, CẤU HÌNH HRM, MÃ ĐỊNH DANH & RBAC ---');

  const sql001Path = path.join(projectRoot, 'db', 'migrations', '001_recruitment_core.sql');
  const sql002Path = path.join(projectRoot, 'db', 'migrations', '002_employee_lifecycle.sql');

  await testStep('0.1: Bảo toàn 001_recruitment_core.sql & chuẩn hóa Engine/Charset ở 002_employee_lifecycle.sql', async () => {
    assert.ok(fs.existsSync(sql001Path), '001_recruitment_core.sql phải được giữ nguyên');
    assert.ok(fs.existsSync(sql002Path), '002_employee_lifecycle.sql phải tồn tại');

    const sql = fs.readFileSync(sql002Path, 'utf8');
    assert.ok(sql.includes('ENGINE=InnoDB'), 'Phải sử dụng ENGINE=InnoDB');
    assert.ok(sql.includes('utf8mb4_unicode_ci'), 'Phải dùng utf8mb4_unicode_ci cho tiếng Việt');
    assert.ok(sql.includes('ON DELETE RESTRICT'), 'Phải dùng ON DELETE RESTRICT bảo vệ lịch sử nhân sự');
    assert.ok(!/^\s*DROP\s+TABLE/im.test(sql), 'Không được có lệnh DROP TABLE không comment trong UP migration');
    assert.ok(sql.includes('[DOWN / ROLLBACK INSTRUCTIONS'), 'Phải có hướng dẫn rollback DOWN an toàn');
  });

  await testStep('0.2: Đủ 17 bảng vòng đời nhân sự với CREATE TABLE IF NOT EXISTS', async () => {
    const sql = fs.readFileSync(sql002Path, 'utf8');
    const requiredTables = [
      'departments',
      'positions',
      'employees',
      'users',
      'onboarding_tasks',
      'assets',
      'employee_assets',
      'contracts',
      'leave_balances',
      'attendances',
      'leave_requests',
      'payrolls',
      'performance_reviews',
      'career_histories',
      'resignations',
      'handover_items',
      'clearance_checklists',
    ];

    for (const tbl of requiredTables) {
      const pattern = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tbl}\\b`, 'i');
      assert.match(sql, pattern, `Thiếu định nghĩa CREATE TABLE IF NOT EXISTS ${tbl}`);
    }
  });

  await testStep('0.3: Khối ALTER TABLE idempotent qua information_schema.COLUMNS cho DB hiện hữu', async () => {
    const sql = fs.readFileSync(sql002Path, 'utf8');
    assert.match(sql, /information_schema\.COLUMNS/i);
    assert.match(sql, /ALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+is_active/i);
    assert.match(sql, /ALTER\s+TABLE\s+employees\s+ADD\s+COLUMN\s+official_date/i);
    assert.match(sql, /ALTER\s+TABLE\s+employees\s+ADD\s+COLUMN\s+mentor_id/i);
    assert.match(sql, /ALTER\s+TABLE\s+employees\s+ADD\s+COLUMN\s+preboarding_token/i);
    assert.match(sql, /ALTER\s+TABLE\s+employees\s+ADD\s+COLUMN\s+is_rehireable/i);
    assert.match(sql, /ALTER\s+TABLE\s+contracts\s+ADD\s+COLUMN\s+salary_percent/i);
    assert.match(sql, /ALTER\s+TABLE\s+payrolls\s+ADD\s+COLUMN\s+is_final_settlement/i);
    assert.match(sql, /ALTER\s+TABLE\s+payrolls\s+ADD\s+COLUMN\s+unused_leave_payout/i);
    assert.match(sql, /ALTER\s+TABLE\s+payrolls\s+ADD\s+COLUMN\s+penalty_amount/i);
    assert.match(sql, /ALTER\s+TABLE\s+payrolls\s+ADD\s+COLUMN\s+split_salary_json/i);
  });

  await testStep('0.4: Hằng số HRM_CONFIG, bộ sinh mã chuẩn & ma trận phân quyền RBAC 4 giai đoạn', async () => {
    const { HRM_CONFIG, getRequiredNoticeDays } = hrmConfig;
    assert.strictEqual(HRM_CONFIG.PROBATION_DEFAULT_SALARY_PERCENT, 85);
    assert.strictEqual(HRM_CONFIG.BHXH_EMPLOYEE_RATE, 0.105);
    assert.strictEqual(HRM_CONFIG.BHXH_SALARY_CAP_VND, 46_800_000);
    assert.strictEqual(getRequiredNoticeDays('PROBATION_2M'), 3);
    assert.strictEqual(getRequiredNoticeDays('FIXED_TERM_12M'), 30);
    assert.strictEqual(getRequiredNoticeDays('INDEFINITE_TERM'), 45);

    assert.strictEqual(hrmIds.formatEmployeeCode(2026, 35), 'NV-2026-035');
    assert.strictEqual(hrmIds.formatContractCode(2026, 8, 'PROBATION_2M'), 'HDTV-2026-008');
    assert.strictEqual(hrmIds.formatContractCode(2026, 8, 'FIXED_TERM_12M'), 'HDLD-2026-008');
    assert.strictEqual(hrmIds.formatContractCode(2026, 8, 'ADDENDUM'), 'PLHD-2026-008');
    assert.strictEqual(hrmIds.formatDecisionNo(2026, 12, 'BN'), 'QD-2026-BN012');
    assert.strictEqual(hrmIds.formatResignationCode(2026, 5), 'TV-2026-005');
    assert.strictEqual(hrmIds.formatPayrollCode('2026-11', 9, false), 'BL-202611-009');
    assert.strictEqual(hrmIds.formatPayrollCode('2026-11', 9, true), 'QT-202611-009');

    const hrActor = { id: 'emp-002', name: 'HR Manager', role: 'HR_MANAGER' };
    const dirActor = { id: 'emp-001', name: 'Director', role: 'DIRECTOR' };
    const empActor = { id: 'emp-004', name: 'Employee', role: 'EMPLOYEE' };

    assert.strictEqual(hrmPermissions.can(empActor, 'execute_final_settlement'), false);
    assert.strictEqual(hrmPermissions.can(hrActor, 'execute_final_settlement'), true);
    // Bổ nhiệm Quản lý hoặc lương > 50tr bắt buộc Giám đốc duyệt
    assert.strictEqual(
      hrmPermissions.can(hrActor, 'approve_promotion_or_salary_change', { newRole: 'DEPT_MANAGER' }),
      false
    );
    assert.strictEqual(
      hrmPermissions.can(dirActor, 'approve_promotion_or_salary_change', { newRole: 'DEPT_MANAGER' }),
      true
    );
  });

  // =========================================================================
  // PHẦN 1: GIAI ĐOẠN 1 — PRE-BOARDING, ONBOARDING 4 BỘ PHẬN & CHUYỂN CHÍNH THỨC
  // =========================================================================
  console.log('\n--- PHẦN 1: GIAI ĐOẠN 1 — ONBOARDING, PRE-BOARDING & CHUYỂN CHÍNH THỨC ---');

  const baseEmployeeCount = employeesMock.MOCK_EMPLOYEES.length;
  let lifecycleEmp = null;
  let lifecycleInvite = null;
  let lifecycleOnb = null;

  await testStep('1.1: Tạo Pre-boarding Invite (PENDING_ONBOARD) & chặn đăng nhập khi is_active = false', async () => {
    const created = runtimeStore.createPreboardingInvite({
      fullName: 'Đặng Hoàng Minh Khang',
      personalEmail: 'khang.dang.swe@gmail.com',
      phone: '0918223344',
      departmentId: 'dept-tech-swe',
      departmentName: 'Phòng Kỹ thuật Phần mềm',
      positionId: 'pos-04',
      positionName: 'Kỹ sư Phần mềm Cao cấp (Senior Fullstack)',
      managerId: 'emp-003',
      managerName: 'Lê Hoàng Nam',
      expectedStartDate: '2026-08-15',
      officialSalaryVnd: 24_000_000,
      probationSalaryPercent: 85,
      actorName: 'Trần Thị Bích Ngọc',
    });

    lifecycleInvite = created.invite;
    lifecycleEmp = created.employee;
    lifecycleOnb = created.onboarding;

    assert.strictEqual(lifecycleEmp.employment_status, 'PENDING_ONBOARD');
    assert.strictEqual(lifecycleEmp.probation_salary_percent, 85);
    assert.strictEqual(lifecycleEmp.base_salary_vnd, 20_400_000); // 85% of 24M
    assert.strictEqual(lifecycleEmp.official_salary_vnd, 24_000_000);
    assert.strictEqual(created.user.is_active, false);
    assert.strictEqual(created.user.account_status, 'INACTIVE');

    const loginAttempt = runtimeStore.findSystemUserForLogin(lifecycleEmp.email);
    assert.strictEqual(loginAttempt.canLogin, false, 'PENDING_ONBOARD is_active=false phải bị chặn đăng nhập');
    assert.ok(loginAttempt.blockReason && loginAttempt.blockReason.length > 10);
  });

  await testStep('1.2: Ứng viên nộp hồ sơ Pre-boarding (CCCD/MST/Ngân hàng/BHXH/Khẩn cấp) & HR xác minh', async () => {
    assert.throws(
      () =>
        runtimeStore.submitPreboardingInfo(lifecycleInvite.token, {
          national_id: '',
          tax_code: '',
          bank_name: 'Vietcombank',
          bank_account_no: '',
          emergency_contact_name: 'Đặng Văn Hải',
          emergency_contact_phone: '0903112233',
        }),
      /CCCD|Tài khoản/i
    );

    const submitted = runtimeStore.submitPreboardingInfo(lifecycleInvite.token, {
      national_id: '079098004512',
      national_id_issue_date: '2022-05-10',
      national_id_issue_place: 'Cục Cảnh sát QLHC về TTXH',
      tax_code: '8412098765',
      social_insurance_no: '7924556677',
      bank_name: 'Techcombank',
      bank_account_no: '19038899776655',
      dependents_count: 1,
      address: '128 Nguyễn Thị Minh Khai, Quận 3, TP.HCM',
      emergency_contact_name: 'Đặng Văn Hải',
      emergency_contact_phone: '0903112233',
      emergency_contact_relation: 'Bố ruột',
    });

    assert.strictEqual(submitted.invite.status, 'SUBMITTED');
    assert.strictEqual(submitted.employee.national_id, '079098004512');
    assert.strictEqual(submitted.employee.tax_code, '8412098765');
    assert.strictEqual(submitted.employee.social_insurance_no, '7924556677');
    assert.strictEqual(submitted.employee.bank_account_no, '19038899776655');
    assert.strictEqual(submitted.employee.dependents_count, 1);
    assert.strictEqual(submitted.employee.emergency_contact_name, 'Đặng Văn Hải');
    assert.strictEqual(submitted.employee.preboarding_status, 'SUBMITTED');

    const verified = runtimeStore.hrQuickUpdatePreboarding(lifecycleInvite.token, {
      verify: true,
      actorName: 'Trần Thị Bích Ngọc',
    });
    assert.strictEqual(verified.invite.status, 'VERIFIED');
    assert.strictEqual(verified.employee.preboarding_status, 'VERIFIED');
    lifecycleEmp = verified.employee;
  });

  await testStep('1.3: Tác vụ tự động [1/4 - IT]: Cấp email công ty & mở khóa SSO (is_active = true)', async () => {
    const res = runtimeStore.completeOnboardingDeptTask({
      onboardingId: lifecycleOnb.id,
      group: 'IT',
      companyEmail: 'khang.dang@hrm-enterprise.vn',
      actorName: 'IT Helpdesk',
    });
    assert.ok(res && res.sideEffects.length > 0);

    const loginAfterIt = runtimeStore.findSystemUserForLogin('khang.dang@hrm-enterprise.vn');
    assert.strictEqual(loginAfterIt.canLogin, true, 'Sau khi IT hoàn tất, nhân sự phải đăng nhập được');
    assert.strictEqual(loginAfterIt.user.is_active, true);
    assert.strictEqual(loginAfterIt.user.account_status, 'ACTIVE');
  });

  await testStep('1.4: Tác vụ tự động [2/4 - ADMIN]: Cấp phát tài sản vào employee_assets', async () => {
    const res = runtimeStore.completeOnboardingDeptTask({
      onboardingId: lifecycleOnb.id,
      group: 'ADMIN',
      assetId: 'ast-008', // ThinkPad X1 Carbon AVAILABLE
      assignCondition: 'Máy mới 100% nguyên tem niêm phong CNTT',
      actorName: 'Hành chính Quản trị',
    });
    assert.ok(res && res.sideEffects.length > 0);

    // Cấp thêm 1 màn hình ast-010 để kiểm thử đối soát thu hồi nhiều thiết bị (tốt + hư hỏng) ở Stage 4
    const extraMonitor = runtimeStore.assignAssetToEmployee({
      assetId: 'ast-010',
      employeeId: lifecycleEmp.id,
      employeeCode: lifecycleEmp.employee_code,
      employeeName: lifecycleEmp.full_name,
      departmentId: lifecycleEmp.department_id,
      assignedDate: '2026-08-15',
      assignCondition: 'Màn hình Dell 27" nguyên thùng',
      assetValueVnd: 11_500_000,
      actorName: 'Hành chính Quản trị',
    });
    assert.ok(extraMonitor);

    const empAssets = runtimeStore.getEmployeeAssets(lifecycleEmp.employee_code);
    assert.strictEqual(empAssets.length, 2);
    assert.ok(empAssets.every((a) => a.status === 'ASSIGNED'));
  });

  await testStep('1.5: Tác vụ tự động [3/4 - MANAGER]: Phân công Mentor hướng dẫn & KPI thử việc', async () => {
    const res = runtimeStore.completeOnboardingDeptTask({
      onboardingId: lifecycleOnb.id,
      group: 'MANAGER',
      mentorId: 'emp-004',
      mentorName: 'Phạm Minh Tuấn',
      probationGoals: 'Hoàn thành microservice quyết toán lương & đạt >= 90% test coverage',
      actorName: 'Lê Hoàng Nam',
    });
    assert.ok(res);
    assert.strictEqual(res.employee.mentor_id, 'emp-004');
    assert.strictEqual(res.employee.mentor_name, 'Phạm Minh Tuấn');
  });

  await testStep('1.6: Tác vụ tự động [4/4 - HR]: Tạo HĐ thử việc PROBATION_2M (85% lương) & chuyển PROBATION', async () => {
    const res = runtimeStore.completeOnboardingDeptTask({
      onboardingId: lifecycleOnb.id,
      group: 'HR',
      salaryPercent: 85,
      officialSalaryVnd: 24_000_000,
      actorName: 'Trần Thị Bích Ngọc',
    });
    assert.ok(res);
    assert.strictEqual(res.onboarding.status, 'COMPLETED');
    assert.strictEqual(res.employee.employment_status, 'PROBATION');
    assert.strictEqual(res.employee.contract_type, 'PROBATION_2M');
    assert.strictEqual(res.employee.base_salary_vnd, 20_400_000);

    const probContract = runtimeStore
      .getContracts()
      .find((c) => c.employee_code === lifecycleEmp.employee_code && c.contract_type === 'PROBATION_2M');
    assert.ok(probContract, 'Phải sinh hợp đồng thử việc PROBATION_2M');
    assert.strictEqual(probContract.salary_percent, 85);
    assert.strictEqual(probContract.base_salary_vnd, 20_400_000);
    lifecycleEmp = res.employee;
  });

  await testStep('1.7: Đánh giá thử việc PASS từ Quản lý -> convertProbationToOfficial (OFFICIAL, 100% lương, 12 phép)', async () => {
    // Chặn nếu chưa có đánh giá PASS từ Quản lý khi bật requireManagerPass
    assert.throws(
      () =>
        runtimeStore.convertProbationToOfficial({
          employeeId: lifecycleEmp.id,
          reviewerName: 'Trần Thị Bích Ngọc',
          requireManagerPass: true,
        }),
      /chưa có kết quả đánh giá thử việc ĐẠT \(PASS\)/i
    );

    // Quản lý chấm ĐẠT (PASS)
    const probReview = runtimeStore.savePerformanceReview({
      employee_id: lifecycleEmp.id,
      employee_code: lifecycleEmp.employee_code,
      full_name: lifecycleEmp.full_name,
      department_id: lifecycleEmp.department_id,
      department_name: lifecycleEmp.department_name,
      position_name: lifecycleEmp.position_name,
      cycle: 'PROBATION',
      period_label: 'Thử việc 60 ngày (08-10/2026)',
      kpi_score: 93,
      okr_completion_percent: 95,
      grade: 'A',
      result: 'PASS',
      reviewer_id: 'emp-003',
      reviewer_name: 'Lê Hoàng Nam',
      review_note: 'Đạt xuất sắc toàn bộ mục tiêu thử việc, đề xuất ký HĐLĐ 12 tháng hưởng 100% lương.',
      suggested_salary_vnd: 24_000_000,
      status: 'APPROVED',
    });
    assert.strictEqual(probReview.result, 'PASS');

    // Chuyển chính thức từ 2026-10-16
    const converted = runtimeStore.convertProbationToOfficial({
      employeeId: lifecycleEmp.id,
      officialDate: '2026-10-16',
      officialSalaryVnd: 24_000_000,
      contractType: 'FIXED_TERM_12M',
      reviewerId: 'emp-003',
      reviewerName: 'Trần Thị Bích Ngọc',
      requireManagerPass: true,
    });

    assert.strictEqual(converted.employee.employment_status, 'OFFICIAL');
    assert.strictEqual(runtimeStore.isOfficialEmployeeStatus(converted.employee.employment_status), true);
    assert.strictEqual(converted.employee.official_date, '2026-10-16');
    assert.strictEqual(converted.employee.base_salary_vnd, 24_000_000);
    assert.strictEqual(converted.officialContract.contract_type, 'FIXED_TERM_12M');
    assert.strictEqual(converted.officialContract.salary_percent, 100);
    assert.strictEqual(converted.officialContract.base_salary_vnd, 24_000_000);
    assert.strictEqual(converted.leaveBalance.total_entitled_days, 12);
    assert.strictEqual(converted.leaveBalance.remaining_days, 12);
    assert.strictEqual(converted.careerEntry.change_type, 'PROBATION_TO_OFFICIAL');

    lifecycleEmp = converted.employee;
  });

  // =========================================================================
  // PHẦN 2: GIAI ĐOẠN 2 — CHẤM CÔNG, QUÊN CHẤM, GIẢI TRÌNH, PHÉP/OT & TÍNH LƯƠNG
  // =========================================================================
  console.log('\n--- PHẦN 2: GIAI ĐOẠN 2 — CHẤM CÔNG, ĐƠN TỪ ĐA CẤP & BẢNG LƯƠNG ĐỘNG ---');

  await testStep('2.1: Quy tắc chấm công (checkInOutToday & evaluateDailyPunch): Đi muộn & 1.0 / 0.5 / 0.0 công', async () => {
    const onTime = runtimeStore.evaluateDailyPunch({
      shiftCode: 'HC-08:30',
      checkIn: '08:30',
      checkOut: '17:35',
    });
    assert.strictEqual(onTime.late_minutes, 0);
    assert.strictEqual(onTime.workday_value, 1);
    assert.strictEqual(onTime.status, 'PRESENT');

    // Quá 15 phút ân hạn (08:30 + 15p = 08:45 -> check-in 09:05 trễ 35 phút)
    const lateFull = runtimeStore.evaluateDailyPunch({
      shiftCode: 'HC-08:30',
      checkIn: '09:05',
      checkOut: '18:10',
    });
    assert.strictEqual(lateFull.late_minutes, 35);
    assert.strictEqual(lateFull.workday_value, 1);
    assert.strictEqual(lateFull.status, 'LATE');

    // Làm 4 giờ buổi sáng -> 0.5 công (HALF_DAY)
    const halfDay = runtimeStore.evaluateDailyPunch({
      shiftCode: 'HC-08:30',
      checkIn: '08:30',
      checkOut: '12:30',
    });
    assert.strictEqual(halfDay.workday_value, 0.5);
    assert.strictEqual(halfDay.status, 'HALF_DAY');

    // Làm dưới 3.5 giờ -> 0.0 công (ABSENT)
    const tooShort = runtimeStore.evaluateDailyPunch({
      shiftCode: 'HC-08:30',
      checkIn: '08:30',
      checkOut: '10:15',
    });
    assert.strictEqual(tooShort.workday_value, 0);
    assert.strictEqual(tooShort.status, 'ABSENT');

    // Check-in / Check-out trực tiếp trên Web cho ngày 2026-11-02
    const morningIn = runtimeStore.checkInOutToday({
      employeeId: lifecycleEmp.id,
      date: '2026-11-02',
      action: 'CHECK_IN',
      timeHHmm: '08:27',
    });
    assert.strictEqual(morningIn.status, 'MISSING_PUNCH');
    assert.strictEqual(morningIn.workday_value, 0);

    const eveningOut = runtimeStore.checkInOutToday({
      employeeId: lifecycleEmp.id,
      date: '2026-11-02',
      action: 'CHECK_OUT',
      timeHHmm: '17:42',
    });
    assert.strictEqual(eveningOut.status, 'PRESENT');
    assert.strictEqual(eveningOut.workday_value, 1);
  });

  await testStep('2.2: Import lô chấm công tháng 2026-11 & tự động gắn cờ MISSING_PUNCH (0.0 công)', async () => {
    // Tạo 19 ngày làm việc tiếp theo trong tháng 11/2026 (cộng ngày 02/11 đã check-in/out = 20 ngày + 2 ngày nghỉ phép sắp tạo = 22 công chuẩn)
    const weekdaysToImport = [
      { date: '2026-11-03', check_in: '08:25', check_out: '17:35' },
      { date: '2026-11-04', check_in: '09:00', check_out: '18:00' }, // LATE (30p), 1.0 công
      { date: '2026-11-05', check_in: '08:26', check_out: null }, // MISSING_PUNCH -> 0.0 công!
      { date: '2026-11-06', check_in: '08:30', check_out: '12:30' }, // HALF_DAY -> 0.5 công
      { date: '2026-11-09', check_in: '08:22', check_out: '17:38' },
      { date: '2026-11-10', check_in: '08:28', check_out: '17:40' },
      { date: '2026-11-11', check_in: '08:29', check_out: '17:33' },
      { date: '2026-11-12', check_in: '08:24', check_out: '17:36' },
      { date: '2026-11-13', check_in: '08:20', check_out: '17:45' },
      { date: '2026-11-16', check_in: '08:25', check_out: '17:40' },
      { date: '2026-11-17', check_in: '08:26', check_out: '17:35' },
      { date: '2026-11-18', check_in: '08:27', check_out: '17:39' },
      { date: '2026-11-19', check_in: '08:23', check_out: '17:34' },
      { date: '2026-11-20', check_in: '08:29', check_out: '17:41' },
      { date: '2026-11-25', check_in: '08:21', check_out: '17:36' },
      { date: '2026-11-26', check_in: '08:25', check_out: '17:38' },
      { date: '2026-11-27', check_in: '08:24', check_out: '17:37' },
      { date: '2026-11-30', check_in: '08:22', check_out: '17:40' },
    ].map((r) => ({
      employee_code: lifecycleEmp.employee_code,
      shift_code: 'HC-08:30',
      ...r,
    }));

    const imported = runtimeStore.importDailyAttendances(weekdaysToImport, 'Ngô Thanh Hà');
    assert.strictEqual(imported.importedCount, weekdaysToImport.length);
    assert.strictEqual(imported.missingPunchCount, 1);

    const nov05 = runtimeStore
      .getDailyAttendances('2026-11', lifecycleEmp.employee_code)
      .find((d) => d.date === '2026-11-05');
    assert.ok(nov05);
    assert.strictEqual(nov05.status, 'MISSING_PUNCH');
    assert.strictEqual(nov05.workday_value, 0);

    const monthlyBeforeExplain = runtimeStore
      .getMonthlyAttendances('2026-11')
      .find((m) => m.employee_code === lifecycleEmp.employee_code);
    assert.ok(monthlyBeforeExplain);
    assert.strictEqual(monthlyBeforeExplain.attendance_status, 'NEEDS_REVIEW');
  });

  await testStep('2.3: Duyệt đơn LATE_EXPLANATION khôi phục ca MISSING_PUNCH từ 0.0 -> 1.0 công hợp lệ', async () => {
    const explainReq = {
      id: `req-exp-${Date.now()}`,
      request_code: 'EXP-2026-901',
      employee_id: lifecycleEmp.id,
      employee_code: lifecycleEmp.employee_code,
      full_name: lifecycleEmp.full_name,
      department_id: lifecycleEmp.department_id,
      department_name: lifecycleEmp.department_name,
      request_category: 'LATE_EXPLANATION',
      category_label: 'Giải trình chấm công',
      start_datetime: '2026-11-05T08:26:00',
      end_datetime: '2026-11-05T17:45:00',
      target_date: '2026-11-05',
      actual_check_in: '08:26',
      actual_check_out: '17:45',
      duration_days_or_hours: 1,
      unit: 'DAY',
      reason: 'Quên chấm vân tay đầu ra do họp triển khai bản vá bảo mật cùng khách hàng.',
      approver_id: 'emp-003',
      approver_name: 'Lê Hoàng Nam',
      approval_status: 'APPROVED',
      status: 'APPROVED',
      created_at: '2026-11-06T09:00:00',
    };

    runtimeStore.handleRequestLifecycleChange(explainReq, 'PENDING');

    const nov05After = runtimeStore
      .getDailyAttendances('2026-11', lifecycleEmp.employee_code)
      .find((d) => d.date === '2026-11-05');
    assert.strictEqual(nov05After.status, 'PRESENT');
    assert.strictEqual(nov05After.workday_value, 1);

    const monthlyAfter = runtimeStore
      .getMonthlyAttendances('2026-11')
      .find((m) => m.employee_code === lifecycleEmp.employee_code);
    assert.strictEqual(monthlyAfter.attendance_status, 'VERIFIED');
  });

  await testStep('2.4: Duyệt đơn ANNUAL_LEAVE tự động trừ remaining_days (12 -> 10) & cộng công hưởng lương', async () => {
    // Kiểm tra chặn xin nghỉ vượt quá 12 ngày phép tồn
    assert.throws(
      () =>
        runtimeStore.handleRequestLifecycleChange({
          id: 'req-over-quota',
          request_code: 'NP-2026-999',
          employee_id: lifecycleEmp.id,
          employee_code: lifecycleEmp.employee_code,
          full_name: lifecycleEmp.full_name,
          department_id: lifecycleEmp.department_id,
          department_name: lifecycleEmp.department_name,
          request_category: 'ANNUAL_LEAVE',
          category_label: 'Nghỉ phép năm',
          start_datetime: '2026-11-23T08:30:00',
          end_datetime: '2026-12-15T17:30:00',
          duration_days_or_hours: 15,
          unit: 'DAY',
          reason: 'Xin nghỉ quá số phép còn lại',
          approver_id: 'emp-003',
          approver_name: 'Lê Hoàng Nam',
          approval_status: 'PENDING',
          status: 'PENDING',
          created_at: '2026-11-20T09:00:00',
        }),
      /vượt quá quỹ phép còn lại/i
    );

    const leaveReq = {
      id: `req-lv-${Date.now()}`,
      request_code: 'NP-2026-902',
      employee_id: lifecycleEmp.id,
      employee_code: lifecycleEmp.employee_code,
      full_name: lifecycleEmp.full_name,
      department_id: lifecycleEmp.department_id,
      department_name: lifecycleEmp.department_name,
      request_category: 'ANNUAL_LEAVE',
      category_label: 'Nghỉ phép năm hưởng nguyên lương',
      start_datetime: '2026-11-23T08:30:00',
      end_datetime: '2026-11-24T17:30:00',
      target_date: '2026-11-23',
      duration_days_or_hours: 2,
      unit: 'DAY',
      reason: 'Nghỉ phép năm giải quyết việc gia đình 02 ngày.',
      approver_id: 'emp-003',
      approver_name: 'Lê Hoàng Nam',
      approval_status: 'PENDING',
      status: 'PENDING',
      created_at: '2026-11-20T10:00:00',
    };

    // Bước 1: Mới gửi đơn -> treo 2 ngày ở pending_days
    runtimeStore.handleRequestLifecycleChange(leaveReq);
    const balPending = runtimeStore
      .getLeaveBalances(2026)
      .find((b) => b.employee_code === lifecycleEmp.employee_code);
    assert.strictEqual(balPending.pending_days, 2);
    assert.strictEqual(balPending.remaining_days, 12);

    // Bước 2: Phê duyệt cuối -> trừ remaining_days còn 10, used_days = 2, pending_days = 0
    runtimeStore.handleRequestLifecycleChange(
      { ...leaveReq, approval_status: 'APPROVED', status: 'APPROVED' },
      'PENDING'
    );
    const balApproved = runtimeStore
      .getLeaveBalances(2026)
      .find((b) => b.employee_code === lifecycleEmp.employee_code);
    assert.strictEqual(balApproved.used_days, 2);
    assert.strictEqual(balApproved.pending_days, 0);
    assert.strictEqual(balApproved.remaining_days, 10);

    const monthlySummary = runtimeStore
      .getMonthlyAttendances('2026-11')
      .find((m) => m.employee_code === lifecycleEmp.employee_code);
    assert.strictEqual(monthlySummary.paid_leave_days, 2);
  });

  await testStep('2.5: Duyệt đơn OVERTIME (1.5x ngày thường & 2.0x cuối tuần) đồng bộ vào bảng công tháng', async () => {
    runtimeStore.handleRequestLifecycleChange(
      {
        id: `req-ot-wd-${Date.now()}`,
        request_code: 'OT-2026-903',
        employee_id: lifecycleEmp.id,
        employee_code: lifecycleEmp.employee_code,
        full_name: lifecycleEmp.full_name,
        department_id: lifecycleEmp.department_id,
        department_name: lifecycleEmp.department_name,
        request_category: 'OVERTIME',
        category_label: 'Tăng ca ngày thường',
        start_datetime: '2026-11-18T18:00:00',
        end_datetime: '2026-11-18T22:00:00',
        target_date: '2026-11-18',
        duration_days_or_hours: 4,
        ot_hours: 4,
        ot_multiplier: 1.5,
        ot_day_type: 'WEEKDAY',
        unit: 'HOUR',
        reason: 'Triển khai nâng cấp cơ sở dữ liệu ngoài giờ hành chính.',
        approver_id: 'emp-003',
        approver_name: 'Lê Hoàng Nam',
        approval_status: 'APPROVED',
        status: 'APPROVED',
        created_at: '2026-11-18T17:00:00',
      },
      'PENDING'
    );

    const afterWdSummary = runtimeStore
      .getMonthlyAttendances('2026-11')
      .find((m) => m.employee_code === lifecycleEmp.employee_code);
    assert.strictEqual(afterWdSummary.overtime_hours_weekday, 4);

    runtimeStore.handleRequestLifecycleChange(
      {
        id: `req-ot-wk-${Date.now()}`,
        request_code: 'OT-2026-904',
        employee_id: lifecycleEmp.id,
        employee_code: lifecycleEmp.employee_code,
        full_name: lifecycleEmp.full_name,
        department_id: lifecycleEmp.department_id,
        department_name: lifecycleEmp.department_name,
        request_category: 'OVERTIME',
        category_label: 'Tăng ca cuối tuần',
        start_datetime: '2026-11-21T09:00:00',
        end_datetime: '2026-11-21T15:00:00',
        target_date: '2026-11-21',
        duration_days_or_hours: 5,
        ot_hours: 5,
        ot_multiplier: 2.0,
        ot_day_type: 'WEEKEND',
        unit: 'HOUR',
        reason: 'Kiểm thử tải hệ thống cuối tuần.',
        approver_id: 'emp-003',
        approver_name: 'Lê Hoàng Nam',
        approval_status: 'APPROVED',
        status: 'APPROVED',
        created_at: '2026-11-20T16:00:00',
      },
      'PENDING'
    );

    // Hồi quy Idempotency: gọi recomputeMonthlyAttendance nhiều lần liên tiếp không được cộng lặp phép/OT
    runtimeStore.recomputeMonthlyAttendance('2026-11');
    runtimeStore.recomputeMonthlyAttendance('2026-11');

    const monthlySummary = runtimeStore
      .getMonthlyAttendances('2026-11')
      .find((m) => m.employee_code === lifecycleEmp.employee_code);
    assert.strictEqual(monthlySummary.paid_leave_days, 2, 'Không được cộng dồn lặp paid_leave_days');
    assert.strictEqual(monthlySummary.overtime_hours_weekday, 4, 'Không được cộng dồn lặp OT ngày thường');
    assert.strictEqual(monthlySummary.overtime_hours_weekend, 5, 'Không được cộng dồn lặp OT cuối tuần');
    assert.strictEqual(monthlySummary.total_overtime_hours, 9, 'Tổng giờ OT phải đúng 9h sau nhiều lần recompute');
  });

  await testStep('2.6: calculateMonthlyPayrolls đối chiếu Thử việc (0% BHXH) vs Chính thức (10.5% BHXH + Thuế TNCN 7 bậc)', async () => {
    // Tạo 1 nhân sự đang PROBATION trong tháng 2026-11 để đối chứng miễn BHXH 0%
    const probCreated = runtimeStore.createPreboardingInvite({
      fullName: 'Lý Gia Bảo',
      personalEmail: 'bao.ly@gmail.com',
      phone: '0977665544',
      departmentId: 'dept-tech-data',
      departmentName: 'Phòng Dữ liệu & AI',
      positionId: 'pos-04',
      positionName: 'Data Analyst (Thử việc)',
      managerId: 'emp-005',
      managerName: 'Vũ Thị Mai Phương',
      expectedStartDate: '2026-11-02',
      officialSalaryVnd: 18_000_000,
      probationSalaryPercent: 85,
      actorName: 'Trần Thị Bích Ngọc',
    });
    runtimeStore.completeOnboardingDeptTask({
      onboardingId: probCreated.onboarding.id,
      group: 'HR',
      salaryPercent: 85,
      officialSalaryVnd: 18_000_000,
      actorName: 'Trần Thị Bích Ngọc',
    });

    const payrolls = runtimeStore.calculateMonthlyPayrolls('2026-11', 'Ngô Thanh Hà');

    // 1) Nhân sự PROBATION: miễn 0% BHXH
    const probPayroll = payrolls.find((p) => p.employee_code === probCreated.employee.employee_code);
    assert.ok(probPayroll, 'Phải có phiếu lương của nhân sự đang thử việc');
    assert.strictEqual(probPayroll.contract_type, 'PROBATION_2M');
    assert.strictEqual(probPayroll.insurance_base_vnd, 0);
    assert.strictEqual(probPayroll.total_insurance_employee_vnd, 0, 'Thử việc PROBATION_2M phải miễn BHXH 0%');

    // 2) Nhân sự OFFICIAL (lifecycleEmp, lương cơ bản 24tr, 1 người phụ thuộc, 9h OT)
    const offPayroll = payrolls.find((p) => p.employee_code === lifecycleEmp.employee_code);
    assert.ok(offPayroll, 'Phải có phiếu lương của nhân sự chính thức');
    assert.strictEqual(offPayroll.insurance_base_vnd, 24_000_000);
    assert.strictEqual(offPayroll.total_insurance_employee_vnd, Math.round(24_000_000 * 0.105)); // 2,520,000đ
    assert.ok(offPayroll.overtime_pay_vnd > 0, 'Phải cộng tiền làm thêm giờ OT');
    assert.strictEqual(offPayroll.dependent_deduction_vnd, 6_200_000); // 1 người phụ thuộc (kỳ 2026)

    const expectedTax = payrollMock.calculateProgressivePitVnd(offPayroll.taxable_income_vnd, '2026-11');
    assert.strictEqual(offPayroll.pit_tax_vnd, expectedTax, 'Thuế TNCN phải khớp biểu lũy tiến 5 bậc kỳ 2026');
    assert.strictEqual(offPayroll.mid_month_split, null, 'Chưa thăng chức giữa tháng 11 nên mid_month_split = null');
  });

  // =========================================================================
  // PHẦN 3: GIAI ĐOẠN 3 — ĐÁNH GIÁ HIỆU SUẤT, THĂNG TIẾN BẤT BIẾN & TÁCH LƯƠNG GIỮA KỲ
  // =========================================================================
  console.log('\n--- PHẦN 3: GIAI ĐOẠN 3 — ĐÁNH GIÁ HIỆU SUẤT, THĂNG TIẾN & MID-MONTH SPLIT ---');

  let oldHistorySnapshot = null;

  await testStep('3.1: Lưu đánh giá hiệu suất Quý & thực thi promoteOrTransferEmployee giữa tháng (2026-11-16 -> DEPT_MANAGER)', async () => {
    runtimeStore.savePerformanceReview({
      employee_id: lifecycleEmp.id,
      employee_code: lifecycleEmp.employee_code,
      full_name: lifecycleEmp.full_name,
      department_id: lifecycleEmp.department_id,
      department_name: lifecycleEmp.department_name,
      position_name: lifecycleEmp.position_name,
      cycle: 'QUARTERLY',
      period_label: '2026-Q4',
      kpi_score: 97,
      okr_completion_percent: 98,
      grade: 'A+',
      result: 'EXCELLENT',
      reviewer_id: 'emp-001',
      reviewer_name: 'Nguyễn Văn An',
      review_note: 'Dẫn dắt kiến trúc xuất sắc, bổ nhiệm Trưởng phòng Kỹ thuật Phần mềm từ 16/11/2026.',
      suggested_salary_vnd: 36_000_000,
      suggested_bonus_vnd: 3_000_000,
      status: 'APPROVED',
    });

    const historiesBefore = runtimeStore.getCareerHistories(lifecycleEmp.id);
    assert.strictEqual(historiesBefore.length, 1);
    oldHistorySnapshot = JSON.parse(JSON.stringify(historiesBefore[0]));

    const promoted = runtimeStore.promoteOrTransferEmployee({
      employeeId: lifecycleEmp.id,
      changeType: 'PROMOTION',
      newDepartmentId: 'dept-tech-swe',
      newPositionId: 'pos-03',
      newPositionName: 'Trưởng phòng Kỹ thuật Phần mềm',
      newSalaryVnd: 36_000_000,
      newRoleCode: 'DEPT_MANAGER',
      effectiveDate: '2026-11-16',
      decisionNo: 'QĐ-2026-888/LV-NS',
      reason: 'Bổ nhiệm Trưởng phòng Kỹ thuật Phần mềm và điều chỉnh lương lên 36.000.000đ.',
      signedByName: 'Nguyễn Văn An',
    });

    assert.strictEqual(promoted.employee.role_code, 'DEPT_MANAGER');
    assert.strictEqual(promoted.employee.base_salary_vnd, 36_000_000);
    assert.strictEqual(promoted.updatedUser.role_code, 'DEPT_MANAGER');
    assert.strictEqual(promoted.addendumContract.contract_type, 'ADDENDUM');
    assert.strictEqual(promoted.addendumContract.is_addendum, true);
    assert.strictEqual(promoted.addendumContract.base_salary_vnd, 36_000_000);
    assert.strictEqual(promoted.addendumContract.decision_no, 'QĐ-2026-888/LV-NS');
    assert.ok(promoted.addendumContract.parent_contract_id, 'Phụ lục ADDENDUM phải liên kết hợp đồng gốc');

    lifecycleEmp = promoted.employee;
  });

  await testStep('3.2: Kiểm chứng tính bất biến của career_histories (giữ nguyên bản ghi cũ) & đồng bộ Department/User Role', async () => {
    const historiesAfter = runtimeStore.getCareerHistories(lifecycleEmp.id);
    assert.strictEqual(historiesAfter.length, 2, 'Phải có 2 bản ghi lịch sử công tác độc lập (append-only)');

    const preservedOld = historiesAfter.find((h) => h.id === oldHistorySnapshot.id);
    assert.ok(preservedOld, 'Bản ghi lịch sử chuyển chính thức cũ không được bị ghi đè hay xóa');
    assert.strictEqual(preservedOld.decision_no, oldHistorySnapshot.decision_no);
    assert.strictEqual(preservedOld.old_salary_vnd, oldHistorySnapshot.old_salary_vnd);
    assert.strictEqual(preservedOld.new_salary_vnd, oldHistorySnapshot.new_salary_vnd);

    const latestPromo = historiesAfter[0];
    assert.strictEqual(latestPromo.change_type, 'PROMOTION');
    assert.strictEqual(latestPromo.effective_date, '2026-11-16');
    assert.strictEqual(latestPromo.old_salary_vnd, 24_000_000);
    assert.strictEqual(latestPromo.new_salary_vnd, 36_000_000);
    assert.strictEqual(latestPromo.old_role_code, 'EMPLOYEE');
    assert.strictEqual(latestPromo.new_role_code, 'DEPT_MANAGER');

    const sweDept = runtimeStore.getRuntimeDepartments().find((d) => d.id === 'dept-tech-swe');
    assert.strictEqual(sweDept.manager_id, lifecycleEmp.id, 'Phòng ban phải đồng bộ manager_id mới');

    const sysUser = runtimeStore
      .getSystemUsers()
      .find((u) => u.employee_code === lifecycleEmp.employee_code);
    assert.strictEqual(sysUser.role_code, 'DEPT_MANAGER');
  });

  await testStep('3.3: Bảng lương tháng 2026-11 tự động tách lương giữa kỳ (mid_month_split: 24tr trước 16/11 + 36tr từ 16/11)', async () => {
    // Hồi quy: Giữ nguyên phiếu nháp lương cũ (kpi_bonus_vnd = 0 từ Stage 2) để kiểm chứng tự động cập nhật thưởng KPI mới
    const payrollsAfterPromo = runtimeStore.calculateMonthlyPayrolls('2026-11', 'Ngô Thanh Hà');
    const splitPayroll = payrollsAfterPromo.find((p) => p.employee_code === lifecycleEmp.employee_code);

    assert.ok(splitPayroll && splitPayroll.mid_month_split, 'Phải sinh cấu trúc mid_month_split');
    const split = splitPayroll.mid_month_split;
    assert.strictEqual(split.effective_date, '2026-11-16');
    assert.strictEqual(split.decision_no, 'QĐ-2026-888/LV-NS');
    assert.strictEqual(split.old_salary_vnd, 24_000_000);
    assert.strictEqual(split.new_salary_vnd, 36_000_000);
    assert.ok(split.days_at_old_salary > 0, 'Số ngày hưởng mức lương cũ phải > 0');
    assert.ok(split.days_at_new_salary > 0, 'Số ngày hưởng mức lương mới phải > 0');
    assert.strictEqual(
      splitPayroll.prorated_base_salary_vnd,
      split.old_prorated_vnd + split.new_prorated_vnd,
      'Lương thời gian phải bằng tổng lương giai đoạn cũ + giai đoạn mới'
    );
    assert.strictEqual(splitPayroll.kpi_bonus_vnd, 3_000_000, 'Phiếu nháp phải tự động nhận thưởng KPI Quý mới duyệt');
  });

  // =========================================================================
  // PHẦN 4: GIAI ĐOẠN 4 — OFFBOARDING, KẾ NHIỆM QUẢN LÝ, BÀN GIAO 3 BÊN & QUYẾT TOÁN
  // =========================================================================
  console.log('\n--- PHẦN 4: GIAI ĐOẠN 4 — OFFBOARDING, CLEARANCE HARD GATE & QUYẾT TOÁN CUỐI ---');

  let resignationRecord = null;

  await testStep('4.1: Kiểm tra thời hạn báo trước luật định (calculateResignationNotice: 3 / 30 / 45 ngày)', async () => {
    const probNotice = runtimeStore.calculateResignationNotice({
      contractType: 'PROBATION_2M',
      submittedDate: '2026-11-01',
      desiredLastDay: '2026-11-04',
    });
    assert.strictEqual(probNotice.minimum_notice_days, 3);
    assert.strictEqual(probNotice.meets_legal_notice, true);

    const probShortfall = runtimeStore.calculateResignationNotice({
      contractType: 'PROBATION_2M',
      submittedDate: '2026-11-01',
      desiredLastDay: '2026-11-02',
    });
    assert.strictEqual(probShortfall.meets_legal_notice, false);
    assert.strictEqual(probShortfall.notice_shortfall_days, 2);
    assert.strictEqual(probShortfall.earliest_legal_last_day, '2026-11-04');

    const fixedNotice = runtimeStore.calculateResignationNotice({
      contractType: 'FIXED_TERM_12M',
      submittedDate: '2026-11-01',
      desiredLastDay: '2026-12-01',
    });
    assert.strictEqual(fixedNotice.minimum_notice_days, 30);
    assert.strictEqual(fixedNotice.meets_legal_notice, true);

    const indefNotice = runtimeStore.calculateResignationNotice({
      contractType: 'INDEFINITE_TERM',
      submittedDate: '2026-11-01',
      desiredLastDay: '2026-12-10',
    });
    assert.strictEqual(indefNotice.minimum_notice_days, 45);
    assert.strictEqual(indefNotice.meets_legal_notice, false);
    assert.strictEqual(indefNotice.earliest_legal_last_day, '2026-12-16');
  });

  await testStep('4.2: Nộp & phê duyệt đơn thôi việc -> chuyển sang NOTICE_PERIOD, khởi tạo Clearance & Handover', async () => {
    // Gán 1 nhân viên cấp dưới (emp-009 Bùi Trọng Nghĩa) và 1 đơn PENDING dưới quyền lifecycleEmp để test Manager Offboarding
    const subEmp = runtimeStore.getAllRuntimeEmployees().find((e) => e.id === 'emp-009');
    runtimeStore.saveRuntimeEmployee({
      ...subEmp,
      manager_id: lifecycleEmp.id,
      manager_name: lifecycleEmp.full_name,
    });
    const pendingSubReq = {
      id: `req-sub-pending-${Date.now()}`,
      request_code: 'NP-2026-950',
      employee_id: subEmp.id,
      employee_code: subEmp.employee_code,
      full_name: subEmp.full_name,
      department_id: subEmp.department_id,
      department_name: subEmp.department_name,
      request_category: 'REMOTE_WORK',
      category_label: 'Làm việc từ xa (WFH)',
      start_datetime: '2026-11-28T08:30:00',
      end_datetime: '2026-11-28T17:30:00',
      duration_days_or_hours: 1,
      unit: 'DAY',
      reason: 'Làm việc từ xa chờ lắp đặt mạng cáp quang.',
      approver_id: lifecycleEmp.id,
      approver_name: lifecycleEmp.full_name,
      current_approver_id: lifecycleEmp.id,
      current_step_role: 'DEPT_MANAGER',
      approval_status: 'PENDING',
      status: 'PENDING',
      created_at: '2026-11-21T08:00:00',
    };
    runtimeStore.saveRuntimeRequest(pendingSubReq);

    const submitted = runtimeStore.submitResignation({
      employeeId: lifecycleEmp.id,
      submittedDate: '2026-10-30',
      desiredLastDay: '2026-11-30',
      reasonCategory: 'PERSONAL',
      reason: 'Di chuyển nơi cư trú dài hạn cùng gia đình ra nước ngoài.',
    });
    assert.strictEqual(submitted.status, 'PENDING_MANAGER');
    assert.strictEqual(submitted.minimum_notice_days, 30);
    assert.strictEqual(submitted.notice_shortfall_days, 0);

    const approved = runtimeStore.approveResignation({
      resignationId: submitted.id,
      approverRole: 'HR_MANAGER',
      approverName: 'Trần Thị Bích Ngọc',
      approvedLastDay: '2026-11-30',
      exitInterviewNote: 'Đã phỏng vấn thôi việc, thống nhất lộ trình bàn giao công việc & thiết bị.',
    });

    resignationRecord = approved.resignation;
    assert.strictEqual(resignationRecord.status, 'NOTICE_PERIOD');
    assert.strictEqual(resignationRecord.approved_last_day, '2026-11-30');

    const refreshedEmp = runtimeStore.getAllRuntimeEmployees().find((e) => e.id === lifecycleEmp.id);
    assert.strictEqual(refreshedEmp.employment_status, 'NOTICE_PERIOD');
    assert.strictEqual(approved.clearance.assets.length, 2, 'Clearance phải tự nạp đủ 2 tài sản đang mượn');
    assert.strictEqual(approved.handoverItems.length, 3, 'Phải sinh sẵn 3 hạng mục bàn giao chuẩn');
  });

  await testStep('4.3: Kiểm tra phụ thuộc Quản lý nghỉ việc & chuyển giao kế nhiệm (executeManagerSuccessorReassign)', async () => {
    const depBefore = runtimeStore.getManagerOffboardingDependencies(lifecycleEmp.id);
    assert.strictEqual(depBefore.is_manager, true);
    assert.strictEqual(depBefore.requires_successor_reassign, true);
    assert.ok(depBefore.subordinates.some((s) => s.id === 'emp-009'));
    assert.ok(depBefore.pending_requests.some((r) => r.request_code === 'NP-2026-950'));

    const reassigned = runtimeStore.executeManagerSuccessorReassign({
      resigningEmployeeId: lifecycleEmp.id,
      successorEmployeeId: 'emp-004', // Phạm Minh Tuấn kế nhiệm
      resignationId: resignationRecord.id,
      actorName: 'Trần Thị Bích Ngọc',
    });

    assert.ok(reassigned.transferredSubordinatesCount >= 1);
    assert.ok(reassigned.transferredRequestsCount >= 1);
    assert.strictEqual(reassigned.successor.role_code, 'DEPT_MANAGER');

    const subAfter = runtimeStore.getAllRuntimeEmployees().find((e) => e.id === 'emp-009');
    assert.strictEqual(subAfter.manager_id, 'emp-004', 'manager_id của cấp dưới phải chuyển sang người kế nhiệm');

    const allReqs = runtimeStore.mergeWithRuntimeRequests([]);
    const transferredReq = allReqs.find((r) => r.request_code === 'NP-2026-950');
    assert.strictEqual(transferredReq.current_approver_id, 'emp-004', 'Đơn PENDING phải chuyển sang người kế nhiệm');
    assert.strictEqual(transferredReq.approver_id, 'emp-004');

    const depAfter = runtimeStore.getManagerOffboardingDependencies(lifecycleEmp.id);
    assert.strictEqual(depAfter.requires_successor_reassign, false);
  });

  await testStep('4.4: Bàn giao công việc tay ba (Sender -> Receiver xác nhận -> Manager nghiệm thu)', async () => {
    const items = runtimeStore.getHandoverItems(resignationRecord.id);
    assert.strictEqual(items.length, 3);

    // Chặn Quản lý duyệt khi người nhận chưa xác nhận
    runtimeStore.assignHandoverReceiver({
      handoverItemId: items[0].id,
      receiverEmployeeId: 'emp-004',
      senderConfirmed: true,
      actorName: lifecycleEmp.full_name,
    });
    assert.throws(
      () =>
        runtimeStore.approveHandoverByManager({
          handoverItemId: items[0].id,
          managerName: 'Nguyễn Văn An',
        }),
      /Người nhận bàn giao phải xác nhận tiếp nhận trước/i
    );

    // Hoàn tất cả 3 bên cho toàn bộ 3 hạng mục
    for (const item of items) {
      runtimeStore.assignHandoverReceiver({
        handoverItemId: item.id,
        receiverEmployeeId: 'emp-004',
        senderConfirmed: false,
      });
      runtimeStore.confirmHandoverBySender(item.id, 'Đã đóng gói đầy đủ tài liệu & bàn giao.');
      runtimeStore.confirmHandoverByReceiver({
        handoverItemId: item.id,
        receiverName: 'Phạm Minh Tuấn',
        note: 'Đã tiếp nhận đầy đủ tài liệu và quyền truy cập.',
      });
      const completedItem = runtimeStore.approveHandoverByManager({
        handoverItemId: item.id,
        managerName: 'Nguyễn Văn An',
        note: 'Nghiệm thu đạt yêu cầu bàn giao 3 bên.',
      });
      assert.strictEqual(completedItem.status, 'COMPLETED');
      assert.strictEqual(completedItem.sender_confirmed, true);
      assert.strictEqual(completedItem.receiver_confirmed, true);
      assert.strictEqual(completedItem.manager_approved, true);
    }
  });

  await testStep('4.5: Đối soát tài sản Clearance (1 nguyên vẹn + 1 hư hỏng phạt 1.500.000đ) & chặn Hard Gate trước 100%', async () => {
    // Trả laptop ast-008 nguyên vẹn (0đ)
    runtimeStore.reconcileClearanceAsset({
      resignationId: resignationRecord.id,
      assetId: 'ast-008',
      returned: true,
      returnCondition: 'GOOD',
      penaltyAmountVnd: 0,
      conditionNote: 'Thu hồi máy nguyên vẹn, đầy đủ sạc.',
      actorName: 'Hành chính Quản trị',
    });

    // Trả màn hình ast-010 bị nứt tấm nền -> khấu trừ bồi thường 1.500.000đ
    const clrAfterAssets = runtimeStore.reconcileClearanceAsset({
      resignationId: resignationRecord.id,
      assetId: 'ast-010',
      returned: true,
      returnCondition: 'DAMAGED',
      penaltyAmountVnd: 1_500_000,
      conditionNote: 'Trầy nứt góc màn hình, lập biên bản khấu trừ 1.500.000đ.',
      actorName: 'Hành chính Quản trị',
    });

    assert.strictEqual(clrAfterAssets.admin_assets_cleared, true);
    assert.strictEqual(clrAfterAssets.total_penalty_vnd, 1_500_000);

    // HARD GATE: IT, Kế toán, Nhân sự chưa ký -> executeFinalSettlement BẮT BUỘC CHẶN!
    const gatePartial = runtimeStore.checkClearance100Percent(resignationRecord.id);
    assert.strictEqual(gatePartial.is_100_percent_cleared, false);
    assert.strictEqual(gatePartial.admin_cleared, true);
    assert.strictEqual(gatePartial.it_cleared, false);
    assert.strictEqual(gatePartial.accounting_cleared, false);
    assert.strictEqual(gatePartial.hr_cleared, false);

    assert.throws(
      () =>
        runtimeStore.executeFinalSettlement({
          resignationId: resignationRecord.id,
          isRehireable: false,
          actorName: 'Trần Thị Bích Ngọc',
        }),
      /Chặn Quyết toán cuối cùng/i
    );
  });

  await testStep('4.6: IT / Kế toán / Nhân sự ký duyệt đủ 100% Clearance -> Mở khóa cổng Quyết toán', async () => {
    runtimeStore.signOffClearanceDept({
      resignationId: resignationRecord.id,
      department: 'IT',
      approved: true,
      note: 'Đã thu hồi VPN, GitLab token và lên lịch khóa SSO.',
      actorName: 'IT Security',
    });
    runtimeStore.signOffClearanceDept({
      resignationId: resignationRecord.id,
      department: 'ACCOUNTING',
      approved: true,
      advanceDeductionVnd: 500_000, // Tạm ứng công tác phí cần khấu trừ
      note: 'Đối chiếu tạm ứng tồn 500.000đ khấu trừ vào lương cuối.',
      actorName: 'Đặng Quốc Khánh',
    });
    runtimeStore.signOffClearanceDept({
      resignationId: resignationRecord.id,
      department: 'HR',
      approved: true,
      note: 'Đã chốt sổ BHXH điện tử & biên bản thanh lý hợp đồng.',
      actorName: 'Trần Thị Bích Ngọc',
    });

    const gateFull = runtimeStore.checkClearance100Percent(resignationRecord.id);
    assert.strictEqual(gateFull.is_100_percent_cleared, true);
    assert.strictEqual(gateFull.completion_percent, 100);
    assert.strictEqual(gateFull.blocking_reasons.length, 0);
  });

  await testStep('4.7: Thực thi executeFinalSettlement -> Thanh toán 10 phép tồn, trừ phạt 1.5tr, chuyển RESIGNED & khóa Login', async () => {
    const settled = runtimeStore.executeFinalSettlement({
      resignationId: resignationRecord.id,
      isRehireable: false,
      rehireNote: 'Làm hư hỏng tài sản thiết bị và không phù hợp văn hóa vận hành.',
      actorName: 'Trần Thị Bích Ngọc',
    });

    const { finalPayroll, employee, lockedUser, resignation } = settled;
    assert.strictEqual(resignation.status, 'COMPLETED');
    assert.strictEqual(finalPayroll.is_final_settlement, true);
    assert.strictEqual(finalPayroll.payment_status, 'PAID');

    // Kiểm chứng tiền thanh toán 10 ngày phép tồn (12 ngày cấp - 2 ngày đã nghỉ ở Stage 2 = 10 ngày)
    assert.strictEqual(finalPayroll.unused_leave_days, 10);
    const expectedUnusedPayout = Math.round(10 * (36_000_000 / 22));
    assert.strictEqual(finalPayroll.unused_leave_payout_vnd, expectedUnusedPayout);

    // Kiểm chứng khấu trừ bồi thường tài sản (1.5tr) & tạm ứng (500k)
    assert.strictEqual(finalPayroll.penalty_deduction_vnd, 1_500_000);
    assert.strictEqual(finalPayroll.advance_deduction_vnd, 500_000);
    const expectedNet =
      finalPayroll.gross_salary_vnd -
      finalPayroll.total_insurance_employee_vnd -
      finalPayroll.pit_tax_vnd -
      1_500_000 -
      500_000;
    assert.strictEqual(finalPayroll.net_salary_vnd, expectedNet);

    // Kiểm chứng nhân sự chuyển sang RESIGNED, KHÔNG XÓA HỒ SƠ LỊCH SỬ
    assert.strictEqual(employee.employment_status, 'RESIGNED');
    assert.strictEqual(employee.is_rehireable, false);
    const allEmpsNow = runtimeStore.getAllRuntimeEmployees();
    assert.ok(
      allEmpsNow.length >= baseEmployeeCount + 2,
      'Tuyệt đối không được xóa cứng nhân sự khỏi kho dữ liệu'
    );
    assert.ok(allEmpsNow.some((e) => e.id === employee.id && e.employment_status === 'RESIGNED'));
    assert.strictEqual(runtimeStore.getCareerHistories(employee.id).length, 2, 'Lịch sử công tác vẫn được bảo toàn');

    // Cảnh báo Re-hire khi ứng viên nộp lại hồ sơ về sau
    const rehireCheck = runtimeStore.checkCandidateRehireWarning({
      nationalId: '079098004512',
    });
    assert.ok(rehireCheck.matchedFormerEmployee);
    assert.strictEqual(rehireCheck.isRehireable, false);

    // Kiểm chứng khóa tài khoản SystemUserAccount & chặn đăng nhập ngay lập tức
    assert.strictEqual(lockedUser.is_active, false);
    assert.strictEqual(lockedUser.account_status, 'LOCKED');
    const loginAfterResign = runtimeStore.findSystemUserForLogin(employee.email);
    assert.strictEqual(loginAfterResign.canLogin, false, 'Nhân sự RESIGNED bắt buộc bị chặn đăng nhập');
    assert.match(loginAfterResign.blockReason || '', /RESIGNED|nghỉ việc/i);
  });

  // =========================================================================
  // PHẦN 5: KIỂM THỬ ROUTE HANDLER `/api/hrm/lifecycle` & NHẬT KÝ AUDIT LOG
  // =========================================================================
  console.log('\n--- PHẦN 5: KIỂM THỬ API ROUTE (/api/hrm/lifecycle) & AUDIT TRAIL ---');

  await testStep('5.1: API /api/hrm/lifecycle xử lý Pre-boarding (validate CCCD 422 -> nộp 200 -> GET theo token)', async () => {
    // Seed 1 invite vào server store
    await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          key: 'hrm_runtime_preboarding_invites',
          items: [{ id: 'pb-api-1', token: 'tok-api-2026', full_name: 'Phạm Hải Đăng', status: 'PENDING' }],
        }),
      })
    );

    const badCccdRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_preboarding_info',
          token: 'tok-api-2026',
          id_card_no: '12345', // Sai chuẩn 9/12 chữ số
          bank_account_no: '99887766',
          bank_name: 'ACB',
        }),
      })
    );
    assert.strictEqual(badCccdRes.status, 422);

    const okSubRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_preboarding_info',
          token: 'tok-api-2026',
          id_card_no: '001099012345',
          tax_code: '8009911223',
          bhxh_no: '0122334455',
          bank_account_no: '9988776655',
          bank_name: 'ACB',
          emergency_contact_name: 'Phạm Văn Bình',
          emergency_contact_phone: '0912345678',
        }),
      })
    );
    assert.strictEqual(okSubRes.status, 200);

    const getByTok = await lifecycleRoute.GET(
      new Request('http://localhost:3000/api/hrm/lifecycle?token=tok-api-2026')
    );
    assert.strictEqual(getByTok.status, 200);
    const tokJson = await getByTok.json();
    assert.strictEqual(tokJson.success, true);
    assert.strictEqual(tokJson.data.status, 'SUBMITTED');
    assert.strictEqual(tokJson.data.id_card_no, '001099012345');
  });

  await testStep('5.2: API append_career_history kiểm soát RBAC (403) & tính bất biến Append-Only (409 khi ghi đè)', async () => {
    const forbiddenRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'append_career_history',
          actor: { id: 'emp-002', name: 'HR Manager', role: 'HR_MANAGER' },
          entry: {
            id: 'ch-api-immutable-1',
            employee_id: 'emp-004',
            effective_date: '2026-11-16',
            new_role_code: 'DEPT_MANAGER',
            new_salary_vnd: 35_000_000,
          },
        }),
      })
    );
    assert.strictEqual(forbiddenRes.status, 403, 'HR_MANAGER tự bổ nhiệm DEPT_MANAGER phải bị chặn 403');

    const createdRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'append_career_history',
          actor: { id: 'emp-001', name: 'Director', role: 'DIRECTOR' },
          entry: {
            id: 'ch-api-immutable-1',
            employee_id: 'emp-004',
            effective_date: '2026-11-16',
            new_role_code: 'DEPT_MANAGER',
            new_salary_vnd: 35_000_000,
          },
        }),
      })
    );
    assert.strictEqual(createdRes.status, 201);

    const overwriteRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'append_career_history',
          actor: { id: 'emp-001', name: 'Director', role: 'DIRECTOR' },
          entry: {
            id: 'ch-api-immutable-1',
            employee_id: 'emp-004',
            effective_date: '2026-11-20',
            new_salary_vnd: 40_000_000,
          },
        }),
      })
    );
    assert.strictEqual(overwriteRes.status, 409, 'Ghi đè ID lịch sử công tác đã tồn tại phải trả 409 Conflict');
  });

  await testStep('5.3: API calculate_notice_period (3/30/45d), verify_clearance_gate (422 -> 200) & Audit Trail toàn trình', async () => {
    const noticeRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'calculate_notice_period',
          contract_type: 'INDEFINITE_TERM',
          submitted_date: '2026-11-01',
          requested_last_day: '2026-11-20',
        }),
      })
    );
    const noticeJson = await noticeRes.json();
    assert.strictEqual(noticeJson.data.required_notice_days, 45);
    assert.strictEqual(noticeJson.data.is_notice_compliant, false);

    // Chưa có clearance trên API store -> 422
    const blockedGateRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_clearance_gate',
          resignation_id: 'res-api-test',
        }),
      })
    );
    assert.strictEqual(blockedGateRes.status, 422);

    // Đồng bộ handover + clearance đủ 100% -> 200
    await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          fullSync: {
            hrm_runtime_handover_items: [
              {
                id: 'ho-api-1',
                resignation_id: 'res-api-test',
                employee_confirmed: true,
                receiver_confirmed: true,
                manager_confirmed: true,
              },
            ],
            hrm_runtime_clearance_checklists: [
              {
                id: 'clr-api-1',
                resignation_id: 'res-api-test',
                assets: [{ asset_id: 'ast-008', returned: true, condition_status: 'GOOD' }],
                it_revoked_access: true,
                it_cleared: true,
                accounting_debt_cleared: true,
                accounting_cleared: true,
                hr_insurance_book_closed: true,
                hr_cleared: true,
              },
            ],
          },
        }),
      })
    );

    const passedGateRes = await lifecycleRoute.POST(
      new Request('http://localhost:3000/api/hrm/lifecycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_clearance_gate',
          resignation_id: 'res-api-test',
        }),
      })
    );
    assert.strictEqual(passedGateRes.status, 200);
    const passedGateJson = await passedGateRes.json();
    assert.strictEqual(passedGateJson.data.is_100_percent_cleared, true);

    // Kiểm tra Audit Logs ghi nhận đầy đủ cả 4 giai đoạn
    const auditLogs = auditLogger.getRuntimeAuditLogs();
    const recordedActions = new Set(auditLogs.map((l) => l.action));
    for (const expectedAction of [
      'PREBOARDING_SUBMIT',
      'ONBOARDING_TASK',
      'PROBATION_TO_OFFICIAL',
      'ATTENDANCE_IMPORT',
      'CALCULATE_PAYROLL',
      'CAREER_PROGRESSION',
      'SUBMIT_RESIGNATION',
      'MANAGER_REASSIGN',
      'HANDOVER_CONFIRM',
      'CLEARANCE_SIGNOFF',
      'FINAL_SETTLEMENT',
    ]) {
      assert.ok(recordedActions.has(expectedAction), `Audit log thiếu sự kiện ${expectedAction}`);
    }
  });
}

try {
  await runLifecycleSuite();
} catch (fatalErr) {
  console.error('Fatal Lifecycle Test Runner Exception:', fatalErr);
  failedTests++;
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup lock errors on Windows
  }
}

console.log('\n======================================================================');
console.log(' 4-STAGE EMPLOYEE LIFECYCLE E2E TEST SUMMARY');
console.log('======================================================================');
console.log(`Total Lifecycle Assertions : ${totalTests}`);
console.log(`Passed                     : ${passedTests} ✓`);
console.log(`Failed                     : ${failedTests} ✗`);
console.log('======================================================================\n');

process.exit(failedTests > 0 ? 1 : 0);
