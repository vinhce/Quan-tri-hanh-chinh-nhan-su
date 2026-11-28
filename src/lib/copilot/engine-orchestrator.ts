import type {
  CopilotEngineMode,
  LocalNluCallResult,
  LocalServerStatus,
} from '@/lib/copilot/local-nlu';
import {
  renderTier3OrTier4Reply,
  type LocalTemplateDataContext,
} from '@/lib/copilot/local-templates';
import type { RouterResult } from '@/lib/hrm/copilot-router';

export type CopilotAnswerTier =
  | 'router'
  | 'local-nlu'
  | 'template'
  | 'smalltalk'
  | 'clarify'
  | 'gemini';

export interface CopilotTurnLog {
  engine: CopilotEngineMode;
  tier: CopilotAnswerTier;
  intent: string;
  confidence: number | null;
  latencyMs: number;
  fallbackFrom?: 'gemini' | null;
  localStatus?: LocalServerStatus | 'skipped';
}

export interface GeminiCallOutcome {
  ok: boolean;
  reply?: string;
  intent?: string;
  httpStatus?: number;
  isTimeout?: boolean;
  connectionError?: boolean;
  shouldHybridFallback?: boolean;
  errorReason?: string;
  referencedPolicy?: string;
}

export interface CopilotEngineTurnParams {
  engine: CopilotEngineMode;
  query: string;
  history?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  confidenceThreshold: number;
  hasGeminiKey: boolean;
  isKeyboardSmash: boolean;
  runRouter: (delegateToLlm: boolean) => Promise<RouterResult>;
  checkSecurityOrRbac: (
    effectiveQuery: string
  ) => { reply: string; reason: string; referencedPolicy?: string } | null;
  tryFastPath?: (
    effectiveQuery: string
  ) => {
    reply: string;
    intent: string;
    referencedPolicy?: string;
    isSmalltalk?: boolean;
    hideCitation?: boolean;
  } | null;
  callGemini?: (effectiveQuery: string) => Promise<GeminiCallOutcome>;
  runLocalNlu: (effectiveQuery: string) => Promise<LocalNluCallResult>;
  templateCtx: LocalTemplateDataContext;
  shortSmalltalkGenerator?: (query: string) => Promise<string | null>;
  sanitizeOutput: (reply: string, effectiveQuery: string) => {
    ok: boolean;
    sanitizedReply: string;
    violationReason?: string;
  };
  geminiFallbackBuilder?: (
    effectiveQuery: string,
    geminiOutcome: GeminiCallOutcome | null
  ) => { reply: string; isSmalltalk?: boolean; hideCitation?: boolean; reason?: string };
  logSink?: (entry: CopilotTurnLog) => void;
}

export interface CopilotEngineTurnResult {
  engine: CopilotEngineMode;
  tier: CopilotAnswerTier;
  intent: string;
  confidence: number | null;
  latencyMs: number;
  fallbackFrom: 'gemini' | null;
  localStatus: LocalServerStatus | 'skipped';
  reply: string;
  modelSource: 'router' | 'lacviet-ai' | 'fallback';
  source: 'router' | 'model' | 'fallback';
  isTrueLlmFallback: boolean;
  fallbackReason?: string;
  referencedPolicy: string;
  isSmalltalk: boolean;
  hideCitation: boolean;
  card?: unknown;
  suggestions?: string[];
  turnLog: CopilotTurnLog;
}

export function logCopilotTurn(
  entry: CopilotTurnLog,
  sink?: (line: CopilotTurnLog) => void
): CopilotTurnLog {
  const sanitizedLog: CopilotTurnLog = {
    engine: entry.engine,
    tier: entry.tier,
    intent: String(entry.intent || 'unknown').slice(0, 64),
    confidence:
      typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? Math.round(entry.confidence * 1000) / 1000
        : null,
    latencyMs: Math.max(0, Math.round(entry.latencyMs)),
    ...(entry.fallbackFrom ? { fallbackFrom: entry.fallbackFrom } : {}),
    ...(entry.localStatus ? { localStatus: entry.localStatus } : {}),
  };

  if (sink) {
    sink(sanitizedLog);
  } else {
    console.info('[COPILOT_TURN]', JSON.stringify(sanitizedLog));
  }
  return sanitizedLog;
}

function shouldHybridFallBackToLocal(outcome: GeminiCallOutcome | null): boolean {
  if (!outcome || !outcome.ok) {
    if (!outcome) return true;
    if (outcome.shouldHybridFallback) return true;
    if (outcome.isTimeout || outcome.connectionError) return true;
    if (outcome.httpStatus === 429 || outcome.httpStatus === 503) return true;
    return true;
  }
  return false;
}

export async function runCopilotEngineTurn(
  params: CopilotEngineTurnParams
): Promise<CopilotEngineTurnResult> {
  const startMs = Date.now();
  const {
    engine,
    query,
    confidenceThreshold,
    hasGeminiKey,
    isKeyboardSmash,
    runRouter,
    checkSecurityOrRbac,
    tryFastPath,
    callGemini,
    runLocalNlu,
    templateCtx,
    shortSmalltalkGenerator,
    sanitizeOutput,
    geminiFallbackBuilder,
    logSink,
  } = params;

  const finalize = (res: Omit<CopilotEngineTurnResult, 'latencyMs' | 'turnLog'>): CopilotEngineTurnResult => {
    const latencyMs = Math.max(0, Date.now() - startMs);
    const turnLog = logCopilotTurn(
      {
        engine,
        tier: res.tier,
        intent: res.intent,
        confidence: res.confidence,
        latencyMs,
        fallbackFrom: res.fallbackFrom,
        localStatus: res.localStatus,
      },
      logSink
    );
    return {
      ...res,
      latencyMs,
      turnLog,
    };
  };

  // Tier 1a: Rule-based Copilot Router (highest priority)
  const delegateToLlm = engine !== 'local' && hasGeminiKey;
  const routerResult = await runRouter(delegateToLlm);
  if (routerResult.handled) {
    return finalize({
      engine,
      tier: 'router',
      intent: routerResult.intent || routerResult.smalltalkGroup || routerResult.templateId || 'router',
      confidence: 1,
      fallbackFrom: null,
      localStatus: 'skipped',
      reply: routerResult.text,
      modelSource: 'router',
      source: 'router',
      isTrueLlmFallback: false,
      referencedPolicy: routerResult.referencedPolicy || '',
      isSmalltalk: Boolean(routerResult.isSmalltalk),
      hideCitation: Boolean(routerResult.isSmalltalk || routerResult.hideCitation),
      card: routerResult.card ?? null,
    });
  }

  const effectiveQuery = routerResult.forwardQuery || query;

  // Tier 1b: Security & RBAC guard BEFORE any LLM (Gemini or Local)
  const blocked = checkSecurityOrRbac(effectiveQuery) || checkSecurityOrRbac(query);
  if (blocked) {
    return finalize({
      engine,
      tier: 'router',
      intent: blocked.reason || 'security_or_rbac_blocked',
      confidence: 1,
      fallbackFrom: null,
      localStatus: 'skipped',
      reply: blocked.reply,
      modelSource: 'fallback',
      source: 'fallback',
      isTrueLlmFallback: false,
      referencedPolicy: blocked.referencedPolicy || '',
      isSmalltalk: false,
      hideCitation: false,
      card: null,
    });
  }

  // Tier 1c: Fast-path verified DB / Policy / Org answers
  if (!routerResult.isCasualOrUnclear && tryFastPath) {
    const fast = tryFastPath(effectiveQuery);
    if (fast && fast.reply) {
      const checked = sanitizeOutput(fast.reply, effectiveQuery);
      if (checked.ok) {
        return finalize({
          engine,
          tier: 'router',
          intent: fast.intent || 'fast_path',
          confidence: 1,
          fallbackFrom: null,
          localStatus: 'skipped',
          reply: checked.sanitizedReply,
          modelSource: 'fallback',
          source: 'fallback',
          isTrueLlmFallback: false,
          referencedPolicy: fast.referencedPolicy || '',
          isSmalltalk: Boolean(fast.isSmalltalk),
          hideCitation: Boolean(fast.hideCitation),
          card: null,
        });
      }
    }
  }

  let fallbackFromGemini: 'gemini' | null = null;
  let lastGeminiOutcome: GeminiCallOutcome | null = null;

  // Gemini mode or Hybrid primary pass
  if (engine === 'gemini' || engine === 'hybrid') {
    if (hasGeminiKey && callGemini) {
      lastGeminiOutcome = await callGemini(effectiveQuery);
      if (lastGeminiOutcome.ok && lastGeminiOutcome.reply) {
        const checked = sanitizeOutput(lastGeminiOutcome.reply, effectiveQuery);
        if (checked.ok) {
          return finalize({
            engine,
            tier: 'gemini',
            intent: lastGeminiOutcome.intent || 'gemini_response',
            confidence: null,
            fallbackFrom: null,
            localStatus: 'skipped',
            reply: checked.sanitizedReply,
            modelSource: 'lacviet-ai',
            source: 'model',
            isTrueLlmFallback: false,
            referencedPolicy: lastGeminiOutcome.referencedPolicy || '',
            isSmalltalk: false,
            hideCitation: Boolean(routerResult.isCasualOrUnclear),
            card: null,
          });
        }
      }
    } else {
      lastGeminiOutcome = {
        ok: false,
        connectionError: true,
        shouldHybridFallback: true,
        errorReason: 'Chưa cấu hình GEMINI_API_KEY hợp lệ',
      };
    }

    if (engine === 'gemini') {
      const fb = geminiFallbackBuilder
        ? geminiFallbackBuilder(effectiveQuery, lastGeminiOutcome)
        : {
            reply:
              'Hiện máy chủ AI đang quá tải hoặc phản hồi chậm, bạn vui lòng thử gửi lại sau vài giây nhé.',
            isSmalltalk: false,
            hideCitation: true,
            reason: lastGeminiOutcome?.errorReason || 'Gemini unavailable',
          };
      const checked = sanitizeOutput(fb.reply, effectiveQuery);
      return finalize({
        engine,
        tier: 'clarify',
        intent: 'gemini_fallback',
        confidence: null,
        fallbackFrom: null,
        localStatus: 'skipped',
        reply: checked.sanitizedReply,
        modelSource: 'fallback',
        source: 'fallback',
        isTrueLlmFallback: true,
        fallbackReason: fb.reason || lastGeminiOutcome?.errorReason,
        referencedPolicy: '',
        isSmalltalk: Boolean(fb.isSmalltalk),
        hideCitation: Boolean(fb.hideCitation),
        card: null,
      });
    }

    if (shouldHybridFallBackToLocal(lastGeminiOutcome)) {
      fallbackFromGemini = 'gemini';
    }
  }

  // Tier 2 -> Tier 3 -> Tier 4 (engine === 'local' or hybrid fallback from Gemini)
  if (isKeyboardSmash) {
    const smashRendered = await renderTier3OrTier4Reply({
      query: effectiveQuery,
      nlu: null,
      confidenceThreshold,
      isKeyboardSmash: true,
      localStatus: 'skipped',
      ctx: templateCtx,
    });
    return finalize({
      engine,
      tier: 'clarify',
      intent: smashRendered.intent,
      confidence: 0,
      fallbackFrom: fallbackFromGemini,
      localStatus: 'skipped',
      reply: smashRendered.text,
      modelSource: 'router',
      source: 'router',
      isTrueLlmFallback: Boolean(fallbackFromGemini),
      ...(fallbackFromGemini && lastGeminiOutcome?.errorReason
        ? { fallbackReason: lastGeminiOutcome.errorReason }
        : {}),
      referencedPolicy: '',
      isSmalltalk: false,
      hideCitation: true,
      card: null,
    });
  }

  const nluRes = await runLocalNlu(effectiveQuery);
  const rendered = await renderTier3OrTier4Reply({
    query: effectiveQuery,
    nlu: nluRes.ok ? nluRes.nlu : null,
    nluErrorCode: nluRes.errorCode,
    confidenceThreshold,
    isKeyboardSmash: false,
    localStatus: nluRes.localStatus,
    localStatusMessage: nluRes.statusMessage,
    ctx: templateCtx,
    shortSmalltalkGenerator,
  });

  const filtered = sanitizeOutput(rendered.text, effectiveQuery);
  const safeReply = filtered.sanitizedReply;
  const finalTier: CopilotAnswerTier =
    filtered.ok ? rendered.tier : 'clarify';
  const finalIntent = filtered.ok
    ? rendered.intent
    : `sanitized_${filtered.violationReason || 'blocked'}`;

  return finalize({
    engine,
    tier: finalTier,
    intent: finalIntent,
    confidence: nluRes.ok && nluRes.nlu ? nluRes.nlu.confidence : null,
    fallbackFrom: fallbackFromGemini,
    localStatus: nluRes.localStatus,
    reply: safeReply,
    modelSource: finalTier === 'smalltalk' || finalTier === 'template' ? 'lacviet-ai' : 'fallback',
    source: finalTier === 'clarify' ? 'fallback' : 'model',
    isTrueLlmFallback: Boolean(fallbackFromGemini || finalTier === 'clarify'),
    ...(fallbackFromGemini && lastGeminiOutcome?.errorReason
      ? { fallbackReason: lastGeminiOutcome.errorReason }
      : {}),
    referencedPolicy: filtered.ok ? rendered.referencedPolicy : '',
    isSmalltalk: filtered.ok ? rendered.isSmalltalk : false,
    hideCitation: filtered.ok ? rendered.hideCitation : true,
    card: filtered.ok ? rendered.card ?? null : null,
    ...(filtered.ok && rendered.suggestions ? { suggestions: rendered.suggestions } : {}),
  });
}
