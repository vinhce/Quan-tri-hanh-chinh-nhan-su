'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, ShieldCheck, Users, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#EFF5F3] text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100 font-sans">
      <PublicHeader />

      {/* Hero */}
      <section className="py-14 sm:py-16 border-b border-[#C6D9D3] bg-[#E4EEEB]/60 dark:border-zinc-800 dark:bg-zinc-900/60">
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
            <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F3EF] text-[#0F766E]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#11221E] dark:text-zinc-100">
                Chuẩn mực & Bảo mật
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Tuân thủ nghiêm ngặt Luật Lao động, chính sách BHXH và chuẩn bảo mật thông tin ISO 27001, đảm bảo tính toàn vẹn 100% dữ liệu tiền lương.
              </p>
            </div>
            <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F3EF] text-[#0F766E]">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#11221E] dark:text-zinc-100">
                Tập trung vào Con người
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Đặt trải nghiệm của người lao động làm trung tâm, từ ngày đầu nhận việc (Onboarding) đến toàn bộ lộ trình thăng tiến và đãi ngộ.
              </p>
            </div>
            <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F3EF] text-[#0F766E]">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#11221E] dark:text-zinc-100">
                Công nghệ Đột phá
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
                Tích hợp AI phân tích CV, dự báo biến động nhân sự, tự động hóa tính lương và hỗ trợ ra quyết định điều hành tức thời.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
