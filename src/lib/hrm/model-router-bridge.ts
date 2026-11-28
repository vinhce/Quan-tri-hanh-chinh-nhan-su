import {
  DRAFT_TTL_MS,
  TPL_ASK_SESSION,
  TPL_ASK_TYPE_DATES,
  TPL_BAD_REASON,
  TPL_CANCEL_CONFIRM_GUIDE,
  TPL_CLICK_SUBMIT,
  TPL_DRAFT_CANCELLED,
  TPL_ERR_MISSING_FIELD_MESSAGES,
  TPL_PREVIEW,
  TPL_RATE_LIMIT_DRAFTS,
  TPL_REFUSE_STANDARD,
  TPL_VALIDATION_ERROR,
  isReasonInjection,
  stripDiacritics,
  type RequestInput,
  type RequestType,
  type RouterCard,
  type RouterServices,
  type RouterSessionUser,
  type RouterState,
  type RouterStateStore,
  type Session,
} from '@/lib/hrm/copilot-router';

export const ALLOWED_MODEL_ROUTER_ACTIONS = [
  'get_order_context',
  'validate_request',
  'create_draft',
  'cancel_draft',
  'list_my_requests',
  'draft_cancel_request',
  'search_colleagues',
] as const;

export type AllowedModelRouterAction = (typeof ALLOWED_MODEL_ROUTER_ACTIONS)[number];

const ALLOWED_ACTION_SET = new Set<string>(ALLOWED_MODEL_ROUTER_ACTIONS);
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_REQUEST_TYPES = new Set<RequestType>([
  'annual_leave',
  'unpaid_leave',
  'sick_leave',
  'attendance_explanation',
  'overtime',
]);
const ALLOWED_SESSIONS = new Set<Session>(['full', 'am', 'pm']);

export const MODEL_ROUTER_TOOL_PROMPT = `Bạn có thể gọi ĐÚNG 1 trong 7 công cụ sau dưới dạng JSON {"action":"<tên>","params":{...}} (KHÔNG bao giờ có công cụ gửi/duyệt/xóa đơn):
1. get_order_context: {} — lấy số phép khả dụng, thời hạn báo nghỉ việc, số lần giải trình còn lại.
2. validate_request: { type, startDate, endDate, days, session, reason, workDate, actualIn, actualOut, otStart, otEnd }
3. create_draft: { type, startDate, endDate, days, session, reason, workDate, actualIn, actualOut, otStart, otEnd, handoverToId, handoverToName }
4. cancel_draft: { draftId }
5. list_my_requests: {}
6. draft_cancel_request: { targetRequestId }
7. search_colleagues: { query }`;

export interface ParsedModelToolCall {
  action: string;
  params: Record<string, unknown>;
}

export interface ModelBridgeExecutionResult {
  handled: boolean;
  source: 'model';
  usedRouterBridge: true;
  text: string;
  card?: RouterCard | null;
  templateId?: string;
  blockedSecurityAction?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasForbiddenPrototypeKeyInValue(value: unknown, depth: number): boolean {
  if (depth > 6) return true;
  if (isPlainObject(value)) {
    return hasForbiddenPrototypeKey(value, depth);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (hasForbiddenPrototypeKeyInValue(item, depth + 1)) return true;
    }
  }
  return false;
}

function hasForbiddenPrototypeKey(obj: Record<string, unknown>, depth = 0): boolean {
  if (depth > 6) return true;
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) return true;
    const val = obj[key];
    if (hasForbiddenPrototypeKeyInValue(val, depth + 1)) return true;
  }
  return false;
}

export function buildModelNluExtractionPrompt(params: {
  query: string;
  today: string;
  weekday: string;
}): { systemPrompt: string; userContent: string } {
  const systemPrompt = `Bạn là bộ trích xuất JSON ý định tạo/hủy đơn nhân sự tiếng Việt. Hôm nay là ${params.today} (${params.weekday}, múi giờ Asia/Ho_Chi_Minh).
CHỈ trả về ĐÚNG 1 đối tượng JSON hợp lệ, KHÔNG kèm giải thích hay markdown thừa.
- Nếu người dùng muốn tạo nháp đơn cho CHÍNH HỌ (nghỉ phép, nghỉ ốm, nghỉ không lương, OT, giải trình chấm công) và đủ ngữ cảnh để trích xuất, trả:
  {"action":"create_draft","params":{"type":"annual_leave"|"unpaid_leave"|"sick_leave"|"attendance_explanation"|"overtime","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","days":number,"session":"full"|"am"|"pm","reason":"chuỗi thuần","workDate":"YYYY-MM-DD","actualIn":"HH:MM","actualOut":"HH:MM","otStart":"HH:MM","otEnd":"HH:MM"}}
- Không tự gửi đơn, không tạo hộ người khác, không bịa ngày nếu không suy ra được từ câu nói. Nếu chỉ là hỏi thông tin/chính sách/số phép hoặc không phải yêu cầu tạo đơn, trả {"action":"none","params":{}}.`;

  return {
    systemPrompt,
    userContent: params.query,
  };
}

function trySafeParseToolJson(rawJson: string): ParsedModelToolCall | null {
  try {
    const parsed = JSON.parse(rawJson.trim()) as unknown;
    if (!isPlainObject(parsed) || hasForbiddenPrototypeKey(parsed)) return null;
    const rawAction = parsed.action;
    if (typeof rawAction !== 'string' || !rawAction.trim()) return null;
    const action = rawAction.trim();
    if (action === 'none') return null;

    const rawParams = parsed.params;
    const safeParams: Record<string, unknown> = Object.create(null);
    if (isPlainObject(rawParams)) {
      for (const [k, v] of Object.entries(rawParams)) {
        if (!FORBIDDEN_PROTO_KEYS.has(k)) {
          safeParams[k] = v;
        }
      }
    }
    return { action, params: safeParams };
  } catch {
    return null;
  }
}

export function parseModelToolCall(rawModelText: string): ParsedModelToolCall | null {
  if (!rawModelText || typeof rawModelText !== 'string') return null;
  const trimmed = rawModelText.trim();
  if (!trimmed) return null;

  // 1. <tool_call>{...}</tool_call>
  const tagMatch = trimmed.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (tagMatch?.[1]) {
    const parsed = trySafeParseToolJson(tagMatch[1]);
    if (parsed) return parsed;
  }

  // 2. Fenced ```json {...} ``` or ``` {...} ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    const parsed = trySafeParseToolJson(fenceMatch[1]);
    if (parsed) return parsed;
  }

  // 3. Raw JSON object { "action": "...", "params": {...} }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const parsed = trySafeParseToolJson(trimmed);
    if (parsed) return parsed;
  } else {
    const inlineObjMatch = trimmed.match(/(\{[\s\S]*"action"\s*:\s*"[^"]+"[\s\S]*\})/);
    if (inlineObjMatch?.[1]) {
      const parsed = trySafeParseToolJson(inlineObjMatch[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

export function isPotentialNaturalOrderQuery(query: string): boolean {
  const ascii = stripDiacritics(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!ascii || ascii.length < 8) return false;

  // Exclude policy, balance, salary, org lookup, resignation, or approval inquiries
  if (
    /\b(?:bao\s+nhieu|may\s+ngay|con\s+may|con\s+lai|chinh\s+sach|quy\s+dinh|nhu\s+the\s+nao|luong|bhxh|thue|tncn|hr\s+la\s+ai|truong\s+phong|giam\s+doc|nghi\s+viec|thoi\s+viec|duyet|phe\s+duyet|tu\s+choi)\b/.test(
      ascii
    )
  ) {
    return false;
  }

  const hasOrderCue =
    /\b(?:xin\s+nghi|muon\s+nghi|nghi\s+(?:may\s+hom|vai\s+ngay|it\s+hom|it\s+ngay|om|phep)|o\s+lai\s+lam|lam\s+them|tang\s+ca|\bot\b|cham\s+van\s+tay|cham\s+cong|giai\s+trinh)\b/.test(
      ascii
    );
  const hasPersonalLeaveReason =
    /\b(?:ban|om|sot|kham\s+benh|viec\s+gia\s+dinh|ve\s+que|nha\s+co\s+viec)\b/.test(ascii) &&
    /\b(?:nghi|hom|ngay|tuan|mai|toi|chieu|sang)\b/.test(ascii);

  return hasOrderCue || hasPersonalLeaveReason;
}

function buildSanitizedRequestInput(rawParams: Record<string, unknown>): RequestInput | null {
  const rawType = typeof rawParams.type === 'string' ? rawParams.type.trim() : '';
  if (!ALLOWED_REQUEST_TYPES.has(rawType as RequestType)) {
    return null;
  }
  const type = rawType as RequestType;
  const pickStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const pickBoundedSafeStr = (v: unknown, maxLen = 80) => {
    if (typeof v !== 'string') return undefined;
    const cleaned = v
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen);
    return cleaned || undefined;
  };
  const pickNum = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

  const rawSession = pickStr(rawParams.session);
  const session =
    rawSession && ALLOWED_SESSIONS.has(rawSession as Session)
      ? (rawSession as Session)
      : undefined;

  return {
    type,
    startDate: pickStr(rawParams.startDate),
    endDate: pickStr(rawParams.endDate),
    days: pickNum(rawParams.days),
    session,
    reason: pickStr(rawParams.reason),
    handoverToId: pickBoundedSafeStr(rawParams.handoverToId, 80),
    handoverToName: pickBoundedSafeStr(rawParams.handoverToName, 80),
    workDate: pickStr(rawParams.workDate),
    actualIn: pickStr(rawParams.actualIn),
    actualOut: pickStr(rawParams.actualOut),
    otStart: pickStr(rawParams.otStart),
    otEnd: pickStr(rawParams.otEnd),
    hours: pickNum(rawParams.hours),
  };
}

function getVnIsoFromMs(nowMs: number): string {
  const d = new Date(nowMs + 7 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

function addDaysIsoLocal(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

export async function executeModelActionThroughRouter(args: {
  action: string;
  params: Record<string, unknown>;
  sessionUser: RouterSessionUser;
  services: RouterServices;
  stateStore: RouterStateStore;
  now?: Date;
}): Promise<ModelBridgeExecutionResult> {
  const { action, params, sessionUser, services, stateStore, now = new Date() } = args;
  const nowMs = now.getTime();
  const cleanAction = (action || '').trim();

  // 1. Strict allowlist enforcement (never allow submit / approve / reject / delete)
  if (!ALLOWED_ACTION_SET.has(cleanAction)) {
    const isSubmitAttempt = /submit|gui/i.test(cleanAction);
    return {
      handled: true,
      source: 'model',
      usedRouterBridge: true,
      text: isSubmitAttempt ? TPL_CLICK_SUBMIT : TPL_REFUSE_STANDARD,
      templateId: isSubmitAttempt ? 'TPL_CLICK_SUBMIT' : 'TPL_REFUSE_STANDARD',
      blockedSecurityAction: true,
    };
  }

  // 2. Ignore any userId/employeeCode/role in params; enforce sessionUser.userId only
  const userId = sessionUser.userId;

  // 3. Reason prompt-injection guard (normalize CR/LF to prevent multiline bypass)
  if (typeof params.reason === 'string' && params.reason.trim()) {
    const rawReason = params.reason.replace(/[\r\n]+/g, ' ').trim();
    if (isReasonInjection(`lý do: ${rawReason}`)) {
      return {
        handled: true,
        source: 'model',
        usedRouterBridge: true,
        text: TPL_BAD_REASON,
        templateId: 'TPL_BAD_REASON',
        blockedSecurityAction: true,
      };
    }
  }

  const currentState = stateStore.get(userId, nowMs);

  switch (cleanAction as AllowedModelRouterAction) {
    case 'get_order_context': {
      const ctx = await services.getOrderContext(userId);
      const pendingSeg =
        ctx.pendingApprovalCount !== null
          ? ` Đơn đang chờ bạn duyệt: ${ctx.pendingApprovalCount}.`
          : '';
      const noticeSeg =
        ctx.noticeDays !== null ? ` Thời hạn báo trước nghỉ việc: ${ctx.noticeDays} ngày.` : '';
      return {
        handled: true,
        source: 'model',
        usedRouterBridge: true,
        text: `Phép năm khả dụng của bạn: ${ctx.leaveAvailable} ngày. Số lần giải trình chấm công còn lại trong tháng: ${ctx.explanationsLeft} lần.${noticeSeg}${pendingSeg}`,
        templateId: 'MODEL_ORDER_CONTEXT',
      };
    }

    case 'list_my_requests': {
      const list = await services.listMyRequests(userId);
      if (list.length === 0) {
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: 'Hiện bạn chưa có đơn từ nào trong hệ thống.',
          templateId: 'MODEL_LIST_REQUESTS',
        };
      }
      const summary = list
        .slice(0, 5)
        .map((r) => `${r.requestCode} (${r.typeLabel}, ${r.startDate} → ${r.endDate}, ${r.status})`)
        .join('; ');
      return {
        handled: true,
        source: 'model',
        usedRouterBridge: true,
        text: `Các đơn gần nhất của bạn: ${summary}.`,
        templateId: 'MODEL_LIST_REQUESTS',
      };
    }

    case 'search_colleagues': {
      const q = typeof params.query === 'string' ? params.query.trim() : '';
      const cols = await services.searchColleagues(userId, q);
      const text =
        cols.length === 0
          ? 'Không tìm thấy đồng nghiệp phù hợp.'
          : `Đồng nghiệp phù hợp: ${cols.map((c) => `${c.name} (${c.department})`).join(', ')}.`;
      return {
        handled: true,
        source: 'model',
        usedRouterBridge: true,
        text,
        templateId: 'MODEL_SEARCH_COLLEAGUES',
      };
    }

    case 'cancel_draft': {
      const draftId = typeof params.draftId === 'string' ? params.draftId.trim() : '';
      if (draftId) {
        await services.cancelDraft(userId, draftId);
      } else {
        for (const d of currentState.drafts) {
          await services.cancelDraft(userId, d.draftId);
        }
      }
      stateStore.reset(userId, nowMs);
      return {
        handled: true,
        source: 'model',
        usedRouterBridge: true,
        text: TPL_DRAFT_CANCELLED,
        templateId: 'TPL_DRAFT_CANCELLED',
      };
    }

    case 'draft_cancel_request': {
      const targetRequestId =
        typeof params.targetRequestId === 'string' ? params.targetRequestId.trim() : '';
      if (!targetRequestId) {
        return {
          handled: false,
          source: 'model',
          usedRouterBridge: true,
          text: '',
        };
      }
      if (!stateStore.canCreateDraft(userId, nowMs, 1)) {
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: TPL_RATE_LIMIT_DRAFTS,
          templateId: 'TPL_RATE_LIMIT_DRAFTS',
          blockedSecurityAction: true,
        };
      }
      let cancelDraft;
      try {
        cancelDraft = await services.draftCancelRequest(userId, targetRequestId, nowMs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/rate\s*limit|5\s*nháp|vượt giới hạn/i.test(msg)) {
          return {
            handled: true,
            source: 'model',
            usedRouterBridge: true,
            text: TPL_RATE_LIMIT_DRAFTS,
            templateId: 'TPL_RATE_LIMIT_DRAFTS',
            blockedSecurityAction: true,
          };
        }
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: msg || 'Không thể tạo nháp hủy đơn lúc này. Vui lòng thử lại sau.',
          templateId: 'ERR_DRAFT_CANCEL_FAILED',
        };
      }
      stateStore.recordDraftCreated(userId, nowMs, 1);
      const nextState: RouterState = {
        ...currentState,
        status: 'PREVIEW',
        drafts: [cancelDraft],
        cardKind: 'cancel_confirm',
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      stateStore.set(userId, nextState);
      return {
        handled: true,
        source: 'model',
        usedRouterBridge: true,
        text: TPL_CANCEL_CONFIRM_GUIDE,
        card: { kind: 'cancel_confirm', drafts: [cancelDraft] },
        templateId: 'TPL_CANCEL_CONFIRM_GUIDE',
      };
    }

    case 'validate_request':
    case 'create_draft': {
      const input = buildSanitizedRequestInput(params);
      if (!input) {
        return {
          handled: false,
          source: 'model',
          usedRouterBridge: true,
          text: '',
        };
      }

      const isLeaveType =
        input.type === 'annual_leave' ||
        input.type === 'unpaid_leave' ||
        input.type === 'sick_leave';

      if (isLeaveType && !input.startDate) {
        stateStore.set(userId, {
          ...currentState,
          status: 'COLLECTING',
          slots: { ...input },
          updatedAtMs: nowMs,
          expiresAtMs: nowMs + DRAFT_TTL_MS,
        });
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: TPL_ERR_MISSING_FIELD_MESSAGES.dates || TPL_ASK_TYPE_DATES,
          templateId: 'ERR_MISSING_FIELD',
        };
      }

      if (isLeaveType && input.startDate) {
        if (!input.endDate) input.endDate = input.startDate;
        const isSingleDay = input.startDate === input.endDate && (!input.days || input.days <= 1);
        if (isSingleDay && !input.session) {
          stateStore.set(userId, {
            ...currentState,
            status: 'COLLECTING',
            slots: { ...input },
            updatedAtMs: nowMs,
            expiresAtMs: nowMs + DRAFT_TTL_MS,
          });
          return {
            handled: true,
            source: 'model',
            usedRouterBridge: true,
            text: TPL_ASK_SESSION,
            templateId: 'TPL_ASK_SESSION',
          };
        }
      }

      const val = await services.validateRequest(userId, input, nowMs);
      if (!val.ok) {
        const firstErr = val.errors[0];
        if (firstErr?.code === 'INSUFFICIENT_BALANCE') {
          const avail = firstErr.availableDays ?? 0;
          const req = firstErr.requestedDays ?? input.days ?? 1;
          const unpaid = firstErr.unpaidDays ?? Math.max(0, req - avail);
          const startIso = input.startDate || getVnIsoFromMs(nowMs);
          const annualEnd = avail >= 1 ? addDaysIsoLocal(startIso, Math.ceil(avail) - 1) : startIso;
          const unpaidStart = avail >= 1 ? addDaysIsoLocal(annualEnd, 1) : startIso;
          const unpaidEnd = addDaysIsoLocal(unpaidStart, Math.max(1, Math.ceil(unpaid)) - 1);
          stateStore.set(userId, {
            ...currentState,
            status: 'COLLECTING',
            slots: { ...input },
            pendingInsufficientSplit:
              avail > 0
                ? {
                    availableDays: avail,
                    unpaidDays: unpaid,
                    annualInput: {
                      ...input,
                      type: 'annual_leave',
                      startDate: startIso,
                      endDate: annualEnd,
                      days: avail,
                    },
                    unpaidInput: {
                      ...input,
                      type: 'unpaid_leave',
                      startDate: unpaidStart,
                      endDate: unpaidEnd,
                      days: unpaid,
                    },
                  }
                : null,
            updatedAtMs: nowMs,
            expiresAtMs: nowMs + DRAFT_TTL_MS,
          });
        } else if (firstErr?.code === 'OVERLAP' && firstErr.conflictRequestId) {
          stateStore.set(userId, {
            ...currentState,
            status: 'COLLECTING',
            slots: { ...input },
            pendingOverlapConflict: {
              conflictCode: firstErr.conflictCode || firstErr.conflictRequestId,
              conflictRequestId: firstErr.conflictRequestId,
            },
            updatedAtMs: nowMs,
            expiresAtMs: nowMs + DRAFT_TTL_MS,
          });
        }
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: firstErr ? TPL_VALIDATION_ERROR(firstErr) : TPL_ASK_TYPE_DATES,
          templateId: firstErr ? `ERR_${firstErr.code}` : 'ERR_MISSING_FIELD',
        };
      }

      if (cleanAction === 'validate_request') {
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: `Đơn ${val.normalized?.typeLabel || input.type} (${val.normalized?.dateText || ''}) hợp lệ, sẵn sàng soạn nháp.`,
          templateId: 'MODEL_VALIDATE_OK',
        };
      }

      if (!stateStore.canCreateDraft(userId, nowMs, 1)) {
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: TPL_RATE_LIMIT_DRAFTS,
          templateId: 'TPL_RATE_LIMIT_DRAFTS',
          blockedSecurityAction: true,
        };
      }

      let draft;
      try {
        draft = await services.createDraft(userId, input, nowMs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/rate\s*limit|5\s*nháp|vượt giới hạn/i.test(msg)) {
          return {
            handled: true,
            source: 'model',
            usedRouterBridge: true,
            text: TPL_RATE_LIMIT_DRAFTS,
            templateId: 'TPL_RATE_LIMIT_DRAFTS',
            blockedSecurityAction: true,
          };
        }
        return {
          handled: true,
          source: 'model',
          usedRouterBridge: true,
          text: msg || 'Không thể tạo nháp đơn lúc này. Vui lòng thử lại sau.',
          templateId: 'ERR_CREATE_DRAFT_FAILED',
        };
      }
      stateStore.recordDraftCreated(userId, nowMs, 1);
      const card: RouterCard = { kind: 'preview', drafts: [draft] };
      stateStore.set(userId, {
        ...currentState,
        status: 'PREVIEW',
        slots: { ...input },
        drafts: [draft],
        cardKind: 'preview',
        awaitingSelfConfirm: false,
        pendingInsufficientSplit: null,
        pendingOverlapConflict: null,
        pendingHandoverQuery: false,
        handoverCandidates: null,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      });

      return {
        handled: true,
        source: 'model',
        usedRouterBridge: true,
        text: TPL_PREVIEW(draft.preview),
        card,
        templateId: 'TPL_PREVIEW',
      };
    }
  }
}
