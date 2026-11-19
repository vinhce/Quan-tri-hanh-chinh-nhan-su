import React from 'react';
import Link from 'next/link';
import { Building2, ArrowRight, ShieldCheck, Mail, Phone, MapPin, ExternalLink } from 'lucide-react';

export function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-[#C6D9D3] bg-[#E4EEEB] py-12 text-[#415A54] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand Col */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] text-[#0F766E] shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <span className="font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
                  LẠC VIỆT HRM
                </span>
                <span className="ml-1.5 rounded bg-[#CBE8E2] px-1 py-0.2 font-mono text-[9px] font-semibold text-[#0B4F4A] dark:bg-zinc-800 dark:text-teal-300">
                  v2.4
                </span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
              Giải pháp Quản trị Nhân sự & Tuyển dụng thông minh, đồng hành cùng sự phát triển bền vững của doanh nghiệp Việt Nam.
            </p>
            <div className="flex items-center gap-2 text-xs">
              <ShieldCheck className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
              <span className="font-medium text-[#11221E] dark:text-zinc-200">Chuẩn bảo mật ISO 27001 & OWASP</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
              Cổng Tuyển dụng
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link href="/careers" className="hover:text-[#0F766E] hover:underline transition-colors">
                  Tất cả vị trí đang tuyển
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-[#0F766E] hover:underline transition-colors">
                  Về chúng tôi & Văn hóa Lạc Việt
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#0F766E] hover:underline transition-colors">
                  Thông tin liên hệ & Văn phòng
                </Link>
              </li>
              <li>
                <Link href="/candidate" className="hover:text-[#0F766E] hover:underline transition-colors">
                  Cổng tra cứu hồ sơ ứng viên
                </Link>
              </li>
            </ul>
          </div>

          {/* HR Contact */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
              Ban Tuyển dụng Nhân sự
            </h4>
            <ul className="mt-3 space-y-2.5 text-xs">
              <li className="flex items-start gap-2">
                <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#0F766E]" />
                <span>recruitment@lacviethrm.vn</span>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#0F766E]" />
                <span>(024) 3788 9999 (Phòng Nhân sự)</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#0F766E]" />
                <span>Tòa nhà Lạc Việt, Q. Cầu Giấy, Hà Nội</span>
              </li>
            </ul>
          </div>

          {/* Internal Portal Entry */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#11221E] dark:text-zinc-200">
              Quản trị Doanh nghiệp
            </h4>
            <p className="mt-3 text-xs leading-relaxed text-[#415A54] dark:text-zinc-400">
              Dành riêng cho cán bộ nhân viên, trưởng bộ phận và ban điều hành Lạc Việt HRM.
            </p>
            <div className="mt-3.5">
              <Link
                href="/login?redirect=/app"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs font-semibold text-[#11221E] shadow-sm transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] hover:text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <span>Vào Cổng Điều hành Nội bộ</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-[#C6D9D3] pt-6 text-center text-xs text-[#5C7871] dark:border-zinc-800 dark:text-zinc-500">
          © 2026 Tổng Công ty Lạc Việt. Bản quyền đã được bảo hộ. Nền tảng quản trị tuyển dụng ATS & Onboarding v2.4.
        </div>
      </div>
    </footer>
  );
}
