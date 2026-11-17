"use client";

import React from "react";
import Link from "next/link";
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
  type LucideIcon,
} from "lucide-react";
import { useApp, type RoleCode } from "@/context/app-context";

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
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    deliverableStep: "Bước 1",
    summary: "Bàn làm việc trung tâm theo vai trò, chỉ số nhân sự và đối soát nhanh",
  },
  {
    id: "core-hr",
    label: "Hồ sơ & Tổ chức",
    section: "Quản trị cốt lõi",
    icon: Users,
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER"],
    badgeCount: 27,
    deliverableStep: "Bước 2",
    summary: "Cây sơ đồ khối phòng ban, danh bạ nhân viên và biến động nhân sự",
  },
  {
    id: "contracts",
    label: "Hợp đồng & Phụ lục",
    section: "Quản trị cốt lõi",
    icon: FileText,
    roles: ["SUPER_ADMIN", "HR_MANAGER"],
    badgeCount: 3,
    deliverableStep: "Bước 2",
    summary: "Quản lý hợp đồng lao động, cảnh báo đáo hạn trong 30 ngày",
  },
  {
    id: "ats",
    label: "Tuyển dụng & AI CV",
    section: "Quản trị cốt lõi",
    icon: UserCheck,
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER"],
    badgeCount: 8,
    deliverableStep: "Bước 2",
    summary: "Kanban 5 bước tuyển dụng và chấm điểm hồ sơ ứng viên tự động",
  },
  {
    id: "attendance",
    label: "Chấm công & Ca làm",
    section: "Vận hành",
    icon: Clock,
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    deliverableStep: "Bước 3",
    summary: "Bảng công tháng, phân ca HC-08:00 và đối soát đi muộn về sớm",
  },
  {
    id: "leaves",
    label: "Đơn từ & Phê duyệt",
    section: "Vận hành",
    icon: CalendarCheck,
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    badgeCount: 5,
    deliverableStep: "Bước 3",
    summary: "Nghỉ phép năm, đăng ký làm thêm giờ và giải trình chấm công",
  },
  {
    id: "payroll",
    label: "Bảng lương & Thuế",
    section: "Vận hành",
    icon: Wallet,
    roles: ["SUPER_ADMIN", "HR_MANAGER"],
    deliverableStep: "Bước 3",
    summary: "Tính lương Gross sang Net, BHXH 10.5%, giảm trừ gia cảnh và thuế TNCN",
  },
  {
    id: "payslip",
    label: "Phiếu lương cá nhân",
    section: "Vận hành",
    icon: Receipt,
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER", "EMPLOYEE"],
    deliverableStep: "Bước 5",
    summary: "Chi tiết thu nhập, khấu trừ bảo hiểm và thực lĩnh chuyển khoản",
  },
  {
    id: "kpi",
    label: "Đánh giá & Cảnh báo AI",
    section: "Vận hành",
    icon: Activity,
    roles: ["SUPER_ADMIN", "HR_MANAGER", "DEPT_MANAGER"],
    badgeCount: 2,
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
    empCode: "NV-2024-008",
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

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { role, activeNav, setActiveNav } = useApp();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleSelectNav = (item: NavItem) => {
    setActiveNav(item.id);
    if (onMobileClose) {
      onMobileClose();
    }
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
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 lg:hidden"
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
                          className={`group flex h-8 w-full items-center justify-between rounded-lg px-3 text-left text-sm transition-colors ${
                            isActive
                              ? "bg-zinc-200/75 font-medium text-teal-700 dark:bg-zinc-900 dark:text-teal-400"
                              : "font-normal text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-200"
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
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
                              className={`ml-2 font-mono text-xs tabular-nums ${
                                isActive
                                  ? "text-teal-700 dark:text-teal-400"
                                  : "text-zinc-400 dark:text-zinc-500"
                              }`}
                            >
                              {item.id === "core-hr"
                                ? role === "DEPT_MANAGER"
                                  ? 6
                                  : 27
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
      {/* Sidebar footer */}
      <div className="shrink-0 border-t border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
        <Link
          href="/login"
          className="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
        >
          <span className="flex items-center gap-2">
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>Trang đăng nhập & đổi phiên</span>
          </span>
          <span className="font-mono text-[11px] text-zinc-400">/login</span>
        </Link>
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
    </>
  );
}
