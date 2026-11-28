import { CopilotSampleQA, NaturalLanguageLeaveDraft } from './types';

export const MOCK_COPILOT_QA: CopilotSampleQA[] = [
  {
    id: 'qa-001',
    role_scope: 'EMPLOYEE',
    prompt_label: 'Tra cứu số ngày phép năm còn lại của tôi',
    user_query: 'Tôi còn bao nhiêu ngày phép năm 2026 và cách tính phép tồn từ năm 2025 sang?',
    ai_response:
      'Theo dữ liệu chấm công cập nhật đến ngày 17/11/2026, hồ sơ Phạm Minh Tuấn (NV-2024-004) có tổng tiêu chuẩn 12 ngày phép năm 2026 cộng 2 ngày phép chuyển giao từ năm 2025. Bạn đã sử dụng 2 ngày và đang có 1 đơn chờ duyệt 2 ngày (REQ-202611-084), số dư phép khả dụng còn lại là 10 ngày. Theo Điều 14 Nội quy lao động, phép chuyển giao từ năm cũ có hiệu lực sử dụng đến hết ngày 31/03 năm kế tiếp.',
    referenced_policy: 'Điều 14 - Quy chế Nghỉ phép & Thời giờ làm việc 2026',
    metrics_cited: [
      { label: 'Tổng quỹ phép 2026', value: '14 ngày' },
      { label: 'Đã nghỉ / Chờ duyệt', value: '2 / 2 ngày' },
      { label: 'Còn khả dụng', value: '10 ngày' },
    ],
  },
  {
    id: 'qa-002',
    role_scope: 'EMPLOYEE',
    prompt_label: 'Giải thích cách tính thuế TNCN kỳ lương tháng 11/2026',
    user_query: 'Giải thích giúp tôi các khoản khấu trừ bảo hiểm và thuế TNCN trên phiếu lương PS-202611-004.',
    ai_response:
      'Phiếu lương PS-202611-004 của bạn có tổng thu nhập Gross là 34.650.000 ₫ (gồm lương cơ bản 22.800.000 ₫, phụ cấp 3.500.000 ₫, lương tăng ca 5.850.000 ₫ và thưởng KPI 2.500.000 ₫). Khoản trích đóng bảo hiểm bắt buộc tính trên lương cơ bản 22.800.000 ₫ gồm: BHXH 8% (1.824.000 ₫), BHYT 1.5% (342.000 ₫), BHTN 1% (228.000 ₫), tổng cộng 2.394.000 ₫. Áp dụng biểu thuế kỳ 2026 (NQ 110/2025/UBTVQH15 & Luật Thuế TNCN 109/2025/QH15), sau khi trừ giảm trừ bản thân 15.500.000 ₫ và 1 người phụ thuộc 6.200.000 ₫, thu nhập tính thuế là 10.556.000 ₫ (thuộc bậc 2/5 thuế suất 15% trừ nhanh 1.000.000 ₫), thuế TNCN phải nộp là 583.400 ₫. Lương thực nhận (Net) là 31.672.600 ₫.',
    referenced_policy: 'Phụ lục 02 - Quy chế Tiền lương & Khấu trừ Thuế TNCN lũy tiến 5 bậc (NQ 110/2025/UBTVQH15)',
    metrics_cited: [
      { label: 'Tổng thu nhập Gross', value: '34.650.000 ₫' },
      { label: 'BHXH + BHYT + BHTN (10.5%)', value: '2.394.000 ₫' },
      { label: 'Thuế TNCN bậc 2 (5 bậc)', value: '583.400 ₫' },
      { label: 'Thực nhận (Net)', value: '31.672.600 ₫' },
    ],
  },
  {
    id: 'qa-003',
    role_scope: 'HR_MANAGER',
    prompt_label: 'Tổng hợp nhân sự có nguy cơ Burnout & sắp hết hạn hợp đồng',
    user_query: 'Liệt kê các nhân sự kỹ thuật có điểm rủi ro Burnout cao kèm tình trạng hợp đồng trong tháng 11 - 12/2026.',
    ai_response:
      'Hệ thống ghi nhận 2 nhân sự thuộc Phòng Kỹ thuật Phần mềm cần ưu tiên làm việc trong tuần này: (1) Phạm Minh Tuấn (NV-2024-004) có điểm rủi ro Burnout 82/100 (mức Nghiêm trọng) do tăng ca 38 giờ trong 30 ngày qua, đồng thời hợp đồng 24 tháng sẽ hết hạn vào ngày 15/12/2026 (còn 28 ngày). (2) Bùi Trọng Nghĩa (NV-2025-009) có điểm Burnout 74/100 (mức Cao), đi muộn 5 lần trong tháng và hợp đồng hết hạn ngày 04/12/2026 (còn 17 ngày). Khuyến nghị Phòng Nhân sự phối hợp Trưởng khối Công nghệ Lê Hoàng Nam tổ chức họp đánh giá tái ký trước ngày 25/11/2026.',
    referenced_policy: 'Quy trình Đánh giá Tái ký Hợp đồng & Cảnh báo Sớm Nhân sự Chủ chốt',
    metrics_cited: [
      { label: 'Cảnh báo mức Critical/High', value: '03 nhân sự' },
      { label: 'Hợp đồng hết hạn < 30 ngày', value: '04 hợp đồng' },
    ],
  },
  {
    id: 'qa-004',
    role_scope: 'DEPT_MANAGER',
    prompt_label: 'Tóm tắt đơn chờ duyệt và ứng viên phỏng vấn của Khối Công nghệ',
    user_query: 'Khối Công nghệ hiện có bao nhiêu đơn xin nghỉ/OT chờ duyệt và ứng viên nào đạt điểm AI cao nhất?',
    ai_response:
      'Khối Công nghệ hiện có 3 đơn từ đang chờ phê duyệt: đơn xin nghỉ phép 2 ngày của Phạm Minh Tuấn (REQ-202611-084), đơn đăng ký OT 8 giờ thứ Bảy của Bùi Trọng Nghĩa (REQ-202611-085) và đơn đăng ký WFH 1 ngày của Trương Gia Huy (REQ-202611-086). Về tuyển dụng, ứng viên Phan Thanh Tùng (UV-2026-101, vị trí Senior Backend Engineer) đạt điểm khớp JD cao nhất là 92/100 và đang ở bước Phỏng vấn chuyên môn.',
    referenced_policy: 'SLA Phê duyệt Đơn từ Nội bộ (tối đa 24 giờ làm việc)',
    metrics_cited: [
      { label: 'Đơn chờ duyệt', value: '03 đơn' },
      { label: 'Ứng viên điểm AI >= 88', value: '02 ứng viên' },
    ],
  },
];

export const MOCK_NL_LEAVE_DRAFTS: NaturalLanguageLeaveDraft[] = [
  {
    id: 'nl-001',
    sample_input:
      'Cho tôi xin nghỉ phép năm 2 ngày thứ Hai và thứ Ba tuần sau (23/11 đến 24/11/2026) để nghỉ ngơi sau đợt golive, bàn giao công việc cho Bùi Trọng Nghĩa.',
    parsed_category: 'ANNUAL_LEAVE',
    parsed_category_label: 'Nghỉ phép năm có hưởng lương',
    parsed_start_date: '2026-11-23',
    parsed_end_date: '2026-11-24',
    parsed_duration_days: 2,
    parsed_reason: 'Nghỉ ngơi phục hồi sức khỏe sau đợt triển khai golive hệ thống',
    parsed_handover_to: 'Bùi Trọng Nghĩa (NV-2025-009)',
    confidence_score: 0.97,
  },
  {
    id: 'nl-002',
    sample_input:
      'Tôi xin làm việc từ xa (WFH) 1 ngày vào thứ Năm 19/11/2026 để nhận bàn giao thiết bị hạ tầng mạng tại nhà, công việc phối hợp cùng Vũ Thị Mai Phương.',
    parsed_category: 'REMOTE_WORK',
    parsed_category_label: 'Làm việc từ xa (WFH)',
    parsed_start_date: '2026-11-19',
    parsed_end_date: '2026-11-19',
    parsed_duration_days: 1,
    parsed_reason: 'Nhận bàn giao thiết bị hạ tầng mạng tại nhà và trực vận hành hệ thống từ xa',
    parsed_handover_to: 'Vũ Thị Mai Phương (NV-2024-005)',
    confidence_score: 0.95,
  },
  {
    id: 'nl-003',
    sample_input:
      'Cho tôi xin nghỉ ốm 1 ngày vào ngày mai 18/11/2026 để đi khám chuyên khoa hô hấp tại Bệnh viện Đại học Y Dược, bàn giao ticket cho Lê Hoàng Nam.',
    parsed_category: 'SICK_LEAVE',
    parsed_category_label: 'Nghỉ ốm có hưởng BHXH / Quy chế công ty',
    parsed_start_date: '2026-11-18',
    parsed_end_date: '2026-11-18',
    parsed_duration_days: 1,
    parsed_reason: 'Khám chuyên khoa hô hấp tại Bệnh viện Đại học Y Dược TP.HCM',
    parsed_handover_to: 'Lê Hoàng Nam (NV-2024-003)',
    confidence_score: 0.96,
  },
];

export function parseNaturalLanguageLeavePrompt(rawInput: string): NaturalLanguageLeaveDraft {
  const normalized = rawInput.toLowerCase();
  const isSick = normalized.includes('ốm') || normalized.includes('khám') || normalized.includes('bệnh');
  const isWfh =
    normalized.includes('wfh') ||
    normalized.includes('từ xa') ||
    normalized.includes('ở nhà');

  const durationMatch = rawInput.match(/(\d+(?:[.,]\d+)?)\s*ngày/i);
  const parsedDuration = durationMatch ? Math.max(0.5, Number(durationMatch[1].replace(',', '.'))) : 1;

  const dateMatches = rawInput.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g);
  let startDate = '2026-11-23';
  let endDate = parsedDuration > 1 ? '2026-11-24' : '2026-11-23';

  if (dateMatches && dateMatches.length > 0) {
    const parseToken = (token: string) => {
      const parts = token.split('/');
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2] || '2026';
      return `${year}-${month}-${day}`;
    };
    startDate = parseToken(dateMatches[0]);
    endDate = dateMatches.length > 1 ? parseToken(dateMatches[1]) : startDate;
  }

  return {
    id: `nl-custom-${Date.now()}`,
    sample_input: rawInput,
    parsed_category: isSick ? 'SICK_LEAVE' : isWfh ? 'REMOTE_WORK' : 'ANNUAL_LEAVE',
    parsed_category_label: isSick
      ? 'Nghỉ ốm có giấy xác nhận y tế'
      : isWfh
      ? 'Làm việc từ xa (WFH)'
      : 'Nghỉ phép năm có hưởng lương',
    parsed_start_date: startDate,
    parsed_end_date: endDate,
    parsed_duration_days: parsedDuration,
    parsed_reason: rawInput.trim() || 'Giải quyết công việc cá nhân theo kế hoạch đã báo trước',
    parsed_handover_to: 'Bùi Trọng Nghĩa (NV-2025-009)',
    confidence_score: 0.94,
  };
}
