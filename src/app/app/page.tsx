'use client';

import React, { Suspense, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, ArrowLeft, User } from 'lucide-react';
import { useApp } from '@/context/app-context';
import { AppShell } from '@/components/layout/app-shell';
import {
  NAV_ALIAS_TO_ID,
  NAV_ITEMS,
  canRoleAccessNav,
} from '@/components/layout/sidebar';
import { DashboardView } from '@/components/modules/dashboard-view';
import { Button } from '@/components/ui/button';

function ModuleLoadingFallback() {
  return (
    <div className="space-y-4 rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="h-6 w-56 animate-pulse rounded-md bg-[#E3EEEA] dark:bg-zinc-800" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-[#EDF5F2] dark:bg-zinc-800/70" />
        <div className="h-24 animate-pulse rounded-xl bg-[#EDF5F2] dark:bg-zinc-800/70" />
        <div className="h-24 animate-pulse rounded-xl bg-[#EDF5F2] dark:bg-zinc-800/70" />
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-[#F3F8F6] dark:bg-zinc-800/50" />
    </div>
  );
}

const CoreHrView = dynamic(
  () => import('@/components/modules/core-hr-view').then((m) => m.CoreHrView),
  { loading: () => <ModuleLoadingFallback /> }
);
const AtsView = dynamic(
  () => import('@/components/modules/ats-view').then((m) => m.AtsView),
  { loading: () => <ModuleLoadingFallback /> }
);
const OnboardingView = dynamic(
  () => import('@/components/modules/onboarding-view').then((m) => m.OnboardingView),
  { loading: () => <ModuleLoadingFallback /> }
);
const OffboardingView = dynamic(
  () => import('@/components/modules/offboarding-view').then((m) => m.OffboardingView),
  { loading: () => <ModuleLoadingFallback /> }
);
const AttendanceView = dynamic(
  () => import('@/components/modules/attendance-view').then((m) => m.AttendanceView),
  { loading: () => <ModuleLoadingFallback /> }
);
const RequestsView = dynamic(
  () => import('@/components/modules/requests-view').then((m) => m.RequestsView),
  { loading: () => <ModuleLoadingFallback /> }
);
const PayrollView = dynamic(
  () => import('@/components/modules/payroll-view').then((m) => m.PayrollView),
  { loading: () => <ModuleLoadingFallback /> }
);
const PayslipSelfView = dynamic(
  () => import('@/components/modules/payslip-self-view').then((m) => m.PayslipSelfView),
  { loading: () => <ModuleLoadingFallback /> }
);
const PerformanceView = dynamic(
  () => import('@/components/modules/performance-view').then((m) => m.PerformanceView),
  { loading: () => <ModuleLoadingFallback /> }
);
const AdminRolesView = dynamic(
  () => import('@/components/modules/admin-roles-view').then((m) => m.AdminRolesView),
  { loading: () => <ModuleLoadingFallback /> }
);
const AdminSettingsView = dynamic(
  () => import('@/components/modules/admin-settings-view').then((m) => m.AdminSettingsView),
  { loading: () => <ModuleLoadingFallback /> }
);
const AdminAuditView = dynamic(
  () => import('@/components/modules/admin-audit-view').then((m) => m.AdminAuditView),
  { loading: () => <ModuleLoadingFallback /> }
);

function InternalAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, activeNav, setActiveNav } = useApp();

  // Support deep-linking via ?nav= query parameter with strict role check
  useEffect(() => {
    const navQuery = searchParams.get('nav');
    if (!navQuery) return;
    const resolvedNav = NAV_ALIAS_TO_ID[navQuery] ?? navQuery;
    if (NAV_ITEMS.some((i) => i.id === resolvedNav)) {
      if (canRoleAccessNav(role, resolvedNav)) {
        setActiveNav(resolvedNav);
      } else {
        setActiveNav('dashboard');
        router.replace('/app');
      }
    }
  }, [searchParams, role, setActiveNav, router]);

  const canonicalNav = useMemo(
    () => NAV_ALIAS_TO_ID[activeNav] ?? activeNav,
    [activeNav]
  );

  useEffect(() => {
    // 403 check: Candidates must not access internal app
    if (role === 'CANDIDATE') return;

    if (!canRoleAccessNav(role, canonicalNav)) {
      setActiveNav('dashboard');
      if (searchParams.get('nav')) {
        router.replace('/app');
      }
    } else if (activeNav !== canonicalNav) {
      setActiveNav(canonicalNav);
    }
  }, [role, activeNav, canonicalNav, searchParams, setActiveNav, router]);

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
    if (!canRoleAccessNav(role, canonicalNav)) {
      return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
            <ShieldAlert className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[#11221E] dark:text-zinc-100">
            403 — Không có quyền truy cập phân hệ này
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-[#415A54] dark:text-zinc-400">
            Vai trò hiện tại của bạn không được cấp quyền xem màn hình này. Vui lòng quay về Tổng quan điều hành.
          </p>
          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => {
                setActiveNav('dashboard');
                router.replace('/app');
              }}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
              Quay về Tổng quan
            </Button>
          </div>
        </div>
      );
    }

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
      case 'offboarding':
        return <OffboardingView />;
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
