import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { env, getMaskedApiKey, updateEnvFile } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { storageService } from '../storage/storage.service.js';
import { previewService, isPhotoMedia } from '../preview/preview.service.js';

export type StockMediaType = 'video' | 'photo';
export type StockSource = 'pexels' | 'pixabay' | 'all';
export type StockOrientation = 'landscape' | 'portrait' | 'square' | 'all';

export interface StockItem {
  id: string;
  source: 'pexels' | 'pixabay';
  type: StockMediaType;
  title: string;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  downloadUrl: string;
  width: number;
  height: number;
  durationSeconds?: number;
  creatorName: string;
  creatorUrl: string;
  pageUrl: string;
  licenseUrl: string;
}

export interface StockLicenseMeta {
  source: 'Pexels' | 'Pixabay';
  pageUrl: string;
  creatorName: string;
  creatorUrl?: string;
  licenseUrl: string;
  licenseName: string;
  importedAt: string;
  stockId: string;
  mediaType: StockMediaType;
  originalTitle?: string;
}

export interface StockSearchOptions {
  query: string;
  mediaType?: StockMediaType;
  orientation?: StockOrientation;
  source?: StockSource;
  page?: number;
  perPage?: number;
}

export interface StockSearchResponse {
  items: StockItem[];
  page: number;
  perPage: number;
  totalHits: number;
  source: string;
  hasPexelsKey: boolean;
  hasPixabayKey: boolean;
  rateLimitWarning?: string | null;
  cached?: boolean;
}

interface CacheEntry {
  data: StockSearchResponse;
  expiresAt: number;
}

export class StockService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
  private readonly TIMEOUT_MS = 60 * 1000; // 60 seconds timeout
  private readonly MAX_RETRIES = 3;

  /**
   * Returns current stock API key configuration status (masked keys only).
   */
  public getStatus(): {
    pexels: { hasKey: boolean; maskedKey: string | null; configured: boolean };
    pixabay: { hasKey: boolean; maskedKey: string | null; configured: boolean };
  } {
    const pexelsKey = env.PEXELS_API_KEY ? env.PEXELS_API_KEY.trim() : '';
    const pixabayKey = env.PIXABAY_API_KEY ? env.PIXABAY_API_KEY.trim() : '';

    return {
      pexels: {
        hasKey: pexelsKey.length > 0,
        maskedKey: getMaskedApiKey(pexelsKey),
        configured: pexelsKey.length > 0,
      },
      pixabay: {
        hasKey: pixabayKey.length > 0,
        maskedKey: getMaskedApiKey(pixabayKey),
        configured: pixabayKey.length > 0,
      },
    };
  }

  /**
   * Verifies a Pexels API key against official Pexels API.
   */
  public async testPexelsKey(key: string): Promise<{ valid: boolean; error?: string }> {
    const trimmed = key.trim();
    if (!trimmed) {
      return { valid: false, error: 'Footage key is empty.' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const res = await fetch('https://api.pexels.com/v1/curated?per_page=1', {
        headers: {
          Authorization: trimmed,
          'User-Agent': 'Studio/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 200) {
        return { valid: true };
      }
      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: 'Invalid footage key.' };
      }
      if (res.status === 429) {
        return { valid: true, error: 'Key is valid but rate limit reached.' };
      }
      return { valid: false, error: `Footage service responded with status ${res.status}.` };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { valid: false, error: 'Footage verification timed out after 60 seconds.' };
      }
      return { valid: false, error: err?.message || 'Network connection failed.' };
    }
  }

  /**
   * Verifies a Pixabay API key against official Pixabay API.
   */
  public async testPixabayKey(key: string): Promise<{ valid: boolean; error?: string }> {
    const trimmed = key.trim();
    if (!trimmed) {
      return { valid: false, error: 'Footage key is empty.' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const res = await fetch(
        `https://pixabay.com/api/?key=${encodeURIComponent(trimmed)}&q=nature&per_page=3`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (res.status === 200) {
        const json = (await res.json()) as any;
        if (Array.isArray(json?.hits)) {
          return { valid: true };
        }
      }
      if (res.status === 400 || res.status === 401) {
        return { valid: false, error: 'Invalid footage key.' };
      }
      if (res.status === 429) {
        return { valid: true, error: 'Key is valid but rate limit reached.' };
      }
      return { valid: false, error: `Footage service responded with status ${res.status}.` };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { valid: false, error: 'Footage verification timed out after 60 seconds.' };
      }
      return { valid: false, error: err?.message || 'Network connection failed.' };
    }
  }

  /**
   * Saves API keys safely in backend/.env and updates process.env in memory.
   */
  public async saveKeys(keys: {
    pexelsKey?: string;
    pixabayKey?: string;
  }): Promise<{
    pexels: { valid: boolean; error?: string; maskedKey: string | null };
    pixabay: { valid: boolean; error?: string; maskedKey: string | null };
  }> {
    const updates: Record<string, string> = {};
    const result = {
      pexels: { valid: false as boolean, error: undefined as string | undefined, maskedKey: null as string | null },
      pixabay: { valid: false as boolean, error: undefined as string | undefined, maskedKey: null as string | null },
    };

    if (keys.pexelsKey !== undefined) {
      const pKey = keys.pexelsKey.trim();
      if (pKey) {
        const testRes = await this.testPexelsKey(pKey);
        result.pexels = {
          valid: testRes.valid,
          error: testRes.error,
          maskedKey: getMaskedApiKey(pKey),
        };
        if (testRes.valid) {
          updates.PEXELS_API_KEY = pKey;
        }
      } else {
        updates.PEXELS_API_KEY = '';
        result.pexels = { valid: false, error: undefined, maskedKey: null };
      }
    } else {
      const existing = env.PEXELS_API_KEY || '';
      result.pexels = {
        valid: existing.length > 0,
        error: undefined,
        maskedKey: getMaskedApiKey(existing),
      };
    }

    if (keys.pixabayKey !== undefined) {
      const pxKey = keys.pixabayKey.trim();
      if (pxKey) {
        const testRes = await this.testPixabayKey(pxKey);
        result.pixabay = {
          valid: testRes.valid,
          error: testRes.error,
          maskedKey: getMaskedApiKey(pxKey),
        };
        if (testRes.valid) {
          updates.PIXABAY_API_KEY = pxKey;
        }
      } else {
        updates.PIXABAY_API_KEY = '';
        result.pixabay = { valid: false, error: undefined, maskedKey: null };
      }
    } else {
      const existing = env.PIXABAY_API_KEY || '';
      result.pixabay = {
        valid: existing.length > 0,
        error: undefined,
        maskedKey: getMaskedApiKey(existing),
      };
    }

    if (Object.keys(updates).length > 0) {
      updateEnvFile(updates);
      // Clear cache on key update
      this.cache.clear();
    }

    return result;
  }

  /**
   * Unified search across Pexels and/or Pixabay.
   */
  public async searchStock(options: StockSearchOptions): Promise<StockSearchResponse> {
    const query = (options.query || '').trim();
    const mediaType: StockMediaType = options.mediaType || 'video';
    const orientation: StockOrientation = options.orientation || 'landscape';
    const source: StockSource = options.source || 'all';
    const page = Math.max(1, options.page || 1);
    const perPage = Math.min(40, Math.max(5, options.perPage || 20));

    const pexelsKey = env.PEXELS_API_KEY ? env.PEXELS_API_KEY.trim() : '';
    const pixabayKey = env.PIXABAY_API_KEY ? env.PIXABAY_API_KEY.trim() : '';

    const hasPexelsKey = pexelsKey.length > 0;
    const hasPixabayKey = pixabayKey.length > 0;

    // Cache lookup
    const cacheKey = `${source}_${mediaType}_${query.toLowerCase()}_${orientation}_${page}_${perPage}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return {
        ...cached.data,
        cached: true,
        hasPexelsKey,
        hasPixabayKey,
      };
    }

    if (!query) {
      return {
        items: [],
        page,
        perPage,
        totalHits: 0,
        source,
        hasPexelsKey,
        hasPixabayKey,
      };
    }

    const tasks: Array<Promise<{ items: StockItem[]; totalHits: number; error?: string }>> = [];

    // 1. Pexels search task
    if ((source === 'all' || source === 'pexels') && hasPexelsKey) {
      tasks.push(
        this.searchPexels({
          query,
          mediaType,
          orientation,
          page,
          perPage: source === 'all' ? Math.ceil(perPage / 2) : perPage,
          apiKey: pexelsKey,
        })
      );
    }

    // 2. Pixabay search task
    if ((source === 'all' || source === 'pixabay') && hasPixabayKey) {
      tasks.push(
        this.searchPixabay({
          query,
          mediaType,
          orientation,
          page,
          perPage: source === 'all' ? Math.ceil(perPage / 2) : perPage,
          apiKey: pixabayKey,
        })
      );
    }

    if (tasks.length === 0) {
      return {
        items: [],
        page,
        perPage,
        totalHits: 0,
        source,
        hasPexelsKey,
        hasPixabayKey,
        rateLimitWarning: 'No stock API keys configured. Please add your Pexels or Pixabay key in Settings > Stock Media.',
      };
    }

    const settled = await Promise.allSettled(tasks);
    const combinedItems: StockItem[] = [];
    let combinedTotal = 0;
    let rateLimitWarning: string | null = null;

    for (const res of settled) {
      if (res.status === 'fulfilled') {
        combinedItems.push(...res.value.items);
        combinedTotal += res.value.totalHits;
        if (res.value.error) {
          rateLimitWarning = res.value.error;
        }
      } else {
        console.warn('[StockService] Search task rejected:', res.reason);
      }
    }

    const response: StockSearchResponse = {
      items: combinedItems,
      page,
      perPage,
      totalHits: combinedTotal,
      source,
      hasPexelsKey,
      hasPixabayKey,
      rateLimitWarning,
    };

    // Store in cache
    this.cache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return response;
  }

  /**
   * Search Pexels for Photos or Videos.
   */
  private async searchPexels(opts: {
    query: string;
    mediaType: StockMediaType;
    orientation: StockOrientation;
    page: number;
    perPage: number;
    apiKey: string;
  }): Promise<{ items: StockItem[]; totalHits: number; error?: string }> {
    let pexelsOrientation = 'landscape';
    if (opts.orientation === 'portrait') pexelsOrientation = 'portrait';
    else if (opts.orientation === 'square') pexelsOrientation = 'square';

    const isVideo = opts.mediaType === 'video';
    const baseUrl = isVideo
      ? 'https://api.pexels.com/videos/search'
      : 'https://api.pexels.com/v1/search';

    const url = new URL(baseUrl);
    url.searchParams.set('query', opts.query);
    url.searchParams.set('page', String(opts.page));
    url.searchParams.set('per_page', String(opts.perPage));
    if (opts.orientation !== 'all') {
      url.searchParams.set('orientation', pexelsOrientation);
    }

    const response = await this.fetchWithRetry(url.toString(), {
      headers: {
        Authorization: opts.apiKey,
        'User-Agent': 'Studio/1.0',
      },
    });

    if (response.status === 429) {
      return {
        items: [],
        totalHits: 0,
        error: 'Footage service rate limit reached. Please wait a moment.',
      };
    }

    if (!response.ok) {
      return {
        items: [],
        totalHits: 0,
        error: `Footage service responded with status ${response.status}`,
      };
    }

    const json = (await response.json()) as any;
    const items: StockItem[] = [];

    if (isVideo && Array.isArray(json.videos)) {
      for (const v of json.videos) {
        // Pick best video file: prefer HD (1080p), fallback to highest resolution available
        const videoFiles = Array.isArray(v.video_files) ? v.video_files : [];
        if (videoFiles.length === 0) continue;

        // Sort by width descending, preferring 1080p
        const sorted = [...videoFiles].sort((a, b) => (b.width || 0) - (a.width || 0));
        const hdFile = sorted.find((f) => f.quality === 'hd' && (f.width === 1920 || f.height === 1920)) ||
          sorted.find((f) => f.quality === 'hd') ||
          sorted[0];

        // Find lower quality for fast preview if available
        const previewFile = sorted.find((f) => f.quality === 'sd') || sorted[sorted.length - 1];

        items.push({
          id: `pexels_video_${v.id}`,
          source: 'pexels',
          type: 'video',
          title: `Pexels Video by ${v.user?.name || 'Creator'}`,
          thumbnailUrl: v.image || '',
          previewVideoUrl: previewFile?.link || hdFile?.link,
          downloadUrl: hdFile?.link || sorted[0].link,
          width: hdFile?.width || v.width,
          height: hdFile?.height || v.height,
          durationSeconds: v.duration || 0,
          creatorName: v.user?.name || 'Pexels Contributor',
          creatorUrl: v.user?.url || 'https://www.pexels.com',
          pageUrl: v.url || 'https://www.pexels.com',
          licenseUrl: 'https://www.pexels.com/license/',
        });
      }
      return { items, totalHits: json.total_results || items.length };
    }

    if (!isVideo && Array.isArray(json.photos)) {
      for (const p of json.photos) {
        const downloadUrl = p.src?.large2x || p.src?.large || p.src?.original;
        if (!downloadUrl) continue;

        items.push({
          id: `pexels_photo_${p.id}`,
          source: 'pexels',
          type: 'photo',
          title: p.alt || `Pexels Photo by ${p.photographer || 'Creator'}`,
          thumbnailUrl: p.src?.medium || p.src?.small || downloadUrl,
          downloadUrl,
          width: p.width,
          height: p.height,
          creatorName: p.photographer || 'Pexels Contributor',
          creatorUrl: p.photographer_url || 'https://www.pexels.com',
          pageUrl: p.url || 'https://www.pexels.com',
          licenseUrl: 'https://www.pexels.com/license/',
        });
      }
      return { items, totalHits: json.total_results || items.length };
    }

    return { items: [], totalHits: 0 };
  }

  /**
   * Search Pixabay for Photos or Videos.
   */
  private async searchPixabay(opts: {
    query: string;
    mediaType: StockMediaType;
    orientation: StockOrientation;
    page: number;
    perPage: number;
    apiKey: string;
  }): Promise<{ items: StockItem[]; totalHits: number; error?: string }> {
    let pixabayOrientation = 'all';
    if (opts.orientation === 'landscape') pixabayOrientation = 'horizontal';
    else if (opts.orientation === 'portrait') pixabayOrientation = 'vertical';

    const isVideo = opts.mediaType === 'video';
    const baseUrl = isVideo
      ? 'https://pixabay.com/api/videos/'
      : 'https://pixabay.com/api/';

    const url = new URL(baseUrl);
    url.searchParams.set('key', opts.apiKey);
    url.searchParams.set('q', opts.query);
    url.searchParams.set('page', String(opts.page));
    url.searchParams.set('per_page', String(opts.perPage));
    if (pixabayOrientation !== 'all') {
      url.searchParams.set('orientation', pixabayOrientation);
    }
    if (!isVideo) {
      url.searchParams.set('image_type', 'photo');
    }

    const response = await this.fetchWithRetry(url.toString());

    if (response.status === 429) {
      return {
        items: [],
        totalHits: 0,
        error: 'Footage service rate limit reached. Please wait a moment.',
      };
    }

    if (!response.ok) {
      return {
        items: [],
        totalHits: 0,
        error: `Footage service responded with status ${response.status}`,
      };
    }

    const json = (await response.json()) as any;
    const items: StockItem[] = [];

    if (Array.isArray(json.hits)) {
      for (const hit of json.hits) {
        if (isVideo) {
          const vLarge = hit.videos?.large;
          const vMedium = hit.videos?.medium;
          const vSmall = hit.videos?.small;
          const vTiny = hit.videos?.tiny;

          const chosen = vLarge?.url ? vLarge : vMedium?.url ? vMedium : vSmall;
          if (!chosen?.url) continue;

          // Thumbnail URL from Pixabay picture_id
          const thumb = hit.picture_id
            ? `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`
            : hit.userImageURL || '';

          items.push({
            id: `pixabay_video_${hit.id}`,
            source: 'pixabay',
            type: 'video',
            title: hit.tags || `Pixabay Video by ${hit.user}`,
            thumbnailUrl: thumb,
            previewVideoUrl: vSmall?.url || vTiny?.url || chosen.url,
            downloadUrl: chosen.url,
            width: chosen.width || 1920,
            height: chosen.height || 1080,
            durationSeconds: hit.duration || 0,
            creatorName: hit.user || 'Pixabay Creator',
            creatorUrl: hit.user ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : 'https://pixabay.com',
            pageUrl: hit.pageURL || 'https://pixabay.com',
            licenseUrl: 'https://pixabay.com/service/license-summary/',
          });
        } else {
          const downloadUrl = hit.largeImageURL || hit.webformatURL;
          if (!downloadUrl) continue;

          items.push({
            id: `pixabay_photo_${hit.id}`,
            source: 'pixabay',
            type: 'photo',
            title: hit.tags || `Pixabay Photo by ${hit.user}`,
            thumbnailUrl: hit.webformatURL || downloadUrl,
            downloadUrl,
            width: hit.imageWidth || 1920,
            height: hit.imageHeight || 1080,
            creatorName: hit.user || 'Pixabay Creator',
            creatorUrl: hit.user ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : 'https://pixabay.com',
            pageUrl: hit.pageURL || 'https://pixabay.com',
            licenseUrl: 'https://pixabay.com/service/license-summary/',
          });
        }
      }
    }

    return { items, totalHits: json.totalHits || json.total || items.length };
  }

  /**
   * Downloads and imports a chosen stock item into the project's raw directory,
   * saves full license metadata, registers MediaAsset in DB, and generates preview/thumbnail.
   */
  public async downloadAndImportStockMedia(options: {
    projectId: string;
    clientId?: string;
    stockItem: StockItem;
    onProgress?: (progressPercent: number) => void;
  }): Promise<{ asset: any; license: StockLicenseMeta }> {
    const { projectId, stockItem } = options;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found.`);
    }

    const clientName = project.client?.name || options.clientId || 'General';
    const dirs = storageService.getProjectDirs(clientName, project.title);

    if (!fs.existsSync(dirs.rawDir)) {
      fs.mkdirSync(dirs.rawDir, { recursive: true });
    }

    // Determine extension
    const isVideo = stockItem.type === 'video';
    const urlObj = new URL(stockItem.downloadUrl);
    let ext = path.extname(urlObj.pathname).toLowerCase();
    if (!ext || ext.length > 5) {
      ext = isVideo ? '.mp4' : '.jpg';
    }

    // Build unique sanitized filename
    const safeTitle = (stockItem.title || 'stock_media')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const finalFilename = `stock_${stockItem.source}_${safeTitle}_${Date.now()}${ext}`;
    const destinationPath = path.join(dirs.rawDir, finalFilename);
    const tempPath = path.join(dirs.rawDir, `${finalFilename}.tmp`);

    // Download with atomic write (download to .tmp, verify size, then rename)
    try {
      await this.downloadFileWithRetry(stockItem.downloadUrl, tempPath, options.onProgress);
      fs.renameSync(tempPath, destinationPath);
    } catch (err: any) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {}
      }
      throw new Error(`Failed to download stock media: ${err?.message || err}`);
    }

    const stat = fs.statSync(destinationPath);
    if (stat.size === 0) {
      fs.unlinkSync(destinationPath);
      throw new Error('Downloaded file was empty (0 bytes).');
    }

    // Prepare license metadata
    const licenseMeta: StockLicenseMeta = {
      source: stockItem.source === 'pexels' ? 'Pexels' : 'Pixabay',
      pageUrl: stockItem.pageUrl,
      creatorName: stockItem.creatorName,
      creatorUrl: stockItem.creatorUrl,
      licenseUrl: stockItem.licenseUrl,
      licenseName: stockItem.source === 'pexels' ? 'Pexels License (Free to use)' : 'Pixabay Content License (Free for commercial use)',
      importedAt: new Date().toISOString(),
      stockId: stockItem.id,
      mediaType: stockItem.type,
      originalTitle: stockItem.title,
    };

    // Save .license.json in project raw folder alongside media file
    const licenseFilePath = `${destinationPath}.license.json`;
    fs.writeFileSync(licenseFilePath, JSON.stringify(licenseMeta, null, 2), 'utf-8');

    // Register MediaAsset in Prisma database
    const mimeType = isVideo
      ? 'video/mp4'
      : ext === '.png'
      ? 'image/png'
      : ext === '.webp'
      ? 'image/webp'
      : 'image/jpeg';

    const asset = await prisma.mediaAsset.create({
      data: {
        projectId: project.id,
        filename: finalFilename,
        originalName: `${stockItem.source.toUpperCase()} - ${stockItem.title || 'Stock Media'}${ext}`,
        storagePath: destinationPath,
        fileSizeBytes: stat.size,
        mimeType,
        durationSeconds: stockItem.durationSeconds || (isVideo ? 10 : 0),
        width: stockItem.width || 1920,
        height: stockItem.height || 1080,
        status: 'analyzed',
      },
    });

    // Save license into project.preferencesJson in database
    let preferences: any = {};
    try {
      if (project.preferencesJson) preferences = JSON.parse(project.preferencesJson);
    } catch {}

    if (!preferences.stockLicenses) {
      preferences.stockLicenses = {};
    }
    preferences.stockLicenses[asset.id] = licenseMeta;

    await prisma.project.update({
      where: { id: project.id },
      data: {
        preferencesJson: JSON.stringify(preferences),
      },
    });

    // Run preview and thumbnail generation pipeline
    try {
      await previewService.processMediaPreview(asset.id);
    } catch (previewErr) {
      console.warn(`[StockService] Preview generation warning for ${asset.id}:`, previewErr);
    }

    // Update project.json on disk
    try {
      const remaining = await prisma.mediaAsset.findMany({
        where: { projectId: project.id },
        include: { metadata: true },
        orderBy: { createdAt: 'asc' },
      });

      storageService.saveProjectJson(clientName, project.title, {
        id: project.id,
        title: project.title,
        client: clientName,
        status: project.status,
        targetPlatform: project.targetPlatform,
        aspectRatio: project.aspectRatio,
        resolution: project.resolution,
        durationSeconds: project.durationSeconds,
        rawPrompt: project.rawPrompt,
        tags: project.tagsJson ? JSON.parse(project.tagsJson) : [],
        preferences,
        mediaAssets: remaining.map((r: any) => ({
          id: r.id,
          filename: r.filename,
          originalName: r.originalName,
          mimeType: r.mimeType,
          fileSizeBytes: r.fileSizeBytes,
          durationSeconds: r.durationSeconds,
          width: r.width,
          height: r.height,
          isPhoto: isPhotoMedia(r.originalName || r.filename, r.mimeType),
          status: r.status,
          stockLicense: preferences.stockLicenses?.[r.id] || null,
        })),
        createdAt: project.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (pjErr) {
      console.warn('[StockService] Warning saving project.json:', pjErr);
    }

    const previewInfo = previewService.getStatus(
      asset.id,
      asset.storagePath,
      asset.originalName || asset.filename,
      asset.mimeType
    );

    return {
      asset: {
        ...asset,
        publicUrl: storageService.getPublicUrl(asset.storagePath),
        previewUrl: previewInfo.previewUrl,
        previewStatus: previewInfo.status,
        isPhoto: !isVideo,
        stockLicense: licenseMeta,
      },
      license: licenseMeta,
    };
  }

  /**
   * Retrieves license metadata for a specific media asset if it was imported from stock.
   */
  public async getMediaLicense(assetId: string): Promise<StockLicenseMeta | null> {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { project: true },
    });

    if (!asset) return null;

    // Check sidecar file first
    const sidecarPath = `${asset.storagePath}.license.json`;
    if (fs.existsSync(sidecarPath)) {
      try {
        const raw = fs.readFileSync(sidecarPath, 'utf-8');
        return JSON.parse(raw);
      } catch {}
    }

    // Check project.preferencesJson
    if (asset.project?.preferencesJson) {
      try {
        const pref = JSON.parse(asset.project.preferencesJson);
        if (pref.stockLicenses && pref.stockLicenses[asset.id]) {
          return pref.stockLicenses[asset.id];
        }
      } catch {}
    }

    return null;
  }

  /**
   * Robust fetch with automatic retry (up to 3 times) and 60-second timeouts.
   */
  private async fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return res;
      } catch (err: any) {
        lastError = err;
        console.warn(`[StockService] Request attempt ${attempt} failed for ${url.slice(0, 80)}:`, err?.message);
        if (attempt < this.MAX_RETRIES) {
          // Linear backoff for retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${this.MAX_RETRIES} attempts.`);
  }

  /**
   * Downloads remote URL to target file with retries, timeout, and progress reporting.
   */
  private async downloadFileWithRetry(
    url: string,
    targetPath: string,
    onProgress?: (progressPercent: number) => void
  ): Promise<void> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Download HTTP error ${res.status}: ${res.statusText}`);
        }

        const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
        let downloadedBytes = 0;

        if (!res.body) {
          throw new Error('Response body was empty.');
        }

        const writeStream = fs.createWriteStream(targetPath);
        const nodeReadable = Readable.fromWeb(res.body as any);

        nodeReadable.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0 && onProgress) {
            const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            onProgress(pct);
          }
        });

        await pipeline(nodeReadable, writeStream);
        return;
      } catch (err: any) {
        lastError = err;
        console.warn(`[StockService] Download attempt ${attempt} failed:`, err?.message);
        if (fs.existsSync(targetPath)) {
          try {
            fs.unlinkSync(targetPath);
          } catch {}
        }
        if (attempt < this.MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
      }
    }

    throw lastError || new Error(`Failed to download ${url} after ${this.MAX_RETRIES} attempts.`);
  }
}

export const stockService = new StockService();
