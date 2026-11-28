import {
  MOCK_JOB_POSTINGS,
} from '@/mock/ats';
import type {
  DepartmentRecruitmentRequest,
  JobPosting,
} from '@/mock/types';
import {
  getJobPostings,
  saveRuntimeJob,
} from './core-entities';
import {
  pushNotification,
} from './notifications';
import {
  STORAGE_DEPT_REQUESTS_KEY,
  cloneJson,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Department Recruitment Requests (Đề xuất Tuyển dụng từ các Phòng ban)
// ---------------------------------------------------------------------------
const INITIAL_DEPT_REQUESTS: DepartmentRecruitmentRequest[] = [
  {
    id: 'req-001',
    request_code: 'YC-2026-SWE02',
    department_id: 'dept-tech-swe',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_title: 'Senior Backend Engineer (Go / Node.js)',
    level: 'Senior',
    quantity: 2,
    urgency: 'URGENT',
    reason: 'Mở rộng quy mô hệ thống Microservices & kiến trúc chịu tải 50.000 RPS',
    expected_salary_range: '34.000.000 - 48.000.000 đ',
    deadline_date: '2026-12-15',
    requested_by_name: 'Lê Hoàng Nam (Trưởng phòng)',
    requested_date: '2026-11-10',
    status: 'APPROVED',
    approved_by_name: 'Trần Thị Bích Ngọc (Trưởng phòng Nhân sự)',
    approved_date: '2026-11-12',
    job_code_created: 'JD-2026-SWE04',
  },
  {
    id: 'req-002',
    request_code: 'YC-2026-AI02',
    department_id: 'dept-tech-data',
    department_name: 'Phòng Dữ liệu & AI',
    position_title: 'Kỹ sư Mô hình Ngôn ngữ & RAG (Applied AI Engineer)',
    level: 'Mid - Senior',
    quantity: 1,
    urgency: 'URGENT',
    reason: 'Triển khai dự án AI Agent Copilot doanh nghiệp & trích xuất thông minh CV ứng viên',
    expected_salary_range: '36.000.000 - 52.000.000 đ',
    deadline_date: '2026-12-20',
    requested_by_name: 'Vũ Thị Mai Phương (Trưởng phòng)',
    requested_date: '2026-11-12',
    status: 'APPROVED',
    approved_by_name: 'Trần Thị Bích Ngọc (Trưởng phòng Nhân sự)',
    approved_date: '2026-11-14',
    job_code_created: 'JD-2026-AI02',
  },
  {
    id: 'req-003',
    request_code: 'YC-2026-SALES03',
    department_id: 'dept-sales',
    department_name: 'Khối Kinh doanh',
    position_title: 'Chuyên viên Tư vấn Giải pháp B2B SaaS',
    level: 'Mid',
    quantity: 3,
    urgency: 'NORMAL',
    reason: 'Đẩy mạnh tiếp cận thị trường khách hàng doanh nghiệp sản xuất và bán lẻ khu vực phía Bắc',
    expected_salary_range: '18.000.000 - 30.000.000 đ',
    deadline_date: '2026-12-30',
    requested_by_name: 'Phạm Quang Minh (Trưởng khối)',
    requested_date: '2026-11-18',
    status: 'PENDING',
  },
  {
    id: 'req-004',
    request_code: 'YC-2026-HR02',
    department_id: 'dept-hr',
    department_name: 'Phòng Nhân sự & Hành chính',
    position_title: 'Chuyên viên Đào tạo & Phát triển Tổ chức (L&D)',
    level: 'Mid',
    quantity: 1,
    urgency: 'NORMAL',
    reason: 'Xây dựng khung năng lực và lộ trình đào tạo nội bộ cho toàn thể nhân sự năm 2027',
    expected_salary_range: '16.000.000 - 24.000.000 đ',
    deadline_date: '2026-12-25',
    requested_by_name: 'Trần Thị Bích Ngọc (Trưởng phòng)',
    requested_date: '2026-11-19',
    status: 'PENDING',
  },
];

export function getDepartmentRecruitmentRequests(): DepartmentRecruitmentRequest[] {
  const stored = readStorageArray<DepartmentRecruitmentRequest>(STORAGE_DEPT_REQUESTS_KEY);
  if (stored) return stored;
  return cloneJson(INITIAL_DEPT_REQUESTS);
}

export function saveDepartmentRecruitmentRequest(req: DepartmentRecruitmentRequest): void {
  const current = getDepartmentRecruitmentRequests();
  const exists = current.some((r) => r.id === req.id);
  const updated = exists ? current.map((r) => (r.id === req.id ? req : r)) : [req, ...current];
  writeStorageArray(STORAGE_DEPT_REQUESTS_KEY, updated);
}

export function createDepartmentRecruitmentRequest(
  input: Omit<DepartmentRecruitmentRequest, 'id' | 'request_code' | 'requested_date' | 'status'>
): DepartmentRecruitmentRequest {
  const current = getDepartmentRecruitmentRequests();
  const nextNum = current.length + 1;
  const requestCode = `YC-2026-${String(nextNum).padStart(3, '0')}`;
  const newReq: DepartmentRecruitmentRequest = {
    ...input,
    id: `req-${Date.now()}`,
    request_code: requestCode,
    requested_date: new Date().toISOString().slice(0, 10),
    status: 'PENDING',
  };

  saveDepartmentRecruitmentRequest(newReq);

  // Real-time notification to HR Manager and Director
  pushNotification({
    title: `Đề xuất tuyển dụng mới: ${newReq.position_title}`,
    message: `${newReq.requested_by_name} (${newReq.department_name}) vừa gửi yêu cầu tuyển ${newReq.quantity} nhân sự. Mức độ: ${newReq.urgency === 'URGENT' ? 'Tuyển gấp' : 'Bình thường'}.`,
    category: 'ONBOARDING',
    target_roles: ['HR_MANAGER', 'SUPER_ADMIN', 'DIRECTOR'],
    target_department_id: newReq.department_id,
    nav_id: 'recruitment',
    entity_id: newReq.id,
  });

  return newReq;
}

export function approveDepartmentRecruitmentRequest(
  requestId: string,
  approverName: string
): { request: DepartmentRecruitmentRequest; job: JobPosting } | null {
  const requests = getDepartmentRecruitmentRequests();
  const targetReq = requests.find((r) => r.id === requestId);
  if (!targetReq) return null;

  const currentJobs = getJobPostings(MOCK_JOB_POSTINGS);
  const nextJobNum = currentJobs.length + 1;
  const newJobCode = `JD-2026-REQ${String(nextJobNum).padStart(2, '0')}`;

  const approvedReq: DepartmentRecruitmentRequest = {
    ...targetReq,
    status: 'APPROVED',
    approved_by_name: approverName,
    approved_date: new Date().toISOString().slice(0, 10),
    job_code_created: newJobCode,
  };
  saveDepartmentRecruitmentRequest(approvedReq);

  // Auto-generate Job Posting in "Tin tuyển dụng đang mở"
  const createdJob: JobPosting = {
    id: `job-${Date.now()}`,
    job_code: newJobCode,
    title: targetReq.position_title,
    department_id: targetReq.department_id,
    department_name: targetReq.department_name,
    level: targetReq.level,
    headcount_target: targetReq.quantity,
    hired_count: 0,
    applicants_count: 0,
    salary_range_min_vnd: 25000000,
    salary_range_max_vnd: 45000000,
    status: targetReq.urgency === 'URGENT' ? 'URGENT' : 'OPEN',
    hiring_manager_name: targetReq.requested_by_name.split(' (')[0],
    published_date: new Date().toISOString().slice(0, 10),
    closing_date: targetReq.deadline_date || '2026-12-30',
    location: 'Hà Nội / Hybrid',
    work_mode: 'Hybrid',
    employment_type: 'Toàn thời gian',
    overview: `Theo đề xuất tuyển dụng ${targetReq.request_code} từ ${targetReq.department_name}: ${targetReq.reason}.`,
    responsibilities: [
      `Triển khai các nhiệm vụ chuyên môn theo chỉ tiêu của ${targetReq.department_name}.`,
      'Đảm bảo chất lượng công việc, hoàn thành KPI đúng tiến độ.',
      'Phối hợp với các thành viên trong đội ngũ thực hiện mục tiêu chung.',
    ],
    requirements: [
      `Kinh nghiệm thực tế ở cấp bậc ${targetReq.level} trong lĩnh vực liên quan.`,
      'Tư duy logic, giải quyết vấn đề tốt và tinh thần làm việc trách nhiệm.',
      'Khả năng thích ứng nhanh với môi trường công nghệ doanh nghiệp.',
    ],
    benefits: [
      `Thu nhập cạnh tranh theo khung đề xuất ${targetReq.expected_salary_range}.`,
      'Trang bị MacBook Pro M-series làm việc, bảo hiểm sức khỏe VIP.',
      'Lộ trình thăng tiến minh bạch tại Tổng Công ty Lạc Việt.',
    ],
  };
  saveRuntimeJob(createdJob);

  // Real-time notification to the Department Manager
  pushNotification({
    title: `Đề xuất tuyển dụng đã duyệt: ${targetReq.request_code}`,
    message: `${approverName} đã phê duyệt đề xuất và mở tin tuyển dụng ${newJobCode} (${targetReq.position_title}) trên toàn hệ thống.`,
    category: 'ONBOARDING',
    target_roles: ['DEPT_MANAGER', 'SUPER_ADMIN'],
    target_department_id: targetReq.department_id,
    nav_id: 'recruitment',
  });

  return { request: approvedReq, job: createdJob };
}

export function rejectDepartmentRecruitmentRequest(
  requestId: string,
  reason: string,
  rejectorName: string
): DepartmentRecruitmentRequest | null {
  const requests = getDepartmentRecruitmentRequests();
  const targetReq = requests.find((r) => r.id === requestId);
  if (!targetReq) return null;

  const rejectedReq: DepartmentRecruitmentRequest = {
    ...targetReq,
    status: 'REJECTED',
    rejection_reason: reason || 'Chưa phù hợp với ngân sách định biên hiện tại',
    approved_by_name: rejectorName,
    approved_date: new Date().toISOString().slice(0, 10),
  };
  saveDepartmentRecruitmentRequest(rejectedReq);

  // Real-time notification to the Department Manager
  pushNotification({
    title: `Từ chối đề xuất tuyển dụng: ${targetReq.request_code}`,
    message: `Đề xuất vị trí ${targetReq.position_title} chưa được phê duyệt. Lý do: ${rejectedReq.rejection_reason}`,
    category: 'ONBOARDING',
    target_roles: ['DEPT_MANAGER'],
    target_department_id: targetReq.department_id,
    nav_id: 'recruitment',
  });

  return rejectedReq;
}
