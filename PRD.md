# PRD — Hệ thống Quản trị Hành chính Nhân sự tích hợp AI (AI-Powered HRM)

## 1. TỔNG QUAN & SỨ MỆNH
- **Tên dự án:** Hệ thống Quản trị Hành chính Nhân sự tích hợp AI (AI-Powered HRM)
- **Mô tả ngắn gọn:** Nền tảng quản trị nhân sự, chấm công, tính lương (Payroll chuẩn luật lao động Việt Nam) và tuyển dụng (ATS) tập trung cho doanh nghiệp vừa và lớn, tích hợp trợ lý AI HR Copilot hỗ trợ sàng lọc hồ sơ, phân tích rủi ro nghỉ việc (Burnout/Turnover) và tự động hóa nghiệp vụ hành chính.
- **Phạm vi Giai đoạn 1 (UI Prototype & Mock Architecture):**
  - **CHỈ xây dựng giao diện người dùng (Frontend UI) kết hợp dữ liệu mẫu có cấu trúc (`src/mock/`)**.
  - **KHÔNG** tạo cơ sở dữ liệu thật, **KHÔNG** cài đặt Prisma/ORM, **KHÔNG** viết Backend API, **KHÔNG** gọi LLM/AI API thật.
  - Mọi nút bấm và luồng thao tác (chuyển Role, lọc dữ liệu, thêm/sửa hồ sơ, duyệt đơn nghỉ phép/OT, chốt bảng lương, kéo thả/chuyển bước ứng viên, tạo đơn qua AI HR Copilot) đều hoạt động trực tiếp trên state trình duyệt và phản hồi qua hệ thống thông báo (Toast).
- **Đối tượng sử dụng (4 Role trong Role Switcher):**
  1. `SUPER_ADMIN` (Quản trị hệ thống): Cấu hình tham số toàn cục, quản lý tài khoản, ma trận phân quyền RBAC và giám sát nhật ký bảo mật (Audit Logs).
  2. `HR_MANAGER` (Trưởng phòng / Chuyên viên Nhân sự): Quản lý toàn diện vòng đời nhân sự (Core HR), tuyển dụng (ATS + AI CV Scoring), chấm công tổng hợp, tính lương (Payroll) và phân tích biến động nhân sự.
  3. `DEPT_MANAGER` (Trưởng bộ phận / Quản lý trực tiếp): Theo dõi quân số phòng ban, phê duyệt đơn nghỉ phép / tăng ca (OT), đánh giá hiệu suất (KPI/OKR) và đề xuất tuyển dụng.
  4. `EMPLOYEE` (Nhân viên): Cổng thông tin tự phục vụ (Employee Self-Service - ESS) để chấm công, gửi đơn từ, tra cứu phiếu lương cá nhân (Payslip), theo dõi quỹ phép năm và hỏi đáp quy chế qua AI HR Copilot.

## 2. VẤN ĐỀ CẦN GIẢI QUYẾT (PAIN POINTS)
- **Phân mảnh dữ liệu nhân sự:** Hồ sơ nhân viên, hợp đồng lao động, bảng chấm công và bảng lương nằm rải rác trên nhiều file bảng tính rời rạc, dễ sai sót công thức BHXH/BHYT/BHTN và thuế TNCN lũy tiến.
- **Quá tải hành chính & phê duyệt chậm:** Quy trình xin nghỉ phép, đăng ký làm thêm giờ (OT), giải trình chấm công qua email/tin nhắn thiếu minh bạch, khó đối soát quỹ phép tồn và định mức OT.
- **Sàng lọc hồ sơ tuyển dụng tốn thời gian:** Chuyên viên tuyển dụng phải đọc thủ công hàng trăm CV mỗi đợt, thiếu bộ tiêu chí định lượng mức độ phù hợp (`match_score`), điểm mạnh/yếu và bộ câu hỏi phỏng vấn chuẩn hóa.
- **Thiếu cảnh báo sớm về biến động nhân sự:** Ban lãnh đạo và HR chỉ biết nhân sự nghỉ việc khi nhận đơn xin thôi việc, thiếu công cụ phát hiện sớm dấu hiệu quá tải (Burnout) thông qua dữ liệu OT, tần suất nghỉ đột xuất và biến động KPI.

## 3. DANH SÁCH 11 NHÓM MÀN HÌNH & TÍNH NĂNG CHÍNH (CHIA THEO 5 BƯỚC DELIVERABLES)

### Bước 1: Khung Giao Diện Chung, Điều Hướng Đa Vai Trò, Đăng Nhập & Dữ Liệu Mẫu (`src/mock/`)
- [x] **Nhóm màn hình 1 — Đăng nhập (`/login`) & App Shell đa vai trò:**
  - Màn hình đăng nhập bố cục bất đối xứng (Split Layout): bên trái là biểu mẫu đăng nhập kèm bộ chọn nhanh tài khoản demo cho 4 role; bên phải là bản xem trước trực quan bảng điều hành nhân sự và phiếu lương với số liệu `tabular-nums`.
  - Thanh điều hướng bên (Sidebar) tự động ẩn/hiện danh mục theo đúng quyền của Role đang chọn.
  - Thanh tiêu đề (Header) tích hợp **Role Switcher** (`SUPER_ADMIN`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`), bộ chuyển trạng thái giao diện (`Ready`, `Loading`, `Empty`, `Error`) để kiểm thử trực tiếp, nút chuyển **Dark/Light Mode**, và nút mở nhanh **AI HR Copilot**.
  - Kho dữ liệu mẫu `src/mock/` chuẩn hóa như schema CSDL thật (`employees.ts`, `attendance.ts`, `payroll.ts`, `ats.ts`, `admin.ts`, `copilot.ts`, `types.ts`, `index.ts`).

### Bước 2: Quản Trị Nhân Sự Cốt Lõi & Tuyển Dụng Thông Minh (Dành cho `HR_MANAGER`)
- [ ] **Nhóm màn hình 2 — HR Executive Dashboard:**
  - Thẻ chỉ số cốt lõi (Tổng nhân sự, Tỷ lệ biến động Turnover Rate, Quỹ lương tháng VND, Hợp đồng sắp hết hạn trong 30 ngày).
  - Biểu đồ xu hướng biến động nhân sự & quỹ lương (Recharts) theo quy chuẩn một màu nhấn duy nhất (`teal-700`/`teal-400`).
  - Khối **AI Burnout & Turnover Risk Alert**: danh sách nhân viên có điểm rủi ro cao kèm nguyên nhân phân tích (tăng ca vượt ngưỡng, KPI giảm, nghỉ phép bất thường) và hành động đề xuất.
- [ ] **Nhóm màn hình 3 — Hồ sơ Nhân sự, Sơ đồ Tổ chức & Hợp đồng (Core HR):**
  - Danh sách nhân viên có tìm kiếm bỏ dấu tiếng Việt, lọc theo phòng ban/trạng thái làm việc, xem chi tiết hồ sơ 360 độ (thông tin cá nhân, lộ trình thăng tiến, lương cơ bản, người phụ thuộc).
  - Cây sơ đồ tổ chức (Org Chart) theo khối/phòng ban và quản lý hạn hợp đồng lao động (Thử việc, Xác định thời hạn 12-36 tháng, Không xác định thời hạn) với thao tác gia hạn cập nhật state.
- [ ] **Nhóm màn hình 4 — Tuyển dụng ATS & AI Chấm Điểm CV (Kanban Pipeline):**
  - Bảng Kanban 5 bước: `APPLIED` (Mới ứng tuyển) -> `AI_SCREENED` (AI đã sàng lọc) -> `INTERVIEW` (Phỏng vấn) -> `OFFER` (Đề nghị nhận việc) -> `ONBOARDED` (Nhận việc).
  - Ngăn xem chi tiết kết quả **AI CV Scoring**: điểm tương thích (`match_score`), điểm mạnh (`strengths`), khoảng trống kỹ năng (`gaps`), và danh sách câu hỏi phỏng vấn gợi ý riêng cho từng ứng viên.

### Bước 3: Chấm Công, Đơn Từ & Tính Lương Tự Động (Payroll Việt Nam)
- [ ] **Nhóm màn hình 5 — Bảng Chấm Công Tháng & Quản Lý Ca (Time & Attendance):**
  - Bảng ma trận chấm công tháng theo ca làm việc (`HC-08:00`, `CA-SANG`, `CA-CHIEU`), thống kê công chuẩn, đi muộn/về sớm, giờ tăng ca (OT ngày thường 150%, cuối tuần 200%, lễ 300%).
- [ ] **Nhóm màn hình 6 — Phê Duyệt Đơn Nghỉ Phép, Tăng Ca & Giải Trình Công:**
  - Danh sách đơn chờ duyệt/đã duyệt/từ chối kèm bộ lọc trạng thái, kiểm tra quỹ phép năm còn lại (`remaining_leave_days`) và nút Duyệt / Từ chối tức thời có thông báo Toast.
- [ ] **Nhóm màn hình 7 — Bảng Lương Tháng (Payroll Engine) & Phiếu Lương (Payslip):**
  - Bảng tính lương tổng hợp toàn công ty theo chuẩn Việt Nam: `Lương Gross` -> Trừ bảo hiểm bắt buộc người lao động đóng (`BHXH 8%`, `BHYT 1.5%`, `BHTN 1%`) -> Trừ giảm trừ gia cảnh (`11.000.000 ₫/tháng` bản thân + `4.400.000 ₫/người phụ thuộc`) -> Tính `Thuế TNCN` -> Thực lĩnh `Lương Net`.
  - Xem chi tiết phiếu lương từng nhân viên (Payslip Drawer/Modal), đối soát khoản cộng/trừ và bấm chốt/phát hành phiếu lương.

### Bước 4: Quản Trị Hệ Thống, Phân Quyền & Nhật Ký Bảo Mật (Dành cho `SUPER_ADMIN`)
- [ ] **Nhóm màn hình 8 — Quản Lý Người Dùng & Ma Trận Phân Quyền (RBAC Matrix):**
  - Quản lý danh sách tài khoản hệ thống, trạng thái kích hoạt và gán vai trò.
  - Bảng ma trận phân quyền trực quan (`View`, `Create`, `Edit`, `Approve`, `Delete`, `Export`) theo từng phân hệ nghiệp vụ, cho phép bật/tắt quyền và lưu cấu hình trên state.
- [ ] **Nhóm màn hình 9 — Cấu Hình Tham Số Hệ Thống & Nhật Ký Kiểm Toán (Audit Logs):**
  - Cấu hình giờ làm việc tiêu chuẩn, danh sách ngày nghỉ lễ, tỷ lệ đóng BHXH/BHYT/BHTN, mức giảm trừ gia cảnh và cấu hình tham số AI Copilot.
  - Bảng tra cứu **Audit Logs** ghi nhận chi tiết người thực hiện, vai trò, hành động (`UPDATE_SALARY`, `APPROVE_LEAVE`, `EXPORT_PAYROLL`...), đối tượng tác động, địa chỉ IP và dấu thời gian chuẩn xác.

### Bước 5: Không Gian Quản Lý Bộ Phận, Cổng Nhân Viên (ESS) & AI HR Copilot
- [ ] **Nhóm màn hình 10 — Workspace Trưởng Bộ Phận (`DEPT_MANAGER`) & Cổng Nhân Viên (`EMPLOYEE`):**
  - Giao diện `DEPT_MANAGER`: Theo dõi hiện diện của thành viên trong phòng ban hôm nay, duyệt nhanh đơn phép/OT của cấp dưới, đánh giá KPI/OKR định kỳ.
  - Giao diện `EMPLOYEE` (Self-Service): Xem lịch sử chấm công cá nhân, số ngày phép năm còn lại, mở xem phiếu lương Net từng tháng, gửi đơn xin nghỉ phép hoặc đăng ký OT mới.
- [ ] **Nhóm màn hình 11 — Trợ Lý Ảo AI HR Copilot (Khung Chat Nổi & Phân Tích Ngôn Ngữ Tự Nhiên):**
  - Hỏi đáp tức thì về quy chế công ty, cách tính thuế TNCN, chế độ bảo hiểm, quy trình hoàn ứng và tra cứu nhanh số liệu nhân sự.
  - Luồng **Tạo nhanh đơn xin nghỉ phép bằng ngôn ngữ tự nhiên**: người dùng nhập câu tự nhiên (ví dụ: *"Cho tôi xin nghỉ phép năm 2 ngày thứ Năm và thứ Sáu tuần này để giải quyết việc gia đình"*), hệ thống tự động bóc tách thành biểu mẫu có cấu trúc (`Loại phép`, `Từ ngày`, `Đến ngày`, `Số ngày`, `Lý do`) để xác nhận gửi đơn chỉ với 1 cú nhấp chuột.

## 4. NGOÀI PHẠM VI GIAI ĐOẠN 1 (OUT OF SCOPE)
- Không kết nối cơ sở dữ liệu thật (PostgreSQL, MySQL, SQLite) và không cài đặt Prisma hay bất kỳ ORM nào.
- Không xây dựng Backend API Route (`/api/*`), Server Actions ghi DB hay xác thực JWT/Session phía máy chủ.
- Không gọi API trả phí đến OpenAI / Gemini / Anthropic thật (toàn bộ phản hồi AI Copilot, AI CV Scoring và AI Burnout Risk được mô phỏng thông minh, nhất quán từ `src/mock/`).
- Không tích hợp phần cứng máy chấm công sinh trắc học (vân tay/khuôn mặt) hay cổng chuyển khoản ngân hàng tự động.
