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
- **B1.1 (Cải tiến UI/UX & Đồng bộ Giao diện):** Đặt cổng việc làm làm mặc định, đồng bộ bảng màu Soft Sage light mode (`#EFF5F3`, `#FCFEFD`, `#C6D9D3`, `#11221E`), sửa modal mở bắt buộc hiển thị tab Mô tả công việc (JD) trước, xử lý nút đóng trùng lặp, bỏ qua validate form để thử nghiệm mượt mà, phân luồng Header chuẩn, xóa `target="_blank"` để chuyển trang nội bộ mượt mà trên cùng một tab *(Hoàn thành - Commit `6a0185a`)*.
- **B1.2 (Đề xuất Tuyển dụng Phòng ban, Xóa AI Chấm điểm & Chuông Thông báo Real-time Ứng viên):** 
  - Thêm phân hệ "Đề xuất Tuyển dụng từ các Phòng ban" ngay phía trên tin tuyển dụng đang mở trong ATS, hỗ trợ tạo đề xuất, duyệt tự động sinh tin tuyển dụng và từ chối có lý do.
  - Kết nối Real-time Notification đa chiều (Trưởng phòng <-> HR Manager <-> Giám đốc <-> Ứng viên).
  - Loại bỏ hoàn toàn điểm số AI (AI Match Score, badge `AI {score}%`) trên thẻ Kanban và chi tiết ứng viên; đổi cột 2 thành "Sàng lọc hồ sơ" và thay thế bằng đánh giá chuyên môn chuẩn mực.
  - Bổ sung chuông thông báo Real-time có badge đếm số lượng chưa đọc và popover xem chi tiết trên Cổng ứng viên (`/candidate`), tự động cập nhật khi HR chuyển bước hồ sơ *(Hoàn thành)*.
- **B1.3 (Đồng bộ giao diện Kanban ATS & Modal chi tiết ứng viên chuẩn mẫu):**
  - Đồng bộ header Kanban: "Bảng Kanban quy trình ứng viên · 7 hồ sơ", phụ đề "Kéo thả hoặc dùng nút ‹ › để chuyển bước · Nhấn thẻ để xem hồ sơ", bộ lọc nguồn `[Mọi nguồn]`, nút `[Đặt lại dữ liệu]` và nút `[Export]`.
  - Thẻ ứng viên chuẩn mẫu: Mã UV + Badge nguồn (hàng 1), Tên ứng viên bold (hàng 2), Chức danh (hàng 3), Ngày nộp + nút điều hướng ‹ › (hàng 4).
  - Modal xem ứng viên gọn gàng 1:1 theo ảnh: Tên ứng viên, Chức danh, Mã · Nguồn · Bước · Ngày nộp, Danh sách "Câu hỏi phỏng vấn gợi ý" (3 gạch đầu dòng) và nút "Đóng" *(Hoàn thành - Commit `4c413f7`)*.
- **B1.4 (Tái cấu trúc Kanban ATS thành đúng 3 bảng):**
  - Thu gọn toàn bộ phễu tuyển dụng Kanban từ 5 cột về chính xác 3 cột (`grid-cols-1 md:grid-cols-3 xl:grid-cols-3`):
    1. **Cột 1: `Hồ sơ đã nhận`** (gộp nộp hồ sơ mới và hồ sơ đã qua sơ loại ban đầu).
    2. **Cột 2: `Phỏng vấn`** (vòng phỏng vấn chuyên môn).
    3. **Cột 3: `Đề nghị & Đã nhận việc`** (chứa cả 2 phân nhóm rõ ràng: "Đề nghị nhận việc" cho UV-2026-103 Lâm Quốc Bảo và "Đã nhận việc" cho UV-2026-098 Trương Gia Huy).
  - Thẻ ứng viên tại Cột 3 gắn badge chuyên biệt (`Đề nghị nhận việc` màu tím violet, `Đã nhận việc` màu xanh ngọc emerald) bên cạnh badge nguồn nộp.
  - Hỗ trợ đầy đủ kéo thả (HTML5 Native Drag-and-Drop) và điều hướng phím mũi tên ‹ › tuần tự giữa 3 cột; tại cột 3 nút › sẽ mở trực tiếp modal tiếp nhận Onboarding nếu ở bước đề nghị nhận việc.
  - Đồng bộ thông báo Real-time cho ứng viên và HR khi trạng thái được cập nhật qua 3 cột *(Hoàn thành)*.
- **B1.5 (Tối ưu hóa UI/UX 4 Phương diện theo phản hồi người dùng):**
  - **1. Tiến trình Xét duyệt Ứng viên (`/candidate`):**
    - Chuyển 5 khối block cồng kềnh sang dạng **Linear Stepper** (đường kẻ ngang với các điểm mốc tròn kết nối, đánh dấu Check khi hoàn thành, vòng tròn highlight cho bước hiện tại).
    - Hiển thị đoạn text mô tả chi tiết và các nút tương tác (Xác nhận/Dời lịch phỏng vấn, Nhận/Từ chối Offer) trong Active Callout Banner riêng biệt dưới thanh tiến trình.
    - Đưa thông tin "Lương kỳ vọng" và "Nguồn nộp" lên phần Header ngay dưới tên vị trí ứng tuyển.
    - Đưa nút "Rút hồ sơ" lên góc trên cùng bên phải ngang hàng với badge trạng thái để loại bỏ hoàn toàn block đáy dư thừa.
  - **2. Bảng Đề xuất Tuyển dụng từ Phòng ban (`ats-view.tsx`):**
    - Chuyển đổi toàn bộ cụm Card sang dạng **Data Table** chuyên nghiệp, quét thông tin nhanh, có badge gấp màu đỏ, trạng thái và cấp bậc rõ ràng.
    - Dùng `line-clamp-1` kèm tooltip `title` cho lý do tuyển dụng, loại bỏ tình trạng tràn chữ.
    - Nút thao tác "Từ chối" và "Duyệt & Tạo tin" thiết kế gọn gàng, giảm nhiễu thị giác.
  - **3. Bảng Kanban ATS (`ats-view.tsx`):**
    - Lược bỏ hoàn toàn các nút mũi tên ‹ và › trên mặt thẻ; chuyển thao tác điều chuyển bước vào bên trong Modal xem chi tiết (`‹ Lùi bước trước` và `Chuyển bước tiếp theo →`) hoặc kéo thả Drag-and-Drop.
    - Bổ sung bộ lọc Vị trí tuyển dụng (Job Filter) lên toolbar trên cùng; khi chọn 1 vị trí cụ thể, tự động ẩn dòng tên vị trí trên mọi thẻ ứng viên để card ngắn lại.
    - Tối giản Typography: thay chuỗi "Nộp: 16/11/2026" bằng icon lịch `<Calendar />` kèm ngày tháng.
    - Hỗ trợ **Collapsible Columns**: cho phép thu gọn cột (đặc biệt cột 0 ứng viên) thành thanh dọc hẹp `w-12`, tự động mở rộng không gian hiển thị cho các cột còn lại.
  - **4. Layout Tổng thể & Header:**
    - Sidebar hỗ trợ thu gọn (Collapse mode `w-[68px]`, lưu trạng thái vào `localStorage`), mở rộng tối đa chiều ngang làm việc cho Kanban.
    - Khối thẻ tin tuyển dụng phía trên Kanban được trang bị nút Thu gọn / Mở rộng (`showJobCards`), thu gọn vào Dropdown Selector gọn nhẹ, tiết kiệm 15-20% chiều cao màn hình *(Hoàn thành)*.
- **B1.6 (Chống quá tải thẻ Kanban & Auto-Archive Onboarding - Swarm verified):**
  - **1. Auto-Archive (Tự động chuyển luồng)**: Ứng viên trạng thái `ONBOARDED` (Đã nhận việc) quá 3 ngày hoặc đã tạo hồ sơ Onboarding được tự động ẩn khỏi Kanban mặc định; có toggle "Hiện hồ sơ đã bàn giao/lưu trữ" trên toolbar và banner thông báo tại cột 3.
  - **2. Collapsible Subgroups (Swimlanes)**: Cột 3 ("Đề nghị & Đã nhận việc") hỗ trợ đóng/mở độc lập cho nhóm "Đề nghị nhận việc" và "Đã nhận việc", hiển thị số lượng thẻ và icon chevron.
  - **3. Compact Mode (Thẻ rút gọn)**: Thẻ tại nhóm Đã nhận việc hiển thị mỏng nhẹ (Avatar, Họ tên, Chức danh, Mã UV); bổ sung nút toggle "Thẻ rút gọn" / "Thẻ chi tiết" trên toolbar cho toàn bảng.
  - **4. Load More (Giới hạn hiển thị)**: Giới hạn tối đa 8 thẻ/cột (`KANBAN_CARD_LIMIT`), có nút "Xem thêm +X hồ sơ" và "Thu gọn lại" tránh nghẽn DOM khi có hàng chục hồ sơ.
  - **5. Bộ lọc thời gian mặc định**: Select chọn thời gian trên toolbar ("30 ngày gần nhất" mặc định, "Kỳ hiện tại 11/2026", "Tất cả thời gian") *(Hoàn thành)*.
- **B1.7 (Chuyển đổi Modal sang Side-Drawer Ứng viên & 5 Cải tiến UX/UI - Swarm verified):**
  - **1. Side-Drawer (Right Panel)**: Thay thế Popup Modal giữa màn hình bằng ngăn kéo trượt mượt mà từ cạnh phải (`fixed inset-y-0 right-0 sm:max-w-lg`), backdrop che nhẹ `bg-[#11221E]/25`, nút X góc trên bên phải, giữ nguyên tầm nhìn tổng thể của bảng Kanban.
  - **2. Bóc tách & Cấu trúc Meta-data**: Mã hồ sơ font-mono, Badge nguồn nộp màu sắc phân kênh (LinkedIn, TopCV, ITviec, Referral, CareerSite), Badge trạng thái, Icon `<Calendar />` + ngày nộp, thông tin liên hệ và lương kỳ vọng rõ ràng.
  - **3. Dropdown Trạng thái linh hoạt**: Bỏ nút "Đóng" đáy dư thừa và 2 nút cứng tiến/lùi; tích hợp Dropdown Select 6 trạng thái (`APPLIED`, `AI_SCREENED`, `INTERVIEW`, `OFFER`, `ONBOARDED`, `REJECTED`), cho phép HR nhảy cóc bước hoặc loại hồ sơ nhanh chỉ với 1 click.
  - **4. Thao tác Cốt lõi (Core Actions)**: Bổ sung 2 nút hành động nổi bật: "Xem CV" (mở modal CV Preview chi tiết và tải tệp) và "Thêm đánh giá/Ghi chú" (nhập nhận xét phỏng vấn, đánh giá sao 1-5, lưu thời gian thực).
  - **5. Copy Câu hỏi Phỏng vấn 1-click**: Thêm icon Copy ở từng câu hỏi phỏng vấn gợi ý, click để copy vào Clipboard (với hiệu ứng Check xanh trong 2s) dán trực tiếp vào Google Meet/Zoom *(Hoàn thành)*.
- **B1.8 (Intercept Kéo thả Phỏng vấn, Xóa Câu hỏi Gợi ý & Chuẩn hóa UI Thông báo - Swarm verified):**
  - **1. Xóa bỏ Khối Câu hỏi Phỏng vấn Gợi ý**: Đã gỡ bỏ hoàn toàn danh sách 3 câu hỏi gợi ý và nút copy khỏi Side-Drawer chi tiết ứng viên theo yêu cầu; thay thế bằng hiển thị chi tiết lịch phỏng vấn khi hồ sơ đã được lên lịch.
  - **2. Intercept Kéo thả Xếp lịch Phỏng vấn (`ats-view.tsx`)**:
    - Khi kéo thẻ vào cột "Phỏng vấn", hệ thống lập tức chặn lưu trạng thái tự động và kích hoạt Modal "Lên lịch phỏng vấn".
    - Form đầy đủ các trường: Ngày (date), Giờ (time), Hình thức (Online/Offline), Người phỏng vấn, Checkbox bật mặc định "Gửi thông báo & email cho ứng viên", Link họp / Địa điểm.
    - HR bấm "Xác nhận & Gửi thông báo" mới chính thức cập nhật thẻ sang `INTERVIEW`, lưu bản ghi `interview_schedule` và kích hoạt notification thời gian thực tới ứng viên.
    - Cơ chế Rollback: Nếu HR bấm "Hủy", tắt modal, phím Esc hoặc click ngoài backdrop mà chưa xác nhận, thẻ lập tức giật quay ngược về đúng vị trí cột ban đầu trước khi kéo.
  - **3. Chuẩn hóa Giao diện Thông báo Tuyển dụng & Ứng viên (`header.tsx` & `candidate/page.tsx`)**:
    - **Left Accent Border 4px**: Dải màu viền cạnh trái thay thế icon cồng kềnh (`border-l-sky-500` cho Phỏng vấn, `border-l-amber-500` cho Sàng lọc, `border-l-violet-500` cho Đề nghị, `border-l-emerald-500` cho Đã nhận việc / Duyệt, `border-l-rose-500` cho Từ chối).
    - **Text Badge Trạng thái**: Badge nhỏ bo góc hiển thị rõ loại thông báo đặt ngay trên đầu đoạn nội dung.
    - **Typography & Bỏ câu chào lặp**: Xóa triệt để các câu chào thừa thãi ("Chào Đinh Tuấn Kiệt...", "Chào dasdas..."), in đậm chữ sáng cho tên vị trí công việc.
    - **Phân biệt Chưa đọc**: Đổ lớp nền mờ (`bg-[#E8F3EF]/60` hoặc `dark:bg-white/5`) kèm chấm tròn xanh (Unread dot) ở góc phải.
    - **Gộp nhóm thời gian (Time Grouping)**: Tự động phân lô hiển thị "Hôm nay", "Hôm qua", "Tuần trước", "Cũ hơn" giúp danh sách có nhịp điệu và quét thông tin nhanh *(Hoàn thành)*.
- **B1.9 (Dọn dẹp Cổng Ứng viên & Khép kín Luồng 2 chiều Đề xuất Dời lịch - Swarm verified):**
  - **1. Dọn dẹp Góc phải Cổng Ứng viên (`candidate/page.tsx`)**:
    - Xóa hẳn nút "Tìm kiếm vị trí mới" ở khối banner chào mừng, tập trung hoàn toàn vào thông tin cá nhân.
    - Chuyển hành động "Đổi tài khoản" và "Đăng xuất" vào **Avatar Dropdown Menu** ở góc trên cùng bên phải Header, giải phóng diện tích thanh điều hướng.
    - Thu nhỏ nhãn trạng thái ("Mời phỏng vấn chuyên môn") thành Badge trạng thái nhỏ gọn nằm ngay cạnh tiêu đề vị trí.
    - Chuyển nút "Rút hồ sơ" thành text link gạch chân màu xám nhạt (`hover:text-rose-600 hover:underline`) ở góc phải, loại bỏ hoàn toàn nút khối đắc địa để tránh bấm nhầm.
    - Gióng thẳng mép phải Header, Banner và Card trên cùng 1 trục dọc chuẩn `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`.
  - **2. Khép kín Luồng Ứng viên Đề xuất Dời lịch (`candidate/page.tsx` ↔ `ats-view.tsx` & `header.tsx`)**:
    - Ứng viên bấm "Đề xuất dời lịch" mở Modal nhập Lý do và Ngày/Giờ đề xuất mới; submit hiển thị Toast, lưu `reschedule_request` vào candidate store, bắn notification tới HR, và vô hiệu hóa cụm nút kèm badge cảnh báo "Đang chờ HR phản hồi yêu cầu dời lịch".
    - Cột "Phỏng vấn" trên Kanban tự động gắn cờ viền amber và Badge `⚠️ Yêu cầu dời lịch` (hiệu ứng `animate-pulse`) trên mặt thẻ ứng viên.
    - Side-Drawer chi tiết ứng viên hiển thị Callout cảnh báo dời lịch với 2 nút xử lý: "Chấp nhận & Xếp lại lịch" (tự động điền ngày giờ mới) và "Từ chối dời lịch" (giữ lịch cũ, gửi phản hồi tới ứng viên).
    - Khay thông báo HR hiển thị item cảnh báo ưu tiên cao `border-l-amber-500` kèm link điều hướng mở trực tiếp Side-Drawer ứng viên *(Hoàn thành)*.
- **P0 - P3b (Quy trình Tuyển dụng Cốt lõi & Sửa Triệt để 4 Lỗi B1-B4 - Hoàn thành & Verified):**
  - **Phase P0 (Chuẩn hóa Schema, Types, Mã & Dọn Dữ liệu Rác)**:
    - Tạo migration schema DDL: `db/migrations/001_recruitment_core.sql` với 10 bảng chuẩn InnoDB/utf8mb4 (`counters`, `job_proposals`, `job_postings`, `candidates`, `files`, `applications`, `interviews`, `offers`, `notifications`, `audit_logs`, `outbox_emails`).
    - Hệ thống Types & Enums nghiêm ngặt: `src/lib/hrm/types.ts` (không dùng `any`).
    - Bộ sinh mã tập trung: `src/lib/hrm/ids.ts` (`YC-YYYY-DEPTXX`, `JD-YYYY-DEPTXX`, `UV-YYYY-XXX`, `evt-xxxx`).
    - Định dạng ngày/tiền và sanitize text: `src/lib/hrm/format.ts`.
    - Dọn dẹp dữ liệu rác trên runtime store và candidate model.
  - **Phase P1 (Workflow Engine, Phân quyền & Audit Logging)**:
    - State machine tập trung: `src/lib/hrm/workflow.ts` quản lý chuyển trạng thái cho Proposal, Application (5 stages: new -> screening -> interview -> offer -> hired), Interview và Offer; tích hợp optimistic locking (`version`).
    - Ma trận phân quyền 6 vai trò: `src/lib/hrm/permissions.ts` (Director, HR Manager, Dept Manager, Employee, Candidate).
    - Audit log chuẩn: `src/lib/hrm/audit.ts` ghi nhật ký với `event_id` duy nhất chống trùng lặp.
    - Bộ kiểm thử tự động: `scripts/test-hrm.mjs` (10/10 test pass 100%).
  - **Phase P2 (Đề xuất Tuyển dụng → Phê duyệt → Duyệt & Tạo Tin Giao Dịch)**:
    - Route Handlers: `src/app/api/hrm/proposals/route.ts`, `[id]/route.ts`, `[id]/approve-create-job/route.ts`.
    - Thao tác nguyên tử "Duyệt & Tạo tin": liên kết `proposal_id <-> job_id`, chuyển status sang `posted`, tạo `JobPosting` tương ứng.
    - Bắt buộc lý do khi từ chối đề xuất; kiểm tra định biên và ngưỡng duyệt của Giám đốc (>3 người hoặc >50M).
  - **Phase P3 (/careers Ứng tuyển kèm CV, /candidate & ATS Kanban API)**:
    - Xác thực và lưu trữ CV an toàn ngoài `public`: `src/lib/hrm/files.ts` (kiểm tra MIME, đuôi tệp .pdf/.doc/.docx, giới hạn dung lượng <= 5MB, SHA-256 hash, lưu tại `scratch/uploads`).
    - API nộp hồ sơ & quản lý: `src/app/api/hrm/applications/route.ts`, `[id]/transition/route.ts`, `src/app/api/hrm/jobs/route.ts`, `src/app/api/hrm/interviews/route.ts`.
    - Kiến trúc Dual Repository: `src/lib/hrm/repository.ts` với `repo.local.ts` (runtime store fallback) và `repo.mysql.ts`.
  - **Phase P3b (Khắc phục Triệt để 4 Lỗi B1 - B4)**:
    - **B1 (Lặp nhật ký hoạt động)**: Chấm dứt nối chuỗi log vào `current_company`. Tách riêng `activity_logs` có `event_id` duy nhất; xây dựng Timeline Component ở cuối Side-Drawer của ứng viên (`ats-view.tsx`), hiển thị 5 sự kiện gần nhất, gộp sự kiện trùng, có nút "Xem thêm".
    - **B2 (Banner dời lịch cam kẹt lại)**: Tính toán banner phụ thuộc trực tiếp vào trạng thái lịch phỏng vấn. Khi HR duyệt & xếp lại lịch (`status = 'scheduled'`), banner cam biến mất ngay lập tức và thay bằng khối "Lịch phỏng vấn mới đã cập nhật".
    - **B3 (Thẻ Kanban hiện cờ sai)**: Cờ và icon trên thẻ Kanban phản ánh đúng `interview_schedule.status`: khi ứng viên đã xác nhận hoặc lịch đã chốt, thẻ hiển thị biểu tượng Check xanh (`CheckCircle2`), gỡ bỏ hoàn toàn cờ cảnh báo `AlertTriangle` cam; khi hồ sơ chưa có lịch hiển thị badge cảnh báo "Chưa có lịch".
    - **B4 (Nút Xác nhận tham gia không bấm được / thiếu lịch)**: Chặn chuyển sang bước Phỏng vấn nếu chưa tạo lịch; tại Cổng ứng viên, nếu chưa có lịch cụ thể thì hiển thị trạng thái "Đang chờ nhân sự lên lịch" và khóa mờ 2 nút Xác nhận/Dời lịch; khi có lịch và ứng viên bấm Xác nhận, cập nhật `interview.status = 'confirmed'`, đổi badge thành "✓ Đã chốt lịch" (xanh lục), khóa nút và gửi thông báo real-time tới HR. Hồ sơ UV-2026-104 đồng bộ 100% trên cả 3 giao diện *(Hoàn thành)*.

---

## 4. Kết luận Phân tích Hiện trạng Màn Tuyển dụng & ATS (PHA 1)
- **Stack:** Next.js 14.2 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons, Runtime Store (`localStorage` + `CustomEvent`).
- **File màn Tuyển dụng chính:** `src/components/modules/ats-view.tsx` (nhúng trong `src/app/app/page.tsx` qua `AppShell`).
- **Bảng Đề xuất:** Lines 1330–1457 của `ats-view.tsx` (8 cột, thiếu drawer chi tiết bên phải và nhãn Gấp thay chấm đỏ).
- **Khối Tin đang mở:** Lines 1459–1549 của `ats-view.tsx` (dạng grid card, đang dồn chung một trang với Kanban và Đề xuất).
- **Kanban:** Lines 1551–2200 của `ats-view.tsx` (gộp 3 cột lớn thay vì 5 cột chuẩn, chưa có thanh cuộn ngang cố định và dính tiêu đề).
- **Thanh công cụ:** Đang phân tán nhiều nút trên đầu Kanban (lọc vị trí, nguồn, thời gian, xuất file, đặt lại).
- **Trợ lý chat:** `src/components/copilot/ai-copilot-widget.tsx` chưa hoàn thiện widget nổi thu nhỏ/kéo/ẩn không che Kanban.
- **Bố cục & Điều hướng:** Đang lặp tiêu đề với Header chính; chưa chia 3 Tab chuyên biệt và chưa có dải số liệu KPI bấm lọc nhanh.

