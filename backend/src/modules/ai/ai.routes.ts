import { FastifyInstance } from 'fastify';
import { aiController } from './ai.controller.js';

export async function aiRoutes(app: FastifyInstance) {
  app.get('/status', aiController.getStatus.bind(aiController));
  app.post('/key', aiController.testAndSaveKey.bind(aiController));
  app.post('/settings', aiController.updateSettings.bind(aiController));
}

