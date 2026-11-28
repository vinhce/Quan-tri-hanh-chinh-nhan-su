import {
  MOCK_JOB_POSTINGS,
} from '@/mock/ats';
import {
  MOCK_DEPARTMENTS,
  MOCK_EMPLOYEES,
} from '@/mock/employees';
import type {
  Candidate,
  Department,
  Employee,
  JobPosting,
  LeaveOvertimeRequest,
} from '@/mock/types';
import {
  pushNotification,
} from './notifications';
import {
  getOnboardingRecords,
  getPreboardingInvites,
} from './onboarding-store';
import {
  STORAGE_CANDIDATES_KEY,
  STORAGE_DEPARTMENTS_KEY,
  STORAGE_EMPLOYEES_KEY,
  STORAGE_JOBS_KEY,
  STORAGE_REQUESTS_KEY,
  cloneJson,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Runtime Leave & Overtime Requests
// ---------------------------------------------------------------------------
function readRuntimeRequests(): LeaveOvertimeRequest[] {
  return readStorageArray<LeaveOvertimeRequest>(STORAGE_REQUESTS_KEY) ?? [];
}

export function mergeWithRuntimeRequests(
  baseRequests: LeaveOvertimeRequest[]
): LeaveOvertimeRequest[] {
  const runtimeList = readRuntimeRequests();
  if (runtimeList.length === 0) return baseRequests;

  const baseIds = new Set(baseRequests.map((r) => r.id));
  const baseCodes = new Set(baseRequests.map((r) => r.request_code));

  const replacedBase = baseRequests.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.request_code === baseItem.request_code
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.request_code)
  );

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeRequest(req: LeaveOvertimeRequest): void {
  const current = readRuntimeRequests();
  const idx = current.findIndex(
    (item) => item.id === req.id || item.request_code === req.request_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? req : item))
      : [req, ...current];
  writeStorageArray(STORAGE_REQUESTS_KEY, updated);
}

// ---------------------------------------------------------------------------
// Runtime Employees
// ---------------------------------------------------------------------------
function readRuntimeEmployees(): Employee[] {
  return readStorageArray<Employee>(STORAGE_EMPLOYEES_KEY) ?? [];
}

export function mergeWithRuntimeEmployees(baseEmployees: Employee[]): Employee[] {
  const runtimeList = readRuntimeEmployees();
  if (runtimeList.length === 0) return baseEmployees;

  const baseIds = new Set(baseEmployees.map((e) => e.id));
  const baseCodes = new Set(baseEmployees.map((e) => e.employee_code));

  const replacedBase = baseEmployees.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.employee_code === baseItem.employee_code
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.employee_code)
  );

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeEmployee(emp: Employee): void {
  const current = readRuntimeEmployees();
  const idx = current.findIndex(
    (item) => item.id === emp.id || item.employee_code === emp.employee_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? emp : item))
      : [emp, ...current];
  writeStorageArray(STORAGE_EMPLOYEES_KEY, updated);
}

export function generateNextEmployeeCode(
  existingEmployees?: Array<{ employee_code: string }>
): string {
  const combined =
    existingEmployees !== undefined
      ? existingEmployees
      : [
          ...getAllRuntimeEmployees(),
          ...getOnboardingRecords(),
          ...getPreboardingInvites(),
        ];

  let maxNumber = 27;
  for (const item of combined) {
    const code = item.employee_code?.trim();
    if (!code) continue;
    const match = /^NV-\d{4}-(\d+)$/i.exec(code);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxNumber) {
        maxNumber = parsed;
      }
    }
  }

  return `NV-2026-${String(maxNumber + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Runtime Candidates
// ---------------------------------------------------------------------------
function sanitizeCandidateData(cand: Candidate): Candidate {
  let cleanCompany = cand.current_company || '';
  if (cleanCompany.includes('·')) {
    cleanCompany = cleanCompany.split('·')[0].trim();
  }

  // Sanitize junk reschedule strings
  let cleanReschedule = cand.reschedule_request;
  if (cleanReschedule) {
    if (
      cleanReschedule.reason &&
      (cleanReschedule.reason.includes('sdajkh') ||
        cleanReschedule.reason.includes('jsdlkaj') ||
        cleanReschedule.reason.length < 5)
    ) {
      cleanReschedule = {
        ...cleanReschedule,
        reason: 'Trùng lịch làm việc đột xuất, kính mong công ty hỗ trợ xếp lại.',
      };
    }
  }

  // Deduplicate notes and activity logs
  let cleanNotes = cand.notes;
  if (Array.isArray(cleanNotes)) {
    const seenContents = new Set<string>();
    cleanNotes = cleanNotes.filter((n) => {
      const key = `${n.author}:${n.content.trim()}`;
      if (seenContents.has(key)) return false;
      seenContents.add(key);
      return true;
    });
  }

  return {
    ...cand,
    current_company: cleanCompany,
    reschedule_request: cleanReschedule,
    notes: cleanNotes,
  };
}

export function readRuntimeCandidates(): Candidate[] {
  const rawList = readStorageArray<Candidate>(STORAGE_CANDIDATES_KEY) ?? [];
  return rawList
    .filter((c) => !c.full_name?.toLowerCase().includes('dasdas'))
    .map(sanitizeCandidateData);
}

export function mergeWithRuntimeCandidates(baseCandidates: Candidate[]): Candidate[] {
  const runtimeList = readRuntimeCandidates();
  if (runtimeList.length === 0) return baseCandidates.map(sanitizeCandidateData);

  const baseIds = new Set(baseCandidates.map((c) => c.id));
  const baseCodes = new Set(baseCandidates.map((c) => c.candidate_code));

  const replacedBase = baseCandidates.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.candidate_code === baseItem.candidate_code
    );
    return override ? sanitizeCandidateData(override) : sanitizeCandidateData(baseItem);
  });

  const brandNew = runtimeList
    .filter((rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.candidate_code))
    .map(sanitizeCandidateData);

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeCandidate(cand: Candidate): void {
  const cleanCand = sanitizeCandidateData(cand);
  const current = readRuntimeCandidates();
  const idx = current.findIndex(
    (item) => item.id === cleanCand.id || item.candidate_code === cleanCand.candidate_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? cleanCand : item))
      : [cleanCand, ...current];
  writeStorageArray(STORAGE_CANDIDATES_KEY, updated);
}

// ---------------------------------------------------------------------------
// Job Postings (ATS & Careers Portal Synchronized Storage)
// ---------------------------------------------------------------------------
export function readRuntimeJobs(): JobPosting[] {
  return readStorageArray<JobPosting>(STORAGE_JOBS_KEY) ?? [];
}

export function mergeWithRuntimeJobs(baseJobs: JobPosting[]): JobPosting[] {
  const runtimeList = readRuntimeJobs();
  if (runtimeList.length === 0) return baseJobs;

  const baseIds = new Set(baseJobs.map((j) => j.id));
  const baseCodes = new Set(baseJobs.map((j) => j.job_code));

  const replacedBase = baseJobs.map((baseItem) => {
    const override = runtimeList.find(
      (rt) => rt.id === baseItem.id || rt.job_code === baseItem.job_code
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) => !baseIds.has(rt.id) && !baseCodes.has(rt.job_code)
  );

  return [...brandNew, ...replacedBase];
}

export function saveRuntimeJob(job: JobPosting): void {
  const current = readRuntimeJobs();
  const idx = current.findIndex(
    (item) => item.id === job.id || item.job_code === job.job_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? job : item))
      : [job, ...current];
  writeStorageArray(STORAGE_JOBS_KEY, updated);
}

export function getJobPostings(fallbackBase?: JobPosting[]): JobPosting[] {
  const base = fallbackBase ?? MOCK_JOB_POSTINGS;
  return mergeWithRuntimeJobs(base);
}

// ---------------------------------------------------------------------------
// Candidate Stage Real-Time Notification
// ---------------------------------------------------------------------------
export function notifyCandidateStageChange(
  candidate: Candidate,
  targetStage: string,
  stageLabel: string,
  actorName: string
): void {
  // Push notification for candidate
  pushNotification({
    title: `Cập nhật tiến độ hồ sơ: ${stageLabel}`,
    message: `Chào ${candidate.full_name}, hồ sơ ứng tuyển vị trí ${candidate.job_title} của bạn đã chuyển sang bước: "${stageLabel}".`,
    category: 'ONBOARDING',
    target_roles: ['CANDIDATE', 'HR_MANAGER'],
    target_employee_codes: [candidate.candidate_code],
    nav_id: 'candidate',
  });
}

export function getRuntimeDepartments(): Department[] {
  const stored = readStorageArray<Department>(STORAGE_DEPARTMENTS_KEY);
  if (!stored || stored.length === 0) return cloneJson(MOCK_DEPARTMENTS);
  return MOCK_DEPARTMENTS.map((base) => {
    const override = stored.find(
      (rt) => rt.id === base.id || rt.department_code === base.department_code
    );
    return override ?? base;
  });
}

export function saveRuntimeDepartment(dept: Department): Department {
  const current = readStorageArray<Department>(STORAGE_DEPARTMENTS_KEY) ?? [];
  const idx = current.findIndex(
    (d) => d.id === dept.id || d.department_code === dept.department_code
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? dept : item))
      : [dept, ...current];
  writeStorageArray(STORAGE_DEPARTMENTS_KEY, updated);
  return dept;
}

export function getAllRuntimeEmployees(): Employee[] {
  return mergeWithRuntimeEmployees(MOCK_EMPLOYEES);
}
