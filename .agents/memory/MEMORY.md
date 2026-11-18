# BỘ NHỚ DỰ ÁN — AI-Powered HRM

## 1. KIẾN TRÚC & PHẠM VI GIAI ĐOẠN 1
- **Phạm vi:** Giao diện Frontend + Mock Data (`src/mock/` -> `public/mock/*.json` qua `scripts/export-mock-json.mjs`, nạp bằng `fetch()` trong `src/lib/mock-fetcher.ts`). Không DB, không Prisma, không Backend API, không gọi LLM thật.
- **Cấu trúc kép:** Next.js 14 App Router (`src/`, `output: 'export'` -> `out/`) + Bản HTML/CSS/JS tĩnh song song (`web/`, `scripts/serve-web.mjs`).
- **5 Vai trò (`RoleCode`):** `SUPER_ADMIN` (IT), `DIRECTOR` (Giám đốc Điều hành — duyệt cấp 3), `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`.
- **Nghiệp vụ cốt lõi:**
  - `MOCK_EMPLOYEES`: 28 nhân sự (`NV-2024-000`..`NV-2026-015`), mặt bằng lương đã điều chỉnh giảm 30%.
  - Đơn từ đa cấp: `DEPT_MANAGER` (Cấp 1) -> `HR_MANAGER` (Cấp 2, trừ quỹ phép) -> `DIRECTOR` (Cấp 3, cấu hình `hrm_director_min_days` ở `localStorage`). Từ chối bắt buộc nhập lý do; người gửi tự hủy khi chưa hoàn tất.
  - Audit Log (`src/lib/audit-logger.ts`): Ghi thao tác CRUD/duyệt thời gian thực; popup chi tiết bất biến (chỉ đọc, không sửa/xóa).

## 2. QUY ƯỚC GIAO DIỆN (`/unslop`)
- **Màu sắc:** Neutral ramp `zinc` + 1 màu nhấn `teal-700` (Light) / `teal-400` (Dark). Thẻ KPI & khối chi tiết dùng `border-l-4` kèm biến thể `dark:border-l-*-400`.
- **Layout:** App Shell cố định (`fixed inset-0 h-dvh overflow-hidden`); Header gọn (tiêu đề + Copilot + Theme); cuối Sidebar là **Thẻ tài khoản** (Avatar 2 chữ cái cuối, badge 5 role, `Hồ sơ`, `Đăng xuất` xác nhận, `Đổi vai trò (demo)`). Trang `/login` có 2 tab Đăng nhập/Đăng ký + 5 pill demo.
- **Cấm tuyệt đối:** Emoji, gradient đa sắc, `bg-clip-text`, glow, `uppercase tracking-widest`, `font-bold` trở lên, `transition-all`, dấu `!`. Luôn dùng `font-mono tabular-nums` cho mã NV, ca, IP, tiền VND và Lucide icon `w-4 h-4` `strokeWidth={1.5}`.

## 3. LỆNH CHUẨN
- Export mock JSON: `npm run gen:mock`
- Dev Next.js / Web tĩnh: `npm run dev` / `npm run dev:web`
- Kiểm tra TypeScript: `npx.cmd tsc --noEmit` (hoặc `npm run typecheck`)
- Build static export (`out/`): `npm run build`
