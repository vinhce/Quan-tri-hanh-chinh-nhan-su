# RULES — Quy Tắc Cứng Dành Cho AI & Lập Trình Viên

## 1. RÀNG BUỘC CỨNG VỀ PHẠM VI & VẬN HÀNH (HARD CONSTRAINTS)
- **Phạm vi Giai đoạn 1 (Frontend UI + Mock Data):**
  - Chỉ xây dựng giao diện người dùng (Next.js App Router, TypeScript, Tailwind CSS) và dữ liệu mẫu tại `src/mock/`.
  - **CẤM** tạo cơ sở dữ liệu, **CẤM** cài đặt Prisma/ORM, **CẤM** viết Backend API thật hoặc gọi API LLM bên ngoài.
  - Mọi nút bấm và biểu mẫu trên giao diện đều phải gắn sự kiện xử lý thật trên state trình duyệt và hiển thị phản hồi qua Toast (`showToast`).
- **Bảo gì làm nấy (Git & Deploy Safety):**
  - **TUYỆT ĐỐI KHÔNG** tự ý chạy `git commit`, `git push`, hoặc triển khai (deploy) lên máy chủ khi chưa có yêu cầu trực tiếp từ người dùng.
  - **CẤM** các lệnh phá hủy lịch sử hoặc dữ liệu: `git reset --hard`, `git clean`, `git checkout -- <file>`, `git restore`, `DROP`, `TRUNCATE`, `migrate:fresh`.
- **Sửa phẫu thuật (Surgical Edits):**
  - Chỉ tạo/sửa đúng phạm vi file được phân công; giữ nguyên các định danh `id`, `class`, hợp đồng kiểu (`RoleCode`, `useApp()`, các interface trong `src/mock/types.ts`) mà các phân hệ khác đang phụ thuộc.
  - Không bao giờ để lại mã giả hoặc bình luận cắt bớt kiểu `// ... existing code ...`.
- **Bảo mật tuyệt đối:**
  - Không hardcode bất kỳ API key, mật khẩu thật hay token bí mật nào vào mã nguồn.

## 2. QUY TẮC THIẾT KẾ UNSLOP BẮT BUỘC (ANTI-SLOP ENFORCEMENT)
Mọi file trong `src/` phải vượt qua cổng kiểm tra `/unslop` trước khi nghiệm thu:
1. **Cấm tuyệt đối Emoji:** Không có bất kỳ ký tự emoji nào (`👋`, `✨`, `🚀`, `🤖`, `🔥`, `💼`, `📊`...) trong giao diện TSX lẫn trong dữ liệu mẫu `src/mock/*.ts`.
2. **Cấm Gradient lòe loẹt & Glow:** Không sử dụng `bg-gradient-to-*` chuyển sắc giữa các màu khác nhau (như tím-xanh `from-purple-*`, `from-indigo-*`), không dùng `bg-clip-text text-transparent`, không dùng bóng đổ phát sáng hay hình khối trang trí vô nghĩa.
3. **Một dải màu trung tính & Một màu nhấn:** Toàn bộ khung giao diện (Background, Card, Sidebar, Header, Border) dùng dải màu `zinc`; chỉ dùng duy nhất một màu nhấn `teal-700` (Light mode) / `teal-400` (Dark mode) cho trạng thái đang chọn và nút hành động chính.
4. **Kiểu chữ & Số liệu chuẩn xác:**
   - Chỉ dùng độ đậm `400` (`font-normal`), `500` (`font-medium`), tối đa `600` (`font-semibold`).
   - Sử dụng **Sentence case** cho toàn bộ nhãn nhóm, tiêu đề bảng, badge; **CẤM** dùng `uppercase tracking-widest`.
   - Mọi mã nhân viên (`NV-2024-001`), ca làm việc (`HC-08:00`), tiền tệ VND (`32.500.000 ₫`) và con số thống kê bắt buộc có `font-mono tabular-nums`.
5. **Icon đồng nhất:** Chỉ dùng `lucide-react` với kích thước `w-4 h-4` (`16px`) và `strokeWidth={1.5}`.
6. **Ngôn từ nghiêm túc:** Không dùng dấu chấm than (`!`), không dùng câu chào sáo rỗng, dữ liệu mẫu phải là tên người Việt Nam, phòng ban và mức lương VND thực tế.

## 3. QUY CHUẨN CODE & KIỂM TRA CHẤT LƯỢNG (QUALITY GATES)
- **TypeScript Strict:** Toàn bộ dữ liệu trong `src/mock/` và props của component phải có kiểu tĩnh rõ ràng, không dùng `any`.
- **Đủ 4 Role & 4 Trạng thái UI:**
  - Mọi phân hệ đều tôn trọng `role` hiện tại từ `useApp()` (`SUPER_ADMIN`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`).
  - Hỗ trợ kiểm thử trực tiếp 4 trạng thái `ready`, `loading`, `empty`, `error` ngay trên thanh Header.
- **Lệnh kiểm tra bắt buộc trước khi báo cáo hoàn thành:**
  - Chạy `npx tsc --noEmit` đảm bảo `0 errors`.
  - Rà soát không còn bất kỳ vi phạm nào trong checklist `/unslop`.
