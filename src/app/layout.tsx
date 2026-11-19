import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/context/app-context';
import { ToastProvider } from '@/components/ui/toast-provider';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hệ thống Quản trị Hành chính Nhân sự — AI-Powered HRM',
  description:
    'Nền tảng quản trị nhân sự, chấm công, tính lương, tuyển dụng và điều hành tổ chức theo chuẩn dữ liệu doanh nghiệp',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('hrm_theme')!=='light'){document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} min-h-[100dvh] bg-[#FAFAFA] font-sans text-zinc-900 antialiased selection:bg-teal-700/15 selection:text-teal-900 dark:bg-[#09090B] dark:text-zinc-100 dark:selection:bg-teal-400/20 dark:selection:text-teal-200`}
      >
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
