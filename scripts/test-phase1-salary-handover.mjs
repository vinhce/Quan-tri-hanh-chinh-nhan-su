import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('--- COMPILING AND RUNNING PHASE 1 TESTS (SALARY BAND & WORK HANDOVER BRIDGE) ---');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-phase1-test-'));
const require = createRequire(import.meta.url);

try {
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2),
    'utf8'
  );

  const filesToTranspile = [
    { src: 'src/mock/types.ts', dest: 'types.js' },
    { src: 'src/mock/employees.ts', dest: 'employees.js' },
    { src: 'src/mock/work-items.ts', dest: 'work-items.js' },
    { src: 'src/lib/hrm/config.ts', dest: 'config.js' },
    { src: 'src/lib/hrm/salary-band.ts', dest: 'salary-band.js' },
    { src: 'src/lib/hrm/work-items-store.ts', dest: 'work-items-store.js' },
    { src: 'src/lib/hrm/work-handover-bridge.ts', dest: 'work-handover-bridge.js' },
  ];

  for (const { src, dest } of filesToTranspile) {
    const filePath = path.join(projectRoot, src);
    assert.ok(fs.existsSync(filePath), `Missing source file: ${src}`);
    let code = fs.readFileSync(filePath, 'utf8');
    code = code
      .replace(/['"]\.\.\/\.\.\/mock\/types['"]/g, "'./types'")
      .replace(/['"]\.\.\/\.\.\/mock\/employees['"]/g, "'./employees'")
      .replace(/['"]\.\.\/\.\.\/mock\/work-items['"]/g, "'./work-items'")
      .replace(/['"]\.\/types['"]/g, "'./types'")
      .replace(/['"]\.\/config['"]/g, "'./config'")
      .replace(/@\/mock\/types/g, './types')
      .replace(/@\/mock\/employees/g, './employees')
      .replace(/@\/mock\/work-items/g, './work-items')
      .replace(/@\/lib\/hrm\/config/g, './config');

    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: path.basename(src),
    });
    fs.writeFileSync(path.join(tempDir, dest), transpiled.outputText, 'utf8');
  }

  const memoryStorage = {};
  global.window = {
    localStorage: {
      getItem: (k) => (k in memoryStorage ? memoryStorage[k] : null),
      setItem: (k, v) => {
        memoryStorage[k] = String(v);
      },
      removeItem: (k) => {
        delete memoryStorage[k];
      },
    },
    dispatchEvent: () => true,
  };
  global.CustomEvent = class {
    constructor(type, opts) {
      this.type = type;
      this.detail = opts?.detail;
    }
  };

  const salaryBand = require(path.join(tempDir, 'salary-band.js'));
  const workItemsStore = require(path.join(tempDir, 'work-items-store.js'));
  const bridge = require(path.join(tempDir, 'work-handover-bridge.js'));
  const mockWork = require(path.join(tempDir, 'work-items.js'));

  let passed = 0;
  let failed = 0;
  function it(title, fn) {
    try {
      fn();
      console.log(`  ✓ ${title}`);
      passed += 1;
    } catch (err) {
      console.error(`  ✗ ${title}`);
      console.error(`    ${err && err.stack ? err.stack.split('\n')[0] : err}`);
      failed += 1;
    }
  }

  // 1. salary-band.ts tests
  it('resolvePositionGradeSteps builds default S1..S4 and supports custom steps', () => {
    const band = { salary_band_min_vnd: 20_000_000, salary_band_max_vnd: 32_000_000 };
    const steps = salaryBand.resolvePositionGradeSteps(band);
    assert.equal(steps.length, 4);
    assert.equal(steps[0].step, 'S1');
    assert.equal(steps[0].salary_vnd, 20_000_000);
    assert.equal(steps[3].step, 'S4');
    assert.equal(steps[3].salary_vnd, 32_000_000);

    const custom = salaryBand.resolvePositionGradeSteps({
      ...band,
      grade_steps: [{ step: 'S2', label: 'Senior Step 2', salary_vnd: 24_500_000 }],
    });
    assert.equal(custom[1].salary_vnd, 24_500_000);
    assert.equal(custom[1].label, 'Senior Step 2');
    assert.equal(salaryBand.resolveGradeStepForSalary(24_600_000, custom[1] ? { ...band, grade_steps: custom } : band), 'S2');
  });

  it('computeCompaRatio and computeRangePenetration are distinct & near-ceiling uses >= 0.95', () => {
    const band = { salary_band_min_vnd: 20_000_000, salary_band_max_vnd: 30_000_000 };
    // Midpoint = 25M -> at 25M, compaRatio = 1.0, rangePenetration = 0.5
    assert.equal(salaryBand.computeCompaRatio(25_000_000, band), 1);
    assert.equal(salaryBand.computeRangePenetration(25_000_000, band), 0.5);
    assert.equal(salaryBand.isNearSalaryBandCeiling(25_000_000, band), false);

    // 29.4M -> penetration 0.94 (not ceiling), 29.5M -> penetration 0.95 (ceiling!)
    assert.equal(salaryBand.isNearSalaryBandCeiling(29_400_000, band), false);
    assert.equal(salaryBand.isNearSalaryBandCeiling(29_500_000, band), true);
  });

  it('validateSalaryInBand rejects below min / above max and accepts within band', () => {
    const band = { salary_band_min_vnd: 15_000_000, salary_band_max_vnd: 25_000_000 };
    assert.equal(salaryBand.validateSalaryInBand(14_900_000, band).valid, false);
    assert.equal(salaryBand.validateSalaryInBand(25_100_000, band).valid, false);
    const ok = salaryBand.validateSalaryInBand(24_800_000, band);
    assert.equal(ok.valid, true);
    assert.equal(ok.isNearCeiling, true);
  });

  it('computeNextReviewDate adds 6 months safely across month boundaries', () => {
    assert.equal(salaryBand.computeNextReviewDate('2026-01-15'), '2026-07-15');
    assert.equal(salaryBand.computeNextReviewDate('2026-08-31'), '2027-02-28');
  });

  it('validateProbationDurationDays enforces 60 / 30 / 6 day legal limits', () => {
    assert.equal(salaryBand.validateProbationDurationDays(60, 'COLLEGE_OR_HIGHER').valid, true);
    assert.equal(salaryBand.validateProbationDurationDays(61, 'COLLEGE_OR_HIGHER').valid, false);
    assert.equal(salaryBand.validateProbationDurationDays(30, 'INTERMEDIATE_VOCATIONAL').valid, true);
    assert.equal(salaryBand.validateProbationDurationDays(31, 'INTERMEDIATE_VOCATIONAL').valid, false);
    assert.equal(salaryBand.validateProbationDurationDays(6, 'OTHER').valid, true);
    assert.equal(salaryBand.validateProbationDurationDays(7, 'OTHER').valid, false);
  });

  // 2. work-items-store.ts migration & RBAC tests
  it('migrateWorkItemsPayload safely migrates legacy bare arrays and ignores malformed entries', () => {
    const legacy = [
      { id: 'wi-old-1', owner_employee_id: 'emp-004', title: 'Legacy task', status: 'IN_PROGRESS' },
      { id: '', owner_employee_id: 'emp-004', title: 'Invalid empty id' },
      null,
    ];
    const migrated = workItemsStore.migrateWorkItemsPayload(legacy);
    assert.equal(migrated.schema_version, 1);
    assert.equal(migrated.items.length, 1);
    assert.equal(migrated.items[0].id, 'wi-old-1');
    assert.equal(migrated.items[0].progress_percent, 0);

    // Legacy localStorage value without schema_version auto-migrates without crashing
    global.window.localStorage.setItem(workItemsStore.STORAGE_WORK_ITEMS_KEY, JSON.stringify(legacy));
    const loaded = workItemsStore.getWorkItems();
    assert.equal(loaded.length, 1);
    const savedEnvelope = JSON.parse(
      global.window.localStorage.getItem(workItemsStore.STORAGE_WORK_ITEMS_KEY)
    );
    assert.equal(savedEnvelope.schema_version, 1);
  });

  it('getWorkItemsForActor enforces RBAC across 5 roles', () => {
    const emps = [
      { id: 'emp-004', employee_code: 'NV-2024-004', department_id: 'dept-tech-swe' },
      { id: 'emp-005', employee_code: 'NV-2024-005', department_id: 'dept-tech-data' },
      { id: 'emp-008', employee_code: 'NV-2025-008', department_id: 'dept-hr' },
    ];
    const all = mockWork.MOCK_WORK_ITEMS;
    assert.equal(
      workItemsStore.getWorkItemsForActor({
        role: 'EMPLOYEE',
        actorEmployee: emps[0],
        employees: emps,
        allWorkItems: all,
      }).every((w) => w.owner_employee_id === 'emp-004'),
      true
    );
    const deptItems = workItemsStore.getWorkItemsForActor({
      role: 'DEPT_MANAGER',
      actorEmployee: emps[1],
      employees: emps,
      managedDepartmentIds: ['dept-tech-data'],
      allWorkItems: all,
    });
    assert.equal(
      deptItems.every((w) => w.department_id === 'dept-tech-data' || w.owner_employee_id === 'emp-005'),
      true
    );
    const hrItems = workItemsStore.getWorkItemsForActor({
      role: 'HR_MANAGER',
      actorEmployee: emps[2],
      employees: emps,
      allWorkItems: all,
    });
    assert.equal(hrItems.length, all.length);
  });

  // 3. work-handover-bridge.ts tests
  it('syncIncompleteWorkItemsToHandovers scans status != DONE and is idempotent', () => {
    const emp4 = {
      id: 'emp-004',
      employee_code: 'NV-2024-004',
      full_name: 'Phạm Minh Tuấn',
      department_id: 'dept-tech-swe',
    };
    const receiver = {
      id: 'emp-009',
      employee_code: 'NV-2025-009',
      full_name: 'Bùi Trọng Nghĩa',
    };

    const pass1 = bridge.syncIncompleteWorkItemsToHandovers({
      employee: emp4,
      sourceType: 'RESIGNATION',
      sourceRefId: 'res-test-01',
      workItems: mockWork.MOCK_WORK_ITEMS,
      existingHandovers: [],
      defaultReceiver: receiver,
    });
    // emp-004 has 2 incomplete items (IN_PROGRESS, TODO) and 1 DONE item
    assert.equal(pass1.createdItems.length, 2);

    // Second run with same existing items must produce 0 duplicates
    const pass2 = bridge.syncIncompleteWorkItemsToHandovers({
      employee: emp4,
      sourceType: 'RESIGNATION',
      sourceRefId: 'res-test-01',
      workItems: mockWork.MOCK_WORK_ITEMS,
      existingHandovers: pass1.createdItems,
      defaultReceiver: receiver,
    });
    assert.equal(pass2.createdItems.length, 0);
  });

  it('evaluateResignationWorkHandoverGate blocks incomplete fields or 3-way confirmations', () => {
    const emp4 = {
      id: 'emp-004',
      employee_code: 'NV-2024-004',
      full_name: 'Phạm Minh Tuấn',
    };
    const receiver = {
      id: 'emp-009',
      employee_code: 'NV-2025-009',
      full_name: 'Bùi Trọng Nghĩa',
    };
    const synced = bridge.syncIncompleteWorkItemsToHandovers({
      employee: emp4,
      sourceType: 'RESIGNATION',
      sourceRefId: 'res-gate-01',
      workItems: mockWork.MOCK_WORK_ITEMS,
      existingHandovers: [],
      defaultReceiver: receiver,
    }).createdItems;

    // Missing receiver_confirmed & manager_approved -> blocked
    const blockedGate = bridge.evaluateResignationWorkHandoverGate({
      resignationId: 'res-gate-01',
      employeeId: 'emp-004',
      workItems: mockWork.MOCK_WORK_ITEMS,
      handovers: synced,
    });
    assert.equal(blockedGate.passed, false);
    assert.equal(blockedGate.incompleteWorkCount, 2);

    // Mark 1 completed but remove deliverable_url -> still blocked
    const partialCompleted = synced.map((h, idx) =>
      idx === 0
        ? { ...h, receiver_confirmed: true, manager_approved: true, status: 'COMPLETED', deliverable_url: '' }
        : { ...h, receiver_confirmed: true, manager_approved: true, status: 'COMPLETED' }
    );
    const missingUrlGate = bridge.evaluateResignationWorkHandoverGate({
      resignationId: 'res-gate-01',
      employeeId: 'emp-004',
      workItems: mockWork.MOCK_WORK_ITEMS,
      handovers: partialCompleted,
    });
    assert.equal(missingUrlGate.passed, false);

    // All 4 fields + 3 confirmations complete -> passes
    const fullCompleted = synced.map((h) => ({
      ...h,
      receiver_confirmed: true,
      manager_approved: true,
      status: 'COMPLETED',
    }));
    const passedGate = bridge.evaluateResignationWorkHandoverGate({
      resignationId: 'res-gate-01',
      employeeId: 'emp-004',
      workItems: mockWork.MOCK_WORK_ITEMS,
      handovers: fullCompleted,
    });
    assert.equal(passedGate.passed, true);
    assert.equal(passedGate.completedHandoverCount, 2);
  });

  it('evaluateTransferWorkHandoverGate blocks DEPARTMENT_TRANSFER separately from Clearance', () => {
    const emp4 = { id: 'emp-004', employee_code: 'NV-2024-004', full_name: 'Phạm Minh Tuấn' };
    const transferSynced = bridge.syncIncompleteWorkItemsToHandovers({
      employee: emp4,
      sourceType: 'DEPARTMENT_TRANSFER',
      sourceRefId: 'QD-TR-001',
      workItems: mockWork.MOCK_WORK_ITEMS,
      existingHandovers: [],
    }).createdItems;

    const transferBlocked = bridge.evaluateTransferWorkHandoverGate({
      transferRefId: 'QD-TR-001',
      employeeId: 'emp-004',
      workItems: mockWork.MOCK_WORK_ITEMS,
      handovers: transferSynced,
    });
    assert.equal(transferBlocked.passed, false);

    // Resignation clearance does NOT count DEPARTMENT_TRANSFER items for another resignationId
    const resCheck = bridge.evaluateResignationWorkHandoverGate({
      resignationId: 'res-other',
      employeeId: 'emp-004',
      workItems: [],
      handovers: transferSynced,
    });
    assert.equal(resCheck.passed, true);
  });

  const mockEmployeesMod = require(path.join(tempDir, 'employees.js'));

  it('MOCK_EMPLOYEES backfill matches salary-band rules for 27 ACTIVE employees and leaves emp-011 unset', () => {
    const posMap = new Map(mockEmployeesMod.MOCK_POSITIONS.map((p) => [p.id, p]));
    assert.equal(mockEmployeesMod.MOCK_EMPLOYEES.length, 28);
    let activeChecked = 0;
    for (const emp of mockEmployeesMod.MOCK_EMPLOYEES) {
      if (emp.id === 'emp-011') {
        assert.equal(emp.employment_status, 'PROBATION');
        assert.equal(emp.official_date, undefined);
        assert.equal(emp.grade_step, undefined);
        assert.equal(emp.next_review_date, undefined);
        continue;
      }
      assert.equal(emp.employment_status, 'ACTIVE');
      const pos = posMap.get(emp.position_id);
      assert.ok(pos, `Missing position ${emp.position_id}`);
      assert.equal(emp.official_date, emp.join_date);
      assert.equal(emp.grade_step, salaryBand.resolveGradeStepForSalary(emp.base_salary_vnd, pos));
      assert.equal(emp.next_review_date, salaryBand.computeNextReviewDate(emp.official_date, 6));
      activeChecked += 1;
    }
    assert.equal(activeChecked, 27);
  });

  it('3-tier transfer policy: HARD_BLOCK on dept change, SOFT_WARNING same-dept position/role change, NONE on PROMOTION/SALARY_ADJUSTMENT', () => {
    for (const ct of ['DEPARTMENT_TRANSFER', 'TRANSFER', 'ROLE_CHANGE']) {
      const evalHard = bridge.evaluateTransferHandoverPolicy({
        changeType: ct,
        currentDepartmentId: 'dept-tech-swe',
        newDepartmentId: 'dept-tech-data',
        currentPositionId: 'pos-04',
        newPositionId: 'pos-05',
        currentRoleCode: 'EMPLOYEE',
        newRoleCode: 'EMPLOYEE',
        transferRefId: 'QD-HARD-01',
        employeeId: 'emp-004',
        workItems: mockWork.MOCK_WORK_ITEMS,
        handovers: [],
      });
      assert.equal(evalHard.level, 'HARD_BLOCK');
      assert.equal(evalHard.blocked, true);
      assert.ok(evalHard.blockingReasons.length >= 1);
    }

    const evalSoft = bridge.evaluateTransferHandoverPolicy({
      changeType: 'ROLE_CHANGE',
      currentDepartmentId: 'dept-tech-swe',
      newDepartmentId: 'dept-tech-swe',
      currentPositionId: 'pos-04',
      newPositionId: 'pos-03',
      currentRoleCode: 'EMPLOYEE',
      newRoleCode: 'DEPT_MANAGER',
      transferRefId: 'QD-SOFT-01',
      employeeId: 'emp-004',
      workItems: mockWork.MOCK_WORK_ITEMS,
      handovers: [],
    });
    assert.equal(evalSoft.level, 'SOFT_WARNING');
    assert.equal(evalSoft.blocked, false);
    assert.equal(evalSoft.blockingReasons.length, 0);
    assert.equal(evalSoft.warnings.length, 1);
    assert.ok(evalSoft.incompleteWorkCount >= 1);

    const evalPromo = bridge.evaluateTransferHandoverPolicy({
      changeType: 'PROMOTION',
      currentDepartmentId: 'dept-tech-swe',
      newDepartmentId: 'dept-tech-data',
      currentPositionId: 'pos-04',
      newPositionId: 'pos-03',
      currentRoleCode: 'EMPLOYEE',
      newRoleCode: 'DEPT_MANAGER',
      transferRefId: 'QD-PROMO-01',
      employeeId: 'emp-004',
      workItems: mockWork.MOCK_WORK_ITEMS,
      handovers: [],
    });
    assert.equal(evalPromo.level, 'NONE');
    assert.equal(evalPromo.blocked, false);
    assert.equal(evalPromo.warnings.length, 0);

    const evalSalaryOnly = bridge.evaluateTransferHandoverPolicy({
      changeType: 'SALARY_ADJUSTMENT',
      currentDepartmentId: 'dept-tech-swe',
      newDepartmentId: 'dept-tech-swe',
      currentPositionId: 'pos-04',
      newPositionId: 'pos-04',
      currentRoleCode: 'EMPLOYEE',
      newRoleCode: 'EMPLOYEE',
      transferRefId: 'QD-SAL-01',
      employeeId: 'emp-004',
      workItems: mockWork.MOCK_WORK_ITEMS,
      handovers: [],
    });
    assert.equal(evalSalaryOnly.level, 'NONE');
    assert.equal(evalSalaryOnly.blocked, false);
  });

  console.log(`\nPHASE1_TEST_SUMMARY: PASSED=${passed}, FAILED=${failed}, TOTAL=${passed + failed}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
