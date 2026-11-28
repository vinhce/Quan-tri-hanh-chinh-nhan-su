import { HRM_CONFIG } from '@/lib/hrm/config';
import {
  EMOJI_PATTERN,
  TPL_CLARIFY,
  TPL_CLARIFY_VARIANTS,
  TPL_CLARIFY_WITH_EXAMPLES,
  TPL_OFF_TOPIC,
  TPL_SMALL_ACK,
  TPL_SMALL_BYE,
  TPL_SMALL_GREETING,
  TPL_SMALL_HOW_ARE_YOU,
  TPL_SMALL_PRAISE,
  TPL_SMALL_THANKS,
  TPL_SMALL_WHO_AM_I,
  TPL_SMALL_WHO_ARE_YOU,
  classifyContextOrderConfirmation,
  detectSmalltalkGroup,
  isAssistantAwaitingFollowUp,
  isContextDependentShortReply,
  isCreateOrderFollowUpQuestion,
  isLaughRepeatRaw,
  matchSmalltalkDataset,
  normalizeForSmalltalkMatch,
  peelLeadingSocialPrefix,
  renderSmalltalkGroupReply,
  selectClarifyReply,
  type SmalltalkGroupId,
} from '@/lib/copilot/smalltalk';

export {
  TPL_CLARIFY,
  TPL_CLARIFY_VARIANTS,
  TPL_CLARIFY_WITH_EXAMPLES,
  TPL_OFF_TOPIC,
  TPL_SMALL_ACK,
  TPL_SMALL_BYE,
  TPL_SMALL_GREETING,
  TPL_SMALL_HOW_ARE_YOU,
  TPL_SMALL_PRAISE,
  TPL_SMALL_THANKS,
  TPL_SMALL_WHO_AM_I,
  TPL_SMALL_WHO_ARE_YOU,
  isAssistantAwaitingFollowUp,
  isContextDependentShortReply,
  normalizeForSmalltalkMatch,
  peelLeadingSocialPrefix,
  selectClarifyReply,
  type SmalltalkGroupId,
};

export type RequestType =
  | 'annual_leave'
  | 'unpaid_leave'
  | 'sick_leave'
  | 'attendance_explanation'
  | 'overtime';

export type Session = 'full' | 'am' | 'pm';

export type ErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'OVERLAP'
  | 'PAST_DEADLINE'
  | 'TIMESHEET_LOCKED'
  | 'EXPLAIN_LIMIT'
  | 'OT_NOT_ELIGIBLE'
  | 'INVALID_DATE_RANGE'
  | 'MISSING_FIELD';

export interface RequestInput {
  type: RequestType;
  startDate?: string;
  endDate?: string;
  days?: number;
  session?: Session;
  reason?: string;
  handoverToId?: string;
  handoverToName?: string;
  workDate?: string;
  actualIn?: string;
  actualOut?: string;
  otStart?: string;
  otEnd?: string;
  hours?: number;
}

export interface ValidationError {
  code: ErrorCode;
  message: string;
  field?: string;
  availableDays?: number;
  requestedDays?: number;
  unpaidDays?: number;
  conflictCode?: string;
  conflictRequestId?: string;
  conflictDateText?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  normalized?: RequestInput & {
    days?: number;
    hours?: number;
    otMultiplier?: number;
    balanceBefore?: number | null;
    balanceAfter?: number | null;
    explanationsLeft?: number | null;
    approvalFlow: string;
    nextApprover: string;
    typeLabel: string;
    dateText: string;
    reason: string;
  };
}

export interface DraftPreview {
  type: RequestType;
  typeLabel: string;
  dateText: string;
  startDate: string;
  endDate: string;
  days?: number;
  session?: Session;
  reason: string;
  handoverToId?: string | null;
  handoverToName?: string | null;
  balanceAfter?: number | null;
  explanationsLeft?: number | null;
  actualIn?: string;
  actualOut?: string;
  otStart?: string;
  otEnd?: string;
  hours?: number;
  otMultiplier?: number;
  approvalFlow: string;
  nextApprover: string;
  cancelRequestCode?: string;
  cancelCategoryLabel?: string;
}

export interface DraftRecord {
  draftId: string;
  confirmToken: string;
  expiresAt: string;
  preview: DraftPreview;
  kind: 'create' | 'cancel';
  targetRequestId?: string;
}

export interface ColleagueCandidate {
  id: string;
  name: string;
  department: string;
}

export interface OrderSummary {
  id: string;
  requestCode: string;
  type: string;
  typeLabel: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface OrderContext {
  leaveAvailable: number;
  noticeDays: number | null;
  pendingApprovalCount: number | null;
  explanationsLeft: number;
}

/** Strictly 7 service methods — router never imports or calls submit. */
export interface RouterServices {
  validateRequest: (
    userId: string,
    input: RequestInput,
    nowMs?: number
  ) => Promise<ValidationResult>;
  createDraft: (
    userId: string,
    input: RequestInput,
    nowMs?: number
  ) => Promise<DraftRecord>;
  cancelDraft: (userId: string, draftId: string) => Promise<{ ok: boolean }>;
  listMyRequests: (userId: string) => Promise<OrderSummary[]>;
  draftCancelRequest: (
    userId: string,
    targetRequestId: string,
    nowMs?: number
  ) => Promise<DraftRecord>;
  searchColleagues: (
    userId: string,
    query: string
  ) => Promise<ColleagueCandidate[]>;
  getOrderContext: (userId: string) => Promise<OrderContext>;
}

export interface RouterSessionUser {
  userId: string;
  employeeCode: string;
  fullName: string;
  role: string;
  roleLabel: string;
}

export type RouterFlowStatus =
  | 'IDLE'
  | 'COLLECTING'
  | 'PREVIEW'
  | 'SUBMITTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface RouterState {
  userId: string;
  status: RouterFlowStatus;
  slots: Partial<RequestInput>;
  drafts: DraftRecord[];
  cardKind: 'preview' | 'cancel_confirm' | null;
  updatedAtMs: number;
  expiresAtMs: number;
  awaitingSelfConfirm?: boolean;
  pendingInsufficientSplit?: {
    availableDays: number;
    unpaidDays: number;
    annualInput: RequestInput;
    unpaidInput: RequestInput;
  } | null;
  pendingOverlapConflict?: {
    conflictCode: string;
    conflictRequestId: string;
  } | null;
  pendingHandoverQuery?: boolean;
  handoverCandidates?: ColleagueCandidate[] | null;
  pendingDraftReplace?: { pendingRaw: string } | null;
  unclearStreak?: number;
  draftCreatedTimestampsMs: number[];
}

export interface RouterStateStore {
  get: (userId: string, nowMs?: number) => RouterState;
  set: (userId: string, state: RouterState) => void;
  reset: (userId: string, nowMs?: number) => RouterState;
  canCreateDraft: (userId: string, nowMs: number, neededCount?: number) => boolean;
  recordDraftCreated: (userId: string, nowMs: number, count?: number) => void;
}

export interface RouterCard {
  kind: 'preview' | 'cancel_confirm';
  drafts: DraftRecord[];
}

export type SmalltalkCategory = SmalltalkGroupId | 'bye' | 'who_are_you';

export interface RouterResult {
  handled: boolean;
  source: 'router' | 'model';
  text: string;
  templateId?: string;
  intent?: string;
  forwardQuery?: string;
  card?: RouterCard | null;
  state: RouterFlowStatus;
  slots?: Partial<RequestInput>;
  values?: Record<string, string | number | null>;
  referencedPolicy?: string;
  isSmalltalk?: boolean;
  isCasualOrUnclear?: boolean;
  hideCitation?: boolean;
  smalltalkCategory?: SmalltalkCategory;
  smalltalkGroup?: SmalltalkGroupId;
}

export interface RouteMessageParams {
  query: string;
  user: RouterSessionUser;
  services: RouterServices;
  store?: RouterStateStore;
  nowMs?: number;
  personalizeSmalltalk?: boolean;
  delegateUnclearAndCasualToLlm?: boolean;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastAssistantMessage?: string;
}

export interface PostProcessModelReplyParams {
  query: string;
  reply: string;
  modelSource?: string;
  isGroundedFallback?: boolean;
  isCloudConversationalReply?: boolean;
  unclearStreak?: number;
  lastAssistantMessage?: string;
  personalizeSmalltalk?: boolean;
}

export interface PostProcessModelReplyResult {
  text: string;
  replacedWithClarify: boolean;
  source?: 'router' | 'model';
}

// ---------------------------------------------------------------------------
// Verbatim Templates (Section 6 ROUTER_SPEC.md)
// ---------------------------------------------------------------------------

export const TPL_LANG =
  'Mình hỗ trợ bằng tiếng Việt. Bạn vui lòng nhắn lại bằng tiếng Việt (có dấu hoặc không dấu đều được) nhé.';

export const TPL_REFUSE_STANDARD =
  'Xin lỗi, thông tin này vượt quá quyền truy cập của bạn. Vui lòng liên hệ phòng HR hoặc quản trị viên.';

export const TPL_NOT_SELF =
  'Xin lỗi, tôi chỉ có thể tạo đơn cho chính tài khoản của bạn. Vui lòng thao tác tại mục Đơn từ & Phê duyệt hoặc liên hệ phòng HR.';

export function TPL_NO_APPROVE(pendingApprovalCount: number | null): string {
  if (pendingApprovalCount !== null && Number.isFinite(pendingApprovalCount)) {
    return `Tôi không thể duyệt hay từ chối đơn. Hiện có ${pendingApprovalCount} đơn đang chờ bạn tại mục Đơn từ & Phê duyệt.`;
  }
  return 'Tôi không thể duyệt hay từ chối đơn. Vui lòng thao tác tại mục Đơn từ & Phê duyệt.';
}

export const TPL_CLICK_SUBMIT =
  'Bạn bấm nút Gửi đơn trên thẻ xem trước để xác nhận, tôi không tự gửi đơn.';

export const TPL_NO_DRAFT = 'Hiện bạn chưa có đơn nháp nào.';

export const TPL_BAD_REASON =
  'Phần lý do vừa rồi không phải lý do nghỉ nên tôi không ghi vào đơn. Bạn muốn ghi lý do nào khác (hoặc nhắn: không có lý do)?';

export function TPL_CAN_CREATE(leaveAvailable: number): string {
  return `Bạn có thể tạo đơn nghỉ phép. Phép khả dụng của bạn: ${leaveAvailable} ngày. Bạn nhắn ví dụ: xin nghỉ phép từ 30/11 đến 02/12.`;
}

export function TPL_RESIGN_GUIDE(noticeDays: number | null): string {
  if (noticeDays !== null && Number.isFinite(noticeDays)) {
    return `Đơn thôi việc được thực hiện tại mục Nghỉ việc & Tất toán. Theo hợp đồng hiện hành của bạn, thời hạn báo trước tối thiểu là ${noticeDays} ngày.`;
  }
  return 'Đơn thôi việc được thực hiện tại mục Nghỉ việc & Tất toán. Bạn vui lòng liên hệ phòng HR để biết thời hạn báo trước.';
}

export function TPL_PREVIEW(preview: DraftPreview): string {
  if (preview.type === 'attendance_explanation') {
    const inStr = preview.actualIn || '08:30';
    const outStr = preview.actualOut || '17:30';
    const expLeft = preview.explanationsLeft ?? 0;
    return `Mình đã soạn nháp: ${preview.typeLabel}, ${preview.dateText}, giờ vào ${inStr} / ra ${outStr}, lý do: ${preview.reason}, số lần giải trình còn lại: ${expLeft} lần. Bạn kiểm tra rồi bấm Gửi đơn để xác nhận, hoặc Sửa / Hủy nháp.`;
  }
  if (preview.type === 'overtime') {
    const hrs = preview.hours ?? 0;
    const mult = preview.otMultiplier ?? HRM_CONFIG.OT_MULTIPLIER_WEEKDAY;
    return `Mình đã soạn nháp: ${preview.typeLabel}, ${preview.dateText}, ${hrs} giờ, hệ số OT: ${mult}x, lý do: ${preview.reason}. Bạn kiểm tra rồi bấm Gửi đơn để xác nhận, hoặc Sửa / Hủy nháp.`;
  }
  const balanceSegment =
    preview.balanceAfter !== null && preview.balanceAfter !== undefined
      ? `, phép còn lại sau khi nghỉ: ${preview.balanceAfter} ngày`
      : '';
  return `Mình đã soạn nháp: ${preview.typeLabel}, ${preview.dateText}, ${preview.days ?? 1} ngày, lý do: ${preview.reason}${balanceSegment}. Bạn kiểm tra rồi bấm Gửi đơn để xác nhận, hoặc Sửa / Hủy nháp.`;
}

export const TPL_ASK_SESSION = 'Bạn nghỉ cả ngày hay nửa ngày (sáng/chiều)?';

export const TPL_ASK_TYPE_DATES =
  'Bạn muốn xin loại nghỉ nào (phép năm, không lương, ốm) và nghỉ ngày nào?';

export const TPL_DRAFT_EXISTS =
  'Bạn đang có một nháp. Hủy nháp cũ để tạo nháp mới?';

export const TPL_DRAFT_CANCELLED =
  'Mình đã hủy nháp. Bạn cần soạn đơn khác không?';

export const TPL_DRAFT_EXPIRED =
  'Nháp đã hết hạn sau 10 phút. Bạn nhắn lại yêu cầu để mình soạn nháp mới nhé.';

export function TPL_SUBMITTED(params: {
  requestCode: string;
  nextApprover: string;
}): string {
  return `Đơn ${params.requestCode} đã được gửi. Người duyệt tiếp theo: ${params.nextApprover}.`;
}

export const TPL_CLARIFY_SELF_OR_OTHER =
  'Bạn muốn tạo đơn cho mình hay cho người khác?';

export const TPL_ERR_MISSING_FIELD_MESSAGES: Record<string, string> = {
  type: TPL_ASK_TYPE_DATES,
  startDate: 'Bạn muốn nghỉ từ ngày nào?',
  dates: 'Bạn muốn nghỉ từ ngày nào?',
  session: TPL_ASK_SESSION,
  workDate: 'Bạn muốn giải trình hoặc đăng ký cho ngày nào?',
  otTime: 'Bạn muốn đăng ký làm thêm giờ từ mấy giờ đến mấy giờ?',
  reason: 'Bạn vui lòng cho biết lý do của đơn này nhé.',
};

export function TPL_VALIDATION_ERROR(err: ValidationError): string {
  switch (err.code) {
    case 'INSUFFICIENT_BALANCE': {
      const avail = err.availableDays ?? 0;
      const req = err.requestedDays ?? 0;
      const unpaid = err.unpaidDays ?? Math.max(0, req - avail);
      return `Bạn chỉ còn **${avail} ngày** phép năm khả dụng (đang xin **${req} ngày**). Bạn muốn chọn phương án nào:\n• **(1)** Tạo 2 nháp: ${avail} ngày phép năm + ${unpaid} ngày nghỉ không lương\n• **(2)** Rút ngắn số ngày nghỉ\nNhắn 1 hoặc 2 giúp mình nhé.`;
    }
    case 'OVERLAP': {
      const code = err.conflictCode || 'đã có';
      const dateInfo = err.conflictDateText ? ` (${err.conflictDateText})` : '';
      return `Bạn đã có đơn ${code}${dateInfo} trùng thời gian này. Bạn có muốn hủy đơn cũ để tạo đơn mới không? (Nhắn Có hoặc Không)`;
    }
    case 'PAST_DEADLINE':
      return err.message || 'Ngày yêu cầu đã quá thời hạn nộp đơn theo quy định.';
    case 'TIMESHEET_LOCKED':
      return err.message || 'Bảng công kỳ này đã khóa, không thể tạo hoặc chỉnh sửa đơn.';
    case 'EXPLAIN_LIMIT':
      return err.message || 'Bạn đã dùng hết số lần giải trình chấm công trong tháng này.';
    case 'OT_NOT_ELIGIBLE':
      return err.message || 'Tài khoản của bạn hiện không thuộc diện đăng ký làm thêm giờ (OT).';
    case 'INVALID_DATE_RANGE':
      return err.message || 'Khoảng ngày hoặc khung giờ không hợp lệ. Bạn vui lòng kiểm tra lại.';
    case 'MISSING_FIELD':
      return (
        (err.field && TPL_ERR_MISSING_FIELD_MESSAGES[err.field]) ||
        err.message ||
        TPL_ASK_TYPE_DATES
      );
  }
}

export const TPL_RATE_LIMIT_DRAFTS =
  'Bạn đã đạt giới hạn tối đa 5 nháp trong 1 giờ. Vui lòng gửi hoặc hủy nháp hiện có, hoặc thử lại sau nhé.';

export const TPL_BAD_HANDOVER =
  'Tên người nhận bàn giao chưa hợp lệ. Bạn vui lòng nhập họ tên hoặc mã nhân viên đồng nghiệp (hoặc bỏ qua nếu chưa chỉ định).';

export const TPL_ASK_HANDOVER_CHOICE =
  'Mình tìm thấy nhiều đồng nghiệp trùng tên. Bạn chọn số thứ tự tương ứng nhé:';

export const TPL_CANCEL_CONFIRM_GUIDE =
  'Mình đã chuẩn bị yêu cầu hủy đơn. Bạn kiểm tra và bấm nút Xác nhận hủy đơn trên thẻ bên dưới nhé.';

// ---------------------------------------------------------------------------
// Constants & State Store (10-minute TTL, 5 drafts/hour rate limit)
// ---------------------------------------------------------------------------

export const DRAFT_TTL_MS = 10 * 60 * 1000;
export const DRAFT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const DRAFT_RATE_LIMIT_MAX = 5;

function createEmptyRouterState(userId: string, nowMs: number, prevTimestamps: number[] = []): RouterState {
  const cutoff = nowMs - DRAFT_RATE_LIMIT_WINDOW_MS;
  return {
    userId,
    status: 'IDLE',
    slots: {},
    drafts: [],
    cardKind: null,
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + DRAFT_TTL_MS,
    awaitingSelfConfirm: false,
    pendingInsufficientSplit: null,
    pendingOverlapConflict: null,
    pendingHandoverQuery: false,
    handoverCandidates: null,
    pendingDraftReplace: null,
    unclearStreak: 0,
    draftCreatedTimestampsMs: prevTimestamps.filter((ts) => ts >= cutoff),
  };
}

export function createInMemoryRouterStateStore(): RouterStateStore {
  const map = new Map<string, RouterState>();

  const pruneTimestamps = (timestamps: number[], nowMs: number): number[] => {
    const cutoff = nowMs - DRAFT_RATE_LIMIT_WINDOW_MS;
    return timestamps.filter((ts) => Number.isFinite(ts) && ts >= cutoff);
  };

  return {
    get(userId: string, nowMs = Date.now()): RouterState {
      const existing = map.get(userId);
      if (!existing) {
        const fresh = createEmptyRouterState(userId, nowMs);
        map.set(userId, fresh);
        return fresh;
      }
      return existing;
    },
    set(userId: string, state: RouterState): void {
      map.set(userId, state);
    },
    reset(userId: string, nowMs = Date.now()): RouterState {
      const prev = map.get(userId);
      const fresh = createEmptyRouterState(
        userId,
        nowMs,
        prev?.draftCreatedTimestampsMs ?? []
      );
      map.set(userId, fresh);
      return fresh;
    },
    canCreateDraft(userId: string, nowMs: number, neededCount = 1): boolean {
      const st = map.get(userId);
      const active = pruneTimestamps(st?.draftCreatedTimestampsMs ?? [], nowMs);
      return active.length + neededCount <= DRAFT_RATE_LIMIT_MAX;
    },
    recordDraftCreated(userId: string, nowMs: number, count = 1): void {
      const st = map.get(userId) ?? createEmptyRouterState(userId, nowMs);
      const active = pruneTimestamps(st.draftCreatedTimestampsMs, nowMs);
      for (let i = 0; i < count; i += 1) {
        active.push(nowMs);
      }
      st.draftCreatedTimestampsMs = active;
      map.set(userId, st);
    },
  };
}

const DEFAULT_ROUTER_STORE = createInMemoryRouterStateStore();

// ---------------------------------------------------------------------------
// Text Normalization & Date/Slot Extraction
// ---------------------------------------------------------------------------

export function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

const TOKEN_EXPANSIONS: Record<string, string> = {
  ko: 'khong',
  k: 'khong',
  hok: 'khong',
  hong: 'khong',
  dc: 'duoc',
  t: 'toi',
  tui: 'toi',
  nv: 'nhan vien',
  ntn: 'nhu the nao',
  sdt: 'so dien thoai',
  cty: 'cong ty',
  bhxh: 'bao hiem xa hoi',
  np: 'nghi phep',
  ql: 'quan ly',
  hnay: 'hom nay',
};

const TAO_VERB_FOLLOWERS = new Set([
  'don',
  'nhap',
  'nghi',
  'ot',
  'giai',
  'xin',
  'giup',
  'ho',
  'thay',
  'moi',
  'lai',
  'them',
  'phep',
  'duoc',
  'dc',
  'ra',
  'cho',
  'nhanh',
  'mot',
  '1',
  'hai',
  '2',
]);

const TAO_VERB_PRECEDERS = new Set([
  'co',
  'muon',
  'can',
  'dang',
  'se',
  'khong',
  'ko',
  'k',
  'de',
  'giup',
  'hay',
]);

export function normalizeRouterText(raw: string): string {
  const ascii = stripDiacritics(raw)
    .toLowerCase()
    .replace(/['"`~!@#$%^&*()+=[\]{};:,.<>/?\\|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!ascii) return '';

  const rawTokens = ascii.split(' ');
  const out: string[] = [];

  for (let i = 0; i < rawTokens.length; i += 1) {
    const tok = rawTokens[i];
    if (!tok) continue;
    // Drop standalone "m" only at start of sentence (e.g. "m tao don...")
    if (i === 0 && tok === 'm' && rawTokens.length > 1) {
      continue;
    }
    // Only convert pronoun "tao" -> "toi"; preserve verb "tao don" / "co tao duoc..."
    if (tok === 'tao') {
      const prev = rawTokens[i - 1] || '';
      const next = rawTokens[i + 1] || '';
      if (TAO_VERB_FOLLOWERS.has(next) || TAO_VERB_PRECEDERS.has(prev)) {
        out.push('tao');
      } else {
        out.push('toi');
      }
      continue;
    }
    const expanded = Object.hasOwn(TOKEN_EXPANSIONS, tok)
      ? TOKEN_EXPANSIONS[tok]
      : undefined;
    if (expanded) {
      out.push(...expanded.split(' '));
    } else {
      out.push(tok);
    }
  }

  return out.join(' ').trim();
}

const SPOOFED_TAG_ANYWHERE_REGEX =
  /\[\/?\s*(?:role|vai\s*tro|system|he\s*thong|admin|context)(?:\s*[:=][^\]]*)?\s*\]/i;
const SPOOFED_ROLE_PREFIX_REGEX =
  /^\s*\[\/?\s*(?:role|vai\s*tro|system|he\s*thong|admin|context)(?:\s*[:=][^\]]*)?\s*\]\s*/i;

function stripSpoofedRolePrefixWithFlag(raw: string): {
  unspoofedRaw: string;
  hadSpoofedRolePrefix: boolean;
} {
  const input = raw || '';
  const hadSpoofedRolePrefix = SPOOFED_TAG_ANYWHERE_REGEX.test(input);
  const unspoofedRaw = input.replace(SPOOFED_ROLE_PREFIX_REGEX, '').trim();
  return { unspoofedRaw, hadSpoofedRolePrefix };
}

function stripSpoofedRolePrefix(raw: string): string {
  return stripSpoofedRolePrefixWithFlag(raw).unspoofedRaw;
}

function getVnTodayIso(nowMs: number): string {
  const vnMs = nowMs + 7 * 60 * 60 * 1000;
  const d = new Date(vnMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 2024 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function formatIsoToYmd(y: number, m: number, d: number): string | null {
  if (!isValidYmd(y, m, d)) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function resolveDayInMonth(year: number, month: number, day: number): string | null {
  return formatIsoToYmd(year, month, day);
}

function resolveEndDayAfterStart(startIso: string, endDay: number): string | null {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  if (!sy || !sm || !sd) return null;
  if (endDay >= sd) {
    return resolveDayInMonth(sy, sm, endDay);
  }
  const nextMonth = sm === 12 ? 1 : sm + 1;
  const nextYear = sm === 12 ? sy + 1 : sy;
  return resolveDayInMonth(nextYear, nextMonth, endDay);
}

function getNextWeekdayIso(todayIso: string, targetDow: number, forceNextWeek: boolean): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const currentDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const curMon = currentDow === 0 ? 7 : currentDow; // 1=Mon..7=Sun
  const tgtMon = targetDow === 0 ? 7 : targetDow;
  let diff = tgtMon - curMon;
  if (forceNextWeek) {
    diff = 7 - curMon + tgtMon;
  } else if (diff <= 0) {
    diff += 7;
  }
  return addDaysIso(todayIso, diff);
}

interface ExtractedDates {
  startDate?: string;
  endDate?: string;
  days?: number;
  durationLabel?: string;
  workDate?: string;
  hasExplicitDateMention: boolean;
}

function extractDates(raw: string, norm: string, nowMs: number): ExtractedDates {
  const todayIso = getVnTodayIso(nowMs);
  const currentYear = Number(todayIso.slice(0, 4));
  const currentMonth = Number(todayIso.slice(5, 7));
  const rawAscii = stripDiacritics(raw).toLowerCase();
  const foundDates: string[] = [];

  // 1. Explicit dd/mm(/yyyy) or dd-mm(-yyyy)
  const dateRegex = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/g;
  let match: RegExpExecArray | null;
  while ((match = dateRegex.exec(raw)) !== null) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = match[3] ? Number(match[3]) : currentYear;
    if (year < 100) year += 2000;
    const iso = formatIsoToYmd(year, month, day);
    if (iso) foundDates.push(iso);
  }

  // 2. Relative day keywords
  if (/\b(hom qua)\b/.test(norm)) {
    foundDates.push(addDaysIso(todayIso, -1));
  }
  if (/\b(ngay mai|mai)\b/.test(norm)) {
    foundDates.push(addDaysIso(todayIso, 1));
  }
  if (/\b(ngay kia|mot)\b/.test(norm)) {
    foundDates.push(addDaysIso(todayIso, 2));
  }
  if (/\b(hom nay|toi nay|chieu nay|sang nay)\b/.test(norm)) {
    foundDates.push(todayIso);
  }

  // 3. Weekday ("thu hai (tuan sau)", "chu nhat", "t2".."t7", "cn")
  const weekdayMap: Array<{ re: RegExp; dow: number }> = [
    { re: /\b(?:thu\s*(?:hai|2)|t2)\b/, dow: 1 },
    { re: /\b(?:thu\s*(?:ba|3)|t3)\b/, dow: 2 },
    { re: /\b(?:thu\s*(?:tu|4)|t4)\b/, dow: 3 },
    { re: /\b(?:thu\s*(?:nam|5)|t5)\b/, dow: 4 },
    { re: /\b(?:thu\s*(?:sau|6)|t6)\b/, dow: 5 },
    { re: /\b(?:thu\s*(?:bay|7)|t7)\b/, dow: 6 },
    { re: /\b(?:chu\s*nhat|cn)\b/, dow: 0 },
  ];
  const forceNextWeek = /\btuan sau|tuan toi\b/.test(norm);
  for (const w of weekdayMap) {
    if (w.re.test(norm)) {
      foundDates.push(getNextWeekdayIso(todayIso, w.dow, forceNextWeek));
    }
  }

  // 4. Duration: N ngày / nửa ngày / nửa tháng / N tháng / N tuần
  let explicitDays: number | undefined;
  let durationLabel: string | undefined;
  const rawAsciiCompact = rawAscii.replace(/\s+/g, ' ');
  const daysMatch = norm.match(/\b(\d+(?:[.,]5)?)\s*ngay\b/);
  if (daysMatch?.[1]) {
    const parsed = Number(daysMatch[1].replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 365) {
      explicitDays = parsed;
    }
  } else if (/\bnua ngay\b/.test(norm)) {
    explicitDays = 0.5;
  } else if (/\bnua\s+thang\b/.test(rawAsciiCompact)) {
    explicitDays = 15;
    durationLabel = 'nửa tháng (15 ngày)';
  } else {
    const monthsMatch = rawAsciiCompact.match(
      /(?<!\b(?:ngay|mung|m)\s+)(?<![\/\-\:\d])\b(\d+(?:[.,]5)?)\s*thang\b(?!\s+(?:\d{1,2}|sau|toi|nay|truoc)\b)/
    );
    if (monthsMatch?.[1]) {
      const n = Number(monthsMatch[1].replace(',', '.'));
      const computed = Math.round(n * 30);
      if (Number.isFinite(computed) && computed > 0 && computed <= 365) {
        explicitDays = computed;
        durationLabel = `${monthsMatch[1].replace('.', ',')} tháng (${computed} ngày)`;
      }
    } else {
      const weeksMatch = rawAsciiCompact.match(
        /(?<!\bthu\s+)(?<![\/\-\:\d])\b(\d+(?:[.,]5)?)\s*tuan\b(?!\s+(?:sau|toi|nay|truoc)\b)/
      );
      if (weeksMatch?.[1]) {
        const n = Number(weeksMatch[1].replace(',', '.'));
        const computed = Math.round(n * 7);
        if (Number.isFinite(computed) && computed > 0 && computed <= 365) {
          explicitDays = computed;
          durationLabel = `${weeksMatch[1].replace('.', ',')} tuần (${computed} ngày)`;
        }
      }
    }
  }

  let startDate: string | undefined;
  let endDate: string | undefined;

  if (foundDates.length >= 2) {
    startDate = foundDates[0];
    endDate = foundDates[1];
  } else if (foundDates.length === 1) {
    startDate = foundDates[0];
    // Pattern 1: Start already parsed + trailing "den/toi [ngay] D" (e.g. "hom nay den 30")
    const endDayTailMatch = rawAscii.match(
      /\b(?:den|toi)\s+(?:ngay\s+)?(\d{1,2})(?![\/\-\:\d]|h\b|g\b|gio\b|thang\b|ngay\b)/
    );
    if (endDayTailMatch?.[1]) {
      const resolvedEnd = resolveEndDayAfterStart(startDate, Number(endDayTailMatch[1]));
      if (resolvedEnd) {
        endDate = resolvedEnd;
      }
    }
    if (!endDate) {
      if (explicitDays && explicitDays >= 1) {
        endDate = addDaysIso(startDate, Math.ceil(explicitDays) - 1);
      } else {
        endDate = startDate;
      }
    }
  } else {
    // Pattern 2: "[tu] [ngay] D1 den/toi [ngay] D2" (e.g. "tu 27 den 30", "28 den 2")
    const pairToMatch = rawAscii.match(
      /(?:^|[^\/\-\:\d])(?:tu\s+)?(?:ngay\s+)?(\d{1,2})\s+(?:den|toi)\s+(?:ngay\s+)?(\d{1,2})(?![\/\-\:\d]|h\b|g\b|gio\b|thang\b|ngay\b)/
    );
    if (pairToMatch?.[1] && pairToMatch?.[2]) {
      const sIso = resolveDayInMonth(currentYear, currentMonth, Number(pairToMatch[1]));
      const eIso = sIso ? resolveEndDayAfterStart(sIso, Number(pairToMatch[2])) : null;
      if (sIso && eIso) {
        startDate = sIso;
        endDate = eIso;
      }
    }

    // Pattern 3: Hyphen range "D1-D2" or "D1 - D2" (only when d2 > 12 or has space around '-')
    if (!startDate) {
      const hyphenMatch = rawAscii.match(
        /(?:^|[^\/\-\:\dA-Za-z])(\d{1,2})(\s*-\s*)(\d{1,2})(?![\/\-\:\d]|h\b|g\b|gio\b|thang\b|ngay\b)/
      );
      if (hyphenMatch?.[1] && hyphenMatch?.[3]) {
        const d1 = Number(hyphenMatch[1]);
        const d2 = Number(hyphenMatch[3]);
        const hasSpace = /\s/.test(hyphenMatch[2]);
        if (d2 > 12 || hasSpace) {
          const sIso = resolveDayInMonth(currentYear, currentMonth, d1);
          const eIso = sIso ? resolveEndDayAfterStart(sIso, d2) : null;
          if (sIso && eIso) {
            startDate = sIso;
            endDate = eIso;
          }
        }
      }
    }

    // Pattern 4: Single day with "ngay D" prefix (e.g. "ngay 30")
    if (!startDate) {
      const singleDayMatch = rawAscii.match(
        /(?:^|[^\/\-\:\d])\bngay\s+(\d{1,2})(?![\/\-\:\d]|h\b|g\b|gio\b|thang\b|ngay\b)/
      );
      if (singleDayMatch?.[1]) {
        const sIso = resolveDayInMonth(currentYear, currentMonth, Number(singleDayMatch[1]));
        if (sIso) {
          startDate = sIso;
          endDate =
            explicitDays && explicitDays >= 1
              ? addDaysIso(sIso, Math.ceil(explicitDays) - 1)
              : sIso;
        }
      }
    }
  }

  return {
    startDate,
    endDate,
    days: explicitDays,
    durationLabel,
    workDate: startDate,
    hasExplicitDateMention: Boolean(startDate) || explicitDays !== undefined,
  };
}

function extractSession(norm: string): Session | undefined {
  if (/\bca ngay|nguyen ngay|full day|full\b/.test(norm)) return 'full';
  if (/\bbuoi sang|nua ngay sang|nghi sang\b/.test(norm) || /^sang$/.test(norm)) return 'am';
  if (/\bbuoi chieu|nua ngay chieu|nghi chieu\b/.test(norm) || /^chieu$/.test(norm)) return 'pm';
  return undefined;
}

function formatTimeHm(hourStr: string, minStr?: string): string | null {
  const h = Number(hourStr);
  const m = minStr ? Number(minStr) : 0;
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function extractTimes(raw: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{1,2})\s*(?:h|:|g)\s*(\d{2})?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    // Avoid matching date parts like 24/11
    const hm = formatTimeHm(m[1], m[2]);
    if (hm) out.push(hm);
  }
  return out;
}

function cleanRawReason(reason: string): string {
  return reason
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/^[\s,.:;-]+|[\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function extractReason(raw: string, intent: 'leave' | 'attendance' | 'overtime'): string | undefined {
  // Explicit "lý do:" / "ly do" / "vì"
  const explicitMatch = raw.match(/(?:lý\s*do|ly\s*do)\s*[:\-]?\s*(.+)$/i);
  if (explicitMatch?.[1]) {
    const cleaned = cleanRawReason(explicitMatch[1]);
    if (cleaned) return cleaned;
  }

  const becauseMatch = raw.match(/\b(?:vì|do)\s+([^,.;]+(?:\s+[^,.;]+)*)$/i);
  if (becauseMatch?.[1] && intent === 'leave') {
    const cleaned = cleanRawReason(becauseMatch[1]);
    if (cleaned && !/^(?:\d|ngay|mai|hom)/i.test(stripDiacritics(cleaned))) {
      return cleaned;
    }
  }

  if (intent === 'leave') {
    // Trailing comma clause like "... từ 30/11 đến 02/12, việc gia đình."
    const parts = raw.split(',');
    if (parts.length >= 2) {
      const tail = cleanRawReason(parts[parts.length - 1]);
      const tailNorm = stripDiacritics(tail).toLowerCase();
      if (
        tail &&
        tail.length >= 3 &&
        !/^(?:tu|den|ngay|ban giao|cho)\b/.test(tailNorm) &&
        !/\d{1,2}\/\d{1,2}/.test(tail)
      ) {
        return tail;
      }
    }
  }

  if (intent === 'attendance') {
    const forgetMatch = raw.match(/(quên\s+chấm[^,.;]+|quen\s+cham[^,.;]+|thiếu\s+chấm[^,.;]+|thieu\s+cham[^,.;]+)/i);
    if (forgetMatch?.[1]) {
      return cleanRawReason(forgetMatch[1]);
    }
  }

  if (intent === 'overtime') {
    // Capture text after the LAST time expression (e.g. "từ 18h đến 20h làm báo cáo" -> "làm báo cáo")
    const timeGlobal = /\b\d{1,2}\s*(?:h|:|g)\s*\d{0,2}\b/gi;
    let lastEnd = -1;
    let tm: RegExpExecArray | null;
    while ((tm = timeGlobal.exec(raw)) !== null) {
      lastEnd = tm.index + tm[0].length;
    }
    if (lastEnd > 0 && lastEnd < raw.length) {
      const candidate = raw
        .slice(lastEnd)
        .replace(/^(?:\s|,|;|-|để|de|vì|vi)+/i, '')
        .trim();
      const cleaned = cleanRawReason(candidate);
      if (cleaned && cleaned.length >= 2) return cleaned;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Guards: Injection, Self-Only, No-Approve, Handover
// ---------------------------------------------------------------------------

const INJECTION_PATTERN =
  /\b(?:bo qua|ignore|quy tac|instructions?|system|prompt|jailbreak|developer\s+mode|lenh\s+tu|da\s+nang\s+quyen|gui\s+(?:ngay|di|luon)|duyet\s+(?:luon|ngay))\b/i;

const STANDALONE_INJECTION_PATTERN =
  /\b(?:ignore\s+(?:all\s+)?(?:previous|prior|above)?\s*instructions?|system\s+prompt|jailbreak|bo\s+qua\s+(?:moi\s+)?quy\s+tac|da\s+nang\s+quyen|show\s+all\s+salaries|hien\s+thi\s+(?:tat\s+ca\s+)?luong|tat\s+ca\s+bang\s+luong)\b/i;

export function isReasonInjection(raw: string): boolean {
  const reasonSection =
    raw.match(/(?:lý\s*do|ly\s*do)\s*[:\-]?\s*(.+)$/i)?.[1] ||
    raw.match(/\bvì\s+(.+)$/i)?.[1] ||
    '';
  if (reasonSection) {
    const normReason = stripDiacritics(reasonSection).toLowerCase();
    if (INJECTION_PATTERN.test(normReason)) return true;
  }
  const normFull = stripDiacritics(raw).toLowerCase();
  if (
    /\b(?:tao|xin|dang ky|lam)\b/.test(normFull) &&
    /\b(?:bo qua|ignore|system\s+prompt|jailbreak|duyet\s+(?:luon|ngay)|gui\s+(?:ngay|luon))\b/.test(
      normFull
    )
  ) {
    return true;
  }
  return false;
}

function isRequestIntentText(norm: string): boolean {
  return (
    /\b(?:tao|lam|xin|dang\s+k[yi]|viet|soan|giai\s+trinh)\b/.test(norm) &&
    /\b(?:don|nghi|phep|ot|lam\s+them|tang\s+ca|cham\s+cong|van\s+tay|giai\s+trinh)\b/.test(norm)
  );
}

const CAPITALIZED_NON_NAME_EXCLUSIONS = new Set([
  'ngay',
  'ngày',
  'tuan',
  'tuần',
  'thang',
  'tháng',
  'năm',
  'hom',
  'hôm',
  'buoi',
  'buổi',
  'sang',
  'sáng',
  'chieu',
  'chiều',
  'tối',
  'mình',
  'tôi',
  'tui',
  'em',
  'anh',
  'chị',
  'bạn',
  'cả',
  'nửa',
]);

const LOWERCASE_PRONOUN_EXCLUSIONS = new Set([
  'ngay',
  'tuan',
  'thang',
  'nam',
  'hom',
  'buoi',
  'sang',
  'chieu',
  'toi',
  'minh',
  'tui',
  'em',
  'anh',
  'chi',
  'ban',
  'ca',
  'nua',
]);

function checkTargetPerson(raw: string, norm: string): 'SELF' | 'OTHER' | 'AMBIGUOUS_PRONOUN' {
  // Check explicit handover context so "bàn giao cho Minh" is NOT treated as creating for Minh
  const rawWithoutHandover = raw.replace(/\bbàn\s*giao\s+cho\s+[^,.;]+/gi, '').replace(/\bban\s*giao\s+cho\s+[^,.;]+/gi, '');
  const normWithoutHandover = normalizeRouterText(rawWithoutHandover);

  // Explicit employee code NV-XXXX-XXX
  if (/\b(?:cho|giup|ho|thay)\s+nv[- ]?\d+/i.test(normWithoutHandover)) {
    return 'OTHER';
  }
  // Explicit "sếp", "đồng nghiệp", "nhân viên", "người khác"
  if (
    /\b(?:cho|giup|ho|thay)\s+(?:sep|dong\s+nghiep|nhan\s+vien|nguoi\s+khac|ban\s+be|cap\s+duoi|truong\s+phong|giam\s+doc)\b/.test(
      normWithoutHandover
    )
  ) {
    return 'OTHER';
  }
  // "(cho|giúp|hộ|thay) (anh|chị|em|bạn) <CapitalizedName>" or "(cho|giúp|hộ|thay) <CapitalizedName>"
  const capMatch = rawWithoutHandover.match(
    /(?:^|[\s,.;])(?:cho|giúp|giup|hộ|ho|thay)\s+(?:(?:anh|chị|chi|em|bạn|ban|sếp|sep)\s+)?([^\s,.;!?0-9]+)/i
  );
  if (capMatch?.[1]) {
    const rawToken = capMatch[1];
    const firstChar = rawToken.charAt(0);
    const isCapitalized =
      firstChar !== firstChar.toLowerCase() &&
      /^[A-Z]/.test(stripDiacritics(firstChar));
    const lowerToken = rawToken.toLowerCase();
    const nameTokenNorm = stripDiacritics(rawToken).toLowerCase();
    if (
      isCapitalized &&
      nameTokenNorm.length >= 2 &&
      !CAPITALIZED_NON_NAME_EXCLUSIONS.has(lowerToken)
    ) {
      return 'OTHER';
    }
  }
  // Also catch uncapitalized "(hộ|thay) <word>"
  const hoThayMatch = normWithoutHandover.match(/\b(?:ho|thay)\s+([a-z]{2,15})\b/);
  if (hoThayMatch?.[1] && !LOWERCASE_PRONOUN_EXCLUSIONS.has(hoThayMatch[1])) {
    return 'OTHER';
  }
  // Standalone pronoun: "(cho|giúp|hộ|thay) (em|anh|chị)" without capitalized name (Case A2)
  if (/\b(?:cho|giup|ho|thay)\s+(?:em|anh|chi)\b(?:\s*$|\s+(?:voi|nhe|nha|di|ngay|tu|hom|nua|ca)\b)/.test(normWithoutHandover)) {
    return 'AMBIGUOUS_PRONOUN';
  }
  return 'SELF';
}

function isApproveRequestIntent(norm: string): boolean {
  if (!/\b(?:duyet|phe\s+duyet|tu\s+choi|approve|reject)\b/.test(norm)) return false;

  // 1. Explicit imperative command to approve/reject must ALWAYS be blocked with TPL_NO_APPROVE
  const isExplicitActionCommand =
    /^(?:(?:hay|vui\s+long|giup\s+(?:toi|minh|em)|ban|bot)\s+)*(?:duyet|phe\s+duyet|tu\s+choi|approve|reject)\b/.test(
      norm
    ) ||
    /\b(?:duyet|phe\s+duyet|tu\s+choi|approve|reject)\s+(?:luon|ngay|het|tat\s+ca|giup|ho|cho|this|my|all)\b/.test(
      norm
    );
  if (isExplicitActionCommand) {
    return true;
  }

  // 2. Informational questions about who approves or approval policy must go to model/data
  if (
    /\bai\s+(?:la\s+nguoi\s+)?(?:duyet|phe\s+duyet)\b/.test(norm) ||
    /\b(?:quy\s+trinh|quy\s+dinh|chinh\s+sach|thoi\s+gian|bao\s+lau|nhu\s+the\s+nao)\b/.test(norm)
  ) {
    return false;
  }

  return /\b(?:don|nhom|het|luon|giup|ho|cho|tat\s+ca|cac\s+don|nghi|ot|request|leave)\b/.test(norm);
}

interface HandoverExtractResult {
  hasHandoverMention: boolean;
  invalidChars: boolean;
  queryName?: string;
}

function extractHandoverMention(raw: string): HandoverExtractResult {
  const m = raw.match(/\b(?:bàn\s*giao|ban\s*giao)\s*(?:cho|lại\s+cho|lai\s+cho)?\s*[:\-]?\s*([^,.;]+)/i);
  if (!m) {
    return { hasHandoverMention: false, invalidChars: false };
  }
  const candidate = m[1].trim();
  const letters = stripDiacritics(candidate).match(/[A-Za-z]/g) || [];
  if (letters.length < 2) {
    return { hasHandoverMention: true, invalidChars: true };
  }
  return {
    hasHandoverMention: true,
    invalidChars: false,
    queryName: candidate,
  };
}

// ---------------------------------------------------------------------------
// Smalltalk, Out-of-Scope, Non-Vietnamese Classification (Exact Order)
// ---------------------------------------------------------------------------

function stripPoliteTail(norm: string): string {
  return norm
    .replace(/\b(?:nhe|nha|a|ạ|oi|voi|di|giup\s+minh|giup\s+toi|giup|pls|please)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function renderSmalltalkReply(
  category: SmalltalkCategory,
  sessionUser: RouterSessionUser,
  personalize = false,
  seedText = '',
  nowMs = Date.now(),
  opts?: { lastAssistantMessage?: string }
): string {
  const mappedGroup: SmalltalkGroupId =
    category === 'bye'
      ? 'goodbye'
      : category === 'who_are_you'
        ? 'about_bot'
        : category;
  return renderSmalltalkGroupReply({
    group: mappedGroup,
    user: sessionUser,
    personalize,
    seedText,
    nowMs,
    lastAssistantMessage: opts?.lastAssistantMessage,
  });
}

function matchSmalltalkOrOutOfScope(
  raw: string,
  norm: string,
  user: RouterSessionUser,
  options: {
    allowAck: boolean;
    personalizeSmalltalk: boolean;
    nowMs?: number;
    hadSpoofedRolePrefix?: boolean;
    lastAssistantMessage?: string;
  } = {
    allowAck: false,
    personalizeSmalltalk: false,
  }
): {
  text: string;
  templateId: string;
  intent: string;
  isSmalltalk: boolean;
  hideCitation: boolean;
  smalltalkCategory?: SmalltalkCategory;
  smalltalkGroup?: SmalltalkGroupId;
} | null {
  const {
    allowAck,
    personalizeSmalltalk,
    nowMs = Date.now(),
    hadSpoofedRolePrefix = false,
    lastAssistantMessage,
  } = options;
  const restrictedSignal = isPotentialRestrictedDataQuery(raw);

  // 1-14 (+ who_am_i): Delegate to 14-group smalltalk dataset
  const matched = matchSmalltalkDataset(raw, user, {
    allowAckAndDecline: allowAck,
    personalizeSmalltalk,
    nowMs,
    hadSpoofedRolePrefix,
    isRestrictedQuery: restrictedSignal,
    lastAssistantMessage,
  });
  if (matched) {
    return {
      text: matched.text,
      templateId: matched.templateId,
      intent: matched.intent,
      isSmalltalk: true,
      hideCitation: true,
      smalltalkCategory: matched.group,
      smalltalkGroup: matched.group,
    };
  }

  // Broader OFF_TOPIC (Must run BEFORE LANG_EN; never swallow restricted HRM queries)
  if (
    !restrictedSignal &&
    /\b(?:weather|thoi\s+tiet|troi\s+mua|nang\s+khong|nhiet\s+do|joke|chuyen\s+cuoi|ke\s+chuyen|bong\s+da|football|soccer|world\s+cup|bitcoin|crypto|chung\s+khoan|stock|gia\s+vang|nau\s+an|recipe|mon\s+ngon|phim\s+hay|movie|nghe\s+nhac|song|bai\s+hat|lam\s+tho|poem|viet\s+code|python|javascript|giai\s+toan|thu\s+do\s+cua|capital\s+of|president\s+of)\b/.test(
      norm
    )
  ) {
    return {
      text: TPL_OFF_TOPIC,
      templateId: 'TPL_OFF_TOPIC',
      intent: 'OFF_TOPIC',
      isSmalltalk: false,
      hideCitation: true,
    };
  }

  // LANG_EN (Non-Vietnamese input; preserve unaccented Vietnamese HRM & restricted/probing queries)
  if (!restrictedSignal && isLikelyNonVietnamese(raw, norm)) {
    return {
      text: TPL_LANG,
      templateId: 'TPL_LANG',
      intent: 'LANG_EN',
      isSmalltalk: false,
      hideCitation: true,
    };
  }

  return null;
}

const VIETNAMESE_SIGNAL_WORDS = new Set([
  'toi',
  'minh',
  'ban',
  'cua',
  'la',
  'ai',
  'gi',
  'nao',
  'khong',
  'duoc',
  'ngay',
  'phep',
  'nghi',
  'luong',
  'cham',
  'cong',
  'don',
  'ho',
  'so',
  'hop',
  'dong',
  'nhan',
  'vien',
  'truong',
  'phong',
  'giam',
  'doc',
  'bao',
  'nhieu',
  'con',
  'them',
  'gio',
  'quen',
  'giai',
  'trinh',
  'xin',
  'cho',
  'lam',
  'viec',
  'thang',
  'nam',
  'hom',
  'nay',
  'mai',
  'qua',
  'tuan',
  'sau',
  'phieu',
  'chinh',
  'sach',
  'bhxh',
  'thue',
  'tncn',
  'thoi',
  'co',
  'huy',
  'rut',
  'gui',
  'tao',
  'xem',
  'tra',
  'cuu',
  'hoi',
  've',
  'om',
  'ca',
  'nua',
  'sang',
  'chieu',
  'sep',
  'hr',
  'ot',
]);

const ENGLISH_SIGNAL_WORDS = new Set([
  'the',
  'is',
  'are',
  'am',
  'was',
  'were',
  'what',
  'when',
  'where',
  'who',
  'why',
  'how',
  'many',
  'much',
  'can',
  'could',
  'would',
  'should',
  'do',
  'does',
  'did',
  'have',
  'has',
  'my',
  'your',
  'you',
  'please',
  'leave',
  'salary',
  'payroll',
  'payslip',
  'policy',
  'apply',
  'request',
  'remaining',
  'days',
  'today',
  'tomorrow',
  'about',
  'with',
  'for',
  'from',
  'check',
  'tell',
  'show',
  'give',
]);

function isLikelyNonVietnamese(raw: string, norm: string): boolean {
  const rawWithoutEmoji = (raw || '').replace(EMOJI_PATTERN, '');
  // Non-Latin scripts (Chinese, Japanese, Korean, Cyrillic, Arabic, Thai, etc.)
  if (/[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F\u20A0-\u20CF]/.test(rawWithoutEmoji)) {
    return true;
  }
  // If input already contains Vietnamese diacritics, treat as Vietnamese
  if (/[\u00C0-\u024F\u1E00-\u1EFF]/.test(rawWithoutEmoji)) {
    return false;
  }
  const tokens = norm.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;

  let vnHits = 0;
  let enHits = 0;
  for (const t of tokens) {
    if (VIETNAMESE_SIGNAL_WORDS.has(t)) vnHits += 1;
    if (ENGLISH_SIGNAL_WORDS.has(t)) enHits += 1;
  }
  if (vnHits > 0) return false;
  return enHits >= 2 || (tokens.length >= 2 && enHits >= 1);
}

// ---------------------------------------------------------------------------
// Core Helper: Validate + Create Draft + Format Preview
// ---------------------------------------------------------------------------

async function validateAndDraftSingle(params: {
  input: RequestInput;
  user: RouterSessionUser;
  services: RouterServices;
  store: RouterStateStore;
  state: RouterState;
  nowMs: number;
}): Promise<RouterResult> {
  const { input, user, services, store, state, nowMs } = params;

  const val = await services.validateRequest(user.userId, input, nowMs);
  if (!val.ok) {
    const firstErr = val.errors[0];
    if (firstErr?.code === 'INSUFFICIENT_BALANCE') {
      const avail = firstErr.availableDays ?? 0;
      const req = firstErr.requestedDays ?? input.days ?? 1;
      const unpaid = firstErr.unpaidDays ?? Math.max(0, req - avail);
      const startIso = input.startDate || getVnTodayIso(nowMs);
      const annualEnd = avail >= 1 ? addDaysIso(startIso, Math.ceil(avail) - 1) : startIso;
      const unpaidStart = avail >= 1 ? addDaysIso(annualEnd, 1) : startIso;
      const unpaidEnd = addDaysIso(unpaidStart, Math.max(1, Math.ceil(unpaid)) - 1);

      const nextState: RouterState = {
        ...state,
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
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: TPL_VALIDATION_ERROR(firstErr),
        templateId: 'ERR_INSUFFICIENT_BALANCE',
        intent: 'CREATE_LEAVE_SPLIT_PROMPT',
        state: 'COLLECTING',
        slots: nextState.slots,
        values: { availableDays: avail, requestedDays: req, unpaidDays: unpaid },
      };
    }

    if (firstErr?.code === 'OVERLAP' && firstErr.conflictRequestId) {
      const nextState: RouterState = {
        ...state,
        status: 'COLLECTING',
        slots: { ...input },
        pendingOverlapConflict: {
          conflictCode: firstErr.conflictCode || firstErr.conflictRequestId,
          conflictRequestId: firstErr.conflictRequestId,
        },
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: TPL_VALIDATION_ERROR(firstErr),
        templateId: 'ERR_OVERLAP',
        intent: 'OVERLAP_CONFIRM',
        state: 'COLLECTING',
        slots: nextState.slots,
      };
    }

    if (firstErr?.code === 'MISSING_FIELD') {
      const nextState: RouterState = {
        ...state,
        status: 'COLLECTING',
        slots: { ...input },
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: TPL_VALIDATION_ERROR(firstErr),
        templateId: 'ERR_MISSING_FIELD',
        intent: 'COLLECT_MISSING_FIELD',
        state: 'COLLECTING',
        slots: nextState.slots,
      };
    }

    const resetState = store.reset(user.userId, nowMs);
    return {
      handled: true,
      source: 'router',
      text: firstErr ? TPL_VALIDATION_ERROR(firstErr) : TPL_CLARIFY,
      templateId: firstErr ? `ERR_${firstErr.code}` : 'TPL_CLARIFY',
      intent: 'VALIDATION_ERROR',
      state: resetState.status,
      slots: input,
    };
  }

  // Enforce rate limit: max 5 drafts/hour/user
  if (!store.canCreateDraft(user.userId, nowMs, 1)) {
    return {
      handled: true,
      source: 'router',
      text: TPL_RATE_LIMIT_DRAFTS,
      templateId: 'TPL_RATE_LIMIT_DRAFTS',
      intent: 'RATE_LIMIT',
      state: state.status,
    };
  }

  try {
    const draft = await services.createDraft(user.userId, input, nowMs);
    store.recordDraftCreated(user.userId, nowMs, 1);

    const nextState: RouterState = {
      ...state,
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
    };
    store.set(user.userId, nextState);

    return {
      handled: true,
      source: 'router',
      text: TPL_PREVIEW(draft.preview),
      templateId: 'TPL_PREVIEW',
      intent: `DRAFT_${input.type.toUpperCase()}`,
      card: { kind: 'preview', drafts: [draft] },
      state: 'PREVIEW',
      slots: input,
      values: {
        draftId: draft.draftId,
        days: draft.preview.days ?? null,
        hours: draft.preview.hours ?? null,
        otMultiplier: draft.preview.otMultiplier ?? null,
        balanceAfter: draft.preview.balanceAfter ?? null,
        explanationsLeft: draft.preview.explanationsLeft ?? null,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/rate\s*limit|5\s*nháp/i.test(msg)) {
      return {
        handled: true,
        source: 'router',
        text: TPL_RATE_LIMIT_DRAFTS,
        templateId: 'TPL_RATE_LIMIT_DRAFTS',
        intent: 'RATE_LIMIT',
        state: state.status,
      };
    }
    throw err;
  }
}

async function resolveHandoverIfPresent(params: {
  raw: string;
  user: RouterSessionUser;
  services: RouterServices;
  state: RouterState;
  store: RouterStateStore;
  input: RequestInput;
  nowMs: number;
}): Promise<{ done: false } | { done: true; result: RouterResult }> {
  const { raw, user, services, state, store, input, nowMs } = params;
  const ho = extractHandoverMention(raw);
  if (!ho.hasHandoverMention) return { done: false };

  if (ho.invalidChars || !ho.queryName) {
    const nextState: RouterState = {
      ...state,
      status: 'COLLECTING',
      slots: { ...input },
      pendingHandoverQuery: true,
      handoverCandidates: null,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + DRAFT_TTL_MS,
    };
    store.set(user.userId, nextState);
    return {
      done: true,
      result: {
        handled: true,
        source: 'router',
        text: TPL_BAD_HANDOVER,
        templateId: 'TPL_BAD_HANDOVER',
        intent: 'HANDOVER_INVALID',
        state: 'COLLECTING',
        slots: nextState.slots,
      },
    };
  }

  const matches = await services.searchColleagues(user.userId, ho.queryName);
  if (matches.length === 1) {
    input.handoverToId = matches[0].id;
    input.handoverToName = matches[0].name;
    return { done: false };
  }

  if (matches.length > 1) {
    const limited = matches.slice(0, 5);
    const listText = limited
      .map((c, idx) => `${idx + 1}. ${c.name} (${c.department})`)
      .join('\n');
    const nextState: RouterState = {
      ...state,
      status: 'COLLECTING',
      slots: { ...input },
      pendingHandoverQuery: false,
      handoverCandidates: limited,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + DRAFT_TTL_MS,
    };
    store.set(user.userId, nextState);
    return {
      done: true,
      result: {
        handled: true,
        source: 'router',
        text: `${TPL_ASK_HANDOVER_CHOICE}\n${listText}`,
        templateId: 'TPL_ASK_HANDOVER_CHOICE',
        intent: 'HANDOVER_DISAMBIGUATE',
        state: 'COLLECTING',
        slots: nextState.slots,
      },
    };
  }

  // 0 matches
  const nextState: RouterState = {
    ...state,
    status: 'COLLECTING',
    slots: { ...input },
    pendingHandoverQuery: true,
    handoverCandidates: null,
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + DRAFT_TTL_MS,
  };
  store.set(user.userId, nextState);
  return {
    done: true,
    result: {
      handled: true,
      source: 'router',
      text: `Không tìm thấy đồng nghiệp tên "${ho.queryName}". Bạn vui lòng nhập lại đúng họ tên hoặc mã nhân viên nhé.`,
      templateId: 'TPL_HANDOVER_NOT_FOUND',
      intent: 'HANDOVER_NOT_FOUND',
      state: 'COLLECTING',
      slots: nextState.slots,
    },
  };
}

// ---------------------------------------------------------------------------
// Leave / Attendance / Overtime / Cancel Request Routing (from IDLE/fresh)
// ---------------------------------------------------------------------------

function detectLeaveSubtype(norm: string): RequestType {
  if (/\bnghi\s*om|bi\s*om|kham\s*benh|sot\b/.test(norm)) return 'sick_leave';
  if (/\bkhong\s*luong|nghi\s+khong\s+huong\s+luong\b/.test(norm)) return 'unpaid_leave';
  return 'annual_leave';
}

function isLeaveIntent(norm: string): boolean {
  if (/\b(?:nghi\s+viec|thoi\s+viec)\b/.test(norm)) return false;
  const hasPolicyOrBalanceQuestion =
    /\b(?:bao\s+nhieu|may\s+ngay|con\s+may|con\s+lai|da\s+dung|chinh\s+sach|quy\s+dinh|nhu\s+the\s+nao)\b/.test(
      norm
    );
  if (hasPolicyOrBalanceQuestion) {
    return false;
  }
  if (/\b(?:xin\s+nghi|muon\s+nghi|nghi\s+nua\s+ngay)\b/.test(norm)) {
    return true;
  }
  if (
    /\b(?:tao|lam|viet|soan|dang\s+k[yi]|xin)\s+(?:(?:cho|giup|ho|thay)\s+(?:(?:toi|minh|em|anh|chi|ban|sep)\s+)?(?:[a-z0-9-]+\s+)?)?(?:(?:1|mot|hai|2)\s+)?(?:don\s+)?(?:xin\s+)?(?:nghi|phep|om|khong\s+luong)\b/.test(
      norm
    )
  ) {
    return true;
  }
  if (
    /\b(?:nghi\s+phep|nghi\s+om|nghi\s+khong\s+luong|nghi\s+\d+(?:[.,]5)?\s*ngay|nghi\s+(?:phep\s+)?nua\s+thang|nghi\s+(?:phep\s+)?\d+(?:[.,]5)?\s*(?:thang|tuan)(?!\s+(?:\d{1,2}|sau|toi|nay|truoc)\b))\b/.test(
      norm
    ) &&
    /\b(?:ngay\s+mai|hom\s+nay|ngay\s+\d|\d+\/\d+|tu\s+\d|\d{1,2}\s+(?:den|toi)\s+(?:ngay\s+)?\d{1,2}|\d{1,2}\s+\d{1,2}|tuan\s+sau|ca\s+ngay|nua\s+ngay|nua\s+thang|buoi\s+(?:sang|chieu)|thu\s+(?:hai|ba|tu|nam|sau|bay)|chu\s+nhat|\d+(?:[.,]5)?\s*ngay|\d+(?:[.,]5)?\s*(?:thang|tuan)(?!\s+(?:\d{1,2}|sau|toi|nay|truoc)\b))\b/.test(
      norm
    )
  ) {
    return true;
  }
  return false;
}

function isCanCreateLeaveQuestion(norm: string, dates: ExtractedDates): boolean {
  if (dates.hasExplicitDateMention) return false;
  if (/\b(?:co|duoc)\b.*\b(?:tao|lam|xin)\b.*\bdon\b.*\bnghi\b/.test(norm)) return true;
  if (/\b(?:lam\s+sao|cach\s+nao|huong\s+dan)\b.*\b(?:tao|lam|xin)\b.*\bdon\b.*\bnghi\b/.test(norm)) {
    return true;
  }
  return false;
}

function isAttendanceIntent(norm: string): boolean {
  if (/\b(?:quen|thieu)\b.*\b(?:cham\s+cong|van\s+tay|check\s+in|check\s+out)\b/.test(norm)) {
    return true;
  }
  if (/\bgiai\s+trinh\b/.test(norm) && /\b(?:cham\s+cong|di\s+muon|ve\s+som|van\s+tay|ngay|hom)\b/.test(norm)) {
    return true;
  }
  if (/\bgiai\s+trinh\s+cham\s+cong\b/.test(norm)) return true;
  return false;
}

function isOvertimeIntent(norm: string): boolean {
  const hasOtWord = /\bot\b|\blam\s+them\s+gio\b|\btang\s+ca\b/.test(norm);
  const hasAction =
    /\b(?:dang\s+k[yi]|xin|tao|viet|soan)\b/.test(norm) ||
    /\blam\s+(?:(?:cho|giup|ho|thay)\s+(?:(?:toi|minh|em|anh|chi)\s+)?)?(?:(?:1|mot|hai|2)\s+)?don\b/.test(
      norm
    );
  return hasOtWord && hasAction;
}

function isCancelExistingRequestIntent(norm: string): boolean {
  return /\b(?:huy|rut)\b.*\bdon\b/.test(norm) && !/\bhuy\s+nhap\b/.test(norm);
}

function isPersonalResignRequestIntent(norm: string): boolean {
  if (!/\b(?:nghi\s+viec|thoi\s+viec)\b/.test(norm)) return false;
  const isGeneralPolicyQuestion =
    /\b(?:bao\s+nhieu|bao\s+lau|quy\s+dinh|quy\s+che|chinh\s+sach|hop\s+dong\s+(?:khong\s+xac\s+dinh|xac\s+dinh)|luat\s+lao\s+dong|thu\s+tuc|quy\s+trinh|nhu\s+the\s+nao|ra\s+sao)\b/.test(
      norm
    ) || /\bthu\s+viec\b.*\bbao\s+truoc\b/.test(norm);
  const hasPersonalResignAction =
    /\b(?:toi\s+muon|minh\s+muon|em\s+muon|muon\s+xin|xin\s+(?:nghi|thoi)\s+viec|tao\s+don\s+(?:xin\s+)?(?:nghi|thoi)\s+viec|lam\s+don\s+(?:xin\s+)?(?:nghi|thoi)\s+viec|soan\s+don\s+(?:xin\s+)?(?:nghi|thoi)\s+viec|nop\s+don\s+(?:xin\s+)?(?:nghi|thoi)\s+viec|muon\s+(?:nghi|thoi)\s+viec)\b/.test(
      norm
    );
  if (isGeneralPolicyQuestion && !hasPersonalResignAction) {
    return false;
  }
  return hasPersonalResignAction;
}

async function handleLeaveRequest(params: {
  raw: string;
  norm: string;
  user: RouterSessionUser;
  services: RouterServices;
  store: RouterStateStore;
  state: RouterState;
  nowMs: number;
  baseSlots?: Partial<RequestInput>;
}): Promise<RouterResult> {
  const { raw, norm, user, services, store, state, nowMs, baseSlots = {} } = params;

  const dates = extractDates(raw, norm, nowMs);
  const session = extractSession(norm) ?? baseSlots.session;
  const reason = extractReason(raw, 'leave') ?? baseSlots.reason;

  const hasExplicitType =
    /\b(?:phep\s*nam|nghi\s*phep|nghi\s*om|khong\s*luong)\b/.test(norm) ||
    Boolean(baseSlots.type);

  const startDate = dates.startDate ?? baseSlots.startDate;
  const days = dates.days ?? baseSlots.days;
  let endDate = dates.endDate ?? baseSlots.endDate ?? startDate;
  if (
    dates.startDate &&
    (!dates.endDate || dates.endDate === dates.startDate) &&
    !dates.days &&
    baseSlots.days &&
    baseSlots.days >= 1
  ) {
    endDate = addDaysIso(dates.startDate, Math.ceil(baseSlots.days) - 1);
  }

  // Case 12: bare "xin nghỉ" with no subtype and no dates -> TPL_ASK_TYPE_DATES (preserve parsed days if any)
  if (!hasExplicitType && !startDate) {
    const preservedSlots: Partial<RequestInput> = {
      ...baseSlots,
      ...(days !== undefined ? { days } : {}),
      ...(session !== undefined ? { session } : {}),
      ...(reason !== undefined ? { reason } : {}),
    };
    const nextState: RouterState = {
      ...state,
      status: 'COLLECTING',
      slots: preservedSlots,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + DRAFT_TTL_MS,
    };
    store.set(user.userId, nextState);
    const askText =
      days && days >= 1
        ? `Bạn muốn xin loại nghỉ nào (phép năm, không lương, ốm) cho ${dates.durationLabel ?? `${days} ngày`} và bắt đầu từ ngày nào?`
        : TPL_ASK_TYPE_DATES;
    return {
      handled: true,
      source: 'router',
      text: askText,
      templateId: 'TPL_ASK_TYPE_DATES',
      intent: 'ASK_TYPE_DATES',
      state: 'COLLECTING',
      slots: nextState.slots,
    };
  }

  const resolvedType: RequestType =
    hasExplicitType && !baseSlots.type
      ? detectLeaveSubtype(norm)
      : (baseSlots.type ?? detectLeaveSubtype(norm));

  if (!startDate) {
    const nextState: RouterState = {
      ...state,
      status: 'COLLECTING',
      slots: { ...baseSlots, type: resolvedType, days, session, reason },
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + DRAFT_TTL_MS,
    };
    store.set(user.userId, nextState);
    const askStartText =
      days && days >= 1
        ? `Bạn muốn nghỉ ${dates.durationLabel ?? `${days} ngày`} bắt đầu từ ngày nào?`
        : TPL_ERR_MISSING_FIELD_MESSAGES.startDate;
    return {
      handled: true,
      source: 'router',
      text: askStartText,
      templateId: 'ERR_MISSING_FIELD',
      intent: 'COLLECT_DATES',
      state: 'COLLECTING',
      slots: nextState.slots,
    };
  }

  const input: RequestInput = {
    type: resolvedType,
    startDate,
    endDate: endDate || startDate,
    days,
    session,
    reason,
    handoverToId: baseSlots.handoverToId,
    handoverToName: baseSlots.handoverToName,
  };

  // Resolve handover mention (Case A7)
  const hoResult = await resolveHandoverIfPresent({
    raw,
    user,
    services,
    state,
    store,
    input,
    nowMs,
  });
  if (hoResult.done) return hoResult.result;

  // Order for Case 02 & Case 09: single-day leave without session -> check OVERLAP first!
  const isSingleDay = input.startDate === input.endDate && (!days || days <= 1);
  if (isSingleDay && !input.session) {
    const probeVal = await services.validateRequest(
      user.userId,
      { ...input, session: 'full' },
      nowMs
    );
    const overlapErr = probeVal.errors.find((e) => e.code === 'OVERLAP');
    if (overlapErr && overlapErr.conflictRequestId) {
      const nextState: RouterState = {
        ...state,
        status: 'COLLECTING',
        slots: { ...input },
        pendingOverlapConflict: {
          conflictCode: overlapErr.conflictCode || overlapErr.conflictRequestId,
          conflictRequestId: overlapErr.conflictRequestId,
        },
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: TPL_VALIDATION_ERROR(overlapErr),
        templateId: 'ERR_OVERLAP',
        intent: 'OVERLAP_CONFIRM',
        state: 'COLLECTING',
        slots: nextState.slots,
      };
    }

    const nextState: RouterState = {
      ...state,
      status: 'COLLECTING',
      slots: { ...input },
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + DRAFT_TTL_MS,
    };
    store.set(user.userId, nextState);
    return {
      handled: true,
      source: 'router',
      text: TPL_ASK_SESSION,
      templateId: 'TPL_ASK_SESSION',
      intent: 'ASK_SESSION',
      state: 'COLLECTING',
      slots: nextState.slots,
    };
  }

  return validateAndDraftSingle({ input, user, services, store, state, nowMs });
}

async function handleAttendanceRequest(params: {
  raw: string;
  norm: string;
  user: RouterSessionUser;
  services: RouterServices;
  store: RouterStateStore;
  state: RouterState;
  nowMs: number;
  baseSlots?: Partial<RequestInput>;
}): Promise<RouterResult> {
  const { raw, norm, user, services, store, state, nowMs, baseSlots = {} } = params;
  const dates = extractDates(raw, norm, nowMs);
  const times = extractTimes(raw);

  const workDate = dates.workDate ?? baseSlots.workDate ?? getVnTodayIso(nowMs);
  let actualIn = baseSlots.actualIn;
  let actualOut = baseSlots.actualOut;

  if (times.length >= 2) {
    actualIn = times[0];
    actualOut = times[1];
  } else if (times.length === 1) {
    if (/\b(?:ra|check\s*out|ve)\b/.test(norm) && !/\b(?:vao|check\s*in)\b/.test(norm)) {
      actualOut = times[0];
      actualIn = actualIn || '08:30';
    } else {
      actualIn = times[0];
      actualOut = actualOut || '17:30';
    }
  } else {
    actualIn = actualIn || '08:30';
    actualOut = actualOut || '17:30';
  }

  const reason = extractReason(raw, 'attendance') ?? baseSlots.reason ?? 'Giải trình chấm công';

  const input: RequestInput = {
    type: 'attendance_explanation',
    workDate,
    startDate: workDate,
    endDate: workDate,
    actualIn,
    actualOut,
    reason,
  };

  return validateAndDraftSingle({ input, user, services, store, state, nowMs });
}

async function handleOvertimeRequest(params: {
  raw: string;
  norm: string;
  user: RouterSessionUser;
  services: RouterServices;
  store: RouterStateStore;
  state: RouterState;
  nowMs: number;
  baseSlots?: Partial<RequestInput>;
}): Promise<RouterResult> {
  const { raw, norm, user, services, store, state, nowMs, baseSlots = {} } = params;
  const dates = extractDates(raw, norm, nowMs);
  const times = extractTimes(raw);

  const workDate = dates.workDate ?? baseSlots.workDate ?? getVnTodayIso(nowMs);
  const otStart = times[0] ?? baseSlots.otStart;
  const otEnd = times[1] ?? baseSlots.otEnd;
  const reason = extractReason(raw, 'overtime') ?? baseSlots.reason ?? 'Làm thêm giờ theo yêu cầu công việc';

  if (!otStart || !otEnd) {
    const nextState: RouterState = {
      ...state,
      status: 'COLLECTING',
      slots: { ...baseSlots, type: 'overtime', workDate, startDate: workDate, endDate: workDate, otStart, otEnd, reason },
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + DRAFT_TTL_MS,
    };
    store.set(user.userId, nextState);
    return {
      handled: true,
      source: 'router',
      text: TPL_ERR_MISSING_FIELD_MESSAGES.otTime,
      templateId: 'ERR_MISSING_FIELD',
      intent: 'COLLECT_OT_TIME',
      state: 'COLLECTING',
      slots: nextState.slots,
    };
  }

  const input: RequestInput = {
    type: 'overtime',
    workDate,
    startDate: workDate,
    endDate: workDate,
    otStart,
    otEnd,
    reason,
  };

  return validateAndDraftSingle({ input, user, services, store, state, nowMs });
}

// ---------------------------------------------------------------------------
// State Handlers (COLLECTING / PREVIEW)
// ---------------------------------------------------------------------------

async function handleCollectingState(params: {
  raw: string;
  norm: string;
  user: RouterSessionUser;
  services: RouterServices;
  store: RouterStateStore;
  state: RouterState;
  nowMs: number;
}): Promise<RouterResult | null> {
  const { raw, norm, user, services, store, state, nowMs } = params;

  // Security Hardening #2: guard against prompt injection in COLLECTING turns
  if (isReasonInjection(raw)) {
    return {
      handled: true,
      source: 'router',
      text: TPL_BAD_REASON,
      templateId: 'TPL_BAD_REASON',
      intent: 'BAD_REASON',
      state: 'COLLECTING',
      slots: state.slots,
    };
  }
  const collectAscii = stripDiacritics(raw).toLowerCase();
  if (
    STANDALONE_INJECTION_PATTERN.test(collectAscii) ||
    STANDALONE_INJECTION_PATTERN.test(norm)
  ) {
    return {
      handled: true,
      source: 'router',
      text: TPL_REFUSE_STANDARD,
      templateId: 'TPL_REFUSE_STANDARD',
      intent: 'REFUSE_INJECTION',
      state: 'COLLECTING',
      slots: state.slots,
    };
  }

  // Cancel current collecting flow
  if (/^(?:huy|thoi|khong\s+tao\s+nua|huy\s+nhap|bo\s+qua)$/.test(stripPoliteTail(norm))) {
    store.reset(user.userId, nowMs);
    return {
      handled: true,
      source: 'router',
      text: TPL_DRAFT_CANCELLED,
      templateId: 'TPL_DRAFT_CANCELLED',
      intent: 'DRAFT_CANCELLED',
      state: 'CANCELLED',
    };
  }

  // Restart collecting cleanly if user enters bare "xin nghỉ" while an incomplete draft is open
  if (norm === 'xin nghi') {
    store.reset(user.userId, nowMs);
    const resetBase = store.get(user.userId);
    const freshState: RouterState = {
      ...resetBase,
      status: 'COLLECTING',
      slots: {},
      drafts: [],
      cardKind: null,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + DRAFT_TTL_MS,
    };
    store.set(user.userId, freshState);
    return {
      handled: true,
      source: 'router',
      text: TPL_ASK_TYPE_DATES,
      templateId: 'TPL_ASK_TYPE_DATES',
      intent: 'ASK_TYPE_DATES',
      state: 'COLLECTING',
      slots: {},
    };
  }

  // Do not swallow pure lookup / balance / policy / capability questions while in COLLECTING
  const collectDates = extractDates(raw, norm, nowMs);
  const collectSession = extractSession(norm);
  const collectHandover = extractHandoverMention(raw);
  const normWithoutUnpaidLeave = norm.replace(/\bnghi\s+khong\s+luong\b/g, 'nghi_khong_thu_lao');
  const hasPolicyOrBalanceQuestion =
    /\b(?:bao\s+nhieu|may\s+ngay|con\s+may|con\s+lai|da\s+dung|chinh\s+sach|quy\s+dinh|nhu\s+the\s+nao)\b/.test(
      norm
    );
  const isPersonalLookupQuery =
    /\b(?:luong\s+cua\s+(?:toi|minh|em)|phieu\s+luong|bang\s+luong|so\s+du\s+phep|xem\s+(?:luong|phep|cham\s+cong|ho\s+so)|tra\s+cuu|hop\s+dong\s+cua)\b/.test(
      normWithoutUnpaidLeave
    );
  if (
    !collectDates.hasExplicitDateMention &&
    !collectSession &&
    !collectHandover.hasHandoverMention &&
    (isCanCreateLeaveQuestion(norm, collectDates) ||
      hasPolicyOrBalanceQuestion ||
      isPersonalLookupQuery)
  ) {
    return null;
  }

  // Case A2: awaitingSelfConfirm
  if (state.awaitingSelfConfirm) {
    const target = checkTargetPerson(raw, norm);
    if (
      target === 'OTHER' ||
      /\b(?:cho\s+nguoi\s+khac|nguoi\s+khac|cho\s+ban|cho\s+dong\s+nghiep)\b/.test(norm)
    ) {
      store.reset(user.userId, nowMs);
      return {
        handled: true,
        source: 'router',
        text: TPL_NOT_SELF,
        templateId: 'TPL_NOT_SELF',
        intent: 'REFUSE_NOT_SELF',
        state: 'IDLE',
      };
    }

    if (
      /\b(?:cho\s+minh|cua\s+minh|cho\s+toi|cua\s+toi|minh|toi|ban\s+than)\b/.test(norm) ||
      /^(?:minh|toi|em|co)$/.test(stripPoliteTail(norm))
    ) {
      const updatedState: RouterState = {
        ...state,
        awaitingSelfConfirm: false,
      };
      return handleLeaveRequest({
        raw: '',
        norm: '',
        user,
        services,
        store,
        state: updatedState,
        nowMs,
        baseSlots: state.slots,
      });
    }
  }

  // Case 03: pendingInsufficientSplit (1 or 2)
  if (state.pendingInsufficientSplit) {
    const split = state.pendingInsufficientSplit;
    const cleaned = stripPoliteTail(norm);
    if (/^(?:1|chon\s*1|tach|hai\s+nhap|2\s+nhap|dong\s+y)$/.test(cleaned)) {
      if (!store.canCreateDraft(user.userId, nowMs, 2)) {
        return {
          handled: true,
          source: 'router',
          text: TPL_RATE_LIMIT_DRAFTS,
          templateId: 'TPL_RATE_LIMIT_DRAFTS',
          intent: 'RATE_LIMIT',
          state: 'COLLECTING',
        };
      }
      const val1 = await services.validateRequest(user.userId, split.annualInput, nowMs);
      const val2 = await services.validateRequest(user.userId, split.unpaidInput, nowMs);
      if (!val1.ok || !val2.ok) {
        const err = val1.errors[0] || val2.errors[0];
        store.reset(user.userId, nowMs);
        return {
          handled: true,
          source: 'router',
          text: err ? TPL_VALIDATION_ERROR(err) : TPL_CLARIFY,
          templateId: err ? `ERR_${err.code}` : 'TPL_CLARIFY',
          intent: 'VALIDATION_ERROR',
          state: 'IDLE',
        };
      }
      const d1 = await services.createDraft(user.userId, split.annualInput, nowMs);
      const d2 = await services.createDraft(user.userId, split.unpaidInput, nowMs);
      store.recordDraftCreated(user.userId, nowMs, 2);

      const nextState: RouterState = {
        ...state,
        status: 'PREVIEW',
        drafts: [d1, d2],
        cardKind: 'preview',
        pendingInsufficientSplit: null,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);

      const text = `Mình đã soạn 2 nháp nối tiếp: (1) ${d1.preview.typeLabel}, ${d1.preview.dateText}, ${d1.preview.days} ngày, phép còn lại sau khi nghỉ: ${d1.preview.balanceAfter ?? 0} ngày; (2) ${d2.preview.typeLabel}, ${d2.preview.dateText}, ${d2.preview.days} ngày. Bạn kiểm tra rồi bấm Gửi đơn để xác nhận, hoặc Sửa / Hủy nháp.`;

      return {
        handled: true,
        source: 'router',
        text,
        templateId: 'TPL_PREVIEW',
        intent: 'DRAFT_SPLIT_LEAVE',
        card: { kind: 'preview', drafts: [d1, d2] },
        state: 'PREVIEW',
        values: {
          annualDays: d1.preview.days ?? split.availableDays,
          unpaidDays: d2.preview.days ?? split.unpaidDays,
        },
      };
    }

    if (/^(?:2|chon\s*2|rut\s+ngan|doi\s+ngay)$/.test(cleaned)) {
      const nextState: RouterState = {
        ...state,
        pendingInsufficientSplit: null,
        slots: { ...state.slots, startDate: undefined, endDate: undefined, days: undefined },
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: `Bạn muốn rút ngắn nghỉ phép vào những ngày nào (tối đa ${split.availableDays} ngày)?`,
        templateId: 'ERR_MISSING_FIELD',
        intent: 'ASK_SHORTER_DATES',
        state: 'COLLECTING',
        slots: nextState.slots,
      };
    }
  }

  // Case 09: pendingOverlapConflict ("có" / "không")
  if (state.pendingOverlapConflict) {
    const cleaned = stripPoliteTail(norm);
    if (/^(?:co|dong\s+y|ok|huy\s+don\s+cu|chac\s+chan)$/.test(cleaned)) {
      if (!store.canCreateDraft(user.userId, nowMs, 1)) {
        return {
          handled: true,
          source: 'router',
          text: TPL_RATE_LIMIT_DRAFTS,
          templateId: 'TPL_RATE_LIMIT_DRAFTS',
          intent: 'RATE_LIMIT',
          state: 'COLLECTING',
        };
      }
      const cancelDraft = await services.draftCancelRequest(
        user.userId,
        state.pendingOverlapConflict.conflictRequestId,
        nowMs
      );
      store.recordDraftCreated(user.userId, nowMs, 1);

      const nextState: RouterState = {
        ...state,
        status: 'PREVIEW',
        drafts: [cancelDraft],
        cardKind: 'cancel_confirm',
        pendingOverlapConflict: null,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: TPL_CANCEL_CONFIRM_GUIDE,
        templateId: 'TPL_CANCEL_CONFIRM_GUIDE',
        intent: 'DRAFT_CANCEL_REQUEST',
        card: { kind: 'cancel_confirm', drafts: [cancelDraft] },
        state: 'PREVIEW',
        values: {
          draftId: cancelDraft.draftId,
          targetRequestId: state.pendingOverlapConflict.conflictRequestId,
        },
      };
    }

    if (/^(?:khong|thoi|huy|bo)$/.test(cleaned)) {
      store.reset(user.userId, nowMs);
      return {
        handled: true,
        source: 'router',
        text: TPL_DRAFT_CANCELLED,
        templateId: 'TPL_DRAFT_CANCELLED',
        intent: 'DRAFT_CANCELLED',
        state: 'CANCELLED',
      };
    }
  }

  // Handover disambiguation (1/2/3...)
  if (state.handoverCandidates && state.handoverCandidates.length > 0) {
    const numMatch = norm.match(/^(?:chon\s*)?([1-5])$/);
    if (numMatch?.[1]) {
      const idx = Number(numMatch[1]) - 1;
      const chosen = state.handoverCandidates[idx];
      if (chosen) {
        const nextSlots: Partial<RequestInput> = {
          ...state.slots,
          handoverToId: chosen.id,
          handoverToName: chosen.name,
        };
        const updatedState: RouterState = {
          ...state,
          handoverCandidates: null,
          pendingHandoverQuery: false,
          slots: nextSlots,
        };
        return handleLeaveRequest({
          raw: '',
          norm: '',
          user,
          services,
          store,
          state: updatedState,
          nowMs,
          baseSlots: nextSlots,
        });
      }
    }
  }

  // Pending invalid handover follow-up
  if (state.pendingHandoverQuery) {
    const hoClean = cleanRawReason(raw);
    const hoLetters = stripDiacritics(hoClean).match(/[A-Za-z]/g) || [];
    if (/^(?:khong\s+co|bo\s+qua|khong)$/.test(stripPoliteTail(norm))) {
      const updatedState: RouterState = { ...state, pendingHandoverQuery: false };
      return handleLeaveRequest({
        raw: '',
        norm: '',
        user,
        services,
        store,
        state: updatedState,
        nowMs,
        baseSlots: state.slots,
      });
    }
    if (hoLetters.length < 2) {
      return {
        handled: true,
        source: 'router',
        text: TPL_BAD_HANDOVER,
        templateId: 'TPL_BAD_HANDOVER',
        intent: 'HANDOVER_INVALID',
        state: 'COLLECTING',
        slots: state.slots,
      };
    }
    const matches = await services.searchColleagues(user.userId, hoClean);
    if (matches.length === 1) {
      const nextSlots: Partial<RequestInput> = {
        ...state.slots,
        handoverToId: matches[0].id,
        handoverToName: matches[0].name,
      };
      const updatedState: RouterState = { ...state, pendingHandoverQuery: false };
      return handleLeaveRequest({
        raw: '',
        norm: '',
        user,
        services,
        store,
        state: updatedState,
        nowMs,
        baseSlots: nextSlots,
      });
    }
    if (matches.length > 1) {
      const limited = matches.slice(0, 5);
      const listText = limited.map((c, idx) => `${idx + 1}. ${c.name} (${c.department})`).join('\n');
      const nextState: RouterState = {
        ...state,
        pendingHandoverQuery: false,
        handoverCandidates: limited,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: `${TPL_ASK_HANDOVER_CHOICE}\n${listText}`,
        templateId: 'TPL_ASK_HANDOVER_CHOICE',
        intent: 'HANDOVER_DISAMBIGUATE',
        state: 'COLLECTING',
      };
    }
  }

  // Short decline/cancel in generic COLLECTING state (after special sub-prompts like Case A2/03/09/handover)
  // Exits COLLECTING cleanly to IDLE instead of leaking short "khong" into LLM fallback
  if (
    !state.awaitingSelfConfirm &&
    !state.pendingInsufficientSplit &&
    !state.pendingOverlapConflict &&
    !state.pendingHandoverQuery
  ) {
    const collectingDeclineNorm = stripPoliteTail(norm);
    const collectingDeclineSt = normalizeForSmalltalkMatch(raw);
    const shortDeclineRe =
      /^(?:khong|ko|k|khong\s+can|ko\s+can|thoi\s+khong\s+can|thoi\s+ko\s+can|khong\s+tao\s+nua|thoi\s+bo\s+di|no|nope)$/;
    if (
      !isLaughRepeatRaw(raw) &&
      (shortDeclineRe.test(collectingDeclineNorm) || shortDeclineRe.test(collectingDeclineSt))
    ) {
      store.reset(user.userId, nowMs);
      return {
        handled: true,
        source: 'router',
        text: 'Dạ vâng, mình không tạo đơn nhé. Khi nào cần hỗ trợ về phép năm, lương hay đơn từ bạn cứ nhắn mình!',
        templateId: 'TPL_CONTEXT_DECLINE',
        intent: 'CONTEXT_DECLINE',
        isSmalltalk: false,
        hideCitation: true,
        referencedPolicy: undefined,
        state: 'IDLE',
      };
    }
  }

  // Case 05 Turn 2 or missing reason follow-up
  if (state.slots.type && state.slots.startDate && !state.slots.reason && state.slots.session) {
    if (isReasonInjection(raw)) {
      return {
        handled: true,
        source: 'router',
        text: TPL_BAD_REASON,
        templateId: 'TPL_BAD_REASON',
        intent: 'BAD_REASON',
        state: 'COLLECTING',
        slots: state.slots,
      };
    }
    if (isFillerOrGibberishInput(raw)) {
      return {
        handled: true,
        source: 'router',
        text: "Mình chưa đọc ra lý do nghỉ, bạn nhập lại lý do ngắn gọn giúp mình nhé (hoặc nhắn 'không có lý do').",
        templateId: 'TPL_CLARIFY_REASON',
        intent: 'CLARIFY_REASON',
        hideCitation: true,
        referencedPolicy: undefined,
        state: 'COLLECTING',
        slots: state.slots,
      };
    }
    if (
      !isRequestIntentText(norm) &&
      !matchSmalltalkOrOutOfScope(raw, norm, user, {
        allowAck: false,
        personalizeSmalltalk: false,
        nowMs,
      })
    ) {
      const reasonText = /^(?:khong\s+co\s+ly\s+do|khong\s+co)$/.test(stripPoliteTail(norm))
        ? 'Không có lý do'
        : cleanRawReason(raw);
      if (reasonText) {
        return handleLeaveRequest({
          raw: '',
          norm: '',
          user,
          services,
          store,
          state,
          nowMs,
          baseSlots: { ...state.slots, reason: reasonText },
        });
      }
    }
  }

  // Single-slot follow-up for Case 02 ("cả ngày"), Case 12 ("nghỉ ốm ngày mai cả ngày, sốt"), or OT times
  if (state.slots.type === 'overtime') {
    const times = extractTimes(raw);
    if (times.length >= 2) {
      return handleOvertimeRequest({
        raw,
        norm,
        user,
        services,
        store,
        state,
        nowMs,
        baseSlots: state.slots,
      });
    }
  }

  const followSession = extractSession(norm);
  const followDates = extractDates(raw, norm, nowMs);
  const followHandover = extractHandoverMention(raw);
  const followLeaveType =
    /\b(?:phep\s*nam|nghi\s*phep|nghi\s*om|khong\s*luong)\b/.test(norm) &&
    !hasPolicyOrBalanceQuestion &&
    !isCanCreateLeaveQuestion(norm, followDates);
  if (
    followSession ||
    followDates.hasExplicitDateMention ||
    followHandover.hasHandoverMention ||
    followLeaveType ||
    isLeaveIntent(norm)
  ) {
    return handleLeaveRequest({
      raw,
      norm,
      user,
      services,
      store,
      state,
      nowMs,
      baseSlots: state.slots,
    });
  }

  return null;
}

async function handlePreviewState(params: {
  raw: string;
  norm: string;
  user: RouterSessionUser;
  services: RouterServices;
  store: RouterStateStore;
  state: RouterState;
  nowMs: number;
  personalizeSmalltalk: boolean;
}): Promise<RouterResult | null> {
  const { raw, norm, user, services, store, state, nowMs, personalizeSmalltalk } = params;
  const cleaned = stripPoliteTail(norm.replace(EMOJI_PATTERN, ' ').replace(/\s+/g, ' ').trim());
  const stNorm = normalizeForSmalltalkMatch(raw);
  const isLaugh = isLaughRepeatRaw(raw);

  // 1. Pending draft replacement confirmation (after TPL_DRAFT_EXISTS)
  if (state.pendingDraftReplace) {
    const agreeReplaceRe =
      /^(?:co|ok+|oke+|okay+|okie+|dong\s+y|duoc|dc|huy\s+nhap\s+cu|tao\s+moi|yes|y|vang|da\s+vang|u|uh|uk)$/;
    const declineReplaceRe =
      /^(?:khong|ko|k|khong\s+huy|giu\s+lai|giu\s+nhap\s+cu|thoi|no|nope)$/;

    if (!isLaugh && (agreeReplaceRe.test(cleaned) || agreeReplaceRe.test(stNorm))) {
      const pendingRaw = state.pendingDraftReplace.pendingRaw;
      for (const d of state.drafts) {
        await services.cancelDraft(user.userId, d.draftId);
      }
      store.reset(user.userId, nowMs);
      return routeCopilotMessage({
        query: pendingRaw,
        user,
        services,
        store,
        nowMs,
        personalizeSmalltalk,
      });
    }

    if (!isLaugh && (declineReplaceRe.test(cleaned) || declineReplaceRe.test(stNorm))) {
      const keptState: RouterState = {
        ...state,
        pendingDraftReplace: null,
        updatedAtMs: nowMs,
      };
      store.set(user.userId, keptState);
      return {
        handled: true,
        source: 'router',
        text: 'Dạ vâng, mình giữ nguyên nháp hiện tại nhé. Bạn kiểm tra rồi bấm Gửi đơn trên thẻ xem trước hoặc nhắn "hủy" để bỏ nháp.',
        templateId: 'TPL_DRAFT_KEPT',
        intent: 'DRAFT_KEPT',
        hideCitation: true,
        referencedPolicy: undefined,
        card: state.cardKind ? { kind: state.cardKind, drafts: state.drafts } : null,
        state: 'PREVIEW',
      };
    }
  }

  // 2. Confirm/submit phrases -> NEVER auto-submit, instruct user to click button!
  const confirmPreviewRe =
    /^(?:co|gui\s+di|gui\s+luon|gui\s+don|gui|ok+|oke+|okay+|okie+|dong\s+y|xac\s+nhan|duoc|chot|yes)$/;
  if (!isLaugh && (confirmPreviewRe.test(cleaned) || confirmPreviewRe.test(stNorm))) {
    return {
      handled: true,
      source: 'router',
      text: TPL_CLICK_SUBMIT,
      templateId: 'TPL_CLICK_SUBMIT',
      intent: 'CLICK_SUBMIT',
      hideCitation: true,
      referencedPolicy: undefined,
      card: state.cardKind ? { kind: state.cardKind, drafts: state.drafts } : null,
      state: 'PREVIEW',
    };
  }

  // 3. Cancel draft phrases
  const cancelPreviewRe =
    /^(?:huy|huy\s+nhap|huy\s+don|huy\s+bo|thoi|khong|ko|k|khong\s+gui|ko\s+gui|khong\s+can|bo|bo\s+di|no|nope)$/;
  if (!isLaugh && (cancelPreviewRe.test(cleaned) || cancelPreviewRe.test(stNorm))) {
    for (const d of state.drafts) {
      await services.cancelDraft(user.userId, d.draftId);
    }
    store.reset(user.userId, nowMs);
    return {
      handled: true,
      source: 'router',
      text: TPL_DRAFT_CANCELLED,
      templateId: 'TPL_DRAFT_CANCELLED',
      intent: 'DRAFT_CANCELLED',
      hideCitation: true,
      referencedPolicy: undefined,
      state: 'CANCELLED',
    };
  }

  // 4. New request while a draft already exists -> save pendingRaw and ask to replace
  if (isLeaveIntent(norm) || isAttendanceIntent(norm) || isOvertimeIntent(norm)) {
    const nextState: RouterState = {
      ...state,
      pendingDraftReplace: { pendingRaw: raw },
      updatedAtMs: nowMs,
    };
    store.set(user.userId, nextState);
    return {
      handled: true,
      source: 'router',
      text: TPL_DRAFT_EXISTS,
      templateId: 'TPL_DRAFT_EXISTS',
      intent: 'DRAFT_EXISTS',
      hideCitation: true,
      referencedPolicy: undefined,
      card: state.cardKind ? { kind: state.cardKind, drafts: state.drafts } : null,
      state: 'PREVIEW',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main Router Entry Point
// ---------------------------------------------------------------------------

export async function routeCopilotMessage(
  params: RouteMessageParams
): Promise<RouterResult> {
  const result = await routeCopilotMessageInner(params);
  if (result.intent !== 'CLARIFY') {
    const store = params.store ?? DEFAULT_ROUTER_STORE;
    const nowMs = params.nowMs ?? Date.now();
    const current = store.get(params.user.userId, nowMs);
    if (current.unclearStreak && current.unclearStreak > 0) {
      store.set(params.user.userId, { ...current, unclearStreak: 0 });
    }
  }
  return result;
}

async function routeCopilotMessageInner(
  params: RouteMessageParams
): Promise<RouterResult> {
  const {
    query,
    user,
    services,
    store = DEFAULT_ROUTER_STORE,
    nowMs = Date.now(),
    personalizeSmalltalk = false,
    delegateUnclearAndCasualToLlm = false,
  } = params;

  // 1. Strip spoofed [role: ...] prefix (Case A9) while preserving detection flag
  const rawQuery = query || '';
  const { unspoofedRaw, hadSpoofedRolePrefix } = stripSpoofedRolePrefixWithFlag(rawQuery);

  // 2. Load current state & check 10-min TTL expiration (Bug 1B: only warn if continuing expired draft)
  let state = store.get(user.userId, nowMs);
  if (
    (state.status === 'COLLECTING' || state.status === 'PREVIEW') &&
    nowMs > state.expiresAtMs
  ) {
    state = store.reset(user.userId, nowMs);
    const expiredNorm = stripPoliteTail(
      normalizeRouterText(unspoofedRaw).replace(EMOJI_PATTERN, ' ').replace(/\s+/g, ' ').trim()
    );
    const isDraftContinuation =
      /^(?:gui\s+di|gui\s+luon|gui\s+don|gui|ok+|oke+|okay+|okie+|dong\s+y|xac\s+nhan|duoc|chot|huy|thoi|khong\s+gui|huy\s+nhap|bo|khong|ca\s+ngay|nguyen\s+ngay|full(?:\s+day)?|buoi\s+sang|buoi\s+chieu|sang|chieu|nua\s+ngay(?:\s+(?:sang|chieu))?|[1-5]|chon\s*[1-5]|co)$/.test(
        expiredNorm
      );
    if (!hadSpoofedRolePrefix && isDraftContinuation) {
      const expiredState: RouterState = { ...state, status: 'EXPIRED' };
      store.set(user.userId, expiredState);
      return {
        handled: true,
        source: 'router',
        text: TPL_DRAFT_EXPIRED,
        templateId: 'TPL_DRAFT_EXPIRED',
        intent: 'DRAFT_EXPIRED',
        state: 'EXPIRED',
      };
    }
  }

  // Normalize terminal states back to IDLE for new turn processing
  if (state.status === 'EXPIRED' || state.status === 'SUBMITTED' || state.status === 'CANCELLED') {
    state = store.reset(user.userId, nowMs);
  }

  // Extract latest assistant message from history for context-aware short replies
  const lastAssistantText =
    params.lastAssistantMessage ??
    [...(params.history ?? [])].reverse().find((m) => m.role === 'assistant')?.content ??
    '';
  const awaitingFollowUp = isAssistantAwaitingFollowUp(lastAssistantText);

  // 2b. History-aware short reply handling when IDLE and assistant asked a specific follow-up question
  if (state.status === 'IDLE' && !hadSpoofedRolePrefix && awaitingFollowUp) {
    const stNormIdle = normalizeForSmalltalkMatch(unspoofedRaw);
    if (stNormIdle && !isLaughRepeatRaw(unspoofedRaw) && isContextDependentShortReply(stNormIdle)) {
      if (isCreateOrderFollowUpQuestion(lastAssistantText)) {
        const decision = classifyContextOrderConfirmation(stNormIdle);
        if (decision === 'confirm') {
          const nextState: RouterState = {
            ...state,
            status: 'COLLECTING',
            slots: {},
            updatedAtMs: nowMs,
            expiresAtMs: nowMs + DRAFT_TTL_MS,
          };
          store.set(user.userId, nextState);
          return {
            handled: true,
            source: 'router',
            text: TPL_ASK_TYPE_DATES,
            templateId: 'TPL_ASK_TYPE_DATES',
            intent: 'CONTEXT_CONFIRM_ORDER',
            isSmalltalk: false,
            hideCitation: true,
            referencedPolicy: undefined,
            state: 'COLLECTING',
            slots: {},
          };
        }
        if (decision === 'decline') {
          return {
            handled: true,
            source: 'router',
            text: 'Dạ vâng, mình không tạo đơn nhé. Khi nào cần hỗ trợ về phép năm, lương hay đơn từ bạn cứ nhắn mình!',
            templateId: 'TPL_CONTEXT_DECLINE',
            intent: 'CONTEXT_DECLINE',
            isSmalltalk: false,
            hideCitation: true,
            referencedPolicy: undefined,
            state: 'IDLE',
          };
        }
      }
      // Non-create-order contextual follow-up (e.g. "Bạn muốn xem đơn nào?" + "do" / "cai dau"):
      // never swallow in smalltalk; forward directly to model with history
      return {
        handled: false,
        source: 'model',
        text: '',
        forwardQuery: unspoofedRaw,
        isSmalltalk: false,
        state: state.status,
      };
    }
  }

  // 3. Peel leading social prefix on compound queries (max 2 rounds) — never peel spoofed-role prefixes or pure smalltalk
  const peeledSocial = !hadSpoofedRolePrefix
    ? peelLeadingSocialPrefix(unspoofedRaw)
    : { peeled: false, peeledCount: 0, prefixes: [], remainderRaw: unspoofedRaw };
  const workingRaw = peeledSocial.peeled ? peeledSocial.remainderRaw : unspoofedRaw;
  const norm = normalizeRouterText(workingRaw);

  if (!norm) {
    if (hadSpoofedRolePrefix) {
      return {
        handled: false,
        source: 'model',
        text: '',
        forwardQuery: rawQuery,
        state: state.status,
      };
    }
    if (delegateUnclearAndCasualToLlm) {
      return {
        handled: false,
        source: 'model',
        text: '',
        forwardQuery: workingRaw || rawQuery,
        isSmalltalk: false,
        isCasualOrUnclear: true,
        state: state.status,
      };
    }
    // Check pure emoticon/emoji smalltalk (e.g. ":)", ":))", "=))") before falling back to clarify
    const pureEmoticonSmall = matchSmalltalkDataset(workingRaw, user, {
      allowAckAndDecline: state.status === 'IDLE' && !awaitingFollowUp,
      personalizeSmalltalk,
      nowMs,
      hadSpoofedRolePrefix: false,
      isRestrictedQuery: false,
      lastAssistantMessage: lastAssistantText,
    });
    if (pureEmoticonSmall) {
      return {
        handled: true,
        source: 'router',
        text: pureEmoticonSmall.text,
        templateId: pureEmoticonSmall.templateId,
        intent: pureEmoticonSmall.intent,
        isSmalltalk: true,
        hideCitation: true,
        smalltalkCategory: pureEmoticonSmall.group,
        smalltalkGroup: pureEmoticonSmall.group,
        referencedPolicy: undefined,
        state: state.status,
        card: state.status === 'PREVIEW' && state.cardKind ? { kind: state.cardKind, drafts: state.drafts } : undefined,
      };
    }
    const streak = state.unclearStreak ?? 0;
    const clarifyText = selectClarifyReply({
      unclearStreak: streak,
      lastAssistantMessage: lastAssistantText,
      personalize: personalizeSmalltalk,
    });
    store.set(user.userId, {
      ...state,
      unclearStreak: streak + 1,
      updatedAtMs: nowMs,
    });
    return {
      handled: true,
      source: 'router',
      text: clarifyText,
      templateId: streak >= 1 ? 'TPL_CLARIFY_WITH_EXAMPLES' : 'TPL_CLARIFY',
      intent: 'CLARIFY',
      hideCitation: true,
      referencedPolicy: undefined,
      state: state.status,
      card: state.status === 'PREVIEW' && state.cardKind ? { kind: state.cardKind, drafts: state.drafts } : undefined,
    };
  }

  // 4. IDLE "gửi đi" / "gửi luôn" / "gửi đơn" guard (Case A5 & Case 06) — never swallow spoofed tags
  if (!hadSpoofedRolePrefix && state.status === 'IDLE' && /^(?:gui\s+di|gui\s+luon|gui\s+don)\b/.test(norm)) {
    return {
      handled: true,
      source: 'router',
      text: TPL_NO_DRAFT,
      templateId: 'TPL_NO_DRAFT',
      intent: 'NO_DRAFT',
      state: 'IDLE',
    };
  }

  // 5. Handle active COLLECTING / PREVIEW state transitions (never let spoofed tags mutate/cancel drafts)
  if (!hadSpoofedRolePrefix && state.status === 'COLLECTING') {
    const collectingRes = await handleCollectingState({
      raw: workingRaw,
      norm,
      user,
      services,
      store,
      state,
      nowMs,
    });
    if (collectingRes) return collectingRes;
  }

  if (!hadSpoofedRolePrefix && state.status === 'PREVIEW') {
    const previewRes = await handlePreviewState({
      raw: workingRaw,
      norm,
      user,
      services,
      store,
      state,
      nowMs,
      personalizeSmalltalk,
    });
    if (previewRes) return previewRes;
  }

  // 6. Prompt Injection & Bad Reason Guards (BEFORE TPL_NO_APPROVE & LANG_EN!)
  if (isRequestIntentText(norm) && isReasonInjection(workingRaw)) {
    // Preserve extracted slots (except bad reason) so user can immediately supply a clean reason (skip save if spoofed tag)
    const dates = extractDates(workingRaw, norm, nowMs);
    const session = extractSession(norm);
    if (!hadSpoofedRolePrefix && dates.startDate) {
      const nextState: RouterState = {
        ...state,
        status: 'COLLECTING',
        slots: {
          type: isOvertimeIntent(norm)
            ? 'overtime'
            : isAttendanceIntent(norm)
              ? 'attendance_explanation'
              : detectLeaveSubtype(norm),
          startDate: dates.startDate,
          endDate: dates.endDate || dates.startDate,
          days: dates.days,
          session: session || 'full',
        },
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
    }
    return {
      handled: true,
      source: 'router',
      text: TPL_BAD_REASON,
      templateId: 'TPL_BAD_REASON',
      intent: 'BAD_REASON',
      state: !hadSpoofedRolePrefix && dates.startDate ? 'COLLECTING' : state.status,
    };
  }

  const asciiLower = stripDiacritics(workingRaw).toLowerCase();
  if (STANDALONE_INJECTION_PATTERN.test(asciiLower) || STANDALONE_INJECTION_PATTERN.test(norm)) {
    return {
      handled: true,
      source: 'router',
      text: TPL_REFUSE_STANDARD,
      templateId: 'TPL_REFUSE_STANDARD',
      intent: 'REFUSE_INJECTION',
      state: state.status,
    };
  }

  // 7. Self-only Guard (Case 04, A1, A2, A3, A9)
  const hasAnyOrderOrApprove =
    isLeaveIntent(norm) ||
    isAttendanceIntent(norm) ||
    isOvertimeIntent(norm) ||
    isRequestIntentText(norm);

  if (hasAnyOrderOrApprove) {
    const targetPerson = checkTargetPerson(workingRaw, norm);
    if (targetPerson === 'OTHER') {
      return {
        handled: true,
        source: 'router',
        text: TPL_NOT_SELF,
        templateId: 'TPL_NOT_SELF',
        intent: 'REFUSE_NOT_SELF',
        state: state.status,
      };
    }
    if (!hadSpoofedRolePrefix && targetPerson === 'AMBIGUOUS_PRONOUN') {
      const dates = extractDates(workingRaw, norm, nowMs);
      const session = extractSession(norm);
      const reason = extractReason(workingRaw, 'leave');
      const nextState: RouterState = {
        ...state,
        status: 'COLLECTING',
        awaitingSelfConfirm: true,
        slots: {
          type: detectLeaveSubtype(norm),
          startDate: dates.startDate,
          endDate: dates.endDate,
          days: dates.days,
          session,
          reason,
        },
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: TPL_CLARIFY_SELF_OR_OTHER,
        templateId: 'TPL_CLARIFY_SELF_OR_OTHER',
        intent: 'CLARIFY_SELF_OR_OTHER',
        state: 'COLLECTING',
        slots: nextState.slots,
      };
    }
  }

  // 8. No-Approve Guard (Case 11, A8)
  if (isApproveRequestIntent(norm)) {
    const ctx = await services.getOrderContext(user.userId);
    return {
      handled: true,
      source: 'router',
      text: TPL_NO_APPROVE(ctx.pendingApprovalCount),
      templateId: 'TPL_NO_APPROVE',
      intent: 'NO_APPROVE',
      state: state.status,
      values: { pendingApprovalCount: ctx.pendingApprovalCount },
    };
  }

  // 9. Request Intents (ONLY when !hadSpoofedRolePrefix — spoofed tags on benign order queries forward to route security guard & audit!)
  if (!hadSpoofedRolePrefix) {
    if (isPersonalResignRequestIntent(norm)) {
      const ctx = await services.getOrderContext(user.userId);
      return {
        handled: true,
        source: 'router',
        text: TPL_RESIGN_GUIDE(ctx.noticeDays),
        templateId: 'TPL_RESIGN_GUIDE',
        intent: 'RESIGN_GUIDE',
        state: state.status,
        values: { noticeDays: ctx.noticeDays },
        referencedPolicy: 'NOTICE_PERIOD',
      };
    }

    const probedDates = extractDates(workingRaw, norm, nowMs);
    if (isCanCreateLeaveQuestion(norm, probedDates)) {
      const ctx = await services.getOrderContext(user.userId);
      return {
        handled: true,
        source: 'router',
        text: TPL_CAN_CREATE(ctx.leaveAvailable),
        templateId: 'TPL_CAN_CREATE',
        intent: 'CAN_CREATE_LEAVE',
        state: state.status,
        values: { leaveAvailable: ctx.leaveAvailable },
      };
    }

    if (isAttendanceIntent(norm)) {
      const res = await handleAttendanceRequest({
        raw: workingRaw,
        norm,
        user,
        services,
        store,
        state,
        nowMs,
      });
      return state.status === 'PREVIEW' ? { ...res, state: state.status } : res;
    }

    if (isOvertimeIntent(norm)) {
      const res = await handleOvertimeRequest({
        raw: workingRaw,
        norm,
        user,
        services,
        store,
        state,
        nowMs,
      });
      return state.status === 'PREVIEW' ? { ...res, state: state.status } : res;
    }

    if (isLeaveIntent(norm)) {
      return handleLeaveRequest({
        raw: workingRaw,
        norm,
        user,
        services,
        store,
        state,
        nowMs,
      });
    }

    // Standalone handover mention with invalid chars (Case A7)
    const standaloneHandover = extractHandoverMention(workingRaw);
    if (standaloneHandover.hasHandoverMention && standaloneHandover.invalidChars) {
      return {
        handled: true,
        source: 'router',
        text: TPL_BAD_HANDOVER,
        templateId: 'TPL_BAD_HANDOVER',
        intent: 'HANDOVER_INVALID',
        state: state.status,
      };
    }

    if (isCancelExistingRequestIntent(norm)) {
      const myRequests = await services.listMyRequests(user.userId);
      const activeReq = myRequests.find(
        (r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS'
      );
      if (!activeReq) {
        return {
          handled: true,
          source: 'router',
          text: 'Hiện bạn không có đơn đang chờ duyệt nào để hủy.',
          templateId: 'TPL_NO_ACTIVE_REQUEST',
          intent: 'CANCEL_REQUEST_NONE',
          state: state.status,
        };
      }
      if (!store.canCreateDraft(user.userId, nowMs, 1)) {
        return {
          handled: true,
          source: 'router',
          text: TPL_RATE_LIMIT_DRAFTS,
          templateId: 'TPL_RATE_LIMIT_DRAFTS',
          intent: 'RATE_LIMIT',
          state: state.status,
        };
      }
      const cancelDraft = await services.draftCancelRequest(user.userId, activeReq.id, nowMs);
      store.recordDraftCreated(user.userId, nowMs, 1);

      const nextState: RouterState = {
        ...state,
        status: 'PREVIEW',
        drafts: [cancelDraft],
        cardKind: 'cancel_confirm',
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + DRAFT_TTL_MS,
      };
      store.set(user.userId, nextState);
      return {
        handled: true,
        source: 'router',
        text: TPL_CANCEL_CONFIRM_GUIDE,
        templateId: 'TPL_CANCEL_CONFIRM_GUIDE',
        intent: 'DRAFT_CANCEL_REQUEST',
        card: { kind: 'cancel_confirm', drafts: [cancelDraft] },
        state: 'PREVIEW',
        values: { draftId: cancelDraft.draftId, targetRequestId: activeReq.id },
      };
    }
  }

  // 10. Smalltalk / Off-topic / Non-Vietnamese (preserve PREVIEW state if active; never swallow spoofed role prefix!)
  if (!hadSpoofedRolePrefix) {
    const small = matchSmalltalkOrOutOfScope(workingRaw, norm, user, {
      allowAck: state.status === 'IDLE' && !awaitingFollowUp,
      personalizeSmalltalk,
      nowMs,
      hadSpoofedRolePrefix,
      lastAssistantMessage: lastAssistantText,
    });
    if (small) {
      if (delegateUnclearAndCasualToLlm) {
        return {
          handled: false,
          source: 'model',
          text: '',
          forwardQuery: workingRaw || rawQuery,
          isSmalltalk: small.isSmalltalk,
          isCasualOrUnclear: true,
          state: state.status,
        };
      }
      return {
        handled: true,
        source: 'router',
        text: small.text,
        templateId: small.templateId,
        intent: small.intent,
        isSmalltalk: small.isSmalltalk,
        hideCitation: small.hideCitation,
        smalltalkCategory: small.smalltalkCategory,
        smalltalkGroup: small.smalltalkGroup,
        referencedPolicy: undefined,
        state: state.status,
        card: state.status === 'PREVIEW' && state.cardKind ? { kind: state.cardKind, drafts: state.drafts } : undefined,
      };
    }

    // 10b. Pure hesitation / filler / gibberish -> delegate to Cloud LLM when available, else 2-tier clarify
    if (isFillerOrGibberishInput(workingRaw) && !isPotentialRestrictedDataQuery(workingRaw)) {
      if (delegateUnclearAndCasualToLlm) {
        return {
          handled: false,
          source: 'model',
          text: '',
          forwardQuery: workingRaw || rawQuery,
          isSmalltalk: false,
          isCasualOrUnclear: true,
          state: state.status,
        };
      }
      const streak = state.unclearStreak ?? 0;
      const clarifyText = selectClarifyReply({
        unclearStreak: streak,
        lastAssistantMessage: lastAssistantText,
        personalize: personalizeSmalltalk,
      });
      store.set(user.userId, {
        ...state,
        unclearStreak: streak + 1,
        updatedAtMs: nowMs,
      });
      return {
        handled: true,
        source: 'router',
        text: clarifyText,
        templateId: streak >= 1 ? 'TPL_CLARIFY_WITH_EXAMPLES' : 'TPL_CLARIFY',
        intent: 'CLARIFY',
        hideCitation: true,
        referencedPolicy: undefined,
        state: state.status,
        card: state.status === 'PREVIEW' && state.cardKind ? { kind: state.cardKind, drafts: state.drafts } : undefined,
      };
    }
  }

  // 11. Forward to Model (preserve rawQuery when spoofed role prefix was present so route security guard blocks & audits it)
  return {
    handled: false,
    source: 'model',
    text: '',
    forwardQuery: hadSpoofedRolePrefix ? rawQuery : workingRaw,
    isSmalltalk: false,
    state: state.status,
  };
}

// ---------------------------------------------------------------------------
// Post-Process Model Reply (Section 8)
// ---------------------------------------------------------------------------

const RESTRICTED_DATA_QUERY_PATTERN =
  /(?:\b(?:luo\s*n\s*g|luog|luomg|luogn|salary|salaries|payroll|payslip|gross|net|thu\s+nhap|phieu\s+luong|bang\s+luong|thuong|bonus|phep|cham\s+cong|di\s+muon|bhxh|kpi|hop\s+dong|contract|cccd|cmnd|sdt|dien\s+thoai|email|dia\s+chi|ngay\s+sinh|ngan\s+hang|ho\s+so|danh\s+sach|nhan\s+vien|employee|employees|staff|ung\s+vien|toan\s+cong\s+ty|phong\s+ban|du\s+lieu|database|db|dump|sql|schema|source|code|ad\s*min|giam\s*d(?:o\s*c|c\s*o|oc|co|c)|director|ceo|bgd|sep|cap\s+tren|truong\s+phong|quan\s+ly|manager|bo\s+phan|nhan\s+su|h\s*r|mat\s+khau|password|token|secret|tai\s+khoan|audit|log|he\s+thong|bao\s+mat|quyen|bo\s+qua|system|prompt|ignore|forget|instructions?|jailbreak|bypass|override|reveal|leak|switch\s+role|act\s+as|pretend|role|context|model|mo\s+hinh|llm|gpt|claude|gemini|gguf|llama|weights|fine[\s-]?tune|qwen|lora|endoftext|im_start|im_end|developer|nguoi\s+khac|dong\s+nghiep|nv\s*-?\s*\d+|duyet|phe\s+duyet|tu\s+choi|tong\s+quy|bao\s+cao|thong\s+ke|burnout)\b|(?:^|[\s/\\'"(\[{])\.env\b)/i;

export function isPotentialRestrictedDataQuery(rawQuery: string): boolean {
  const ascii = stripDiacritics((rawQuery || '').replace(EMOJI_PATTERN, ' '))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!ascii) return false;
  return RESTRICTED_DATA_QUERY_PATTERN.test(ascii);
}

const HRM_KNOWN_CONTEXT_WORDS = new Set([
  'kpi',
  'wfh',
  'cv',
  'jd',
  'ats',
  'hrm',
  'mfa',
  'totp',
  'wifi',
  'burnout',
  'onboarding',
  'offboarding',
  'clearance',
  'probation',
  'payroll',
  'payslip',
  'salary',
  'salaries',
  'admin',
  'director',
  'manager',
  'hr',
  'ceo',
  'bgd',
  'gross',
  'net',
  'ignore',
  'system',
  'prompt',
  'jailbreak',
  'bypass',
  'bhxh',
  'bhyt',
  'bhtn',
  'tncn',
  'cccd',
  'cmnd',
  'sdt',
  'ot',
  'model',
  'llm',
  'gpt',
  'claude',
  'gemini',
  'gguf',
  'llama',
  'weights',
  'context',
  'forget',
  'instructions',
  'pretend',
]);

const PURE_FILLER_PATTERN =
  /^(?:hm+|uhm+|um+|a|o|e|ha|ho|ua|ay|ay\s+da|o\s+kia|ec)$/;

const VN_SYLLABLE_REGEX =
  /^(?:ngh|ng|nh|ch|tr|th|ph|kh|gh|gi|qu|[bcdghklmnpqrstvx])?[aeiouy]{1,3}(?:ng|nh|ch|[cmnpt])?$/;

function isValidVietnameseOrKnownToken(token: string): boolean {
  if (!token) return false;
  if (
    VIETNAMESE_SIGNAL_WORDS.has(token) ||
    ENGLISH_SIGNAL_WORDS.has(token) ||
    HRM_KNOWN_CONTEXT_WORDS.has(token) ||
    /^nv\d+/.test(token)
  ) {
    return true;
  }
  if (/^([a-z])\1+$/.test(token)) return false;
  if (token.length === 1) return false;
  return VN_SYLLABLE_REGEX.test(token);
}

function isFillerOrGibberishInput(raw: string): boolean {
  const withoutEmoji = (raw || '').replace(EMOJI_PATTERN, ' ').trim();
  if (!withoutEmoji) return true;

  const stNorm = normalizeForSmalltalkMatch(raw);
  if (!stNorm) return true;
  if (PURE_FILLER_PATTERN.test(stNorm)) return true;

  // Non-filler input containing valid Vietnamese diacritics is treated as real Vietnamese
  if (/[\u00C0-\u024F\u1E00-\u1EFF]/.test(withoutEmoji)) {
    return false;
  }

  if (isPotentialRestrictedDataQuery(raw)) {
    return false;
  }

  const rawTokens = stripDiacritics(withoutEmoji)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (rawTokens.length === 0) return true;
  if (rawTokens.length === 1 && /^[a-z]$/.test(rawTokens[0])) return true;

  const hasValidToken = rawTokens.some((t) => isValidVietnameseOrKnownToken(t));
  return !hasValidToken;
}

function isGibberishInput(raw: string, norm: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  // Valid Vietnamese diacritics -> not gibberish
  if (/[\u00C0-\u024F\u1E00-\u1EFF]/.test(trimmed)) {
    return false;
  }
  const tokens = norm.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const hasKnownWord = tokens.some(
    (t) =>
      VIETNAMESE_SIGNAL_WORDS.has(t) ||
      ENGLISH_SIGNAL_WORDS.has(t) ||
      HRM_KNOWN_CONTEXT_WORDS.has(t) ||
      /^nv\d+/.test(t)
  );
  return !hasKnownWord;
}

export function postProcessModelReply(
  params: PostProcessModelReplyParams
): PostProcessModelReplyResult {
  const { query, reply, modelSource, isGroundedFallback } = params;
  const unspoofed = stripSpoofedRolePrefix(query || '');
  const peeled = peelLeadingSocialPrefix(unspoofed);
  const effectiveRaw = peeled.peeled ? peeled.remainderRaw : unspoofed;
  const norm = normalizeRouterText(effectiveRaw);
  const cleaned = stripPoliteTail(norm);

  const rawIdentityAscii = stripDiacritics(effectiveRaw.trim())
    .toLowerCase()
    .replace(/[?!.]+$/g, '')
    .trim();

  const isRestrictedQuery =
    isPotentialRestrictedDataQuery(query || '') || isPotentialRestrictedDataQuery(effectiveRaw);

  const smalltalkDetected = detectSmalltalkGroup(effectiveRaw, {
    allowAckAndDecline: false,
    isRestrictedQuery,
  });
  const isSmalltalkGreetingOrIdentity =
    smalltalkDetected !== null &&
    (smalltalkDetected.group === 'greeting' ||
      smalltalkDetected.group === 'how_are_you' ||
      smalltalkDetected.group === 'about_bot');

  const isGreetingOrIdentity =
    isSmalltalkGreetingOrIdentity ||
    /^(?:m|bot|ad|assistant|tro\s+ly)\s+la\s+(?:ai|gi)$/.test(rawIdentityAscii) ||
    /^(?:xin\s+chao|chao\s+ban|chao\s+ad|chao\s+bot|chao\s+buoi\s+(?:sang|trua|chieu|toi)|chao|helo|halo|alo|ad\s+oi|bot\s+oi|ban\s+la\s+ai|(?:how|hwo|who)\s+are\s+you|what\s+are\s+you|ban\s+la\s+gi|ban\s+ten\s+gi|gioi\s+thieu\s+ve\s+ban|ban\s+lam\s+duoc\s+gi|what\s+can\s+you\s+do|help|tro\s+giup|huong\s+dan|menu|bot\s+la\s+ai|good\s+(?:morning|afternoon|evening|night))$/.test(
      cleaned
    ) ||
    /^(?:hi+|hello+|hey+)(?:\s+(?:there|bot|ad|admin|ban|anh|chi|em|lac\s*viet|copilot))?$/.test(
      cleaned
    );

  const trimmedReply = (reply || '').trim();
  const startsWithBotIntro =
    /^(?:(?:xin\s+lỗi|chào\s+bạn)[\s,!.]*)?(?:mình|tôi)\s+là\s+trợ\s+lý\s+lạc\s+việt/i.test(
      trimmedReply
    );
  const isPermissionRefusal =
    trimmedReply === TPL_REFUSE_STANDARD || /vượt quá quyền truy cập/i.test(trimmedReply);
  const isModelMissingData =
    /^mình chưa có dữ liệu/i.test(trimmedReply) ||
    /^tôi không có thông tin này/i.test(trimmedReply);
  const isFalsePermissionRefusal = isPermissionRefusal && !isRestrictedQuery;
  const isGibberishMissingData =
    !isRestrictedQuery &&
    isModelMissingData &&
    (isGibberishInput(effectiveRaw, norm) || isFillerOrGibberishInput(effectiveRaw));

  if (params.isCloudConversationalReply) {
    if (isFalsePermissionRefusal) {
      return {
        text: selectClarifyReply({
          unclearStreak: params.unclearStreak ?? 0,
          lastAssistantMessage: params.lastAssistantMessage,
          personalize: Boolean(params.personalizeSmalltalk),
        }),
        replacedWithClarify: true,
        source: 'router',
      };
    }
    return {
      text: reply,
      replacedWithClarify: false,
    };
  }

  if (
    isFalsePermissionRefusal ||
    (!isGreetingOrIdentity && startsWithBotIntro) ||
    (modelSource === 'fallback' && !isGroundedFallback && !isPermissionRefusal) ||
    isGibberishMissingData
  ) {
    return {
      text: selectClarifyReply({
        unclearStreak: params.unclearStreak ?? 0,
        lastAssistantMessage: params.lastAssistantMessage,
        personalize: Boolean(params.personalizeSmalltalk),
      }),
      replacedWithClarify: true,
      source: 'router',
    };
  }

  return {
    text: reply,
    replacedWithClarify: false,
  };
}
