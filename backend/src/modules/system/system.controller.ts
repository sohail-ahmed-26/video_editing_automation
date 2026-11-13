import { FastifyReply, FastifyRequest } from 'fastify';
import { systemService } from '../../services/system/system.service.js';

export class SystemController {
  public async getSystemCheck(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const check = await systemService.getSystemCheck();
      return reply.send({ success: true, data: check });
    } catch {
      return reply.status(500).send({
        success: false,
        error: 'System check failed',
      });
    }
  }

  public async getHealth(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ status: 'ok' });
  }

  public async getStorage(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const storage = await systemService.getStorageOverview();
      return reply.send({ success: true, data: storage });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to retrieve storage overview',
      });
    }
  }

  public async cleanCache(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await systemService.cleanCache();
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to clean cache',
      });
    }
  }

  public async createBackup(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await systemService.createBackup();
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to create backup',
      });
    }
  }

  public async listBackups(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const list = await systemService.listBackups();
      return reply.send({ success: true, data: list });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to list backups',
      });
    }
  }
}

export const systemController = new SystemController();

