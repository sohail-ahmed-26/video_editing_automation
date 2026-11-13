import { FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { storageService } from '../../services/storage/storage.service.js';
import { brandService } from '../../services/brand/brand.service.js';
import { photoService } from '../../services/photo/photo.service.js';
import {
  geminiPhotoPlannerService,
  PhotoPlanSchema,
} from '../../services/gemini/gemini-photo-planner.service.js';

export const PhotoPlanRequestSchema = z.object({
  assetId: z.string(),
  userPrompt: z.string().default(''),
  frame: z.string().default('16:9'),
});

export const PhotoEditRequestSchema = z.object({
  assetId: z.string(),
  plan: PhotoPlanSchema,
  targetFormat: z.enum(['jpg', 'png', 'webp']).optional(),
  customBackgroundPath: z.string().optional(),
});

export const BatchPhotoEditRequestSchema = z.object({
  assetIds: z.array(z.string()).min(1),
  plan: PhotoPlanSchema,
  targetFormat: z.enum(['jpg', 'png', 'webp']).optional(),
});

export const UseInVideoRequestSchema = z.object({
  editedPhotoPath: z.string(),
  originalName: z.string(),
});

export class PhotoController {
  /**
   * Generates an AI Photo Editing plan using Gemini (or analysis-driven fallback).
   */
  public async generatePlan(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const body = PhotoPlanRequestSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: body.assetId },
    });

    if (!asset || !fs.existsSync(asset.storagePath)) {
      return reply.status(404).send({ error: 'Photo asset not found' });
    }

    // Step 1: Run local Python analysis
    const analysis = await photoService.analyzePhoto(asset.storagePath);

    // Step 2: Check brand kit logo availability
    const brandKit = brandService.getBrandKit();
    const hasBrandLogo = Boolean(brandKit.logoPath && fs.existsSync(brandKit.logoPath));

    // Step 3: Call AI photo planner
    const plan = await geminiPhotoPlannerService.generatePhotoPlan({
      userPrompt: body.userPrompt,
      frame: body.frame,
      photoName: asset.originalName,
      fileSizeBytes: Number(asset.fileSizeBytes),
      analysis,
      previewPath: asset.previewPath || asset.filePath,
      hasBrandLogo,
    });

    return reply.send({
      success: true,
      data: {
        plan,
        analysis,
        asset: {
          id: asset.id,
          originalName: asset.originalName,
          previewUrl: asset.previewPath ? storageService.getRelativeUrl(asset.previewPath) : storageService.getRelativeUrl(asset.filePath),
        },
      },
    });
  }

  /**
   * Executes a photo editing plan on a single photo.
   */
  public async executeEdit(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const body = PhotoEditRequestSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: body.assetId },
    });

    if (!asset || !fs.existsSync(asset.storagePath)) {
      return reply.status(404).send({ error: 'Photo asset not found' });
    }

    const result = await photoService.editPhoto({
      clientId: project.clientId || 'default',
      projectId: project.id,
      assetId: asset.id,
      inputPath: asset.storagePath,
      plan: body.plan,
      targetFormat: body.targetFormat,
      customBackgroundPath: body.customBackgroundPath,
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Executes a photo editing plan on multiple photos in batch.
   */
  public async executeBatch(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const body = BatchPhotoEditRequestSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const assets = await prisma.mediaAsset.findMany({
      where: {
        id: { in: body.assetIds },
        projectId,
      },
    });

    if (assets.length === 0) {
      return reply.status(400).send({ error: 'No valid photos selected for batch processing' });
    }

    const validPhotos = assets
      .filter((a: any) => fs.existsSync(a.storagePath))
      .map((a: any) => ({
        assetId: a.id,
        inputPath: a.storagePath,
        photoName: a.originalName,
      }));

    const results = await photoService.batchEditPhotos({
      clientId: project.clientId || 'default',
      projectId: project.id,
      photos: validPhotos,
      plan: body.plan,
      targetFormat: body.targetFormat,
    });

    return reply.send({
      success: true,
      data: {
        count: results.length,
        results,
      },
    });
  }

  /**
   * Lists all existing photo export versions.
   */
  public async listVersions(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const versions = photoService.listPhotoVersions(project.clientId, project.id);
    return reply.send({
      success: true,
      data: versions,
    });
  }

  /**
   * Imports an edited photo into the project's media library as an asset.
   */
  public async useInVideo(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const body = UseInVideoRequestSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const asset = await photoService.importToVideoProject(
      project.clientId || 'default',
      project.id,
      body.editedPhotoPath,
      body.originalName
    );

    return reply.send({
      success: true,
      data: asset,
    });
  }

  /**
   * Downloads all photos in a version as a zip archive.
   */
  public async downloadZip(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const { version } = request.query as { version?: string };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const targetVersion = version || 'photo_v1';
    const versionDir = path.join(
      storageService.getProjectExportsDir(project.clientId || 'default', project.id),
      targetVersion
    );

    if (!fs.existsSync(versionDir)) {
      return reply.status(404).send({ error: `Version directory ${targetVersion} not found` });
    }

    const zipPath = photoService.createDownloadZip(versionDir);

    const stream = fs.createReadStream(zipPath);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${targetVersion}_bundle.zip"`);
    return reply.send(stream);
  }
}

export const photoController = new PhotoController();

