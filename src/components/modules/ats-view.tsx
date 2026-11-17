'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import { AtsKanbanStageItem, fetchAtsMock, fetchEmployeesMock } from '@/lib/mock-fetcher';
import { cn, formatDateVN, formatVND } from '@/lib/utils';
import type {
  AtsStage,
  Candidate,
  CandidateAiEvaluation,
  Department,
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

export function AtsView() {
  const { role, showToast } = useApp();
  const hideSalary = role === 'DEPT_MANAGER';

  const [isLoading, setIsLoading] = useState(true);
  const [kanbanStages, setKanbanStages] = useState<AtsKanbanStageItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('ALL');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);

  // New Job form state
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDeptId, setNewJobDeptId] = useState('dept-tech-swe');
  const [newJobLevel, setNewJobLevel] = useState('Senior');
  const [newJobTarget, setNewJobTarget] = useState('1');
  const [newJobClosingDate, setNewJobClosingDate] = useState('2026-12-30');
  const [newJobUrgent, setNewJobUrgent] = useState<'OPEN' | 'URGENT'>('OPEN');

  useEffect(() => {
    let active = true;
    Promise.all([fetchAtsMock(), fetchEmployeesMock()])
      .then(([atsData, empData]) => {
        if (!active) return;
        setKanbanStages(atsData.ATS_KANBAN_STAGES);
        setJobs(atsData.MOCK_JOB_POSTINGS);
        setCandidates(atsData.MOCK_CANDIDATES);
        setDepartments(empData.MOCK_DEPARTMENTS);
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

  const stageOrder = useMemo(() => kanbanStages.map((s) => s.stage), [kanbanStages]);

  const filteredCandidates = useMemo(() => {
    if (selectedJobId === 'ALL') return candidates;
    return candidates.filter((c) => c.job_id === selectedJobId);
  }, [candidates, selectedJobId]);

  const handleMoveStage = (candidate: Candidate, targetStage: AtsStage) => {
    const stageMeta = kanbanStages.find((s) => s.stage === targetStage);
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? { ...c, stage: targetStage } : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === candidate.id ? { ...prev, stage: targetStage } : prev
    );
    showToast(
      'Đã cập nhật trạng thái ứng viên',
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

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? { ...c, ai_evaluation: updatedEval } : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === candidate.id ? { ...prev, ai_evaluation: updatedEval } : prev
    );
    showToast(
      'Đã chạy lại AI chấm điểm CV',
      `${candidate.full_name} đạt điểm khớp JD mới: ${bumpedScore}/100.`,
      'success'
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
      'Đã đăng tin tuyển dụng mới',
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
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Tuyển dụng & AI Sàng lọc CV (ATS)
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Quản lý tin tuyển dụng, theo dõi quy trình ứng viên theo Kanban và đánh giá CV bằng AI
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddJobOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Tạo tin tuyển dụng
        </Button>
      </div>

      {/* Job Postings Section */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Briefcase className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
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
                  'cursor-pointer border-l-4 transition-colors hover:border-teal-700/50 dark:hover:border-teal-400/50',
                  job.status === 'URGENT'
                    ? 'border-l-rose-500 dark:border-l-rose-400'
                    : job.status === 'OPEN'
                    ? 'border-l-teal-500 dark:border-l-teal-400'
                    : 'border-l-zinc-400 dark:border-l-zinc-500',
                  isSelected && 'border-teal-700 ring-1 ring-teal-700/20 dark:border-teal-400 dark:ring-teal-400/20'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="whitespace-nowrap font-mono text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      {job.job_code}
                    </span>
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-zinc-900 dark:text-zinc-100">
                    {job.title}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {job.department_name} · {job.level}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800/80">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                      <Users className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                      {job.applicants_count} hồ sơ
                    </span>
                    <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
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
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Bảng Kanban quy trình ứng viên
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
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
              OFFER: 'border-t-4 border-t-teal-500 dark:border-t-teal-400',
              ONBOARDED: 'border-t-4 border-t-emerald-500 dark:border-t-emerald-400',
            };
            return (
              <div
                key={stageCol.stage}
                className={cn(
                  'flex flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/40',
                  stageTopBorder[stageCol.stage]
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {stageCol.label}
                    </h3>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-mono text-[11px] tabular-nums">
                    {stageCandidates.length}
                  </Badge>
                </div>

                <div className="flex-1 space-y-2.5">
                  {stageCandidates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-200/80 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-500">
                      Chưa có ứng viên
                    </div>
                  ) : (
                    stageCandidates.map((cand) => {
                      const score = cand.ai_evaluation.match_score;
                      return (
                        <div
                          key={cand.id}
                          onClick={() => setSelectedCandidate(cand)}
                          className="cursor-pointer rounded-lg border border-zinc-200/80 bg-white p-3 transition-colors hover:border-teal-700/50 dark:border-zinc-800/80 dark:bg-[#121214] dark:hover:border-teal-400/50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                              {cand.candidate_code}
                            </span>
                            <Badge
                              variant={score >= 85 ? 'teal' : score >= 70 ? 'info' : 'warning'}
                              className="font-mono text-[11px] tabular-nums"
                            >
                              AI {score}%
                            </Badge>
                          </div>

                          <div className="mt-1.5 font-medium text-sm text-zinc-900 dark:text-zinc-100">
                            {cand.full_name}
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {cand.job_title}
                          </div>

                          <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800/80">
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
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
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200/80 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                disabled={stageIdx === stageOrder.length - 1}
                                onClick={() => handleStepStage(cand, 1)}
                                aria-label="Chuyển bước tiếp theo"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200/80 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                  <span className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">
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
                <div className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-teal-700/20 bg-teal-50/80 font-mono text-xl font-semibold tabular-nums text-teal-800 dark:border-teal-400/20 dark:bg-teal-950/50 dark:text-teal-300">
                      {selectedCandidate.ai_evaluation.match_score}%
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
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
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Kinh nghiệm: {selectedCandidate.ai_evaluation.experience_years} năm ·{' '}
                        {selectedCandidate.ai_evaluation.education_fit}
                      </p>
                    </div>
                  </div>
                  {!hideSalary && (
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Mức lương kỳ vọng
                      </div>
                      <div className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedCandidate.expected_salary_vnd)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Matched Skills */}
                <div>
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
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
                  <div className="rounded-lg border border-zinc-200/80 p-3.5 dark:border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                      Điểm mạnh nổi bật
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
                      {selectedCandidate.ai_evaluation.strengths.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-700 dark:bg-teal-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-zinc-200/80 p-3.5 dark:border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
                      Điểm còn thiếu (Gaps)
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
                      {selectedCandidate.ai_evaluation.gaps.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 3 AI Interview Questions */}
                <div className="rounded-lg border border-zinc-200/80 p-4 dark:border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      <MessageSquareText className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
                      3 câu hỏi phỏng vấn gợi ý bởi AI
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400">
                      <Cpu className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {selectedCandidate.ai_evaluation.evaluated_by_model}
                    </span>
                  </div>
                  <ol className="mt-3 space-y-2 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
                    {selectedCandidate.ai_evaluation.interview_questions.slice(0, 3).map((q, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 font-mono text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
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
                {selectedCandidate.stage !== 'INTERVIEW' && (
                  <Button
                    variant="primary"
                    onClick={() => handleMoveStage(selectedCandidate, 'INTERVIEW')}
                  >
                    Chuyển sang Phỏng vấn
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                )}
              </DialogFooter>
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
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
