export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  isPhoto?: boolean;
}

export const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/x-matroska', // .mkv
  'video/ogg',
  'video/3gpp',
];

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Validates a video or photo file for local workspace processing & universal previewing
 */
export function validateVideoFile(file: File): FileValidationResult {
  if (!file) {
    return { isValid: false, error: 'No file provided.' };
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  const validVideoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv', '3gp'];
  const validImageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

  const isVideoType = ACCEPTED_VIDEO_TYPES.includes(file.type) || (ext ? validVideoExtensions.includes(ext) : false);
  const isImageType = ACCEPTED_IMAGE_TYPES.includes(file.type) || (ext ? validImageExtensions.includes(ext) : false);

  if (!isVideoType && !isImageType) {
    return {
      isValid: false,
      error: `Unsupported format (${file.type || ext}). Supported formats: MP4, MOV, WebM, MKV, AVI, 3GP, JPG, PNG, WebP, and HEIC.`,
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds the 2 GB workspace limit. Please select a smaller clip or image.`,
    };
  }

  return { isValid: true, isPhoto: isImageType };
}
