"use client";

import React, { useState } from "react";
import {
  Inbox,
  AlertTriangle,
  RotateCcw,
  MessageSquareText,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "@/context/app-context";
import { Sidebar, NAV_ITEMS } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Skeleton } from "@/components/ui/skeleton";
import { AiCopilotWidget } from "@/components/copilot/ai-copilot-widget";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const {
    uiState,
    setUiState,
    activeNav,
    showToast,
    isCopilotOpen,
    setIsCopilotOpen,
  } = useApp();

  const currentNav =
    NAV_ITEMS.find((item) => item.id === activeNav) ?? NAV_ITEMS[0];

  const handleRestoreReady = () => {
    setUiState("ready");
    showToast(
      "Đã khôi phục dữ liệu hiển thị",
      `Phân hệ ${currentNav.label} đã sẵn sàng thao tác`,
      "success"
    );
  };

  return (
    <div className="fixed inset-0 flex h-dvh w-full overflow-hidden overscroll-none bg-[#EFF5F3] text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100">
      {/* Left Sidebar (auto filters items by role) */}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Right Main Workspace */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="flex-1 overflow-y-auto overscroll-contain bg-[#EFF5F3] p-4 dark:bg-zinc-950 lg:p-6">
          <div className="mx-auto w-full max-w-[1520px]">
          {/* 1. LOADING SKELETON STATE */}
          {uiState === "loading" && (
            <div
              className="space-y-6"
              aria-busy="true"
              aria-label="Đang tải dữ liệu phân hệ"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] px-4 py-3 shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900">
                <div className="flex items-center gap-2.5 text-xs text-[#415A54] dark:text-zinc-400">
                  <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                    [LOADING]
                  </span>
                  <span>
                    Đang hiển thị khung xương dữ liệu (Skeleton) cùng kích thước cho phân hệ{" "}
                    <strong className="font-semibold text-[#11221E] dark:text-zinc-100">
                      {currentNav.label}
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreReady}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] px-3 text-xs font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  <CheckCircle2 className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Hiển thị dữ liệu ngay</span>
                </button>
              </div>

              {/* 4 KPI Skeleton cards matching ready state dimensions */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-5 shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900"
                  >
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="mt-3 h-7 w-36" />
                    <Skeleton className="mt-2.5 h-3 w-44" />
                  </div>
                ))}
              </div>

              {/* Main table + side card skeleton */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-5 shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900 lg:col-span-8">
                  <div className="flex items-center justify-between border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-8 w-28" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((row) => (
                      <div
                        key={row}
                        className="grid grid-cols-5 gap-4 border-b border-[#D5E3DF] pb-3 dark:border-zinc-800/60"
                      >
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16 justify-self-end" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-5 shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900 lg:col-span-4">
                  <Skeleton className="h-4 w-40" />
                  <div className="mt-4 space-y-4">
                    {[1, 2, 3, 4].map((bar) => (
                      <div key={bar} className="space-y-2">
                        <div className="flex justify-between">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3.5 w-16" />
                        </div>
                        <Skeleton className="h-2 w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. EMPTY STATE */}
          {uiState === "empty" && (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-8 text-center shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#E4EEEB] text-[#0B4F4A] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <Inbox className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-[#11221E] dark:text-zinc-100">
                Chưa có bản ghi nào trong {currentNav.label}
              </h2>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Kỳ dữ liệu hoặc bộ lọc tìm kiếm hiện tại chưa có phát sinh hồ sơ. Bạn có thể nạp lại dữ liệu mẫu Tháng 11/2026 hoặc khởi tạo yêu cầu mới qua trợ lý AI HR Copilot.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRestoreReady}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0F766E] px-4 text-xs font-medium text-[#FCFEFD] transition-colors hover:bg-[#0D5F58] dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
                  <span>Nạp dữ liệu mẫu kỳ 11/2026</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCopilotOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] px-4 text-xs font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <MessageSquareText className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Mở AI HR Copilot</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. ERROR STATE */}
          {uiState === "error" && (
            <div
              role="alert"
              className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-red-300 bg-[#FCFEFD] p-8 text-center shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-red-950/60 dark:bg-zinc-900"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50/70 text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div className="mt-3 rounded border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-0.5 font-mono text-[11px] tabular-nums text-[#415A54] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                Mã lỗi: ERR_SYNC_LEDGER_504 · Kỳ 11/2026
              </div>
              <h2 className="mt-3 text-base font-semibold text-[#11221E] dark:text-zinc-100">
                Gián đoạn kết nối khi đồng bộ phân hệ {currentNav.label}
              </h2>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Hệ thống chưa nhận được phản hồi từ dịch vụ đối soát dữ liệu trong thời gian quy định (5.000 ms). Dữ liệu cục bộ vẫn được bảo toàn, vui lòng bấm thử lại để khôi phục phiên làm việc.
              </p>
              <div className="mt-5 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRestoreReady}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0F766E] px-4 text-xs font-medium text-[#FCFEFD] transition-colors hover:bg-[#0D5F58] dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
                  <span>Thử kết nối lại ngay</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. READY STATE */}
          {uiState === "ready" && children}
          </div>
        </main>
      </div>

      {/* Floating launcher when Copilot is closed */}
      {!isCopilotOpen && (
        <button
          type="button"
          onClick={() => setIsCopilotOpen(true)}
          aria-label="Mở trợ lý AI HR Copilot"
          className="fixed bottom-5 right-5 z-40 flex h-10 items-center gap-2 rounded-lg border border-[#0B4F4A] bg-[#0F766E] px-3.5 text-xs font-medium text-[#FCFEFD] shadow-sm transition-colors hover:bg-[#0D5F58] dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-teal-400"
        >
          <MessageSquareText className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>AI HR Copilot</span>
          <span className="rounded bg-[#0B4F4A] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#CBE8E2] dark:bg-zinc-200 dark:text-zinc-700">
            NLP
          </span>
        </button>
      )}

      {/* AI HR Copilot Floating Panel */}
      <AiCopilotWidget />
    </div>
  );
}
