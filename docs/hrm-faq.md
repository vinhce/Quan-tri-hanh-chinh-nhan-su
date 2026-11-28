# Cẩm nang Hỏi – Đáp Hành chính Nhân sự (Lạc Việt HRM FAQ)

> **Phạm vi tài liệu:** Tài liệu hỏi – đáp chuẩn hóa phục vụ tra cứu nội bộ và làm nguồn tri thức (RAG) cho **Hệ thống Quản trị Hành chính Nhân sự Lạc Việt HRM**.  
> **Nguyên tắc biên soạn:** Toàn bộ số liệu, quy trình và ngưỡng kiểm soát trong tài liệu phản ánh đúng cấu hình đang vận hành trên hệ thống và các quy chiếu pháp luật lao động hiện hành trong kho mã nguồn. Các chính sách nội bộ đặc thù chưa có trong hệ thống được đánh dấu rõ bằng `[TODO: Công ty điền ...]` để bộ phận Nhân sự / Ban Giám đốc rà soát bổ sung.

---

## Mục lục

1. [Phép năm & Các loại nghỉ (Câu 1 – Câu 10)](#1-phép-năm--các-loại-nghỉ)
2. [Chấm công, Ca làm việc & Giải trình (Câu 11 – Câu 18)](#2-chấm-công-ca-làm-việc--giải-trình)
3. [Làm thêm giờ (OT) & Cảnh báo quá tải (Burnout) (Câu 19 – Câu 24)](#3-làm-thêm-giờ-ot--cảnh-báo-quá-tải-burnout)
4. [Lương, Thưởng, Phụ cấp, BHXH & Thuế TNCN (Câu 25 – Câu 34)](#4-lương-thưởng-phụ-cấp-bhxh--thuế-tncn)
5. [Tạo, Hủy & Quy trình Duyệt đơn từ (Câu 35 – Câu 42)](#5-tạo-hủy--quy-trình-duyệt-đơn-từ)
6. [Hợp đồng, Thử việc & Tuyển dụng (Câu 43 – Câu 49)](#6-hợp-đồng-thử-việc--tuyển-dụng)
7. [Nghỉ việc, Bàn giao & Tất toán (Câu 50 – Câu 54)](#7-nghỉ-việc-bàn-giao--tất-toán)
8. [Phân quyền dữ liệu (RBAC) & Sử dụng Trợ lý Lạc Việt (Câu 55 – Câu 60)](#8-phân-quyền-dữ-liệu-rbac--sử-dụng-trợ-lý-lạc-việt)
9. [Phúc lợi, Công tác & Nội quy chung (Câu 61 – Câu 65)](#9-phúc-lợi-công-tác--nội-quy-chung)
10. [Bảng tổng hợp các mục `[TODO]` cần công ty điền bổ sung](#10-bảng-tổng-hợp-các-mục-todo-cần-công-ty-điền-bổ-sung)

---

## 1. Phép năm & Các loại nghỉ

### Câu 1: Nhân viên chính thức có bao nhiêu ngày phép năm? Thâm niên có được cộng thêm ngày phép không?
Nhân viên có trạng thái làm việc chính thức (`OFFICIAL`) được hưởng tiêu chuẩn **12 ngày phép năm/năm**.  
Về thâm niên: cứ mỗi **5 năm** làm việc liên tục tại công ty, nhân viên được cộng thêm **+1 ngày** phép năm theo cấu hình hệ thống (`seniority_extra_day_per_years = 5`).

### Câu 2: Nhân viên thử việc hoặc đang chờ nhận việc có ngày phép năm không?
**Không.** Nhân viên ở trạng thái thử việc (`PROBATION`) hoặc chờ nhận việc (`PENDING_ONBOARD`) có quỹ phép năm trên hệ thống là **0 ngày**.  
Sau khi được chuyển sang trạng thái chính thức (`OFFICIAL`), quỹ phép năm sẽ được ghi nhận theo quy định.

### Câu 3: Ngày phép năm chưa sử dụng hết có được chuyển sang năm sau không và hạn dùng đến khi nào?
**Có.** Số ngày phép tồn của năm cũ được phép chuyển tiếp sang năm kế tiếp, nhưng **chỉ có giá trị sử dụng đến hết ngày 31/03** của năm sau. Sau mốc 31/03, phần phép tồn chuyển tiếp chưa dùng hết sẽ hết hiệu lực theo cấu hình hệ thống.

### Câu 4: Có thể xin nghỉ nửa ngày không? Mỗi đơn xin nghỉ tối đa được bao nhiêu ngày?
- **Nghỉ nửa ngày:** **Có.** Hệ thống hỗ trợ mức chia nhỏ tối thiểu là **0.5 ngày** (nghỉ nửa ngày sáng hoặc nửa ngày chiều).
- **Giới hạn mỗi đơn:** Một đơn xin nghỉ trên hệ thống có tổng thời lượng tối đa là **90 ngày/đơn**.

### Câu 5: Nghỉ ốm có cần chứng từ y tế không và được nộp đơn lùi tối đa bao nhiêu ngày?
- **Chứng từ y tế:** Đơn nghỉ ốm (`SICK_LEAVE`) **bắt buộc phải có giấy chứng nhận / chứng từ y tế hợp lệ** đính kèm để HR đối chiếu và giải quyết chế độ theo quy định.
- **Thời hạn nộp lùi:** Hệ thống cho phép nộp đơn nghỉ ốm lùi ngày tối đa **3 ngày** kể từ ngày nghỉ (`maxBackdate = 3`).

### Câu 6: Đơn nghỉ phép năm và nghỉ không lương có được phép nộp lùi ngày không?
**Không.** Cả đơn nghỉ phép năm (`ANNUAL_LEAVE`) và đơn nghỉ không lương (`UNPAID_LEAVE`) đều có giới hạn nộp lùi bằng **0 ngày** (`maxBackdate = 0`).  
Người lao động phải lập và gửi đơn **từ ngày bắt đầu nghỉ trở về trước**, hệ thống sẽ từ chối nếu chọn ngày trong quá khứ.

### Câu 7: Trong năm 2026, công ty áp dụng bao nhiêu ngày nghỉ lễ, Tết có hưởng lương?
Theo cấu hình ngày lễ năm 2026 trên hệ thống (`public_holidays_2026`), người lao động được nghỉ hưởng nguyên lương tổng cộng **11 ngày**, gồm:
1. **Tết Dương lịch:** **1 ngày** (`01/01`).
2. **Tết Âm lịch (Bính Ngọ):** **5 ngày** (`16/02 – 20/02`).
3. **Giỗ Tổ Hùng Vương:** **1 ngày** (`26/04 – 27/04`).
4. **Ngày Giải phóng miền Nam & Quốc tế Lao động:** **2 ngày** (`30/04 – 01/05`).
5. **Quốc khánh:** **2 ngày** (`02/09 – 03/09`).

[TODO: Công ty điền thông báo lịch nghỉ bù / hoán đổi ngày làm việc cụ thể cho từng kỳ nghỉ lễ trong năm 2026 (nếu ngày lễ trùng cuối tuần)] *(TODO-01)*

### Câu 8: Chế độ nghỉ thai sản áp dụng như thế nào? Công ty có hỗ trợ thêm gì ngoài chế độ BHXH không?
- **Khung tham khảo chung theo pháp luật:** Lao động nữ nghỉ thai sản theo chế độ bảo hiểm xã hội (thời gian hưởng chuẩn 6 tháng đối với sinh 1 con theo quy định hiện hành của Luật BHXH; trường hợp đặc thù giải quyết theo hồ sơ y tế/BHXH). Trên hệ thống, khi nghỉ dài ngày/thai sản, bộ phận HR và Kế toán phối hợp cập nhật trạng thái nhân sự và hồ sơ BHXH tương ứng.
- **Chính sách bổ sung nội bộ:** [TODO: Công ty điền chính sách hỗ trợ thêm cho lao động nữ mang thai/thai sản và lao động nam có vợ sinh con (quà/trợ cấp tài chính, linh hoạt giờ làm hoặc nghỉ dưỡng sức nếu có)] *(TODO-02)*

### Câu 9: Nghỉ hiếu, nghỉ hỉ, nghỉ sinh nhật được hưởng như thế nào?
- **Khung tham khảo chung theo Bộ luật Lao động (Điều 115):** Người lao động được nghỉ việc riêng hưởng nguyên lương đối với kết hôn (3 ngày), con đẻ/con nuôi kết hôn (1 ngày), cha/mẹ đẻ, cha/mẹ nuôi, cha/mẹ vợ hoặc cha/mẹ chồng, vợ/chồng, con đẻ/con nuôi chết (3 ngày) và cần thông báo với người sử dụng lao động.
- **Chính sách mở rộng của công ty:** [TODO: Công ty điền chính sách riêng của công ty về ngày nghỉ sinh nhật có lương, phạm vi người thân hưởng nghỉ hiếu/hỉ mở rộng và mức tiền mừng/phúng điếu hỗ trợ] *(TODO-03)*

### Câu 10: Nghỉ không lương bao nhiêu ngày trong tháng sẽ ảnh hưởng đến việc đóng BHXH tháng đó?
Nếu trong tháng nhân viên có tổng số ngày nghỉ không lương (`UNPAID_LEAVE`) từ **14 ngày làm việc trở lên** (`unpaidDaysInMonth >= 14`), hệ thống tự động áp dụng trạng thái **miễn đóng BHXH/BHYT/BHTN trong tháng đó** theo quy định pháp luật hiện hành về thời gian không hưởng tiền lương.

---

## 2. Chấm công, Ca làm việc & Giải trình

### Câu 11: Công ty hiện áp dụng những ca làm việc nào và thời gian ân hạn đi muộn ra sao?
Hệ thống cấu hình **3 ca làm việc tiêu chuẩn** đều có **8 giờ làm việc/ngày** và **60 phút nghỉ trưa cố định (12:00 – 13:00)**:

| Mã ca | Giờ làm việc | Giờ nghỉ trưa | Thời gian ân hạn | Ghi chú |
| :--- | :---: | :---: | :---: | :--- |
| `HC-08:00` | `08:00 – 17:00` | `12:00 – 13:00` | **10 phút** | Ca hành chính sớm |
| `HC-08:30` | `08:30 – 17:30` | `12:00 – 13:00` | **15 phút** | **Ca mặc định** của hệ thống |
| `FLEX-09:00` | `09:00 – 18:00` | `12:00 – 13:00` | **15 phút** | Ca linh hoạt muộn |

### Câu 12: Số ngày công chuẩn mỗi tháng là bao nhiêu và hệ thống quy đổi công ngày như thế nào?
- **Công chuẩn tháng:** **22 công/tháng** (cơ sở tính lương, đơn giá giờ OT và tất toán phép dư).
- **Quy đổi số giờ làm việc thực tế trong ngày sang công (`evaluateDailyPunch`):**
  - Từ **6.5 giờ trở lên** (`>= 6.5h`): tính **1.0 công**.
  - Từ **3.5 giờ đến dưới 6.5 giờ** (`3.5h <= giờ < 6.5h`): tính **0.5 công**.
  - Dưới **3.5 giờ** (`< 3.5h`): tính **0.0 công**.

### Câu 13: Cơ chế "khóa đêm" (22:00 – 06:00) và "tự ngắt ca lúc 22:00" hoạt động thế nào?
- **Khóa chấm công ban đêm (`22:00 – 06:00`):** Hệ thống khóa thao tác chấm công thông thường trong khung giờ **22:00 đến 06:00** sáng hôm sau (`isAttendanceNightLockWindow`), ngoại trừ luồng đồng bộ tự động từ đơn từ đã duyệt (`REQUEST_SYNC`).
- **Tự ngắt ca lúc 22:00:** Nếu nhân viên đã check-in nhưng quên check-out đến mốc **22:00**, hệ thống tự động đóng phiên chấm công, gắn trạng thái **`MISSING_PUNCH` — "Quên chấm công (Tự ngắt ca 22:00)"** và ghi nhận tạm thời **0.0 công** cho ngày đó cho đến khi có giải trình hợp lệ được duyệt.

### Câu 14: Vì sao tôi bắt buộc phải kết nối WiFi văn phòng và xác thực sinh trắc học khi chấm công? Dùng 4G/5G có chấm công được không?
Hệ thống áp dụng đồng thời hai lớp xác thực chống chấm công hộ và gian lận vị trí:
1. **Sinh trắc học thiết bị (WebAuthn):** Sử dụng khóa mã hóa bất đối xứng (`ES256`/`RS256`, phiên challenge hiệu lực **120 giây**) gắn với thiết bị đã đăng ký của nhân viên.
2. **Kiểm tra cùng mạng WiFi văn phòng (Same-WiFi Gate):** Chặn kết nối qua mạng di động **4G/5G** (trả về lỗi **HTTP 403 `CELLULAR_BLOCKED`**) và chặn IP không thuộc mạng văn phòng (trả về lỗi **HTTP 403 `WIFI_MISMATCH`**).  
*(Hệ thống hỗ trợ các cơ chế kiểm tra mạng nội bộ `SAME_WIFI_NAT_IP`, `SAME_LAN_SUBNET`, `ADMIN_WHITELIST` hoặc `POLICY_DISABLED` do quản trị viên cấu hình tùy hạ tầng văn phòng.)*

### Câu 15: Khi quên chấm công hoặc gặp sự cố kỹ thuật, tôi cần xử lý thế nào và giới hạn giải trình là bao nhiêu?
Khi phát sinh quên check-in/check-out (`MISSING_PUNCH`) hoặc đi muộn/về sớm có lý do chính đáng, nhân viên tạo đơn **Giải trình chấm công (`LATE_EXPLANATION`)** với các ràng buộc:
- **Giới hạn số lần:** Tối đa **3 lần/tháng** (`MONTHLY_EXPLANATION_LIMIT = 3`).
- **Thời hạn nộp đơn:** Trong vòng **<= 7 ngày** kể từ ngày chấm công phát sinh.
- **Khóa bảng công:** Không thể nộp đơn giải trình nếu bảng công tháng đó đã chuyển sang trạng thái khóa/đóng (`LOCKED` / `CLOSED`).

### Câu 16: Nếu quên chấm công vượt quá 3 lần/tháng hoặc quá hạn 7 ngày thì giải quyết ra sao?
Hệ thống sẽ tự động chặn tạo mới đơn `LATE_EXPLANATION` khi vượt ngưỡng **3 lần/tháng** hoặc quá hạn **7 ngày** (hoặc khi bảng công đã `LOCKED`/`CLOSED`).  
Trong trường hợp bất khả kháng (sự cố hệ thống/đặc biệt), nhân viên liên hệ trực tiếp quản lý trực tiếp và HR/C&B để kiểm tra theo quy chế ngoại lệ nội bộ (nếu có).

### Câu 17: Công ty có chính sách làm việc từ xa (WFH / Hybrid) không và điều kiện đăng ký như thế nào?
Trên hệ thống đã có sẵn loại đơn **Làm việc từ xa (`REMOTE_WORK`)** để nhân viên gửi đề nghị và cấp quản lý phê duyệt. Tuy nhiên, tiêu chuẩn áp dụng cụ thể do công ty quy định:  
[TODO: Công ty điền chính sách làm việc từ xa (WFH/Hybrid): đối tượng áp dụng, số ngày tối đa/tuần hoặc tháng, thời hạn đăng ký trước và yêu cầu check-in/báo cáo] *(TODO-04)*

### Câu 18: Đi muộn hoặc về sớm vượt quá thời gian ân hạn (10–15 phút) sẽ bị xử lý hoặc khấu trừ thế nào?
Trên cấu trúc dữ liệu bảng lương, hệ thống đã có trường **`penalty_deduction_vnd`** để ghi nhận các khoản khấu trừ kỷ luật/vi phạm nội quy (nếu có). Mức xử lý cụ thể theo số phút hoặc số lần vi phạm tuân theo nội quy lao động của công ty:  
[TODO: Công ty điền quy chế xử lý khi đi muộn/về sớm vượt ân hạn (số lần nhắc nhở, mức phạt/khấu trừ qua trường penalty_deduction_vnd hoặc quy đổi công)] *(TODO-05)*

---

## 3. Làm thêm giờ (OT) & Cảnh báo quá tải (Burnout)

### Câu 19: Hệ số tính lương làm thêm giờ (OT) trên hệ thống là bao nhiêu?
Hệ thống tính lương OT theo **3 mức hệ số** nhân với đơn giá giờ cơ sở **`base / (22 * 8)`**:
- **Ngày làm việc bình thường:** **1.5x** (`150%`).
- **Ngày nghỉ cuối tuần:** **2.0x** (`200%`).
- **Ngày nghỉ lễ, Tết có hưởng lương:** **3.0x** (`300%`).

### Câu 20: Những ai được phép đăng ký OT và điều kiện của một đơn OT hợp lệ là gì?
Nhân viên tạo đơn **Làm thêm giờ (`OVERTIME`)** phải đáp ứng đầy đủ 4 điều kiện hệ thống:
1. **Trạng thái nhân sự:** Chỉ áp dụng cho nhân viên chính thức; **chặn đối với nhân viên thử việc (`PROBATION`) và đã nghỉ việc (`RESIGNED`)**.
2. **Thời lượng mỗi đơn:** Phải **> 0 giờ** và tối đa **12 giờ/đơn**.
3. **Thời điểm nộp:** **Không được nộp lùi ngày** so với ngày phát sinh OT.
4. **Không trùng lịch:** Không chồng lấn với các đơn đã gửi cùng khung thời gian.

### Câu 21: Khi nào hệ thống bật cảnh báo quá tải (Burnout Alert) đối với nhân viên làm OT?
Hệ thống tự động quét dữ liệu định kỳ vào **thứ Hai hàng tuần lúc 06:00 (GMT+7)** và phát cảnh báo **Burnout** khi nhân viên chạm một trong hai ngưỡng sau:
- Tổng số giờ OT vượt quá **30 giờ/tháng** (`> 30h/tháng`), **hoặc**
- Điểm đánh giá rủi ro quá tải **`burnout_risk_score >= 70`**.  
*(Lưu ý: theo Điều 107 Bộ luật Lao động, trần làm thêm giờ thông thường không quá **40 giờ/tháng**).*

### Câu 22: Làm việc ca đêm hoặc làm thêm giờ vào ban đêm (22:00 – 06:00) có phụ cấp cộng thêm không?
Khung giờ ban đêm theo Bộ luật Lao động là **22:00 – 06:00** ngày hôm sau. Do phần hệ số phụ cấp ca đêm/OT đêm đặc thù chưa được cấu hình cố định trong bảng tham số hiện tại:  
[TODO: Công ty điền mức phụ cấp làm việc ban đêm (22:00–06:00) và hệ số/phụ cấp OT ban đêm áp dụng tại công ty theo khung BLLĐ] *(TODO-06)*

### Câu 23: Nhân viên có thể chọn đổi giờ OT sang ngày nghỉ bù thay vì nhận tiền OT không?
[TODO: Công ty điền quy định có cho phép quy đổi giờ OT sang ngày nghỉ bù hay không, tỷ lệ quy đổi và thời hạn sử dụng nghỉ bù] *(TODO-07)*

### Câu 24: Khi OT muộn sau 21:00, công ty có hỗ trợ chi phí ăn tối hoặc taxi/xe về nhà không?
[TODO: Công ty điền định mức hỗ trợ bữa ăn ca tối và chi phí đặt xe/taxi về nhà khi nhân viên OT sau 21:00] *(TODO-08)*

---

## 4. Lương, Thưởng, Phụ cấp, BHXH & Thuế TNCN

### Câu 25: Hàng tháng công ty chốt công vào ngày nào và chi trả lương vào ngày nào?
Theo cấu hình hệ thống (`MOCK_SYSTEM_CONFIG`):
- **Ngày chốt công hàng tháng (`payroll_cutoff_day`):** **Ngày 25** hàng tháng.
- **Ngày trả lương (`payroll_payout_day`):** **Ngày 05** của tháng kế tiếp.

### Câu 26: Nếu tôi được điều chỉnh tăng/giảm lương giữa tháng thì kỳ lương tháng đó tính như thế nào?
Hệ thống áp dụng cơ chế **tách lương giữa kỳ (`mid_month_split`)** dựa trên ngày hiệu lực điều chỉnh (`effective_date`):
- Hệ thống đếm số ngày làm việc tiêu chuẩn (Thứ 2 – Thứ 6 qua hàm `countWeekdaysInRange`) trước ngày hiệu lực (`days_old`) và từ ngày hiệu lực đến hết kỳ (`days_new`), làm tròn theo bước **0.5 ngày**.
- Tổng lương cơ bản trong tháng được tính theo công thức tỷ lệ:  
  **`round(old_base * days_old / 22) + round(new_base * days_new / 22)`**

### Câu 27: Tỷ lệ trích đóng BHXH, BHYT, BHTN và mức trần đóng đang áp dụng trên hệ thống là bao nhiêu?
Trên hệ thống tính lương hiện hành:
- **Người lao động (NLĐ) đóng tổng 10.5%:** gồm **8%** BHXH + **1.5%** BHYT + **1%** BHTN.
- **Người sử dụng lao động (NSDLĐ) đóng tổng 23.5%:** gồm **17.5%** BHXH + **3%** BHYT + **1%** BHTN + **2%** Kinh phí công đoàn (KPCĐ).
- **Mức trần lương đóng đang cấu hình trên hệ thống:** **46.800.000đ/tháng**.

[TODO: Công ty điền mức trần lương đóng BHTN hiện hành theo vùng của công ty và cập nhật khi mức lương cơ sở / lương tối thiểu vùng thay đổi] *(TODO-09)*

### Câu 28: Những trường hợp nào được miễn đóng BHXH trong tháng?
Trên hệ thống, nhân viên **không bị trích đóng BHXH/BHYT/BHTN** trong hai trường hợp:
1. Đang trong thời gian **hợp đồng thử việc (`PROBATION` / `PROBATION_2M`)**.
2. Tổng số ngày nghỉ không lương trong tháng **từ 14 ngày làm việc trở lên** (`unpaidDaysInMonth >= 14`).

### Câu 29: Thuế TNCN trên hệ thống đang tính theo mức giảm trừ và biểu thuế nào? Cần lưu ý gì cho năm 2026 và Mẫu 08/CK-TNCN?
- **Cấu hình theo kỳ tính thuế trên hệ thống (`tax_year` / `effective_from`):**
  - **Từ kỳ tính thuế 2026 trở đi (`effective_from: 2026-01-01`, căn cứ Nghị quyết `110/2025/UBTVQH15` và Luật Thuế TNCN `109/2025/QH15`):**
    - Giảm trừ gia cảnh bản thân: **15.500.000đ/tháng** (**186.000.000đ/năm**).
    - Giảm trừ mỗi người phụ thuộc: **6.200.000đ/tháng**.
    - Biểu thuế lũy tiến từng phần **5 bậc** (tính theo thu nhập tính thuế/tháng): Bậc 1 đến `10.000.000đ` (`5%`), Bậc 2 trên `10` đến `30.000.000đ` (`15%`), Bậc 3 trên `30` đến `60.000.000đ` (`25%`), Bậc 4 trên `60` đến `100.000.000đ` (`30%`), Bậc 5 trên `100.000.000đ` (`35%`).
  - **Từ kỳ tính thuế 2025 trở về trước (`2020-07-01` đến `2025-12-31`, căn cứ Nghị quyết `954/2020/UBTVQH14`):**
    - Giữ nguyên giảm trừ bản thân **11.000.000đ/tháng**, mỗi người phụ thuộc **4.400.000đ/tháng** và biểu thuế lũy tiến **7 bậc** (`5%`–`35%`).
- **Lưu ý thử việc & khấu trừ 10% tại nguồn:**
  - Với lao động thử việc/chưa ký HĐLĐ từ 3 tháng trở lên, theo **Điều 25 Thông tư `111/2013/TT-BTC`**, thu nhập chi trả từ **2.000.000đ/lần trở lên** thuộc diện khấu trừ **10%** tại nguồn, trừ trường hợp đủ điều kiện lập bản cam kết **`Mẫu 08/CK-TNCN`**.

*(TODO-10)* Hệ thống đã cập nhật thông số thuế TNCN từ kỳ 2026 theo **Nghị quyết `110/2025/UBTVQH15`** và **Luật Thuế TNCN `109/2025/QH15`** (`15.500.000đ` bản thân / `6.200.000đ` người phụ thuộc, biểu 5 bậc; kỳ `<= 2025` giữ nguyên `11.000.000đ / 4.400.000đ`, biểu 7 bậc). [TODO: Công ty bổ sung đầu mối/hạn nộp hồ sơ đăng ký người phụ thuộc, quy trình tiếp nhận `Mẫu 08/CK-TNCN` và hướng dẫn kỳ chuyển tiếp lương tháng 12/2025 chi trả đầu năm 2026]

### Câu 30: Chính sách lương tháng 13 của công ty được quy định như thế nào?
[TODO: Công ty điền điều kiện hưởng (thâm niên tối thiểu, trạng thái nhân sự tại thời điểm chi trả), công thức tính theo tỷ lệ tháng làm việc và ngày chi trả lương tháng 13] *(TODO-11)*

### Câu 31: Công ty áp dụng chính sách thưởng KPI, thưởng dự án và thưởng cuối năm ra sao?
Hệ thống có cấu trúc quản lý chu kỳ đánh giá KPI và xếp loại kết quả công việc, tuy nhiên cơ chế thưởng tài chính tương ứng do công ty ban hành riêng:  
[TODO: Công ty điền cơ cấu thưởng KPI định kỳ, thưởng hoàn thành dự án, thưởng cuối năm/xếp loại A-B-C và điều kiện áp dụng] *(TODO-12)*

### Câu 32: Định mức các khoản phụ cấp (ăn trưa, xăng xe, gửi xe, điện thoại...) hàng tháng là bao nhiêu?
Trên hệ thống hiện chỉ ghi nhận ngưỡng miễn thuế tiền ăn trưa **730.000đ/tháng** phục vụ tính thuế tham chiếu; định mức chi trả thực tế từng loại phụ cấp của công ty chưa được cấu hình cố định:  
[TODO: Công ty điền bảng định mức phụ cấp thực tế hàng tháng (ăn trưa, xăng xe, gửi xe, điện thoại, trách nhiệm/độc hại...) theo cấp bậc/vị trí] *(TODO-13)*

### Câu 33: Nhân viên có được tạm ứng lương giữa tháng không? Khoản tạm ứng được trừ lại như thế nào?
Hệ thống phiếu lương đã hỗ trợ trường khấu trừ tạm ứng **`advance_deduction_vnd`** để tự động đối trừ vào kỳ lương cuối tháng. Quy trình xin tạm ứng và hạn mức cụ thể theo quy định nội bộ:  
[TODO: Công ty điền chính sách tạm ứng lương giữa tháng (đối tượng, hạn mức tối đa theo % lương, thời điểm nộp đề nghị và điều kiện hoàn ứng qua advance_deduction_vnd)] *(TODO-14)*

### Câu 34: Làm thế nào để xem phiếu lương cá nhân và bảo mật thông tin khi xem ở nơi công cộng?
Nhân viên đăng nhập bằng tài khoản của mình và truy cập **màn hình Phiếu lương cá nhân** (tách biệt hoàn toàn dữ liệu theo từng cá nhân), hoặc hỏi trực tiếp **Trợ lý Lạc Việt** về kỳ lương của chính mình.  
Tại màn hình phiếu lương cá nhân, hệ thống cung cấp:
- Nút **`Hiện số tiền / Che số tiền`** để ẩn nhanh các con số thu nhập trên màn hình khi ngồi gần người khác.
- Chi tiết lương, BHXH, thuế TNCN, các khoản trừ (`advance_deduction_vnd`, `penalty_deduction_vnd`), huy hiệu trạng thái chấm công WiFi/Biometric và thông tin **`Quỹ phép năm`**.

---

## 5. Tạo, Hủy & Quy trình Duyệt đơn từ

### Câu 35: Hệ thống hiện hỗ trợ những loại đơn từ nào?
Hệ thống hỗ trợ tổng cộng **8 loại đơn (`RequestCategory`)**, gồm:
1. **`ANNUAL_LEAVE`** — Nghỉ phép năm.
2. **`UNPAID_LEAVE`** — Nghỉ không lương.
3. **`SICK_LEAVE`** — Nghỉ ốm.
4. **`OVERTIME`** — Làm thêm giờ (OT).
5. **`REMOTE_WORK`** — Làm việc từ xa (WFH).
6. **`LATE_EXPLANATION`** — Giải trình chấm công.
7. **`BUSINESS_TRIP`** — Công tác trong nước.
8. **`OVERSEAS_BUSINESS_TRIP`** — Công tác nước ngoài.

*(Trong đó, **Trợ lý Lạc Việt** hỗ trợ soạn nháp trực tiếp **5 loại đơn phổ biến** qua hội thoại; đầy đủ cả 8 loại đều có trên giao diện Đơn từ.)*

### Câu 36: Làm sao để nhờ Trợ lý Lạc Việt soạn nháp đơn và thời hạn giữ nháp là bao lâu?
Bạn chỉ cần nhắn bằng tiếng Việt tự nhiên cho Trợ lý Lạc Việt (ví dụ nêu rõ loại đơn, ngày/giờ, lý do). Trợ lý sẽ trích xuất thông tin, kiểm tra điều kiện và hiển thị **thẻ xem trước (Draft Preview)**:
- **Thời hạn hiệu lực của bản nháp:** Hết hạn sau **10 phút** (`DRAFT_TTL_MS`).
- **Giới hạn tần suất tạo nháp:** Tối đa **5 nháp/giờ** (`DRAFT_RATE_LIMIT_MAX = 5`).

### Câu 37: Vì sao Trợ lý Lạc Việt chỉ tạo bản nháp mà không tự động gửi đơn hay tự động duyệt đơn?
Đây là nguyên tắc an toàn bắt buộc của hệ thống (human-in-the-loop):
- **Không tự gửi đơn (`TPL_CLICK_SUBMIT`):** Mọi hành động nộp đơn chính thức đều yêu cầu người dùng tự kiểm tra lại toàn bộ nội dung trên thẻ xem trước rồi bấm nút **`Gửi đơn`** (kèm mã xác nhận bảo mật HMAC `confirmToken`), hoặc chọn **`Hủy nháp`** / **`Mở form chi tiết`** để chỉnh sửa thêm.
- **Không tự duyệt đơn (`TPL_NO_APPROVE`):** Trợ lý chỉ cung cấp thông tin/tra cứu, tuyệt đối không có quyền phê duyệt hoặc từ chối đơn thay cho cấp quản lý.

### Câu 38: Tôi có thể nhờ Trợ lý Lạc Việt hoặc tự tạo đơn xin nghỉ/OT hộ đồng nghiệp được không?
**Không.** Hệ thống áp dụng nguyên tắc chỉ tạo đơn cho chính tài khoản đang đăng nhập (**`TPL_NOT_SELF`**).  
Ngoại lệ duy nhất liên quan đến người khác khi lập đơn/bàn giao là chỉ định đồng nghiệp nhận bàn giao công việc (cụm **`bàn giao cho ...`**) trong quy trình bàn giao.

### Câu 39: Quy trình duyệt đơn 3 cấp hoạt động như thế nào và thời gian cam kết xử lý (SLA) là bao lâu?
Đơn sau khi gửi sẽ đi theo luồng phê duyệt tối đa **3 cấp** (`PENDING` → `IN_PROGRESS` → `APPROVED`/`REJECTED`):
1. **Cấp 1 — Quản lý phòng ban (`DEPT_MANAGER`):** Xem xét đầu tiên *(bước này được tự động bỏ qua nếu người nộp đơn là cấp quản lý trở lên)*.
2. **Cấp 2 — Trưởng phòng Nhân sự (`HR_MANAGER`):** Đối soát quy định và số dư phép/công, với **SLA xử lý trong vòng 24 giờ làm việc**.
3. **Cấp 3 — Giám đốc (`DIRECTOR`):** Chỉ kích hoạt đối với các đơn thuộc diện thẩm quyền cao:
   - Nghỉ phép có thời lượng **> 3 ngày**.
   - Đơn **Nghỉ không lương (`UNPAID_LEAVE`)**.
   - Đơn **Công tác nước ngoài (`OVERSEAS_BUSINESS_TRIP`)**.

### Câu 40: Làm thế nào để hủy một đơn từ đã gửi?
Bạn chỉ có thể hủy đơn khi đơn vẫn đang ở trạng thái **chờ duyệt hoặc đang xử lý (`PENDING` hoặc `IN_PROGRESS`)**. Có 2 cách thực hiện:
- Vào danh sách đơn từ và thao tác hủy trực tiếp trên đơn đang chờ duyệt.
- Hoặc yêu cầu Trợ lý Lạc Việt hủy mã đơn đó, kiểm tra thẻ xác nhận rồi bấm nút **`Xác nhận hủy đơn`** (`draftCancelRequest`).  
*(Nếu đơn đã được duyệt hoàn tất hoặc đã chốt bảng công/từ chối, bạn cần liên hệ HR theo quy trình điều chỉnh thủ công nếu có sai sót.)*

### Câu 41: Hệ thống xử lý thế nào nếu tôi lỡ tạo đơn bị trùng ngày với đơn đã gửi trước đó?
Hệ thống tự động kiểm tra trùng lặp thời gian (**`OVERLAP`**) và **chặn không cho gửi đơn trùng ngày** với đơn đang hiệu lực trước đó. Trợ lý Lạc Việt / giao diện sẽ thông báo rõ mã đơn bị trùng và gợi ý bạn hủy bản nháp hiện tại hoặc hủy đơn cũ đang chờ duyệt trước khi gửi lại.

### Câu 42: Nếu số ngày tôi xin nghỉ vượt quá quỹ phép năm khả dụng hiện tại thì xử lý ra sao?
Khi hệ thống phát hiện thiếu số dư phép (**`INSUFFICIENT_BALANCE`**), đơn nghỉ phép năm sẽ không thể gửi trọn vẹn bằng quỹ phép năm. Hệ thống sẽ thông báo số ngày phép còn lại và gợi ý một trong các hướng xử lý:
- **Tách đơn:** Sử dụng hết số ngày phép năm khả dụng, phần ngày còn lại tách sang đơn **Nghỉ không lương (`UNPAID_LEAVE`)**; **hoặc**
- **Chuyển/Giảm ngày:** Đổi toàn bộ sang đơn nghỉ không lương hoặc giảm số ngày xin nghỉ cho vừa quỹ phép hiện có.

---

## 6. Hợp đồng, Thử việc & Tuyển dụng

### Câu 43: Thời gian thử việc tiêu chuẩn là bao lâu và lương thử việc tính theo tỷ lệ nào?
- **Thời gian thử việc:** **60 ngày** đối với hợp đồng thử việc tiêu chuẩn (`PROBATION_2M`) hoặc **30 ngày** đối với vị trí ngắn hạn.
- **Mức lương thử việc:** Hưởng **85%** mức lương chính thức theo thỏa thuận.
- **Quyền lợi kèm theo:** Trong thời gian `PROBATION`, nhân viên có **0 ngày phép năm**, **miễn đóng BHXH** và không được đăng ký làm thêm giờ (`OVERTIME`).

### Câu 44: Hệ thống nhắc lịch đánh giá hết thử việc và gia hạn hợp đồng trước bao nhiêu ngày?
Hệ thống tự động phát cảnh báo cho HR và Quản lý trực tiếp tại **2 mốc quan trọng**:
- **Đánh giá hết thử việc:** Cảnh báo trước **15 ngày** tính đến ngày kết thúc thử việc.
- **Gia hạn / tái ký hợp đồng lao động:** Cảnh báo trước **30 ngày** tính đến ngày hợp đồng hiện tại hết hạn.

### Câu 45: Quy định về định dạng và dung lượng file khi ứng viên nộp CV tuyển dụng là gì?
Khi ứng tuyển trên hệ thống tuyển dụng (ATS):
- **Định dạng cho phép:** `.pdf`, `.doc`, `.docx`.
- **Dung lượng tối đa:** **5MB** mỗi file CV.
- **Chống nộp trùng:** Hệ thống chặn ứng viên nộp trùng hồ sơ vào cùng một vị trí tuyển dụng khi đang có đơn ứng tuyển hiệu lực.

### Câu 46: Thư mời nhận việc (Offer) và liên kết Pre-boarding có hiệu lực bao lâu? Quy trình nhận việc mới gồm mấy bước?
- **Thời hạn phản hồi Offer:** **7 ngày** kể từ ngày gửi Offer.
- **Liên kết Pre-boarding:** Có thời hạn hiệu lực **7 ngày** (`PREBOARDING_TOKEN_EXPIRY_DAYS = 7`). Ứng viên tự kê khai **18 trường thông tin** hồ sơ (yêu cầu CCCD gồm **9 hoặc 12 chữ số**, số tài khoản ngân hàng dài **6–24 ký tự**); sau khi gửi, HR kiểm tra đối chiếu ở chế độ **chỉ đọc (Read-Only)**.
- **Checklist Onboarding:** Quy trình tiếp nhận nhân viên mới chuẩn trên hệ thống gồm **8 đầu việc checklist**.

### Câu 47: Khi nào đề xuất tuyển dụng hoặc đề xuất thăng chức/tăng lương bắt buộc phải trình Giám đốc phê duyệt?
Theo ma trận phân quyền hệ thống (`permissions.ts`), **Giám đốc (`DIRECTOR`)** là cấp phê duyệt bắt buộc trong các trường hợp vượt ngưỡng sau:
- **Đề xuất tuyển dụng:** Số lượng cần tuyển **> 3 người** **hoặc** mức lương đề xuất **> 50.000.000đ/tháng**.
- **Đề xuất thăng chức / điều chỉnh lương:** Mức lương mới **> 50.000.000đ/tháng** **hoặc** bổ nhiệm lên cấp **`DEPT_MANAGER`** / **`DIRECTOR`**.

### Câu 48: Công ty có chính sách thưởng giới thiệu ứng viên nội bộ (Referral) không?
[TODO: Công ty điền chương trình thưởng giới thiệu ứng viên (Referral): mức thưởng theo cấp bậc/nhóm vị trí, thời điểm chi trả (sau thử việc/nhận việc) và đối tượng loại trừ] *(TODO-15)*

### Câu 49: Công ty có chính sách tài trợ học tập, đào tạo hoặc thi chứng chỉ chuyên môn cho nhân viên không?
[TODO: Công ty điền chính sách tài trợ học tập, đào tạo, thi chứng chỉ chuyên môn (hạn mức ngân sách/năm, tỷ lệ hỗ trợ và cam kết thời gian làm việc sau đào tạo)] *(TODO-16)*

---

## 7. Nghỉ việc, Bàn giao & Tất toán

### Câu 50: Khi xin nghỉ việc, người lao động phải báo trước tối thiểu bao nhiêu ngày?
Theo **Điều 27 và Điều 35 Bộ luật Lao động** được cấu hình trong `HRM_CONFIG` (`LIFECYCLE_NOTICE_DAYS_BY_CONTRACT`), thời hạn báo trước tối thiểu phụ thuộc loại hợp đồng đang hiệu lực:
- **Hợp đồng thử việc:** Tối thiểu **3 ngày**.
- **Hợp đồng lao động xác định thời hạn:** Tối thiểu **30 ngày**.
- **Hợp đồng lao động không xác định thời hạn:** Tối thiểu **45 ngày**.

### Câu 51: Tôi có thể nhắn cho Trợ lý Lạc Việt để tạo đơn xin nghỉ việc được không?
**Không.** Trợ lý Lạc Việt không tạo nháp đơn thôi việc qua khung chat (**`TPL_RESIGN_GUIDE`**).  
Nhân viên phải thực hiện trực tiếp tại phân hệ **`Nghỉ việc & Tất toán`** trên hệ thống để bảo đảm ghi nhận chính xác ngày báo trước, loại hợp đồng và khởi tạo quy trình bàn giao.

### Câu 52: Quy trình bàn giao khi nghỉ việc (Clearance) gồm những bước kiểm soát bắt buộc nào?
Trước khi được tất toán lương cuối cùng, hồ sơ nghỉ việc phải vượt qua **6 cổng kiểm soát bắt buộc (`checkClearance100Percent` — 6 Clearance Hard Gates)**:
1. **Bàn giao công việc 3 bên:** Xác nhận đầy đủ 3 chiều **`sender → receiver → manager`** (người nghỉ → người nhận bàn giao → quản lý).
2. **Chỉ định quản lý kế nhiệm:** Bắt buộc chuyển giao quyền quản lý nếu người nghỉ giữ vai trò cấp quản lý.
3. **Đối soát tài sản:** Hoàn trả **100%** tài sản công ty đã cấp phát.
4. **Cổng IT:** Thu hồi quyền truy cập hệ thống, email và tài khoản nội bộ.
5. **Cổng Kế toán:** Đối soát hoàn tất mọi khoản công nợ và tạm ứng.
6. **Cổng HR:** Hoàn tất thủ tục chốt sổ BHXH và hồ sơ chấm dứt hợp đồng.

### Câu 53: Tiền phép năm còn dư khi nghỉ việc được tất toán theo công thức nào và tài khoản sẽ xử lý ra sao?
- **Công thức tất toán phép năm còn dư (`executeFinalSettlement`):**  
  **`remaining_days * (official_base / 22)`** *(tính theo lương cơ bản chính thức `base / standardDays`, với công chuẩn `22` ngày)*.
- **Mã chứng từ tất toán:** Chuẩn quy ước là **`QT-YYYYMM-NNN`** *(lưu ý kỹ thuật: trên dữ liệu mô phỏng runtime hiện tại đang sinh tiền tố `PS-FINAL-YYYYMM-NNN`)*.
- **Trạng thái tài khoản sau tất toán:** Nhân sự chuyển sang **`RESIGNED`**, tài khoản bị vô hiệu hóa (**`is_active = false`**, **`LOCKED`**) và thu hồi đăng nhập một lần (SSO). Hệ thống **tuyệt đối không xóa cứng dữ liệu** (`zero hard delete`) để phục vụ tra cứu lưu trữ và kiểm toán.

### Câu 54: Nhân viên nghỉ việc có được mua thanh lý lại laptop/thiết bị đang dùng không? Quy định bảo mật NDA/NCA sau nghỉ việc là gì?
[TODO: Công ty điền chính sách cho phép mua thanh lý thiết bị (laptop/điện thoại) theo thời gian khấu hao và điều khoản NDA/NCA ràng buộc sau nghỉ việc] *(TODO-17)*

---

## 8. Phân quyền dữ liệu (RBAC) & Sử dụng Trợ lý Lạc Việt

### Câu 55: Ai được phép xem hồ sơ và bảng lương của ai trên hệ thống?
Hệ thống kiểm soát quyền chặt chẽ theo ma trận **`6` vai trò** (`SUPER_ADMIN`, `DIRECTOR`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`, `CANDIDATE`) với **`57` hành động phân quyền (`HrmAction`)**:
- **`EMPLOYEE`:** Cô lập **100%** dữ liệu — chỉ xem được hồ sơ, chấm công, đơn từ, phép năm và phiếu lương (`payslip`) của chính bản thân.
- **`DEPT_MANAGER`:** Xem dữ liệu nhân sự/chấm công, đánh giá KPI (`kpi`) và duyệt đơn cấp 1 thuộc phòng ban mình quản lý.
- **`HR_MANAGER` / `DIRECTOR` / `SUPER_ADMIN`:** Có quyền xem/xử lý theo phạm vi nghiệp vụ quản trị nhân sự & chốt bảng lương (`HR_MANAGER`), điều hành tổng thể quỹ lương/KPI & phê duyệt cấp 3 (`DIRECTOR`), hoặc cấu hình toàn hệ thống (`SUPER_ADMIN`). Trên thanh điều hướng, mục `kpi` (*Đánh giá & Thăng tiến*) mở cho 4 vai trò (`SUPER_ADMIN`, `DIRECTOR`, `HR_MANAGER`, `DEPT_MANAGER`), còn mục `rbac` (*Phân quyền vai trò*) chỉ dành riêng cho `SUPER_ADMIN`.
- **`CANDIDATE`:** Chỉ thao tác trên cổng tuyển dụng/Pre-boarding, bị chặn hoàn toàn khi truy cập khu vực nội bộ `/app` và Trợ lý Lạc Việt (**HTTP 403**).

[TODO: Công ty điền quy định bảo mật thu nhập cá nhân nội bộ (có cấm chia sẻ bảng lương giữa các nhân viên theo hợp đồng lao động hay không)] *(TODO-18)*

### Câu 56: Vì sao Trợ lý Lạc Việt từ chối trả lời khi tôi hỏi lương, phép năm hoặc thông tin của đồng nghiệp?
Mọi truy vấn vào Trợ lý Lạc Việt đều được **xác thực quyền dựa trên `session` phía máy chủ (server-side)**. Hệ thống tự động chặn:
- Các yêu cầu truy xuất dữ liệu cá nhân/thu nhập của nhân viên khác ngoài phạm vi quyền hạn (`detectCrossEmployeeViolation`).
- Mọi câu lệnh cố tình giả mạo vai trò hoặc can thiệp chỉ dẫn hệ thống (prompt injection — `detectSecurityAttack`).

### Câu 57: Quản lý phòng ban (`DEPT_MANAGER`) được xem những dữ liệu gì và bị giới hạn những gì?
- **Được phép xem/thao tác:** Hồ sơ công việc, dữ liệu chấm công, đơn từ và phê duyệt cấp 1 đối với nhân sự **thuộc phòng ban mình trực tiếp quản lý**.
- **Bị giới hạn:** **Không** được truy cập bảng lương toàn công ty (`payroll`) và **không** được xem thông tin định danh cá nhân (PII) của nhân sự thuộc các phòng ban khác.

### Câu 58: Sau khi gửi đơn qua Trợ lý Lạc Việt, làm sao để tôi xem lại trạng thái hoặc nhật ký xử lý đơn đó?
Ngay sau khi bấm **`Gửi đơn`**, thẻ xác nhận hiển thị nút chuyển hướng nhanh **`Xem đơn REQ-xxx`** (hoặc **`Xem trong Đơn từ`**) để mở thẳng chi tiết đơn vừa tạo.  
Ngoài ra, bạn có thể vào mục Đơn từ bất kỳ lúc nào hoặc nhắn trực tiếp cho Trợ lý Lạc Việt kèm mã đơn (`REQ-xxx`) để tra cứu trạng thái phê duyệt hiện tại.

### Câu 59: Khi đổi điện thoại, gặp lỗi sinh trắc học (WebAuthn/Passkey) hoặc mất thẻ nhân viên thì phải làm gì?
- **Lưu ý kỹ thuật sẵn có:** Hệ thống chấm công dùng khóa WebAuthn gắn theo thiết bị. Nếu dùng trình duyệt Microsoft Edge gặp lỗi tương thích Passkey, cần kiểm tra cấu hình Passkey theo hướng dẫn kỹ thuật của IT.
- **Quy trình hành chính & hỗ trợ công dự phòng:** [TODO: Công ty điền quy trình yêu cầu IT/HR reset thiết bị WebAuthn khi đổi điện thoại, cách ghi nhận công dự phòng khi lỗi sinh trắc học và phí/thủ tục cấp lại thẻ nhân viên bị mất] *(TODO-19)*

### Câu 60: Khi cần hỗ trợ khẩn cấp về nhân sự, tiền lương hoặc lỗi hệ thống, tôi liên hệ đầu mối và kênh nào?
[TODO: Công ty điền thông tin liên hệ chính thức (email, kênh chat, số máy nhánh/hotline, giờ tiếp nhận) của HR/C&B, Kế toán lương và IT Helpdesk] *(TODO-20)*

---

## 9. Phúc lợi, Công tác & Nội quy chung

> **Ghi chú:** Hệ thống Lạc Việt HRM đã hỗ trợ đầy đủ luồng lập và duyệt đơn **Công tác trong nước (`BUSINESS_TRIP`)** và **Công tác nước ngoài (`OVERSEAS_BUSINESS_TRIP` — cấp Giám đốc duyệt)**. Các định mức chi tiêu, phúc lợi và nội quy chi tiết dưới đây cần công ty điền bổ sung theo văn bản nội bộ.

### Câu 61: Định mức công tác phí trong nước và nước ngoài (vé tàu xe, khách sạn, ăn ở, hoàn ứng) được quy định thế nào?
Trên hệ thống, nhân viên cần gửi đơn **`BUSINESS_TRIP`** (trong nước) hoặc **`OVERSEAS_BUSINESS_TRIP`** (nước ngoài — bắt buộc qua cấp **Giám đốc `DIRECTOR`** phê duyệt) trước khi đi công tác.  
[TODO: Công ty điền bảng định mức công tác phí trong nước & nước ngoài (hạng vé, tiền phòng, công tác phí ngày/ăn ở), quy trình tạm ứng và quy định hóa đơn VAT hoàn ứng] *(TODO-21)*

### Câu 62: Công ty có gói bảo hiểm sức khỏe bổ sung và chương trình khám sức khỏe định kỳ hàng năm không?
[TODO: Công ty điền chính sách bảo hiểm sức khỏe bổ sung (tên gói/nhà cung cấp, hạn mức theo cấp bậc, thân nhân) và lịch/gói khám sức khỏe định kỳ hàng năm] *(TODO-22)*

### Câu 63: Chính sách Team Building, Company Trip và phúc lợi các dịp Lễ, Tết hàng năm như thế nào?
[TODO: Công ty điền ngân sách Team Building, Company Trip hàng năm và chính sách quà/tiền thưởng các dịp Lễ, Tết, 8/3, 20/10, Quốc tế thiếu nhi/Trung thu] *(TODO-23)*

### Câu 64: Nội quy về trang phục (Dress Code) và tác phong làm việc tại văn phòng quy định ra sao?
[TODO: Công ty điền quy định trang phục (Dress Code ngày thường, thứ Sáu/sự kiện, gặp khách hàng) và nội quy giữ gìn vệ sinh, an ninh, tiếp khách tại văn phòng] *(TODO-24)*

### Câu 65: Quy trình xử lý kỷ luật lao động nội bộ và kênh tiếp nhận khiếu nại/góp ý của nhân viên là gì?
[TODO: Công ty điền nội quy xử lý kỷ luật lao động (các mức vi phạm, thành phần hội đồng kỷ luật) và kênh tiếp nhận phản ánh/khiếu nại ẩn danh nội bộ] *(TODO-25)*

---

## 10. Bảng tổng hợp các mục `[TODO]` cần công ty điền bổ sung

| Mã | Mục | Câu liên quan | Nội dung công ty cần điền | Bộ phận phụ trách đề xuất |
| :--- | :---: | :---: | :--- | :--- |
| `TODO-01` | 1 | Câu 7 | Lịch nghỉ bù / hoán đổi ngày làm việc cụ thể cho từng kỳ nghỉ lễ năm 2026 (nếu trùng cuối tuần) | HR / Ban Giám đốc |
| `TODO-02` | 1 | Câu 8 | Chính sách hỗ trợ thêm cho thai sản / nam có vợ sinh con ngoài chế độ BHXH | HR / C&B |
| `TODO-03` | 1 | Câu 9 | Ngày nghỉ sinh nhật có lương, phạm vi nghỉ hiếu/hỉ mở rộng và mức trợ cấp/mừng | HR / C&B |
| `TODO-04` | 2 | Câu 17 | Chính sách WFH/Hybrid (đối tượng, số ngày/tuần hoặc tháng, điều kiện đăng ký & check-in) | HR / Ban Giám đốc |
| `TODO-05` | 2 | Câu 18 | Quy chế xử lý/khấu trừ đi muộn, về sớm vượt ân hạn (qua `penalty_deduction_vnd` hoặc quy đổi công) | HR / C&B |
| `TODO-06` | 3 | Câu 22 | Phụ cấp ca đêm và OT ban đêm (khung `22:00–06:00`) theo chính sách công ty | HR / C&B |
| `TODO-07` | 3 | Câu 23 | Quy định quy đổi giờ OT sang ngày nghỉ bù (cho phép/không, tỷ lệ, thời hạn dùng) | HR / C&B |
| `TODO-08` | 3 | Câu 24 | Định mức hỗ trợ bữa ăn tối và chi phí xe/taxi về nhà khi OT sau `21:00` | Hành chính / Kế toán |
| `TODO-09` | 4 | Câu 27 | Mức trần lương đóng BHTN theo vùng của công ty & mốc cập nhật lương cơ sở mới | HR / C&B |
| `TODO-10` | 4 | Câu 29 | Hệ thống đã áp dụng NQ `110/2025/UBTVQH15` & Luật Thuế TNCN `109/2025/QH15` từ kỳ `2026` (`15.500.000đ` / `6.200.000đ`, 5 bậc) và giữ nguyên kỳ `<= 2025` (`11.000.000đ` / `4.400.000đ`, 7 bậc). Công ty điền đầu mối/hạn nộp hồ sơ NPT, `Mẫu 08/CK-TNCN` & kỳ chuyển tiếp 12/2025 chi trả 01/2026 | Kế toán / C&B |
| `TODO-11` | 4 | Câu 30 | Điều kiện hưởng, công thức tính và thời điểm chi trả lương tháng 13 | Ban Giám đốc / C&B |
| `TODO-12` | 4 | Câu 31 | Cơ chế thưởng KPI định kỳ, thưởng dự án và thưởng cuối năm | Ban Giám đốc / HR |
| `TODO-13` | 4 | Câu 32 | Bảng định mức phụ cấp thực tế (ăn trưa, xăng xe, gửi xe, điện thoại, trách nhiệm...) | C&B / Kế toán |
| `TODO-14` | 4 | Câu 33 | Chính sách tạm ứng lương giữa tháng (đối tượng, hạn mức %, hạn nộp, hoàn ứng qua `advance_deduction_vnd`) | Kế toán / C&B |
| `TODO-15` | 6 | Câu 48 | Chương trình thưởng giới thiệu ứng viên (Referral): mức thưởng và thời điểm chi trả | Tuyển dụng (TA) / HR |
| `TODO-16` | 6 | Câu 49 | Chính sách tài trợ học tập, đào tạo và thi chứng chỉ chuyên môn (ngân sách, cam kết) | HR / L&D |
| `TODO-17` | 7 | Câu 54 | Chính sách mua thanh lý thiết bị theo khấu hao và quy định NDA/NCA sau nghỉ việc | IT / Hành chính / Pháp chế |
| `TODO-18` | 8 | Câu 55 | Quy định bảo mật thông tin thu nhập/bảng lương cá nhân theo hợp đồng lao động | HR / Pháp chế |
| `TODO-19` | 8 | Câu 59 | Quy trình reset thiết bị WebAuthn khi đổi máy, xử lý lỗi sinh trắc học và cấp lại thẻ nhân viên | IT Helpdesk / Hành chính |
| `TODO-20` | 8 | Câu 60 | Kênh liên hệ, email, hotline/máy nhánh và SLA phản hồi của HR/C&B, Kế toán, IT | HR / Kế toán / IT |
| `TODO-21` | 9 | Câu 61 | Bảng định mức công tác phí trong/ngoài nước, tạm ứng và hóa đơn VAT hoàn ứng | Kế toán / Hành chính |
| `TODO-22` | 9 | Câu 62 | Gói bảo hiểm sức khỏe bổ sung và chương trình khám sức khỏe định kỳ hàng năm | HR / C&B |
| `TODO-23` | 9 | Câu 63 | Ngân sách Team Building, Company Trip và phúc lợi các dịp Lễ, Tết trong năm | Hành chính / Công đoàn |
| `TODO-24` | 9 | Câu 64 | Nội quy trang phục (Dress Code) và quy định tác phong tại văn phòng | Hành chính / HR |
| `TODO-25` | 9 | Câu 65 | Quy trình xử lý kỷ luật lao động nội bộ và kênh tiếp nhận phản ánh/khiếu nại ẩn danh | HR / Ban Giám đốc |

