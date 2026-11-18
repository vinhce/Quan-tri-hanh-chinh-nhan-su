# RULES — Quy Tắc Cứng Dành Cho AI & Lập Trình Viên

## 1. RÀNG BUỘC CỨNG VỀ PHẠM VI & VẬN HÀNH (HARD CONSTRAINTS)
- **Phạm vi Giai đoạn 1 (Frontend UI + Mock Data):**
  - Chỉ xây dựng giao diện người dùng (Next.js App Router + bản tĩnh `web/`) và dữ liệu mẫu tại `src/mock/`.
  - **CẤM** tạo cơ sở dữ liệu, **CẤM** cài đặt Prisma/ORM, **CẤM** viết Backend API thật hoặc gọi API LLM bên ngoài.
  - Khi chỉnh sửa dữ liệu trong `src/mock/*.ts`, phải chạy `npm run gen:mock` (`node scripts/export-mock-json.mjs`) để đồng bộ ra `public/mock/*.json` phục vụ `src/lib/mock-fetcher.ts`.
  - Mọi nút bấm và biểu mẫu trên giao diện đều phải xử lý thật trên state trình duyệt, ghi nhận vào `audit-logger.ts` (đối với thao tác nghiệp vụ quan trọng) và hiển thị Toast (`showToast`).
- **Bảo gì làm nấy (Git & Deploy Safety):**
  - **TUYỆT ĐỐI KHÔNG** tự ý chạy `git push`, hoặc `git commit` khi chưa có yêu cầu trực tiếp từ người dùng (trừ khi quy tắc phiên cho phép coordinator commit cục bộ).
  - **CẤM** các lệnh phá hủy lịch sử hoặc dữ liệu: `git reset --hard`, `git clean`, `git checkout -- <file>`, `git restore`, `DROP`, `TRUNCATE`, `migrate:fresh`.
- **Sửa phẫu thuật (Surgical Edits):**
  - Chỉ tạo/sửa đúng phạm vi file được phân công; giữ nguyên các hợp đồng kiểu (`RoleCode` gồm 5 vai trò, `useApp()`, các interface trong `src/mock/types.ts`).
  - Không bao giờ để lại mã giả hoặc bình luận cắt bớt kiểu `// ... existing code ...`.
- **Bảo mật & Tính toàn vẹn Audit Log:**
  - Không hardcode bất kỳ API key, mật khẩu thật hay token bí mật nào vào mã nguồn.
  - Nhật ký kiểm toán (`admin-audit-view.tsx`) mang tính chất **bất biến (chỉ đọc)**: chỉ cho phép bấm xem chi tiết, tuyệt đối không cung cấp nút Sửa hoặc Xóa bản ghi log.

## 2. QUY TẮC THIẾT KẾ UNSLOP BẮT BUỘC (ANTI-SLOP ENFORCEMENT)
1. **Cấm tuyệt đối Emoji:** Không có bất kỳ ký tự emoji nào trong giao diện TSX, `web/` lẫn trong dữ liệu mẫu `src/mock/*.ts`.
2. **Cấm Gradient lòe loẹt & Glow:** Không dùng `bg-gradient-to-*` đa sắc (`from-purple-*`, `from-indigo-*`), `bg-clip-text`, glow hay bóng đổ màu.
3. **Neutral Ramp `zinc` & Accent `teal`:** Khung giao diện dùng `zinc`, màu nhấn chính dùng `teal-700` (Light) / `teal-400` (Dark). Các viền nhấn ngữ nghĩa `border-l-4` trên thẻ/popup bắt buộc có cả biến thể `dark:border-l-*-400`.
4. **Kiểu chữ & Số liệu chuẩn xác:** Weights `400`–`600`, Sentence case (cấm `uppercase tracking-widest`), mọi mã NV (`NV-2024-000`), ca (`HC-08:00`), IP, tiền VND dùng `font-mono tabular-nums`.
5. **Icon đồng nhất:** Chỉ dùng `lucide-react` (`w-4 h-4`, `strokeWidth={1.5}`).
6. **Ngôn từ nghiêm túc:** Không dấu chấm than (`!`), không câu chào sáo rỗng, dữ liệu nhân sự Việt Nam thực tế.

## 3. QUY CHUẨN CODE & KIỂM TRA CHẤT LƯỢNG (QUALITY GATES)
- **TypeScript Strict:** Không dùng `any`, toàn bộ 5 vai trò (`SUPER_ADMIN`, `DIRECTOR`, `HR_MANAGER`, `DEPT_MANAGER`, `EMPLOYEE`) phải được xử lý đầy đủ ở các `Record<RoleCode, ...>`.
- **Lệnh kiểm tra bắt buộc trước khi báo cáo hoàn thành:**
  - Chạy `npx.cmd tsc --noEmit` đảm bảo `0 errors`.
  - Rà soát đạt 100% checklist `/unslop`.
