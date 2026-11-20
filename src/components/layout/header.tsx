"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Menu,
  Sun,
  Moon,
  Bell,
  BellOff,
  Briefcase,
  CheckCheck,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { useApp, ROLE_DEFAULT_PROFILES } from "@/context/app-context";
import { NAV_ITEMS } from "@/components/layout/sidebar";
import {
  HRM_RUNTIME_EVENT,
  getNotificationsForActor,
  markNotificationRead,
  markAllNotificationsRead,
  resetAllDemoRuntimeData,
} from "@/lib/runtime-store";
import type { HrmNotification, NotificationCategory } from "@/mock/types";

interface HeaderProps {
  onOpenMobileMenu?: () => void;
}

type NotificationFilter = "all" | "unread";
type ActorNotification = HrmNotification & { isRead: boolean };

type TimeGroupKey = "Hôm nay" | "Hôm qua" | "Tuần trước" | "Cũ hơn";
const TIME_GROUP_ORDER: TimeGroupKey[] = [
  "Hôm nay",
  "Hôm qua",
  "Tuần trước",
  "Cũ hơn",
];

function getTimeGroupKey(isoInput: string): TimeGroupKey {
  const d = new Date(isoInput);
  if (Number.isNaN(d.getTime())) return "Cũ hơn";

  const now = new Date();
  const dateMid = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  ).getTime();
  const nowMid = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const diffDays = Math.round((nowMid - dateMid) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  if (diffDays <= 7) return "Tuần trước";
  return "Cũ hơn";
}

interface NotificationVisualMeta {
  borderColor: string;
  badgeLabel: string;
  badgeClass: string;
}

function getNotificationVisualMeta(item: {
  title: string;
  message: string;
  category?: NotificationCategory;
}): NotificationVisualMeta {
  const text = `${item.title} ${item.message}`.toLowerCase();

  // 1. Phỏng vấn (Sky / Blue)
  if (
    text.includes("phỏng vấn") ||
    text.includes("interview") ||
    text.includes("lịch hẹn")
  ) {
    return {
      borderColor: "border-l-sky-500",
      badgeLabel: "Phỏng vấn",
      badgeClass:
        "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-300",
    };
  }

  // 2. Sàng lọc (Amber)
  if (
    text.includes("sàng lọc") ||
    text.includes("sơ loại") ||
    text.includes("screened") ||
    text.includes("ai_screened") ||
    text.includes("hồ sơ mới")
  ) {
    return {
      borderColor: "border-l-amber-500",
      badgeLabel: "Sàng lọc",
      badgeClass:
        "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300",
    };
  }

  // 3. Đề nghị nhận việc (Violet)
  if (
    text.includes("đề nghị nhận việc") ||
    text.includes("đề nghị việc") ||
    text.includes("thư mời nhận việc") ||
    text.includes("offer")
  ) {
    return {
      borderColor: "border-l-violet-500",
      badgeLabel: "Đề nghị việc",
      badgeClass:
        "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-violet-300",
    };
  }

  // 4. Từ chối / Thu hồi (Rose)
  if (
    text.includes("từ chối") ||
    text.includes("thu hồi") ||
    text.includes("rút hồ sơ") ||
    text.includes("đã loại") ||
    text.includes("bác bỏ") ||
    text.includes("rejected") ||
    text.includes("hủy")
  ) {
    return {
      borderColor: "border-l-rose-500",
      badgeLabel:
        text.includes("thu hồi") || text.includes("rút hồ sơ")
          ? "Thu hồi"
          : "Từ chối",
      badgeClass:
        "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-300",
    };
  }

  // 5. Đã nhận việc / Duyệt (Emerald)
  if (
    text.includes("đã nhận việc") ||
    text.includes("onboarded") ||
    text.includes("tiếp nhận") ||
    text.includes("hội nhập") ||
    text.includes("tuyển dụng") ||
    text.includes("phê duyệt") ||
    text.includes("đã duyệt") ||
    text.includes("hoàn tất")
  ) {
    const isApproval = text.includes("phê duyệt") || text.includes("đã duyệt");
    return {
      borderColor: "border-l-emerald-500",
      badgeLabel: isApproval ? "Đã duyệt" : "Đã nhận việc",
      badgeClass:
        "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }

  // 6. Danh mục HRM
  if (item.category === "PAYROLL") {
    return {
      borderColor: "border-l-emerald-500",
      badgeLabel: "Bảng lương",
      badgeClass:
        "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }

  if (item.category === "LEAVE_REQUEST") {
    return {
      borderColor: "border-l-amber-500",
      badgeLabel: "Đơn từ",
      badgeClass:
        "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300",
    };
  }

  if (item.category === "ONBOARDING") {
    return {
      borderColor: "border-l-emerald-500",
      badgeLabel: "Tuyển dụng",
      badgeClass:
        "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }

  if (item.category === "ASSET") {
    return {
      borderColor: "border-l-blue-500",
      badgeLabel: "Tài sản",
      badgeClass:
        "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/50 dark:text-blue-300",
    };
  }

  if (item.category === "SYSTEM") {
    return {
      borderColor: "border-l-slate-400",
      badgeLabel: "Hệ thống",
      badgeClass:
        "border-slate-300 bg-slate-100 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    };
  }

  return {
    borderColor: "border-l-teal-500",
    badgeLabel: "Thông báo",
    badgeClass:
      "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800/70 dark:bg-teal-950/50 dark:text-teal-300",
  };
}

function renderNotificationMessage(rawMessage: string) {
  // 1. Xóa bỏ triệt để các câu chào lặp lại vô nghĩa như 'Chào Đinh Tuấn Kiệt...', 'Chào dasdasdasdasd...'
  let message = rawMessage
    .replace(/^(?:Xin\s+chào|Chào)\s+[^,!.:\n]+[,!.:]\s*/i, "")
    .trim();

  if (message.length > 0) {
    message = message.charAt(0).toUpperCase() + message.slice(1);
  }

  // 2. Làm nổi bật tên vị trí công việc: In đậm chữ trắng sáng cho tên vị trí
  if (!message.includes("**")) {
    if (/(?:vị trí|chức danh)\s+/i.test(message)) {
      message = message.replace(
        /((?:vị trí|chức danh)\s+)([^,.\n]+?)(?=\s+(?:của bạn|đã|đang|vừa|\.|$))/i,
        "$1**$2**"
      );
    } else if (/^Hồ sơ\s+(?!của\s+)/i.test(message)) {
      message = message.replace(
        /^(Hồ sơ\s+)([^,.\n]+?)(?=\s+(?:đã|đang|vừa|của bạn|\.|$))/i,
        "$1**$2**"
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

function formatNotificationTimestamp(isoInput: string): string {
  const date = new Date(isoInput);
  if (Number.isNaN(date.getTime())) {
    return isoInput;
  }
  const parts = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${lookup("hour")}:${lookup("minute")} · ${lookup("day")}/${lookup("month")}/${lookup("year")}`;
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const {
    role,
    currentUserProfile,
    theme,
    toggleTheme,
    activeNav,
    showToast,
    navigateWithIntent,
  } = useApp();

  const [isBellOpen, setIsBellOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [notifications, setNotifications] = useState<ActorNotification[]>([]);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const bellContainerRef = useRef<HTMLDivElement | null>(null);

  const defaultProfile = ROLE_DEFAULT_PROFILES[role];
  const actorEmpCode =
    currentUserProfile?.employee_code || defaultProfile.employee_code;
  const actorDeptId =
    currentUserProfile?.department_id ||
    currentUserProfile?.department ||
    defaultProfile.department;

  const syncNotifications = useCallback(() => {
    const items = getNotificationsForActor(role, actorEmpCode, actorDeptId);
    setNotifications(items);
  }, [role, actorEmpCode, actorDeptId]);

  useEffect(() => {
    syncNotifications();
    window.addEventListener(HRM_RUNTIME_EVENT, syncNotifications);
    window.addEventListener("storage", syncNotifications);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncNotifications);
      window.removeEventListener("storage", syncNotifications);
    };
  }, [syncNotifications]);

  useEffect(() => {
    setConfirmResetOpen(false);
  }, [role]);

  useEffect(() => {
    if (!isBellOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        bellContainerRef.current &&
        !bellContainerRef.current.contains(event.target as Node)
      ) {
        setIsBellOpen(false);
        setConfirmResetOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBellOpen(false);
        setConfirmResetOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isBellOpen]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications]
  );

  const filteredNotifications = useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((item) => !item.isRead)
        : notifications,
    [notifications, filter]
  );

  const groupedNotifications = useMemo(() => {
    const map: Record<TimeGroupKey, ActorNotification[]> = {
      "Hôm nay": [],
      "Hôm qua": [],
      "Tuần trước": [],
      "Cũ hơn": [],
    };
    filteredNotifications.forEach((item) => {
      const key = getTimeGroupKey(item.created_at);
      map[key].push(item);
    });
    return map;
  }, [filteredNotifications]);

  const handleSelectNotification = (item: ActorNotification) => {
    markNotificationRead(item.id, role, actorEmpCode);
    setIsBellOpen(false);
    setConfirmResetOpen(false);
    navigateWithIntent(item.nav_id, {
      entityId: item.entity_id,
      subTab: item.sub_tab,
    });
  };

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;
    markAllNotificationsRead(role, actorEmpCode, actorDeptId);
  };

  const handleConfirmResetDemo = () => {
    if (role !== "SUPER_ADMIN") return;
    resetAllDemoRuntimeData();
    setConfirmResetOpen(false);
    setIsBellOpen(false);
    showToast(
      "Đã đặt lại dữ liệu demo",
      "Toàn bộ thông báo, đơn từ và hồ sơ phát sinh đã khôi phục mặc định.",
      "info"
    );
  };

  const currentNav =
    NAV_ITEMS.find((item) => item.id === activeNav) ?? NAV_ITEMS[0];

  return (
    <header className="z-30 shrink-0 border-b border-[#C6D9D3] bg-[#E4EEEB] dark:border-zinc-800/80 dark:bg-zinc-950">
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
        {/* Left: Mobile trigger + Screen title & period context */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Mở menu điều hướng"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden"
          >
            <Menu className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-[#11221E] dark:text-zinc-100">
                {currentNav.label}
              </h1>
              <span className="shrink-0 rounded border border-[#C6D9D3] bg-[#FCFEFD] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                Tháng 11/2026
              </span>
            </div>
            <p className="hidden truncate text-xs text-[#415A54] dark:text-zinc-400 sm:block">
              {currentNav.summary}
            </p>
          </div>
        </div>

        {/* Right: Controls (Careers Portal, Notifications, Theme) */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Careers Portal Navigation Link (Same tab) */}
          <Link
            href="/careers"
            title="Xem Cổng Tuyển dụng & Việc làm Lạc Việt"
            className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 text-xs font-semibold text-[#415A54] shadow-sm transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] hover:text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-teal-400"
          >
            <Briefcase className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
            <span className="hidden md:inline">Cổng việc làm</span>
          </Link>

          {/* Notification Bell & Popover */}
          <div ref={bellContainerRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsBellOpen((prev) => {
                  const next = !prev;
                  if (!next) setConfirmResetOpen(false);
                  return next;
                });
              }}
              aria-label={
                unreadCount > 0
                  ? `Thông báo hệ thống, có ${unreadCount} mục chưa đọc`
                  : "Thông báo hệ thống"
              }
              aria-expanded={isBellOpen}
              aria-haspopup="dialog"
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 dark:focus-visible:ring-teal-400/30 ${
                isBellOpen
                  ? "border-[#0F766E] bg-[#CBE8E2] text-[#0B4F4A] dark:border-teal-400/60 dark:bg-teal-950/40 dark:text-teal-400"
                  : "border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              <Bell className="w-4 h-4" strokeWidth={1.5} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-medium leading-none tabular-nums text-white dark:bg-rose-500">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {isBellOpen && (
              <div
                role="dialog"
                aria-label="Thông báo hệ thống"
                className="fixed inset-x-3 top-[4.25rem] z-50 flex flex-col overflow-hidden rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_8px_24px_rgba(17,34,30,0.12)] dark:border-zinc-800/80 dark:bg-zinc-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[400px]"
              >
                {/* Popover Header */}
                <div className="border-b border-[#C6D9D3] bg-[#F2F7F5] px-4 py-3 dark:border-zinc-800/80 dark:bg-transparent">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                        Thông báo hệ thống
                      </h2>
                      {unreadCount > 0 && (
                        <span className="rounded border border-rose-200/80 bg-rose-50 px-1.5 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-400">
                          {unreadCount} mới
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      disabled={unreadCount === 0}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#0F766E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 disabled:cursor-not-allowed disabled:text-[#5C7871]/60 disabled:hover:bg-transparent dark:text-teal-400 dark:hover:bg-teal-950/40 dark:disabled:text-zinc-600 dark:disabled:hover:bg-transparent"
                    >
                      <CheckCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                      <span>Đánh dấu đã đọc</span>
                    </button>
                  </div>

                  {/* Quick Filter */}
                  <div className="mt-2.5 inline-flex rounded-lg border border-[#C6D9D3] bg-[#E4EEEB] p-0.5 dark:border-zinc-800 dark:bg-zinc-950">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                        filter === "all"
                          ? "border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-100"
                          : "border-transparent font-medium text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}
                    >
                      <span>Tất cả</span>
                      <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                        {notifications.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("unread")}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                        filter === "unread"
                          ? "border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-100"
                          : "border-transparent font-medium text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}
                    >
                      <span>Chưa đọc</span>
                      <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                        {unreadCount}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Notification List */}
                <div className="max-h-[380px] overflow-y-auto">
                  {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] text-[#5C7871] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                        <BellOff className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <p className="mt-3 text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                        {filter === "unread"
                          ? "Không có thông báo chưa đọc"
                          : "Chưa có thông báo hệ thống"}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                        {filter === "unread"
                          ? "Mọi cập nhật phê duyệt, bảng lương và tài sản đều đã được xem."
                          : "Các cập nhật về đơn từ, hội nhập và phiếu lương sẽ hiển thị tại đây."}
                      </p>
                      {filter === "unread" && notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilter("all")}
                          className="mt-3 inline-flex h-7 items-center rounded-md border border-[#C6D9D3] bg-[#F2F7F5] px-2.5 text-xs font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Xem tất cả thông báo
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      {TIME_GROUP_ORDER.map((groupKey) => {
                        const items = groupedNotifications[groupKey];
                        if (items.length === 0) return null;

                        return (
                          <div key={groupKey}>
                            {/* Vạch ngăn cách text nhỏ theo thời gian */}
                            <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-[#D5E3DF]/80 bg-[#F2F7F5]/95 px-4 py-1 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5C7871] dark:text-zinc-400">
                                {groupKey}
                              </span>
                              <span className="h-px flex-1 bg-[#D5E3DF] dark:bg-zinc-800" />
                              <span className="font-mono text-[10px] text-[#5C7871] dark:text-zinc-500">
                                {items.length}
                              </span>
                            </div>

                            <ul className="divide-y divide-[#E4EEEB] dark:divide-zinc-800/60">
                              {items.map((item) => {
                                const visual = getNotificationVisualMeta(item);

                                return (
                                  <li key={item.id}>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectNotification(item)}
                                      className={`group relative flex w-full flex-col items-start border-l-4 ${visual.borderColor} px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F766E]/30 dark:focus-visible:ring-teal-400/30 ${
                                        !item.isRead
                                          ? "bg-[#E8F3EF]/60 hover:bg-[#E8F3EF] dark:bg-white/5 dark:hover:bg-slate-800/50"
                                          : "bg-[#FCFEFD] hover:bg-[#F2F7F5] dark:bg-transparent dark:hover:bg-zinc-800/40"
                                      }`}
                                    >
                                      {/* Unread Dot ở góc phải trên */}
                                      {!item.isRead && (
                                        <span
                                          aria-label="Chưa đọc"
                                          className="absolute right-3.5 top-3 h-2 w-2 rounded-full bg-[#0F766E] shadow-sm ring-2 ring-white dark:bg-sky-400 dark:ring-zinc-900"
                                        />
                                      )}

                                      {/* Text Badge nhỏ bo góc ghi trạng thái + Thời gian */}
                                      <div className="flex w-full items-center justify-between gap-2 pr-4">
                                        <div className="flex items-center gap-1.5">
                                          <span
                                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${visual.badgeClass}`}
                                          >
                                            {visual.badgeLabel}
                                          </span>
                                          {item.entity_id && (
                                            <span className="rounded border border-[#C6D9D3] bg-[#F2F7F5] px-1.5 py-0.5 font-mono text-[9.5px] tabular-nums text-[#415A54] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                                              {item.entity_id}
                                            </span>
                                          )}
                                        </div>

                                        <span className="font-mono text-[10.5px] text-[#5C7871] dark:text-zinc-500">
                                          {formatNotificationTimestamp(item.created_at)}
                                        </span>
                                      </div>

                                      {/* Tiêu đề thông báo */}
                                      <span
                                        className={`mt-1 line-clamp-1 block text-xs ${
                                          !item.isRead
                                            ? "font-semibold text-[#11221E] dark:text-zinc-100"
                                            : "font-medium text-[#415A54] dark:text-zinc-300"
                                        }`}
                                      >
                                        {item.title}
                                      </span>

                                      {/* Nội dung thông báo nhấn mạnh Typography */}
                                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                                        {renderNotificationMessage(item.message)}
                                      </p>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SUPER_ADMIN Exclusive Footer: Demo Data Reset */}
                {role === "SUPER_ADMIN" && (
                  <div className="border-t border-[#C6D9D3] bg-[#F2F7F5] px-4 py-2.5 dark:border-zinc-800/80 dark:bg-zinc-950/60">
                    {!confirmResetOpen ? (
                      <button
                        type="button"
                        onClick={() => setConfirmResetOpen(true)}
                        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-medium text-[#11221E] transition-colors hover:border-rose-300 hover:bg-rose-50/70 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-rose-900/70 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                      >
                        <RotateCcw
                          className="h-3.5 w-3.5 shrink-0"
                          strokeWidth={1.5}
                        />
                        <span>Đặt lại dữ liệu demo</span>
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-[#415A54] dark:text-zinc-400">
                          Khôi phục toàn bộ thông báo, đơn từ và hồ sơ phát sinh về mặc định?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmResetOpen(false)}
                            className="flex h-8 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 text-xs font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmResetDemo}
                            className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-rose-600 bg-rose-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
                          >
                            <RotateCcw
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={1.5}
                            />
                            <span>Xác nhận đặt lại</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => {
              toggleTheme();
              showToast(
                `Chế độ giao diện: ${theme === "light" ? "Tối (Dark)" : "Sáng (Light)"}`,
                "Đã đồng bộ bảng màu hiển thị và độ tương phản hệ thống",
                "default"
              );
            }}
            aria-label={
              theme === "light"
                ? "Chuyển sang giao diện tối"
                : "Chuyển sang giao diện sáng"
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:ring-teal-400/30"
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Sun className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
