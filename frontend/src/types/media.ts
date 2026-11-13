export interface ProjectMediaItem {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  status: string; // 'uploaded' | 'analyzing' | 'analyzed' | 'error'
  storagePath: string;
  publicUrl?: string;
  previewUrl?: string | null;
  previewStatus?: 'preparing' | 'ready' | 'error' | 'skipped';
  previewError?: string | null;
  isPhoto?: boolean;
  thumbnailUrl?: string | null;
  stockLicense?: any;
  createdAt?: string;
}

export interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'preparing' | 'ready' | 'error';
  error?: string;
}

