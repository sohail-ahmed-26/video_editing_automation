import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { stockService, StockItem } from '../../services/stock/stock.service.js';

export const SaveKeysSchema = z.object({
  pexelsKey: z.string().optional(),
  pixabayKey: z.string().optional(),
});

export const TestKeySchema = z.object({
  provider: z.enum(['pexels', 'pixabay']),
  key: z.string().min(1),
});

export const StockSearchQuerySchema = z.object({
  q: z.string().default(''),
  type: z.enum(['video', 'photo']).default('video'),
  orientation: z.enum(['landscape', 'portrait', 'square', 'all']).default('landscape'),
  source: z.enum(['pexels', 'pixabay', 'all']).default('all'),
  page: z.coerce.number().min(1).default(1),
  per_page: z.coerce.number().min(5).max(40).default(20),
});

export const StockImportSchema = z.object({
  stockItem: z.object({
    id: z.string(),
    source: z.enum(['pexels', 'pixabay']),
    type: z.enum(['video', 'photo']),
    title: z.string(),
    thumbnailUrl: z.string(),
    previewVideoUrl: z.string().optional(),
    downloadUrl: z.string(),
    width: z.number(),
    height: z.number(),
    durationSeconds: z.number().optional(),
    creatorName: z.string(),
    creatorUrl: z.string(),
    pageUrl: z.string(),
    licenseUrl: z.string(),
  }),
});

export class StockController {
  /**
   * Returns current stock key configuration status (simple true/false states, no masked keys).
   */
  public async getStatus(_request: FastifyRequest, reply: FastifyReply) {
    const status = stockService.getStatus();
    return reply.send({
      success: true,
      data: {
        connected: Boolean(status.pexels.hasKey || status.pixabay.hasKey),
        configured: Boolean(status.pexels.configured || status.pixabay.configured),
        hasKey: Boolean(status.pexels.hasKey || status.pixabay.hasKey),
        pexels: { hasKey: status.pexels.hasKey, configured: status.pexels.configured },
        pixabay: { hasKey: status.pixabay.hasKey, configured: status.pixabay.configured },
      },
    });
  }

  /**
   * Tests a key without saving.
   */
  public async testKey(request: FastifyRequest, reply: FastifyReply) {
    const body = TestKeySchema.parse(request.body);

    if (body.provider === 'pexels') {
      const result = await stockService.testPexelsKey(body.key);
      return reply.send({
        success: result.valid,
        data: result,
      });
    }

    if (body.provider === 'pixabay') {
      const result = await stockService.testPixabayKey(body.key);
      return reply.send({
        success: result.valid,
        data: result,
      });
    }

    return reply.status(400).send({ success: false, error: 'Unknown provider' });
  }

  /**
   * Saves API keys to backend/.env and reloads in-memory config.
   */
  public async saveKeys(request: FastifyRequest, reply: FastifyReply) {
    const body = SaveKeysSchema.parse(request.body);
    const results = await stockService.saveKeys({
      pexelsKey: body.pexelsKey,
      pixabayKey: body.pixabayKey,
    });

    return reply.send({
      success: true,
      data: results,
    });
  }

  /**
   * Search stock videos and photos.
   */
  public async search(request: FastifyRequest, reply: FastifyReply) {
    const query = StockSearchQuerySchema.parse(request.query);

    const result = await stockService.searchStock({
      query: query.q,
      mediaType: query.type,
      orientation: query.orientation,
      source: query.source,
      page: query.page,
      perPage: query.per_page,
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Downloads and imports selected stock item into project's media library.
   */
  public async importMedia(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const body = StockImportSchema.parse(request.body);

    const imported = await stockService.downloadAndImportStockMedia({
      projectId,
      stockItem: body.stockItem as StockItem,
    });

    return reply.send({
      success: true,
      data: imported,
    });
  }

  /**
   * Retrieves license details for an imported asset.
   */
  public async getAssetLicense(request: FastifyRequest, reply: FastifyReply) {
    const { assetId } = request.params as { assetId: string };
    const license = await stockService.getMediaLicense(assetId);

    if (!license) {
      return reply.status(404).send({
        success: false,
        error: 'No stock license metadata found for this asset.',
      });
    }

    return reply.send({
      success: true,
      data: license,
    });
  }
}

export const stockController = new StockController();

