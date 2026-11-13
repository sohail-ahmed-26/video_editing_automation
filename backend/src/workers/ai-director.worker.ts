import { Worker, Job } from '../queues/in-memory-queue.js';
import { prisma } from '../config/database.js';
import { geminiPlannerService } from '../services/gemini/gemini-planner.service.js';
import { pythonBridgeService } from '../services/python/python-bridge.service.js';
import { ruleEngineService } from '../services/rules/rule-engine.service.js';
import { storageService } from '../services/storage/storage.service.js';

export interface AIDirectorJobData {
  instructionId: string;
}

export const aiDirectorWorker = new Worker<AIDirectorJobData>(
  'ai-director',
  async (job: Job<AIDirectorJobData>) => {
    const { instructionId } = job.data;
    console.log(`[AIDirectorWorker] Processing instruction: ${instructionId}`);

    const instruction = await prisma.editingInstruction.findUnique({
      where: { id: instructionId },
      include: {
        project: {
          include: {
            client: true,
            mediaAssets: {
              include: {
                scenes: { orderBy: { sceneIndex: 'asc' } },
                transcription: { include: { segments: { orderBy: { startTime: 'asc' } } } },
                metadata: true,
              },
            },
          },
        },
      },
    });

    if (!instruction) {
      throw new Error(`EditingInstruction not found: ${instructionId}`);
    }

    await prisma.editingInstruction.update({
      where: { id: instructionId },
      data: { status: 'processing' },
    });

    try {
      await job.updateProgress(20);

      const primaryAsset = instruction.project.mediaAssets[0];
      if (!primaryAsset) {
        throw new Error('Project has no uploaded media assets to edit');
      }

      // Check silences if silence removal requested
      let silences: Array<{ start: number; end: number; duration: number }> = [];
      if (instruction.removeSilences) {
        silences = await pythonBridgeService.detectSilence(primaryAsset.storagePath);
      }

      await job.updateProgress(40);

      // Collect scenes
      const scenes = primaryAsset.scenes.map((s: any) => ({
        scene_index: s.sceneIndex,
        start_time: s.startTime,
        end_time: s.endTime,
        duration: s.duration,
      }));

      // Collect transcription
      const transcription = primaryAsset.transcription
        ? {
            full_text: primaryAsset.transcription.fullText,
            segments: primaryAsset.transcription.segments.map((seg: any) => ({
              start: seg.startTime,
              end: seg.endTime,
              text: seg.text,
            })),
          }
        : undefined;

      const videoDuration = primaryAsset.durationSeconds || primaryAsset.metadata?.duration || 10.0;

      await job.updateProgress(60);
      console.log(`[AIDirectorWorker] Generating plan via Gemini for project ${instruction.projectId}...`);

      const plan = await geminiPlannerService.generatePlan({
        projectId: instruction.projectId,
        projectTitle: instruction.project.title,
        userPrompt: instruction.userPrompt,
        targetPlatform: instruction.project.targetPlatform || 'YouTube 16:9',
        aspectRatio: instruction.project.aspectRatio || '16:9',
        resolution: instruction.project.resolution || '1920x1080',
        targetDurationSeconds: instruction.targetDuration || undefined,
        assets: instruction.project.mediaAssets.map((a: any) => ({
          id: a.id,
          originalName: a.originalName || a.filename,
          filename: a.filename,
          isPhoto: !a.hasAudio && !(a.scenes && a.scenes.length),
          durationSeconds: a.durationSeconds || 10.0,
          width: a.width || 1920,
          height: a.height || 1080,
          storagePath: a.storagePath,
          scenes: (a.scenes || []).map((s: any) => ({
            sceneIndex: s.sceneIndex,
            start: s.startTime,
            end: s.endTime,
            duration: s.duration,
          })),
          silences,
          transcription,
        })),
      });

      await job.updateProgress(75);

      // Prepare quality contexts for Rule Engine (Layer 3 validation)
      const assetContexts = instruction.project.mediaAssets.map((a: any) => {
        let qualityAnalysis = undefined;
        if (a.metadata?.rawMetadataJson) {
          try {
            const parsed = JSON.parse(a.metadata.rawMetadataJson);
            qualityAnalysis = parsed.qualityAnalysis;
          } catch {}
        }
        return {
          id: a.id,
          originalName: a.originalName || a.filename,
          filename: a.filename,
          storagePath: a.storagePath,
          durationSeconds: a.durationSeconds || a.metadata?.duration || 10.0,
          width: a.width || a.metadata?.width || 1920,
          height: a.height || a.metadata?.height || 1080,
          isPhoto: !a.hasAudio && !(a.scenes && a.scenes.length),
          hasAudio: !!a.hasAudio,
          qualityAnalysis,
          transcriptionSegments: a.transcription?.segments?.map((seg: any) => ({
            start: seg.startTime,
            end: seg.endTime,
            text: seg.text,
          })),
          silences,
        };
      });

      console.log(`[AIDirectorWorker] Running Rule Engine validation & refinement on plan...`);
      const verifiedPlan = await ruleEngineService.validateAndFixPlan({
        plan,
        assets: assetContexts,
        targetPlatform: instruction.project.targetPlatform || 'YouTube 16:9',
        targetDurationSeconds: instruction.targetDuration || undefined,
      });

      await job.updateProgress(85);

      // Save EditingPlan to DB
      await prisma.editingPlan.upsert({
        where: { instructionId },
        create: {
          projectId: instruction.projectId,
          instructionId,
          summary: verifiedPlan.summary,
          rationale: verifiedPlan.explanation,
          selectedScenesJson: JSON.stringify(verifiedPlan.segments),
          removedSilencesJson: JSON.stringify(silences),
          captionPlanJson: JSON.stringify(verifiedPlan.captions || []),
          audioPlanJson: JSON.stringify(verifiedPlan.audio || {}),
          transitionsJson: JSON.stringify(verifiedPlan.segments.map((s) => s.transition)),
          targetDurationSeconds: verifiedPlan.targetDurationSeconds,
          status: 'generated',
        },
        update: {
          summary: verifiedPlan.summary,
          rationale: verifiedPlan.explanation,
          selectedScenesJson: JSON.stringify(verifiedPlan.segments),
          removedSilencesJson: JSON.stringify(silences),
          captionPlanJson: JSON.stringify(verifiedPlan.captions || []),
          audioPlanJson: JSON.stringify(verifiedPlan.audio || {}),
          transitionsJson: JSON.stringify(verifiedPlan.segments.map((s) => s.transition)),
          targetDurationSeconds: verifiedPlan.targetDurationSeconds,
          status: 'generated',
        },
      });

      // Also persist to disk plans
      try {
        const clientName = (instruction.project as any)?.client?.name || 'General';
        storageService.savePlanJson(clientName, instruction.project.title, {
          plan: verifiedPlan,
          version: 'v1',
        });
      } catch (storageErr) {
        console.warn('[AIDirectorWorker] Non-fatal notice saving plan to storage:', storageErr);
      }

      // Synchronize timeline: create default Video and Caption tracks
      let videoTrack = await prisma.timelineTrack.findFirst({
        where: { projectId: instruction.projectId, trackType: 'video' },
      });

      if (!videoTrack) {
        videoTrack = await prisma.timelineTrack.create({
          data: {
            projectId: instruction.projectId,
            name: 'Video Track 1',
            trackType: 'video',
            trackIndex: 0,
          },
        });
      }

      // Clear previous clips on this track
      await prisma.timelineClip.deleteMany({
        where: { trackId: videoTrack.id },
      });

      // Insert new clips calculated by AI Director and Rule Engine
      let timelineCursor = 0;
      for (let idx = 0; idx < verifiedPlan.segments.length; idx++) {
        const c = verifiedPlan.segments[idx];
        const clipDuration = (c.sourceOut - c.sourceIn) / (c.speed || 1.0);

        await prisma.timelineClip.create({
          data: {
            trackId: videoTrack.id,
            mediaAssetId: c.assetId || primaryAsset.id,
            name: `Clip ${idx + 1} (${c.sourceIn.toFixed(1)}s - ${c.sourceOut.toFixed(1)}s)`,
            startTime: timelineCursor,
            duration: clipDuration,
            sourceIn: c.sourceIn,
            sourceOut: c.sourceOut,
            speed: c.speed || 1.0,
            clipOrder: idx,
          },
        });

        timelineCursor += clipDuration;
      }

      // Add Captions track if captions generated
      if (verifiedPlan.captions && verifiedPlan.captions.length > 0) {
        let captionTrack = await prisma.timelineTrack.findFirst({
          where: { projectId: instruction.projectId, trackType: 'caption' },
        });

        if (!captionTrack) {
          captionTrack = await prisma.timelineTrack.create({
            data: {
              projectId: instruction.projectId,
              name: 'Captions',
              trackType: 'caption',
              trackIndex: 1,
            },
          });
        }

        await prisma.captionItem.deleteMany({ where: { trackId: captionTrack.id } });

        for (const cap of verifiedPlan.captions) {
          await prisma.captionItem.create({
            data: {
              trackId: captionTrack.id,
              startTime: cap.startTime,
              endTime: cap.endTime,
              text: cap.text,
              styleJson: JSON.stringify({ style: cap.style }),
            },
          });
        }
      }

      // Update project total duration
      await prisma.project.update({
        where: { id: instruction.projectId },
        data: {
          durationSeconds: timelineCursor,
          status: 'ready',
        },
      });

      // Mark instruction completed
      await prisma.editingInstruction.update({
        where: { id: instructionId },
        data: { status: 'completed' },
      });

      await job.updateProgress(100);
      console.log(`[AIDirectorWorker] Plan generated successfully for project ${instruction.projectId}`);
    } catch (err) {
      console.error(`[AIDirectorWorker] Error processing instruction ${instructionId}:`, err);
      await prisma.editingInstruction.update({
        where: { id: instructionId },
        data: {
          status: 'failed',
          errorMessage: (err as Error).message,
        },
      });
      throw err;
    }
  },
  {
    concurrency: 1,
  }
);
