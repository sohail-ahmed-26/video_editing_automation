import { FastifyInstance } from 'fastify';
import { clientsController } from './clients.controller.js';

export async function clientRoutes(app: FastifyInstance) {
  app.get('/', (req, reply) => clientsController.listClients(req, reply));
  app.get('/:id', (req: any, reply) => clientsController.getClientById(req, reply));
  app.post('/', (req: any, reply) => clientsController.createClient(req, reply));
  app.patch('/:id', (req: any, reply) => clientsController.updateClient(req, reply));
  app.delete('/:id', (req: any, reply) => clientsController.deleteClient(req, reply));
}

