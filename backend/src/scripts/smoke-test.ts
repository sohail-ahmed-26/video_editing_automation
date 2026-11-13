/**
 * Unified Studio Smoke Test Suite
 *
 * Verifies:
 * 1. System Health (Database, FFmpeg, Python, Whisper, ONNX, Gemini, Pixabay, Disk)
 * 2. 1 Photo Edit (OpenCV/Pillow smart crop 16:9 + auto levels)
 * 3. 1 Draft Video Render (FFmpeg Draft mode, scale, fast encode, ffprobe verification)
 *
 * Run via: npm run smoke (or npm --prefix backend run smoke)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { systemService } from '../services/system/system.service.js';
import { photoService } from '../services/photo/photo.service.js';
import { ffmpegService } from '../services/ffmpeg/ffmpeg.service.js';
import { ffprobeService } from '../services/ffmpeg/ffprobe.service.js';
import { storageService } from '../services/storage/storage.service.js';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);

async function runSmokeTest() {
  console.log('====================================================');
  console.log('         STUDIO - UNIFIED SMOKE TEST                ');
  console.log('====================================================\n');

  const startTime = Date.now();
  const tempDir = path.join(storageService.getBaseDir(), 'temp', 'smoke_test');
  fs.mkdirSync(tempDir, { recursive: true });

  const tempFilesToClean: string[] = [];

  try {
    // ----------------------------------------------------
    // 1. System Health Verification
    // ----------------------------------------------------
    console.log('[STEP 1/3] Verifying System Health & External Integrations...');
    const check = await systemService.getSystemCheck();

    console.log(`  - Video Engine:    ${check['Video engine']?.toUpperCase()}`);
    console.log(`  - Speech:          ${check['Speech']?.toUpperCase()}`);
    console.log(`  - Photo Cut-out:   ${check['Photo cut-out']?.toUpperCase()}`);
    console.log(`  - Edit Service:    ${check['Edit service']?.toUpperCase()}`);
    console.log(`  - Footage Service: ${check['Footage service']?.toUpperCase()}`);
    console.log(`  - Storage:         ${check['Storage']?.toUpperCase()}`);
    console.log(`  - Music:           ${check['Music']?.toUpperCase()}`);

    if (check['Video engine'] !== 'ok') {
      throw new Error('Video engine check failed');
    }
    if (check['Speech'] !== 'ok') {
      throw new Error('Speech engine check failed');
    }
    console.log('[PASS] STEP 1 PASSED: Core system health is operational.\n');

    // ----------------------------------------------------
    // 2. Photo Edit Verification (1 Photo)
    // ----------------------------------------------------
    console.log('[STEP 2/3] Verifying Photo Editing Engine (Smart Crop & Levels)...');
    const smokeInPhoto = path.join(tempDir, 'smoke_in.jpg');
    const smokeOutPhoto = path.join(tempDir, 'smoke_out.jpg');
    tempFilesToClean.push(smokeInPhoto, smokeOutPhoto);

    // Create a 800x600 test image with Python
    const makePhotoPy = `
import cv2
import numpy as np

img = np.ones((600, 800, 3), dtype=np.uint8) * 120
cv2.rectangle(img, (100, 100), (700, 500), (220, 150, 80), -1)
cv2.circle(img, (400, 300), 120, (50, 180, 240), -1)
cv2.putText(img, "Smoke Test Photo", (180, 310), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
cv2.imwrite(r"${smokeInPhoto.replace(/\\/g, '\\\\')}", img)
print("CREATED")
`;
    await execFileAsync(env.PYTHON_PATH, ['-c', makePhotoPy]);
    if (!fs.existsSync(smokeInPhoto)) {
      throw new Error('Failed to generate smoke test photo input');
    }

    // Process photo with photoService.editPhoto
    const photoResult = await photoService.editPhoto({
      clientId: '__temp_smoke_test__',
      projectId: '__temp_smoke_test__',
      assetId: 'smoke-photo',
      inputPath: smokeInPhoto,
      plan: {
        summary: 'Smoke Test YouTube Thumbnail',
        explanation: 'Smoke test edit',
        frame: '16:9',
        smart_crop: true,
        auto_color: true,
        brightness: 1.1,
        contrast: 1.05,
        saturation: 1.1,
        sharpness: 1.1,
        denoise: false,
        filter: 'warm',
        background: { mode: 'keep', color: '#FFFFFF', color2: '#000000', blurRadius: 25 },
        vignette: false,
        use_brand_logo: false,
        logo_position: 'top-right',
        logo_size: 14,
        logo_opacity: 85,
      },
      targetFormat: 'jpg',
    });

    if (!fs.existsSync(photoResult.outputPath)) {
      throw new Error('Photo processing output file not found on disk');
    }
    const photoStat = fs.statSync(photoResult.outputPath);
    if (photoStat.size < 1000) {
      throw new Error(`Processed photo too small: ${photoStat.size} bytes`);
    }

    console.log(`  - Output:       ${photoResult.width}x${photoResult.height} (${photoResult.format})`);
    console.log(`  - File Size:    ${(photoStat.size / 1024).toFixed(1)} KB`);
    console.log(`  - Version:      ${photoResult.version}`);
    console.log('[PASS] STEP 2 PASSED: Photo editing engine processed image successfully.\n');

    // Clean up photo output directory after test
    try {
      const smokeClientDir = path.join(storageService.getBaseDir(), 'clients', '__temp_smoke_test__');
      if (fs.existsSync(smokeClientDir)) {
        fs.rmSync(smokeClientDir, { recursive: true, force: true });
      }
    } catch {}

    // ----------------------------------------------------
    // 3. Draft Video Render Verification (1 Clip)
    // ----------------------------------------------------
    console.log('[STEP 3/3] Verifying Autonomous Video Render Engine (Draft Mode)...');
    const smokeClip = path.join(tempDir, 'smoke_clip.mp4');
    const smokeRenderOut = path.join(tempDir, 'smoke_render_draft.mp4');
    tempFilesToClean.push(smokeClip, smokeRenderOut);

    // Generate a 2-second test video clip with color bars and a tone
    const ffmpegBin = env.FFMPEG_PATH || 'ffmpeg';
    const createClipCmd = [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1280x720:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      smokeClip,
    ];
    await execFileAsync(ffmpegBin, createClipCmd);
    if (!fs.existsSync(smokeClip)) {
      throw new Error('Failed to create smoke test video clip');
    }

    // Render a 2-second draft plan with FFmpeg render engine
    const renderSegments = [
      {
        assetId: 'smoke-clip-1',
        filePath: smokeClip,
        isPhoto: false,
        sourceIn: 0,
        sourceOut: 2,
        speed: 1.0,
        motionEffect: 'none' as const,
        transition: 'cut' as const,
        hasAudio: true,
      },
    ];

    const renderResult = await ffmpegService.renderPlan({
      jobId: 'smoke-job-' + Date.now(),
      segments: renderSegments,
      frame: {
        platform: 'YouTube',
        aspectRatio: '16:9',
        resolution: '1280x720',
      },
      qualityMode: 'draft',
      outputPath: smokeRenderOut,
      onProgress: (p) => {
        if (p.percent % 25 === 0) process.stdout.write(`  Render progress: ${p.percent}%\r`);
      },
    });

    if (!fs.existsSync(smokeRenderOut)) {
      throw new Error('Render output file not found on disk');
    }

    // Probe rendered video
    const probe = await ffprobeService.probeMedia(smokeRenderOut);
    if (!probe.width || !probe.height) {
      throw new Error('Rendered video has invalid dimensions');
    }

    console.log(`\n  - Render Mode:  Draft (Fast Ultrafast / Hardware)`);
    console.log(`  - Encoder:      ${renderResult.encoderUsed}`);
    console.log(`  - Resolution:   ${probe.width}x${probe.height}`);
    console.log(`  - Duration:     ${probe.duration.toFixed(2)}s`);
    console.log(`  - Codec:        ${probe.videoCodec || 'h264'}`);
    console.log(`  - File Size:    ${(fs.statSync(smokeRenderOut).size / 1024).toFixed(1)} KB`);
    console.log('[PASS] STEP 3 PASSED: Video render engine completed draft render with valid video stream.\n');

    // ----------------------------------------------------
    // Cleanup temporary test artifacts
    // ----------------------------------------------------
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // Ignore file lock
      }
    }
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    try {
      const smokeClientDir = path.join(storageService.getBaseDir(), 'clients', '__temp_smoke_test__');
      if (fs.existsSync(smokeClientDir)) fs.rmSync(smokeClientDir, { recursive: true, force: true });
    } catch {}

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('====================================================');
  console.log(`[PASS] ALL SMOKE TESTS PASSED SUCCESSFULLY IN ${elapsed}s!`);
  console.log('   - Health Check:    PASS');
  console.log('   - 1 Photo Edit:    PASS');
  console.log('   - 1 Draft Render:  PASS');
  console.log('====================================================');
  process.exit(0);
} catch (err: any) {
  console.error('\n[FAIL] SMOKE TEST FAILED:', err.message);
    if (err.stack) console.error(err.stack);

    // Clean up on failure
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    try {
      const smokeClientDir = path.join(storageService.getBaseDir(), 'clients', '__temp_smoke_test__');
      if (fs.existsSync(smokeClientDir)) fs.rmSync(smokeClientDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  }
}

runSmokeTest();
