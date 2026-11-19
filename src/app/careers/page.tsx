'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  HeartHandshake,
  Laptop,
  Mail,
  MapPin,
  Moon,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import { MOCK_JOB_POSTINGS } from '@/mock/ats';
import type { Candidate, JobPosting } from '@/mock/types';
import {
  getJobPostings,
  HRM_RUNTIME_EVENT,
  pushNotification,
  saveRuntimeCandidate,
} from '@/lib/runtime-store';
import { cn, formatVND } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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

const DEPARTMENT_FILTERS = [
  { id: 'ALL', label: 'Tất cả vị trí' },
  { id: 'dept-tech-swe', label: 'Kỹ thuật Phần mềm' },
  { id: 'dept-tech-data', label: 'Dữ liệu & Trí tuệ nhân tạo' },
  { id: 'dept-hr', label: 'Nhân sự & Hành chính' },
  { id: 'dept-sales', label: 'Khối Kinh doanh B2B' },
];

const LEVEL_FILTERS = ['ALL', 'Senior', 'Mid - Senior', 'Mid', 'Lead'];

export default function CareersPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [jobs, setJobs] = useState<JobPosting[]>(MOCK_JOB_POSTINGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState('ALL');

  // Job detail / Apply modal
  const [activeJob, setActiveJob] = useState<JobPosting | null>(null);
  const [modalTab, setModalTab] = useState<'jd' | 'apply'>('jd');

  // Application form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [portfolioLink, setPortfolioLink] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [cvFile, setCvFile] = useState<{ name: string; size: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success Confirmation State
  const [submittedCandidate, setSubmittedCandidate] = useState<{
    code: string;
    fullName: string;
    jobTitle: string;
    email: string;
  } | null>(null);

  const syncJobs = useCallback(() => {
    setJobs(getJobPostings(MOCK_JOB_POSTINGS));
  }, []);

  useEffect(() => {
    syncJobs();
    window.addEventListener(HRM_RUNTIME_EVENT, syncJobs);
    window.addEventListener('storage', syncJobs);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncJobs);
      window.removeEventListener('storage', syncJobs);
    };
  }, [syncJobs]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (typeof document !== 'undefined') {
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  // Filtered Jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (selectedDept !== 'ALL' && job.department_id !== selectedDept) return false;
      if (selectedLevel !== 'ALL' && job.level !== selectedLevel) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = job.title.toLowerCase().includes(q);
        const matchCode = job.job_code.toLowerCase().includes(q);
        const matchDept = job.department_name.toLowerCase().includes(q);
        const matchReq = job.requirements?.some((r) => r.toLowerCase().includes(q)) ?? false;
        if (!matchTitle && !matchCode && !matchDept && !matchReq) return false;
      }
      return true;
    });
  }, [jobs, searchQuery, selectedDept, selectedLevel]);

  const handleOpenJob = (job: JobPosting, tab: 'jd' | 'apply' = 'jd') => {
    setActiveJob(job);
    setModalTab(tab);
    setFormErrors({});
    if (tab === 'apply' && !expectedSalary) {
      setExpectedSalary(String(job.salary_range_min_vnd));
    }
  };

  const handleCloseJob = () => {
    setActiveJob(null);
    setFormErrors({});
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setCvFile({ name: file.name, size: `${sizeMb} MB` });
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.cv;
        return next;
      });
    }
  };

  const handleQuickSalary = (amount: number) => {
    setExpectedSalary(String(amount));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.expectedSalary;
      return next;
    });
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = 'Vui lòng nhập họ và tên của bạn.';
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.email = 'Vui lòng nhập địa chỉ email hợp lệ.';
    }
    if (!phone.trim() || phone.trim().length < 9) {
      errors.phone = 'Vui lòng nhập số điện thoại liên hệ hợp lệ.';
    }
    const salaryNum = Number(expectedSalary);
    if (!expectedSalary || Number.isNaN(salaryNum) || salaryNum <= 0) {
      errors.expectedSalary = 'Vui lòng nhập mức lương kỳ vọng bằng số VNĐ.';
    }
    if (!cvFile) {
      errors.cv = 'Vui lòng đính kèm file CV định dạng PDF hoặc DOCX.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    if (!validateForm()) return;

    setIsSubmitting(true);

    const now = new Date();
    const candidateSeq = Math.floor(100 + Math.random() * 900);
    const candidateCode = `UV-2026-${candidateSeq}`;
    const candidateId = `cand-portal-${Date.now()}`;
    const salaryNum = Number(expectedSalary) || activeJob.salary_range_min_vnd;

    const newCandidate: Candidate = {
      id: candidateId,
      candidate_code: candidateCode,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      job_id: activeJob.id,
      job_code: activeJob.job_code,
      job_title: activeJob.title,
      department_name: activeJob.department_name,
      stage: 'APPLIED',
      applied_date: now.toISOString().slice(0, 10),
      source: 'CareerSite',
      expected_salary_vnd: salaryNum,
      current_company: currentCompany.trim() || 'Ứng viên tự do',
      ai_evaluation: {
        match_score: 85,
        education_fit: 'Cử nhân Đại học / Cao đẳng phù hợp chuyên ngành',
        experience_years: 3,
        key_skills_matched: ['Kinh nghiệm thực tế', 'Kỹ năng chuyên môn', 'Tác phong chủ động'],
        strengths: [
          'Hồ sơ nộp trực tiếp qua Cổng việc làm Lạc Việt HRM',
          'Mức lương kỳ vọng sát khung ngân sách của vị trí',
          'Thông tin liên lạc đầy đủ, sẵn sàng tham gia phỏng vấn',
        ],
        gaps: ['Cần phỏng vấn xác nhận năng lực và mức độ phù hợp văn hóa'],
        interview_questions: [
          `Lý do bạn ứng tuyển vào vị trí ${activeJob.title} tại Lạc Việt?`,
          'Dự án nổi bật nhất bạn từng đảm nhận và đóng góp cụ thể của bạn là gì?',
          'Kỳ vọng của bạn về môi trường làm việc và cơ hội thăng tiến trong 2 năm tới?',
        ],
        ai_recommendation: 'PROCEED_INTERVIEW',
        evaluated_by_model: 'Lạc Việt ATS Screening Engine v2.4',
      },
    };

    // Save to runtime store so it syncs immediately to ATS Kanban
    saveRuntimeCandidate(newCandidate);

    // Push notification to HR Manager and Super Admin
    pushNotification({
      title: `Ứng viên mới nộp hồ sơ (${candidateCode})`,
      message: `${fullName.trim()} vừa nộp hồ sơ ứng tuyển vị trí ${activeJob.title} qua Cổng việc làm.`,
      category: 'ONBOARDING',
      target_roles: ['HR_MANAGER', 'SUPER_ADMIN'],
      nav_id: 'recruitment',
    });

    setTimeout(() => {
      setIsSubmitting(false);
      setSubmittedCandidate({
        code: candidateCode,
        fullName: fullName.trim(),
        jobTitle: activeJob.title,
        email: email.trim(),
      });
      // Reset form
      setFullName('');
      setEmail('');
      setPhone('');
      setExpectedSalary('');
      setCurrentCompany('');
      setPortfolioLink('');
      setCoverLetter('');
      setCvFile(null);
      setActiveJob(null);
    }, 450);
  };

  return (
    <div className={cn('min-h-screen font-sans transition-colors', theme === 'dark' ? 'dark bg-zinc-950 text-zinc-100' : 'bg-[#EFF5F3] text-[#11221E]')}>
      {/* Top Banner Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#C6D9D3] bg-[#FCFEFD]/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F766E] text-white shadow-sm">
              <Building2 className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                  LẠC VIỆT
                </span>
                <span className="rounded bg-[#CBE8E2] px-1.5 py-0.5 text-[10px] font-semibold text-[#0B4F4A] dark:bg-teal-950 dark:text-teal-300">
                  CAREERS
                </span>
              </div>
              <p className="text-[11px] text-[#415A54] dark:text-zinc-400">
                Cổng Cơ hội Nghề nghiệp & Tuyển dụng Trực tuyến
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Đổi giao diện sáng/tối"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#415A54] transition-colors hover:bg-[#EFF5F3] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-semibold text-[#415A54] shadow-sm transition-colors hover:bg-[#E8F3EF] hover:text-[#0F766E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <User className="h-3.5 w-3.5" />
              <span>Đăng nhập nội bộ</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative border-b border-[#C6D9D3] bg-[#E4EEEB]/70 py-12 dark:border-zinc-800 dark:bg-zinc-900/60 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1 text-xs font-semibold text-[#0F766E] shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-teal-300">
              <Sparkles className="h-3.5 w-3.5" />
              Đang mở tuyển {jobs.length} vị trí trọng điểm Quý 4/2026 (Cập nhật trực tiếp)
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#11221E] dark:text-zinc-50 sm:text-4xl lg:text-5xl">
              Cùng Lạc Việt kiến tạo nền tảng quản trị tương lai
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#415A54] dark:text-zinc-300 sm:text-base">
              Môi trường làm việc chuẩn mực, tôn trọng năng lực, dải lương minh bạch 100%, trang bị máy tính cao cấp và cơ hội phát triển đột phá cho nhân tài công nghệ và nhân sự.
            </p>

            {/* 3 Core Perks Pills */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-[#11221E] dark:text-zinc-200">
              <div className="flex items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-800">
                <ShieldCheck className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
                <span className="font-medium">Minh bạch dải lương 100%</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-800">
                <Clock className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
                <span className="font-medium">Phản hồi hồ sơ trong 24 - 48h</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-800">
                <Laptop className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
                <span className="font-medium">Cấp mới MacBook Pro / Workstation</span>
              </div>
            </div>

            {/* Search Box */}
            <div className="mt-8 flex items-center rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-1.5 shadow-md dark:border-zinc-700 dark:bg-zinc-800">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C7871] dark:text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo chức danh, kỹ năng (Go, Python, AI, Sales, HR...)"
                  className="h-10 w-full rounded-lg bg-transparent pl-10 pr-4 text-sm text-[#11221E] placeholder:text-[#5C7871] focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mr-1 p-2 text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Jobs Directory */}
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Filters Bar */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {DEPARTMENT_FILTERS.map((dept) => (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => setSelectedDept(dept.id)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    selectedDept === dept.id
                      ? 'border border-[#0F766E] bg-[#0F766E] text-white shadow-sm'
                      : 'border border-[#C6D9D3] bg-[#FCFEFD] text-[#415A54] hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  )}
                >
                  {dept.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#5C7871] dark:text-zinc-400">Cấp bậc:</span>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="h-8 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 text-xs font-medium text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {LEVEL_FILTERS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === 'ALL' ? 'Tất cả cấp bậc' : lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#415A54] dark:text-zinc-400">
            <span>
              Tìm thấy <strong className="font-semibold text-[#11221E] dark:text-zinc-100">{filteredJobs.length}</strong> cơ hội nghề nghiệp phù hợp
            </span>
            {(selectedDept !== 'ALL' || selectedLevel !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDept('ALL');
                  setSelectedLevel('ALL');
                  setSearchQuery('');
                }}
                className="text-[#0F766E] hover:underline dark:text-teal-400"
              >
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        </div>

        {/* Jobs List */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job) => (
            <Card
              key={job.id}
              className="flex flex-col justify-between border-[#C6D9D3] bg-[#FCFEFD] transition-all hover:border-[#0F766E] hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80"
            >
              <CardContent className="p-5">
                {/* Header tags */}
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                    {job.job_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {job.status === 'URGENT' && (
                      <Badge variant="warning">Tuyển gấp</Badge>
                    )}
                    <Badge variant="teal">{job.level}</Badge>
                  </div>
                </div>

                {/* Job Title */}
                <h3 className="mt-3 text-base font-semibold text-[#11221E] dark:text-zinc-100 line-clamp-2">
                  {job.title}
                </h3>

                <p className="mt-1 text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  {job.department_name}
                </p>

                {/* Salary Band */}
                <div className="mt-4 rounded-lg border border-[#C6D9D3] bg-[#EFF5F3] p-2.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                  <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                    Dải lương công khai (Gross):
                  </span>
                  <div className="font-mono text-sm font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {formatVND(job.salary_range_min_vnd)} – {formatVND(job.salary_range_max_vnd)}
                  </div>
                </div>

                {/* Metadata Pills */}
                <div className="mt-4 space-y-1.5 text-xs text-[#415A54] dark:text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#5C7871]" />
                    <span className="truncate">{job.location ?? 'Hà Nội / Hybrid'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#5C7871]" />
                    <span>{job.employment_type ?? 'Toàn thời gian'} · {job.work_mode ?? 'Hybrid'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-[#5C7871]" />
                    <span>Hạn nhận hồ sơ: {job.closing_date}</span>
                  </div>
                </div>

                {/* Overview preview */}
                {job.overview && (
                  <p className="mt-3 text-xs text-[#5C7871] dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {job.overview}
                  </p>
                )}
              </CardContent>

              {/* Action Footer */}
              <div className="flex items-center gap-2 border-t border-[#D5E3DF] bg-[#F2F7F5] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-[#C6D9D3] bg-white text-xs font-semibold text-[#11221E] hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  onClick={() => handleOpenJob(job, 'jd')}
                >
                  Xem chi tiết JD
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1 text-xs font-semibold"
                  onClick={() => handleOpenJob(job, 'apply')}
                >
                  Ứng tuyển ngay
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filteredJobs.length === 0 && (
          <div className="mt-12 rounded-2xl border border-dashed border-[#C6D9D3] bg-[#FCFEFD] p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <Briefcase className="mx-auto h-12 w-12 text-[#5C7871] opacity-60" />
            <h3 className="mt-4 text-base font-semibold text-[#11221E] dark:text-zinc-100">
              Không tìm thấy vị trí tuyển dụng phù hợp
            </h3>
            <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
              Thử tìm kiếm với từ khóa khác hoặc đặt lại bộ lọc phòng ban.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 border-[#C6D9D3]"
              onClick={() => {
                setSelectedDept('ALL');
                setSelectedLevel('ALL');
                setSearchQuery('');
              }}
            >
              Xem tất cả vị trí
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-[#C6D9D3] bg-[#E4EEEB]/60 py-12 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F766E] text-white">
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
                  LẠC VIỆT HRM
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Giải pháp Quản trị Nhân sự & Chấm công - Tiền lương thông minh, đồng hành cùng sự phát triển bền vững của doanh nghiệp Việt Nam.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                Thông tin Tuyển dụng
              </h4>
              <ul className="mt-3 space-y-2 text-xs text-[#415A54] dark:text-zinc-400">
                <li>Email nhận CV: <strong>recruitment@lacviethrm.vn</strong></li>
                <li>Hotline Ban Nhân sự: <strong>(024) 3788 9999</strong> (Ext: 104)</li>
                <li>Địa chỉ Trụ sở: Tòa nhà Lạc Việt, Quận Cầu Giấy, TP. Hà Nội</li>
                <li>Văn phòng Chi nhánh: Quận 1, TP. Hồ Chí Minh</li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                Cam kết với Ứng viên
              </h4>
              <p className="mt-3 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Mọi hồ sơ ứng tuyển đều được bảo mật tuyệt đối. Chúng tôi cam kết phản hồi tiến độ và kết quả cho tất cả ứng viên trong vòng 48 giờ làm việc.
              </p>
              <div className="mt-4">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline dark:text-teal-400"
                >
                  <span>Chuyển sang Cổng Điều hành Nội bộ</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-[#C6D9D3] pt-6 text-center text-xs text-[#5C7871] dark:border-zinc-800 dark:text-zinc-500">
            © 2026 Tổng Công ty Lạc Việt. Bản quyền đã được bảo hộ. Hệ thống quản trị tuyển dụng tích hợp ATS & Onboarding.
          </div>
        </div>
      </footer>

      {/* Job Detail & Application Dialog */}
      <Dialog open={Boolean(activeJob)} onOpenChange={(open) => !open && handleCloseJob()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0 sm:max-w-3xl">
          {activeJob && (
            <div>
              {/* Modal Header */}
              <div className="border-b border-[#C6D9D3] bg-[#E4EEEB] p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#0F766E] dark:text-teal-400">
                        {activeJob.job_code}
                      </span>
                      <Badge variant="teal">{activeJob.level}</Badge>
                      {activeJob.status === 'URGENT' && <Badge variant="warning">Tuyển gấp</Badge>}
                    </div>
                    <h2 className="mt-2 text-xl font-bold text-[#11221E] dark:text-zinc-100">
                      {activeJob.title}
                    </h2>
                    <p className="text-xs text-[#415A54] dark:text-zinc-400">
                      {activeJob.department_name} · Quản lý tuyển dụng:{' '}
                      <strong className="font-semibold text-[#11221E] dark:text-zinc-200">
                        {activeJob.hiring_manager_name}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* Sub tabs in Modal */}
                <div className="mt-4 flex rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-1 dark:border-zinc-800 dark:bg-zinc-950">
                  <button
                    type="button"
                    onClick={() => setModalTab('jd')}
                    className={cn(
                      'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                      modalTab === 'jd'
                        ? 'bg-[#0F766E] text-white shadow-sm'
                        : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-100'
                    )}
                  >
                    1. Chi tiết Mô tả Công việc (JD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('apply')}
                    className={cn(
                      'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                      modalTab === 'apply'
                        ? 'bg-[#0F766E] text-white shadow-sm'
                        : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-100'
                    )}
                  >
                    2. Nộp hồ sơ ứng tuyển ngay
                  </button>
                </div>
              </div>

              {/* Modal Body: Tab JD */}
              {modalTab === 'jd' && (
                <div className="space-y-6 p-6">
                  {/* Salary & Location Highlights */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#C6D9D3] bg-[#EFF5F3] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                      <span className="text-xs text-[#5C7871] dark:text-zinc-400">Mức lương công khai:</span>
                      <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
                        {formatVND(activeJob.salary_range_min_vnd)} – {formatVND(activeJob.salary_range_max_vnd)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#C6D9D3] bg-[#EFF5F3] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                      <span className="text-xs text-[#5C7871] dark:text-zinc-400">Địa điểm & Hình thức:</span>
                      <div className="mt-1 text-sm font-semibold text-[#11221E] dark:text-zinc-200">
                        {activeJob.location ?? 'Hà Nội'} · {activeJob.work_mode ?? 'Hybrid'}
                      </div>
                    </div>
                  </div>

                  {/* Overview */}
                  {activeJob.overview && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                        Tổng quan vị trí
                      </h4>
                      <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-300">
                        {activeJob.overview}
                      </p>
                    </div>
                  )}

                  {/* Responsibilities */}
                  {activeJob.responsibilities && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                        Trách nhiệm công việc chính
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {activeJob.responsibilities.map((resp, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
                            <span className="leading-relaxed">{resp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Requirements */}
                  {activeJob.requirements && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                        Yêu cầu ứng viên
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {activeJob.requirements.map((req, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
                            <span className="leading-relaxed">{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Benefits */}
                  {activeJob.benefits && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                        Chế độ đãi ngộ & Quyền lợi
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {activeJob.benefits.map((ben, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" />
                            <span className="leading-relaxed">{ben}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Next Step CTA */}
                  <div className="flex items-center justify-between border-t border-[#D5E3DF] pt-4 dark:border-zinc-800">
                    <Button variant="outline" onClick={handleCloseJob} className="text-xs">
                      Đóng
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => setModalTab('apply')}
                      className="text-xs font-semibold"
                    >
                      Ứng tuyển vị trí này ngay
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Modal Body: Tab Apply Form */}
              {modalTab === 'apply' && (
                <form onSubmit={handleSubmitApplication} className="space-y-4 p-6">
                  <div className="rounded-lg border border-[#C6D9D3] bg-[#EFF5F3] p-3 text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300">
                    Bạn đang ứng tuyển vị trí:{' '}
                    <strong className="font-semibold text-[#11221E] dark:text-zinc-100">
                      {activeJob.title}
                    </strong>{' '}
                    ({activeJob.job_code}) thuộc {activeJob.department_name}.
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Họ và tên <span className="text-rose-600">*</span>
                      </label>
                      <Input
                        type="text"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          setFormErrors((prev) => {
                            const next = { ...prev };
                            delete next.fullName;
                            return next;
                          });
                        }}
                        placeholder="Ví dụ: Nguyễn Văn An"
                        className="mt-1 h-9 text-xs"
                      />
                      {formErrors.fullName && (
                        <p className="mt-1 text-[11px] text-rose-600">{formErrors.fullName}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Email liên hệ <span className="text-rose-600">*</span>
                      </label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setFormErrors((prev) => {
                            const next = { ...prev };
                            delete next.email;
                            return next;
                          });
                        }}
                        placeholder="an.nguyen@gmail.com"
                        className="mt-1 h-9 text-xs"
                      />
                      {formErrors.email && (
                        <p className="mt-1 text-[11px] text-rose-600">{formErrors.email}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Số điện thoại <span className="text-rose-600">*</span>
                      </label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          setFormErrors((prev) => {
                            const next = { ...prev };
                            delete next.phone;
                            return next;
                          });
                        }}
                        placeholder="0912 345 678"
                        className="mt-1 h-9 text-xs"
                      />
                      {formErrors.phone && (
                        <p className="mt-1 text-[11px] text-rose-600">{formErrors.phone}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Mức lương kỳ vọng (VNĐ/tháng) <span className="text-rose-600">*</span>
                      </label>
                      <Input
                        type="number"
                        value={expectedSalary}
                        onChange={(e) => {
                          setExpectedSalary(e.target.value);
                          setFormErrors((prev) => {
                            const next = { ...prev };
                            delete next.expectedSalary;
                            return next;
                          });
                        }}
                        placeholder={String(activeJob.salary_range_min_vnd)}
                        className="mt-1 h-9 text-xs font-mono tabular-nums"
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-[#5C7871]">Gợi ý nhanh:</span>
                        <button
                          type="button"
                          onClick={() => handleQuickSalary(activeJob.salary_range_min_vnd)}
                          className="rounded border border-[#C6D9D3] bg-[#FCFEFD] px-1.5 py-0.5 text-[10px] text-[#0F766E] hover:bg-[#E8F3EF]"
                        >
                          Min: {formatVND(activeJob.salary_range_min_vnd)}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickSalary(
                              Math.round(
                                (activeJob.salary_range_min_vnd + activeJob.salary_range_max_vnd) / 2
                              )
                            )
                          }
                          className="rounded border border-[#C6D9D3] bg-[#FCFEFD] px-1.5 py-0.5 text-[10px] text-[#0F766E] hover:bg-[#E8F3EF]"
                        >
                          Mid:{' '}
                          {formatVND(
                            Math.round(
                              (activeJob.salary_range_min_vnd + activeJob.salary_range_max_vnd) / 2
                            )
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickSalary(activeJob.salary_range_max_vnd)}
                          className="rounded border border-[#C6D9D3] bg-[#FCFEFD] px-1.5 py-0.5 text-[10px] text-[#0F766E] hover:bg-[#E8F3EF]"
                        >
                          Max: {formatVND(activeJob.salary_range_max_vnd)}
                        </button>
                      </div>
                      {formErrors.expectedSalary && (
                        <p className="mt-1 text-[11px] text-rose-600">
                          {formErrors.expectedSalary}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Nơi làm việc hiện tại / Gần nhất
                      </label>
                      <Input
                        type="text"
                        value={currentCompany}
                        onChange={(e) => setCurrentCompany(e.target.value)}
                        placeholder="Ví dụ: Công ty Cổ phần Công nghệ XYZ"
                        className="mt-1 h-9 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Link LinkedIn / GitHub / Portfolio
                      </label>
                      <Input
                        type="url"
                        value={portfolioLink}
                        onChange={(e) => setPortfolioLink(e.target.value)}
                        placeholder="https://linkedin.com/in/your-profile"
                        className="mt-1 h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Upload CV Box */}
                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Tải lên CV / Hồ sơ năng lực (PDF, DOCX) <span className="text-rose-600">*</span>
                    </label>
                    <div className="mt-1.5 rounded-xl border border-dashed border-[#C6D9D3] bg-[#FCFEFD] p-4 text-center transition-colors hover:border-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900">
                      <input
                        type="file"
                        id="cv-upload-input"
                        accept=".pdf,.docx,.doc"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      {cvFile ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#C6D9D3] bg-[#EFF5F3] p-2.5 dark:border-zinc-700 dark:bg-zinc-800">
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-[#0F766E] dark:text-teal-400" />
                            <div className="text-left">
                              <p className="text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                                {cvFile.name}
                              </p>
                              <p className="text-[10px] text-[#5C7871]">{cvFile.size}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCvFile(null)}
                            className="p-1 text-[#5C7871] hover:text-rose-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="cv-upload-input"
                          className="flex cursor-pointer flex-col items-center justify-center"
                        >
                          <UploadCloud className="h-8 w-8 text-[#0F766E] opacity-80 dark:text-teal-400" />
                          <p className="mt-2 text-xs font-medium text-[#11221E] dark:text-zinc-200">
                            Nhấp để chọn file hoặc kéo thả CV vào đây
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-400">
                            Hỗ trợ định dạng PDF, DOCX (Dung lượng tối đa 10MB)
                          </p>
                        </label>
                      )}
                    </div>
                    {formErrors.cv && (
                      <p className="mt-1 text-[11px] text-rose-600">{formErrors.cv}</p>
                    )}
                  </div>

                  {/* Cover Letter */}
                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Thư giới thiệu / Lời nhắn gửi đến nhà tuyển dụng
                    </label>
                    <textarea
                      rows={3}
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      placeholder="Chia sẻ ngắn gọn về lý do bạn quan tâm đến vị trí này, điểm mạnh nổi bật và thời điểm bạn có thể bắt đầu làm việc..."
                      className="mt-1 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                  </div>

                  {/* Submit Actions */}
                  <div className="flex items-center justify-between border-t border-[#D5E3DF] pt-4 dark:border-zinc-800">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModalTab('jd')}
                      className="text-xs"
                    >
                      Quay lại xem JD
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSubmitting}
                      className="text-xs font-semibold"
                    >
                      {isSubmitting ? (
                        <span>Đang gửi hồ sơ...</span>
                      ) : (
                        <>
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          Xác nhận gửi hồ sơ ứng tuyển
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Success Modal */}
      <Dialog
        open={Boolean(submittedCandidate)}
        onOpenChange={(open) => !open && setSubmittedCandidate(null)}
      >
        <DialogContent className="max-w-md p-6 text-center">
          {submittedCandidate && (
            <div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#D1FAE5] text-[#065F46] dark:bg-teal-950 dark:text-teal-300">
                <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
              </div>

              <h3 className="mt-4 text-lg font-bold text-[#11221E] dark:text-zinc-100">
                Nộp hồ sơ ứng tuyển thành công!
              </h3>

              <div className="mt-3 rounded-xl border border-[#C6D9D3] bg-[#EFF5F3] p-3 text-left dark:border-zinc-800 dark:bg-zinc-800/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#5C7871] dark:text-zinc-400">Mã hồ sơ:</span>
                  <span className="font-mono font-bold text-[#0F766E] dark:text-teal-400">
                    {submittedCandidate.code}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-[#5C7871] dark:text-zinc-400">Ứng viên:</span>
                  <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                    {submittedCandidate.fullName}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-[#5C7871] dark:text-zinc-400">Vị trí:</span>
                  <span className="font-medium text-[#11221E] dark:text-zinc-200">
                    {submittedCandidate.jobTitle}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-[#5C7871] dark:text-zinc-400">Email nhận kết quả:</span>
                  <span className="text-[#11221E] dark:text-zinc-200">
                    {submittedCandidate.email}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-[#415A54] dark:text-zinc-300">
                Hệ thống ATS của Lạc Việt HRM đã tiếp nhận CV và chuyển đến Trưởng phòng Tuyển dụng. Bạn sẽ nhận được email xác nhận và thông báo kết quả sơ duyệt trong vòng <strong>24 – 48 giờ làm việc</strong>.
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => setSubmittedCandidate(null)}
                  className="w-full text-xs font-semibold"
                >
                  Khám phá thêm vị trí khác
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
