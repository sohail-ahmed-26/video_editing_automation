import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { storageService, sanitizeWindowsName } from '../../services/storage/storage.service.js';
import { previewService, isPhotoMedia } from '../../services/preview/preview.service.js';
import { geminiPlannerService, GeminiEditingPlan } from '../../services/gemini/gemini-planner.service.js';
import { pythonBridgeService } from '../../services/python/python-bridge.service.js';
import { stockService } from '../../services/stock/stock.service.js';
import { ruleEngineService } from '../../services/rules/rule-engine.service.js';

export const CreateProjectSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  targetPlatform: z.string().default('youtube'),
  aspectRatio: z.string().default('16:9'),
  resolution: z.string().default('1080p'),
  rawPrompt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  preferences: z.any().optional(),
});

export const UpdateProjectSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  clientId: z.string().nullable().optional(),
  clientName: z.string().optional(),
  targetPlatform: z.string().optional(),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  status: z.string().optional(),
  rawPrompt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  preferences: z.any().optional(),
  durationSeconds: z.number().optional(),
});

function sanitizeNotes(notes: string | null | undefined): string | null {
  if (!notes) return notes || null;
  return notes
    .replace(/\s*•\s*libx264\b/gi, '')
    .replace(/\b(gemini|google|ollama|whisper|ffmpeg|ffprobe|libx264|onnx|u2net|pexels|pixabay)\b/gi, 'service')
    .trim();
}

function sanitizePreferences(pref: any): any {
  if (!pref || typeof pref !== 'object') return pref;
  const cloned = { ...pref };
  if (cloned.stockLicenses && typeof cloned.stockLicenses === 'object') {
    const cleanLicenses: Record<string, any> = {};
    for (const [k, v] of Object.entries(cloned.stockLicenses)) {
      if (v && typeof v === 'object') {
        cleanLicenses[k] = {
          ...(v as any),
          source: 'Stock Library',
          pageUrl: '',
          creatorName: (v as any).creatorName || 'Contributor',
          creatorUrl: '',
          licenseUrl: '',
          licenseName: 'Standard Content License',
          stockId: `asset_${k.slice(0, 8)}`,
        };
      }
    }
    cloned.stockLicenses = cleanLicenses;
  }
  return cloned;
}

export class ProjectsController {
  public async listProjects(
    req: FastifyRequest<{ Querystring: { clientId?: string; search?: string } }>,
    reply: FastifyReply
  ) {
    const { clientId, search } = req.query;

    const where: any = {};
    if (clientId) {
      where.clientId = clientId;
    }
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim() } },
        { rawPrompt: { contains: search.trim() } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: true,
        _count: {
          select: {
            mediaAssets: true,
            versions: true,
            exportedFiles: true,
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        exportedFiles: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Format parsed tags and preferences for frontend
    const formatted = projects.map((p: any) => {
      const cleanPref = sanitizePreferences(p.preferencesJson ? JSON.parse(p.preferencesJson) : null);
      return {
        ...p,
        preferences: cleanPref,
        preferencesJson: cleanPref ? JSON.stringify(cleanPref) : null,
        tags: p.tagsJson ? JSON.parse(p.tagsJson) : [],
        versions: (p.versions || []).map((v: any) => ({
          ...v,
          notes: sanitizeNotes(v.notes),
        })),
        exportedFiles: (p.exportedFiles || []).map((e: any) => ({
          ...e,
          notes: sanitizeNotes(e.notes),
        })),
      };
    });

    return reply.send({ success: true, data: formatted });
  }

  public async getProjectById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
        mediaAssets: {
          include: {
            metadata: true,
            scenes: { orderBy: { sceneIndex: 'asc' } },
            transcription: {
              include: { segments: { orderBy: { startTime: 'asc' } } },
            },
          },
        },
        editingInstructions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        editingPlans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        timelineTracks: {
          orderBy: { trackIndex: 'asc' },
          include: {
            clips: {
              orderBy: { clipOrder: 'asc' },
              include: { mediaAsset: true },
            },
            captions: {
              orderBy: { startTime: 'asc' },
            },
            audios: true,
          },
        },
        renderingJobs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { jobEvents: { orderBy: { timestamp: 'desc' }, take: 10 } },
        },
        exportedFiles: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    const mediaAssetsWithUrls = (project.mediaAssets || []).map((asset: any) => {
      const previewInfo = previewService.getStatus(
        asset.id,
        asset.storagePath,
        asset.originalName || asset.filename,
        asset.mimeType
      );
      return {
        ...asset,
        publicUrl: storageService.getPublicUrl(asset.storagePath),
        previewUrl: previewInfo.previewUrl,
        previewStatus: previewInfo.status,
        previewError: previewInfo.error,
        isPhoto: previewInfo.isPhoto,
        thumbnailUrl: previewInfo.thumbnailUrl,
      };
    });

    const rawPreferences = project.preferencesJson ? JSON.parse(project.preferencesJson) : null;
    const preferences = sanitizePreferences(rawPreferences);
    const mediaOrder = preferences?.mediaOrder;
    if (Array.isArray(mediaOrder) && mediaOrder.length > 0) {
      const orderMap = new Map(mediaOrder.map((id: string, idx: number) => [id, idx]));
      mediaAssetsWithUrls.sort((a: any, b: any) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
        return orderA - orderB;
      });
    }

    const clientName = project.client?.name || 'General';
    storageService.saveProjectJson(clientName, project.title, {
      id: project.id,
      title: project.title,
      client: clientName,
      status: project.status,
      targetPlatform: project.targetPlatform,
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
      durationSeconds: project.durationSeconds,
      rawPrompt: project.rawPrompt,
      tags: project.tagsJson ? JSON.parse(project.tagsJson) : [],
      preferences,
      mediaOrder: Array.isArray(mediaOrder) ? mediaOrder : mediaAssetsWithUrls.map((a: any) => a.id),
      mediaAssets: mediaAssetsWithUrls.map((a: any) => ({
        id: a.id,
        filename: a.filename,
        originalName: a.originalName,
        mimeType: a.mimeType,
        fileSizeBytes: a.fileSizeBytes,
        durationSeconds: a.durationSeconds,
        width: a.width,
        height: a.height,
        isPhoto: a.isPhoto,
        status: a.status,
        previewStatus: a.previewStatus,
        previewUrl: a.previewUrl,
      })),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    });

    const formatted = {
      ...project,
      mediaAssets: mediaAssetsWithUrls,
      tags: project.tagsJson ? JSON.parse(project.tagsJson) : [],
      preferences,
      preferencesJson: preferences ? JSON.stringify(preferences) : null,
      versions: (project.versions || []).map((v: any) => ({
        ...v,
        notes: sanitizeNotes(v.notes),
      })),
      exportedFiles: (project.exportedFiles || []).map((e: any) => ({
        ...e,
        notes: sanitizeNotes(e.notes),
      })),
    };

    return reply.send({ success: true, data: formatted });
  }

  public async createProject(
    req: FastifyRequest<{ Body: z.infer<typeof CreateProjectSchema> }>,
    reply: FastifyReply
  ) {
    const parse = CreateProjectSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: parse.error.format() });
    }

    const {
      title,
      description,
      clientId: inputClientId,
      clientName: inputClientName,
      targetPlatform,
      aspectRatio,
      resolution,
      rawPrompt,
      tags,
      preferences,
    } = parse.data;

    // Resolve client
    let resolvedClientId = inputClientId;
    let resolvedClientName = 'General';

    if (inputClientId) {
      const client = await prisma.client.findUnique({ where: { id: inputClientId } });
      if (client) {
        resolvedClientName = client.name;
      }
    } else if (inputClientName && inputClientName.trim()) {
      const trimmedName = inputClientName.trim();
      let client = await prisma.client.findUnique({ where: { name: trimmedName } });
      if (!client) {
        client = await prisma.client.create({
          data: { name: trimmedName },
        });
      }
      resolvedClientId = client.id;
      resolvedClientName = client.name;
    }

    const tagsJson = tags ? JSON.stringify(tags) : null;
    const preferencesJson = preferences ? JSON.stringify(preferences) : null;

    const project = await prisma.project.create({
      data: {
        title,
        description,
        clientId: resolvedClientId,
        targetPlatform,
        aspectRatio,
        resolution,
        status: 'draft',
        rawPrompt: rawPrompt || '',
        tagsJson,
        preferencesJson,
      },
      include: {
        client: true,
      },
    });

    // Create default timeline tracks: Video, Captions, Audio
    await prisma.timelineTrack.createMany({
      data: [
        {
          projectId: project.id,
          name: 'Video Track 1',
          trackType: 'video',
          trackIndex: 0,
        },
        {
          projectId: project.id,
          name: 'Captions',
          trackType: 'caption',
          trackIndex: 1,
        },
        {
          projectId: project.id,
          name: 'Audio Track 1',
          trackType: 'audio',
          trackIndex: 2,
        },
      ],
    });

    // Automatically create folder structure on disk:
    // backend/storage/clients/{ClientName}/{ProjectName}/raw/
    // backend/storage/clients/{ClientName}/{ProjectName}/exports/v1/
    // backend/storage/clients/{ClientName}/{ProjectName}/project.json
    storageService.ensureProjectFolders(resolvedClientName, project.title, {
      id: project.id,
      title: project.title,
      client: resolvedClientName,
      status: project.status,
      targetPlatform: project.targetPlatform,
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
      rawPrompt: project.rawPrompt,
      tags: tags || [],
      preferences: preferences || {},
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    });

    const mediaAssetsWithUrls = (project.mediaAssets || []).map((asset: any) => {
      const previewInfo = previewService.getStatus(
        asset.id,
        asset.storagePath,
        asset.originalName || asset.filename,
        asset.mimeType
      );
      return {
        ...asset,
        publicUrl: storageService.getPublicUrl(asset.storagePath),
        previewUrl: previewInfo.previewUrl,
        previewStatus: previewInfo.status,
        previewError: previewInfo.error,
        isPhoto: previewInfo.isPhoto,
      };
    });

    const formatted = {
      mediaAssets: mediaAssetsWithUrls,
      ...project,
      tags: tags || [],
      preferences: preferences || null,
    };

    return reply.status(201).send({ success: true, data: formatted });
  }

  public async updateProject(
    req: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateProjectSchema> }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;
    const parse = UpdateProjectSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: parse.error.format() });
    }

    const currentProject = await prisma.project.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!currentProject) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    const updateData: any = {};
    if (parse.data.title !== undefined) updateData.title = parse.data.title;
    if (parse.data.description !== undefined) updateData.description = parse.data.description;
    if (parse.data.targetPlatform !== undefined) updateData.targetPlatform = parse.data.targetPlatform;
    if (parse.data.aspectRatio !== undefined) updateData.aspectRatio = parse.data.aspectRatio;
    if (parse.data.resolution !== undefined) updateData.resolution = parse.data.resolution;
    if (parse.data.status !== undefined) updateData.status = parse.data.status;
    if (parse.data.durationSeconds !== undefined) updateData.durationSeconds = parse.data.durationSeconds;
    if (parse.data.rawPrompt !== undefined) updateData.rawPrompt = parse.data.rawPrompt;
    if (parse.data.tags !== undefined) updateData.tagsJson = JSON.stringify(parse.data.tags);
    if (parse.data.preferences !== undefined) updateData.preferencesJson = JSON.stringify(parse.data.preferences);

    // Client handling
    let clientName = currentProject.client?.name || 'General';
    if (parse.data.clientId !== undefined) {
      updateData.clientId = parse.data.clientId;
      if (parse.data.clientId) {
        const client = await prisma.client.findUnique({ where: { id: parse.data.clientId } });
        if (client) clientName = client.name;
      }
    } else if (parse.data.clientName && parse.data.clientName.trim()) {
      const trimmed = parse.data.clientName.trim();
      let client = await prisma.client.findUnique({ where: { name: trimmed } });
      if (!client) {
        client = await prisma.client.create({ data: { name: trimmed } });
      }
      updateData.clientId = client.id;
      clientName = client.name;
    }

    const updated = await prisma.project.update({
      where: { id },
      data: updateData,
      include: { client: true },
    });

    // Check if title changed, rename project folder on disk
    if (parse.data.title && parse.data.title.trim() !== currentProject.title) {
      const oldSafe = sanitizeWindowsName(currentProject.title);
      const newSafe = sanitizeWindowsName(parse.data.title.trim());
      const clientDir = path.join(storageService.getClientsDir(), sanitizeWindowsName(clientName));
      const oldDir = path.join(clientDir, oldSafe);
      const newDir = path.join(clientDir, newSafe);
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        try {
          fs.renameSync(oldDir, newDir);
        } catch (e) {
          console.warn(`Could not rename project folder from ${oldDir} to ${newDir}:`, e);
        }
      }
    }

    const allMedia = await prisma.mediaAsset.findMany({
      where: { projectId: id },
      include: { metadata: true },
      orderBy: { createdAt: 'asc' },
    });

    const mediaAssetsWithUrls = allMedia.map((asset: any) => {
      const previewInfo = previewService.getStatus(
        asset.id,
        asset.storagePath,
        asset.originalName || asset.filename,
        asset.mimeType
      );
      return {
        ...asset,
        publicUrl: storageService.getPublicUrl(asset.storagePath),
        previewUrl: previewInfo.previewUrl,
        previewStatus: previewInfo.status,
        previewError: previewInfo.error,
        isPhoto: previewInfo.isPhoto,
        thumbnailUrl: previewInfo.thumbnailUrl,
      };
    });

    const preferences = updated.preferencesJson ? JSON.parse(updated.preferencesJson) : null;
    const mediaOrder = preferences?.mediaOrder;
    if (Array.isArray(mediaOrder) && mediaOrder.length > 0) {
      const orderMap = new Map(mediaOrder.map((mId: string, idx: number) => [mId, idx]));
      mediaAssetsWithUrls.sort((a: any, b: any) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
        return orderA - orderB;
      });
    }

    // Save updated state to project.json on disk
    storageService.saveProjectJson(clientName, updated.title, {
      id: updated.id,
      title: updated.title,
      client: clientName,
      status: updated.status,
      targetPlatform: updated.targetPlatform,
      aspectRatio: updated.aspectRatio,
      resolution: updated.resolution,
      durationSeconds: updated.durationSeconds,
      rawPrompt: updated.rawPrompt,
      tags: updated.tagsJson ? JSON.parse(updated.tagsJson) : [],
      preferences,
      mediaOrder: Array.isArray(mediaOrder) ? mediaOrder : mediaAssetsWithUrls.map((a: any) => a.id),
      mediaAssets: mediaAssetsWithUrls.map((a: any) => ({
        id: a.id,
        filename: a.filename,
        originalName: a.originalName,
        mimeType: a.mimeType,
        fileSizeBytes: a.fileSizeBytes,
        durationSeconds: a.durationSeconds,
        width: a.width,
        height: a.height,
        isPhoto: a.isPhoto,
        status: a.status,
        previewStatus: a.previewStatus,
        previewUrl: a.previewUrl,
      })),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });

    const formatted = {
      ...updated,
      mediaAssets: mediaAssetsWithUrls,
      tags: updated.tagsJson ? JSON.parse(updated.tagsJson) : [],
      preferences,
    };

    return reply.send({ success: true, data: formatted });
  }

  public async deleteProject(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    await prisma.project.delete({
      where: { id },
    });

    return reply.send({ success: true, message: 'Project deleted successfully' });
  }

  public async listVersions(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    const versions = (project.versions || []).map((v: any) => ({
      ...v,
      notes: sanitizeNotes(v.notes),
    }));

    return reply.send({
      success: true,
      data: versions,
    });
  }

  public async generateAiPlan(
    req: FastifyRequest<{
      Params: { id: string };
      Body: {
        userPrompt: string;
        targetPlatform?: string;
        aspectRatio?: string;
        resolution?: string;
        targetDurationSeconds?: number;
        autoBRoll?: boolean;
      };
    }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;
    const body = req.body || ({} as any);
    const userPrompt = (body.userPrompt || '').trim();

    if (!userPrompt) {
      return reply.status(400).send({
        success: false,
        error: 'Please enter a prompt describing how you want the video edited.',
      });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        editingPlans: { orderBy: { createdAt: 'desc' } },
        mediaAssets: {
          include: {
            metadata: true,
            scenes: { orderBy: { sceneIndex: 'asc' } },
            transcription: { include: { segments: { orderBy: { startTime: 'asc' } } } },
          },
        },
      },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    if (!project.mediaAssets || project.mediaAssets.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Please upload at least one video or photo before generating an edit plan.',
      });
    }

    const clientName = project.client?.name || 'General';
    const targetPlatform = body.targetPlatform || project.targetPlatform || 'YouTube 16:9';
    const aspectRatio = body.aspectRatio || project.aspectRatio || '16:9';
    const resolution = body.resolution || project.resolution || '1920x1080';
    const targetDurationSeconds = body.targetDurationSeconds;

    // Run local analysis automatically before planning if not already done
    const mediaContexts: any[] = [];
    for (const asset of project.mediaAssets) {
      const isPhoto = isPhotoMedia(asset.originalName || asset.filename, asset.mimeType);
      let scenes = (asset.scenes || []).map((s: any) => ({
        sceneIndex: s.sceneIndex,
        start: s.startTime,
        end: s.endTime,
        duration: s.duration,
      }));

      let silences: any[] = [];
      let transcription: any = asset.transcription
        ? {
            fullText: asset.transcription.fullText,
            segments: asset.transcription.segments.map((seg: any) => ({
              start: seg.startTime,
              end: seg.endTime,
              text: seg.text,
            })),
          }
        : undefined;

      if (!isPhoto) {
        // Run scene detection if not done
        if (scenes.length === 0 && fs.existsSync(asset.storagePath)) {
          try {
            console.log(`[AI Planner] Running PySceneDetect for ${asset.filename}...`);
            const detected = await pythonBridgeService.detectScenes(asset.storagePath);
            for (const s of detected) {
              await prisma.detectedScene.create({
                data: {
                  mediaAssetId: asset.id,
                  sceneIndex: s.scene_index,
                  startTime: s.start_time,
                  endTime: s.end_time,
                  duration: s.duration,
                  cutType: s.cut_type,
                },
              });
            }
            scenes = detected.map((s) => ({
              sceneIndex: s.scene_index,
              start: s.start_time,
              end: s.end_time,
              duration: s.duration,
            }));
          } catch (sceneErr) {
            console.warn(`[AI Planner] Scene detection warning:`, sceneErr);
          }
        }

        // Run silence detection if asset has audio
        if (asset.hasAudio && fs.existsSync(asset.storagePath)) {
          try {
            silences = await pythonBridgeService.detectSilence(asset.storagePath);
          } catch (silErr) {
            console.warn(`[AI Planner] Silence detection warning:`, silErr);
          }

          // Run transcription if not done
          if (!transcription) {
            try {
              console.log(`[AI Planner] Running Whisper transcription for ${asset.filename}...`);
              const tResult = await pythonBridgeService.transcribe(asset.storagePath);
              if (tResult && tResult.segments) {
                const dbTx = await prisma.transcription.create({
                  data: {
                    mediaAssetId: asset.id,
                    language: tResult.language || 'en',
                    duration: tResult.duration || asset.durationSeconds || 0,
                    fullText: tResult.full_text || '',
                    wordCount: tResult.word_count || 0,
                  },
                });

                for (const seg of tResult.segments) {
                  await prisma.transcriptionSegment.create({
                    data: {
                      transcriptionId: dbTx.id,
                      startTime: seg.start,
                      endTime: seg.end,
                      text: seg.text,
                      confidence: seg.confidence || 0.9,
                    },
                  });
                }

                transcription = {
                  fullText: tResult.full_text,
                  segments: tResult.segments.map((seg: any) => ({
                    start: seg.start,
                    end: seg.end,
                    text: seg.text,
                  })),
                };
              }
            } catch (txErr) {
              console.warn(`[AI Planner] Whisper transcription warning:`, txErr);
            }
          }
        }
      }

      const previewInfo = previewService.getStatus(
        asset.id,
        asset.storagePath,
        asset.originalName || asset.filename,
        asset.mimeType
      );

      mediaContexts.push({
        id: asset.id,
        originalName: asset.originalName || asset.filename,
        filename: asset.filename,
        isPhoto,
        durationSeconds: asset.durationSeconds || (isPhoto ? 5.0 : 10.0),
        width: asset.width || 1920,
        height: asset.height || 1080,
        storagePath: asset.storagePath,
        previewPath: previewInfo.previewPath,
        scenes,
        silences,
        transcription,
      });
    }

    try {
      // Step 13B Part 6: Check for previous plan to refine rather than starting from scratch
      const diskPlans = storageService.listPlanJsons(clientName, project.title);
      let previousPlan: GeminiEditingPlan | null = null;
      if (diskPlans.length > 0) {
        previousPlan = diskPlans[0].data?.plan;
      }
      if (!previousPlan && (project as any).editingPlans && (project as any).editingPlans.length > 0) {
        try {
          const dbPlan = (project as any).editingPlans[0];
          previousPlan = {
            summary: dbPlan.summary,
            explanation: dbPlan.rationale,
            targetDurationSeconds: dbPlan.targetDurationSeconds,
            frame: {
              platform: targetPlatform,
              aspectRatio,
              resolution,
            },
            segments: JSON.parse(dbPlan.selectedScenesJson || '[]'),
            captions: dbPlan.captionPlanJson ? JSON.parse(dbPlan.captionPlanJson) : [],
            audio: dbPlan.audioPlanJson ? JSON.parse(dbPlan.audioPlanJson) : { musicEnabled: false, mood: 'upbeat', volume: 0.2, ducking: true },
            silenceRemoval: { enabled: true, removedIntervals: [] },
            textOverlays: [],
            bRollSegments: [],
          };
        } catch {}
      }

      const promptLower = userPrompt.toLowerCase();
      const isRevision = Boolean(
        previousPlan &&
        ((body as any).isRevision ||
         promptLower.includes('revision') ||
         promptLower.includes('change') ||
         promptLower.includes('faster') ||
         promptLower.includes('slower') ||
         promptLower.includes('cut') ||
         promptLower.includes('music') ||
         promptLower.includes('caption') ||
         promptLower.includes('reframe') ||
         diskPlans.length > 0)
      );

      let plan: GeminiEditingPlan;
      if (isRevision && previousPlan) {
        console.log(`[AI Planner] Refining previous plan (${diskPlans[0]?.version || 'v1'}) with change request: "${userPrompt}"...`);
        plan = await geminiPlannerService.refinePlan({
          previousPlan,
          changeRequest: userPrompt,
          assets: mediaContexts,
          projectId: id,
          projectTitle: project.title,
          targetPlatform,
          aspectRatio,
          resolution,
          targetDurationSeconds,
        });
      } else {
        // Initial plan generation via Gemini planner
        plan = await geminiPlannerService.generatePlan({
          projectId: id,
          projectTitle: project.title,
          userPrompt,
          targetPlatform,
          aspectRatio,
          resolution,
          targetDurationSeconds,
          autoBRoll: Boolean(body.autoBRoll),
          systemPrompt: (body as any).systemPrompt,
          assets: mediaContexts,
        });
      }

      // Layer 3: Rule Engine validation & refinement
      const qualityContexts = project.mediaAssets.map((a: any) => {
        let qualityAnalysis = undefined;
        if (a.metadata?.rawMetadataJson) {
          try {
            qualityAnalysis = JSON.parse(a.metadata.rawMetadataJson).qualityAnalysis;
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
        };
      });

      plan = await ruleEngineService.validateAndFixPlan({
        plan,
        assets: qualityContexts,
        targetPlatform,
        targetDurationSeconds: plan.targetDurationSeconds,
      });

      // Auto B-roll import if enabled
      if (body.autoBRoll && plan.bRollSegments && plan.bRollSegments.length > 0) {
        const orientation =
          aspectRatio === '9:16' || targetPlatform.toLowerCase().includes('short') || targetPlatform.toLowerCase().includes('reel')
            ? 'portrait'
            : aspectRatio === '1:1'
            ? 'square'
            : 'landscape';

        for (const broll of plan.bRollSegments) {
          try {
            console.log(`[Auto B-Roll] Searching stock for keyword: "${broll.keyword}" (${orientation})...`);
            const searchRes = await stockService.searchStock({
              query: broll.keyword,
              mediaType: 'video',
              orientation,
              perPage: 3,
            });

            if (searchRes.items.length > 0) {
              const bestMatch = searchRes.items[0];
              console.log(`[Auto B-Roll] Auto-importing best match: "${bestMatch.title}" (${bestMatch.source})`);
              const imported = await stockService.downloadAndImportStockMedia({
                clientId: project.clientId || 'default',
                projectId: project.id,
                stockItem: bestMatch,
              });

              broll.id = `broll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              broll.assetId = imported.asset.id;
              broll.filePath = imported.asset.storagePath;
              broll.isPhoto = false;
              broll.stockItem = bestMatch;
            } else {
              console.log(`[Auto B-Roll] No stock video hits for "${broll.keyword}". Keeping as suggestion.`);
            }
          } catch (bErr) {
            console.warn(`[Auto B-Roll] Stock import error for "${broll.keyword}":`, bErr);
          }
        }
      }

      // Save plan on disk (.../{ProjectName}/plans/plan_v1.json)
      const { versionTag, filePath } = storageService.savePlanJson(clientName, project.title, {
        projectId: id,
        userPrompt,
        targetPlatform,
        aspectRatio,
        resolution,
        plan,
      });

      // Save plan in database
      const instruction = await prisma.editingInstruction.create({
        data: {
          projectId: id,
          userPrompt,
          editingStyle: targetPlatform,
          targetDuration: plan.targetDurationSeconds,
          status: 'completed',
        },
      });

      const editingPlan = await prisma.editingPlan.create({
        data: {
          projectId: id,
          instructionId: instruction.id,
          summary: plan.summary,
          rationale: plan.explanation,
          selectedScenesJson: JSON.stringify(plan.segments),
          captionPlanJson: JSON.stringify(plan.captions || []),
          audioPlanJson: JSON.stringify(plan.audio || {}),
          transitionsJson: JSON.stringify(plan.segments.map((s) => s.transition)),
          targetDurationSeconds: plan.targetDurationSeconds,
          status: 'generated',
        },
      });

      // Update timeline track V1 with clips
      let videoTrack = await prisma.timelineTrack.findFirst({
        where: { projectId: id, trackType: 'video' },
      });
      if (!videoTrack) {
        videoTrack = await prisma.timelineTrack.create({
          data: {
            projectId: id,
            name: 'V1 • Primary Video',
            trackType: 'video',
            trackIndex: 0,
          },
        });
      }

      await prisma.timelineClip.deleteMany({
        where: { trackId: videoTrack.id },
      });

      let timelineTime = 0;
      for (let idx = 0; idx < plan.segments.length; idx++) {
        const seg = plan.segments[idx];
        const clipDuration = (seg.sourceOut - seg.sourceIn) / (seg.speed || 1.0);
        const asset = project.mediaAssets.find((a: any) => a.id === seg.assetId);

        await prisma.timelineClip.create({
          data: {
            trackId: videoTrack.id,
            mediaAssetId: seg.assetId,
            name: asset?.originalName || `Clip ${idx + 1}`,
            startTime: timelineTime,
            duration: clipDuration,
            sourceIn: seg.sourceIn,
            sourceOut: seg.sourceOut,
            speed: seg.speed || 1.0,
            clipOrder: idx,
            filtersJson: JSON.stringify({ motionEffect: seg.motionEffect }),
          },
        });
        timelineTime += clipDuration;
      }

      // Update captions track if captions in plan
      if (plan.captions && plan.captions.length > 0) {
        let capTrack = await prisma.timelineTrack.findFirst({
          where: { projectId: id, trackType: 'caption' },
        });
        if (!capTrack) {
          capTrack = await prisma.timelineTrack.create({
            data: {
              projectId: id,
              name: 'Captions',
              trackType: 'caption',
              trackIndex: 1,
            },
          });
        }

        await prisma.captionItem.deleteMany({ where: { trackId: capTrack.id } });

        for (const cap of plan.captions) {
          await prisma.captionItem.create({
            data: {
              trackId: capTrack.id,
              startTime: cap.startTime,
              endTime: cap.endTime,
              text: cap.text,
              styleJson: JSON.stringify({
                style: cap.style,
                position: cap.position,
                fontSize: cap.fontSize,
                fontColor: cap.fontColor,
              }),
            },
          });
        }
      }

      // Update project state in DB
      await prisma.project.update({
        where: { id },
        data: {
          status: 'ready',
          targetPlatform: plan.frame.platform,
          aspectRatio: plan.frame.aspectRatio,
          resolution: plan.frame.resolution,
          durationSeconds: plan.targetDurationSeconds,
          rawPrompt: userPrompt,
        },
      });

      // Update project.json on disk
      const existingJson = storageService.getProjectJson(clientName, project.title) || {};
      storageService.saveProjectJson(clientName, project.title, {
        ...existingJson,
        status: 'ready',
        targetPlatform: plan.frame.platform,
        aspectRatio: plan.frame.aspectRatio,
        resolution: plan.frame.resolution,
        durationSeconds: plan.targetDurationSeconds,
        rawPrompt: userPrompt,
        activePlanId: editingPlan.id,
        activePlanVersion: versionTag,
        activePlan: plan,
      });

      return reply.status(200).send({
        success: true,
        data: {
          plan,
          planId: editingPlan.id,
          version: versionTag,
          filePath: `plans/plan_${versionTag}.json`,
        },
      });
    } catch (planErr: any) {
      console.error('[Planner] Plan generation failed:', planErr);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate edit plan. Please check your service key in Settings.',
      });
    }
  }

  public async listPlans(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        editingPlans: {
          orderBy: { createdAt: 'desc' },
          include: { instruction: true },
        },
      },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    const clientName = project.client?.name || 'General';
    const diskPlans = storageService.listPlanJsons(clientName, project.title);

    const formattedPlans = project.editingPlans.map((ep: any, idx: number) => {
      const versionTag = `v${project.editingPlans.length - idx}`;
      const diskMatch = diskPlans.find((dp) => dp.version === versionTag);
      return {
        id: ep.id,
        version: versionTag,
        summary: ep.summary,
        explanation: ep.rationale || ep.summary,
        targetDurationSeconds: ep.targetDurationSeconds,
        createdAt: ep.createdAt.toISOString(),
        prompt: ep.instruction?.userPrompt || project.rawPrompt,
        selectedScenes: JSON.parse(ep.selectedScenesJson || '[]'),
        captions: ep.captionPlanJson ? JSON.parse(ep.captionPlanJson) : [],
        audio: ep.audioPlanJson ? JSON.parse(ep.audioPlanJson) : {},
        plan: diskMatch?.data?.plan || {
          summary: ep.summary,
          explanation: ep.rationale || ep.summary,
          frame: {
            platform: project.targetPlatform || 'YouTube 16:9',
            aspectRatio: project.aspectRatio || '16:9',
            resolution: project.resolution || '1920x1080',
          },
          targetDurationSeconds: ep.targetDurationSeconds,
          segments: JSON.parse(ep.selectedScenesJson || '[]'),
          captions: ep.captionPlanJson ? JSON.parse(ep.captionPlanJson) : [],
          audio: ep.audioPlanJson ? JSON.parse(ep.audioPlanJson) : {},
        },
      };
    });

    return reply.send({
      success: true,
      data: formattedPlans,
    });
  }

  public async getPlanById(
    req: FastifyRequest<{ Params: { id: string; planId: string } }>,
    reply: FastifyReply
  ) {
    const { id, planId } = req.params;

    const plan = await prisma.editingPlan.findFirst({
      where: { id: planId, projectId: id },
      include: { instruction: true },
    });

    if (!plan) {
      return reply.status(404).send({ success: false, error: 'Plan not found' });
    }

    return reply.send({
      success: true,
      data: {
        id: plan.id,
        summary: plan.summary,
        explanation: plan.rationale,
        targetDurationSeconds: plan.targetDurationSeconds,
        createdAt: plan.createdAt.toISOString(),
        prompt: plan.instruction?.userPrompt,
        selectedScenes: JSON.parse(plan.selectedScenesJson || '[]'),
        captions: plan.captionPlanJson ? JSON.parse(plan.captionPlanJson) : [],
        audio: plan.audioPlanJson ? JSON.parse(plan.audioPlanJson) : {},
      },
    });
  }

}

export const projectsController = new ProjectsController();
