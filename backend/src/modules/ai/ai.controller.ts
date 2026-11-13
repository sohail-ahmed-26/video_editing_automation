import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { geminiPlannerService } from '../../services/gemini/gemini-planner.service.js';

export const SaveKeySchema = z.object({
  apiKey: z.string().min(1, 'API key cannot be empty'),
});

export const SaveSettingsSchema = z.object({
  visionEnabled: z.boolean().optional(),
  whisperModel: z.enum(['tiny', 'base', 'small', 'medium']).optional(),
  whisperLanguage: z.enum(['auto', 'en', 'ur', 'hi', 'ar']).optional(),
});

export class AIController {
  /**
   * GET /api/v1/ai/status and /api/v1/service/status
   */
  public async getStatus(_req: FastifyRequest, reply: FastifyReply) {
    const status = await geminiPlannerService.checkStatus();
    return reply.send({
      success: true,
      data: {
        online: Boolean(status.online),
        hasKey: Boolean(status.hasKey),
        visionEnabled: Boolean(status.visionEnabled),
      },
    });
  }

  /**
   * POST /api/v1/ai/key and /api/v1/service/key
   */
  public async testAndSaveKey(
    req: FastifyRequest<{ Body: z.infer<typeof SaveKeySchema> }>,
    reply: FastifyReply
  ) {
    const parsed = SaveKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Please provide a valid key.',
      });
    }

    const { apiKey } = parsed.data;
    const result = await geminiPlannerService.testAndSaveKey(apiKey);

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: 'Failed to verify edit service key.',
      });
    }

    const status = await geminiPlannerService.checkStatus();

    return reply.send({
      success: true,
      message: 'Edit service key verified and saved.',
      data: {
        online: Boolean(status.online),
        hasKey: Boolean(status.hasKey),
      },
    });
  }

  /**
   * POST /api/v1/ai/settings
   */
  public async updateSettings(
    req: FastifyRequest<{ Body: z.infer<typeof SaveSettingsSchema> }>,
    reply: FastifyReply
  ) {
    const parsed = SaveSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid settings payload',
      });
    }

    geminiPlannerService.updateAiSettings(parsed.data);
    const status = await geminiPlannerService.checkStatus();

    return reply.send({
      success: true,
      data: status,
    });
  }
}

export const aiController = new AIController();

