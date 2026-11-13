import { Worker, Job } from '../queues/in-memory-queue.js';
import { prisma } from '../config/database.js';
import { pythonBridgeService } from '../services/python/python-bridge.service.js';
import { ffmpegService } from '../services/ffmpeg/ffmpeg.service.js';
import { storageService } from '../services/storage/storage.service.js';

export interface TranscriptionJobData {
  mediaAssetId: string;
}

export const transcriptionWorker = new Worker<TranscriptionJobData>(
  'media-transcription',
  async (job: Job<TranscriptionJobData>) => {
    const { mediaAssetId } = job.data;
    console.log(`[TranscriptionWorker] Starting transcription for mediaAsset: ${mediaAssetId}`);

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
    });

    if (!mediaAsset) {
      throw new Error(`MediaAsset not found: ${mediaAssetId}`);
    }

    if (!mediaAsset.hasAudio) {
      console.log(`[TranscriptionWorker] MediaAsset has no audio stream, skipping.`);
      return;
    }

    let tempWavPath: string | null = null;
    try {
      await job.updateProgress(20);
      // Extract 16kHz mono WAV for faster-whisper efficiency
      tempWavPath = storageService.getTempPath(`audio_${mediaAsset.id}.wav`);
      await ffmpegService.extractAudioWav(mediaAsset.storagePath, tempWavPath);

      await job.updateProgress(40);
      console.log(`[TranscriptionWorker] Invoking faster-whisper for ${mediaAsset.filename}...`);
      const transResult = await pythonBridgeService.transcribe(tempWavPath);

      await job.updateProgress(80);

      // Clean existing transcription if any
      await prisma.transcription.deleteMany({
        where: { mediaAssetId },
      });

      // Save transcription to database
      await prisma.transcription.create({
        data: {
          mediaAssetId,
          language: transResult.language || 'en',
          fullText: transResult.full_text || '',
          wordCount: transResult.word_count || 0,
          duration: transResult.duration || 0,
          confidence: 0.95,
          segments: {
            create: transResult.segments.map((seg) => ({
              startTime: seg.start,
              endTime: seg.end,
              text: seg.text,
              confidence: seg.confidence,
              wordsJson: JSON.stringify(seg.words || []),
            })),
          },
        },
      });

      await job.updateProgress(100);
      console.log(
        `[TranscriptionWorker] Transcription completed for ${mediaAsset.filename} (${transResult.word_count} words)`
      );
    } catch (err) {
      console.error(`[TranscriptionWorker] Error during transcription for ${mediaAssetId}:`, err);
      // Non-fatal if audio has no discernible speech or whisper encounters silence
    } finally {
      if (tempWavPath) {
        storageService.deleteFile(tempWavPath);
      }
    }
  },
  {
    concurrency: 1, // CPU-bound whisper runs best with concurrency 1 on 4-core CPU
  }
);
