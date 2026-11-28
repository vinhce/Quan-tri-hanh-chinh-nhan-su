import {
  detectSmalltalkGroup,
  renderSmalltalkGroupReply,
} from '@/lib/copilot/smalltalk';
import {
  TPL_CAN_CREATE,
  TPL_NO_APPROVE,
  TPL_NOT_SELF,
  TPL_OFF_TOPIC,
  TPL_REFUSE_STANDARD,
  TPL_RESIGN_GUIDE,
} from '@/lib/hrm/copilot-router';
import type { LocalNluResult, LocalServerStatus } from '@/lib/copilot/local-nlu';
import { getPitTaxConfigForPeriod } from '@/lib/hrm/config';

export interface LocalTemplateDataContext {
  actorRole: string;
  actorRoleLabel: string;
  actorEmployeeCode: string;
  actorFullName: string;
  actorDepartment: string;
  isProbation: boolean;
  leaveBalance: {
    standard: number;
    carriedOver: number;
    used: number;
    pending: number;
    remaining: number;
    year: number;
  } | null;
  noticeDays: number;
  pendingApprovalCount: number | null;
  lookupDepartmentLeave?: (departmentSlot: string) => { allowed: boolean; reply: string } | null;
  lookupEmployeeLeave?: (employeeCode: string) => string | null;
  lookupOwnPayslip?: () => string | null;
  lookupAdminPayrollTargets?: (query: string) => string | null;
  lookupOrgStructure?: (query: string, topic: string | null) => string | null;
  delegateOrderToRouter?: (
    nlu: LocalNluResult
  ) => Promise<{ handled: boolean; text: string; card?: unknown } | null>;
}

export interface Tier3Or4RenderResult {
  tier: 'template' | 'smalltalk' | 'clarify';
  intent: string;
  text: string;
  isSmalltalk: boolean;
  hideCitation: boolean;
  referencedPolicy: string;
  card?: unknown;
  suggestions?: string[];
}

export const CLARIFY_QUICK_SUGGESTIONS = [
  'Mình còn bao nhiêu ngày phép năm?',
  'Quy chế chấm công và tính công như thế nào?',
  'Nghỉ việc cần báo trước bao nhiêu ngày?',
] as const;

export const CLARIFY_WITH_SUGGESTIONS_TEXT =
  'Mình chưa rõ ý bạn muốn hỏi nội dung nào. Bạn có thể chọn nhanh hoặc hỏi cụ thể hơn: (1) Mình còn bao nhiêu ngày phép năm? (2) Quy chế chấm công và tính công? (3) Nghỉ việc báo trước bao nhiêu ngày?';

export const GIBBERISH_CLARIFY_TEXT =
  'Mình không đọc ra câu này, bạn gõ lại giúp mình nhé.';

function stripAscii(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function buildLeavePolicyTemplate(queryAscii: string): string {
  if (/\bthu\s+viec\b|\bprobation\b/i.test(queryAscii)) {
    return 'Nhân sự đang thử việc chưa có phép năm (0 ngày khả dụng) và chưa trích đóng BHXH; khi cần nghỉ có thể tạo đơn Nghỉ không hưởng lương. Quỹ phép năm 12 ngày/năm áp dụng sau khi ký hợp đồng chính thức.';
  }
  return 'Quy chế nghỉ phép năm: nhân sự chính thức có 12 ngày/năm (tăng thêm 1 ngày mỗi 5 năm thâm niên), nhân sự thử việc có 0 ngày. Phép tồn năm cũ được chuyển sang dùng đến hết 31/03 năm sau; mỗi đơn chia tối thiểu 0,5 ngày, nghỉ ốm cần chứng từ y tế (nộp lùi tối đa 3 ngày), nghỉ không lương từ 14 ngày/tháng được miễn đóng BHXH.';
}

function buildAttendancePolicyTemplate(): string {
  return 'Quy chế chấm công: tháng chuẩn 22 công; gồm 3 ca 8 giờ (08:00–17:00, 08:30–17:30 mặc định và 09:00–18:00, nghỉ trưa 12:00–13:00). Quy đổi công ngày: từ 6,5 giờ trở lên tính 1,0 công, từ 3,5 đến dưới 6,5 giờ tính 0,5 công, dưới 3,5 giờ là 0,0 công; chốt công ngày 25 hàng tháng và được giải trình đi muộn tối đa 3 lần/tháng trong vòng 7 ngày.';
}

function buildOvertimePolicyTemplate(): string {
  return 'Quy chế làm thêm giờ (OT): hệ số lương OT là 150% (1,5x) ngày thường, 200% (2,0x) cuối tuần và 300% (3,0x) ngày lễ/Tết trên đơn giá giờ chuẩn (lương cơ bản / 176). Áp dụng cho nhân sự chính thức, tối đa 12 giờ/đơn, trần 40 giờ/tháng và hệ thống cảnh báo khi vượt 30 giờ/tháng.';
}

function formatVndDot(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;
}

export function buildPitTaxPolicyText(queryAscii: string): string {
  const yearMatch = queryAscii.match(/\b(20\d{2})\b/);
  const queriedYear = yearMatch ? Number(yearMatch[1]) : 2026;
  const schedule = getPitTaxConfigForPeriod(queriedYear);

  if (schedule.tax_year <= 2025) {
    return (
      `Quy định thuế TNCN áp dụng cho kỳ ${queriedYear} (từ kỳ 2025 trở về trước theo Nghị quyết 954/2020/UBTVQH14 & Luật Thuế TNCN 2007): ` +
      `giảm trừ gia cảnh bản thân ${formatVndDot(schedule.personal_deduction_vnd)}/tháng (${formatVndDot(schedule.personal_deduction_annual_vnd)}/năm), ` +
      `mỗi người phụ thuộc ${formatVndDot(schedule.dependent_deduction_vnd)}/tháng; ` +
      `biểu thuế lũy tiến ${schedule.bracket_count} bậc (5% đến 5 triệu; 10% trên 5–10 triệu; 15% trên 10–18 triệu; 20% trên 18–32 triệu; 25% trên 32–52 triệu; 30% trên 52–80 triệu; 35% trên 80 triệu). ` +
      `Lưu ý: từ kỳ tính thuế 2026 áp dụng mức mới 15.500.000 ₫/tháng (bản thân), 6.200.000 ₫/tháng (người phụ thuộc) và biểu 5 bậc.`
    );
  }

  return (
    `Theo Nghị quyết 110/2025/UBTVQH15 và Luật Thuế TNCN 109/2025/QH15 (áp dụng từ kỳ tính thuế 2026 trở đi): ` +
    `giảm trừ gia cảnh bản thân là ${formatVndDot(schedule.personal_deduction_vnd)}/tháng (${formatVndDot(schedule.personal_deduction_annual_vnd)}/năm), ` +
    `giảm trừ mỗi người phụ thuộc là ${formatVndDot(schedule.dependent_deduction_vnd)}/tháng; ` +
    `biểu thuế lũy tiến từng phần gồm ${schedule.bracket_count} bậc theo thu nhập tính thuế/tháng: ` +
    `bậc 1 đến 10 triệu (5%), bậc 2 trên 10 đến 30 triệu (15%), bậc 3 trên 30 đến 60 triệu (25%), bậc 4 trên 60 đến 100 triệu (30%), bậc 5 trên 100 triệu (35%). ` +
    `(Các kỳ từ 2025 trở về trước vẫn giữ nguyên mức cũ 11.000.000 ₫/tháng bản thân, 4.400.000 ₫/tháng người phụ thuộc và biểu 7 bậc).`
  );
}

function buildPayrollPolicyTemplate(queryAscii: string, topic: string | null): string {
  const normTopic = stripAscii(topic || '');
  if (
    /\bdang\s*nhap|login|xac\s*thuc\b/i.test(queryAscii) ||
    normTopic.includes('dang_nhap') ||
    normTopic.includes('login')
  ) {
    return 'Có, bạn bắt buộc phải đăng nhập đúng tài khoản để tra cứu phiếu lương, phép năm và dữ liệu nhân sự theo đúng phân quyền.';
  }
  if (/\bthu\s+viec\b|\bprobation\b|85\s*%/i.test(queryAscii) || normTopic.includes('thu_viec')) {
    return 'Trong thời gian thử việc, nhân sự được hưởng 85% mức lương chính thức của vị trí và chưa trích đóng bảo hiểm bắt buộc; từ kỳ chính thức hưởng 100% lương.';
  }
  if (
    /(?:thue|tncn|giam\s*tru|gia\s*canh|nguoi\s*phu\s*thuoc|phu\s*thuoc|bieu\s*thue|luy\s*tien)/i.test(
      queryAscii
    ) ||
    normTopic.includes('thue')
  ) {
    return buildPitTaxPolicyText(queryAscii);
  }
  const currentPit = getPitTaxConfigForPeriod(2026);
  return (
    `Quy chế lương & khấu trừ: chốt công ngày 25 và chi trả lương ngày 05 tháng sau. ` +
    `Nhân sự chính thức đóng BHXH 10,5% (8% BHXH, 1,5% BHYT, 1% BHTN; doanh nghiệp đóng 23,5%; trần lương đóng BHXH 46.800.000 ₫/tháng); ` +
    `thuế TNCN kỳ hiện tại (2026) áp dụng giảm trừ bản thân ${formatVndDot(currentPit.personal_deduction_vnd)}/tháng, người phụ thuộc ${formatVndDot(currentPit.dependent_deduction_vnd)}/người/tháng theo biểu lũy tiến ${currentPit.bracket_count} bậc.`
  );
}

function buildResignPolicyTemplate(): string {
  return 'Theo Điều 27 và Điều 35 Bộ luật Lao động 2019, thời hạn báo trước khi nghỉ việc là: 45 ngày với hợp đồng không xác định thời hạn, 30 ngày với hợp đồng xác định thời hạn 12–36 tháng, và 3 ngày làm việc với hợp đồng dưới 12 tháng hoặc thử việc. Nhân sự cần hoàn tất 6 hạng mục bàn giao trước khi tất toán lương kỳ cuối.';
}

function buildMissingOrderPrompt(nlu: LocalNluResult): string {
  const { leave_type, date_from, duration } = nlu.slots;
  if (leave_type === 'attendance_explanation' || nlu.intent === 'attendance_explain') {
    return 'Để mình chuẩn bị đề xuất đơn Giải trình chấm công cho bạn kiểm tra, bạn nhắn giúp mình ngày cần giải trình, giờ vào/ra thực tế và lý do nhé.';
  }
  if (leave_type === 'overtime' || nlu.intent === 'overtime_create') {
    return 'Để mình chuẩn bị đề xuất đơn Làm thêm giờ (OT), bạn nhắn giúp mình ngày làm thêm, khung giờ bắt đầu–kết thúc và lý do công việc nhé.';
  }
  if (!date_from && !duration) {
    return 'Bạn muốn xin nghỉ loại nào (phép năm, không lương hay nghỉ ốm), từ ngày nào đến ngày nào và lý do gì để mình chuẩn bị nháp cho bạn kiểm tra nhé?';
  }
  return `Mình đã ghi nhận yêu cầu tạo đơn${date_from ? ` từ ${date_from}` : ''}${duration ? ` (${duration})` : ''}. Bạn cho mình biết thêm loại nghỉ, buổi (cả ngày/sáng/chiều) và lý do để mình lập nháp kiểm tra nhé.`;
}

function isOtherEmployeeCode(
  employeeCodeSlot: string | null,
  actorEmployeeCode: string
): boolean {
  if (!employeeCodeSlot) return false;
  const normalizedSlot = employeeCodeSlot.trim().toUpperCase();
  const normalizedActor = actorEmployeeCode.trim().toUpperCase();
  if (!normalizedSlot) return false;
  return normalizedSlot !== normalizedActor;
}

export async function renderTier3OrTier4Reply(params: {
  query: string;
  nlu: LocalNluResult | null;
  nluErrorCode?: string;
  confidenceThreshold: number;
  isKeyboardSmash: boolean;
  localStatus?: LocalServerStatus | 'skipped';
  localStatusMessage?: string;
  ctx: LocalTemplateDataContext;
  shortSmalltalkGenerator?: (query: string) => Promise<string | null>;
}): Promise<Tier3Or4RenderResult> {
  const {
    query,
    nlu,
    nluErrorCode,
    confidenceThreshold,
    isKeyboardSmash,
    localStatus,
    localStatusMessage,
    ctx,
    shortSmalltalkGenerator,
  } = params;

  if (isKeyboardSmash) {
    return {
      tier: 'clarify',
      intent: 'gibberish',
      text: GIBBERISH_CLARIFY_TEXT,
      isSmalltalk: false,
      hideCitation: true,
      referencedPolicy: '',
    };
  }

  if (localStatus === 'warming_up') {
    return {
      tier: 'clarify',
      intent: 'local_warming_up',
      text:
        localStatusMessage ||
        'Trợ lý nội bộ đang khởi động, bạn vui lòng thử lại sau vài giây hoặc hỏi trực tiếp về phép năm, quy chế chấm công, nghỉ việc.',
      isSmalltalk: false,
      hideCitation: true,
      referencedPolicy: '',
      suggestions: [...CLARIFY_QUICK_SUGGESTIONS],
    };
  }

  if (localStatus === 'unavailable' && !nlu) {
    return {
      tier: 'clarify',
      intent: 'local_unavailable',
      text:
        localStatusMessage ||
        'Trợ lý nội bộ hiện chưa sẵn sàng. Bạn có thể thử lại hoặc chọn nhanh các chủ đề hỗ trợ dưới đây.',
      isSmalltalk: false,
      hideCitation: true,
      referencedPolicy: '',
      suggestions: [...CLARIFY_QUICK_SUGGESTIONS],
    };
  }

  if (!nlu || nluErrorCode) {
    return {
      tier: 'clarify',
      intent: 'clarify',
      text: CLARIFY_WITH_SUGGESTIONS_TEXT,
      isSmalltalk: false,
      hideCitation: true,
      referencedPolicy: '',
      suggestions: [...CLARIFY_QUICK_SUGGESTIONS],
    };
  }

  if (nlu.intent === 'unclear' || nlu.confidence < confidenceThreshold) {
    return {
      tier: 'clarify',
      intent: 'clarify',
      text: CLARIFY_WITH_SUGGESTIONS_TEXT,
      isSmalltalk: false,
      hideCitation: true,
      referencedPolicy: '',
      suggestions: [...CLARIFY_QUICK_SUGGESTIONS],
    };
  }

  const queryAscii = stripAscii(query);

  switch (nlu.intent) {
    case 'cross_employee_blocked':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: TPL_REFUSE_STANDARD,
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Chính sách Phân quyền & Bảo mật Dữ liệu Nhân sự (RBAC)',
      };

    case 'request_approve_blocked':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: TPL_NO_APPROVE(ctx.pendingApprovalCount),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Quy trình Phê duyệt Đơn từ Nội bộ',
      };

    case 'leave_balance': {
      if (isOtherEmployeeCode(nlu.slots.employee_code, ctx.actorEmployeeCode)) {
        if (ctx.actorRole === 'SUPER_ADMIN' && nlu.slots.employee_code) {
          const empLeave = ctx.lookupEmployeeLeave?.(nlu.slots.employee_code);
          if (empLeave) {
            return {
              tier: 'template',
              intent: nlu.intent,
              text: empLeave,
              isSmalltalk: false,
              hideCitation: false,
              referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
            };
          }
        }
        return {
          tier: 'template',
          intent: 'cross_employee_blocked',
          text: TPL_REFUSE_STANDARD,
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Chính sách Phân quyền & Bảo mật Dữ liệu Nhân sự (RBAC)',
        };
      }
      if (nlu.slots.department) {
        if (ctx.actorRole === 'DEPT_MANAGER' && !ctx.actorDepartment) {
          return {
            tier: 'template',
            intent: 'cross_employee_blocked',
            text: 'Tài khoản của bạn chưa được gắn phòng ban, vui lòng liên hệ quản trị để cập nhật.',
            isSmalltalk: false,
            hideCitation: false,
            referencedPolicy: 'Chính sách Phân quyền & Bảo mật Dữ liệu Nhân sự (RBAC)',
          };
        }
        const deptRes = ctx.lookupDepartmentLeave?.(nlu.slots.department);
        if (!deptRes || !deptRes.allowed) {
          return {
            tier: 'template',
            intent: 'cross_employee_blocked',
            text: TPL_REFUSE_STANDARD,
            isSmalltalk: false,
            hideCitation: false,
            referencedPolicy: 'Chính sách Phân quyền & Bảo mật Dữ liệu Nhân sự (RBAC)',
          };
        }
        return {
          tier: 'template',
          intent: nlu.intent,
          text: deptRes.reply,
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
        };
      }
      if (ctx.isProbation) {
        return {
          tier: 'template',
          intent: nlu.intent,
          text: 'Bạn đang trong thời gian thử việc nên số ngày phép năm khả dụng là 0 ngày. Khi cần nghỉ, bạn có thể đề xuất đơn Nghỉ không hưởng lương.',
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
        };
      }
      if (!ctx.leaveBalance) {
        return {
          tier: 'template',
          intent: nlu.intent,
          text: 'Mình chưa thấy bảng quỹ phép năm hiện tại của bạn trên hệ thống, bạn liên hệ phòng HR để kiểm tra đồng bộ nhé.',
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
        };
      }
      const b = ctx.leaveBalance;
      return {
        tier: 'template',
        intent: nlu.intent,
        text: `Bạn hiện còn ${b.remaining} ngày phép khả dụng (tiêu chuẩn ${b.standard} ngày + chuyển giao ${b.carriedOver} ngày, đã dùng ${b.used} ngày, chờ duyệt ${b.pending} ngày; hạn dùng phép năm ${b.year} đến 31/03/${b.year + 1}).`,
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
      };
    }

    case 'leave_policy':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: buildLeavePolicyTemplate(queryAscii),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
      };

    case 'attendance_policy':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: buildAttendancePolicyTemplate(),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Quy chế Chấm công & Thời giờ làm việc 2026',
      };

    case 'overtime_policy':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: buildOvertimePolicyTemplate(),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Quy chế Làm thêm giờ (OT) & Thời giờ làm việc 2026',
      };

    case 'payroll_self': {
      const asksOtherDeptOrEmp =
        Boolean(nlu.slots.department) ||
        isOtherEmployeeCode(nlu.slots.employee_code, ctx.actorEmployeeCode);
      if (asksOtherDeptOrEmp && ctx.actorRole !== 'SUPER_ADMIN') {
        return {
          tier: 'template',
          intent: 'cross_employee_blocked',
          text: TPL_REFUSE_STANDARD,
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Chính sách Phân quyền & Bảo mật Dữ liệu Nhân sự (RBAC)',
        };
      }
      if (ctx.actorRole === 'SUPER_ADMIN') {
        const adminReply = ctx.lookupAdminPayrollTargets?.(query);
        if (adminReply) {
          return {
            tier: 'template',
            intent: nlu.intent,
            text: adminReply,
            isSmalltalk: false,
            hideCitation: false,
            referencedPolicy: 'Phụ lục 02 - Quy chế Tiền lương & Thuế TNCN',
          };
        }
      }
      const payslipReply = ctx.lookupOwnPayslip?.();
      if (payslipReply) {
        return {
          tier: 'template',
          intent: nlu.intent,
          text: payslipReply,
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Phụ lục 02 - Quy chế Tiền lương & Thuế TNCN',
        };
      }
      return {
        tier: 'template',
        intent: nlu.intent,
        text: 'Mình chưa thấy phiếu lương kỳ hiện tại của bạn. Hệ thống chốt công ngày 25 và chi trả lương ngày 05 hàng tháng, bạn có thể kiểm tra tại mục Phiếu lương hoặc liên hệ phòng HR.',
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Phụ lục 02 - Quy chế Tiền lương & Thuế TNCN',
      };
    }

    case 'payroll_policy':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: buildPayrollPolicyTemplate(queryAscii, nlu.slots.topic),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Phụ lục 02 - Quy chế Tiền lương & Khấu trừ Bảo hiểm',
      };

    case 'resign_request':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: TPL_RESIGN_GUIDE(ctx.noticeDays),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Quy trình Offboarding & Điều 35 Bộ luật Lao động 2019',
      };

    case 'resign_policy':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: buildResignPolicyTemplate(),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Điều 35 Bộ luật Lao động 2019 & Quy trình Offboarding Nội bộ',
      };

    case 'org_structure': {
      const orgText = ctx.lookupOrgStructure?.(query, nlu.slots.topic);
      if (orgText) {
        return {
          tier: 'template',
          intent: nlu.intent,
          text: orgText,
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Cơ cấu Tổ chức & Hồ sơ Nhân sự Lạc Việt',
        };
      }
      return {
        tier: 'template',
        intent: nlu.intent,
        text: 'Bạn có thể hỏi cụ thể số lượng nhân sự, cơ cấu phòng ban hoặc đầu mối Nhân sự (HR) và Ban Giám đốc tùy theo phạm vi phân quyền của mình nhé.',
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Cơ cấu Tổ chức Lạc Việt',
      };
    }

    case 'request_capability':
      return {
        tier: 'template',
        intent: nlu.intent,
        text: TPL_CAN_CREATE(ctx.leaveBalance?.remaining ?? (ctx.isProbation ? 0 : 12)),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
      };

    case 'leave_create':
    case 'attendance_explain':
    case 'overtime_create': {
      if (isOtherEmployeeCode(nlu.slots.employee_code, ctx.actorEmployeeCode)) {
        return {
          tier: 'template',
          intent: 'cross_employee_blocked',
          text: TPL_NOT_SELF,
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Chính sách Tạo đơn Cá nhân',
        };
      }
      const delegated = await ctx.delegateOrderToRouter?.(nlu);
      if (delegated && delegated.handled && delegated.text) {
        return {
          tier: 'template',
          intent: nlu.intent,
          text: delegated.text,
          isSmalltalk: false,
          hideCitation: false,
          referencedPolicy: 'Quy trình Tạo đơn Nội bộ',
          card: delegated.card ?? null,
        };
      }
      return {
        tier: 'template',
        intent: nlu.intent,
        text: buildMissingOrderPrompt(nlu),
        isSmalltalk: false,
        hideCitation: false,
        referencedPolicy: 'Quy trình Tạo đơn Nội bộ',
      };
    }

    case 'smalltalk_greeting': {
      const greetingText = renderSmalltalkGroupReply({
        group: 'greeting',
        user: {
          userId: ctx.actorEmployeeCode,
          fullName: ctx.actorFullName,
          employeeCode: ctx.actorEmployeeCode,
          roleLabel: ctx.actorRoleLabel,
        },
        personalize: true,
        seedText: query,
      });
      return {
        tier: 'smalltalk',
        intent: nlu.intent,
        text: greetingText,
        isSmalltalk: true,
        hideCitation: true,
        referencedPolicy: '',
      };
    }

    case 'out_of_scope':
      return {
        tier: 'smalltalk',
        intent: nlu.intent,
        text: TPL_OFF_TOPIC,
        isSmalltalk: true,
        hideCitation: true,
        referencedPolicy: '',
      };

    case 'smalltalk_chat': {
      const hit = detectSmalltalkGroup(query, { allowAckAndDecline: true });
      if (hit) {
        const reply = renderSmalltalkGroupReply({
          group: hit.group,
          user: {
            userId: ctx.actorEmployeeCode,
            fullName: ctx.actorFullName,
            employeeCode: ctx.actorEmployeeCode,
            roleLabel: ctx.actorRoleLabel,
          },
          personalize: true,
          seedText: hit.seedText,
        });
        return {
          tier: 'smalltalk',
          intent: `smalltalk_${hit.group}`,
          text: reply,
          isSmalltalk: true,
          hideCitation: true,
          referencedPolicy: '',
        };
      }
      if (shortSmalltalkGenerator) {
        const shortText = await shortSmalltalkGenerator(query).catch(() => null);
        if (shortText && shortText.trim()) {
          return {
            tier: 'smalltalk',
            intent: nlu.intent,
            text: shortText.trim(),
            isSmalltalk: true,
            hideCitation: true,
            referencedPolicy: '',
          };
        }
      }
      return {
        tier: 'smalltalk',
        intent: nlu.intent,
        text: 'Mình là Trợ lý Nhân sự Lạc Việt. Bạn cần mình hỗ trợ tra cứu phép năm, quy chế chấm công, phiếu lương hay đề xuất đơn từ cứ nhắn mình nhé.',
        isSmalltalk: true,
        hideCitation: true,
        referencedPolicy: '',
      };
    }
  }
}
