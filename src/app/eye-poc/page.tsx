import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const EyeLivenessPoc = dynamic(
  () => import('@/components/modules/eye-liveness-poc').then((m) => m.EyeLivenessPoc),
  { ssr: false }
);

export default function EyePocPage() {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/app"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:text-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại /app
        </Link>
      </div>

      <EyeLivenessPoc />
    </main>
  );
}
