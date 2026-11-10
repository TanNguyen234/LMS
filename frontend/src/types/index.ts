export type UserRole = 'ADMIN' | 'LECTURER' | 'STUDENT';

export interface User {
  userId: string;
  id: string | number;
  email: string;
  fullName: string;
  full_name: string;
  username?: string;
  role: UserRole;
  isActive: boolean;
  is_active: boolean;
  studentCode?: string | null;
  staffCode?: string | null;
  cohort?: string | null;
  major?: string | null;
  className?: string | null;
  department?: string | null;
  isChatEnabled?: boolean;
  createdAt: string;
  created_at: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type CourseStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'PUBLISHED';

export interface Course {
  courseId: string;
  id: string | number;
  courseCode: string;
  code: string;
  title: string;
  description?: string;
  attachmentUrl?: string;
  attachment_url?: string;
  credits: number;
  status: CourseStatus;
  lecturerId: string;
  lecturer_id: string | number;
  lecturerName?: string;
  lecturer_name?: string;
  lecturerEmail?: string;
  lecturer_email?: string;
  semester?: string;
  academicYear?: string;
  subjectCode?: string | null;
  subject_code?: string | null;
  sectionCode?: string | null;
  section_code?: string | null;
  lecturerDepartment?: string | null;
  lecturer_department?: string | null;
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  created_at: string;
  updatedAt?: string;
  updated_at?: string;
  enrolled_count?: number;
  modules_count?: number;
}

export type EnrollmentStatus = 'ACTIVE' | 'DROPPED' | 'COMPLETED';

export interface Enrollment {
  enrollmentId: string;
  id: string | number;
  studentId: string;
  student_id: string | number;
  courseId: string;
  course_id: string | number;
  studentName?: string;
  student_name?: string;
  studentEmail?: string;
  student_email?: string;
  courseTitle?: string;
  course_title?: string;
  courseCode?: string;
  course_code?: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  enrolled_at: string;
  finalScore?: number | null;
}

export interface Lesson {
  lessonId: string;
  id: string | number;
  moduleId: string;
  module_id: string | number;
  title: string;
  contentType?: 'TEXT' | 'VIDEO' | 'DOCUMENT';
  content_type?: 'TEXT' | 'VIDEO' | 'DOCUMENT';
  contentHtml?: string;
  content_body?: string;
  materialUrl?: string;
  media_url?: string;
  isPublished: boolean;
  is_published: boolean;
  sortOrder: number;
  order_index?: number;
  estimatedMinutes?: number;
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  created_at: string;
}

export interface Module {
  moduleId: string;
  id: string | number;
  courseId: string;
  course_id: string | number;
  title: string;
  description?: string;
  attachmentUrl?: string;
  attachment_url?: string;
  sortOrder: number;
  order_index?: number;
  isPublished?: boolean;
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  created_at: string;
  lessons: Lesson[];
}

export interface Assignment {
  assignmentId: string;
  id: string | number;
  courseId: string;
  course_id: string | number;
  courseTitle?: string;
  course_title?: string;
  courseCode?: string;
  course_code?: string;
  title: string;
  description?: string;
  attachmentUrl?: string;
  attachment_url?: string;
  dueAt: string;
  due_date: string;
  maxScore: number;
  max_score: number;
  allowLate?: boolean;
  status?: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  created_at: string;
  submissions_count?: number;
  my_submission?: Submission;
}

export interface Submission {
  submissionId: string;
  id: string | number;
  assignmentId: string;
  assignment_id: string | number;
  studentId: string;
  student_id: string | number;
  studentName?: string;
  student_name?: string;
  studentEmail?: string;
  student_email?: string;
  contentText?: string;
  submission_text?: string;
  fileUrl?: string;
  file_url?: string;
  attachment_url?: string;
  status?: string;
  submittedAt: string;
  submitted_at: string;
  updatedAt?: string;
  score?: number | null;
  feedback?: string | null;
  grade?: Grade;
}

export interface QuizQuestion {
  questionId: string;
  id: string | number;
  quizId: string;
  quiz_id: string | number;
  questionText: string;
  question_text: string;
  questionType: string;
  question_type: string;
  score: number;
  points: number;
  sortOrder?: number;
  optionsJson?: string;
  options: Array<{
    id: string | number;
    text: string;
  }>;
  correctAnswer?: string;
  correct_option_id?: string | number;
}

export interface Quiz {
  quizId: string;
  id: string | number;
  courseId: string;
  course_id: string | number;
  courseTitle?: string;
  course_title?: string;
  courseCode?: string;
  course_code?: string;
  title: string;
  description?: string;
  attachmentUrl?: string;
  attachment_url?: string;
  timeLimitMinutes: number;
  duration_minutes: number;
  totalScore?: number;
  total_score?: number;
  scoreVisibility?: 'IMMEDIATE' | 'AFTER_CLOSED' | 'HIDDEN';
  score_visibility?: 'IMMEDIATE' | 'AFTER_CLOSED' | 'HIDDEN';
  isDeleted?: boolean;
  deletedAt?: string | null;
  maxScore?: number;
  max_score?: number;
  startAt?: string;
  endAt?: string;
  maxAttempts?: number;
  passingScore?: number;
  isPublished: boolean;
  is_published: boolean;
  createdAt: string;
  created_at: string;
  questions?: QuizQuestion[];
  questions_count?: number;
  my_attempt?: QuizAttempt;
  myAttemptsCount?: number;
  myHighestScore?: number | null;
}

export interface QuizAttempt {
  attemptId: string;
  id: string | number;
  quizId: string;
  quiz_id: string | number;
  studentId: string;
  student_id: string | number;
  attemptNo?: number;
  score: number;
  startedAt: string;
  started_at: string;
  submittedAt?: string;
  submitted_at?: string;
  status?: string;
  student_name?: string;
  studentName?: string;
  student_code?: string | null;
}

export interface QuizAttemptStart {
  attemptId: string;
  quizId: string;
  attemptNo: number;
  startedAt: string;
  timeLimitMinutes: number;
  maxScore: number;
  questions: QuizQuestion[];
}

export interface Grade {
  gradeId: string;
  id: string | number;
  courseId: string;
  course_id: string | number;
  studentId: string;
  student_id: string | number;
  studentName?: string;
  student_name?: string;
  studentCode?: string;
  courseTitle?: string;
  course_title?: string;
  courseCode?: string;
  course_code?: string;
  sourceType: 'ASSIGNMENT' | 'QUIZ' | 'MANUAL';
  source_type?: 'ASSIGNMENT' | 'QUIZ' | 'MIDTERM' | 'FINAL' | 'MANUAL';
  sourceId: string;
  source_id?: string | number;
  itemTitle?: string;
  score: number;
  maxScore: number;
  max_score: number;
  weightPercent?: number;
  weight_percent?: number;
  feedback?: string;
  gradedBy?: string;
  gradedAt: string;
  graded_at: string;
  graded_by_name?: string;
}

export interface Notification {
  notificationId: string;
  id: string | number;
  userId: string;
  user_id: string | number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  is_read: boolean;
  relatedUrl?: string;
  link_url?: string;
  createdAt: string;
  created_at: string;
}

export interface DashboardStats {
  role: UserRole;
  courses_count: number;
  students_count?: number;
  lecturers_count?: number;
  pending_submissions_count?: number;
  upcoming_assignments_count?: number;
  quizzes_count?: number;
  gpa?: number;
  recent_notifications: Notification[];
}

export interface BulkImportResult {
  success: boolean;
  totalProcessed: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: string[];
}

export interface BulkEnrollResult {
  success: boolean;
  className?: string;
  totalStudentsInClass?: number;
  totalRequested?: number;
  newlyEnrolled: number;
  reactivated: number;
  message: string;
}

export interface BatchGenerateUsersPayload {
  codePrefix: string;
  startNumber: number;
  endNumber: number;
  padLength?: number;
  emailDomain?: string;
  namePrefix?: string;
  className?: string;
  cohort?: string;
  major?: string;
  defaultPassword?: string;
}

export interface BatchGenerateUsersResult {
  success: boolean;
  createdCount: number;
  skippedCount: number;
  message: string;
}

export interface BatchUserActionsResult {
  success: boolean;
  action: string;
  affectedCount: number;
  message: string;
}

export interface ChatMessage {
  messageId: string;
  senderId: string;
  receiverId: string;
  content?: string | null;
  createdAt: string;
  isRead: boolean;
  isRecalled?: boolean;
  recalledAt?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  senderName?: string;
}

export interface ChatContact {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  department?: string | null;
  courseNames: string[];
  isBlocked: boolean;
  isChatEnabled: boolean;
  unreadCount: number;
}

export interface BlockedUser {
  blockId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  createdAt: string;
  reason?: string | null;
}

