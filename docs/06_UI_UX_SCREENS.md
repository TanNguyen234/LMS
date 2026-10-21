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
- Text/file submission
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

## 5. UX rules

- Disable impossible action nhưng vẫn handle server error.
- Confirm destructive actions.
- Loading/empty/error state cho mỗi page.
- Date hiển thị rõ timezone/local format.
- Không dùng animation phức tạp.
