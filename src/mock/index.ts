export * from './types';
export * from './employees';
export * from './attendance';
export * from './payroll';
export * from './ats';
export * from './admin';
export * from './copilot';

import {
  MOCK_BURNOUT_ALERTS,
  MOCK_CONTRACTS,
  MOCK_DEPARTMENTS,
  MOCK_DEPARTMENT_TREE,
  MOCK_EMPLOYEES,
  MOCK_HEADCOUNT_TREND,
  MOCK_KPI_RECORDS,
  MOCK_POSITIONS,
} from './employees';

import {
  MOCK_ANNUAL_LEAVE_BALANCES,
  MOCK_LEAVE_OVERTIME_REQUESTS,
  MOCK_MONTHLY_ATTENDANCE,
  MOCK_WORK_SHIFTS,
} from './attendance';

import {
  MOCK_PAYROLL_FORMULA,
  MOCK_PAYROLL_RECORDS,
  MOCK_PERSONAL_PAYSLIP,
  PIT_TAX_BRACKETS,
  calculateProgressivePitVnd,
} from './payroll';

import {
  ATS_KANBAN_STAGES,
  MOCK_CANDIDATES,
  MOCK_JOB_POSTINGS,
} from './ats';

import {
  MOCK_AUDIT_LOGS,
  MOCK_PERMISSION_MATRIX,
  MOCK_ROLES,
  MOCK_SYSTEM_CONFIG,
  MOCK_SYSTEM_USERS,
} from './admin';

import {
  MOCK_COPILOT_QA,
  MOCK_NL_LEAVE_DRAFTS,
  parseNaturalLanguageLeavePrompt,
} from './copilot';

export const mockEmployees = MOCK_EMPLOYEES;
export const mockDepartments = MOCK_DEPARTMENTS;
export const mockDepartmentTree = MOCK_DEPARTMENT_TREE;
export const mockPositions = MOCK_POSITIONS;
export const mockContracts = MOCK_CONTRACTS;
export const mockBurnoutAlerts = MOCK_BURNOUT_ALERTS;
export const mockKpiRecords = MOCK_KPI_RECORDS;
export const mockHeadcountTrend = MOCK_HEADCOUNT_TREND;

export const mockWorkShifts = MOCK_WORK_SHIFTS;
export const mockMonthlyAttendance = MOCK_MONTHLY_ATTENDANCE;
export const mockLeaveRequests = MOCK_LEAVE_OVERTIME_REQUESTS;
export const mockAnnualLeaveBalances = MOCK_ANNUAL_LEAVE_BALANCES;

export const mockPayrollFormula = MOCK_PAYROLL_FORMULA;
export const mockPayrollRecords = MOCK_PAYROLL_RECORDS;
export const mockPersonalPayslip = MOCK_PERSONAL_PAYSLIP;
export const pitTaxBrackets = PIT_TAX_BRACKETS;

export const atsKanbanStages = ATS_KANBAN_STAGES;
export const mockJobPostings = MOCK_JOB_POSTINGS;
export const mockCandidates = MOCK_CANDIDATES;

export const mockRoles = MOCK_ROLES;
export const mockSystemUsers = MOCK_SYSTEM_USERS;
export const mockPermissionMatrix = MOCK_PERMISSION_MATRIX;
export const mockSystemConfig = MOCK_SYSTEM_CONFIG;
export const mockAuditLogs = MOCK_AUDIT_LOGS;

export const mockCopilotQA = MOCK_COPILOT_QA;
export const mockNlLeaveDrafts = MOCK_NL_LEAVE_DRAFTS;
export { calculateProgressivePitVnd, parseNaturalLanguageLeavePrompt };
