# BẢNG THEO DÕI TIẾN ĐỘ & PHÂN TÍCH HIỆN TRẠNG (B0 - B7)
**Dự án:** Lạc Việt HRM v2.4 (Next.js 14 App Router, TypeScript strict, Soft Sage WCAG AAA, Runtime Store)
**Ngày cập nhật:** 2026-11-19

---

## 1. Bản đồ Hiện trạng Hệ thống (Baseline B0)

### 1.1. Bản đồ Route & Layout
- `src/app/page.tsx`: Hiện tại là Cổng Quản trị Nội bộ SPA (nhúng `<AppShell>` và 13 module qua `activeNav`). Chưa có Landing page công khai.
- `src/app/login/page.tsx`: Trang đăng nhập/đăng ký cho 5 role nội bộ, có nút nhảy sang `/careers`.
- `src/app/careers/page.tsx`: Cổng việc làm công khai với danh sách và modal nộp CV trực tuyến. Chưa có route động `/careers/[slug]`.
- Chưa có cấu trúc route group phân luồng: `(public)`, `(auth)`, `(internal)` `/app/...`, `(candidate)` `/candidate/...`.
- Chưa có `middleware.ts` chặn quyền truy cập giữa các phân luồng.

### 1.2. Bản đồ Auth & Phân quyền (RBAC)
- 5 vai trò nội bộ đã có: `SUPER_ADMIN`, `DIRECTOR`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`.
- Chưa có vai trò `CANDIDATE` (Ứng viên) để đăng nhập theo dõi hồ sơ cá nhân.
- Sau đăng nhập chưa có router redirect phân luồng (nội bộ vào `/app`, ứng viên vào `/candidate`).

### 1.3. Bản đồ Runtime Store (`src/lib/runtime-store.ts`)
- Đã có store cho: `notifications`, `requests`, `employees`, `candidates`, `jobs`, `onboarding`, `assets` lưu qua `localStorage` + `CustomEvent` (`HRM_RUNTIME_EVENT`).
- Chưa có wrapper hàm Transaction (all-or-nothing rollback) khi ghi đồng thời nhiều bảng (đăng tin, nhận việc).
- Chưa có quản lý trạng thái tin tuyển dụng theo máy trạng thái (Draft -> Pending -> Open -> Paused -> Closed).
- Chưa có bảng lưu token theo dõi hồ sơ (SHA-256 hash) và lịch sử tương tác ứng viên (timeline).

### 1.4. Bản đồ Module Nghiệp vụ
- **Tuyển dụng ATS:** Đã có Kanban 5 cột và form tạo tin mới; thiếu luồng phê duyệt từ Trưởng phòng/Giám đốc và kiểm tra chỉ tiêu định biên.
- **Onboarding & Tài sản:** Đã hoàn thiện checklist 4 nhóm và cấp phát tài sản; cần liên kết trạng thái "Chờ onboarding" từ phễu tuyển dụng.
- **Audit Log & Thông báo:** Đã có engine ghi nhật ký và thông báo chuông theo vai trò; cần mở rộng cho mọi sự kiện ATS và ứng viên.

---

## 2. Bảng Phân Tích Hiện Trạng Chi Tiết (Có / Thiếu / Hỏng) cho B1 – B6

| Bước | Hạng mục công việc | Có (Đã có sẵn) | Thiếu (Cần bổ sung) | Hỏng / Cần chỉnh sửa |
| :--- | :--- | :--- | :--- | :--- |
| **B1** | **Cấu trúc Route + Đăng nhập phân luồng** | Layout, AppShell, context `app-context`, bảng màu Soft Sage | - Route group `(public)`: `/`, `/careers`, `/careers/[slug]`, `/about`, `/contact`<br>- Route group `(internal)`: `/app/...`<br>- Route group `(candidate)`: `/candidate/...`<br>- Role `CANDIDATE` & demo profile<br>- `middleware.ts` kiểm tra cookie/localStorage phân luồng 403/redirect | `/` hiện đang gán cứng trang quản trị nội bộ; cần chuyển toàn bộ nội bộ sang `/app` |
| **B2** | **Landing Page Công ty (`/`)** | Bảng màu Soft Sage, logo Lạc Việt, theme toggle, components UI | - Trang chủ giới thiệu giải pháp Lạc Việt HRM (Hero, Giải pháp, Tính năng, Chỉ số, Khách hàng, CTA Tuyển dụng & Đăng nhập)<br>- Navbar công khai & Footer chuẩn doanh nghiệp | Chưa có trang landing public riêng biệt |
| **B3** | **Luồng 1: HR Đăng tin có duyệt** | Form tạo tin cơ bản, lưu runtime store, sync sang `/careers` | - Máy trạng thái (StateMachine): `DRAFT` → `PENDING_APPROVAL` → `OPEN` → `PAUSED` → `CLOSED`<br>- Phân quyền: `DEPT_MANAGER`/`DIRECTOR` duyệt, `HR_MANAGER` đăng<br>- Transaction đăng tin sinh slug duy nhất, check quota định biên phòng ban<br>- Tự đóng tin khi quá hạn hoặc đủ headcount<br>- UI HR quản lý trạng thái tin | Nút tạo tin hiện tại đang đăng trực tiếp không qua quy trình phê duyệt |
| **B4** | **Nộp hồ sơ + Theo dõi** | Form nộp CV ở `/careers`, lưu candidate `APPLIED`, push thông báo HR | - Trang chi tiết tin `/careers/[slug]`<br>- Validate file MIME, dung lượng ≤5MB<br>- Honeypot chống bot, rate-limit 5 lần/h<br>- Chống trùng hồ sơ (cùng email + cùng tin)<br>- Token hash SHA-256 tra cứu 30 ngày không cần tài khoản<br>- Tự động liên kết tài khoản ứng viên | Form nộp hiện chỉ nằm trong Dialog popup, chưa có trang chi tiết tin chuẩn SEO/URL |
| **B5** | **Luồng 2: Ứng viên đẩy ngược về HR** | Kanban ATS 5 cột, AI chấm điểm CV, chi tiết ứng viên | - Portal `/candidate` cho ứng viên xem tiến độ, lịch PV, offer<br>- Hành động ứng viên: xác nhận lịch PV, đổi lịch, rút hồ sơ, chấp nhận/từ chối offer (idempotent)<br>- HR gửi lịch PV & offer từ giao diện<br>- Phân quyền xem ứng viên theo phòng ban cho `DEPT_MANAGER`<br>- Hàm ẩn danh hóa PII sau 12 tháng | Ứng viên hiện tại chưa có giao diện tương tác phản hồi lại HR |
| **B6** | **Nhận việc → Nhân sự + Báo cáo** | Hàm chuyển `ONBOARDED`, tạo employee `PROBATION`, sinh checklist | - Trạng thái nhân viên chuẩn "Chờ onboarding" (`WAITING_ONBOARDING`) trước khi kích hoạt<br>- 1 transaction nhận việc: gán thông tin, tăng headcount đã tuyển, tự đóng tin nếu đủ, chống tạo trùng CCCD/Email<br>- HR hoàn thiện mã NV, ngày vào làm rồi kích hoạt sinh hợp đồng<br>- Dashboard tuyển dụng & Báo cáo xuất CSV | Hàm `initiateCandidateOnboarding` hiện nhảy thẳng sang `PROBATION` chưa qua bước tiền tiếp nhận |

---

## 3. Kế hoạch Thực hiện Tuần tự

- **B0:** Lập tài liệu phân tích hiện trạng `docs/TIEN_DO.md` *(Hoàn thành)*.
- **B1:** Tái cấu trúc Route group (`/`, `/app`, `/candidate`, `/careers/[slug]`), bổ sung Role `CANDIDATE` và `middleware.ts` *(Hoàn thành - Commit `7ca374c`)*.
- **B1.1 (Cải tiến UI/UX & Đồng bộ Giao diện):** Đặt cổng việc làm làm mặc định, đồng bộ bảng màu Soft Sage light mode (`#EFF5F3`, `#FCFEFD`, `#C6D9D3`, `#11221E`), sửa modal mở bắt buộc hiển thị tab Mô tả công việc (JD) trước, xử lý nút đóng trùng lặp, bỏ qua validate form để thử nghiệm mượt mà, phân luồng Header chuẩn (khách chỉ thấy "Đăng nhập", nhân viên đã đăng nhập có nút "Về Cổng Quản trị" + "Đăng xuất") *(Hoàn thành - Commit `87c2a35`)*.
- **B2:** Landing Page Công ty (`/`) giới thiệu giải pháp Lạc Việt & chuyển đổi.
- **B3:** Luồng 1 - HR đăng tin có duyệt (StateMachine, Transaction all-or-nothing, Định biên phòng ban).
- **B2:** Xây dựng Landing Page công ty tại `/` theo nhận diện thương hiệu Lạc Việt.
- **B3:** Xây dựng Service tuyển dụng Luồng 1 (HR đăng tin, quy trình phê duyệt, transaction, định biên, tự đóng tin).
- **B4:** Xây dựng Luồng nộp hồ sơ `/careers/[slug]`, kiểm soát an toàn, rate-limit và token hash SHA-256.
- **B5:** Xây dựng Luồng 2 (Ứng viên phản hồi lịch PV/Offer tại `/candidate`, ATS Kanban đồng bộ, ẩn danh hóa).
- **B6:** Xây dựng Transaction Nhận việc → Nhân sự chờ onboarding, kích hoạt hợp đồng và Báo cáo tuyển dụng xuất CSV.
- **B7:** Kiểm thử hồi quy toàn diện, kiểm tra 6 role, đa tab, xuất báo cáo và cập nhật README.
