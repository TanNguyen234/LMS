# 06 — Kế hoạch Tiến độ & Phân tích Đường găng (Schedule & CPM)

## 1. Bản cơ sở Tiến độ (Schedule Baseline)
- **Tổng thời lượng dự án:** 20 tuần.
- **Ngày khởi động:** Tuần 1.
- **Ngày kết thúc & đóng dự án:** Cuối Tuần 20.
- **Phương pháp phân tích:** Critical Path Method (CPM) với tính toán Forward Pass (ES, EF), Backward Pass (LS, LF) và Total Float (Độ trễ toàn phần).

---

## 2. Bảng Danh mục Hoạt động & Tính toán CPM (Activity & CPM Table)

| Mã HĐ (Activity ID) | Tên hoạt động (Activity Name) | WBS Ref | Tiền nhiệm (Predecessors) | Thời lượng (Tuần) | Người phụ trách (Resource) | ES | EF | LS | LF | Total Float (TF) | Găng? (Critical) |
|---|---|---|---|---:|---|---:|---:|---:|---:|---:|:---:|
| **ACT-01** | Khởi tạo dự án & Phê duyệt Charter | 1.0 | Không | 2 | PM | 0 | 2 | 0 | 2 | 0 | **Có (Yes)** |
| **ACT-02** | Phân tích yêu cầu & Lập Scope Baseline | 2.0 | ACT-01 | 2 | BA, PM | 2 | 4 | 2 | 4 | 0 | **Có (Yes)** |
| **ACT-03** | Lập các kế hoạch QLDA chi tiết | 3.1 | ACT-02 | 2 | PM | 4 | 6 | 17 | 19 | 13 | Không (No) |
| **ACT-04** | Thiết kế Wireframe & UI/UX Mockup | 3.2 | ACT-02 | 2 | UI/UX Designer | 4 | 6 | 5 | 7 | 1 | Không (No) |
| **ACT-05** | Thiết kế Kiến trúc & CSDL SQL Server | 3.3 | ACT-02 | 2 | Backend Lead | 4 | 6 | 4 | 6 | 0 | **Có (Yes)** |
| **ACT-06** | Khởi tạo môi trường & Nạp Seed Data | 4.1 | ACT-05 | 1 | Backend, DevOps | 6 | 7 | 6 | 7 | 0 | **Có (Yes)** |
| **ACT-07** | Phát triển module Xác thực & RBAC | 4.2 | ACT-04, ACT-06 | 1 | Backend, Frontend | 7 | 8 | 7 | 8 | 0 | **Có (Yes)** |
| **ACT-08** | Phát triển module Quản trị & Ghi danh | 4.3 | ACT-07 | 1 | Backend, Frontend | 8 | 9 | 8 | 9 | 0 | **Có (Yes)** |
| **ACT-09** | Phát triển module Nội dung (Modules/Lessons)| 4.4 | ACT-08 | 1 | Backend, Frontend | 9 | 10 | 9 | 10 | 0 | **Có (Yes)** |
| **ACT-10** | Phát triển module Bài tập & Chấm bài | 4.5 | ACT-09 | 1 | Backend, Frontend | 10 | 11 | 10 | 11 | 0 | **Có (Yes)** |
| **ACT-11** | Phát triển module Thi trắc nghiệm (Quizzes) | 4.6 | ACT-10 | 1 | Backend, Frontend | 11 | 12 | 11 | 12 | 0 | **Có (Yes)** |
| **ACT-12** | Phát triển Sổ điểm, Thông báo & Dashboard | 4.7 | ACT-11 | 1 | Backend, Frontend | 12 | 13 | 12 | 13 | 0 | **Có (Yes)** |
| **ACT-13** | Kiểm thử tự động & Tích hợp (Pytest API) | 5.1, 5.2 | ACT-12 | 2 | QA Engineer, Dev | 13 | 15 | 13 | 15 | 0 | **Có (Yes)** |
| **ACT-14** | Triage lỗi & Tối ưu hóa hệ thống | 5.3 | ACT-13 | 1 | Dev, QA | 15 | 16 | 17 | 18 | 2 | Không (No) |
| **ACT-15** | Thực thi Nghiệm thu người dùng (UAT) | 6.1, 6.2 | ACT-13 | 1 | BA, QA, Users | 15 | 16 | 15 | 16 | 0 | **Có (Yes)** |
| **ACT-16** | Đào tạo người dùng & Tài liệu hướng dẫn | 6.3 | ACT-15 | 1 | BA, UI/UX | 16 | 17 | 18 | 19 | 2 | Không (No) |
| **ACT-17** | Triển khai môi trường Demo & Release | 7.1 | ACT-15 | 2 | DevOps, Dev | 16 | 18 | 16 | 18 | 0 | **Có (Yes)** |
| **ACT-18** | Vận hành thử nghiệm & Thu thập bằng chứng | 7.2 | ACT-17 | 1 | PM, QA, Dev | 18 | 19 | 18 | 19 | 0 | **Có (Yes)** |
| **ACT-19** | Hoàn thiện Báo cáo tổng kết & Đóng dự án | 8.0 | ACT-16, ACT-18 | 1 | Toàn bộ Team, PM | 19 | 20 | 19 | 20 | 0 | **Có (Yes)** |

---

## 3. Xác định Đường găng (Critical Path Derivation)
Đường găng được tính toán dựa trên chuỗi các hoạt động có độ trễ toàn phần bằng 0 (**Total Float = 0**):

$$\text{Critical Path: } \mathbf{ACT\text{-}01 \rightarrow ACT\text{-}02 \rightarrow ACT\text{-}05 \rightarrow ACT\text{-}06 \rightarrow ACT\text{-}07 \rightarrow ACT\text{-}08 \rightarrow ACT\text{-}09 \rightarrow ACT\text{-}10 \rightarrow ACT\text{-}11 \rightarrow ACT\text{-}12 \rightarrow ACT\text{-}13 \rightarrow ACT\text{-}15 \rightarrow ACT\text{-}17 \rightarrow ACT\text{-}18 \rightarrow ACT\text{-}19}$$

- **Tổng thời gian đường găng:** $2 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 2 + 1 + 1 = \mathbf{20\text{ tuần}}$.
- **Kết luận:** Bất kỳ sự chậm trễ nào trên các hoạt động thuộc đường găng sẽ làm chậm toàn bộ ngày kết thúc dự án. Các hoạt động có độ trễ dương (ACT-03 có TF=13, ACT-04 có TF=1, ACT-16 có TF=2) cho phép đội ngũ linh hoạt bố trí nhân sự khi có xung đột tài nguyên.

---

## 4. Biểu đồ tiến độ Gantt (Gantt Chart Representation)

```text
Tuần (Weeks)               1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20
──────────────────────────────────────────────────────────────────────────────────────────────────────────
ACT-01 Khởi tạo dự án     [====]
ACT-02 Phân tích yêu cầu          [====]
ACT-03 Kế hoạch QLDA                   [====] . . . . . . . . . . . . . . . . . (TF=13)
ACT-04 Thiết kế UI/UX                  [====] . (TF=1)
ACT-05 Kiến trúc & DB                  [====]*
ACT-06 Môi trường & DB                      [==]*
ACT-07 Xác thực & RBAC                          [==]*
ACT-08 Quản trị & Ghi danh                          [==]*
ACT-09 Module bài học                                   [==]*
ACT-10 Bài tập & Chấm bài                                   [==]*
ACT-11 Thi trắc nghiệm                                          [==]*
ACT-12 Sổ điểm & Dashboard                                          [==]*
ACT-13 Kiểm thử tự động                                                 [========]*
ACT-14 Triage & Tối ưu                                                          [====] . . (TF=2)
ACT-15 Nghiệm thu UAT                                                               [==]*
ACT-16 Đào tạo & HDSD                                                                   [==] . . (TF=2)
ACT-17 Triển khai Demo                                                                  [====]*
ACT-18 Vận hành thử nghiệm                                                                  [==]*
ACT-19 Đóng dự án                                                                               [==]*
──────────────────────────────────────────────────────────────────────────────────────────────────────────
* Đánh dấu các hoạt động thuộc Đường găng (Critical Path)
```

---

## 5. Các mốc kiểm soát tiến độ chính (Milestones Schedule)
- **M1 (Cuối W2):** Project Charter phê duyệt.
- **M2 (Cuối W4):** Scope Baseline phê duyệt.
- **M3 (Cuối W6):** Kế hoạch chi tiết và Kiến trúc/CSDL phê duyệt.
- **M4 (Cuối W12):** Hoàn thành phát triển chức năng (Feature Complete).
- **M5 (Cuối W15):** Kiểm thử tích hợp hệ thống thành công (System Test Passed).
- **M6 (Cuối W16):** UAT Sign-off được ký duyệt.
- **M7 (W18):** Triển khai phiên bản Demo hoàn chỉnh.
- **M8 (W20):** Hoàn thành bảo vệ đồ án và đóng dự án.
