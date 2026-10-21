> **Historical audit snapshot:** this document describes an earlier repository state. Its PASS/RESOLVED claims are not evidence for the 2026-10-21 forensic-fix branch. Use the dated reports in `docs/audit/2026-10-21/` for current findings and verification.

# Audit Document 07: Live Demonstration Runbook

This runbook provides step-by-step instructions for demonstrating the University Learning Management System across all three user personas (`ADMIN`, `LECTURER`, and `STUDENT`) using validated Microsoft SQL Server seed data.

---

## 1. Verified Persona Credentials & Fixtures

| Persona | Email / Username | Password | User ID Fixture | Primary Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **System Admin** | `admin@university.edu.vn` | `Admin@123456` | `00000000-0000-0000-0000-000000000001` | User administration, course creation, instructor assignment, student enrollment. |
| **Lecturer** | `lecturer1@university.edu.vn` | `Lecturer@123456` | `00000000-0000-0000-0000-000000000002` | Syllabus & module creation, publishing assignments, creating quizzes, grading submissions. |
| **Student** | `student1@university.edu.vn` | `Student@123456` | `00000000-0000-0000-0000-000000000005` | Course material viewing, assignment solution submission, timed quiz taking, gradebook inspection. |

### Key Seed Course Fixtures:
- **Course 1:** `10000000-0000-0000-0000-000000000001` — **CS101: Nhập môn Lập trình** (Lecturer 1, Student 1 actively enrolled).
- **Course 2:** `10000000-0000-0000-0000-000000000002` — **CS202: Cấu trúc Dữ liệu & Giải thuật** (Lecturer 1).
- **Course 3:** `10000000-0000-0000-0000-000000000003` — **DB201: Cơ sở Dữ liệu Quan hệ** (Lecturer 2).

---

## 2. Demonstration Flow: Step-by-Step

### Phase 1: System Boot & Health Check
1. Start backend:
   ```powershell
   python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
2. In browser or terminal, verify health endpoint:
   ```powershell
   curl http://127.0.0.1:8000/health
   # Expected: {"status":"healthy","database":"connected","timestamp":"..."}
   ```
3. Start frontend:
   ```powershell
   cd frontend
   npm run dev
   # Server ready at http://localhost:5173
   ```

### Phase 2: Administrator Persona (`admin@university.edu.vn`)
1. Navigate to `http://localhost:5173/login`. Click the **Admin** demo card.
2. Click **Đăng nhập**. Observe seamless redirect to `/dashboard`.
3. Verify Admin Dashboard metrics: Total Users (10), Courses (10), Active Enrollments (10).
4. Navigate to **Người dùng** (`/users`). Confirm paginated table renders 10 academic accounts without React errors.
5. Navigate to **Khóa học** (`/courses`). Select **CS101**. Confirm Lecturer TS. Nam is assigned and enrolled students are listed. Note that student self-enrollment controls are absent (enforcing academic governance).

### Phase 3: Lecturer Persona (`lecturer1@university.edu.vn`)
1. Log out, then click the **Lecturer** demo card on `/login`.
2. Navigate to **Khóa học** -> **CS101**.
3. View **Bài tập**: Click on Assignment 1 (`50000000-0000-0000-0000-000000000001`).
4. Click **Xem bài nộp**: Observe submission from Student `Nguyen An` (`sv001-cs101-a1.zip`).
5. Open grading modal: Enter score `9.0` and feedback: `Thuật toán tối ưu, hoàn thành xuất sắc`.
6. Click **Lưu điểm**. Observe status update to `GRADED` and automatic propagation to course Gradebook.

### Phase 4: Student Persona (`student1@university.edu.vn`)
1. Log out, then click the **Student** demo card on `/login`.
2. Navigate to **Khóa học** -> **CS101**.
3. View course content: Confirm Module 1 and published lessons are visible; verify that draft modules are hidden.
4. Navigate to **Điểm số** (`/grades`): Confirm grade `9.0/10.0` for Assignment 1 is displayed with lecturer feedback.
5. Navigate to **Bài kiểm tra** (`/quizzes`):
   - Select Quiz 1 (`70000000-0000-0000-0000-000000000001`).
   - Confirm quiz parameters: 15 minutes limit, passing score 5.0.
   - Inspect network request: confirm question payloads do **not** contain `correctAnswer`.
   - Submit answers and receive scored attempt result.
6. Navigate to **Thông báo** (`/notifications`): Confirm student-specific alerts and test "Đánh dấu đã đọc".
