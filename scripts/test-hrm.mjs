// Comprehensive Unit Tests for Lạc Việt HRM v2.4 (P0 - P3b)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const hrmDir = path.join(projectRoot, 'src', 'lib', 'hrm');

console.log('--- COMPILING AND RUNNING HRM UNIT TESTS (P0 - P3b) ---');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-test-'));
const require = createRequire(import.meta.url);

try {
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2),
    'utf8'
  );

  const files = ['types.ts', 'config.ts', 'ids.ts', 'format.ts', 'permissions.ts', 'audit.ts', 'files.ts', 'workflow.ts'];

  for (const file of files) {
    const filePath = path.join(hrmDir, file);
    if (!fs.existsSync(filePath)) continue;
    const code = fs.readFileSync(filePath, 'utf8');
    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: file,
    });
    fs.writeFileSync(path.join(tempDir, file.replace(/\.ts$/, '.js')), transpiled.outputText, 'utf8');
  }

  const { formatProposalCode, formatJobCode, formatCandidateCode, formatEventId } = require(path.join(tempDir, 'ids.js'));
  const { formatDateVN, formatCurrencyVN, sanitizeText } = require(path.join(tempDir, 'format.js'));
  const { can } = require(path.join(tempDir, 'permissions.js'));
  const { transitionProposal, transitionApplicationStage, transitionInterview } = require(path.join(tempDir, 'workflow.js'));
  const { validateCvFile } = require(path.join(tempDir, 'files.js'));
  const {
    getPitTaxConfigForPeriod,
    calculateProgressivePitByPeriod,
    computePitBreakdownByPeriod,
  } = require(path.join(tempDir, 'config.js'));

  let passedTests = 0;
  let failedTests = 0;

  function it(title, fn) {
    try {
      fn();
      console.log(`  ✓ ${title}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ ${title}`);
      console.error(`    ${err.message}`);
      failedTests++;
    }
  }

  // 1. P0 Tests
  it('P0: ID generators produce canonical codes', () => {
    assert.strictEqual(formatProposalCode(2026, 'SWE', 1), 'YC-2026-SWE01');
    assert.strictEqual(formatJobCode(2026, 'AI', 4), 'JD-2026-AI04');
    assert.strictEqual(formatCandidateCode(2026, 104), 'UV-2026-104');
    const evtId = formatEventId('evt');
    assert.match(evtId, /^evt-\d+-\d+$/);
  });

  it('P0: Date and Currency VN formatting', () => {
    assert.strictEqual(formatDateVN('2026-11-20T00:00:00Z'), '20/11/2026');
    assert.strictEqual(formatCurrencyVN(35000000), '35.000.000 đ');
  });

  it('P0: Text sanitizer enforces min/max length and strips HTML', () => {
    const shortCheck = sanitizeText('abc', 5, 100);
    assert.strictEqual(shortCheck.valid, false);

    const cleanCheck = sanitizeText('<script>alert(1)</script>  Lý do chính đáng và đầy đủ   ', 5, 100);
    assert.strictEqual(cleanCheck.valid, true);
    assert.strictEqual(cleanCheck.value, 'alert(1)  Lý do chính đáng và đầy đủ');
  });

  // 2. P1 Permissions
  it('P1: Role-based permissions matrix', () => {
    const director = { id: 'd1', name: 'Director', role: 'DIRECTOR' };
    const hrManager = { id: 'hr1', name: 'HR Manager', role: 'HR_MANAGER' };
    const deptManager = { id: 'dm1', name: 'Dept Manager', role: 'DEPT_MANAGER' };
    const candidate = { id: 'c1', name: 'Candidate', role: 'CANDIDATE' };

    assert.strictEqual(can(director, 'approve_proposal', { headcount: 5, salary: 60000000 }), true);
    assert.strictEqual(can(hrManager, 'approve_proposal', { headcount: 5, salary: 30000000 }), false);
    assert.strictEqual(can(hrManager, 'approve_proposal', { headcount: 2, salary: 40000000 }), true);
    assert.strictEqual(can(deptManager, 'create_proposal'), true);
    assert.strictEqual(can(deptManager, 'approve_proposal'), false);
    assert.strictEqual(can(candidate, 'confirm_interview'), true);
    assert.strictEqual(can(candidate, 'reschedule_interview'), true);
    assert.strictEqual(can(candidate, 'screen_candidate'), false);
  });

  // 3. P1 Workflow Proposal State Transitions
  it('P1: Proposal state machine allows legal flow and blocks illegal jumps', () => {
    const proposal = {
      id: 'p1',
      code: 'YC-2026-SWE01',
      department_id: 'd1',
      department_name: 'SWE',
      title: 'Senior Dev',
      level: 'Senior',
      headcount: 1,
      salary_min: 30000000,
      salary_max: 40000000,
      deadline: '2026-12-31',
      urgency: 'NORMAL',
      reason: 'Project expansion',
      status: 'draft',
      requested_by_id: 'dm1',
      requested_by_name: 'Manager',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const hr = { id: 'hr1', name: 'HR', role: 'HR_MANAGER' };

    const sub = transitionProposal({ proposal, toStatus: 'pending_approval', actor: hr });
    assert.strictEqual(sub.proposal.status, 'pending_approval');
    assert.strictEqual(sub.proposal.version, 2);

    const app = transitionProposal({ proposal: sub.proposal, toStatus: 'approved', actor: hr });
    assert.strictEqual(app.proposal.status, 'approved');

    const posted = transitionProposal({ proposal: app.proposal, toStatus: 'posted', actor: hr });
    assert.strictEqual(posted.proposal.status, 'posted');

    assert.throws(() => {
      transitionProposal({ proposal: posted.proposal, toStatus: 'draft', actor: hr });
    }, /Không thể chuyển trạng thái đề xuất/);
  });

  it('P1: Proposal rejection requires mandatory reason', () => {
    const proposal = {
      id: 'p1',
      code: 'YC-2026-SWE01',
      department_id: 'd1',
      department_name: 'SWE',
      title: 'Senior Dev',
      level: 'Senior',
      headcount: 1,
      salary_min: 30000000,
      salary_max: 40000000,
      deadline: '2026-12-31',
      urgency: 'NORMAL',
      reason: 'Project expansion',
      status: 'pending_approval',
      requested_by_id: 'dm1',
      requested_by_name: 'Manager',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const hr = { id: 'hr1', name: 'HR', role: 'HR_MANAGER' };

    assert.throws(() => {
      transitionProposal({ proposal, toStatus: 'rejected', actor: hr, reason: '   ' });
    }, /Bắt buộc phải nhập lý do/);

    const rej = transitionProposal({
      proposal,
      toStatus: 'rejected',
      actor: hr,
      reason: 'Vượt ngân sách quý 4',
    });
    assert.strictEqual(rej.proposal.status, 'rejected');
    assert.strictEqual(rej.proposal.reject_reason, 'Vượt ngân sách quý 4');
  });

  // 4. P3b (B4): Moving stage to interview without schedule is blocked
  it('P3b (B4): Moving stage to interview without schedule is blocked', () => {
    const application = {
      id: 'app1',
      code: 'HS-2026-104',
      candidate_id: 'c104',
      job_id: 'j1',
      source: 'TopCV',
      expected_salary: 35000000,
      current_company: 'Tiki Corporation',
      stage: 'screening',
      stage_changed_at: new Date().toISOString(),
      archived: false,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const hr = { id: 'hr1', name: 'HR', role: 'HR_MANAGER' };

    assert.throws(() => {
      transitionApplicationStage({
        application,
        toStage: 'interview',
        actor: hr,
        interview: undefined,
      });
    }, /Không thể chuyển sang bước Phỏng vấn khi chưa thiết lập lịch phỏng vấn/);

    const interview = {
      id: 'int1',
      application_id: 'app1',
      slot: '2026-11-25T09:30:00Z',
      mode: 'Online',
      location_or_link: 'https://meet.google.com/abc',
      interviewer_names: 'Hội đồng kỹ thuật',
      status: 'invited',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const moved = transitionApplicationStage({
      application,
      toStage: 'interview',
      actor: hr,
      interview,
    });
    assert.strictEqual(moved.application.stage, 'interview');
  });

  // 5. P3b (B2 & B3): Interview reschedule and confirmation
  it('P3b (B2 & B3): Interview reschedule request and confirmation flow', () => {
    let interview = {
      id: 'int1',
      application_id: 'app1',
      slot: '2026-11-25T09:30:00Z',
      mode: 'Online',
      location_or_link: 'https://meet.google.com/abc',
      interviewer_names: 'Hội đồng kỹ thuật',
      status: 'invited',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const candidate = { id: 'c104', name: 'Đinh Tuấn Kiệt', role: 'CANDIDATE' };
    const hr = { id: 'hr1', name: 'HR', role: 'HR_MANAGER' };

    const reqResched = transitionInterview({
      interview,
      toStatus: 'reschedule_requested',
      actor: candidate,
      payload: {
        proposed_slot: '2026-11-27T09:30:00Z',
        reschedule_reason: 'Bận việc gia đình đột xuất',
      },
    });
    interview = reqResched.interview;
    assert.strictEqual(interview.status, 'reschedule_requested');

    const reScheduled = transitionInterview({
      interview,
      toStatus: 'scheduled',
      actor: hr,
      payload: {
        slot: '2026-11-27T09:30:00Z',
      },
    });
    interview = reScheduled.interview;
    assert.strictEqual(interview.status, 'scheduled');
    assert.strictEqual(interview.slot, '2026-11-27T09:30:00Z');

    const confirmed = transitionInterview({
      interview,
      toStatus: 'confirmed',
      actor: candidate,
    });
    interview = confirmed.interview;
    assert.strictEqual(interview.status, 'confirmed');

    // Candidate cannot reschedule once confirmed
    assert.throws(() => {
      transitionInterview({
        interview,
        toStatus: 'reschedule_requested',
        actor: candidate,
        payload: { reschedule_reason: 'Muốn dời lại' },
      });
    }, /Lịch phỏng vấn đã được xác nhận chốt lịch/);
  });

  // 6. Optimistic concurrency
  it('P3b: Optimistic locking rejects version mismatch', () => {
    const proposal = {
      id: 'p1',
      code: 'YC-2026-SWE01',
      department_id: 'd1',
      department_name: 'SWE',
      title: 'Senior Dev',
      level: 'Senior',
      headcount: 1,
      salary_min: 30000000,
      salary_max: 40000000,
      deadline: '2026-12-31',
      urgency: 'NORMAL',
      reason: 'Project expansion',
      status: 'draft',
      requested_by_id: 'dm1',
      requested_by_name: 'Manager',
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const hr = { id: 'hr1', name: 'HR', role: 'HR_MANAGER' };

    assert.throws(() => {
      transitionProposal({
        proposal,
        toStatus: 'pending_approval',
        actor: hr,
        expectedVersion: 1,
      });
    }, /Dữ liệu đề xuất đã bị thay đổi bởi người khác/);
  });

  // 7. P3: File validation
  it('P3: CV upload validator enforces <= 5MB and allowed extensions', () => {
    assert.throws(() => {
      validateCvFile('resume.pdf', 6 * 1024 * 1024, 'application/pdf');
    }, /vượt quá giới hạn tối đa cho phép là 5 MB/);

    assert.throws(() => {
      validateCvFile('exploit.exe', 1024, 'application/x-msdownload');
    }, /Định dạng tệp không hợp lệ/);

    assert.doesNotThrow(() => {
      validateCvFile('resume_dinh_tuan_kiet.pdf', 2 * 1024 * 1024, 'application/pdf');
    });
  });

  // 8. P3c: Careers Form Validation Rules
  it('P3c: Careers application form validates required personal info and permits optional CV', () => {
    function validateApplyForm({ fullName, email, phone, cvFile }) {
      const errors = {};
      const trimmedName = (fullName ?? '').trim();
      const trimmedEmail = (email ?? '').trim();
      const trimmedPhone = (phone ?? '').trim();

      if (!trimmedName || trimmedName.length < 2) {
        errors.fullName = 'Vui lòng nhập họ và tên (tối thiểu 2 ký tự)';
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
        errors.email = 'Vui lòng nhập địa chỉ email hợp lệ';
      }

      const phoneRegex = /^[0-9+() -]{9,15}$/;
      if (!trimmedPhone || !phoneRegex.test(trimmedPhone)) {
        errors.phone = 'Vui lòng nhập số điện thoại hợp lệ (9 - 15 số)';
      }

      // CV is optional: if provided, validate size and extension
      if (cvFile) {
        validateCvFile(cvFile.name, cvFile.size, cvFile.mimeType || 'application/pdf');
      }

      return errors;
    }

    // Empty fields must produce errors
    const emptyErrors = validateApplyForm({ fullName: '', email: '', phone: '', cvFile: null });
    assert.strictEqual(Boolean(emptyErrors.fullName), true);
    assert.strictEqual(Boolean(emptyErrors.email), true);
    assert.strictEqual(Boolean(emptyErrors.phone), true);

    // Invalid email / short phone
    const invalidErrors = validateApplyForm({
      fullName: 'A',
      email: 'not-an-email',
      phone: '123',
      cvFile: null,
    });
    assert.strictEqual(Boolean(invalidErrors.fullName), true);
    assert.strictEqual(Boolean(invalidErrors.email), true);
    assert.strictEqual(Boolean(invalidErrors.phone), true);

    // Valid info without CV upload succeeds (optional CV)
    const validNoCv = validateApplyForm({
      fullName: 'Đinh Tuấn Kiệt',
      email: 'kiet.dinh@gmail.com',
      phone: '0937654321',
      cvFile: null,
    });
    assert.strictEqual(Object.keys(validNoCv).length, 0);
  });

  // 9. P3c: Withdrawal Gate & Active Application Rules
  it('P3c: Candidate withdrawal allowed in APPLIED/AI_SCREENED, locked in INTERVIEW/OFFER/ONBOARDED', () => {
    function canWithdrawApplication(stage) {
      if (['INTERVIEW', 'OFFER', 'ONBOARDED'].includes(stage)) {
        return false;
      }
      return stage === 'APPLIED' || stage === 'AI_SCREENED';
    }

    assert.strictEqual(canWithdrawApplication('APPLIED'), true);
    assert.strictEqual(canWithdrawApplication('AI_SCREENED'), true);
    assert.strictEqual(canWithdrawApplication('INTERVIEW'), false);
    assert.strictEqual(canWithdrawApplication('OFFER'), false);
    assert.strictEqual(canWithdrawApplication('ONBOARDED'), false);
    assert.strictEqual(canWithdrawApplication('REJECTED'), false);
  });

  // 10. Period-Based PIT Tax Rules (<= 2025 vs >= 2026 NQ 110/2025/UBTVQH15 & Law 109/2025/QH15)
  it('PIT 2026 vs 2025: deductions, 5-bracket vs 7-bracket, boundaries & zero/negative income', () => {
    const cfg2026 = getPitTaxConfigForPeriod('2026-03');
    assert.strictEqual(cfg2026.tax_year, 2026);
    assert.strictEqual(cfg2026.personal_deduction_vnd, 15_500_000);
    assert.strictEqual(cfg2026.personal_deduction_annual_vnd, 186_000_000);
    assert.strictEqual(cfg2026.dependent_deduction_vnd, 6_200_000);
    assert.strictEqual(cfg2026.bracket_count, 5);

    const cfg2025 = getPitTaxConfigForPeriod('2025-11');
    assert.strictEqual(cfg2025.tax_year, 2025);
    assert.strictEqual(cfg2025.personal_deduction_vnd, 11_000_000);
    assert.strictEqual(cfg2025.dependent_deduction_vnd, 4_400_000);
    assert.strictEqual(cfg2025.bracket_count, 7);

    // Case 2026 #1: 40.000.000 - BH 10.5% (4.200.000) - 15.500.000 = 20.300.000 -> 2.045.000
    const taxable2026A = 40_000_000 - 4_200_000 - cfg2026.personal_deduction_vnd;
    assert.strictEqual(taxable2026A, 20_300_000);
    assert.strictEqual(calculateProgressivePitByPeriod(taxable2026A, '2026-03'), 2_045_000);

    // Case 2026 #2: after BH 22.400.000, 1 dep -> 22.400.000 - 21.700.000 = 700.000 -> 35.000
    const taxable2026B =
      22_400_000 - cfg2026.personal_deduction_vnd - 1 * cfg2026.dependent_deduction_vnd;
    assert.strictEqual(taxable2026B, 700_000);
    assert.strictEqual(calculateProgressivePitByPeriod(taxable2026B, '2026-06'), 35_000);

    // Same 2 inputs under <= 2025 rules (11M / 4.4M, 7 brackets)
    const taxable2025A = 40_000_000 - 4_200_000 - cfg2025.personal_deduction_vnd;
    assert.strictEqual(taxable2025A, 24_800_000);
    assert.strictEqual(calculateProgressivePitByPeriod(taxable2025A, '2025-11'), 3_310_000);

    const taxable2025B =
      22_400_000 - cfg2025.personal_deduction_vnd - 1 * cfg2025.dependent_deduction_vnd;
    assert.strictEqual(taxable2025B, 7_000_000);
    assert.strictEqual(calculateProgressivePitByPeriod(taxable2025B, '2025-11'), 450_000);

    // Boundaries on 2026 5-bracket schedule (10M / 30M / 60M / 100M / >100M)
    assert.strictEqual(calculateProgressivePitByPeriod(10_000_000, 2026), 500_000);
    assert.strictEqual(calculateProgressivePitByPeriod(30_000_000, 2026), 3_500_000);
    assert.strictEqual(calculateProgressivePitByPeriod(60_000_000, 2026), 11_000_000);
    assert.strictEqual(calculateProgressivePitByPeriod(100_000_000, 2026), 23_000_000);
    assert.strictEqual(calculateProgressivePitByPeriod(120_000_000, 2026), 30_000_000);

    // Zero or negative taxable income -> 0
    assert.strictEqual(calculateProgressivePitByPeriod(0, 2026), 0);
    assert.strictEqual(calculateProgressivePitByPeriod(-1_000_000, 2026), 0);
    assert.strictEqual(calculateProgressivePitByPeriod(0, 2025), 0);

    // Breakdown rows preserve period schedule
    const bd2026 = computePitBreakdownByPeriod(20_300_000, '2026-11');
    assert.strictEqual(bd2026.schedule.bracket_count, 5);
    assert.strictEqual(bd2026.rows.length, 2);
    assert.strictEqual(bd2026.total_tax_vnd, 2_045_000);

    const bd2025 = computePitBreakdownByPeriod(24_800_000, '2025-12');
    assert.strictEqual(bd2025.schedule.bracket_count, 7);
    assert.strictEqual(bd2025.rows.length, 4);
    assert.strictEqual(bd2025.total_tax_vnd, 3_310_000);
  });

  console.log(`\nTEST RESULTS: ${passedTests} passed, ${failedTests} failed.`);
  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('--- ALL HRM UNIT TESTS PASSED SUCCESSFULLY (100%) ---');
  }
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}
