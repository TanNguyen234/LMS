# 06 — Kế hoạch Tiến độ & Phân tích Đường găng (Schedule & CPM)

> **Bản kế hoạch học thuật mô phỏng:** thời lượng, nguồn lực và mốc tuần là baseline giả định, không phải nhật ký thực thi hay bằng chứng tiến độ thực tế. Báo cáo đối soát hiện hành: [04_PM_RECONCILIATION.md](../audit/2026-10-21/04_PM_RECONCILIATION.md).

## 1. Bản cơ sở Tiến độ

- Tổng thời lượng baseline: **20 tuần**.
- CPM dùng quy ước ES/EF/LS/LF theo tuần bắt đầu từ thời điểm 0; khoảng [ES, EF) tương ứng tuần hiển thị ES+1 đến EF.
- ACT-03 (kế hoạch QLDA) và ACT-05 (kiến trúc/CSDL) đều phải hoàn thành trước ACT-06 (môi trường/seed). ACT-14 (triage) và ACT-15 (UAT) đều phải hoàn tất trước ACT-17 (release demo). Các cạnh này nối hoạt động đang rời khỏi đường đến đóng dự án.

## 2. Danh mục hoạt động và CPM đã tính lại

| Activity | Tên | WBS | Tiền nhiệm | Dur. | Resource | ES | EF | LS | LF | TF | Găng |
|---|---|---:|---|---:|---|---:|---:|---:|---:|---:|:---:|
| ACT-01 | Khởi tạo dự án & phê duyệt Charter | 1.0 | — | 2 | PM | 0 | 2 | 0 | 2 | 0 | Có |
| ACT-02 | Phân tích yêu cầu & Scope Baseline | 2.0 | ACT-01 | 2 | BA, PM | 2 | 4 | 2 | 4 | 0 | Có |
| ACT-03 | Lập các kế hoạch QLDA chi tiết | 3.1 | ACT-02 | 2 | PM | 4 | 6 | 4 | 6 | 0 | Có |
| ACT-04 | Thiết kế Wireframe & UI/UX | 3.2 | ACT-02 | 2 | UI/UX | 4 | 6 | 5 | 7 | 1 | Không |
| ACT-05 | Thiết kế kiến trúc & CSDL SQL Server | 3.3 | ACT-02 | 2 | Backend Lead | 4 | 6 | 4 | 6 | 0 | Có |
| ACT-06 | Khởi tạo môi trường & nạp seed data | 4.1 | ACT-03, ACT-05 | 1 | Backend, DevOps | 6 | 7 | 6 | 7 | 0 | Có |
| ACT-07 | Phát triển Xác thực & RBAC | 4.2 | ACT-04, ACT-06 | 1 | Backend, Frontend | 7 | 8 | 7 | 8 | 0 | Có |
| ACT-08 | Phát triển Quản trị & Ghi danh | 4.3 | ACT-07 | 1 | Backend, Frontend | 8 | 9 | 8 | 9 | 0 | Có |
| ACT-09 | Phát triển Nội dung (Modules/Lessons) | 4.4 | ACT-08 | 1 | Backend, Frontend | 9 | 10 | 9 | 10 | 0 | Có |
| ACT-10 | Phát triển Bài tập & Chấm bài | 4.5 | ACT-09 | 1 | Backend, Frontend | 10 | 11 | 10 | 11 | 0 | Có |
| ACT-11 | Phát triển Quiz | 4.6 | ACT-10 | 1 | Backend, Frontend | 11 | 12 | 11 | 12 | 0 | Có |
| ACT-12 | Sổ điểm, Thông báo & Dashboard | 4.7 | ACT-11 | 1 | Backend, Frontend | 12 | 13 | 12 | 13 | 0 | Có |
| ACT-13 | Kiểm thử tự động & Tích hợp | 5.1, 5.2 | ACT-12 | 2 | QA, Dev | 13 | 15 | 13 | 15 | 0 | Có |
| ACT-14 | Triage lỗi & Tối ưu hóa | 5.3 | ACT-13 | 1 | Dev, QA | 15 | 16 | 15 | 16 | 0 | Có |
| ACT-15 | Nghiệm thu người dùng (UAT) | 6.1, 6.2 | ACT-13 | 1 | BA, QA, Users | 15 | 16 | 15 | 16 | 0 | Có |
| ACT-16 | Đào tạo & tài liệu hướng dẫn | 6.3 | ACT-15 | 1 | BA, UI/UX | 16 | 17 | 18 | 19 | 2 | Không |
| ACT-17 | Triển khai môi trường Demo & Release | 7.1 | ACT-14, ACT-15 | 2 | DevOps, Dev | 16 | 18 | 16 | 18 | 0 | Có |
| ACT-18 | Vận hành thử nghiệm & thu thập bằng chứng | 7.2 | ACT-17 | 1 | PM, QA, Dev | 18 | 19 | 18 | 19 | 0 | Có |
| ACT-19 | Báo cáo tổng kết & đóng dự án | 8.0 | ACT-16, ACT-18 | 1 | Team, PM | 19 | 20 | 19 | 20 | 0 | Có |

## 3. Kết quả đường găng

- **Thời lượng dự án theo mạng lưới:** 20 tuần.
- **Các hoạt động găng (TF=0):** ACT-01, ACT-02, ACT-03, ACT-05, ACT-06, ACT-07, ACT-08, ACT-09, ACT-10, ACT-11, ACT-12, ACT-13, ACT-14, ACT-15, ACT-17, ACT-18, ACT-19.
- **Hoạt động có float:** ACT-04 có TF=1 tuần; ACT-16 có TF=2 tuần.
- Mạng có nhánh găng song song ACT-03/ACT-05 trước ACT-06 và ACT-14/ACT-15 trước ACT-17. Mỗi nhánh phải hoàn tất đúng thời điểm để giữ mốc tuần 20.

## 4. Gantt baseline

Các tuần bên dưới dùng tuần lịch 1-based; * đánh dấu hoạt động găng.

| Activity | Tuần baseline | Găng |
|---|---|:---:|
| ACT-01 | 1–2 | * |
| ACT-02 | 3–4 | * |
| ACT-03 | 5–6 | * |
| ACT-04 | 5–6 (float 1) | |
| ACT-05 | 5–6 | * |
| ACT-06 | 7 | * |
| ACT-07 | 8 | * |
| ACT-08 | 9 | * |
| ACT-09 | 10 | * |
| ACT-10 | 11 | * |
| ACT-11 | 12 | * |
| ACT-12 | 13 | * |
| ACT-13 | 14–15 | * |
| ACT-14 | 16 | * |
| ACT-15 | 16 | * |
| ACT-16 | 17 (float 2) | |
| ACT-17 | 17–18 | * |
| ACT-18 | 19 | * |
| ACT-19 | 20 | * |

Đây là lịch baseline mô phỏng. Không dùng bảng này làm bằng chứng rằng các mốc đã thực sự hoàn thành.
