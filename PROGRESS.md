# PROGRESS — Nhật Ký Tiến Độ & Trạng Thái Dự Án

## 1. TRẠNG THÁI TỔNG QUAN CÁC BƯỚC DELIVERABLES
- [x] **Bước 1:** Khung dự án Next.js (`output: 'export'`), bộ 6 file Vibe Coding, Kho dữ liệu mẫu `src/mock/` (28 nhân sự) + `public/mock/*.json` (`mock-fetcher.ts`), App Shell cố định (`fixed inset-0 h-dvh overflow-hidden`), Header gọn, Thẻ tài khoản cuối Sidebar (kèm `Đổi vai trò (demo)`), Trang `/login` 2 tab + 5 pill, và AI HR Copilot.
- [x] **Bước 2:** Phân hệ `HR_MANAGER` / `DIRECTOR` — Executive Dashboard (kèm AI Burnout/Turnover Alert), Core HR (28 nhân sự, Org Chart, Hợp đồng), ATS Kanban 5 bước & AI CV Scoring.
- [x] **Bước 3:** Phân hệ Chấm công tháng, Phê duyệt đơn từ đa cấp (`DEPT_MANAGER -> HR_MANAGER -> DIRECTOR`), và Bảng tính lương tự động (`Gross -> BHXH/BHYT/BHTN -> Giảm trừ gia cảnh -> Thuế TNCN -> Net`) kèm Phiếu lương.
- [x] **Bước 4:** Phân hệ `SUPER_ADMIN` — Quản lý người dùng, Ma trận phân quyền RBAC 5 vai trò, Cấu hình tham số hệ thống (`hrm_director_min_days`) và Nhật ký bảo mật (`audit-logger.ts`, popup chi tiết bất biến chỉ đọc `border-l-4`).
- [x] **Bước 5:** Phân hệ `DEPT_MANAGER` & `EMPLOYEE` (ESS), đồng bộ toàn diện AI HR Copilot, và bản HTML/CSS/JS tĩnh song song tại `web/` (`npm run dev:web`).

## 2. VIỆC ĐÃ HOÀN THÀNH TRONG PHIÊN HIỆN TẠI
- [x] Tách riêng vai trò **Giám đốc Điều hành (`DIRECTOR`)** (`NV-2024-000` — Trần Quốc Việt) khỏi Quản trị IT (`SUPER_ADMIN`) trong `src/mock/`, `app-context.tsx`, `sidebar.tsx`, `login/page.tsx` và ma trận RBAC.
- [x] Điều chỉnh mặt bằng lương trong `src/mock/` giảm 30% sát thực tế doanh nghiệp Việt Nam; đồng bộ export ra `public/mock/*.json` qua `scripts/export-mock-json.mjs`.
- [x] Hoàn thiện luồng phê duyệt đơn từ đa cấp (`DEPT_MANAGER -> HR_MANAGER -> DIRECTOR`), ẩn dãy pill phân cấp rườm rà ngoài danh sách (giữ Stepper trong Dialog chi tiết).
- [x] Khóa cố định App Shell, làm gọn Header, thay khối cuối Sidebar bằng **Thẻ tài khoản** (Avatar 2 chữ cái cuối, badge màu 5 role, `Hồ sơ`, `Đăng xuất` xác nhận, `Đổi vai trò (demo)`).
- [x] Bổ sung `audit-logger.ts` ghi thao tác thực tế và popup chi tiết Audit Log bất biến (chỉ đọc) với viền nhấn `border-l-4` hỗ trợ cả Light & Dark mode.
- [x] Kiểm tra `npx.cmd tsc --noEmit` → **PASS (0 lỗi)**.

## 3. LỖI / VẤN ĐỀ ĐANG GẶP (BLOCKERS)
- *Hiện tại không có lỗi chặn.*

## 4. BƯỚC HÀNH ĐỘNG KẾ TIẾP (NEXT IMMEDIATE ACTION)
- Toàn bộ 5 bước Deliverables của Giai đoạn 1 (UI Prototype & Mock Data) đã hoàn tất và đồng bộ tài liệu. Sẵn sàng bàn giao kiểm thử hoặc chuyển sang Giai đoạn 2 (Backend API & CSDL) khi có yêu cầu.
