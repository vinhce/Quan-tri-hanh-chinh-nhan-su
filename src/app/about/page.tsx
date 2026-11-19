'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, ShieldCheck, Users, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#EFF5F3] text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#C6D9D3] bg-[#FCFEFD]/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F766E] text-white">
              <Building2 className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <span className="font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                LẠC VIỆT
              </span>
              <p className="text-[11px] text-[#415A54] dark:text-zinc-400">
                Giải pháp Quản trị Nhân sự & Tiền lương
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/careers" className="text-xs font-semibold text-[#415A54] hover:text-[#0F766E]">
              Tuyển dụng
            </Link>
            <Link href="/login">
              <Button variant="primary" size="sm" className="text-xs font-semibold">
                Đăng nhập
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 sm:py-20 border-b border-[#C6D9D3] bg-[#E4EEEB]/70 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1 text-xs font-semibold text-[#0F766E] shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            Về chúng tôi — Tổng Công ty Lạc Việt
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#11221E] dark:text-zinc-50 sm:text-4xl">
            Tiên phong số hóa quy trình quản trị nhân sự tại Việt Nam
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#415A54] dark:text-zinc-300">
            Hơn 30 năm hình thành và phát triển, Lạc Việt không ngừng đổi mới sáng tạo, cung cấp hệ sinh thái HRM toàn diện cho hàng ngàn tổ chức, doanh nghiệp và tập đoàn đa ngành.
          </p>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <ShieldCheck className="h-8 w-8 text-[#0F766E] dark:text-teal-400" />
              <h3 className="mt-4 text-base font-semibold text-[#11221E] dark:text-zinc-100">
                Chuẩn mực & Bảo mật
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Tuân thủ nghiêm ngặt Luật Lao động, chính sách BHXH và chuẩn bảo mật thông tin ISO 27001, đảm bảo tính toàn vẹn 100% dữ liệu tiền lương.
              </p>
            </div>
            <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <Users className="h-8 w-8 text-[#0F766E] dark:text-teal-400" />
              <h3 className="mt-4 text-base font-semibold text-[#11221E] dark:text-zinc-100">
                Tập trung vào Con người
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Đặt trải nghiệm của người lao động làm trung tâm, từ ngày đầu nhận việc (Onboarding) đến toàn bộ lộ trình thăng tiến và đãi ngộ.
              </p>
            </div>
            <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <Sparkles className="h-8 w-8 text-[#0F766E] dark:text-teal-400" />
              <h3 className="mt-4 text-base font-semibold text-[#11221E] dark:text-zinc-100">
                Công nghệ Đột phá
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Tích hợp AI phân tích CV, dự báo biến động nhân sự, tự động hóa tính lương và hỗ trợ ra quyết định điều hành tức thời.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
