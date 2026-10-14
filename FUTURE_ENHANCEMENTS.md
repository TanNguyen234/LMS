# Định hướng Phát triển Tương lai (Future Enhancements)
## Dự án: University Learning Management System (LMS) - Giai đoạn 2 (Phase 2 Roadmap)

Theo Điều lệ Dự án ([01_PROJECT_CHARTER.md](file:///D:/Download/LMS/docs/project-management/01_PROJECT_CHARTER.md)) và Kế hoạch Quản lý Phạm vi ([04_SCOPE_BASELINE_WBS.md](file:///D:/Download/LMS/docs/project-management/04_SCOPE_BASELINE_WBS.md)), phạm vi Giai đoạn 1 tập trung tuyệt đối vào nền tảng cốt lõi (Core LMS Platform) nhằm đảm bảo tiến độ 20 tuần và ngân sách 1.2 tỷ VND.

Các tính năng nâng cao dưới đây đã được phân loại là **Out of Scope (Ngoài phạm vi Giai đoạn 1)** và được đưa vào lộ trình nghiên cứu phát triển cho Giai đoạn 2 (Phase 2):

---

## 1. Tích hợp Phòng học Trực tuyến (Live Video Conferencing)
- **Mô tả:** Tích hợp tính năng gọi video trực tiếp phục vụ các buổi giảng dạy từ xa.
- **Giải pháp đề xuất:**
  - Tích hợp chuẩn LTI (Learning Tools Interoperability) kết nối với Microsoft Teams hoặc Zoom Meetings.
  - Xây dựng cụm server WebRTC mã nguồn mở (Jitsi Meet) độc lập để tối ưu chi phí bản quyền.
- **Dự kiến:** Quý 1 năm tiếp theo (Dự toán: 350,000,000 VND).

---

## 2. Trợ lý Giảng dạy Thông minh bằng Trí tuệ Nhân tạo (AI Tutor & Assistant)
- **Mô tả:** Trợ lý ảo hỗ trợ sinh viên giải đáp thắc mắc bài học 24/7 và hỗ trợ giảng viên gợi ý câu hỏi kiểm tra.
- **Giải pháp đề xuất:**
  - Xây dựng mô hình RAG (Retrieval-Augmented Generation) dựa trên đề cương và tài liệu bài giảng của từng môn học.
  - Tích hợp API Google Gemini / OpenAI với quy định bảo mật dữ liệu học thuật của trường.
- **Dự kiến:** Quý 2 năm tiếp theo (Dự toán: 450,000,000 VND).

---

## 3. Nhắn tin Thời gian thực (Real-time Chat & Forums)
- **Mô tả:** Kênh trao đổi nhóm, thảo luận đề tài môn học và tương tác trực tiếp giữa giảng viên và sinh viên.
- **Giải pháp đề xuất:**
  - Tích hợp WebSocket server và cụm bộ nhớ đệm Redis Pub/Sub để quản lý trạng thái online và tin nhắn tức thời.
- **Dự kiến:** Quý 3 năm tiếp theo (Dự toán: 200,000,000 VND).

---

## 4. Xác thực Một lần Tập trung (Enterprise Single Sign-On - SSO)
- **Mô tả:** Cho phép cán bộ giảng viên và sinh viên đăng nhập bằng tài khoản email trường thông qua hệ thống định danh tập trung.
- **Giải pháp đề xuất:**
  - Tích hợp giao thức OAuth2 / OpenID Connect và SAML 2.0 với Microsoft Entra ID (Azure AD) hoặc Google Workspace for Education.
- **Dự kiến:** Quý 1 năm tiếp theo (Dự toán: 150,000,000 VND).

---

## 5. Ứng dụng Di động Đa nền tảng (Native Mobile Apps)
- **Mô tả:** Ứng dụng trên điện thoại thông minh dành cho sinh viên và giảng viên để nhận thông báo đẩy (Push Notifications) và tra cứu bài giảng ngoại tuyến.
- **Giải pháp đề xuất:**
  - Phát triển ứng dụng Flutter hoặc React Native kết nối trực tiếp với hệ sinh thái REST API hiện tại của hệ thống.
- **Dự kiến:** Quý 4 năm tiếp theo (Dự toán: 500,000,000 VND).

---

## 6. Kiểm tra Trùng lặp & Chống Đạo văn Tự động (Plagiarism Detection)
- **Mô tả:** Tự động quét và so sánh các bài nộp tiểu luận, báo cáo của sinh viên với kho dữ liệu học thuật trực tuyến và bài nộp của các khóa trước.
- **Giải pháp đề xuất:**
  - Kết nối dịch vụ bên thứ ba chuyên nghiệp qua API (Turnitin, Copyleaks hoặc giải pháp quét nội bộ).
- **Dự kiến:** Quý 2 năm tiếp theo (Dự toán: 300,000,000 VND).
