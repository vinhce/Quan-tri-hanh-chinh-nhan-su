# TRẠNG THÁI HIỆN TẠI (STATE)

## 1. Việc vừa hoàn thành
- Hoàn thành trọn bộ **5 bước Deliverables (11 nhóm màn hình)** của Giai đoạn 1 và đồng bộ toàn bộ 8 file tài liệu `.md`:
  - Tách vai trò `DIRECTOR` (Giám đốc Điều hành) khỏi `SUPER_ADMIN`; mở rộng `MOCK_EMPLOYEES` lên 28 nhân sự với mặt bằng lương giảm 30%.
  - Nâng cấp luồng phê duyệt đơn đa cấp (`DEPT_MANAGER -> HR_MANAGER -> DIRECTOR`), cấu hình `hrm_director_min_days`, và đồng bộ `public/mock/*.json` qua `mock-fetcher.ts`.
  - Hoàn thiện App Shell cố định, Header gọn, Thẻ tài khoản cuối Sidebar (có `Đổi vai trò (demo)` & Dialog xác nhận đăng xuất), trang `/login` 2 tab + 5 pill, `audit-logger.ts` với popup chi tiết bất biến `border-l-4`, cùng bản tĩnh `web/`.
  - `npx.cmd tsc --noEmit` → **PASS (0 lỗi)**.
- **Nâng cấp cơ chế Model Hot-Swapping & Điều phối cuốn chiếu (Work-Stealing):**
  - Cập nhật Multi-Key Router (`proxy.js`): Bổ sung bộ lọc tham số thông minh (tự động xóa `reasoning` khi đổi sang non-reasoning model), cơ chế Auto-Heal khi gặp HTTP 400 và duy trì phiên làm việc không bị gián đoạn; loại bỏ hoàn toàn suicide watchdog để giữ uptime 100%.
  - Bổ sung quy tắc **Điều phối cuốn chiếu (Work-Stealing Continuous Pipelining)**: Khi có 2 subagents xong trước, Lead Agent lập tức đọc kết quả sơ bộ và giao việc tiếp theo từ Backlog cho 2 subagents rảnh, tối ưu hóa toàn bộ các slot API key.
  - Đồng bộ quy tắc Model Hot-Swapping và Work-Stealing vào `AGENTS.md` (toàn cục và dự án).

## 2. Bước tiếp theo
- Dự án Giai đoạn 1 đã hoàn thiện toàn diện và đồng bộ tài liệu; sẵn sàng kiểm thử tổng thể hoặc triển khai Giai đoạn 2 (Backend API & CSDL) theo yêu cầu tiếp theo của người dùng.
