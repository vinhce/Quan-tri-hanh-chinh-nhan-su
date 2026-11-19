'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  Laptop,
  MessageSquareText,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { AtsKanbanStageItem, fetchAtsMock, fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  generateNextEmployeeCode,
  getCompanyAssets,
  getOnboardingRecords,
  HRM_RUNTIME_EVENT,
  initiateCandidateOnboarding,
  mergeWithRuntimeCandidates,
  mergeWithRuntimeEmployees,
  saveRuntimeCandidate,
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import type {
  AssetCategory,
  AtsStage,
  Candidate,
  CandidateAiEvaluation,
  CompanyAsset,
  Department,
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

  const syncRuntimeData = useCallback(() => {
    if (baseCandidatesRef.current.length > 0) {
      setCandidates(mergeWithRuntimeCandidates(baseCandidatesRef.current));
    }
    if (baseEmployeesRef.current.length > 0) {
      setEmployees(mergeWithRuntimeEmployees(baseEmployeesRef.current));
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAtsMock(), fetchEmployeesMock()])
      .then(([atsData, empData]) => {
        if (!active) return;
        baseCandidatesRef.current = atsData.MOCK_CANDIDATES;
        baseEmployeesRef.current = empData.MOCK_EMPLOYEES;
        setKanbanStages(atsData.ATS_KANBAN_STAGES);
        setJobs(atsData.MOCK_JOB_POSTINGS);
        setCandidates(mergeWithRuntimeCandidates(atsData.MOCK_CANDIDATES));
        setEmployees(mergeWithRuntimeEmployees(empData.MOCK_EMPLOYEES));
        setDepartments(empData.MOCK_DEPARTMENTS);
        if (empData.MOCK_DEPARTMENTS[2]?.id) {
          setNewJobDeptId(empData.MOCK_DEPARTMENTS[2].id);
        }
      })
      .catch(() => {
        if (!active) return;
        showToast('Đã xảy ra lỗi, vui lòng thử lại!', 'Không thể tải dữ liệu Tuyển dụng ATS. Vui lòng thử làm mới lại trang.', 'error');
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
    if (selectedJobId === 'ALL') return candidates;
    return candidates.filter((c) => c.job_id === selectedJobId);
  }, [candidates, selectedJobId]);

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
        'Vui lòng nhập đầy đủ thông tin!',
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
      'Tạo thành công!',
      `Đã khởi tạo Onboarding ${result.onboarding.id} cho ${result.employee.full_name} (${result.employee.employee_code}).`,
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
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? updatedCandidate : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === candidate.id ? updatedCandidate : prev
    );
    showToast(
      'Cập nhật thành công!',
      `${candidate.full_name} (${candidate.candidate_code}) -> ${stageMeta?.label ?? targetStage}.`,
      'success'
    );
  };

  const handleStepStage = (candidate: Candidate, direction: -1 | 1) => {
    const idx = stageOrder.indexOf(candidate.stage);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= stageOrder.length) return;
    handleMoveStage(candidate, stageOrder[nextIdx]);
  };

  const handleReRunAiScore = (candidate: Candidate) => {
    const currentScore = candidate.ai_evaluation.match_score;
    const bumpedScore = Math.min(99, currentScore >= 95 ? currentScore : currentScore + 2);
    const updatedEval: CandidateAiEvaluation = {
      ...candidate.ai_evaluation,
      match_score: bumpedScore,
      ai_recommendation:
        bumpedScore >= 85
          ? 'STRONG_HIRE'
          : bumpedScore >= 72
          ? 'PROCEED_INTERVIEW'
          : candidate.ai_evaluation.ai_recommendation,
    };

    const updatedCandidate: Candidate = { ...candidate, ai_evaluation: updatedEval };
    saveRuntimeCandidate(updatedCandidate);

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? updatedCandidate : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === candidate.id ? updatedCandidate : prev
    );
    showToast(
      'Cập nhật thành công!',
      `${candidate.full_name} đạt điểm khớp JD mới: ${bumpedScore}/100.`,
      'success'
    );
  };

  const handleAddJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobTitle.trim()) {
      showToast('Vui lòng nhập đầy đủ thông tin!', 'Vui lòng nhập tên vị trí cần tuyển dụng.', 'warning');
      return;
    }

    const dept = departments.find((d) => d.id === newJobDeptId) ?? departments[0];
    if (!dept) return;
    const nextNum = jobs.length + 1;
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
      salary_range_min_vnd: 25000000,
      salary_range_max_vnd: 40000000,
      status: newJobUrgent,
      hiring_manager_name: dept.manager_name,
      published_date: '2026-11-18',
      closing_date: newJobClosingDate || '2026-12-30',
    };

    setJobs((prev) => [created, ...prev]);
    setIsAddJobOpen(false);
    setNewJobTitle('');
    showToast(
      'Tạo thành công!',
      `${created.job_code} — ${created.title} đã được mở nhận hồ sơ.`,
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
            Tuyển dụng & AI Sàng lọc CV (ATS)
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Quản lý tin tuyển dụng, theo dõi quy trình ứng viên theo Kanban và đánh giá CV bằng AI
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddJobOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Tạo tin tuyển dụng
        </Button>
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
            Bảng Kanban quy trình ứng viên
          </h2>
          <span className="text-xs text-[#5C7871] dark:text-zinc-400">
            Nhấn vào thẻ ứng viên để xem chi tiết AI chấm điểm CV & 3 câu hỏi phỏng vấn
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kanbanStages.map((stageCol, stageIdx) => {
            const stageCandidates = filteredCandidates.filter(
              (c) => c.stage === stageCol.stage
            );
            const stageTopBorder: Record<AtsStage, string> = {
              APPLIED: 'border-t-4 border-t-blue-500 dark:border-t-blue-400',
              AI_SCREENED: 'border-t-4 border-t-violet-500 dark:border-t-violet-400',
              INTERVIEW: 'border-t-4 border-t-amber-500 dark:border-t-amber-400',
              OFFER: 'border-t-4 border-t-[#0F766E] dark:border-t-teal-400',
              ONBOARDED: 'border-t-4 border-t-emerald-500 dark:border-t-emerald-400',
            };
            return (
              <div
                key={stageCol.stage}
                className={cn(
                  'flex flex-col rounded-[12px] border border-[#C6D9D3] bg-[#E4EEEB] p-3 dark:border-zinc-800/80 dark:bg-zinc-900/40',
                  stageTopBorder[stageCol.stage]
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      {stageCol.label}
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-[#C6D9D3] bg-[#FCFEFD] font-mono text-[11px] tabular-nums text-[#415A54] dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-300"
                  >
                    {stageCandidates.length}
                  </Badge>
                </div>

                <div className="flex-1 space-y-2.5">
                  {stageCandidates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5] p-4 text-center text-xs text-[#5C7871] dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-500">
                      Chưa có ứng viên
                    </div>
                  ) : (
                    stageCandidates.map((cand) => {
                      const score = cand.ai_evaluation.match_score;
                      return (
                        <div
                          key={cand.id}
                          onClick={() => setSelectedCandidate(cand)}
                          className="cursor-pointer rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 shadow-[0_1px_2px_rgba(17,34,30,0.04)] transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:bg-[#121214] dark:shadow-none dark:hover:border-teal-400/50 dark:hover:bg-[#18181b]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
                              {cand.candidate_code}
                            </span>
                            <Badge
                              variant={score >= 85 ? 'teal' : score >= 70 ? 'info' : 'warning'}
                              className="font-mono text-[11px] tabular-nums"
                            >
                              AI {score}%
                            </Badge>
                          </div>

                          <div className="mt-1.5 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                            {cand.full_name}
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-[#415A54] dark:text-zinc-400">
                            {cand.job_title}
                          </div>

                          <div className="mt-2.5 flex items-center justify-between border-t border-[#D5E3DF] pt-2 dark:border-zinc-800/80">
                            <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                              Nguồn: {cand.source}
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
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] transition-colors hover:bg-[#E8F3EF] hover:text-[#11221E] disabled:opacity-30 dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                disabled={stageIdx === stageOrder.length - 1}
                                onClick={() => handleStepStage(cand, 1)}
                                aria-label="Chuyển bước tiếp theo"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] transition-colors hover:bg-[#E8F3EF] hover:text-[#11221E] disabled:opacity-30 dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
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

      {/* Candidate AI Evaluation Dialog */}
      <Dialog
        open={Boolean(selectedCandidate)}
        onOpenChange={(open) => {
          if (!open) setSelectedCandidate(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selectedCandidate && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{selectedCandidate.full_name}</span>
                  <span className="font-mono text-xs font-normal text-[#415A54] dark:text-zinc-400">
                    ({selectedCandidate.candidate_code})
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Ứng tuyển: {selectedCandidate.job_title} · Nguồn: {selectedCandidate.source} · Ngày nộp:{' '}
                  {formatDateVN(selectedCandidate.applied_date)}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                {/* Score & Metadata */}
                <div className="flex flex-col gap-4 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#0F766E]/25 bg-[#CBE8E2] font-mono text-xl font-semibold tabular-nums text-[#0B4F4A] dark:border-teal-400/20 dark:bg-teal-950/50 dark:text-teal-300">
                      {selectedCandidate.ai_evaluation.match_score}%
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                          AI Match Score
                        </span>
                        <Badge
                          variant={
                            AI_REC_BADGE[selectedCandidate.ai_evaluation.ai_recommendation].variant
                          }
                        >
                          {AI_REC_BADGE[selectedCandidate.ai_evaluation.ai_recommendation].label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                        Kinh nghiệm: {selectedCandidate.ai_evaluation.experience_years} năm ·{' '}
                        {selectedCandidate.ai_evaluation.education_fit}
                      </p>
                    </div>
                  </div>
                  {!hideSalary && (
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                        Mức lương kỳ vọng
                      </div>
                      <div className="font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedCandidate.expected_salary_vnd)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Matched Skills */}
                <div>
                  <div className="text-xs font-semibold text-[#415A54] dark:text-zinc-400">
                    Kỹ năng khớp JD
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedCandidate.ai_evaluation.key_skills_matched.map((skill) => (
                      <Badge key={skill} variant="secondary" className="font-mono text-[11px]">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Strengths & Gaps */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/60 p-3.5 dark:border-zinc-800/80 dark:bg-transparent">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] dark:text-teal-400">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                      Điểm mạnh nổi bật
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#11221E] dark:text-zinc-300">
                      {selectedCandidate.ai_evaluation.strengths.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E] dark:bg-teal-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/60 p-3.5 dark:border-zinc-800/80 dark:bg-transparent">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
                      Điểm còn thiếu (Gaps)
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#11221E] dark:text-zinc-300">
                      {selectedCandidate.ai_evaluation.gaps.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* AI Interview Questions */}
                <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-transparent">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      <MessageSquareText className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                      {selectedCandidate.ai_evaluation.interview_questions.length} câu hỏi phỏng vấn gợi ý bởi AI
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#5C7871] dark:text-zinc-400">
                      <Cpu className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {selectedCandidate.ai_evaluation.evaluated_by_model}
                    </span>
                  </div>
                  <ol className="mt-3 space-y-2 text-xs leading-5 text-[#11221E] dark:text-zinc-300">
                    {selectedCandidate.ai_evaluation.interview_questions.map((q, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#C6D9D3] bg-[#E4EEEB] font-mono text-[11px] font-semibold text-[#0B4F4A] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-300">
                          {idx + 1}
                        </span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleReRunAiScore(selectedCandidate)}
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                  Chạy lại AI chấm điểm
                </Button>
                {(selectedCandidate.stage === 'APPLIED' ||
                  selectedCandidate.stage === 'AI_SCREENED') && (
                  <Button
                    variant="primary"
                    onClick={() => handleMoveStage(selectedCandidate, 'INTERVIEW')}
                  >
                    Chuyển sang Phỏng vấn
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                )}
                {(selectedCandidate.stage === 'INTERVIEW' ||
                  selectedCandidate.stage === 'OFFER') && (
                  <Button
                    variant="primary"
                    onClick={() => openOnboardingInitDialog(selectedCandidate)}
                  >
                    <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
                    Chuyển sang Onboarding
                  </Button>
                )}
                {selectedCandidate.stage === 'ONBOARDED' && (
                  <Button
                    variant="primary"
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
                  >
                    <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
                    Xem hồ sơ Onboarding
                  </Button>
                )}
              </DialogFooter>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo tin tuyển dụng mới</DialogTitle>
            <DialogDescription>
              Tin tuyển dụng mới sẽ hiển thị ngay trên bảng Kanban ATS.
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddJobOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Đăng tin tuyển dụng
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
