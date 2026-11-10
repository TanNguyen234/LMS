import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Search,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Power,
  BookOpen,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Paperclip,
  FileText,
  Download,
  X,
  Undo2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useToast } from '../components/common/Toast';
import type { ChatContact, ChatMessage } from '../types';

interface StagedAttachment {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export const MessagesPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [lecturerChatEnabled, setLecturerChatEnabled] = useState(true);

  // Attachment state
  const [stagedAttachment, setStagedAttachment] = useState<StagedAttachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Time formatting helpers with UTC awareness
  const formatMessageTime = (dateStr: string) => {
    if (!dateStr) return '';
    const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
    const d = new Date(normalized);
    return isNaN(d.getTime())
      ? ''
      : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageDateKey = (dateStr: string) => {
    if (!dateStr) return '';
    const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? '' : d.toDateString();
  };

  const formatMessageDateHeader = (dateStr: string) => {
    if (!dateStr) return '';
    const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return 'Hôm nay';
    }
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Hôm qua';
    }
    return d.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageFile = (url?: string | null, type?: string | null) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].some((ext) => lower.endsWith(ext))) {
      return true;
    }
    return Boolean(type && type.startsWith('image/'));
  };

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, stagedAttachment]);

  // Load contacts
  const fetchContacts = async () => {
    try {
      setLoadingContacts(true);
      const data = await api.getChatContacts();
      setContacts(data);
      if (user?.role === 'LECTURER' && user.isChatEnabled !== undefined) {
        setLecturerChatEnabled(Boolean(user.isChatEnabled));
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Không thể tải danh sách liên hệ: ' + (err.message || ''));
    } finally {
      setLoadingContacts(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [user]);

  // Load conversation thread when selecting contact
  const loadMessages = async (contact: ChatContact) => {
    setSelectedContact(contact);
    setStagedAttachment(null);
    try {
      setLoadingMessages(true);
      const history = await api.getChatHistory(contact.userId);
      setMessages(history);
      // Mark as read locally in contact list
      setContacts((prev) =>
        prev.map((c) => (c.userId === contact.userId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err: any) {
      toast.error('Không thể tải tin nhắn: ' + (err.message || ''));
    } finally {
      setLoadingMessages(false);
    }
  };

  // WebSocket Setup for Real-time delivery
  useEffect(() => {
    if (!user?.id) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8000/api/chat/ws/${user.id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        // 1. New Message Event
        if (payload.type === 'NEW_MESSAGE' && payload.data) {
          const newMsg: ChatMessage = {
            messageId: payload.data.messageId,
            senderId: payload.data.senderId,
            receiverId: payload.data.receiverId,
            content: payload.data.content,
            createdAt: payload.data.createdAt,
            isRead: payload.data.isRead,
            isRecalled: payload.data.isRecalled || false,
            attachmentUrl: payload.data.attachmentUrl,
            attachmentName: payload.data.attachmentName,
            attachmentType: payload.data.attachmentType,
            attachmentSize: payload.data.attachmentSize,
            senderName: payload.data.senderName,
          };

          // If current open chat is with sender or receiver
          setSelectedContact((currentContact) => {
            if (
              currentContact &&
              (currentContact.userId === newMsg.senderId || currentContact.userId === newMsg.receiverId)
            ) {
              setMessages((prev) => {
                if (prev.some((m) => m.messageId === newMsg.messageId)) return prev;
                return [...prev, newMsg];
              });
            } else if (newMsg.senderId !== user.id) {
              // Increment unread count for that contact
              setContacts((prev) =>
                prev.map((c) =>
                  c.userId === newMsg.senderId ? { ...c, unreadCount: c.unreadCount + 1 } : c
                )
              );
            }
            return currentContact;
          });
        }

        // 2. Message Recalled Event
        if (payload.type === 'MESSAGE_RECALLED' && payload.data) {
          const { messageId } = payload.data;
          setMessages((prev) =>
            prev.map((m) =>
              m.messageId === messageId
                ? {
                    ...m,
                    isRecalled: true,
                    content: null,
                    attachmentUrl: null,
                    attachmentName: null,
                  }
                : m
            )
          );
        }
      } catch {
        // Ignored
      }
    };

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [user]);

  // Handle file attachment selection & immediate upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('Kích thước tệp không được vượt quá 50 MB.');
      return;
    }

    try {
      setUploadingAttachment(true);
      const res = await api.uploadFile(file);
      setStagedAttachment({
        fileUrl: res.fileUrl,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
      });
      toast.success('Đã tải tệp lên thành công, sẵn sàng gửi.');
    } catch (err: any) {
      toast.error('Lỗi tải tệp: ' + (err.message || 'Không thể tải lên'));
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedContact || sending) return;
    if (!inputText.trim() && !stagedAttachment) return;

    const content = inputText.trim();
    const attachment = stagedAttachment;

    setInputText('');
    setStagedAttachment(null);
    setSending(true);

    try {
      const sent = await api.sendChatMessage({
        receiverId: selectedContact.userId,
        content: content || undefined,
        attachmentUrl: attachment?.fileUrl,
        attachmentName: attachment?.fileName,
        attachmentType: attachment?.fileType,
        attachmentSize: attachment?.fileSize,
      });

      setMessages((prev) => {
        if (prev.some((m) => m.messageId === sent.messageId)) return prev;
        return [...prev, sent];
      });
    } catch (err: any) {
      toast.error('Lỗi gửi tin nhắn: ' + (err.message || 'Không thể gửi tin nhắn'));
      // Restore input & attachment if failed
      setInputText(content);
      setStagedAttachment(attachment);
    } finally {
      setSending(false);
    }
  };

  // Handle Recall Message
  const handleRecallMessage = async (messageId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn thu hồi tin nhắn này? Tin nhắn sẽ được thu hồi đối với cả hai phía.')) {
      return;
    }

    try {
      await api.recallChatMessage(messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === messageId
            ? { ...m, isRecalled: true, content: null, attachmentUrl: null, attachmentName: null }
            : m
        )
      );
      toast.success('Đã thu hồi tin nhắn thành công.');
    } catch (err: any) {
      toast.error('Lỗi khi thu hồi: ' + (err.message || 'Không thể thu hồi'));
    }
  };

  // Toggle Lecturer Chat Availability
  const handleToggleChat = async () => {
    try {
      const res = await api.toggleLecturerChat();
      setLecturerChatEnabled(res.isChatEnabled);
      toast.success(res.message);
    } catch (err: any) {
      toast.error('Lỗi thay đổi trạng thái: ' + err.message);
    }
  };

  // Block / Unblock Student
  const handleToggleBlock = async (contact: ChatContact) => {
    if (contact.isBlocked) {
      try {
        await api.unblockStudent(contact.userId);
        toast.success(`Đã gỡ chặn sinh viên ${contact.fullName}.`);
        setContacts((prev) =>
          prev.map((c) => (c.userId === contact.userId ? { ...c, isBlocked: false } : c))
        );
        if (selectedContact?.userId === contact.userId) {
          setSelectedContact({ ...selectedContact, isBlocked: false });
        }
      } catch (err: any) {
        toast.error('Lỗi khi gỡ chặn: ' + err.message);
      }
    } else {
      if (window.confirm(`Bạn có chắc chắn muốn chặn sinh viên "${contact.fullName}" gửi tin nhắn?`)) {
        try {
          await api.blockStudent(contact.userId, 'Làm phiền giảng viên');
          toast.success(`Đã chặn sinh viên ${contact.fullName}.`);
          setContacts((prev) =>
            prev.map((c) => (c.userId === contact.userId ? { ...c, isBlocked: true } : c))
          );
          if (selectedContact?.userId === contact.userId) {
            setSelectedContact({ ...selectedContact, isBlocked: true });
          }
        } catch (err: any) {
          toast.error('Lỗi khi chặn: ' + err.message);
        }
      }
    }
  };

  const filteredContacts = contacts.filter((c) =>
    c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.courseNames.some((cn) => cn.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="h-[calc(100vh-8.5rem)] flex bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* LEFT COLUMN: Contacts List */}
      <div className="w-80 border-r border-slate-100 flex flex-col bg-slate-50/50">
        {/* Top Header & Lecturer DM Toggle */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <span>Hộp thư Tin nhắn</span>
            </h2>

            {/* Lecturer Toggle Switch */}
            {user?.role === 'LECTURER' && (
              <button
                onClick={handleToggleChat}
                className={`p-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition ${
                  lecturerChatEnabled
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
                title={lecturerChatEnabled ? 'Đang nhận tin nhắn (Bấm để tắt)' : 'Đã tắt nhận tin nhắn (Bấm để bật)'}
              >
                <Power className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">{lecturerChatEnabled ? 'Đang bật' : 'Đã tắt'}</span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm người liên hệ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-xs border border-transparent focus:bg-white focus:border-blue-500 transition"
            />
          </div>
        </div>

        {/* Contacts Scroll Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingContacts ? (
            <div className="p-6 text-center text-xs text-slate-400">Đang tải danh sách liên hệ...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">Không tìm thấy người liên hệ phù hợp</div>
          ) : (
            filteredContacts.map((contact) => {
              const isSelected = selectedContact?.userId === contact.userId;
              return (
                <div
                  key={contact.userId}
                  onClick={() => loadMessages(contact)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition ${
                    isSelected ? 'bg-blue-50/70 border-r-2 border-blue-600' : 'hover:bg-slate-100/70'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-sm">
                      {contact.fullName.charAt(0).toUpperCase()}
                    </div>
                    {contact.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                        {contact.unreadCount > 9 ? '9+' : contact.unreadCount}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate">{contact.fullName}</span>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                        {contact.role === 'LECTURER' ? 'Giảng viên' : 'Sinh viên'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{contact.email}</p>

                    {contact.courseNames.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-blue-600 mt-1 truncate">
                        <BookOpen className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{contact.courseNames.join(', ')}</span>
                      </div>
                    )}

                    {contact.isBlocked && (
                      <span className="inline-block mt-1 text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                        Đã chặn
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedContact ? (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                  {selectedContact.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    {selectedContact.fullName}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {selectedContact.role === 'LECTURER' ? 'Giảng viên' : 'Sinh viên'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedContact.email} {selectedContact.department ? `• Khoa ${selectedContact.department}` : ''}
                  </p>
                </div>
              </div>

              {/* Action Buttons for Lecturer */}
              {user?.role === 'LECTURER' && selectedContact.role === 'STUDENT' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleBlock(selectedContact)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                      selectedContact.isBlocked
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    }`}
                  >
                    {selectedContact.isBlocked ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" /> Gỡ chặn
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" /> Chặn sinh viên
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Messages Thread Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
              {loadingMessages ? (
                <div className="p-8 text-center text-xs text-slate-400">Đang tải tin nhắn...</div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                  <MessageSquare className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-600">Chưa có tin nhắn nào</p>
                  <p className="text-[11px]">Hãy gửi lời chào hoặc tài liệu học tập để bắt đầu trao đổi!</p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isMine = m.senderId === user?.id;
                  const currentDateKey = getMessageDateKey(m.createdAt);
                  const prevDateKey = idx > 0 ? getMessageDateKey(messages[idx - 1].createdAt) : null;
                  const showDateHeader = currentDateKey !== prevDateKey;

                  return (
                    <React.Fragment key={m.messageId}>
                      {/* Day divider separator */}
                      {showDateHeader && (
                        <div className="flex items-center justify-center my-3">
                          <span className="px-3 py-1 bg-slate-200/70 text-slate-600 rounded-full text-[10px] font-medium tracking-wide shadow-2xs">
                            {formatMessageDateHeader(m.createdAt)}
                          </span>
                        </div>
                      )}

                      <div className={`flex flex-col group ${isMine ? 'items-end' : 'items-start'}`}>
                        {/* Recalled State */}
                        {m.isRecalled ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 text-slate-400 italic text-xs border border-slate-200/60 select-none">
                            <Undo2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Tin nhắn đã được thu hồi</span>
                          </div>
                        ) : (
                          /* Normal Message Bubble */
                          <div
                            className={`max-w-[75%] sm:max-w-[70%] p-3 rounded-2xl text-xs leading-relaxed space-y-2 relative shadow-2xs ${
                              isMine
                                ? 'bg-blue-600 text-white rounded-br-xs'
                                : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                            }`}
                          >
                            {/* Attachment rendering */}
                            {m.attachmentUrl && (
                              <div className="rounded-xl overflow-hidden">
                                {isImageFile(m.attachmentUrl, m.attachmentType) ? (
                                  <div className="relative group/img overflow-hidden rounded-xl border border-white/20">
                                    <img
                                      src={m.attachmentUrl}
                                      alt={m.attachmentName || 'Tệp hình ảnh'}
                                      className="max-h-64 max-w-full rounded-xl object-cover hover:opacity-95 transition cursor-pointer"
                                      onClick={() => window.open(m.attachmentUrl!, '_blank')}
                                    />
                                    <a
                                      href={m.attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/70 text-white opacity-0 group-hover/img:opacity-100 transition"
                                      title="Xem ảnh kích thước gốc"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                ) : (
                                  <a
                                    href={`/api/download?path=${encodeURIComponent(m.attachmentUrl)}&name=${encodeURIComponent(m.attachmentName || 'tep-tin-nhan')}`}
                                    download={m.attachmentName || 'tep-tin-nhan'}
                                    className={`flex items-center justify-between p-2.5 rounded-xl border gap-3 transition hover:opacity-95 cursor-pointer ${
                                      isMine
                                        ? 'bg-blue-700/60 border-blue-500/40 text-white'
                                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                                    }`}
                                    title="Bấm để tải về máy"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                          isMine ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                                        }`}
                                      >
                                        <FileText className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-semibold text-xs truncate hover:underline">
                                          {m.attachmentName || 'Tệp đính kèm'}
                                        </div>
                                        <div className="text-[10px] opacity-75">
                                          {formatFileSize(m.attachmentSize)}
                                        </div>
                                      </div>
                                    </div>
                                    <div
                                      className={`p-1.5 rounded-lg transition shrink-0 ${
                                        isMine
                                          ? 'hover:bg-white/20 text-white'
                                          : 'hover:bg-slate-200 text-slate-600'
                                      }`}
                                    >
                                      <Download className="w-4 h-4" />
                                    </div>
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Text content */}
                            {m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>}
                          </div>
                        )}

                        {/* Timestamp & Actions Row */}
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 px-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{formatMessageTime(m.createdAt)}</span>
                          </span>

                          {isMine && !m.isRecalled && (
                            <>
                              <span title={m.isRead ? 'Đã xem' : 'Đã gửi'}>
                                {m.isRead ? (
                                  <CheckCheck className="w-3 h-3 text-blue-500 inline" />
                                ) : (
                                  <Check className="w-3 h-3 text-slate-400 inline" />
                                )}
                              </span>

                              {/* Recall Button */}
                              <button
                                onClick={() => handleRecallMessage(m.messageId)}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-600 text-slate-400 transition inline-flex items-center gap-1 font-medium ml-1"
                                title="Thu hồi tin nhắn này đối với cả hai người"
                              >
                                <Undo2 className="w-2.5 h-2.5" />
                                <span>Thu hồi</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar or Block Warning */}
            <div className="p-3 border-t border-slate-100 bg-white space-y-2">
              {/* Staged Attachment Preview Bar */}
              {stagedAttachment && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-xs font-semibold text-blue-900 truncate">
                      {stagedAttachment.fileName}
                    </span>
                    <span className="text-[10px] text-blue-500 shrink-0">
                      ({formatFileSize(stagedAttachment.fileSize)})
                    </span>
                  </div>
                  <button
                    onClick={() => setStagedAttachment(null)}
                    className="p-1 rounded-lg text-blue-600 hover:bg-blue-100 transition shrink-0"
                    title="Gỡ tệp này"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {selectedContact.isBlocked ? (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2 border border-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {user?.role === 'STUDENT'
                      ? 'Bạn không thể gửi tin nhắn do đã bị giảng viên chặn.'
                      : 'Bạn đã chặn sinh viên này. Hãy mở chặn để tiếp tục trò chuyện.'}
                  </span>
                </div>
              ) : !selectedContact.isChatEnabled && selectedContact.role === 'LECTURER' ? (
                <div className="p-3 bg-amber-50 text-amber-700 text-xs rounded-xl flex items-center gap-2 border border-amber-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Giảng viên hiện đang tạm tắt tính năng nhận tin nhắn từ sinh viên.</span>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept=".pdf,.docx,.doc,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.xlsx,.pptx,.txt"
                  />

                  {/* Attachment Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAttachment || sending}
                    className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50 shrink-0"
                    title="Đính kèm tệp tài liệu hoặc hình ảnh"
                  >
                    {uploadingAttachment ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </button>

                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      uploadingAttachment
                        ? 'Đang tải tệp lên...'
                        : stagedAttachment
                        ? 'Thêm lời nhắn kèm tệp (hoặc bấm gửi ngay)...'
                        : `Nhập tin nhắn gửi cho ${selectedContact.fullName}...`
                    }
                    className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl text-xs border border-transparent focus:bg-white focus:border-blue-500 transition"
                  />

                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !stagedAttachment) || sending || uploadingAttachment}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition inline-flex items-center gap-1.5 shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Gửi</span>
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-inner">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 text-base">Tin nhắn học tập trực tiếp</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Kết nối trao đổi học thuật theo thời gian thực giữa Giảng viên và Sinh viên theo từng học phần.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
