'use client';

export type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface ToastPayload {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

export const FLASH_TOAST_KEY = 'hrm_flash_toast';

/**
 * Lưu thông báo flash vào sessionStorage để hiển thị sau khi chuyển trang hoặc tải lại trang.
 */
export function setFlashToast(
  title: string,
  description?: string,
  variant: ToastVariant = 'success'
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      FLASH_TOAST_KEY,
      JSON.stringify({ title, description, variant })
    );
  } catch {
    // Bỏ qua lỗi trong môi trường bảo mật cao
  }
}

/**
 * Lấy và xóa thông báo flash từ sessionStorage nếu có.
 */
export function consumeFlashToast(): ToastPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(FLASH_TOAST_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(FLASH_TOAST_KEY);
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.title === 'string') {
      return parsed as ToastPayload;
    }
  } catch {
    // Bỏ qua lỗi
  }
  return null;
}

/**
 * Phát CustomEvent 'hrm:toast' để AppContext / ToastProvider hiển thị thông báo ngay lập tức
 * từ bất kỳ hàm JavaScript, AJAX/Fetch hoặc component nào.
 */
export function dispatchToast(
  title: string,
  description?: string,
  variant: ToastVariant = 'default'
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ToastPayload>('hrm:toast', {
      detail: { title, description, variant },
    })
  );
}

/**
 * Bộ helper thông báo chuẩn hóa theo yêu cầu dự án.
 */
export const notify = {
  /** Khi thêm dữ liệu thành công: "Thêm mới thành công!" */
  addSuccess: (description?: string, title = 'Thêm mới thành công!') => {
    dispatchToast(title, description, 'success');
  },

  /** Khi tạo dữ liệu thành công: "Tạo thành công!" */
  createSuccess: (description?: string, title = 'Tạo thành công!') => {
    dispatchToast(title, description, 'success');
  },

  /** Khi sửa dữ liệu thành công: "Cập nhật thành công!" */
  updateSuccess: (description?: string, title = 'Cập nhật thành công!') => {
    dispatchToast(title, description, 'success');
  },

  /** Khi xóa dữ liệu thành công: "Xóa thành công!" */
  deleteSuccess: (description?: string, title = 'Xóa thành công!') => {
    dispatchToast(title, description, 'success');
  },

  /** Khi thao tác thất bại / lỗi: "Đã xảy ra lỗi, vui lòng thử lại!" */
  error: (description?: string, title = 'Đã xảy ra lỗi, vui lòng thử lại!') => {
    dispatchToast(title, description, 'error');
  },

  /** Khi người dùng nhập thiếu dữ liệu: "Vui lòng nhập đầy đủ thông tin!" */
  missingInfo: (description?: string, title = 'Vui lòng nhập đầy đủ thông tin!') => {
    dispatchToast(title, description, 'warning');
  },

  /** Thông báo thành công tùy biến */
  success: (title: string, description?: string) => {
    dispatchToast(title, description, 'success');
  },

  /** Thông báo cảnh báo tùy biến */
  warning: (title: string, description?: string) => {
    dispatchToast(title, description, 'warning');
  },

  /** Thông báo thông tin tùy biến */
  info: (title: string, description?: string) => {
    dispatchToast(title, description, 'info');
  },

  /** Lưu flash message để hiển thị sau khi chuyển hướng / tải lại */
  setFlash: setFlashToast,
};
