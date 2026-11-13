import { FastifyInstance } from 'fastify';
import { photoController } from './photo.controller.js';

export async function photoRoutes(app: FastifyInstance) {
  app.post('/api/v1/projects/:projectId/photo/plan', photoController.generatePlan.bind(photoController));
  app.post('/api/v1/projects/:projectId/photo/edit', photoController.executeEdit.bind(photoController));
  app.post('/api/v1/projects/:projectId/photo/batch', photoController.executeBatch.bind(photoController));
  app.get('/api/v1/projects/:projectId/photo/versions', photoController.listVersions.bind(photoController));
  app.post('/api/v1/projects/:projectId/photo/use-in-video', photoController.useInVideo.bind(photoController));
  app.get('/api/v1/projects/:projectId/photo/download-zip', photoController.downloadZip.bind(photoController));
}

