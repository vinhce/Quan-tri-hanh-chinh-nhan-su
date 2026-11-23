'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  HelpCircle,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp, type RoleCode } from '@/context/app-context';
import {
  getAllRuntimeEmployees,
  getDailyAttendances,
  getLeaveBalances,
  getPayrollRecords,
  mergeWithRuntimeRequests,
} from '@/lib/runtime-store';
import { cn, formatNumberVN } from '@/lib/utils';
import { MOCK_LEAVE_OVERTIME_REQUESTS } from '@/mock/attendance';
import {
  MOCK_COPILOT_QA,
  parseNaturalLanguageLeavePrompt,
} from '@/mock/copilot';

interface CopilotMessage {
  id: string;
  userQuery: string;
  aiResponse: string;
  referencedPolicy?: string;
}

const ROLE_DEFAULT_CODE: Record<RoleCode, string> = {
  SUPER_ADMIN: 'NV-2024-001',
  DIRECTOR: 'NV-2024-000',
  HR_MANAGER: 'NV-2024-002',
  DEPT_MANAGER: 'NV-2024-003',
  EMPLOYEE: 'NV-2024-004',
  CANDIDATE: 'NV-2024-004',
};

function normalizeViText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function AiCopilotWidget() {
  const { role, currentUserEmail, currentUserProfile } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [query, setQuery] = useState('');
  const [activeQA, setActiveQA] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && !isMinimized && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isOpen, isMinimized]);

  const resolveCurrentEmployee = () => {
    const allEmps = getAllRuntimeEmployees();
    const targetCode = currentUserProfile?.employee_code?.trim();
    if (targetCode) {
      const byCode = allEmps.find(
        (e) => e.employee_code.toLowerCase() === targetCode.toLowerCase()
      );
      if (byCode) return byCode;
    }
    if (currentUserEmail) {
      const byEmail = allEmps.find(
        (e) => e.email.toLowerCase() === currentUserEmail.trim().toLowerCase()
      );
      if (byEmail) return byEmail;
    }
    const fallbackCode = ROLE_DEFAULT_CODE[role] ?? 'NV-2024-001';
    return (
      allEmps.find((e) => e.employee_code === fallbackCode) ?? allEmps[0] ?? null
    );
  };

  const buildDynamicAnswer = (
    rawPrompt: string,
    presetId?: string
  ): CopilotMessage => {
    const emp = resolveCurrentEmployee();
    const empName =
      currentUserProfile?.fullName || emp?.full_name || 'Nguyễn Văn An';
    const empCode =
      currentUserProfile?.employee_code || emp?.employee_code || 'NV-2024-001';

    const allBalances = getLeaveBalances(2026);
    const balance = allBalances.find(
      (b) =>
        (emp && b.employee_id === emp.id) ||
        b.employee_code.toLowerCase() === empCode.toLowerCase()
    );

    const payrolls = getPayrollRecords()
      .filter(
        (p) =>
          (emp && p.employee_id === emp.id) ||
          p.employee_code.toLowerCase() === empCode.toLowerCase()
      )
      .sort((a, b) => b.period_month.localeCompare(a.period_month));
    const latestPayslip = payrolls[0];

    const dailyList = getDailyAttendances('2026-11', empCode);
    const latestAttendance = dailyList[0];

    const allEmployees = getAllRuntimeEmployees();
    const allRequests = mergeWithRuntimeRequests(MOCK_LEAVE_OVERTIME_REQUESTS);
    const pendingReqs = allRequests.filter(
      (r) => r.approval_status === 'PENDING' || r.status === 'PENDING'
    );

    const norm = normalizeViText(rawPrompt);
    const hasLeave =
      presetId === 'qa-001' ||
      norm.includes('phep') ||
      norm.includes('ngay nghi');
    const hasSalary =
      presetId === 'qa-002' ||
      norm.includes('luong') ||
      norm.includes('thue') ||
      norm.includes('bhxh');
    const isLeaveDraft =
      !presetId &&
      (norm.includes('xin nghi') ||
        norm.includes('wfh') ||
        norm.includes('tu xa') ||
        norm.includes('nghi om'));

    if (isLeaveDraft) {
      const draft = parseNaturalLanguageLeavePrompt(rawPrompt);
      return {
        id: `msg-${Date.now()}`,
        userQuery: rawPrompt,
        aiResponse: `Đã phân tích nháp đơn cho ${empName} (${empCode}): Loại "${draft.parsed_category_label}", từ ${draft.parsed_start_date} đến ${draft.parsed_end_date} (${draft.parsed_duration_days} ngày). Lý do: "${draft.parsed_reason}". Bạn có thể vào mục Đơn từ & Phê duyệt -> Tạo đơn mới để gửi duyệt ngay.`,
        referencedPolicy: 'Trợ lý tạo đơn từ Ngôn ngữ tự nhiên (NLU)',
      };
    }

    if (hasLeave && hasSalary) {
      const leaveText = balance
        ? `Quỹ phép năm 2026 còn khả dụng ${balance.remaining_days} ngày (tổng ${balance.total_entitled_days} + ${balance.carried_over_days} ngày chuyển giao, đã dùng ${balance.used_days} ngày).`
        : `Hồ sơ hiện chưa kích hoạt quỹ phép chính thức (nhân sự thử việc).`;
      const payText = latestPayslip
        ? `Phiếu lương ${latestPayslip.payslip_code} (kỳ ${latestPayslip.period_month}): Gross ${formatNumberVN(latestPayslip.gross_salary_vnd)} ₫, BHXH/YT/TN ${formatNumberVN(latestPayslip.total_insurance_employee_vnd)} ₫, Thuế TNCN ${formatNumberVN(latestPayslip.pit_tax_vnd)} ₫, Thực nhận Net ${formatNumberVN(latestPayslip.net_salary_vnd)} ₫.`
        : `Chưa có phiếu lương chốt trong kỳ 11/2026.`;
      return {
        id: `msg-${Date.now()}`,
        userQuery: rawPrompt,
        aiResponse: `Thông tin tổng hợp của ${empName} (${empCode}): ${leaveText} ${payText}`,
        referencedPolicy:
          'Điều 14 Quy chế Nghỉ phép & Phụ lục 02 Thuế TNCN 2026',
      };
    }

    if (hasLeave) {
      return {
        id: `msg-${Date.now()}`,
        userQuery: rawPrompt,
        aiResponse: balance
          ? `Hồ sơ ${empName} (${empCode}) có ${balance.total_entitled_days} ngày phép năm 2026 cộng ${balance.carried_over_days} ngày phép tồn chuyển giao. Đã sử dụng ${balance.used_days} ngày (đang chờ duyệt ${balance.pending_days} ngày); số dư phép khả dụng còn lại là ${balance.remaining_days} ngày. Theo Điều 14 Nội quy lao động, phép tồn từ năm cũ có hiệu lực đến hết 31/03 năm kế tiếp.`
          : `Hồ sơ ${empName} (${empCode}) hiện ở trạng thái thử việc nên chưa kích hoạt quỹ 12 ngày phép năm (tự động cấp khi chuyển chính thức).`,
        referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
      };
    }

    if (hasSalary) {
      return {
        id: `msg-${Date.now()}`,
        userQuery: rawPrompt,
        aiResponse: latestPayslip
          ? `Phiếu lương ${latestPayslip.payslip_code} (${latestPayslip.period_month}) của ${empName} (${empCode}): Thu nhập Gross ${formatNumberVN(latestPayslip.gross_salary_vnd)} ₫; bảo hiểm bắt buộc (10.5%) ${formatNumberVN(latestPayslip.total_insurance_employee_vnd)} ₫; giảm trừ bản thân ${formatNumberVN(latestPayslip.personal_deduction_vnd)} ₫ & người phụ thuộc ${formatNumberVN(latestPayslip.dependent_deduction_vnd)} ₫; Thuế TNCN ${formatNumberVN(latestPayslip.pit_tax_vnd)} ₫ -> Thực nhận Net ${formatNumberVN(latestPayslip.net_salary_vnd)} ₫.`
          : `Hiện chưa tìm thấy dữ liệu phiếu lương của ${empName} (${empCode}) trong kỳ 11/2026.`,
        referencedPolicy:
          'Phụ lục 02 - Quy chế Tiền lương & Khấu trừ Thuế TNCN lũy tiến',
      };
    }

    if (
      presetId === 'qa-003' ||
      norm.includes('burnout') ||
      norm.includes('hop dong') ||
      norm.includes('het han')
    ) {
      const qa3 = MOCK_COPILOT_QA.find((q) => q.id === 'qa-003');
      return {
        id: `msg-${Date.now()}`,
        userQuery: rawPrompt,
        aiResponse:
          qa3?.ai_response ||
          `Đang theo dõi ${allEmployees.length} hồ sơ nhân sự và cảnh báo tái ký hợp đồng.`,
        referencedPolicy: qa3?.referenced_policy,
      };
    }

    if (
      presetId === 'qa-004' ||
      norm.includes('don cho') ||
      norm.includes('ung vien') ||
      norm.includes('tuyen dung')
    ) {
      return {
        id: `msg-${Date.now()}`,
        userQuery: rawPrompt,
        aiResponse: `Hệ thống hiện có ${pendingReqs.length} đơn nghỉ/OT/giải trình đang chờ phê duyệt ở các cấp. Bạn có thể mở mục Đơn từ & Phê duyệt hoặc Tuyển dụng & ATS để xử lý ngay.`,
        referencedPolicy: 'SLA Phê duyệt Nội bộ (tối đa 24 giờ làm việc)',
      };
    }

    return {
      id: `msg-${Date.now()}`,
      userQuery: rawPrompt,
      aiResponse: `Xin chào ${empName} (${empCode}). Hệ thống ghi nhận ${allEmployees.length} hồ sơ nhân sự, ${pendingReqs.length} đơn đang chờ duyệt${balance ? `, quỹ phép còn ${balance.remaining_days} ngày` : ''}${latestAttendance ? `, chấm công gần nhất ngày ${latestAttendance.date}: ${latestAttendance.workday_value} công (${latestAttendance.status === 'MISSING_PUNCH' ? 'Quên chấm công' : latestAttendance.status})` : ''}. Bạn có thể hỏi cụ thể về "tồn phép", "phiếu lương / thuế", "đơn chờ duyệt" hoặc gõ "Xin nghỉ phép..." để lập đơn nhanh.`,
      referencedPolicy: 'Trợ lý Dữ liệu Live Lạc Việt HRM v2.4',
    };
  };

  const handleAskPreset = (qa: (typeof MOCK_COPILOT_QA)[number]) => {
    setActiveQA(qa.id);
    const answer = buildDynamicAnswer(qa.user_query, qa.id);
    setMessages((prev) => [...prev, answer]);
  };

  const handleSubmitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setActiveQA(null);
    const answer = buildDynamicAnswer(trimmed);
    setMessages((prev) => [...prev, answer]);
    setQuery('');
  };

  if (!isOpen) {
    return (
      <aside
        aria-label="Khung trợ lý AI"
        className="fixed bottom-4 right-4 z-30"
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          aria-label="Mở Trợ lý AI Lạc Việt Copilot"
          className="flex h-11 items-center gap-2 rounded-full border border-[#0F766E]/40 bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#0D5F58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          <Sparkles className="h-4 w-4 animate-spin-slow text-amber-300" />
          <span className="hidden sm:inline">Trợ lý AI</span>
        </button>
      </aside>
    );
  }

  if (isMinimized) {
    return (
      <aside
        aria-label="Khung trợ lý AI thu nhỏ"
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      >
        <Sparkles className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
        <span className="text-xs font-medium text-[#11221E] dark:text-zinc-200">
          Trợ lý AI
        </span>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          aria-label="Mở rộng trợ lý"
          className="p-1 text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Đóng trợ lý"
          className="p-1 text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <X className="h-3 w-3" />
        </button>
      </aside>
    );
  }

  const activeEmp = resolveCurrentEmployee();
  const displayUser =
    currentUserProfile?.fullName || activeEmp?.full_name || 'Nhân sự Lạc Việt';
  const displayCode =
    currentUserProfile?.employee_code || activeEmp?.employee_code || 'NV';

  return (
    <aside
      aria-label="Trợ lý AI Lạc Việt Copilot"
      className="fixed bottom-4 right-4 z-40 flex h-[480px] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border-b border-[#C6D9D3] bg-[#E4EEEB] px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0F766E] text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#11221E] dark:text-zinc-100">
              Lạc Việt Copilot
            </div>
            <div className="text-[10px] text-[#5C7871] dark:text-zinc-400">
              {displayUser} ({displayCode})
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            aria-label="Thu nhỏ cửa sổ trợ lý"
            className="rounded p-1 text-[#5C7871] hover:bg-[#D8E6E2] dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Đóng cửa sổ trợ lý"
            className="rounded p-1 text-[#5C7871] hover:bg-[#D8E6E2] dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body: QA Suggestions & Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <div className="rounded-xl bg-[#F2F7F5] p-3 text-[#415A54] dark:bg-zinc-800/50 dark:text-zinc-300">
          Xin chào <b>{displayUser}</b>! Tôi có thể tra cứu quỹ phép năm, giải thích phiếu lương/thuế TNCN, tóm tắt đơn chờ duyệt hoặc tạo nháp đơn xin nghỉ theo dữ liệu live của bạn.
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-[#5C7871] dark:text-zinc-400">
            Câu hỏi gợi ý nhanh:
          </div>
          {MOCK_COPILOT_QA.slice(0, 3).map((qa) => (
            <button
              key={qa.id}
              type="button"
              onClick={() => handleAskPreset(qa)}
              className={cn(
                'w-full rounded-lg border p-2 text-left text-xs transition-colors',
                activeQA === qa.id
                  ? 'border-[#0F766E] bg-[#E8F3EF] font-semibold text-[#11221E] dark:border-teal-400 dark:bg-teal-950/40 dark:text-zinc-100'
                  : 'border-[#D5E3DF] bg-white text-[#415A54] hover:bg-[#F2F7F5] dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300'
              )}
            >
              <div className="flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" />
                <span className="line-clamp-2">{qa.prompt_label}</span>
              </div>
            </button>
          ))}
        </div>

        {messages.map((msg) => (
          <div
            key={msg.id}
            data-testid="copilot-message-card"
            className="space-y-2 rounded-xl border border-[#C6D9D3] bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-800"
          >
            <div className="font-semibold text-[#11221E] dark:text-zinc-100">
              {msg.userQuery}
            </div>
            <div className="text-[11px] leading-relaxed text-[#415A54] dark:text-zinc-300">
              {msg.aiResponse}
            </div>
            {msg.referencedPolicy && (
              <div className="text-[10px] font-medium text-[#0F766E] dark:text-teal-400">
                Tham chiếu: {msg.referencedPolicy}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer input */}
      <div className="rounded-b-2xl border-t border-[#C6D9D3] bg-[#F8FAF9] p-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
        <form onSubmit={handleSubmitQuery} className="flex items-center gap-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập câu hỏi phép năm, lương, quy chế..."
            aria-label="Nhập câu hỏi cho Trợ lý AI"
            className="flex-1 rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1.5 text-xs text-[#11221E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            aria-label="Gửi câu hỏi Copilot"
            className="h-8 px-2.5"
            disabled={!query.trim()}
          >
            <Send className="h-3 w-3" />
          </Button>
        </form>
      </div>
    </aside>
  );
}
