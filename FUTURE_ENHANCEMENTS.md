# Định hướng Phát triển Tương lai (Future Enhancements)
## Dự án: University Learning Management System (LMS) — Lộ trình Mở rộng Cấp Trường (Enterprise Phase 2 Roadmap)

Theo Điều lệ Dự án ([01_PROJECT_CHARTER.md](docs/project-management/01_PROJECT_CHARTER.md)), Bản cơ sở Phạm vi ([04_SCOPE_BASELINE_WBS.md](docs/project-management/04_SCOPE_BASELINE_WBS.md)) và Kế hoạch Quản lý Thay đổi ([11_CHANGE_MANAGEMENT_PLAN.md](docs/project-management/11_CHANGE_MANAGEMENT_PLAN.md)), baseline Giai đoạn 1 (20 tuần / 1,2 tỷ VNĐ) tập trung vào nền tảng cốt lõi, và các đợt nâng cấp sau baseline đã bổ sung nguyên mẫu tích hợp sẵn cho Lớp học trực tuyến, Chat/Bảng trắng thời gian thực, Kho tệp an toàn, Quản lý học kỳ, Thời khóa biểu thông minh và Trợ lý AI.

Các hạng mục dưới đây định nghĩa lộ trình **Giai đoạn 2 (Enterprise Scale-Out)** nhằm nâng cấp từ quy mô máy chủ đơn lẻ (Modular Monolith) lên hạ tầng vận hành toàn trường quy mô lớn:

---

## 1. Cụm Máy chủ Truyền thông SFU & Chuẩn LTI 1.3 (Enterprise Media Cluster & LTI)
- **Hiện trạng trong hệ thống:** Đã tích hợp sẵn phòng học trực tuyến nội bộ (`Meetings`, `MeetingRoom.tsx`), điều phối micro/camera, chia sẻ màn hình, biểu quyết trực tiếp, bảng trắng cộng tác và nhật ký điểm danh.
- **Hướng nâng cấp Giai đoạn 2:**
  - Triển khai cụm máy chủ chuyển tiếp luồng WebRTC SFU chuyên dụng (LiveKit / Mediasoup / Jitsi Videobridge) hỗ trợ lớp học quy mô 200–500 sinh viên đồng thời và ghi hình buổi giảng lên lưu trữ đám mây.
  - Bổ sung chuẩn **LTI 1.3 Advantage** để liên thông hai chiều với Microsoft Teams Education và Zoom Meetings hiện hữu của nhà trường.
- **Dự kiến:** Quý 1 năm tiếp theo (Dự toán mở rộng hạ tầng: 350.000.000 VNĐ).

---

## 2. Kiến trúc RAG Đa Học phần & Kho Vector Chuyên sâu (Institutional Vector RAG)
- **Hiện trạng trong hệ thống:** Đã triển khai `POST /api/ai/lesson-tutor`, `quiz-generate` và `feedback-suggest` (`backend/app/api/routes/ai.py`) tích hợp Google Gemini kèm chế độ dự phòng trích xuất cục bộ (`LOCAL_FALLBACK`) trên nội dung bài giảng và tệp PDF đính kèm.
- **Hướng nâng cấp Giai đoạn 2:**
  - Xây dựng đường ống nhúng ngữ nghĩa (Semantic Embedding Pipeline) và cơ sở dữ liệu Vector (pgvector / Qdrant) lập chỉ mục toàn bộ giáo trình, đề cương học phần và ngân hàng tài liệu tham khảo được kiểm duyệt của khoa.
  - Bổ sung bảng điều khiển kiểm soát hạn ngạch token theo khoa/bộ môn và trích dẫn chính xác số trang tài liệu gốc.
- **Dự kiến:** Quý 2 năm tiếp theo (Dự toán: 450.000.000 VNĐ).

---

## 3. Mở rộng Ngang WebSocket Đa Tiến trình qua Redis Pub/Sub (Distributed Realtime Bus)
- **Hiện trạng trong hệ thống:** Đã hiện thực hóa kênh WebSocket thời gian thực cho thảo luận lớp học (`CourseMessages`), phòng học trực tuyến, bảng trắng và đẩy thông báo tức thời thông qua `RealtimeHub` trong bộ nhớ tiến trình đơn.
- **Hướng nâng cấp Giai đoạn 2:**
  - Bổ sung tầng điều phối sự kiện phân tán **Redis Pub/Sub** để đồng bộ phiên WebSocket xuyên suốt nhiều tiến trình Uvicorn/Gunicorn phía sau bộ cân bằng tải (Load Balancer).
  - Bổ sung diễn đàn thảo luận phân nhánh theo chủ đề (Threaded Academic Forums) và tìm kiếm toàn văn lịch sử trao đổi.
- **Dự kiến:** Quý 3 năm tiếp theo (Dự toán: 200.000.000 VNĐ).

---

## 4. Xác thực Một lần Tập trung (Enterprise Single Sign-On — SSO)
- **Mô tả:** Cho phép cán bộ, giảng viên và sinh viên đăng nhập trực tiếp bằng tài khoản định danh tập trung của trường đại học kèm xác thực đa nhân tố (MFA).
- **Giải pháp đề xuất:**
  - Tích hợp giao thức OAuth2 / OpenID Connect và SAML 2.0 với Microsoft Entra ID (Azure AD) hoặc Google Workspace for Education, tự động đồng bộ mã số sinh viên (`StudentCode`) và mã cán bộ (`StaffCode`).
- **Dự kiến:** Quý 1 năm tiếp theo (Dự toán: 150.000.000 VNĐ).

---

## 5. Ứng dụng Di động Đa nền tảng (Native Mobile Apps)
- **Mô tả:** Ứng dụng di động dành cho sinh viên và giảng viên để nhận thông báo đẩy (Push Notifications), xem thời khóa biểu, tra cứu bài giảng ngoại tuyến và tham gia bình chọn trên lớp.
- **Giải pháp đề xuất:**
  - Phát triển ứng dụng Flutter hoặc React Native kết nối trực tiếp với hệ thống REST API và WebSocket hiện hữu.
- **Dự kiến:** Quý 4 năm tiếp theo (Dự toán: 500.000.000 VNĐ).

---

## 6. Kiểm tra Trùng lặp & Chống Đạo văn Tự động (Plagiarism Detection)
- **Mô tả:** Tự động đối sánh văn bản và tệp bài nộp (`StoredFiles`) của sinh viên với kho tiểu luận nội bộ các khóa trước và cơ sở dữ liệu học thuật.
- **Giải pháp đề xuất:**
  - Tích hợp hàng đợi xử lý bất đồng bộ kết nối API dịch vụ kiểm tra đạo văn (Turnitin / Copyleaks) hoặc mô hình so khớp tương đồng văn bản nội bộ cho tiếng Việt.
- **Dự kiến:** Quý 2 năm tiếp theo (Dự toán: 300.000.000 VNĐ).
