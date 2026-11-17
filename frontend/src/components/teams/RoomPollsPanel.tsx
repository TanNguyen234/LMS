import React, { useState } from 'react';
import { BarChart2, CheckCircle2, Lock, Plus, Trash2 } from 'lucide-react';

export interface RoomPoll {
  pollId: string;
  question: string;
  options: string[];
  counts: number[];
  totalVotes: number;
  isOpen: boolean;
  createdByName: string;
}

export interface RoomPollsPanelProps {
  poll: RoomPoll | null;
  canManage: boolean;
  myVoteIndex: number | null;
  onCreatePoll: (question: string, options: string[]) => void;
  onVote: (pollId: string, optionIndex: number) => void;
  onClosePoll: (pollId: string) => void;
}

export const RoomPollsPanel: React.FC<RoomPollsPanelProps> = ({
  poll,
  canManage,
  myVoteIndex,
  onCreatePoll,
  onVote,
  onClosePoll,
}) => {
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['Đã hiểu rõ', 'Cần giảng thêm']);

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!q || cleaned.length < 2) return;
    onCreatePoll(q, cleaned);
    setQuestion('');
    setOptions(['Đã hiểu rõ', 'Cần giảng thêm']);
    setCreating(false);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4 text-xs text-slate-200">
      {poll ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  poll.isOpen
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {poll.isOpen ? 'Đang mở bình chọn' : 'Đã đóng'}
              </span>
              <h4 className="mt-1.5 text-sm font-bold text-white leading-snug">
                {poll.question}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tạo bởi {poll.createdByName} · {poll.totalVotes} lượt chọn
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {poll.options.map((opt, idx) => {
              const count = poll.counts[idx] ?? 0;
              const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
              const selected = myVoteIndex === idx;
              return (
                <button
                  key={`${poll.pollId}-${idx}`}
                  type="button"
                  disabled={!poll.isOpen}
                  onClick={() => onVote(poll.pollId, idx)}
                  className={`relative w-full overflow-hidden rounded-lg border p-2.5 text-left transition ${
                    selected
                      ? 'border-indigo-500 bg-indigo-600/20'
                      : 'border-slate-700 bg-slate-900/80 hover:border-slate-500'
                  } ${poll.isOpen ? 'cursor-pointer' : 'cursor-default opacity-85'}`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-500/20 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative z-10 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-slate-100">
                      {selected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                      {opt}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-300">
                      {count} ({pct}%)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {canManage && poll.isOpen && (
            <button
              type="button"
              onClick={() => onClosePoll(poll.pollId)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 font-semibold text-red-300 hover:bg-red-500/25 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Đóng bình chọn này
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-5 text-center space-y-2">
          <BarChart2 className="w-6 h-6 text-indigo-400 mx-auto" />
          <p className="font-semibold text-slate-200">Chưa có bình chọn trực tiếp nào</p>
          <p className="text-[11px] text-slate-400">
            {canManage
              ? 'Tạo câu hỏi nhanh để kiểm tra mức độ hiểu bài hoặc điểm danh tức thời.'
              : 'Khi giảng viên mở bình chọn, phiếu chọn sẽ hiển thị ngay tại đây.'}
          </p>
        </div>
      )}

      {canManage && !creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {poll ? 'Tạo bình chọn mới' : 'Mở bình chọn nhanh'}
        </button>
      )}

      {canManage && creating && (
        <form
          onSubmit={handleSubmitCreate}
          className="rounded-xl border border-slate-700 bg-slate-800/80 p-3.5 space-y-2.5"
        >
          <label className="block font-semibold text-slate-200">Câu hỏi bình chọn</label>
          <input
            type="text"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ví dụ: Lớp có muốn giải lao 5 phút không?"
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-2 text-white placeholder:text-slate-500"
          />

          <div className="space-y-1.5">
            <span className="block font-semibold text-slate-300">Các lựa chọn</span>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  required
                  value={opt}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  placeholder={`Lựa chọn ${idx + 1}`}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-white"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Xóa lựa chọn"
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-red-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ''])}
                className="text-[11px] font-medium text-indigo-400 hover:underline cursor-pointer"
              >
                + Thêm lựa chọn
              </button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Phát bình chọn
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
