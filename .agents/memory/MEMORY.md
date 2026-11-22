# BỘ NHỚ DỰ ÁN — AI-Powered HRM (Lạc Việt HRM)

## 1. KIẾN TRÚC & VÒNG ĐỜI NHÂN SỰ KHÉP KÍN
- **Cấu trúc ứng dụng:** Next.js 14 App Router (`src/`, tương thích `output: 'export'` -> `out/` & Node dev API routes) + Bản tĩnh `web/`.
- **Database Schema (`db/migrations/`):**
  - `001_recruitment_core.sql`: 11 bảng Tuyển dụng & ATS.
  - `002_employee_lifecycle.sql`: 17 bảng Vòng đời Nhân sự (`departments`, `positions`, `employees`, `users`, `onboarding_tasks`, `assets`, `employee_assets`, `contracts`, `leave_balances`, `attendances`, `leave_requests`, `payrolls`, `performance_reviews`, `career_histories`, `resignations`, `handover_items`, `clearance_checklists`), `InnoDB / utf8mb4`, `ON DELETE RESTRICT`, kèm `ALTER TABLE` idempotent.
- **Đồng bộ & Lưu trữ kép:** `src/lib/runtime-store.ts` đồng bộ realtime qua `/api/hrm/sync` & `/api/hrm/lifecycle` (`.data/runtime-sync.json` + `localStorage`). Endpoint `/api/hrm/sync` gộp mảng theo `id` (`mergeArrayById`) và bảo vệ bậc tiến `stage` của `hrm_runtime_candidates_v1` để đa tab không ghi đè lùi tiến trình ứng viên.
- **6 Vai trò (`RoleCode`):** `SUPER_ADMIN` (IT), `DIRECTOR`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`, `CANDIDATE`.
- **4 Giai đoạn Vòng đời Nhân sự:**
  1. **Onboarding:** `PENDING_ONBOARD -> PROBATION -> OFFICIAL` (tương thích `ACTIVE`, cấm xóa cứng), trang tự khai `/preboarding?token=...`, 4 nhóm checklist tự động (IT bật `is_active=1`, HC gán `employee_assets`, Manager gán `mentor_id`, HR tạo HĐ `PROBATION_2M` 85%), duyệt `PASS` chuyển `OFFICIAL` + HĐ 100% + khởi tạo `leave_balances`.
  2. **Chấm công, Đơn từ & Lương:** Check-in/out & Import CSV, tính phút muộn/sớm -> công `1.0/0.5/0.0`, phát hiện `MISSING_PUNCH` + đơn `LATE_EXPLANATION`, trừ `leave_balances`, ghi giờ `OVERTIME`, tính lương động tháng (miễn BHXH HĐ thử việc, trần BHXH 46.8tr, thuế TNCN 7 bậc).
  3. **Đánh giá & Thăng tiến:** `performance_reviews` (Thử việc/Quý/Năm), sổ bất biến `career_histories` (append-only), tự đồng bộ chức vụ/phòng ban + Phụ lục `ADDENDUM` + nâng quyền `DEPT_MANAGER` + tách lương giữa kỳ (`mid_month_split`).
  4. **Offboarding & Tất toán (`offboarding-view.tsx`):** Kiểm tra báo trước `3/30/45` ngày -> `NOTICE_PERIOD`, bàn giao 3 bên + bắt buộc chuyển giao cấp dưới/đơn `PENDING` của Manager, thanh lý `clearance_checklists` (`returned_date`, `penalty_amount`), khóa chặn 100% Clearance -> Quyết toán kỳ cuối (`is_final_settlement = true`, cộng phép tồn - đền bù) -> `RESIGNED`, khóa `users.is_active = 0`, đánh dấu `is_rehireable`.

## 2. QUY ƯỚC GIAO DIỆN & BÀI HỌC KỸ THUẬT
- **Theme:** Soft Sage (`#FCFEFD`, `#0F766E`) & Neutral Charcoal Dark (`#16171B` / `#202329`, chữ `#F1F3F5` / `#C1C6CE`), `border-l-4`, `font-mono tabular-nums`, Lucide `strokeWidth={1.5}`, không lộ tên cột/biến SQL trên nhãn UI.
- **Xác nhận nghiệp vụ (`src/lib/swal.ts`):** BẮT BUỘC dùng dynamic `await import('sweetalert2')` phía client (`typeof window !== 'undefined'`) bọc `try/catch` fallback `window.confirm`/`alert`/`prompt`; TUYỆT ĐỐI không dùng `import Swal from 'sweetalert2'` tĩnh ở top-level vì gây lỗi SSR HTTP 500 trên Next.js 14 dev server (`./vendor-chunks/sweetalert2.js`). Cấm import `swal.ts` vào `/login`, `src/mock/*` hoặc `src/lib/runtime-store.ts`.
- **Cô lập phiên Ứng viên:** Đăng nhập/tra cứu ứng viên bằng email riêng trên `/login` và `/candidate` không bao giờ fallback sang mã mẫu `UV-2026-001`, đồng thời luôn chặn nhân sự `RESIGNED` hoặc `LOCKED`.

## 3. LỆNH CHUẨN
- Export mock JSON: `npm run gen:mock`
- Kiểm tra TypeScript: `npm run typecheck` (`npx tsc --noEmit`)
- Chạy song song cổng phụ: `npm run dev:3005` (`next dev -p 3005`)
- Build static export: `npm run build` (KHÔNG chạy đè `.next` khi `next dev` đang mở)
- Chạy trọn bộ 5 test suites (144 assertions): `npm test` (`test:unit`, `test:recruitment`, `test:all-workflows`, `test:lifecycle`, `test:biometric`)
