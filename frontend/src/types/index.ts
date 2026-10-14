export type UserRole = 'ADMIN' | 'LECTURER' | 'STUDENT';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Course {
  id: number;
  code: string;
  title: string;
  description?: string;
  credits: number;
  status: CourseStatus;
  lecturer_id: number;
  lecturer_name?: string;
  lecturer_email?: string;
  created_at: string;
  updated_at: string;
  enrolled_count?: number;
  modules_count?: number;
}

export type EnrollmentStatus = 'ACTIVE' | 'DROPPED' | 'COMPLETED';

export interface Enrollment {
  id: number;
  student_id: number;
  course_id: number;
  student_name?: string;
  student_email?: string;
  course_title?: string;
  course_code?: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at?: string;
}

export interface Lesson {
  id: number;
  module_id: number;
  title: string;
  content_type: 'TEXT' | 'VIDEO' | 'DOCUMENT';
  content_body?: string;
  media_url?: string;
  is_published: boolean;
  order_index: number;
  created_at: string;
}

export interface Module {
  id: number;
  course_id: number;
  title: string;
  description?: string;
  order_index: number;
  created_at: string;
  lessons: Lesson[];
}

export interface Assignment {
  id: number;
  course_id: number;
  course_title?: string;
  course_code?: string;
  title: string;
  description?: string;
  due_date: string;
  max_score: number;
  created_at: string;
  submissions_count?: number;
  my_submission?: Submission;
}

export interface Submission {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name?: string;
  student_email?: string;
  submission_text?: string;
  attachment_url?: string;
  submitted_at: string;
  grade?: Grade;
}

export interface QuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: string;
  points: number;
  options: Array<{
    id: string | number;
    text: string;
  }>;
  correct_option_id?: string | number;
}

export interface Quiz {
  id: number;
  course_id: number;
  course_title?: string;
  course_code?: string;
  title: string;
  description?: string;
  duration_minutes: number;
  max_score: number;
  is_published: boolean;
  created_at: string;
  questions?: QuizQuestion[];
  questions_count?: number;
  my_attempt?: QuizAttempt;
}

export interface QuizAttempt {
  id: number;
  quiz_id: number;
  student_id: number;
  score: number;
  started_at: string;
  submitted_at?: string;
}

export interface Grade {
  id: number;
  enrollment_id: number;
  student_id?: number;
  student_name?: string;
  course_id?: number;
  course_title?: string;
  course_code?: string;
  source_type: 'ASSIGNMENT' | 'QUIZ' | 'MIDTERM' | 'FINAL';
  source_id: number;
  score: number;
  max_score: number;
  weight_percent: number;
  feedback?: string;
  graded_at: string;
  graded_by_name?: string;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link_url?: string;
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
