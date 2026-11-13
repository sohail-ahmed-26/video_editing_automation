import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';

export const UpdateTimelineClipsSchema = z.object({
  clips: z.array(
    z.object({
      id: z.string().optional(),
      trackId: z.string(),
      mediaAssetId: z.string().optional(),
      name: z.string(),
      startTime: z.number(),
      duration: z.number(),
      sourceIn: z.number(),
      sourceOut: z.number(),
      speed: z.number().default(1.0),
      volume: z.number().default(1.0),
      clipOrder: z.number(),
    })
  ),
});

export class EditingController {
  public async getTimeline(
    req: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) {
    const { projectId } = req.params;

    const tracks = await prisma.timelineTrack.findMany({
      where: { projectId },
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
    });

    return reply.send({ success: true, data: tracks });
  }

  public async updateTimeline(
    req: FastifyRequest<{
      Params: { projectId: string };
      Body: z.infer<typeof UpdateTimelineClipsSchema>;
    }>,
    reply: FastifyReply
  ) {
    const { projectId } = req.params;
    const parse = UpdateTimelineClipsSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: parse.error.format() });
    }

    const { clips } = parse.data;

    // Recalculate total duration
    let totalDuration = 0;

    await prisma.$transaction(async (tx: any) => {
      // Find all tracks for this project
      const tracks = await tx.timelineTrack.findMany({
        where: { projectId, trackType: 'video' },
      });
      const trackIds = tracks.map((t: any) => t.id);

      // Delete existing clips in these tracks
      await tx.timelineClip.deleteMany({
        where: { trackId: { in: trackIds } },
      });

      // Insert new clips
      for (const c of clips) {
        await tx.timelineClip.create({
          data: {
            trackId: c.trackId,
            mediaAssetId: c.mediaAssetId,
            name: c.name,
            startTime: c.startTime,
            duration: c.duration,
            sourceIn: c.sourceIn,
            sourceOut: c.sourceOut,
            speed: c.speed,
            volume: c.volume,
            clipOrder: c.clipOrder,
          },
        });
        totalDuration = Math.max(totalDuration, c.startTime + c.duration);
      }

      // Update project duration
      await tx.project.update({
        where: { id: projectId },
        data: { durationSeconds: totalDuration },
      });
    });

    return reply.send({
      success: true,
      message: 'Timeline updated successfully',
      data: { totalDuration },
    });
  }
}

export const editingController = new EditingController();

