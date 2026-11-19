'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
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
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
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
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

const DEPARTMENT_FILTERS = [
  { id: 'ALL', label: 'Tất cả vị trí' },
  { id: 'dept-tech-swe', label: 'Kỹ thuật Phần mềm' },
  { id: 'dept-tech-data', label: 'Dữ liệu & AI' },
  { id: 'dept-hr', label: 'Nhân sự & Hành chính' },
  { id: 'dept-sales', label: 'Kinh doanh B2B' },
];

const LEVEL_FILTERS = ['ALL', 'Senior', 'Mid - Senior', 'Mid', 'Lead'];

export default function CareersPage() {
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

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (selectedDept !== 'ALL' && job.department_id !== selectedDept) return false;
      if (selectedLevel !== 'ALL' && !job.level.includes(selectedLevel)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = job.title.toLowerCase().includes(q);
        const matchCode = job.job_code.toLowerCase().includes(q);
        const matchDept = job.department_name.toLowerCase().includes(q);
        const matchOverview = (job.overview ?? '').toLowerCase().includes(q);
        return matchTitle || matchCode || matchDept || matchOverview;
      }
      return true;
    });
  }, [jobs, selectedDept, selectedLevel, searchQuery]);

  const handleOpenJob = (job: JobPosting, _tab: 'jd' | 'apply' = 'jd') => {
    setActiveJob(job);
    setModalTab('jd'); // Bắt buộc mở Mô tả công việc (JD) trước theo yêu cầu người dùng
    setFormErrors({});
  };

  const handleCloseJob = () => {
    setActiveJob(null);
    setFormErrors({});
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setCvFile({
        name: file.name,
        size: `${sizeMb} MB`,
      });
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.cv;
        return next;
      });
    }
  };

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;

    // Bỏ qua validate hoàn toàn theo yêu cầu người dùng
    setFormErrors({});
    setIsSubmitting(true);

    const candidateSeq = Math.floor(100 + Math.random() * 900);
    const candidateCode = `UV-2026-${candidateSeq}`;
    const candidateId = `cand-${Date.now()}`;
    const parsedSalary = Number(expectedSalary) || activeJob.salary_range_min_vnd;
    const finalFullName = fullName.trim() || 'Nguyễn Văn A';
    const finalEmail = email.trim() || 'candidate.demo@lacviet.com.vn';
    const finalPhone = phone.trim() || '0912345678';

    const newCandidate: Candidate = {
      id: candidateId,
      candidate_code: candidateCode,
      full_name: finalFullName,
      email: finalEmail,
      phone: finalPhone,
      job_id: activeJob.id,
      job_code: activeJob.job_code,
      job_title: activeJob.title,
      department_name: activeJob.department_name,
      stage: 'APPLIED',
      applied_date: new Date().toISOString().slice(0, 10),
      source: 'CareerSite',
      expected_salary_vnd: parsedSalary,
      current_company: currentCompany.trim() || 'Ứng viên tự do',
      ai_evaluation: {
        match_score: 91,
        education_fit: 'Phù hợp xuất sắc yêu cầu vị trí',
        experience_years: 3,
        key_skills_matched: ['Kỹ năng chuyên môn', 'Kinh nghiệm dự án thực tế'],
        strengths: [
          'Hồ sơ đăng ký trực tuyến hợp lệ qua Lạc Việt Careers Portal',
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

    saveRuntimeCandidate(newCandidate);

    pushNotification({
      title: `Ứng viên mới nộp hồ sơ (${candidateCode})`,
      message: `${finalFullName} vừa nộp hồ sơ ứng tuyển vị trí ${activeJob.title} qua Cổng việc làm.`,
      category: 'ONBOARDING',
      target_roles: ['HR_MANAGER', 'SUPER_ADMIN'],
      nav_id: 'recruitment',
    });

    setTimeout(() => {
      setIsSubmitting(false);
      setSubmittedCandidate({
        code: candidateCode,
        fullName: finalFullName,
        jobTitle: activeJob.title,
        email: finalEmail,
      });
      setFullName('');
      setEmail('');
      setPhone('');
      setExpectedSalary('');
      setCurrentCompany('');
      setPortfolioLink('');
      setCoverLetter('');
      setCvFile(null);
      setActiveJob(null);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#EFF5F3] text-[#11221E] font-sans dark:bg-zinc-950 dark:text-zinc-100">
      {/* Synchronized Corporate Header */}
      <PublicHeader />

      {/* Hero & Corporate Mission Section */}
      <section className="border-b border-[#C6D9D3] bg-[#E4EEEB]/60 py-10 dark:border-zinc-800 dark:bg-zinc-900/60 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1 text-xs font-semibold text-[#0F766E] shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-teal-300">
              <Sparkles className="h-3.5 w-3.5" />
              Đang mở tuyển {jobs.length} vị trí trọng điểm Quý 4/2026 (Cập nhật trực tiếp)
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#11221E] dark:text-zinc-50 sm:text-4xl">
              Cùng Lạc Việt kiến tạo nền tảng quản trị tương lai
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#415A54] dark:text-zinc-300">
              Môi trường làm việc chuẩn mực, minh bạch dải lương 100%, trang bị máy tính cao cấp và cơ hội phát triển đột phá cho nhân tài công nghệ và nhân sự tại Việt Nam.
            </p>

            {/* 4 Executive KPI Stat Cards matching Management Portal */}
            <div className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">Vị trí mở</span>
                  <span className="rounded bg-[#E8F3EF] px-1.5 py-0.5 text-[10px] font-bold text-[#0F766E] dark:bg-teal-950 dark:text-teal-300">Live</span>
                </div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {jobs.length}
                </div>
                <p className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">Vị trí tuyển dụng</p>
              </div>

              <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">Dải lương công khai</span>
                  <span className="rounded bg-[#E8F3EF] px-1.5 py-0.5 text-[10px] font-bold text-[#0F766E] dark:bg-teal-950 dark:text-teal-300">100%</span>
                </div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
                  18 – 52 Tr
                </div>
                <p className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">Gross VNĐ / tháng</p>
              </div>

              <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">Tốc độ phản hồi</span>
                  <span className="rounded bg-[#E8F3EF] px-1.5 py-0.5 text-[10px] font-bold text-[#0F766E] dark:bg-teal-950 dark:text-teal-300">SLA</span>
                </div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#11221E] dark:text-zinc-100">
                  24 – 48h
                </div>
                <p className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">Xét duyệt hồ sơ</p>
              </div>

              <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">Trang bị làm việc</span>
                  <span className="rounded bg-[#E8F3EF] px-1.5 py-0.5 text-[10px] font-bold text-[#0F766E] dark:bg-teal-950 dark:text-teal-300">M-series</span>
                </div>
                <div className="mt-1 text-sm font-bold text-[#11221E] dark:text-zinc-100">
                  MacBook Pro
                </div>
                <p className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">Cấp mới 100%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Jobs Directory */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Executive Filter Bar matching Core HR & ATS */}
        <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C7871] dark:text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo chức danh, kỹ năng (Go, Python, AI, Sales, HR, Tester...)"
                className="h-10 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-10 pr-9 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Department Segmented Filter Bar */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#C6D9D3] bg-[#E4EEEB] p-1 dark:border-zinc-700 dark:bg-zinc-800">
              {DEPARTMENT_FILTERS.map((dept) => {
                const isSelected = selectedDept === dept.id;
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setSelectedDept(dept.id)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                      isSelected
                        ? 'border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] shadow-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100'
                        : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-300 dark:hover:text-zinc-100'
                    )}
                  >
                    {dept.label}
                  </button>
                );
              })}
            </div>

            {/* Level Select */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#5C7871] dark:text-zinc-400">Cấp bậc:</span>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="h-10 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-semibold text-[#11221E] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {LEVEL_FILTERS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === 'ALL' ? 'Tất cả cấp bậc' : lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Status Strip */}
          <div className="mt-3 flex items-center justify-between border-t border-[#D5E3DF] pt-2.5 text-xs text-[#415A54] dark:border-zinc-800 dark:text-zinc-400">
            <span>
              Hiển thị <strong className="font-semibold text-[#11221E] dark:text-zinc-100">{filteredJobs.length}</strong> cơ hội nghề nghiệp phù hợp
            </span>
            {(selectedDept !== 'ALL' || selectedLevel !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDept('ALL');
                  setSelectedLevel('ALL');
                  setSearchQuery('');
                }}
                className="font-medium text-[#0F766E] hover:underline dark:text-teal-400"
              >
                Xóa tất cả bộ lọc
              </button>
            )}
          </div>
        </div>

        {/* Jobs Directory Cards */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job) => (
            <Card
              key={job.id}
              className="flex flex-col justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-sm transition-all hover:border-[#0F766E] hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/90"
            >
              <CardContent className="p-5">
                {/* Header tags */}
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0F766E] dark:text-teal-400">
                    {job.job_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {job.status === 'URGENT' && (
                      <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        Tuyển gấp
                      </span>
                    )}
                    <span className="rounded-md border border-[#C6D9D3] bg-[#E4EEEB] px-2 py-0.5 text-[11px] font-semibold text-[#0B4F4A] dark:border-zinc-700 dark:bg-zinc-800 dark:text-teal-300">
                      {job.level}
                    </span>
                  </div>
                </div>

                {/* Job Title */}
                <h3 className="mt-3 text-base font-bold text-[#11221E] dark:text-zinc-100 line-clamp-2">
                  {job.title}
                </h3>

                <p className="mt-1 text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  {job.department_name}
                </p>

                {/* Salary Band matching Core HR salary boxes */}
                <div className="mt-3.5 rounded-lg border border-[#D5E3DF] bg-[#EFF5F3] p-2.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                  <span className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">
                    Dải lương công khai (Gross):
                  </span>
                  <div className="font-mono text-sm font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {formatVND(job.salary_range_min_vnd)} – {formatVND(job.salary_range_max_vnd)}
                  </div>
                </div>

                {/* Metadata Pills */}
                <div className="mt-3.5 space-y-1.5 text-xs text-[#415A54] dark:text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
                    <span className="truncate">{job.location ?? 'Hà Nội / Hybrid'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
                    <span>{job.employment_type ?? 'Toàn thời gian'} · {job.work_mode ?? 'Hybrid'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
                    <span>Hạn nhận hồ sơ: {job.closing_date}</span>
                  </div>
                </div>

                {/* Overview preview */}
                {job.overview && (
                  <p className="mt-3 text-xs leading-relaxed text-[#5C7871] dark:text-zinc-400 line-clamp-2">
                    {job.overview}
                  </p>
                )}
              </CardContent>

              {/* Action Footer */}
              <div className="flex items-center gap-2 border-t border-[#D5E3DF] bg-[#F2F7F5] p-3 rounded-b-xl dark:border-zinc-800 dark:bg-zinc-800/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-[#C6D9D3] bg-[#FCFEFD] text-xs font-semibold text-[#11221E] hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  onClick={() => handleOpenJob(job, 'jd')}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5 text-[#0F766E]" />
                  Xem mô tả JD
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1 text-xs font-semibold shadow-sm"
                  onClick={() => handleOpenJob(job, 'jd')}
                >
                  Ứng tuyển ngay
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredJobs.length === 0 && (
          <div className="mt-12 rounded-2xl border border-dashed border-[#C6D9D3] bg-[#FCFEFD] p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <Briefcase className="mx-auto h-12 w-12 text-[#5C7871] opacity-60" />
            <h3 className="mt-4 text-base font-semibold text-[#11221E] dark:text-zinc-100">
              Không tìm thấy vị trí tuyển dụng phù hợp
            </h3>
            <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
              Vui lòng tìm kiếm với từ khóa khác hoặc đặt lại bộ lọc phòng ban.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 border-[#C6D9D3] text-xs font-semibold"
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

      {/* Synchronized Corporate Footer */}
      <PublicFooter />

      {/* Job Detail & Application Dialog matching Management Dialogs */}
      <Dialog open={Boolean(activeJob)} onOpenChange={(open) => !open && handleCloseJob()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0 sm:max-w-3xl border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-100 shadow-2xl">
          {activeJob && (
            <div>
              {/* Modal Header */}
              <div className="border-b border-[#C6D9D3] bg-[#E4EEEB] p-5 pr-12 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#0F766E] dark:text-teal-400">
                    {activeJob.job_code}
                  </span>
                  <span className="rounded-md border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 text-[11px] font-semibold text-[#0B4F4A] dark:border-zinc-700 dark:bg-zinc-800 dark:text-teal-300">
                    {activeJob.level}
                  </span>
                  {activeJob.status === 'URGENT' && (
                    <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Tuyển gấp
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-xl font-bold text-[#11221E] dark:text-zinc-100">
                  {activeJob.title}
                </h2>
                <p className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                  {activeJob.department_name} · Phụ trách tuyển dụng:{' '}
                  <strong className="font-semibold text-[#11221E] dark:text-zinc-200">
                    {activeJob.hiring_manager_name}
                  </strong>
                </p>

                {/* Segmented Switcher */}
                <div className="mt-4 flex rounded-xl border border-[#C6D9D3] bg-[#EFF5F3] p-1 dark:border-zinc-800 dark:bg-zinc-900">
                  <button
                    type="button"
                    onClick={() => setModalTab('jd')}
                    className={cn(
                      'flex items-center justify-center gap-2 flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                      modalTab === 'jd'
                        ? 'border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400'
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 text-[#0F766E]" />
                    Mô tả công việc (JD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('apply')}
                    className={cn(
                      'flex items-center justify-center gap-2 flex-1 rounded-lg py-2 text-xs font-semibold transition-all',
                      modalTab === 'apply'
                        ? 'border border-[#C6D9D3] bg-[#FCFEFD] text-[#0F766E] shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-teal-400 font-bold'
                        : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400'
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Nộp hồ sơ ứng tuyển
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                {modalTab === 'jd' ? (
                  <div className="space-y-6">
                    {/* Salary and terms banner */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#D5E3DF] bg-[#EFF5F3] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                        <span className="text-xs text-[#5C7871] dark:text-zinc-400">Mức lương công khai:</span>
                        <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {formatVND(activeJob.salary_range_min_vnd)} – {formatVND(activeJob.salary_range_max_vnd)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#D5E3DF] bg-[#EFF5F3] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                        <span className="text-xs text-[#5C7871] dark:text-zinc-400">Địa điểm & Hình thức:</span>
                        <div className="mt-1 text-sm font-semibold text-[#11221E] dark:text-zinc-200">
                          {activeJob.location ?? 'Hà Nội'} · {activeJob.work_mode ?? 'Hybrid'}
                        </div>
                      </div>
                    </div>

                    {/* Overview */}
                    {activeJob.overview && (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                          Tổng quan vị trí
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-300">
                          {activeJob.overview}
                        </p>
                      </div>
                    )}

                    {/* Responsibilities */}
                    {activeJob.responsibilities && (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                          Trách nhiệm công việc chính
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {activeJob.responsibilities.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
                              <span className="leading-relaxed">{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Requirements */}
                    {activeJob.requirements && (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                          Yêu cầu năng lực & Kinh nghiệm
                        </h3>
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
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                          Chế độ đãi ngộ & Quyền lợi
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {activeJob.benefits.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" />
                              <span className="leading-relaxed">{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-5 border-t border-[#D5E3DF] dark:border-zinc-800">
                      <p className="text-xs text-[#5C7871] dark:text-zinc-400">
                        Đã nắm rõ yêu cầu? Tiếp tục sang bước nộp hồ sơ ứng tuyển.
                      </p>
                      <Button
                        variant="primary"
                        onClick={() => setModalTab('apply')}
                        className="text-xs font-semibold shadow-sm"
                      >
                        Tiến hành nộp hồ sơ ứng tuyển
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleApplySubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                          Họ và tên
                        </label>
                        <Input
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Nguyễn Văn A"
                          className="mt-1 text-xs border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                          Địa chỉ Email
                        </label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="email@example.com"
                          className="mt-1 text-xs border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                          Số điện thoại
                        </label>
                        <Input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="0912 345 678"
                          className="mt-1 text-xs border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                          Mức lương kỳ vọng (VNĐ/tháng)
                        </label>
                        <Input
                          type="number"
                          value={expectedSalary}
                          onChange={(e) => setExpectedSalary(e.target.value)}
                          placeholder={String(activeJob.salary_range_min_vnd)}
                          className="mt-1 text-xs font-mono tabular-nums border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Đơn vị công tác hiện tại / Gần nhất
                      </label>
                      <Input
                        value={currentCompany}
                        onChange={(e) => setCurrentCompany(e.target.value)}
                        placeholder="Công ty Cổ phần Công nghệ..."
                        className="mt-1 text-xs border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>

                    {/* File Upload Dropzone */}
                    <div>
                      <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Đính kèm tệp CV (Tùy chọn - có thể bỏ qua khi thử nghiệm)
                      </label>
                      <div className="mt-1.5 rounded-xl border-2 border-dashed border-[#C6D9D3] bg-[#EFF5F3] p-5 text-center transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-800/60">
                        <input
                          type="file"
                          id="cv-upload-modal"
                          accept=".pdf,.docx,.doc"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        {cvFile ? (
                          <div className="flex items-center justify-between rounded-lg bg-[#FCFEFD] p-2.5 border border-[#C6D9D3] dark:border-zinc-700 dark:bg-zinc-800">
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="h-4 w-4 text-[#0F766E]" />
                              <span className="truncate text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                                {cvFile.name}
                              </span>
                              <span className="text-[11px] text-[#5C7871]">({cvFile.size})</span>
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
                          <label htmlFor="cv-upload-modal" className="flex cursor-pointer flex-col items-center">
                            <UploadCloud className="h-8 w-8 text-[#0F766E]" />
                            <span className="mt-1 text-xs font-semibold text-[#0F766E]">
                              Kéo thả hoặc nhấp để tải file CV
                            </span>
                            <span className="mt-0.5 text-[11px] text-[#5C7871]">
                              Hỗ trợ định dạng PDF, DOCX dung lượng tối đa 5MB (tùy chọn)
                            </span>
                          </label>
                        )}
                      </div>
                    </div>

                    <DialogFooter className="mt-6 border-t border-[#D5E3DF] pt-4 dark:border-zinc-800">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setModalTab('jd')}
                        className="border-[#C6D9D3] bg-[#FCFEFD] text-xs font-semibold text-[#415A54] hover:bg-[#E8F3EF] hover:text-[#11221E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        Quay lại xem JD
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={isSubmitting}
                        className="text-xs font-semibold shadow-sm"
                      >
                        {isSubmitting ? 'Đang tải lên hồ sơ...' : 'Xác nhận nộp CV ngay'}
                        <Send className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </DialogFooter>
                  </form>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Success Notification Dialog */}
      <Dialog
        open={Boolean(submittedCandidate)}
        onOpenChange={(open) => !open && setSubmittedCandidate(null)}
      >
        <DialogContent className="max-w-md border border-[#C6D9D3] bg-[#FCFEFD] text-center dark:border-zinc-800 dark:bg-zinc-900 shadow-xl">
          <div className="py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#D1FAE5] text-[#065F46] dark:bg-teal-950 dark:text-teal-300">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#11221E] dark:text-zinc-100">
              Nộp hồ sơ ứng tuyển thành công!
            </h3>
            <p className="mt-1 font-mono text-sm font-semibold text-[#0F766E] dark:text-teal-400">
              Mã hồ sơ: {submittedCandidate?.code}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
              Cảm ơn <strong>{submittedCandidate?.fullName}</strong>. Hồ sơ cho vị trí{' '}
              <strong>{submittedCandidate?.jobTitle}</strong> đã được lưu trữ an toàn trong hệ thống ATS Lạc Việt.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link href="/candidate">
                <Button variant="primary" className="w-full text-xs font-semibold shadow-sm">
                  Truy cập Cổng Ứng viên để theo dõi tiến độ
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full border-[#C6D9D3] text-xs font-medium"
                onClick={() => setSubmittedCandidate(null)}
              >
                Tiếp tục xem các vị trí khác
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
