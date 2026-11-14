import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpPut,
} from './http';
import type {
  Assignment,
  CalendarEventItem,
  Course,
  CourseCatalogItem,
  CourseProgressSummary,
  CourseStatus,
  Enrollment,
  Grade,
  GradeSourceType,
  LessonProgressItem,
  MessageResponse,
  Quiz,
  QuizAttempt,
  QuizAttemptStart,
  QuizQuestion,
  ScoreVisibility,
  Submission,
  SubmissionGradeResult,
} from '../types';

export interface CourseEnrollmentSettingsPayload {
  allowSelfEnroll: boolean;
  joinCode?: string | null;
  maxStudents?: number | null;
  category?: string | null;
}

export interface CourseCreatePayload {
  courseCode: string;
  title: string;
  description?: string | null;
  lecturerId: string;
  semester: string;
  academicYear: string;
  credits: number;
  status?: CourseStatus;
  joinCode?: string | null;
  allowSelfEnroll?: boolean;
  maxStudents?: number | null;
  category?: string | null;
}

export interface CourseUpdatePayload {
  title?: string;
  description?: string | null;
  lecturerId?: string;
  semester?: string;
  academicYear?: string;
  credits?: number;
  status?: CourseStatus;
  joinCode?: string | null;
  allowSelfEnroll?: boolean;
  maxStudents?: number | null;
  category?: string | null;
}

export interface StudentCourseProgressRow {
  studentId: string;
  studentName: string;
  studentCode?: string | null;
  studentEmail?: string | null;
  enrollmentStatus: string;
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  totalTimeSpentSeconds: number;
  lastActivityAt?: string | null;
  completedLessonIds: string[];
}

export interface CourseClassProgressResponse {
  courseId: string;
  totalLessons: number;
  students: StudentCourseProgressRow[];
}

export interface AssignmentSavePayload {
  title: string;
  description?: string | null;
  dueAt: string;
  maxScore: number;
  allowLate?: boolean;
  attachmentUrl?: string | null;
  attachmentFileId?: string | null;
  weightPercent?: number | null;
  rubricJson?: string | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
}

export interface SubmissionSubmitPayload {
  contentText?: string | null;
  fileId?: string | null;
  rubricScoresJson?: string | null;
}

export interface SubmissionGradePayload {
  score: number;
  feedback?: string | null;
  rubricScoresJson?: string | null;
}

export interface QuizSavePayload {
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  timeLimitMinutes: number;
  maxAttempts: number;
  passingScore: number;
  weightPercent?: number | null;
  scoreVisibility?: ScoreVisibility;
  isPublished?: boolean;
}

export interface QuizQuestionSavePayload {
  questionText: string;
  questionType: 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_TEXT';
  optionsJson?: string | null;
  correctAnswer: string;
  score: number;
  sortOrder: number;
}

export interface QuizManualGradePayload {
  questionScores: Record<string, number>;
  feedback?: string | null;
}

export interface QuestionAnalyticsItem {
  questionId: string;
  questionText: string;
  questionType: string;
  maxScore: number;
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number;
  averageAwardedScore: number;
}

export interface QuizAnalyticsResponse {
  quizId: string;
  title: string;
  maxScore: number;
  passingScore: number;
  totalAttempts: number;
  submittedCount: number;
  pendingReviewCount: number;
  expiredCount: number;
  inProgressCount: number;
  averageScore?: number | null;
  highestScore?: number | null;
  lowestScore?: number | null;
  passRatePercent: number;
  questions: QuestionAnalyticsItem[];
}

export interface TranscriptGradeEntry {
  gradeId: string;
  courseId: string;
  studentId: string;
  sourceType: GradeSourceType;
  sourceId?: string | null;
  itemTitle: string;
  score: number;
  maxScore: number;
  weightPercent?: number | null;
  feedback?: string | null;
  gradedBy: string;
  gradedAt: string;
}

export interface TranscriptCourseEntry {
  courseId: string;
  courseCode: string;
  title: string;
  semester: string;
  academicYear: string;
  credits: number;
  courseStatus: CourseStatus;
  enrollmentStatus: string;
  finalScore10?: number | null;
  gpa4?: number | null;
  letterGrade?: string | null;
  passed?: boolean | null;
  totalWeightPercent: number;
  gradesCount: number;
  grades: TranscriptGradeEntry[];
}

export interface StudentTranscriptResponse {
  studentId: string;
  officialGpaScale4?: number | null;
  officialGpaScale10?: number | null;
  provisionalGpaScale4?: number | null;
  provisionalGpaScale10?: number | null;
  completedCredits: number;
  attemptedCredits: number;
  totalCredits: number;
  courses: TranscriptCourseEntry[];
}

export interface ManualGradeCreatePayload {
  studentId: string;
  itemTitle: string;
  sourceType: 'MANUAL' | 'MIDTERM' | 'FINAL';
  score: number;
  maxScore: number;
  weightPercent?: number | null;
  feedback?: string | null;
}

export interface ManualGradeUpdatePayload {
  itemTitle?: string;
  sourceType?: 'MANUAL' | 'MIDTERM' | 'FINAL';
  score?: number;
  maxScore?: number;
  weightPercent?: number | null;
  feedback?: string | null;
}

export interface AdminDashboardPayload {
  totalUsers: number;
  totalCourses: number;
  totalStudents: number;
  totalLecturers: number;
  totalEnrollments: number;
  activeCourses: number;
  draftCourses: number;
  archivedCourses: number;
  activeMeetings: number;
}

export interface LecturerDashboardPayload {
  totalCourses: number;
  totalStudents: number;
  totalPendingSubmissions: number;
  totalQuizzes: number;
  activeMeetings: number;
  recentCourses: Course[];
}

export interface StudentDashboardPayload {
  totalEnrolledCourses: number;
  upcomingAssignments: number;
  availableQuizzes: number;
  unreadNotifications: number;
  gpa?: number | null;
  gpaScale4?: number | null;
  completedLessons: number;
  totalLessons: number;
  enrolledCourses: Course[];
}

function normalizeCourse(raw: Course): Course {
  return {
    ...raw,
    id: raw.courseId ?? raw.id,
    code: raw.courseCode ?? raw.code,
    lecturer_id: raw.lecturerId ?? raw.lecturer_id,
    lecturer_name: raw.lecturerName ?? raw.lecturer_name,
    created_at: raw.createdAt ?? raw.created_at,
  };
}

function normalizeCatalogCourse(raw: CourseCatalogItem): CourseCatalogItem {
  return {
    ...normalizeCourse(raw),
    enrolledCount: Number(raw.enrolledCount ?? 0),
    isEnrolled: Boolean(raw.isEnrolled),
    enrollmentStatus: raw.enrollmentStatus ?? null,
  };
}

function normalizeEnrollment(raw: Enrollment): Enrollment {
  return {
    ...raw,
    id: raw.enrollmentId ?? raw.id,
    student_id: raw.studentId ?? raw.student_id,
    course_id: raw.courseId ?? raw.course_id,
    student_name: raw.studentName ?? raw.student_name,
    student_email: raw.studentEmail ?? raw.student_email,
    enrolled_at: raw.enrolledAt ?? raw.enrolled_at,
  };
}

function normalizeSubmission(raw: Submission): Submission {
  return {
    ...raw,
    id: raw.submissionId ?? raw.id,
    assignment_id: raw.assignmentId ?? raw.assignment_id,
    student_id: raw.studentId ?? raw.student_id,
    submitted_at: raw.submittedAt ?? raw.submitted_at,
    submission_text: raw.contentText ?? raw.submission_text,
    attachment_url: raw.fileUrl ?? raw.attachment_url,
    student_name: raw.studentName ?? raw.student_name,
  };
}

function normalizeGrade(raw: Grade): Grade {
  return {
    ...raw,
    id: raw.gradeId ?? raw.id,
    course_id: raw.courseId ?? raw.course_id,
    student_id: raw.studentId ?? raw.student_id,
    student_name: raw.studentName ?? raw.student_name,
    source_type: raw.sourceType ?? raw.source_type,
    max_score: raw.maxScore ?? raw.max_score,
    weight_percent: raw.weightPercent ?? raw.weight_percent ?? undefined,
    graded_at: raw.gradedAt ?? raw.graded_at,
  };
}

function normalizeQuiz(raw: Quiz): Quiz {
  return {
    ...raw,
    id: raw.quizId ?? raw.id,
    course_id: raw.courseId ?? raw.course_id,
    duration_minutes: raw.timeLimitMinutes ?? raw.duration_minutes,
    is_published: raw.isPublished ?? raw.is_published,
    created_at: raw.createdAt ?? raw.created_at,
  };
}

function normalizeAttempt(raw: QuizAttempt): QuizAttempt {
  return {
    ...raw,
    id: raw.attemptId ?? raw.id,
    quiz_id: raw.quizId ?? raw.quiz_id,
    student_id: raw.studentId ?? raw.student_id,
    started_at: raw.startedAt ?? raw.started_at,
    submitted_at: raw.submittedAt ?? raw.submitted_at ?? undefined,
  };
}

function buildQuery(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export async function getCourses(params?: { status?: string; lecturerId?: string }): Promise<Course[]> {
  const qs = buildQuery({ status: params?.status, lecturerId: params?.lecturerId });
  const rows = await httpGet<Course[]>(`/courses${qs}`);
  return rows.map(normalizeCourse);
}

export async function getCourseDetail(courseId: string): Promise<Course> {
  const row = await httpGet<Course>(`/courses/${courseId}`);
  return normalizeCourse(row);
}

export async function getCourseCatalog(params?: {
  search?: string;
  category?: string;
  semester?: string;
}): Promise<CourseCatalogItem[]> {
  const qs = buildQuery({
    search: params?.search,
    category: params?.category,
    semester: params?.semester,
  });
  const rows = await httpGet<CourseCatalogItem[]>(`/courses/catalog${qs}`);
  return rows.map(normalizeCatalogCourse);
}

export async function createCourse(payload: CourseCreatePayload): Promise<Course> {
  const row = await httpPost<Course>('/courses', payload);
  return normalizeCourse(row);
}

export async function updateCourse(courseId: string, payload: CourseUpdatePayload): Promise<Course> {
  const row = await httpPut<Course>(`/courses/${courseId}`, payload);
  return normalizeCourse(row);
}

export async function updateCourseStatus(courseId: string, status: CourseStatus): Promise<MessageResponse> {
  return httpPatch<MessageResponse>(`/courses/${courseId}/status`, { status });
}

export async function updateEnrollmentSettings(
  courseId: string,
  payload: CourseEnrollmentSettingsPayload,
): Promise<Course> {
  const row = await httpPatch<Course>(`/courses/${courseId}/enrollment-settings`, payload);
  return normalizeCourse(row);
}

export async function selfEnrollCourse(courseId: string): Promise<Enrollment> {
  const row = await httpPost<Enrollment>(`/courses/${courseId}/self-enroll`);
  return normalizeEnrollment(row);
}

export async function joinCourseByCode(joinCode: string): Promise<Enrollment> {
  const row = await httpPost<Enrollment>('/courses/join-by-code', { joinCode });
  return normalizeEnrollment(row);
}

export async function selfDropCourse(courseId: string): Promise<MessageResponse> {
  return httpDelete<MessageResponse>(`/courses/${courseId}/self-enroll`);
}

export async function getCourseEnrollments(courseId: string): Promise<Enrollment[]> {
  const rows = await httpGet<Enrollment[]>(`/courses/${courseId}/enrollments`);
  return rows.map(normalizeEnrollment);
}

export async function enrollStudent(courseId: string, studentId: string): Promise<Enrollment> {
  const row = await httpPost<Enrollment>(`/courses/${courseId}/enrollments`, { studentId });
  return normalizeEnrollment(row);
}

export async function completeEnrollment(courseId: string, studentId: string): Promise<Enrollment> {
  const row = await httpPatch<Enrollment>(`/courses/${courseId}/enrollments/${studentId}/complete`);
  return normalizeEnrollment(row);
}

export async function removeEnrollment(courseId: string, studentId: string): Promise<MessageResponse> {
  return httpDelete<MessageResponse>(`/courses/${courseId}/enrollments/${studentId}`);
}

export async function updateLessonProgress(
  lessonId: string,
  payload: { isCompleted?: boolean; timeSpentDeltaSeconds?: number },
): Promise<LessonProgressItem> {
  return httpPost<LessonProgressItem>(`/lessons/${lessonId}/progress`, {
    isCompleted: payload.isCompleted,
    timeSpentDeltaSeconds: payload.timeSpentDeltaSeconds ?? 0,
  });
}

export async function getCourseProgress(
  courseId: string,
): Promise<CourseProgressSummary | CourseClassProgressResponse> {
  return httpGet<CourseProgressSummary | CourseClassProgressResponse>(`/courses/${courseId}/progress`);
}

export async function getCourseAssignments(courseId: string): Promise<Assignment[]> {
  return httpGet<Assignment[]>(`/courses/${courseId}/assignments`);
}

export async function createAssignment(courseId: string, payload: AssignmentSavePayload): Promise<Assignment> {
  return httpPost<Assignment>(`/courses/${courseId}/assignments`, payload);
}

export async function updateAssignment(
  assignmentId: string,
  payload: Partial<AssignmentSavePayload>,
): Promise<Assignment> {
  return httpPut<Assignment>(`/assignments/${assignmentId}`, payload);
}

export async function submitAssignment(
  assignmentId: string,
  payload: SubmissionSubmitPayload,
): Promise<Submission> {
  const row = await httpPut<Submission>(`/assignments/${assignmentId}/submission`, payload);
  return normalizeSubmission(row);
}

export async function getMySubmission(assignmentId: string): Promise<Submission | null> {
  const row = await httpGet<Submission | null>(`/assignments/${assignmentId}/my-submission`);
  return row ? normalizeSubmission(row) : null;
}

export async function getAssignmentSubmissions(assignmentId: string): Promise<Submission[]> {
  const rows = await httpGet<Submission[]>(`/assignments/${assignmentId}/submissions`);
  return rows.map(normalizeSubmission);
}

export async function gradeSubmission(
  submissionId: string,
  payload: SubmissionGradePayload,
): Promise<SubmissionGradeResult> {
  const row = await httpPut<SubmissionGradeResult>(`/submissions/${submissionId}/grade`, payload);
  return {
    ...normalizeSubmission(row),
    gradeId: row.gradeId ?? null,
    weightPercent: row.weightPercent ?? null,
  };
}

export async function getCourseQuizzes(courseId: string): Promise<Quiz[]> {
  const rows = await httpGet<Quiz[]>(`/courses/${courseId}/quizzes`);
  return rows.map(normalizeQuiz);
}

export async function getQuizDetail(quizId: string): Promise<Quiz> {
  const row = await httpGet<Quiz>(`/quizzes/${quizId}`);
  return normalizeQuiz(row);
}

export async function createQuiz(courseId: string, payload: QuizSavePayload): Promise<Quiz> {
  const row = await httpPost<Quiz>(`/courses/${courseId}/quizzes`, payload);
  return normalizeQuiz(row);
}

export async function updateQuiz(quizId: string, payload: Partial<QuizSavePayload>): Promise<Quiz> {
  const row = await httpPut<Quiz>(`/quizzes/${quizId}`, payload);
  return normalizeQuiz(row);
}

export async function toggleQuizPublish(quizId: string, isPublished: boolean): Promise<MessageResponse> {
  return httpPatch<MessageResponse>(`/quizzes/${quizId}/publish`, { isPublished });
}

export async function addQuizQuestion(
  quizId: string,
  payload: QuizQuestionSavePayload,
): Promise<QuizQuestion> {
  return httpPost<QuizQuestion>(`/quizzes/${quizId}/questions`, payload);
}

export async function updateQuizQuestion(
  questionId: string,
  payload: Partial<QuizQuestionSavePayload>,
): Promise<QuizQuestion> {
  return httpPut<QuizQuestion>(`/questions/${questionId}`, payload);
}

export async function deleteQuizQuestion(questionId: string): Promise<MessageResponse> {
  return httpDelete<MessageResponse>(`/questions/${questionId}`);
}

export async function startQuizAttempt(quizId: string): Promise<QuizAttemptStart> {
  return httpPost<QuizAttemptStart>(`/quizzes/${quizId}/attempts/start`);
}

export async function saveQuizDraft(
  attemptId: string,
  answers: Record<string, unknown>,
): Promise<QuizAttempt> {
  const row = await httpPut<QuizAttempt>(`/quiz-attempts/${attemptId}/draft`, { answers });
  return normalizeAttempt(row);
}

export async function submitQuizAttempt(
  attemptId: string,
  answers: Record<string, unknown>,
): Promise<QuizAttempt> {
  const row = await httpPost<QuizAttempt>(`/quiz-attempts/${attemptId}/submit`, { answers });
  return normalizeAttempt(row);
}

export async function manualGradeQuizAttempt(
  attemptId: string,
  payload: QuizManualGradePayload,
): Promise<QuizAttempt> {
  const row = await httpPut<QuizAttempt>(`/quiz-attempts/${attemptId}/manual-grade`, payload);
  return normalizeAttempt(row);
}

export async function getMyQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
  const rows = await httpGet<QuizAttempt[]>(`/quizzes/${quizId}/my-attempts`);
  return rows.map(normalizeAttempt);
}

export async function getQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
  const rows = await httpGet<QuizAttempt[]>(`/quizzes/${quizId}/attempts`);
  return rows.map(normalizeAttempt);
}

export async function getQuizAnalytics(quizId: string): Promise<QuizAnalyticsResponse> {
  return httpGet<QuizAnalyticsResponse>(`/quizzes/${quizId}/analytics`);
}

export async function getCourseGradebook(courseId: string): Promise<Grade[]> {
  const rows = await httpGet<Grade[]>(`/courses/${courseId}/gradebook`);
  return rows.map(normalizeGrade);
}

export async function getMyGrades(courseId: string): Promise<Grade[]> {
  const rows = await httpGet<Grade[]>(`/courses/${courseId}/my-grades`);
  return rows.map(normalizeGrade);
}

export async function getMyTranscript(studentId?: string): Promise<StudentTranscriptResponse> {
  const qs = buildQuery({ studentId });
  return httpGet<StudentTranscriptResponse>(`/grades/transcript${qs}`);
}

export async function createManualGrade(
  courseId: string,
  payload: ManualGradeCreatePayload,
): Promise<Grade> {
  const row = await httpPost<Grade>(`/courses/${courseId}/grades/manual`, payload);
  return normalizeGrade(row);
}

export async function updateManualGrade(
  gradeId: string,
  payload: ManualGradeUpdatePayload,
): Promise<Grade> {
  const row = await httpPut<Grade>(`/grades/${gradeId}`, payload);
  return normalizeGrade(row);
}

export async function deleteManualGrade(gradeId: string): Promise<MessageResponse> {
  return httpDelete<MessageResponse>(`/grades/${gradeId}`);
}

export async function getDashboardCalendar(params?: {
  from?: string;
  to?: string;
  courseId?: string;
}): Promise<CalendarEventItem[]> {
  const qs = buildQuery({
    from: params?.from,
    to: params?.to,
    courseId: params?.courseId,
  });
  return httpGet<CalendarEventItem[]>(`/dashboard/calendar${qs}`);
}

export async function getAdminDashboard(): Promise<AdminDashboardPayload> {
  return httpGet<AdminDashboardPayload>('/dashboard/admin');
}

export async function getLecturerDashboard(): Promise<LecturerDashboardPayload> {
  return httpGet<LecturerDashboardPayload>('/dashboard/lecturer');
}

export async function getStudentDashboard(): Promise<StudentDashboardPayload> {
  return httpGet<StudentDashboardPayload>('/dashboard/student');
}

export const learningApi = {
  getCourses,
  getCourseDetail,
  getCourseCatalog,
  createCourse,
  updateCourse,
  updateCourseStatus,
  updateEnrollmentSettings,
  selfEnrollCourse,
  joinCourseByCode,
  selfDropCourse,
  getCourseEnrollments,
  enrollStudent,
  completeEnrollment,
  removeEnrollment,
  updateLessonProgress,
  getCourseProgress,
  getCourseAssignments,
  createAssignment,
  updateAssignment,
  submitAssignment,
  getMySubmission,
  getAssignmentSubmissions,
  gradeSubmission,
  getCourseQuizzes,
  getQuizDetail,
  createQuiz,
  updateQuiz,
  toggleQuizPublish,
  addQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  startQuizAttempt,
  saveQuizDraft,
  submitQuizAttempt,
  manualGradeQuizAttempt,
  getMyQuizAttempts,
  getQuizAttempts,
  getQuizAnalytics,
  getCourseGradebook,
  getMyGrades,
  getMyTranscript,
  createManualGrade,
  updateManualGrade,
  deleteManualGrade,
  getDashboardCalendar,
  getAdminDashboard,
  getLecturerDashboard,
  getStudentDashboard,
};
