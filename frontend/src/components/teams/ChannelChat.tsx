import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, User, Shield, GraduationCap, Clock } from 'lucide-react';
import { api } from '../../api/client';
import type { CourseMessage } from '../../types';
import { formatDateTimeVi, formatRole } from '../../utils/formatters';

interface ChannelChatProps {
  courseId: string;
  courseTitle?: string;
}

export const ChannelChat: React.FC<ChannelChatProps> = ({ courseId, courseTitle }) => {
  const [messages, setMessages] = useState<CourseMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = async () => {
    try {
      const data = await api.getCourseMessages(courseId);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load course messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000); // Polling every 3s
    return () => clearInterval(interval);
  }, [courseId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const created = await api.postCourseMessage(courseId, newMessage.trim());
      setMessages((prev) => [...prev, created]);
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (isoString: string) => {
    return formatDateTimeVi(isoString);
  };

  const getRoleBadge = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
            <Shield className="w-3 h-3" /> {formatRole('ADMIN')}
          </span>
        );
      case 'LECTURER':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
            <GraduationCap className="w-3 h-3" /> {formatRole('LECTURER')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
            <User className="w-3 h-3" /> {formatRole('STUDENT')}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
            #
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Kênh thảo luận chung của lớp</h3>
            <p className="text-xs text-slate-500">{courseTitle || 'Trao đổi & hỏi đáp môn học'}</p>
          </div>
        </div>
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Tự động cập nhật
        </span>
      </div>

      {/* Message List */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
            Đang tải tin nhắn...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-slate-400">
            <MessageSquare className="w-12 h-12 text-slate-300 mb-2" />
            <p className="font-medium text-slate-600">Chưa có tin nhắn nào trong kênh này</p>
            <p className="text-xs text-slate-400 mt-1">Hãy gửi tin nhắn đầu tiên để bắt đầu thảo luận với lớp học!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.messageId} className="flex items-start gap-3 group hover:bg-slate-50/70 p-2.5 rounded-lg transition-colors">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-semibold text-sm shadow-sm flex-shrink-0">
                {msg.senderName ? msg.senderName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-slate-900 text-sm">{msg.senderName}</span>
                  {getRoleBadge(msg.senderRole)}
                  <span className="text-xs text-slate-400">{formatTime(msg.createdAt)}</span>
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Nhập tin nhắn thảo luận (Enter để gửi)..."
          className="flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Send className="w-4 h-4" />
          <span>Gửi</span>
        </button>
      </form>
    </div>
  );
};
