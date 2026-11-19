'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, Mail, Phone, MapPin, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

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
      <PublicHeader />

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1 text-xs font-semibold text-[#0F766E] shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            Tổng Công ty Lạc Việt
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#11221E] dark:text-zinc-50 sm:text-4xl">
            Liên hệ Ban Điều hành & Tuyển dụng
          </h1>
          <p className="mt-3 text-sm text-[#415A54] dark:text-zinc-300">
            Chúng tôi luôn sẵn sàng lắng nghe và kết nối cùng quý đối tác, khách hàng và nhân tài ứng viên.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Contact Details */}
          <div className="space-y-6">
            <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-base font-bold text-[#11221E] dark:text-zinc-100">
                Trụ sở chính (Hà Nội)
              </h3>
              <div className="mt-4 space-y-3 text-xs text-[#415A54] dark:text-zinc-300">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 shrink-0 text-[#0F766E] mt-0.5" />
                  <span>Tòa nhà Lạc Việt, Khu Đô thị mới Cầu Giấy, Quận Cầu Giấy, TP. Hà Nội</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Tổng đài: (024) 3788 9999</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Ban Tuyển dụng: recruitment@lacviethrm.vn</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-base font-bold text-[#11221E] dark:text-zinc-100">
                Chi nhánh TP. Hồ Chí Minh
              </h3>
              <div className="mt-4 space-y-3 text-xs text-[#415A54] dark:text-zinc-300">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 shrink-0 text-[#0F766E] mt-0.5" />
                  <span>Tòa nhà Văn phòng Lạc Việt, Quận 1, TP. Hồ Chí Minh</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-[#0F766E]" />
                  <span>Hotline hỗ trợ: (028) 3822 5555</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {submitted ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#D1FAE5] text-[#065F46]">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-base font-bold text-[#11221E] dark:text-zinc-100">
                  Gửi thông tin thành công!
                </h3>
                <p className="mt-2 text-xs text-[#415A54] dark:text-zinc-400">
                  Cảm ơn bạn đã liên hệ. Đội ngũ Lạc Việt sẽ phản hồi qua email {email} trong vòng 24 giờ làm việc.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6 border-[#C6D9D3] text-xs font-semibold"
                  onClick={() => {
                    setSubmitted(false);
                    setName('');
                    setEmail('');
                    setMessage('');
                  }}
                >
                  Gửi tin nhắn khác
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-base font-bold text-[#11221E] dark:text-zinc-100">
                  Gửi thông tin tư vấn & Kết nối
                </h3>
                <div>
                  <label className="text-xs font-semibold text-[#415A54] dark:text-zinc-300">
                    Họ và tên *
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    required
                    className="mt-1 text-xs border-[#C6D9D3] bg-[#FCFEFD]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#415A54] dark:text-zinc-300">
                    Email liên hệ *
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@company.com"
                    required
                    className="mt-1 text-xs border-[#C6D9D3] bg-[#FCFEFD]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#415A54] dark:text-zinc-300">
                    Nội dung lời nhắn
                  </label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Bạn cần hỗ trợ về giải pháp nhân sự, tính lương hay tuyển dụng..."
                    className="mt-1 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <Button type="submit" variant="primary" className="w-full text-xs font-semibold shadow-sm">
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Gửi yêu cầu liên hệ ngay
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
