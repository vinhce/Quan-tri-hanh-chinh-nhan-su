'use client';

import React, { Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, ArrowLeft, ArrowRight, User } from 'lucide-react';
import { useApp } from '@/context/app-context';
import { AppShell } from '@/components/layout/app-shell';
import { NAV_ITEMS } from '@/components/layout/sidebar';
import { DashboardView } from '@/components/modules/dashboard-view';
import { CoreHrView } from '@/components/modules/core-hr-view';
import { AtsView } from '@/components/modules/ats-view';
import { OnboardingView } from '@/components/modules/onboarding-view';
import { AttendanceView } from '@/components/modules/attendance-view';
import { RequestsView } from '@/components/modules/requests-view';
import { PayrollView } from '@/components/modules/payroll-view';
import { PayslipSelfView } from '@/components/modules/payslip-self-view';
import { PerformanceView } from '@/components/modules/performance-view';
import { AdminRolesView } from '@/components/modules/admin-roles-view';
import { AdminSettingsView } from '@/components/modules/admin-settings-view';
import { AdminAuditView } from '@/components/modules/admin-audit-view';
import { Button } from '@/components/ui/button';

const NAV_ALIAS_TO_ID: Record<string, string> = {
  employees: 'core-hr',
  recruitment: 'ats',
  assets: 'onboarding',
  requests: 'leaves',
  performance: 'kpi',
  roles: 'rbac',
};

function InternalAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, activeNav, setActiveNav } = useApp();

  // Support deep-linking via ?nav= query parameter
  useEffect(() => {
    const navQuery = searchParams.get('nav');
    if (navQuery && NAV_ITEMS.some((i) => i.id === navQuery || NAV_ALIAS_TO_ID[navQuery] === i.id)) {
      setActiveNav(NAV_ALIAS_TO_ID[navQuery] ?? navQuery);
    }
  }, [searchParams, setActiveNav]);

  const canonicalNav = useMemo(
    () => NAV_ALIAS_TO_ID[activeNav] ?? activeNav,
    [activeNav]
  );

  useEffect(() => {
    // 403 check: Candidates must not access internal app
    if (role === 'CANDIDATE') return;

    const allowedItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
    const isAllowed = allowedItems.some((item) => item.id === canonicalNav);

    if (!isAllowed) {
      const fallback =
        allowedItems.find((item) => item.id === 'dashboard')?.id ??
        allowedItems[0]?.id ??
        'dashboard';
      setActiveNav(fallback);
    } else if (activeNav !== canonicalNav) {
      setActiveNav(canonicalNav);
    }
  }, [role, activeNav, canonicalNav, setActiveNav]);

  // Route Guard 403: CANDIDATE cannot access internal administration portal
  if (role === 'CANDIDATE') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#EFF5F3] p-6 text-center dark:bg-zinc-950">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 text-rose-600 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
          <ShieldAlert className="h-8 w-8" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
          403 — Không có quyền truy cập
        </h1>
        <p className="mt-2 max-w-md text-sm text-[#415A54] dark:text-zinc-400">
          Tài khoản của bạn là <strong>Ứng viên (CANDIDATE)</strong>. Phân hệ Quản trị Nội bộ chỉ dành cho cán bộ nhân viên và ban điều hành Lạc Việt HRM.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/candidate">
            <Button variant="primary" className="text-xs font-semibold">
              <User className="mr-1.5 h-3.5 w-3.5" />
              Chuyển về Cổng Ứng viên của bạn
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" className="border-[#C6D9D3] text-xs">
              Đăng nhập tài khoản nội bộ khác
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (canonicalNav) {
      case 'dashboard':
        return <DashboardView />;
      case 'core-hr':
        return <CoreHrView key="core-hr-employees" defaultTab="employees" />;
      case 'contracts':
        return <CoreHrView key="core-hr-contracts" defaultTab="contracts" />;
      case 'ats':
        return <AtsView />;
      case 'onboarding':
        return <OnboardingView />;
      case 'attendance':
        return <AttendanceView />;
      case 'leaves':
        return <RequestsView />;
      case 'payroll':
        return <PayrollView />;
      case 'payslip':
        return <PayslipSelfView />;
      case 'kpi':
        return <PerformanceView />;
      case 'rbac':
        return <AdminRolesView />;
      case 'settings':
        return <AdminSettingsView />;
      case 'audit-logs':
        return <AdminAuditView />;
      default:
        return <DashboardView />;
    }
  };

  return <AppShell>{renderActiveView()}</AppShell>;
}

export default function InternalAppPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#EFF5F3] dark:bg-zinc-950">
          <div className="text-sm font-medium text-[#415A54] dark:text-zinc-400">
            Đang tải dữ liệu cổng quản trị...
          </div>
        </div>
      }
    >
      <InternalAppContent />
    </Suspense>
  );
}
