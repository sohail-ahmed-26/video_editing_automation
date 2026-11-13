import { FastifyInstance } from 'fastify';
import { musicController } from './music.controller.js';

export async function musicRoutes(app: FastifyInstance) {
  app.get('/', musicController.listTracks.bind(musicController));
  app.post('/upload', musicController.uploadTrack.bind(musicController));
  app.get('/:id', musicController.getTrack.bind(musicController));
  app.patch('/:id', musicController.updateTrack.bind(musicController));
  app.delete('/:id', musicController.deleteTrack.bind(musicController));
  app.get('/:id/stream', musicController.streamTrack.bind(musicController));
}

