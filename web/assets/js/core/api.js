import { toUrl } from './utils.js';

export const BASE_URL = toUrl('mock/');

const mockPromiseCache = new Map();

function normalizeMockFilename(filename) {
  const cleanName = String(filename ?? '')
    .replace(/^\/+/, '')
    .trim();
  if (!cleanName || cleanName.includes('..') || cleanName.includes('\\') || !cleanName.endsWith('.json')) {
    throw new Error(`Tên tệp dữ liệu giả lập không hợp lệ: "${String(filename ?? '')}".`);
  }
  return cleanName;
}

/**
 * Tải tệp JSON từ thư mục mock/ với cache promise trong bộ nhớ.
 * Đây là điểm duy nhất trong ứng dụng thực hiện gọi fetch().
 * @param {string} filename
 * @param {{ bypassCache?: boolean, forceRefresh?: boolean, signal?: AbortSignal }} [options={}]
 * @returns {Promise<any>}
 */
export async function fetchMockJson(filename, options = {}) {
  const cleanName = normalizeMockFilename(filename);
  const { bypassCache = false, forceRefresh = false, signal } = options || {};
  const shouldRefresh = Boolean(bypassCache || forceRefresh);

  if (!shouldRefresh && mockPromiseCache.has(cleanName)) {
    return mockPromiseCache.get(cleanName);
  }

  const targetUrl = new URL(cleanName, BASE_URL).href;
  const requestPromise = (async () => {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: shouldRefresh ? 'no-store' : 'default',
        signal,
      });

      if (!response.ok) {
        throw new Error(`Không thể tải dữ liệu "${cleanName}" (mã lỗi HTTP ${response.status}).`);
      }

      return await response.json();
    } catch (error) {
      if (mockPromiseCache.get(cleanName) === requestPromise) {
        mockPromiseCache.delete(cleanName);
      }

      if (error && error.name === 'AbortError') {
        throw new Error(`Yêu cầu tải dữ liệu "${cleanName}" đã bị hủy.`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Tệp dữ liệu "${cleanName}" có định dạng JSON không hợp lệ.`);
      }
      if (error instanceof Error && error.message.startsWith('Không thể tải dữ liệu')) {
        throw error;
      }
      throw new Error(`Không thể kết nối để tải dữ liệu "${cleanName}". Vui lòng kiểm tra mạng và thử lại.`);
    }
  })();

  if (!bypassCache) {
    mockPromiseCache.set(cleanName, requestPromise);
  }

  return requestPromise;
}

/**
 * Xóa cache dữ liệu giả lập theo tên tệp hoặc toàn bộ cache nếu không truyền tên.
 * @param {string} [filename]
 */
export function clearMockCache(filename) {
  if (filename) {
    const cleanName = String(filename).replace(/^\/+/, '').trim();
    mockPromiseCache.delete(cleanName);
    return;
  }
  mockPromiseCache.clear();
}

export function fetchEmployeesMock(options) {
  return fetchMockJson('employees.json', options);
}

export function fetchAttendanceMock(options) {
  return fetchMockJson('attendance.json', options);
}

export function fetchPayrollMock(options) {
  return fetchMockJson('payroll.json', options);
}

export function fetchAtsMock(options) {
  return fetchMockJson('ats.json', options);
}

export function fetchAdminMock(options) {
  return fetchMockJson('admin.json', options);
}

export function fetchCopilotMock(options) {
  return fetchMockJson('copilot.json', options);
}
