import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

describe('Fastify REST API Integration Tests', () => {
  let app: FastifyInstance;
  let testProjectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    await app.close();
  });

  it('GET /health returns 200 and healthy service metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('Studio Backend');
  });

  it('GET /api/v1/projects lists projects successfully', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /api/v1/projects creates a new project with default tracks', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: {
        title: 'Vitest Project Integration',
        description: 'Automated test suite validation',
        targetPlatform: 'youtube',
        aspectRatio: '16:9',
        resolution: '1080p',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.title).toBe('Vitest Project Integration');
    testProjectId = body.data.id;
  });

  it('GET /api/v1/projects/:id retrieves the created project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${testProjectId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(testProjectId);
    expect(body.data.timelineTracks.length).toBeGreaterThanOrEqual(2);
  });

  it('PATCH /api/v1/projects/:id updates project attributes', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${testProjectId}`,
      payload: {
        aspectRatio: '9:16',
        resolution: '720p',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.aspectRatio).toBe('9:16');
    expect(body.data.resolution).toBe('720p');
  });

  it('POST /api/v1/projects rejects invalid schema with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: {
        // missing required title
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });
});

