'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Laptop,
  Mail,
  MapPin,
  Moon,
  Phone,
  Send,
  ShieldCheck,
  Sun,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import { MOCK_JOB_POSTINGS, MOCK_CANDIDATES } from '@/mock/ats';
import {
  getJobPostings,
  HRM_RUNTIME_EVENT,
  mergeWithRuntimeCandidates,
  pushNotification,
  saveRuntimeCandidate,
} from '@/lib/runtime-store';
import { cn, formatVND } from '@/lib/utils';
import type { Candidate, JobPosting } from '@/mock/types';
import { useApp } from '@/context/app-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

export default function JobDetailClient({ slug }: { slug: string }) {
  const router = useRouter();
  const { currentUserEmail } = useApp();
  const normalizedSlug = String(slug ?? '').toLowerCase();

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
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
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  const jobs = useMemo(() => getJobPostings(MOCK_JOB_POSTINGS), []);

  const syncCandidates = useCallback(() => {
    setCandidates(mergeWithRuntimeCandidates(MOCK_CANDIDATES));
  }, []);

  useEffect(() => {
    syncCandidates();
    window.addEventListener(HRM_RUNTIME_EVENT, syncCandidates);
    window.addEventListener('storage', syncCandidates);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncCandidates);
      window.removeEventListener('storage', syncCandidates);
    };
  }, [syncCandidates]);

  const activeCandidate = useMemo(() => {
    if (candidates.length === 0) return null;

    const lastAppliedEmail =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('lacviet_applied_candidate_email')
        : null;
    if (lastAppliedEmail) {
      const match = candidates.find(
        (c) => c.email.toLowerCase() === lastAppliedEmail.toLowerCase() && c.stage !== 'REJECTED'
      );
      if (match) return match;
    }

    if (currentUserEmail && currentUserEmail !== 'ungvien@gmail.com') {
      const match = candidates.find(
        (c) => c.email.toLowerCase() === currentUserEmail.toLowerCase() && c.stage !== 'REJECTED'
      );
      if (match) return match;
    }

    const defaultCand = candidates.find((c) => c.candidate_code === 'UV-2026-104');
    if (defaultCand && defaultCand.stage !== 'REJECTED') {
      return defaultCand;
    }

    return null;
  }, [candidates, currentUserEmail]);

  const job = useMemo(() => {
    return (
      jobs.find(
        (j) =>
          j.id.toLowerCase() === normalizedSlug ||
          j.job_code.toLowerCase() === normalizedSlug ||
          j.job_code.toLowerCase().replace(/[^a-z0-9]/g, '-') === normalizedSlug
      ) ?? jobs[0]
    );
  }, [jobs, normalizedSlug]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (typeof document !== 'undefined') {
      if (nextTheme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

    // Strict validation of personal information
    const errors: Record<string, string> = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      errors.fullName = 'Vui lòng nhập họ và tên (tối thiểu 2 ký tự)';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      errors.email = 'Vui lòng nhập địa chỉ email';
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = 'Định dạng email không hợp lệ (ví dụ: name@company.com)';
    }

    const phoneRegex = /^[0-9+() -]{9,15}$/;
    if (!trimmedPhone) {
      errors.phone = 'Vui lòng nhập số điện thoại liên hệ';
    } else if (!phoneRegex.test(trimmedPhone)) {
      errors.phone = 'Số điện thoại không hợp lệ (9 - 15 chữ số)';
    }

    // CV upload is optional per user rule ("chi ko validate cai upload cv thoi")
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);
    const candidateSeq = Math.floor(100 + Math.random() * 900);
    const candidateCode = `UV-2026-${candidateSeq}`;
    const candidateId = `cand-slug-${Date.now()}`;
    const sal = Number(expectedSalary) || job.salary_range_min_vnd;
    const finalFullName = trimmedName;
    const finalEmail = trimmedEmail;
    const finalPhone = trimmedPhone;

    const newCand: Candidate = {
      id: candidateId,
      candidate_code: candidateCode,
      full_name: finalFullName,
      email: finalEmail,
      phone: finalPhone,
      job_id: job.id,
      job_code: job.job_code,
      job_title: job.title,
      department_name: job.department_name,
      stage: 'APPLIED',
      applied_date: new Date().toISOString().slice(0, 10),
      source: 'CareerSite',
      expected_salary_vnd: sal,
      current_company: currentCompany.trim() || 'Ứng viên tự do',
      ai_evaluation: {
        match_score: 88,
        education_fit: 'Phù hợp yêu cầu',
        experience_years: 3,
        key_skills_matched: ['Kỹ năng chuyên môn', 'Kinh nghiệm dự án'],
        strengths: ['Hồ sơ nộp qua trang chi tiết tin tuyển dụng'],
        gaps: ['Cần xác nhận năng lực trong buổi phỏng vấn'],
        interview_questions: [`Động lực ứng tuyển vị trí ${job.title}?`],
        ai_recommendation: 'PROCEED_INTERVIEW',
        evaluated_by_model: 'Lạc Việt ATS Engine v2.4',
      },
    };

    saveRuntimeCandidate(newCand);
    try {
      window.localStorage.setItem('lacviet_applied_candidate_email', finalEmail);
    } catch {
      // Ignore storage errors
    }

    pushNotification({
      title: `Ứng viên mới nộp hồ sơ (${candidateCode})`,
      message: `${finalFullName} vừa ứng tuyển vị trí ${job.title}.`,
      category: 'ONBOARDING',
      target_roles: ['HR_MANAGER', 'SUPER_ADMIN'],
      nav_id: 'recruitment',
    });

    setTimeout(() => {
      setIsSubmitting(false);
      setSubmittedCode(candidateCode);
      setFullName('');
      setEmail('');
      setPhone('');
      setExpectedSalary('');
      setCurrentCompany('');
      setPortfolioLink('');
      setCoverLetter('');
      setCvFile(null);
    }, 450);
  };

  if (!job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold">Không tìm thấy vị trí tuyển dụng</h2>
        <Link href="/careers" className="mt-4">
          <Button variant="primary" size="sm">Quay về danh sách việc làm</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EFF5F3] font-sans text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100">
      {/* Corporate Synchronized Header */}
      <PublicHeader />

      {/* Sub-bar breadcrumbs */}
      <div className="border-b border-[#C6D9D3] bg-[#E4EEEB]/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between text-xs">
          <Link
            href="/careers"
            className="inline-flex items-center gap-1.5 font-semibold text-[#0F766E] hover:underline dark:text-teal-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay lại tất cả việc làm</span>
          </Link>
          <span className="font-mono text-[#5C7871] dark:text-zinc-400">
            Mã vị trí: {job.job_code}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Job Description (7 cols) */}
          <div className="space-y-6 lg:col-span-7">
            <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#0F766E] dark:text-teal-400">
                  {job.job_code}
                </span>
                <Badge variant="teal">{job.level}</Badge>
                {job.status === 'URGENT' && <Badge variant="warning">Tuyển gấp</Badge>}
              </div>

              <h1 className="mt-3 text-2xl font-bold text-[#11221E] dark:text-zinc-50">
                {job.title}
              </h1>

              <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                {job.department_name} · Quản lý tuyển dụng: {job.hiring_manager_name}
              </p>

              {/* Highlights */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#C6D9D3] bg-[#EFF5F3] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                  <span className="text-xs text-[#5C7871] dark:text-zinc-400">Mức lương công khai:</span>
                  <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {formatVND(job.salary_range_min_vnd)} – {formatVND(job.salary_range_max_vnd)}
                  </div>
                </div>
                <div className="rounded-xl border border-[#C6D9D3] bg-[#EFF5F3] p-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
                  <span className="text-xs text-[#5C7871] dark:text-zinc-400">Địa điểm & Hình thức:</span>
                  <div className="mt-1 text-sm font-semibold text-[#11221E] dark:text-zinc-200">
                    {job.location ?? 'Hà Nội'} · {job.work_mode ?? 'Hybrid'}
                  </div>
                </div>
              </div>

              {/* Overview */}
              {job.overview && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                    Mô tả công việc
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-300">
                    {job.overview}
                  </p>
                </div>
              )}

              {/* Responsibilities */}
              {job.responsibilities && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                    Trách nhiệm chính
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {job.responsibilities.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Requirements */}
              {job.requirements && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                    Yêu cầu ứng viên
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {job.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" />
                        <span className="leading-relaxed">{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Benefits */}
              {job.benefits && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
                    Quyền lợi & Đãi ngộ
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {job.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" />
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Application Form (5 cols) */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {submittedCode ? (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#D1FAE5] text-[#065F46]">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[#11221E] dark:text-zinc-100">
                    Nộp hồ sơ thành công!
                  </h3>
                  <p className="mt-1 font-mono text-sm font-semibold text-[#0F766E] dark:text-teal-400">
                    Mã hồ sơ: {submittedCode}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                    Phòng Nhân sự Lạc Việt đã tiếp nhận hồ sơ của bạn và sẽ liên hệ trong vòng 48h.
                  </p>
                  <div className="mt-6 flex flex-col gap-2">
                    <Link href="/candidate">
                      <Button variant="primary" className="w-full text-xs font-semibold shadow-sm">
                        Theo dõi hồ sơ tại Cổng Ứng viên
                      </Button>
                    </Link>
                    <Link href="/careers">
                      <Button variant="outline" className="w-full border-[#C6D9D3] text-xs font-medium">
                        Xem các vị trí khác
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : activeCandidate &&
                (activeCandidate.job_id === job.id || activeCandidate.job_code === job.job_code) ? (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#11221E] dark:text-zinc-100">
                    Bạn đã nộp hồ sơ cho vị trí này
                  </h3>
                  <p className="mt-1 font-mono text-xs font-semibold text-[#0F766E] dark:text-teal-400">
                    Mã hồ sơ: {activeCandidate.candidate_code}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                    Hồ sơ của bạn đang được phòng Nhân sự & Trưởng bộ phận chuyên môn xem xét. Bạn có thể theo dõi tiến trình xét duyệt trực tiếp tại Cổng Ứng viên.
                  </p>
                  <div className="mt-6 flex flex-col gap-2">
                    <Link href="/candidate">
                      <Button variant="primary" className="w-full text-xs font-semibold shadow-sm">
                        Theo dõi tiến trình tại Cổng Ứng viên
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Link href="/careers">
                      <Button variant="outline" className="w-full border-[#C6D9D3] text-xs font-medium">
                        Xem danh sách việc làm
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : activeCandidate ? (
                <div className="py-6 text-left">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#11221E] dark:text-zinc-100 border-b border-[#D5E3DF] pb-3 dark:border-zinc-800">
                    <ShieldCheck className="h-5 w-5 text-[#0F766E] dark:text-teal-400" />
                    <span>Quy định ứng tuyển Lạc Việt</span>
                  </div>

                  {['INTERVIEW', 'OFFER', 'ONBOARDED'].includes(activeCandidate.stage) ? (
                    <div className="mt-4 space-y-3 text-xs leading-relaxed text-[#415A54] dark:text-zinc-300">
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <p className="font-semibold text-xs">Không thể ứng tuyển vị trí khác</p>
                        <p className="mt-1">
                          Hồ sơ ứng tuyển vị trí <strong>{activeCandidate.job_title}</strong> của bạn đã bước vào giai đoạn{' '}
                          <span className="font-bold underline">
                            {activeCandidate.stage === 'INTERVIEW'
                              ? 'Phỏng vấn chuyên môn'
                              : activeCandidate.stage === 'OFFER'
                              ? 'Đề nghị nhận việc'
                              : 'Đã nhận việc'}
                          </span>
                          . Khi đã vào vòng phỏng vấn, bạn không thể rút hồ sơ trực tuyến hoặc ứng tuyển đồng thời vị trí khác.
                        </p>
                      </div>
                      <Link href="/candidate" className="block pt-2">
                        <Button variant="primary" className="w-full text-xs font-semibold shadow-sm">
                          Xem tiến trình tại Cổng Ứng viên
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3 text-xs leading-relaxed text-[#415A54] dark:text-zinc-300">
                      <p>
                        Bạn hiện đang có hồ sơ ứng tuyển vị trí{' '}
                        <strong className="text-[#11221E] dark:text-zinc-100">{activeCandidate.job_title}</strong>{' '}
                        ({activeCandidate.job_code}).
                      </p>
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#E8F3EF] p-3.5 text-[#0B4F4A] dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
                        Mỗi ứng viên chỉ duy trì 1 hồ sơ hoạt động tại một thời điểm. Để ứng tuyển vị trí này, bạn cần rút hồ sơ hiện tại tại Cổng Ứng viên.
                      </div>
                      <Link href="/candidate" className="block pt-2">
                        <Button variant="primary" className="w-full text-xs font-semibold shadow-sm">
                          Đến Cổng ứng viên để rút hồ sơ
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#11221E] dark:text-zinc-100">
                      Nộp hồ sơ ứng tuyển
                    </h3>
                    <p className="text-xs text-[#415A54] dark:text-zinc-400">
                      Điền thông tin và tải lên CV của bạn
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Họ và tên <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (formErrors.fullName) {
                          setFormErrors((prev) => ({ ...prev, fullName: '' }));
                        }
                      }}
                      placeholder="Nhập họ và tên đầy đủ"
                      className={cn(
                        'mt-1 text-xs',
                        formErrors.fullName && 'border-rose-500 focus-visible:ring-rose-500/20'
                      )}
                    />
                    {formErrors.fullName && (
                      <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        {formErrors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Địa chỉ Email <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (formErrors.email) {
                          setFormErrors((prev) => ({ ...prev, email: '' }));
                        }
                      }}
                      placeholder="email@example.com"
                      className={cn(
                        'mt-1 text-xs',
                        formErrors.email && 'border-rose-500 focus-visible:ring-rose-500/20'
                      )}
                    />
                    {formErrors.email && (
                      <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        {formErrors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Số điện thoại <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (formErrors.phone) {
                          setFormErrors((prev) => ({ ...prev, phone: '' }));
                        }
                      }}
                      placeholder="0912 345 678"
                      className={cn(
                        'mt-1 text-xs',
                        formErrors.phone && 'border-rose-500 focus-visible:ring-rose-500/20'
                      )}
                    />
                    {formErrors.phone && (
                      <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        {formErrors.phone}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Lương kỳ vọng (VNĐ/tháng)
                    </label>
                    <Input
                      type="number"
                      value={expectedSalary}
                      onChange={(e) => setExpectedSalary(e.target.value)}
                      placeholder={String(job.salary_range_min_vnd)}
                      className="mt-1 text-xs font-mono tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Đơn vị công tác hiện tại / Gần nhất (Tùy chọn)
                    </label>
                    <Input
                      value={currentCompany}
                      onChange={(e) => setCurrentCompany(e.target.value)}
                      placeholder="Công ty Cổ phần Công nghệ..."
                      className="mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                      Đính kèm tệp CV (Tùy chọn - không bắt buộc)
                    </label>
                    <div className="mt-1.5 rounded-xl border border-dashed border-[#C6D9D3] p-4 text-center dark:border-zinc-800">
                      <input
                        type="file"
                        id="slug-cv-upload"
                        accept=".pdf,.docx,.doc"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      {cvFile ? (
                        <div className="flex items-center justify-between rounded-lg bg-[#EFF5F3] p-2 dark:bg-zinc-800">
                          <span className="truncate text-xs font-medium text-[#11221E] dark:text-zinc-200">
                            {cvFile.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCvFile(null)}
                            className="p-1 text-[#5C7871] hover:text-rose-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label htmlFor="slug-cv-upload" className="flex cursor-pointer flex-col items-center">
                          <UploadCloud className="h-7 w-7 text-[#0F766E]" />
                          <span className="mt-1 text-xs font-medium text-[#0F766E]">Nhấp để tải lên CV</span>
                          <span className="mt-0.5 text-[10px] text-[#5C7871]">Hỗ trợ PDF, DOCX tối đa 5MB</span>
                        </label>
                      )}
                    </div>
                  </div>

                  <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full text-xs font-semibold shadow-sm">
                    {isSubmitting ? 'Đang gửi hồ sơ...' : 'Xác nhận nộp CV ngay'}
                    <Send className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
