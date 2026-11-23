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
  8. Chuyển nền tối `globals.css` sang Neutral Charcoal (`#16171B` / `#202329`) với chữ trắng-xám trung tính (`#F1F3F5` / `#C1C6CE`), thu gọn cụm nút `attendance-view.tsx` thành duy nhất 1 nút `Chấm công bằng vân tay` (bỏ nút `Đã vào ca` / `Cập nhật giờ ra` thủ công), sửa client-only dynamic import `swal.ts` (tránh SSR 500), khóa mũi tên kép `select.tsx`, thêm `pb-24` ở `app-shell.tsx` và thêm `dev:3005` trong `package.json`.
  9. Cơ chế tự động đặt lại dữ liệu demo về trạng thái ban đầu (ứng viên chưa duyệt) mỗi khi kết thúc và chạy lại dự án (`scripts/reset-demo-data.mjs` gắn vào `predev`, `dev:3005`, `npm run reset:demo`) kết hợp `bootEpoch` trên `/api/hrm/sync` & `initRuntimeSync()` để đồng bộ xóa sạch `localStorage` cũ trên mọi tab trình duyệt và tự động hủy phiên đăng nhập (`clearStaleRuntimeAuthSession` + `app-context.tsx`) của nhân sự runtime cũ (như `NV-2026-041`).
  10. Cô lập tuyệt đối dữ liệu cá nhân của nhân sự mới đang đăng nhập trên toàn bộ 6 phân hệ (`requests-view.tsx`, `attendance-view.tsx`, `dashboard-view.tsx`, `payslip-self-view.tsx`, `performance-view.tsx`, `offboarding-view.tsx`): chặn hoàn toàn lỗi fallback về tài khoản mẫu `Phạm Minh Tuấn (NV-2024-004)` và đơn `REQ-202611-084` khi nhân viên mới chưa có dữ liệu hoặc vừa reset.
- **Kiểm định:** `npx tsc --noEmit` (0 lỗi), `npm test` **144/144 PASS** trên 5 suite, HTTP `200` trên 6 route chính (`/login`, `/app`, `/candidate`, `/preboarding`, `/careers`, `/api/hrm/sync`), `SECURITY: PASS`. Đã push mốc trước lên nhánh `feat/lifecycle-ui-sync` (`ea7f615`).

## 2. Bước tiếp theo
- Đợi người dùng trải nghiệm lại trên `http://localhost:3000` và phản hồi bước tiếp theo.
