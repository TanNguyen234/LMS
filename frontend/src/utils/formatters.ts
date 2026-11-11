/**
 * Utility functions for localizing database key-values and enums into Vietnamese.
 */

export const formatRole = (role?: string): string => {
  switch (role?.toUpperCase()) {
    case 'ADMIN':
      return 'Quản trị viên';
    case 'LECTURER':
      return 'Giảng viên';
    case 'STUDENT':
      return 'Sinh viên';
    default:
      return role || 'Người dùng';
  }
};

export const formatCourseStatus = (status?: string): string => {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
      return 'Đang hoạt động';
    case 'DRAFT':
      return 'Bản nháp';
    case 'ARCHIVED':
      return 'Đã lưu trữ';
    default:
      return status || 'Chưa xác định';
  }
};

export const formatAssignmentStatus = (status?: string): string => {
  switch (status?.toUpperCase()) {
    case 'PUBLISHED':
      return 'Đã công bố';
    case 'DRAFT':
      return 'Bản nháp';
    case 'CLOSED':
      return 'Đã đóng hạn';
    default:
      return status || 'Bình thường';
  }
};

export const formatSubmissionStatus = (status?: string): string => {
  switch (status?.toUpperCase()) {
    case 'GRADED':
      return 'Đã chấm điểm';
    case 'SUBMITTED':
      return 'Đã nộp bài';
    case 'PENDING':
      return 'Chờ chấm điểm';
    case 'LATE':
      return 'Nộp muộn';
    case 'ON_TIME':
      return 'Đúng hạn';
    default:
      return status || 'Chưa nộp';
  }
};

export const formatMeetingStatus = (status?: string): string => {
  switch (status?.toUpperCase()) {
    case 'LIVE':
      return 'Đang diễn ra';
    case 'SCHEDULED':
      return 'Đã lên lịch';
    case 'ENDED':
      return 'Đã kết thúc';
    default:
      return status || 'Đã đóng';
  }
};

export const formatQuestionType = (type?: string): string => {
  switch (type?.toUpperCase()) {
    case 'SINGLE_CHOICE':
      return 'Trắc nghiệm 1 đáp án';
    case 'TRUE_FALSE':
      return 'Đúng / Sai';
    case 'SHORT_TEXT':
      return 'Tự luận ngắn';
    default:
      return type || 'Trắc nghiệm';
  }
};

export const formatSourceType = (type?: string): string => {
  switch (type?.toUpperCase()) {
    case 'ASSIGNMENT':
      return 'Bài tập';
    case 'QUIZ':
      return 'Bài trắc nghiệm';
    case 'MIDTERM':
      return 'Điểm giữa kỳ';
    case 'FINAL':
      return 'Điểm cuối kỳ';
    case 'MANUAL':
      return 'Điểm thủ công';
    default:
      return type || 'Đầu điểm';
  }
};

export const formatNotificationType = (type?: string): string => {
  switch (type?.toUpperCase()) {
    case 'ASSIGNMENT':
      return 'Bài tập';
    case 'QUIZ':
      return 'Trắc nghiệm';
    case 'GRADE':
      return 'Điểm số';
    case 'COURSE':
      return 'Khóa học';
    case 'SYSTEM':
      return 'Hệ thống';
    case 'MEETING':
      return 'Lớp trực tuyến';
    default:
      return type || 'Thông báo';
  }
};

export const formatEnrollmentStatus = (status?: string): string => {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
      return 'Đang học';
    case 'DROPPED':
      return 'Đã hủy';
    case 'COMPLETED':
      return 'Đã hoàn thành';
    default:
      return status || 'Đang ghi danh';
  }
};

export const formatContentType = (type?: string): string => {
  switch (type?.toUpperCase()) {
    case 'TEXT':
      return 'Bài đọc';
    case 'VIDEO':
      return 'Video bài giảng';
    case 'DOCUMENT':
      return 'Tài liệu';
    default:
      return type || 'Nội dung';
  }
};

export const formatUserStatus = (isActive?: boolean): string => {
  return isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa';
};

export const formatDateTimeVi = (dateString?: string | null): string => {
  if (!dateString) return 'Chưa cập nhật';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return dateString;
  }
};
