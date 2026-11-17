# BỘ NHỚ DỰ ÁN — AI-Powered HRM

## 1. KIẾN TRÚC & PHẠM VI GIAI ĐOẠN 1
- **Dự án:** Hệ thống Quản trị Hành chính Nhân sự tích hợp AI (AI-Powered HRM).
- **Phạm vi Giai đoạn 1:** Chỉ xây dựng giao diện người dùng (Frontend UI) + dữ liệu mẫu định kiểu tại `src/mock/*`. Không tạo DB, không cài Prisma, không viết API backend, không gọi LLM thật. Mọi thao tác cập nhật state trình duyệt và hiển thị Toast qua `useApp()`.
- **Tech Stack:** Next.js 14 (App Router), React 18, TypeScript (Strict), Tailwind CSS, Base UI theo chuẩn `shadcn/ui`, `lucide-react`, `recharts`.
- **4 Role trong Role Switcher (`RoleCode`):** `SUPER_ADMIN`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`.
- **Cấu trúc cốt lõi:**
  - `src/context/app-context.tsx`: Cung cấp `AppProvider` và `useApp()` quản lý `role`, `theme` (`light`/`dark`), `activeNav`, `uiState` (`ready`/`loading`/`empty`/`error`), `showToast`, `isCopilotOpen`.
  - `src/mock/`: Chứa `types.ts`, `employees.ts`, `attendance.ts`, `payroll.ts`, `ats.ts`, `admin.ts`, `copilot.ts`, `index.ts`.
  - `src/components/layout/`: `sidebar.tsx` (`w-64`, dòng cao `36px`, lọc theo Role), `header.tsx` (Role Switcher, UI State Switcher, Theme Toggle), `app-shell.tsx`.
  - `src/components/copilot/ai-copilot-widget.tsx`: Khung chat nổi AI HR Copilot + bóc tách ngôn ngữ tự nhiên tạo nhanh đơn xin nghỉ phép.

## 2. QUY ƯỚC THIẾT KẾ (`/unslop`)
- **Màu sắc:** 1 dải trung tính `zinc` (`#FAFAFA`/`#FFFFFF` ở Light mode, `#09090B`/`#121214` ở Dark mode, viền hairline `border-zinc-200/80 dark:border-zinc-800/80`) và 1 màu nhấn duy nhất `teal-700` (Light) / `teal-400` (Dark).
- **Cấm tuyệt đối:** Emoji ở mọi nơi (cả UI lẫn `src/mock/`), gradient đa sắc (`from-purple-*`, `from-indigo-*`), `bg-clip-text`, glow/colored shadow, `uppercase tracking-widest`, `font-bold` trở lên (chỉ dùng weights 400–600), `transition-all`, dấu chấm than (`!`).
- **Số liệu & Mã định danh:** Luôn dùng `font-mono tabular-nums` cho mã nhân viên (`NV-2024-001`), ca làm việc (`HC-08:00`), tiền tệ VND (`32.500.000 ₫`) và tỷ lệ phần trăm.
- **Icon:** Chỉ dùng `lucide-react` kích thước `16px` (`w-4 h-4`) với `strokeWidth={1.5}`.

## 3. LỆNH CHUẨN
- Chạy môi trường dev: `npm run dev`
- Kiểm tra kiểu TypeScript: `npx.cmd tsc --noEmit`
- Build production: `npm run build`
- Lint mã nguồn: `npm run lint`
