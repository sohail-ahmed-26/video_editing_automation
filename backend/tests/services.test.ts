import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { ffprobeService } from '../src/services/ffmpeg/ffprobe.service.js';
import { ffmpegService } from '../src/services/ffmpeg/ffmpeg.service.js';
import { pythonBridgeService } from '../src/services/python/python-bridge.service.js';
import { aiDirectorService } from '../src/services/ollama/ai-director.service.js';

describe('Video Processing Services Unit & Integration Tests', () => {
  const sampleVideoPath = path.resolve(process.cwd(), 'storage/temp/test_sample.mp4');

  it('1. FFprobe extracts accurate container & stream metadata', async () => {
    expect(fs.existsSync(sampleVideoPath)).toBe(true);

    const meta = await ffprobeService.probeMedia(sampleVideoPath);
    expect(meta).toBeDefined();
    expect(meta.duration).toBeGreaterThan(4.5);
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(720);
    expect(meta.aspectRatio).toBe('16:9');
    expect(meta.videoCodec).toBe('h264');
    expect(meta.audioCodec).toBe('aac');
  });

  it('2. FFmpeg generates clean video thumbnail', async () => {
    const thumbPath = path.resolve(process.cwd(), 'storage/temp/test_thumb.jpg');
    const result = await ffmpegService.generateThumbnail(sampleVideoPath, thumbPath, 1.0);

    expect(fs.existsSync(thumbPath)).toBe(true);
    expect(fs.statSync(thumbPath).size).toBeGreaterThan(500);
    expect(result).toBe(thumbPath);
  });

  it('3. PySceneDetect detects video scenes via Python bridge', async () => {
    const scenes = await pythonBridgeService.detectScenes(sampleVideoPath);
    expect(Array.isArray(scenes)).toBe(true);
    expect(scenes.length).toBeGreaterThanOrEqual(1);
    expect(scenes[0].duration).toBeGreaterThan(0);
  });

  it('4. AI Director creates structured Edit Decision List', async () => {
    const plan = await aiDirectorService.generateEditingPlan({
      userPrompt: 'Cut the video into high energy scenes and add dynamic captions',
      editingStyle: 'dynamic',
      targetDuration: 4,
      videoDuration: 5.0,
      scenes: [
        { scene_index: 0, start_time: 0.0, end_time: 2.5, duration: 2.5 },
        { scene_index: 1, start_time: 2.5, end_time: 5.0, duration: 2.5 },
      ],
    });

    expect(plan).toBeDefined();
    expect(plan.summary).toBeDefined();
    expect(Array.isArray(plan.clips)).toBe(true);
    expect(plan.clips.length).toBeGreaterThan(0);
    expect(plan.clips[0].sourceIn).toBeGreaterThanOrEqual(0);
    expect(plan.clips[0].sourceOut).toBeLessThanOrEqual(5.0);
  }, 30000);

  it('5. FFmpeg executes multi-clip timeline rendering into valid MP4', async () => {
    const renderOutputPath = path.resolve(process.cwd(), 'storage/temp/test_rendered_output.mp4');

    const rendered = await ffmpegService.renderTimeline({
      clips: [
        { filePath: sampleVideoPath, sourceIn: 0.0, sourceOut: 2.0, speed: 1.0 },
        { filePath: sampleVideoPath, sourceIn: 2.5, sourceOut: 4.5, speed: 1.0 },
      ],
      captions: [
        { startTime: 0.0, endTime: 1.8, text: 'Automated Edit' },
        { startTime: 2.0, endTime: 3.8, text: 'Seamless Assembly' },
      ],
      aspectRatio: '16:9',
      resolution: '1080p',
      outputPath: renderOutputPath,
    });

    expect(fs.existsSync(rendered)).toBe(true);
    const renderedMeta = await ffprobeService.probeMedia(rendered);
    expect(renderedMeta.duration).toBeGreaterThan(3.5);
    expect(renderedMeta.width).toBe(1920);
    expect(renderedMeta.height).toBe(1080);
    expect(renderedMeta.videoCodec).toBe('h264');
  }, 30000);
});
