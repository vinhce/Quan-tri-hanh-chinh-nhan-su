"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Sun,
  Moon,
  FileSpreadsheet,
  Clock,
  Eye,
  EyeOff,
  User,
  Briefcase,
} from "lucide-react";
import { useApp, type RoleCode } from "@/context/app-context";
import type { Department } from "@/mock/types";
import { fetchEmployeesMock } from "@/lib/mock-fetcher";
import { formatVND } from "@/lib/utils";

interface DemoAccount {
  role: RoleCode;
  shortLabel: string;
  roleTitle: string;
  empCode: string;
  fullName: string;
  email: string;
  department: string;
  shiftCode: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "SUPER_ADMIN",
    shortLabel: "Admin",
    roleTitle: "Quản trị hệ thống",
    empCode: "NV-2024-001",
    fullName: "Nguyễn Văn An",
    email: "an.nguyen@lacviethrm.vn",
    department: "Ban Điều hành",
    shiftCode: "HC-08:00",
  },
  {
    role: "HR_MANAGER",
    shortLabel: "HR Manager",
    roleTitle: "Trưởng phòng Nhân sự",
    empCode: "NV-2024-002",
    fullName: "Trần Thị Bích Ngọc",
    email: "ngoc.tran@lacviethrm.vn",
    department: "Phòng Nhân sự & Hành chính",
    shiftCode: "HC-08:00",
  },
  {
    role: "DEPT_MANAGER",
    shortLabel: "Trưởng phòng",
    roleTitle: "Trưởng bộ phận",
    empCode: "NV-2024-003",
    fullName: "Lê Hoàng Nam",
    email: "nam.le@lacviethrm.vn",
    department: "Khối Công nghệ",
    shiftCode: "HC-08:30",
  },
  {
    role: "EMPLOYEE",
    shortLabel: "Nhân viên",
    roleTitle: "Nhân viên chính thức",
    empCode: "NV-2024-008",
    fullName: "Phạm Minh Tuấn",
    email: "tuan.pham@lacviethrm.vn",
    department: "Khối Công nghệ",
    shiftCode: "HC-08:30",
  },
];

const REGISTER_ROLE_OPTIONS: Array<{ value: RoleCode; label: string }> = [
  { value: "EMPLOYEE", label: "Nhân viên chính thức (EMPLOYEE)" },
  { value: "DEPT_MANAGER", label: "Trưởng bộ phận (DEPT_MANAGER)" },
  { value: "HR_MANAGER", label: "Trưởng phòng Nhân sự (HR_MANAGER)" },
];

const PREVIEW_PAYROLL_ROWS = [
  {
    empCode: "NV-2024-001",
    name: "Nguyễn Văn An",
    dept: "Ban Điều hành",
    shift: "HC-08:00",
    days: "22/22",
    gross: 45500000,
    insurance: 4777500,
    pit: 4294500,
    net: 36428000,
  },
  {
    empCode: "NV-2024-002",
    name: "Trần Thị Bích Ngọc",
    dept: "Nhân sự & Hành chính",
    shift: "HC-08:00",
    days: "22/22",
    gross: 26950000,
    insurance: 2829750,
    pit: 1218038,
    net: 22902212,
  },
  {
    empCode: "NV-2024-003",
    name: "Lê Hoàng Nam",
    dept: "Khối Công nghệ",
    shift: "HC-08:30",
    days: "21.5/22",
    gross: 31640000,
    insurance: 3322200,
    pit: 1847670,
    net: 26470130,
  },
  {
    empCode: "NV-2024-008",
    name: "Phạm Minh Tuấn",
    dept: "Khối Công nghệ",
    shift: "HC-08:30",
    days: "22/22",
    gross: 18550000,
    insurance: 1947750,
    pit: 310225,
    net: 16292025,
  },
];

const DEPT_HEADCOUNT_SHARES = [
  { name: "Khối Công nghệ & Sản phẩm", count: 64, budgetVnd: 1344000000, ratio: 43, isPrimary: true },
  { name: "Khối Kinh doanh & Giải pháp", count: 42, budgetVnd: 826000000, ratio: 28, isPrimary: false },
  { name: "Phòng Tài chính - Kế toán", count: 22, budgetVnd: 427000000, ratio: 15, isPrimary: false },
  { name: "Phòng Nhân sự & Hành chính", count: 20, budgetVnd: 378000000, ratio: 14, isPrimary: false },
];

function resolveRoleFromEmail(email: string, fallbackRole: RoleCode): RoleCode {
  const normalized = email.trim().toLowerCase();
  const matchedDemo = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === normalized);
  if (matchedDemo) return matchedDemo.role;
  if (normalized.includes("admin")) return "SUPER_ADMIN";
  if (normalized.includes("hr") || normalized.includes("nhansu")) return "HR_MANAGER";
  if (normalized.includes("manager") || normalized.includes("truongphong")) return "DEPT_MANAGER";
  return fallbackRole;
}

export default function LoginPage() {
  const router = useRouter();
  const { role, setAuthenticatedUser, setActiveNav, theme, toggleTheme, showToast } = useApp();

  const initialDemo = DEMO_ACCOUNTS.find((a) => a.role === role) ?? DEMO_ACCOUNTS[1];

  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<RoleCode>(initialDemo.role);

  // Login form state
  const [email, setEmail] = useState<string>(initialDemo.email);
  const [password, setPassword] = useState<string>("LacVietHRM@2026");
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Register form state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [regName, setRegName] = useState<string>("");
  const [regEmail, setRegEmail] = useState<string>("");
  const [regDept, setRegDept] = useState<string>("Khối Công nghệ");

  useEffect(() => {
    let cancelled = false;
    fetchEmployeesMock()
      .then((data) => {
        if (cancelled) return;
        setDepartments(data.MOCK_DEPARTMENTS);
        if (data.MOCK_DEPARTMENTS[0]?.department_name) {
          setRegDept(data.MOCK_DEPARTMENTS[0].department_name);
        }
      })
      .catch(() => {
        // Keep fallback department option if mock fetch fails
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [regRole, setRegRole] = useState<RoleCode>("EMPLOYEE");
  const [regPassword, setRegPassword] = useState<string>("");
  const [regConfirmPassword, setRegConfirmPassword] = useState<string>("");
  const [showRegPassword, setShowRegPassword] = useState<boolean>(false);
  const [showRegConfirm, setShowRegConfirm] = useState<boolean>(false);
  const [regError, setRegError] = useState<string | null>(null);

  const handleSelectDemo = (account: DemoAccount) => {
    setAuthTab("login");
    setSelectedRole(account.role);
    setEmail(account.email);
    setPassword("LacVietHRM@2026");
  };

  const handleForgotPassword = () => {
    showToast(
      "Khôi phục mật khẩu tài khoản",
      "Vui lòng liên hệ bộ phận IT nội bộ (it-support@lacviethrm.vn) hoặc Quản trị hệ thống để cấp lại mật khẩu",
      "default"
    );
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast(
        "Thiếu thông tin đăng nhập",
        "Vui lòng nhập đầy đủ email doanh nghiệp và mật khẩu",
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    const resolvedRole = resolveRoleFromEmail(email, selectedRole);
    const matchedDemo = DEMO_ACCOUNTS.find((a) => a.role === resolvedRole) ?? DEMO_ACCOUNTS[3];

    setAuthenticatedUser(resolvedRole, email.trim(), {
      fullName: matchedDemo.fullName,
      department: matchedDemo.department,
    });
    setActiveNav("dashboard");
    showToast(
      `Đã đăng nhập với vai trò ${matchedDemo.roleTitle}`,
      `${matchedDemo.fullName} (${matchedDemo.empCode}) · ${rememberMe ? "Ghi nhớ phiên" : "Phiên tạm thời"}`,
      "success"
    );
    router.push("/");
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (!regName.trim() || !regEmail.trim() || !regDept || !regPassword || !regConfirmPassword) {
      const msg = "Vui lòng điền đầy đủ thông tin bắt buộc trước khi tạo tài khoản";
      setRegError(msg);
      showToast("Thông tin chưa đầy đủ", msg, "error");
      return;
    }

    if (regPassword.length < 6) {
      const msg = "Mật khẩu phải có tối thiểu 6 ký tự";
      setRegError(msg);
      showToast("Mật khẩu không hợp lệ", msg, "error");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      const msg = "Mật khẩu xác nhận không khớp với mật khẩu đã nhập";
      setRegError(msg);
      showToast("Xác nhận mật khẩu chưa khớp", msg, "error");
      return;
    }

    setIsSubmitting(true);
    const roleLabel =
      REGISTER_ROLE_OPTIONS.find((opt) => opt.value === regRole)?.label ?? regRole;

    setAuthenticatedUser(regRole, regEmail.trim(), {
      fullName: regName.trim(),
      department: regDept,
    });
    setActiveNav("dashboard");
    showToast(
      "Tạo tài khoản thành công",
      `${regName.trim()} · ${regDept} · ${roleLabel}`,
      "success"
    );
    router.push("/");
  };

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Top minimal navigation bar */}
      <header className="flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white px-6 dark:border-zinc-800/80 dark:bg-zinc-950">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300/80 bg-zinc-50 text-teal-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
            <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Lạc Việt HRM
          </span>
          <span className="hidden rounded border border-zinc-200/80 bg-zinc-100 px-2 py-0.5 font-mono text-xs tabular-nums text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 sm:inline-block">
            Hệ thống quản trị nhân sự & bảng lương nội bộ
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400 md:inline">
            Kỳ hạch toán: Tháng 11/2026
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Chuyển chế độ sáng tối"
            className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {theme === "light" ? (
              <>
                <Moon className="h-4 w-4" strokeWidth={1.5} />
                <span>Giao diện tối</span>
              </>
            ) : (
              <>
                <Sun className="h-4 w-4" strokeWidth={1.5} />
                <span>Giao diện sáng</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main asymmetric split layout */}
      <main className="mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-[1520px] grid-cols-1 lg:grid-cols-12">
        {/* Left column (5 cols): Auth tabs (Login / Register) + compact quick role pills */}
        <section className="flex flex-col justify-center border-b border-zinc-200/80 bg-white px-6 py-8 dark:border-zinc-800/80 dark:bg-zinc-900/40 sm:px-10 lg:col-span-5 lg:border-b-0 lg:border-r">
          <div className="mx-auto w-full max-w-md">
            <div className="inline-flex items-center gap-2 rounded-md border border-zinc-200/80 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400"
                strokeWidth={1.5}
              />
              <span>Xác thực phân quyền theo vai trò (RBAC)</span>
            </div>

            <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {authTab === "login"
                ? "Đăng nhập cổng điều hành nhân sự"
                : "Đăng ký tài khoản nhân sự mới"}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {authTab === "login"
                ? "Truy cập không gian làm việc, bảng công và phiếu lương kỳ Tháng 11/2026"
                : "Khởi tạo hồ sơ truy cập theo phòng ban và vai trò đề xuất trong hệ thống"}
            </p>

            {/* Auth mode tabs */}
            <div
              role="tablist"
              aria-label="Chế độ xác thực"
              className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-zinc-200/80 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authTab === "login"}
                onClick={() => {
                  setAuthTab("login");
                  setRegError(null);
                }}
                className={`h-9 rounded-md text-xs font-medium transition-colors ${
                  authTab === "login"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === "register"}
                onClick={() => {
                  setAuthTab("register");
                  setRegError(null);
                }}
                className={`h-9 rounded-md text-xs font-medium transition-colors ${
                  authTab === "register"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Đăng ký tài khoản
              </button>
            </div>

            {/* TAB 1: LOGIN FORM */}
            {authTab === "login" && (
              <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Email doanh nghiệp
                  </label>
                  <div className="relative mt-1.5">
                    <Mail
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                      strokeWidth={1.5}
                    />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      placeholder="ten.nhanvien@lacviethrm.vn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-300/80 bg-white pl-9 pr-3 text-sm text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Mật khẩu
                    </label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      Quên mật khẩu
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <Lock
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                      strokeWidth={1.5}
                    />
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-300/80 bg-white pl-9 pr-10 font-mono text-sm text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      aria-label={showLoginPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      {showLoginPassword ? (
                        <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                      ) : (
                        <Eye className="h-4 w-4" strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-teal-400"
                    />
                    <span>Ghi nhớ đăng nhập</span>
                  </label>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    Phiên 8 giờ
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
                >
                  <span>
                    {isSubmitting
                      ? "Đang khởi tạo không gian làm việc..."
                      : "Đăng nhập vào hệ thống"}
                  </span>
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </form>
            )}

            {/* TAB 2: REGISTER FORM */}
            {authTab === "register" && (
              <form onSubmit={handleRegisterSubmit} className="mt-5 space-y-3.5">
                {regError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400"
                  >
                    {regError}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="register-name"
                    className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Họ và tên
                  </label>
                  <div className="relative mt-1.5">
                    <User
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                      strokeWidth={1.5}
                    />
                    <input
                      id="register-name"
                      name="fullName"
                      type="text"
                      required
                      placeholder="Nguyễn Minh Khôi"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-300/80 bg-white pl-9 pr-3 text-sm text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-email"
                    className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Email doanh nghiệp
                  </label>
                  <div className="relative mt-1.5">
                    <Mail
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                      strokeWidth={1.5}
                    />
                    <input
                      id="register-email"
                      name="email"
                      type="email"
                      required
                      placeholder="khoi.nguyen@lacviethrm.vn"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-300/80 bg-white pl-9 pr-3 text-sm text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="register-dept"
                      className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Phòng ban
                    </label>
                    <div className="relative mt-1.5">
                      <Briefcase
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                        strokeWidth={1.5}
                      />
                      <select
                        id="register-dept"
                        name="department"
                        value={regDept}
                        onChange={(e) => setRegDept(e.target.value)}
                        className="h-9 w-full rounded-lg border border-zinc-300/80 bg-white pl-9 pr-3 text-xs text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                      >
                        {departments.length > 0 ? (
                          departments.map((dept) => (
                            <option key={dept.id} value={dept.department_name}>
                              {dept.department_name}
                            </option>
                          ))
                        ) : (
                          <option value="Khối Công nghệ">Khối Công nghệ</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="register-role"
                      className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Vai trò đề xuất
                    </label>
                    <select
                      id="register-role"
                      name="role"
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value as RoleCode)}
                      className="mt-1.5 h-9 w-full rounded-lg border border-zinc-300/80 bg-white px-3 text-xs text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                    >
                      {REGISTER_ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="register-password"
                      className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Mật khẩu
                    </label>
                    <div className="relative mt-1.5">
                      <Lock
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                        strokeWidth={1.5}
                      />
                      <input
                        id="register-password"
                        name="password"
                        type={showRegPassword ? "text" : "password"}
                        required
                        placeholder="Tối thiểu 6 ký tự"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="h-9 w-full rounded-lg border border-zinc-300/80 bg-white pl-9 pr-9 font-mono text-xs text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        aria-label={showRegPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        {showRegPassword ? (
                          <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                        ) : (
                          <Eye className="h-4 w-4" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="register-confirm-password"
                      className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Xác nhận mật khẩu
                    </label>
                    <div className="relative mt-1.5">
                      <Lock
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                        strokeWidth={1.5}
                      />
                      <input
                        id="register-confirm-password"
                        name="confirmPassword"
                        type={showRegConfirm ? "text" : "password"}
                        required
                        placeholder="Nhập lại mật khẩu"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        className="h-9 w-full rounded-lg border border-zinc-300/80 bg-white pl-9 pr-9 font-mono text-xs text-zinc-900 focus:border-teal-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirm((prev) => !prev)}
                        aria-label={
                          showRegConfirm ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"
                        }
                        className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        {showRegConfirm ? (
                          <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                        ) : (
                          <Eye className="h-4 w-4" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
                >
                  <span>
                    {isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản và truy cập"}
                  </span>
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </form>
            )}

            {/* Compact quick-demo account pills below form */}
            <div className="mt-6 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80">
              <div className="mb-2.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Trải nghiệm nhanh theo vai trò</span>
                <span className="font-mono tabular-nums">4 tài khoản mẫu</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isSelected = selectedRole === acc.role && authTab === "login";
                  return (
                    <button
                      key={acc.role}
                      type="button"
                      onClick={() => handleSelectDemo(acc)}
                      className={`flex h-9 items-center justify-center rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                        isSelected
                          ? "border-teal-700 bg-teal-50/60 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-400"
                          : "border-zinc-200/80 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <span className="truncate">{acc.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Right column (7 cols): Real product preview — Payroll & HR Operations Ledger */}
        <section className="flex flex-col justify-center bg-zinc-100/70 p-6 dark:bg-zinc-950 sm:p-10 lg:col-span-7">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {/* Context caption */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Bản xem trước sổ cái điều hành nhân sự & kỳ lương Tháng 11/2026
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Đối soát trực tiếp công chuẩn, khấu trừ BHXH 10.5%, thuế TNCN lũy tiến và thực lĩnh chuyển khoản
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 font-mono text-xs tabular-nums text-teal-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Chốt công: 25/11/2026</span>
              </span>
            </div>

            {/* 3 KPI Stat Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Tổng nhân sự hiện hữu
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  148 người
                </p>
                <p className="mt-1 text-xs text-teal-700 dark:text-teal-400">
                  +6 nhân sự mới so với tháng 10/2026
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Quỹ lương Gross tháng 11/2026
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatVND(2975000000)}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  +2,4% so với dự toán quý 4/2026
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Tỷ lệ chuyên cần đúng ca
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                  98,2%
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Ca chuẩn HC-08:00 & HC-08:30
                </p>
              </div>
            </div>

            {/* Main visual moment: Live Payroll Reconciliation Table */}
            <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 px-5 py-3.5 dark:border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet
                    className="h-4 w-4 text-teal-700 dark:text-teal-400"
                    strokeWidth={1.5}
                  />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Bảng đối soát tính lương mẫu (Gross → BHXH 10.5% → Thuế TNCN → Thực lĩnh)
                  </span>
                </div>
                <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  Đơn vị: VND
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200/80 bg-zinc-50/80 text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-950/50 dark:text-zinc-400">
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium">Mã NV</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium">Họ và tên</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium">Ca / Công</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                        Lương Gross
                      </th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                        BHXH (10.5%)
                      </th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                        Thuế TNCN
                      </th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                        Thực lĩnh Net
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                    {PREVIEW_PAYROLL_ROWS.map((row) => {
                      const isCurrentSelected =
                        DEMO_ACCOUNTS.find((d) => d.role === selectedRole)
                          ?.empCode === row.empCode;
                      return (
                        <tr
                          key={row.empCode}
                          className={
                            isCurrentSelected
                              ? "bg-teal-50/50 dark:bg-teal-950/25"
                              : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                          }
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-teal-700 dark:text-teal-400">
                            {row.empCode}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {row.name}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {row.dept}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                            <div>{row.shift}</div>
                            <div className="text-[11px] text-zinc-400">
                              {row.days} ngày
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                            {formatVND(row.gross)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                            -{formatVND(row.insurance)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                            -{formatVND(row.pit)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-medium tabular-nums text-teal-700 dark:text-teal-400">
                            {formatVND(row.net)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Secondary visual: Department headcount & salary allocation bars */}
            <div className="rounded-xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Cơ cấu định biên & ngân sách lương theo khối phòng ban
                </span>
                <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  Tổng: 148 nhân sự
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {DEPT_HEADCOUNT_SHARES.map((dept) => (
                  <div key={dept.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {dept.name}
                      </span>
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {dept.count} NV ({dept.ratio}%)
                        </span>
                        <span className="text-zinc-900 dark:text-zinc-100">
                          {formatVND(dept.budgetVnd)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${
                          dept.isPrimary
                            ? "bg-teal-700 dark:bg-teal-400"
                            : "bg-zinc-400 dark:bg-zinc-600"
                        }`}
                        style={{ width: `${dept.ratio}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
