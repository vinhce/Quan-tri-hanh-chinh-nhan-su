"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  X,
  MessageSquareText,
  Send,
  CalendarCheck,
  FileText,
  CheckCircle2,
  ArrowRight,
  Clock,
} from "lucide-react";
import { useApp, ROLE_DEFAULT_PROFILES } from "@/context/app-context";
import { ROLE_META } from "@/components/layout/sidebar";
import { recordAuditLog } from "@/lib/audit-logger";
import {
  mergeWithRuntimeRequests,
  pushNotification,
  saveRuntimeRequest,
} from "@/lib/runtime-store";
import type {
  AnnualLeaveBalance,
  CopilotSampleQA,
  NaturalLanguageLeaveDraft,
  RequestCategory,
} from "@/mock";
import type { ApprovalStep, LeaveOvertimeRequest } from "@/mock/types";
import { fetchAttendanceMock, fetchCopilotMock } from "@/lib/mock-fetcher";

function parseNaturalLanguageLeave(rawText: string): {
  category: RequestCategory;
  categoryLabel: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  reason: string;
  handoverTo: string;
  confidence: number;
} {
  const lower = rawText.toLowerCase();

  let category: RequestCategory = "ANNUAL_LEAVE";
  let categoryLabel = "Nghỉ phép năm hưởng nguyên lương";
  if (lower.includes("ốm") || lower.includes("bệnh") || lower.includes("khám")) {
    category = "SICK_LEAVE";
    categoryLabel = "Nghỉ ốm hưởng chế độ BHXH";
  } else if (
    lower.includes("từ xa") ||
    lower.includes("remote") ||
    lower.includes("wfh")
  ) {
    category = "REMOTE_WORK";
    categoryLabel = "Làm việc từ xa (Remote Work)";
  } else if (lower.includes("không lương")) {
    category = "UNPAID_LEAVE";
    categoryLabel = "Nghỉ việc riêng không hưởng lương";
  } else if (lower.includes("tăng ca") || lower.includes("ot") || lower.includes("thêm giờ")) {
    category = "OVERTIME";
    categoryLabel = "Đăng ký làm thêm giờ (OT)";
  }

  // Extract duration days
  const durationMatch = rawText.match(/(\d+(?:[.,]\d+)?)\s*(ngày|hôm|buổi)/i);
  let durationDays = 1;
  if (durationMatch) {
    const val = parseFloat(durationMatch[1].replace(",", "."));
    const unit = durationMatch[2].toLowerCase();
    durationDays = unit === "buổi" ? 0.5 : val;
  }

  // Extract dates DD/MM/YYYY
  const dateMatches = rawText.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g);
  let startDate = "20/11/2026";
  let endDate = durationDays > 1 ? "21/11/2026" : "20/11/2026";
  if (dateMatches && dateMatches.length >= 1) {
    startDate = dateMatches[0].length <= 5 ? `${dateMatches[0]}/2026` : dateMatches[0];
    endDate =
      dateMatches.length >= 2
        ? dateMatches[1].length <= 5
          ? `${dateMatches[1]}/2026`
          : dateMatches[1]
        : startDate;
  }

  // Extract reason
  let reason = "Giải quyết công việc cá nhân theo kế hoạch";
  const reasonMatch = rawText.match(/(?:vì|do|để|lý do)\s+([^,.;]+)/i);
  if (reasonMatch && reasonMatch[1].trim().length > 2) {
    const extracted = reasonMatch[1].trim();
    reason = extracted.charAt(0).toUpperCase() + extracted.slice(1);
  }

  // Extract handover person
  let handoverTo = "Lê Hoàng Nam (NV-2024-003)";
  const handoverMatch = rawText.match(/(?:bàn giao(?:\s+công việc|\s+trực tuyến)?\s+cho)\s+([^,.;]+)/i);
  if (handoverMatch && handoverMatch[1].trim().length > 2) {
    handoverTo = handoverMatch[1].trim();
  }

  const confidence = rawText.trim().length > 25 ? 97 : 89;

  return {
    category,
    categoryLabel,
    startDate,
    endDate,
    durationDays,
    reason,
    handoverTo,
    confidence,
  };
}

interface SubmittedLeaveItem {
  code: string;
  categoryLabel: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  reason: string;
  handoverTo: string;
  createdAt: string;
}

export function AiCopilotWidget() {
  const {
    isCopilotOpen,
    setIsCopilotOpen,
    role,
    currentUserProfile,
    showToast,
  } = useApp();
  const [activeTab, setActiveTab] = useState<"chat" | "nlp-leave">("nlp-leave");

  // Chat state
  const [chatHistory, setChatHistory] = useState<
    Array<{
      id: string;
      sender: "user" | "assistant";
      text: string;
      policy?: string;
      metrics?: Array<{ label: string; value: string }>;
    }>
  >([
    {
      id: "init-1",
      sender: "assistant",
      text: "Trợ lý AI HR Copilot đã sẵn sàng. Bạn có thể tra cứu chính sách nhân sự, công thức tính lương hoặc chuyển sang tab Tạo nhanh đơn nghỉ phép bằng ngôn ngữ tự nhiên.",
      policy: "Đồng bộ dữ liệu kỳ Tháng 11/2026",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  // Mock data loaded from /mock/copilot.json & /mock/attendance.json
  const baseRequestsRef = useRef<LeaveOvertimeRequest[]>([]);
  const [qaList, setQaList] = useState<CopilotSampleQA[]>([]);
  const [nlpPresets, setNlpPresets] = useState<NaturalLanguageLeaveDraft[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<AnnualLeaveBalance[]>([]);

  // Natural Language Leave state
  const [nlpText, setNlpText] = useState<string>("");
  const [submittedLeaves, setSubmittedLeaves] = useState<SubmittedLeaveItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCopilotMock()
      .then((data) => {
        if (cancelled) return;
        setQaList(data.MOCK_COPILOT_QA);
        setNlpPresets(data.MOCK_NL_LEAVE_DRAFTS);
        setNlpText((prev) => prev || data.MOCK_NL_LEAVE_DRAFTS[0]?.sample_input || "");
      })
      .catch(() => {
        // Keep empty presets if mock fetch fails
      });

    fetchAttendanceMock()
      .then((data) => {
        if (cancelled) return;
        setLeaveBalances(data.MOCK_ANNUAL_LEAVE_BALANCES ?? []);
        baseRequestsRef.current = data.MOCK_LEAVE_OVERTIME_REQUESTS ?? [];
      })
      .catch(() => {
        // Keep empty leave balances if mock fetch fails
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const parsedLeave = useMemo(() => parseNaturalLanguageLeave(nlpText), [nlpText]);
  const currentActor = ROLE_META[role];
  const defaultProfile = ROLE_DEFAULT_PROFILES[role];
  const displayName =
    currentUserProfile?.fullName || defaultProfile?.fullName || currentActor.empName;
  const empCode =
    currentUserProfile?.employee_code ||
    defaultProfile?.employee_code ||
    currentActor.empCode;

  if (!isCopilotOpen) return null;

  const buildPersonalLeaveReply = (
    balances: AnnualLeaveBalance[],
    policy?: string
  ): {
    text: string;
    policy?: string;
    metrics: Array<{ label: string; value: string }>;
  } => {
    const customName = currentUserProfile?.fullName?.trim();
    const isCustomNameWithoutCode =
      Boolean(customName) &&
      !currentUserProfile?.employee_code &&
      customName!.toLowerCase() !== defaultProfile.fullName.toLowerCase();

    const balance = isCustomNameWithoutCode
      ? balances.find(
          (b) => b.full_name.trim().toLowerCase() === customName!.toLowerCase()
        )
      : balances.find((b) => b.employee_code === empCode) ??
        balances.find(
          (b) => b.full_name.trim().toLowerCase() === displayName.trim().toLowerCase()
        );

    const resolvedPolicy =
      policy ?? "Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026";

    if (!balance) {
      return {
        text: `Theo dữ liệu chấm công cập nhật đến ngày 17/11/2026, hồ sơ ${displayName} (${empCode}) hiện chưa có bản ghi quỹ phép năm chi tiết trong bảng dữ liệu chấm công kỳ này. Theo Điều 14 Nội quy lao động, tiêu chuẩn phép năm cơ bản là 12 ngày/năm và phép chuyển giao từ năm cũ có hiệu lực sử dụng đến hết ngày 31/03 năm kế tiếp.`,
        policy: resolvedPolicy,
        metrics: [
          { label: "Nhân sự tra cứu", value: empCode },
          { label: "Đã nghỉ / Chờ duyệt", value: "Chưa đồng bộ" },
          { label: "Còn khả dụng", value: "Chưa đồng bộ" },
        ],
      };
    }

    const totalQuota = balance.total_entitled_days + balance.carried_over_days;
    const carryOverNote =
      balance.carried_over_days > 0
        ? ` cộng ${balance.carried_over_days} ngày phép chuyển giao từ năm ${balance.year - 1}`
        : "";
    const pendingNote =
      balance.pending_days > 0
        ? ` và đang có ${balance.pending_days} ngày phép chờ duyệt`
        : ", hiện chưa có đơn phép năm nào chờ duyệt";

    return {
      text: `Theo dữ liệu chấm công cập nhật đến ngày 17/11/2026, hồ sơ ${displayName} (${empCode}) có tổng tiêu chuẩn ${balance.total_entitled_days} ngày phép năm ${balance.year}${carryOverNote}. Bạn đã sử dụng ${balance.used_days} ngày${pendingNote}, số dư phép khả dụng còn lại là ${balance.remaining_days} ngày. Theo Điều 14 Nội quy lao động, phép chuyển giao từ năm cũ có hiệu lực sử dụng đến hết ngày 31/03 năm kế tiếp.`,
      policy: resolvedPolicy,
      metrics: [
        { label: `Tổng quỹ phép ${balance.year}`, value: `${totalQuota} ngày` },
        {
          label: "Đã nghỉ / Chờ duyệt",
          value: `${balance.used_days} / ${balance.pending_days} ngày`,
        },
        { label: "Còn khả dụng", value: `${balance.remaining_days} ngày` },
      ],
    };
  };

  const appendPersonalLeaveAnswer = (
    userText: string,
    balances: AnnualLeaveBalance[],
    policy?: string
  ) => {
    const reply = buildPersonalLeaveReply(balances, policy);
    setChatHistory((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: "user", text: userText },
      {
        id: `a-${Date.now() + 1}`,
        sender: "assistant",
        text: reply.text,
        policy: reply.policy,
        metrics: reply.metrics,
      },
    ]);
  };

  const handleSelectPromptQA = (qa: CopilotSampleQA) => {
    if (qa.id === "qa-001") {
      if (leaveBalances.length > 0) {
        appendPersonalLeaveAnswer(qa.user_query, leaveBalances, qa.referenced_policy);
        return;
      }
      void fetchAttendanceMock()
        .then((attData) => {
          const list = attData.MOCK_ANNUAL_LEAVE_BALANCES ?? [];
          setLeaveBalances(list);
          appendPersonalLeaveAnswer(qa.user_query, list, qa.referenced_policy);
        })
        .catch(() => {
          appendPersonalLeaveAnswer(qa.user_query, [], qa.referenced_policy);
        });
      return;
    }

    setChatHistory((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: "user", text: qa.user_query },
      {
        id: `a-${Date.now() + 1}`,
        sender: "assistant",
        text: qa.ai_response,
        policy: qa.referenced_policy,
        metrics: qa.metrics_cited,
      },
    ]);
  };

  const handleSendCustomChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const lower = trimmed.toLowerCase();
    const isLeaveBalanceQuery =
      (lower.includes("phép năm") ||
        lower.includes("ngày phép") ||
        lower.includes("số phép") ||
        lower.includes("số dư phép") ||
        (lower.includes("tra cứu") && lower.includes("phép")) ||
        ((lower.includes("còn lại") || lower.includes("còn bao nhiêu")) &&
          lower.includes("phép"))) &&
      !lower.includes("xin nghỉ");

    // Check if user typed a leave request inside chat
    if (
      !isLeaveBalanceQuery &&
      (lower.includes("xin nghỉ") || lower.includes("nghỉ phép"))
    ) {
      setNlpText(trimmed);
      setActiveTab("nlp-leave");
      setChatInput("");
      showToast(
        "Đã chuyển sang bộ phân tích đơn nghỉ phép",
        "AI HR Copilot đã bóc tách câu nhập của bạn thành biểu mẫu đơn từ",
        "default"
      );
      return;
    }

    const leaveQa = qaList.find((q) => q.id === "qa-001");
    const matched =
      (isLeaveBalanceQuery ? leaveQa : undefined) ??
      qaList.find(
        (q) =>
          lower.includes(q.prompt_label.toLowerCase().slice(0, 8)) ||
          q.prompt_label.toLowerCase().includes(lower)
      ) ??
      qaList[0];

    if (isLeaveBalanceQuery || matched?.id === "qa-001") {
      const policy =
        matched?.referenced_policy ??
        "Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026";
      setChatInput("");
      if (leaveBalances.length > 0) {
        appendPersonalLeaveAnswer(trimmed, leaveBalances, policy);
        return;
      }
      void fetchAttendanceMock()
        .then((attData) => {
          const list = attData.MOCK_ANNUAL_LEAVE_BALANCES ?? [];
          setLeaveBalances(list);
          appendPersonalLeaveAnswer(trimmed, list, policy);
        })
        .catch(() => {
          appendPersonalLeaveAnswer(trimmed, [], policy);
        });
      return;
    }

    setChatHistory((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: "user", text: trimmed },
      {
        id: `a-${Date.now() + 1}`,
        sender: "assistant",
        text: matched
          ? `Phản hồi cho ${displayName} (${empCode}): ${matched.ai_response}`
          : `Phản hồi cho ${displayName} (${empCode}): Dữ liệu chính sách đang được đồng bộ từ hệ thống.`,
        policy: matched?.referenced_policy,
        metrics: matched?.metrics_cited,
      },
    ]);
    setChatInput("");
  };

  const handleSubmitParsedLeave = () => {
    const toIsoDatePart = (ddmmyyyy: string): string => {
      const parts = ddmmyyyy.split("/");
      if (parts.length === 3) {
        const dd = parts[0].padStart(2, "0");
        const mm = parts[1].padStart(2, "0");
        const yyyy = parts[2];
        return `${yyyy}-${mm}-${dd}`;
      }
      return "2026-11-20";
    };

    const allRequests = mergeWithRuntimeRequests(baseRequestsRef.current);
    const maxCodeNum = allRequests.reduce((max, r) => {
      const m = /^REQ-202611-(\d+)$/.exec(r.request_code);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 87);
    const newCode = `REQ-202611-${String(maxCodeNum + 1).padStart(3, "0")}`;

    const deptName =
      currentUserProfile?.department ||
      defaultProfile?.department ||
      currentActor.department;
    const deptId =
      currentUserProfile?.department_id ||
      (deptName === "Phòng Nhân sự & Hành chính"
        ? "dept-hr"
        : deptName === "Phòng Tài chính - Kế toán"
          ? "dept-fin"
          : deptName === "Khối Kinh doanh"
            ? "dept-sales"
            : deptName === "Ban Điều hành"
              ? "dept-board"
              : "dept-tech");

    const isDeptMgr = role === "DEPT_MANAGER";
    const isOvertime = parsedLeave.category === "OVERTIME";
    const needsDirector =
      (!isOvertime && parsedLeave.durationDays >= 3) ||
      parsedLeave.category === "UNPAID_LEAVE" ||
      parsedLeave.category === "OVERSEAS_BUSINESS_TRIP";

    const steps: ApprovalStep[] = [
      {
        step_order: 1,
        role: "DEPT_MANAGER",
        label: "Cấp 1 · Trưởng bộ phận duyệt",
        status: isDeptMgr ? "SKIPPED" : "PENDING",
        actor_name: "Lê Hoàng Nam",
        note: isDeptMgr ? "Tự động bỏ qua do người gửi là Trưởng bộ phận" : undefined,
      },
      {
        step_order: 2,
        role: "HR_MANAGER",
        label: "Cấp 2 · Trưởng phòng Nhân sự kiểm tra",
        status: "PENDING",
        actor_name: "Trần Thị Bích Ngọc",
      },
    ];
    if (needsDirector) {
      steps.push({
        step_order: 3,
        role: "DIRECTOR",
        label: "Cấp 3 · Giám đốc phê duyệt",
        status: "PENDING",
        actor_name: "Trần Quốc Việt",
      });
    }

    const startIsoDate = toIsoDatePart(parsedLeave.startDate);
    const endIsoDate = toIsoDatePart(parsedLeave.endDate);
    const firstStepRole: "DEPT_MANAGER" | "HR_MANAGER" = isDeptMgr
      ? "HR_MANAGER"
      : "DEPT_MANAGER";

    const newReq: LeaveOvertimeRequest = {
      id: `req-copilot-${Date.now()}`,
      request_code: newCode,
      employee_id: "emp-004",
      employee_code: empCode,
      full_name: displayName,
      department_name: deptName,
      position_name: defaultProfile?.title || currentActor.position,
      requester_role: role,
      request_category: parsedLeave.category,
      category_label: parsedLeave.categoryLabel,
      start_datetime: `${startIsoDate}T08:30:00+07:00`,
      end_datetime: `${endIsoDate}T17:30:00+07:00`,
      duration_days_or_hours: parsedLeave.durationDays,
      duration_unit: isOvertime ? "GIO" : "NGAY",
      reason: parsedLeave.reason,
      handover_to_name: parsedLeave.handoverTo || null,
      approver_id: isDeptMgr ? "emp-002" : "emp-003",
      approver_name: isDeptMgr ? "Trần Thị Bích Ngọc" : "Lê Hoàng Nam",
      approval_status: "PENDING",
      status: "PENDING",
      current_step_role: firstStepRole,
      approval_steps: steps,
      leave_deducted: false,
      created_at: new Date().toISOString(),
      responded_at: null,
      source: "AI_COPILOT",
    };

    saveRuntimeRequest(newReq);
    recordAuditLog({
      actor_name: displayName,
      actor_code: empCode,
      actor_role: role,
      action: "CREATE_REQUEST",
      module: "Đơn từ & Phê duyệt",
      target: `${newReq.request_code} (${displayName})`,
      detail: `Tạo đơn qua AI HR Copilot: ${parsedLeave.categoryLabel} (${parsedLeave.durationDays} ${isOvertime ? "giờ" : "ngày"})`,
    });
    pushNotification({
      title: `Đơn mới ${newReq.request_code} từ AI HR Copilot`,
      message: `${displayName} gửi đơn ${parsedLeave.categoryLabel.toLowerCase()} (${parsedLeave.durationDays} ${isOvertime ? "giờ" : "ngày"}: ${parsedLeave.startDate} đến ${parsedLeave.endDate}).`,
      category: "LEAVE_REQUEST",
      target_roles: ["DEPT_MANAGER", "HR_MANAGER"],
      target_department_id: deptId,
      nav_id: "leaves",
      entity_id: newReq.request_code,
    });

    const item: SubmittedLeaveItem = {
      code: newReq.request_code,
      categoryLabel: parsedLeave.categoryLabel,
      durationDays: parsedLeave.durationDays,
      startDate: parsedLeave.startDate,
      endDate: parsedLeave.endDate,
      reason: parsedLeave.reason,
      handoverTo: parsedLeave.handoverTo,
      createdAt: "Vừa xong",
    };

    setSubmittedLeaves((prev) => [item, ...prev]);
    showToast(
      `Đã tạo đơn ${newReq.request_code} thành công`,
      `${parsedLeave.categoryLabel} (${parsedLeave.durationDays} ngày: ${parsedLeave.startDate} → ${parsedLeave.endDate}) — Đã chuyển người duyệt`,
      "success"
    );
  };

  return (
    <aside
      aria-label="Trợ lý AI HR Copilot"
      className="fixed bottom-4 right-4 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_8px_24px_rgba(17,34,30,0.12)] dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#C6D9D3] bg-[#E4EEEB] px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-950">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#C6D9D3] bg-[#FCFEFD] text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
            <MessageSquareText className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                AI HR Copilot
              </span>
              <span className="rounded border border-[#C6D9D3] bg-[#FCFEFD] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#0B4F4A] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
                {empCode}
              </span>
            </div>
            <p className="text-[11px] text-[#415A54] dark:text-zinc-400">
              Trợ lý tra cứu quy chế & bóc tách đơn từ ngôn ngữ tự nhiên
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCopilotOpen(false)}
          aria-label="Đóng AI HR Copilot"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#415A54] transition-colors hover:bg-[#D8E6E2] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-2 gap-1 border-b border-[#C6D9D3] bg-[#E4EEEB] p-1.5 dark:border-zinc-800/80 dark:bg-zinc-950/60">
        <button
          type="button"
          onClick={() => setActiveTab("nlp-leave")}
          className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs transition-colors ${
            activeTab === "nlp-leave"
              ? "border border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400"
              : "border border-transparent font-medium text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <CalendarCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Tạo nhanh đơn nghỉ phép</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs transition-colors ${
            activeTab === "chat"
              ? "border border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400"
              : "border border-transparent font-medium text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Hỏi đáp chính sách</span>
        </button>
      </div>

      {/* TAB 1: NATURAL LANGUAGE LEAVE PARSER */}
      {activeTab === "nlp-leave" && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="copilot-nlp-input"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Nhập câu yêu cầu nghỉ phép bằng tiếng Việt tự nhiên
              </label>
              <span className="font-mono text-[11px] font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                Độ khớp: {parsedLeave.confidence}%
              </span>
            </div>

            <textarea
              id="copilot-nlp-input"
              rows={3}
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              placeholder="Ví dụ: Xin nghỉ phép năm 2 ngày từ 20/11/2026 đến 21/11/2026 vì việc gia đình..."
              className="mt-1.5 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs leading-relaxed text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400"
            />

            {/* Preset buttons */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nlpPresets.map((preset, index) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setNlpText(preset.sample_input)}
                  className="rounded-md border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-1 text-[11px] text-[#415A54] transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] hover:text-[#0B4F4A] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-teal-400"
                >
                  Mẫu {index + 1}: {preset.parsed_category_label.split(" ")[0]}{" "}
                  {preset.parsed_duration_days} ngày
                </button>
              ))}
            </div>
          </div>

          {/* Live Parsed Result Box */}
          <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3.5 dark:border-zinc-800/80 dark:bg-zinc-950/70">
            <div className="flex items-center justify-between border-b border-[#C6D9D3] pb-2 text-xs dark:border-zinc-800">
              <span className="font-semibold text-[#11221E] dark:text-zinc-200">
                Kết quả AI bóc tách trường dữ liệu
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-500">
                {parsedLeave.category}
              </span>
            </div>

            <dl className="mt-2.5 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#415A54] dark:text-zinc-400">Nhân sự lập đơn:</dt>
                <dd className="font-semibold text-[#11221E] dark:text-zinc-100">
                  {displayName}{" "}
                  <span className="font-mono font-normal tabular-nums text-[#0F766E] dark:text-teal-400">
                    ({empCode})
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#415A54] dark:text-zinc-400">Loại đơn:</dt>
                <dd className="font-medium text-[#0F766E] dark:text-teal-400">
                  {parsedLeave.categoryLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#415A54] dark:text-zinc-400">Thời gian nghỉ:</dt>
                <dd className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                  {parsedLeave.startDate} → {parsedLeave.endDate} (
                  {parsedLeave.durationDays} ngày)
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#415A54] dark:text-zinc-400">Lý do trích xuất:</dt>
                <dd className="text-right font-medium text-[#11221E] dark:text-zinc-200">
                  {parsedLeave.reason}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#415A54] dark:text-zinc-400">Bàn giao cho:</dt>
                <dd className="font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-300">
                  {parsedLeave.handoverTo}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={handleSubmitParsedLeave}
              className="mt-3.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-3 text-xs font-medium text-[#FCFEFD] transition-colors hover:bg-[#0D5F58] dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
              <span>Gửi đơn phê duyệt ngay</span>
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Recently created requests in current session */}
          {submittedLeaves.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-[#415A54] dark:text-zinc-400">
                <span>Đơn vừa khởi tạo trong phiên</span>
                <span className="font-mono tabular-nums">
                  {submittedLeaves.length} đơn
                </span>
              </div>
              <div className="space-y-1.5">
                {submittedLeaves.map((item) => (
                  <div
                    key={item.code}
                    className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                        {item.code}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-[#C6D9D3] bg-[#F2F7F5] px-1.5 py-0.5 font-mono text-[10px] text-[#415A54] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <Clock className="h-3 w-3" strokeWidth={1.5} />
                        <span>Chờ duyệt · {item.createdAt}</span>
                      </span>
                    </div>
                    <p className="mt-1 font-medium text-[#11221E] dark:text-zinc-100">
                      {item.categoryLabel} ·{" "}
                      <span className="font-mono tabular-nums">
                        {item.durationDays} ngày
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">
                      Lý do: {item.reason} · Bàn giao: {item.handoverTo}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SMART POLICY Q&A */}
      {activeTab === "chat" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {/* Suggested question chips */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">
                Câu hỏi nghiệp vụ gợi ý theo vai trò:
              </p>
              <div className="flex flex-col gap-1.5">
                {qaList.map((qa) => (
                  <button
                    key={qa.id}
                    type="button"
                    onClick={() => handleSelectPromptQA(qa)}
                    className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] px-3 py-2 text-left text-xs text-[#11221E] transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                  >
                    {qa.prompt_label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation feed */}
            <div className="space-y-2.5 pt-2">
              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl border p-3 text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "ml-6 border-[#0F766E]/35 bg-[#CBE8E2]/65 text-[#11221E] dark:border-teal-400/30 dark:bg-teal-950/20 dark:text-zinc-100"
                      : "mr-2 border-[#C6D9D3] bg-[#F2F7F5] text-[#11221E] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                  }`}
                >
                  <p>{msg.text}</p>
                  {msg.metrics && msg.metrics.length > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-[#C6D9D3] pt-2 dark:border-zinc-800">
                      {msg.metrics.map((m) => (
                        <div
                          key={m.label}
                          className="rounded border border-[#D5E3DF] bg-[#FCFEFD] p-1.5 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="text-[10px] text-[#5C7871] dark:text-zinc-500">
                            {m.label}
                          </div>
                          <div className="font-mono text-[11px] font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                            {m.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.policy && (
                    <div className="mt-1.5 font-mono text-[10px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                      Nguồn: {msg.policy}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSendCustomChat}
            className="flex items-center gap-2 border-t border-[#C6D9D3] bg-[#E4EEEB] p-3 dark:border-zinc-800/80 dark:bg-zinc-950"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Đặt câu hỏi quy chế hoặc gõ xin nghỉ phép..."
              className="h-9 flex-1 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400"
            />
            <button
              type="submit"
              aria-label="Gửi câu hỏi"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0F766E] text-[#FCFEFD] transition-colors hover:bg-[#0D5F58] dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
            >
              <Send className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
