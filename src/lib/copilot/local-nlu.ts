import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type CopilotEngineMode = 'gemini' | 'local' | 'hybrid';

export const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:8001/v1';
export const DEFAULT_LOCAL_MODEL_ALIAS = 'lacviet-hrm-qwen2.5-1.5b';
export const DEFAULT_NLU_CONFIDENCE_THRESHOLD = 0.6;
export const LOCAL_NLU_TIMEOUT_MS = 6_000;
export const LOCAL_NLU_MAX_TOKENS = 120;
export const LOCAL_NLU_TEMPERATURE = 0.1;
export const LOCAL_HEALTH_TIMEOUT_MS = 800;
export const LOCAL_WAKE_COOLDOWN_MS = 15_000;

export const LOCAL_NLU_INTENTS = [
  'leave_balance',
  'leave_create',
  'leave_policy',
  'attendance_policy',
  'attendance_explain',
  'overtime_create',
  'overtime_policy',
  'payroll_self',
  'payroll_policy',
  'resign_request',
  'resign_policy',
  'org_structure',
  'request_capability',
  'request_approve_blocked',
  'cross_employee_blocked',
  'smalltalk_greeting',
  'smalltalk_chat',
  'out_of_scope',
  'unclear',
] as const;

export type LocalNluIntent = (typeof LOCAL_NLU_INTENTS)[number];

export const ALLOWED_NLU_LEAVE_TYPES = [
  'annual_leave',
  'unpaid_leave',
  'sick_leave',
  'attendance_explanation',
  'overtime',
] as const;

export type LocalNluLeaveType = (typeof ALLOWED_NLU_LEAVE_TYPES)[number];

export interface LocalNluSlots {
  leave_type: LocalNluLeaveType | null;
  date_from: string | null;
  date_to: string | null;
  duration: string | null;
  employee_code: string | null;
  department: string | null;
  topic: string | null;
}

export interface LocalNluResult {
  intent: LocalNluIntent;
  slots: LocalNluSlots;
  confidence: number;
}

export type LocalServerStatus = 'ready' | 'warming_up' | 'unavailable';

export interface SafeLoopbackEndpoint {
  origin: string;
  baseUrl: string;
  healthUrl: string;
  chatUrl: string;
  port: number;
}

export interface LocalNluCallResult {
  ok: boolean;
  nlu: LocalNluResult | null;
  latencyMs: number;
  localStatus: LocalServerStatus;
  statusMessage?: string;
  errorCode?:
    | 'UNSAFE_URL'
    | 'WARMING_UP'
    | 'UNAVAILABLE'
    | 'TIMEOUT'
    | 'HTTP_ERROR'
    | 'EMPTY'
    | 'INVALID_JSON'
    | 'INVALID_SCHEMA'
    | 'FORBIDDEN_KEY';
}

export interface LocalSmalltalkReplyResult {
  ok: boolean;
  text: string | null;
  latencyMs: number;
}

declare global {
  // eslint-disable-next-line no-var
  var _hrmLocalWakeLastAttemptMs: number | undefined;
}

const LOCAL_INTENT_SET: ReadonlySet<string> = new Set(LOCAL_NLU_INTENTS);
const LEAVE_TYPE_SET: ReadonlySet<string> = new Set(ALLOWED_NLU_LEAVE_TYPES);
const FORBIDDEN_PROTO_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export const LOCAL_NLU_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'slots', 'confidence'],
  properties: {
    intent: {
      type: 'string',
      enum: [...LOCAL_NLU_INTENTS],
    },
    slots: {
      type: 'object',
      additionalProperties: false,
      required: [
        'leave_type',
        'date_from',
        'date_to',
        'duration',
        'employee_code',
        'department',
        'topic',
      ],
      properties: {
        leave_type: {
          type: ['string', 'null'],
          enum: [...ALLOWED_NLU_LEAVE_TYPES, null],
        },
        date_from: { type: ['string', 'null'] },
        date_to: { type: ['string', 'null'] },
        duration: { type: ['string', 'null'] },
        employee_code: { type: ['string', 'null'] },
        department: { type: ['string', 'null'] },
        topic: { type: ['string', 'null'] },
      },
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
  },
} as const;

export const LOCAL_NLU_SYSTEM_PROMPT =
  'NLU HRM: tra JSON dung schema.\nIntents: leave_balance(phep), leave_create(don nghi), leave_policy(luat phep), attendance_policy(tinh cong), attendance_explain(giai trinh), overtime_create(tao OT), overtime_policy(he so OT), payroll_self(luong t), payroll_policy(thu viec/BHXH/login), resign_request(nghi viec), resign_policy(bao truoc), org_structure(giam doc/HR), request_capability, request_approve_blocked, cross_employee_blocked, smalltalk_greeting, smalltalk_chat, out_of_scope, unclear.';

export const LOCAL_NLU_FEW_SHOT_EXAMPLES: ReadonlyArray<{
  user: string;
  assistant: LocalNluResult;
}> = [
  {
    user: 'toi con bn ngay phep',
    assistant: {
      intent: 'leave_balance',
      slots: {
        leave_type: 'annual_leave',
        date_from: null,
        date_to: null,
        duration: null,
        employee_code: null,
        department: null,
        topic: 'phep_nam',
      },
      confidence: 0.96,
    },
  },
  {
    user: 'xin nghi phpe ngay 10/12 2 ngay',
    assistant: {
      intent: 'leave_create',
      slots: {
        leave_type: 'annual_leave',
        date_from: '10/12',
        date_to: null,
        duration: '2 ngay',
        employee_code: null,
        department: null,
        topic: null,
      },
      confidence: 0.94,
    },
  },
  {
    user: 'quy dinh chma cong hang ngay',
    assistant: {
      intent: 'attendance_policy',
      slots: {
        leave_type: null,
        date_from: null,
        date_to: null,
        duration: null,
        employee_code: null,
        department: null,
        topic: 'cham_cong',
      },
      confidence: 0.94,
    },
  },
  {
    user: 'xem phieu luong thang truoc',
    assistant: {
      intent: 'payroll_self',
      slots: {
        leave_type: null,
        date_from: null,
        date_to: null,
        duration: null,
        employee_code: null,
        department: null,
        topic: 'phieu_luong',
      },
      confidence: 0.95,
    },
  },
  {
    user: 'cai kia sao roi',
    assistant: {
      intent: 'unclear',
      slots: {
        leave_type: null,
        date_from: null,
        date_to: null,
        duration: null,
        employee_code: null,
        department: null,
        topic: null,
      },
      confidence: 0.3,
    },
  },
];

export function parseCopilotEngineMode(raw?: string | null): CopilotEngineMode {
  const norm = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (norm === 'local') return 'local';
  if (norm === 'hybrid') return 'hybrid';
  return 'gemini';
}

export function parseNluConfidenceThreshold(raw?: string | null): number {
  const parsed = Number(String(raw ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_NLU_CONFIDENCE_THRESHOLD;
  }
  return Math.min(0.95, Math.max(0.1, parsed));
}

function sanitizeMessageSnippet(text: string, maxLen: number): string {
  return String(text || '')
    .replace(/[\r\n\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function buildLocalNluMessages(params: {
  query: string;
  history?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
}): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: LOCAL_NLU_SYSTEM_PROMPT },
  ];

  for (const ex of LOCAL_NLU_FEW_SHOT_EXAMPLES) {
    messages.push({ role: 'user', content: ex.user });
    messages.push({ role: 'assistant', content: JSON.stringify(ex.assistant) });
  }

  const recentHistory = Array.isArray(params.history) ? params.history.slice(-4) : [];
  for (const item of recentHistory) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const snippet = sanitizeMessageSnippet(item.content, 160);
    if (snippet) {
      messages.push({ role: item.role, content: snippet });
    }
  }

  messages.push({
    role: 'user',
    content: sanitizeMessageSnippet(params.query, 400),
  });

  return messages;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function containsForbiddenPrototypeKeys(value: unknown, depth = 0): boolean {
  if (depth > 6 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenPrototypeKeys(item, depth + 1));
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) return true;
    const nested = (value as Record<string, unknown>)[key];
    if (containsForbiddenPrototypeKeys(nested, depth + 1)) return true;
  }
  return false;
}

function normalizeNullableSlotString(raw: unknown, maxLen = 80): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const clean = sanitizeMessageSnippet(raw, maxLen);
  if (!clean || /^(?:null|none|n\/a|undefined)$/i.test(clean)) return null;
  return clean;
}

function extractCandidateJsonText(rawText: string): string | null {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }
  return null;
}

export function createEmptyNluSlots(): LocalNluSlots {
  return {
    leave_type: null,
    date_from: null,
    date_to: null,
    duration: null,
    employee_code: null,
    department: null,
    topic: null,
  };
}

export function parseAndValidateLocalNluOutput(
  rawText: string
):
  | { ok: true; data: LocalNluResult }
  | {
      ok: false;
      errorCode: 'EMPTY' | 'INVALID_JSON' | 'INVALID_SCHEMA' | 'FORBIDDEN_KEY';
    } {
  if (!rawText || !String(rawText).trim()) {
    return { ok: false, errorCode: 'EMPTY' };
  }

  const candidate = extractCandidateJsonText(rawText);
  if (!candidate) {
    return { ok: false, errorCode: 'INVALID_JSON' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { ok: false, errorCode: 'INVALID_JSON' };
  }

  if (containsForbiddenPrototypeKeys(parsed)) {
    return { ok: false, errorCode: 'FORBIDDEN_KEY' };
  }

  if (!isPlainRecord(parsed)) {
    return { ok: false, errorCode: 'INVALID_SCHEMA' };
  }

  const rawIntent = typeof parsed.intent === 'string' ? parsed.intent.trim() : '';
  if (!LOCAL_INTENT_SET.has(rawIntent)) {
    return { ok: false, errorCode: 'INVALID_SCHEMA' };
  }

  const confidence = parsed.confidence;
  if (
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return { ok: false, errorCode: 'INVALID_SCHEMA' };
  }

  if (!isPlainRecord(parsed.slots)) {
    return { ok: false, errorCode: 'INVALID_SCHEMA' };
  }

  const rawSlots = parsed.slots;
  const rawLeaveType = normalizeNullableSlotString(rawSlots.leave_type, 40);
  const leaveType =
    rawLeaveType && LEAVE_TYPE_SET.has(rawLeaveType)
      ? (rawLeaveType as LocalNluLeaveType)
      : null;

  const slots: LocalNluSlots = {
    leave_type: leaveType,
    date_from: normalizeNullableSlotString(rawSlots.date_from, 40),
    date_to: normalizeNullableSlotString(rawSlots.date_to, 40),
    duration: normalizeNullableSlotString(rawSlots.duration, 40),
    employee_code: normalizeNullableSlotString(rawSlots.employee_code, 30),
    department: normalizeNullableSlotString(rawSlots.department, 80),
    topic: normalizeNullableSlotString(rawSlots.topic, 80),
  };

  return {
    ok: true,
    data: {
      intent: rawIntent as LocalNluIntent,
      slots,
      confidence: Math.round(confidence * 1000) / 1000,
    },
  };
}

export function resolveSafeLoopbackBaseUrl(rawUrl?: string | null): SafeLoopbackEndpoint | null {
  const input = (rawUrl || DEFAULT_LOCAL_BASE_URL).trim();
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password || parsed.protocol !== 'http:') {
    return null;
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '::1') {
    return null;
  }

  const port = parsed.port ? Number(parsed.port) : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  const basePath = normalizedPath.endsWith('/v1')
    ? normalizedPath
    : `${normalizedPath}/v1`;
  const baseUrl = `${parsed.origin}${basePath}`.replace(/\/+$/, '');

  return {
    origin: parsed.origin,
    baseUrl,
    healthUrl: `${parsed.origin}/health`,
    chatUrl: `${baseUrl}/chat/completions`,
    port,
  };
}

function hasRequiredLocalModelFiles(): boolean {
  try {
    const modelsDir = path.join(process.cwd(), 'models');
    const serverExe = path.join(modelsDir, 'llama-bin', 'llama-server.exe');
    const baseModel = path.join(modelsDir, 'qwen2.5-1.5b-instruct-q4_k_m.gguf');
    const loraModel = path.join(modelsDir, 'lacviet-copilot-lora.gguf');
    const noLoraRaw = (process.env.NO_LORA || '').trim().toLowerCase();
    const noLora = noLoraRaw === '1' || noLoraRaw === 'true' || noLoraRaw === 'yes';
    return (
      fs.existsSync(serverExe) &&
      fs.existsSync(baseModel) &&
      (noLora || fs.existsSync(loraModel))
    );
  } catch {
    return false;
  }
}

async function probeLocalHealth(
  healthUrl: string,
  fetchImpl: typeof fetch
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_HEALTH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(healthUrl, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
    });
    void res.body?.cancel().catch(() => {});
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureLocalNluEndpointReady(options?: {
  baseUrl?: string;
  pollMaxMs?: number;
  fetchImpl?: typeof fetch;
  autoWake?: boolean;
}): Promise<{
  ready: boolean;
  status: LocalServerStatus;
  message: string;
  endpoint: SafeLoopbackEndpoint | null;
}> {
  const endpoint = resolveSafeLoopbackBaseUrl(options?.baseUrl);
  if (!endpoint) {
    return {
      ready: false,
      status: 'unavailable',
      message: 'Địa chỉ máy chủ AI nội bộ không hợp lệ (chỉ cho phép loopback).',
      endpoint: null,
    };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  if (await probeLocalHealth(endpoint.healthUrl, fetchImpl)) {
    return {
      ready: true,
      status: 'ready',
      message: 'Trợ lý nội bộ đã sẵn sàng.',
      endpoint,
    };
  }

  if (options?.autoWake === false) {
    return {
      ready: false,
      status: 'unavailable',
      message: 'Trợ lý nội bộ chưa được khởi động tại cổng cục bộ.',
      endpoint,
    };
  }

  if (!hasRequiredLocalModelFiles()) {
    return {
      ready: false,
      status: 'unavailable',
      message: 'Chưa đủ tệp mô hình nội bộ trong thư mục models/.',
      endpoint,
    };
  }

  const nowMs = Date.now();
  const lastWake = globalThis._hrmLocalWakeLastAttemptMs ?? 0;
  if (nowMs - lastWake >= LOCAL_WAKE_COOLDOWN_MS) {
    globalThis._hrmLocalWakeLastAttemptMs = nowMs;
    try {
      const wakeScript = path.join(process.cwd(), 'scripts', 'wake-copilot-space.mjs');
      if (fs.existsSync(wakeScript)) {
        const child = spawn(process.execPath, [wakeScript], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          cwd: process.cwd(),
          env: {
            ...process.env,
            COPILOT_LOCAL_BASE_URL: endpoint.baseUrl,
          },
        });
        child.unref();
      }
    } catch {
      return {
        ready: false,
        status: 'unavailable',
        message: 'Không thể khởi động tiến trình trợ lý nội bộ.',
        endpoint,
      };
    }
  }

  const pollMaxMs = Math.min(5_000, Math.max(0, options?.pollMaxMs ?? 2_000));
  const deadline = Date.now() + pollMaxMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (await probeLocalHealth(endpoint.healthUrl, fetchImpl)) {
      return {
        ready: true,
        status: 'ready',
        message: 'Trợ lý nội bộ đã sẵn sàng.',
        endpoint,
      };
    }
  }

  return {
    ready: false,
    status: 'warming_up',
    message: 'Trợ lý nội bộ đang khởi động qua ai:wake, bạn vui lòng thử lại sau vài giây.',
    endpoint,
  };
}

function extractChatContent(rawJson: unknown): string | null {
  if (!isPlainRecord(rawJson)) return null;
  const choices = rawJson.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!isPlainRecord(first)) return null;
  const msg = first.message;
  if (!isPlainRecord(msg) || typeof msg.content !== 'string') return null;
  return msg.content.trim() || null;
}

export async function callLocalNlu(params: {
  query: string;
  history?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  autoWake?: boolean;
}): Promise<LocalNluCallResult> {
  const startMs = Date.now();
  const fetchImpl = params.fetchImpl ?? fetch;

  const readiness = await ensureLocalNluEndpointReady({
    baseUrl: params.baseUrl,
    fetchImpl,
    autoWake: params.autoWake,
  });

  if (!readiness.endpoint) {
    return {
      ok: false,
      nlu: null,
      latencyMs: Date.now() - startMs,
      localStatus: 'unavailable',
      statusMessage: readiness.message,
      errorCode: 'UNSAFE_URL',
    };
  }

  if (!readiness.ready) {
    return {
      ok: false,
      nlu: null,
      latencyMs: Date.now() - startMs,
      localStatus: readiness.status,
      statusMessage: readiness.message,
      errorCode: readiness.status === 'warming_up' ? 'WARMING_UP' : 'UNAVAILABLE',
    };
  }

  const messages = buildLocalNluMessages({
    query: params.query,
    history: params.history,
  });
  const temperature = Math.min(0.2, Math.max(0, params.temperature ?? LOCAL_NLU_TEMPERATURE));
  const maxTokens = Math.min(
    LOCAL_NLU_MAX_TOKENS,
    Math.max(32, Math.round(params.maxTokens ?? LOCAL_NLU_MAX_TOKENS))
  );
  const timeoutMs = Math.min(
    LOCAL_NLU_TIMEOUT_MS,
    Math.max(1_000, params.timeoutMs ?? LOCAL_NLU_TIMEOUT_MS)
  );

  const responseFormats: Array<Record<string, unknown>> = [
    {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'hrm_local_nlu',
          strict: true,
          schema: LOCAL_NLU_JSON_SCHEMA,
        },
      },
    },
    {
      json_schema: LOCAL_NLU_JSON_SCHEMA,
      response_format: { type: 'json_object' },
    },
  ];

  const deadlineAt = Date.now() + timeoutMs;

  for (let i = 0; i < responseFormats.length; i += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs < 500) {
      return {
        ok: false,
        nlu: null,
        latencyMs: Date.now() - startMs,
        localStatus: 'ready',
        errorCode: 'TIMEOUT',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const body = JSON.stringify({
        model: DEFAULT_LOCAL_MODEL_ALIAS,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...responseFormats[i],
      });

      const res = await fetchImpl(readiness.endpoint.chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (res.status === 400 && i === 0) {
        void res.body?.cancel().catch(() => {});
        continue;
      }

      if (!res.ok) {
        void res.body?.cancel().catch(() => {});
        return {
          ok: false,
          nlu: null,
          latencyMs: Date.now() - startMs,
          localStatus: 'ready',
          errorCode: 'HTTP_ERROR',
        };
      }

      const rawJson = (await res.json()) as unknown;
      const content = extractChatContent(rawJson);
      if (!content) {
        return {
          ok: false,
          nlu: null,
          latencyMs: Date.now() - startMs,
          localStatus: 'ready',
          errorCode: 'EMPTY',
        };
      }

      const parsed = parseAndValidateLocalNluOutput(content);
      if (!parsed.ok) {
        return {
          ok: false,
          nlu: null,
          latencyMs: Date.now() - startMs,
          localStatus: 'ready',
          errorCode: parsed.errorCode,
        };
      }

      return {
        ok: true,
        nlu: parsed.data,
        latencyMs: Date.now() - startMs,
        localStatus: 'ready',
      };
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const isTimeout = name === 'AbortError' || name === 'TimeoutError';
      return {
        ok: false,
        nlu: null,
        latencyMs: Date.now() - startMs,
        localStatus: 'ready',
        errorCode: isTimeout ? 'TIMEOUT' : 'HTTP_ERROR',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    nlu: null,
    latencyMs: Date.now() - startMs,
    localStatus: 'ready',
    errorCode: 'HTTP_ERROR',
  };
}

function clampToMaxTwoSentences(text: string): string {
  const clean = String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [clean];
  return sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .trim();
}

export async function callLocalShortSmalltalkReply(params: {
  query: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<LocalSmalltalkReplyResult> {
  const startMs = Date.now();
  const endpoint = resolveSafeLoopbackBaseUrl(params.baseUrl);
  if (!endpoint) {
    return { ok: false, text: null, latencyMs: Date.now() - startMs };
  }

  const fetchImpl = params.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 4_000);
  try {
    const res = await fetchImpl(endpoint.chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_LOCAL_MODEL_ALIAS,
        messages: [
          {
            role: 'system',
            content:
              'Ban la Tro ly Nhan su Lac Viet. Tra loi lich su bang tieng Viet co dau, xung minh-ban, toi da 2 cau ngan, khong emoji, khong bia so lieu nhan su.',
          },
          {
            role: 'user',
            content: sanitizeMessageSnippet(params.query, 240),
          },
        ],
        temperature: 0.2,
        max_tokens: 72,
      }),
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      return { ok: false, text: null, latencyMs: Date.now() - startMs };
    }
    const rawJson = (await res.json()) as unknown;
    const content = extractChatContent(rawJson);
    const shortReply = content ? clampToMaxTwoSentences(content) : '';
    return {
      ok: Boolean(shortReply),
      text: shortReply || null,
      latencyMs: Date.now() - startMs,
    };
  } catch {
    return { ok: false, text: null, latencyMs: Date.now() - startMs };
  } finally {
    clearTimeout(timer);
  }
}
