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
  Grade,
  Notification,
  DashboardStats,
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

export const api = {
  // Auth
  async login(formData: FormData): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: formData,
    });
  },

  async getMe(): Promise<User> {
    return request<User>('/auth/me');
  },

  // Users (Admin)
  async getUsers(role?: string, activeOnly = false): Promise<User[]> {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (activeOnly) params.set('active_only', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<User[]>(`/users${query}`);
  },

  async createUser(userData: {
    username: string;
    email: string;
    full_name: string;
    role: string;
    password?: string;
  }): Promise<User> {
    return request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async toggleUserStatus(userId: number): Promise<User> {
    return request<User>(`/users/${userId}/status`, {
      method: 'PATCH',
    });
  },

  // Courses
  async getCourses(status?: string, lecturerId?: number): Promise<Course[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (lecturerId) params.set('lecturer_id', lecturerId.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<Course[]>(`/courses${query}`);
  },

  async getCourse(courseId: number): Promise<Course> {
    return request<Course>(`/courses/${courseId}`);
  },

  async createCourse(courseData: {
    code: string;
    title: string;
    description?: string;
    credits: number;
    lecturer_id: number;
  }): Promise<Course> {
    return request<Course>('/courses', {
      method: 'POST',
      body: JSON.stringify(courseData),
    });
  },

  async updateCourse(courseId: number, courseData: Partial<Course>): Promise<Course> {
    return request<Course>(`/courses/${courseId}`, {
      method: 'PUT',
      body: JSON.stringify(courseData),
    });
  },

  async deleteCourse(courseId: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/courses/${courseId}`, {
      method: 'DELETE',
    });
  },

  // Enrollments
  async getCourseEnrollments(courseId: number): Promise<Enrollment[]> {
    return request<Enrollment[]>(`/courses/${courseId}/enrollments`);
  },

  async enrollStudent(courseId: number, studentId: number): Promise<Enrollment> {
    return request<Enrollment>(`/courses/${courseId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    });
  },

  async updateEnrollmentStatus(courseId: number, enrollmentId: number, status: string): Promise<Enrollment> {
    return request<Enrollment>(`/courses/${courseId}/enrollments/${enrollmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Content (Modules & Lessons)
  async getCourseModules(courseId: number): Promise<Module[]> {
    return request<Module[]>(`/courses/${courseId}/modules`);
  },

  async createModule(courseId: number, data: { title: string; description?: string; order_index?: number }): Promise<Module> {
    return request<Module>(`/courses/${courseId}/modules`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createLesson(moduleId: number, data: {
    title: string;
    content_type?: string;
    content_body?: string;
    media_url?: string;
    order_index?: number;
    is_published?: boolean;
  }): Promise<Lesson> {
    return request<Lesson>(`/modules/${moduleId}/lessons`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getLesson(lessonId: number): Promise<Lesson> {
    return request<Lesson>(`/lessons/${lessonId}`);
  },

  async updateLesson(lessonId: number, data: Partial<Lesson>): Promise<Lesson> {
    return request<Lesson>(`/lessons/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async uploadLessonAttachment(lessonId: number, file: File): Promise<{ attachment_url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ attachment_url: string }>(`/lessons/${lessonId}/attachment`, {
      method: 'POST',
      body: formData,
    });
  },

  // Assignments & Submissions
  async getCourseAssignments(courseId: number): Promise<Assignment[]> {
    return request<Assignment[]>(`/courses/${courseId}/assignments`);
  },

  async createAssignment(courseId: number, data: {
    title: string;
    description?: string;
    due_date: string;
    max_score: number;
  }): Promise<Assignment> {
    return request<Assignment>(`/courses/${courseId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAssignmentSubmissions(assignmentId: number): Promise<Submission[]> {
    return request<Submission[]>(`/assignments/${assignmentId}/submissions`);
  },

  async submitAssignment(assignmentId: number, textContent: string, file?: File): Promise<Submission> {
    const formData = new FormData();
    formData.append('submission_text', textContent);
    if (file) {
      formData.append('file', file);
    }
    return request<Submission>(`/assignments/${assignmentId}/submit`, {
      method: 'POST',
      body: formData,
    });
  },

  async gradeSubmission(submissionId: number, data: {
    score: number;
    feedback?: string;
    weight_percent?: number;
  }): Promise<Grade> {
    return request<Grade>(`/submissions/${submissionId}/grade`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Quizzes
  async getCourseQuizzes(courseId: number): Promise<Quiz[]> {
    return request<Quiz[]>(`/courses/${courseId}/quizzes`);
  },

  async getQuiz(quizId: number): Promise<Quiz> {
    return request<Quiz>(`/quizzes/${quizId}`);
  },

  async createQuiz(courseId: number, data: {
    title: string;
    description?: string;
    duration_minutes: number;
    max_score: number;
    is_published?: boolean;
  }): Promise<Quiz> {
    return request<Quiz>(`/courses/${courseId}/quizzes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async addQuizQuestion(quizId: number, data: {
    question_text: string;
    question_type: string;
    points: number;
    options: Array<{ id: string | number; text: string }>;
    correct_option_id: string | number;
  }): Promise<QuizQuestion> {
    return request<QuizQuestion>(`/quizzes/${quizId}/questions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async submitQuiz(quizId: number, answers: Record<string | number, string | number>): Promise<QuizAttempt> {
    return request<QuizAttempt>(`/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  },

  // Grades
  async getMyGrades(): Promise<Grade[]> {
    return request<Grade[]>('/grades/my');
  },

  async getCourseGradebook(courseId: number): Promise<Grade[]> {
    return request<Grade[]>(`/courses/${courseId}/gradebook`);
  },

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    return request<Notification[]>('/notifications');
  },

  async markNotificationRead(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  async markAllNotificationsRead(): Promise<{ message: string }> {
    return request<{ message: string }>('/notifications/read-all', {
      method: 'POST',
    });
  },

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    return request<DashboardStats>('/dashboard/stats');
  },
};
