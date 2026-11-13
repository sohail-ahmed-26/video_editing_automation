import { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/database.js';
import { storageService } from '../../services/storage/storage.service.js';
import { analysisQueue } from '../../queues/index.js';
import { isPhotoMedia, previewService } from '../../services/preview/preview.service.js';

export class UploadsController {
  public async uploadMedia(req: FastifyRequest, reply: FastifyReply) {
    if (!req.isMultipart()) {
      return reply.status(400).send({ success: false, error: 'Request is not multipart' });
    }

    const part = await req.file();
    if (!part) {
      return reply.status(400).send({ success: false, error: 'No file uploaded' });
    }

    // Extract fields from multipart: projectId
    const fields = part.fields as Record<string, { value: string }>;
    const projectId = fields?.projectId?.value || (req.query as { projectId?: string })?.projectId;

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Target project not found' });
    }

    const clientName = project.client?.name || 'General';
    const dirs = storageService.ensureProjectFolders(clientName, project.title);

    const fileExt = path.extname(part.filename) || '.mp4';
    const uniqueFilename = `${uuidv4()}${fileExt}`;
    // Save directly into the project's raw folder (original file is never changed)
    const destinationPath = path.join(dirs.rawDir, uniqueFilename);

    // Stream upload directly to disk
    await pipeline(part.file, fs.createWriteStream(destinationPath));

    const fileSize = storageService.getFileSize(destinationPath);
    const isPhoto = isPhotoMedia(part.filename, part.mimetype);
    const mimeType = part.mimetype || (isPhoto ? 'image/jpeg' : 'video/mp4');

    // Create MediaAsset record
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        projectId,
        filename: uniqueFilename,
        originalName: part.filename,
        mimeType,
        fileSizeBytes: fileSize,
        storagePath: destinationPath,
        status: 'uploaded',
      },
    });

    previewService.setStatus(mediaAsset.id, 'preparing');

    // Update project preferences mediaOrder and project.json on disk
    let preferences = project.preferencesJson ? JSON.parse(project.preferencesJson) : {};
    const mediaOrder = Array.isArray(preferences.mediaOrder) ? [...preferences.mediaOrder, mediaAsset.id] : [mediaAsset.id];
    preferences.mediaOrder = mediaOrder;
    await prisma.project.update({
      where: { id: projectId },
      data: { preferencesJson: JSON.stringify(preferences) },
    });

    const allMedia = await prisma.mediaAsset.findMany({
      where: { projectId },
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
      mediaOrder,
      mediaAssets: allMedia.map((m: any) => ({
        id: m.id,
        filename: m.filename,
        originalName: m.originalName,
        mimeType: m.mimeType,
        fileSizeBytes: m.fileSizeBytes,
        isPhoto: isPhotoMedia(m.originalName || m.filename, m.mimeType),
        status: m.status,
      })),
      createdAt: project.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Enqueue background analysis & preview generation job
    await analysisQueue.add('analyze', { mediaAssetId: mediaAsset.id });

    const publicUrl = storageService.getPublicUrl(destinationPath);

    return reply.status(201).send({
      success: true,
      data: {
        id: mediaAsset.id,
        projectId: mediaAsset.projectId,
        filename: mediaAsset.filename,
        originalName: mediaAsset.originalName,
        mimeType: mediaAsset.mimeType,
        fileSizeBytes: mediaAsset.fileSizeBytes,
        storagePath: destinationPath,
        publicUrl,
        previewUrl: null,
        previewStatus: 'preparing',
        isPhoto,
        status: mediaAsset.status,
      },
    });
  }
}

export const uploadsController = new UploadsController();
