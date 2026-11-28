"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  loginServerHrmSession,
  registerServerHrmSession,
  syncServerHrmSession,
  useApp,
  type RoleCode,
} from "@/context/app-context";
import { MOCK_CANDIDATES } from "@/mock/ats";
import { MOCK_EMPLOYEES } from "@/mock/employees";
import type {
  Candidate,
  Department,
  Employee,
  PreboardingInvite,
  SystemUserAccount,
} from "@/mock/types";
import { recordAuditLog } from "@/lib/audit-logger";
import { fetchEmployeesMock } from "@/lib/mock-fetcher";
import {
  activateEmployeeAccountIfPreboardingVerified,
  findSystemUserForLogin,
  generateNextEmployeeCode,
  getPreboardingInvites,
  getSystemUsers,
  mergeWithRuntimeCandidates,
  mergeWithRuntimeEmployees,
  saveLeaveBalance,
  saveRuntimeEmployee,
  saveSystemUser,
} from "@/lib/runtime-store";
import { formatVND } from "@/lib/utils";

type StoredUserWithPassword = SystemUserAccount & { password?: string };

const DEFAULT_DEMO_PASSWORD_SHA256 =
  "5e74231b0bc87aadeff98b949482afacf553b2e10a57a6631715a01bc05f3c4a";

async function sha256Hex(raw: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(raw);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return "";
}

async function verifyPasswordOfflineFallback(
  inputPassword: string,
  storedPassword?: string
): Promise<boolean> {
  if (!inputPassword) return false;
  if (typeof storedPassword === "string" && storedPassword.length > 0) {
    if (storedPassword.startsWith("sha256:")) {
      const inputHash = await sha256Hex(inputPassword);
      return inputHash !== "" && `sha256:${inputHash}` === storedPassword;
    }
    return inputPassword === storedPassword;
  }
  const inputHash = await sha256Hex(inputPassword);
  return inputHash === DEFAULT_DEMO_PASSWORD_SHA256;
}

async function syncRuntimeKeysToServer(keys: string[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await Promise.all(
      keys.map(async (key) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return;
        const items = JSON.parse(raw) as unknown;
        if (!Array.isArray(items)) return;
        await fetch("/api/hrm/sync", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, items }),
        });
      })
    );
  } catch {
    // Ignore sync errors in offline or static-export mode
  }
}

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
    role: "DIRECTOR",
    shortLabel: "Giám đốc",
    roleTitle: "Giám đốc Điều hành",
    empCode: "NV-2024-000",
    fullName: "Trần Quốc Việt",
    email: "viet.tran@hrm-enterprise.vn",
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
    empCode: "NV-2024-004",
    fullName: "Phạm Minh Tuấn",
    email: "tuan.pham@lacviethrm.vn",
    department: "Khối Công nghệ",
    shiftCode: "HC-08:30",
  },
  {
    role: "CANDIDATE",
    shortLabel: "Ứng viên",
    roleTitle: "Ứng viên tìm việc",
    empCode: "UV-2026-001",
    fullName: "Hoàng Vũ Minh",
    email: "minh.hoang@gmail.com",
    department: "Ứng viên dự tuyển",
    shiftCode: "N/A",
  },
];

const REGISTER_ROLE_OPTIONS: Array<{ value: "CANDIDATE" | "EMPLOYEE"; label: string }> = [
  { value: "CANDIDATE", label: "Ứng viên tìm việc (CANDIDATE)" },
  { value: "EMPLOYEE", label: "Nhân viên mới (EMPLOYEE)" },
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
    empCode: "NV-2024-004",
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

function resolveRoleFromEmail(email: string): RoleCode | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const existingAuth = findSystemUserForLogin(normalized);
  if (
    existingAuth.user?.account_status === "ACTIVE" &&
    existingAuth.user?.is_active !== false
  ) {
    return existingAuth.user.role_code;
  }
  if (existingAuth.employee?.role_code) {
    return existingAuth.employee.role_code;
  }

  const matchedDemo = DEMO_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === normalized
  );
  if (matchedDemo) {
    return matchedDemo.role;
  }

  return null;
}

function normalizePhoneForLookup(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 10) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

function findMatchingCandidate(rawInput: string): Candidate | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  const targetEmail = trimmed.toLowerCase();
  const targetPhone = normalizePhoneForLookup(trimmed);
  const canMatchPhone = targetPhone.length >= 9 && !trimmed.includes("@");

  const allCandidates = mergeWithRuntimeCandidates(MOCK_CANDIDATES);
  const matched = allCandidates.filter((cand) => {
    if (cand.email.trim().toLowerCase() === targetEmail) return true;
    if (canMatchPhone && normalizePhoneForLookup(cand.phone) === targetPhone) {
      return true;
    }
    return false;
  });

  if (matched.length === 0) return null;
  const sorted = [...matched].sort((a, b) => {
    const aRej = a.stage === "REJECTED" ? 1 : 0;
    const bRej = b.stage === "REJECTED" ? 1 : 0;
    if (aRej !== bRej) return aRej - bRej;
    return b.applied_date.localeCompare(a.applied_date);
  });
  return sorted[0];
}

function isCandidateBlockedByLifecycle(
  candEmail: string,
  candPhone?: string
): string | null {
  const normEmail = candEmail.trim().toLowerCase();
  const normPhone = candPhone ? normalizePhoneForLookup(candPhone) : "";
  const allEmployees = mergeWithRuntimeEmployees(MOCK_EMPLOYEES);
  const matchedInvite = getPreboardingInvites().find((inv) => {
    const invPersonal = inv.personal_email?.trim().toLowerCase() || "";
    const invEmail = inv.email?.trim().toLowerCase() || "";
    if (normEmail && (invPersonal === normEmail || invEmail === normEmail)) {
      return true;
    }
    if (
      normPhone.length >= 9 &&
      inv.phone &&
      normalizePhoneForLookup(inv.phone) === normPhone
    ) {
      return true;
    }
    return false;
  });

  const matchedEmp = allEmployees.find((emp) => {
    if (
      normEmail &&
      (emp.email?.trim().toLowerCase() === normEmail ||
        emp.personal_email?.trim().toLowerCase() === normEmail)
    ) {
      return true;
    }
    if (
      normPhone.length >= 9 &&
      emp.phone &&
      normalizePhoneForLookup(emp.phone) === normPhone
    ) {
      return true;
    }
    if (
      matchedInvite &&
      (emp.employee_code === matchedInvite.employee_code ||
        emp.id === matchedInvite.employee_id)
    ) {
      return true;
    }
    return false;
  });

  if (matchedEmp?.employment_status === "RESIGNED") {
    return "Nhân sự đã hoàn tất thủ tục nghỉ việc — quyền truy cập hồ sơ và tài khoản đã được thu hồi.";
  }

  const authByCandEmail = normEmail ? findSystemUserForLogin(normEmail) : null;
  const authByEmpEmail =
    matchedEmp?.email && matchedEmp.email.trim().toLowerCase() !== normEmail
      ? findSystemUserForLogin(matchedEmp.email)
      : null;
  const authByEmpCode = matchedEmp?.employee_code
    ? findSystemUserForLogin(matchedEmp.employee_code)
    : null;
  const authByInviteEmpCode =
    matchedInvite?.employee_code &&
    matchedInvite.employee_code !== matchedEmp?.employee_code
      ? findSystemUserForLogin(matchedInvite.employee_code)
      : null;
  const authByInviteEmail =
    matchedInvite?.email &&
    matchedInvite.email.trim().toLowerCase() !== normEmail
      ? findSystemUserForLogin(matchedInvite.email)
      : null;

  const lockedUser =
    [
      authByCandEmail?.user,
      authByEmpEmail?.user,
      authByEmpCode?.user,
      authByInviteEmpCode?.user,
      authByInviteEmail?.user,
    ].find((u) => u?.account_status === "LOCKED") ??
    getSystemUsers().find(
      (u) =>
        u.account_status === "LOCKED" &&
        ((normEmail && u.email.trim().toLowerCase() === normEmail) ||
          (matchedEmp && u.employee_code === matchedEmp.employee_code) ||
          (matchedInvite &&
            (u.employee_code === matchedInvite.employee_code ||
              (matchedInvite.email &&
                u.email.trim().toLowerCase() ===
                  matchedInvite.email.trim().toLowerCase()))))
    );

  if (lockedUser) {
    return (
      lockedUser.locked_reason ||
      "Tài khoản đang bị khóa truy cập bởi Quản trị hệ thống. Vui lòng liên hệ Phòng Nhân sự."
    );
  }

  return null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, setAuthenticatedUser, setActiveNav, theme, toggleTheme, showToast } = useApp();

  const initialDemo = DEMO_ACCOUNTS.find((a) => a.role === role) ?? DEMO_ACCOUNTS[1];

  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<RoleCode>(initialDemo.role);

  // Login form state
  const [email, setEmail] = useState<string>(initialDemo.email);
  const [password, setPassword] = useState<string>("");
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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

  const handleSelectDemo = async (account: DemoAccount) => {
    if (isSubmitting) return;
    setAuthTab("login");
    setLoginError(null);
    setSelectedRole(account.role);
    setEmail(account.email);
    setPassword("");

    if (account.role === "CANDIDATE") {
      const matchedDemoCand = findMatchingCandidate(account.email);
      if (matchedDemoCand) {
        loginAsCandidateRecord(matchedDemoCand);
        return;
      }
      setIsSubmitting(true);
      recordAuditLog({
        actor_name: account.fullName,
        actor_code: account.empCode,
        actor_role: "CANDIDATE",
        action: "LOGIN",
        target: account.email,
        detail: "Đăng nhập nhanh Demo với vai trò Ứng viên (CANDIDATE).",
        status: "SUCCESS",
      });
      setAuthenticatedUser("CANDIDATE", account.email, {
        fullName: account.fullName,
        department: account.department,
        employee_code: account.empCode,
        email: account.email,
        title: account.roleTitle,
      });
      setActiveNav("dashboard");
      showToast(
        `Đã mở Cổng Ứng viên (${account.fullName})`,
        `${account.empCode} · ${account.email}`,
        "success"
      );
      router.push("/candidate");
      return;
    }

    setIsSubmitting(true);
    await syncServerHrmSession(account.role);
    recordAuditLog({
      actor_name: account.fullName,
      actor_code: account.empCode,
      actor_role: account.role,
      action: "LOGIN",
      target: account.email,
      detail: `Đăng nhập nhanh Demo với vai trò ${account.role}.`,
      status: "SUCCESS",
    });
    setAuthenticatedUser(account.role, account.email, {
      fullName: account.fullName,
      department: account.department,
      employee_code: account.empCode,
      email: account.email,
      title: account.roleTitle,
    });
    setActiveNav("dashboard");
    showToast(
      `Đã đăng nhập nhanh (${account.roleTitle})`,
      `${account.fullName} (${account.empCode})`,
      "success"
    );
    router.push("/app");
  };

  const loginAsCandidateRecord = (cand: Candidate) => {
    setIsSubmitting(true);
    recordAuditLog({
      actor_name: cand.full_name,
      actor_code: cand.candidate_code,
      actor_role: "CANDIDATE",
      action: "LOGIN",
      target: cand.email,
      detail: "Tra cứu hồ sơ ứng tuyển nhanh theo thông tin ứng viên.",
      status: "SUCCESS",
    });
    setAuthenticatedUser("CANDIDATE", cand.email, {
      fullName: cand.full_name,
      department: "Ứng viên dự tuyển",
      employee_code: cand.candidate_code,
      title: cand.job_title,
    });
    setActiveNav("dashboard");
    showToast(
      "Đã mở hồ sơ ứng tuyển",
      `${cand.full_name} (${cand.candidate_code}) · ${cand.job_title}`,
      "success"
    );
    router.push("/candidate");
  };

  const findVerifiedPreboardingInvite = (
    rawIdentifier: string,
    cand?: Candidate | null
  ): PreboardingInvite | null => {
    const normInput = rawIdentifier.trim().toLowerCase();
    const candEmail = cand?.email?.trim().toLowerCase() || "";
    const candCode = cand?.candidate_code?.trim().toLowerCase() || "";
    const candToken = (
      cand as (Candidate & { preboarding_token?: string }) | null | undefined
    )?.preboarding_token
      ?.trim()
      .toLowerCase();

    return (
      getPreboardingInvites().find((inv) => {
        if (inv.status !== "VERIFIED") return false;
        const invPersonal = inv.personal_email?.trim().toLowerCase() || "";
        const invCompany = inv.email?.trim().toLowerCase() || "";
        const invCandCode = inv.candidate_code?.trim().toLowerCase() || "";
        const invEmpCode = inv.employee_code?.trim().toLowerCase() || "";
        const invToken = inv.token?.trim().toLowerCase() || "";
        return (
          (Boolean(normInput) &&
            (invPersonal === normInput ||
              invCompany === normInput ||
              invEmpCode === normInput)) ||
          (Boolean(candEmail) &&
            (invPersonal === candEmail || invCompany === candEmail)) ||
          (Boolean(candCode) && invCandCode === candCode) ||
          (Boolean(candToken) && invToken === candToken)
        );
      }) ?? null
    );
  };

  const tryLoginAsActivatedEmployee = async (
    identifier: string,
    matchedCand?: Candidate | null,
    inputPassword?: string
  ): Promise<
    | "SUCCESS"
    | "WRONG_PASSWORD"
    | { status: "SERVER_BLOCKED"; message: string }
    | false
  > => {
    const checkEmail = matchedCand?.email || identifier;
    const lifecycleBlock = isCandidateBlockedByLifecycle(
      checkEmail,
      matchedCand?.phone
    );
    if (lifecycleBlock) return false;

    const normInput = identifier.trim().toLowerCase();
    const normCandEmail = matchedCand?.email?.trim().toLowerCase() || "";
    const allEmployees = mergeWithRuntimeEmployees(MOCK_EMPLOYEES);
    const linkedEmp = allEmployees.find((emp) => {
      const empEmail = emp.email?.trim().toLowerCase() || "";
      const empPersonal = emp.personal_email?.trim().toLowerCase() || "";
      return (
        (Boolean(normInput) &&
          (empEmail === normInput || empPersonal === normInput)) ||
        (Boolean(normCandEmail) &&
          (empEmail === normCandEmail || empPersonal === normCandEmail))
      );
    });
    if (linkedEmp?.employment_status === "RESIGNED") return false;

    let authResult = findSystemUserForLogin(identifier);
    if (!authResult.user && matchedCand?.email && normCandEmail !== normInput) {
      authResult = findSystemUserForLogin(matchedCand.email);
    }
    if (!authResult.user && linkedEmp?.employee_code) {
      authResult = findSystemUserForLogin(linkedEmp.employee_code);
    }

    if (
      authResult.employee?.employment_status === "RESIGNED" ||
      authResult.user?.account_status === "LOCKED"
    ) {
      return false;
    }

    const verifiedInvite = findVerifiedPreboardingInvite(identifier, matchedCand);

    let activeUser =
      authResult.user?.account_status === "ACTIVE" &&
      authResult.user?.is_active === true &&
      authResult.user.role_code !== "CANDIDATE"
        ? authResult.user
        : null;

    if (!activeUser && verifiedInvite) {
      const activationKey =
        verifiedInvite.employee_code ||
        verifiedInvite.personal_email ||
        checkEmail;
      const activated =
        activateEmployeeAccountIfPreboardingVerified(identifier) ??
        activateEmployeeAccountIfPreboardingVerified(activationKey);
      if (
        activated &&
        activated.account_status === "ACTIVE" &&
        activated.is_active === true &&
        activated.role_code !== "CANDIDATE"
      ) {
        activeUser = activated;
        authResult = findSystemUserForLogin(
          activated.email || activated.employee_code
        );
      } else {
        const refreshed = findSystemUserForLogin(activationKey);
        if (
          refreshed.user?.account_status === "ACTIVE" &&
          refreshed.user?.is_active === true &&
          refreshed.user.role_code !== "CANDIDATE"
        ) {
          activeUser = refreshed.user;
          authResult = refreshed;
        }
      }
    }

    if (!activeUser) return false;

    if (
      authResult.employee?.employment_status === "RESIGNED" ||
      authResult.user?.account_status === "LOCKED"
    ) {
      return false;
    }

    const activeUserPwd = (activeUser as StoredUserWithPassword).password;
    if (!inputPassword) {
      return "WRONG_PASSWORD";
    }

    const employee = authResult.employee ?? linkedEmp ?? null;
    const nextRole: RoleCode =
      activeUser.role_code && activeUser.role_code !== "CANDIDATE"
        ? activeUser.role_code
        : "EMPLOYEE";
    const companyEmail =
      activeUser.email || employee?.email || verifiedInvite?.email || identifier;
    const fullName =
      employee?.full_name ||
      activeUser.full_name ||
      matchedCand?.full_name ||
      companyEmail;
    const employeeCode =
      activeUser.employee_code ||
      employee?.employee_code ||
      verifiedInvite?.employee_code ||
      "";
    const department =
      employee?.department_name ||
      activeUser.department_name ||
      verifiedInvite?.department_name ||
      "Phòng ban chuyên môn";
    const departmentId =
      employee?.department_id || verifiedInvite?.department_id;
    const title =
      employee?.position_name ||
      activeUser.position_name ||
      verifiedInvite?.position_name ||
      "Nhân viên chính thức";

    const serverAuth = await loginServerHrmSession({
      email: companyEmail,
      password: inputPassword,
    });
    if (!serverAuth.networkError) {
      if (
        serverAuth.status === 401 ||
        serverAuth.status === 403 ||
        serverAuth.status === 429 ||
        !serverAuth.ok
      ) {
        return {
          status: "SERVER_BLOCKED",
          message:
            serverAuth.error?.message ||
            "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.",
        };
      }
    } else {
      const validOffline = await verifyPasswordOfflineFallback(
        inputPassword,
        activeUserPwd
      );
      if (!validOffline) {
        return "WRONG_PASSWORD";
      }
    }

    setIsSubmitting(true);
    recordAuditLog({
      actor_name: fullName,
      actor_code: employeeCode || "EMP-ACTIVE",
      actor_role: nextRole,
      action: "LOGIN",
      target: companyEmail,
      detail: `Đăng nhập trực tiếp vào không gian Nhân viên (${nextRole}) sau khi tài khoản đã kích hoạt.`,
      status: "SUCCESS",
    });

    setAuthenticatedUser(nextRole, companyEmail, {
      fullName,
      employee_code: employeeCode,
      email: companyEmail,
      department,
      department_id: departmentId,
      title,
    });
    setActiveNav("dashboard");
    showToast(
      "Đã vào không gian làm việc Nhân viên",
      `${fullName}${employeeCode ? ` (${employeeCode})` : ""} · ${companyEmail}`,
      "success"
    );
    router.push("/app");
    return "SUCCESS";
  };

  const handleForgotPassword = () => {
    showToast(
      "Khôi phục mật khẩu tài khoản",
      "Vui lòng liên hệ bộ phận IT nội bộ (it-support@lacviethrm.vn) hoặc Quản trị hệ thống để cấp lại mật khẩu",
      "default"
    );
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      showToast(
        "Thiếu thông tin đăng nhập",
        "Vui lòng nhập đầy đủ email doanh nghiệp và mật khẩu",
        "error"
      );
      return;
    }

    const matchedCand = findMatchingCandidate(trimmedEmail);
    const authCheck = findSystemUserForLogin(trimmedEmail);
    const candLifecycleBlock = matchedCand
      ? isCandidateBlockedByLifecycle(matchedCand.email, matchedCand.phone)
      : isCandidateBlockedByLifecycle(trimmedEmail);
    const isResignedOrLocked =
      Boolean(candLifecycleBlock) ||
      authCheck.employee?.employment_status === "RESIGNED" ||
      authCheck.user?.account_status === "LOCKED";
    const hasActiveEmployeeAccount =
      Boolean(authCheck.user?.is_active) &&
      authCheck.user?.account_status === "ACTIVE" &&
      authCheck.user?.role_code !== "CANDIDATE";
    const isPendingOnboardAccount =
      !hasActiveEmployeeAccount &&
      (authCheck.user?.account_status === "INACTIVE" ||
        authCheck.employee?.employment_status === "PENDING_ONBOARD");
    const verifiedPreboardingInvite = findVerifiedPreboardingInvite(
      trimmedEmail,
      matchedCand
    );

    if (
      matchedCand &&
      candLifecycleBlock &&
      (selectedRole === "CANDIDATE" || !authCheck.user || !password)
    ) {
      recordAuditLog({
        actor_name: matchedCand.full_name,
        actor_code: matchedCand.candidate_code || "AUTH-LOCK",
        actor_role: "CANDIDATE",
        action: "LOGIN",
        target: matchedCand.email,
        detail: candLifecycleBlock,
        status: "BLOCKED",
      });
      setLoginError(candLifecycleBlock);
      showToast("Tài khoản đã bị khóa", candLifecycleBlock, "error");
      return;
    }

    if (
      !isResignedOrLocked &&
      (matchedCand || verifiedPreboardingInvite) &&
      (verifiedPreboardingInvite || hasActiveEmployeeAccount)
    ) {
      if (!password.trim()) {
        showToast(
          "Yêu cầu nhập mật khẩu",
          "Hồ sơ đã được HR duyệt & kích hoạt tài khoản Nhân viên! Vui lòng nhập mật khẩu để vào không gian làm việc Nhân viên (/app).",
          "error"
        );
        return;
      }
      const activatedRes = await tryLoginAsActivatedEmployee(
        trimmedEmail,
        matchedCand,
        password
      );
      if (activatedRes === "WRONG_PASSWORD") {
        const pwdErr = "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.";
        setLoginError(pwdErr);
        showToast("Sai thông tin đăng nhập", pwdErr, "error");
        return;
      }
      if (
        typeof activatedRes === "object" &&
        activatedRes !== null &&
        activatedRes.status === "SERVER_BLOCKED"
      ) {
        setLoginError(activatedRes.message);
        showToast("Đăng nhập thất bại", activatedRes.message, "error");
        return;
      }
      if (activatedRes === "SUCCESS") {
        return;
      }
    }

    const existingStoredPwd = (authCheck.user as StoredUserWithPassword | null)
      ?.password;
    if (
      !isResignedOrLocked &&
      matchedCand &&
      !existingStoredPwd &&
      (selectedRole === "CANDIDATE" ||
        !authCheck.user ||
        isPendingOnboardAccount)
    ) {
      loginAsCandidateRecord(matchedCand);
      return;
    }

    if (!password.trim()) {
      showToast(
        "Thiếu thông tin đăng nhập",
        "Vui lòng nhập đầy đủ email doanh nghiệp và mật khẩu",
        "error"
      );
      return;
    }

    if (isResignedOrLocked || !authCheck.canLogin) {
      setIsSubmitting(false);
      const blockReason =
        candLifecycleBlock ||
        authCheck.blockReason ||
        "Tài khoản của bạn hiện ở trạng thái không hoạt động. Vui lòng liên hệ Phòng Nhân sự hoặc Bộ phận CNTT.";
      recordAuditLog({
        actor_name:
          authCheck.user?.full_name ||
          authCheck.employee?.full_name ||
          matchedCand?.full_name ||
          trimmedEmail,
        actor_code:
          authCheck.user?.employee_code ||
          authCheck.employee?.employee_code ||
          matchedCand?.candidate_code ||
          "AUTH-LOCK",
        actor_role:
          authCheck.user?.role_code ||
          authCheck.employee?.role_code ||
          "EMPLOYEE",
        action: "LOGIN",
        target: trimmedEmail,
        detail: blockReason,
        status: "BLOCKED",
      });
      setLoginError(blockReason);
      showToast("Tài khoản đã bị khóa", blockReason, "error");
      return;
    }

    const resolvedRole: RoleCode | null =
      authCheck.user?.role_code ??
      authCheck.employee?.role_code ??
      resolveRoleFromEmail(trimmedEmail) ??
      (matchedCand ? "CANDIDATE" : null);

    if (!resolvedRole) {
      setIsSubmitting(false);
      const unknownMsg =
        "Tài khoản không tồn tại trong danh sách người dùng nội bộ hoặc hồ sơ ứng viên. Vui lòng kiểm tra lại email hoặc đăng ký tài khoản mới.";
      recordAuditLog({
        actor_name: trimmedEmail,
        actor_code: "AUTH-UNKNOWN",
        actor_role: "EMPLOYEE",
        action: "LOGIN",
        target: trimmedEmail,
        detail: "Từ chối đăng nhập email không tồn tại trong hệ thống.",
        status: "BLOCKED",
      });
      setLoginError(unknownMsg);
      showToast("Tài khoản không tồn tại", unknownMsg, "error");
      return;
    }

    setIsSubmitting(true);
    const matchedDemo =
      DEMO_ACCOUNTS.find((a) => a.role === resolvedRole) ?? DEMO_ACCOUNTS[4];

    const isCustomCandidateEmail =
      resolvedRole === "CANDIDATE" &&
      trimmedEmail.toLowerCase() !== "minh.hoang@gmail.com";

    const resolvedLoginEmail =
      resolvedRole !== "CANDIDATE"
        ? authCheck.user?.email || authCheck.employee?.email || trimmedEmail
        : trimmedEmail;

    if (resolvedRole !== "CANDIDATE") {
      const serverAuth = await loginServerHrmSession({
        email: resolvedLoginEmail,
        password,
      });

      if (!serverAuth.networkError) {
        if (
          serverAuth.status === 401 ||
          serverAuth.status === 403 ||
          serverAuth.status === 429 ||
          !serverAuth.ok
        ) {
          setIsSubmitting(false);
          const errMsg =
            serverAuth.error?.message ||
            "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.";
          recordAuditLog({
            actor_name:
              authCheck.user?.full_name ||
              authCheck.employee?.full_name ||
              trimmedEmail,
            actor_code:
              authCheck.user?.employee_code ||
              authCheck.employee?.employee_code ||
              "AUTH-FAIL",
            actor_role: resolvedRole,
            action: "LOGIN",
            target: trimmedEmail,
            detail: errMsg,
            status: "BLOCKED",
          });
          setLoginError(errMsg);
          showToast("Đăng nhập thất bại", errMsg, "error");
          return;
        }
      } else {
        const validOffline = await verifyPasswordOfflineFallback(
          password,
          existingStoredPwd
        );
        if (!validOffline) {
          setIsSubmitting(false);
          const pwdMsg =
            "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.";
          recordAuditLog({
            actor_name:
              authCheck.user?.full_name ||
              authCheck.employee?.full_name ||
              trimmedEmail,
            actor_code:
              authCheck.user?.employee_code ||
              authCheck.employee?.employee_code ||
              "AUTH-FAIL",
            actor_role: resolvedRole,
            action: "LOGIN",
            target: trimmedEmail,
            detail: "Đăng nhập thất bại do mật khẩu không khớp.",
            status: "BLOCKED",
          });
          setLoginError(pwdMsg);
          showToast("Sai thông tin đăng nhập", pwdMsg, "error");
          return;
        }
      }
    } else if (typeof existingStoredPwd === "string" && existingStoredPwd.length > 0) {
      const validCandPwd = await verifyPasswordOfflineFallback(
        password,
        existingStoredPwd
      );
      if (!validCandPwd) {
        setIsSubmitting(false);
        const pwdMsg =
          "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.";
        recordAuditLog({
          actor_name: authCheck.user?.full_name || trimmedEmail,
          actor_code: authCheck.user?.employee_code || "AUTH-FAIL",
          actor_role: resolvedRole,
          action: "LOGIN",
          target: trimmedEmail,
          detail: "Đăng nhập thất bại do mật khẩu không khớp.",
          status: "BLOCKED",
        });
        setLoginError(pwdMsg);
        showToast("Sai thông tin đăng nhập", pwdMsg, "error");
        return;
      }
    }

    const effectiveFullName =
      authCheck.employee?.full_name ||
      authCheck.user?.full_name ||
      matchedCand?.full_name ||
      (isCustomCandidateEmail
        ? trimmedEmail.split("@")[0] || "Ứng viên"
        : matchedDemo.fullName);
    const effectiveDept = isCustomCandidateEmail
      ? "Ứng viên dự tuyển"
      : authCheck.employee?.department_name ||
        authCheck.user?.department_name ||
        matchedDemo.department;
    const effectiveEmpCode = isCustomCandidateEmail
      ? authCheck.employee?.employee_code ||
        authCheck.user?.employee_code ||
        matchedCand?.candidate_code ||
        ""
      : authCheck.employee?.employee_code ||
        authCheck.user?.employee_code ||
        matchedDemo.empCode;

    recordAuditLog({
      actor_name: effectiveFullName,
      actor_code: effectiveEmpCode,
      actor_role: resolvedRole,
      action: "LOGIN",
      target: resolvedLoginEmail,
      detail: `Đăng nhập thành công vào hệ thống với vai trò ${resolvedRole}.`,
      status: "SUCCESS",
    });

    setAuthenticatedUser(resolvedRole, resolvedLoginEmail, {
      fullName: effectiveFullName,
      department: effectiveDept,
      department_id: authCheck.employee?.department_id,
      employee_code: effectiveEmpCode,
      email: resolvedLoginEmail,
      title:
        authCheck.employee?.position_name ||
        authCheck.user?.position_name ||
        matchedDemo.roleTitle,
    });
    setActiveNav("dashboard");
    showToast(
      `Đã đăng nhập với vai trò ${matchedDemo.roleTitle}`,
      `${effectiveFullName} (${effectiveEmpCode}) · ${rememberMe ? "Ghi nhớ phiên" : "Phiên tạm thời"}`,
      "success"
    );
    const redirectParam = searchParams.get("redirect");
    const targetUrl =
      resolvedRole === "CANDIDATE"
        ? "/candidate"
        : redirectParam && redirectParam.startsWith("/app")
        ? redirectParam
        : "/app";
    router.push(targetUrl);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    const trimmedName = regName.trim();
    const normalizedRegEmail = regEmail.trim().toLowerCase();

    if (!trimmedName || !normalizedRegEmail || !regDept || !regPassword || !regConfirmPassword) {
      const msg = "Vui lòng điền đầy đủ thông tin bắt buộc trước khi tạo tài khoản";
      setRegError(msg);
      showToast("Thông tin chưa đầy đủ", msg, "error");
      return;
    }

    if (regRole !== "EMPLOYEE" && regRole !== "CANDIDATE") {
      const msg = "Chỉ cho phép đăng ký vai trò Nhân viên (EMPLOYEE) hoặc Ứng viên (CANDIDATE).";
      setRegError(msg);
      showToast("Vai trò không hợp lệ", msg, "error");
      return;
    }

    if (regPassword.length < 8) {
      const msg = "Mật khẩu phải có tối thiểu 8 ký tự";
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

    const existingCheck = findSystemUserForLogin(normalizedRegEmail);
    const demoCollision = DEMO_ACCOUNTS.some(
      (acc) => acc.email.toLowerCase() === normalizedRegEmail
    );
    if (existingCheck.user || existingCheck.employee || demoCollision) {
      const dupMsg =
        "Email này đã tồn tại trong hệ thống. Vui lòng đăng nhập hoặc sử dụng email khác.";
      setRegError(dupMsg);
      showToast("Email đã được đăng ký", dupMsg, "error");
      return;
    }

    setIsSubmitting(true);
    const safeRole: "EMPLOYEE" | "CANDIDATE" =
      regRole === "CANDIDATE" ? "CANDIDATE" : "EMPLOYEE";
    const roleLabel =
      REGISTER_ROLE_OPTIONS.find((opt) => opt.value === safeRole)?.label ?? safeRole;

    const matchedDept = departments.find((d) => d.department_name === regDept);
    const deptId = matchedDept?.id || "dept-tech-swe";
    const deptName = matchedDept?.department_name || regDept;
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);

    let assignedCode = "";
    let assignedTitle = "Ứng viên tìm việc";
    let assignedDeptLabel = "Ứng viên dự tuyển";
    const regPasswordHash = await sha256Hex(regPassword);
    const storedHashedPassword = regPasswordHash
      ? `sha256:${regPasswordHash}`
      : undefined;

    if (safeRole === "EMPLOYEE") {
      assignedCode = generateNextEmployeeCode();
      assignedTitle = "Nhân viên thử việc";
      assignedDeptLabel = deptName;
      const newEmpId = `emp-rt-${Date.now()}`;
      const nameParts = trimmedName.split(/\s+/).filter(Boolean);
      const initials =
        nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
          : trimmedName.slice(0, 2).toUpperCase();

      const runtimeEmp: Employee = {
        id: newEmpId,
        employee_code: assignedCode,
        full_name: trimmedName,
        email: normalizedRegEmail,
        phone: "",
        gender: "Nam",
        date_of_birth: "2000-01-01",
        national_id: "",
        tax_code: "",
        social_insurance_no: "",
        department_id: deptId,
        department_name: deptName,
        position_id: "pos-04",
        position_name: assignedTitle,
        manager_id: matchedDept?.manager_id || "emp-003",
        manager_name: matchedDept?.manager_name || "Lê Hoàng Nam",
        role_code: "EMPLOYEE",
        join_date: todayDate,
        employment_status: "PROBATION",
        contract_type: "PROBATION_2M",
        contract_start_date: todayDate,
        contract_end_date: null,
        contract_status: "PENDING_SIGN",
        base_salary_vnd: 0,
        allowance_meal_vnd: 0,
        allowance_transport_vnd: 0,
        allowance_position_vnd: 0,
        dependents_count: 0,
        bank_account_no: "",
        bank_name: "",
        work_shift_code: "HC-08:30",
        kpi_completion_rate: 0,
        burnout_risk_score: 0,
        burnout_risk_level: "LOW",
        turnover_risk_score: 0,
        turnover_risk_level: "LOW",
        ai_retention_note: "Tài khoản nhân sự mới tự đăng ký đang trong thời gian thử việc.",
        avatar_initials: initials || "NV",
      };
      saveRuntimeEmployee(runtimeEmp);

      saveLeaveBalance({
        id: `alb-rt-${assignedCode}-2026`,
        employee_id: newEmpId,
        employee_code: assignedCode,
        full_name: trimmedName,
        department_name: deptName,
        year: 2026,
        total_entitled_days: 0,
        carried_over_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: 0,
      });

      const newUserAccount: StoredUserWithPassword = {
        id: `usr-rt-${Date.now()}`,
        user_code: `USR-${assignedCode.slice(-3)}`,
        employee_id: newEmpId,
        employee_code: assignedCode,
        full_name: trimmedName,
        email: normalizedRegEmail,
        department_name: deptName,
        position_name: assignedTitle,
        role_code: "EMPLOYEE",
        mfa_enabled: false,
        account_status: "ACTIVE",
        is_active: true,
        last_login_at: nowIso,
        last_login_ip: "127.0.0.1",
        ...(storedHashedPassword ? { password: storedHashedPassword } : {}),
      };
      saveSystemUser(newUserAccount);

      await syncRuntimeKeysToServer([
        "hrm_runtime_employees_v1",
        "hrm_runtime_users_v1",
        "hrm_runtime_leave_balances_v1",
      ]);

      const regSession = await registerServerHrmSession({
        email: normalizedRegEmail,
        password: regPassword,
        fullName: trimmedName,
      });
      if (
        !regSession.networkError &&
        (!regSession.ok ||
          regSession.status === 401 ||
          regSession.status === 403 ||
          regSession.status === 429)
      ) {
        setIsSubmitting(false);
        const regErrMsg =
          regSession.error?.message ||
          "Không thể xác thực tài khoản đăng ký trên máy chủ. Vui lòng kiểm tra lại.";
        setRegError(regErrMsg);
        showToast("Đăng ký thất bại", regErrMsg, "error");
        return;
      }
    } else {
      assignedCode = `UV-2026-${String(Date.now()).slice(-4)}`;
      const candUserAccount: StoredUserWithPassword = {
        id: `usr-cand-${Date.now()}`,
        user_code: `USR-${assignedCode.slice(-4)}`,
        employee_code: assignedCode,
        full_name: trimmedName,
        email: normalizedRegEmail,
        department_name: assignedDeptLabel,
        position_name: assignedTitle,
        role_code: "CANDIDATE",
        mfa_enabled: false,
        account_status: "ACTIVE",
        is_active: true,
        last_login_at: nowIso,
        last_login_ip: "127.0.0.1",
        ...(storedHashedPassword ? { password: storedHashedPassword } : {}),
      };
      saveSystemUser(candUserAccount);
    }

    recordAuditLog({
      actor_name: trimmedName,
      actor_code: assignedCode,
      actor_role: safeRole,
      action: "LOGIN",
      target: normalizedRegEmail,
      detail: `Đăng ký tài khoản mới thành công với vai trò ${safeRole} (${assignedCode}).`,
      status: "SUCCESS",
    });

    setAuthenticatedUser(safeRole, normalizedRegEmail, {
      fullName: trimmedName,
      department: assignedDeptLabel,
      department_id: safeRole === "EMPLOYEE" ? deptId : undefined,
      employee_code: assignedCode,
      email: normalizedRegEmail,
      title: assignedTitle,
    });
    setActiveNav("dashboard");
    showToast(
      "Tạo tài khoản thành công",
      `${trimmedName} (${assignedCode}) · ${assignedDeptLabel} · ${roleLabel}`,
      "success"
    );
    const redirectParam = searchParams.get("redirect");
    const targetUrl =
      safeRole === "CANDIDATE"
        ? "/candidate"
        : redirectParam && redirectParam.startsWith("/app")
        ? redirectParam
        : "/app";
    router.push(targetUrl);
  };

  return (
    <div className="min-h-dvh bg-[#EFF5F3] text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100">
      {/* Top minimal navigation bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#C6D9D3] bg-[#E4EEEB] px-6 dark:border-zinc-800/80 dark:bg-zinc-950">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#C6D9D3] bg-[#FCFEFD] text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
            <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          </div>
          <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
            Lạc Việt HRM
          </span>
          <span className="hidden rounded border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 font-mono text-xs tabular-nums text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 sm:inline-block">
            Hệ thống quản trị nhân sự & bảng lương nội bộ
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/careers"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#0F766E] bg-[#EFF5F3] px-3 text-xs font-semibold text-[#0F766E] shadow-sm transition-colors hover:bg-[#E8F3EF] dark:border-teal-700 dark:bg-zinc-800 dark:text-teal-300"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Cổng việc làm & Tuyển dụng</span>
          </Link>
          <span className="hidden font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400 md:inline">
            Kỳ hạch toán: Tháng 11/2026
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Chuyển chế độ sáng tối"
            className="flex h-9 items-center gap-2 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
        <section className="flex flex-col justify-center border-b border-[#C6D9D3] bg-[#FCFEFD] px-6 py-8 dark:border-zinc-800/80 dark:bg-zinc-900/40 sm:px-10 lg:col-span-5 lg:border-b-0 lg:border-r">
          <div className="mx-auto w-full max-w-md">
            <div className="inline-flex items-center gap-2 rounded-md border border-[#C6D9D3] bg-[#F2F7F5] px-2.5 py-1 text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-[#0F766E] dark:text-teal-400"
                strokeWidth={1.5}
              />
              <span>Xác thực phân quyền theo vai trò (RBAC)</span>
            </div>

            <h1 className="mt-4 text-2xl font-semibold text-[#11221E] dark:text-zinc-100">
              {authTab === "login"
                ? "Đăng nhập cổng điều hành nhân sự"
                : "Đăng ký tài khoản nhân sự mới"}
            </h1>
            <p className="mt-1.5 text-sm text-[#415A54] dark:text-zinc-400">
              {authTab === "login"
                ? "Truy cập không gian làm việc, bảng công và phiếu lương kỳ Tháng 11/2026"
                : "Khởi tạo hồ sơ truy cập theo phòng ban và vai trò đề xuất trong hệ thống"}
            </p>

            {/* Auth mode tabs */}
            <div
              role="tablist"
              aria-label="Chế độ xác thực"
              className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-[#C6D9D3] bg-[#E4EEEB] p-1 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authTab === "login"}
                onClick={() => {
                  setAuthTab("login");
                  setRegError(null);
                }}
                className={`h-9 rounded-md border text-xs transition-colors ${
                  authTab === "login"
                    ? "border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-900 dark:text-zinc-100"
                    : "border-transparent font-medium text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
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
                className={`h-9 rounded-md border text-xs transition-colors ${
                  authTab === "register"
                    ? "border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-900 dark:text-zinc-100"
                    : "border-transparent font-medium text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Đăng ký tài khoản
              </button>
            </div>

            {/* TAB 1: LOGIN FORM */}
            {authTab === "login" && (
              <form
                onSubmit={(e) => void handleLoginSubmit(e)}
                noValidate
                className="mt-5 space-y-4"
              >
                {searchParams.get("locked") === "1" && !loginError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-300"
                  >
                    Phiên làm việc trước đó đã bị thu hồi do tài khoản bị khóa hoặc nhân sự đã hoàn tất thủ tục nghỉ việc.
                  </div>
                )}
                {loginError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300"
                  >
                    {loginError}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Email doanh nghiệp / Email ứng viên
                  </label>
                  <div className="relative mt-1.5">
                    <Mail
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
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
                      className="h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-9 pr-3 text-sm text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Mật khẩu
                    </label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs font-medium text-[#0F766E] hover:underline dark:text-teal-400"
                    >
                      Quên mật khẩu
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <Lock
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                      strokeWidth={1.5}
                    />
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Ứng viên chỉ nộp CV có thể để trống"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-9 pr-10 font-mono text-sm text-[#11221E] placeholder:font-sans placeholder:text-xs placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      aria-label={showLoginPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
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
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-[#415A54] dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-[#C6D9D3] text-[#0F766E] focus:ring-[#0F766E] dark:border-zinc-700 dark:bg-zinc-950 dark:text-teal-400"
                    />
                    <span>Ghi nhớ đăng nhập</span>
                  </label>
                  <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                    Phiên 8 giờ
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-4 text-sm font-medium text-[#FCFEFD] transition-colors hover:bg-[#0D5F58] disabled:opacity-60 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
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
                    className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Họ và tên
                  </label>
                  <div className="relative mt-1.5">
                    <User
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
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
                      className="h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-9 pr-3 text-sm text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-email"
                    className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Email doanh nghiệp
                  </label>
                  <div className="relative mt-1.5">
                    <Mail
                      className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
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
                      className="h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-9 pr-3 text-sm text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="register-dept"
                      className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Phòng ban
                    </label>
                    <div className="relative mt-1.5">
                      <Briefcase
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                        strokeWidth={1.5}
                      />
                      <select
                        id="register-dept"
                        name="department"
                        value={regDept}
                        onChange={(e) => setRegDept(e.target.value)}
                        className="h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-9 pr-3 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
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
                      className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Vai trò đề xuất
                    </label>
                    <select
                      id="register-role"
                      name="role"
                      value={regRole === "CANDIDATE" ? "CANDIDATE" : "EMPLOYEE"}
                      onChange={(e) =>
                        setRegRole(
                          e.target.value === "CANDIDATE" ? "CANDIDATE" : "EMPLOYEE"
                        )
                      }
                      className="mt-1.5 h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
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
                      className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Mật khẩu
                    </label>
                    <div className="relative mt-1.5">
                      <Lock
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                        strokeWidth={1.5}
                      />
                      <input
                        id="register-password"
                        name="password"
                        type={showRegPassword ? "text" : "password"}
                        minLength={8}
                        required
                        placeholder="Tối thiểu 8 ký tự"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-9 pr-9 font-mono text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        aria-label={showRegPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
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
                      className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Xác nhận mật khẩu
                    </label>
                    <div className="relative mt-1.5">
                      <Lock
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
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
                        className="h-9 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] pl-9 pr-9 font-mono text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirm((prev) => !prev)}
                        aria-label={
                          showRegConfirm ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"
                        }
                        className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200"
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
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-4 text-sm font-medium text-[#FCFEFD] transition-colors hover:bg-[#0D5F58] disabled:opacity-60 dark:bg-teal-400 dark:text-zinc-950 dark:hover:bg-teal-300"
                >
                  <span>
                    {isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản và truy cập"}
                  </span>
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </form>
            )}

            {/* Compact quick-demo account pills below form */}
            <div className="mt-6 border-t border-[#C6D9D3] pt-5 dark:border-zinc-800/80">
              <div className="mb-2.5 flex items-center justify-between text-xs text-[#5C7871] dark:text-zinc-400">
                <span>Trải nghiệm nhanh theo vai trò</span>
                <span className="font-mono tabular-nums">6 tài khoản mẫu</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isSelected = selectedRole === acc.role && authTab === "login";
                  return (
                    <button
                      key={acc.role}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleSelectDemo(acc)}
                      className={`flex h-9 items-center justify-center rounded-lg border px-3 text-xs transition-colors disabled:opacity-60 ${
                        isSelected
                          ? "border-[#0F766E] bg-[#CBE8E2] font-semibold text-[#0B4F4A] dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-400"
                          : "border-[#C6D9D3] bg-[#F2F7F5] font-medium text-[#415A54] hover:bg-[#E8F3EF] hover:text-[#11221E] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <span className="truncate">{acc.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Link to Career Portal for Job Seekers */}
            <div className="mt-6 rounded-xl border border-[#C6D9D3] bg-[#EFF5F3] p-3.5 text-center dark:border-zinc-800 dark:bg-zinc-950/80">
              <p className="text-xs text-[#415A54] dark:text-zinc-400">
                Bạn là ứng viên đang tìm kiếm cơ hội việc làm?
              </p>
              <Link
                href="/careers"
                className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:underline dark:text-teal-400"
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Xem 10+ vị trí tuyển dụng & Nộp CV tại Cổng Lạc Việt Careers</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Right column (7 cols): Real product preview — Payroll & HR Operations Ledger */}
        <section className="flex flex-col justify-center bg-[#EFF5F3] p-6 dark:bg-zinc-950 sm:p-10 lg:col-span-7">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {/* Context caption */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
                  Bản xem trước sổ cái điều hành nhân sự & kỳ lương Tháng 11/2026
                </h2>
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  Đối soát trực tiếp công chuẩn, khấu trừ BHXH 10.5%, thuế TNCN lũy tiến và thực lĩnh chuyển khoản
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 py-1 font-mono text-xs tabular-nums text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Chốt công: 25/11/2026</span>
              </span>
            </div>

            {/* 3 KPI Stat Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] p-4 shadow-[0_1px_3px_rgba(17,34,30,0.05)] xl:p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  Tổng nhân sự hiện hữu
                </p>
                <p className="mt-2 font-mono text-lg sm:text-base xl:text-lg 2xl:text-xl font-semibold tabular-nums tracking-tight whitespace-nowrap text-[#11221E] dark:text-zinc-100">
                  148 người
                </p>
                <p className="mt-1 text-xs text-[#0F766E] dark:text-teal-400">
                  +6 nhân sự mới so với tháng 10/2026
                </p>
              </div>

              <div className="rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] p-4 shadow-[0_1px_3px_rgba(17,34,30,0.05)] xl:p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  Quỹ lương Gross tháng 11/2026
                </p>
                <p className="mt-2 font-mono text-lg sm:text-base xl:text-lg 2xl:text-xl font-semibold tabular-nums tracking-tight whitespace-nowrap text-[#11221E] dark:text-zinc-100">
                  {formatVND(2975000000)}
                </p>
                <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                  +2,4% so với dự toán quý 4/2026
                </p>
              </div>

              <div className="rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] p-4 shadow-[0_1px_3px_rgba(17,34,30,0.05)] xl:p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  Tỷ lệ chuyên cần đúng ca
                </p>
                <p className="mt-2 font-mono text-lg sm:text-base xl:text-lg 2xl:text-xl font-semibold tabular-nums tracking-tight whitespace-nowrap text-[#0F766E] dark:text-teal-400">
                  98,2%
                </p>
                <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                  Ca chuẩn HC-08:00 & HC-08:30
                </p>
              </div>
            </div>

            {/* Main visual moment: Live Payroll Reconciliation Table */}
            <div className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C6D9D3] px-5 py-3.5 dark:border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet
                    className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                    strokeWidth={1.5}
                  />
                  <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                    Bảng đối soát tính lương mẫu (Gross → BHXH 10.5% → Thuế TNCN → Thực lĩnh)
                  </span>
                </div>
                <span className="font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400">
                  Đơn vị: VND
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-950/50 dark:text-zinc-400">
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Mã NV</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Họ và tên</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Ca / Công</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                        Lương Gross
                      </th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                        BHXH (10.5%)
                      </th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                        Thuế TNCN
                      </th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                        Thực lĩnh Net
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/60">
                    {PREVIEW_PAYROLL_ROWS.map((row) => {
                      const isCurrentSelected =
                        DEMO_ACCOUNTS.find((d) => d.role === selectedRole)
                          ?.empCode === row.empCode;
                      return (
                        <tr
                          key={row.empCode}
                          className={
                            isCurrentSelected
                              ? "bg-[#CBE8E2]/65 hover:bg-[#CBE8E2] dark:bg-teal-950/25"
                              : "odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-800/40"
                          }
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-[#0F766E] dark:text-teal-400">
                            {row.empCode}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                              {row.name}
                            </div>
                            <div className="text-[11px] text-[#415A54] dark:text-zinc-400">
                              {row.dept}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                            <div>{row.shift}</div>
                            <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                              {row.days} ngày
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-300">
                            {formatVND(row.gross)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                            -{formatVND(row.insurance)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                            -{formatVND(row.pit)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
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
            <div className="rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] p-5 shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  Cơ cấu định biên & ngân sách lương theo khối phòng ban
                </span>
                <span className="font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400">
                  Tổng: 148 nhân sự
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {DEPT_HEADCOUNT_SHARES.map((dept) => (
                  <div key={dept.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#11221E] dark:text-zinc-300">
                        {dept.name}
                      </span>
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        <span className="text-[#415A54] dark:text-zinc-400">
                          {dept.count} NV ({dept.ratio}%)
                        </span>
                        <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                          {formatVND(dept.budgetVnd)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E4EEEB] dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${
                          dept.isPrimary
                            ? "bg-[#0F766E] dark:bg-teal-400"
                            : "bg-[#5C7871] dark:bg-zinc-600"
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#EFF5F3] dark:bg-zinc-950">
          <div className="text-sm font-medium text-[#415A54] dark:text-zinc-400">
            Đang tải trang đăng nhập...
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
