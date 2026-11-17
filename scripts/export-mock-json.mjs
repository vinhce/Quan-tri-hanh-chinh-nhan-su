import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const mockSrcDir = path.join(projectRoot, 'src', 'mock');
const publicMockDir = path.join(projectRoot, 'public', 'mock');
const webMockDir = path.join(projectRoot, 'web', 'mock');

const sourceFiles = [
  'types.ts',
  'employees.ts',
  'attendance.ts',
  'payroll.ts',
  'ats.ts',
  'admin.ts',
  'copilot.ts',
];

function exportMockJson() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-mock-export-'));

  try {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ type: 'commonjs' }, null, 2),
      'utf8'
    );

    for (const fileName of sourceFiles) {
      const srcPath = path.join(mockSrcDir, fileName);
      const sourceText = fs.readFileSync(srcPath, 'utf8');
      const transpiled = ts.transpileModule(sourceText, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
        },
        fileName,
      });

      const outName = fileName.replace(/\.ts$/, '.js');
      fs.writeFileSync(path.join(tempDir, outName), transpiled.outputText, 'utf8');
    }

    const requireFromTemp = createRequire(path.join(tempDir, 'index.js'));

    const employeesMod = requireFromTemp(path.join(tempDir, 'employees.js'));
    const attendanceMod = requireFromTemp(path.join(tempDir, 'attendance.js'));
    const payrollMod = requireFromTemp(path.join(tempDir, 'payroll.js'));
    const atsMod = requireFromTemp(path.join(tempDir, 'ats.js'));
    const adminMod = requireFromTemp(path.join(tempDir, 'admin.js'));
    const copilotMod = requireFromTemp(path.join(tempDir, 'copilot.js'));

    const payloads = {
      'employees.json': {
        MOCK_DEPARTMENTS: employeesMod.MOCK_DEPARTMENTS,
        MOCK_DEPARTMENT_TREE: employeesMod.MOCK_DEPARTMENT_TREE,
        MOCK_POSITIONS: employeesMod.MOCK_POSITIONS,
        MOCK_EMPLOYEES: employeesMod.MOCK_EMPLOYEES,
        MOCK_CONTRACTS: employeesMod.MOCK_CONTRACTS,
        MOCK_BURNOUT_ALERTS: employeesMod.MOCK_BURNOUT_ALERTS,
        MOCK_KPI_RECORDS: employeesMod.MOCK_KPI_RECORDS,
        MOCK_HEADCOUNT_TREND: employeesMod.MOCK_HEADCOUNT_TREND,
        mockDepartments: employeesMod.MOCK_DEPARTMENTS,
        mockDepartmentTree: employeesMod.MOCK_DEPARTMENT_TREE,
        mockPositions: employeesMod.MOCK_POSITIONS,
        mockEmployees: employeesMod.MOCK_EMPLOYEES,
        mockContracts: employeesMod.MOCK_CONTRACTS,
        mockBurnoutAlerts: employeesMod.MOCK_BURNOUT_ALERTS,
        mockKpiRecords: employeesMod.MOCK_KPI_RECORDS,
        mockHeadcountTrend: employeesMod.MOCK_HEADCOUNT_TREND,
      },
      'attendance.json': {
        MOCK_WORK_SHIFTS: attendanceMod.MOCK_WORK_SHIFTS,
        MOCK_MONTHLY_ATTENDANCE: attendanceMod.MOCK_MONTHLY_ATTENDANCE,
        MOCK_LEAVE_OVERTIME_REQUESTS: attendanceMod.MOCK_LEAVE_OVERTIME_REQUESTS,
        MOCK_ANNUAL_LEAVE_BALANCES: attendanceMod.MOCK_ANNUAL_LEAVE_BALANCES,
        mockWorkShifts: attendanceMod.MOCK_WORK_SHIFTS,
        mockMonthlyAttendance: attendanceMod.MOCK_MONTHLY_ATTENDANCE,
        mockLeaveRequests: attendanceMod.MOCK_LEAVE_OVERTIME_REQUESTS,
        mockLeaveOvertimeRequests: attendanceMod.MOCK_LEAVE_OVERTIME_REQUESTS,
        mockAnnualLeaveBalances: attendanceMod.MOCK_ANNUAL_LEAVE_BALANCES,
      },
      'payroll.json': {
        MOCK_PAYROLL_FORMULA: payrollMod.MOCK_PAYROLL_FORMULA,
        PIT_TAX_BRACKETS: payrollMod.PIT_TAX_BRACKETS,
        MOCK_PAYROLL_RECORDS: payrollMod.MOCK_PAYROLL_RECORDS,
        MOCK_PERSONAL_PAYSLIP: payrollMod.MOCK_PERSONAL_PAYSLIP,
        mockPayrollFormula: payrollMod.MOCK_PAYROLL_FORMULA,
        pitTaxBrackets: payrollMod.PIT_TAX_BRACKETS,
        mockPayrollRecords: payrollMod.MOCK_PAYROLL_RECORDS,
        mockPersonalPayslip: payrollMod.MOCK_PERSONAL_PAYSLIP,
      },
      'ats.json': {
        ATS_KANBAN_STAGES: atsMod.ATS_KANBAN_STAGES,
        MOCK_JOB_POSTINGS: atsMod.MOCK_JOB_POSTINGS,
        MOCK_CANDIDATES: atsMod.MOCK_CANDIDATES,
        atsKanbanStages: atsMod.ATS_KANBAN_STAGES,
        mockJobPostings: atsMod.MOCK_JOB_POSTINGS,
        mockCandidates: atsMod.MOCK_CANDIDATES,
      },
      'admin.json': {
        MOCK_ROLES: adminMod.MOCK_ROLES,
        MOCK_SYSTEM_USERS: adminMod.MOCK_SYSTEM_USERS,
        MOCK_PERMISSION_MATRIX: adminMod.MOCK_PERMISSION_MATRIX,
        MOCK_SYSTEM_CONFIG: adminMod.MOCK_SYSTEM_CONFIG,
        MOCK_AUDIT_LOGS: adminMod.MOCK_AUDIT_LOGS,
        mockRoles: adminMod.MOCK_ROLES,
        mockSystemUsers: adminMod.MOCK_SYSTEM_USERS,
        mockPermissionMatrix: adminMod.MOCK_PERMISSION_MATRIX,
        mockSystemConfig: adminMod.MOCK_SYSTEM_CONFIG,
        mockAuditLogs: adminMod.MOCK_AUDIT_LOGS,
      },
      'copilot.json': {
        MOCK_COPILOT_QA: copilotMod.MOCK_COPILOT_QA,
        MOCK_NL_LEAVE_DRAFTS: copilotMod.MOCK_NL_LEAVE_DRAFTS,
        mockCopilotQA: copilotMod.MOCK_COPILOT_QA,
        mockNlLeaveDrafts: copilotMod.MOCK_NL_LEAVE_DRAFTS,
      },
    };

    fs.mkdirSync(publicMockDir, { recursive: true });
    fs.mkdirSync(webMockDir, { recursive: true });

    for (const [jsonFile, data] of Object.entries(payloads)) {
      const jsonContent = JSON.stringify(data, null, 2) + '\n';
      fs.writeFileSync(path.join(publicMockDir, jsonFile), jsonContent, 'utf8');
      fs.writeFileSync(path.join(webMockDir, jsonFile), jsonContent, 'utf8');
    }

    console.log(
      `[gen:mock] Exported ${Object.keys(payloads).length} mock JSON files to public/mock/ and web/mock/`
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

exportMockJson();
