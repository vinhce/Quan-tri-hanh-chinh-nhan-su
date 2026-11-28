import fs from 'node:fs';
import path from 'node:path';

export interface FaqRetrievalOptions {
  maxChars?: number;
  topK?: number;
  faqPath?: string;
}

export interface FaqRetrievalResult {
  text: string;
  matchedTitles: string[];
}

interface ParsedFaqEntry {
  index: number;
  title: string;
  body: string;
  titleNormalized: string;
  titleTokenSet: ReadonlySet<string>;
  bodyTokenSet: ReadonlySet<string>;
}

interface FaqCacheState {
  filePath: string;
  mtimeMs: number;
  entries: readonly ParsedFaqEntry[];
}

let cachedFaq: FaqCacheState | null = null;

const FAQ_STOP_WORDS = new Set([
  'a',
  'ai',
  'an',
  'anh',
  'are',
  'ba',
  'ban',
  'bao',
  'bi',
  'bo',
  'cac',
  'can',
  'chi',
  'cho',
  'co',
  'cua',
  'da',
  'dang',
  'de',
  'den',
  'di',
  'do',
  'duoc',
  'em',
  'for',
  'gi',
  'hay',
  'he',
  'hien',
  'ho',
  'hoac',
  'hoi',
  'how',
  'in',
  'is',
  'khi',
  'khong',
  'ko',
  'la',
  'lai',
  'lam',
  'ma',
  'me',
  'minh',
  'mot',
  'muon',
  'my',
  'nao',
  'nay',
  'neu',
  'nha',
  'nhe',
  'nhieu',
  'nhu',
  'nhung',
  'noi',
  'of',
  'on',
  'phai',
  'qua',
  'ra',
  'roi',
  'sao',
  'se',
  'tai',
  'the',
  'thi',
  'thong',
  'to',
  'toi',
  'tren',
  'trong',
  'tu',
  'va',
  'vao',
  'vay',
  've',
  'voi',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'xin',
  'you',
]);

// Technical patterns forbidden from ever surfacing in RAG context
const FORBIDDEN_TECH_PATTERNS: readonly RegExp[] = [
  /\[TODO[^\]]*\]/gi,
  /\*?\(?\s*\bTODO-\d+\b\s*\)?\*?/gi,
  /\bsrc\/[a-zA-Z0-9_./-]+/gi,
  /\/app\?nav=[^\s)'"`]+/gi,
  /\/api\/hrm\/[^\s)'"`]+/gi,
  /\b[a-zA-Z0-9_-]+\.(?:ts|tsx|mjs|md|json)\b/gi,
  /\b(?:HRM_CONFIG|MOCK_SYSTEM_CONFIG|LIFECYCLE_NOTICE_DAYS_BY_CONTRACT|DRAFT_TTL_MS|DRAFT_RATE_LIMIT_MAX|MONTHLY_EXPLANATION_LIMIT|PREBOARDING_TOKEN_EXPIRY_DAYS|TPL_[A-Z0-9_]+|RequestCategory|HrmAction)\b/gi,
  /\b(?:qwen[\w.-]*|lora|gguf|llama-?server|llama\.cpp|fine-?tune[d]?|adapter|system\s*prompt|local-lora|probation_with_leave|leave_requests|annual_leave_balances|daily_attendances|payroll_records|payrolls|employment_contracts|system_users|copilot_llm_api_key|hf_token|hrm_session_secret|your_api_key_here)\b/gi,
  /\b(?:evaluateDailyPunch|isAttendanceNightLockWindow|countWeekdaysInRange|checkClearance100Percent|executeFinalSettlement|detectCrossEmployeeViolation|detectSecurityAttack|draftCancelRequest|maxBackdate|unpaidDaysInMonth|seniority_extra_day_per_years|public_holidays_2026|mid_month_split|effective_date|payroll_cutoff_day|payroll_payout_day|penalty_deduction_vnd|advance_deduction_vnd|burnout_risk_score|zero\s+hard\s+delete)\b/gi,
];

function stripFaqDiacritics(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeAndTokenize(input: string): { normalized: string; tokens: string[] } {
  const normalized = stripFaqDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return { normalized: '', tokens: [] };
  }
  const tokens = normalized
    .split(' ')
    .filter((tok) => tok.length >= 2 && !FAQ_STOP_WORDS.has(tok));
  return { normalized, tokens };
}

function sanitizeFaqText(raw: string): string {
  let text = raw || '';

  // Remove markdown table separator rows
  text = text.replace(/^\|\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/gm, '');
  // Flatten markdown table data rows into semicolon-separated clauses
  text = text.replace(/^\|(.+)\|\s*$/gm, (_m, inner: string) => {
    const cells = inner
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    return cells.length > 0 ? `- ${cells.join(' | ')}` : '';
  });

  // Strip backticks and markdown emphasis markers
  text = text.replace(/`+/g, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');

  // Remove technical code / config / TODO markers
  for (const re of FORBIDDEN_TECH_PATTERNS) {
    text = text.replace(re, '');
  }

  // Remove leftover assignment/operator fragments from stripped code identifiers (e.g. "(= 5)", "(>= 70)")
  text = text.replace(/\(\s*(?:[=<>!:,;—–-]+\s*[^()]{0,18})?\s*\)/g, '');
  text = text.replace(/\(\s*—\s*/g, '(');
  text = text.replace(/\s+—\s*\)/g, ')');
  text = text.replace(/\(\s*\)/g, '');

  // Remove redundant label prefixes left hanging before a removed [TODO] block
  text = text.replace(/(?:^|\n)[ \t]*[-•]?[ \t]*[^:\n]{2,60}:[ \t]*(?=\n|$)/g, '\n');

  // Collapse bullet formatting & whitespace cleanly into compact readable prose
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s+/, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0 && !/^[-–—:|.,;]+$/.test(line));

  return lines
    .join(' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseFaqMarkdown(markdown: string): ParsedFaqEntry[] {
  // Strip Section 10 (TODO summary table) completely before parsing Q&A sections
  const sec10Match = markdown.match(/^##\s*10\./m);
  const effectiveMarkdown =
    sec10Match && typeof sec10Match.index === 'number'
      ? markdown.slice(0, sec10Match.index)
      : markdown;

  const headingRegex = /^###\s+Câu\s+\d+\s*:\s*(.+)$/gm;
  const matches: Array<{ title: string; headingEnd: number; headingStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(effectiveMarkdown)) !== null) {
    matches.push({
      title: m[1].trim(),
      headingStart: m.index,
      headingEnd: m.index + m[0].length,
    });
  }

  const entries: ParsedFaqEntry[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].headingStart : effectiveMarkdown.length;
    // Also stop section body before any subsequent top-level "## " section divider
    let rawBody = effectiveMarkdown.slice(cur.headingEnd, nextStart);
    const nextSectionIdx = rawBody.search(/^##\s+\d+\./m);
    if (nextSectionIdx >= 0) {
      rawBody = rawBody.slice(0, nextSectionIdx);
    }
    rawBody = rawBody.replace(/^---\s*$/gm, '');

    const cleanTitle = sanitizeFaqText(cur.title);
    const cleanBody = sanitizeFaqText(rawBody);
    // Skip empty or pure-[TODO] entries that have no substantive company policy body
    if (!cleanTitle || cleanBody.length < 24) {
      continue;
    }

    const titleNorm = normalizeAndTokenize(cleanTitle);
    const bodyNorm = normalizeAndTokenize(cleanBody);
    entries.push({
      index: entries.length,
      title: cleanTitle,
      body: cleanBody,
      titleNormalized: titleNorm.normalized,
      titleTokenSet: new Set(titleNorm.tokens),
      bodyTokenSet: new Set(bodyNorm.tokens),
    });
  }

  return entries;
}

function loadCachedFaqEntries(faqPath?: string): readonly ParsedFaqEntry[] {
  const docsDir = path.join(process.cwd(), 'docs');
  if (faqPath !== undefined) {
    if (
      typeof faqPath !== 'string' ||
      faqPath.includes('\0') ||
      /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(faqPath)
    ) {
      return [];
    }
  }
  const candidatePath = faqPath ? path.resolve(faqPath) : path.join(docsDir, 'hrm-faq.md');
  if (!candidatePath.toLowerCase().endsWith('.md')) {
    return [];
  }
  try {
    const realDocsDir = fs.realpathSync(docsDir);
    const realTarget = fs.realpathSync(candidatePath);
    const rel = path.relative(realDocsDir, realTarget);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      return [];
    }
    if (!realTarget.toLowerCase().endsWith('.md')) {
      return [];
    }

    const stat = fs.statSync(realTarget);
    if (
      cachedFaq &&
      cachedFaq.filePath === realTarget &&
      cachedFaq.mtimeMs === stat.mtimeMs
    ) {
      return cachedFaq.entries;
    }
    const raw = fs.readFileSync(realTarget, 'utf-8');
    const entries = parseFaqMarkdown(raw);
    cachedFaq = {
      filePath: realTarget,
      mtimeMs: stat.mtimeMs,
      entries,
    };
    return entries;
  } catch {
    return [];
  }
}

function truncateCleanly(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, Math.max(0, maxLen - 1)).trim();
  const lastSentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '));
  if (lastSentenceEnd >= Math.floor(maxLen * 0.55)) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,:;.\s-]+$/, '')}…`;
}

export function retrieveRelevantFaqContext(
  query: string,
  opts: FaqRetrievalOptions = {}
): FaqRetrievalResult {
  const maxChars = Math.max(120, opts.maxChars ?? 650);
  const topK = Math.max(1, Math.min(5, opts.topK ?? 2));

  const { tokens } = normalizeAndTokenize(query || '');
  if (tokens.length === 0) {
    return { text: '', matchedTitles: [] };
  }

  const uniqueTokens = Array.from(new Set(tokens));
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }

  const entries = loadCachedFaqEntries(opts.faqPath);
  if (entries.length === 0) {
    return { text: '', matchedTitles: [] };
  }

  const scored: Array<{ entry: ParsedFaqEntry; score: number; titleHits: number }> = [];
  for (const entry of entries) {
    let titleHits = 0;
    let bodyHits = 0;
    for (const tok of uniqueTokens) {
      if (entry.titleTokenSet.has(tok)) {
        titleHits += 1;
      }
      if (entry.bodyTokenSet.has(tok)) {
        bodyHits += 1;
      }
    }

    let bigramBonus = 0;
    for (const bg of bigrams) {
      if (entry.titleNormalized.includes(bg)) {
        bigramBonus += 2;
      }
    }

    const score = titleHits * 3 + bodyHits * 1 + bigramBonus;
    if (score >= 2) {
      scored.push({ entry, score, titleHits });
    }
  }

  if (scored.length === 0) {
    return { text: '', matchedTitles: [] };
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.titleHits !== a.titleHits) return b.titleHits - a.titleHits;
    return a.entry.index - b.entry.index;
  });

  const selected = scored.slice(0, topK);
  const lines: string[] = [];
  const matchedTitles: string[] = [];
  let usedChars = 0;

  for (const { entry } of selected) {
    const formatted = `- ${entry.title}: ${entry.body}`;
    const sepLen = lines.length > 0 ? 1 : 0;
    const remaining = maxChars - usedChars - sepLen;
    if (remaining < 90 && lines.length > 0) {
      break;
    }
    const finalLine = formatted.length <= remaining ? formatted : truncateCleanly(formatted, remaining);
    if (finalLine.length > 16) {
      lines.push(finalLine);
      matchedTitles.push(entry.title);
      usedChars += sepLen + finalLine.length;
    }
    if (usedChars >= maxChars) break;
  }

  return {
    text: lines.join('\n'),
    matchedTitles,
  };
}
