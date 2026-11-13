import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud,
  Film,
  AlertCircle,
  Plus,
  Loader2,
  CheckCircle2,
  X,
  FileVideo,
  FileImage,
} from 'lucide-react';
import { useWorkspace } from '../../store/WorkspaceContext';
import { formatBytes } from '../../utils/formatters';
import { Button } from '../ui/Button';

export const VideoUploader: React.FC = () => {
  const {
    uploadMultipleFiles,
    uploadQueue,
    dismissUploadQueueItem,
    clearUploadQueue,
    mediaError,
    mediaItems,
  } = useWorkspace();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await uploadMultipleFiles(files);
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await uploadMultipleFiles(files);
      e.target.value = '';
    }
  };

  const isUploadingAny = uploadQueue.some((q) => q.status === 'uploading' || q.status === 'preparing');

  return (
    <div className="space-y-3">
      {/* Hidden Multi-file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="video/*,image/*,.mov,.mp4,.mkv,.3gp,.webm,.avi,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
      />

      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 select-none ${
          isDragOver
            ? 'border-violet-500 bg-violet-600/10 scale-[0.99]'
            : 'border-studio-border hover:border-violet-500/50 hover:bg-studio-surface/60 bg-studio-surface/30'
        }`}
      >
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-studio-card border border-studio-border flex items-center justify-center text-violet-400 shadow-studio-sm flex-shrink-0">
            <UploadCloud className="w-5 h-5" />
          </div>
          <span className="text-sm font-semibold text-studio-text">
            Drag &amp; Drop
          </span>
        </div>
      </div>

      {/* Upload Progress Drawer (when files are uploading or queued) */}
      {uploadQueue.length > 0 && (
        <div className="bg-studio-surface border border-studio-border rounded-xl p-3.5 space-y-2.5 shadow-studio-sm">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-studio-border">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Upload Activity</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-600/20 text-violet-300">
                {uploadQueue.filter((q) => q.status === 'ready').length} / {uploadQueue.length} done
              </span>
            </div>

            {!isUploadingAny && (
              <button
                type="button"
                onClick={clearUploadQueue}
                className="text-[11px] text-studio-muted hover:text-white transition-colors"
              >
                Clear list
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {uploadQueue.map((item) => {
              const isImage = /\.(jpe?g|png|webp|heic|heif)$/i.test(item.name);

              return (
                <div
                  key={item.id}
                  className="bg-studio-card border border-studio-border rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded bg-studio-surface border border-studio-border flex items-center justify-center text-studio-muted flex-shrink-0">
                      {isImage ? <FileImage className="w-3.5 h-3.5 text-emerald-400" /> : <FileVideo className="w-3.5 h-3.5 text-violet-400" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-studio-text truncate text-xs" title={item.name}>
                          {item.name}
                        </span>
                        <span className="text-[10px] text-studio-muted font-mono flex-shrink-0">
                          {formatBytes(item.size)}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-studio-surface rounded-full h-1.5 mt-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            item.status === 'error'
                              ? 'bg-rose-500'
                              : item.status === 'ready'
                              ? 'bg-emerald-500'
                              : 'bg-violet-600'
                          }`}
                          style={{
                            width: `${item.status === 'ready' ? 100 : item.progress}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator & Action */}
                  <div className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                    {item.status === 'uploading' && (
                      <span className="flex items-center gap-1 font-mono text-violet-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{item.progress}%</span>
                      </span>
                    )}

                    {item.status === 'preparing' && (
                      <span className="flex items-center gap-1 font-mono text-amber-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Preparing preview...</span>
                      </span>
                    )}

                    {item.status === 'ready' && (
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ready</span>
                      </span>
                    )}

                    {item.status === 'error' && (
                      <span
                        className="flex items-center gap-1 text-rose-400 font-medium truncate max-w-xs"
                        title={item.error}
                      >
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{item.error || 'Failed'}</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => dismissUploadQueueItem(item.id)}
                      className="text-studio-subtle hover:text-white p-1 rounded transition-colors"
                      title="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Media Error Alert */}
      {mediaError && (
        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{mediaError}</span>
        </div>
      )}
    </div>
  );
};
