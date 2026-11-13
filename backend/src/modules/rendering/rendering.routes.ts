import { FastifyInstance } from 'fastify';
import { renderingController } from './rendering.controller.js';

export async function renderingRoutes(app: FastifyInstance) {
  app.post('/render', renderingController.createRenderJob.bind(renderingController));
  app.get('/jobs/:jobId', renderingController.getRenderJob.bind(renderingController));
  app.post('/jobs/:jobId/cancel', renderingController.cancelRenderJob.bind(renderingController));
  app.get('/hardware-encoder', renderingController.getHardwareEncoder.bind(renderingController));
  app.get('/projects/:projectId/exports', renderingController.listProjectExports.bind(renderingController));
  app.get('/exports/:exportId/download', renderingController.downloadExport.bind(renderingController));
}
