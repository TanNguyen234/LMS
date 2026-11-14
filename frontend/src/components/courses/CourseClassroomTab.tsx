import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Play, Plus, Users, Video } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/http';
import { getCourseMeetings, startMeeting } from '../../api/realtime';
import type { Course, Meeting } from '../../types';
import { formatDateTimeVi } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { useConfirm } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { SkeletonCard } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

export interface CourseClassroomTabProps {
  course: Course;
  canManage: boolean;
}

export const CourseClassroomTab: React.FC<CourseClassroomTabProps> = ({
  course,
  canManage,
}) => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [starting, setStarting] = useState(false);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getCourseMeetings(course.courseId);
      setMeetings(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách buổi học trực tuyến.');
    } finally {
      setLoading(false);
    }
  }, [course.courseId]);

  useEffect(() => {
    let active = true;
    getCourseMeetings(course.courseId)
      .then((list) => {
        if (active) setMeetings(list);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Không thể tải danh sách buổi học trực tuyến.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course.courseId]);

  const handleStartMeeting = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = meetingTitle.trim() || `Buổi học ${course.courseCode}`;
    setStarting(true);

    try {
      await startMeeting({
        courseId: course.courseId,
        title: trimmed,
      });
      toast.success('Đã mở phòng học trực tuyến.');
      setCreateOpen(false);
      navigate(`/classroom?courseId=${encodeURIComponent(course.courseId)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const replace = await confirm({
          title: 'Đã có buổi học đang diễn ra',
          message:
            'Khóa học hiện có một phòng học đang mở. Bạn có muốn kết thúc phòng cũ và tạo buổi học mới không?',
          confirmText: 'Thay thế phòng hiện tại',
          variant: 'primary',
        });
        if (replace) {
          try {
            await startMeeting({
              courseId: course.courseId,
              title: trimmed,
              replaceActive: true,
            });
            toast.success('Đã mở phòng học trực tuyến mới.');
            setCreateOpen(false);
            navigate(`/classroom?courseId=${encodeURIComponent(course.courseId)}`);
            return;
          } catch (retryErr) {
            toast.error(
              retryErr instanceof Error ? retryErr.message : 'Không thể thay thế phòng học.',
            );
          }
        }
      } else {
        toast.error(err instanceof Error ? err.message : 'Không thể mở phòng học trực tuyến.');
      }
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return <SkeletonCard />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={loadMeetings} />;
  }

  const liveMeeting = meetings.find((m) => m.status === 'LIVE');

  return (
    <div className="space-y-5">
      <div className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--lms-text)]">
              Phòng học & Thảo luận trực tuyến
            </h2>
            {liveMeeting && (
              <Badge variant="success" size="sm" dot>
                Đang LIVE
              </Badge>
            )}
          </div>
          <p className="text-sm text-[var(--lms-text-muted)]">
            {liveMeeting
              ? `Buổi học "${liveMeeting.title}" đang mở với mã phòng ${liveMeeting.roomCode}.`
              : 'Tham gia lớp học trực tuyến với bảng trắng cộng tác, giơ tay phát biểu và chat theo thời gian thực.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setMeetingTitle(`Buổi học trực tuyến — ${course.courseCode}`);
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface-muted)] text-sm font-semibold text-[var(--lms-text)] hover:border-[var(--color-primary)] transition cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Mở buổi học mới
            </button>
          )}
          <Link
            to={`/classroom?courseId=${encodeURIComponent(course.courseId)}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 transition"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            {liveMeeting ? 'Tham gia ngay' : 'Mở phòng học'}
          </Link>
        </div>
      </div>

      <section className="bg-[var(--lms-surface)] border border-[var(--lms-border)] rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[var(--lms-text)] mb-4">
          Lịch sử buổi học ({meetings.length})
        </h3>

        {meetings.length === 0 ? (
          <EmptyState
            icon={<Video className="w-6 h-6" />}
            title="Chưa có buổi học nào được tổ chức"
            description={
              canManage
                ? 'Nhấn "Mở buổi học mới" để bắt đầu phiên giảng dạy trực tuyến đầu tiên.'
                : 'Giảng viên chưa tổ chức buổi học trực tuyến nào cho học phần này.'
            }
          />
        ) : (
          <div className="divide-y divide-[var(--lms-border)]">
            {meetings.map((meeting) => (
              <div
                key={meeting.meetingId}
                className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge
                      variant={meeting.status === 'LIVE' ? 'success' : 'neutral'}
                      size="sm"
                      dot={meeting.status === 'LIVE'}
                    >
                      {meeting.status === 'LIVE' ? 'Đang diễn ra' : 'Đã kết thúc'}
                    </Badge>
                    <span className="text-xs font-mono text-[var(--lms-text-muted)]">
                      Phòng: {meeting.roomCode}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[var(--lms-text)] truncate">
                    {meeting.title}
                  </div>
                  <div className="text-xs text-[var(--lms-text-muted)] mt-0.5 flex flex-wrap items-center gap-3 tabular-nums">
                    <span>Bắt đầu: {formatDateTimeVi(meeting.startedAt)}</span>
                    {meeting.endedAt && <span>Kết thúc: {formatDateTimeVi(meeting.endedAt)}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      {meeting.participantCount} lượt tham gia
                    </span>
                  </div>
                </div>

                {meeting.status === 'LIVE' && (
                  <Link
                    to={`/classroom?courseId=${encodeURIComponent(course.courseId)}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    Vào phòng
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Bắt đầu buổi học trực tuyến"
        subtitle={`${course.courseCode} — ${course.title}`}
        size="sm"
      >
        <form onSubmit={handleStartMeeting} className="space-y-4">
          <div>
            <label
              htmlFor="classroom-meeting-title"
              className="block text-sm font-medium text-[var(--lms-text)] mb-1"
            >
              Chủ đề buổi học
            </label>
            <input
              id="classroom-meeting-title"
              type="text"
              required
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] text-sm text-[var(--lms-text)]"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--lms-border)] text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={starting}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {starting ? 'Đang khởi tạo...' : 'Mở phòng học'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
