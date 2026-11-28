'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp, type RoleCode } from '@/context/app-context';
import { AUDIT_UPDATED_EVENT } from '@/lib/audit-logger';
import {
  HRM_RUNTIME_EVENT,
  STORAGE_LEAVE_BALANCES_KEY,
  STORAGE_REQUESTS_KEY,
} from '@/lib/runtime-store';
import { cn } from '@/lib/utils';
import { MOCK_COPILOT_QA } from '@/mock/copilot';
import type { LeaveOvertimeRequest, NaturalLanguageLeaveDraft } from '@/mock/types';

type CopilotAiStatus = 'IDLE' | 'ONLINE' | 'WAKING' | 'FALLBACK';

interface RouterCardDraft {
  draftId: string;
  confirmToken: string;
  expiresAt: string;
  kind: 'create' | 'cancel';
  preview: {
    typeLabel: string;
    dateText: string;
    days?: number;
    hours?: number;
    reason: string;
    balanceAfter?: number | null;
    approvalFlow: string[] | string;
    explanationsLeft?: number | null;
    otMultiplier?: number;
    cancelRequestCode?: string;
    cancelCategoryLabel?: string;
    handoverToName?: string | null;
  };
}

interface RouterCard {
  kind: 'preview' | 'cancel_confirm';
  drafts: RouterCardDraft[];
}

interface CopilotMessage {
  id: string;
  userQuery: string;
  aiResponse: string;
  referencedPolicy?: string;
  isSmalltalk?: boolean;
  hideCitation?: boolean;
  leaveDraft?: NaturalLanguageLeaveDraft | null;
  modelSource?: 'online' | 'fallback' | 'router' | 'lacviet-ai';
  source?: 'router' | 'model' | 'fallback';
  usedRouterBridge?: boolean;
  card?: RouterCard | null;
  submittedRequestCode?: string;
  submittedKind?: 'create' | 'cancel';
}

interface DraftSubmissionState {
  status: 'idle' | 'submitting' | 'created' | 'error';
  requestCode?: string;
  error?: string;
}

const ROLE_LABELS_VI: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  DIRECTOR: 'Giám đốc Điều hành',
  HR_MANAGER: 'Trưởng phòng Nhân sự',
  DEPT_MANAGER: 'Trưởng bộ phận',
  EMPLOYEE: 'Nhân viên chính thức',
  CANDIDATE: 'Ứng viên',
};

const STORAGE_AUDIT_KEY = 'hrm_runtime_audit_logs';

function extractDraftHandoverCode(handoverText?: string | null): string | undefined {
  if (!handoverText) return undefined;
  const match = handoverText.match(/\b(NV-\d{4}-\d{3,})\b/i);
  return match ? match[1].toUpperCase() : undefined;
}

function mergeSyncRecordsByIdentity(
  serverItems: unknown[],
  localItems: unknown[]
): unknown[] {
  const getKey = (item: unknown): string => {
    if (!item || typeof item !== 'object') return '';
    const obj = item as Record<string, unknown>;
    if (typeof obj.id === 'string' && obj.id.trim()) return `id:${obj.id.trim()}`;
    if (typeof obj.request_code === 'string' && obj.request_code.trim()) {
      return `req:${obj.request_code.trim()}`;
    }
    if (typeof obj.employee_code === 'string' && obj.employee_code.trim()) {
      return `emp:${obj.employee_code.trim()}`;
    }
    return '';
  };

  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const item of serverItems) {
    const key = getKey(item);
    if (key) seen.add(key);
    merged.push(item);
  }
  for (const item of localItems) {
    const key = getKey(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong
          key={index}
          className="font-semibold text-zinc-900 dark:text-zinc-100"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function renderSafeBoldText(text: string): React.ReactNode {
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) {
    return renderInlineBold(text);
  }
  return lines.map((rawLine, lineIdx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return <div key={lineIdx} className="h-1.5" aria-hidden="true" />;
    }
    const bulletMatch = trimmed.match(/^(?:([•\-*]|\(\d+\)|\d+\.)\s+)(.+)$/);
    if (bulletMatch) {
      const [, marker, content] = bulletMatch;
      const displayMarker = marker === '-' || marker === '*' ? '•' : marker;
      return (
        <div
          key={lineIdx}
          className="mt-1 flex min-w-0 items-start gap-1.5 leading-relaxed"
        >
          <span
            className="shrink-0 font-semibold text-[#0F766E] dark:text-teal-400"
            aria-hidden="true"
          >
            {displayMarker}
          </span>
          <span className="min-w-0 flex-1 break-words">
            {renderInlineBold(content)}
          </span>
        </div>
      );
    }
    return (
      <div
        key={lineIdx}
        className={cn(
          'min-w-0 break-words leading-relaxed',
          lineIdx > 0 && 'mt-1'
        )}
      >
        {renderInlineBold(trimmed)}
      </div>
    );
  });
}

export function AiCopilotWidget() {
  const {
    role,
    currentUserEmail,
    currentUserProfile,
    isAuthenticated,
    navigateWithIntent,
    logout,
    showToast,
  } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [query, setQuery] = useState('');
  const [activeQA, setActiveQA] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);
  const [requiresRelogin, setRequiresRelogin] = useState(false);
  const [aiStatus, setAiStatus] = useState<CopilotAiStatus>('IDLE');
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [draftSubmissions, setDraftSubmissions] = useState<
    Record<string, DraftSubmissionState>
  >({});
  const [routerSubmissions, setRouterSubmissions] = useState<
    Record<string, DraftSubmissionState>
  >({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pingControllerRef = useRef<AbortController | null>(null);
  const chatControllerRef = useRef<AbortController | null>(null);
  const submittingDraftIdsRef = useRef<Set<string>>(new Set());
  const submittingRouterDraftIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pingControllerRef.current?.abort();
      chatControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    chatControllerRef.current?.abort();
    chatControllerRef.current = null;
    submittingDraftIdsRef.current.clear();
    submittingRouterDraftIdsRef.current.clear();
    setMessages([]);
    setActiveQA(null);
    setErrorMessage(null);
    setLastFailedQuery(null);
    setRequiresRelogin(false);
    setDraftSubmissions({});
    setRouterSubmissions({});
    setIsLoading(false);
  }, [role, currentUserEmail]);

  useEffect(() => {
    if (isOpen && !isMinimized && (messages.length > 0 || isLoading || errorMessage)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isOpen, isMinimized, isLoading, errorMessage]);

  const canViewCompanyAnalytics =
    role === 'SUPER_ADMIN' || role === 'DIRECTOR' || role === 'HR_MANAGER';

  useEffect(() => {
    if (!isOpen || role === 'CANDIDATE' || !isAuthenticated) {
      pingControllerRef.current?.abort();
      pingControllerRef.current = null;
      if (role === 'CANDIDATE' || !isAuthenticated) {
        setAiStatus('IDLE');
        setFallbackReason(null);
      }
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let pollCount = 0;
    const MAX_WAKING_POLLS = 5;

    const pingCopilotHealth = async () => {
      pingControllerRef.current?.abort();
      const controller = new AbortController();
      pingControllerRef.current = controller;

      try {
        const res = await fetch('/api/hrm/copilot', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (cancelled || !isMountedRef.current) return;

        if (res.status === 401) {
          setAiStatus('IDLE');
          setFallbackReason(null);
          setRequiresRelogin(true);
          setLastFailedQuery(null);
          setErrorMessage(
            'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại để tiếp tục sử dụng Trợ lý Lạc Việt.'
          );
          return;
        }

        if (res.status === 403) {
          setAiStatus('IDLE');
          setFallbackReason(null);
          return;
        }

        if (!res.ok) {
          setAiStatus('FALLBACK');
          setFallbackReason('Không thể kết nối máy chủ AI');
          return;
        }

        setRequiresRelogin(false);

        const json = (await res.json()) as {
          success?: boolean;
          data?: {
            status?: 'ONLINE' | 'WAKING' | 'FALLBACK';
            model?: string;
            provider?: string;
            fallbackReason?: string;
          };
        };
        const status = json?.data?.status;
        const reason =
          typeof json?.data?.fallbackReason === 'string'
            ? json.data.fallbackReason.trim()
            : '';

        if (status === 'ONLINE') {
          setAiStatus('ONLINE');
          setFallbackReason(null);
          return;
        }

        if (status === 'FALLBACK') {
          setAiStatus('FALLBACK');
          setFallbackReason(reason || 'Không thể kết nối máy chủ AI');
          return;
        }

        if (status === 'WAKING') {
          setAiStatus('WAKING');
          setFallbackReason(null);
          if (pollCount < MAX_WAKING_POLLS) {
            pollCount += 1;
            pollTimer = window.setTimeout(() => {
              if (!cancelled && isMountedRef.current) {
                void pingCopilotHealth();
              }
            }, 3500);
          }
          return;
        }

        setAiStatus('FALLBACK');
        setFallbackReason(reason || 'Không thể kết nối máy chủ AI');
      } catch (err) {
        if (
          cancelled ||
          !isMountedRef.current ||
          (err instanceof DOMException && err.name === 'AbortError')
        ) {
          return;
        }
        setAiStatus('FALLBACK');
        setFallbackReason('Không thể kết nối máy chủ AI');
      } finally {
        if (pingControllerRef.current === controller) {
          pingControllerRef.current = null;
        }
      }
    };

    void pingCopilotHealth();

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
      pingControllerRef.current?.abort();
      pingControllerRef.current = null;
    };
  }, [isOpen, role, isAuthenticated]);

  const refreshRuntimeStoresFromServer = async (
    createdRequest?: LeaveOvertimeRequest | null
  ) => {
    if (typeof window === 'undefined') return;
    try {
      const syncRes = await fetch('/api/hrm/sync', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (syncRes.ok) {
        const syncJson = (await syncRes.json()) as {
          stores?: Record<string, unknown>;
        };
        const stores = syncJson?.stores;
        if (stores && typeof stores === 'object') {
          const syncKeys = [
            STORAGE_REQUESTS_KEY,
            STORAGE_LEAVE_BALANCES_KEY,
            STORAGE_AUDIT_KEY,
          ] as const;
          for (const key of syncKeys) {
            const serverItems = stores[key];
            if (Array.isArray(serverItems)) {
              let localItems: unknown[] = [];
              try {
                const rawLocal = window.localStorage.getItem(key);
                const parsedLocal = rawLocal ? JSON.parse(rawLocal) : null;
                if (Array.isArray(parsedLocal)) localItems = parsedLocal;
              } catch {
                localItems = [];
              }
              const merged = mergeSyncRecordsByIdentity(serverItems, localItems);
              window.localStorage.setItem(key, JSON.stringify(merged));
            }
          }
        }
      }
    } catch {
      // Ignore sync fetch errors; fallback merge below ensures immediate UI visibility
    }

    if (createdRequest && createdRequest.id) {
      try {
        const rawReq = window.localStorage.getItem(STORAGE_REQUESTS_KEY);
        const parsedReq = rawReq ? JSON.parse(rawReq) : [];
        const list = Array.isArray(parsedReq) ? parsedReq : [];
        const exists = list.some(
          (item) =>
            item &&
            typeof item === 'object' &&
            ((item as Record<string, unknown>).id === createdRequest.id ||
              (item as Record<string, unknown>).request_code ===
                createdRequest.request_code)
        );
        if (!exists) {
          window.localStorage.setItem(
            STORAGE_REQUESTS_KEY,
            JSON.stringify([createdRequest, ...list])
          );
        }
      } catch {
        // Ignore storage access errors
      }
    }

    window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
    window.dispatchEvent(new CustomEvent(AUDIT_UPDATED_EVENT));
  };

  const handleCreateLeaveDraft = async (
    msgId: string,
    draft: NaturalLanguageLeaveDraft
  ) => {
    if (submittingDraftIdsRef.current.has(msgId)) return;
    const currentStatus = draftSubmissions[msgId]?.status;
    if (currentStatus === 'submitting' || currentStatus === 'created') return;

    submittingDraftIdsRef.current.add(msgId);
    setDraftSubmissions((prev) => ({
      ...prev,
      [msgId]: { status: 'submitting' },
    }));

    try {
      const handoverCode = extractDraftHandoverCode(draft.parsed_handover_to);
      const payload: Record<string, unknown> = {
        type: draft.parsed_category,
        startDate: draft.parsed_start_date,
        endDate: draft.parsed_end_date,
        daysCount: draft.parsed_duration_days,
        reason: draft.parsed_reason,
      };
      if (handoverCode) {
        payload.handoverEmployeeCode = handoverCode;
      }
      if (draft.parsed_handover_to?.trim()) {
        payload.handoverToName = draft.parsed_handover_to.trim();
      }

      const res = await fetch('/api/hrm/copilot/leave-draft', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let json: {
        success?: boolean;
        data?: LeaveOvertimeRequest;
        error?: { code?: string; message?: string };
      } | null = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!isMountedRef.current) return;

      if (res.status === 401) {
        const msg =
          json?.error?.message ||
          'Phiên đăng nhập đã hết hạn hoặc chưa được xác thực. Vui lòng đăng nhập lại để tạo đơn.';
        setRequiresRelogin(true);
        setDraftSubmissions((prev) => ({
          ...prev,
          [msgId]: { status: 'error', error: msg },
        }));
        showToast('Phiên đăng nhập hết hạn', msg, 'error');
        return;
      }

      if (!res.ok || !json?.success || !json.data) {
        const msg =
          json?.error?.message ||
          (res.status === 403
            ? 'Bạn không có quyền tạo đơn từ qua trợ lý.'
            : 'Không thể tạo đơn từ nội dung đề xuất. Vui lòng kiểm tra hoặc mở form chi tiết.');
        setDraftSubmissions((prev) => ({
          ...prev,
          [msgId]: { status: 'error', error: msg },
        }));
        showToast('Không thể tạo đơn từ', msg, 'error');
        return;
      }

      const createdReq = json.data;
      const requestCode = createdReq.request_code || createdReq.id;
      await refreshRuntimeStoresFromServer(createdReq);
      if (!isMountedRef.current) return;

      setDraftSubmissions((prev) => ({
        ...prev,
        [msgId]: { status: 'created', requestCode },
      }));
      showToast(
        `Đã tạo đơn ${requestCode}`,
        `${createdReq.category_label} (${createdReq.duration_days_or_hours} ${
          createdReq.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
        }) đã được gửi duyệt.`,
        'success'
      );
    } catch {
      if (!isMountedRef.current) return;
      const msg =
        'Không thể kết nối tới máy chủ tạo đơn. Vui lòng thử lại hoặc mở form chi tiết.';
      setDraftSubmissions((prev) => ({
        ...prev,
        [msgId]: { status: 'error', error: msg },
      }));
      showToast('Lỗi kết nối', msg, 'error');
    } finally {
      submittingDraftIdsRef.current.delete(msgId);
    }
  };

  const handleSubmitRouterDraft = async (draft: RouterCardDraft) => {
    if (submittingRouterDraftIdsRef.current.has(draft.draftId)) return;
    const currentStatus = routerSubmissions[draft.draftId]?.status;
    if (currentStatus === 'submitting' || currentStatus === 'created') return;

    submittingRouterDraftIdsRef.current.add(draft.draftId);
    setRouterSubmissions((prev) => ({
      ...prev,
      [draft.draftId]: { status: 'submitting' },
    }));

    try {
      const res = await fetch('/api/requests/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: draft.draftId,
          confirmToken: draft.confirmToken,
        }),
      });

      let json: {
        success?: boolean;
        data?: {
          requestCode?: string;
          nextApprover?: string;
          reply?: string;
        };
        error?: { code?: string; message?: string };
      } | null = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!isMountedRef.current) return;

      if (res.status === 401) {
        const msg =
          json?.error?.message ||
          'Phiên đăng nhập đã hết hạn hoặc chưa được xác thực. Vui lòng đăng nhập lại để gửi đơn.';
        setRequiresRelogin(true);
        setRouterSubmissions((prev) => ({
          ...prev,
          [draft.draftId]: { status: 'error', error: msg },
        }));
        showToast('Phiên đăng nhập hết hạn', msg, 'error');
        return;
      }

      if (!res.ok || !json?.success || !json.data) {
        const msg =
          json?.error?.message ||
          (res.status === 403
            ? 'Bạn không có quyền gửi đơn này.'
            : 'Không thể gửi đơn từ. Vui lòng kiểm tra lại.');
        setRouterSubmissions((prev) => ({
          ...prev,
          [draft.draftId]: { status: 'error', error: msg },
        }));
        showToast('Không thể gửi đơn', msg, 'error');
        return;
      }

      const requestCode = String(json.data.requestCode || '').trim();
      const replyText = String(
        json.data.reply ||
          (draft.kind === 'cancel'
            ? `Đã hủy đơn ${requestCode}.`
            : `Đơn ${requestCode} đã được gửi duyệt.`)
      );

      setRouterSubmissions((prev) => ({
        ...prev,
        [draft.draftId]: { status: 'created', requestCode },
      }));

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-router-submit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userQuery:
            draft.kind === 'cancel'
              ? `Xác nhận hủy đơn ${draft.preview.cancelRequestCode || requestCode}`.trim()
              : `Gửi đơn: ${draft.preview.typeLabel}`,
          aiResponse: replyText,
          referencedPolicy: 'Hệ thống Đơn từ Lạc Việt',
          modelSource: 'router',
          source: 'router',
          submittedRequestCode: requestCode || undefined,
          submittedKind: draft.kind,
        },
      ]);

      await refreshRuntimeStoresFromServer();
      if (!isMountedRef.current) return;

      showToast(
        draft.kind === 'cancel'
          ? `Đã hủy đơn ${requestCode}`
          : `Đã gửi đơn ${requestCode}`,
        replyText,
        'success'
      );
    } catch {
      if (!isMountedRef.current) return;
      const msg = 'Không thể kết nối tới máy chủ gửi đơn. Vui lòng thử lại.';
      setRouterSubmissions((prev) => ({
        ...prev,
        [draft.draftId]: { status: 'error', error: msg },
      }));
      showToast('Lỗi kết nối', msg, 'error');
    } finally {
      submittingRouterDraftIdsRef.current.delete(draft.draftId);
    }
  };

  const sendCopilotQuery = async (rawQuery: string, presetId?: string) => {
    const trimmedQuery = rawQuery.trim();
    if (!trimmedQuery || isLoading) return;

    const normalizedCmd = trimmedQuery.toLowerCase();
    if (
      normalizedCmd === 'demo' ||
      normalizedCmd === 'bật demo' ||
      normalizedCmd === 'bat demo' ||
      normalizedCmd === 'tắt demo' ||
      normalizedCmd === 'tat demo'
    ) {
      const enableDemo =
        normalizedCmd === 'demo' ||
        normalizedCmd === 'bật demo' ||
        normalizedCmd === 'bat demo';
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            'hrm_demo_hide_liveness',
            enableDemo ? '1' : '0'
          );
          window.dispatchEvent(new Event('hrm-demo-mode-change'));
        } catch {
          // ignore storage errors
        }
      }
      setActiveQA(presetId ?? null);
      setErrorMessage(null);
      setLastFailedQuery(null);
      setRequiresRelogin(false);
      if (!presetId) {
        setQuery('');
      }
      const nextMsg: CopilotMessage = {
        id: `msg-${Date.now()}`,
        userQuery: trimmedQuery,
        aiResponse: enableDemo
          ? "Đã bật chế độ Demo: ẩn bảng Kiểm tra Liveness trực tiếp trên khung camera. Gõ 'tắt demo' để hiện lại."
          : 'Đã tắt chế độ Demo: hiển thị lại bảng Kiểm tra Liveness trực tiếp trên khung camera.',
      };
      setMessages((prev) => [...prev, nextMsg]);
      return;
    }

    setActiveQA(presetId ?? null);
    setErrorMessage(null);
    setLastFailedQuery(null);
    setRequiresRelogin(false);

    if (!presetId) {
      setQuery('');
    }
    setIsLoading(true);

    const history = messages
      .flatMap((m) => [
        { role: 'user' as const, content: m.userQuery },
        { role: 'assistant' as const, content: m.aiResponse },
      ])
      .slice(-16);

    chatControllerRef.current?.abort();
    const controller = new AbortController();
    chatControllerRef.current = controller;

    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45_000);

    try {
      const res = await fetch('/api/hrm/copilot', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: trimmedQuery,
          history,
        }),
        signal: controller.signal,
      });

      let json: {
        success?: boolean;
        data?: {
          reply?: string;
          referencedPolicy?: string;
          isSmalltalk?: boolean;
          hideCitation?: boolean;
          isTrueLlmFallback?: boolean;
          fallbackReason?: string;
          modelSource?: string;
          source?: string;
          usedRouterBridge?: boolean;
          card?: RouterCard | null;
          leaveDraft?: NaturalLanguageLeaveDraft | null;
        };
        error?: {
          code?: string;
          message?: string;
        };
      } | null = null;

      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!isMountedRef.current) return;

      if (res.ok && json?.success && json.data) {
        const rawModelSource = json.data.modelSource;
        const isRouterReply =
          json.data.source === 'router' || rawModelSource === 'router';
        const nextSource: CopilotMessage['modelSource'] = isRouterReply
          ? 'router'
          : rawModelSource === 'lacviet-ai'
            ? 'lacviet-ai'
            : rawModelSource === 'fallback'
              ? 'fallback'
              : 'online';
        const resolvedSource: CopilotMessage['source'] = isRouterReply
          ? 'router'
          : nextSource === 'lacviet-ai' ||
              nextSource === 'online' ||
              json.data.source === 'model'
            ? 'model'
            : 'fallback';
        const isTrueLlmFallback = Boolean(json.data.isTrueLlmFallback);
        const reason =
          typeof json.data.fallbackReason === 'string'
            ? json.data.fallbackReason.trim()
            : '';
        if (isTrueLlmFallback) {
          setAiStatus('FALLBACK');
          setFallbackReason(
            reason || 'Model AI tạm thời gián đoạn, đang dùng dữ liệu dự phòng'
          );
        } else if (
          !isRouterReply &&
          (nextSource === 'online' || nextSource === 'lacviet-ai')
        ) {
          setAiStatus('ONLINE');
          setFallbackReason(null);
        }
        const isSmalltalk = Boolean(json.data.isSmalltalk);
        const hideCitation = Boolean(json.data.hideCitation || isSmalltalk);
        const rawPolicy =
          typeof json.data.referencedPolicy === 'string'
            ? json.data.referencedPolicy.trim()
            : '';
        const nextMsg: CopilotMessage = {
          id: `msg-${Date.now()}`,
          userQuery: trimmedQuery,
          aiResponse: String(json.data.reply || ''),
          referencedPolicy: hideCitation ? '' : rawPolicy,
          isSmalltalk,
          hideCitation,
          modelSource: nextSource,
          source: resolvedSource,
          usedRouterBridge: Boolean(json.data.usedRouterBridge),
          card: json.data.card ?? null,
          leaveDraft: json.data.leaveDraft ?? null,
        };
        setMessages((prev) => [...prev, nextMsg]);
        return;
      }

      if (res.status === 401) {
        setRequiresRelogin(true);
        setLastFailedQuery(null);
        setErrorMessage(
          json?.error?.message ||
            'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại để tiếp tục sử dụng Trợ lý Lạc Việt.'
        );
        return;
      }

      if (res.status === 403) {
        setRequiresRelogin(false);
        setLastFailedQuery(null);
        setErrorMessage(
          json?.error?.message ||
            'Bạn không có quyền thực hiện yêu cầu này hoặc truy cập bị từ chối bởi chính sách bảo mật.'
        );
        return;
      }

      if (
        res.status === 400 ||
        res.status === 413 ||
        res.status === 415 ||
        res.status === 422 ||
        res.status === 429
      ) {
        const fallbackErr =
          res.status === 429
            ? 'Bạn gửi quá nhiều yêu cầu tới Trợ lý Lạc Việt. Vui lòng thử lại sau ít phút.'
            : 'Nội dung câu hỏi chưa hợp lệ. Vui lòng kiểm tra và thử lại.';
        setErrorMessage(json?.error?.message || fallbackErr);
        setLastFailedQuery(res.status === 429 ? trimmedQuery : null);
        return;
      }

      setAiStatus('FALLBACK');
      setFallbackReason('Lỗi kết nối hoặc máy chủ AI phản hồi quá chậm');
      setErrorMessage(
        json?.error?.message ||
          'Máy chủ Trợ lý Lạc Việt đang bận. Vui lòng thử lại sau giây lát.'
      );
      setLastFailedQuery(trimmedQuery);
    } catch {
      if (!isMountedRef.current || (controller.signal.aborted && !timedOut)) {
        return;
      }
      setAiStatus('FALLBACK');
      setFallbackReason('Lỗi kết nối hoặc máy chủ AI phản hồi quá chậm');
      setErrorMessage(
        timedOut
          ? 'Yêu cầu xử lý quá thời gian chờ. Vui lòng thử lại.'
          : 'Không thể kết nối tới máy chủ Trợ lý Lạc Việt. Vui lòng kiểm tra kết nối và thử lại.'
      );
      setLastFailedQuery(trimmedQuery);
    } finally {
      window.clearTimeout(timeoutId);
      if (chatControllerRef.current === controller) {
        chatControllerRef.current = null;
      }
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleAskPreset = (qa: (typeof MOCK_COPILOT_QA)[number]) => {
    void sendCopilotQuery(qa.user_query, qa.id);
  };

  const handleSubmitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    void sendCopilotQuery(trimmed);
  };

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
        <span className="text-xs font-medium text-[#11221E] dark:text-zinc-200">
          Trợ lý AI
        </span>
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

  const displayUser =
    currentUserProfile?.fullName?.trim() ||
    (currentUserEmail ? currentUserEmail.split('@')[0] : 'bạn');
  const displayRole = isAuthenticated
    ? currentUserProfile?.title?.trim() || ROLE_LABELS_VI[role] || 'Nhân sự'
    : 'Chưa đăng nhập';

  const scopedQaSuggestions = MOCK_COPILOT_QA.filter((qa) => {
    if (role === 'CANDIDATE') return false;
    if (canViewCompanyAnalytics) return true;
    if (role === 'DEPT_MANAGER') {
      return (
        qa.role_scope === 'DEPT_MANAGER' ||
        qa.role_scope === 'EMPLOYEE' ||
        qa.role_scope === 'ALL'
      );
    }
    return qa.role_scope === 'EMPLOYEE' || qa.role_scope === 'ALL';
  }).map((qa) => {
    if (
      role === 'DEPT_MANAGER' &&
      qa.id === 'qa-004' &&
      currentUserProfile?.department
    ) {
      return {
        ...qa,
        prompt_label: `Tóm tắt đơn chờ duyệt và ứng viên phỏng vấn của ${currentUserProfile.department}`,
        user_query: `${currentUserProfile.department} hiện có bao nhiêu đơn xin nghỉ/OT chờ duyệt?`,
      };
    }
    return qa;
  });

  const statusBadge =
    role !== 'CANDIDATE' && isAuthenticated && aiStatus !== 'IDLE'
      ? aiStatus === 'ONLINE'
        ? {
            label: 'Trợ lý Lạc Việt · Sẵn sàng',
            dotClass: 'bg-emerald-500 dark:bg-emerald-400',
            textClass: 'text-[#0B4F4A] dark:text-teal-300',
            bgClass:
              'border-[#0F766E]/25 bg-[#FCFEFD]/90 dark:border-teal-500/30 dark:bg-[#16171B]',
          }
        : aiStatus === 'WAKING'
          ? {
              label: 'Trợ lý Lạc Việt · Đang kết nối...',
              dotClass: 'animate-pulse bg-amber-500 dark:bg-amber-400',
              textClass: 'text-amber-800 dark:text-amber-300',
              bgClass:
                'border-amber-500/30 bg-amber-50/90 dark:border-amber-500/30 dark:bg-amber-950/30',
            }
          : {
              label: 'Trợ lý Lạc Việt · Dự phòng',
              dotClass: 'bg-slate-400 dark:bg-zinc-400',
              textClass: 'text-[#415A54] dark:text-zinc-300',
              bgClass:
                'border-[#C6D9D3] bg-[#FCFEFD]/80 dark:border-zinc-700 dark:bg-[#202329]',
            }
      : null;

  const fallbackTooltipText =
    fallbackReason || 'Đang dùng chế độ dự phòng do model AI chưa sẵn sàng';

  return (
    <aside
      aria-label="Trợ lý AI Lạc Việt Copilot"
      className="fixed bottom-4 right-4 z-40 flex h-[480px] max-h-[calc(100dvh-2rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] shadow-2xl transition-all dark:border-zinc-800 dark:bg-[#16171B]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 rounded-t-2xl border-b border-[#C6D9D3] bg-[#E4EEEB] px-3.5 py-2.5 dark:border-zinc-800 dark:bg-[#202329]">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#0F766E] text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-[#11221E] dark:text-zinc-100">
              Trợ lý Lạc Việt
            </div>
            <div className="truncate text-[10px] text-[#5C7871] dark:text-zinc-400">
              {displayUser} · {displayRole}
            </div>
            {statusBadge &&
              (aiStatus === 'FALLBACK' ? (
                <div className="group relative mt-1 inline-flex max-w-full">
                  <button
                    type="button"
                    title={fallbackTooltipText}
                    aria-label={`${statusBadge.label}. Lý do: ${fallbackTooltipText}`}
                    aria-describedby="copilot-fallback-reason-tooltip"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.currentTarget.blur();
                      }
                    }}
                    className={cn(
                      'inline-flex max-w-full cursor-help items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:border-[#0F766E]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:hover:border-zinc-500',
                      statusBadge.bgClass,
                      statusBadge.textClass
                    )}
                  >
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusBadge.dotClass)}
                      aria-hidden="true"
                    />
                    <span className="truncate">{statusBadge.label}</span>
                    <AlertCircle
                      className="h-2.5 w-2.5 shrink-0 opacity-75"
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    id="copilot-fallback-reason-tooltip"
                    role="tooltip"
                    className="pointer-events-none invisible absolute left-0 top-full z-50 pt-1.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 motion-reduce:transition-none"
                  >
                    <div className="w-[min(15.5rem,calc(100vw-6.5rem))] rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 py-2 text-[11px] leading-snug font-normal text-[#11221E] shadow-lg dark:border-zinc-700 dark:bg-[#202329] dark:text-zinc-100">
                      <div className="font-semibold text-[#0B4F4A] dark:text-teal-300">
                        Chế độ dự phòng
                      </div>
                      <p className="mt-0.5 break-words text-[#415A54] dark:text-zinc-300">
                        {fallbackTooltipText}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    statusBadge.bgClass,
                    statusBadge.textClass
                  )}
                >
                  <span
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusBadge.dotClass)}
                    aria-hidden="true"
                  />
                  <span className="truncate">{statusBadge.label}</span>
                </div>
              ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <div className="rounded-xl bg-[#F2F7F5] p-3 text-[#415A54] dark:bg-zinc-800/50 dark:text-zinc-300">
          {role === 'CANDIDATE' ? (
            <>
              Chào <b>{displayUser}</b>! Tài khoản Ứng viên chỉ tra cứu tiến độ hồ sơ và lịch phỏng vấn trên Cổng Tuyển dụng, không có quyền dùng trợ lý nội bộ.
            </>
          ) : (
            <>
              Chào <b>{displayUser}</b>! Mình có thể hỗ trợ gì cho bạn về nhân sự hôm nay? Bạn có thể hỏi về phép năm, phiếu lương hoặc đề xuất nội dung đơn từ.
            </>
          )}
        </div>

        {messages.length === 0 && scopedQaSuggestions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-[#5C7871] dark:text-zinc-400">
              Câu hỏi gợi ý nhanh:
            </div>
            {scopedQaSuggestions.slice(0, 3).map((qa) => (
              <button
                key={qa.id}
                type="button"
                disabled={isLoading}
                onClick={() => handleAskPreset(qa)}
                className={cn(
                  'w-full rounded-lg border p-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  activeQA === qa.id
                    ? 'border-[#0F766E] bg-[#E8F3EF] font-semibold text-[#11221E] dark:border-teal-400 dark:bg-teal-950/40 dark:text-zinc-100'
                    : 'border-[#D5E3DF] bg-white text-[#415A54] hover:bg-[#F2F7F5] dark:border-zinc-800 dark:bg-[#202329] dark:text-zinc-300 dark:hover:bg-zinc-800'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" />
                  <span className="line-clamp-2">{qa.prompt_label}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            data-testid="copilot-message-card"
            className="space-y-2 rounded-xl border border-[#C6D9D3] bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-[#202329]"
          >
            <div className="break-words font-semibold text-[#11221E] dark:text-zinc-100">
              {msg.userQuery}
            </div>
            <div className="whitespace-pre-line break-words text-[11px] leading-relaxed text-[#415A54] dark:text-zinc-300">
              {renderSafeBoldText(msg.aiResponse)}
            </div>
            {!(msg.hideCitation && !msg.submittedRequestCode && !msg.card) &&
              (msg.modelSource || msg.source || msg.submittedRequestCode) && (
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-medium text-[#0F766E] dark:text-teal-400">
                <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                  {msg.submittedRequestCode && (
                    <button
                      type="button"
                      onClick={() => {
                        navigateWithIntent('leaves', {
                          entityId: msg.submittedRequestCode,
                        });
                        setIsMinimized(true);
                      }}
                      className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-md border border-[#C6D9D3] bg-white px-2 py-1 text-[10px] font-semibold text-[#0B4F4A] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:border-zinc-700 dark:bg-[#16171B] dark:text-teal-300 dark:hover:bg-zinc-800"
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span>Xem đơn {msg.submittedRequestCode}</span>
                    </button>
                  )}
                  {(msg.modelSource || msg.source) && (
                    <span className="shrink-0 rounded bg-[#E8F3EF] px-1.5 py-0.5 text-[9px] font-semibold text-[#0B4F4A] dark:bg-[#16171B] dark:text-teal-300">
                      Trợ lý Lạc Việt
                    </span>
                  )}
                </div>
              </div>
            )}
            {msg.card &&
              msg.card.drafts.length > 0 &&
              (() => {
                const isCancelCard = msg.card.kind === 'cancel_confirm';
                const anySubmitting = msg.card.drafts.some(
                  (d) => routerSubmissions[d.draftId]?.status === 'submitting'
                );
                const allSubmitted = msg.card.drafts.every(
                  (d) => routerSubmissions[d.draftId]?.status === 'created'
                );

                return (
                  <div className="mt-1 space-y-2 rounded-lg border border-[#0F766E]/25 bg-[#F2F7F5] p-2.5 dark:border-zinc-700 dark:bg-[#16171B]">
                    {msg.card.drafts.map((draft, idx) => {
                      const sub = routerSubmissions[draft.draftId];
                      const isSubmitting = sub?.status === 'submitting';
                      const isCreated = sub?.status === 'created';
                      const isCancelDraft =
                        isCancelCard || draft.kind === 'cancel';
                      const handoverName = (
                        draft.preview.handoverToName || ''
                      ).trim();

                      return (
                        <div
                          key={draft.draftId}
                          className="space-y-1.5 rounded-md border border-[#C6D9D3]/80 bg-white/90 p-2 text-[11px] text-[#11221E] dark:border-zinc-800 dark:bg-[#202329] dark:text-zinc-200"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="min-w-0 break-words font-semibold">
                              {msg.card!.drafts.length > 1
                                ? `${idx + 1}. ${draft.preview.typeLabel}`
                                : draft.preview.typeLabel}
                            </span>
                            {draft.preview.cancelRequestCode && (
                              <span className="shrink-0 rounded bg-[#E8F3EF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0B4F4A] dark:bg-zinc-900 dark:text-teal-300">
                                {draft.preview.cancelRequestCode}
                              </span>
                            )}
                          </div>

                          <div className="break-words font-mono text-[10px] tabular-nums text-[#415A54] dark:text-zinc-300">
                            {draft.preview.dateText}
                            {typeof draft.preview.days === 'number'
                              ? ` · ${draft.preview.days} ngày`
                              : ''}
                            {typeof draft.preview.hours === 'number'
                              ? ` · ${draft.preview.hours} giờ`
                              : ''}
                            {typeof draft.preview.otMultiplier === 'number'
                              ? ` (Hệ số ${draft.preview.otMultiplier}x)`
                              : ''}
                          </div>

                          {draft.preview.reason && (
                            <div className="break-words text-[10px] text-[#415A54] dark:text-zinc-400">
                              Lý do: {draft.preview.reason}
                            </div>
                          )}

                          {handoverName && (
                            <div className="break-words text-[10px] text-[#415A54] dark:text-zinc-400">
                              Bàn giao: {handoverName}
                            </div>
                          )}

                          {typeof draft.preview.balanceAfter === 'number' && (
                            <div className="text-[10px] text-[#0B4F4A] dark:text-teal-300">
                              Phép năm còn lại sau đơn:{' '}
                              <span className="font-mono font-semibold tabular-nums">
                                {draft.preview.balanceAfter}
                              </span>{' '}
                              ngày
                            </div>
                          )}

                          {typeof draft.preview.explanationsLeft ===
                            'number' && (
                            <div className="text-[10px] text-[#0B4F4A] dark:text-teal-300">
                              Số lần giải trình còn lại trong tháng:{' '}
                              <span className="font-mono font-semibold tabular-nums">
                                {draft.preview.explanationsLeft}
                              </span>
                            </div>
                          )}

                          {sub?.status === 'error' && sub.error && (
                            <div
                              role="alert"
                              className="flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-50 px-2 py-1.5 text-[10px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200"
                            >
                              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
                              <span className="min-w-0 break-words">
                                {sub.error}
                              </span>
                            </div>
                          )}

                          {isCreated ? (
                            <div className="space-y-1.5">
                              <div
                                role="status"
                                className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 break-words">
                                  {isCancelDraft ? 'Đã hủy đơn' : 'Đã gửi đơn'}{' '}
                                  {sub.requestCode && (
                                    <span className="font-mono tabular-nums">
                                      {sub.requestCode}
                                    </span>
                                  )}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigateWithIntent('leaves', {
                                    entityId: sub.requestCode,
                                  });
                                  setIsMinimized(true);
                                }}
                                className="inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1 text-[11px] font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:border-zinc-700 dark:bg-[#202329] dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span>Xem trong Đơn từ</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                disabled={isSubmitting || isLoading}
                                aria-busy={isSubmitting}
                                onClick={() =>
                                  void handleSubmitRouterDraft(draft)
                                }
                                className={cn(
                                  'inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
                                  isCancelDraft
                                    ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500'
                                    : 'bg-[#0F766E] hover:bg-[#0D5F58] focus-visible:ring-[#0F766E] dark:bg-teal-600 dark:hover:bg-teal-500'
                                )}
                              >
                                {isSubmitting ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span>
                                  {isSubmitting
                                    ? 'Đang xử lý...'
                                    : isCancelDraft
                                      ? 'Xác nhận hủy đơn'
                                      : 'Gửi đơn'}
                                </span>
                              </button>

                              {msg.card!.drafts.length === 1 && (
                                <button
                                  type="button"
                                  disabled={isSubmitting || isLoading}
                                  onClick={() => void sendCopilotQuery('hủy nháp')}
                                  className="inline-flex min-h-[34px] shrink-0 items-center justify-center rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-[#202329] dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  Hủy nháp
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {msg.card.drafts.length > 1 && !allSubmitted && (
                      <button
                        type="button"
                        disabled={anySubmitting || isLoading}
                        onClick={() => void sendCopilotQuery('hủy nháp')}
                        className="inline-flex min-h-[34px] w-full items-center justify-center rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-[#202329] dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Hủy nháp
                      </button>
                    )}
                  </div>
                );
              })()}
            {msg.leaveDraft &&
              (() => {
                const sub = draftSubmissions[msg.id];
                const isSubmittingDraft = sub?.status === 'submitting';
                const isCreatedDraft = sub?.status === 'created';
                const handoverText = (
                  msg.leaveDraft.parsed_handover_to || ''
                ).trim();
                const showHandover =
                  Boolean(handoverText) &&
                  !/^(?:n\/a|none|chua xac dinh|chưa chỉ định|không có|mặc định)$/i.test(
                    handoverText
                  );

                return (
                  <div className="mt-1 space-y-2 rounded-lg border border-[#0F766E]/25 bg-[#F2F7F5] p-2.5 dark:border-zinc-700 dark:bg-[#16171B]">
                    <p className="text-[11px] font-medium leading-snug text-[#0B4F4A] dark:text-teal-300">
                      Mình đề xuất nội dung đơn như sau, bạn kiểm tra rồi bấm Tạo đơn:
                    </p>
                    <div className="space-y-1 rounded-md border border-[#C6D9D3]/80 bg-white/80 p-2 text-[11px] text-[#11221E] dark:border-zinc-800 dark:bg-[#202329] dark:text-zinc-200">
                      <div className="font-semibold">
                        {msg.leaveDraft.parsed_category_label}
                      </div>
                      <div className="font-mono text-[10px] tabular-nums text-[#415A54] dark:text-zinc-300">
                        {msg.leaveDraft.parsed_start_date} →{' '}
                        {msg.leaveDraft.parsed_end_date} ·{' '}
                        {msg.leaveDraft.parsed_duration_days}{' '}
                        {msg.leaveDraft.parsed_category === 'OVERTIME' ? 'giờ' : 'ngày'}
                      </div>
                      {msg.leaveDraft.parsed_reason && (
                        <div className="break-words text-[10px] text-[#415A54] dark:text-zinc-400">
                          Lý do: {msg.leaveDraft.parsed_reason}
                        </div>
                      )}
                      {showHandover && (
                        <div className="break-words text-[10px] text-[#415A54] dark:text-zinc-400">
                          Bàn giao: {handoverText}
                        </div>
                      )}
                    </div>

                    {sub?.status === 'error' && sub.error && (
                      <div
                        role="alert"
                        className="flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-50 px-2 py-1.5 text-[10px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200"
                      >
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span className="break-words">{sub.error}</span>
                      </div>
                    )}

                    {isCreatedDraft ? (
                      <div className="space-y-1.5">
                        <div
                          role="status"
                          className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Đã tạo đơn{' '}
                            <span className="font-mono tabular-nums">
                              {sub.requestCode}
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithIntent('leaves', {
                              entityId: sub.requestCode,
                            });
                            setIsMinimized(true);
                          }}
                          className="inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1 text-[11px] font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:border-zinc-700 dark:bg-[#202329] dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span>Xem trong Đơn từ</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isSubmittingDraft}
                          aria-busy={isSubmittingDraft}
                          onClick={() =>
                            void handleCreateLeaveDraft(msg.id, msg.leaveDraft!)
                          }
                          className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0D5F58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500"
                        >
                          {isSubmittingDraft ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>
                            {isSubmittingDraft ? 'Đang tạo đơn...' : 'Tạo đơn'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isSubmittingDraft}
                          onClick={() => {
                            if (!msg.leaveDraft) return;
                            navigateWithIntent('leaves', {
                              subTab: 'copilot-draft',
                              leaveDraft: msg.leaveDraft,
                            });
                            setIsMinimized(true);
                          }}
                          className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1 rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-[#202329] dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span>Mở form chi tiết</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        ))}

        {isLoading && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl border border-[#C6D9D3] bg-white p-3 text-[11px] text-[#415A54] dark:border-zinc-800 dark:bg-[#202329] dark:text-zinc-300"
          >
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0F766E] [animation-delay:-0.3s] dark:bg-teal-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0F766E] [animation-delay:-0.15s] dark:bg-teal-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0F766E] dark:bg-teal-400" />
            </span>
            <span>Đang suy nghĩ...</span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-50/90 p-3 text-[11px] text-rose-900 dark:border-rose-500/35 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <div className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="break-words leading-relaxed">{errorMessage}</span>
            </div>
            {requiresRelogin && (
              <button
                type="button"
                aria-label="Đăng nhập lại để khôi phục phiên Copilot"
                onClick={() => {
                  logout();
                  if (typeof window !== 'undefined') {
                    window.location.assign('/login');
                  }
                }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#0D5F58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                <span>Đăng nhập lại</span>
              </button>
            )}
            {lastFailedQuery && (
              <button
                type="button"
                aria-label="Thử lại gửi câu hỏi Copilot"
                disabled={isLoading}
                onClick={() => void sendCopilotQuery(lastFailedQuery)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rose-500/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-800 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 dark:border-rose-400/30 dark:bg-[#202329] dark:text-rose-200 dark:hover:bg-rose-950/50"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Thử lại</span>
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Footer input */}
      <div className="rounded-b-2xl border-t border-[#C6D9D3] bg-[#F8FAF9] p-2.5 dark:border-zinc-800 dark:bg-[#202329]/80">
        <form onSubmit={handleSubmitQuery} className="flex items-center gap-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập câu hỏi phép năm, lương, quy chế..."
            aria-label="Nhập câu hỏi cho Trợ lý AI"
            className="min-w-0 flex-1 rounded-lg border border-[#C6D9D3] bg-white px-2.5 py-1.5 text-xs text-[#11221E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] dark:border-zinc-700 dark:bg-[#16171B] dark:text-zinc-100"
          />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            aria-label="Gửi câu hỏi Copilot"
            className="h-8 shrink-0 px-2.5"
            disabled={!query.trim() || isLoading}
          >
            <Send className="h-3 w-3" />
          </Button>
        </form>
      </div>
    </aside>
  );
}
