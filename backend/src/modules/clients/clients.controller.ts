import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { storageService, sanitizeWindowsName } from '../../services/storage/storage.service.js';

export const CreateClientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  description: z.string().optional(),
});

export const UpdateClientSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export class ClientsController {
  public async listClients(_req: FastifyRequest, reply: FastifyReply) {
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    return reply.send({ success: true, data: clients });
  }

  public async getClientById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        projects: {
          orderBy: { updatedAt: 'desc' },
          include: {
            _count: { select: { mediaAssets: true, versions: true, exportedFiles: true } },
            versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found' });
    }

    return reply.send({ success: true, data: client });
  }

  public async createClient(
    req: FastifyRequest<{ Body: z.infer<typeof CreateClientSchema> }>,
    reply: FastifyReply
  ) {
    const parse = CreateClientSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: parse.error.format() });
    }

    const name = parse.data.name.trim();

    // Check if client already exists
    const existing = await prisma.client.findUnique({
      where: { name },
    });

    if (existing) {
      return reply.status(200).send({ success: true, data: existing, message: 'Client already exists' });
    }

    const client = await prisma.client.create({
      data: {
        name,
        description: parse.data.description,
      },
    });

    // Create client folder on disk
    const safeClientName = sanitizeWindowsName(name);
    const clientDir = path.join(storageService.getClientsDir(), safeClientName);
    if (!fs.existsSync(clientDir)) {
      fs.mkdirSync(clientDir, { recursive: true });
    }

    return reply.status(201).send({ success: true, data: client });
  }

  public async updateClient(
    req: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateClientSchema> }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;
    const parse = UpdateClientSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: parse.error.format() });
    }

    const current = await prisma.client.findUnique({ where: { id } });
    if (!current) {
      return reply.status(404).send({ success: false, error: 'Client not found' });
    }

    const updated = await prisma.client.update({
      where: { id },
      data: {
        name: parse.data.name?.trim(),
        description: parse.data.description,
      },
    });

    // If name changed, rename folder on disk if old folder exists
    if (parse.data.name && parse.data.name.trim() !== current.name) {
      const oldSafe = sanitizeWindowsName(current.name);
      const newSafe = sanitizeWindowsName(parse.data.name.trim());
      const oldDir = path.join(storageService.getClientsDir(), oldSafe);
      const newDir = path.join(storageService.getClientsDir(), newSafe);
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        try {
          fs.renameSync(oldDir, newDir);
        } catch (e) {
          console.warn(`Could not rename client folder from ${oldDir} to ${newDir}:`, e);
        }
      }
    }

    return reply.send({ success: true, data: updated });
  }

  public async deleteClient(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;

    const current = await prisma.client.findUnique({ where: { id } });
    if (!current) {
      return reply.status(404).send({ success: false, error: 'Client not found' });
    }

    await prisma.client.delete({
      where: { id },
    });

    return reply.send({ success: true, message: 'Client deleted successfully' });
  }
}

export const clientsController = new ClientsController();

