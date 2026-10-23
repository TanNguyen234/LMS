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

export type CourseStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'PUBLISHED';

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
  studentEmail?: string;
  student_email?: string;
  contentText?: string;
  submission_text?: string;
  fileUrl?: string;
  attachment_url?: string;
  status?: string;
  submittedAt: string;
  submitted_at: string;
  updatedAt?: string;
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
  timeLimitMinutes: number;
  duration_minutes: number;
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


/** Role-restricted learning tasks returned by GET /dashboard/student/workload. */
export interface StudentWorkloadItem {
  kind: 'ASSIGNMENT' | 'QUIZ';
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  title: string;
  dueAt: string;
  status: string;
  startAt?: string | null;
  allowLate?: boolean | null;
  submittedAt?: string | null;
  submissionStatus?: string | null;
  attemptsUsed?: number | null;
  maxAttempts?: number | null;
  submittedAttempts?: number | null;
  inProgress?: boolean | null;
}

export interface StudentWorkloadResponse {
  generatedAt: string;
  items: StudentWorkloadItem[];
}


/** Read-only analytical snapshots. No modeled/placeholder KPI values. */
export interface TeachingCourseMetric {
  courseId: string;
  courseCode: string;
  title: string;
  activeStudents: number;
  publishedLessons: number;
  publishedAssignments: number;
  publishedQuizzes: number;
  awaitingGrade: number;
  gradedSubmissions: number;
}
export interface GradingQueueItem {
  submissionId: string;
  assignmentId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  assignmentTitle: string;
  studentName: string;
  studentCode: string | null;
  submittedAt: string;
  status: 'SUBMITTED' | 'LATE';
  maxScore: number;
  contentPreview: string;
}
export interface TeachingInsights {
  generatedAt: string;
  totalPending: number;
  shownPending: number;
  courses: TeachingCourseMetric[];
  queue: GradingQueueItem[];
}
export interface CourseLearningResult {
  courseId: string;
  courseCode: string;
  title: string;
  gradedItems: number;
  averageOutOfTen: number | null;
}
export interface LearningGradeEntry {
  gradeId: string;
  courseId: string;
  courseCode: string;
  itemType: string;
  score: number;
  maxScore: number;
  normalizedOutOfTen: number;
  gradedAt: string;
}
export interface LearningInsights {
  generatedAt: string;
  totalGradedItems: number;
  averageOutOfTen: number | null;
  courses: CourseLearningResult[];
  recentGrades: LearningGradeEntry[];
}
export interface OperationsInsights {
  generatedAt: string;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  roles: Record<string, number>;
  courseStatuses: Record<string, number>;
  activeEnrollments: number;
  pendingSubmissions: number;
  publishedLessons: number;
  publishedQuizzes: number;
}
