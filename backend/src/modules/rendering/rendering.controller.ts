import { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { renderQueue } from '../../queues/index.js';
import { storageService } from '../../services/storage/storage.service.js';
import { ffmpegService } from '../../services/ffmpeg/ffmpeg.service.js';

export const RenderOptionsOverrideSchema = z.object({
  captions: z.boolean().optional(),
  captionStyle: z.enum(['viral', 'clean', 'minimal']).optional(),
  music: z.boolean().optional(),
  musicMood: z.string().optional(),
  useBrandKit: z.boolean().optional(),
  silenceRemoval: z.boolean().optional(),
  bRollEnabled: z.boolean().optional(),
  excludedBRollIds: z.array(z.string()).optional(),
});

export const CreateRenderJobSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(['draft', 'final']).default('draft'),
  planVersion: z.string().optional(),
  resolution: z.string().optional(),
  format: z.string().default('mp4'),
  options: RenderOptionsOverrideSchema.optional(),
});

export class RenderingController {
  public async createRenderJob(
    req: FastifyRequest<{ Body: z.infer<typeof CreateRenderJobSchema> }>,
    reply: FastifyReply
  ) {
    const parse = CreateRenderJobSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: parse.error.format() });
    }

    const { projectId, mode = 'draft', planVersion, resolution, options } = parse.data;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { mediaAssets: true },
    });

    if (!project) {
      return reply.status(404).send({ success: false, error: 'Project not found' });
    }

    if (project.mediaAssets.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Cannot render project: no media assets available in project',
      });
    }

    if (resolution) {
      await prisma.project.update({
        where: { id: projectId },
        data: { resolution },
      });
    }

    // Create RenderingJob record
    const renderingJob = await prisma.renderingJob.create({
      data: {
        projectId,
        jobType: mode,
        status: 'queued',
        progressPercent: 0,
        currentStage: `Queued (${mode.toUpperCase()} mode)`,
      },
    });

    // Enqueue render worker job
    await renderQueue.add('render-video', {
      renderingJobId: renderingJob.id,
      mode,
      planVersion,
      options,
    });

    return reply.status(202).send({
      success: true,
      data: {
        jobId: renderingJob.id,
        status: renderingJob.status,
        mode,
        message: `Render job queued successfully in ${mode.toUpperCase()} mode`,
      },
    });
  }

  public async getRenderJob(
    req: FastifyRequest<{ Params: { jobId: string } }>,
    reply: FastifyReply
  ) {
    const { jobId } = req.params;

    const job = await prisma.renderingJob.findUnique({
      where: { id: jobId },
      include: {
        jobEvents: {
          orderBy: { timestamp: 'desc' },
          take: 20,
        },
        exportedFiles: true,
      },
    });

    if (!job) {
      return reply.status(404).send({ success: false, error: 'Rendering job not found' });
    }

    // Enrich with parsed latest details (ETA, speed, timestamps)
    let details: any = null;
    if (job.jobEvents.length > 0 && job.jobEvents[0].detailsJson) {
      try {
        details = JSON.parse(job.jobEvents[0].detailsJson);
      } catch {}
    }

    return reply.send({
      success: true,
      data: {
        ...job,
        details,
      },
    });
  }

  public async cancelRenderJob(
    req: FastifyRequest<{ Params: { jobId: string } }>,
    reply: FastifyReply
  ) {
    const { jobId } = req.params;

    const job = await prisma.renderingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return reply.status(404).send({ success: false, error: 'Rendering job not found' });
    }

    // Terminate FFmpeg process if active
    ffmpegService.cancelRender(jobId);

    // Update job status in database
    await prisma.renderingJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        currentStage: 'Cancelled by user',
        completedAt: new Date(),
      },
    });

    await prisma.jobEvent.create({
      data: {
        renderingJobId: jobId,
        stage: 'Cancelled',
        progress: 0,
        message: 'Render job cancelled by user',
      },
    });

    return reply.send({
      success: true,
      message: 'Render job cancelled successfully',
    });
  }

  public async getHardwareEncoder(req: FastifyRequest, reply: FastifyReply) {
    const encoder = await ffmpegService.detectHardwareEncoder();
    const isHardwareAccelerated = encoder === 'h264_nvenc' || encoder === 'h264_qsv';
    return reply.send({
      success: true,
      data: {
        encoder: isHardwareAccelerated ? 'hardware' : 'standard',
        isHardwareAccelerated,
        description: isHardwareAccelerated
          ? 'Hardware Accelerated Encoder'
          : 'Standard Software Encoder',
      },
    });
  }

  public async listProjectExports(
    req: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) {
    const { projectId } = req.params;

    const exportsList = await prisma.exportedFile.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        versions: true,
      },
    });

    return reply.send({ success: true, data: exportsList });
  }

  public async downloadExport(
    req: FastifyRequest<{ Params: { exportId: string } }>,
    reply: FastifyReply
  ) {
    const { exportId } = req.params;

    const exportedFile = await prisma.exportedFile.findUnique({
      where: { id: exportId },
    });

    if (!exportedFile || !storageService.fileExists(exportedFile.storagePath)) {
      return reply.status(404).send({ success: false, error: 'Exported file not found on disk' });
    }

    const stream = fs.createReadStream(exportedFile.storagePath);
    reply.header('Content-Type', exportedFile.mimeType);
    reply.header(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(exportedFile.filename)}"`
    );

    return reply.send(stream);
  }
}

export const renderingController = new RenderingController();
