/**
 * Utility functions for localizing database key-values, enums, grades, and dates into Vietnamese.
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
    case 'PENDING_REVIEW':
      return 'Chờ giảng viên chấm';
    case 'EXPIRED':
      return 'Hết giờ làm bài';
    case 'IN_PROGRESS':
      return 'Đang làm bài';
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
    case 'PDF':
      return 'Tài liệu PDF';
    case 'VIDEO':
      return 'Video bài giảng';
    case 'SLIDE':
      return 'Slide bài giảng';
    case 'DOCUMENT':
      return 'Tài liệu';
    default:
      return type || 'Nội dung';
  }
};

export const formatScoreVisibility = (visibility?: string): string => {
  switch (visibility?.toUpperCase()) {
    case 'SCORE_ONLY':
      return 'Chỉ hiện điểm';
    case 'AFTER_ATTEMPT':
      return 'Xem đáp án ngay sau khi nộp';
    case 'AFTER_CLOSE':
      return 'Xem đáp án sau khi đóng bài';
    default:
      return visibility || 'Xem đáp án sau khi đóng bài';
  }
};

export const formatUserStatus = (isActive?: boolean): string => {
  return isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa';
};

export const formatDateTimeVi = (dateString?: string | null): string => {
  if (!dateString) return 'Chưa cập nhật';
  try {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export const formatFileSize = (bytes?: number | null): string => {
  if (bytes == null || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const formatDurationSeconds = (seconds?: number | null): string => {
  if (seconds == null || seconds <= 0) return '0 phút';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs} giờ ${mins} phút`;
  if (mins > 0) return `${mins} phút ${secs} giây`;
  return `${secs} giây`;
};

export interface GpaConversionResult {
  gpa4: number;
  letterGrade: string;
  passed: boolean;
}

export const convertScore10ToGpa4 = (score10: number): GpaConversionResult => {
  if (score10 >= 8.5) return { gpa4: 4.0, letterGrade: 'A', passed: true };
  if (score10 >= 8.0) return { gpa4: 3.5, letterGrade: 'B+', passed: true };
  if (score10 >= 7.0) return { gpa4: 3.0, letterGrade: 'B', passed: true };
  if (score10 >= 6.5) return { gpa4: 2.5, letterGrade: 'C+', passed: true };
  if (score10 >= 5.5) return { gpa4: 2.0, letterGrade: 'C', passed: true };
  if (score10 >= 5.0) return { gpa4: 1.5, letterGrade: 'D+', passed: true };
  if (score10 >= 4.0) return { gpa4: 1.0, letterGrade: 'D', passed: true };
  return { gpa4: 0.0, letterGrade: 'F', passed: false };
};
