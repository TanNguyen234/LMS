import type {
  User,
  AuthResponse,
  Course,
  Enrollment,
  Module,
  Lesson,
  Assignment,
  Submission,
  Quiz,
  QuizQuestion,
  QuizAttempt,
  QuizAttemptStart,
  Grade,
  Notification,
  DashboardStats,
  StudentWorkloadResponse,
  TeachingInsights,
  LearningInsights,
  OperationsInsights,
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'Request failed';
    let errorData = null;
    try {
      errorData = await response.json();
      if (typeof errorData.detail === 'string') {
        errorDetail = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errorDetail = errorData.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      }
    } catch {
      errorDetail = response.statusText || `HTTP Error ${response.status}`;
    }
    throw new ApiError(response.status, errorDetail, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

function normalizeQuizQuestions(questions: any[]): QuizQuestion[] {
  return questions.map((question: any) => {
    let options: QuizQuestion['options'] = [];
    try {
      const raw = typeof question.optionsJson === 'string'
        ? JSON.parse(question.optionsJson)
        : question.optionsJson;
      if (Array.isArray(raw)) {
        options = raw.map((item: any, index: number) => {
          const fallbackId = String.fromCharCode(65 + index);
          if (typeof item === 'string') return { id: fallbackId, text: item };
          if (item && typeof item === 'object') {
            const id = item.key ?? item.id ?? item.value ?? fallbackId;
            const text = item.text ?? item.label ?? item.value ?? String(item);
            return { id: String(id), text: String(text) };
          }
          return { id: fallbackId, text: String(item) };
        });
      } else if (raw && typeof raw === 'object') {
        options = Object.entries(raw).map(([key, value]) => ({ id: key, text: String(value) }));
      }
    } catch {
      options = [];
    }
    if (question.questionType === 'TRUE_FALSE' && options.length === 0) {
      options = [
        { id: 'true', text: 'Đúng' },
        { id: 'false', text: 'Sai' },
      ];
    }
    return {
      ...question,
      id: question.questionId,
      quiz_id: question.quizId,
      question_text: question.questionText,
      question_type: question.questionType,
      points: Number(question.score ?? 0),
      options,
    };
  });
}

export const api = {
  // Auth
  async login(credentials: { email: string; password: string } | FormData | { username: string; password: string }): Promise<AuthResponse> {
    let payload: any;
    if (credentials instanceof FormData) {
      const email = credentials.get('email') || credentials.get('username');
      const password = credentials.get('password');
      payload = { email: String(email || ''), password: String(password || '') };
    } else if ('username' in credentials) {
      payload = { email: (credentials as any).username, password: credentials.password };
    } else {
      payload = credentials;
    }
    const res = await request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const u = res.user;
    const normalizedUser: User = {
      ...u,
      id: u?.userId || u?.id,
      userId: u?.userId || u?.id,
      full_name: u?.fullName || u?.full_name,
      fullName: u?.fullName || u?.full_name,
      is_active: u?.isActive !== undefined ? u.isActive : u?.is_active,
      isActive: u?.isActive !== undefined ? u.isActive : u?.is_active,
      created_at: u?.createdAt || u?.created_at,
      createdAt: u?.createdAt || u?.created_at,
    };
    return {
      access_token: res.access_token,
      token_type: res.token_type,
      user: normalizedUser,
    };
  },

  async getMe(): Promise<User> {
    const u = await request<any>('/auth/me');
    return {
      ...u,
      id: u?.userId || u?.id,
      userId: u?.userId || u?.id,
      full_name: u?.fullName || u?.full_name,
      fullName: u?.fullName || u?.full_name,
      is_active: u?.isActive !== undefined ? u.isActive : u?.is_active,
      isActive: u?.isActive !== undefined ? u.isActive : u?.is_active,
      created_at: u?.createdAt || u?.created_at,
      createdAt: u?.createdAt || u?.created_at,
    };
  },

  // Users (Admin)
  async getUsers(role?: string, activeOnly = false): Promise<User[]> {
    const collected: any[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (collected.length < total) {
      const params = new URLSearchParams({ page: String(page), pageSize: '100' });
      if (role) params.set('role', role);
      if (activeOnly) params.set('isActive', 'true');
      const res = await request<any>(`/users?${params.toString()}`);
      if (Array.isArray(res)) {
        collected.push(...res);
        break;
      }
      const pageItems = Array.isArray(res?.items) ? res.items : [];
      collected.push(...pageItems);
      total = Number(res?.total ?? collected.length);
      if (pageItems.length === 0 || collected.length >= total) break;
      page += 1;
    }
    const items: User[] = collected;
    const normalized = items.map((u: any) => ({
      ...u,
      id: u.userId,
      username: u.studentCode || u.staffCode || u.email.split('@')[0],
      full_name: u.fullName,
      is_active: u.isActive,
      created_at: u.createdAt,
    }));
    return activeOnly ? normalized.filter((u) => u.is_active) : normalized;
  },

  async createUser(userData: {
    username?: string;
    email: string;
    full_name?: string;
    fullName?: string;
    role: string;
    password?: string;
  }): Promise<User> {
    const payload = {
      email: userData.email,
      fullName: userData.fullName || userData.full_name || userData.username || 'User',
      role: userData.role.toUpperCase(),
      password: userData.password || 'Demo@123',
    };
    const res = await request<any>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.userId,
      full_name: res.fullName,
      is_active: res.isActive,
      created_at: res.createdAt,
      username: res.studentCode || res.staffCode || res.email.split('@')[0],
    };
  },

  async toggleUserStatus(userId: string | number, currentActive = true): Promise<{ message: string }> {
    return request<{ message: string }>(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !currentActive }),
    });
  },

  async updateUser(userId: string | number, data: { email: string; fullName: string }): Promise<User> {
    const res = await request<any>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return {
      ...res,
      id: res.userId,
      full_name: res.fullName,
      is_active: res.isActive,
      created_at: res.createdAt,
      username: res.studentCode || res.staffCode || res.email.split('@')[0],
    };
  },

  // Courses
  async getCourses(status?: string, lecturerId?: string | number): Promise<Course[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (lecturerId) params.set('lecturerId', String(lecturerId));
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await request<Course[]>(`/courses${query}`);
    return (res || []).map((c: any) => ({
      ...c,
      id: c.courseId,
      code: c.courseCode,
      lecturer_id: c.lecturerId,
      lecturer_name: c.lecturerName,
      created_at: c.createdAt,
    }));
  },

  async getCourse(courseId: string | number): Promise<Course> {
    const c = await request<any>(`/courses/${courseId}`);
    return {
      ...c,
      id: c.courseId,
      code: c.courseCode,
      lecturer_id: c.lecturerId,
      lecturer_name: c.lecturerName,
      created_at: c.createdAt,
    };
  },

  async createCourse(courseData: {
    code?: string;
    courseCode?: string;
    title: string;
    description?: string;
    credits: number;
    lecturer_id?: string | number;
    lecturerId?: string | number;
    semester?: string;
    academicYear?: string;
    status?: string;
  }): Promise<Course> {
    const payload = {
      courseCode: courseData.courseCode || courseData.code,
      title: courseData.title,
      description: courseData.description,
      credits: courseData.credits,
      lecturerId: courseData.lecturerId || courseData.lecturer_id,
      semester: courseData.semester || 'HK1',
      academicYear: courseData.academicYear || '2026-2027',
      status: courseData.status || 'ACTIVE',
    };
    const c = await request<any>('/courses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...c,
      id: c.courseId,
      code: c.courseCode,
      lecturer_id: c.lecturerId,
      lecturer_name: c.lecturerName,
      created_at: c.createdAt,
    };
  },

  async updateCourse(courseId: string | number, courseData: Partial<Course>): Promise<Course> {
    const payload = {
      title: courseData.title,
      description: courseData.description,
      credits: courseData.credits,
      semester: courseData.semester,
      academicYear: courseData.academicYear,
      status: courseData.status,
      lecturerId: courseData.lecturerId || courseData.lecturer_id,
    };
    const c = await request<any>(`/courses/${courseId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return {
      ...c,
      id: c.courseId,
      code: c.courseCode,
      lecturer_id: c.lecturerId,
      lecturer_name: c.lecturerName,
    };
  },

  // Enrollments
  async getCourseEnrollments(courseId: string | number): Promise<Enrollment[]> {
    const res = await request<any[]>(`/courses/${courseId}/enrollments`);
    return (res || []).map((e: any) => ({
      ...e,
      id: e.enrollmentId,
      student_id: e.studentId,
      course_id: e.courseId,
      student_name: e.studentName,
      student_email: e.studentEmail,
      enrolled_at: e.enrolledAt,
    }));
  },

  async enrollStudent(courseId: string | number, studentId: string | number): Promise<Enrollment> {
    const res = await request<any>(`/courses/${courseId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify({ studentId: String(studentId) }),
    });
    return {
      ...res,
      id: res.enrollmentId,
      student_id: res.studentId,
      course_id: res.courseId,
      student_name: res.studentName,
      student_email: res.studentEmail,
      enrolled_at: res.enrolledAt,
    };
  },

  async dropEnrollment(courseId: string | number, studentId: string | number): Promise<{ message: string }> {
    return request<{ message: string }>(`/courses/${courseId}/enrollments/${studentId}`, {
      method: 'DELETE',
    });
  },

  // Content (Modules & Lessons)
  async getCourseModules(courseId: string | number): Promise<Module[]> {
    const res = await request<any[]>(`/courses/${courseId}/modules`);
    return (res || []).map((m: any) => ({
      ...m,
      id: m.moduleId,
      course_id: m.courseId,
      order_index: m.sortOrder,
      isPublished: m.isPublished,
      created_at: m.createdAt,
      lessons: (m.lessons || []).map((l: any) => ({
        ...l,
        id: l.lessonId,
        module_id: l.moduleId,
        order_index: l.sortOrder,
        content_body: l.contentHtml,
        media_url: l.materialUrl,
        content_type: l.contentType || 'TEXT',
        is_published: l.isPublished,
        created_at: l.createdAt,
      })),
    }));
  },

  async createModule(courseId: string | number, data: { title: string; description?: string; order_index?: number; sortOrder?: number; isPublished?: boolean }): Promise<Module> {
    const payload = {
      title: data.title,
      description: data.description,
      sortOrder: data.sortOrder || data.order_index || 1,
      isPublished: data.isPublished ?? true,
    };
    const res = await request<any>(`/courses/${courseId}/modules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.moduleId,
      course_id: res.courseId,
      order_index: res.sortOrder,
      lessons: [],
    };
  },

  async updateModule(moduleId: string | number, data: Partial<Module>): Promise<Module> {
    const res = await request<any>(`/modules/${moduleId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        sortOrder: data.sortOrder ?? data.order_index,
        isPublished: data.isPublished,
      }),
    });
    return {
      ...res,
      id: res.moduleId,
      course_id: res.courseId,
      order_index: res.sortOrder,
      lessons: res.lessons || [],
    };
  },

  async createLesson(moduleId: string | number, data: {
    title: string;
    content_type?: string;
    contentType?: string;
    content_body?: string;
    contentHtml?: string;
    media_url?: string;
    materialUrl?: string;
    order_index?: number;
    sortOrder?: number;
    is_published?: boolean;
    isPublished?: boolean;
  }): Promise<Lesson> {
    const payload = {
      title: data.title,
      contentType: data.contentType || data.content_type || 'TEXT',
      contentHtml: data.contentHtml || data.content_body || '',
      materialUrl: data.materialUrl || data.media_url,
      sortOrder: data.sortOrder || data.order_index || 1,
      isPublished: data.isPublished !== undefined ? data.isPublished : (data.is_published !== undefined ? data.is_published : true),
      estimatedMinutes: 15,
    };
    const res = await request<any>(`/modules/${moduleId}/lessons`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.lessonId,
      module_id: res.moduleId,
      order_index: res.sortOrder,
      content_body: res.contentHtml,
      media_url: res.materialUrl,
      content_type: 'TEXT',
      is_published: res.isPublished,
    };
  },

  async getLesson(lessonId: string | number): Promise<Lesson> {
    const res = await request<any>(`/lessons/${lessonId}`);
    return {
      ...res,
      id: res.lessonId,
      module_id: res.moduleId,
      order_index: res.sortOrder,
      content_body: res.contentHtml,
      media_url: res.materialUrl,
      content_type: 'TEXT',
      is_published: res.isPublished,
    };
  },

  async updateLesson(lessonId: string | number, data: Partial<Lesson>): Promise<Lesson> {
    const payload = {
      title: data.title,
      contentType: data.contentType || data.content_type,
      contentHtml: data.contentHtml ?? data.content_body,
      materialUrl: data.materialUrl ?? data.media_url,
      sortOrder: data.sortOrder ?? data.order_index,
      isPublished: data.isPublished !== undefined ? data.isPublished : data.is_published,
    };
    const res = await request<any>(`/lessons/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.lessonId,
      module_id: res.moduleId,
      order_index: res.sortOrder,
      content_body: res.contentHtml,
      media_url: res.materialUrl,
      is_published: res.isPublished,
    };
  },

  // Assignments & Submissions
  async getCourseAssignments(courseId: string | number): Promise<Assignment[]> {
    const res = await request<any[]>(`/courses/${courseId}/assignments`);
    return (res || []).map((a: any) => ({
      ...a,
      id: a.assignmentId,
      course_id: a.courseId,
      due_date: a.dueAt,
      max_score: a.maxScore,
      created_at: a.createdAt,
    }));
  },

  async createAssignment(courseId: string | number, data: {
    title: string;
    description?: string;
    due_date?: string;
    dueAt?: string;
    max_score?: number;
    maxScore?: number;
    allowLate?: boolean;
    status?: string;
  }): Promise<Assignment> {
    const payload = {
      title: data.title,
      description: data.description,
      dueAt: data.dueAt || data.due_date || new Date(Date.now() + 7 * 86400000).toISOString(),
      maxScore: data.maxScore !== undefined ? data.maxScore : (data.max_score !== undefined ? data.max_score : 10),
      allowLate: data.allowLate !== undefined ? data.allowLate : true,
      status: data.status || 'PUBLISHED',
    };
    const res = await request<any>(`/courses/${courseId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.assignmentId,
      course_id: res.courseId,
      due_date: res.dueAt,
      max_score: res.maxScore,
      created_at: res.createdAt,
    };
  },

  async updateAssignment(assignmentId: string | number, data: Partial<Assignment>): Promise<Assignment> {
    const res = await request<any>(`/assignments/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        dueAt: data.dueAt || data.due_date,
        maxScore: data.maxScore ?? data.max_score,
        allowLate: data.allowLate,
        status: data.status,
      }),
    });
    return {
      ...res,
      id: res.assignmentId,
      course_id: res.courseId,
      due_date: res.dueAt,
      max_score: res.maxScore,
      created_at: res.createdAt,
    };
  },

  async getAssignmentSubmissions(assignmentId: string | number): Promise<Submission[]> {
    const res = await request<any[]>(`/assignments/${assignmentId}/submissions`);
    return (res || []).map((s: any) => ({
      ...s,
      id: s.submissionId,
      assignment_id: s.assignmentId,
      student_id: s.studentId,
      student_name: s.studentName,
      student_email: s.studentEmail,
      submission_text: s.contentText,
      attachment_url: s.fileUrl,
      submitted_at: s.submittedAt,
    }));
  },

  async getMySubmission(assignmentId: string | number): Promise<Submission | null> {
    const res = await request<any | null>(`/assignments/${assignmentId}/my-submission`);
    if (!res) return null;
    return {
      ...res,
      id: res.submissionId,
      assignment_id: res.assignmentId,
      student_id: res.studentId,
      submission_text: res.contentText,
      attachment_url: res.fileUrl,
      submitted_at: res.submittedAt,
    };
  },

  async submitAssignment(assignmentId: string | number, textContent: string): Promise<Submission> {
    const payload = {
      contentText: textContent,
    };
    const res = await request<any>(`/assignments/${assignmentId}/submission`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.submissionId,
      assignment_id: res.assignmentId,
      student_id: res.studentId,
      submission_text: res.contentText,
      attachment_url: res.fileUrl,
      submitted_at: res.submittedAt,
    };
  },

  async gradeSubmission(submissionId: string | number, data: {
    score: number;
    feedback?: string;
  }): Promise<Submission> {
    // The endpoint returns the updated submission, not a Grade entity.
    const res = await request<any>(`/submissions/${submissionId}/grade`, {
      method: 'PUT',
      body: JSON.stringify({ score: data.score, feedback: data.feedback || '' }),
    });
    return {
      ...res,
      id: res.submissionId,
      assignment_id: res.assignmentId,
      student_id: res.studentId,
      submission_text: res.contentText,
      submitted_at: res.submittedAt,
    };
  },

  // Quizzes
  async getCourseQuizzes(courseId: string | number): Promise<Quiz[]> {
    const res = await request<any[]>(`/courses/${courseId}/quizzes`);
    return (res || []).map((q: any) => ({
      ...q,
      id: q.quizId,
      course_id: q.courseId,
      duration_minutes: q.timeLimitMinutes,
      max_score: Number(q.maxScore ?? 0),
      is_published: q.isPublished,
      created_at: q.createdAt,
    }));
  },

  async getQuiz(quizId: string | number): Promise<Quiz> {
    const res = await request<any>(`/quizzes/${quizId}`);
    return {
      ...res,
      id: res.quizId,
      course_id: res.courseId,
      duration_minutes: res.timeLimitMinutes,
      is_published: res.isPublished,
      created_at: res.createdAt,
      maxScore: Number(res.maxScore ?? 0),
      max_score: Number(res.maxScore ?? 0),
      questions: normalizeQuizQuestions(res.questions || []),
    };
  },

  async createQuiz(courseId: string | number, data: {
    title: string;
    description?: string;
    duration_minutes?: number;
    timeLimitMinutes?: number;
    passingScore?: number;
    is_published?: boolean;
    isPublished?: boolean;
  }): Promise<Quiz> {
    const now = new Date();
    const end = new Date(Date.now() + 30 * 86400000);
    const payload = {
      title: data.title,
      description: data.description,
      startAt: now.toISOString(),
      endAt: end.toISOString(),
      timeLimitMinutes: data.timeLimitMinutes || data.duration_minutes || 15,
      maxAttempts: 3,
      passingScore: data.passingScore ?? 5.0,
      isPublished: data.isPublished !== undefined ? data.isPublished : (data.is_published !== undefined ? data.is_published : true),
    };
    const res = await request<any>(`/courses/${courseId}/quizzes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.quizId,
      course_id: res.courseId,
      duration_minutes: res.timeLimitMinutes,
      is_published: res.isPublished,
      created_at: res.createdAt,
    };
  },

  async updateQuiz(quizId: string | number, data: Partial<Quiz>): Promise<Quiz> {
    const res = await request<any>(`/quizzes/${quizId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        timeLimitMinutes: data.timeLimitMinutes ?? data.duration_minutes,
        maxAttempts: data.maxAttempts,
        passingScore: data.passingScore,
        isPublished: data.isPublished ?? data.is_published,
      }),
    });
    return {
      ...res,
      id: res.quizId,
      course_id: res.courseId,
      duration_minutes: res.timeLimitMinutes,
      is_published: res.isPublished,
      maxScore: Number(res.maxScore ?? 0),
      max_score: Number(res.maxScore ?? 0),
      created_at: res.createdAt,
      questions: normalizeQuizQuestions(res.questions || []),
    };
  },

  async publishQuiz(quizId: string | number, isPublished: boolean): Promise<{ message: string }> {
    return request<{ message: string }>(`/quizzes/${quizId}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished }),
    });
  },

  async addQuizQuestion(quizId: string | number, data: {
    question_text?: string;
    questionText?: string;
    question_type?: string;
    questionType?: string;
    points?: number;
    score?: number;
    options?: Array<{ id: string | number; text: string }>;
    optionsJson?: string;
    correct_option_id?: string | number;
    correctAnswer?: string;
    sortOrder?: number;
  }): Promise<QuizQuestion> {
    const payload = {
      questionText: data.questionText || data.question_text || '',
      questionType: data.questionType || data.question_type || 'SINGLE_CHOICE',
      optionsJson: data.optionsJson || JSON.stringify(data.options || []),
      correctAnswer: String(data.correctAnswer || data.correct_option_id || 'A'),
      score: data.score !== undefined ? data.score : (data.points !== undefined ? data.points : 2.5),
      sortOrder: data.sortOrder || 1,
    };
    const res = await request<any>(`/quizzes/${quizId}/questions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...res,
      id: res.questionId,
      quiz_id: res.quizId,
      question_text: res.questionText,
      points: res.score,
    };
  },

  async updateQuizQuestion(questionId: string | number, data: Partial<QuizQuestion>): Promise<QuizQuestion> {
    const optionsJson = data.optionsJson ?? (data.options ? JSON.stringify(data.options) : undefined);
    const res = await request<any>(`/questions/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        questionText: data.questionText ?? data.question_text,
        questionType: data.questionType ?? data.question_type,
        optionsJson,
        correctAnswer: data.correctAnswer ?? data.correct_option_id,
        score: data.score ?? data.points,
        sortOrder: data.sortOrder,
      }),
    });
    return {
      ...res,
      id: res.questionId,
      quiz_id: res.quizId,
      question_text: res.questionText,
      question_type: res.questionType,
      points: Number(res.score),
      options: normalizeQuizQuestions([res])[0].options,
    };
  },

  async getQuizAttempts(quizId: string | number): Promise<QuizAttempt[]> {
    const res = await request<any[]>(`/quizzes/${quizId}/attempts`);
    return (res || []).map((attempt: any) => ({
      ...attempt,
      id: attempt.attemptId,
      quiz_id: attempt.quizId,
      student_id: attempt.studentId,
      started_at: attempt.startedAt,
      submitted_at: attempt.submittedAt,
      student_name: attempt.studentName,
      student_code: attempt.studentCode,
    }));
  },

  async startQuizAttempt(quizId: string | number): Promise<QuizAttemptStart> {
    const res = await request<any>(`/quizzes/${quizId}/attempts/start`, {
      method: 'POST',
    });
    return {
      ...res,
      maxScore: Number(res.maxScore ?? (res.questions || []).reduce((total: number, q: any) => total + Number(q.score || 0), 0)),
      questions: normalizeQuizQuestions(res.questions || []),
    };
  },

  async submitQuiz(attemptId: string, answers: Record<string | number, string | number>): Promise<QuizAttempt> {
    const formattedAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      formattedAnswers[String(k)] = String(v);
    }
    const res = await request<any>(`/quiz-attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers: formattedAnswers }),
    });
    return {
      ...res,
      id: res.attemptId,
      quiz_id: res.quizId,
      student_id: res.studentId,
      score: res.score,
      started_at: res.startedAt,
      submitted_at: res.submittedAt,
    };
  },

  // Grades
  async getMyGrades(courseId?: string | number): Promise<Grade[]> {
    if (courseId) {
      const res = await request<any[]>(`/courses/${courseId}/my-grades`);
      return (res || []).map((g: any) => ({
        ...g,
        id: g.gradeId,
        course_id: g.courseId,
        student_id: g.studentId,
        max_score: g.maxScore,
        graded_at: g.gradedAt,
      }));
    }
    // Return empty array or handle general
    return [];
  },

  async getCourseGradebook(courseId: string | number): Promise<Grade[]> {
    const res = await request<any[]>(`/courses/${courseId}/gradebook`);
    return (res || []).map((g: any) => ({
      ...g,
      id: g.gradeId,
      course_id: g.courseId,
      student_id: g.studentId,
      student_name: g.studentName,
      max_score: g.maxScore,
      graded_at: g.gradedAt,
    }));
  },

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    const res = await request<any[]>('/notifications');
    return (res || []).map((n: any) => ({
      ...n,
      id: n.notificationId,
      user_id: n.userId,
      is_read: n.isRead,
      link_url: n.relatedUrl,
      created_at: n.createdAt,
    }));
  },

  async markNotificationRead(id: string | number): Promise<{ message: string }> {
    return request<{ message: string }>(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  async markAllNotificationsRead(): Promise<{ message: string }> {
    return request<{ message: string }>('/notifications/read-all', {
      method: 'PATCH',
    });
  },

  // Student worklist: one server-side, enrollment-scoped read rather than an N+1 loop.
  async getStudentWorkload(): Promise<StudentWorkloadResponse> {
    return request<StudentWorkloadResponse>('/dashboard/student/workload');
  },

  // Role-scoped, persisted-data analytics. No fake or fallback API results.
  async getTeachingInsights(): Promise<TeachingInsights> {
    return request<TeachingInsights>('/analytics/teaching');
  },

  async getLearningInsights(): Promise<LearningInsights> {
    return request<LearningInsights>('/analytics/learning');
  },

  async getOperationsInsights(): Promise<OperationsInsights> {
    return request<OperationsInsights>('/analytics/operations');
  },

  // Dashboard
  async getDashboardStats(role?: string): Promise<DashboardStats> {
    const userRole = (role || 'STUDENT').toLowerCase();
    const endpoint = userRole === 'admin' ? '/dashboard/admin' : (userRole === 'lecturer' ? '/dashboard/lecturer' : '/dashboard/student');
    const res = await request<any>(endpoint);
    
    // Fetch notifications for widget
    let notifs: Notification[] = [];
    try {
      notifs = await this.getNotifications();
    } catch {}

    if (userRole === 'admin') {
      return {
        role: 'ADMIN',
        courses_count: res.totalCourses || 0,
        students_count: res.totalStudents || 0,
        lecturers_count: res.totalLecturers || 0,
        pending_submissions_count: 0,
        upcoming_assignments_count: 0,
        recent_notifications: notifs.slice(0, 5),
      };
    } else if (userRole === 'lecturer') {
      return {
        role: 'LECTURER',
        courses_count: res.totalCourses ?? 0,
        students_count: res.totalStudents ?? 0,
        pending_submissions_count: res.totalPendingSubmissions ?? res.pendingSubmissionsCount ?? 0,
        upcoming_assignments_count: 0,
        recent_notifications: notifs.slice(0, 5),
      };
    } else {
      return {
        role: 'STUDENT',
        courses_count: res.totalEnrolledCourses ?? res.enrolledCoursesCount ?? 0,
        pending_submissions_count: 0,
        upcoming_assignments_count: typeof res.upcomingAssignments === 'number' ? res.upcomingAssignments : (res.upcomingAssignments || []).length,
        quizzes_count: typeof res.availableQuizzes === 'number' ? res.availableQuizzes : (res.activeQuizzes || []).length,
        recent_notifications: notifs.slice(0, 5),
      };
    }
  },
};
