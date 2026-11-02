import React, { useState } from 'react';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Quote,
  Eye,
  Edit3,
} from 'lucide-react';

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  disabled?: boolean;
}

export const renderMarkdownText = (markdown: string): React.ReactNode => {
  if (!markdown) return null;

  const lines = markdown.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];

  const parseInline = (text: string): React.ReactNode[] => {
    // Process bold, italic, code, links
    const parts: React.ReactNode[] = [];
    let current = text;
    let keyIdx = 0;

    // Simple parser for **bold**, *italic*, `code`, and [link](url)
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(current)) !== null) {
      if (match.index > lastIndex) {
        parts.push(current.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(<strong key={keyIdx++} className="font-bold text-slate-900">{token.slice(2, -2)}</strong>);
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(<em key={keyIdx++} className="italic text-slate-800">{token.slice(1, -1)}</em>);
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code key={keyIdx++} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-blue-700 font-mono text-[11px]">
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
        const titleMatch = token.match(/\[([^\]]+)\]/);
        const urlMatch = token.match(/\(([^)]+)\)/);
        if (titleMatch && urlMatch) {
          parts.push(
            <a
              key={keyIdx++}
              href={urlMatch[1]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              {titleMatch[1]}
            </a>
          );
        }
      }
      lastIndex = match.index + token.length;
    }

    if (lastIndex < current.length) {
      parts.push(current.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [current];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto my-2">
            <code>{codeBlockBuffer.join('\n')}</code>
          </pre>
        );
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-bold text-slate-800 mt-3 mb-1">{parseInline(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-base font-bold text-slate-900 mt-3 mb-1.5 border-b border-slate-100 pb-1">{parseInline(line.slice(3))}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-lg font-bold text-slate-900 mt-4 mb-2">{parseInline(line.slice(2))}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-slate-600 my-0.5 text-xs">
          {parseInline(line.slice(2))}
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^\d+\.\s/);
      elements.push(
        <li key={i} className="ml-4 list-decimal text-slate-600 my-0.5 text-xs">
          {parseInline(line.slice(match![0].length))}
        </li>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-blue-500 pl-3 py-1 my-2 text-slate-600 bg-blue-50/40 rounded-r-lg text-xs italic">
          {parseInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-xs text-slate-600 my-1 leading-relaxed">
          {parseInline(line)}
        </p>
      );
    }
  }

  return <div className="markdown-body space-y-0.5">{elements}</div>;
};

export const RichTextViewer: React.FC<{ content: string; className?: string }> = ({ content, className = '' }) => {
  return <div className={`prose-sm max-w-none ${className}`}>{renderMarkdownText(content)}</div>;
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Nhập nội dung định dạng Markdown...',
  rows = 5,
  label,
  disabled = false,
}) => {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const insertSyntax = (before: string, after: string = '', defaultText: string = '') => {
    if (disabled) return;
    const textarea = document.getElementById('rich-text-editor-area') as HTMLTextAreaElement | null;
    if (!textarea) {
      onChange(value + before + defaultText + after);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;
    const replacement = before + selectedText + after;
    const newValue = value.substring(0, start) + replacement + value.substring(end);

    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block font-semibold text-slate-700 uppercase text-xs">{label}</label>
          <span className="text-[10px] text-slate-400 font-medium">Hỗ trợ Markdown chuẩn</span>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition">
        {/* Editor Toolbar */}
        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-1">
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('**', '**', 'chữ đậm')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Chữ đậm (**text**)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('*', '*', 'chữ nghiêng')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Chữ nghiêng (*text*)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('## ', '', 'Tiêu đề')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Tiêu đề cấp 2 (## Title)"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('### ', '', 'Tiêu đề nhỏ')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Tiêu đề cấp 3 (### Subtitle)"
            >
              <Heading3 className="w-3.5 h-3.5" />
            </button>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('- ', '', 'Mục danh sách')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Danh sách gạch đầu dòng (- Item)"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('1. ', '', 'Mục có thứ tự')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Danh sách số (1. Item)"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('`', '`', 'mã nguồn')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Mã nguồn inline (`code`)"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === 'preview'}
              onClick={() => insertSyntax('> ', '', 'Trích dẫn quan trọng')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 transition"
              title="Khối trích dẫn (> Quote)"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Edit / Preview Tabs */}
          <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`px-2 py-0.5 rounded-md flex items-center space-x-1 transition ${
                activeTab === 'edit' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              <span>Soạn thảo</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-2 py-0.5 rounded-md flex items-center space-x-1 transition ${
                activeTab === 'preview' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Xem trước</span>
            </button>
          </div>
        </div>

        {/* Textarea or Preview */}
        {activeTab === 'edit' ? (
          <textarea
            id="rich-text-editor-area"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className="w-full p-3.5 text-xs font-mono text-slate-800 bg-white placeholder:text-slate-400 focus:outline-none resize-y min-h-[120px]"
          />
        ) : (
          <div className="p-4 bg-white min-h-[120px] max-h-[360px] overflow-y-auto">
            {value.trim() ? (
              <RichTextViewer content={value} />
            ) : (
              <p className="text-xs text-slate-400 italic">Chưa có nội dung để xem trước.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
