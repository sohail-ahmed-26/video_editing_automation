import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database.js';
import { storageService } from '../../services/storage/storage.service.js';
import { previewService, isPhotoMedia } from '../../services/preview/preview.service.js';

export class MediaController {
  public async getMediaById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        metadata: true,
        scenes: { orderBy: { sceneIndex: 'asc' } },
        transcription: {
          include: { segments: { orderBy: { startTime: 'asc' } } },
        },
      },
    });

    if (!mediaAsset) {
      return reply.status(404).send({ success: false, error: 'Media asset not found' });
    }

    const previewInfo = previewService.getStatus(
      mediaAsset.id,
      mediaAsset.storagePath,
      mediaAsset.originalName || mediaAsset.filename,
      mediaAsset.mimeType
    );

    return reply.send({
      success: true,
      data: {
        ...mediaAsset,
        publicUrl: storageService.getPublicUrl(mediaAsset.storagePath),
        previewUrl: previewInfo.previewUrl,
        previewStatus: previewInfo.status,
        previewError: previewInfo.error,
        isPhoto: previewInfo.isPhoto,
      },
    });
  }

  public async generatePreviewForMedia(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id },
    });

    if (!mediaAsset) {
      return reply.status(404).send({ success: false, error: 'Media asset not found' });
    }

    try {
      const info = await previewService.processMediaPreview(id);
      return reply.send({
        success: true,
        message: 'Preview generated successfully',
        data: info,
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err?.message || 'Failed to generate preview',
      });
    }
  }

  public async generateAllPreviews(
    req: FastifyRequest<{ Querystring: { projectId?: string } }>,
    reply: FastifyReply
  ) {
    const { projectId } = req.query;

    const where: any = {};
    if (projectId) {
      where.projectId = projectId;
    }

    const mediaAssets = await prisma.mediaAsset.findMany({
      where,
    });

    const results: Array<{ id: string; filename: string; status: string; error?: string }> = [];

    for (const asset of mediaAssets) {
      const existing = storageService.getExistingPreviewPath(asset.storagePath);
      if (existing) {
        results.push({ id: asset.id, filename: asset.filename, status: 'already_exists' });
        continue;
      }

      try {
        await previewService.processMediaPreview(asset.id);
        results.push({ id: asset.id, filename: asset.filename, status: 'generated' });
      } catch (err: any) {
        results.push({ id: asset.id, filename: asset.filename, status: 'failed', error: err?.message });
      }
    }

    return reply.send({
      success: true,
      message: `Processed ${results.length} media assets`,
      data: results,
    });
  }

  public async deleteMedia(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        project: {
          include: { client: true },
        },
      },
    });

    if (!mediaAsset) {
      return reply.status(404).send({ success: false, error: 'Media asset not found' });
    }

    // Delete raw file from disk
    storageService.deleteFile(mediaAsset.storagePath);

    // Delete preview file from disk
    const existingPreview = storageService.getExistingPreviewPath(mediaAsset.storagePath);
    if (existingPreview) {
      storageService.deleteFile(existingPreview);
    }

    // Delete thumbnail file from disk
    const thumbPath = storageService.getThumbnailPath(`thumb_${id}.jpg`);
    storageService.deleteFile(thumbPath);

    // Delete from database
    await prisma.mediaAsset.delete({
      where: { id },
    });

    // Update project preferences and project.json
    if (mediaAsset.project) {
      const project = mediaAsset.project;
      const clientName = project.client?.name || 'General';

      let preferences = project.preferencesJson ? JSON.parse(project.preferencesJson) : {};
      if (Array.isArray(preferences.mediaOrder)) {
        preferences.mediaOrder = preferences.mediaOrder.filter((mId: string) => mId !== id);
        await prisma.project.update({
          where: { id: project.id },
          data: { preferencesJson: JSON.stringify(preferences) },
        });
      }

      // Fetch remaining media
      const remaining = await prisma.mediaAsset.findMany({
        where: { projectId: project.id },
        include: { metadata: true },
        orderBy: { createdAt: 'asc' },
      });

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
        mediaOrder: preferences.mediaOrder || remaining.map((r: any) => r.id),
        mediaAssets: remaining.map((r: any) => ({
          id: r.id,
          filename: r.filename,
          originalName: r.originalName,
          mimeType: r.mimeType,
          fileSizeBytes: r.fileSizeBytes,
          durationSeconds: r.durationSeconds,
          width: r.width,
          height: r.height,
          isPhoto: isPhotoMedia(r.originalName || r.filename, r.mimeType),
          status: r.status,
        })),
        createdAt: project.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return reply.send({ success: true, message: 'Media asset deleted successfully' });
  }
}

export const mediaController = new MediaController();
