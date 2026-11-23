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
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import {
  activateEmployeeAccountIfPreboardingVerified,
  createPreboardingInvite,
  getAllRuntimeEmployees,
  getJobPostings,
  getNotificationsForActor,
  getOnboardingRecords,
  getPreboardingInvites,
  getRuntimeDepartments,
  getSystemUsers,
  HRM_RUNTIME_EVENT,
  markAllNotificationsRead,
  markNotificationRead,
  mergeWithRuntimeCandidates,
  pushNotification,
  readRuntimeCandidates,
  saveRuntimeCandidate,
} from '@/lib/runtime-store';
import { MOCK_CANDIDATES } from '@/mock/ats';
import { cn, formatDateVN, formatVND } from '@/lib/utils';
import type {
  AtsStage,
  Candidate,
  Employee,
  HrmNotification,
  JobPosting,
  OnboardingRecord,
  PreboardingInvite,
  SystemUserAccount,
} from '@/mock/types';
import { Avatar } from '@/components/ui/avatar';
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
    label: 'Đã rút / Dừng tuyển',
    variant: 'danger',
    stepNum: 0,
    desc: 'Hồ sơ đã dừng xét duyệt hoặc đã rút theo nguyện vọng của ứng viên.',
  },
};

type TimeGroupKey = 'Hôm nay' | 'Hôm qua' | 'Tuần trước' | 'Cũ hơn';
const TIME_GROUP_ORDER: TimeGroupKey[] = ['Hôm nay', 'Hôm qua', 'Tuần trước', 'Cũ hơn'];

function getTimeGroupKey(isoInput: string): TimeGroupKey {
  const d = new Date(isoInput);
  if (Number.isNaN(d.getTime())) return 'Cũ hơn';

  const now = new Date();
  const dateMid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((nowMid - dateMid) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays <= 7) return 'Tuần trước';
  return 'Cũ hơn';
}

interface NotificationVisualMeta {
  borderColor: string;
  badgeLabel: string;
  badgeClass: string;
}

function getNotificationVisualMeta(item: {
  title: string;
  message: string;
  category?: string;
}): NotificationVisualMeta {
  const text = `${item.title} ${item.message}`.toLowerCase();

  // 1. Phỏng vấn (Sky / Blue)
  if (
    text.includes('phỏng vấn') ||
    text.includes('interview') ||
    text.includes('lịch hẹn')
  ) {
    return {
      borderColor: 'border-l-sky-500',
      badgeLabel: 'Phỏng vấn',
      badgeClass:
        'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-300',
    };
  }

  // 2. Sàng lọc (Amber)
  if (
    text.includes('sàng lọc') ||
    text.includes('sơ loại') ||
    text.includes('screened') ||
    text.includes('ai_screened') ||
    text.includes('hồ sơ mới')
  ) {
    return {
      borderColor: 'border-l-amber-500',
      badgeLabel: 'Sàng lọc',
      badgeClass:
        'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300',
    };
  }

  // 3. Đề nghị nhận việc (Violet)
  if (
    text.includes('đề nghị nhận việc') ||
    text.includes('đề nghị việc') ||
    text.includes('thư mời nhận việc') ||
    text.includes('offer')
  ) {
    return {
      borderColor: 'border-l-violet-500',
      badgeLabel: 'Đề nghị việc',
      badgeClass:
        'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-violet-300',
    };
  }

  // 4. Từ chối / Thu hồi (Rose)
  if (
    text.includes('từ chối') ||
    text.includes('thu hồi') ||
    text.includes('rút hồ sơ') ||
    text.includes('đã loại') ||
    text.includes('bác bỏ') ||
    text.includes('rejected') ||
    text.includes('hủy')
  ) {
    return {
      borderColor: 'border-l-rose-500',
      badgeLabel:
        text.includes('thu hồi') || text.includes('rút hồ sơ')
          ? 'Thu hồi'
          : 'Từ chối',
      badgeClass:
        'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-300',
    };
  }

  // 5. Đã nhận việc / Duyệt (Emerald)
  if (
    text.includes('đã nhận việc') ||
    text.includes('onboarded') ||
    text.includes('tiếp nhận') ||
    text.includes('hội nhập') ||
    text.includes('tuyển dụng') ||
    text.includes('phê duyệt') ||
    text.includes('đã duyệt') ||
    text.includes('hoàn tất')
  ) {
    const isApproval = text.includes('phê duyệt') || text.includes('đã duyệt');
    return {
      borderColor: 'border-l-emerald-500',
      badgeLabel: isApproval ? 'Đã duyệt' : 'Đã nhận việc',
      badgeClass:
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }

  return {
    borderColor: 'border-l-teal-500',
    badgeLabel: 'Thông báo',
    badgeClass:
      'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800/70 dark:bg-teal-950/50 dark:text-teal-300',
  };
}

function renderNotificationMessage(rawMessage: string) {
  // 1. Xóa bỏ triệt để các câu chào lặp lại vô nghĩa như 'Chào Đinh Tuấn Kiệt...', 'Chào dasdasdasdasd...'
  let message = rawMessage
    .replace(/^(?:Xin\s+chào|Chào)\s+[^,!.:\n]+[,!.:]\s*/i, '')
    .trim();

  if (message.length > 0) {
    message = message.charAt(0).toUpperCase() + message.slice(1);
  }

  // 2. Làm nổi bật tên vị trí công việc: In đậm chữ trắng sáng cho tên vị trí
  if (!message.includes('**')) {
    if (/(?:vị trí|chức danh)\s+/i.test(message)) {
      message = message.replace(
        /((?:vị trí|chức danh)\s+)([^,.\n]+?)(?=\s+(?:của bạn|đã|đang|vừa|\.|$))/i,
        '$1**$2**'
      );
    } else if (/^Hồ sơ\s+(?!của\s+)/i.test(message)) {
      message = message.replace(
        /^(Hồ sơ\s+)([^,.\n]+?)(?=\s+(?:đã|đang|vừa|của bạn|\.|$))/i,
        '$1**$2**'
      );
    }
  }

  // 3. Phân tách và render Typography
  const parts = message.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) {
    return message;
  }

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <strong
          key={index}
          className="font-semibold text-[#11221E] dark:text-white"
        >
          {part}
        </strong>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

export default function CandidatePortalPage() {
  const router = useRouter();
  const {
    role,
    theme,
    toggleTheme,
    currentUserEmail,
    currentUserProfile,
    setAuthenticatedUser,
    showToast,
    logout,
  } = useApp();
  const [candidates, setCandidates] = useState<Candidate[]>(MOCK_CANDIDATES);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [appliedStorageEmail, setAppliedStorageEmail] = useState<string | null>(null);
  const [runtimeEmployees, setRuntimeEmployees] = useState<Employee[]>([]);
  const pendingSelectIdRef = useRef<string | null>(null);
  const setActiveCandidate = useCallback((cand: Candidate | null) => {
    setSelectedCandidateId(cand ? cand.id : null);
  }, []);
  const [actionModal, setActionModal] = useState<'interview' | 'offer' | 'withdraw' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:30');
  const [notifications, setNotifications] = useState<(HrmNotification & { isRead: boolean })[]>([]);
  const [preboardingInvites, setPreboardingInvites] = useState<PreboardingInvite[]>([]);
  const [onboardingRecords, setOnboardingRecords] = useState<OnboardingRecord[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUserAccount[]>([]);
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  const notiRef = useRef<HTMLDivElement>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingSelectIdRef.current) {
      setSelectedCandidateId(pendingSelectIdRef.current);
      pendingSelectIdRef.current = null;
      return;
    }
    setSelectedCandidateId(null);
  }, [currentUserEmail, currentUserProfile?.employee_code]);

  const sortApplicationsByProgress = useCallback((list: Candidate[]): Candidate[] => {
    if (list.length <= 1) return list;
    return [...list].sort((a, b) => {
      const aRejected = a.stage === 'REJECTED' ? 1 : 0;
      const bRejected = b.stage === 'REJECTED' ? 1 : 0;
      if (aRejected !== bRejected) return aRejected - bRejected;
      const stepDiff =
        (STAGE_META[b.stage]?.stepNum ?? 0) - (STAGE_META[a.stage]?.stepNum ?? 0);
      if (stepDiff !== 0) return stepDiff;
      return b.applied_date.localeCompare(a.applied_date);
    });
  }, []);

  // Priority-ordered applications for the active candidate session
  const myApplications = useMemo(() => {
    if (candidates.length === 0) return [];

    // Priority 1: Match logged-in currentUserEmail or currentUserProfile.employee_code against runtime-merged candidates
    const loginEmail =
      currentUserEmail && currentUserEmail.trim().toLowerCase() !== 'ungvien@gmail.com'
        ? currentUserEmail.trim().toLowerCase()
        : null;
    const loginCode = currentUserProfile?.employee_code?.trim().toLowerCase() || null;

    if (loginEmail) {
      const allowCodeFallback =
        Boolean(loginCode) &&
        (loginEmail === 'minh.hoang@gmail.com' || loginCode !== 'uv-2026-001');
      const matchedByLogin = candidates.filter(
        (c) =>
          c.email.trim().toLowerCase() === loginEmail ||
          (allowCodeFallback &&
            loginEmail === 'minh.hoang@gmail.com' &&
            c.candidate_code.trim().toLowerCase() === loginCode)
      );
      if (matchedByLogin.length > 0) {
        return sortApplicationsByProgress(matchedByLogin);
      }
      if (loginEmail !== 'minh.hoang@gmail.com') {
        return [];
      }
    } else if (loginCode && loginCode !== 'uv-2026-001') {
      const matchedByCode = candidates.filter(
        (c) => c.candidate_code.trim().toLowerCase() === loginCode
      );
      if (matchedByCode.length > 0) {
        return sortApplicationsByProgress(matchedByCode);
      }
    }

    // Priority 2: Only use lacviet_applied_candidate_email when not logged in with a specific account
    if (!loginEmail && appliedStorageEmail) {
      const matchedByApplied = candidates.filter(
        (c) => c.email.trim().toLowerCase() === appliedStorageEmail
      );
      return matchedByApplied.length > 0
        ? sortApplicationsByProgress(matchedByApplied)
        : [];
    }

    // Priority 3: Fallback to demo UV-2026-001 ONLY for demo account UV-2026-001 / minh.hoang@gmail.com or unauthenticated visit
    const rawCurrentEmail = currentUserEmail?.trim().toLowerCase() || '';
    const hasCustomAccount =
      (Boolean(rawCurrentEmail) &&
        rawCurrentEmail !== 'minh.hoang@gmail.com' &&
        rawCurrentEmail !== 'ungvien@gmail.com') ||
      (Boolean(loginCode) && loginCode !== 'uv-2026-001');
    if (hasCustomAccount) {
      return [];
    }

    const demoCand = candidates.find(
      (c) =>
        c.candidate_code.trim().toUpperCase() === 'UV-2026-001' ||
        c.email.trim().toLowerCase() === 'minh.hoang@gmail.com'
    );
    return demoCand ? [demoCand] : [];
  }, [
    candidates,
    currentUserEmail,
    currentUserProfile?.employee_code,
    appliedStorageEmail,
    sortApplicationsByProgress,
  ]);

  const currentCandidate = useMemo(() => {
    if (myApplications.length === 0) return null;
    if (selectedCandidateId) {
      const match = myApplications.find((c) => c.id === selectedCandidateId);
      if (match) return match;
    }
    return myApplications[0];
  }, [myApplications, selectedCandidateId]);

  const activeCandidate = currentCandidate;

  const activeCandidateMeta = useMemo(() => {
    if (!activeCandidate) {
      return {
        approvedSalaryVnd: undefined as number | undefined,
        matchedInvite: undefined as PreboardingInvite | undefined,
        matchedEmp: undefined as Employee | undefined,
        matchedOnboarding: undefined as OnboardingRecord | undefined,
        matchedSystemUser: undefined as SystemUserAccount | undefined,
        isBlockedByLifecycle: false,
        isEmployeeAccountActivated: false,
        employeeCompanyEmail: '',
        employeeCode: '',
        preboardingHref: '/preboarding',
      };
    }

    const ext = activeCandidate as Candidate & {
      offered_salary_vnd?: number;
      preboarding_token?: string;
    };
    const emailLower = activeCandidate.email.trim().toLowerCase();
    const candToken = ext.preboarding_token?.trim();

    const nonExpiredInvites = preboardingInvites.filter(
      (inv) => inv.status !== 'EXPIRED'
    );
    const matchedInvite =
      (candToken
        ? nonExpiredInvites.find((inv) => inv.token === candToken)
        : undefined) ??
      nonExpiredInvites.find(
        (inv) =>
          inv.id !== 'pb-2026-001' &&
          ((inv.candidate_id && inv.candidate_id === activeCandidate.id) ||
            (inv.candidate_code && inv.candidate_code === activeCandidate.candidate_code))
      ) ??
      nonExpiredInvites.find(
        (inv) =>
          (!inv.candidate_id ||
            inv.candidate_id === activeCandidate.id ||
            inv.id === 'pb-2026-001') &&
          (!inv.candidate_code ||
            inv.candidate_code === activeCandidate.candidate_code ||
            inv.id === 'pb-2026-001') &&
          inv.personal_email.trim().toLowerCase() === emailLower
      );

    const matchedEmp = runtimeEmployees.find(
      (emp) =>
        (candToken && emp.preboarding_token === candToken) ||
        (matchedInvite &&
          (emp.id === matchedInvite.employee_id ||
            emp.employee_code === matchedInvite.employee_code)) ||
        emp.personal_email?.trim().toLowerCase() === emailLower ||
        emp.email.trim().toLowerCase() === emailLower
    );

    const matchedOnboarding = onboardingRecords.find(
      (rec) =>
        rec.candidate_id === activeCandidate.id ||
        rec.candidate_code === activeCandidate.candidate_code ||
        (candToken && rec.preboarding_token === candToken) ||
        (matchedInvite &&
          (rec.employee_id === matchedInvite.employee_id ||
            rec.employee_code === matchedInvite.employee_code)) ||
        (matchedEmp &&
          (rec.employee_id === matchedEmp.id ||
            rec.employee_code === matchedEmp.employee_code))
    );

    const matchedSystemUser = systemUsers.find(
      (u) =>
        (matchedInvite &&
          (u.employee_code === matchedInvite.employee_code ||
            (matchedInvite.email &&
              u.email.trim().toLowerCase() === matchedInvite.email.trim().toLowerCase()))) ||
        (matchedEmp &&
          (u.employee_code === matchedEmp.employee_code ||
            u.email.trim().toLowerCase() === matchedEmp.email.trim().toLowerCase())) ||
        (matchedOnboarding &&
          (u.employee_code === matchedOnboarding.employee_code ||
            u.email.trim().toLowerCase() === matchedOnboarding.email.trim().toLowerCase()))
    );

    const hasLockedSystemUserByEmail = systemUsers.some(
      (u) =>
        u.account_status === 'LOCKED' &&
        u.email.trim().toLowerCase() === emailLower
    );

    const isBlockedByLifecycle =
      matchedEmp?.employment_status === 'RESIGNED' ||
      matchedSystemUser?.account_status === 'LOCKED' ||
      hasLockedSystemUserByEmail;

    const isEmployeeAccountActivated =
      !isBlockedByLifecycle && matchedInvite?.status === 'VERIFIED';

    const employeeCompanyEmail =
      matchedSystemUser?.email ||
      matchedEmp?.email ||
      matchedInvite?.email ||
      matchedOnboarding?.email ||
      '';
    const employeeCode =
      matchedSystemUser?.employee_code ||
      matchedEmp?.employee_code ||
      matchedInvite?.employee_code ||
      matchedOnboarding?.employee_code ||
      '';

    const isOfferOrOnboarded =
      activeCandidate.stage === 'OFFER' ||
      activeCandidate.stage === 'ONBOARDED' ||
      Boolean(
        matchedEmp &&
          (matchedEmp.id.startsWith('emp-rt-') || matchedEmp.id.startsWith('emp-pb-'))
      );

    const approvedSalaryVnd =
      (typeof ext.offered_salary_vnd === 'number' && ext.offered_salary_vnd > 0
        ? ext.offered_salary_vnd
        : undefined) ??
      (isOfferOrOnboarded
        ? (matchedInvite?.official_salary_vnd && matchedInvite.official_salary_vnd > 0
            ? matchedInvite.official_salary_vnd
            : undefined) ??
          (matchedEmp?.base_salary_vnd && matchedEmp.base_salary_vnd > 0
            ? matchedEmp.base_salary_vnd
            : undefined)
        : undefined);

    const resolvedToken = matchedInvite?.token || candToken || '';
    const preboardingHref = resolvedToken
      ? `/preboarding?token=${encodeURIComponent(resolvedToken)}`
      : '/preboarding';

    return {
      approvedSalaryVnd,
      matchedInvite,
      matchedEmp,
      matchedOnboarding,
      matchedSystemUser,
      isBlockedByLifecycle,
      isEmployeeAccountActivated,
      employeeCompanyEmail,
      employeeCode,
      preboardingHref,
    };
  }, [activeCandidate, preboardingInvites, runtimeEmployees, onboardingRecords, systemUsers]);

  const handleEnterEmployeeWorkspace = useCallback(() => {
    const effectiveInvite = activeCandidateMeta.matchedInvite ?? null;
    if (
      !activeCandidate ||
      activeCandidateMeta.isBlockedByLifecycle ||
      effectiveInvite?.status !== 'VERIFIED'
    ) {
      showToast(
        'Không thể chuyển không gian làm việc',
        'Hồ sơ Pre-boarding chưa được HR xác minh hoặc tài khoản nhân sự đang bị khóa/đã nghỉ việc.',
        'error'
      );
      return;
    }

    const activationTarget =
      effectiveInvite.employee_code ||
      effectiveInvite.personal_email ||
      activeCandidate.email;
    const activatedUser =
      activateEmployeeAccountIfPreboardingVerified(activationTarget) ??
      activateEmployeeAccountIfPreboardingVerified(activeCandidate.email);

    if (
      !activatedUser ||
      activatedUser.account_status !== 'ACTIVE' ||
      activatedUser.is_active === false
    ) {
      showToast(
        'Không thể kích hoạt tài khoản Nhân viên',
        'Không xác thực được tài khoản Nhân viên từ hồ sơ Pre-boarding đã duyệt. Vui lòng liên hệ Phòng Nhân sự.',
        'error'
      );
      return;
    }

    const effectiveEmp = activeCandidateMeta.matchedEmp ?? null;
    const effectiveOnb = activeCandidateMeta.matchedOnboarding ?? null;

    if (
      effectiveEmp?.employment_status === 'RESIGNED' ||
      activatedUser.account_status !== 'ACTIVE'
    ) {
      showToast(
        'Không thể chuyển không gian làm việc',
        'Tài khoản nhân sự này hiện đang bị khóa hoặc đã nghỉ việc.',
        'error'
      );
      return;
    }

    const companyEmail =
      activatedUser.email ||
      effectiveEmp?.email ||
      effectiveInvite.email ||
      effectiveOnb?.email ||
      activeCandidate.email;
    const employeeCode =
      activatedUser.employee_code ||
      effectiveEmp?.employee_code ||
      effectiveInvite.employee_code ||
      effectiveOnb?.employee_code ||
      '';
    const fullName =
      effectiveEmp?.full_name ||
      activatedUser.full_name ||
      effectiveInvite.full_name ||
      activeCandidate.full_name;
    const department =
      effectiveEmp?.department_name ||
      activatedUser.department_name ||
      effectiveInvite.department_name ||
      effectiveOnb?.department_name ||
      'Phòng ban chuyên môn';
    const departmentId =
      effectiveEmp?.department_id ||
      effectiveInvite.department_id ||
      effectiveOnb?.department_id;
    const title =
      effectiveEmp?.position_name ||
      activatedUser.position_name ||
      effectiveInvite.position_name ||
      effectiveOnb?.position_name ||
      activeCandidate.job_title;

    setAuthenticatedUser('EMPLOYEE', companyEmail, {
      fullName,
      employee_code: employeeCode,
      email: companyEmail,
      department,
      department_id: departmentId,
      title,
    });
    showToast(
      'Chào mừng vào không gian làm việc Nhân viên',
      `${fullName}${employeeCode ? ` (${employeeCode})` : ''} · ${companyEmail}`,
      'success'
    );
    router.push('/app');
  }, [activeCandidate, activeCandidateMeta, router, setAuthenticatedUser, showToast]);

  const buildEnrichedCandidates = useCallback(() => {
    const mergedList = mergeWithRuntimeCandidates(MOCK_CANDIDATES);
    const allEmps = getAllRuntimeEmployees();
    const onbRecords = getOnboardingRecords();
    const invites = getPreboardingInvites();
    const users = getSystemUsers();

    const enrichedList = mergedList.map((cand) => {
      if (
        cand.stage === 'REJECTED' ||
        cand.stage === 'ONBOARDED' ||
        cand.stage === 'OFFER'
      ) {
        return cand;
      }
      const ext = cand as Candidate & {
        offered_salary_vnd?: number;
        preboarding_token?: string;
      };
      const emailLower = cand.email.trim().toLowerCase();
      const token = ext.preboarding_token?.trim();

      const hasOnboarding = onbRecords.some(
        (rec: OnboardingRecord) =>
          rec.candidate_id === cand.id ||
          rec.candidate_code === cand.candidate_code ||
          Boolean(token && rec.preboarding_token === token)
      );
      const hasRuntimeEmployee = allEmps.some(
        (emp) =>
          (emp.id.startsWith('emp-rt-') || emp.id.startsWith('emp-pb-')) &&
          (Boolean(token && emp.preboarding_token === token) ||
            emp.personal_email?.trim().toLowerCase() === emailLower ||
            emp.email.trim().toLowerCase() === emailLower)
      );
      const hasOwnPreboardingInvite = invites.some(
        (inv) =>
          inv.id !== 'pb-2026-001' &&
          (Boolean(token && inv.token === token) ||
            inv.personal_email.trim().toLowerCase() === emailLower)
      );

      if (hasOnboarding || hasRuntimeEmployee) {
        return { ...cand, stage: 'ONBOARDED' as AtsStage };
      }
      if (
        hasOwnPreboardingInvite ||
        (typeof ext.offered_salary_vnd === 'number' && ext.offered_salary_vnd > 0)
      ) {
        return { ...cand, stage: 'OFFER' as AtsStage };
      }
      return cand;
    });

    return { enrichedList, allEmps, invites, onbRecords, users };
  }, []);

  const syncCandidateData = useCallback(() => {
    const { enrichedList, allEmps, invites, onbRecords, users } = buildEnrichedCandidates();
    setCandidates(enrichedList);
    setRuntimeEmployees(allEmps);
    setPreboardingInvites(invites);
    setOnboardingRecords(onbRecords);
    setSystemUsers(users);

    if (typeof window !== 'undefined') {
      const rawApplied = window.localStorage.getItem('lacviet_applied_candidate_email');
      setAppliedStorageEmail(rawApplied?.trim() ? rawApplied.trim().toLowerCase() : null);
    }
  }, [buildEnrichedCandidates]);

  const pullLatestServerSync = useCallback(async () => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    try {
      const res = await fetch('/api/hrm/sync', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        success?: boolean;
        bootEpoch?: string;
        stores?: Record<string, unknown>;
      };
      const stores = data?.stores;
      if (stores && typeof stores === 'object') {
        const hasNonEmptyServerStore = Object.values(stores).some(
          (v) => Array.isArray(v) && v.length > 0
        );
        if (
          typeof data.bootEpoch === 'string' &&
          data.bootEpoch.length > 0 &&
          hasNonEmptyServerStore
        ) {
          window.localStorage.setItem('hrm_runtime_boot_epoch_v1', data.bootEpoch);
        }

        const readLocalArray = (storageKey: string): Record<string, unknown>[] => {
          try {
            const rawLocal = window.localStorage.getItem(storageKey);
            if (!rawLocal) return [];
            const parsed = JSON.parse(rawLocal);
            return Array.isArray(parsed)
              ? (parsed as Record<string, unknown>[])
              : [];
          } catch {
            return [];
          }
        };

        const normKey = (v: unknown): string =>
          typeof v === 'string' ? v.trim().toLowerCase() : '';

        const sameGenericRecord = (
          a: Record<string, unknown>,
          b: Record<string, unknown>
        ): boolean => {
          const aId = normKey(a.id);
          const bId = normKey(b.id);
          if (aId && bId && aId === bId) return true;
          const aEmp = normKey(a.employee_code);
          const bEmp = normKey(b.employee_code);
          if (aEmp && bEmp && aEmp === bEmp) return true;
          const aTok = normKey(a.token);
          const bTok = normKey(b.token);
          if (aTok && bTok && aTok === bTok) return true;
          return false;
        };

        const parseMs = (rawTime: unknown): number => {
          if (typeof rawTime !== 'string' || !rawTime.trim()) return 0;
          const parsed = Date.parse(rawTime);
          return Number.isFinite(parsed) ? parsed : 0;
        };

        const getRecordRecencyMs = (rec: Record<string, unknown>): number => {
          let maxMs = Math.max(
            parseMs(rec.updated_at),
            parseMs(rec.verified_at),
            parseMs(rec.submitted_at),
            parseMs(rec.activated_at),
            parseMs(rec.locked_at),
            parseMs(rec.completed_at),
            parseMs(rec.created_at)
          );
          if (rec.reschedule_request && typeof rec.reschedule_request === 'object') {
            maxMs = Math.max(
              maxMs,
              parseMs(
                (rec.reschedule_request as Record<string, unknown>).requested_at
              )
            );
          }
          if (rec.interview_schedule && typeof rec.interview_schedule === 'object') {
            maxMs = Math.max(
              maxMs,
              parseMs(
                (rec.interview_schedule as Record<string, unknown>).scheduled_at
              )
            );
          }
          if (Array.isArray(rec.checklist)) {
            for (const item of rec.checklist) {
              if (item && typeof item === 'object') {
                maxMs = Math.max(
                  maxMs,
                  parseMs((item as Record<string, unknown>).completed_at)
                );
              }
            }
          }
          if (Array.isArray(rec.activity_logs)) {
            for (const log of rec.activity_logs) {
              if (log && typeof log === 'object') {
                maxMs = Math.max(
                  maxMs,
                  parseMs((log as Record<string, unknown>).created_at)
                );
              }
            }
          }
          return maxMs;
        };

        const CAND_STAGE_RANK: Record<string, number> = {
          APPLIED: 1,
          AI_SCREENED: 2,
          INTERVIEW: 3,
          OFFER: 4,
          ONBOARDED: 5,
        };
        const PREBOARDING_STATUS_RANK: Record<string, number> = {
          PENDING: 1,
          PENDING_SUBMISSION: 1,
          SUBMITTED: 2,
          VERIFIED: 3,
          EXPIRED: 4,
        };
        const ACCOUNT_STATUS_RANK: Record<string, number> = {
          INACTIVE: 1,
          ACTIVE: 2,
          LOCKED: 3,
        };
        const EMP_STATUS_RANK: Record<string, number> = {
          PENDING_ONBOARD: 1,
          PROBATION: 2,
          ON_LEAVE: 3,
          ACTIVE: 4,
          OFFICIAL: 4,
          NOTICE_PERIOD: 5,
          RESIGNED: 6,
        };
        const GENERIC_STATUS_RANK: Record<string, number> = {
          PENDING: 1,
          IN_PROGRESS: 1,
          SUBMITTED: 2,
          ACTIVE: 3,
          APPROVED: 3,
          VERIFIED: 3,
          COMPLETED: 3,
          EXPIRED: 4,
          LOCKED: 4,
          REJECTED: 4,
        };

        const shouldPreferServerRecord = (
          loc: Record<string, unknown>,
          srv: Record<string, unknown>
        ): boolean => {
          const locMs = getRecordRecencyMs(loc);
          const srvMs = getRecordRecencyMs(srv);
          if (srvMs > locMs) return true;

          const locStage = normKey(loc.stage).toUpperCase();
          const srvStage = normKey(srv.stage).toUpperCase();
          if (srvStage && srvStage !== locStage) {
            if (srvStage === 'REJECTED') return true;
            if (locStage === 'REJECTED') return srvMs > locMs;
            const srvStageRank = CAND_STAGE_RANK[srvStage] ?? 0;
            const locStageRank = CAND_STAGE_RANK[locStage] ?? 0;
            if (srvStageRank > locStageRank) return true;
            if (locStageRank > srvStageRank) return false;
          }

          const locPbStatus = normKey(loc.preboarding_status).toUpperCase();
          const srvPbStatus = normKey(srv.preboarding_status).toUpperCase();
          if (srvPbStatus && locPbStatus && srvPbStatus !== locPbStatus) {
            const srvRank = PREBOARDING_STATUS_RANK[srvPbStatus] ?? 0;
            const locRank = PREBOARDING_STATUS_RANK[locPbStatus] ?? 0;
            if (srvRank > locRank) return true;
            if (locRank > srvRank) return false;
          }

          const locAccStatus = normKey(loc.account_status).toUpperCase();
          const srvAccStatus = normKey(srv.account_status).toUpperCase();
          if (srvAccStatus && locAccStatus && srvAccStatus !== locAccStatus) {
            const srvRank = ACCOUNT_STATUS_RANK[srvAccStatus] ?? 0;
            const locRank = ACCOUNT_STATUS_RANK[locAccStatus] ?? 0;
            if (srvRank > locRank) return true;
            if (locRank > srvRank) return false;
          }

          const locEmpStatus = normKey(loc.employment_status).toUpperCase();
          const srvEmpStatus = normKey(srv.employment_status).toUpperCase();
          if (srvEmpStatus && locEmpStatus && srvEmpStatus !== locEmpStatus) {
            const srvRank = EMP_STATUS_RANK[srvEmpStatus] ?? 0;
            const locRank = EMP_STATUS_RANK[locEmpStatus] ?? 0;
            if (srvRank > locRank) return true;
            if (locRank > srvRank) return false;
          }

          const locStatus = normKey(loc.status).toUpperCase();
          const srvStatus = normKey(srv.status).toUpperCase();
          if (srvStatus && locStatus && srvStatus !== locStatus) {
            const srvRank = GENERIC_STATUS_RANK[srvStatus] ?? 0;
            const locRank = GENERIC_STATUS_RANK[locStatus] ?? 0;
            if (srvRank > locRank) return true;
            if (locRank > srvRank) return false;
          }

          if (locMs > srvMs) return false;

          if (Array.isArray(loc.checklist) && Array.isArray(srv.checklist)) {
            const countCompleted = (list: unknown[]) =>
              list.filter(
                (item) =>
                  item &&
                  typeof item === 'object' &&
                  Boolean((item as Record<string, unknown>).completed)
              ).length;
            const locDone = countCompleted(loc.checklist);
            const srvDone = countCompleted(srv.checklist);
            if (srvDone !== locDone) return srvDone > locDone;
          }

          return true;
        };

        const mergeNotificationReadBy = (
          storeKey: string,
          base: Record<string, unknown>,
          other: Record<string, unknown>
        ): Record<string, unknown> => {
          if (
            storeKey === 'hrm_runtime_notifications_v1' &&
            Array.isArray(base.read_by) &&
            Array.isArray(other.read_by)
          ) {
            return {
              ...base,
              read_by: Array.from(
                new Set([
                  ...(base.read_by as unknown[]),
                  ...(other.read_by as unknown[]),
                ])
              ),
            };
          }
          return base;
        };

        const keysToHydrate = [
          'hrm_runtime_candidates_v1',
          'hrm_runtime_onboarding_v1',
          'hrm_runtime_employees_v1',
          'hrm_runtime_preboarding_v1',
          'hrm_runtime_users_v1',
          'hrm_runtime_notifications_v1',
        ] as const;
        for (const key of keysToHydrate) {
          const val = stores[key];
          if (!Array.isArray(val)) continue;

          if (key === 'hrm_runtime_preboarding_v1') {
            const serverInvites = val as PreboardingInvite[];
            const localInvites = readLocalArray(key) as unknown as PreboardingInvite[];

            const statusRank = (status?: string): number => {
              if (status === 'EXPIRED') return 4;
              if (status === 'VERIFIED') return 3;
              if (status === 'SUBMITTED') return 2;
              if (status === 'PENDING_SUBMISSION') return 1;
              return 0;
            };
            const recencyMs = (inv?: PreboardingInvite): number => {
              if (!inv) return 0;
              return Math.max(
                Date.parse(inv.verified_at || '') || 0,
                Date.parse(inv.submitted_at || '') || 0,
                Date.parse(inv.created_at || '') || 0
              );
            };
            const sameInvite = (a: PreboardingInvite, b: PreboardingInvite) =>
              (Boolean(a.token) && a.token === b.token) ||
              (Boolean(a.id) && a.id === b.id) ||
              (Boolean(a.employee_code) && a.employee_code === b.employee_code);

            const merged: PreboardingInvite[] = serverInvites.map((srv) => {
              const loc = localInvites.find((item) => sameInvite(item, srv));
              if (
                loc &&
                (loc.status === 'VERIFIED' || loc.status === 'SUBMITTED')
              ) {
                const locRank = statusRank(loc.status);
                const srvRank = statusRank(srv.status);
                if (
                  locRank > srvRank ||
                  (locRank === srvRank && recencyMs(loc) > recencyMs(srv))
                ) {
                  return loc;
                }
              }
              return srv;
            });

            for (const loc of localInvites) {
              if (!merged.some((item) => sameInvite(item, loc))) {
                merged.unshift(loc);
              }
            }

            if (merged.length > 0) {
              window.localStorage.setItem(key, JSON.stringify(merged));
            }
            continue;
          }

          const localItems = readLocalArray(key);
          const serverItems = val as Record<string, unknown>[];
          const mergedItems: Record<string, unknown>[] = [...localItems];
          for (const srv of serverItems) {
            if (!srv || typeof srv !== 'object') continue;
            const matchIdx = mergedItems.findIndex((loc) =>
              sameGenericRecord(loc, srv)
            );
            if (matchIdx < 0) {
              mergedItems.push(srv);
            } else {
              const loc = mergedItems[matchIdx];
              mergedItems[matchIdx] = shouldPreferServerRecord(loc, srv)
                ? mergeNotificationReadBy(key, srv, loc)
                : mergeNotificationReadBy(key, loc, srv);
            }
          }
          if (mergedItems.length > 0) {
            window.localStorage.setItem(key, JSON.stringify(mergedItems));
          }
        }
      }
    } catch {
      // Keep local runtime store if offline or sync unavailable
    } finally {
      syncCandidateData();
    }
  }, [syncCandidateData]);

  useEffect(() => {
    syncCandidateData();
    void pullLatestServerSync();
    const handleFocusSync = () => {
      void pullLatestServerSync();
    };
    window.addEventListener(HRM_RUNTIME_EVENT, syncCandidateData);
    window.addEventListener('storage', syncCandidateData);
    window.addEventListener('focus', handleFocusSync);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncCandidateData);
      window.removeEventListener('storage', syncCandidateData);
      window.removeEventListener('focus', handleFocusSync);
    };
  }, [syncCandidateData, pullLatestServerSync]);

  useEffect(() => {
    const candCode = currentCandidate?.candidate_code || '';
    setNotifications(getNotificationsForActor('CANDIDATE', candCode, undefined));
  }, [currentCandidate?.candidate_code, candidates]);

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

  // Close user dropdown menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const groupedNotifications = useMemo(() => {
    const map: Record<TimeGroupKey, (HrmNotification & { isRead: boolean })[]> = {
      'Hôm nay': [],
      'Hôm qua': [],
      'Tuần trước': [],
      'Cũ hơn': [],
    };
    notifications.forEach((item) => {
      const key = getTimeGroupKey(item.created_at);
      map[key].push(item);
    });
    return map;
  }, [notifications]);

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
    if (!currentCandidate.interview_schedule?.date) {
      showToast('Chưa có lịch phỏng vấn', 'Bộ phận Nhân sự chưa thiết lập thời gian phỏng vấn cụ thể cho bạn.', 'warning');
      return;
    }

    const sched = currentCandidate.interview_schedule;
    const timeStr = `${sched.time || '09:30'} ngày ${formatDateVN(sched.date)}`;
    const eventId = `evt-confirm-${Date.now()}`;

    const newLogItem = {
      id: `log-${Date.now()}`,
      event_id: eventId,
      type: 'INTERVIEW_CONFIRMED',
      title: 'Xác nhận tham gia phỏng vấn',
      description: `Ứng viên đã xác nhận tham gia phỏng vấn lúc ${timeStr}.`,
      actor_name: currentCandidate.full_name,
      created_at: new Date().toISOString(),
    };

    const updated: Candidate = {
      ...currentCandidate,
      interview_schedule: {
        ...sched,
        status: 'confirmed',
      },
      reschedule_request: undefined,
      activity_logs: [newLogItem, ...(currentCandidate.activity_logs || [])],
    };

    saveRuntimeCandidate(updated);
    setActiveCandidate(updated);
    setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setActionModal(null);
    setActionReason('');

    pushNotification({
      title: `Ứng viên xác nhận lịch phỏng vấn (${currentCandidate.candidate_code})`,
      message: `Ứng viên ${currentCandidate.full_name} (${currentCandidate.job_title}) đã xác nhận tham gia phỏng vấn lúc ${timeStr}.`,
      category: 'ONBOARDING',
      target_roles: ['HR_MANAGER', 'DEPT_MANAGER'],
      nav_id: 'recruitment',
      entity_id: currentCandidate.id,
    });

    showToast(
      'Đã xác nhận tham gia phỏng vấn',
      `Bạn đã xác nhận tham gia buổi phỏng vấn vào lúc ${timeStr}.`,
      'success'
    );
  };

  const handleSendReschedule = () => {
    if (!currentCandidate) return;
    if (currentCandidate.interview_schedule?.status === 'confirmed') {
      showToast(
        'Lịch phỏng vấn đã được xác nhận',
        'Bạn đã xác nhận tham gia buổi phỏng vấn này. Lịch hẹn đã được chốt với hội đồng chuyên môn và không thể dời trực tuyến.',
        'warning'
      );
      setActionModal(null);
      return;
    }
    if (!rescheduleReason.trim()) {
      showToast('Thiếu thông tin', 'Vui lòng nhập lý do đề xuất dời lịch', 'warning');
      return;
    }
    if (!rescheduleDate) {
      showToast('Thiếu thông tin', 'Vui lòng chọn ngày đề xuất mới', 'warning');
      return;
    }

    const proposedTimeStr = `${rescheduleTime || '09:30'} ngày ${formatDateVN(rescheduleDate)}`;
    const requested_at = new Date().toISOString();

    const newLogItem = {
      id: `log-${Date.now()}`,
      event_id: `evt-resched-${Date.now()}`,
      type: 'RESCHEDULE_REQUESTED',
      title: 'Đề xuất dời lịch phỏng vấn',
      description: `Đề xuất chuyển sang: ${proposedTimeStr}. Lý do: ${rescheduleReason.trim()}`,
      actor_name: currentCandidate.full_name,
      created_at: requested_at,
    };

    const updated: Candidate = {
      ...currentCandidate,
      interview_schedule: currentCandidate.interview_schedule
        ? { ...currentCandidate.interview_schedule, status: 'reschedule_requested' }
        : undefined,
      reschedule_request: {
        reason: rescheduleReason.trim(),
        proposed_time: proposedTimeStr,
        requested_at,
        status: 'PENDING',
      },
      activity_logs: [newLogItem, ...(currentCandidate.activity_logs || [])],
    };

    saveRuntimeCandidate(updated);
    setActiveCandidate(updated);
    setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

    pushNotification({
      title: `Ứng viên đề xuất dời lịch phỏng vấn (${currentCandidate.candidate_code})`,
      message: `Ứng viên ${currentCandidate.full_name} (${currentCandidate.job_title}) đề xuất dời lịch sang ${proposedTimeStr}. Lý do: ${rescheduleReason.trim()}`,
      category: 'ONBOARDING',
      target_roles: ['HR_MANAGER', 'DEPT_MANAGER'],
      nav_id: 'recruitment',
      entity_id: currentCandidate.id,
    });

    setActionModal(null);
    setRescheduleReason('');

    showToast(
      'Đã gửi yêu cầu dời lịch phỏng vấn',
      'Phòng Tuyển dụng Lạc Việt đã nhận được phản hồi của bạn.',
      'success'
    );
  };

  const handleOfferDecision = (decision: 'ACCEPT' | 'DECLINE') => {
    if (!currentCandidate) return;
    if (currentCandidate.stage !== 'OFFER') return;
    const nextStage: AtsStage = decision === 'ACCEPT' ? 'ONBOARDED' : 'OFFER';

    let nextPreboardingToken = currentCandidate.preboarding_token?.trim();
    if (decision === 'ACCEPT') {
      const nonExpiredInvites = getPreboardingInvites().filter(
        (inv) => inv.status !== 'EXPIRED'
      );
      const candEmailLower = currentCandidate.email.trim().toLowerCase();
      const candCode = currentCandidate.candidate_code?.trim();
      const matchedFromMeta =
        activeCandidateMeta.matchedInvite &&
        activeCandidateMeta.matchedInvite.status !== 'EXPIRED' &&
        (!activeCandidateMeta.matchedInvite.candidate_id ||
          activeCandidateMeta.matchedInvite.candidate_id === currentCandidate.id) &&
        (!activeCandidateMeta.matchedInvite.candidate_code ||
          activeCandidateMeta.matchedInvite.candidate_code === candCode)
          ? activeCandidateMeta.matchedInvite
          : undefined;

      const existingInvite =
        (nextPreboardingToken
          ? nonExpiredInvites.find((inv) => inv.token === nextPreboardingToken)
          : undefined) ??
        nonExpiredInvites.find(
          (inv) =>
            (inv.candidate_id && inv.candidate_id === currentCandidate.id) ||
            (candCode && inv.candidate_code === candCode)
        ) ??
        matchedFromMeta ??
        nonExpiredInvites.find(
          (inv) =>
            (!inv.candidate_id || inv.candidate_id === currentCandidate.id) &&
            (!inv.candidate_code || inv.candidate_code === candCode) &&
            inv.personal_email.trim().toLowerCase() === candEmailLower
        );

      if (!existingInvite) {
        const departments = getRuntimeDepartments();
        const matchedJob = getJobPostings().find(
          (j) =>
            j.id === currentCandidate.job_id ||
            j.job_code === currentCandidate.job_code
        );
        const candDeptLower = (currentCandidate.department_name || '').trim().toLowerCase();
        const candJobCodeUpper = (currentCandidate.job_code || '').trim().toUpperCase();
        const matchedDept =
          departments.find(
            (d) =>
              (matchedJob && d.id === matchedJob.department_id) ||
              (candDeptLower && d.department_name.trim().toLowerCase() === candDeptLower)
          ) ??
          departments.find((d) => {
            if (candJobCodeUpper.includes('AI') || candJobCodeUpper.includes('DATA')) {
              return d.id === 'dept-tech-data';
            }
            if (candJobCodeUpper.includes('HR') || candJobCodeUpper.includes('CB')) {
              return d.id === 'dept-hr';
            }
            if (candJobCodeUpper.includes('FIN')) {
              return d.id === 'dept-fin';
            }
            if (candJobCodeUpper.includes('BIZ') || candJobCodeUpper.includes('SALE')) {
              return d.id === 'dept-sales';
            }
            if (candJobCodeUpper.includes('SWE') || candJobCodeUpper.includes('FE')) {
              return d.id === 'dept-tech-swe';
            }
            return false;
          }) ??
          departments[0];

        const departmentId = matchedDept?.id ?? 'dept-tech-swe';
        const departmentName =
          matchedDept?.department_name ||
          currentCandidate.department_name ||
          'Phòng Kỹ thuật Phần mềm';
        const managerId = matchedDept?.manager_id ?? 'emp-003';
        const managerName =
          matchedJob?.hiring_manager_name || matchedDept?.manager_name || 'Lê Hoàng Nam';

        const officialSalaryVnd =
          (typeof currentCandidate.offered_salary_vnd === 'number' &&
          currentCandidate.offered_salary_vnd > 0
            ? currentCandidate.offered_salary_vnd
            : undefined) ??
          (typeof activeCandidateMeta.approvedSalaryVnd === 'number' &&
          activeCandidateMeta.approvedSalaryVnd > 0
            ? activeCandidateMeta.approvedSalaryVnd
            : undefined) ??
          (currentCandidate.expected_salary_vnd > 0
            ? currentCandidate.expected_salary_vnd
            : 25000000);

        const expectedStartDate = new Date(Date.now() + 7 * 86400000)
          .toISOString()
          .slice(0, 10);

        const created = createPreboardingInvite({
          candidate: currentCandidate,
          fullName: currentCandidate.full_name,
          personalEmail: currentCandidate.email,
          phone: currentCandidate.phone,
          departmentId,
          departmentName,
          positionName: currentCandidate.job_title || 'Chuyên viên',
          managerId,
          managerName,
          expectedStartDate,
          officialSalaryVnd,
          actorName: currentCandidate.full_name,
        });
        nextPreboardingToken = created.invite.token;
      } else {
        nextPreboardingToken = existingInvite.token;
      }
    }

    const updated: Candidate = {
      ...currentCandidate,
      stage: nextStage,
      ...(nextPreboardingToken ? { preboarding_token: nextPreboardingToken } : {}),
      current_company:
        decision === 'ACCEPT'
          ? `${currentCandidate.current_company} · Ứng viên đã chấp nhận Offer ngày ${new Date().toLocaleDateString('vi-VN')}`
          : `${currentCandidate.current_company} · Ứng viên từ chối Offer: ${actionReason || 'Lý do cá nhân'}`,
    };
    saveRuntimeCandidate(updated);
    setActiveCandidate(updated);
    setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (decision === 'ACCEPT') {
      syncCandidateData();
    }
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
    if (['INTERVIEW', 'OFFER', 'ONBOARDED'].includes(currentCandidate.stage)) {
      showToast(
        'Không thể rút hồ sơ',
        'Hồ sơ của bạn đã bước vào vòng phỏng vấn/xét tuyển chuyên sâu. Không thể rút hồ sơ trực tuyến.',
        'warning'
      );
      setActionModal(null);
      return;
    }
    const updated: Candidate = {
      ...currentCandidate,
      stage: 'REJECTED',
      current_company: `${currentCandidate.current_company} · [ỨNG VIÊN ĐÃ RÚT HỒ SƠ: ${actionReason || 'Nguyện vọng cá nhân'}]`,
    };
    saveRuntimeCandidate(updated);
    setActiveCandidate(updated);
    setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setActionModal(null);
    setActionReason('');
    showToast(
      'Đã rút hồ sơ ứng tuyển',
      'Hồ sơ của bạn đã được cập nhật trạng thái dừng tuyển. Bạn có thể ứng tuyển vị trí khác tại Cổng việc làm.',
      'default'
    );
  };

  return (
    <div className={cn('min-h-screen font-sans transition-colors', theme === 'dark' ? 'dark bg-zinc-950 text-zinc-100' : 'bg-[#EFF5F3] text-[#11221E]')}>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-[#C6D9D3] bg-[#FCFEFD]/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F766E] text-white shadow-sm">
              <User className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                  LẠC VIỆT
                </span>
                <span className="rounded bg-[#CBE8E2] px-1.5 py-0.5 text-[10px] font-semibold text-[#0B4F4A] dark:bg-teal-950 dark:text-teal-300">
                  Theo dõi Ứng tuyển
                </span>
              </div>
              <p className="hidden sm:block truncate text-[11px] text-[#415A54] dark:text-zinc-400">
                Theo dõi Hồ sơ Tuyển dụng & Tương tác Ứng viên
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
                <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-0 shadow-xl overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-[#D5E3DF] px-3.5 py-2.5 bg-[#F2F7F5] dark:border-zinc-800 dark:bg-zinc-950/50">
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

                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#5C7871] dark:text-zinc-500">
                        Chưa có thông báo nào
                      </div>
                    ) : (
                      <div>
                        {TIME_GROUP_ORDER.map((groupKey) => {
                          const items = groupedNotifications[groupKey];
                          if (items.length === 0) return null;

                          return (
                            <div key={groupKey}>
                              {/* Vạch ngăn cách text nhỏ theo thời gian */}
                              <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-[#D5E3DF]/80 bg-[#F2F7F5]/95 px-3.5 py-1 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5C7871] dark:text-zinc-400">
                                  {groupKey}
                                </span>
                                <span className="h-px flex-1 bg-[#D5E3DF] dark:bg-zinc-800" />
                                <span className="font-mono text-[10px] text-[#5C7871] dark:text-zinc-500">
                                  {items.length}
                                </span>
                              </div>

                              <div className="divide-y divide-[#E4EEEB] dark:divide-zinc-800/60">
                                {items.map((n) => {
                                  const visual = getNotificationVisualMeta(n);

                                  return (
                                    <div
                                      key={n.id}
                                      onClick={() => handleMarkSingleRead(n.id)}
                                      className={cn(
                                        'group relative flex cursor-pointer flex-col items-start border-l-4 px-3.5 py-2.5 text-xs transition-colors',
                                        visual.borderColor,
                                        !n.isRead
                                          ? 'bg-[#E8F3EF]/60 hover:bg-[#E8F3EF] dark:bg-white/5 dark:hover:bg-slate-800/50'
                                          : 'bg-[#FCFEFD] hover:bg-[#F2F7F5] dark:bg-transparent dark:hover:bg-zinc-800/40'
                                      )}
                                    >
                                      {/* Unread Dot ở góc phải trên */}
                                      {!n.isRead && (
                                        <span
                                          aria-label="Chưa đọc"
                                          className="absolute right-3.5 top-3 h-2 w-2 rounded-full bg-[#0F766E] shadow-sm ring-2 ring-white dark:bg-sky-400 dark:ring-zinc-900"
                                        />
                                      )}

                                      {/* Text Badge nhỏ bo góc ghi trạng thái + Thời gian */}
                                      <div className="flex w-full items-center justify-between gap-2 pr-4">
                                        <span
                                          className={cn(
                                            'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                                            visual.badgeClass
                                          )}
                                        >
                                          {visual.badgeLabel}
                                        </span>
                                        <span className="font-mono text-[10.5px] text-[#5C7871] dark:text-zinc-500">
                                          {new Date(n.created_at).toLocaleTimeString('vi-VN', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </div>

                                      {/* Tiêu đề thông báo */}
                                      <span
                                        className={cn(
                                          'mt-1 line-clamp-1 block text-xs',
                                          !n.isRead
                                            ? 'font-semibold text-[#11221E] dark:text-zinc-100'
                                            : 'font-medium text-[#415A54] dark:text-zinc-300'
                                        )}
                                      >
                                        {n.title}
                                      </span>

                                      {/* Nội dung thông báo nhấn mạnh Typography */}
                                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[#415A54] dark:text-zinc-400">
                                        {renderNotificationMessage(n.message)}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
              aria-label="Xem việc làm khác"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 sm:px-3 text-xs font-semibold text-[#415A54] transition-colors hover:bg-[#E8F3EF] hover:text-[#0F766E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Xem việc làm khác</span>
            </Link>

            {/* Avatar Dropdown Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-label="Menu tài khoản ứng viên"
                className="flex items-center gap-2 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] p-0.5 transition-all hover:ring-2 hover:ring-[#0F766E]/30 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <Avatar
                  name={currentCandidate?.full_name ?? 'Ứng viên'}
                  className="h-8 w-8 text-xs font-bold text-[#0F766E] bg-[#CBE8E2] dark:bg-teal-950 dark:text-teal-300 border-none"
                />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-1.5 shadow-xl overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="border-b border-[#D5E3DF] px-3 py-2.5 dark:border-zinc-800 bg-[#F2F7F5] dark:bg-zinc-950/50 rounded-t-lg">
                    <p className="text-xs font-bold text-[#11221E] dark:text-zinc-100 truncate">
                      {currentCandidate?.full_name ?? currentUserProfile?.fullName ?? 'Ứng viên Lạc Việt'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-400 truncate">
                      {currentCandidate?.email ?? currentUserEmail ?? 'minh.hoang@gmail.com'}
                    </p>
                    <span className="mt-1.5 inline-flex items-center rounded bg-[#CBE8E2] px-2 py-0.5 text-[10px] font-semibold text-[#0B4F4A] dark:bg-teal-950 dark:text-teal-300">
                      Ứng viên
                    </span>
                  </div>

                  <div className="pt-1 space-y-0.5">
                    <Link
                      href="/login"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#415A54] hover:bg-[#EFF5F3] hover:text-[#0F766E] dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-teal-400 transition-colors"
                    >
                      <User className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
                      <span>Đổi tài khoản</span>
                    </Link>

                    <div className="mt-1.5 pt-1.5 border-t border-[#D5E3DF] dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          logout();
                          router.push('/login');
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
                Email: <strong>{currentCandidate?.email ?? currentUserEmail ?? 'Chưa xác định'}</strong> · SĐT: {currentCandidate?.phone ?? 'Chưa cập nhật'}
              </p>
            </div>

            {/* Switcher ONLY if candidate applied for multiple positions under their own email */}
            {myApplications.length > 1 && (
              <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                <label className="text-[11px] font-semibold text-[#5C7871] dark:text-zinc-400">
                  Vị trí ứng tuyển của bạn ({myApplications.length}):
                </label>
                <select
                  value={currentCandidate?.id || ''}
                  onChange={(e) => {
                    const targetCand = myApplications.find((c) => c.id === e.target.value);
                    if (targetCand) {
                      setActiveCandidate(targetCand);
                    }
                  }}
                  className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 text-xs font-semibold text-[#11221E] shadow-2xs focus:border-[#0F766E] focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 cursor-pointer"
                >
                  {myApplications.map((cand) => (
                    <option key={cand.id} value={cand.id}>
                      {cand.candidate_code} - {cand.job_title} ({STAGE_META[cand.stage]?.label ?? cand.stage})
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                        Nộp ngày: {formatDateVN(currentCandidate.applied_date)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-lg font-bold text-[#11221E] dark:text-zinc-100">
                        {currentCandidate.job_title}
                      </h2>
                      <Badge
                        variant={STAGE_META[currentCandidate.stage]?.variant ?? 'teal'}
                        className="text-[11px] font-semibold px-2 py-0.5"
                      >
                        {STAGE_META[currentCandidate.stage]?.label ?? currentCandidate.stage}
                      </Badge>
                    </div>

                    <p className="text-xs text-[#415A54] dark:text-zinc-400">
                      {currentCandidate.department_name} · Mã vị trí: {currentCandidate.job_code}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-[#415A54] dark:text-zinc-400">
                      {activeCandidateMeta.approvedSalaryVnd ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-[#0F766E]/30 bg-[#E8F3EF] px-2 py-0.5 text-[#0B4F4A] dark:border-teal-500/30 dark:bg-teal-950/50 dark:text-teal-300">
                          <span>
                            {currentCandidate.stage === 'ONBOARDED'
                              ? 'Mức lương chính thức duyệt:'
                              : 'Mức lương Offer:'}
                          </span>
                          <strong className="font-bold">
                            {formatVND(activeCandidateMeta.approvedSalaryVnd)}
                          </strong>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span>Lương kỳ vọng:</span>
                          <strong className="font-semibold text-[#11221E] dark:text-zinc-200">
                            {formatVND(currentCandidate.expected_salary_vnd)}
                          </strong>
                        </span>
                      )}
                      <span className="hidden sm:inline text-[#C6D9D3] dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span>Nguồn nộp:</span>
                        <strong className="font-semibold text-[#11221E] dark:text-zinc-200">
                          {currentCandidate.source}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center">
                    {currentCandidate.stage === 'APPLIED' || currentCandidate.stage === 'AI_SCREENED' ? (
                      <button
                        type="button"
                        onClick={() => setActionModal('withdraw')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:border-rose-800 dark:hover:bg-rose-900/50 transition-all shadow-sm cursor-pointer"
                        title="Rút hồ sơ ứng tuyển vị trí này"
                      >
                        <XCircle className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                        Rút hồ sơ
                      </button>
                    ) : currentCandidate.stage === 'REJECTED' ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
                          <XCircle className="h-3.5 w-3.5" />
                          Đã rút hồ sơ
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const restored: Candidate = {
                              ...currentCandidate,
                              stage: 'APPLIED',
                            };
                            saveRuntimeCandidate(restored);
                            setActiveCandidate(restored);
                            setCandidates((prev) => prev.map((c) => (c.id === restored.id ? restored : c)));
                            showToast(
                              'Đã khôi phục hồ sơ',
                              'Hồ sơ của bạn đã được chuyển lại về trạng thái Đang xét duyệt (Hồ sơ mới nhận).',
                              'success'
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#0F766E]/40 bg-[#0F766E]/10 px-2.5 py-1 text-xs font-semibold text-[#0F766E] hover:bg-[#0F766E]/20 dark:border-teal-700/60 dark:bg-teal-950/40 dark:text-teal-300 transition-all cursor-pointer"
                          title="Khôi phục lại hồ sơ đã rút"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Khôi phục hồ sơ
                        </button>
                      </div>
                    ) : activeCandidateMeta.isEmployeeAccountActivated ? (
                      <button
                        type="button"
                        onClick={handleEnterEmployeeWorkspace}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition-all cursor-pointer"
                        title="Tài khoản nhân viên đã kích hoạt. Nhấp để vào không gian làm việc Nhân viên."
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        Đã kích hoạt tài khoản Nhân viên
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          showToast(
                            'Không thể rút hồ sơ',
                            'Hồ sơ của bạn đã bước vào vòng phỏng vấn/xét tuyển chuyên sâu (bước 3/5). Theo quy định, không thể tự rút hồ sơ trực tuyến ở giai đoạn này.',
                            'warning'
                          );
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-100/80 px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/70 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                        title="Hồ sơ đã bước vào giai đoạn phỏng vấn/xét tuyển chuyên sâu. Nhấp để xem chi tiết."
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                        Đang phỏng vấn/xét tuyển (Không thể rút)
                      </button>
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
                        ) : currentCandidate.stage === 'REJECTED' ? (
                          <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
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
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            currentCandidate.stage === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                              : activeCandidateMeta.isEmployeeAccountActivated
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : currentCandidate.stage === 'INTERVIEW' && currentCandidate.interview_schedule?.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : currentCandidate.stage === 'INTERVIEW' && currentCandidate.reschedule_request?.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                              : currentCandidate.stage === 'INTERVIEW' && !currentCandidate.interview_schedule?.date
                              ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                              : 'bg-[#0F766E]/15 text-[#0F766E] dark:bg-teal-400/20 dark:text-teal-300'
                          }`}>
                            {currentCandidate.stage === 'REJECTED'
                              ? 'Đã dừng'
                              : activeCandidateMeta.isEmployeeAccountActivated
                              ? 'Đã kích hoạt tài khoản Nhân viên'
                              : currentCandidate.stage === 'INTERVIEW' && currentCandidate.interview_schedule?.status === 'confirmed'
                              ? '✓ Đã chốt lịch'
                              : currentCandidate.stage === 'INTERVIEW' && currentCandidate.reschedule_request?.status === 'PENDING'
                              ? 'Chờ phản hồi'
                              : currentCandidate.stage === 'INTERVIEW' && !currentCandidate.interview_schedule?.date
                              ? 'Chờ lên lịch'
                              : 'Đang xử lý'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-300 leading-relaxed">
                          {currentCandidate.stage === 'REJECTED'
                            ? 'Hồ sơ đã được rút theo nguyện vọng của bạn. Bạn hiện có thể truy cập Cổng việc làm Lạc Việt để ứng tuyển vị trí mới bất kỳ lúc nào.'
                            : activeCandidateMeta.isEmployeeAccountActivated
                            ? 'Hồ sơ nhận việc của bạn đã được Phòng Nhân sự xác minh và kích hoạt tài khoản Nhân viên chính thức. Bạn có thể truy cập ngay vào không gian làm việc nội bộ.'
                            : currentCandidate.stage === 'INTERVIEW' && !currentCandidate.interview_schedule?.date
                            ? 'Bộ phận Tuyển dụng đang sắp xếp hội đồng phỏng vấn chuyên môn. Khi có lịch chính xác, bạn sẽ nhận được thông báo để xác nhận tham gia.'
                            : currentCandidate.stage === 'INTERVIEW' && currentCandidate.interview_schedule?.date
                            ? `Lịch phỏng vấn: ${currentCandidate.interview_schedule.time || '09:30'} ngày ${formatDateVN(currentCandidate.interview_schedule.date)} (${currentCandidate.interview_schedule.format || 'Online'}) - ${currentCandidate.interview_schedule.location_or_link || 'Đường dẫn sẽ gửi qua email'}.`
                            : STAGE_META[currentCandidate.stage]?.desc}
                        </p>
                        {(currentCandidate.stage === 'OFFER' ||
                          currentCandidate.stage === 'ONBOARDED') &&
                          activeCandidateMeta.approvedSalaryVnd && (
                            <p className="mt-1.5 text-xs font-medium text-[#0B4F4A] dark:text-teal-300">
                              Chế độ đãi ngộ được phê duyệt:{' '}
                              <strong>
                                {formatVND(activeCandidateMeta.approvedSalaryVnd)}/tháng
                              </strong>
                            </p>
                          )}
                        {currentCandidate.reschedule_request?.status === 'PENDING' && (
                          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                            Đã gửi yêu cầu dời sang: <strong>{currentCandidate.reschedule_request.proposed_time}</strong> · Lý do: {currentCandidate.reschedule_request.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Interactive Actions when in Rejected, Interview or Offer */}
                    {currentCandidate.stage === 'REJECTED' ? (
                      <div className="pt-2 sm:pt-0 shrink-0">
                        <Link href="/careers">
                          <Button variant="primary" size="sm" className="text-xs font-semibold shadow-sm">
                            <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                            Khám phá việc làm khác
                          </Button>
                        </Link>
                      </div>
                    ) : (currentCandidate.stage === 'INTERVIEW' || currentCandidate.stage === 'OFFER') && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 shrink-0">
                        {currentCandidate.stage === 'INTERVIEW' && (
                          <>
                            {!currentCandidate.interview_schedule?.date ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                                  <Clock className="h-3.5 w-3.5 text-zinc-400" />
                                  Đang chờ nhân sự lên lịch phỏng vấn
                                </span>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="text-xs font-semibold opacity-40 cursor-not-allowed"
                                  disabled
                                  title="Chưa thể xác nhận vì nhân sự chưa thiết lập thời gian phỏng vấn."
                                >
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  Xác nhận tham gia
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-[#C6D9D3] text-xs opacity-40 cursor-not-allowed"
                                  disabled
                                  title="Chưa thể đề xuất dời lịch khi chưa có lịch gốc."
                                >
                                  Đề xuất dời lịch
                                </Button>
                              </div>
                            ) : currentCandidate.reschedule_request?.status === 'PENDING' ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300 shadow-sm">
                                  <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                  Đã gửi đề xuất dời lịch, chờ HR phản hồi
                                </span>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="text-xs font-semibold opacity-50 cursor-not-allowed"
                                  disabled
                                >
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  Xác nhận tham gia
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-[#C6D9D3] text-xs opacity-50 cursor-not-allowed"
                                  disabled
                                >
                                  Đề xuất dời lịch
                                </Button>
                              </div>
                            ) : currentCandidate.interview_schedule?.status === 'confirmed' ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="bg-emerald-600 text-white hover:bg-emerald-600 text-xs font-semibold opacity-95 cursor-default shadow-sm"
                                  disabled
                                >
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  ✓ Đã xác nhận tham gia
                                </Button>
                              </div>
                            ) : (
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
                                  onClick={() => {
                                    setRescheduleReason('');
                                    const defaultDate = currentCandidate.interview_schedule?.date || new Date(Date.now() + 86400000).toISOString().split('T')[0];
                                    setRescheduleDate(defaultDate);
                                    setRescheduleTime(currentCandidate.interview_schedule?.time || '09:30');
                                    setActionModal('interview');
                                  }}
                                >
                                  Đề xuất dời lịch
                                </Button>
                              </>
                            )}
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

                  {/* Activated Employee Workspace CTA or Pre-boarding Portal Banner */}
                  {(activeCandidateMeta.isEmployeeAccountActivated ||
                    currentCandidate.stage === 'OFFER' ||
                    currentCandidate.stage === 'ONBOARDED') && (() => {
                    if (activeCandidateMeta.isEmployeeAccountActivated) {
                      return (
                        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-emerald-500/40 bg-emerald-50/70 p-4 dark:border-emerald-700/60 dark:bg-emerald-950/25 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm dark:bg-emerald-500">
                              <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-[#11221E] dark:text-zinc-100">
                                  Tài khoản Nhân viên chính thức đã sẵn sàng
                                </span>
                                <Badge variant="success">
                                  Đã kích hoạt tài khoản Nhân viên
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-[#315048] dark:text-zinc-300 leading-relaxed">
                                Hồ sơ Pre-boarding đã hoàn tất xác minh. Sử dụng thông tin tài khoản nội bộ dưới đây để làm việc trên hệ thống Lạc Việt HRM.
                              </p>
                              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                                {activeCandidateMeta.employeeCompanyEmail && (
                                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1 text-[#11221E] dark:border-emerald-800/70 dark:bg-zinc-900/90 dark:text-zinc-100">
                                    <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                                    <span className="text-[#415A54] dark:text-zinc-400">Email công ty:</span>
                                    <strong className="break-all font-semibold">
                                      {activeCandidateMeta.employeeCompanyEmail}
                                    </strong>
                                  </span>
                                )}
                                {activeCandidateMeta.employeeCode && (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1 text-[#11221E] dark:border-emerald-800/70 dark:bg-zinc-900/90 dark:text-zinc-100">
                                    <Briefcase className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                                    <span className="text-[#415A54] dark:text-zinc-400">Mã nhân viên:</span>
                                    <strong className="font-semibold">
                                      {activeCandidateMeta.employeeCode}
                                    </strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleEnterEmployeeWorkspace}
                            className="w-full shrink-0 text-xs font-semibold shadow-sm sm:w-auto"
                          >
                            <span>Vào không gian làm việc Nhân viên</span>
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                          </Button>
                        </div>
                      );
                    }

                    const matchedInvite = activeCandidateMeta.matchedInvite;
                    const inviteStatus = matchedInvite?.status ?? 'PENDING';

                    return (
                      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#0F766E]/35 bg-[#FCFEFD] p-4 dark:border-teal-400/25 dark:bg-[#121214] sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#CBE8E2] text-[#0B4F4A] dark:bg-teal-950/60 dark:text-teal-300">
                            <FileCheck2 className="h-4 w-4" strokeWidth={1.5} />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                                Thủ tục Khai báo Hồ sơ Nhận việc trực tuyến (Pre-boarding)
                              </span>
                              <Badge
                                variant={
                                  inviteStatus === 'VERIFIED'
                                    ? 'success'
                                    : inviteStatus === 'SUBMITTED'
                                      ? 'teal'
                                      : 'warning'
                                }
                              >
                                {inviteStatus === 'VERIFIED'
                                  ? 'HR đã xác minh'
                                  : inviteStatus === 'SUBMITTED'
                                    ? 'Đã nộp · Chờ xác minh'
                                    : 'Chờ khai báo'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                              Hoàn thiện trước thông tin CCCD, Mã số thuế TNCN, BHXH, Tài khoản ngân hàng nhận lương và Liên hệ khẩn cấp để chuẩn bị Hợp đồng thử việc.
                            </p>
                          </div>
                        </div>

                        <Link
                          href={activeCandidateMeta.preboardingHref}
                          className="shrink-0"
                        >
                          <Button variant="primary" size="sm" className="text-xs font-semibold">
                            <span>Khai báo Pre-boarding</span>
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                          </Button>
                        </Link>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-[#C6D9D3] bg-[#FCFEFD] p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <FileText className="mx-auto h-11 w-11 text-[#5C7871] opacity-60" />
            <h3 className="mt-3 text-base font-semibold text-[#11221E] dark:text-zinc-100">
              Chưa tìm thấy hồ sơ ứng tuyển gắn với phiên hiện tại
            </h3>
            <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
              Vui lòng đăng nhập bằng tài khoản ứng viên hoặc truy cập trang Tuyển dụng để ứng tuyển vị trí mới.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <Link href="/careers">
                <Button variant="primary" size="sm" className="text-xs font-semibold">
                  Khám phá việc làm ngay
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm" className="text-xs font-semibold">
                  Đăng nhập
                </Button>
              </Link>
            </div>
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
                ? 'Vui lòng cung cấp lý do và khung thời gian mới bạn có thể tham gia để Ban Tuyển dụng sắp xếp lại lịch.'
                : 'Hành động này sẽ gửi thông báo phản hồi chính thức đến Trưởng phòng Tuyển dụng.'}
            </DialogDescription>
          </DialogHeader>

          {actionModal === 'interview' ? (
            <div className="space-y-3 mt-3">
              <div>
                <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                  Lý do đề xuất dời lịch <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Nhập lý do cụ thể (trùng lịch công tác, việc cá nhân đột xuất...)"
                  className="mt-1.5 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                    Ngày đề xuất mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 py-2 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                    Khung giờ đề xuất mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 py-2 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>
          ) : (
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
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setActionModal(null)} className="text-xs">
              Hủy
            </Button>
            <Button
              variant={actionModal === 'withdraw' || actionModal === 'offer' ? 'danger' : 'primary'}
              size="sm"
              className="text-xs font-semibold"
              onClick={() => {
                if (actionModal === 'interview') handleSendReschedule();
                else if (actionModal === 'offer') handleOfferDecision('DECLINE');
                else if (actionModal === 'withdraw') handleWithdraw();
              }}
            >
              {actionModal === 'interview'
                ? 'Gửi yêu cầu dời lịch'
                : actionModal === 'withdraw'
                ? 'Xác nhận rút hồ sơ'
                : 'Xác nhận gửi phản hồi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
