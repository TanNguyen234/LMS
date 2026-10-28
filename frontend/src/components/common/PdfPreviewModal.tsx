import React from 'react';
import { X, ExternalLink, Download, FileText } from 'lucide-react';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  title?: string;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  title = 'Xem trước tài liệu',
}) => {
  if (!isOpen || !fileUrl) return null;

  const isImage = /\.(jpeg|jpg|png|webp|gif|svg)$/i.test(fileUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col w-full max-w-5xl h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-2.5 min-w-0 pr-4">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 truncate" title={title}>
                {title}
              </h3>
              <p className="text-xs text-slate-500 truncate" title={fileUrl}>
                Đường dẫn: {fileUrl}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-white border border-transparent hover:border-slate-200 transition"
              title="Mở tab mới"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={fileUrl}
              download
              className="p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-white border border-transparent hover:border-slate-200 transition"
              title="Tải về máy"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 transition"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 bg-slate-100 relative overflow-hidden flex items-center justify-center">
          {isImage ? (
            <div className="w-full h-full p-4 overflow-auto flex items-center justify-center">
              <img
                src={fileUrl}
                alt={title}
                className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
              />
            </div>
          ) : (
            <iframe
              src={fileUrl}
              title={title}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
};
