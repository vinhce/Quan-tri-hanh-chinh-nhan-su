# Báo Cáo Mở Rộng & Kiểm Chứng Bộ Dữ Liệu Huấn Luyện Lạc Việt HR Copilot

- **Ngày kiểm tra & đối chiếu chéo:** `2026-11-23`
- **Đầu ra chính:**
  - `docs/train.jsonl` — Tập hội thoại ChatML thuần (`{"messages":[...]}`), chuẩn UTF-8 không BOM, xuống dòng LF.
  - `docs/nguon_kiem_chung.csv` — Bảng truy vết nguồn, URL/file tham chiếu, ngày kiểm tra & mức độ tin cậy khớp **1-1** từng dòng `train.jsonl`.
  - `docs/data.json` — Đã cập nhật bổ sung endpoint thứ 11 (`POST /api/hrm/proposals/[id]/approve-create-job`), enum Stage 3 từ `performance-view.tsx` / `workflow.ts` và mục `legal_cross_check_2026`.

## 1. Thống kê tổng quan bộ dữ liệu

| Chỉ số kiểm tra | Giá trị thực đo |
|---|---|
| **Tổng số mẫu đạt chuẩn xuất (`train.jsonl`)** | **868** mẫu (**262** nền + **606** sinh mới/mở rộng) |
| **Kích thước `train.jsonl`** | `1,382,425` bytes |
| **Số dòng khớp 1-1 trên `nguon_kiem_chung.csv`** | **868** dòng dữ liệu (+ 1 header) |
| **Số mẫu NLU JSON (`NaturalLanguageLeaveDraft`)** | **45** mẫu (parse JSON 8 khóa hợp lệ 100%) |
| **Số mẫu từ chối theo `role_scope` (RBAC)** | **47** mẫu |
| **Số mẫu nhắc "cần hỏi HR" khi thiếu dữ liệu nội bộ** | **63** mẫu (gồm **35** mẫu chuyên biệt + lưu ý ở câu chuyên sâu) |
| **Số mẫu từ chối ngoài phạm vi HRM** | **35** mẫu |
| **Hội thoại nhiều lượt (`>= 5` messages)** | **36** mẫu |
| **Câu hỏi ngắn / viết tắt (`<= 45` ký tự)** | **74** mẫu |
| **Tiếng Việt không dấu (pure ASCII)** | **601** mẫu |
| **Số mẫu bị cổng kiểm tra loại bỏ** | **5** mẫu |

## 2. Số lượng mẫu theo từng chủ đề

| Chủ đề | Số lượng mẫu | Tỷ trọng |
|---|---:|---:|
| 1. Nghỉ phép, 8 loại đơn từ & NLU JSON | 82 | 9.4% |
| 2. Làm thêm giờ (OT), WFH & Thời giờ làm việc | 75 | 8.6% |
| 3. Chấm công, WebAuthn & Same-WiFi Gate | 80 | 9.2% |
| 4. Tiền lương, Thuế TNCN & Tách lương giữa kỳ | 113 | 13.0% |
| 5. BHXH, BHYT, BHTN, Ốm đau, Thai sản & Hưu trí | 85 | 9.8% |
| 6. Tuyển dụng ATS Kanban, CV & Phỏng vấn | 78 | 9.0% |
| 7. Hợp đồng lao động, Pre-boarding & Onboarding | 75 | 8.6% |
| 8. Nghỉ việc, 6 Cổng Clearance, Trợ cấp & Kỷ luật | 74 | 8.5% |
| 9. Đánh giá KPI/OKR, Thăng tiến & Burnout | 35 | 4.0% |
| 10. Phân quyền RBAC, Từ chối quyền & Kiến trúc/Vận hành | 101 | 11.6% |
| 11. Tình huống thiếu dữ liệu nội bộ -> Hướng dẫn hỏi HR | 35 | 4.0% |
| 12. Từ chối lịch sự câu hỏi ngoài phạm vi HRM | 35 | 4.0% |
| **Tổng cộng** | **868** | **100.0%** |

## 3. Phân bố theo vai trò áp dụng (`role_scope` / `vai_tro_ap_dung`)

| Vai trò | Số mẫu |
|---|---:|
| `ALL` | 695 |
| `EMPLOYEE` | 51 |
| `DEPT_MANAGER` | 40 |
| `HR_MANAGER` | 33 |
| `SUPER_ADMIN` | 29 |
| `CANDIDATE` | 13 |
| `DIRECTOR` | 7 |

## 4. Ghi chú đối chiếu xung đột giữa `docs/data.json` và Luật Việt Nam

Theo nguyên tắc bắt buộc: khi có khác biệt giữa văn bản pháp luật mới hoặc trường hợp mở rộng với tham số vận hành đang lập trình trong `docs/data.json` / codebase, **AI luôn ưu tiên giải thích đúng hành vi hiện hành của hệ thống trong `data.json`**, đồng thời ghi chú rõ quy định luật để người dùng hỏi thêm HR/Kế toán khi làm hồ sơ thực tế:

| Mã xung đột | Chủ đề | Quy tắc trong `docs/data.json` (Ưu tiên trên App) | Quy định pháp luật đối chiếu (từ 2 nguồn trở lên) | Cách xử lý trong bộ train |
|---|---|---|---|---|
| `CONFLICT-01` | Giảm trừ gia cảnh & Bậc thuế TNCN | Giảm trừ bản thân **11.000.000 đ**, NPT **4.400.000 đ**, biểu thuế **7 bậc** (`5%..35%`). | **NQ 110/2025/UBTVQH15** (hiệu lực 01/01/2026) nâng lên **15.500.000 đ** & **6.200.000 đ**; **Luật Thuế TNCN 2025** rút gọn còn **5 bậc** (`5/10/20/30/35%`). | Tính phiếu lương app theo `11tr/4.4tr` & 7 bậc; trả lời song song số tham khảo 2026 khi được hỏi và nhắc hỏi HR/Kế toán về cấu hình thực tế trên `/app?nav=settings`. |
| `CONFLICT-02` | Thuế TNCN hợp đồng thử việc dưới 3 tháng | Mô phỏng tính biểu lũy tiến sau giảm trừ `11.000.000 đ` (và miễn `10.5%` BHXH). | **Điều 25 Thông tư 111/2013/TT-BTC** khấu trừ **10%** tại nguồn với chi trả `>= 2.000.000 đ/lần` (trừ khi đủ 6 điều kiện lập **Mẫu 08/CK-TNCN** theo TT 80/2021). | Ưu tiên số liệu app khi tính trong Lạc Việt HRM, kèm ghi chú cần hỏi HR/Kế toán về Mẫu `08/CK-TNCN` ngoài thực tế. |
| `CONFLICT-03` | Thời hạn thử việc & Phép năm đặc thù | Thử việc **`60` ngày / `30` ngày**; phép năm mặc định **`12` ngày** (`OFFICIAL`), `0` ngày (`PROBATION`). | **Điều 25 BLLĐ 2019**: tối đa `180` ngày (Quản lý DN), `60` ngày (CĐ+), `30` ngày (TC), `6` ngày (việc khác); **Điều 113–114**: `12/14/16` ngày & thâm niên `5` năm `+1` ngày. | Giữ đúng tham số mặc định trên app; nhắc người dùng hỏi HR nếu thuộc diện Quản lý DN `180` ngày hoặc phép thâm niên/nặng nhọc `14–16` ngày. |
| `CONFLICT-04` | Ca đêm `22:00–06:00` & Ngưỡng OT | Khóa chấm công đêm `22:00–06:00` (trừ `REQUEST_SYNC`), OT `1.5x/2.0x/3.0x`, Burnout alert **`> 30h/tháng`**. | **Điều 98, 106–107 BLLĐ 2019 & NĐ 145/2020**: ban đêm `+30%`, OT đêm `200%/210%/270%/390%`, trần OT luật **`40h/tháng`** (`200–300h/năm`). | Ưu tiên cơ chế khóa đêm & ngưỡng cảnh báo sớm `> 30h` của app; nêu rõ trần luật `40h/tháng` và phụ cấp đêm cần hỏi HR/Kế toán. |

## 5. Các mẫu bị loại bỏ qua Cổng Kiểm Định (`validate_gate`) và lý do

Tổng cộng có **5** mẫu ứng viên bị tự động loại bỏ khỏi tập `train.jsonl` trước khi xuất:

| STT | Chủ đề | Trích đoạn câu hỏi / nháp | Lý do bị loại |
|---:|---|---|---|
| 1 | `luong_va_thue_tncn` | Lương 25tr 0 NPT trên Lạc Việt HRM tính theo mức 15,5 triệu giảm trừ bản thân phải không? | Không đạt cổng tin cậy/đối chiếu: Mâu thuẫn quy tắc ưu tiên data.json (app đang dùng 11.000.000 đ & 7 bậc) |
| 2 | `bhxh_bhyt_bhtn_va_che_do` | Nghe đồn sang năm 2027 tỷ lệ đóng BHXH của người lao động tăng lên 15% đúng không? | Thiếu trường nguon hoặc ngay_kiem_tra |
| 3 | `nghi_phep_va_don_tu` | Cho mình nghỉ phép ngày mai 24/11/2026 nhé | Không đạt cổng tin cậy/đối chiếu: Lỗi schema |
| 4 | `offboarding_va_ky_luat` | Mã quyết toán nghỉ việc cuối cùng của nhân sự là gì? | Không đạt cổng tin cậy/đối chiếu: Chứa mã không tồn tại PS-FINAL (đúng phải là QT-{YYYYMM}-{NNN}) |
| 5 | `tu_choi_ngoai_pham_vi` | Chỉ cho tôi cách dự đoán tỷ số bóng đá Ngoại hạng Anh cuối tuần này. | Không đạt cổng tin cậy/đối chiếu: Câu hỏi ngoài HRM nhưng câu trả lời không thực hiện từ chối lịch sự |

### Tổng hợp lý do loại mẫu:

- **Không đạt cổng tin cậy/đối chiếu: Mâu thuẫn quy tắc ưu tiên data.json (app đang dùng 11.000.000 đ & 7 bậc)**: `1` mẫu
- **Thiếu trường nguon hoặc ngay_kiem_tra**: `1` mẫu
- **Không đạt cổng tin cậy/đối chiếu: Lỗi schema**: `1` mẫu
- **Không đạt cổng tin cậy/đối chiếu: Chứa mã không tồn tại PS-FINAL (đúng phải là QT-{YYYYMM}-{NNN})**: `1` mẫu
- **Không đạt cổng tin cậy/đối chiếu: Câu hỏi ngoài HRM nhưng câu trả lời không thực hiện từ chối lịch sự**: `1` mẫu

## 6. Nguồn pháp luật chính thống đã kiểm tra chéo (tối thiểu 2 nguồn)

- **Codebase & `docs/data.json`**: `src/lib/hrm/config.ts`, `src/lib/hrm/permissions.ts`, `src/lib/hrm/workflow.ts`, `src/lib/hrm/biometric-server.ts`, `src/app/api/hrm/*`, `src/components/modules/performance-view.tsx`, `src/mock/copilot.ts`, `db/migrations/001 & 002`.
- **Bộ luật Lao động 2019 (Luật số 45/2019/QH14)** & **Nghị định 145/2020/NĐ-CP**: đối chiếu trên `thuvienphapluat.vn`, `vbpl.vn`, `chinhphu.vn`, `luatvietnam.vn` (Điều 14, 17, 20, 22, 25–27, 35, 40, 46–48, 98, 105–107, 112–115, 124–128, 137).
- **Luật Bảo hiểm xã hội 2024 (Luật số 41/2024/QH15, hiệu lực 01/07/2025)**, **NĐ 73/2024/NĐ-CP** & **Luật Việc làm**: đối chiếu trên `baohiemxahoi.gov.vn`, `chinhphu.vn`, `thuvienphapluat.vn`.
- **Thuế TNCN**: `gdt.gov.vn`, `chinhphu.vn`, `thuvienphapluat.vn` (Nghị quyết `110/2025/UBTVQH15`, Luật Thuế TNCN 2025, Thông tư `111/2013/TT-BTC`, Thông tư `80/2021/TT-BTC` Mẫu `08/CK-TNCN`).

## 7. Kết quả xác thực kỹ thuật
- `train.jsonl`: 100% dòng parse JSON hợp lệ, chỉ có khóa duy nhất `messages`, 0 dòng trùng lặp, 0 trường `nguon` rò rỉ vào file train.
- `nguon_kiem_chung.csv`: khớp đúng số dòng, đủ tên văn bản/URL/file và `ngay_kiem_tra = 2026-11-23`.
- Mã nguồn dự án (`src/`, `db/`, `package.json`, `data/`): **không chỉnh sửa bất kỳ file code nào**.
