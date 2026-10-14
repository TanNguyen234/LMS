# 09 — Quality, Test Plan, UAT & Acceptance

Tài liệu này vừa là test specification cho prototype, vừa là đầu vào cho chương **Quản lý chất lượng** của tiểu luận.

## 1. Quality objectives

- Các luồng Must-have chạy đúng theo acceptance criteria.
- Không có lỗi authorization làm lộ/chỉnh dữ liệu trái quyền.
- Không có P0/P1 defect khi nghiệm thu giả lập.
- Database seed chạy lặp lại theo đúng hướng dẫn và dữ liệu liên kết hợp lệ.
- API chính có Swagger/OpenAPI rõ request/response.
- Demo có thể thực hiện theo kịch bản định trước mà không phải sửa dữ liệu thủ công giữa chừng.

## 2. Defect severity baseline

| Severity | Meaning | Acceptance rule |
|---|---|---|
| P0 | App không chạy / mất dữ liệu nghiêm trọng | 0 open |
| P1 | Luồng core hoặc security sai | 0 open |
| P2 | Chức năng phụ sai nhưng có workaround | Có thể chấp nhận nếu documented |
| P3 | UI/minor issue | Có thể defer |

## 3. Backend unit tests — pytest

Ưu tiên business rules:

- active user login;
- course ownership;
- enrollment uniqueness;
- late submission;
- grade score range;
- quiz availability;
- max attempts;
- score calculation;
- notification ownership.

Không đặt mục tiêu coverage % cao một cách hình thức. Cover critical rules trước.

## 4. Backend integration/API tests

Dùng pytest + FastAPI TestClient/httpx:

- Login -> protected endpoint.
- Admin creates course + enrollment.
- Lecturer cannot edit another lecturer course.
- Student cannot access non-enrolled course.
- Student cannot grade.
- Student response does not expose quiz answer key.

## 5. Frontend tests

Chỉ test flow quan trọng:

- Login form.
- Role-based routing.
- Assignment submit validation.
- Quiz submit confirmation.

Không snapshot mọi component.

## 6. Critical acceptance scenarios

### AC-01 Authentication
Given active user with correct password, login returns token and profile.

### AC-02 Authorization
Given student token, calling Admin user endpoint returns 403.

### AC-03 Course isolation
Given Lecturer A, editing Lecturer B course returns 403.

### AC-04 Enrollment
Admin cannot create duplicate enrollment for same student/course.

### AC-05 Published content
Student does not receive draft lesson in course content API.

### AC-06 Assignment deadline
Student cannot submit after DueAt when AllowLate=false.

### AC-07 Grading
Lecturer grades a submission; student sees the same score and feedback in My Grades.

### AC-08 Quiz max attempts
Student cannot start attempt N+1 when MaxAttempts reached.

### AC-09 Quiz secret
Student quiz detail response never includes `CorrectAnswer` before/while attempting.

### AC-10 Notification ownership
User cannot mark another user's notification as read.

## 7. Seed-based smoke test

1. Run schema.
2. Run seed.
3. Run validation SQL.
4. Start FastAPI in development.
5. Development initializer replaces sentinel demo passwords with real hashes.
6. Login Admin.
7. Login Student1 and verify enrolled courses.
8. Login Lecturer1 and verify assigned courses.
9. Open `/docs` and confirm main endpoints available.

## 8. UAT script cho báo cáo

Một UAT session giả lập nên có 3 actor:

- Admin: create/update course + enroll student.
- Lecturer: publish lesson + create assignment/quiz + grade submission.
- Student: view lesson + submit assignment + attempt quiz + view grade.

Mỗi UAT case ghi:

- Case ID.
- Preconditions.
- Steps.
- Expected result.
- Actual result.
- Pass/Fail.
- Evidence screenshot.
- Comment/sign-off giả lập.

## 9. Quality gates

- QG1: Scope baseline approved trước implementation.
- QG2: DB/API design reviewed trước build các module core.
- QG3: Feature chỉ complete khi principal denial path được test.
- QG4: Không vào UAT khi P0/P1 còn open.
- QG5: Không closure khi acceptance evidence chưa đủ.

## 10. Definition of Done per feature

Feature complete khi:

- business rule implemented;
- happy path + principal denial path tested;
- pytest relevant pass;
- API documented;
- UI có loading/error/empty state ở mức hợp lý;
- authorization server-side;
- không hard-coded user id/role;
- có evidence hoặc cách tái tạo evidence cho demo.
