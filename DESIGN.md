# DESIGN SYSTEM & UI/UX SPEC — Hệ thống Quản trị Hành chính Nhân sự tích hợp AI (AI-Powered HRM)

> Áp dụng nghiêm ngặt quy chuẩn thiết kế **Unslop** (`skills/unslop/SKILL.md`): loại bỏ toàn bộ dấu hiệu giao diện AI đại trà (gradient tím/xanh, bóng phát sáng glow, emoji trang trí, chữ in hoa giãn cách rộng), giữ khung điều hướng yên tĩnh (**Quiet Chrome**) và tập trung độ sắc nét vào dữ liệu nghiệp vụ nhân sự.

## 1. ĐỊNH HƯỚNG THIẾT KẾ (5 DÒNG DIRECTION CHUẨN UNSLOP)
- **Product:** Hệ thống điều hành hành chính nhân sự, chấm công, tính lương chuẩn luật Việt Nam và tuyển dụng tích hợp AI dành cho quản trị IT, ban giám đốc, bộ phận HR, trưởng bộ phận và nhân viên.
- **Character:** Điềm tĩnh, chuẩn xác, có chiều sâu nghiệp vụ (calm, exact, institutional).
- **World:** Phòng điều hành nhân sự và sổ cái tài chính doanh nghiệp — nơi mọi con số lương thưởng, mã nhân viên, hợp đồng và bảng công đòi hỏi độ tin cậy cao như chứng từ kế toán.
- **Moments:** (1) Bảng phân tích biến động nhân sự & quỹ lương tháng dùng đường xu hướng sắc nét với màu nhấn `teal`; (2) Phiếu lương chi tiết (Payslip), thẻ chấm điểm AI CV và Popup chi tiết Audit Log bất biến phân tách ngữ nghĩa rõ ràng.
- **Signature:** Mọi mã định danh nhân sự (`NV-2024-000`), mã ca làm việc (`HC-08:00`), địa chỉ IP (`10.24.18.102`), tỷ lệ phần trăm và số tiền VND (`32.500.000 ₫`) luôn hiển thị bằng font monospace kèm `tabular-nums` thẳng hàng tuyệt đối theo cột dọc.

## 2. HỆ MÀU & QUIET CHROME (COLOR TOKENS)
Sử dụng **1 dải màu trung tính duy nhất (`zinc`)** cho toàn bộ bề mặt, viền, văn bản và **1 màu nhấn duy nhất (`teal`)** cho hành động chính hoặc trạng thái đang chọn.

### 2.1. Bề mặt & Viền (Neutral Ramp — `zinc`)
| Thành phần | Light Mode | Dark Mode | Quy tắc áp dụng |
| :--- | :--- | :--- | :--- |
| **Nền trang (App Background)** | `bg-zinc-50` (`#FAFAFA`) | `bg-zinc-950` (`#09090B`) | Nền tổng thể dịu mắt khi làm việc nhiều giờ |
| **Bề mặt nổi (Card / Sidebar / Header)** | `bg-white` (`#FFFFFF`) | `bg-zinc-900` (`#121214`) | Phân tách bằng bước chuyển sắc độ nhẹ, không dùng bóng đổ màu |
| **Bề mặt phụ (Muted / Table Header)** | `bg-zinc-100/70` (`#F4F4F5`) | `bg-zinc-800/60` (`#18181B`) | Dùng cho tiêu đề bảng, vùng lọc, ô tóm tắt phụ |
| **Viền mảnh (Hairline Border)** | `border-zinc-200/80` | `border-zinc-800/80` | Độ mờ 6–10% so với màu chữ, tạo ranh giới tinh tế |

### 2.2. Màu Nhấn, Viền Ngữ Nghĩa (`border-l-4`) & 5 Badge Vai Trò
- **Primary Accent (`teal`):** Light Mode `bg-teal-700` (`#0F766E`) chữ trắng; Dark Mode `bg-teal-400` (`#2DD4BF`) chữ `text-zinc-950`.
- **Thẻ KPI & Khối chi tiết (`border-l-4`):** Dùng viền nhấn trái `border-l-4` kèm nền tint nhẹ để phân biệt ngữ nghĩa nhanh trên cả 2 chế độ sáng/tối. **Bắt buộc** khai báo kèm biến thể Dark mode (`dark:border-l-*-400`, ví dụ `border-l-blue-500 dark:border-l-blue-400`, `border-l-violet-500 dark:border-l-violet-400`, `border-l-amber-500 dark:border-l-amber-400`, `border-l-teal-600 dark:border-l-teal-400`, `border-l-emerald-500 dark:border-l-emerald-400`, `border-l-rose-500 dark:border-l-rose-400`).
- **Badge 5 vai trò trong Thẻ tài khoản (đủ nền + chữ + viền `dark:`):**
  - `SUPER_ADMIN`: `Quản trị hệ thống · Toàn quyền` (`teal`).
  - `DIRECTOR`: `Giám đốc Điều hành` (`violet`).
  - `HR_MANAGER`: `Trưởng phòng Nhân sự` (`blue`).
  - `DEPT_MANAGER`: `Trưởng bộ phận · <Khối>` (`amber`).
  - `EMPLOYEE`: `<Mã NV> · <Phòng ban>` (`zinc`).
- **Danh sách CẤM tuyệt đối:** CẤM gradient đa sắc (`from-purple-*`, `from-indigo-*`), CẤM `bg-clip-text text-transparent`, CẤM neon glow hay bóng đổ màu.

## 3. TYPOGRAPHY & CON SỐ (`tabular-nums`)
- **Fonts:** `Inter` (`--font-sans`) và `JetBrains Mono` (`--font-mono`) kèm `font-mono tabular-nums` cho toàn bộ mã NV, mã ca, tiền tệ VND, IP, ngày tháng.
- **Weights:** Chỉ dùng `font-normal` (400), `font-medium` (500), tối đa `font-semibold` (600). Cấm `font-bold` (700) trở lên.
- **Casing:** Sentence case ở mọi nơi (`Quản trị cốt lõi`, `Vận hành nhân sự`); cấm `uppercase tracking-widest` và cấm in nghiêng nhấn mạnh.

## 4. BỐ CỤC APP SHELL KHÓA CỐ ĐỊNH & HỆ LƯỚI 4PX
- **App Shell cố định (`fixed inset-0 h-dvh overflow-hidden`):** Sidebar và Header khóa cố định trong khung nhìn, chỉ vùng nội dung chính cuộn độc lập (`overflow-y-auto`).
- **Sidebar (`w-64` / `256px`):**
  - Danh mục điều hướng: padding `p-4`, mỗi mục cao `36px` (`h-9`), cách nhau `2px` (`space-y-0.5`), icon `16px` (`w-4 h-4`, `strokeWidth={1.5}`), nhãn nhóm `mt-6 mb-2 text-xs`.
  - **Thẻ tài khoản ở đáy Sidebar:** Thay thế hoàn toàn khối đăng nhập cũ. Gồm Avatar tròn (2 chữ cái đầu của 2 từ cuối trong họ tên, vd `Nguyễn Văn An -> VA`), họ tên `truncate`, badge vai trò theo 5 Role, nút `Hồ sơ` (mở Phiếu lương cá nhân), nút `Đăng xuất` màu đỏ (mở Dialog xác nhận `Ở lại` / `Đăng xuất`), và menu `Đổi vai trò (demo)` (gọi `setAuthenticatedUser` với `ROLE_DEFAULT_PROFILES`). Hỗ trợ đóng bằng `Esc` và tự đóng drawer trên mobile.
- **Header gọn:** Chỉ hiển thị tên phân hệ + kỳ dữ liệu (`Tháng 11/2026`), nút bật/tắt **AI HR Copilot** và nút chuyển **Dark/Light Mode** (đã lược bỏ khối thông tin user thừa ở góc phải).
- **Trang `/login`:** Split layout bất đối xứng với 2 tab **Đăng nhập** & **Đăng ký** kèm 5 pill trải nghiệm nhanh 5 vai trò bên trái; bản xem trước bảng điều hành & phiếu lương bên phải.

## 5. QUY TẮC ICON, COPYWRITING, MOTION & 4 TRẠNG THÁI UI
- **Icons:** Chỉ dùng `lucide-react` (`w-4 h-4`, `strokeWidth={1.5}`). **TUYỆT ĐỐI CẤM EMOJI** ở mọi giao diện TSX, HTML tĩnh và dữ liệu mẫu.
- **Copywriting:** Ngắn gọn, đi thẳng nghiệp vụ, không dấu chấm than (`!`), không câu chào sáo rỗng.
- **Motion:** Chỉ dùng `transition-colors duration-150 ease-out`; cấm `transition-all`, `hover:scale-*`, `animate-pulse` trang trí.
- **4 Trạng thái UI bắt buộc:** `Ready`, `Loading` (Skeleton), `Empty` (kèm hành động) và `Error` (kèm nút Thử lại); Responsive mượt từ `360px` đến `1600px`.
