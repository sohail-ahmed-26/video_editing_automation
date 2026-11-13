import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env.js';

const execFileAsync = promisify(execFile);

export interface VideoMetadataResult {
  format: string;
  duration: number;
  bitrate?: number;
  videoCodec?: string;
  audioCodec?: string;
  width: number;
  height: number;
  aspectRatio: string;
  frameRate: number;
  audioChannels?: number;
  sampleRate?: number;
  pixFmt?: string;
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
  rotation?: number;
  isHdr?: boolean;
  isVfr?: boolean;
  isBrowserSafe?: boolean;
  rawJson: string;
}

export class FFprobeService {
  public async probeMedia(filePath: string): Promise<VideoMetadataResult> {
    try {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ];

      const { stdout } = await execFileAsync(env.FFPROBE_PATH, args, { maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(stdout);

      const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
      const audioStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');
      const format = data.format || {};

      const duration = parseFloat(format.duration || videoStream?.duration || '0');
      const bitrate = format.bit_rate ? parseInt(format.bit_rate, 10) : undefined;
      const width = videoStream?.width || 1920;
      const height = videoStream?.height || 1080;

      // Calculate framerate from r_frame_rate e.g. "30/1" or "2997/100"
      let frameRate = 30;
      let rFps = 30;
      let avgFps = 30;

      if (videoStream?.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        if (parts.length === 2 && parseInt(parts[1], 10) > 0) {
          rFps = Math.round((parseInt(parts[0], 10) / parseInt(parts[1], 10)) * 100) / 100;
          frameRate = rFps;
        }
      }

      if (videoStream?.avg_frame_rate) {
        const parts = videoStream.avg_frame_rate.split('/');
        if (parts.length === 2 && parseInt(parts[1], 10) > 0) {
          avgFps = Math.round((parseInt(parts[0], 10) / parseInt(parts[1], 10)) * 100) / 100;
        }
      }

      // Variable frame rate detection
      const isVfr = Math.abs(rFps - avgFps) > 0.5;

      // Aspect ratio calculation
      let aspectRatio = '16:9';
      if (width && height) {
        const ratio = width / height;
        if (Math.abs(ratio - 16 / 9) < 0.05) aspectRatio = '16:9';
        else if (Math.abs(ratio - 9 / 16) < 0.05) aspectRatio = '9:16';
        else if (Math.abs(ratio - 1) < 0.05) aspectRatio = '1:1';
        else if (Math.abs(ratio - 4 / 5) < 0.05) aspectRatio = '4:5';
        else aspectRatio = `${width}:${height}`;
      }

      // HDR detection
      const trc = (videoStream?.color_transfer || '').toLowerCase();
      const primaries = (videoStream?.color_primaries || '').toLowerCase();
      const space = (videoStream?.color_space || '').toLowerCase();
      const pixFmt = (videoStream?.pix_fmt || '').toLowerCase();

      const isHdr =
        trc.includes('smpte2084') ||
        trc.includes('arib-std-b67') ||
        trc.includes('hlg') ||
        trc.includes('pq') ||
        primaries.includes('bt2020') ||
        space.includes('bt2020') ||
        pixFmt.includes('10le') ||
        pixFmt.includes('10be') ||
        pixFmt.includes('12le') ||
        pixFmt.includes('12be');

      // Rotation detection
      let rotation = 0;
      if (videoStream?.tags?.rotate) {
        rotation = parseInt(videoStream.tags.rotate, 10) || 0;
      } else if (Array.isArray(videoStream?.side_data_list)) {
        const displayMatrix = videoStream.side_data_list.find(
          (s: any) => s.side_data_type === 'Display Matrix' || s.rotation !== undefined
        );
        if (displayMatrix?.rotation !== undefined) {
          rotation = Math.abs(parseInt(displayMatrix.rotation, 10) || 0);
        }
      }

      // Browser safety check: H.264 + yuv420p + normal rotation + mp4 container + non-HDR
      const formatName = (format.format_name || '').toLowerCase();
      const isMp4 = (formatName.includes('mp4') || filePath.toLowerCase().endsWith('.mp4')) && !filePath.toLowerCase().endsWith('.mov');
      const isH264 = (videoStream?.codec_name || '').toLowerCase() === 'h264';
      const isYuv420p = pixFmt === 'yuv420p';
      const isNormalRotation = rotation === 0 || isNaN(rotation);
      const isBrowserSafe = isMp4 && isH264 && isYuv420p && isNormalRotation && !isHdr;

      return {
        format: format.format_name || 'mp4',
        duration: Math.round(duration * 1000) / 1000,
        bitrate,
        videoCodec: videoStream?.codec_name,
        audioCodec: audioStream?.codec_name,
        width,
        height,
        aspectRatio,
        frameRate,
        audioChannels: audioStream?.channels,
        sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
        pixFmt: videoStream?.pix_fmt,
        colorSpace: videoStream?.color_space,
        colorTransfer: videoStream?.color_transfer,
        colorPrimaries: videoStream?.color_primaries,
        rotation,
        isHdr,
        isVfr,
        isBrowserSafe,
        rawJson: JSON.stringify(data)
      };
    } catch (err) {
      console.error('[FFprobeService] Error probing file:', filePath, err);
      throw new Error(`Failed to probe video file: ${(err as Error).message}`);
    }
  }
}

export const ffprobeService = new FFprobeService();
