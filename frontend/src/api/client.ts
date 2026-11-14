/**
 * Backwards-compatible facade over domain API modules (`./http`, `./users`,
 * `./content`, `./learning`, `./realtime`, `./files`, `./ai`, `./demo`).
 *
 * New components should import directly from the domain modules; existing callers
 * of `api.*`, `ApiError`, or `apiRequest` continue working without duplicate HTTP logic.
 */
import type {
  Assignment,
  AuthResponse,
  Course,
  CourseMessage,
  CourseStatus,
  DashboardStats,
  Enrollment,
  Grade,
  Lesson,
  LessonContentType,
  Meeting,
  MeetingLog,
  Module,
  Notification,
  Quiz,
  QuizAttempt,
  QuizAttemptStart,
  QuizQuestion,
  ScoreVisibility,
  Submission,
  User,
  UserRole,
} from '../types';
import * as aiApi from './ai';
import * as contentApi from './content';
import * as demoApi from './demo';
import * as filesApi from './files';
import { ApiError, httpPost, httpRequest, type HttpRequestOptions } from './http';
import * as learningApi from './learning';
import * as realtimeApi from './realtime';
import * as usersApi from './users';

export { ApiError };
export { aiApi, contentApi, demoApi, filesApi, learningApi, realtimeApi, usersApi };

export function apiRequest<T>(endpoint: string, options: HttpRequestOptions = {}): Promise<T> {
  return httpRequest<T>(endpoint, options);
}

type LegacyLoginCredentials =
  | { email: string; password: string }
  | { username: string; password: string }
  | FormData;

export const api = {
  async login(credentials: LegacyLoginCredentials): Promise<AuthResponse> {
    if (credentials instanceof FormData) {
      const email = String(credentials.get('username') ?? credentials.get('email') ?? '').trim();
      const password = String(credentials.get('password') ?? '');
      return httpPost<AuthResponse>('/auth/login', { email, password });
    }
    const email = 'email' in credentials ? credentials.email : credentials.username;
    return httpPost<AuthResponse>('/auth/login', {
      email,
      password: credentials.password,
    });
  },

  getMe(): Promise<User> {
    return usersApi.getMyProfile();
  },

  async getUsers(role?: string, activeOnly = false): Promise<User[]> {
    const collected: User[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;

    while (collected.length < total) {
      const res = await usersApi.listUsers({
        page,
        pageSize: 100,
        role: (role as UserRole | undefined) || undefined,
        status: activeOnly ? 'ACTIVE' : undefined,
      });
      total = res.total;
      if (res.items.length === 0) break;
      collected.push(...res.items);
      if (collected.length >= total) break;
      page += 1;
    }

    return collected;
  },

  createUser(userData: {
    email: string;
    password: string;
    fullName?: string;
    full_name?: string;
    role: string;
    studentCode?: string;
    student_code?: string;
    staffCode?: string;
    staff_code?: string;
    isActive?: boolean;
  }): Promise<User> {
    return usersApi.createUser({
      email: userData.email,
      password: userData.password,
      fullName: userData.fullName ?? userData.full_name ?? '',
      role: userData.role as UserRole,
      studentCode: userData.studentCode ?? userData.student_code ?? null,
      staffCode: userData.staffCode ?? userData.staff_code ?? null,
      isActive: userData.isActive ?? true,
    });
  },

  toggleUserStatus(userId: string | number, currentActive = true): Promise<{ message: string }> {
    return usersApi.setUserActive(String(userId), !currentActive);
  },

  updateUser(userId: string | number, data: { email: string; fullName: string }): Promise<User> {
    return usersApi.updateUser(String(userId), data);
  },

  getCourses(status?: string, lecturerId?: string | number): Promise<Course[]> {
    return learningApi.getCourses({
      status,
      lecturerId: lecturerId !== undefined ? String(lecturerId) : undefined,
    });
  },

  getCourse(courseId: string | number): Promise<Course> {
    return learningApi.getCourseDetail(String(courseId));
  },

  createCourse(courseData: {
    code?: string;
    courseCode?: string;
    title: string;
    description?: string;
    credits: number;
    semester?: string;
    academicYear?: string;
    lecturerId?: string | number;
    lecturer_id?: string | number;
    status?: string;
    joinCode?: string;
    allowSelfEnroll?: boolean;
    maxStudents?: number | null;
    category?: string;
  }): Promise<Course> {
    return learningApi.createCourse({
      courseCode: courseData.courseCode ?? courseData.code ?? '',
      title: courseData.title,
      description: courseData.description,
      credits: courseData.credits,
      semester: courseData.semester ?? '2026-1',
      academicYear: courseData.academicYear ?? '2026-2027',
      lecturerId: String(courseData.lecturerId ?? courseData.lecturer_id ?? ''),
      status: (courseData.status as CourseStatus | undefined) ?? 'ACTIVE',
      joinCode: courseData.joinCode,
      allowSelfEnroll: courseData.allowSelfEnroll,
      maxStudents: courseData.maxStudents,
      category: courseData.category,
    });
  },

  updateCourse(courseId: string | number, courseData: Partial<Course>): Promise<Course> {
    return learningApi.updateCourse(String(courseId), {
      title: courseData.title,
      description: courseData.description,
      credits: courseData.credits,
      semester: courseData.semester,
      academicYear: courseData.academicYear,
      status: courseData.status,
      lecturerId: courseData.lecturerId
        ? String(courseData.lecturerId)
        : courseData.lecturer_id
          ? String(courseData.lecturer_id)
          : undefined,
      joinCode: courseData.joinCode,
      allowSelfEnroll: courseData.allowSelfEnroll,
      maxStudents: courseData.maxStudents,
      category: courseData.category,
    });
  },

  getCourseEnrollments(courseId: string | number): Promise<Enrollment[]> {
    return learningApi.getCourseEnrollments(String(courseId));
  },

  enrollStudent(courseId: string | number, studentId: string | number): Promise<Enrollment> {
    return learningApi.enrollStudent(String(courseId), String(studentId));
  },

  dropEnrollment(courseId: string | number, studentId: string | number): Promise<{ message: string }> {
    return learningApi.removeEnrollment(String(courseId), String(studentId));
  },

  getCourseModules(courseId: string | number): Promise<Module[]> {
    return contentApi.getCourseModules(String(courseId));
  },

  createModule(
    courseId: string | number,
    data: {
      title: string;
      description?: string;
      order_index?: number;
      sortOrder?: number;
      isPublished?: boolean;
    },
  ): Promise<Module> {
    return contentApi.createModule(String(courseId), data);
  },

  updateModule(moduleId: string | number, data: Partial<Module>): Promise<Module> {
    return contentApi.updateModule(String(moduleId), {
      title: data.title,
      description: data.description,
      sortOrder: data.sortOrder ?? data.order_index,
      isPublished: data.isPublished,
    });
  },

  createLesson(
    moduleId: string | number,
    data: {
      title: string;
      contentType?: string;
      content_type?: string;
      contentHtml?: string;
      content_body?: string;
      materialUrl?: string | null;
      media_url?: string | null;
      attachmentFileId?: string | null;
      order_index?: number;
      sortOrder?: number;
      isPublished?: boolean;
      is_published?: boolean;
      estimatedMinutes?: number;
    },
  ): Promise<Lesson> {
    return contentApi.createLesson(String(moduleId), {
      title: data.title,
      contentType: (data.contentType ?? data.content_type ?? 'TEXT') as LessonContentType,
      contentHtml: data.contentHtml ?? data.content_body,
      materialUrl: data.materialUrl ?? data.media_url,
      attachmentFileId: data.attachmentFileId,
      sortOrder: data.sortOrder ?? data.order_index,
      isPublished: data.isPublished ?? data.is_published,
      estimatedMinutes: data.estimatedMinutes,
    });
  },

  getLesson(lessonId: string | number): Promise<Lesson> {
    return contentApi.getLesson(String(lessonId));
  },

  updateLesson(lessonId: string | number, data: Partial<Lesson>): Promise<Lesson> {
    return contentApi.updateLesson(String(lessonId), {
      title: data.title,
      contentType: data.contentType ?? data.content_type,
      contentHtml: data.contentHtml ?? data.content_body,
      materialUrl: data.materialUrl ?? data.media_url,
      attachmentFileId: data.attachmentFileId,
      sortOrder: data.sortOrder ?? data.order_index,
      isPublished: data.isPublished ?? data.is_published,
      estimatedMinutes: data.estimatedMinutes,
    });
  },

  getCourseAssignments(courseId: string | number): Promise<Assignment[]> {
    return learningApi.getCourseAssignments(String(courseId));
  },

  createAssignment(
    courseId: string | number,
    data: {
      title: string;
      description?: string;
      dueAt?: string;
      due_date?: string;
      maxScore?: number;
      max_score?: number;
      allowLate?: boolean;
      attachmentUrl?: string | null;
      attachmentFileId?: string | null;
      weightPercent?: number | null;
      rubricJson?: string | null;
      status?: string;
    },
  ): Promise<Assignment> {
    return learningApi.createAssignment(String(courseId), {
      title: data.title,
      description: data.description,
      dueAt: data.dueAt ?? data.due_date ?? new Date().toISOString(),
      maxScore: data.maxScore ?? data.max_score ?? 100,
      allowLate: data.allowLate ?? true,
      attachmentUrl: data.attachmentUrl,
      attachmentFileId: data.attachmentFileId,
      weightPercent: data.weightPercent,
      rubricJson: data.rubricJson,
      status: (data.status as 'DRAFT' | 'PUBLISHED' | 'CLOSED' | undefined) ?? 'PUBLISHED',
    });
  },

  updateAssignment(assignmentId: string | number, data: Partial<Assignment>): Promise<Assignment> {
    return learningApi.updateAssignment(String(assignmentId), {
      title: data.title,
      description: data.description,
      dueAt: data.dueAt ?? data.due_date,
      maxScore: data.maxScore ?? data.max_score,
      allowLate: data.allowLate,
      attachmentUrl: data.attachmentUrl,
      attachmentFileId: data.attachmentFileId,
      weightPercent: data.weightPercent,
      rubricJson: data.rubricJson,
      status: data.status as 'DRAFT' | 'PUBLISHED' | 'CLOSED' | undefined,
    });
  },

  getAssignmentSubmissions(assignmentId: string | number): Promise<Submission[]> {
    return learningApi.getAssignmentSubmissions(String(assignmentId));
  },

  getMySubmission(assignmentId: string | number): Promise<Submission | null> {
    return learningApi.getMySubmission(String(assignmentId));
  },

  submitAssignment(
    assignmentId: string | number,
    textContent: string,
    fileId?: string | null,
  ): Promise<Submission> {
    return learningApi.submitAssignment(String(assignmentId), {
      contentText: textContent,
      fileId,
    });
  },

  gradeSubmission(
    submissionId: string | number,
    data: { score: number; feedback?: string; rubricScoresJson?: string | null },
  ): Promise<Submission> {
    return learningApi.gradeSubmission(String(submissionId), data);
  },

  getCourseQuizzes(courseId: string | number): Promise<Quiz[]> {
    return learningApi.getCourseQuizzes(String(courseId));
  },

  getQuiz(quizId: string | number): Promise<Quiz> {
    return learningApi.getQuizDetail(String(quizId));
  },

  createQuiz(
    courseId: string | number,
    data: {
      title: string;
      description?: string;
      startAt?: string;
      endAt?: string;
      timeLimitMinutes?: number;
      duration_minutes?: number;
      maxAttempts?: number;
      passingScore?: number;
      weightPercent?: number | null;
      scoreVisibility?: ScoreVisibility;
      isPublished?: boolean;
    },
  ): Promise<Quiz> {
    const startAt = data.startAt || new Date().toISOString();
    const endAt = data.endAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    return learningApi.createQuiz(String(courseId), {
      title: data.title,
      description: data.description,
      startAt,
      endAt,
      timeLimitMinutes: data.timeLimitMinutes ?? data.duration_minutes ?? 15,
      maxAttempts: data.maxAttempts ?? 1,
      passingScore: data.passingScore ?? 50,
      weightPercent: data.weightPercent,
      scoreVisibility: data.scoreVisibility,
      isPublished: data.isPublished,
    });
  },

  updateQuiz(quizId: string | number, data: Partial<Quiz>): Promise<Quiz> {
    return learningApi.updateQuiz(String(quizId), {
      title: data.title,
      description: data.description,
      startAt: data.startAt,
      endAt: data.endAt,
      timeLimitMinutes: data.timeLimitMinutes ?? data.duration_minutes,
      maxAttempts: data.maxAttempts,
      passingScore: data.passingScore,
      weightPercent: data.weightPercent,
      scoreVisibility: data.scoreVisibility,
      isPublished: data.isPublished,
    });
  },

  async publishQuiz(quizId: string | number, isPublished: boolean): Promise<{ message: string }> {
    return learningApi.toggleQuizPublish(String(quizId), isPublished);
  },

  addQuizQuestion(
    quizId: string | number,
    data: {
      questionText?: string;
      question_text?: string;
      questionType?: string;
      question_type?: string;
      optionsJson?: string;
      options?: Array<{ id?: string; text: string } | string>;
      correctAnswer?: string;
      correct_option_id?: string | number;
      score?: number;
      points?: number;
      sortOrder?: number;
    },
  ): Promise<QuizQuestion> {
    let optionsJson = data.optionsJson;
    if (!optionsJson && data.options) {
      const normalizedOpts = data.options.map((item, idx) =>
        typeof item === 'string'
          ? { id: String(idx + 1), text: item }
          : { id: item.id ?? String(idx + 1), text: item.text },
      );
      optionsJson = JSON.stringify(normalizedOpts);
    }

    return learningApi.addQuizQuestion(String(quizId), {
      questionText: data.questionText ?? data.question_text ?? '',
      questionType: (data.questionType ?? data.question_type ?? 'SINGLE_CHOICE') as
        | 'SINGLE_CHOICE'
        | 'TRUE_FALSE'
        | 'SHORT_TEXT',
      optionsJson: optionsJson ?? null,
      correctAnswer: String(data.correctAnswer ?? data.correct_option_id ?? ''),
      score: data.score ?? data.points ?? 1,
      sortOrder: data.sortOrder ?? 1,
    });
  },

  updateQuizQuestion(questionId: string | number, data: Partial<QuizQuestion>): Promise<QuizQuestion> {
    let optionsJson = data.optionsJson;
    if (!optionsJson && data.options) {
      optionsJson = JSON.stringify(data.options);
    }
    return learningApi.updateQuizQuestion(String(questionId), {
      questionText: data.questionText ?? data.question_text,
      questionType: (data.questionType ?? data.question_type) as
        | 'SINGLE_CHOICE'
        | 'TRUE_FALSE'
        | 'SHORT_TEXT'
        | undefined,
      optionsJson,
      correctAnswer:
        data.correctAnswer !== undefined
          ? data.correctAnswer
          : data.correct_option_id !== undefined
            ? String(data.correct_option_id)
            : undefined,
      score: data.score ?? data.points,
    });
  },

  getQuizAttempts(quizId: string | number): Promise<QuizAttempt[]> {
    return learningApi.getQuizAttempts(String(quizId));
  },

  startQuizAttempt(quizId: string | number): Promise<QuizAttemptStart> {
    return learningApi.startQuizAttempt(String(quizId));
  },

  submitQuiz(attemptId: string, answers: Record<string | number, unknown>): Promise<QuizAttempt> {
    const stringAnswers: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(answers)) {
      stringAnswers[String(key)] = val;
    }
    return learningApi.submitQuizAttempt(attemptId, stringAnswers);
  },

  async getMyGrades(courseId?: string | number): Promise<Grade[]> {
    if (courseId !== undefined) {
      return learningApi.getMyGrades(String(courseId));
    }
    const transcript = await learningApi.getMyTranscript();
    return transcript.courses.flatMap((course) =>
      course.grades.map((g) => ({
        gradeId: g.gradeId,
        id: g.gradeId,
        courseId: g.courseId,
        course_id: g.courseId,
        studentId: g.studentId,
        student_id: g.studentId,
        courseCode: course.courseCode,
        course_code: course.courseCode,
        courseTitle: course.title,
        course_title: course.title,
        sourceType: g.sourceType,
        source_type: g.sourceType,
        sourceId: g.sourceId ?? '',
        source_id: g.sourceId ?? '',
        itemTitle: g.itemTitle,
        score: g.score,
        maxScore: g.maxScore,
        max_score: g.maxScore,
        weightPercent: g.weightPercent,
        feedback: g.feedback,
        gradedAt: g.gradedAt,
        graded_at: g.gradedAt,
      })),
    );
  },

  getCourseGradebook(courseId: string | number): Promise<Grade[]> {
    return learningApi.getCourseGradebook(String(courseId));
  },

  getNotifications(unreadOnly = false): Promise<Notification[]> {
    return realtimeApi.getNotifications(unreadOnly);
  },

  markNotificationRead(id: string | number): Promise<Notification> {
    return realtimeApi.markNotificationRead(String(id));
  },

  markAllNotificationsRead(): Promise<{ message: string }> {
    return realtimeApi.markAllNotificationsRead();
  },

  async getDashboardStats(role?: string): Promise<DashboardStats> {
    const userRole = (role ?? 'student').toLowerCase();
    const notificationsPromise = realtimeApi.getNotifications().catch(() => [] as Notification[]);

    if (userRole === 'admin') {
      const [data, recentNotifications] = await Promise.all([
        learningApi.getAdminDashboard(),
        notificationsPromise,
      ]);
      return {
        role: 'ADMIN',
        courses_count: data.totalCourses,
        students_count: data.totalStudents,
        lecturers_count: data.totalLecturers,
        activeCourses: data.activeCourses,
        draftCourses: data.draftCourses,
        archivedCourses: data.archivedCourses,
        activeMeetings: data.activeMeetings,
        recent_notifications: recentNotifications,
      };
    }

    if (userRole === 'lecturer') {
      const [data, recentNotifications] = await Promise.all([
        learningApi.getLecturerDashboard(),
        notificationsPromise,
      ]);
      return {
        role: 'LECTURER',
        courses_count: data.totalCourses,
        students_count: data.totalStudents,
        pending_submissions_count: data.totalPendingSubmissions,
        quizzes_count: data.totalQuizzes,
        activeMeetings: data.activeMeetings,
        recent_notifications: recentNotifications,
      };
    }

    const [data, recentNotifications] = await Promise.all([
      learningApi.getStudentDashboard(),
      notificationsPromise,
    ]);
    return {
      role: 'STUDENT',
      courses_count: data.totalEnrolledCourses,
      upcoming_assignments_count: data.upcomingAssignments,
      quizzes_count: data.availableQuizzes,
      gpa: data.gpa,
      gpaScale4: data.gpaScale4,
      completedLessons: data.completedLessons,
      totalLessons: data.totalLessons,
      recent_notifications: recentNotifications,
    };
  },

  createMeeting(payload: {
    courseId: string;
    title: string;
    roomCode?: string;
    replaceActive?: boolean;
  }): Promise<Meeting> {
    return realtimeApi.startMeeting(payload);
  },

  getActiveMeetings(): Promise<Meeting[]> {
    return realtimeApi.getActiveMeetings();
  },

  getCourseMeetings(courseId: string): Promise<Meeting[]> {
    return realtimeApi.getCourseMeetings(courseId);
  },

  getMeetingDetail(meetingId: string): Promise<Meeting> {
    return realtimeApi.getMeetingDetail(meetingId);
  },

  joinMeeting(meetingId: string): Promise<{ status: string; logId: string }> {
    return realtimeApi.joinMeeting(meetingId);
  },

  async leaveMeeting(
    meetingId: string,
    payload: { chatCount?: number; handRaisesCount?: number; activitySummary?: string },
  ): Promise<{ status: string; durationSeconds: number }> {
    const res = await realtimeApi.leaveMeeting(meetingId, {
      activitySummary: payload.activitySummary,
    });
    return {
      status: res.status,
      durationSeconds: res.durationSeconds ?? 0,
    };
  },

  endMeeting(meetingId: string): Promise<Meeting> {
    return realtimeApi.endMeeting(meetingId);
  },

  getMeetingAuditLogs(meetingId: string): Promise<MeetingLog[]> {
    return realtimeApi.getMeetingAuditLogs(meetingId);
  },

  getCourseMessages(courseId: string): Promise<CourseMessage[]> {
    return realtimeApi.getCourseMessages(courseId);
  },

  postCourseMessage(
    courseId: string,
    content: string,
    attachmentUrl?: string,
  ): Promise<CourseMessage> {
    return realtimeApi.sendCourseMessage(courseId, { content, attachmentUrl });
  },
};
