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

export type CourseStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type LessonContentType = 'TEXT' | 'PDF' | 'VIDEO' | 'SLIDE';
export type ScoreVisibility = 'SCORE_ONLY' | 'AFTER_ATTEMPT' | 'AFTER_CLOSE';
export type GradeSourceType = 'ASSIGNMENT' | 'QUIZ' | 'MIDTERM' | 'FINAL' | 'MANUAL';
export type FileScope = 'LESSON' | 'ASSIGNMENT' | 'SUBMISSION' | 'CHAT' | 'SEED';
export type AiProviderMode = 'GEMINI' | 'LOCAL_FALLBACK';
export type AiTutorMode = 'SUMMARY' | 'EXPLAIN' | 'PRACTICE_QUESTIONS' | 'QA';

export interface Course {
  courseId: string;
  id: string | number;
  courseCode: string;
  code: string;
  title: string;
  description?: string;
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
  joinCode?: string | null;
  allowSelfEnroll?: boolean;
  maxStudents?: number | null;
  category?: string | null;
  createdAt: string;
  created_at: string;
  updatedAt?: string;
  updated_at?: string;
  enrolled_count?: number;
  modules_count?: number;
}

export interface CourseCatalogItem extends Course {
  enrolledCount: number;
  isEnrolled: boolean;
  enrollmentStatus?: EnrollmentStatus | null;
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
  studentCode?: string | null;
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
  contentType?: LessonContentType;
  content_type?: LessonContentType;
  contentHtml?: string;
  content_body?: string;
  materialUrl?: string | null;
  media_url?: string | null;
  attachmentFileId?: string | null;
  isPublished: boolean;
  is_published: boolean;
  sortOrder: number;
  order_index?: number;
  estimatedMinutes?: number;
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
  sortOrder: number;
  order_index?: number;
  isPublished?: boolean;
  createdAt: string;
  created_at: string;
  lessons: Lesson[];
}

export interface LessonProgressItem {
  lessonId: string;
  isCompleted: boolean;
  completedAt?: string | null;
  lastViewedAt: string;
  timeSpentSeconds: number;
}

export interface CourseProgressSummary {
  courseId: string;
  totalLessons: number;
  completedLessons: number;
  completionPercent: number;
  items: LessonProgressItem[];
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
  dueAt: string;
  due_date: string;
  maxScore: number;
  max_score: number;
  allowLate?: boolean;
  attachmentUrl?: string | null;
  attachmentFileId?: string | null;
  weightPercent?: number | null;
  rubricJson?: string | null;
  status?: string;
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
  studentCode?: string | null;
  studentEmail?: string;
  student_email?: string;
  contentText?: string | null;
  submission_text?: string;
  fileUrl?: string | null;
  attachment_url?: string;
  fileId?: string | null;
  rubricScoresJson?: string | null;
  score?: number | null;
  feedback?: string | null;
  status?: string;
  submittedAt: string;
  submitted_at: string;
  updatedAt?: string | null;
  grade?: Grade;
}

export interface SubmissionGradeResult extends Submission {
  gradeId?: string | null;
  weightPercent?: number | null;
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
  timeLimitMinutes: number;
  duration_minutes: number;
  maxScore?: number;
  max_score?: number;
  startAt?: string;
  endAt?: string;
  maxAttempts?: number;
  passingScore?: number;
  weightPercent?: number | null;
  scoreVisibility?: ScoreVisibility;
  isPublished: boolean;
  is_published: boolean;
  createdAt: string;
  created_at: string;
  questions?: QuizQuestion[];
  questions_count?: number;
  my_attempt?: QuizAttempt;
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
  submittedAt?: string | null;
  submitted_at?: string;
  status?: string;
  answersJson?: string | null;
  questionResultsJson?: string | null;
  student_name?: string;
  student_code?: string | null;
}

export interface QuizAttemptStart {
  attemptId: string;
  quizId: string;
  attemptNo: number;
  startedAt: string;
  deadlineAt?: string | null;
  timeLimitMinutes: number;
  maxScore: number;
  savedAnswers?: Record<string, string>;
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
  sourceType: GradeSourceType;
  source_type?: GradeSourceType;
  sourceId: string;
  source_id?: string | number;
  itemTitle?: string;
  score: number;
  maxScore: number;
  max_score: number;
  weightPercent?: number | null;
  weight_percent?: number;
  feedback?: string | null;
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
  relatedUrl?: string | null;
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
  gpa?: number | null;
  gpaScale4?: number | null;
  completedLessons?: number;
  totalLessons?: number;
  activeCourses?: number;
  draftCourses?: number;
  archivedCourses?: number;
  activeMeetings?: number;
  recent_notifications: Notification[];
}

export interface CalendarEventItem {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  kind: 'ASSIGNMENT' | 'QUIZ' | 'MEETING';
  title: string;
  startAt?: string | null;
  endAt: string;
  status: string;
  relatedUrl: string;
}

export interface MeetingLog {
  logId: string;
  meetingId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  studentCode?: string;
  joinedAt: string;
  leftAt?: string | null;
  durationSeconds: number;
  chatCount: number;
  handRaisesCount: number;
  activitySummary?: string;
}

export interface Meeting {
  meetingId: string;
  courseId: string;
  courseTitle?: string;
  courseCode?: string;
  hostId: string;
  hostName?: string;
  title: string;
  roomCode: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
  participantCount: number;
  activeLogs?: MeetingLog[];
}

export interface CourseMessage {
  messageId: string;
  courseId: string;
  meetingId?: string | null;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderEmail: string;
  messageType?: 'TEXT' | 'SYSTEM' | 'FILE';
  content: string;
  attachmentUrl?: string | null;
  attachmentFileId?: string | null;
  createdAt: string;
}

export interface StoredFile {
  fileId: string;
  ownerId: string;
  courseId?: string | null;
  scope: FileScope;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extractedTextPreview?: string | null;
  downloadUrl: string;
  createdAt: string;
}

export interface WhiteboardSnapshot {
  snapshotId: string;
  courseId: string;
  meetingId?: string | null;
  strokesJson: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AiTutorRequest {
  lessonId: string;
  mode: AiTutorMode;
  question?: string;
}

export interface AiTutorResponse {
  answer: string;
  providerMode: AiProviderMode;
  insufficientText: boolean;
  citations: string[];
}

export interface AiQuizGenerateRequest {
  courseId: string;
  lessonIds: string[];
  count: number;
  questionTypes: Array<'SINGLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT'>;
}

export interface AiQuizDraftQuestion {
  questionText: string;
  questionType: 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT';
  optionsJson?: string | null;
  correctAnswer: string;
  score: number;
}

export interface AiQuizGenerateResponse {
  questions: AiQuizDraftQuestion[];
  providerMode: AiProviderMode;
  insufficientText: boolean;
}

export interface AiFeedbackSuggestRequest {
  submissionId: string;
  score?: number;
}

export interface AiFeedbackSuggestResponse {
  suggestedFeedback: string;
  providerMode: AiProviderMode;
}

export interface DemoAccountItem {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  studentCode?: string | null;
  staffCode?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MessageResponse {
  message: string;
  detail: string;
}
