"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Sun,
  Moon,
  MessageSquareText,
  LogOut,
} from "lucide-react";
import { useApp } from "@/context/app-context";
import { NAV_ITEMS, ROLE_META } from "@/components/layout/sidebar";

interface HeaderProps {
  onOpenMobileMenu?: () => void;
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const router = useRouter();
  const {
    role,
    currentUserProfile,
    logout,
    theme,
    toggleTheme,
    activeNav,
    showToast,
    isCopilotOpen,
    setIsCopilotOpen,
  } = useApp();

  const currentNav =
    NAV_ITEMS.find((item) => item.id === activeNav) ?? NAV_ITEMS[0];
  const currentPerson = ROLE_META[role];
  const displayName = currentUserProfile?.fullName || currentPerson.empName;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const handleLogout = () => {
    logout();
    showToast(
      "Đã đăng xuất khỏi hệ thống",
      "Phiên làm việc đã kết thúc an toàn",
      "default"
    );
    router.push("/login");
  };

  return (
    <header className="z-30 shrink-0 border-b border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950">
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
        {/* Left: Mobile trigger + Screen title & period context */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Mở menu điều hướng"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-50 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden"
          >
            <Menu className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {currentNav.label}
              </h1>
              <span className="shrink-0 rounded border border-zinc-200/80 bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                Tháng 11/2026
              </span>
            </div>
            <p className="hidden truncate text-xs text-zinc-500 dark:text-zinc-400 sm:block">
              {currentNav.summary}
            </p>
          </div>
        </div>

        {/* Right: Controls (Copilot, Theme, Active Employee Profile, Logout) */}
        <div className="flex shrink-0 items-center gap-2">
          {/* AI HR Copilot button */}
          <button
            type="button"
            onClick={() => setIsCopilotOpen(!isCopilotOpen)}
            aria-label="Bật hoặc tắt AI HR Copilot"
            className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
              isCopilotOpen
                ? "border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-zinc-950"
                : "border-zinc-200/80 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            <MessageSquareText className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="hidden sm:inline">AI HR Copilot</span>
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => {
              toggleTheme();
              showToast(
                `Chế độ giao diện: ${theme === "light" ? "Tối (Dark)" : "Sáng (Light)"}`,
                "Đã đồng bộ bảng màu trung tính zinc và độ tương phản",
                "default"
              );
            }}
            aria-label={
              theme === "light"
                ? "Chuyển sang giao diện tối"
                : "Chuyển sang giao diện sáng"
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-50 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Sun className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>

          {/* Active employee profile badge */}
          <div className="hidden items-center gap-2.5 rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3 py-1.5 dark:border-zinc-800/80 dark:bg-zinc-900/70 md:flex">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-300/80 bg-white font-mono text-xs font-medium text-teal-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-teal-400">
              {initials}
            </div>
            <div className="text-left leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {displayName}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-teal-700 dark:text-teal-400">
                  {currentPerson.empCode}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {currentPerson.label}
              </div>
            </div>
          </div>

          {/* Logout button */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Đăng xuất khỏi hệ thống"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
