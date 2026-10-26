/** Presentation only. API enum values and persisted content remain unchanged. */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã giao',
  CLOSED: 'Đã đóng',
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  ARCHIVED: 'Đã lưu trữ',
  DROPPED: 'Đã rút ghi danh',
  IN_PROGRESS: 'Đang làm',
  SUBMITTED: 'Đã nộp',
  GRADED: 'Đã chấm',
  LATE: 'Nộp muộn',
  EXPIRED: 'Đã hết hạn',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
};

export function statusLabel(value?: string | null): string {
  return value && Object.hasOwn(STATUS_LABELS, value) ? STATUS_LABELS[value] : 'Chưa xác định';
}

export function roleLabel(role?: string): string {
  switch (role) {
    case 'ADMIN': return 'Quản trị viên';
    case 'LECTURER': return 'Giảng viên';
    case 'STUDENT': return 'Sinh viên';
    default: return 'Chưa xác định';
  }
}

export function dashboardActions(role?: string): Array<{ path: string; label: string }> {
  if (role === 'ADMIN') return [
    { path: '/users', label: 'Quản lý người dùng' },
    { path: '/courses', label: 'Quản lý khóa học' },
    { path: '/notifications', label: 'Xem thông báo' },
  ];
  if (role !== 'LECTURER' && role !== 'STUDENT') return [];
  return [
    { path: '/assignments', label: role === 'LECTURER' ? 'Chấm điểm bài nộp sinh viên' : 'Xem danh sách bài tập' },
    { path: '/quizzes', label: role === 'LECTURER' ? 'Tạo câu hỏi trắc nghiệm' : 'Làm bài kiểm tra' },
    { path: '/grades', label: role === 'LECTURER' ? 'Sổ điểm lớp học phần' : 'Xem bảng điểm cá nhân' },
  ];
}

export function formatScore(value?: number | null, digits = 0): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, 2),
  });
}

const ERROR_LABELS: Record<string, string> = {
  'Incorrect email or password': 'Địa chỉ thư điện tử hoặc mật khẩu không chính xác.',
  'Invalid or expired token': 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
  'Account is inactive': 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
  'Account has been deactivated. Please contact administrator.': 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
  'Student is not actively enrolled in this course': 'Sinh viên chưa được ghi danh hoặc đã ngừng học khóa này.',
  'Lecturer is not assigned to this course': 'Giảng viên chưa được phân công phụ trách khóa học này.',
  'Course is not active': 'Khóa học đã ngừng hoạt động.',
  'Text submission content is required': 'Vui lòng nhập nội dung bài nộp.',
  'Assignment deadline has passed and late submissions are not allowed': 'Đã hết hạn nộp bài và bài tập không cho phép nộp muộn.',
  'Cannot modify a submission that has already been graded': 'Bài nộp đã được chấm nên không thể chỉnh sửa.',
  'Cannot publish an assignment in an inactive course': 'Không thể giao bài tập trong khóa học đã ngừng hoạt động.',
  'MaxScore cannot change after grading has started': 'Không thể thay đổi điểm tối đa sau khi đã bắt đầu chấm bài.',
  'Assignment not found or not published': 'Không tìm thấy bài tập hoặc bài tập chưa được giao.',
};

export function apiErrorMessageVi(status: number, detail = ''): string {
  if (status >= 500) return 'Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại sau.';
  if (Object.hasOwn(ERROR_LABELS, detail)) return ERROR_LABELS[detail];
  if (/Access denied|not authorized|do not own|Requires role/.test(detail)) return 'Bạn không có quyền thực hiện thao tác này.';
  // Already-localized server explanations stay intact; never translate saved user content.
  if (/[À-ỹĐđ]/u.test(detail)) return detail;
  switch (status) {
    case 0: return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.';
    case 401: return 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.';
    case 403: return 'Bạn không có quyền thực hiện thao tác này.';
    case 404: return 'Không tìm thấy nội dung yêu cầu. Vui lòng tải lại danh sách.';
    case 409: return 'Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng tải lại và kiểm tra trước khi lưu.';
    case 422: return 'Thông tin nhập chưa hợp lệ. Vui lòng kiểm tra các trường bắt buộc và định dạng dữ liệu.';
    case 429: return 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ một lúc rồi thử lại.';
    default: return 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra thông tin và thử lại.';
  }
}
