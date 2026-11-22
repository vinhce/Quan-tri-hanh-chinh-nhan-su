# TRẠNG THÁI HIỆN TẠI (STATE)

## 1. Việc vừa hoàn thành
- Hoàn thiện khép kín **4 giai đoạn Vòng đời Nhân sự** + **Chấm công Vân tay WebAuthn cùng WiFi** + **Báo cáo Word bảo vệ đồ án** (`docs/BAO_CAO_NGHIEP_VU_VA_KICH_BAN_DEMO_HRM.docx`).
- Hoàn tất đợt **7 hạng mục sửa lỗi đồng bộ & tinh chỉnh UI khử mùi AI** theo phản hồi trực tiếp của người dùng:
  1. Đồng bộ tức thì `Tuyển dụng & ATS` -> `/candidate` (`updateCandidateOfferSalary`, `mergeArrayById` + bảo vệ bậc `stage` trong `/api/hrm/sync` & `doSync`, gỡ lỗi `/login` gắn nhầm `UV-2026-001` cho email ứng viên tự nộp trên `/careers`, cho phép tra cứu không mật khẩu nhưng chặn nhân sự `RESIGNED`/`LOCKED`).
  2. Tự sinh `PreboardingInvite` trống (`PENDING`) trong `initiateCandidateOnboarding` kèm đồng bộ `grossSalaryVnd` + `preboarding_token` trên `ats-view.tsx`; chặn fallback chéo ứng viên trên `/preboarding` và bổ sung nút `Chỉnh sửa thông tin` an toàn (hạ `VERIFIED` về `PENDING`/`SUBMITTED` chờ HR duyệt lại, chặn khi đã `OFFICIAL`/`RESIGNED`).
  3. Tách riêng nút `Đăng xuất` khỏi `Hồ sơ cá nhân` (`sidebar.tsx`, `candidate/page.tsx`) và đổi nhãn `Cổng Ứng viên` sang `Theo dõi Ứng tuyển` / `Ứng viên dự tuyển`.
  4. Xóa sạch 100% biến kỹ thuật/SQL lộ trên UI (`is_active`, `is_final_settlement`, `penalty_amount`, `is_rehireable`, `rehire_note`, `VERIFIED`, `PROBATION_2M`).
  5. Rút gọn thanh bộ lọc Kanban `ats-view.tsx` và gỡ lọc ẩn ngầm 30 ngày.
  6. Làm gọn banner Pre-boarding đầu `onboarding-view.tsx`, thay checkbox khóa hồ sơ bằng 2 nút `Lưu tạm` / `Duyệt hồ sơ`, lọc bỏ hoàn toàn hồ sơ `VERIFIED`/`EXPIRED` khỏi dải chờ duyệt (duyệt xong biến mất ngay, đẩy hồ sơ tiếp theo lên).
  7. Tự động kích hoạt tài khoản `EMPLOYEE` (`ACTIVE`, đồng bộ task IT SSO) ngay khi HR bấm `Duyệt hồ sơ` Pre-boarding (`hrQuickUpdatePreboarding` + `activateEmployeeAccountIfPreboardingVerified`); đóng form `/preboarding` và thay bằng thẻ chuyển thẳng sang `/app` với role `EMPLOYEE`; cập nhật `/login` & `/candidate` nhận cả email cá nhân/công ty vào thẳng `/app` (chặn chặt `RESIGNED`/`LOCKED`, chặn khớp chéo domain lạ).
  8. Chuyển nền tối `globals.css` sang Neutral Charcoal (`#16171B` / `#202329`) với chữ trắng-xám trung tính (`#F1F3F5` / `#C1C6CE`), gọn cụm nút `attendance-view.tsx`, sửa client-only dynamic import `swal.ts` (tránh SSR 500), khóa mũi tên kép `select.tsx`, thêm `pb-24` ở `app-shell.tsx` và thêm `dev:3005` trong `package.json`.
- **Kiểm định:** `npx tsc --noEmit` (0 lỗi), `npm test` **144/144 PASS** trên 5 suite, HTTP `200` trên 6 route chính (`/login`, `/app`, `/candidate`, `/preboarding`, `/careers`, `/api/hrm/sync`); toàn bộ 5 điểm bảo mật từ `subagent-5-security` đã vá sạch. Lưu ý: sub-agent trình duyệt E2E gặp lỗi `429 RESOURCE_EXHAUSTED` khi hết quota ở bước cuối (đã báo trung thực cho người dùng).

## 2. Bước tiếp theo
- Đợi người dùng trải nghiệm lại trên `http://localhost:3000` và phản hồi bước tiếp theo.
