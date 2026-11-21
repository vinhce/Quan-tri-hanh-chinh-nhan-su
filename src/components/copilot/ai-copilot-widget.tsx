'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Minimize2,
  Maximize2,
  Send,
  HelpCircle,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';
import { MOCK_COPILOT_QA } from '@/mock/copilot';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AiCopilotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [query, setQuery] = useState('');
  const [activeQA, setActiveQA] = useState<string | null>(null);

  if (!isOpen) {
    return (
      <aside
        aria-label="Khung trợ lý AI"
        className="fixed bottom-4 right-4 z-30"
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          aria-label="Mở Trợ lý AI Lạc Việt Copilot"
          className="flex h-11 items-center gap-2 rounded-full border border-[#0F766E]/40 bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#0D5F58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          <Sparkles className="h-4 w-4 animate-spin-slow text-amber-300" />
          <span className="hidden sm:inline">Trợ lý AI</span>
        </button>
      </aside>
    );
  }

  if (isMinimized) {
    return (
      <aside
        aria-label="Khung trợ lý AI thu nhỏ"
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      >
        <Sparkles className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
        <span className="text-xs font-medium text-[#11221E] dark:text-zinc-200">Trợ lý AI</span>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          aria-label="Mở rộng trợ lý"
          className="p-1 text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Đóng trợ lý"
          className="p-1 text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <X className="h-3 w-3" />
        </button>
      </aside>
    );
  }

  const selectedQAItem = MOCK_COPILOT_QA.find((q) => q.id === activeQA);

  return (
    <aside
      aria-label="Trợ lý AI Lạc Việt Copilot"
      className="fixed bottom-4 right-4 z-40 flex h-[480px] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#C6D9D3] bg-[#E4EEEB] px-3.5 py-2.5 rounded-t-2xl dark:border-zinc-800 dark:bg-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0F766E] text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#11221E] dark:text-zinc-100">
              Lạc Việt Copilot
            </div>
            <div className="text-[10px] text-[#5C7871] dark:text-zinc-400">
              Hỏi đáp quy chế & đề xuất nhân sự
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            aria-label="Thu nhỏ cửa sổ trợ lý"
            className="rounded p-1 text-[#5C7871] hover:bg-[#D8E6E2] dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Đóng cửa sổ trợ lý"
            className="rounded p-1 text-[#5C7871] hover:bg-[#D8E6E2] dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body: QA Suggestions & Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        <div className="rounded-xl bg-[#F2F7F5] p-3 text-[#415A54] dark:bg-zinc-800/50 dark:text-zinc-300">
          Xin chào! Tôi có thể hỗ trợ bạn tra cứu quy chế tuyển dụng, giải thích chính sách phép/thuế hoặc tóm tắt tiến độ ứng viên.
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-[#5C7871] dark:text-zinc-400">
            Câu hỏi gợi ý nhanh:
          </div>
          {MOCK_COPILOT_QA.slice(0, 3).map((qa) => (
            <button
              key={qa.id}
              type="button"
              onClick={() => setActiveQA(qa.id)}
              className={cn(
                'w-full text-left rounded-lg border p-2 text-xs transition-colors',
                activeQA === qa.id
                  ? 'border-[#0F766E] bg-[#E8F3EF] font-semibold text-[#11221E] dark:border-teal-400 dark:bg-teal-950/40 dark:text-zinc-100'
                  : 'border-[#D5E3DF] bg-white hover:bg-[#F2F7F5] text-[#415A54] dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300'
              )}
            >
              <div className="flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-[#0F766E] shrink-0 dark:text-teal-400" />
                <span className="line-clamp-2">{qa.prompt_label}</span>
              </div>
            </button>
          ))}
        </div>

        {selectedQAItem && (
          <div className="space-y-2 rounded-xl border border-[#C6D9D3] bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-800">
            <div className="font-semibold text-[#11221E] dark:text-zinc-100">
              {selectedQAItem.user_query}
            </div>
            <div className="text-[#415A54] dark:text-zinc-300 leading-relaxed text-[11px]">
              {selectedQAItem.ai_response}
            </div>
            {selectedQAItem.referenced_policy && (
              <div className="text-[10px] text-[#0F766E] dark:text-teal-400 font-medium">
                Tham chiếu: {selectedQAItem.referenced_policy}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer input */}
      <div className="border-t border-[#C6D9D3] p-2.5 bg-[#F8FAF9] rounded-b-2xl dark:border-zinc-800 dark:bg-zinc-800/50">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!query.trim()) return;
            setQuery('');
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập câu hỏi quy chế tuyển dụng..."
            className="flex-1 rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1.5 text-xs text-[#11221E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            className="h-8 px-2.5"
            disabled={!query.trim()}
          >
            <Send className="h-3 w-3" />
          </Button>
        </form>
      </div>
    </aside>
  );
}
