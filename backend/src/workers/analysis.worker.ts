import { Worker, Job } from '../queues/in-memory-queue.js';
import { prisma } from '../config/database.js';
import { previewService } from '../services/preview/preview.service.js';
import { pythonBridgeService } from '../services/python/python-bridge.service.js';
import { transcriptionQueue } from '../queues/index.js';

export interface AnalysisJobData {
  mediaAssetId: string;
}

export const analysisWorker = new Worker<AnalysisJobData>(
  'media-analysis',
  async (job: Job<AnalysisJobData>) => {
    const { mediaAssetId } = job.data;
    console.log(`[AnalysisWorker] Starting processing for mediaAsset: ${mediaAssetId}`);

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      include: { project: true },
    });

    if (!mediaAsset) {
      throw new Error(`MediaAsset not found: ${mediaAssetId}`);
    }

    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { status: 'analyzing' },
    });

    try {
      // 1. Generate universal preview copy (video or photo) and thumbnail immediately
      await job.updateProgress(20);
      const previewInfo = await previewService.processMediaPreview(mediaAssetId);

      // If media is a photo, processing is complete!
      if (previewInfo.isPhoto) {
        await job.updateProgress(100);
        console.log(`[AnalysisWorker] Photo preview processing complete for mediaAsset: ${mediaAssetId}`);
        return;
      }

      // 2. Video Scene Detection with PySceneDetect
      await job.updateProgress(50);
      console.log(`[AnalysisWorker] Running PySceneDetect for ${mediaAsset.filename}...`);
      let detectedScenes: any[] = [];
      try {
        detectedScenes = await pythonBridgeService.detectScenes(mediaAsset.storagePath);

        // Clear any prior scenes for this asset and reinsert
        await prisma.detectedScene.deleteMany({ where: { mediaAssetId } });

        for (const scene of detectedScenes) {
          await prisma.detectedScene.create({
            data: {
              mediaAssetId,
              sceneIndex: scene.scene_index,
              startTime: scene.start_time,
              endTime: scene.end_time,
              duration: scene.duration,
              cutType: scene.cut_type,
              score: scene.score,
            },
          });
        }
      } catch (sceneErr) {
        console.warn(`[AnalysisWorker] Scene detection non-fatal warning for ${mediaAsset.filename}:`, sceneErr);
      }

      // 3. Local Computer Vision & Quality Analysis
      await job.updateProgress(70);
      console.log(`[AnalysisWorker] Running local footage quality analysis for ${mediaAsset.filename}...`);
      try {
        const qualityAnalysis = await pythonBridgeService.analyzeVideo(mediaAsset.storagePath, 1.0);
        // Persist analysis in metadata
        const existingMeta = await prisma.videoMetadata.findUnique({ where: { mediaAssetId } });
        if (existingMeta) {
          let currentJson: any = {};
          try {
            if (existingMeta.rawMetadataJson) currentJson = JSON.parse(existingMeta.rawMetadataJson);
          } catch {}
          currentJson.qualityAnalysis = qualityAnalysis;
          await prisma.videoMetadata.update({
            where: { mediaAssetId },
            data: { rawMetadataJson: JSON.stringify(currentJson) },
          });
        }
      } catch (analErr) {
        console.warn(`[AnalysisWorker] Video analysis warning for ${mediaAsset.filename}:`, analErr);
      }

      await job.updateProgress(85);

      // 4. Mark analyzed
      const updatedAsset = await prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: { status: 'analyzed' },
      });

      // 5. Enqueue transcription if asset has audio
      if (updatedAsset.hasAudio) {
        await transcriptionQueue.add('transcribe', { mediaAssetId });
      }

      await job.updateProgress(100);
      console.log(`[AnalysisWorker] Analysis complete for mediaAsset: ${mediaAssetId} (${detectedScenes.length} scenes)`);
    } catch (err) {
      console.error(`[AnalysisWorker] Error analyzing mediaAsset ${mediaAssetId}:`, err);
      await prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: { status: 'error' },
      });
      throw err;
    }
  },
  {
    concurrency: 2,
  }
);
