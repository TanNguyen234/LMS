import React from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Shield,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import type { UserRole } from '../../types';

export interface OnboardingGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'ADMIN' | 'LECTURER' | 'STUDENT';
}

interface GuideStep {
  title: string;
  description: string;
  routeHint: string;
  icon: React.ElementType;
}

interface RoleGuide {
  badgeLabel: string;
  badgeVariant: BadgeVariant;
  headline: string;
  intro: string;
  steps: GuideStep[];
}

const ROLE_GUIDES: Record<UserRole, RoleGuide> = {
  STUDENT: {
    badgeLabel: 'Sinh viên',
    badgeVariant: 'success',
    headline: 'Hướng dẫn học tập nhanh dành cho Sinh viên',
    intro: 'Thực hiện tuần tự các bước dưới đây để ghi danh môn học, theo dõi tiến độ và hoàn thành đánh giá.',
    steps: [
      {
        title: '1. Khám phá và tham gia khóa học',
        description: 'Mở danh mục Khóa học để xem lớp mở tự ghi danh hoặc nhập mã tham gia (JoinCode) do giảng viên cấp.',
        routeHint: 'Khóa học (/courses)',
        icon: BookOpen,
      },
      {
        title: '2. Học bài giảng và hỏi Trợ lý AI',
        description: 'Mở từng học phần để xem tài liệu PDF, video, slide và đánh dấu hoàn thành nhằm cập nhật thanh tiến độ. Dùng Trợ lý AI ngay trong bài học để tóm tắt nội dung.',
        routeHint: 'Chi tiết khóa học',
        icon: Sparkles,
      },
      {
        title: '3. Nộp bài tập và làm trắc nghiệm',
        description: 'Nộp tệp bài làm hoặc câu trả lời đúng hạn; hệ thống tự lưu nháp bài trắc nghiệm và tự nộp khi hết giờ.',
        routeHint: 'Bài tập (/assignments) & Trắc nghiệm (/quizzes)',
        icon: ClipboardCheck,
      },
      {
        title: '4. Theo dõi lịch học, bảng điểm và phòng học trực tuyến',
        description: 'Kiểm tra hạn nộp trên Lịch học, theo dõi điểm thành phần và GPA, hoặc tham gia lớp học trực tuyến kèm bảng trắng và thảo luận.',
        routeHint: 'Lịch học (/schedule), Bảng điểm (/grades), Phòng học (/classroom)',
        icon: Award,
      },
    ],
  },
  LECTURER: {
    badgeLabel: 'Giảng viên',
    badgeVariant: 'primary',
    headline: 'Hướng dẫn giảng dạy nhanh dành cho Giảng viên',
    intro: 'Quản trị lớp học phần, biên soạn học liệu đa phương tiện, chấm điểm và điều hành phòng học trực tuyến.',
    steps: [
      {
        title: '1. Thiết lập khóa học và mã tham gia',
        description: 'Cấu hình trạng thái lớp, bật/tắt tự ghi danh, tạo mã tham gia JoinCode và theo dõi danh sách sinh viên trong lớp.',
        routeHint: 'Khóa học (/courses)',
        icon: GraduationCap,
      },
      {
        title: '2. Biên soạn chương, bài giảng và tài liệu',
        description: 'Tạo Module, sắp xếp thứ tự bài giảng, tải lên tài liệu PDF/Video/Slide trực tiếp lên kho lưu trữ nội bộ.',
        routeHint: 'Chi tiết khóa học',
        icon: FileText,
      },
      {
        title: '3. Giao bài, chấm điểm và dùng AI hỗ trợ',
        description: 'Tạo bài tập kèm thang điểm, dùng công cụ tạo câu hỏi trắc nghiệm AI và gợi ý nhận xét bài nộp trong giao diện chấm song song.',
        routeHint: 'Bài tập (/assignments) & Trắc nghiệm (/quizzes)',
        icon: CheckCircle2,
      },
      {
        title: '4. Mở phòng học trực tuyến và điểm danh tự động',
        description: 'Bắt đầu buổi học trực tuyến, sử dụng bảng trắng đồng bộ, chat lớp học, giơ tay phát biểu và xuất nhật ký tham gia CSV.',
        routeHint: 'Phòng học trực tuyến (/classroom)',
        icon: Video,
      },
    ],
  },
  ADMIN: {
    badgeLabel: 'Quản trị viên',
    badgeVariant: 'info',
    headline: 'Hướng dẫn vận hành dành cho Quản trị viên',
    intro: 'Điều phối tài khoản toàn trường, kiểm soát danh mục khóa học và giám sát trạng thái hệ thống.',
    steps: [
      {
        title: '1. Giám sát tổng quan và trạng thái dịch vụ',
        description: 'Kiểm tra nhanh tình trạng kết nối cơ sở dữ liệu, số lượng người dùng hoạt động và phân bổ khóa học trên bảng điều hành.',
        routeHint: 'Tổng quan (/dashboard)',
        icon: Shield,
      },
      {
        title: '2. Quản lý tài khoản và nhập CSV hàng loạt',
        description: 'Tạo, chỉnh sửa vai trò, cấp mã SV/CB, đặt lại mật khẩu, khóa/mở khóa tài khoản hoặc nhập danh sách người dùng từ tệp CSV.',
        routeHint: 'Người dùng (/users)',
        icon: Users,
      },
      {
        title: '3. Điều phối khóa học và ghi danh',
        description: 'Quản lý học kỳ, tín chỉ, trạng thái lớp học phần, phân công giảng viên phụ trách và điều chỉnh danh sách ghi danh.',
        routeHint: 'Khóa học (/courses)',
        icon: Calendar,
      },
      {
        title: '4. Theo dõi lớp trực tuyến và thông báo hệ thống',
        description: 'Kiểm tra các phòng học đang hoạt động, xem nhật ký tham dự và rà soát thông báo toàn hệ thống.',
        routeHint: 'Phòng học (/classroom) & Thông báo (/notifications)',
        icon: Video,
      },
    ],
  },
};

export const OnboardingGuideModal: React.FC<OnboardingGuideModalProps> = ({ isOpen, onClose, role }) => {
  const guide = ROLE_GUIDES[role];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={guide.headline}
      subtitle={guide.intro}
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          Đã hiểu, bắt đầu làm việc
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--lms-text-muted)]">
            Vai trò hiện tại:
          </span>
          <Badge variant={guide.badgeVariant} size="sm">
            {guide.badgeLabel}
          </Badge>
        </div>

        <ol className="space-y-3">
          {guide.steps.map((step) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="flex items-start gap-3.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)]/40 p-4"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[var(--lms-text)]">{step.title}</h3>
                    <span className="rounded-md border border-[var(--lms-border)] bg-[var(--lms-surface)] px-2 py-0.5 text-xs font-medium text-[var(--lms-text-muted)]">
                      {step.routeHint}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--lms-text-muted)]">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Modal>
  );
};

export default OnboardingGuideModal;
