/**
 * Platform Presets Specification
 * Professional editing presets for social video platforms:
 * - Instagram Reel, TikTok, Shorts (9:16)
 * - YouTube standard (16:9)
 * - Instagram Post (1:1 and 4:5)
 */

export interface SafeMargins {
  topPercent: number;
  bottomPercent: number;
  rightPercent: number;
  leftPercent: number;
}

export interface PlatformPreset {
  id: string;
  name: string;
  aspectRatio: string;
  resolution: string;
  width: number;
  height: number;
  fps: number;
  safeMargins: SafeMargins;
  hookDurationSeconds: number;
  minDurationSeconds: number;
  targetDurationSeconds: number;
  maxDurationSeconds: number;
  shotLengthRange: [number, number]; // [min, max] seconds per cut
  pacing: 'fast-punchy' | 'balanced' | 'calm-cinematic';
  requiresIntro: boolean;
  isVertical: boolean;
}

export const PLATFORM_PRESETS: Record<string, PlatformPreset> = {
  instagram_reel: {
    id: 'instagram_reel',
    name: 'Instagram Reel',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    width: 1080,
    height: 1920,
    fps: 30,
    safeMargins: {
      topPercent: 12,
      bottomPercent: 20,
      rightPercent: 12,
      leftPercent: 4,
    },
    hookDurationSeconds: 2.0,
    minDurationSeconds: 12,
    targetDurationSeconds: 25,
    maxDurationSeconds: 90,
    shotLengthRange: [0.8, 3.5],
    pacing: 'fast-punchy',
    requiresIntro: false,
    isVertical: true,
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    width: 1080,
    height: 1920,
    fps: 30,
    safeMargins: {
      topPercent: 12,
      bottomPercent: 20,
      rightPercent: 12,
      leftPercent: 4,
    },
    hookDurationSeconds: 2.0,
    minDurationSeconds: 12,
    targetDurationSeconds: 22,
    maxDurationSeconds: 60,
    shotLengthRange: [0.8, 3.0],
    pacing: 'fast-punchy',
    requiresIntro: false,
    isVertical: true,
  },
  youtube_shorts: {
    id: 'youtube_shorts',
    name: 'YouTube Shorts',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    width: 1080,
    height: 1920,
    fps: 30,
    safeMargins: {
      topPercent: 12,
      bottomPercent: 20,
      rightPercent: 12,
      leftPercent: 4,
    },
    hookDurationSeconds: 2.0,
    minDurationSeconds: 12,
    targetDurationSeconds: 25,
    maxDurationSeconds: 60,
    shotLengthRange: [0.8, 3.5],
    pacing: 'fast-punchy',
    requiresIntro: false,
    isVertical: true,
  },
  youtube_16_9: {
    id: 'youtube_16_9',
    name: 'YouTube',
    aspectRatio: '16:9',
    resolution: '1920x1080',
    width: 1920,
    height: 1080,
    fps: 30,
    safeMargins: {
      topPercent: 5,
      bottomPercent: 8,
      rightPercent: 5,
      leftPercent: 5,
    },
    hookDurationSeconds: 3.5,
    minDurationSeconds: 30,
    targetDurationSeconds: 60,
    maxDurationSeconds: 300,
    shotLengthRange: [1.5, 6.0],
    pacing: 'calm-cinematic',
    requiresIntro: true,
    isVertical: false,
  },
  instagram_post_1_1: {
    id: 'instagram_post_1_1',
    name: 'Instagram Post (1:1)',
    aspectRatio: '1:1',
    resolution: '1080x1080',
    width: 1080,
    height: 1080,
    fps: 30,
    safeMargins: {
      topPercent: 6,
      bottomPercent: 10,
      rightPercent: 6,
      leftPercent: 6,
    },
    hookDurationSeconds: 2.5,
    minDurationSeconds: 15,
    targetDurationSeconds: 30,
    maxDurationSeconds: 60,
    shotLengthRange: [1.0, 4.0],
    pacing: 'balanced',
    requiresIntro: false,
    isVertical: false,
  },
  instagram_post_4_5: {
    id: 'instagram_post_4_5',
    name: 'Instagram Post (4:5)',
    aspectRatio: '4:5',
    resolution: '1080x1350',
    width: 1080,
    height: 1350,
    fps: 30,
    safeMargins: {
      topPercent: 8,
      bottomPercent: 12,
      rightPercent: 6,
      leftPercent: 6,
    },
    hookDurationSeconds: 2.0,
    minDurationSeconds: 15,
    targetDurationSeconds: 30,
    maxDurationSeconds: 60,
    shotLengthRange: [1.0, 4.0],
    pacing: 'balanced',
    requiresIntro: false,
    isVertical: true,
  },
};

/**
 * Resolves platform preset by targetPlatform string or aspectRatio.
 */
export function resolvePlatformPreset(platformOrAspect?: string, aspectRatio?: string): PlatformPreset {
  const norm = (platformOrAspect || '').toLowerCase().trim();
  const normAspect = (aspectRatio || '').toLowerCase().trim();

  if (norm.includes('short')) return PLATFORM_PRESETS.youtube_shorts;
  if (norm.includes('tiktok')) return PLATFORM_PRESETS.tiktok;
  if (norm.includes('reel') || normAspect === '9:16') return PLATFORM_PRESETS.instagram_reel;
  if (norm.includes('1:1') || normAspect === '1:1') return PLATFORM_PRESETS.instagram_post_1_1;
  if (norm.includes('4:5') || normAspect === '4:5') return PLATFORM_PRESETS.instagram_post_4_5;
  if (norm.includes('youtube') || normAspect === '16:9') return PLATFORM_PRESETS.youtube_16_9;

  // Default to Instagram Reel (9:16)
  return PLATFORM_PRESETS.instagram_reel;
}
