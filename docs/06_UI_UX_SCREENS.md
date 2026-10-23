# 06 — UI/UX Screens

## 1. Shared

### Login
- Email
- Password
- Login button
- Error state rõ ràng

### App shell
- Sidebar theo role
- Header: user name, notification badge, logout
- Responsive desktop-first; tablet usable

## 2. Admin screens

### Admin Dashboard
Cards:
- Total users
- Active students
- Lecturers
- Active courses

### User Management
- Search
- Filter role/status
- Table
- Create/Edit drawer/modal
- Activate/Deactivate

### Course Management
- List course
- Create/Edit
- Assign lecturer
- Open course detail

### Enrollment Management
- Current enrolled students
- Add student
- Remove/deactivate enrollment

## 3. Lecturer screens

### Lecturer Dashboard
- Courses assigned
- Pending submissions
- Upcoming deadlines

### Course Workspace
Tabs:
- Overview
- Content
- Assignments
- Quizzes
- Gradebook
- Students

### Content Builder
- Module list
- Lesson list
- Create/edit/publish
- SortOrder field; drag-drop không bắt buộc

### Assignment Detail
- Assignment info
- Submission table
- Filter status
- Grade modal

### Quiz Builder
- Quiz settings
- Questions
- Types currently supported: SINGLE_CHOICE and TRUE_FALSE. SHORT_TEXT is deferred until a manual-grading flow exists.
- Publish control

### Gradebook
- Rows students
- Columns/sections grade items
- Simple weighted summary nếu WeightPercent được dùng

## 4. Student screens

### Student Dashboard
- Enrolled courses
- Upcoming assignment deadlines
- Unread notifications
- Recent grades

### My Courses
- Course cards

### Course Detail
- Module accordion/list
- Published lessons only
- Assignment/quiz shortcuts

### Lesson View
- Title
- Content
- Download material

### Assignment View
- Due date
- Description
- Existing submission
- Text-only submission (MVP does not upload files)
- Status/score/feedback

### Quiz View
- Rules + attempts remaining
- Start
- Answer questions
- Submit confirmation
- Result summary; không lộ correct answer nếu policy chưa cho phép

### My Grades
- Course filter
- Item, score/max, feedback

### Notifications
- Unread/read
- Mark read

### Student study plan (implemented in feature branch)

- Student-only route `/study-plan` reachable from navigation and dashboard.
- Active-enrollment workload: published assignments and published quizzes, ordered by deadline.
- Course/search/status filters and explicit empty/loading/error/retry states.
- Deadlines rendered in device local time, with quiz opening time and used attempts.
- Quiz and assignment links preserve the selected authorized course.
- Display statuses are advisory; backend remains authoritative when submitting.

### Analytics workspace by role (feature branch)

- Shared route `/insights`, authenticated; API enforces ADMIN/LECTURER/STUDENT independently.
- Lecturer: active teaching courses, published content counters, student enrollment counts, pending/graded submission ratio, first 60 submissions awaiting grade. Search by student/course/assignment and filter by course. Open full submission from existing authorized endpoint, enter score and feedback, save using existing grade endpoint; show failures truthfully.
- Student: active enrolled course grade summary, per-course unweighted average of grades recorded so far (0–10), latest 20 grade records. No fabricated GPA, no class ranking or unsupported official academic classification.
- Admin: account role distribution, active/inactive accounts, course lifecycle, active enrollment counts, published content, grading backlog. Counts are database snapshots, not uptime or system-health claims.
- All analytics: empty/loading/error/retry states, usable desktop and tablet layout, no fabricated sample results.

## 5. UX rules

- Disable impossible action nhưng vẫn handle server error.
- Confirm destructive actions.
- Loading/empty/error state cho mỗi page.
- Date hiển thị rõ timezone/local format.
- Không dùng animation phức tạp.
