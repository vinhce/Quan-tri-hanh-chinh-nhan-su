'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, Mail, Phone, MapPin, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#EFF5F3] text-[#11221E] dark:bg-zinc-950 dark:text-zinc-100 font-sans">
      <header className="sticky top-0 z-40 border-b border-[#C6D9D3] bg-[#FCFEFD]/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F766E] text-white">
              <Building2 className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <span className="font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
                LẠC VIỆT
              </span>
              <p className="text-[11px] text-[#415A54] dark:text-zinc-400">
                Liên hệ Ban Điều hành & Tuyển dụng
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/careers" className="text-xs font-semibold text-[#415A54] hover:text-[#0F766E]">
              Tuyển dụng
            </Link>
            <Link href="/login">
              <Button variant="primary" size="sm" className="text-xs font-semibold">
                Đăng nhập
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-[#11221E] dark:text-zinc-50">
            Liên hệ với Lạc Việt HRM
          </h1>
          <p className="mt-2 text-xs text-[#415A54] dark:text-zinc-400">
            Chúng tôi luôn sẵn sàng lắng nghe và đồng hành cùng sự phát triển của doanh nghiệp bạn.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Company info */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                Trụ sở chính (Hà Nội)
              </h3>
              <div className="mt-3 space-y-2 text-xs text-[#415A54] dark:text-zinc-400">
                <p className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Tòa nhà Lạc Việt, Phố Duy Tân, Quận Cầu Giấy, TP. Hà Nội</span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Hotline: (024) 3788 9999</span>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Email: contact@lacviethrm.vn</span>
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                Văn phòng Chi nhánh (TP. Hồ Chí Minh)
              </h3>
              <div className="mt-3 space-y-2 text-xs text-[#415A54] dark:text-zinc-400">
                <p className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Tòa nhà Innovation, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh</span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Hotline: (028) 3822 8888</span>
                </p>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div className="rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {submitted ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#D1FAE5] text-[#065F46]">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-[#11221E] dark:text-zinc-100">
                  Cảm ơn bạn đã gửi liên hệ!
                </h3>
                <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                  Bộ phận Chăm sóc khách hàng Lạc Việt sẽ phản hồi trong vòng 24 giờ.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubmitted(false)}
                  className="mt-4 border-[#C6D9D3] text-xs"
                >
                  Gửi tin nhắn khác
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  Gửi thông tin tư vấn
                </h3>
                <div>
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    Họ và tên *
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    required
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    Email liên hệ *
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@company.com"
                    required
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    Nội dung lời nhắn
                  </label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Bạn cần hỗ trợ về giải pháp nhân sự, tính lương hay tuyển dụng..."
                    className="mt-1 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <Button type="submit" variant="primary" className="w-full text-xs font-semibold">
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Gửi yêu cầu liên hệ
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
