"use client";

import React, { useEffect, useMemo } from "react";
import { useApp } from "@/context/app-context";
import { AppShell } from "@/components/layout/app-shell";
import { NAV_ITEMS } from "@/components/layout/sidebar";
import { DashboardView } from "@/components/modules/dashboard-view";
import { CoreHrView } from "@/components/modules/core-hr-view";
import { AtsView } from "@/components/modules/ats-view";
import { AttendanceView } from "@/components/modules/attendance-view";
import { RequestsView } from "@/components/modules/requests-view";
import { PayrollView } from "@/components/modules/payroll-view";
import { PayslipSelfView } from "@/components/modules/payslip-self-view";
import { PerformanceView } from "@/components/modules/performance-view";
import { AdminRolesView } from "@/components/modules/admin-roles-view";
import { AdminSettingsView } from "@/components/modules/admin-settings-view";
import { AdminAuditView } from "@/components/modules/admin-audit-view";

const NAV_ALIAS_TO_ID: Record<string, string> = {
  employees: "core-hr",
  recruitment: "ats",
  requests: "leaves",
  performance: "kpi",
  roles: "rbac",
};

export default function HomePage() {
  const { role, activeNav, setActiveNav } = useApp();

  const canonicalNav = useMemo(
    () => NAV_ALIAS_TO_ID[activeNav] ?? activeNav,
    [activeNav]
  );

  useEffect(() => {
    const allowedItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
    const isAllowed = allowedItems.some((item) => item.id === canonicalNav);

    if (!isAllowed) {
      const fallback =
        allowedItems.find((item) => item.id === "dashboard")?.id ??
        allowedItems[0]?.id ??
        "dashboard";
      setActiveNav(fallback);
    } else if (activeNav !== canonicalNav) {
      setActiveNav(canonicalNav);
    }
  }, [role, activeNav, canonicalNav, setActiveNav]);

  const renderActiveView = () => {
    switch (canonicalNav) {
      case "dashboard":
        return <DashboardView />;
      case "core-hr":
        return <CoreHrView key="core-hr-employees" defaultTab="employees" />;
      case "contracts":
        return <CoreHrView key="core-hr-contracts" defaultTab="contracts" />;
      case "ats":
        return <AtsView />;
      case "attendance":
        return <AttendanceView />;
      case "leaves":
        return <RequestsView />;
      case "payroll":
        return <PayrollView />;
      case "payslip":
        return <PayslipSelfView />;
      case "kpi":
        return <PerformanceView />;
      case "rbac":
        return <AdminRolesView />;
      case "settings":
        return <AdminSettingsView />;
      case "audit-logs":
        return <AdminAuditView />;
      default:
        return <DashboardView />;
    }
  };

  return <AppShell>{renderActiveView()}</AppShell>;
}
