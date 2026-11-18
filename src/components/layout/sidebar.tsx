"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Users,
  FileText,
  UserCheck,
  Clock,
  CalendarCheck,
  Wallet,
  Receipt,
  Activity,
  Shield,
  Sliders,
  Terminal,
  LogOut,
  X,
  Building2,
  User,
  ChevronDown,
  Check,
  type LucideIcon,
} from "lucide-react";
import {
  useApp,
  ROLE_DEFAULT_PROFILES,
  type RoleCode,
} from "@/context/app-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface NavItem {
  id: string;
  label: string;
  section: "Quản trị cốt lõi" | "Vận hành" | "Hệ thống";
  icon: LucideIcon;
  roles: RoleCode[];
  badgeCount?: number;
  deliverableStep: string;
  summary: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Tổng quan điều hành",
    section: "Quản trị cốt lõi",
    icon: LayoutGrid,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    deliverableStep: "Bước 1",
    summary: "Bàn làm việc trung tâm theo vai trò, chỉ số nhân sự và đối soát nhanh",
  },
  {
    id: "core-hr",
    label: "Hồ sơ & Tổ chức",
    section: "Quản trị cốt lõi",
    icon: Users,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER", "DEPT_MANAGER"],
    badgeCount: 28,
    deliverableStep: "Bước 2",
    summary: "Cây sơ đồ khối phòng ban, danh bạ nhân viên và biến động nhân sự",
  },
  {
    id: "contracts",
    label: "Hợp đồng & Phụ lục",
    section: "Quản trị cốt lõi",
    icon: FileText,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER"],
    badgeCount: 4,
    deliverableStep: "Bước 2",
    summary: "Quản lý hợp đồng lao động, cảnh báo đáo hạn trong 30 ngày",
  },
  {
    id: "ats",
    label: "Tuyển dụng & AI CV",
    section: "Quản trị cốt lõi",
    icon: UserCheck,
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER"],
    badgeCount: 6,
    deliverableStep: "Bước 2",
    summary: "Kanban 5 bước tuyển dụng và chấm điểm hồ sơ ứng viên tự động",
  },
  {
    id: "attendance",
    label: "Chấm công & Ca làm",
    section: "Vận hành",
    icon: Clock,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    deliverableStep: "Bước 3",
    summary: "Bảng công tháng, phân ca HC-08:00 và đối soát đi muộn về sớm",
  },
  {
    id: "leaves",
    label: "Đơn từ & Phê duyệt",
    section: "Vận hành",
    icon: CalendarCheck,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    badgeCount: 4,
    deliverableStep: "Bước 3",
    summary: "Nghỉ phép năm, đăng ký làm thêm giờ và giải trình chấm công",
  },
  {
    id: "payroll",
    label: "Bảng lương & Thuế",
    section: "Vận hành",
    icon: Wallet,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER"],
    deliverableStep: "Bước 3",
    summary: "Tính lương Gross sang Net, BHXH 10.5%, giảm trừ gia cảnh và thuế TNCN",
  },
  {
    id: "payslip",
    label: "Phiếu lương cá nhân",
    section: "Vận hành",
    icon: Receipt,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    deliverableStep: "Bước 5",
    summary: "Chi tiết thu nhập, khấu trừ bảo hiểm và thực lĩnh chuyển khoản",
  },
  {
    id: "kpi",
    label: "Đánh giá & Cảnh báo AI",
    section: "Vận hành",
    icon: Activity,
    roles: ["SUPER_ADMIN", "DIRECTOR", "HR_MANAGER", "DEPT_MANAGER"],
    badgeCount: 3,
    deliverableStep: "Bước 2",
    summary: "Theo dõi hiệu suất OKR/KPI và dự báo nguy cơ nghỉ việc",
  },
  {
    id: "rbac",
    label: "Phân quyền vai trò",
    section: "Hệ thống",
    icon: Shield,
    roles: ["SUPER_ADMIN"],
    deliverableStep: "Bước 4",
    summary: "Ma trận phân quyền 6 thao tác theo từng phân hệ nghiệp vụ",
  },
  {
    id: "settings",
    label: "Tham số & Chính sách",
    section: "Hệ thống",
    icon: Sliders,
    roles: ["SUPER_ADMIN", "HR_MANAGER"],
    deliverableStep: "Bước 4",
    summary: "Cấu hình giờ chuẩn, trần đóng BHXH, biểu thuế lũy tiến và mô hình AI",
  },
  {
    id: "audit-logs",
    label: "Nhật ký bảo mật",
    section: "Hệ thống",
    icon: Terminal,
    roles: ["SUPER_ADMIN"],
    deliverableStep: "Bước 4",
    summary: "Lịch sử truy cập, thay đổi dữ liệu lương và phê duyệt hệ thống",
  },
];

export const ROLE_META: Record<
  RoleCode,
  {
    label: string;
    shortLabel: string;
    empCode: string;
    empName: string;
    position: string;
    department: string;
    shiftCode: string;
    scopeNote: string;
  }
> = {
  SUPER_ADMIN: {
    label: "Quản trị hệ thống",
    shortLabel: "Super Admin",
    empCode: "NV-2024-001",
    empName: "Nguyễn Văn An",
    position: "Giám đốc Công nghệ & Hệ thống",
    department: "Ban Điều hành",
    shiftCode: "HC-08:00",
    scopeNote: "Toàn quyền 12/12 phân hệ & cấu hình bảo mật",
  },
  DIRECTOR: {
    label: "Giám đốc Điều hành",
    shortLabel: "Director",
    empCode: "NV-2024-000",
    empName: "Trần Quốc Việt",
    position: "Giám đốc Điều hành",
    department: "Ban Điều hành",
    shiftCode: "HC-08:00",
    scopeNote: "Điều hành toàn doanh nghiệp, phê duyệt cấp 3 & quỹ lương",
  },
  HR_MANAGER: {
    label: "Trưởng phòng Nhân sự",
    shortLabel: "HR Manager",
    empCode: "NV-2024-002",
    empName: "Trần Thị Bích Ngọc",
    position: "Trưởng phòng Nhân sự & Hành chính",
    department: "Phòng Nhân sự & Hành chính",
    shiftCode: "HC-08:00",
    scopeNote: "Quản trị hồ sơ, tuyển dụng, bảng công & quỹ lương",
  },
  DEPT_MANAGER: {
    label: "Trưởng bộ phận",
    shortLabel: "Dept Manager",
    empCode: "NV-2024-003",
    empName: "Lê Hoàng Nam",
    position: "Trưởng phòng Kỹ thuật Phần mềm",
    department: "Khối Công nghệ",
    shiftCode: "HC-08:30",
    scopeNote: "Duyệt đơn từ, chấm công & đánh giá nhân sự thuộc bộ phận",
  },
  EMPLOYEE: {
    label: "Nhân viên chính thức",
    shortLabel: "Employee",
    empCode: "NV-2024-004",
    empName: "Phạm Minh Tuấn",
    position: "Chuyên viên Phát triển Sản phẩm",
    department: "Khối Công nghệ",
    shiftCode: "HC-08:30",
    scopeNote: "Tự phục vụ: chấm công, tạo đơn nghỉ phép & tra cứu phiếu lương",
  },
};

const SECTIONS: Array<"Quản trị cốt lõi" | "Vận hành" | "Hệ thống"> = [
  "Quản trị cốt lõi",
  "Vận hành",
  "Hệ thống",
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const ROLE_SWITCH_ORDER: RoleCode[] = [
  "SUPER_ADMIN",
  "DIRECTOR",
  "HR_MANAGER",
  "DEPT_MANAGER",
  "EMPLOYEE",
];

function getRoleBadgeMeta(
  role: RoleCode,
  empCode: string,
  department: string
): { text: string; className: string } {
  switch (role) {
    case "SUPER_ADMIN":
      return {
        text: ROLE_META.SUPER_ADMIN.label,
        className:
          "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800/80 dark:bg-teal-950/40 dark:text-teal-400",
      };
    case "DIRECTOR":
      return {
        text: ROLE_META.DIRECTOR.label,
        className:
          "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/80 dark:bg-violet-950/40 dark:text-violet-400",
      };
    case "HR_MANAGER":
      return {
        text: ROLE_META.HR_MANAGER.label,
        className:
          "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-blue-400",
      };
    case "DEPT_MANAGER":
      return {
        text: `${ROLE_META.DEPT_MANAGER.label} · ${department}`,
        className:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-400",
      };
    case "EMPLOYEE":
    default:
      return {
        text: `${empCode} · ${department}`,
        className:
          "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      };
  }
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const router = useRouter();
  const {
    role,
    currentUserProfile,
    setAuthenticatedUser,
    logout,
    activeNav,
    setActiveNav,
    showToast,
  } = useApp();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  useEffect(() => {
    if (!roleMenuOpen && !(mobileOpen && !logoutDialogOpen)) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (roleMenuOpen) {
        setRoleMenuOpen(false);
      } else if (mobileOpen && !logoutDialogOpen) {
        onMobileClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [roleMenuOpen, mobileOpen, logoutDialogOpen, onMobileClose]);

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const currentMeta = ROLE_META[role];
  const defaultProfile = ROLE_DEFAULT_PROFILES[role];
  const displayName = currentUserProfile?.fullName || currentMeta.empName;
  const displayDept = currentUserProfile?.department || currentMeta.department;
  const displayEmpCode =
    currentUserProfile?.employee_code || currentMeta.empCode || defaultProfile.employee_code;

  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "NV";

  const roleBadge = getRoleBadgeMeta(role, displayEmpCode, displayDept);

  const handleSelectNav = (item: NavItem) => {
    setActiveNav(item.id);
    setRoleMenuOpen(false);
    onMobileClose?.();
  };

  const handleOpenProfile = () => {
    setActiveNav("payslip");
    setRoleMenuOpen(false);
    onMobileClose?.();
  };

  const handleSwitchDemoRole = (nextRole: RoleCode) => {
    const nextProfile = ROLE_DEFAULT_PROFILES[nextRole];
    const nextMeta = ROLE_META[nextRole];
    setAuthenticatedUser(nextRole, nextProfile.email, {
      fullName: nextProfile.fullName || nextMeta.empName,
      department: nextProfile.department || nextMeta.department,
      employee_code: nextProfile.employee_code || nextMeta.empCode,
    });
    setActiveNav("dashboard");
    setRoleMenuOpen(false);
    onMobileClose?.();
  };

  const handleOpenLogoutDialog = () => {
    setRoleMenuOpen(false);
    onMobileClose?.();
    setLogoutDialogOpen(true);
  };

  const handleConfirmLogout = () => {
    setLogoutDialogOpen(false);
    setRoleMenuOpen(false);
    logout();
    showToast(
      "Đã đăng xuất khỏi hệ thống",
      "Phiên làm việc đã kết thúc an toàn",
      "default"
    );
    onMobileClose?.();
    router.push("/login");
  };

  const renderSidebarContent = () => (
    <div className="flex h-full min-h-0 w-64 flex-col border-r border-zinc-200/80 bg-zinc-50 dark:border-zinc-800/80 dark:bg-zinc-950 select-none">
      {/* Brand header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200/80 px-4 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300/80 bg-white text-teal-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
            <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
              Lạc Việt HRM
            </span>
            <span className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 leading-none">
              v2.4 · Kỳ 11/2026
            </span>
          </div>
        </div>
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Đóng thanh điều hướng"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-teal-400/30 lg:hidden"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Navigation sections */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
        aria-label="Điều hướng phân hệ nhân sự"
      >
          {SECTIONS.map((sectionName) => {
            const sectionItems = visibleItems.filter(
              (item) => item.section === sectionName
            );
            if (sectionItems.length === 0) return null;

            return (
              <div key={sectionName}>
                <div className="mt-4 mb-1.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {sectionName}
                </div>
                <ul className="space-y-0.5">
                  {sectionItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeNav === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectNav(item)}
                          aria-current={isActive ? "page" : undefined}
                          className={`group flex h-8 w-full items-center justify-between rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:focus-visible:ring-teal-400/30 ${
                            isActive
                              ? "bg-zinc-200/75 font-medium text-teal-700 dark:bg-zinc-900 dark:text-teal-400"
                              : "font-normal text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-200"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                isActive
                                  ? "text-teal-700 dark:text-teal-400"
                                  : "text-zinc-500 group-hover:text-zinc-800 dark:text-zinc-400 dark:group-hover:text-zinc-200"
                              }`}
                              strokeWidth={1.5}
                            />
                            <span className="truncate">{item.label}</span>
                          </span>
                          {typeof item.badgeCount === "number" &&
                            !(item.id === "leaves" && role === "EMPLOYEE") && (
                            <span
                              className={`ml-2 shrink-0 font-mono text-xs tabular-nums ${
                                isActive
                                  ? "text-teal-700 dark:text-teal-400"
                                  : "text-zinc-500 dark:text-zinc-400"
                              }`}
                            >
                              {item.id === "core-hr"
                                ? role === "DEPT_MANAGER"
                                  ? 6
                                  : 28
                                : item.badgeCount}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      {/* Account card footer */}
      <div className="relative shrink-0 border-t border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
        {roleMenuOpen && (
          <div
            role="menu"
            aria-label="Danh sách vai trò demo"
            className="mb-2 max-h-[45dvh] overflow-y-auto rounded-xl border border-zinc-200/80 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="px-2 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Chỉ dùng để demo phân quyền
            </div>
            <div className="space-y-0.5">
              {ROLE_SWITCH_ORDER.map((r) => {
                const meta = ROLE_META[r];
                const profile = ROLE_DEFAULT_PROFILES[r];
                const isSelected = r === role;
                return (
                  <button
                    key={r}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSwitchDemoRole(r)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:focus-visible:ring-teal-400/30 ${
                      isSelected
                        ? "bg-teal-50 font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-400"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="min-w-0 flex-1 pr-2">
                      <span className="block truncate">{meta.label}</span>
                      <span className="block truncate font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                        {profile.fullName} · {meta.empCode}
                      </span>
                    </span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-800/80 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRoleMenuOpen((prev) => !prev)}
              aria-label={`Tài khoản ${displayName}, mở menu đổi vai trò demo`}
              aria-expanded={roleMenuOpen}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-300/80 bg-zinc-50 font-mono text-xs font-medium text-teal-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-teal-400 dark:hover:bg-zinc-700 dark:focus-visible:ring-teal-400/30"
            >
              {initials}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {displayName}
              </p>
              <span
                title={roleBadge.text}
                className={`mt-1 inline-flex max-w-full items-center overflow-hidden rounded border px-1.5 py-0.5 text-[10.5px] font-medium leading-tight tracking-tight ${roleBadge.className}`}
              >
                <span className="truncate">{roleBadge.text}</span>
              </span>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleOpenProfile}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-zinc-200/80 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-teal-400/30"
            >
              <User className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span>Hồ sơ</span>
            </button>
            <button
              type="button"
              onClick={handleOpenLogoutDialog}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-rose-200/80 bg-rose-50/70 px-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600/30 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/60 dark:focus-visible:ring-rose-400/30"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span>Đăng xuất</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setRoleMenuOpen((prev) => !prev)}
            aria-label="Đổi vai trò (demo)"
            aria-expanded={roleMenuOpen}
            className="mt-1.5 flex h-7 w-full items-center justify-between rounded-md px-2 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-200 dark:focus-visible:ring-teal-400/30"
          >
            <span>Đổi vai trò (demo)</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                roleMenuOpen ? "rotate-180" : ""
              }`}
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block lg:h-full lg:w-64 lg:shrink-0">
        {renderSidebarContent()}
      </aside>

      {/* Mobile slide-over sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu điều hướng"
        >
          <div
            className="fixed inset-0 bg-zinc-950/40 transition-opacity"
            onClick={onMobileClose}
          />
          <div className="relative z-10 flex h-full w-64 flex-col">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Logout confirmation dialog */}
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận đăng xuất</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn đăng xuất khỏi tài khoản{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {displayName}
              </span>{" "}
              (<span className="font-mono tabular-nums">{displayEmpCode}</span>) và quay về trang đăng nhập không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setLogoutDialogOpen(false)}
            >
              Ở lại
            </Button>
            <Button
              variant="destructive"
              type="button"
              className="border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
              onClick={handleConfirmLogout}
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
              <span>Xác nhận đăng xuất</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
