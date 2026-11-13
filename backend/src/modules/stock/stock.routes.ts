import { FastifyInstance } from 'fastify';
import { stockController } from './stock.controller.js';

export async function stockRoutes(app: FastifyInstance) {
  // Key management & status
  app.get('/stock/status', stockController.getStatus.bind(stockController));
  app.post('/stock/test-key', stockController.testKey.bind(stockController));
  app.post('/stock/keys', stockController.saveKeys.bind(stockController));

  // Search stock media
  app.get('/stock/search', stockController.search.bind(stockController));

  // Import stock media into project
  app.post('/projects/:projectId/stock/import', stockController.importMedia.bind(stockController));

  // Neutral footage aliases
  app.get('/footage/status', stockController.getStatus.bind(stockController));
  app.post('/footage/test-key', stockController.testKey.bind(stockController));
  app.post('/footage/keys', stockController.saveKeys.bind(stockController));
  app.get('/footage/search', stockController.search.bind(stockController));
  app.post('/projects/:projectId/footage/import', stockController.importMedia.bind(stockController));

  // Get license info for an asset
  app.get('/media/:assetId/license', stockController.getAssetLicense.bind(stockController));
}

