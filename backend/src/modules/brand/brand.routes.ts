import { FastifyInstance } from 'fastify';
import { brandController } from './brand.controller.js';

export async function brandRoutes(app: FastifyInstance) {
  app.get('/', brandController.getBrandKit.bind(brandController));
  app.post('/', brandController.saveBrandKit.bind(brandController));
  app.post('/logo', brandController.uploadLogo.bind(brandController));
  app.get('/logo', brandController.getLogo.bind(brandController));
  app.delete('/logo', brandController.deleteLogo.bind(brandController));
}

