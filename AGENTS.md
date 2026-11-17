# QUY TẮC DỰ ÁN

## 1. Ràng buộc cứng & Git
- **Bảo gì làm nấy:** Tự động `git commit` (cục bộ) sau khi sửa xong theo yêu cầu người dùng; tuyệt đối KHÔNG tự ý `git push` lên remote trừ khi người dùng yêu cầu trực tiếp.
- **Khởi đầu phiên code:** Luôn chạy `git status` trước tiên để kiểm tra file đang sửa dở; hỏi người dùng muốn AI làm tiếp hay để họ tự làm.
- **Sửa phẫu thuật:** Chỉ sửa đúng dòng/hàm được giao; không ghi đè làm mất code đang chạy tốt.

## 2. Bộ 6 file Vibe Coding (Bật cho dự án này)
- Dự án này áp dụng bộ 6 file nền tảng (`PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `PROGRESS.md`). AI bám sát kế hoạch và cập nhật tiến độ vào các file này khi code.

## 3. Bộ nhớ dự án
- Đọc `.agents/memory/MEMORY.md` (kiến trúc, quy ước, bài học) và `.agents/memory/STATE.md` (việc đang làm, bước tiếp).
- Cập nhật `STATE.md` (ngắn gọn, < 2 KB) khi đổi hướng, chốt việc lớn hoặc còn việc dở.
- Ghi nhật ký vào `.agents/heal-log.md` khi Giai Đoạn S phải qua từ 2 vòng sửa lỗi môi trường.
