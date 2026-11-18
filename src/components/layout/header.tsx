"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Menu,
  Sun,
  Moon,
  Bell,
  BellOff,
  CheckCheck,
  RotateCcw,
  CalendarCheck,
  Wallet,
  ClipboardCheck,
  Laptop,
  ShieldAlert,
  type LucideIcon,
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

const CATEGORY_VISUAL_META: Record<
  NotificationCategory,
  {
    icon: LucideIcon;
    label: string;
    iconBoxClass: string;
  }
> = {
  LEAVE_REQUEST: {
    icon: CalendarCheck,
    label: "Đơn từ",
    iconBoxClass:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-400",
  },
  PAYROLL: {
    icon: Wallet,
    label: "Bảng lương",
    iconBoxClass:
      "border-[#6EE7B7] bg-[#D1FAE5] text-[#065F46] dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  ONBOARDING: {
    icon: ClipboardCheck,
    label: "Onboarding",
    iconBoxClass:
      "border-[#99D5CA] bg-[#CBE8E2] text-[#0B4F4A] dark:border-teal-800/70 dark:bg-teal-950/40 dark:text-teal-400",
  },
  ASSET: {
    icon: Laptop,
    label: "Tài sản",
    iconBoxClass:
      "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800/70 dark:bg-blue-950/40 dark:text-blue-400",
  },
  SYSTEM: {
    icon: ShieldAlert,
    label: "Hệ thống",
    iconBoxClass:
      "border-[#C6D9D3] bg-[#E4EEEB] text-[#415A54] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

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

        {/* Right: Controls (Notifications, Theme) */}
        <div className="flex shrink-0 items-center gap-2">
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
                <div className="max-h-[360px] overflow-y-auto">
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
                    <ul className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                      {filteredNotifications.map((item) => {
                        const visual =
                          CATEGORY_VISUAL_META[item.category] ??
                          CATEGORY_VISUAL_META.SYSTEM;
                        const CategoryIcon = visual.icon;

                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectNotification(item)}
                              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F766E]/30 dark:hover:bg-zinc-800/50 dark:focus-visible:ring-teal-400/30 ${
                                !item.isRead
                                  ? "bg-[#F5FAF8] dark:bg-teal-950/15"
                                  : "bg-[#FCFEFD] dark:bg-transparent"
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${visual.iconBoxClass}`}
                              >
                                <CategoryIcon
                                  className="h-4 w-4 shrink-0"
                                  strokeWidth={1.5}
                                />
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-2">
                                  <span
                                    className={`line-clamp-1 text-xs ${
                                      !item.isRead
                                        ? "font-semibold text-[#11221E] dark:text-zinc-100"
                                        : "font-medium text-[#415A54] dark:text-zinc-300"
                                    }`}
                                  >
                                    {item.title}
                                  </span>
                                  {!item.isRead && (
                                    <span
                                      aria-label="Chưa đọc"
                                      className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0F766E] dark:bg-teal-400"
                                    />
                                  )}
                                </span>

                                <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                                  {item.message}
                                </span>

                                <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#5C7871] dark:text-zinc-400">
                                  <span className="font-mono tabular-nums">
                                    {formatNotificationTimestamp(item.created_at)}
                                  </span>
                                  <span>·</span>
                                  <span>{visual.label}</span>
                                  {item.entity_id && (
                                    <span className="rounded border border-[#C6D9D3] bg-[#F2F7F5] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#415A54] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                                      {item.entity_id}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
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
