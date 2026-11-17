import type {
  AnnualLeaveBalance,
  AtsStage,
  AuditLogEntry,
  BurnoutTurnoverAlert,
  Candidate,
  CopilotSampleQA,
  Department,
  Employee,
  EmployeeKpiRecord,
  EmploymentContract,
  JobPosting,
  LeaveOvertimeRequest,
  MonthlyAttendanceSummary,
  NaturalLanguageLeaveDraft,
  PayrollFormulaConfig,
  PayrollRecord,
  PermissionMatrixRow,
  Position,
  RoleDefinition,
  SystemConfiguration,
  SystemUserAccount,
  WorkShift,
} from '@/mock/types';

export interface HeadcountTrendItem {
  month: string;
  total_headcount: number;
  new_hires: number;
  resigned: number;
  payroll_cost_million_vnd: number;
}

export interface PitTaxBracketItem {
  level: number;
  label: string;
  max_taxable_vnd: number | null;
  rate_percent: number;
  quick_subtract_vnd: number;
}

export interface AtsKanbanStageItem {
  stage: AtsStage;
  label: string;
  description: string;
}

export interface EmployeesMockData {
  MOCK_DEPARTMENTS: Department[];
  MOCK_DEPARTMENT_TREE: Department[];
  MOCK_POSITIONS: Position[];
  MOCK_EMPLOYEES: Employee[];
  MOCK_CONTRACTS: EmploymentContract[];
  MOCK_BURNOUT_ALERTS: BurnoutTurnoverAlert[];
  MOCK_KPI_RECORDS: EmployeeKpiRecord[];
  MOCK_HEADCOUNT_TREND: HeadcountTrendItem[];
  mockDepartments: Department[];
  mockDepartmentTree: Department[];
  mockPositions: Position[];
  mockEmployees: Employee[];
  mockContracts: EmploymentContract[];
  mockBurnoutAlerts: BurnoutTurnoverAlert[];
  mockKpiRecords: EmployeeKpiRecord[];
  mockHeadcountTrend: HeadcountTrendItem[];
}

export interface AttendanceMockData {
  MOCK_WORK_SHIFTS: WorkShift[];
  MOCK_MONTHLY_ATTENDANCE: MonthlyAttendanceSummary[];
  MOCK_LEAVE_OVERTIME_REQUESTS: LeaveOvertimeRequest[];
  MOCK_ANNUAL_LEAVE_BALANCES: AnnualLeaveBalance[];
  mockWorkShifts: WorkShift[];
  mockMonthlyAttendance: MonthlyAttendanceSummary[];
  mockLeaveRequests: LeaveOvertimeRequest[];
  mockLeaveOvertimeRequests: LeaveOvertimeRequest[];
  mockAnnualLeaveBalances: AnnualLeaveBalance[];
}

export interface PayrollMockData {
  MOCK_PAYROLL_FORMULA: PayrollFormulaConfig;
  PIT_TAX_BRACKETS: PitTaxBracketItem[];
  MOCK_PAYROLL_RECORDS: PayrollRecord[];
  MOCK_PERSONAL_PAYSLIP: PayrollRecord;
  mockPayrollFormula: PayrollFormulaConfig;
  pitTaxBrackets: PitTaxBracketItem[];
  mockPayrollRecords: PayrollRecord[];
  mockPersonalPayslip: PayrollRecord;
}

export interface AtsMockData {
  ATS_KANBAN_STAGES: AtsKanbanStageItem[];
  MOCK_JOB_POSTINGS: JobPosting[];
  MOCK_CANDIDATES: Candidate[];
  atsKanbanStages: AtsKanbanStageItem[];
  mockJobPostings: JobPosting[];
  mockCandidates: Candidate[];
}

export interface AdminMockData {
  MOCK_ROLES: RoleDefinition[];
  MOCK_SYSTEM_USERS: SystemUserAccount[];
  MOCK_PERMISSION_MATRIX: PermissionMatrixRow[];
  MOCK_SYSTEM_CONFIG: SystemConfiguration;
  MOCK_AUDIT_LOGS: AuditLogEntry[];
  mockRoles: RoleDefinition[];
  mockSystemUsers: SystemUserAccount[];
  mockPermissionMatrix: PermissionMatrixRow[];
  mockSystemConfig: SystemConfiguration;
  mockAuditLogs: AuditLogEntry[];
}

export interface CopilotMockData {
  MOCK_COPILOT_QA: CopilotSampleQA[];
  MOCK_NL_LEAVE_DRAFTS: NaturalLanguageLeaveDraft[];
  mockCopilotQA: CopilotSampleQA[];
  mockNlLeaveDrafts: NaturalLanguageLeaveDraft[];
}

export interface MockFetchOptions {
  bypassCache?: boolean;
  forceRefresh?: boolean;
}

const mockPromiseCache = new Map<string, Promise<unknown>>();

async function fetchMockJson<T>(
  endpoint: string,
  options?: MockFetchOptions
): Promise<T> {
  const shouldBypass = Boolean(options?.bypassCache || options?.forceRefresh);

  if (!shouldBypass && mockPromiseCache.has(endpoint)) {
    return mockPromiseCache.get(endpoint) as Promise<T>;
  }

  const requestPromise = (async () => {
    const response = await fetch(endpoint, {
      cache: shouldBypass ? 'no-store' : 'default',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Không thể tải dữ liệu từ ${endpoint} (HTTP ${response.status})`);
    }

    return (await response.json()) as T;
  })();

  if (!shouldBypass) {
    mockPromiseCache.set(endpoint, requestPromise);
  }

  try {
    return await requestPromise;
  } catch (err) {
    mockPromiseCache.delete(endpoint);
    throw err;
  }
}

export function clearMockCache(endpoint?: string): void {
  if (endpoint) {
    mockPromiseCache.delete(endpoint);
  } else {
    mockPromiseCache.clear();
  }
}

export function fetchEmployeesMock(
  options?: MockFetchOptions
): Promise<EmployeesMockData> {
  return fetchMockJson<EmployeesMockData>('/mock/employees.json', options);
}

export function fetchAttendanceMock(
  options?: MockFetchOptions
): Promise<AttendanceMockData> {
  return fetchMockJson<AttendanceMockData>('/mock/attendance.json', options);
}

export function fetchPayrollMock(
  options?: MockFetchOptions
): Promise<PayrollMockData> {
  return fetchMockJson<PayrollMockData>('/mock/payroll.json', options);
}

export function fetchAtsMock(
  options?: MockFetchOptions
): Promise<AtsMockData> {
  return fetchMockJson<AtsMockData>('/mock/ats.json', options);
}

export function fetchAdminMock(
  options?: MockFetchOptions
): Promise<AdminMockData> {
  return fetchMockJson<AdminMockData>('/mock/admin.json', options);
}

export function fetchCopilotMock(
  options?: MockFetchOptions
): Promise<CopilotMockData> {
  return fetchMockJson<CopilotMockData>('/mock/copilot.json', options);
}
