import { useEffect, useState } from 'react';
import { Award, BarChart3, CheckCircle2, TrendingUp, Users } from 'lucide-react';
import {
  getQuizAnalytics,
  type QuestionAnalyticsItem,
  type QuizAnalyticsResponse,
} from '../../api/learning';
import type { Quiz } from '../../types';
import { formatQuestionType } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Modal } from '../ui/Modal';
import { SkeletonCard, SkeletonTable } from '../ui/Skeleton';
import { getQuizErrorMessage, getQuizId } from './quizUtils';

export interface QuizAnalyticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz | null;
}

function QuizAnalyticsInner({
  onClose,
  quiz,
}: {
  onClose: () => void;
  quiz: Quiz;
}) {
  const quizId = getQuizId(quiz);
  const [analytics, setAnalytics] = useState<QuizAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getQuizAnalytics(quizId)
      .then((res) => {
        if (cancelled) return;
        setAnalytics(res);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getQuizErrorMessage(err, 'Không thể tải thống kê bài kiểm tra.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quizId, reloadNonce]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadNonce((n) => n + 1);
  };

  const questionColumns: DataTableColumn<QuestionAnalyticsItem>[] = [
    {
      key: 'questionText',
      header: 'Câu hỏi',
      render: (row) => (
        <div className="max-w-md space-y-1">
          <p className="line-clamp-2 text-sm font-medium text-[var(--lms-text)]">
            {row.questionText}
          </p>
          <Badge variant="neutral" size="sm">
            {formatQuestionType(row.questionType)}
          </Badge>
        </div>
      ),
    },
    {
      key: 'answeredCount',
      header: 'Lượt trả lời',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.answeredCount,
      render: (row) => (
        <span className="tabular-nums text-xs font-semibold text-[var(--lms-text)]">
          {row.answeredCount} ({row.correctCount} đúng)
        </span>
      ),
    },
    {
      key: 'accuracyPercent',
      header: 'Tỷ lệ đúng',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.accuracyPercent,
      render: (row) => {
        const pct = Math.max(0, Math.min(100, row.accuracyPercent));
        const barColor =
          pct >= 70
            ? 'bg-emerald-500'
            : pct >= 40
              ? 'bg-amber-500'
              : 'bg-red-500';
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--lms-surface-muted)]">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums w-12 text-right text-xs font-bold text-[var(--lms-text)]">
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      },
    },
    {
      key: 'averageAwardedScore',
      header: 'Điểm TB',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.averageAwardedScore,
      render: (row) => (
        <span className="tabular-nums text-xs font-semibold text-[var(--lms-text)]">
          {row.averageAwardedScore.toFixed(2)} / {row.maxScore}
        </span>
      ),
    },
  ];

  const statusBars = analytics
    ? [
        {
          label: 'Đã hoàn tất',
          count: analytics.submittedCount,
          color: '#10b981',
        },
        {
          label: 'Chờ chấm tự luận',
          count: analytics.pendingReviewCount,
          color: '#f59e0b',
        },
        {
          label: 'Hết giờ làm bài',
          count: analytics.expiredCount,
          color: '#ef4444',
        },
        {
          label: 'Đang làm',
          count: analytics.inProgressCount,
          color: '#3b82f6',
        },
      ]
    : [];

  const maxStatusCount = Math.max(
    1,
    ...statusBars.map((item) => item.count),
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Phân tích kết quả: ${quiz.title}`}
      subtitle={
        analytics
          ? `Thang điểm tối đa: ${analytics.maxScore} • Điểm đạt: ${analytics.passingScore}`
          : undefined
      }
      size="xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--lms-border)] bg-[var(--lms-surface)] px-4 py-2 text-sm font-medium text-[var(--lms-text)] hover:bg-[var(--lms-surface-muted)]"
        >
          Đóng
        </button>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <SkeletonTable rows={4} columns={4} />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={handleRetry} />
      ) : !analytics ? (
        <EmptyState title="Không có dữ liệu thống kê" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-3.5">
              <div className="flex items-center gap-2 text-xs text-[var(--lms-text-muted)]">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Tổng lượt làm bài</span>
              </div>
              <p className="tabular-nums mt-1.5 text-2xl font-bold text-[var(--lms-text)]">
                {analytics.totalAttempts}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-3.5">
              <div className="flex items-center gap-2 text-xs text-[var(--lms-text-muted)]">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Điểm trung bình</span>
              </div>
              <p className="tabular-nums mt-1.5 text-2xl font-bold text-[var(--lms-text)]">
                {analytics.averageScore != null
                  ? `${analytics.averageScore.toFixed(2)} / ${analytics.maxScore}`
                  : '--'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-3.5">
              <div className="flex items-center gap-2 text-xs text-[var(--lms-text-muted)]">
                <CheckCircle2 className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <span>Tỷ lệ đạt (&ge; {analytics.passingScore})</span>
              </div>
              <p className="tabular-nums mt-1.5 text-2xl font-bold text-[var(--lms-text)]">
                {analytics.passRatePercent.toFixed(1)}%
              </p>
            </div>

            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-3.5">
              <div className="flex items-center gap-2 text-xs text-[var(--lms-text-muted)]">
                <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Cao nhất / Thấp nhất</span>
              </div>
              <p className="tabular-nums mt-1.5 text-xl font-bold text-[var(--lms-text)]">
                {analytics.highestScore != null ? analytics.highestScore : '--'} /{' '}
                {analytics.lowestScore != null ? analytics.lowestScore : '--'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[var(--lms-text)]">
                  Phân bố trạng thái lượt làm bài
                </h3>
              </div>

              <svg
                viewBox="0 0 360 156"
                className="h-40 w-full"
                role="img"
                aria-labelledby="quiz-status-chart-title quiz-status-chart-desc"
              >
                <title id="quiz-status-chart-title">
                  Biểu đồ phân bố trạng thái lượt làm bài kiểm tra
                </title>
                <desc id="quiz-status-chart-desc">
                  {statusBars.map((b) => `${b.label}: ${b.count}`).join(', ')}
                </desc>
                {statusBars.map((item, idx) => {
                  const y = 14 + idx * 35;
                  const barWidth = Math.round((item.count / maxStatusCount) * 180);
                  return (
                    <g key={item.label}>
                      <text
                        x={0}
                        y={y + 14}
                        fill="var(--lms-text)"
                        fontSize="11"
                        fontWeight="600"
                      >
                        {item.label}
                      </text>
                      <rect
                        x={135}
                        y={y + 2}
                        width={180}
                        height={16}
                        rx={8}
                        fill="var(--lms-surface-muted)"
                      />
                      <rect
                        x={135}
                        y={y + 2}
                        width={Math.max(item.count > 0 ? 8 : 0, barWidth)}
                        height={16}
                        rx={8}
                        fill={item.color}
                      />
                      <text
                        x={324}
                        y={y + 14}
                        fill="var(--lms-text)"
                        fontSize="11"
                        fontWeight="700"
                      >
                        {item.count}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="rounded-xl border border-[var(--lms-border)] bg-[var(--lms-surface)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--lms-text)]">
                  Tỷ lệ đạt bài kiểm tra
                </h3>
                <span className="tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {analytics.passRatePercent.toFixed(1)}%
                </span>
              </div>

              <div className="flex flex-col items-center justify-center py-2">
                <svg
                  viewBox="0 0 220 120"
                  className="h-32 w-56"
                  role="img"
                  aria-label={`Tỷ lệ đạt ${analytics.passRatePercent.toFixed(1)}%`}
                >
                  <title>Biểu đồ tỷ lệ đạt</title>
                  <path
                    d="M 20 100 A 90 90 0 0 1 200 100"
                    fill="none"
                    stroke="var(--lms-surface-muted)"
                    strokeWidth="18"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 20 100 A 90 90 0 0 1 200 100"
                    fill="none"
                    stroke={analytics.passRatePercent >= 50 ? '#10b981' : '#f59e0b'}
                    strokeWidth="18"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.round((Math.max(0, Math.min(100, analytics.passRatePercent)) / 100) * 282.74)} 282.74`}
                  />
                  <text
                    x="110"
                    y="88"
                    textAnchor="middle"
                    fill="var(--lms-text)"
                    fontSize="24"
                    fontWeight="800"
                  >
                    {analytics.passRatePercent.toFixed(0)}%
                  </text>
                  <text
                    x="110"
                    y="108"
                    textAnchor="middle"
                    fill="var(--lms-text-muted)"
                    fontSize="11"
                  >
                    Đạt chuẩn &ge; {analytics.passingScore} điểm
                  </text>
                </svg>
              </div>
            </div>
          </div>

          <DataTable<QuestionAnalyticsItem>
            columns={questionColumns}
            data={analytics.questions}
            caption="Độ chính xác theo từng câu hỏi"
            getRowKey={(row) => row.questionId}
            emptyTitle="Chưa có dữ liệu từng câu hỏi"
            emptyDescription="Thống kê theo câu hỏi sẽ hiển thị sau khi có sinh viên nộp bài."
          />
        </div>
      )}
    </Modal>
  );
}

export function QuizAnalyticsPanel(props: QuizAnalyticsPanelProps) {
  if (!props.isOpen || !props.quiz) return null;
  return (
    <QuizAnalyticsInner
      key={getQuizId(props.quiz)}
      onClose={props.onClose}
      quiz={props.quiz}
    />
  );
}
