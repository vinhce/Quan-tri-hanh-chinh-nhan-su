# TASKS — Kế Hoạch Thực Thi Từng Bước (Giai Đoạn 1: UI Prototype & Mock Data)

> Quy tắc: Ký hiệu trạng thái: `[x]` Đã hoàn thành, `[-]` Đang thực hiện, `[ ]` Chưa thực hiện.

## BƯỚC 1: KHUNG DỰ ÁN, BỘ 6 FILE VIBE CODING, APP SHELL, ROLE SWITCHER, LOGIN & `src/mock/`
- [x] **Task 1.1 (Vibe Coding Docs):** Khởi tạo & đồng bộ bộ 6 file nền tảng (`PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `PROGRESS.md`) tích hợp chuẩn `/unslop`.
- [x] **Task 1.2 (Project Scaffold & Base UI):** Cấu hình Next.js (`output: 'export'`), TypeScript, Tailwind CSS (`zinc` + `teal`), `src/lib/utils.ts`, `src/context/app-context.tsx` và 12 Base UI components tại `src/components/ui/*`.
- [x] **Task 1.3 (Mock Data Store & Fetcher):** Xây dựng `src/mock/*` (8 file, 28 nhân sự, mặt bằng lương giảm 30% sát thực tế), script `scripts/export-mock-json.mjs` xuất ra `public/mock/*.json` và nạp qua `src/lib/mock-fetcher.ts`.
- [x] **Task 1.4 (App Shell, Login & AI Copilot):**
  - App Shell khóa cố định (`fixed inset-0 h-dvh overflow-hidden`), Header gọn (tiêu đề + Copilot + Theme).
  - Sidebar `w-64` lọc menu theo 5 vai trò, tích hợp **Thẻ tài khoản** cuối Sidebar (Avatar 2 chữ cái cuối, badge màu 5 role, `Hồ sơ`, `Đăng xuất` xác nhận, `Đổi vai trò (demo)`).
  - Trang `/login` đủ 2 tab Đăng nhập & Đăng ký + 5 pill trải nghiệm nhanh.
  - Khung chat nổi `AI HR Copilot` bóc tách ngôn ngữ tự nhiên tạo đơn xin nghỉ phép.

## BƯỚC 2: PHÂN HỆ `HR_MANAGER` / `DIRECTOR` — EXECUTIVE DASHBOARD, CORE HR & TUYỂN DỤNG ATS
- [x] **Task 2.1 (Nhóm màn hình 2 — HR Executive Dashboard):** Thẻ KPI `border-l-4`, biểu đồ Recharts biến động nhân sự & quỹ lương, cảnh báo sớm **AI Burnout & Turnover Risk**.
- [x] **Task 2.2 (Nhóm màn hình 3 — Core HR, Sơ đồ tổ chức & Hợp đồng):** Danh sách 28 nhân sự (tìm kiếm bỏ dấu, lọc), hồ sơ 360 độ, sơ đồ tổ chức dạng cây và quản lý gia hạn hợp đồng.
- [x] **Task 2.3 (Nhóm màn hình 4 — Tuyển dụng ATS & AI CV Scoring):** Bảng Kanban 5 cột (`APPLIED`, `AI_SCREENED`, `INTERVIEW`, `OFFER`, `ONBOARDED`) và chi tiết AI chấm điểm CV.

## BƯỚC 3: CHẤM CÔNG, ĐƠN TỪ ĐA CẤP & TÍNH LƯƠNG TỰ ĐỘNG (PAYROLL VIỆT NAM)
- [x] **Task 3.1 (Nhóm màn hình 5 — Bảng Chấm Công & Quản Lý Ca):** Ma trận chấm công tháng theo ca (`HC-08:00`), thống kê công chuẩn, đi muộn/về sớm và OT.
- [x] **Task 3.2 (Nhóm màn hình 6 — Phê Duyệt Đơn Từ Đa Cấp):** Luồng duyệt 3 cấp (`DEPT_MANAGER -> HR_MANAGER -> DIRECTOR`), Stepper chi tiết trong Dialog, bắt buộc lý do từ chối, người gửi tự hủy đơn, đọc ngưỡng `hrm_director_min_days`.
- [x] **Task 3.3 (Nhóm màn hình 7 — Bảng Lương Gross -> Net & Phiếu Lương):** Công thức lương Việt Nam (BHXH 8%, BHYT 1.5%, BHTN 1%, Giảm trừ 11tr + 4.4tr/người phụ thuộc, Thuế TNCN 7 bậc) và modal xem Phiếu lương cá nhân.

## BƯỚC 4: QUẢN TRỊ HỆ THỐNG, PHÂN QUYỀN RBAC & AUDIT LOGS (`SUPER_ADMIN`)
- [x] **Task 4.1 (Nhóm màn hình 8 — Quản Lý Tài Khoản & Ma Trận RBAC):** Quản lý tài khoản và ma trận phân quyền 5 vai trò (`SUPER_ADMIN`, `DIRECTOR`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`) x 6 hành động.
- [x] **Task 4.2 (Nhóm màn hình 9 — Cấu Hình Hệ Thống & Audit Logs Bất Biến):** Cấu hình tham số hệ thống (kèm `director_approval_min_days`), `audit-logger.ts` ghi thao tác CRUD/duyệt theo thời gian thực và popup chi tiết bất biến (chỉ đọc, `border-l-4`).

## BƯỚC 5: WORKSPACE `DEPT_MANAGER`, CỔNG NHÂN VIÊN `EMPLOYEE`, BẢN TĨNH `web/` & KIỂM THỬ
- [x] **Task 5.1 (Nhóm màn hình 10 — Trưởng Bộ Phận & Cổng Nhân Viên ESS):** Đánh giá KPI/OKR, duyệt đơn cấp 1 cho `DEPT_MANAGER`; tra cứu công, phép, phiếu lương Net và tạo đơn mới cho `EMPLOYEE`.
- [x] **Task 5.2 (Nhóm màn hình 11, Bản tĩnh `web/` & Nghiệm thu):** Hoàn thiện AI HR Copilot, dựng bản HTML/CSS/JS tĩnh song song tại `web/` (`npm run dev:web`), xuất static `out/` và xác nhận `npx.cmd tsc --noEmit` PASS (0 lỗi).
