export const WEB_ROOT_URL = new URL('../../../', import.meta.url);

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const VND_FORMATTER = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const NUMBER_COMPACT_2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const NUMBER_COMPACT_1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const NUMBER_VN_FORMATTER = new Intl.NumberFormat('vi-VN');

const DATE_VN_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const DATETIME_VN_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hourCycle: 'h23',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/**
 * Chuẩn hóa đường dẫn tương đối về URL tuyệt đối tính từ gốc thư mục web/.
 * @param {string} [relativePath='']
 * @returns {string}
 */
export function toUrl(relativePath = '') {
  const cleanPath = String(relativePath ?? '').replace(/^\/+/, '');
  return new URL(cleanPath, WEB_ROOT_URL).href;
}

/**
 * Escape ký tự đặc biệt cho nội dung HTML và thuộc tính HTML (title, data-*).
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Làm sạch URL đích cho thẻ a; chặn javascript:, data:, và protocol-relative (//).
 * @param {string} url
 * @returns {string}
 */
export function sanitizeHref(url) {
  const raw = String(url ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  if (!raw) return '#';
  if (raw.startsWith('#')) {
    return raw.replace(/[<>"'`\s]/g, encodeURIComponent);
  }

  const normalizedSlashes = raw.replace(/\\/g, '/');
  if (normalizedSlashes.startsWith('//')) return '#';

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) {
    if (!/^https?:\/\//i.test(raw)) return '#';
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
      return '#';
    } catch {
      return '#';
    }
  }

  return toUrl(normalizedSlashes);
}

/**
 * Định dạng tiền tệ VND đầy đủ theo chuẩn vi-VN.
 * @param {number|string} amount
 * @returns {string}
 */
export function formatVND(amount) {
  const num = Number(amount);
  return VND_FORMATTER.format(Number.isFinite(num) ? num : 0);
}

/**
 * Định dạng tiền tệ VND rút gọn theo đơn vị tỷ / tr / nghìn.
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCompactVND(amount) {
  const raw = Number(amount);
  const num = Number.isFinite(raw) ? raw : 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  if (abs >= 1_000_000_000) {
    return `${sign}${NUMBER_COMPACT_2.format(abs / 1_000_000_000)} tỷ ₫`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${NUMBER_COMPACT_1.format(abs / 1_000_000)} tr ₫`;
  }
  if (abs >= 1_000) {
    return `${sign}${NUMBER_COMPACT_1.format(abs / 1_000)} nghìn ₫`;
  }
  return formatVND(num);
}

/**
 * Định dạng ngày dd/MM/yyyy theo múi giờ Asia/Ho_Chi_Minh.
 * @param {string|number|Date} dateInput
 * @returns {string}
 */
export function formatDateVN(dateInput) {
  if (dateInput === null || dateInput === undefined || dateInput === '') return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return String(dateInput);
  }
  return DATE_VN_FORMATTER.format(date);
}

/**
 * Định dạng thời gian HH:mm - dd/MM/yyyy theo múi giờ Asia/Ho_Chi_Minh.
 * @param {string|number|Date} dateInput
 * @returns {string}
 */
export function formatDateTimeVN(dateInput) {
  if (dateInput === null || dateInput === undefined || dateInput === '') return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return String(dateInput);
  }
  const parts = DATETIME_VN_FORMATTER.formatToParts(date);
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  const hour = partMap.hour === '24' ? '00' : partMap.hour;
  return `${hour}:${partMap.minute} - ${partMap.day}/${partMap.month}/${partMap.year}`;
}

/**
 * Định dạng số theo chuẩn vi-VN.
 * @param {number|string} value
 * @returns {string}
 */
export function formatNumberVN(value) {
  const num = Number(value);
  return NUMBER_VN_FORMATTER.format(Number.isFinite(num) ? num : 0);
}

/**
 * Chuẩn hóa chuỗi tiếng Việt về dạng không dấu, chữ thường để tìm kiếm.
 * @param {string} str
 * @returns {string}
 */
export function removeVietnameseTones(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * So khớp tìm kiếm không phân biệt dấu trên chuỗi đơn hoặc mảng trường dữ liệu.
 * @param {string|string[]} source
 * @param {string} query
 * @returns {boolean}
 */
export function matchesSearch(source, query) {
  const normalizedQuery = removeVietnameseTones(query).trim();
  if (!normalizedQuery) return true;
  const haystack = Array.isArray(source)
    ? source.filter((item) => item !== null && item !== undefined).map(removeVietnameseTones).join(' ')
    : removeVietnameseTones(source);
  return haystack.includes(normalizedQuery);
}

/**
 * Lấy 2 chữ cái đầu viết hoa của 2 từ cuối trong họ tên ('Nguyễn Văn An' -> 'VA').
 * @param {string} fullName
 * @returns {string}
 */
export function getInitials(fullName) {
  const words = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const lastTwo = words.slice(-2);
  return `${lastTwo[0][0]}${lastTwo[1][0]}`.toUpperCase();
}

/**
 * Che thông tin nhạy cảm (CCCD, số tài khoản, SĐT), chỉ giữ lại số ký tự cuối.
 * @param {string|number} value
 * @param {number} [visibleLast=4]
 * @returns {string}
 */
export function maskSensitiveValue(value, visibleLast = 4) {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';
  const keep = Math.max(0, Math.floor(Number(visibleLast) || 0));
  if (keep === 0 || str.length <= keep) {
    return '*'.repeat(str.length);
  }
  return `${'*'.repeat(str.length - keep)}${str.slice(-keep)}`;
}

/**
 * Tính số giờ làm việc giữa giờ vào và giờ ra (hỗ trợ 'HH:mm(:ss)' hoặc Date/ISO).
 * @param {string|Date} checkIn
 * @param {string|Date} checkOut
 * @returns {number}
 */
export function calculateWorkHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;

  const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  const inMatch = typeof checkIn === 'string' ? timePattern.exec(checkIn.trim()) : null;
  const outMatch = typeof checkOut === 'string' ? timePattern.exec(checkOut.trim()) : null;

  if (inMatch && outMatch) {
    const inH = Number(inMatch[1]);
    const inM = Number(inMatch[2]);
    const inS = Number(inMatch[3] || 0);
    const outH = Number(outMatch[1]);
    const outM = Number(outMatch[2]);
    const outS = Number(outMatch[3] || 0);
    if (inH > 23 || outH > 23 || inM > 59 || outM > 59 || inS > 59 || outS > 59) {
      return 0;
    }
    const inSeconds = inH * 3600 + inM * 60 + inS;
    const outSeconds = outH * 3600 + outM * 60 + outS;
    if (outSeconds <= inSeconds) return 0;
    return Math.round(((outSeconds - inSeconds) / 3600) * 100) / 100;
  }

  const start = checkIn instanceof Date ? checkIn : new Date(checkIn);
  const end = checkOut instanceof Date ? checkOut : new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return Math.round((diffMs / 3600000) * 100) / 100;
}
