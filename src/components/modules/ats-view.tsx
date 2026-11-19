'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Cpu,
  Download,
  FileSpreadsheet,
  Filter,
  Laptop,
  Layers,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { AtsKanbanStageItem, fetchAtsMock, fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  approveDepartmentRecruitmentRequest,
  createDepartmentRecruitmentRequest,
  generateNextEmployeeCode,
  getCompanyAssets,
  getDepartmentRecruitmentRequests,
  getOnboardingRecords,
  HRM_RUNTIME_EVENT,
  initiateCandidateOnboarding,
  mergeWithRuntimeCandidates,
  mergeWithRuntimeEmployees,
  mergeWithRuntimeJobs,
  notifyCandidateStageChange,
  pushNotification,
  rejectDepartmentRecruitmentRequest,
  saveDepartmentRecruitmentRequest,
  saveRuntimeCandidate,
  saveRuntimeJob,
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import type {
  AssetCategory,
  AtsStage,
  Candidate,
  CandidateAiEvaluation,
  CompanyAsset,
  Department,
  DepartmentRecruitmentRequest,
  Employee,
  JobPosting,
} from '@/mock/types';
import { Badge, BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const JOB_STATUS_BADGE: Record<JobPosting['status'], { label: string; variant: BadgeVariant }> = {
  URGENT: { label: 'Tuyển gấp', variant: 'danger' },
  OPEN: { label: 'Đang mở', variant: 'teal' },
  CLOSED: { label: 'Đã đóng', variant: 'muted' },
};

const AI_REC_BADGE: Record<
  CandidateAiEvaluation['ai_recommendation'],
  { label: string; variant: BadgeVariant }
> = {
  STRONG_HIRE: { label: 'Đề xuất tuyển ngay', variant: 'success' },
  PROCEED_INTERVIEW: { label: 'Mời phỏng vấn', variant: 'teal' },
  HOLD: { label: 'Cân nhắc thêm', variant: 'warning' },
  REJECT: { label: 'Chưa phù hợp', variant: 'danger' },
};

const ASSET_CATEGORY_SHORT: Record<AssetCategory, string> = {
  LAPTOP: 'Laptop',
  MONITOR: 'Màn hình',
  ACCESS_CARD: 'Thẻ từ',
  PERIPHERAL: 'Ngoại vi',
};

function stripVietnameseAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

function suggestCorporateEmail(fullName: string, existingEmployees: Employee[]): string {
  const tokens = stripVietnameseAccents(fullName).split(/\s+/).filter(Boolean);
  const baseLocal =
    tokens.length === 0
      ? 'nhansu.moi'
      : tokens.length === 1
      ? tokens[0]
      : `${tokens[tokens.length - 1]}.${tokens[0]}`;

  const taken = new Set(existingEmployees.map((e) => e.email.toLowerCase()));
  let candidateEmail = `${baseLocal}@lacviethrm.vn`;
  let counter = 2;
  while (taken.has(candidateEmail.toLowerCase())) {
    candidateEmail = `${baseLocal}${counter}@lacviethrm.vn`;
    counter += 1;
  }
  return candidateEmail;
}

export function AtsView() {
  const { role, currentUserProfile, showToast, navigateWithIntent } = useApp();
  const hideSalary = role === 'DEPT_MANAGER';
  const defaultProfile = ROLE_DEFAULT_PROFILES[role];
  const actorName = currentUserProfile?.fullName || defaultProfile.fullName;
  const actorCode = currentUserProfile?.employee_code || defaultProfile.employee_code;

  const baseCandidatesRef = useRef<Candidate[]>([]);
  const baseEmployeesRef = useRef<Employee[]>([]);
  const baseJobsRef = useRef<JobPosting[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [kanbanStages, setKanbanStages] = useState<AtsKanbanStageItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('ALL');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);

  // Onboarding initiation dialog state
  const [onboardingCandidate, setOnboardingCandidate] = useState<Candidate | null>(null);
  const [onbPosition, setOnbPosition] = useState<string>('');
  const [onbEmpCode, setOnbEmpCode] = useState<string>('');
  const [onbEmail, setOnbEmail] = useState<string>('');
  const [onbDeptId, setOnbDeptId] = useState<string>('dept-tech-swe');
  const [onbManagerName, setOnbManagerName] = useState<string>('');
  const [onbStartDate, setOnbStartDate] = useState<string>('2026-11-23');
  const [onbSalary, setOnbSalary] = useState<string>('22000000');
  const [availableAssets, setAvailableAssets] = useState<CompanyAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [lastCreatedOnboarding, setLastCreatedOnboarding] = useState<{
    onboardingId: string;
    employeeCode: string;
    fullName: string;
  } | null>(null);

  // New Job form state
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDeptId, setNewJobDeptId] = useState('dept-tech-swe');
  const [newJobLevel, setNewJobLevel] = useState('Senior');
  const [newJobTarget, setNewJobTarget] = useState('1');
  const [newJobClosingDate, setNewJobClosingDate] = useState('2026-12-30');
  const [newJobUrgent, setNewJobUrgent] = useState<'OPEN' | 'URGENT'>('OPEN');
  const [newJobMinSalary, setNewJobMinSalary] = useState('25000000');
  const [newJobMaxSalary, setNewJobMaxSalary] = useState('40000000');
  const [newJobWorkMode, setNewJobWorkMode] = useState<'Hybrid' | 'Onsite' | 'Remote'>('Hybrid');
  const [newJobLocation, setNewJobLocation] = useState('Hà Nội / Hybrid');
  const [newJobOverview, setNewJobOverview] = useState('');

  // Department Recruitment Requests state
  const [deptRequests, setDeptRequests] = useState<DepartmentRecruitmentRequest[]>([]);
  const [isAddDeptReqOpen, setIsAddDeptReqOpen] = useState(false);
  const [reqDeptId, setReqDeptId] = useState('dept-tech-swe');
  const [reqPositionTitle, setReqPositionTitle] = useState('');
  const [reqLevel, setReqLevel] = useState('Senior');
  const [reqQuantity, setReqQuantity] = useState('1');
  const [reqUrgency, setReqUrgency] = useState<'NORMAL' | 'URGENT'>('URGENT');
  const [reqReason, setReqReason] = useState('');
  const [reqSalaryRange, setReqSalaryRange] = useState('25.000.000 - 40.000.000 đ');
  const [reqDeadline, setReqDeadline] = useState('2026-12-25');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');

  const syncRuntimeData = useCallback(() => {
    if (baseJobsRef.current.length > 0) {
      setJobs(mergeWithRuntimeJobs(baseJobsRef.current));
    }
    if (baseCandidatesRef.current.length > 0) {
      setCandidates(mergeWithRuntimeCandidates(baseCandidatesRef.current));
    }
    if (baseEmployeesRef.current.length > 0) {
      setEmployees(mergeWithRuntimeEmployees(baseEmployeesRef.current));
    }
    setDeptRequests(getDepartmentRecruitmentRequests());
  }, []);

  const handleResetCandidatesData = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('hrm_runtime_candidates_v1');
        window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
      } catch {
        // ignore
      }
    }
    setCandidates(baseCandidatesRef.current);
    showToast('Đã đặt lại dữ liệu ứng viên', 'Bảng Kanban đã được đồng bộ về dữ liệu ban đầu.', 'success');
  };

  const handleExportCandidatesCsv = () => {
    const header = 'Mã UV,Họ tên,Vị trí,Phòng ban,Bước tuyển dụng,Nguồn,Ngày nộp,Lương kỳ vọng (VND)\n';
    const rows = filteredCandidates
      .map(
        (c) =>
          `"${c.candidate_code}","${c.full_name}","${c.job_title}","${c.department_name}","${c.stage}","${c.source}","${c.applied_date}","${c.expected_salary_vnd}"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `danh_sach_ung_vien_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã xuất danh sách ứng viên', `Đã tải tệp CSV (${filteredCandidates.length} hồ sơ).`, 'success');
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetchAtsMock(), fetchEmployeesMock()])
      .then(([atsData, empData]) => {
        if (!active) return;
        baseJobsRef.current = atsData.MOCK_JOB_POSTINGS;
        baseCandidatesRef.current = atsData.MOCK_CANDIDATES;
        baseEmployeesRef.current = empData.MOCK_EMPLOYEES;
        setKanbanStages(atsData.ATS_KANBAN_STAGES);
        setJobs(mergeWithRuntimeJobs(atsData.MOCK_JOB_POSTINGS));
        setCandidates(mergeWithRuntimeCandidates(atsData.MOCK_CANDIDATES));
        setEmployees(mergeWithRuntimeEmployees(empData.MOCK_EMPLOYEES));
        setDepartments(empData.MOCK_DEPARTMENTS);
        setDeptRequests(getDepartmentRecruitmentRequests());
        if (empData.MOCK_DEPARTMENTS[2]?.id) {
          setNewJobDeptId(empData.MOCK_DEPARTMENTS[2].id);
        }
      })
      .catch(() => {
        if (!active) return;
        showToast('Không thể tải dữ liệu Tuyển dụng ATS', 'Vui lòng thử làm mới lại trang.', 'error');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    window.addEventListener(HRM_RUNTIME_EVENT, syncRuntimeData);
    window.addEventListener('storage', syncRuntimeData);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncRuntimeData);
      window.removeEventListener('storage', syncRuntimeData);
    };
  }, [syncRuntimeData]);

  const stageOrder = useMemo(() => kanbanStages.map((s) => s.stage), [kanbanStages]);

  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (selectedJobId !== 'ALL') {
      list = list.filter((c) => c.job_id === selectedJobId);
    }
    if (selectedSource !== 'ALL') {
      list = list.filter((c) => c.source === selectedSource);
    }
    return list;
  }, [candidates, selectedJobId, selectedSource]);

  const openOnboardingInitDialog = (candidate: Candidate) => {
    const currentMergedEmployees = mergeWithRuntimeEmployees(
      baseEmployeesRef.current.length > 0 ? baseEmployeesRef.current : employees
    );
    setEmployees(currentMergedEmployees);

    const matchedJob = jobs.find((j) => j.id === candidate.job_id);
    const matchedDept =
      departments.find(
        (d) =>
          (matchedJob && d.id === matchedJob.department_id) ||
          d.department_name === candidate.department_name
      ) ?? departments[0];

    const suggestedCode = generateNextEmployeeCode(currentMergedEmployees);
    const suggestedEmail = suggestCorporateEmail(candidate.full_name, currentMergedEmployees);
    const suggestedProbationSalary =
      Math.round((candidate.expected_salary_vnd * 0.85) / 100000) * 100000;

    const currentAvailableAssets = getCompanyAssets().filter((a) => a.status === 'AVAILABLE');
    const preselectedLaptop = currentAvailableAssets.find((a) => a.category === 'LAPTOP');

    setOnboardingCandidate(candidate);
    setOnbPosition(candidate.job_title);
    setOnbEmpCode(suggestedCode);
    setOnbEmail(suggestedEmail);
    setOnbDeptId(matchedDept?.id ?? 'dept-tech-swe');
    setOnbManagerName(
      matchedJob?.hiring_manager_name || matchedDept?.manager_name || 'Lê Hoàng Nam'
    );
    setOnbStartDate('2026-11-23');
    setOnbSalary(String(suggestedProbationSalary || 22000000));
    setAvailableAssets(currentAvailableAssets);
    setSelectedAssetIds(preselectedLaptop ? [preselectedLaptop.id] : []);
  };

  const handleOnbDeptChange = (nextDeptId: string) => {
    setOnbDeptId(nextDeptId);
    const dept = departments.find((d) => d.id === nextDeptId);
    if (dept) {
      setOnbManagerName(dept.manager_name);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const handleConfirmInitiateOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingCandidate) return;

    const trimmedCode = onbEmpCode.trim().toUpperCase();
    const trimmedEmail = onbEmail.trim();
    if (!trimmedCode || !trimmedEmail) {
      showToast(
        'Thiếu thông tin tiếp nhận',
        'Vui lòng kiểm tra mã nhân viên và địa chỉ email công ty.',
        'warning'
      );
      return;
    }

    const targetDept =
      departments.find((d) => d.id === onbDeptId) ??
      departments[0] ?? {
        id: 'dept-tech-swe',
        department_name: onboardingCandidate.department_name,
        manager_name: 'Lê Hoàng Nam',
      };

    const result = initiateCandidateOnboarding({
      candidate: onboardingCandidate,
      employeeCode: trimmedCode,
      email: trimmedEmail,
      departmentId: targetDept.id,
      departmentName: targetDept.department_name,
      positionName: onbPosition.trim() || onboardingCandidate.job_title,
      managerName: onbManagerName.trim() || targetDept.manager_name,
      startDate: onbStartDate || '2026-11-23',
      baseSalaryVnd: Number(onbSalary) || onboardingCandidate.expected_salary_vnd,
      assetIds: selectedAssetIds,
      actorName,
    });

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Tuyển dụng & AI CV',
      target: `${result.onboarding.id} (${result.employee.employee_code} - ${onboardingCandidate.full_name})`,
      detail: `Chuyển ứng viên ${onboardingCandidate.candidate_code} sang Onboarding tại ${targetDept.department_name}, cấp phát ${selectedAssetIds.length} thiết bị.`,
      status: 'SUCCESS',
    });

    setCandidates((prev) =>
      prev.map((c) =>
        c.id === onboardingCandidate.id ? { ...c, stage: 'ONBOARDED' } : c
      )
    );
    setSelectedCandidate(null);
    setOnboardingCandidate(null);
    setLastCreatedOnboarding({
      onboardingId: result.onboarding.id,
      employeeCode: result.employee.employee_code,
      fullName: result.employee.full_name,
    });

    showToast(
      `Đã khởi tạo Onboarding ${result.onboarding.id}`,
      `${result.employee.full_name} (${result.employee.employee_code}) đã đồng bộ sang Core HR và mở lộ trình hội nhập.`,
      'success'
    );
  };

  const handleMoveStage = (candidate: Candidate, targetStage: AtsStage) => {
    if (targetStage === 'ONBOARDED') {
      openOnboardingInitDialog(candidate);
      return;
    }

    const updatedCandidate: Candidate = { ...candidate, stage: targetStage };
    saveRuntimeCandidate(updatedCandidate);

    const stageMeta = kanbanStages.find((s) => s.stage === targetStage);
    const stageLabel = stageMeta?.label ?? targetStage;

    // Real-time notification to Candidate & HR
    notifyCandidateStageChange(candidate, targetStage, stageLabel, actorName);

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? updatedCandidate : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === candidate.id ? updatedCandidate : prev
    );
    showToast(
      'Đã cập nhật trạng thái ứng viên',
      `${candidate.full_name} (${candidate.candidate_code}) -> ${stageLabel}. Đã đồng bộ thông báo Real-time cho ứng viên.`,
      'success'
    );
  };

  const handleStepStage = (candidate: Candidate, direction: -1 | 1) => {
    const idx = stageOrder.indexOf(candidate.stage);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= stageOrder.length) return;
    handleMoveStage(candidate, stageOrder[nextIdx]);
  };

  const handleCreateDeptRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqPositionTitle.trim()) {
      showToast('Thiếu tiêu đề vị trí', 'Vui lòng nhập tên vị trí cần tuyển dụng.', 'warning');
      return;
    }
    const dept = departments.find((d) => d.id === reqDeptId) ?? departments[0];
    const createdReq = createDepartmentRecruitmentRequest({
      department_id: dept?.id ?? 'dept-tech-swe',
      department_name: dept?.department_name ?? 'Phòng Kỹ thuật Phần mềm',
      position_title: reqPositionTitle.trim(),
      level: reqLevel,
      quantity: Math.max(1, Number(reqQuantity) || 1),
      urgency: reqUrgency,
      reason: reqReason.trim() || 'Mở rộng quy mô đội ngũ theo kế hoạch sản xuất kinh doanh.',
      expected_salary_range: reqSalaryRange.trim() || '25.000.000 - 45.000.000 đ',
      deadline_date: reqDeadline || '2026-12-25',
      requested_by_name: `${actorName} (${role === 'DEPT_MANAGER' ? 'Trưởng phòng' : 'Quản lý'})`,
    });

    setIsAddDeptReqOpen(false);
    setReqPositionTitle('');
    setReqReason('');
    setDeptRequests(getDepartmentRecruitmentRequests());
    showToast(
      'Đã gửi đề xuất tuyển dụng',
      `Mã ${createdReq.request_code} đã gửi tới HR Manager và Giám đốc với thông báo Real-time.`,
      'success'
    );
  };

  const handleApproveDeptRequest = (req: DepartmentRecruitmentRequest) => {
    const result = approveDepartmentRecruitmentRequest(req.id, actorName);
    if (!result) return;
    setDeptRequests(getDepartmentRecruitmentRequests());
    setJobs(mergeWithRuntimeJobs(baseJobsRef.current));
    showToast(
      'Đã duyệt đề xuất & Mở tin tuyển dụng',
      `Đã khởi tạo tin ${result.job.job_code} (${result.job.title}) và đồng bộ sang Cổng việc làm.`,
      'success'
    );
  };

  const handleRejectDeptRequest = (req: DepartmentRecruitmentRequest) => {
    const reason = window.prompt(
      'Nhập lý do từ chối đề xuất tuyển dụng:',
      'Chưa phù hợp với định biên ngân sách Quý 4/2026'
    );
    if (reason === null) return;
    const result = rejectDepartmentRecruitmentRequest(req.id, reason, actorName);
    if (!result) return;
    setDeptRequests(getDepartmentRecruitmentRequests());
    showToast(
      'Đã từ chối đề xuất tuyển dụng',
      `Đã cập nhật trạng thái đề xuất ${req.request_code} và thông báo tới Trưởng phòng.`,
      'default'
    );
  };

  const handleAddJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobTitle.trim()) {
      showToast('Thiếu tiêu đề vị trí', 'Vui lòng nhập tên vị trí cần tuyển dụng.', 'warning');
      return;
    }

    const dept = departments.find((d) => d.id === newJobDeptId) ?? departments[0];
    if (!dept) return;
    const nextNum = jobs.length + 1;
    const minSal = Number(newJobMinSalary) || 25000000;
    const maxSal = Number(newJobMaxSalary) || 40000000;

    const created: JobPosting = {
      id: `job-${Date.now()}`,
      job_code: `JD-2026-NEW0${nextNum}`,
      title: newJobTitle.trim(),
      department_id: dept.id,
      department_name: dept.department_name,
      level: newJobLevel.trim() || 'Mid',
      headcount_target: Math.max(1, Number(newJobTarget) || 1),
      hired_count: 0,
      applicants_count: 0,
      salary_range_min_vnd: minSal,
      salary_range_max_vnd: maxSal,
      status: newJobUrgent,
      hiring_manager_name: dept.manager_name,
      published_date: new Date().toISOString().slice(0, 10),
      closing_date: newJobClosingDate || '2026-12-30',
      location: newJobLocation || 'Hà Nội / Hybrid',
      work_mode: newJobWorkMode,
      employment_type: 'Toàn thời gian',
      overview:
        newJobOverview.trim() ||
        `Tuyển dụng ${newJobTitle.trim()} gia nhập ${dept.department_name} tại Tổng Công ty Lạc Việt.`,
      responsibilities: [
        `Phối hợp cùng đội ngũ ${dept.department_name} triển khai các dự án trọng điểm.`,
        'Đảm bảo chất lượng công việc, tiến độ giao hàng và tuân thủ quy chuẩn của tổ chức.',
        'Tham gia cải tiến quy trình nghiệp vụ và báo cáo tiến độ trực tiếp cho Quản lý.',
      ],
      requirements: [
        `Có kinh nghiệm thực tế ở cấp bậc ${newJobLevel.trim() || 'Mid'} trong lĩnh vực liên quan.`,
        'Tư duy giải quyết vấn đề tốt, trách nhiệm cao và kỹ năng làm việc nhóm hiệu quả.',
        'Khả năng thích ứng nhanh với môi trường công nghệ số năng động.',
      ],
      benefits: [
        `Mức thu nhập ${formatVND(minSal)} - ${formatVND(maxSal)} / tháng + Thưởng KPI theo hiệu suất.`,
        'Cấp laptop làm việc, bảo hiểm sức khỏe VIP toàn diện.',
        'Môi trường làm việc văn minh, minh bạch và lộ trình phát triển nghề nghiệp rộng mở.',
      ],
    };

    saveRuntimeJob(created);
    setJobs((prev) => [created, ...prev.filter((j) => j.id !== created.id)]);

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'CREATE_RECORD',
      module: 'Tuyển dụng ATS',
      target: `${created.job_code} — ${created.title}`,
      detail: `Đăng tin tuyển dụng mới cho ${created.department_name}, dải lương ${formatVND(minSal)} - ${formatVND(maxSal)}. Đã đồng bộ trực tiếp lên Cổng việc làm Lạc Việt Careers.`,
      status: 'SUCCESS',
    });

    pushNotification({
      title: `Tin tuyển dụng mới: ${created.title}`,
      message: `${created.job_code} đã được đăng tải và tự động đồng bộ sang Cổng việc làm cho ứng viên.`,
      category: 'ONBOARDING',
      target_roles: ['HR_MANAGER', 'SUPER_ADMIN', 'DEPT_MANAGER'],
      nav_id: 'recruitment',
    });

    setIsAddJobOpen(false);
    setNewJobTitle('');
    setNewJobOverview('');
    showToast(
      'Đã đăng tin & tự động đồng bộ sang Cổng việc làm',
      `${created.job_code} — ${created.title} đã xuất hiện trên Cổng Lạc Việt Careers và bảng ATS.`,
      'success'
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <Skeleton key={idx} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((idx) => (
            <Skeleton key={idx} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Tuyển dụng & Quản trị Ứng viên (ATS)
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Quản lý đề xuất tuyển dụng phòng ban, tin tuyển dụng và theo dõi quy trình ứng viên theo Kanban
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddDeptReqOpen(true)}
            className="border-[#0F766E]/40 text-[#0F766E] hover:bg-[#E8F3EF] dark:border-teal-500/40 dark:text-teal-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Đề xuất tuyển dụng
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsAddJobOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Tạo tin tuyển dụng
          </Button>
        </div>
      </div>

      {lastCreatedOnboarding && (
        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-[#415A54] dark:text-zinc-300">
              Đã khởi tạo hồ sơ hội nhập{' '}
              <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {lastCreatedOnboarding.onboardingId}
              </span>{' '}
              cho <span className="font-semibold text-[#11221E] dark:text-zinc-100">{lastCreatedOnboarding.fullName}</span> (mã NV:{' '}
              <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-200">{lastCreatedOnboarding.employeeCode}</span>)
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigateWithIntent('onboarding', {
                  subTab: 'progress',
                  entityId: lastCreatedOnboarding.onboardingId,
                })
              }
            >
              <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              Mở tiến độ Onboarding
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Department Recruitment Requests Section */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
              <Building className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
              Đề xuất Tuyển dụng từ các Phòng ban ({deptRequests.length})
            </h2>
            <Badge
              variant={deptRequests.some((r) => r.status === 'PENDING') ? 'warning' : 'outline'}
              className="font-mono text-[11px] tabular-nums"
            >
              {deptRequests.filter((r) => r.status === 'PENDING').length} Chờ duyệt
            </Badge>
          </div>
          <span className="text-xs text-[#5C7871] dark:text-zinc-400">
            Tự động đồng bộ Real-time tới HR & Trưởng phòng
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {deptRequests.map((req) => {
            const isPending = req.status === 'PENDING';
            const isApproved = req.status === 'APPROVED';
            const isRejected = req.status === 'REJECTED';

            return (
              <Card
                key={req.id}
                className={cn(
                  'border-l-4 transition-colors',
                  req.urgency === 'URGENT'
                    ? 'border-l-rose-500 dark:border-l-rose-400'
                    : 'border-l-amber-500 dark:border-l-amber-400',
                  isApproved && 'border-l-[#0F766E] dark:border-l-teal-400 opacity-90'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="whitespace-nowrap font-mono text-[11px] font-medium text-[#415A54] dark:text-zinc-400">
                      {req.request_code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {req.urgency === 'URGENT' && (
                        <Badge variant="danger" className="text-[10px]">Gấp</Badge>
                      )}
                      <Badge
                        variant={isApproved ? 'teal' : isRejected ? 'muted' : 'warning'}
                        className="text-[11px]"
                      >
                        {isApproved ? 'Đã duyệt & Lập tin' : isRejected ? 'Từ chối' : 'Chờ HR duyệt'}
                      </Badge>
                    </div>
                  </div>

                  <h3 className="mt-2 text-sm font-semibold leading-5 text-[#11221E] dark:text-zinc-100">
                    {req.position_title}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                    {req.department_name} · Cấp bậc:{' '}
                    <span className="font-medium text-[#11221E] dark:text-zinc-200">{req.level}</span> (SL: {req.quantity})
                  </p>

                  <div className="mt-2 rounded-md bg-[#F2F7F5] p-2 text-xs text-[#415A54] dark:bg-zinc-800/60 dark:text-zinc-300">
                    <div className="line-clamp-2">
                      <span className="font-medium text-[#11221E] dark:text-zinc-200">Lý do: </span>
                      {req.reason}
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-[#5C7871] dark:text-zinc-400">
                      <span>Lương: {req.expected_salary_range}</span>
                      <span>Hạn: {formatDateVN(req.deadline_date)}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-[#D5E3DF] pt-3 text-xs dark:border-zinc-800/80">
                    <span className="truncate text-[11px] text-[#5C7871] dark:text-zinc-400" title={req.requested_by_name}>
                      Đề xuất: {req.requested_by_name.split(' (')[0]}
                    </span>

                    {isPending && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRejectDeptRequest(req)}
                          className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                        >
                          Từ chối
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveDeptRequest(req)}
                          className="rounded bg-[#0F766E] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0B5C56] dark:bg-teal-600 dark:hover:bg-teal-500"
                        >
                          Duyệt & Tạo tin
                        </button>
                      </div>
                    )}

                    {isApproved && req.job_code_created && (
                      <span className="font-mono text-[11px] font-semibold text-[#0F766E] dark:text-teal-400">
                        ✓ {req.job_code_created}
                      </span>
                    )}

                    {isRejected && (
                      <span className="text-[11px] italic text-rose-600 dark:text-rose-400 truncate max-w-[140px]" title={req.rejection_reason}>
                        {req.rejection_reason}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Job Postings Section */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
            <Briefcase className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
            Tin tuyển dụng đang mở ({jobs.length})
          </h2>
          <div className="w-full sm:w-64">
            <Select
              value={selectedJobId}
              onValueChange={setSelectedJobId}
              options={[
                { label: `Tất cả vị trí (${candidates.length} ứng viên)`, value: 'ALL' },
                ...jobs.map((j) => ({
                  label: `${j.job_code} — ${j.title}`,
                  value: j.id,
                })),
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {jobs.map((job) => {
            const statusMeta = JOB_STATUS_BADGE[job.status];
            const isSelected = selectedJobId === job.id;
            return (
              <Card
                key={job.id}
                onClick={() => setSelectedJobId(isSelected ? 'ALL' : job.id)}
                className={cn(
                  'cursor-pointer border-l-4 transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF]/70 dark:hover:border-teal-400/50 dark:hover:bg-zinc-900/50',
                  job.status === 'URGENT'
                    ? 'border-l-rose-500 dark:border-l-rose-400'
                    : job.status === 'OPEN'
                    ? 'border-l-[#0F766E] dark:border-l-teal-400'
                    : 'border-l-[#5C7871] dark:border-l-zinc-500',
                  isSelected && 'border-[#0F766E] bg-[#E8F3EF]/80 ring-1 ring-[#0F766E]/25 dark:border-teal-400 dark:bg-zinc-900 dark:ring-teal-400/20'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="whitespace-nowrap font-mono text-[11px] font-medium text-[#415A54] dark:text-zinc-400">
                      {job.job_code}
                    </span>
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#11221E] dark:text-zinc-100">
                    {job.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                    {job.department_name} · {job.level}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-[#D5E3DF] pt-3 text-xs dark:border-zinc-800/80">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                      <Users className="h-3.5 w-3.5 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
                      {job.applicants_count} hồ sơ
                    </span>
                    <span className="font-mono tabular-nums text-[#5C7871] dark:text-zinc-400">
                      Hạn: {formatDateVN(job.closing_date)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 5-Column Kanban Board */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[#11221E] dark:text-zinc-100">
              Bảng Kanban quy trình ứng viên
              <span className="text-xs font-normal text-[#5C7871] dark:text-zinc-400">
                · {filteredCandidates.length} hồ sơ
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-[#5C7871] dark:text-zinc-400">
              Kéo thả hoặc dùng nút ‹ › để chuyển bước · Nhấn thẻ để xem hồ sơ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Select
                value={selectedSource}
                onValueChange={setSelectedSource}
                options={[
                  { label: 'Mọi nguồn', value: 'ALL' },
                  { label: 'CareerSite', value: 'CareerSite' },
                  { label: 'LinkedIn', value: 'LinkedIn' },
                  { label: 'TopCV', value: 'TopCV' },
                  { label: 'Referral', value: 'Referral' },
                  { label: 'ITviec', value: 'ITviec' },
                ]}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetCandidatesData}
              className="text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Đặt lại dữ liệu
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCandidatesCsv}
              className="text-xs text-[#0F766E] border-[#0F766E]/30 hover:bg-[#E8F3EF] dark:border-teal-500/30 dark:text-teal-300 dark:hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kanbanStages.map((stageCol, stageIdx) => {
            const stageCandidates = filteredCandidates.filter(
              (c) => c.stage === stageCol.stage
            );
            const stageDotColor: Record<AtsStage, string> = {
              APPLIED: 'bg-sky-500',
              AI_SCREENED: 'bg-teal-500',
              INTERVIEW: 'bg-amber-500',
              OFFER: 'bg-violet-500',
              ONBOARDED: 'bg-emerald-500',
            };
            const stageTopBorder: Record<AtsStage, string> = {
              APPLIED: 'border-t-2 border-t-sky-500',
              AI_SCREENED: 'border-t-2 border-t-teal-500',
              INTERVIEW: 'border-t-2 border-t-amber-500',
              OFFER: 'border-t-2 border-t-violet-500',
              ONBOARDED: 'border-t-2 border-t-emerald-500',
            };

            return (
              <div
                key={stageCol.stage}
                className={cn(
                  'flex flex-col rounded-xl border border-[#C6D9D3] bg-[#E8F1EE]/80 p-3 dark:border-zinc-800/80 dark:bg-[#121214]',
                  stageTopBorder[stageCol.stage]
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', stageDotColor[stageCol.stage])} />
                    <h3 className="truncate text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      {stageCol.label}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 font-mono text-[11px] font-medium text-[#415A54] dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
                    {stageCandidates.length}
                  </span>
                </div>

                <div className="flex-1 space-y-2.5">
                  {stageCandidates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5] p-4 text-center text-xs text-[#5C7871] dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-500">
                      Chưa có ứng viên
                    </div>
                  ) : (
                    stageCandidates.map((cand) => {
                      return (
                        <div
                          key={cand.id}
                          onClick={() => setSelectedCandidate(cand)}
                          className="cursor-pointer rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 shadow-sm transition-all hover:border-[#0F766E] hover:bg-[#E8F3EF]/60 dark:border-zinc-800 dark:bg-[#18181b] dark:hover:border-zinc-700 dark:hover:bg-[#202024]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-[#5C7871] dark:text-zinc-400">
                              {cand.candidate_code}
                            </span>
                            <span className="rounded-md border border-[#D5E3DF] bg-[#F2F7F5] px-2 py-0.5 text-[11px] font-medium text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                              {cand.source}
                            </span>
                          </div>

                          <div className="mt-2 text-sm font-bold text-[#11221E] dark:text-zinc-100">
                            {cand.full_name}
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-[#415A54] dark:text-zinc-400">
                            {cand.job_title}
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-[#D5E3DF] pt-2 text-xs dark:border-zinc-800/80">
                            <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                              Nộp: {formatDateVN(cand.applied_date)}
                            </span>
                            <div
                              className="inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                disabled={stageIdx === 0}
                                onClick={() => handleStepStage(cand, -1)}
                                aria-label="Lùi bước trước"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] transition-colors hover:bg-[#E8F3EF] hover:text-[#11221E] disabled:opacity-30 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                disabled={stageIdx === stageOrder.length - 1}
                                onClick={() => handleStepStage(cand, 1)}
                                aria-label="Chuyển bước tiếp theo"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] transition-colors hover:bg-[#E8F3EF] hover:text-[#11221E] disabled:opacity-30 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                              >
                                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Candidate Profile & Suggested Questions Dialog */}
      <Dialog
        open={Boolean(selectedCandidate)}
        onOpenChange={(open) => {
          if (!open) setSelectedCandidate(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 text-[#11221E] shadow-2xl dark:border-zinc-800 dark:bg-[#18181b] dark:text-zinc-100">
          {selectedCandidate && (
            <>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-[#11221E] dark:text-white">
                  {selectedCandidate.full_name}
                </h3>
                <p className="mt-1 text-sm font-medium text-[#415A54] dark:text-zinc-300">
                  {selectedCandidate.job_title}
                </p>
                <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                  {selectedCandidate.candidate_code} · {selectedCandidate.source} · {kanbanStages.find((s) => s.stage === selectedCandidate.stage)?.label ?? selectedCandidate.stage} · nộp {formatDateVN(selectedCandidate.applied_date)}
                </p>
              </div>

              <div className="mt-5 space-y-2">
                <h4 className="text-sm font-semibold text-[#11221E] dark:text-white">
                  Câu hỏi phỏng vấn gợi ý:
                </h4>
                <ul className="space-y-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-300">
                  {selectedCandidate.ai_evaluation.interview_questions.map((q, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-bold text-[#0F766E] dark:text-zinc-400">•</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedCandidate(null)}
                  className="rounded-lg border-[#C6D9D3] bg-[#F2F7F5] px-4 py-2 text-xs font-semibold text-[#11221E] hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Đóng
                </Button>

                <div className="flex items-center gap-2">
                  {selectedCandidate.stage !== 'ONBOARDED' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        handleStepStage(selectedCandidate, 1);
                        setSelectedCandidate(null);
                      }}
                      className="text-xs"
                    >
                      Chuyển bước tiếp theo →
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        const matchedOnb = getOnboardingRecords().find(
                          (r) =>
                            r.candidate_id === selectedCandidate.id ||
                            r.candidate_code === selectedCandidate.candidate_code
                        );
                        setSelectedCandidate(null);
                        navigateWithIntent('onboarding', {
                          subTab: 'progress',
                          entityId: matchedOnb?.id ?? selectedCandidate.candidate_code,
                        });
                      }}
                      className="text-xs"
                    >
                      Xem Onboarding
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Initiate Onboarding & Asset Assignment Dialog */}
      <Dialog
        open={Boolean(onboardingCandidate)}
        onOpenChange={(open) => {
          if (!open) setOnboardingCandidate(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          {onboardingCandidate && (
            <>
              <DialogHeader>
                <DialogTitle>Khởi tạo Onboarding &amp; Cấp phát tài sản</DialogTitle>
                <DialogDescription>
                  Tạo mã nhân viên chính thức trên Core HR, mở lộ trình hội nhập 8 hạng mục và bàn giao thiết bị công tác
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleConfirmInitiateOnboarding} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="onb-cand-name"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Họ tên ứng viên
                    </label>
                    <Input
                      id="onb-cand-name"
                      value={`${onboardingCandidate.full_name} (${onboardingCandidate.candidate_code})`}
                      readOnly
                      className="bg-[#F2F7F5] text-[#415A54] dark:bg-zinc-900 dark:text-zinc-400"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onb-emp-code"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Mã nhân viên tự sinh *
                    </label>
                    <Input
                      id="onb-emp-code"
                      value={onbEmpCode}
                      onChange={(e) => setOnbEmpCode(e.target.value)}
                      className="font-mono tabular-nums"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="onb-email"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Email công ty *
                    </label>
                    <Input
                      id="onb-email"
                      type="email"
                      value={onbEmail}
                      onChange={(e) => setOnbEmail(e.target.value)}
                      className="font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onb-position"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Chức danh tiếp nhận *
                    </label>
                    <Input
                      id="onb-position"
                      value={onbPosition}
                      onChange={(e) => setOnbPosition(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="onb-dept"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Phòng ban tiếp nhận *
                    </label>
                    <Select
                      id="onb-dept"
                      value={onbDeptId}
                      onValueChange={handleOnbDeptChange}
                      options={departments.map((d) => ({
                        label: d.department_name,
                        value: d.id,
                      }))}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onb-manager"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Quản lý trực tiếp *
                    </label>
                    <Input
                      id="onb-manager"
                      value={onbManagerName}
                      onChange={(e) => setOnbManagerName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className={cn('grid grid-cols-1 gap-3', !hideSalary && 'sm:grid-cols-2')}>
                  <div>
                    <label
                      htmlFor="onb-start-date"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Ngày nhận việc *
                    </label>
                    <Input
                      id="onb-start-date"
                      type="date"
                      value={onbStartDate}
                      onChange={(e) => setOnbStartDate(e.target.value)}
                      className="font-mono tabular-nums"
                      required
                    />
                  </div>

                  {!hideSalary && (
                    <div>
                      <label
                        htmlFor="onb-probation-salary"
                        className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        Mức lương thử việc gợi ý (VND) *
                      </label>
                      <Input
                        id="onb-probation-salary"
                        type="text"
                        inputMode="numeric"
                        value={onbSalary ? formatNumberVN(Number(onbSalary)) : ''}
                        onChange={(e) => setOnbSalary(e.target.value.replace(/\D/g, ''))}
                        className="font-mono tabular-nums"
                        required
                      />
                      <p className="mt-1 text-[11px] text-[#5C7871] dark:text-zinc-400">
                        Đề xuất 85% mức kỳ vọng (
                        <span className="font-mono tabular-nums">
                          {formatVND(onboardingCandidate.expected_salary_vnd)}
                        </span>
                        )
                      </p>
                    </div>
                  )}
                </div>

                {/* Available Assets Selection */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-3.5 dark:border-zinc-800/80 dark:bg-transparent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      <Laptop className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                      Cấp phát thiết bị sẵn sàng trong kho
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                      Đã chọn: {selectedAssetIds.length}/{availableAssets.length}
                    </span>
                  </div>

                  {availableAssets.length === 0 ? (
                    <p className="mt-2 text-xs text-[#5C7871] dark:text-zinc-400">
                      Hiện không còn thiết bị trống trong kho, có thể cấp phát bổ sung sau tại phân hệ Onboarding &amp; Tài sản
                    </p>
                  ) : (
                    <div className="mt-2.5 max-h-48 space-y-2 overflow-y-auto pr-1">
                      {availableAssets.map((asset) => {
                        const checked = selectedAssetIds.includes(asset.id);
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggleAssetSelection(asset.id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                              checked
                                ? 'border-[#0F766E] bg-[#CBE8E2]/60 dark:border-teal-400/50 dark:bg-teal-950/30'
                                : 'border-[#C6D9D3] bg-[#FCFEFD] hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/60'
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                  checked
                                    ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-teal-400 dark:bg-teal-400 dark:text-zinc-950'
                                    : 'border-[#5C7871] bg-[#FCFEFD] dark:border-zinc-600 dark:bg-zinc-900'
                                )}
                              >
                                {checked && <Check className="h-3 w-3" strokeWidth={2} />}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-[#11221E] dark:text-zinc-100">
                                  {asset.name}
                                </div>
                                <div className="font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
                                  {asset.asset_code} · S/N: {asset.serial_number}
                                </div>
                              </div>
                            </div>
                            <Badge variant="secondary" className="shrink-0">
                              {ASSET_CATEGORY_SHORT[asset.category]}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOnboardingCandidate(null)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" variant="primary">
                    <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
                    Xác nhận &amp; Khởi tạo Onboarding
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Job Posting Dialog */}
      <Dialog open={isAddJobOpen} onOpenChange={setIsAddJobOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tạo tin tuyển dụng mới</DialogTitle>
            <DialogDescription>
              Tin tuyển dụng mới sẽ hiển thị ngay trên bảng Kanban ATS và tự động đồng bộ trực tiếp sang Cổng việc làm Lạc Việt Careers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddJob} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tiêu đề vị trí *
              </label>
              <Input
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="Ví dụ: Product Designer (B2B SaaS)"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Phòng ban yêu cầu
                </label>
                <Select
                  value={newJobDeptId}
                  onValueChange={setNewJobDeptId}
                  options={departments.map((d) => ({
                    label: d.department_name,
                    value: d.id,
                  }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Cấp bậc
                </label>
                <Input
                  value={newJobLevel}
                  onChange={(e) => setNewJobLevel(e.target.value)}
                  placeholder="Senior / Mid"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Lương tối thiểu (VNĐ/tháng)
                </label>
                <Input
                  type="number"
                  value={newJobMinSalary}
                  onChange={(e) => setNewJobMinSalary(e.target.value)}
                  placeholder="25000000"
                  className="font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Lương tối đa (VNĐ/tháng)
                </label>
                <Input
                  type="number"
                  value={newJobMaxSalary}
                  onChange={(e) => setNewJobMaxSalary(e.target.value)}
                  placeholder="40000000"
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Hình thức làm việc
                </label>
                <Select
                  value={newJobWorkMode}
                  onValueChange={(v) => setNewJobWorkMode(v as 'Hybrid' | 'Onsite' | 'Remote')}
                  options={[
                    { label: 'Linh hoạt (Hybrid)', value: 'Hybrid' },
                    { label: 'Tại văn phòng (Onsite)', value: 'Onsite' },
                    { label: 'Làm việc từ xa (Remote)', value: 'Remote' },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Địa điểm làm việc
                </label>
                <Input
                  value={newJobLocation}
                  onChange={(e) => setNewJobLocation(e.target.value)}
                  placeholder="Hà Nội / TP.HCM / Toàn quốc"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Số lượng tuyển
                </label>
                <Input
                  type="number"
                  min={1}
                  value={newJobTarget}
                  onChange={(e) => setNewJobTarget(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Mức độ ưu tiên
                </label>
                <Select
                  value={newJobUrgent}
                  onValueChange={(v) => setNewJobUrgent(v as 'OPEN' | 'URGENT')}
                  options={[
                    { label: 'Đang mở', value: 'OPEN' },
                    { label: 'Tuyển gấp', value: 'URGENT' },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Hạn nhận hồ sơ
                </label>
                <Input
                  type="date"
                  value={newJobClosingDate}
                  onChange={(e) => setNewJobClosingDate(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tóm tắt trách nhiệm & Yêu cầu vị trí
              </label>
              <textarea
                rows={2}
                value={newJobOverview}
                onChange={(e) => setNewJobOverview(e.target.value)}
                placeholder="Mô tả ngắn gọn về vai trò và định hướng công việc cho ứng viên..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddJobOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Đăng tin & Đồng bộ Cổng việc làm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Department Recruitment Request Dialog */}
      <Dialog open={isAddDeptReqOpen} onOpenChange={setIsAddDeptReqOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo Đề xuất Tuyển dụng từ Phòng ban</DialogTitle>
            <DialogDescription>
              Đề xuất bổ sung nhân sự từ Trưởng bộ phận. Sau khi gửi, thông báo Real-time sẽ gửi tới HR Manager và Giám đốc để phê duyệt và mở tin tuyển dụng.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateDeptRequestSubmit} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Phòng ban đề xuất *
              </label>
              <Select
                value={reqDeptId}
                onValueChange={setReqDeptId}
                options={departments.map((d) => ({
                  label: `${d.department_name} (${d.manager_name})`,
                  value: d.id,
                }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Chức danh / Vị trí tuyển dụng *
              </label>
              <Input
                value={reqPositionTitle}
                onChange={(e) => setReqPositionTitle(e.target.value)}
                placeholder="Ví dụ: Kỹ sư Hạ tầng Cloud & DevOps"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Cấp bậc chuyên môn
                </label>
                <Select
                  value={reqLevel}
                  onValueChange={setReqLevel}
                  options={[
                    { label: 'Intern / Thực tập sinh', value: 'Intern' },
                    { label: 'Junior (1-2 năm)', value: 'Junior' },
                    { label: 'Mid-level (2-4 năm)', value: 'Mid' },
                    { label: 'Senior (4+ năm)', value: 'Senior' },
                    { label: 'Lead / Principal', value: 'Lead' },
                    { label: 'Manager / Trưởng phòng', value: 'Manager' },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Số lượng cần tuyển
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={reqQuantity}
                  onChange={(e) => setReqQuantity(e.target.value)}
                  className="font-mono tabular-nums"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Mức độ ưu tiên
                </label>
                <Select
                  value={reqUrgency}
                  onValueChange={(v) => setReqUrgency(v as 'NORMAL' | 'URGENT')}
                  options={[
                    { label: 'Tiêu chuẩn', value: 'NORMAL' },
                    { label: 'Tuyển gấp', value: 'URGENT' },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Hạn chót cần nhân sự
                </label>
                <Input
                  type="date"
                  value={reqDeadline}
                  onChange={(e) => setReqDeadline(e.target.value)}
                  className="font-mono tabular-nums"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Khung lương dự kiến (VNĐ/tháng)
              </label>
              <Input
                value={reqSalaryRange}
                onChange={(e) => setReqSalaryRange(e.target.value)}
                placeholder="25.000.000 - 45.000.000 đ"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Lý do & Mục tiêu tuyển dụng *
              </label>
              <textarea
                rows={3}
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Mô tả lý do cần tuyển bổ sung, khối lượng công việc phát sinh hoặc dự án mới..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDeptReqOpen(false)}>
                Hủy bỏ
              </Button>
              <Button type="submit" variant="primary">
                <Send className="h-4 w-4" strokeWidth={1.5} />
                Gửi đề xuất tới HR
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
