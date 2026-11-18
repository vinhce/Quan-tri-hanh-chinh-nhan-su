# PRD — Hệ thống Quản trị Hành chính Nhân sự tích hợp AI (AI-Powered HRM)

## 1. TỔNG QUAN & SỨ MỆNH
- **Tên dự án:** Hệ thống Quản trị Hành chính Nhân sự tích hợp AI (AI-Powered HRM)
- **Mô tả ngắn gọn:** Nền tảng quản trị nhân sự, chấm công, tính lương (Payroll chuẩn luật lao động Việt Nam) và tuyển dụng (ATS) tập trung cho doanh nghiệp vừa và lớn, tích hợp trợ lý AI HR Copilot hỗ trợ sàng lọc hồ sơ, phân tích rủi ro nghỉ việc (Burnout/Turnover) và tự động hóa nghiệp vụ hành chính.
- **Phạm vi Giai đoạn 1 (UI Prototype & Mock Architecture):**
  - **CHỈ xây dựng giao diện người dùng (Frontend UI) kết hợp dữ liệu mẫu có cấu trúc (`src/mock/` — 28 nhân sự, tự động export ra `public/mock/*.json` qua `scripts/export-mock-json.mjs` và nạp qua `fetch()` trong `src/lib/mock-fetcher.ts`)**.
  - Hỗ trợ song song hai phiên bản: **Next.js App Router** (`src/`, build static export ra `out/`) và **HTML/CSS/JS tĩnh** (`web/`, chạy qua `npm run dev:web`).
  - **KHÔNG** tạo cơ sở dữ liệu thật, **KHÔNG** cài đặt Prisma/ORM, **KHÔNG** viết Backend API, **KHÔNG** gọi LLM/AI API thật.
  - Mọi nút bấm và luồng thao tác (chuyển Role demo, lọc dữ liệu, thêm/sửa hồ sơ, duyệt đơn đa cấp, chốt bảng lương, kéo thả/chuyển bước ứng viên, tạo đơn qua AI HR Copilot) đều hoạt động trực tiếp trên state trình duyệt, ghi nhận Audit Log phiên hiện tại và phản hồi qua hệ thống Toast.
- **Đối tượng sử dụng (5 Role trong hệ thống):**
  1. `SUPER_ADMIN` (Quản trị hệ thống IT): Cấu hình tham số toàn cục, quản lý tài khoản, ma trận phân quyền RBAC 5 vai trò và giám sát nhật ký bảo mật bất biến (Audit Logs). Tách biệt hoàn toàn khỏi quyền phê duyệt điều hành.
  2. `DIRECTOR` (Giám đốc Điều hành): Phê duyệt cấp cao (Cấp 3) đối với đơn nghỉ dài ngày vượt ngưỡng `director_approval_min_days`, nghỉ không lương và công tác nước ngoài; theo dõi Dashboard điều hành, Core HR, Bảng lương và KPI.
  3. `HR_MANAGER` (Trưởng phòng / Chuyên viên Nhân sự): Quản lý toàn diện vòng đời nhân sự (Core HR), tuyển dụng (ATS + AI CV Scoring), chấm công tổng hợp, phê duyệt đơn Cấp 2 (trừ quỹ phép), tính lương (Payroll) và phân tích biến động nhân sự.
  4. `DEPT_MANAGER` (Trưởng bộ phận / Quản lý trực tiếp): Theo dõi quân số phòng ban, phê duyệt đơn Cấp 1 cho nhân sự thuộc khối mình phụ trách, đánh giá hiệu suất (KPI/OKR).
  5. `EMPLOYEE` (Nhân viên): Cổng thông tin tự phục vụ (Employee Self-Service - ESS) để chấm công, gửi/hủy đơn từ, tra cứu phiếu lương cá nhân (Payslip), theo dõi quỹ phép năm và hỏi đáp quy chế qua AI HR Copilot.

## 2. VẤN ĐỀ CẦN GIẢI QUYẾT (PAIN POINTS)
- **Phân mảnh dữ liệu nhân sự:** Hồ sơ nhân viên, hợp đồng lao động, bảng chấm công và bảng lương nằm rải rác trên nhiều file bảng tính rời rạc, dễ sai sót công thức BHXH/BHYT/BHTN và thuế TNCN lũy tiến.
- **Quá tải hành chính & thiếu minh bạch phê duyệt:** Quy trình xin nghỉ phép, tăng ca (OT), WFH, công tác cần luồng duyệt đa cấp rõ ràng (`Trưởng bộ phận -> HR -> Giám đốc`) kèm đối soát quỹ phép tồn và lý do từ chối bắt buộc.
- **Sàng lọc hồ sơ tuyển dụng tốn thời gian:** Chuyên viên tuyển dụng cần công cụ Kanban 5 bước kết hợp chấm điểm tương thích (`match_score`), điểm mạnh/yếu và bộ câu hỏi phỏng vấn chuẩn hóa.
- **Thiếu cảnh báo sớm về biến động nhân sự:** Cần phát hiện sớm dấu hiệu quá tải (Burnout) thông qua dữ liệu OT, tần suất nghỉ đột xuất và biến động KPI.

## 3. DANH SÁCH 11 NHÓM MÀN HÌNH & TÍNH NĂNG CHÍNH (CHIA THEO 5 BƯỚC DELIVERABLES)

### Bước 1: Khung Giao Diện Chung, Điều Hướng 5 Vai Trò, Đăng Nhập & Dữ Liệu Mẫu (`src/mock/`)
- [x] **Nhóm màn hình 1 — Đăng nhập (`/login`) & App Shell cố định:**
  - Màn hình đăng nhập bố cục bất đối xứng (Split Layout): bên trái là 2 tab **Đăng nhập** & **Đăng ký** kèm 5 pill trải nghiệm nhanh 5 vai trò; bên phải là bản xem trước trực quan bảng điều hành nhân sự và phiếu lương với số liệu `tabular-nums`.
  - App Shell khóa cố định (`fixed inset-0 h-dvh overflow-hidden`): Sidebar tự động ẩn/hiện danh mục theo đúng quyền của Role đang chọn; cuối Sidebar là **Thẻ tài khoản** (Avatar 2 chữ cái cuối, badge màu theo vai trò, nút `Hồ sơ`, nút `Đăng xuất` có Dialog xác nhận, và menu `Đổi vai trò (demo)`).
  - Header gọn: tên phân hệ + kỳ dữ liệu (`Tháng 11/2026`), nút bật/tắt **AI HR Copilot** và nút chuyển **Dark/Light Mode**.
  - Kho dữ liệu mẫu `src/mock/` (28 nhân sự, mặt bằng lương tối ưu giảm 30% sát thực tế) tự động export ra `public/mock/*.json` và nạp qua `fetch()`.

### Bước 2: Quản Trị Nhân Sự Cốt Lõi & Tuyển Dụng Thông Minh (`HR_MANAGER` / `DIRECTOR`)
- [x] **Nhóm màn hình 2 — HR Executive Dashboard:**
  - Thẻ chỉ số cốt lõi dùng viền nhấn ngữ nghĩa `border-l-4` (Tổng nhân sự, Tỷ lệ biến động Turnover Rate, Quỹ lương tháng VND, Hợp đồng sắp hết hạn).
  - Biểu đồ xu hướng biến động nhân sự & quỹ lương (Recharts) và khối **AI Burnout & Turnover Risk Alert**.
- [x] **Nhóm màn hình 3 — Hồ sơ Nhân sự, Sơ đồ Tổ chức & Hợp đồng (Core HR):**
  - Danh sách 28 nhân sự có tìm kiếm bỏ dấu tiếng Việt, lọc theo phòng ban/trạng thái, xem chi tiết hồ sơ 360 độ, cây sơ đồ tổ chức và gia hạn hợp đồng lao động.
- [x] **Nhóm màn hình 4 — Tuyển dụng ATS & AI Chấm Điểm CV (Kanban Pipeline):**
  - Bảng Kanban 5 bước (`APPLIED`, `AI_SCREENED`, `INTERVIEW`, `OFFER`, `ONBOARDED`) kèm ngăn xem chi tiết **AI CV Scoring** (`match_score`, `strengths`, `gaps`, `interview_questions`).

### Bước 3: Chấm Công, Đơn Từ Đa Cấp & Tính Lương Tự Động (Payroll Việt Nam)
- [x] **Nhóm màn hình 5 — Bảng Chấm Công Tháng & Quản Lý Ca:**
  - Ma trận chấm công tháng theo ca làm việc (`HC-08:00`, `CA-SANG`, `CA-CHIEU`), thống kê công chuẩn, đi muộn/về sớm và giờ tăng ca.
- [x] **Nhóm màn hình 6 — Phê Duyệt Đơn Từ Đa Cấp (`DEPT_MANAGER -> HR_MANAGER -> DIRECTOR`):**
  - Danh sách đơn nghỉ phép năm, nghỉ không lương, OT, WFH, công tác trong/ngoài nước.
  - Tiến trình duyệt đa cấp hiển thị trong Dialog chi tiết; bắt buộc nhập lý do khi Từ chối; HR duyệt xong tự động đánh dấu trừ quỹ phép; người gửi được Hủy đơn khi chưa hoàn tất; ngưỡng `director_approval_min_days` đọc từ cấu hình.
- [x] **Nhóm màn hình 7 — Bảng Lương Tháng (Payroll Engine) & Phiếu Lương (Payslip):**
  - Công thức chuẩn Việt Nam: `Gross` -> Trừ `BHXH 8%`, `BHYT 1.5%`, `BHTN 1%` -> Giảm trừ gia cảnh (`11.000.000 ₫` bản thân + `4.400.000 ₫/người phụ thuộc`) -> `Thuế TNCN lũy tiến 7 bậc` -> `Net`.

### Bước 4: Quản Trị Hệ Thống, Phân Quyền & Nhật Ký Bảo Mật (`SUPER_ADMIN`)
- [x] **Nhóm màn hình 8 — Quản Lý Người Dùng & Ma Trận Phân Quyền (RBAC Matrix):**
  - Quản lý tài khoản hệ thống và bảng ma trận phân quyền `5 Vai trò x 6 Hành động` (`View`, `Create`, `Edit`, `Approve`, `Delete`, `Export`).
- [x] **Nhóm màn hình 9 — Cấu Hình Tham Số Hệ Thống & Nhật Ký Kiểm Toán (Audit Logs):**
  - Cấu hình giờ làm, ngày lễ, tỷ lệ BHXH/thuế, số ngày nghỉ tối thiểu cần Giám đốc duyệt (`hrm_director_min_days` lưu `localStorage`).
  - Bảng **Audit Logs** ghi nhận thao tác CRUD/duyệt theo thời gian thực qua `audit-logger.ts`; bấm vào từng dòng mở popup chi tiết **bất biến (chỉ đọc)** phân màu `border-l-4`, không có nút Sửa hay Xóa.

### Bước 5: Không Gian Quản Lý Bộ Phận, Cổng Nhân Viên (ESS) & AI HR Copilot
- [x] **Nhóm màn hình 10 — Workspace Trưởng Bộ Phận (`DEPT_MANAGER`) & Cổng Nhân Viên (`EMPLOYEE`):**
  - `DEPT_MANAGER`: Theo dõi quân số phòng ban, duyệt đơn cấp 1, đánh giá KPI/OKR.
  - `EMPLOYEE`: Tra cứu công cá nhân, quỹ phép năm, phiếu lương Net và gửi đơn mới.
- [x] **Nhóm màn hình 11 — Trợ Lý Ảo AI HR Copilot:**
  - Hỏi đáp quy chế công ty và luồng **Tạo nhanh đơn xin nghỉ phép bằng ngôn ngữ tự nhiên** bóc tách câu nhập tiếng Việt thành biểu mẫu có cấu trúc để gửi ngay.

## 4. NGOÀI PHẠM VI GIAI ĐOẠN 1 (OUT OF SCOPE)
- Không kết nối cơ sở dữ liệu thật (PostgreSQL, MySQL, SQLite) và không cài đặt Prisma/ORM.
- Không xây dựng Backend API Route (`/api/*`) hay xác thực JWT/Session phía máy chủ.
- Không gọi API trả phí đến OpenAI / Gemini / Anthropic thật.
- Không tích hợp phần cứng máy chấm công sinh trắc học hay cổng chuyển khoản ngân hàng tự động.
