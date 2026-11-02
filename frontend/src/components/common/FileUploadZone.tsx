import React, { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud, File, FileText, Archive, Image as ImageIcon, X, CheckCircle2, AlertCircle } from 'lucide-react';

export interface FileUploadZoneProps {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  existingFileUrl?: string | null;
  maxSizeBytes?: number; // Default 50MB
  acceptedExtensions?: string[]; // e.g. ['.pdf', '.docx', '.zip']
  label?: string;
  disabled?: boolean;
}

const DEFAULT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.zip', '.rar', '.txt', '.png', '.jpg', '.jpeg'];
const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  selectedFile,
  onFileSelect,
  existingFileUrl,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  acceptedExtensions = DEFAULT_EXTENSIONS,
  label = 'Tệp bài làm đính kèm',
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="w-8 h-8 text-red-500" />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) return <Archive className="w-8 h-8 text-amber-500" />;
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) return <ImageIcon className="w-8 h-8 text-emerald-500" />;
    return <File className="w-8 h-8 text-blue-500" />;
  };

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

    if (acceptedExtensions.length > 0 && !acceptedExtensions.includes(fileExt)) {
      setErrorMessage(`Định dạng tệp không được hỗ trợ (${fileExt}). Cho phép: ${acceptedExtensions.join(', ')}`);
      return;
    }

    if (file.size > maxSizeBytes) {
      setErrorMessage(`Kích thước tệp (${formatFileSize(file.size)}) vượt quá giới hạn cho phép (${formatFileSize(maxSizeBytes)}).`);
      return;
    }

    onFileSelect(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    onFileSelect(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block font-semibold text-slate-700 uppercase text-xs">{label}</label>
        <span className="text-[11px] text-slate-400">Tối đa {formatFileSize(maxSizeBytes)}</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedExtensions.join(',')}
        onChange={handleFileInputChange}
        disabled={disabled}
        className="hidden"
      />

      {/* Selected File Card */}
      {selectedFile ? (
        <div className="flex items-center justify-between p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl transition animate-in fade-in">
          <div className="flex items-center space-x-3 truncate">
            {getFileIcon(selectedFile.name)}
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-800 truncate">{selectedFile.name}</p>
              <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />
                <span>{formatFileSize(selectedFile.size)} • Sẵn sàng tải lên</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition ml-2 shrink-0"
            title="Gỡ bỏ tệp"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Dropzone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition text-center ${
            disabled
              ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'
              : isDragOver
              ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
              : 'border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 mb-2.5">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-xs font-semibold text-slate-700">
            Kéo thả tệp vào đây hoặc <span className="text-blue-600 underline">chọn từ thiết bị</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Hỗ trợ định dạng: {acceptedExtensions.join(', ')}
          </p>
        </div>
      )}

      {/* Existing Upload Notice */}
      {existingFileUrl && !selectedFile && (
        <div className="flex items-center space-x-2 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">Tệp đã nộp hiện tại:</span>
          <a
            href={existingFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-mono truncate font-medium"
          >
            {existingFileUrl.split('/').pop()}
          </a>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-center space-x-1.5 text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
