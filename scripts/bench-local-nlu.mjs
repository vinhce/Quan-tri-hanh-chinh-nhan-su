import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ensureLocalLlamaServer } from './wake-copilot-space.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const hrmDir = path.join(projectRoot, 'src', 'lib', 'hrm');
const copilotDir = path.join(projectRoot, 'src', 'lib', 'copilot');
const specJsonPath = path.join(projectRoot, 'docs', 'hrm-router-test-cases.json');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-local-nlu-bench-'));
const require = createRequire(import.meta.url);

function p95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return Math.round(sorted[idx]);
}

function avg(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

async function waitForLocalHealth(baseUrl, maxWaitMs = 20_000) {
  const healthUrl = `${new URL(baseUrl).origin}/health`;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(1_000),
      });
      if (res.status === 200) return true;
    } catch {
      // retry until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return false;
}

try {
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2),
    'utf8'
  );
  fs.mkdirSync(path.join(tempDir, 'copilot'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'hrm'), { recursive: true });

  const sources = [
    { srcDir: copilotDir, outSubdir: 'copilot', file: 'smalltalk.ts' },
    { srcDir: copilotDir, outSubdir: 'copilot', file: 'faq-rag.ts' },
    { srcDir: hrmDir, outSubdir: 'hrm', file: 'types.ts' },
    { srcDir: hrmDir, outSubdir: 'hrm', file: 'config.ts' },
    { srcDir: hrmDir, outSubdir: 'hrm', file: 'copilot-router.ts' },
    { srcDir: copilotDir, outSubdir: 'copilot', file: 'local-nlu.ts' },
    { srcDir: copilotDir, outSubdir: 'copilot', file: 'local-templates.ts' },
    { srcDir: copilotDir, outSubdir: 'copilot', file: 'engine-orchestrator.ts' },
  ];

  for (const { srcDir, outSubdir, file } of sources) {
    let code = fs.readFileSync(path.join(srcDir, file), 'utf8');
    code = code
      .replace(/from\s+['"]@\/lib\/hrm\/([^'"]+)['"]/g, "from '../hrm/$1'")
      .replace(/from\s+['"]@\/lib\/copilot\/([^'"]+)['"]/g, "from '../copilot/$1'");
    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: file,
    });
    fs.writeFileSync(
      path.join(tempDir, outSubdir, file.replace(/\.ts$/, '.js')),
      transpiled.outputText,
      'utf8'
    );
  }

  const routerMod = require(path.join(tempDir, 'hrm', 'copilot-router.js'));
  const localNluMod = require(path.join(tempDir, 'copilot', 'local-nlu.js'));
  const orchestratorMod = require(path.join(tempDir, 'copilot', 'engine-orchestrator.js'));

  const { routeCopilotMessage, createInMemoryRouterStateStore, TPL_REFUSE_STANDARD } = routerMod;
  const { callLocalNlu, DEFAULT_LOCAL_BASE_URL } = localNluMod;
  const { runCopilotEngineTurn } = orchestratorMod;

  const baseUrl = (process.env.COPILOT_LOCAL_BASE_URL || DEFAULT_LOCAL_BASE_URL).trim();
  const wakeRes = await ensureLocalLlamaServer({ baseUrl });
  console.log(`[BENCH] Local wake status: ${wakeRes.status} — ${wakeRes.message}`);
  const serverReady =
    wakeRes.status === 'ready' || (await waitForLocalHealth(baseUrl, 20_000));
  if (!serverReady) {
    console.error('[BENCH] Local llama-server did not become ready within 20s. Aborting benchmark.');
    process.exitCode = 1;
    throw new Error('Local llama-server unavailable');
  }

  const spec = JSON.parse(fs.readFileSync(specJsonPath, 'utf8'));
  const NOW_MS = Date.parse('2026-11-24T09:00:00+07:00');
  const USER = {
    userId: 'emp-004',
    employeeCode: 'NV-2024-004',
    fullName: 'Phạm Minh Tuấn',
    role: 'EMPLOYEE',
    roleLabel: 'Nhân viên',
  };

  function makeServices() {
    let seq = 0;
    return {
      async validateRequest(_uid, input) {
        if (input.type === 'annual_leave' && !input.startDate) {
          return { ok: false, errors: [{ code: 'MISSING_FIELD', field: 'startDate' }] };
        }
        return {
          ok: true,
          errors: [],
          normalized: {
            ...input,
            startDate: input.startDate || input.workDate || '2026-11-30',
            endDate: input.endDate || input.startDate || input.workDate || '2026-11-30',
            days: input.days || 1,
            session: input.session || 'full',
            balanceAfter: 10,
            approvalFlow: 'Quản lý trực tiếp → HR',
            nextApprover: 'Quản lý trực tiếp',
            typeLabel: 'Nghỉ phép năm',
            dateText: '30/11/2026',
            reason: input.reason || 'Việc cá nhân',
          },
        };
      },
      async createDraft(_uid, input) {
        seq += 1;
        return {
          draftId: `bench-${seq}`,
          confirmToken: `tok-${seq}`,
          expiresAt: new Date(NOW_MS + 600000).toISOString(),
          kind: 'create',
          preview: {
            type: input.type,
            typeLabel: 'Nghỉ phép năm',
            dateText: '30/11/2026',
            startDate: input.startDate || '2026-11-30',
            endDate: input.endDate || '2026-11-30',
            days: input.days || 1,
            session: input.session || 'full',
            reason: input.reason || 'Việc cá nhân',
            approvalFlow: 'Quản lý trực tiếp → HR',
            nextApprover: 'Quản lý trực tiếp',
          },
        };
      },
      async cancelDraft() {
        return { ok: true };
      },
      async listMyRequests() {
        return [];
      },
      async draftCancelRequest(_uid, id) {
        return { draftId: 'c1', confirmToken: 'tc1', expiresAt: '', kind: 'cancel', targetRequestId: id, preview: {} };
      },
      async searchColleagues() {
        return [];
      },
      async getOrderContext() {
        return { leaveAvailable: 11, noticeDays: 30, pendingApprovalCount: null, explanationsLeft: 2 };
      },
    };
  }

  // Collect 173+ existing queries from spec JSON + additional NLU cases
  const allEndToEndCases = [];
  for (const a of spec.attackCases) {
    allEndToEndCases.push({ id: a.id, input: a.input, group: 'attack' });
  }
  for (const c of spec.cases) {
    const q = Array.isArray(c.input) ? c.input[0] : c.input;
    allEndToEndCases.push({ id: c.id, input: q, group: 'functional' });
  }
  const extraSmalltalk = [
    'how are you', 'How are you?', 'how r u', 'hi', 'Hello', 'xin chào', 'chao ban',
    'good morning', 'cảm ơn', 'thanks', 'bye', 'tạm biệt', 'bạn là ai',
    'bạn khỏe không', 'bạn làm được gì', 'help', 'toi la ai',
    'what is the weather', 'tell me a joke',
  ];
  extraSmalltalk.forEach((q, idx) =>
    allEndToEndCases.push({ id: `smalltalk-${idx + 1}`, input: q, group: 'smalltalk' })
  );
  for (const [grp, list] of Object.entries(spec.smalltalkAndFallbackCases.smalltalkByGroup)) {
    list.forEach((q, idx) =>
      allEndToEndCases.push({ id: `g14-${grp}-${idx + 1}`, input: q, group: 'smalltalk14' })
    );
  }
  spec.smalltalkAndFallbackCases.mustNotSwallow.forEach((q, idx) =>
    allEndToEndCases.push({ id: `mustNotSwallow-${idx + 1}`, input: q, group: 'lookup_or_rbac' })
  );
  spec.smalltalkAndFallbackCases.clarifyNotRefusal.forEach((q, idx) =>
    allEndToEndCases.push({ id: `clarify-${idx + 1}`, input: q, group: 'clarify' })
  );
  spec.smalltalkAndFallbackCases.rbacMustStillRefuse.forEach((q, idx) =>
    allEndToEndCases.push({ id: `rbac-${idx + 1}`, input: q, group: 'rbac' })
  );
  for (const g of spec.conversationalAndDraftCases.englishAndSlangGreetings) {
    allEndToEndCases.push({ id: `greet-slang-${g}`, input: g, group: 'smalltalk' });
  }
  allEndToEndCases.push({
    id: 'conv-admin-payslip',
    input: spec.conversationalAndDraftCases.restrictedAdminPayslipQuery,
    group: 'rbac',
  });
  for (const q of spec.conversationalAndDraftCases.faqRagQueries) {
    allEndToEndCases.push({ id: `faq-${q.slice(0, 20)}`, input: q, group: 'policy' });
  }
  const extraNewCases = [
    { id: 'new-greet-typo', input: 'hiere there', group: 'greeting' },
    { id: 'new-leave-noaccent', input: 'toi con bn ngay phep', group: 'leave_balance' },
    { id: 'new-leave-typo', input: 'toi con bn ngay phpe', group: 'leave_balance' },
    { id: 'new-att-policy', input: 'quy che chma cong va tinh cong the nao', group: 'attendance_policy' },
    { id: 'new-resign-policy', input: 'hd kxdth nghi viec bao trc may ngay', group: 'resign_policy' },
    { id: 'new-probation-salary', input: 'luong thu viec huong bao nhieu phan tram', group: 'payroll_policy' },
    { id: 'new-ot-policy', input: 'he so ot cuoi tuan va ngay le bao nhieu', group: 'overtime_policy' },
    { id: 'new-org', input: 'cong ty co bao nhieu giam doc', group: 'org_structure' },
    { id: 'new-unclear', input: 'cai kia sao roi', group: 'unclear' },
    { id: 'new-rbac-dept-salary', input: 'luong phong ky thuat thang nay', group: 'rbac' },
    { id: 'new-leave-create', input: 'xin nghi phpe ngay 01/12 2 ngay', group: 'leave_create' },
  ];
  allEndToEndCases.push(...extraNewCases);

  // Pad to >= 184 unique runs covering all 173+ router/regression cases + new NLU cases
  for (const ctxCase of spec.smalltalkAndFallbackCases.contextualHistoryCases || []) {
    allEndToEndCases.push({ id: `ctx-${ctxCase.id}`, input: ctxCase.input, group: 'contextual' });
  }
  for (const [t1, t2] of spec.conversationalAndDraftCases.twoTierGibberishTurns || []) {
    allEndToEndCases.push({ id: `gib-1-${t1}`, input: t1, group: 'clarify' });
    allEndToEndCases.push({ id: `gib-2-${t2}`, input: t2, group: 'clarify' });
  }
  for (const rep of spec.conversationalAndDraftCases.antiRepeatInputs || []) {
    allEndToEndCases.push({ id: `repeat-${rep}`, input: rep, group: 'smalltalk' });
  }
  for (const q of ['giam doc la ai', 'admin la ai', 'sep la ai', 'ai duyet don nay']) {
    allEndToEndCases.push({ id: `org-${q}`, input: q, group: 'org_structure' });
  }
  for (const v of ['👋 xin chaooo 😊', 'camonnn ❤️', 'laam tot lam 👍', 'okeee', 'alooo', 'byeee', '=))', ':v']) {
    allEndToEndCases.push({ id: `emoji-${v}`, input: v, group: 'smalltalk' });
  }
  for (const d of [
    'tao don nghi phep 1 thang cho t',
    'nghi phep nua thang',
    'nghi phep 2 tuan',
    'xin nghi phep ngay 1 thang 12 ca ngay',
    'xin nghi phep thu 2 tuan sau ca ngay',
  ]) {
    allEndToEndCases.push({ id: `dur-${d}`, input: d, group: 'functional' });
  }
  for (const g of ['helo ther', 'good moring', 'xin choa', 'yo bro', 'co ai o day khong', 'hwo are you', 'hello there', 'hey there']) {
    allEndToEndCases.push({ id: `typo-greet-${g}`, input: g, group: 'smalltalk' });
  }
  const extraLegacyReps = [
    'hr la ai',
    'truong phong la ai',
    'xin chào cho tôi hỏi phép năm',
    'hợp đồng không xác định thời hạn nghỉ việc phải báo trước bao nhiêu ngày?',
    'quy trình duyệt đơn như thế nào',
    't con bao nhieu ngay nghi phep',
    'luong cua t thang nay',
  ];
  extraLegacyReps.forEach((q, idx) =>
    allEndToEndCases.push({ id: `reg-extra-${idx + 1}`, input: q, group: 'regression' })
  );

  const e2eLatencies = [];
  const tierCounts = {};
  let clarifyCount = 0;

  for (const tc of allEndToEndCases) {
    const store = createInMemoryRouterStateStore();
    const services = makeServices();
    const res = await runCopilotEngineTurn({
      engine: 'local',
      query: tc.input,
      history: [],
      confidenceThreshold: 0.6,
      hasGeminiKey: false,
      isKeyboardSmash: /(?:asdfg|qwerty|zxcvb|hjkl)/i.test(tc.input),
      runRouter: (delegateToLlm) =>
        routeCopilotMessage({
          query: tc.input,
          user: USER,
          services,
          store,
          nowMs: NOW_MS,
          personalizeSmalltalk: true,
          delegateUnclearAndCasualToLlm: delegateToLlm,
        }),
      checkSecurityOrRbac: (effQ) => {
        if (
          /luong.*(?:nguyen van an|nhan vien|giam doc|admin|phong ky thuat|phong ban)|ignore previous|system prompt/i.test(
            effQ.toLowerCase()
          )
        ) {
          return { reply: TPL_REFUSE_STANDARD, reason: 'rbac_blocked' };
        }
        return null;
      },
      runLocalNlu: (effQ) => callLocalNlu({ query: effQ, baseUrl, autoWake: false }),
      templateCtx: {
        actorRole: 'EMPLOYEE',
        actorRoleLabel: 'Nhân viên',
        actorEmployeeCode: 'NV-2024-004',
        actorFullName: 'Phạm Minh Tuấn',
        actorDepartment: 'Phòng Kỹ thuật Phần mềm',
        isProbation: false,
        leaveBalance: { standard: 12, carriedOver: 0, used: 2, pending: 0, remaining: 10, year: 2026 },
        noticeDays: 30,
        pendingApprovalCount: null,
        lookupOwnPayslip: () =>
          'Phiếu lương PS-202611-004 (kỳ 2026-11): Thực nhận 21.850.000 ₫.',
        lookupOrgStructure: () => 'Công ty hiện có 2 Giám đốc điều hành.',
      },
      sanitizeOutput: (reply) => ({ ok: true, sanitizedReply: reply }),
      logSink: () => {},
    });

    e2eLatencies.push(res.latencyMs);
    tierCounts[res.tier] = (tierCounts[res.tier] || 0) + 1;
    if (res.tier === 'clarify') clarifyCount += 1;
  }

  // Direct NLU L2 evaluation against llama-server (:8001) with JSON schema
  const directNluSuite = [
    { input: 'toi con bn ngay phep', expectedIntent: 'leave_balance' },
    { input: 'toi con bn ngay phpe', expectedIntent: 'leave_balance' },
    { input: 'phep nam con lai cua t', expectedIntent: 'leave_balance' },
    { input: 'xin nghi phpe ngay 01/12 2 ngay', expectedIntent: 'leave_create', expectedSlots: { leave_type: 'annual_leave', date_from: '01/12' } },
    { input: 'nghi khong luong ngay 05/12', expectedIntent: 'leave_create', expectedSlots: { leave_type: 'unpaid_leave', date_from: '05/12' } },
    { input: 'quy dinh phep nam cho nhan vien thu viec', expectedIntent: 'leave_policy' },
    { input: 'quy che chma cong va tinh cong the nao', expectedIntent: 'attendance_policy' },
    { input: 'di lam bao nhieu gio duoc tinh nua cong', expectedIntent: 'attendance_policy' },
    { input: 'giai trinh cham cong ngay 23/11', expectedIntent: 'attendance_explain', expectedSlots: { date_from: '23/11' } },
    { input: 'dang ky ot ngay 28/11', expectedIntent: 'overtime_create', expectedSlots: { date_from: '28/11' } },
    { input: 'he so ot cuoi tuan va ngay le bao nhieu', expectedIntent: 'overtime_policy' },
    { input: 'luong cua t thang nay bao nhieu', expectedIntent: 'payroll_self' },
    { input: 'luong thu viec huong bao nhieu phan tram', expectedIntent: 'payroll_policy' },
    { input: 'co can dang nhap de xem phieu luong ko', expectedIntent: 'payroll_policy' },
    { input: 'toi muon nghi viec', expectedIntent: 'resign_request' },
    { id: 'resign-pol', input: 'hd kxdth nghi viec bao trc may ngay', expectedIntent: 'resign_policy' },
    { input: 'cong ty co bao nhieu giam doc', expectedIntent: 'org_structure' },
    { input: 'm co tao duoc don nghi phep ko', expectedIntent: 'request_capability' },
    { input: 'duyet luon don cua nhom toi', expectedIntent: 'request_approve_blocked' },
    { input: 'luong phong ky thuat thang nay', expectedIntent: 'cross_employee_blocked', expectedSlots: { department: 'ky thuat' } },
    { input: 'hiere there', expectedIntent: 'smalltalk_greeting' },
    { input: 'cai kia sao roi', expectedIntent: 'unclear' },
  ];

  const directLatencies = [];
  let intentCorrect = 0;
  let slotsTotal = 0;
  let slotsCorrect = 0;
  let directClarifies = 0;
  const misses = [];

  for (const dc of directNluSuite) {
    const r = await callLocalNlu({ query: dc.input, baseUrl, autoWake: false });
    directLatencies.push(r.latencyMs);

    const gotIntent = r.ok && r.nlu ? r.nlu.intent : `ERR:${r.errorCode || 'UNKNOWN'}`;
    const conf = r.ok && r.nlu ? r.nlu.confidence : 0;
    if (!r.ok || !r.nlu || r.nlu.intent === 'unclear' || conf < 0.6) {
      directClarifies += 1;
    }

    if (gotIntent === dc.expectedIntent) {
      intentCorrect += 1;
    } else {
      misses.push({
        input: dc.input,
        expected: dc.expectedIntent,
        got: `${gotIntent} (conf=${conf})`,
        latencyMs: r.latencyMs,
      });
    }

    if (dc.expectedSlots && r.ok && r.nlu) {
      for (const [k, expectedVal] of Object.entries(dc.expectedSlots)) {
        slotsTotal += 1;
        const actualVal = String(r.nlu.slots[k] || '').toLowerCase();
        if (actualVal.includes(String(expectedVal).toLowerCase())) {
          slotsCorrect += 1;
        }
      }
    }
  }

  const intentPct = ((intentCorrect / directNluSuite.length) * 100).toFixed(1);
  const slotPct = slotsTotal > 0 ? ((slotsCorrect / slotsTotal) * 100).toFixed(1) : 'N/A';

  console.log('\n=== LOCAL NLU BENCHMARK (engine=local) ===');
  console.table([
    {
      Metric: 'E2E Cases Executed (173+ & new)',
      Value: `${allEndToEndCases.length} cases`,
    },
    {
      Metric: 'E2E Tier Distribution',
      Value: JSON.stringify(tierCounts),
    },
    {
      Metric: 'E2E Latency avg / p95',
      Value: `${avg(e2eLatencies)} ms / ${p95(e2eLatencies)} ms`,
    },
    {
      Metric: 'E2E Clarify Count',
      Value: `${clarifyCount}`,
    },
    {
      Metric: 'Direct :8001 NLU Intent Accuracy',
      Value: `${intentCorrect}/${directNluSuite.length} (${intentPct}%)`,
    },
    {
      Metric: 'Direct :8001 NLU Slot Accuracy',
      Value: `${slotsCorrect}/${slotsTotal} (${slotPct}%)`,
    },
    {
      Metric: 'Direct :8001 NLU Latency avg / p95',
      Value: `${avg(directLatencies)} ms / ${p95(directLatencies)} ms`,
    },
    {
      Metric: 'Direct :8001 NLU Clarify/Uncertain Count',
      Value: `${directClarifies}/${directNluSuite.length}`,
    },
  ]);

  if (misses.length > 0) {
    console.log('\n[Direct :8001 Mismatches]');
    console.table(misses.slice(0, 10));
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
