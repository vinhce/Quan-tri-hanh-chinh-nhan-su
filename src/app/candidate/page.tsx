'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  FileText,
  HelpCircle,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Phone,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  XCircle,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import {
  getJobPostings,
  getNotificationsForActor,
  HRM_RUNTIME_EVENT,
  markAllNotificationsRead,
  markNotificationRead,
  readRuntimeCandidates,
  saveRuntimeCandidate,
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatVND } from '@/lib/utils';
import type { AtsStage, Candidate, HrmNotification, JobPosting } from '@/mock/types';
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

const STAGE_META: Record<
  AtsStage,
  { label: string; variant: BadgeVariant; stepNum: number; desc: string }
> = {
  APPLIED: {
    label: 'Hồ sơ mới nhận',
    variant: 'secondary',
    stepNum: 1,
    desc: 'Hồ sơ của bạn đã được chuyển tới Ban Tuyển dụng để sàng lọc.',
  },
  AI_SCREENED: {
    label: 'Đang sàng lọc hồ sơ',
    variant: 'teal',
    stepNum: 2,
    desc: 'Hồ sơ đã qua vòng sơ loại năng lực và đang được Trưởng bộ phận chuyên môn xem xét.',
  },
  INTERVIEW: {
    label: 'Mời phỏng vấn chuyên môn',
    variant: 'warning',
    stepNum: 3,
    desc: 'Bạn đã được chọn vào vòng phỏng vấn chuyên môn trực tiếp hoặc trực tuyến.',
  },
  OFFER: {
    label: 'Thư mời nhận việc (Offer)',
    variant: 'teal',
    stepNum: 4,
    desc: 'Chúc mừng bạn! Lạc Việt đã gửi Thư mời nhận việc với chế độ đãi ngộ chi tiết.',
  },
  ONBOARDED: {
    label: 'Đã nhận việc & Hội nhập',
    variant: 'success',
    stepNum: 5,
    desc: 'Bạn đã chính thức gia nhập Lạc Việt và hoàn tất thủ tục tiếp nhận nhân sự.',
  },
  REJECTED: {
    label: 'Đã loại',
    variant: 'danger',
    stepNum: 0,
    desc: 'Hồ sơ chưa phù hợp trong đợt tuyển dụng hiện tại.',
  },
};

export default function CandidatePortalPage() {
  const router = useRouter();
  const { role, theme, toggleTheme, currentUserEmail, currentUserProfile, showToast } = useApp();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeCandidate, setActiveCandidate] = useState<Candidate | null>(null);
  const [actionModal, setActionModal] = useState<'interview' | 'offer' | 'withdraw' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [notifications, setNotifications] = useState<(HrmNotification & { isRead: boolean })[]>([]);
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  const notiRef = useRef<HTMLDivElement>(null);

  // Demo profile candidate or matched candidate
  const currentCandidate = useMemo(() => {
    if (candidates.length === 0) return null;
    if (currentUserEmail) {
      const match = candidates.find((c) => c.email.toLowerCase() === currentUserEmail.toLowerCase());
      if (match) return match;
    }
    return candidates[0] ?? null;
  }, [candidates, currentUserEmail]);

  const syncCandidateData = useCallback(() => {
    const list = readRuntimeCandidates();
    setCandidates(list);
    if (activeCandidate) {
      const updated = list.find((c) => c.id === activeCandidate.id);
      if (updated) setActiveCandidate(updated);
    }
    const candCode = currentCandidate?.candidate_code || '';
    const notifs = getNotificationsForActor('CANDIDATE', candCode, undefined);
    setNotifications(notifs);
  }, [activeCandidate, currentCandidate?.candidate_code]);

  useEffect(() => {
    syncCandidateData();
    window.addEventListener(HRM_RUNTIME_EVENT, syncCandidateData);
    window.addEventListener('storage', syncCandidateData);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncCandidateData);
      window.removeEventListener('storage', syncCandidateData);
    };
  }, [syncCandidateData]);

  // Close notification popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notiRef.current && !notiRef.current.contains(event.target as Node)) {
        setIsNotiOpen(false);
      }
    };
    if (isNotiOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotiOpen]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const handleMarkAllRead = () => {
    markAllNotificationsRead('CANDIDATE', currentCandidate?.candidate_code || '');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleMarkSingleRead = (notifId: string) => {
    markNotificationRead(notifId, 'CANDIDATE', currentCandidate?.candidate_code || '');
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
    );
  };

  const handleConfirmInterview = (accept: boolean) => {
    if (!currentCandidate) return;
    const nextStage: AtsStage = accept ? 'INTERVIEW' : 'APPLIED';
    const updated: Candidate = {
      ...currentCandidate,
      current_company: accept
        ? `${currentCandidate.current_company} · Đã xác nhận tham gia PV lúc 09:30 ngày 25/11`
        : `${currentCandidate.current_company} · Đề xuất đổi lịch: ${actionReason || 'Trùng lịch cá nhân'}`,
    };
    saveRuntimeCandidate(updated);
    setActionModal(null);
    setActionReason('');
    showToast(
      accept ? 'Đã xác nhận tham gia phỏng vấn' : 'Đã gửi đề xuất dời lịch phỏng vấn',
      'Phòng Tuyển dụng Lạc Việt đã nhận được phản hồi của bạn.',
      'success'
    );
  };

  const handleOfferDecision = (decision: 'ACCEPT' | 'DECLINE') => {
    if (!currentCandidate) return;
    const nextStage: AtsStage = decision === 'ACCEPT' ? 'ONBOARDED' : 'OFFER';
    const updated: Candidate = {
      ...currentCandidate,
      stage: nextStage,
      current_company:
        decision === 'ACCEPT'
          ? `${currentCandidate.current_company} · Ứng viên đã chấp nhận Offer ngày ${new Date().toLocaleDateString('vi-VN')}`
          : `${currentCandidate.current_company} · Ứng viên từ chối Offer: ${actionReason || 'Lý do cá nhân'}`,
    };
    saveRuntimeCandidate(updated);
    setActionModal(null);
    setActionReason('');
    showToast(
      decision === 'ACCEPT'
        ? 'Chúc mừng bạn đã đồng ý nhận việc!'
        : 'Đã gửi phản hồi từ chối Offer',
      decision === 'ACCEPT'
        ? 'Bộ phận Nhân sự sẽ liên hệ để chuẩn bị thủ tục nhận việc và cấp phát thiết bị.'
        : 'Cảm ơn bạn đã quan tâm đến cơ hội nghề nghiệp tại Lạc Việt.',
      'success'
    );
  };

  const handleWithdraw = () => {
    if (!currentCandidate) return;
    const updated: Candidate = {
      ...currentCandidate,
      current_company: `${currentCandidate.current_company} · [ỨNG VIÊN ĐÃ RÚT HỒ SƠ: ${actionReason || 'Không có lý do'}]`,
    };
    saveRuntimeCandidate(updated);
    setActionModal(null);
    setActionReason('');
    showToast('Đã rút hồ sơ ứng tuyển', 'Hồ sơ của bạn đã được cập nhật trạng thái dừng tuyển.', 'default');
  };

  return (
    <div className={cn('min-h-screen font-sans transition-colors', theme === 'dark' ? 'dark bg-zinc-950 text-zinc-100' : 'bg-[#EFF5F3] text-[#11221E]')}>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-[#C6D9D3] bg-[#FCFEFD]/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F766E] text-white shadow-sm">
              <User className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                  LẠC VIỆT
                </span>
                <span className="rounded bg-[#CBE8E2] px-1.5 py-0.5 text-[10px] font-semibold text-[#0B4F4A] dark:bg-teal-950 dark:text-teal-300">
                  CANDIDATE PORTAL
                </span>
              </div>
              <p className="text-[11px] text-[#415A54] dark:text-zinc-400">
                Cổng Theo dõi Hồ sơ Tuyển dụng & Tương tác Ứng viên
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Real-Time Notification Bell */}
            <div className="relative" ref={notiRef}>
              <button
                type="button"
                onClick={() => setIsNotiOpen(!isNotiOpen)}
                aria-label="Thông báo tuyển dụng"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#415A54] transition-colors hover:bg-[#EFF5F3] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 font-mono text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-zinc-900 animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {isNotiOpen && (
                <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-2 flex items-center justify-between border-b border-[#D5E3DF] pb-2 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      <Bell className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
                      Thông báo tiến độ hồ sơ ({unreadCount} mới)
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-medium text-[#0F766E] hover:underline dark:text-teal-400"
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#5C7871] dark:text-zinc-500">
                        Chưa có thông báo nào
                      </div>
                    ) : (
                      notifications.slice(0, 15).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleMarkSingleRead(n.id)}
                          className={cn(
                            'cursor-pointer rounded-lg p-2.5 text-xs transition-colors',
                            !n.isRead
                              ? 'border-l-2 border-l-[#0F766E] bg-[#E8F3EF]/70 font-medium text-[#11221E] dark:border-l-teal-400 dark:bg-teal-950/40 dark:text-zinc-100'
                              : 'text-[#415A54] hover:bg-[#F2F7F5] dark:text-zinc-400 dark:hover:bg-zinc-800/50'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#11221E] dark:text-zinc-100">{n.title}</span>
                            <span className="shrink-0 font-mono text-[10px] text-[#5C7871] dark:text-zinc-500">
                              {new Date(n.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-[#415A54] dark:text-zinc-300">
                            {n.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Đổi giao diện sáng/tối"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#415A54] transition-colors hover:bg-[#EFF5F3] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            <Link
              href="/careers"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-semibold text-[#415A54] transition-colors hover:bg-[#E8F3EF] hover:text-[#0F766E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>Xem việc làm khác</span>
            </Link>

            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-medium text-[#5C7871] hover:text-rose-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Đổi tài khoản</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome Banner */}
        <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md border border-[#C6D9D3] bg-[#EFF5F3] px-2.5 py-1 text-xs font-medium text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-800 dark:text-teal-300">
                <Sparkles className="h-3.5 w-3.5" />
                Cổng thông tin bảo mật ứng viên Lạc Việt
              </div>
              <h1 className="mt-3 text-xl font-bold tracking-tight text-[#11221E] dark:text-zinc-100 sm:text-2xl">
                Xin chào, {currentCandidate?.full_name ?? 'Ứng viên'}!
              </h1>
              <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                Email: <strong>{currentCandidate?.email ?? 'ungvien@gmail.com'}</strong> · SĐT: {currentCandidate?.phone ?? 'Chưa cập nhật'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link href="/careers">
                <Button variant="outline" size="sm" className="border-[#C6D9D3] text-xs">
                  Tìm kiếm vị trí mới
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Current Active Application Card */}
        {currentCandidate ? (
          <div className="mt-6 space-y-6">
            <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-zinc-900/80">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#D5E3DF] pb-4 dark:border-zinc-800">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#0F766E] dark:text-teal-400">
                        Mã hồ sơ: {currentCandidate.candidate_code}
                      </span>
                      <span className="text-xs text-[#C6D9D3] dark:text-zinc-700">·</span>
                      <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                        Nộp ngày: {currentCandidate.applied_date}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-[#11221E] dark:text-zinc-100">
                      {currentCandidate.job_title}
                    </h2>
                    <p className="text-xs text-[#415A54] dark:text-zinc-400">
                      {currentCandidate.department_name} · Mã vị trí: {currentCandidate.job_code}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-3 pt-1 text-xs text-[#415A54] dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1">
                        <span>Lương kỳ vọng:</span>
                        <strong className="font-semibold text-[#11221E] dark:text-zinc-200">
                          {formatVND(currentCandidate.expected_salary_vnd)}
                        </strong>
                      </span>
                      <span className="text-[#C6D9D3] dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span>Nguồn nộp:</span>
                        <strong className="font-semibold text-[#11221E] dark:text-zinc-200">
                          {currentCandidate.source}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={STAGE_META[currentCandidate.stage]?.variant ?? 'teal'}>
                      {STAGE_META[currentCandidate.stage]?.label ?? currentCandidate.stage}
                    </Badge>

                    {currentCandidate.stage !== 'ONBOARDED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 border-rose-200 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                        onClick={() => setActionModal('withdraw')}
                      >
                        Rút hồ sơ
                      </Button>
                    )}
                  </div>
                </div>

                {/* Linear Stepper with Horizontal Track */}
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-300">
                      Tiến trình xét duyệt hồ sơ
                    </h3>
                    <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                      Bước {STAGE_META[currentCandidate.stage]?.stepNum ?? 1} / 5
                    </span>
                  </div>

                  {/* Horizontal Linear Stepper */}
                  <div className="relative mt-5 px-3">
                    {/* Connecting Bar */}
                    <div className="absolute left-6 right-6 top-4 h-0.5 -translate-y-1/2 bg-[#D5E3DF] dark:bg-zinc-800" />
                    <div
                      className="absolute left-6 top-4 h-0.5 -translate-y-1/2 bg-[#0F766E] transition-all duration-300 dark:bg-teal-400"
                      style={{
                        width: `calc(${
                          (((STAGE_META[currentCandidate.stage]?.stepNum ?? 1) - 1) / 4) * 100
                        }% - 12px)`,
                      }}
                    />

                    {/* 5 Milestone Nodes */}
                    <div className="relative flex justify-between">
                      {(
                        ['APPLIED', 'AI_SCREENED', 'INTERVIEW', 'OFFER', 'ONBOARDED'] as AtsStage[]
                      ).map((stg) => {
                        const meta = STAGE_META[stg];
                        const currentStepNum = STAGE_META[currentCandidate.stage]?.stepNum ?? 1;
                        const isDone = currentStepNum > meta.stepNum;
                        const isCurrent = currentCandidate.stage === stg;

                        return (
                          <div
                            key={stg}
                            className="flex flex-col items-center group relative cursor-default"
                            title={`${meta.label}: ${meta.desc}`}
                          >
                            <div
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-200',
                                isDone
                                  ? 'bg-[#0F766E] text-white shadow-sm dark:bg-teal-500'
                                  : isCurrent
                                  ? 'border-2 border-[#0F766E] bg-[#FCFEFD] text-[#0F766E] ring-4 ring-[#0F766E]/20 dark:border-teal-400 dark:bg-zinc-900 dark:text-teal-400 dark:ring-teal-400/20'
                                  : 'border-2 border-[#D5E3DF] bg-[#F2F7F5] text-[#5C7871] dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-500'
                              )}
                            >
                              {isDone ? (
                                <Check className="h-4 w-4" strokeWidth={2.5} />
                              ) : (
                                meta.stepNum
                              )}
                            </div>

                            <span
                              className={cn(
                                'mt-2 text-center text-[11px] max-w-[90px] leading-tight transition-colors',
                                isCurrent
                                  ? 'font-bold text-[#0F766E] dark:text-teal-400'
                                  : isDone
                                  ? 'font-medium text-[#11221E] dark:text-zinc-200'
                                  : 'text-[#5C7871] dark:text-zinc-500'
                              )}
                            >
                              {meta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Step Detailed Callout Banner */}
                  <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[#C6D9D3] bg-[#E8F3EF]/70 p-4 dark:border-zinc-800 dark:bg-zinc-800/60 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0F766E]/10 text-[#0F766E] dark:bg-teal-400/10 dark:text-teal-400">
                        {currentCandidate.stage === 'ONBOARDED' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : currentCandidate.stage === 'INTERVIEW' || currentCandidate.stage === 'OFFER' ? (
                          <Sparkles className="h-4 w-4" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#11221E] dark:text-zinc-100">
                            {STAGE_META[currentCandidate.stage]?.label}
                          </span>
                          <span className="rounded bg-[#0F766E]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#0F766E] dark:bg-teal-400/20 dark:text-teal-300">
                            Đang xử lý
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-300 leading-relaxed">
                          {STAGE_META[currentCandidate.stage]?.desc}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Actions when in Interview or Offer */}
                    {(currentCandidate.stage === 'INTERVIEW' || currentCandidate.stage === 'OFFER') && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 shrink-0">
                        {currentCandidate.stage === 'INTERVIEW' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs font-semibold"
                              onClick={() => handleConfirmInterview(true)}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Xác nhận tham gia
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-[#C6D9D3] text-xs"
                              onClick={() => setActionModal('interview')}
                            >
                              Đề xuất dời lịch
                            </Button>
                          </>
                        )}

                        {currentCandidate.stage === 'OFFER' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs font-semibold"
                              onClick={() => handleOfferDecision('ACCEPT')}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Đồng ý nhận việc
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-rose-300 text-xs text-rose-600 hover:bg-rose-50"
                              onClick={() => setActionModal('offer')}
                            >
                              Từ chối Offer
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-[#C6D9D3] bg-[#FCFEFD] p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <FileText className="mx-auto h-12 w-12 text-[#5C7871] opacity-60" />
            <h3 className="mt-4 text-base font-semibold text-[#11221E] dark:text-zinc-100">
              Chưa có hồ sơ ứng tuyển nào được ghi nhận
            </h3>
            <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
              Hãy truy cập Cổng việc làm Lạc Việt Careers để chọn vị trí phù hợp và gửi CV trực tuyến.
            </p>
            <Link href="/careers">
              <Button variant="primary" size="sm" className="mt-4 text-xs font-semibold">
                Khám phá việc làm ngay
              </Button>
            </Link>
          </div>
        )}
      </main>

      {/* Modal Actions */}
      <Dialog open={Boolean(actionModal)} onOpenChange={(open) => !open && setActionModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionModal === 'interview'
                ? 'Đề xuất dời lịch phỏng vấn'
                : actionModal === 'offer'
                ? 'Xác nhận từ chối Thư mời nhận việc'
                : 'Xác nhận rút hồ sơ ứng tuyển'}
            </DialogTitle>
            <DialogDescription>
              {actionModal === 'interview'
                ? 'Vui lòng cung cấp khung giờ bạn có thể tham gia phỏng vấn để Ban Tuyển dụng sắp xếp lại lịch.'
                : 'Hành động này sẽ gửi thông báo phản hồi chính thức đến Trưởng phòng Tuyển dụng.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3">
            <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
              Lý do hoặc ghi chú phản hồi
            </label>
            <textarea
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Nhập lý do cụ thể..."
              className="mt-1.5 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setActionModal(null)} className="text-xs">
              Hủy
            </Button>
            <Button
              variant={actionModal === 'withdraw' || actionModal === 'offer' ? 'danger' : 'primary'}
              size="sm"
              className="text-xs font-semibold"
              onClick={() => {
                if (actionModal === 'interview') handleConfirmInterview(false);
                else if (actionModal === 'offer') handleOfferDecision('DECLINE');
                else if (actionModal === 'withdraw') handleWithdraw();
              }}
            >
              Xác nhận gửi phản hồi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
