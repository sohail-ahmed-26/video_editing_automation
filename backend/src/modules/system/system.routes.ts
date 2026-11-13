import { FastifyInstance } from 'fastify';
import { systemController } from './system.controller.js';

export async function systemRoutes(app: FastifyInstance) {
  // Neutral system check
  app.get('/system/check', systemController.getSystemCheck.bind(systemController));

  // Storage usage and cache management
  app.get('/system/storage', systemController.getStorage.bind(systemController));
  app.post('/system/clean-cache', systemController.cleanCache.bind(systemController));
  app.post('/system/backup', systemController.createBackup.bind(systemController));
  app.get('/system/backups', systemController.listBackups.bind(systemController));
}

