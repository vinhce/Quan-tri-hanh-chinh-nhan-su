# PROGRESS — Nhật Ký Tiến Độ & Trạng Thái Dự Án

## 1. TRẠNG THÁI TỔNG QUAN CÁC BƯỚC DELIVERABLES
- [x] **Bước 1:** Khởi tạo bộ 6 file Vibe Coding, Khung dự án Next.js + Tailwind chuẩn `/unslop`, Kho dữ liệu mẫu `src/mock/`, App Shell cố định (`h-dvh overflow-hidden`, Sidebar/Header chuẩn), Trang `/login` (Đăng nhập + Đăng ký) và Khung chat nổi AI HR Copilot.
- [x] **Bước 2:** Phân hệ `HR_MANAGER` — HR Executive Dashboard (Recharts + AI Burnout/Turnover Alert), Hồ sơ nhân sự, Sơ đồ tổ chức & Hợp đồng (`CoreHrView`), Tuyển dụng ATS Kanban 5 bước & AI chấm điểm CV (`AtsView`).
- [x] **Bước 3:** Phân hệ Chấm công tháng (`AttendanceView`), Phê duyệt đơn nghỉ phép/OT (`RequestsView`), và Bảng tính lương tự động (`PayrollView`: Gross -> BHXH/BHYT/BHTN -> Giảm trừ gia cảnh -> Thuế TNCN -> Net) kèm Modal diễn giải.
- [x] **Bước 4:** Phân hệ `SUPER_ADMIN` — Quản lý người dùng & Ma trận phân quyền RBAC (`AdminRolesView`), Cấu hình tham số hệ thống (`AdminSettingsView`) và Nhật ký bảo mật (`AdminAuditView`).
- [x] **Bước 5:** Phân hệ `DEPT_MANAGER` & `EMPLOYEE` (`PerformanceView` ẩn cột lương với Trưởng bộ phận, `PayslipSelfView` ESS check-in/out + quỹ phép + phiếu lương cá nhân) và tích hợp đầy đủ 12 phân hệ vào `src/app/page.tsx`.

## 2. VIỆC ĐÃ HOÀN THÀNH TRONG PHIÊN HIỆN TẠI
- [x] Hoàn thiện bố cục App Shell cố định (`app-shell.tsx`, `sidebar.tsx`, `header.tsx`), bỏ Role Switcher trên Header, thêm nút Đăng xuất về `/login` và mở rộng `/login` với 2 tab Đăng nhập / Đăng ký.
- [x] Xây dựng trọn bộ 11 module giao diện (`dashboard-view.tsx`, `core-hr-view.tsx`, `ats-view.tsx`, `attendance-view.tsx`, `requests-view.tsx`, `payroll-view.tsx`, `admin-roles-view.tsx`, `admin-settings-view.tsx`, `admin-audit-view.tsx`, `performance-view.tsx`, `payslip-self-view.tsx`) tuân thủ chuẩn `/unslop`.
- [x] Tích hợp đủ 12 mục điều hướng vào `src/app/page.tsx`, tự động điều hướng về `dashboard` nếu `role` đổi sang vai trò không có quyền với phân hệ đang mở.

## 3. LỖI / VẤN ĐỀ ĐANG GẶP (BLOCKERS)
- *Không có lỗi chặn.*

## 4. BƯỚC HÀNH ĐỘNG KẾ TIẾP (NEXT IMMEDIATE ACTION)
- Chờ `@verifier` nghiệm thu `npx.cmd tsc --noEmit`, `npm.cmd run build` và checklist toàn bộ Giai đoạn 1 (Frontend UI + Mock Data).

## 5. GIAI ĐOẠN 2 — THEO DÕI WEB TĨNH THUẦN (web/)
- **Nhánh phát triển:** `feature/static-web` (`src/` đã đóng băng làm bản tham chiếu Next.js).
- **Trạng thái các bước Deliverables (Giai đoạn 2):**
  - [x] **Bước 1:** Hoàn thành nền tảng `web/` trên nhánh `feature/static-web` (cấu trúc thư mục `web/`, mở rộng `scripts/export-mock-json.mjs`, cấu hình `tailwind.web.config.mjs`, CSS nền, Core JS, partials `sidebar`/`header`, `login.html` và khung `index.html`).
  - [ ] **Bước 2:** `index.html` (Dashboard) kèm biểu đồ.
  - [ ] **Bước 3:** `pages/core-hr.html` và `pages/ats.html`.
  - [ ] **Bước 4:** `pages/attendance.html`, `pages/requests.html`, `pages/payroll.html`, `pages/payslip.html`.
  - [ ] **Bước 5:** `pages/performance.html`, `pages/admin-roles.html`, `pages/admin-settings.html`, `pages/admin-audit.html`.
  - [ ] **Bước 6:** AI Copilot (`partials/copilot.html` + `copilot.js`), kiểm tra responsive và rà soát `< 500` dòng toàn bộ file viết tay.
- **URL kiểm tra trên Laragon:**
  - `http://localhost/Quan-tri-hanh-chinh-nhan-su/web/login.html`
  - `http://localhost/Quan-tri-hanh-chinh-nhan-su/web/`
- **Bước tiếp theo:** Chờ người dùng nghiệm thu Bước 1 trước khi triển khai Bước 2.
