import { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { brandService } from '../../services/brand/brand.service.js';
import { storageService } from '../../services/storage/storage.service.js';

export const UpdateBrandKitSchema = z.object({
  brandName: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  fontFamily: z.string().optional(),
  watermarkPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
  watermarkOpacity: z.number().min(0).max(100).optional(),
  watermarkSizePercent: z.number().min(5).max(50).optional(),
  logoDataUrl: z.string().nullable().optional(),
});

export class BrandController {
  public async getBrandKit(req: FastifyRequest, reply: FastifyReply) {
    const kit = brandService.getBrandKit();
    return reply.send({ success: true, data: kit });
  }

  public async saveBrandKit(
    req: FastifyRequest<{ Body: z.infer<typeof UpdateBrandKitSchema> }>,
    reply: FastifyReply
  ) {
    const parsed = UpdateBrandKitSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    const { logoDataUrl, ...data } = parsed.data;

    let kit = brandService.saveBrandKit(data);

    if (logoDataUrl) {
      brandService.saveLogoFromBase64(logoDataUrl);
      kit = brandService.getBrandKit();
    } else if (logoDataUrl === null) {
      brandService.removeLogo();
      kit = brandService.getBrandKit();
    }

    return reply.send({ success: true, data: kit });
  }

  public async uploadLogo(req: FastifyRequest, reply: FastifyReply) {
    const isMultipart = req.isMultipart();
    if (!isMultipart) {
      return reply.status(400).send({ success: false, error: 'Expected multipart/form-data upload' });
    }

    const parts = req.parts();
    let tempPath: string | null = null;
    let filename = 'logo.png';

    for await (const part of parts) {
      if (part.type === 'file') {
        filename = part.filename;
        tempPath = storageService.getTempPath(`brand_upload_${Date.now()}_${filename}`);
        const ws = fs.createWriteStream(tempPath);
        await part.file.pipe(ws);
      }
    }

    if (!tempPath || !fs.existsSync(tempPath)) {
      return reply.status(400).send({ success: false, error: 'No logo file received' });
    }

    const { logoUrl } = brandService.saveLogoFile(tempPath, filename);
    const updatedKit = brandService.getBrandKit();

    return reply.send({ success: true, data: updatedKit, logoUrl });
  }

  public async getLogo(req: FastifyRequest, reply: FastifyReply) {
    const kit = brandService.getBrandKit();
    if (!kit.logoPath || !fs.existsSync(kit.logoPath)) {
      return reply.status(404).send({ success: false, error: 'Brand logo not found' });
    }

    const ext = path.extname(kit.logoPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const contentType = mimeMap[ext] || 'image/png';

    const stream = fs.createReadStream(kit.logoPath);
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(stream);
  }

  public async deleteLogo(_req: FastifyRequest, reply: FastifyReply) {
    brandService.removeLogo();
    const updatedKit = brandService.getBrandKit();
    return reply.send({ success: true, data: updatedKit, message: 'Brand logo removed' });
  }
}

export const brandController = new BrandController();

