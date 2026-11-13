import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import { env } from './config/env.js';
import { clientRoutes } from './modules/clients/clients.routes.js';
import { projectRoutes } from './modules/projects/projects.routes.js';
import { uploadRoutes } from './modules/uploads/uploads.routes.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { aiDirectorRoutes } from './modules/ai-director/ai-director.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { editingRoutes } from './modules/editing/editing.routes.js';
import { renderingRoutes } from './modules/rendering/rendering.routes.js';
import { jobRoutes } from './modules/jobs/jobs.routes.js';
import { brandRoutes } from './modules/brand/brand.routes.js';
import { musicRoutes } from './modules/music/music.routes.js';
import { photoRoutes } from './modules/photo/photo.routes.js';
import { stockRoutes } from './modules/stock/stock.routes.js';
import { systemRoutes } from './modules/system/system.routes.js';
import { systemService } from './services/system/system.service.js';
import { storageService } from './services/storage/storage.service.js';
import { prisma } from './config/database.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'error',
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB JSON body limit
  });

  // Plugins
  await app.register(sensible);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        cb(null, true);
        return;
      }
      cb(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_BYTES,
    },
  });

  // Ensure .quality.json metadata files are never served to the browser or downloaded
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.toLowerCase().includes('.quality.json')) {
      return reply.status(404).send({ success: false, error: 'Not found' });
    }
  });

  // Serve static files from storage directory
  const storagePath = storageService.getBaseDir();
  await app.register(fastifyStatic, {
    root: storagePath,
    prefix: '/storage/',
    decorateReply: false,
  });

  // Strip X-Powered-By and Server headers from all responses and sanitize body payload
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.removeHeader('X-Powered-By');
    reply.removeHeader('x-powered-by');
    reply.removeHeader('Server');
    reply.removeHeader('server');

    if (typeof payload === 'string') {
      let sanitized = payload;
      // Mask full local file paths
      sanitized = sanitized.replace(/[a-zA-Z]:\\[Uu]sers\\[^\s"'\\]+(?:\\[^\s"'\\]+)*/g, '[path]');
      sanitized = sanitized.replace(/\/(Users|home|var|usr|etc)\/[^\s"'/]+(?:\/[^\s"'/]+)*/g, '[path]');
      // Mask forbidden vendor/tool names
      sanitized = sanitized.replace(
        /\b(gemini|google|ollama|whisper|ffmpeg|ffprobe|libx264|onnx|u2net|pexels|pixabay|fastify|sqlite|prisma)\b/gi,
        'service'
      );
      if (sanitized !== payload) {
        reply.header('content-length', Buffer.byteLength(sanitized));
        return sanitized;
      }
    }
    return payload;
  });

  // Centralized Sanitized Error Handler (no stack traces or file paths to client)
  app.setErrorHandler((error: any, request, reply) => {
    // Keep detailed errors in backend console / log only
    console.error(`[Backend Error] ${request.method} ${request.url}:`, error.message, error.stack);

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    if (statusCode >= 500) {
      return reply.status(statusCode).send({
        success: false,
        error: 'An internal error occurred. Please try again.',
      });
    }

    // Sanitize any 4xx error message
    let safeMessage = error.message || 'Request failed';
    safeMessage = safeMessage.replace(/[a-zA-Z]:\\[^\s"']+/g, '[path]');
    safeMessage = safeMessage.replace(/\/(Users|home|var|usr|etc)\/[^\s"']+/g, '[path]');
    safeMessage = safeMessage.replace(
      /\b(gemini|google|ollama|whisper|ffmpeg|ffprobe|libx264|onnx|u2net|pexels|pixabay|prisma|sqlite|fastify|node)\b/gi,
      'service'
    );

    return reply.status(statusCode).send({
      success: false,
      error: safeMessage,
    });
  });

  // Neutral 404 Handler
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: 'Resource not found',
    });
  });

  // Public health check: returns only {"status":"ok"} (or {"status":"error"}) and nothing else
  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      return reply.send({ status: 'ok' });
    } catch {
      return reply.status(500).send({ status: 'error' });
    }
  });

  app.get('/api/health', async (_req, reply) => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      return reply.send({ status: 'ok' });
    } catch {
      return reply.status(500).send({ status: 'error' });
    }
  });

  // API v1 routes
  await app.register(
    async (v1) => {
      await v1.register(clientRoutes, { prefix: '/clients' });
      await v1.register(projectRoutes, { prefix: '/projects' });
      await v1.register(uploadRoutes, { prefix: '/uploads' });
      await v1.register(mediaRoutes, { prefix: '/media' });
      await v1.register(aiRoutes, { prefix: '/ai' });
      await v1.register(aiRoutes, { prefix: '/service' });
      await v1.register(aiDirectorRoutes, { prefix: '/ai-director' });
      await v1.register(editingRoutes, { prefix: '/editing' });
      await v1.register(renderingRoutes, { prefix: '/rendering' });
      await v1.register(jobRoutes, { prefix: '/jobs' });
      await v1.register(brandRoutes, { prefix: '/brand' });
      await v1.register(musicRoutes, { prefix: '/music' });
      await v1.register(photoRoutes);
      await v1.register(stockRoutes);
      await v1.register(systemRoutes);
    },
    { prefix: '/api/v1' }
  );

  return app;
}
