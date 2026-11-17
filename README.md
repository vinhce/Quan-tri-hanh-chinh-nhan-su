# Hệ thống Quản trị Hành chính Nhân sự (AI-Powered HRM)

Ứng dụng quản trị hành chính nhân sự xây dựng bằng **Next.js 14**, **React 18**, **TypeScript**, **Tailwind CSS** và **Recharts**.

## Công nghệ sử dụng

- **Framework:** Next.js 14 (App Router)
- **Ngôn ngữ:** TypeScript 5
- **Giao diện:** Tailwind CSS, Lucide React, Recharts
- **Dữ liệu mẫu:** Mock data tĩnh xuất sang `public/mock/*.json` qua `scripts/export-mock-json.mjs`

## Chức năng chính

- **Dashboard:** Tổng quan nhân sự, chấm công, quỹ lương và biểu đồ trực quan
- **Core HR:** Quản lý hồ sơ nhân viên, phòng ban, chức vụ và sơ đồ tổ chức
- **Chấm công & Đơn từ:** Theo dõi bảng công, duyệt đơn nghỉ phép/công tác/tăng ca theo phân quyền (RBAC)
- **Tiền lương & Phiếu lương:** Bảng lương, tính lương và xem phiếu lương cá nhân
- **Tuyển dụng (ATS) & Đánh giá (Performance):** Quản lý ứng viên và đánh giá hiệu suất
- **Quản trị & AI Copilot:** Phân quyền vai trò, nhật ký hệ thống, cấu hình và trợ lý AI Copilot

## Cài đặt & Chạy local

```bash
npm install
npm run dev
```

Mở trình duyệt tại `http://localhost:3000`.

## Scripts

- `npm run dev` — Chạy môi trường development (tự động chạy `gen:mock` trước)
- `npm run build` — Build production
- `npm run start` — Chạy bản production
- `npm run lint` — Kiểm tra ESLint
- `npm run typecheck` — Kiểm tra TypeScript (`tsc --noEmit`)
- `npm run gen:mock` — Xuất dữ liệu mock sang `public/mock/*.json`
