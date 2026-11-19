'use client';

import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/app-context';
import { Briefcase, ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function RootPage() {
  const router = useRouter();
  const { role, isAuthenticated } = useApp();

  useEffect(() => {
    // If logged in with internal role -> enter internal management portal /app
    if (isAuthenticated && role !== 'CANDIDATE') {
      router.replace('/app');
    } else if (isAuthenticated && role === 'CANDIDATE') {
      // If candidate -> candidate portal
      router.replace('/candidate');
    } else {
      // Unauthenticated visitor -> start directly at Job Portal /careers
      router.replace('/careers');
    }
  }, [isAuthenticated, role, router]);

  return (
    <>
      <noscript>
        <meta httpEquiv="refresh" content="0;url=/careers" />
      </noscript>
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#EFF5F3] p-6 text-center text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] text-[#0F766E] shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
            <Briefcase className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#11221E] dark:text-zinc-100">
              Lạc Việt HRM · Cổng Thông tin & Việc làm
            </h2>
            <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
              Đang chuyển hướng bạn đến Cổng việc làm Lạc Việt Careers...
            </p>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Link
              href="/careers"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-[#FCFEFD] shadow-sm hover:bg-[#0D5F58]"
            >
              <span>Vào ngay Cổng Việc làm</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3.5 py-2 text-xs font-semibold text-[#415A54] shadow-sm hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Đăng nhập Quản trị</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
