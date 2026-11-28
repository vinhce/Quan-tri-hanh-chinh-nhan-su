'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight } from 'lucide-react';
import {
  registerServerHrmSession,
  syncServerHrmSession,
  useApp,
} from '@/context/app-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { recordAuditLog } from '@/lib/audit-logger';
import {
  findSystemUserForLogin,
  generateNextEmployeeCode,
  saveLeaveBalance,
  saveRuntimeEmployee,
  saveSystemUser,
} from '@/lib/runtime-store';
import type { Employee, SystemUserAccount } from '@/mock/types';

type StoredUserWithPassword = SystemUserAccount & { password?: string };

async function sha256Hex(raw: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(raw);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}

async function syncRuntimeKeysToServer(keys: string[]): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await Promise.all(
      keys.map(async (key) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return;
        const items = JSON.parse(raw) as unknown;
        if (!Array.isArray(items)) return;
        await fetch('/api/hrm/sync', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, items }),
        });
      })
    );
  } catch {
    // Ignore sync errors in offline or static-export mode
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const { setAuthenticatedUser, showToast } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roleType, setRoleType] = useState<'CANDIDATE' | 'EMPLOYEE'>('CANDIDATE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSuccess) return;

    setRegError(null);
    const trimmedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password) {
      const msg = 'Vui lòng điền đầy đủ họ tên, email và mật khẩu.';
      setRegError(msg);
      showToast('Thiếu thông tin bắt buộc', msg, 'error');
      return;
    }

    if (password.length < 8) {
      const msg = 'Mật khẩu phải có tối thiểu 8 ký tự.';
      setRegError(msg);
      showToast('Mật khẩu không hợp lệ', msg, 'error');
      return;
    }

    const existingCheck = findSystemUserForLogin(normalizedEmail);
    if (existingCheck.user || existingCheck.employee) {
      const dupMsg =
        'Email này đã tồn tại trong hệ thống. Vui lòng sử dụng email khác hoặc đăng nhập.';
      setRegError(dupMsg);
      showToast('Email đã được đăng ký', dupMsg, 'error');
      return;
    }

    setIsSubmitting(true);
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);
    const passHash = await sha256Hex(password);
    const storedHash = passHash ? `sha256:${passHash}` : undefined;

    let assignedCode = '';
    const assignedTitle =
      roleType === 'CANDIDATE' ? 'Ứng viên tìm việc' : 'Nhân viên mới';
    const assignedDept =
      roleType === 'CANDIDATE' ? 'Ứng viên dự tuyển' : 'Khối Vận hành';

    try {
      if (roleType === 'EMPLOYEE') {
        assignedCode = generateNextEmployeeCode();
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
          email: normalizedEmail,
          phone: phone.trim(),
          gender: 'Nam',
          date_of_birth: '2000-01-01',
          national_id: '',
          tax_code: '',
          social_insurance_no: '',
          department_id: 'dept-ops',
          department_name: assignedDept,
          position_id: 'pos-04',
          position_name: assignedTitle,
          manager_id: 'emp-003',
          manager_name: 'Lê Hoàng Nam',
          role_code: 'EMPLOYEE',
          join_date: todayDate,
          employment_status: 'PROBATION',
          contract_type: 'PROBATION_2M',
          contract_start_date: todayDate,
          contract_end_date: null,
          contract_status: 'PENDING_SIGN',
          base_salary_vnd: 0,
          allowance_meal_vnd: 0,
          allowance_transport_vnd: 0,
          allowance_position_vnd: 0,
          dependents_count: 0,
          bank_account_no: '',
          bank_name: '',
          work_shift_code: 'HC-08:30',
          kpi_completion_rate: 0,
          burnout_risk_score: 0,
          burnout_risk_level: 'LOW',
          turnover_risk_score: 0,
          turnover_risk_level: 'LOW',
          ai_retention_note:
            'Tài khoản nhân sự mới tự đăng ký đang trong thời gian thử việc.',
          avatar_initials: initials || 'NV',
        };
        saveRuntimeEmployee(runtimeEmp);

        saveLeaveBalance({
          id: `alb-rt-${assignedCode}-2026`,
          employee_id: newEmpId,
          employee_code: assignedCode,
          full_name: trimmedName,
          department_name: assignedDept,
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
          email: normalizedEmail,
          department_name: assignedDept,
          position_name: assignedTitle,
          role_code: 'EMPLOYEE',
          mfa_enabled: false,
          account_status: 'ACTIVE',
          is_active: true,
          last_login_at: nowIso,
          last_login_ip: '127.0.0.1',
          ...(storedHash ? { password: storedHash } : {}),
        };
        saveSystemUser(newUserAccount);

        await syncRuntimeKeysToServer([
          'hrm_runtime_employees_v1',
          'hrm_runtime_users_v1',
          'hrm_runtime_leave_balances_v1',
        ]);

        const regRes = await registerServerHrmSession({
          email: normalizedEmail,
          password,
          fullName: trimmedName,
        });

        if (
          !regRes.networkError &&
          (!regRes.ok ||
            regRes.status === 400 ||
            regRes.status === 401 ||
            regRes.status === 403 ||
            regRes.status === 422 ||
            regRes.status === 429)
        ) {
          setIsSubmitting(false);
          const errMsg =
            regRes.error?.message ||
            'Không thể xác thực tài khoản đăng ký trên máy chủ. Vui lòng kiểm tra lại.';
          setRegError(errMsg);
          showToast('Đăng ký thất bại', errMsg, 'error');
          return;
        }

        if (regRes.ok && regRes.data?.employeeCode) {
          assignedCode = regRes.data.employeeCode;
        }
      } else {
        assignedCode = `UV-${Date.now().toString().slice(-4)}`;
        const candUserAccount: StoredUserWithPassword = {
          id: `usr-cand-${Date.now()}`,
          user_code: `USR-${assignedCode.slice(-4)}`,
          employee_code: assignedCode,
          full_name: trimmedName,
          email: normalizedEmail,
          department_name: assignedDept,
          position_name: assignedTitle,
          role_code: 'CANDIDATE',
          mfa_enabled: false,
          account_status: 'ACTIVE',
          is_active: true,
          last_login_at: nowIso,
          last_login_ip: '127.0.0.1',
          ...(storedHash ? { password: storedHash } : {}),
        };
        saveSystemUser(candUserAccount);
      }

      if (typeof document !== 'undefined') {
        document.cookie = `hrm_role=${roleType}; path=/; max-age=86400; SameSite=Lax`;
      }

      recordAuditLog({
        actor_name: trimmedName,
        actor_code: assignedCode,
        actor_role: roleType,
        action: 'LOGIN',
        target: normalizedEmail,
        detail: `Đăng ký tài khoản mới thành công với vai trò ${roleType} (${assignedCode}).`,
        status: 'SUCCESS',
      });

      setAuthenticatedUser(roleType, normalizedEmail, {
        fullName: trimmedName,
        email: normalizedEmail,
        title: assignedTitle,
        department: assignedDept,
        employee_code: assignedCode,
      });

      if (roleType === 'CANDIDATE') {
        try {
          await syncServerHrmSession('CANDIDATE');
        } catch {
          // Ignore sync errors in static-export mode
        }
      }

      setIsSuccess(true);
      setIsSubmitting(false);
      showToast(
        'Đăng ký tài khoản thành công',
        `Chào mừng ${trimmedName} đến với Lạc Việt!`,
        'success'
      );

      setTimeout(() => {
        if (roleType === 'CANDIDATE') {
          router.push('/candidate');
        } else {
          router.push('/app');
        }
      }, 600);
    } catch {
      setIsSubmitting(false);
      const fallbackMsg = 'Đã có lỗi xảy ra khi tạo tài khoản. Vui lòng thử lại.';
      setRegError(fallbackMsg);
      showToast('Đăng ký thất bại', fallbackMsg, 'error');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EFF5F3] p-4 text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-center">
          <Link href="/" className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0F766E] text-white">
            <Building2 className="h-6 w-6" strokeWidth={2} />
          </Link>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-[#11221E] dark:text-zinc-50">
            Tạo tài khoản Lạc Việt HRM
          </h1>
          <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
            Dành cho ứng viên tìm việc hoặc cán bộ nhân viên mới
          </p>
        </div>

        {/* Role Type Selector */}
        <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#E4EEEB] p-1 dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            disabled={isSubmitting || isSuccess}
            onClick={() => {
              setRoleType('CANDIDATE');
              setRegError(null);
            }}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              roleType === 'CANDIDATE'
                ? 'bg-[#0F766E] text-white shadow-sm'
                : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400'
            }`}
          >
            Ứng viên tìm việc
          </button>
          <button
            type="button"
            disabled={isSubmitting || isSuccess}
            onClick={() => {
              setRoleType('EMPLOYEE');
              setRegError(null);
            }}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              roleType === 'EMPLOYEE'
                ? 'bg-[#0F766E] text-white shadow-sm'
                : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400'
            }`}
          >
            Nhân sự nội bộ
          </button>
        </div>

        <form onSubmit={handleRegister} className="mt-6 space-y-4">
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
              htmlFor="register-fullname"
              className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
            >
              Họ và tên *
            </label>
            <Input
              id="register-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              required
              disabled={isSubmitting || isSuccess}
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
            >
              Email *
            </label>
            <Input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              disabled={isSubmitting || isSuccess}
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="register-phone"
              className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
            >
              Số điện thoại
            </label>
            <Input
              id="register-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912 345 678"
              disabled={isSubmitting || isSuccess}
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
            >
              Mật khẩu *
            </label>
            <Input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              minLength={8}
              required
              disabled={isSubmitting || isSuccess}
              className="mt-1 text-xs"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || isSuccess}
            className="w-full text-xs font-semibold"
          >
            {isSuccess
              ? 'Đang chuyển hướng...'
              : isSubmitting
                ? 'Đang xử lý...'
                : 'Đăng ký tài khoản'}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="mt-6 border-t border-[#D5E3DF] pt-4 text-center text-xs text-[#5C7871] dark:border-zinc-800 dark:text-zinc-400">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-semibold text-[#0F766E] hover:underline dark:text-teal-400">
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </div>
  );
}
