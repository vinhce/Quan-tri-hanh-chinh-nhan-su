# TASKS — Kế Hoạch Thực Thi Từng Bước (Giai Đoạn 1: UI Prototype & Mock Data)

> Quy tắc: Thực hiện lần lượt theo 5 bước Deliverables. Ký hiệu trạng thái: `[x]` Đã hoàn thành, `[-]` Đang thực hiện, `[ ]` Chưa thực hiện.

## BƯỚC 1: KHUNG DỰ ÁN, BỘ 6 FILE VIBE CODING, APP SHELL, ROLE SWITCHER, LOGIN & `src/mock/`
- [x] **Task 1.1 (Vibe Coding Docs):** Khởi tạo đầy đủ bộ 6 file nền tảng (`PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `PROGRESS.md`) tích hợp tiêu chuẩn thiết kế `/unslop`.
- [x] **Task 1.2 (Project Scaffold & Base UI):** Cấu hình Next.js (App Router), TypeScript, Tailwind CSS (`zinc` + `teal`, `Inter` + `JetBrains Mono`), `src/lib/utils.ts`, `src/context/app-context.tsx` và bộ component nền tảng `src/components/ui/*`.
- [x] **Task 1.3 (Mock Data Store `src/mock/`):** Xây dựng toàn bộ dữ liệu mẫu định kiểu chặt chẽ (`types.ts`, `employees.ts`, `attendance.ts`, `payroll.ts`, `ats.ts`, `admin.ts`, `copilot.ts`, `index.ts`) với dữ liệu nhân sự Việt Nam thực tế, không emoji.
- [x] **Task 1.4 (App Shell, Role Switcher, Login & AI Copilot Widget):**
  - Xây dựng `Sidebar` (`w-64`, cao dòng `36px`, lọc menu động theo 4 Role: `SUPER_ADMIN`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`).
  - Xây dựng `Header` (Role Switcher 4 role, bộ chuyển 4 trạng thái `Ready`/`Loading`/`Empty`/`Error`, chuyển đổi Dark/Light mode).
  - Xây dựng trang `/login` (Split layout bất đối xứng kèm chọn nhanh tài khoản demo 4 Role và bản xem trước số liệu `tabular-nums`).
  - Xây dựng khung chat nổi `AI HR Copilot` hỗ trợ hỏi đáp quy chế và bóc tách câu ngôn ngữ tự nhiên thành đơn xin nghỉ phép.
  - Xây dựng Workspace tổng quan tại `src/app/page.tsx` và nghiệm thu `npx tsc --noEmit` PASS (`[QA PASS]`).

## BƯỚC 2: PHÂN HỆ `HR_MANAGER` — EXECUTIVE DASHBOARD, CORE HR & TUYỂN DỤNG ATS
- [x] **Task 2.1 (Nhóm màn hình 2 — HR Executive Dashboard):** Thẻ KPI nhân sự có mốc đối chiếu, biểu đồ Recharts biến động nhân sự & quỹ lương (1 màu nhấn `teal`), và bảng cảnh báo sớm **AI Burnout & Turnover Risk**.
- [x] **Task 2.2 (Nhóm màn hình 3 — Core HR, Sơ đồ tổ chức & Hợp đồng):** Danh sách nhân viên (tìm kiếm bỏ dấu, lọc theo phòng ban/trạng thái), ngăn xem hồ sơ 360 độ, sơ đồ tổ chức dạng cây và quản lý gia hạn hợp đồng lao động.
- [x] **Task 2.3 (Nhóm màn hình 4 — Tuyển dụng ATS & AI CV Scoring):** Bảng Kanban 5 cột (`APPLIED`, `AI_SCREENED`, `INTERVIEW`, `OFFER`, `ONBOARDED`), thao tác chuyển bước ứng viên và chi tiết AI chấm điểm CV (`match_score`, `strengths`, `gaps`, `interview_questions`).

## BƯỚC 3: CHẤM CÔNG, ĐƠN TỪ & TÍNH LƯƠNG TỰ ĐỘNG (PAYROLL VIỆT NAM)
- [x] **Task 3.1 (Nhóm màn hình 5 — Bảng Chấm Công & Quản Lý Ca):** Bảng chấm công tháng theo ca làm việc (`HC-08:00`), thống kê công chuẩn, đi muộn/về sớm và giờ tăng ca (OT 150%/200%/300%).
- [x] **Task 3.2 (Nhóm màn hình 6 — Phê Duyệt Đơn Nghỉ Phép & Tăng Ca):** Quản lý danh sách đơn nghỉ phép/OT, đối chiếu quỹ phép năm còn lại và thao tác Duyệt / Từ chối cập nhật state + hiện Toast.
- [x] **Task 3.3 (Nhóm màn hình 7 — Bảng Lương Gross -> Net & Phiếu Lương):** Bảng tính lương tự động (`Gross` -> `BHXH 8%`, `BHYT 1.5%`, `BHTN 1%` -> Giảm trừ gia cảnh `11tr` + `4.4tr/người phụ thuộc` -> `Thuế TNCN` -> `Net`) và modal xem/xuất Phiếu lương cá nhân (Payslip).

## BƯỚC 4: QUẢN TRỊ HỆ THỐNG, PHÂN QUYỀN RBAC & AUDIT LOGS (`SUPER_ADMIN`)
- [x] **Task 4.1 (Nhóm màn hình 8 — Quản Lý Tài Khoản & Ma Trận Phân Quyền RBAC):** Quản lý người dùng hệ thống, gán Role và chỉnh sửa ma trận quyền (`View`, `Create`, `Edit`, `Approve`, `Delete`, `Export`) theo từng phân hệ.
- [x] **Task 4.2 (Nhóm màn hình 9 — Cấu Hình Hệ Thống & Audit Logs):** Biểu mẫu cấu hình giờ làm việc, ngày lễ, tỷ lệ bảo hiểm/thuế, cấu hình AI model và bảng tra cứu nhật ký bảo mật (Audit Logs) kèm bộ lọc hành động/IP.

## BƯỚC 5: WORKSPACE `DEPT_MANAGER`, CỔNG NHÂN VIÊN `EMPLOYEE` & HOÀN THIỆN AI HR COPILOT
- [x] **Task 5.1 (Nhóm màn hình 10 — Trưởng Bộ Phận & Cổng Nhân Viên ESS):**
  - Giao diện `DEPT_MANAGER`: Theo dõi quân số phòng ban (ẩn cột lương), duyệt đơn cấp dưới, đánh giá KPI/OKR và cảnh báo Burnout.
  - Giao diện `EMPLOYEE`: Xem bảng công cá nhân, check-in/out thời gian thực, quỹ phép năm, tra cứu phiếu lương Net và tạo đơn xin nghỉ phép / OT mới.
- [x] **Task 5.2 (Nhóm màn hình 11 — Tích hợp 12 phân hệ & Kiểm thử tổng thể):** Kết nối đủ 12 phân hệ vào `src/app/page.tsx`, cố định Sidebar/Header, bỏ Role Switcher trên Header (chọn vai trò qua `/login` + nút Đăng xuất), đồng bộ AI HR Copilot và hoàn tất Giai đoạn 1.

## GIAI ĐOẠN 2: CHUYỂN ĐỔI SANG WEB TĨNH THUẦN (web/)
- [x] **Bước 1:** Cấu trúc thư mục `web/`, mở rộng `scripts/export-mock-json.mjs`, cấu hình `tailwind.web.config.mjs`, CSS nền (`base`, `theme`, `layout`, `common`), Core JS (`theme-boot`, `utils`, `api`, `rbac`, `state`, `guard`, `app`), partials (`sidebar`, `header`), `login.html` và khung `index.html`.
- [ ] **Bước 2:** `index.html` (Dashboard) kèm biểu đồ.
- [ ] **Bước 3:** `pages/core-hr.html` và `pages/ats.html`.
- [ ] **Bước 4:** `pages/attendance.html`, `pages/requests.html`, `pages/payroll.html`, `pages/payslip.html`.
- [ ] **Bước 5:** `pages/performance.html`, `pages/admin-roles.html`, `pages/admin-settings.html`, `pages/admin-audit.html`.
- [ ] **Bước 6:** AI Copilot (`partials/copilot.html` + `copilot.js`), kiểm tra responsive và rà soát `< 500` dòng toàn bộ file viết tay.

## BƯỚC 6: TINH CHỈNH UI/UX, RBAC 5 VAI TRÒ & ĐỒNG BỘ DỮ LIỆU (NHÁNH fix-ui)
- [x] **Task 6.1 (Vai trò Giám đốc & Phê duyệt Cấp 3):** Bổ sung vai trò Giám đốc (`DIRECTOR`) và luồng phê duyệt Cấp 3 (`app-context.tsx`, `requests-view.tsx`, `login/page.tsx`).
- [x] **Task 6.2 (Nhật ký bảo mật bất biến):** Nâng cấp nhật ký bảo mật bất biến, hộp thoại chi tiết chỉ đọc viền màu và bộ lọc Việt hóa (`admin-audit-view.tsx`, `audit-logger.ts`).
- [x] **Task 6.3 (Sidebar Account Card & Thu gọn Header):** Hoàn thiện thẻ tài khoản cuối Sidebar (Avatar 2 chữ cuối, badge 5 vai trò Sáng/Tối, nút Hồ sơ, Đăng xuất kèm xác nhận, Đổi vai trò demo + `setAuthenticatedUser`, tự đóng mobile drawer) và thu gọn Header (`sidebar.tsx`, `header.tsx`).
- [x] **Task 6.4 (Tinh chỉnh UI Component & Nhãn hệ thống):** Sửa `<Select>` 1 mũi tên (`select.tsx`), `<Badge>` 1 dòng (`badge.tsx`), số tiền KPI `/login` không cắt (`login/page.tsx`), khoảng đệm `Đánh giá & Cảnh báo AI` (`performance-view.tsx`) và nhãn `Giám đốc (DIRECTOR)` (`admin-settings-view.tsx`).
- [x] **Task 6.5 (Đồng bộ dữ liệu & Copilot):** Đồng bộ badge Sidebar (`4`, `6`, `4`, `3`), Copilot phép năm động theo user đang đăng nhập (`ai-copilot-widget.tsx`), đủ 3 câu hỏi AI cho ứng viên (`src/mock/ats.ts`, `public/mock/ats.json`, `ats-view.tsx`), bỏ `CA-CHIEU` và căn bộ lọc Chấm công / Bảng lương (`attendance-view.tsx`, `payroll-view.tsx`).
- [x] **Task 6.6 (Hoàn thiện ESS Phiếu lương cá nhân):** Tách đồng hồ và `Check-in`/`Check-out` ở `1123px`, căn 4 ô Quỹ phép năm thẳng hàng, giữ đơn vị `đ` không xuống dòng (`\u00A0đ`) và cố định 1 dòng thông tin Hồ sơ cá nhân (`payslip-self-view.tsx`).
