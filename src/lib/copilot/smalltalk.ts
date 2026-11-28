/**
 * Rule-based Vietnamese/English smalltalk, social-prefix peeling, and short contextual reply helpers.
 * Pure deterministic logic — zero LLM imports and zero direct order-submission references.
 */

export type SmalltalkGroupId =
  | 'greeting'
  | 'thanks'
  | 'praise'
  | 'ack'
  | 'decline'
  | 'goodbye'
  | 'about_bot'
  | 'how_are_you'
  | 'apology'
  | 'complaint'
  | 'laugh_emotion'
  | 'wait_filler'
  | 'wishes'
  | 'out_of_scope_light'
  | 'who_am_i';

export interface SmalltalkUserContext {
  userId: string;
  employeeCode: string;
  fullName: string;
  roleLabel: string;
}

export interface SmalltalkMatchOptions {
  allowAckAndDecline: boolean;
  personalizeSmalltalk: boolean;
  nowMs?: number;
  hadSpoofedRolePrefix?: boolean;
  isRestrictedQuery?: boolean;
  lastAssistantMessage?: string;
}

export interface SmalltalkMatchResult {
  group: SmalltalkGroupId;
  text: string;
  templateId: string;
  intent: string;
  isSmalltalk: true;
  hideCitation: true;
}

export interface PeelSocialPrefixResult {
  peeled: boolean;
  peeledCount: number;
  prefixes: string[];
  remainderRaw: string;
}

// ---------------------------------------------------------------------------
// Canonical Non-Personalized Templates (100% compatible with legacy 19 tests)
// ---------------------------------------------------------------------------

export const TPL_SMALL_GREETING =
  'Chào bạn, mình là Trợ lý Lạc Việt. Bạn muốn hỏi gì về phép năm, lương, quy chế hay đơn từ hôm nay?';

export const TPL_SMALL_HOW_ARE_YOU =
  'Cảm ơn bạn, mình vẫn ổn! Bạn cần mình hỗ trợ gì về phép năm, chấm công, lương hay chính sách nhân sự không?';

export const TPL_SMALL_THANKS =
  'Không có gì ạ! Cần giúp thêm về phép năm, lương, quy chế hay đơn từ bạn cứ nhắn mình nhé.';

export const TPL_SMALL_PRAISE =
  'Cảm ơn bạn nhé! Bạn cần mình hỗ trợ gì thêm về phép năm, lương, quy chế hay đơn từ không?';

export const TPL_SMALL_ACK =
  'Dạ vâng! Cần mình giúp thêm về phép năm, lương, quy chế hay đơn từ bạn cứ nhắn nhé.';

export const TPL_SMALL_BYE =
  'Tạm biệt bạn! Chúc bạn một ngày làm việc tốt.';

export const TPL_SMALL_WHO_ARE_YOU =
  'Mình là Trợ lý Lạc Việt, trợ lý nhân sự của Lạc Việt. Mình giúp bạn tra cứu phép năm, chấm công, phiếu lương, giải đáp chính sách và soạn nháp đơn nghỉ phép, giải trình chấm công, làm thêm giờ để bạn kiểm tra rồi tự bấm Gửi đơn.';

function sanitizeDisplayField(val: string, maxLen = 80): string {
  return (val || '')
    .replace(/[\r\n\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function TPL_SMALL_WHO_AM_I(params: {
  fullName: string;
  employeeCode: string;
  roleLabel: string;
}): string {
  const fullName = sanitizeDisplayField(params.fullName);
  const employeeCode = sanitizeDisplayField(params.employeeCode, 40);
  const roleLabel = sanitizeDisplayField(params.roleLabel, 60);
  return `Bạn đang đăng nhập với tên ${fullName} (${employeeCode}), vai trò ${roleLabel}.`;
}

export const TPL_OFF_TOPIC =
  'Mình chỉ hỗ trợ các vấn đề nhân sự như phép năm, chấm công, lương, hợp đồng và chính sách. Bạn cần hỗ trợ gì trong các mục này không?';

export const TPL_CLARIFY =
  'Mình không đọc ra câu này, bạn gõ lại giúp mình nhé.';

export const TPL_CLARIFY_VARIANTS: readonly string[] = [
  TPL_CLARIFY,
  'Câu này hơi khó đọc, bạn nhắn lại rõ hơn một chút giúp mình nhé.',
  'Mình chưa bắt được ý câu vừa rồi, bạn gõ lại giúp mình nha.',
];

export const TPL_CLARIFY_WITH_EXAMPLES =
  'Mình vẫn chưa hiểu rõ ý bạn lắm. Bạn thử nhắn cụ thể hơn nhé, ví dụ: "Tôi còn bao nhiêu ngày phép?", "Phiếu lương tháng này của tôi", hoặc "Xin nghỉ phép ngày mai".';

export const TPL_CLARIFY_WITH_EXAMPLES_ALT =
  'Mình vẫn chưa rõ bạn đang cần hỗ trợ gì lắm. Bạn thử hỏi cụ thể hơn nhé, ví dụ: "Phép năm còn bao nhiêu?", "Xem phiếu lương tháng này", hoặc "Đăng ký nghỉ phép ngày mai".';

export function selectClarifyReply(params: {
  unclearStreak?: number;
  lastAssistantMessage?: string;
  personalize?: boolean;
}): string {
  const streak = params.unclearStreak ?? 0;
  const prev = (params.lastAssistantMessage || '').trim();
  const personalize = Boolean(params.personalize);

  if (streak >= 1) {
    if (prev && prev === TPL_CLARIFY_WITH_EXAMPLES) {
      return TPL_CLARIFY_WITH_EXAMPLES_ALT;
    }
    return TPL_CLARIFY_WITH_EXAMPLES;
  }

  if (personalize && prev && prev === TPL_CLARIFY) {
    return TPL_CLARIFY_VARIANTS[1];
  }
  return TPL_CLARIFY;
}

// ---------------------------------------------------------------------------
// Text Normalization Helpers
// ---------------------------------------------------------------------------

export const EMOJI_PATTERN = new RegExp('\\p{Extended_Pictographic}|\\uFE0F|\\u200D', 'gu');
const SMALLTALK_PUNCT_PATTERN = /['"`~!@#$%^&*()+=[\]{};:,.<>/?\\|_\-“”‘’…—–•·«»¡¿]+/g;
const EMOTICON_TOKEN_PATTERN = /(?:^|\s)(?:[:;=][-']?[)(DdvVpP]+|\^{2,}|\^_\^|[Tt]_[Tt])(?=\s|$)/g;

const SMALLTALK_GLUED_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcamon\b/g, 'cam on'],
  [/\bxinchao\b/g, 'xin chao'],
  [/\bxinloi\b/g, 'xin loi'],
  [/\bduocroi\b/g, 'duoc roi'],
  [/\bdcroi\b/g, 'dc roi'],
  [/\bhieuroi\b/g, 'hieu roi'],
  [/\broroi\b/g, 'ro roi'],
  [/\bbietroi\b/g, 'biet roi'],
  [/\bkhongcan\b/g, 'khong can'],
  [/\bkocan\b/g, 'ko can'],
  [/\bkhongsao\b/g, 'khong sao'],
  [/\bkhongcogi\b/g, 'khong co gi'],
  [/\bkhongdung\b/g, 'khong dung'],
  [/\bkodung\b/g, 'ko dung'],
  [/\bkhonghieu\b/g, 'khong hieu'],
  [/\bkohieu\b/g, 'ko hieu'],
  [/\btotlam\b/g, 'tot lam'],
  [/\bratot\b/g, 'rat tot'],
  [/\bquatot\b/g, 'qua tot'],
  [/\bgioilam\b/g, 'gioi lam'],
  [/\bgioiqua\b/g, 'gioi qua'],
  [/\bhaylam\b/g, 'hay lam'],
  [/\bhayqua\b/g, 'hay qua'],
  [/\btuyetvoi\b/g, 'tuyet voi'],
  [/\bxuatsac\b/g, 'xuat sac'],
  [/\bthankyou\b/g, 'thank you'],
  [/\btambiet\b/g, 'tam biet'],
  [/\bhengaplai\b/g, 'hen gap lai'],
  [/\bkhoekhong\b/g, 'khoe khong'],
  [/\bkhoeko\b/g, 'khoe ko'],
  [/\bbanlaai\b/g, 'ban la ai'],
  [/\bmaylaai\b/g, 'may la ai'],
  [/\bchucmung\b/g, 'chuc mung'],
  [/\bdoichut\b/g, 'doi chut'],
  [/\bdoixiu\b/g, 'doi xiu'],
  [/\bchochut\b/g, 'cho chut'],
  [/\bchoxiu\b/g, 'cho xiu'],
  [/\bsairoi\b/g, 'sai roi'],
  [/\bdungroi\b/g, 'dung roi'],
  [/\bxongroi\b/g, 'xong roi'],
  [/\bhetroi\b/g, 'het roi'],
  [/\bngungon\b/g, 'ngu ngon'],
  [/\bgodmorning\b/g, 'god morning'],
  [/\bgodafternon\b/g, 'god afternon'],
  [/\bgodevening\b/g, 'god evening'],
  [/\bgodnight\b/g, 'god night'],
  [/\bbyebye\b/g, 'bye bye'],
  [/\bbaibai\b/g, 'bai bai'],
  [/\boknha\b/g, 'ok nha'],
  [/\boknhe\b/g, 'ok nhe'],
  [/\bokroi\b/g, 'ok roi'],
  [/\bokcamon\b/g, 'ok cam on'],
  [/\bokecamon\b/g, 'oke cam on'],
];

export function stripSmalltalkDiacritics(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function stripEmojiAndPunctForSmalltalk(raw: string): string {
  const withoutEmoticons = (raw || '').replace(EMOTICON_TOKEN_PATTERN, ' ');
  return stripSmalltalkDiacritics(withoutEmoticons.replace(EMOJI_PATTERN, ' '))
    .toLowerCase()
    .replace(SMALLTALK_PUNCT_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForSmalltalkMatch(raw: string): string {
  let text = stripEmojiAndPunctForSmalltalk(raw);
  if (!text) return '';
  // Preserve "banlaai" / "maylaai" (adjacent 'aa' across word boundary) before collapsing repeated ASCII letters
  text = text
    .replace(/\bb+a+n+l+a{2,}i+\b/g, 'ban la ai')
    .replace(/\bm+a+y+l+a{2,}i+\b/g, 'may la ai');
  // Collapse consecutive identical ASCII letters only (never digits)
  text = text.replace(/([a-z])\1+/g, '$1');
  for (const [pattern, replacement] of SMALLTALK_GLUED_PHRASES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

function stripSmalltalkPoliteTail(stNorm: string): string {
  let current = stNorm;
  const tailRe = /\s+(?:a|nhe|nha|oi|luon|ban|em|anh|chi|bot|ad|vay|the|nhi|pls|please)$/;
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(tailRe, '').trim();
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// 14 Smalltalk Groups (+ who_am_i) Dataset
// ---------------------------------------------------------------------------

interface GroupDataset {
  patterns: readonly string[];
  normalizedSet: ReadonlySet<string>;
}

function buildGroupDataset(patterns: readonly string[]): GroupDataset {
  const set = new Set<string>();
  for (const p of patterns) {
    const n = normalizeForSmalltalkMatch(p);
    if (n) set.add(n);
  }
  return { patterns, normalizedSet: set };
}

const RAW_GROUP_PATTERNS: Record<SmalltalkGroupId, readonly string[]> = {
  greeting: [
    'alo',
    'a lo',
    'hi',
    'hi there',
    'hi bot',
    'hello',
    'hello there',
    'hello bot',
    'helo',
    'hey',
    'hey there',
    'hey bot',
    'hallo',
    'yo',
    'gm',
    'sup',
    'whats up',
    'what s up',
    'xin chao',
    'chao',
    'chao ban',
    'chao bot',
    'chao tro ly',
    'chao lac viet',
    'chao em',
    'chao anh',
    'chao chi',
    'chao ad',
    'e oi',
    'bot oi',
    'ban oi',
    'ad oi',
    'oi',
    'good morning',
    'good afternoon',
    'good evening',
    'chao buoi sang',
    'chao buoi trua',
    'chao buoi chieu',
    'chao buoi toi',
    'morning',
    'test',
    'testing',
    '1 2 3',
    '123',
    'ping',
  ],
  thanks: [
    'cam on',
    'camon',
    'cam on nhe',
    'cam on ban',
    'cam on nhieu',
    'cam on nha',
    'cam on rat nhieu',
    'cam on ban nhieu',
    'cam on ban rat nhieu',
    'cam on em',
    'cam on anh',
    'cam on chi',
    'cam on bot',
    'cam on ad',
    'cam on truoc',
    'cam on lam',
    'thanks',
    'thanks a lot',
    'thank',
    'thank you',
    'thank you so much',
    'thank u',
    'tks',
    'thks',
    'thx',
    'tk',
    'ty',
    'biet on',
    'da ta',
    'nhan duoc roi cam on',
    'da nhan duoc cam on',
    'ok cam on',
    'oke cam on',
    'okay cam on',
    'da cam on',
  ],
  praise: [
    'tot',
    'tot lam',
    'lam tot lam',
    'rat tot',
    'qua tot',
    'gioi',
    'gioi lam',
    'gioi qua',
    'rat gioi',
    'qua gioi',
    'hay',
    'hay lam',
    'hay qua',
    'rat hay',
    'qua hay',
    'lam hay lam',
    'tuyet',
    'tuyet voi',
    'rat tuyet',
    'xuat sac',
    'dinh',
    'dinh qua',
    'qua dinh',
    'ngon',
    'chuan',
    'chuan roi',
    'chuan qua',
    'chuan lam',
    'chinh xac',
    'dung roi',
    'qua da',
    'thong minh',
    'huu ich',
    'perfect',
    'great',
    'good',
    'good job',
    'nice',
    'awesome',
    'well done',
    'excellent',
    'like',
    'ban gioi qua',
    'bot gioi qua',
    'bot hay qua',
    'ban hay qua',
    'ban tot lam',
    'bot tot lam',
  ],
  ack: [
    'ok',
    'oke',
    'okie',
    'oki',
    'okay',
    'okela',
    'ok nha',
    'ok nhe',
    'ok a',
    'ok ban',
    'ok roi',
    'duoc',
    'duoc roi',
    'dc',
    'dc roi',
    'roger',
    'hieu roi',
    'da hieu',
    'ro roi',
    'biet roi',
    'da',
    'vang',
    'da vang',
    'u',
    'uh',
    'uk',
    'yes',
    'y',
    'dong y',
    'nhat tri',
    'got it',
    'noted',
  ],
  decline: [
    'khong',
    'ko',
    'k',
    'khong can',
    'ko can',
    'k can',
    'khong can dau',
    'khong sao',
    'khong co gi',
    'thoi',
    'thoi khong can',
    'thoi ko can',
    'thoi bo di',
    'no',
    'nope',
    'het roi',
    'het cau hoi',
    'het viec',
    'khong can nua',
    'xong roi',
  ],
  goodbye: [
    'bye',
    'bye bye',
    'bai',
    'bai bai',
    'tam biet',
    'hen gap lai',
    'chao tam biet',
    'chao nhe',
    'thoi nhe',
    'minh di day',
    'toi di day',
    'chuc ngay tot lanh',
    'good night',
    'gn',
    'ngu ngon',
    'chuc ngu ngon',
    'chuc cuoi tuan vui ve',
    'see you',
    'see you later',
    'goodbye',
    'good bye',
  ],
  about_bot: [
    'ban la ai',
    'may la ai',
    'm la ai',
    'ten gi',
    'ban ten gi',
    'ten ban la gi',
    'ban la bot hay nguoi',
    'ban la ai vay',
    'ai tao ra ban',
    'ban lam duoc gi',
    'ban giup duoc gi',
    'ban biet gi',
    'ban co the lam gi',
    'ban ho tro gi',
    'chuc nang',
    'help',
    'huong dan',
    'menu',
    'goi y',
    'who are you',
    'what can you do',
    'what are you',
    'ban la gi',
    'gioi thieu ve ban',
    'tro giup',
    'bot la ai',
  ],
  how_are_you: [
    'khoe khong',
    'ban khoe khong',
    'khoe ko',
    'khoe k',
    'ban khoe ko',
    'the nao',
    'ban the nao',
    'dao nay the nao',
    'dao nay the nao roi',
    'hom nay the nao',
    'dang lam gi',
    'co do khong',
    'co ai khong',
    'on khong',
    'ban on khong',
    'how are you',
    'hwo are you',
    'how are you doing',
    'how are you today',
    'how r u',
    'hows it going',
    'how is it going',
  ],
  apology: [
    'xin loi',
    'sorry',
    'sr',
    'sry',
    'nham',
    'go nham',
    'nham roi',
    'quen mat',
    'ui nham',
    'xin loi nham',
  ],
  complaint: [
    'ngu',
    'ngu qua',
    'ngu lam',
    'bot ngu',
    'bot ngu qua',
    'tro ly ngu',
    'tro ly ngu qua',
    'do',
    'do qua',
    'do lam',
    'bot do qua',
    'te',
    'te qua',
    'te lam',
    'bot te',
    'bot te qua',
    'sai roi',
    'bot sai roi',
    'tra loi sai',
    'tra loi ngu',
    'khong dung',
    'ko dung',
    'ko hieu',
    'khong hieu',
    'khong hieu gi',
    'bot khong hieu',
    'bot ko hieu',
    'chan',
    'chan qua',
    'chan lam',
    'bot chan',
    'bot chan qua',
    'vo dung',
    'bot vo dung',
  ],
  laugh_emotion: [
    'haha',
    'hihi',
    'hehe',
    'kaka',
    'huhu',
    'hic',
    'lol',
    'lmao',
    'wow',
    'oa',
    'ui',
    'vui qua',
    'met qua',
    'buon qua',
    'stress qua',
    'hay ghe',
  ],
  wait_filler: [
    'doi chut',
    'doi xiu',
    'cho chut',
    'cho xiu',
    'wait',
    'khoan',
    'khoan da',
    'chua',
  ],
  wishes: [
    'chuc mung',
    'chuc mung nam moi',
    'happy new year',
    'happy birthday',
    'chuc mung sinh nhat',
    'tet vui ve',
    'chuc tet',
    'giang sinh vui ve',
    'merry christmas',
  ],
  out_of_scope_light: [
    'thoi tiet',
    'thoi tiet hom nay',
    'what is the weather',
    'ke chuyen cuoi',
    'ke chuyen',
    'tell me a joke',
    'hat di',
    'hat mot bai',
    'may gio roi',
    'bay gio may gio',
    'hom nay thu may',
    'hom nay ngay may',
    '1+1 bang may',
    '1 + 1 bang may',
    'mot cong mot bang may',
  ],
  who_am_i: ['toi la ai', 'minh la ai', 'who am i'],
};

export const SMALLTALK_DATASETS: Record<SmalltalkGroupId, GroupDataset> = {
  greeting: buildGroupDataset(RAW_GROUP_PATTERNS.greeting),
  thanks: buildGroupDataset(RAW_GROUP_PATTERNS.thanks),
  praise: buildGroupDataset(RAW_GROUP_PATTERNS.praise),
  ack: buildGroupDataset(RAW_GROUP_PATTERNS.ack),
  decline: buildGroupDataset(RAW_GROUP_PATTERNS.decline),
  goodbye: buildGroupDataset(RAW_GROUP_PATTERNS.goodbye),
  about_bot: buildGroupDataset(RAW_GROUP_PATTERNS.about_bot),
  how_are_you: buildGroupDataset(RAW_GROUP_PATTERNS.how_are_you),
  apology: buildGroupDataset(RAW_GROUP_PATTERNS.apology),
  complaint: buildGroupDataset(RAW_GROUP_PATTERNS.complaint),
  laugh_emotion: buildGroupDataset(RAW_GROUP_PATTERNS.laugh_emotion),
  wait_filler: buildGroupDataset(RAW_GROUP_PATTERNS.wait_filler),
  wishes: buildGroupDataset(RAW_GROUP_PATTERNS.wishes),
  out_of_scope_light: buildGroupDataset(RAW_GROUP_PATTERNS.out_of_scope_light),
  who_am_i: buildGroupDataset(RAW_GROUP_PATTERNS.who_am_i),
};

const ABOUT_BOT_FORBIDDEN_GUARD =
  /\b(?:hr|nhan\s+su|truong\s+phong|giam\s+doc|admin|sep|quan\s+ly|ai\s+duyet|phe\s+duyet)\b/i;

const LAUGH_REPEAT_PATTERN = /^(?:(?:ha){2,}|(?:hi){2,}|(?:he){2,}|(?:ka){2,}|(?:hu){2,}|k{2,})$/;
const BYE_PP_PATTERN = /^p{2,}(?:\s+(?:a|nhe|nha|ban|em|bot|oi)){0,3}$/;

// Pure emoji / emoticon detection BEFORE stripping punctuation/emoji (strictly O(N) token-based, no nested quantifiers)
const EMOJI_SPLIT_PUNCT_RE = new RegExp('[\\s\\p{P}]+', 'u');
const SINGLE_GREETING_EMOJI_RE = new RegExp('^(?:👋[\\u{1F3FB}-\\u{1F3FF}]?)+$', 'u');
const SINGLE_THANKS_EMOJI_RE = new RegExp('^(?:🙏[\\u{1F3FB}-\\u{1F3FF}]?)+$', 'u');
const SINGLE_PRAISE_EMOJI_RE = new RegExp('^(?:(?:👍|👏|❤\\uFE0F?|🔥)[\\u{1F3FB}-\\u{1F3FF}]?)+$', 'u');
const SINGLE_ACK_EMOJI_RE = new RegExp('^(?:👌[\\u{1F3FB}-\\u{1F3FF}]?)+$', 'u');
const SINGLE_LAUGH_EMOJI_TOKEN_RE = new RegExp('^(?:😂|😅|🤣|😄|😆|😁|😊|😭|😢)+$', 'u');
const SINGLE_LAUGH_EMOTICON_TOKEN_RE = /^(?:[:;=]['-]?[)(DdvVpP]+|\^{2,}|\^_\^|[Tt]_[Tt])$/;

// Direct-answerable safe light questions
const DIRECT_TIME_SET = new Set(['may gio roi', 'bay gio may gio']);
const DIRECT_WEEKDAY_SET = new Set(['hom nay thu may']);
const DIRECT_DATE_SET = new Set(['hom nay ngay may']);
const DIRECT_MATH_SET = new Set(['1 1 bang may', 'mot cong mot bang may']);

// ---------------------------------------------------------------------------
// Response Rendering (3 variants per group, personalized with short name)
// ---------------------------------------------------------------------------

function getShortUserDisplayName(fullName?: string): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'bạn';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last.length > 24 || /[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF-]/.test(last)) {
    return 'bạn';
  }
  return `bạn ${last}`;
}

function pickDeterministicVariant(
  variants: readonly string[],
  userId: string,
  group: SmalltalkGroupId,
  seedText: string,
  lastAssistantMessage?: string,
  avoidRepeat = false
): string {
  const hashSource = `${userId}:${group}:${seedText}`;
  let hash = 0;
  for (let i = 0; i < hashSource.length; i += 1) {
    hash = (hash * 31 + hashSource.charCodeAt(i)) >>> 0;
  }
  const idx = hash % variants.length;
  const chosen = variants[idx];
  if (avoidRepeat && lastAssistantMessage && variants.length > 1) {
    const prev = lastAssistantMessage.trim();
    if (prev && chosen.trim() === prev) {
      return variants[(idx + 1) % variants.length];
    }
  }
  return chosen;
}

function formatDirectOutOfScopeReply(
  stNorm: string,
  name: string,
  personalize: boolean,
  nowMs: number
): string | null {
  const vnMs = nowMs + 7 * 60 * 60 * 1000;
  const d = new Date(vnMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const weekday = weekdays[d.getUTCDay()] || 'Thứ Hai';
  const pullBack =
    'Mình chuyên về nhân sự nên hỗ trợ tốt nhất phần phép năm, lương, chấm công, quy chế và đơn từ nhé!';
  const addr = personalize ? ` ${name}` : '';

  if (DIRECT_TIME_SET.has(stNorm)) {
    return `Bây giờ là ${hh}:${mm} (giờ Việt Nam) nhé${addr}! ${pullBack}`;
  }
  if (DIRECT_WEEKDAY_SET.has(stNorm)) {
    return `Hôm nay là ${weekday}, ngày ${dd}/${mo}/${yyyy} nhé${addr}! ${pullBack}`;
  }
  if (DIRECT_DATE_SET.has(stNorm)) {
    return `Hôm nay là ngày ${dd}/${mo}/${yyyy} (${weekday}) nhé${addr}! ${pullBack}`;
  }
  if (DIRECT_MATH_SET.has(stNorm)) {
    return `1 + 1 = 2 nhé${addr}! ${pullBack}`;
  }
  return null;
}

export function renderSmalltalkGroupReply(
  params: {
    group: SmalltalkGroupId;
    user: SmalltalkUserContext;
    personalize: boolean;
    seedText: string;
    nowMs?: number;
    lastAssistantMessage?: string;
  },
  opts?: { lastAssistantMessage?: string }
): string {
  const { group, user, personalize, seedText, nowMs = Date.now() } = params;
  const lastAssistantMessage = opts?.lastAssistantMessage ?? params.lastAssistantMessage;
  const prevTrimmed = (lastAssistantMessage || '').trim();

  if (group === 'who_am_i') {
    const base = TPL_SMALL_WHO_AM_I({
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      roleLabel: user.roleLabel,
    });
    if (personalize && prevTrimmed && prevTrimmed === base) {
      return `Mình nhắc lại thông tin tài khoản đang đăng nhập nhé: ${base}`;
    }
    return base;
  }

  const name = personalize ? getShortUserDisplayName(user.fullName) : 'bạn';

  if (group === 'out_of_scope_light') {
    const stripped = stripSmalltalkPoliteTail(seedText);
    const direct =
      formatDirectOutOfScopeReply(seedText, name, personalize, nowMs) ||
      formatDirectOutOfScopeReply(stripped, name, personalize, nowMs);
    if (direct) {
      if (personalize && prevTrimmed && prevTrimmed === direct) {
        return `Mình nhắc lại nhé: ${direct}`;
      }
      return direct;
    }
    if (!personalize) {
      return TPL_OFF_TOPIC;
    }
    const variants = [
      `Mình chuyên về nhân sự nên không rành mảng này lắm ${name} ạ! Bạn cần tra cứu phép năm, lương, chấm công, quy chế hay tạo đơn từ không?`,
      `Khoản này ngoài chuyên môn của mình rồi ${name} ơi! Mình hỗ trợ tốt nhất phần phép năm, bảng lương, chấm công, quy chế và đơn từ nhé.`,
      `Mình chỉ chuyên hỗ trợ nghiệp vụ nhân sự thôi ${name} nhé! Bạn cần hỏi gì về phép năm, lương, quy chế hay đơn từ không?`,
    ];
    return pickDeterministicVariant(variants, user.userId, group, seedText, prevTrimmed, true);
  }

  if (!personalize) {
    switch (group) {
      case 'greeting':
        return TPL_SMALL_GREETING;
      case 'how_are_you':
        return TPL_SMALL_HOW_ARE_YOU;
      case 'thanks':
        return TPL_SMALL_THANKS;
      case 'praise':
        return TPL_SMALL_PRAISE;
      case 'ack':
        return TPL_SMALL_ACK;
      case 'goodbye':
        return TPL_SMALL_BYE;
      case 'about_bot':
        return TPL_SMALL_WHO_ARE_YOU;
      default:
        break;
    }
  }

  const variantsMap: Record<Exclude<SmalltalkGroupId, 'who_am_i' | 'out_of_scope_light'>, readonly string[]> = {
    greeting: [
      `Chào ${name}, mình là Trợ lý Lạc Việt. Bạn muốn hỏi gì về phép năm, lương, quy chế hay đơn từ hôm nay?`,
      `Chào ${name}! Mình có thể hỗ trợ bạn kiểm tra phép năm, bảng lương, quy chế hoặc soạn nháp đơn từ nhé.`,
      `Xin chào ${name}! Hôm nay bạn cần mình hỗ trợ gì về phép năm, lương, quy chế hay đơn từ nào?`,
    ],
    thanks: [
      `Không có gì ạ ${name}! Cần giúp thêm về phép năm, lương, quy chế hay đơn từ bạn cứ nhắn mình nhé.`,
      `Rất vui được hỗ trợ ${name}! Khi nào cần hỏi về phép năm, lương hay đơn từ cứ nhắn mình nhé.`,
      `Không có chi ${name}! Cần tra cứu thêm phép năm, bảng lương hay quy chế bạn cứ bảo mình nhé.`,
    ],
    praise: [
      `Cảm ơn ${name} nhé! Bạn cần mình hỗ trợ gì thêm về phép năm, lương, quy chế hay đơn từ không?`,
      `Cảm ơn lời khen của ${name}! Cần kiểm tra phép năm, bảng lương hay soạn nháp đơn từ bạn cứ nhắn mình nhé.`,
      `Vui quá, cảm ơn ${name}! Mình vẫn sẵn sàng hỗ trợ về phép năm, lương, quy chế và đơn từ nhé.`,
    ],
    ack: [
      `Dạ vâng ${name}! Cần mình giúp thêm về phép năm, lương, quy chế hay đơn từ bạn cứ nhắn nhé.`,
      `Rõ rồi ạ ${name}! Khi nào cần tra cứu phép năm, lương hay quy chế bạn cứ gọi mình nhé.`,
      `Ok ${name} nhé! Lúc nào cần hỗ trợ phép năm, bảng lương hay soạn nháp đơn từ cứ nhắn mình.`,
    ],
    decline: [
      `Dạ vâng ${name}, không sao ạ! Khi nào cần hỏi về phép năm, lương, quy chế hay đơn từ bạn cứ nhắn mình nhé.`,
      `Được rồi ${name} nhé! Cần hỗ trợ phép năm, chấm công, lương hay đơn từ lúc nào cứ gọi mình.`,
      `Ok ${name}! Chúc bạn làm việc hiệu quả, khi nào cần tra cứu thông tin nhân sự cứ nhắn lại mình nhé.`,
    ],
    goodbye: [
      `Tạm biệt ${name}! Chúc bạn một ngày làm việc tốt lành, khi nào cần hỏi về phép năm, lương hay quy chế cứ nhắn lại mình nhé.`,
      `Chào tạm biệt ${name}! Hẹn gặp lại khi bạn cần hỗ trợ về phép năm, lương, quy chế hoặc đơn từ nhé.`,
      `Bye ${name} nhé! Chúc bạn nhiều sức khỏe và niềm vui, cần hỗ trợ nhân sự cứ nhắn mình bất cứ lúc nào.`,
    ],
    about_bot: [
      `Chào ${name}, mình là Trợ lý Lạc Việt, trợ lý nhân sự của Lạc Việt. Mình giúp tra cứu phép năm, chấm công, phiếu lương, quy chế và soạn nháp đơn nghỉ phép, giải trình chấm công, làm thêm giờ nhé.`,
      `Mình là Trợ lý Lạc Việt đồng hành cùng ${name}! Bạn có thể hỏi mình về phép năm, lương, chấm công, chính sách nội bộ hoặc nhờ soạn nháp đơn từ để tự kiểm tra và gửi.`,
      `Chào ${name}, mình là Trợ lý AI Nhân sự Lạc Việt. Mình hỗ trợ kiểm tra số phép, phiếu lương, quy chế công ty và tạo nháp đơn nghỉ phép, OT, giải trình chấm công nhé.`,
    ],
    how_are_you: [
      `Cảm ơn ${name}, mình vẫn khỏe và sẵn sàng! Bạn cần mình hỗ trợ gì về phép năm, lương, quy chế hay đơn từ không?`,
      `Mình ổn ạ, cảm ơn ${name} đã hỏi thăm! Hôm nay bạn cần tra cứu phép năm, chấm công, lương hay quy chế gì không?`,
      `Mình lúc nào cũng sẵn sàng hỗ trợ ${name} đây! Bạn muốn hỏi về phép năm, phiếu lương, quy chế hay đơn từ nào?`,
    ],
    apology: [
      `Không sao đâu ${name} ơi! Bạn cứ nhắn lại yêu cầu về phép năm, lương, quy chế hay đơn từ mình hỗ trợ ngay nhé.`,
      `Không có gì phải ngại đâu ${name}! Khi nào cần hỏi phép năm, chấm công, bảng lương hay tạo đơn từ cứ nhắn mình nhé.`,
      `Đừng bận tâm nhé ${name}! Mình luôn sẵn sàng hỗ trợ bạn tra cứu phép năm, lương, quy chế và đơn từ.`,
    ],
    complaint: [
      `Mình xin lỗi ${name} vì phản hồi chưa làm bạn hài lòng! Bạn nói rõ hơn yêu cầu giúp mình nhé (ví dụ: "Tôi còn bao nhiêu ngày phép?", "Phiếu lương tháng này", hoặc "Xin nghỉ phép ngày mai").`,
      `Xin lỗi ${name} nhiều nhé, mình sẽ cố gắng trả lời chính xác hơn! Bạn thử nhắn cụ thể nhu cầu giúp mình (ví dụ: hỏi phép năm còn lại, xem phiếu lương, hoặc xin nghỉ phép).`,
      `Mình thành thật xin lỗi ${name} vì trải nghiệm chưa tốt! Bạn cho mình biết rõ hơn bạn đang cần tra cứu phép năm, xem lương hay tạo đơn nghỉ phép để mình hỗ trợ đúng ý nhé.`,
    ],
    laugh_emotion: [
      `Haha vui quá ${name} ơi! Bạn cần mình hỗ trợ gì về phép năm, lương, quy chế hay đơn từ hôm nay không?`,
      `Nghe năng lượng quá ${name} nhé! Nếu cần kiểm tra phép năm, bảng lương, quy chế hay soạn nháp đơn từ cứ nhắn mình.`,
      `Cảm ơn ${name} đã chia sẻ cảm xúc! Mình luôn ở đây hỗ trợ bạn phần phép năm, chấm công, lương, quy chế và đơn từ nhé.`,
    ],
    wait_filler: [
      `Dạ vâng ${name}, mình đợi bạn nhé! Khi nào sẵn sàng hỏi về phép năm, lương, quy chế hay đơn từ cứ nhắn mình.`,
      `Ok ${name}, bạn cứ từ từ nhé! Lúc nào cần tra cứu phép năm, bảng lương hay soạn đơn từ mình hỗ trợ ngay.`,
      `Không vội đâu ${name} ơi! Mình vẫn ở đây chờ bạn khi cần hỗ trợ phép năm, chấm công, lương hay đơn từ nhé.`,
    ],
    wishes: [
      `Cảm ơn lời chúc dễ thương của ${name}! Chúc bạn nhiều sức khỏe, niềm vui và công việc thuận lợi; cần hỗ trợ phép năm, lương hay đơn từ cứ nhắn mình nhé.`,
      `Cảm ơn ${name} nhiều nhé, chúc bạn luôn vui vẻ và gặp nhiều may mắn! Khi nào cần tra cứu phép năm, quy chế hay bảng lương cứ nhắn mình.`,
      `Vui quá, cảm ơn ${name} đã chúc! Chúc bạn mọi điều tốt đẹp nhất, cần hỗ trợ nghiệp vụ nhân sự lúc nào cứ gọi mình nhé.`,
    ],
  };

  const variants = variantsMap[group];
  return pickDeterministicVariant(
    variants,
    user.userId,
    group,
    seedText,
    prevTrimmed,
    personalize
  );
}

// ---------------------------------------------------------------------------
// Group Metadata & Main Smalltalk Matcher
// ---------------------------------------------------------------------------

const GROUP_META: Record<SmalltalkGroupId, { templateId: string; intent: string }> = {
  greeting: { templateId: 'TPL_SMALL_GREETING', intent: 'SMALL_GREETING' },
  thanks: { templateId: 'TPL_SMALL_THANKS', intent: 'SMALL_THANKS' },
  praise: { templateId: 'TPL_SMALL_PRAISE', intent: 'SMALL_PRAISE' },
  ack: { templateId: 'TPL_SMALL_ACK', intent: 'SMALL_ACK' },
  decline: { templateId: 'TPL_SMALL_DECLINE', intent: 'SMALL_DECLINE' },
  goodbye: { templateId: 'TPL_SMALL_BYE', intent: 'SMALL_BYE' },
  about_bot: { templateId: 'TPL_SMALL_WHO_ARE_YOU', intent: 'SMALL_WHO_ARE_YOU' },
  how_are_you: { templateId: 'TPL_SMALL_HOW_ARE_YOU', intent: 'SMALL_HOW_ARE_YOU' },
  apology: { templateId: 'TPL_SMALL_APOLOGY', intent: 'SMALL_APOLOGY' },
  complaint: { templateId: 'TPL_SMALL_COMPLAINT', intent: 'SMALL_COMPLAINT' },
  laugh_emotion: { templateId: 'TPL_SMALL_LAUGH_EMOTION', intent: 'SMALL_LAUGH_EMOTION' },
  wait_filler: { templateId: 'TPL_SMALL_WAIT_FILLER', intent: 'SMALL_WAIT_FILLER' },
  wishes: { templateId: 'TPL_SMALL_WISHES', intent: 'SMALL_WISHES' },
  out_of_scope_light: { templateId: 'TPL_OFF_TOPIC', intent: 'SMALL_OUT_OF_SCOPE_LIGHT' },
  who_am_i: { templateId: 'TPL_SMALL_WHO_AM_I', intent: 'SMALL_WHO_AM_I' },
};

const MATCH_ORDER: readonly SmalltalkGroupId[] = [
  'who_am_i',
  'about_bot',
  'out_of_scope_light',
  'wishes',
  'thanks',
  'goodbye',
  'how_are_you',
  'apology',
  'complaint',
  'wait_filler',
  'praise',
  'laugh_emotion',
  'greeting',
  'ack',
  'decline',
];

function detectPureEmojiOrEmoticonGroup(
  raw: string,
  allowAckAndDecline: boolean
): SmalltalkGroupId | null {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed.length > 64) return null;

  const emojiTokens = trimmed.split(EMOJI_SPLIT_PUNCT_RE).filter(Boolean);
  if (emojiTokens.length > 0 && emojiTokens.length <= 16) {
    if (emojiTokens.every((t) => SINGLE_GREETING_EMOJI_RE.test(t))) return 'greeting';
    if (emojiTokens.every((t) => SINGLE_THANKS_EMOJI_RE.test(t))) return 'thanks';
    if (emojiTokens.every((t) => SINGLE_PRAISE_EMOJI_RE.test(t))) return 'praise';
    if (allowAckAndDecline && emojiTokens.every((t) => SINGLE_ACK_EMOJI_RE.test(t))) return 'ack';
  }

  const laughTokens = trimmed.split(/[\s,.!?~-]+/).filter(Boolean);
  if (
    laughTokens.length > 0 &&
    laughTokens.length <= 16 &&
    laughTokens.every(
      (t) => SINGLE_LAUGH_EMOJI_TOKEN_RE.test(t) || SINGLE_LAUGH_EMOTICON_TOKEN_RE.test(t)
    )
  ) {
    return 'laugh_emotion';
  }

  return null;
}

export function detectSmalltalkGroup(
  raw: string,
  options: {
    allowAckAndDecline: boolean;
    hadSpoofedRolePrefix?: boolean;
    isRestrictedQuery?: boolean;
  }
): { group: SmalltalkGroupId; seedText: string } | null {
  if (options.hadSpoofedRolePrefix || options.isRestrictedQuery) {
    return null;
  }

  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  // 1. Pure emoji / emoticon check BEFORE punctuation & emoji stripping
  const pureEmojiGroup = detectPureEmojiOrEmoticonGroup(trimmed, options.allowAckAndDecline);
  if (pureEmojiGroup) {
    return { group: pureEmojiGroup, seedText: trimmed };
  }

  const stNoCollapse = stripEmojiAndPunctForSmalltalk(trimmed);
  const stNorm = normalizeForSmalltalkMatch(trimmed);
  if (!stNorm) return null;

  // Guard: smalltalk only matches short phrases (<= 6 words)
  if (countWords(stNorm) > 6) {
    return null;
  }

  // 2. Pre-collapse special tokens so "kkk" -> laugh_emotion (NOT decline "k") & "pp" -> goodbye
  if (LAUGH_REPEAT_PATTERN.test(stNoCollapse)) {
    return { group: 'laugh_emotion', seedText: stNoCollapse };
  }
  if (BYE_PP_PATTERN.test(stNoCollapse)) {
    return { group: 'goodbye', seedText: stNoCollapse };
  }

  const isGroupAllowed = (group: SmalltalkGroupId): boolean => {
    if ((group === 'ack' || group === 'decline') && !options.allowAckAndDecline) {
      return false;
    }
    if (group === 'about_bot' && ABOUT_BOT_FORBIDDEN_GUARD.test(stNoCollapse)) {
      return false;
    }
    return true;
  };

  // 3. Pass 1: Exact normalized match across all groups (prevents "chao nhe" falling into "chao")
  for (const group of MATCH_ORDER) {
    if (!isGroupAllowed(group)) continue;
    if (SMALLTALK_DATASETS[group].normalizedSet.has(stNorm)) {
      return { group, seedText: stNorm };
    }
  }

  // 4. Pass 2: Match after stripping optional trailing polite particles
  const strippedTail = stripSmalltalkPoliteTail(stNorm);
  if (strippedTail && strippedTail !== stNorm) {
    if (LAUGH_REPEAT_PATTERN.test(strippedTail)) {
      return { group: 'laugh_emotion', seedText: strippedTail };
    }
    for (const group of MATCH_ORDER) {
      if (!isGroupAllowed(group)) continue;
      if (SMALLTALK_DATASETS[group].normalizedSet.has(strippedTail)) {
        return { group, seedText: strippedTail };
      }
    }
  }

  return null;
}

export function matchSmalltalkDataset(
  raw: string,
  user: SmalltalkUserContext,
  options: SmalltalkMatchOptions
): SmalltalkMatchResult | null {
  const detected = detectSmalltalkGroup(raw, {
    allowAckAndDecline: options.allowAckAndDecline,
    hadSpoofedRolePrefix: options.hadSpoofedRolePrefix,
    isRestrictedQuery: options.isRestrictedQuery,
  });
  if (!detected) return null;

  const meta = GROUP_META[detected.group];
  const text = renderSmalltalkGroupReply({
    group: detected.group,
    user,
    personalize: options.personalizeSmalltalk,
    seedText: detected.seedText,
    nowMs: options.nowMs,
    lastAssistantMessage: options.lastAssistantMessage,
  });

  return {
    group: detected.group,
    text,
    templateId: meta.templateId,
    intent: meta.intent,
    isSmalltalk: true,
    hideCitation: true,
  };
}

// ---------------------------------------------------------------------------
// Compound Sentence Leading Social Prefix Peeler (max 2 rounds)
// ---------------------------------------------------------------------------

const LEADING_EMOJI_OR_SPACE_REGEX = new RegExp(
  '^(?:[\\s]|(?:\\p{Extended_Pictographic}|\\uFE0F|\\u200D))+',
  'u'
);
const LEADING_PUNCT_OR_EMOJI_REGEX = new RegExp(
  '^(?:[\\s,!.?:;~“”‘’…—–•·«»¡¿-]|(?:\\p{Extended_Pictographic}|\\uFE0F|\\u200D))+',
  'u'
);

const LEADING_SOCIAL_PREFIX_REGEX =
  /^(?:x+i+n+\s*c+h+a+o+(?:\s+(?:b+a+n+|e+m+|a+n+h+|c+h+i+|a+d+|b+o+t+|l+a+c+\s+v+i+e+t+|t+r+o+\s+l+y+))?|c+h+a+o+\s+b+u+o+i+\s+(?:s+a+n+g+|t+r+u+a+|c+h+i+e+u+|t+o+i+)|c+h+a+o+\s+(?:b+a+n+|e+m+|a+n+h+|c+h+i+|a+d+|b+o+t+|l+a+c+\s+v+i+e+t+|t+r+o+\s+l+y+)|g+o{2,}d+\s+(?:m+o+r+n+i+n+g+|a+f+t+e+r+n+o{2,}n+|e+v+e+n+i+n+g+)|(?:h+e+l+o+|h+a+l+o+|h+i+|h+e+y+)(?:\s+(?:t+h+e+r+e+|b+o+t+))?|y+o+|g+m+|a+\s*l+o+|a+d+\s+o+i+|b+o+t+\s+o+i+|b+a+n+\s+o+i+|e+\s+o+i+|c+h+a+o+|(?:(?:o+k+(?:e+|a+y+)?|d+a+)\s+)?c+a+m+\s*o+n+(?:\s+(?:b+a+n+|e+m+|a+n+h+|c+h+i+|a+d+|b+o+t+|t+r+u+o+c+|r+a+t+\s+n+h+i+e+u+|n+h+i+e+u+|n+h+e+|n+h+a+|a+)){0,3}|(?:t+h+a+n+k+s*|t+h+a+n+k+\s+y+o+u+|t+h+a+n+k+\s+u+|t+k+s+|t+h+k+s+|t+h+x+|t+y+)(?:\s+(?:b+a+n+|e+m+|a+d+|b+o+t+|n+h+i+e+u+|n+h+e+|n+h+a+|a+)){0,2}|x+i+n+\s*l+o+i+|s+o+r+y+|s+r+y*|o+k+(?:e+|a+y+|i+e+|i+|e+l+a+)?(?:\s+(?:b+a+n+|n+h+e+|n+h+a+|a+|r+o+i+))?|d+u+o+c+\s+r+o+i+|h+i+e+u+\s+r+o+i+|d+a+\s+h+i+e+u+|r+o+\s+r+o+i+|d+a+\s+v+a+n+g+|v+a+n+g+|t+o+t+\s+l+a+m+|h+a+y+\s+l+a+m+|g+i+o+i+\s+q+u+a+|t+u+y+e+t+\s+v+o+i+)\b(?:\s+(?:n+h+e+|n+h+a+|a+|o+i+))?/i;

const QUESTION_OR_TASK_LEADIN_REGEX =
  /^(?:vay|the|thi|cho\s+(?:minh|toi|em|anh|chi)?\s*hoi|giup\s+(?:minh|toi|em)|minh\s+(?:muon|can|hoi)|toi\s+(?:muon|can|hoi)|em\s+(?:muon|can|hoi)|xin\s+(?:nghi|hoi|phep)|dang\s+k[yi]|tao\s+don|lam\s+don|viet\s+don|soan\s+don|kiem\s+tra|xem|tra\s+cuu|hoi\s+ve|luong|phep|cham\s+cong|ot|don)\b/i;

const CONNECTOR_PREFIX_REGEX = /^(?:v+a+y+|t+h+e+|t+h+i+)\b[\s,.;:!?-]*/i;
const PURE_TAIL_ONLY_REGEX = /^(?:(?:ban|em|anh|chi|ad|bot)(?:\s+(?:a|nhe|nha|oi))?|(?:a|nhe|nha|oi))$/;

function sliceRawByAsciiLength(raw: string, asciiLen: number): string {
  let rawIdx = 0;
  let asciiIdx = 0;
  while (rawIdx < raw.length && asciiIdx < asciiLen) {
    asciiIdx += stripSmalltalkDiacritics(raw[rawIdx]).length;
    rawIdx += 1;
  }
  return raw.slice(rawIdx);
}

export function peelLeadingSocialPrefix(raw: string): PeelSocialPrefixResult {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { peeled: false, peeledCount: 0, prefixes: [], remainderRaw: '' };
  }

  // Never peel pure smalltalk expressions (e.g. "chao nhe", "chao buoi sang", "ok cam on", "cam on ban")
  if (detectSmalltalkGroup(trimmed, { allowAckAndDecline: true }) !== null) {
    return { peeled: false, peeledCount: 0, prefixes: [], remainderRaw: trimmed };
  }

  let current = trimmed;
  const prefixes: string[] = [];

  for (let round = 0; round < 2; round += 1) {
    const afterEmoji = current.replace(LEADING_EMOJI_OR_SPACE_REGEX, '');
    if (!afterEmoji) break;

    // Never confuse Vietnamese past-tense "đã ..." with polite "dạ ..."
    if (/^đã\b/i.test(afterEmoji)) break;

    const asciiNoAccent = stripSmalltalkDiacritics(afterEmoji);
    const match = LEADING_SOCIAL_PREFIX_REGEX.exec(asciiNoAccent);
    if (!match) break;

    const matchedPrefix = match[0].trim();
    const afterPrefixAscii = asciiNoAccent.slice(match[0].length);
    const hasExplicitSeparator = /^[\s]*[,.;:!?—–-]/.test(afterPrefixAscii);
    const remainderRawCandidate = sliceRawByAsciiLength(afterEmoji, match[0].length)
      .replace(LEADING_PUNCT_OR_EMOJI_REGEX, '')
      .trim();

    if (!remainderRawCandidate) break;

    const remainderNorm = normalizeForSmalltalkMatch(remainderRawCandidate);
    if (!remainderNorm || PURE_TAIL_ONLY_REGEX.test(remainderNorm)) {
      break;
    }

    const remainderAscii = stripSmalltalkDiacritics(remainderRawCandidate).toLowerCase();
    const startsWithLeadIn = QUESTION_OR_TASK_LEADIN_REGEX.test(remainderAscii);
    const startsWithAnotherSocial =
      round === 0 && LEADING_SOCIAL_PREFIX_REGEX.test(remainderAscii);

    if (!hasExplicitSeparator && !startsWithLeadIn && !startsWithAnotherSocial) {
      break;
    }

    let nextRemainder = remainderRawCandidate;
    // Strip conversational filler connector ("vay" / "the" / "thi") after social prefix when meaningful content follows
    const connMatch = CONNECTOR_PREFIX_REGEX.exec(stripSmalltalkDiacritics(nextRemainder));
    if (connMatch) {
      const afterConn = sliceRawByAsciiLength(nextRemainder, connMatch[0].length)
        .replace(LEADING_PUNCT_OR_EMOJI_REGEX, '')
        .trim();
      if (afterConn && normalizeForSmalltalkMatch(afterConn)) {
        nextRemainder = afterConn;
      }
    }

    prefixes.push(matchedPrefix);
    current = nextRemainder;

    // Stop peeling if remainder itself is already pure smalltalk
    if (detectSmalltalkGroup(current, { allowAckAndDecline: true }) !== null) {
      break;
    }
  }

  return {
    peeled: prefixes.length > 0,
    peeledCount: prefixes.length,
    prefixes,
    remainderRaw: current,
  };
}

// ---------------------------------------------------------------------------
// Conversational Context Helpers (History-Aware Short Replies)
// ---------------------------------------------------------------------------

const GENERAL_OPEN_CLOSING_PATTERNS: readonly RegExp[] = [
  /\bban\s+can\s+minh\s+ho\s+tro\s+gi\b/,
  /\bban\s+muon\s+hoi\s+gi\s+ve\b/,
  /\bban\s+can\s+giup\s+them\b/,
  /\bban\s+can\s+gi\s+nao\b/,
  /\bnoi\s+ro\s+hon\s+giup\s+minh\b/,
  /\bban\s+can\s+ho\s+tro\s+gi\b/,
  /\bcan\s+minh\s+giup\s+(?:gi|them)\b/,
  /\bcan\s+minh\s+ho\s+tro\s+gi\b/,
  /\bban\s+cu\s+(?:nhan|bao|goi)\s+minh\b/,
  /\bminh\s+chuyen\s+ve\s+nhan\s+su\b/,
  /\bminh\s+chi\s+chuyen\s+ho\s+tro\b/,
];

const SPECIFIC_FOLLOWUP_PATTERNS: readonly RegExp[] = [
  /\bban\s+(?:co\s+)?muon\s+(?:tao|soan|lam|huy|rut|xem|kiem\s+tra|tra\s+cuu|chon|sua|doi|gui)\b/,
  /\bban\s+muon\s+chon\b/,
  /\bban\s+(?:co\s+)?xac\s+nhan\b/,
  /\bban\s+co\s+muon\b/,
  /\bban\s+can\s+soan\s+don\s+khac\s+khong\b/,
  /\b(?:don\s+nao|muc\s+nao|cai\s+nao|loai\s+nao|ngay\s+nao|thang\s+nao|buoi\s+nao)\b/,
  /\b(?:nhan\s+co\s+hoac\s+khong|nhan\s+1\s+hoac\s+2|chon\s+so\s+thu\s+tu)\b/,
];

export function isAssistantAwaitingFollowUp(lastAssistantMessage?: string): boolean {
  const trimmed = (lastAssistantMessage || '').trim();
  if (!trimmed) return false;
  const ascii = stripSmalltalkDiacritics(trimmed)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!ascii) return false;

  if (GENERAL_OPEN_CLOSING_PATTERNS.some((re) => re.test(ascii))) {
    return false;
  }

  return SPECIFIC_FOLLOWUP_PATTERNS.some((re) => re.test(ascii));
}

export function isLaughRepeatRaw(raw: string): boolean {
  const noCollapse = stripEmojiAndPunctForSmalltalk(raw);
  return LAUGH_REPEAT_PATTERN.test(noCollapse);
}

export function isCreateOrderFollowUpQuestion(lastAssistantMessage?: string): boolean {
  const trimmed = (lastAssistantMessage || '').trim();
  if (!trimmed) return false;
  const ascii = stripSmalltalkDiacritics(trimmed)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return /(?:tao|soan|lam)\s+don\b/.test(ascii);
}

const CONTEXT_AFFIRMATIVE_SET = new Set([
  'co',
  'ok',
  'oke',
  'okay',
  'dong y',
  'duoc',
  'dc',
  'vang',
  'da',
  'u',
  'uh',
  'uk',
  'yes',
  'dung roi',
  'phai',
]);

const CONTEXT_NEGATIVE_SET = new Set(['khong', 'ko', 'k', 'thoi', 'no', 'nope']);

const CONTEXT_SHORT_SELECTION_SET = new Set([
  'do',
  'cai do',
  'cai nay',
  'cai dau',
  'cai dau tien',
  'cai thu 1',
  'cai thu 2',
  'cai thu 3',
  'cai thu 4',
  'cai thu 5',
  '1',
  '2',
  '3',
  '4',
  '5',
  'so 1',
  'so 2',
  'so 3',
  'so 4',
  'so 5',
]);

export function isContextDependentShortReply(norm: string): boolean {
  const clean = (norm || '').trim().toLowerCase();
  if (!clean) return false;
  if (
    CONTEXT_AFFIRMATIVE_SET.has(clean) ||
    CONTEXT_NEGATIVE_SET.has(clean) ||
    CONTEXT_SHORT_SELECTION_SET.has(clean)
  ) {
    return true;
  }
  const stripped = stripSmalltalkPoliteTail(clean);
  if (stripped && stripped !== clean) {
    return (
      CONTEXT_AFFIRMATIVE_SET.has(stripped) ||
      CONTEXT_NEGATIVE_SET.has(stripped) ||
      CONTEXT_SHORT_SELECTION_SET.has(stripped)
    );
  }
  return false;
}

export function classifyContextOrderConfirmation(norm: string): 'confirm' | 'decline' | null {
  const clean = (norm || '').trim().toLowerCase();
  if (!clean) return null;
  if (CONTEXT_AFFIRMATIVE_SET.has(clean)) return 'confirm';
  if (CONTEXT_NEGATIVE_SET.has(clean)) return 'decline';
  const stripped = stripSmalltalkPoliteTail(clean);
  if (stripped && stripped !== clean) {
    if (CONTEXT_AFFIRMATIVE_SET.has(stripped)) return 'confirm';
    if (CONTEXT_NEGATIVE_SET.has(stripped)) return 'decline';
  }
  return null;
}
