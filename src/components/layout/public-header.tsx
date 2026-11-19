'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Briefcase,
  Info,
  PhoneCall,
  User,
  ShieldCheck,
  Moon,
  Sun,
  Menu,
  X,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function PublicHeader() {
  const pathname = usePathname();
  const { role, isAuthenticated, currentUserProfile, logout, theme, toggleTheme } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/careers', label: 'Cổng Việc làm', icon: Briefcase },
    { href: '/about', label: 'Về Lạc Việt', icon: Info },
    { href: '/contact', label: 'Liên hệ', icon: PhoneCall },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#C6D9D3] bg-[#FCFEFD]/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Identity matching Admin Shell */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#0F766E] shadow-sm transition-colors group-hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
              <Building2 className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
                  Lạc Việt HRM
                </span>
                <span className="rounded border border-[#C6D9D3] bg-[#E4EEEB] px-1.5 py-0.2 font-mono text-[10px] font-semibold text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-800 dark:text-teal-300">
                  v2.4
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#5C7871] dark:text-zinc-400">
                Hệ sinh thái Quản trị Nhân sự & Tuyển dụng
              </span>
            </div>
          </Link>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href === '/careers' && pathname === '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                    isActive
                      ? 'border border-[#0F766E]/30 bg-[#CBE8E2] text-[#0B4F4A] shadow-sm dark:border-teal-700/60 dark:bg-teal-950/60 dark:text-teal-300'
                      : 'text-[#415A54] hover:bg-[#E8F3EF] hover:text-[#11221E] dark:text-zinc-300 dark:hover:bg-zinc-800'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Đổi giao diện sáng/tối"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Sun className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>

          {/* Auth State Action */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {role === 'CANDIDATE' && (
                  <Link
                    href="/candidate"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#0F766E] bg-[#CBE8E2] px-3 text-xs font-semibold text-[#0B4F4A] hover:bg-[#b5e0d8] dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F766E] text-[10px] font-bold text-white">
                      UV
                    </div>
                    <span className="hidden sm:inline">Hồ sơ của tôi</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={logout}
                  title="Đăng xuất khỏi hệ thống"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 text-xs font-medium text-[#5C7871] transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              </div>
            ) : (
              <Link href="/login">
                <Button
                  variant="primary"
                  size="sm"
                  className="h-9 px-3.5 text-xs font-semibold shadow-sm"
                >
                  <User className="mr-1.5 h-3.5 w-3.5" />
                  <span>Đăng nhập</span>
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Mở menu di động"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 md:hidden"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-[#C6D9D3] bg-[#FCFEFD] px-4 py-3 shadow-md dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
          <nav className="flex flex-col space-y-1.5">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold',
                    isActive
                      ? 'border border-[#0F766E]/30 bg-[#CBE8E2] text-[#0B4F4A]'
                      : 'text-[#415A54] hover:bg-[#E8F3EF] dark:text-zinc-300'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-2 border-t border-[#C6D9D3] dark:border-zinc-800">
              <Link
                href="/login?redirect=/app"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white"
              >
                <User className="h-3.5 w-3.5" />
                <span>Đăng nhập</span>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
