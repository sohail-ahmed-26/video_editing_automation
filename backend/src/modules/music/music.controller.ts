import { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { musicService } from '../../services/music/music.service.js';
import { storageService } from '../../services/storage/storage.service.js';

export const UpdateMusicTrackSchema = z.object({
  title: z.string().optional(),
  moodTags: z.array(z.string()).optional(),
  licenseSource: z.string().optional(),
});

export class MusicController {
  public async listTracks(req: FastifyRequest, reply: FastifyReply) {
    const tracks = await musicService.listTracks();
    return reply.send({ success: true, data: tracks });
  }

  public async getTrack(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { id } = req.params;
    const track = await musicService.getTrack(id);
    if (!track) {
      return reply.status(404).send({ success: false, error: 'Music track not found' });
    }
    return reply.send({ success: true, data: track });
  }

  public async uploadTrack(req: FastifyRequest, reply: FastifyReply) {
    const isMultipart = req.isMultipart();
    if (!isMultipart) {
      return reply.status(400).send({ success: false, error: 'Expected multipart/form-data upload' });
    }

    const parts = req.parts();
    let tempPath: string | null = null;
    let filename = 'audio.mp3';
    let title = '';
    let moodTags: string[] = ['upbeat'];
    let licenseSource = 'Royalty-Free';

    for await (const part of parts) {
      if (part.type === 'file') {
        filename = part.filename;
        tempPath = storageService.getTempPath(`music_upload_${Date.now()}_${filename}`);
        const ws = fs.createWriteStream(tempPath);
        await part.file.pipe(ws);
      } else {
        const val = part.value as string;
        if (part.fieldname === 'title') title = val;
        else if (part.fieldname === 'moodTags') {
          try {
            moodTags = JSON.parse(val);
          } catch {
            moodTags = val.split(',').map((s) => s.trim()).filter(Boolean);
          }
        } else if (part.fieldname === 'licenseSource') {
          licenseSource = val;
        }
      }
    }

    if (!tempPath || !fs.existsSync(tempPath)) {
      return reply.status(400).send({ success: false, error: 'No audio file received' });
    }

    const trackId = uuidv4();
    const track = await musicService.addTrack({
      id: trackId,
      title: title || path.basename(filename, path.extname(filename)),
      filename,
      tempFilePath: tempPath,
      moodTags,
      licenseSource,
    });

    return reply.status(201).send({ success: true, data: track });
  }

  public async updateTrack(
    req: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateMusicTrackSchema> }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;
    const parsed = UpdateMusicTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    const updated = await musicService.updateTrack(id, parsed.data);
    if (!updated) {
      return reply.status(404).send({ success: false, error: 'Track not found' });
    }
    return reply.send({ success: true, data: updated });
  }

  public async deleteTrack(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { id } = req.params;
    const deleted = await musicService.deleteTrack(id);
    if (!deleted) {
      return reply.status(404).send({ success: false, error: 'Track not found' });
    }
    return reply.send({ success: true, message: 'Track deleted successfully' });
  }

  public async streamTrack(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { id } = req.params;
    const track = await musicService.getTrack(id);
    if (!track || !fs.existsSync(track.storagePath)) {
      return reply.status(404).send({ success: false, error: 'Audio file not found' });
    }

    const ext = path.extname(track.storagePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
    };
    const contentType = mimeMap[ext] || 'audio/mpeg';

    const stream = fs.createReadStream(track.storagePath);
    reply.header('Content-Type', contentType);
    reply.header('Accept-Ranges', 'bytes');
    return reply.send(stream);
  }
}

export const musicController = new MusicController();

