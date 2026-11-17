# DESIGN SYSTEM & UI/UX SPEC — Hệ thống Quản trị Hành chính Nhân sự tích hợp AI (AI-Powered HRM)

> Áp dụng nghiêm ngặt quy chuẩn thiết kế **Unslop** (`skills/unslop/SKILL.md`): loại bỏ toàn bộ dấu hiệu giao diện AI đại trà (gradient tím/xanh, bóng phát sáng glow, emoji trang trí, chữ in hoa giãn cách rộng), giữ phần khung điều hướng yên tĩnh (**Quiet Chrome**) và tập trung độ sắc nét vào dữ liệu nghiệp vụ nhân sự thực tế.

## 1. ĐỊNH HƯỚNG THIẾT KẾ (5 DÒNG DIRECTION CHUẨN UNSLOP)
- **Product:** Hệ thống điều hành hành chính nhân sự, chấm công, tính lương chuẩn luật Việt Nam và tuyển dụng tích hợp AI dành cho ban giám đốc, bộ phận HR, trưởng bộ phận và nhân viên.
- **Character:** Điềm tĩnh, chuẩn xác, có chiều sâu nghiệp vụ (calm, exact, institutional).
- **World:** Phòng điều hành nhân sự và sổ cái tài chính doanh nghiệp — nơi mọi con số lương thưởng, mã nhân viên, hợp đồng và bảng công đòi hỏi độ tin cậy cao như chứng từ kế toán.
- **Moments:** (1) Bảng phân tích biến động nhân sự & quỹ lương tháng với đường xu hướng sắc nét sử dụng duy nhất màu nhấn `teal`; (2) Phiếu lương chi tiết (Payslip) và thẻ chấm điểm AI CV hiển thị cấu trúc khấu trừ BHXH/Thuế TNCN rõ ràng tới từng đồng.
- **Signature:** Mọi mã định danh nhân sự (`NV-2024-001`), mã ca làm việc (`HC-08:00`), tỷ lệ phần trăm và số tiền VND (`32.500.000 ₫`) luôn hiển thị bằng font monospace kèm `tabular-nums` thẳng hàng tuyệt đối theo cột dọc.

## 2. HỆ MÀU & QUIET CHROME (COLOR TOKENS)
Sử dụng **1 dải màu trung tính duy nhất (`zinc`)** cho toàn bộ bề mặt, viền, văn bản và **1 màu nhấn duy nhất (`teal`)** cho hành động chính hoặc trạng thái đang chọn.

### 2.1. Bề mặt & Viền (Neutral Ramp — `zinc`)
| Thành phần | Light Mode | Dark Mode | Quy tắc áp dụng |
| :--- | :--- | :--- | :--- |
| **Nền trang (App Background)** | `bg-zinc-50` (`#FAFAFA`) | `bg-zinc-950` (`#09090B`) | Nền tổng thể dịu mắt khi làm việc nhiều giờ |
| **Bề mặt nổi (Card / Sidebar / Header)** | `bg-white` (`#FFFFFF`) | `bg-zinc-900` (`#121214`) | Phân tách bằng bước chuyển sắc độ nhẹ, không dùng bóng đổ màu |
| **Bề mặt phụ (Muted / Table Header)** | `bg-zinc-100/70` (`#F4F4F5`) | `bg-zinc-800/60` (`#18181B`) | Dùng cho tiêu đề bảng, vùng lọc, ô tóm tắt phụ |
| **Viền mảnh (Hairline Border)** | `border-zinc-200/80` | `border-zinc-800/80` | Độ mờ 6–10% so với màu chữ, tạo ranh giới tinh tế |

### 2.2. Ba Vai Trò Chữ (3 Text Roles)
- **Primary Text (Chính):** `text-zinc-900` (Light) / `text-zinc-100` (Dark) — Tiêu đề trang, tên nhân viên, số liệu tổng.
- **Secondary Text (Phụ):** `text-zinc-600` (Light) / `text-zinc-400` (Dark) — Nhãn biểu mẫu, mô tả chức danh, phòng ban.
- **Muted Text (Mờ):** `text-zinc-500` (Light) / `text-zinc-500` (Dark) — Nhãn phân nhóm sidebar, chú thích thời gian, đơn vị tính.

### 2.3. Màu Nhấn & Màu Ngữ Nghĩa (Single Accent & Semantic Colors)
- **Primary Accent (`teal`):**
  - Light Mode: `bg-teal-700` (`#0F766E`), chữ trắng `text-white`, hover `hover:bg-teal-800`; văn bản nhấn dùng `text-teal-700`, nền chọn nhẹ `bg-teal-50/80 border-teal-200`.
  - Dark Mode: `bg-teal-400` (`#2DD4BF`) với chữ tối `text-zinc-950` (đảm bảo độ tương phản WCAG AA >= 4.5:1), hoặc văn bản nhấn `text-teal-400`, nền chọn nhẹ `bg-teal-950/40 border-teal-800/60`.
- **Semantic Colors (Chỉ mang ý nghĩa trạng thái, đã hạ độ bão hòa):**
  - Hợp lệ / Đã duyệt / Đi làm đúng giờ: `text-emerald-700 bg-emerald-50 border-emerald-200` (Dark: `text-emerald-400 bg-emerald-950/40 border-emerald-800/50`).
  - Cảnh báo / Chờ duyệt / Sắp hết hạn HĐ: `text-amber-700 bg-amber-50 border-amber-200` (Dark: `text-amber-400 bg-amber-950/40 border-amber-800/50`).
  - Lỗi / Từ chối / Rủi ro Burnout cao: `text-rose-700 bg-rose-50 border-rose-200` (Dark: `text-rose-400 bg-rose-950/40 border-rose-800/50`).
- **Danh sách CẤM tuyệt đối về màu sắc:**
  - CẤM dùng gradient chuyển màu sắc (`from-purple-*`, `from-indigo-*`, `via-pink-*`, `bg-gradient-to-*` đa sắc).
  - CẤM chữ gradient (`bg-clip-text text-transparent`).
  - CẤM hiệu ứng phát sáng (`shadow-teal-500/50`, `drop-shadow`, neon glow, blurred color blobs).

## 3. TYPOGRAPHY & CON SỐ (`tabular-nums`)
- **Font chữ giao diện (`--font-sans`):** `Inter` — rõ ràng, hỗ trợ đầy đủ dấu tiếng Việt.
- **Font chữ số liệu & mã định danh (`--font-mono`):** `JetBrains Mono` — bắt buộc kết hợp class `font-mono tabular-nums` cho:
  - Mã nhân viên (`NV-2024-001`), mã hợp đồng (`HD-2025-089`), mã ca (`HC-08:00`), địa chỉ IP (`10.24.18.102`).
  - Tiền tệ VND (`32.500.000 ₫`), tỷ lệ bảo hiểm/thuế (`8%`, `10.5%`), điểm AI (`92/100`), ngày tháng (`17/11/2026`).
- **Độ đậm (Font Weights):** Chỉ sử dụng `font-normal` (400), `font-medium` (500) và tối đa `font-semibold` (600) cho điểm nhấn quan trọng. **CẤM** dùng `font-bold` (700), `font-extrabold` (800) hay `font-black` (900). Phân cấp thị giác dựa vào kích thước và màu sắc (`Primary` vs `Secondary` vs `Muted`), không dựa vào độ đậm quá mức.
- **Kiểu chữ (Casing):**
  - Áp dụng **Sentence case** ở mọi nơi (`Quản trị cốt lõi`, `Vận hành nhân sự`, `Bảng lương tháng 11/2026`).
  - **CẤM** viết hoa toàn bộ kèm giãn chữ rộng (`uppercase tracking-widest` hoặc `tracking-wider`) cho nhãn nhóm menu, tiêu đề cột bảng hay tiêu đề thẻ.
  - Không dùng chữ in nghiêng (`italic`) để nhấn mạnh. Không dùng khoảng cách chữ âm (`tracking-tighter`) cho chữ nhỏ dưới 16px.

## 4. HỆ LƯỚI KHOẢNG CÁCH 4PX (4PX SPACING GRID) & LAYOUT
- **Quy chuẩn 4px Grid:** Mọi `margin`, `padding`, `gap`, chiều cao điều khiển đều nằm trên bội số của 4px (cho phép bước đệm 2px như `space-y-0.5` bên trong danh sách điều hướng).
- **Kích thước Khung Ứng Dụng (App Proportions):**
  - Khung ứng dụng chiếm toàn bộ chiều cao khung nhìn (`min-h-screen`), bố cục gồm **Sidebar cố định `256px` (`w-64`)** bên trái và vùng nội dung chính co giãn linh hoạt (giới hạn chiều rộng đọc tối ưu `max-w-[1600px]`).
  - **Sidebar Navigation (Mật độ chuẩn Unslop):**
    - Padding khung: `p-4` (`16px`).
    - Mỗi mục menu cao đúng `36px` (`h-9`), khoảng cách giữa các mục `2px` (`space-y-0.5`), bo góc `rounded-lg` (`8px`).
    - Icon đặt trong khung cố định `16px x 16px` (`w-4 h-4 shrink-0`), cách chữ `8px` (`gap-2`), giúp toàn bộ nhãn văn bản thẳng hàng theo một trục dọc duy nhất.
    - Nhãn phân nhóm (Section label): dùng sentence case, cỡ chữ `12px` (`text-xs`), màu `text-zinc-500`, khoảng cách phía trên `24px` (`mt-6`) và phía dưới `8px` (`mb-2`) để nhóm rõ ràng với các mục con bên dưới.
  - **Cards & Panels:**
    - Padding thẻ thông thường: `p-5` (`20px`) hoặc `p-6` (`24px`).
    - Cạnh trang (Page padding): `px-6 py-6` trên desktop, `px-4 py-4` trên mobile.
    - Bo góc lồng nhau (Nested Radius): Panel/Modal `rounded-xl` (`12px`), Card `rounded-xl` (`12px`), Control/Button/Input `rounded-lg` (`8px`), Badge trạng thái `rounded-md` (`6px`) — không lạm dụng `rounded-full` cho mọi thành phần.

## 5. QUY TẮC ICON, COPYWRITING & CHUYỂN ĐỘNG (MOTION)
- **Icons:**
  - Chỉ sử dụng bộ icon `lucide-react` với một kích thước chuẩn `16px` (`w-4 h-4`) và độ dày nét `strokeWidth={1.5}`.
  - Icon luôn mang màu của vai trò văn bản đi kèm (`text-zinc-500` hoặc `text-zinc-400`, khi active là `text-teal-700 dark:text-teal-400`), không tô mỗi icon một màu sặc sỡ.
  - **TUYỆT ĐỐI CẤM EMOJI** (`👋`, `✨`, `🚀`, `🤖`, `🔥`, `📊`, `🎉`...) ở mọi tiêu đề, nhãn nút, badge, thông báo Toast và dữ liệu mẫu.
- **Copywriting (Ngôn từ giao diện):**
  - Ngắn gọn, đi thẳng vào nghiệp vụ: tiêu đề màn hình nêu rõ ngữ cảnh và kỳ dữ liệu (ví dụ: `Điều hành nhân sự · Tháng 11/2026`), **CẤM** các câu chào sáo rỗng kiểu `Chào mừng trở lại, Nguyễn Văn An! 👋`.
  - **CẤM** sử dụng dấu chấm than (`!`) trong toàn bộ giao diện.
  - Các chỉ số thay đổi luôn ghi rõ mốc so sánh cụ thể (ví dụ: `+4 nhân sự so với tháng 10/2026`, `-1,2% so với quý 3/2026`).
  - Không dùng từ ngữ quảng cáo phóng đại (`siêu tốc`, `đột phá`, `ma thuật`, `New ✨`, `PRO`).
- **Motion (Chuyển động có mục đích):**
  - Chỉ dùng chuyển tiếp màu sắc và độ mờ có chỉ định rõ (`transition-colors duration-150 ease-out`).
  - **CẤM** `transition-all`, **CẤM** `hover:scale-*` làm phình thẻ, **CẤM** `animate-pulse` hay `animate-ping` trang trí vô nghĩa (chỉ dùng skeleton khi đang ở trạng thái `Loading`).

## 6. QUY TẮC RESPONSIVE & 4 TRẠNG THÁI GIAO DIỆN BẮT BUỘC
- **Mobile-First & Responsive (Từ 360px đến 1600px):**
  - Trên màn hình nhỏ (`< 768px`), Sidebar thu gọn thành ngăn kéo (Drawer) đóng/mở qua nút menu trên Header; các bảng dữ liệu rộng hỗ trợ cuộn ngang cục bộ trong khung thẻ mà không gây tràn ngang toàn trang.
- **4 Trạng thái bắt buộc trên AppShell & các khối dữ liệu:**
  1. `Ready` (Sẵn sàng): Hiển thị đầy đủ dữ liệu nghiệp vụ từ `src/mock/`, cho phép lọc, tìm kiếm và thao tác.
  2. `Loading` (Đang tải): Hiển thị khung xương (Skeleton) có cùng chiều cao, bố cục lưới với màn hình thật.
  3. `Empty` (Trống): Hiển thị thông báo ngắn gọn giải thích lý do chưa có dữ liệu kèm nút hành động tạo mới hoặc đặt lại bộ lọc.
  4. `Error` (Lỗi): Hiển thị cảnh báo rõ nguyên nhân và nút `Thử tải lại` để khôi phục về trạng thái `Ready`.
