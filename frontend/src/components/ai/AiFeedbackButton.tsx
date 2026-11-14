import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { suggestGradingFeedback, type AiProviderMode } from '../../api/ai';
import { ApiError } from '../../api/http';
import { Badge } from '../ui/Badge';

export interface AiFeedbackButtonProps {
  submissionId: string;
  score?: number;
  onSuggest: (text: string) => void;
}

export function AiFeedbackButton(props: AiFeedbackButtonProps) {
  return <AiFeedbackButtonInner key={props.submissionId} {...props} />;
}

function AiFeedbackButtonInner({ submissionId, score, onSuggest }: AiFeedbackButtonProps) {
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [providerMode, setProviderMode] = useState<AiProviderMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleClick = async () => {
    if (!submissionId || loading) return;
    setError(null);
    setLoading(true);
    const seq = ++requestSeqRef.current;

    try {
      const normalizedScore =
        typeof score === 'number' && Number.isFinite(score) && score >= 0 ? score : undefined;
      const res = await suggestGradingFeedback({
        submissionId,
        score: normalizedScore,
      });
      if (mountedRef.current && requestSeqRef.current === seq) {
        setProviderMode(res.providerMode);
        onSuggest(res.suggestedFeedback);
      }
    } catch (err) {
      if (mountedRef.current && requestSeqRef.current === seq) {
        const message =
          err instanceof ApiError
            ? err.detail
            : 'Không thể tạo gợi ý nhận xét. Vui lòng thử lại.';
        setError(message);
      }
    } finally {
      if (mountedRef.current && requestSeqRef.current === seq) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleClick()}
          disabled={loading || !submissionId}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-blue-200 dark:hover:bg-blue-900/50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{loading ? 'Đang tạo gợi ý...' : 'AI Gợi ý nhận xét'}</span>
        </button>

        {providerMode && (
          <span aria-live="polite">
            <Badge variant={providerMode === 'GEMINI' ? 'primary' : 'info'} dot>
              {providerMode === 'GEMINI' ? 'Gemini AI' : 'Xử lý cục bộ'}
            </Badge>
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default AiFeedbackButton;
