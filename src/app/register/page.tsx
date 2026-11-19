'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, User, Mail, Lock, Phone, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/context/app-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const router = useRouter();
  const { setAuthenticatedUser, showToast } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roleType, setRoleType] = useState<'CANDIDATE' | 'EMPLOYEE'>('CANDIDATE');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) return;

    if (typeof document !== 'undefined') {
      document.cookie = `hrm_role=${roleType}; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `hrm_token=demo-token-${Date.now()}; path=/; max-age=86400; SameSite=Lax`;
    }

    setAuthenticatedUser(roleType, email, {
      fullName,
      email,
      title: roleType === 'CANDIDATE' ? 'Ứng viên tìm việc' : 'Nhân viên mới',
      department: roleType === 'CANDIDATE' ? 'Cổng Ứng viên Tuyển dụng' : 'Khối Vận hành',
      employee_code: roleType === 'CANDIDATE' ? `UV-${Date.now().toString().slice(-4)}` : 'NV-2026-999',
    });

    setIsSuccess(true);
    showToast('Đăng ký tài khoản thành công', `Chào mừng ${fullName} đến với Lạc Việt!`, 'success');

    setTimeout(() => {
      if (roleType === 'CANDIDATE') {
        router.push('/candidate');
      } else {
        router.push('/app');
      }
    }, 600);
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
            onClick={() => setRoleType('CANDIDATE')}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
              roleType === 'CANDIDATE'
                ? 'bg-[#0F766E] text-white shadow-sm'
                : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400'
            }`}
          >
            Ứng viên tìm việc
          </button>
          <button
            type="button"
            onClick={() => setRoleType('EMPLOYEE')}
            className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
              roleType === 'EMPLOYEE'
                ? 'bg-[#0F766E] text-white shadow-sm'
                : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400'
            }`}
          >
            Nhân sự nội bộ
          </button>
        </div>

        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
              Họ và tên *
            </label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              required
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
              Email *
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
              Số điện thoại
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912 345 678"
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
              Mật khẩu *
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="mt-1 text-xs"
            />
          </div>

          <Button type="submit" variant="primary" className="w-full text-xs font-semibold">
            {isSuccess ? 'Đang chuyển hướng...' : 'Đăng ký tài khoản'}
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
