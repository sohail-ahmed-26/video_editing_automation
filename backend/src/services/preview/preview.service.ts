import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { storageService } from '../storage/storage.service.js';
import { ffprobeService, VideoMetadataResult } from '../ffmpeg/ffprobe.service.js';
import { ffmpegService } from '../ffmpeg/ffmpeg.service.js';
import { pythonBridgeService } from '../python/python-bridge.service.js';

export const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
export const PHOTO_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export function isPhotoMedia(filename: string, mimeType?: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (PHOTO_EXTENSIONS.has(ext)) return true;
  if (mimeType && (PHOTO_MIMES.has(mimeType.toLowerCase()) || mimeType.toLowerCase().startsWith('image/'))) {
    return true;
  }
  return false;
}

export interface PreviewStatusInfo {
  status: 'preparing' | 'ready' | 'error' | 'skipped';
  previewUrl: string | null;
  previewPath: string | null;
  thumbnailUrl: string | null;
  isPhoto: boolean;
  error?: string | null;
}

export class PreviewService {
  private statusMap = new Map<string, { status: 'preparing' | 'ready' | 'error' | 'skipped'; error?: string }>();

  public getStatus(mediaAssetId: string, storagePath: string, filename: string, mimeType?: string): PreviewStatusInfo {
    const isPhoto = isPhotoMedia(filename, mimeType);
    const existingPreview = storageService.getExistingPreviewPath(storagePath);
    const thumbFilename = `thumb_${mediaAssetId}.jpg`;
    const thumbPath = storageService.getThumbnailPath(thumbFilename);
    const thumbnailUrl = fs.existsSync(thumbPath)
      ? storageService.getPublicUrl(thumbPath)
      : (isPhoto && existingPreview && fs.existsSync(existingPreview) ? storageService.getPublicUrl(existingPreview) : null);

    if (existingPreview && fs.existsSync(existingPreview)) {
      return {
        status: 'ready',
        previewUrl: storageService.getPublicUrl(existingPreview),
        previewPath: existingPreview,
        thumbnailUrl,
        isPhoto,
        error: null,
      };
    }

    const tracked = this.statusMap.get(mediaAssetId);
    if (tracked) {
      return {
        status: tracked.status,
        previewUrl: null,
        previewPath: null,
        thumbnailUrl,
        isPhoto,
        error: tracked.error || null,
      };
    }

    return {
      status: 'preparing',
      previewUrl: null,
      previewPath: null,
      thumbnailUrl,
      isPhoto,
      error: null,
    };
  }

  public setStatus(mediaAssetId: string, status: 'preparing' | 'ready' | 'error' | 'skipped', error?: string): void {
    this.statusMap.set(mediaAssetId, { status, error });
  }

  public async processMediaPreview(mediaAssetId: string): Promise<PreviewStatusInfo> {
    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      include: { project: true },
    });

    if (!mediaAsset) {
      throw new Error(`MediaAsset not found: ${mediaAssetId}`);
    }

    this.setStatus(mediaAssetId, 'preparing');

    const isPhoto = isPhotoMedia(mediaAsset.originalName || mediaAsset.filename, mediaAsset.mimeType);

    try {
      if (isPhoto) {
        return await this.processPhotoPreview(mediaAsset);
      } else {
        return await this.processVideoPreview(mediaAsset);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Preview generation failed';
      console.error(`[PreviewService] Failed to generate preview for ${mediaAssetId}:`, err);
      this.setStatus(mediaAssetId, 'error', errMsg);
      throw err;
    }
  }

  private async processPhotoPreview(mediaAsset: any): Promise<PreviewStatusInfo> {
    const mediaAssetId = mediaAsset.id;
    const previewPath = storageService.getPreviewPath(mediaAsset.storagePath, '.jpg');

    // Run Python bridge to transpose EXIF orientation and save standard JPEG
    const result = await pythonBridgeService.generatePhotoPreview(mediaAsset.storagePath, previewPath);
    const previewUrl = storageService.getPublicUrl(previewPath);

    // Generate project thumbnail from photo preview
    const thumbFilename = `thumb_${mediaAsset.id}.jpg`;
    const thumbPath = storageService.getThumbnailPath(thumbFilename);
    fs.copyFileSync(previewPath, thumbPath);
    const thumbUrl = storageService.getPublicUrl(thumbPath);

    // Update media asset metadata
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        width: result.width,
        height: result.height,
        durationSeconds: 5.0, // Default duration for photo on timeline
        status: 'analyzed',
      },
    });

    // Update project thumbnail if not set
    if (!mediaAsset.project.thumbnailUrl) {
      await prisma.project.update({
        where: { id: mediaAsset.projectId },
        data: {
          thumbnailUrl: thumbUrl,
          durationSeconds: 5.0,
        },
      });
    }

    this.setStatus(mediaAssetId, 'ready');

    return {
      status: 'ready',
      previewUrl,
      previewPath,
      thumbnailUrl: thumbUrl,
      isPhoto: true,
      error: null,
    };
  }

  private async processVideoPreview(mediaAsset: any): Promise<PreviewStatusInfo> {
    const mediaAssetId = mediaAsset.id;
    const previewPath = storageService.getPreviewPath(mediaAsset.storagePath, '.mp4');

    // 1. Probe source file
    const probeResult = await ffprobeService.probeMedia(mediaAsset.storagePath);

    // Upsert video metadata record in database
    await prisma.videoMetadata.upsert({
      where: { mediaAssetId },
      create: {
        mediaAssetId,
        format: probeResult.format,
        duration: probeResult.duration,
        bitrate: probeResult.bitrate,
        videoCodec: probeResult.videoCodec,
        audioCodec: probeResult.audioCodec,
        width: probeResult.width,
        height: probeResult.height,
        aspectRatio: probeResult.aspectRatio,
        frameRate: probeResult.frameRate,
        audioChannels: probeResult.audioChannels,
        sampleRate: probeResult.sampleRate,
        rawMetadataJson: probeResult.rawJson,
      },
      update: {
        format: probeResult.format,
        duration: probeResult.duration,
        bitrate: probeResult.bitrate,
        videoCodec: probeResult.videoCodec,
        audioCodec: probeResult.audioCodec,
        width: probeResult.width,
        height: probeResult.height,
        aspectRatio: probeResult.aspectRatio,
        frameRate: probeResult.frameRate,
        audioChannels: probeResult.audioChannels,
        sampleRate: probeResult.sampleRate,
        rawMetadataJson: probeResult.rawJson,
      },
    });

    // Update media asset
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        durationSeconds: probeResult.duration,
        width: probeResult.width,
        height: probeResult.height,
        fps: probeResult.frameRate,
        codec: probeResult.videoCodec,
        hasAudio: !!probeResult.audioCodec,
        audioChannels: probeResult.audioChannels,
        audioSampleRate: probeResult.sampleRate,
      },
    });

    // 2. Generate browser-friendly preview copy (H.264, AAC, 720p, 30fps, faststart, tonemapped)
    console.log(`[PreviewService] Creating preview copy for ${mediaAsset.filename}...`);
    await ffmpegService.generatePreview(mediaAsset.storagePath, previewPath, probeResult);

    const previewUrl = storageService.getPublicUrl(previewPath);
    const finalStatus = probeResult.isBrowserSafe ? 'skipped' : 'ready';
    this.setStatus(mediaAssetId, 'ready');

    // 3. Generate thumbnail from the browser-safe preview copy
    const thumbFilename = `thumb_${mediaAsset.id}.jpg`;
    const thumbPath = storageService.getThumbnailPath(thumbFilename);
    const thumbSeek = Math.min(1.0, Math.max(0.1, probeResult.duration / 4));

    try {
      await ffmpegService.generateThumbnail(previewPath, thumbPath, thumbSeek);
      const thumbUrl = storageService.getPublicUrl(thumbPath);

      if (!mediaAsset.project.thumbnailUrl) {
        await prisma.project.update({
          where: { id: mediaAsset.projectId },
          data: {
            thumbnailUrl: thumbUrl,
            durationSeconds: probeResult.duration,
          },
        });
      }
    } catch (thumbErr) {
      console.warn(`[PreviewService] Thumbnail generation warning:`, thumbErr);
    }

    const thumbnailUrl = fs.existsSync(thumbPath) ? storageService.getPublicUrl(thumbPath) : null;
    return {
      status: 'ready',
      previewUrl,
      previewPath,
      thumbnailUrl,
      isPhoto: false,
      error: null,
    };
  }
}

export const previewService = new PreviewService();

