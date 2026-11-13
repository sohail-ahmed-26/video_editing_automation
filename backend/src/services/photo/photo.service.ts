import fs from 'node:fs';
import path from 'node:path';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { storageService } from '../storage/storage.service.js';
import { brandService } from '../brand/brand.service.js';
import { PhotoPlan, PhotoAnalysisData } from '../gemini/gemini-photo-planner.service.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SinglePhotoEditOptions {
  clientId: string;
  projectId: string;
  assetId: string;
  inputPath: string;
  plan: PhotoPlan;
  targetFormat?: 'jpg' | 'png' | 'webp';
  customBackgroundPath?: string;
  versionNumber?: number; // If grouping in an existing batch version
}

export interface PhotoEditResult {
  version: string;
  versionDir: string;
  outputPath: string;
  filePath?: string;
  filename?: string;
  outputUrl: string;
  originalPath: string;
  width: number;
  height: number;
  format: string;
  fileSizeBytes: number;
  operations: string[];
  plan: PhotoPlan;
  timestamp: string;
}

export interface BatchPhotoEditOptions {
  clientId: string;
  projectId: string;
  photos: Array<{
    assetId: string;
    inputPath: string;
    photoName: string;
  }>;
  plan: PhotoPlan;
  targetFormat?: 'jpg' | 'png' | 'webp';
  onProgress?: (completed: number, total: number, currentPhoto: string) => void;
}

export interface PhotoVersionSummary {
  version: string;
  folderPath?: string;
  createdAt: string;
  photoCount: number;
  planSummary: string;
  photos: Array<{
    fileName: string;
    filePath: string;
    fileUrl: string;
    fileSizeBytes: number;
  }>;
  zipUrl?: string;
}

export class PhotoService {
  private scriptPath: string;

  constructor() {
    const candidate1 = path.resolve(process.cwd(), 'python-worker/app/main.py');
    const candidate2 = path.resolve(process.cwd(), 'backend/python-worker/app/main.py');
    const candidate3 = path.resolve(__dirname, '../../../python-worker/app/main.py');

    if (fs.existsSync(candidate1)) {
      this.scriptPath = candidate1;
    } else if (fs.existsSync(candidate2)) {
      this.scriptPath = candidate2;
    } else {
      this.scriptPath = candidate3;
    }
  }

  /**
   * Analyzes an image using the Python OpenCV/Pillow worker.
   */
  public async analyzePhoto(imagePath: string): Promise<PhotoAnalysisData> {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Photo not found at ${imagePath}`);
    }

    const args = [this.scriptPath, 'photo-analyze', '--input', imagePath];

    try {
      const { stdout } = await execFileAsync(env.PYTHON_PATH, args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
      });

      const parsed = JSON.parse(stdout.trim());
      if (parsed.success) {
        return parsed.data as PhotoAnalysisData;
      }
      throw new Error(parsed.error || 'Photo analysis failed');
    } catch (err: any) {
      console.error('[PhotoService] Analysis error:', err);
      // Safe fallback data
      return {
        width: 1920,
        height: 1080,
        aspect_ratio: 1.777,
        brightness: 128.0,
        contrast: 40.0,
        blur_score: 120.0,
        is_blurry: false,
        is_dark: false,
        is_overexposed: false,
        face_count: 0,
        faces: [],
        saliency_center: { x: 0.5, y: 0.5 },
      };
    }
  }

  /**
   * Computes the next photo export version folder: exports/photo_vN/
   */
  public getNextPhotoVersionDir(clientId: string, projectId: string): { version: string; versionDir: string } {
    const exportsDir = storageService.getProjectExportsDir(clientId, projectId);
    fs.mkdirSync(exportsDir, { recursive: true });

    let maxV = 0;
    if (fs.existsSync(exportsDir)) {
      const entries = fs.readdirSync(exportsDir);
      for (const entry of entries) {
        const match = entry.match(/^photo_v(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxV) maxV = num;
        }
      }
    }

    const nextV = maxV + 1;
    const version = `photo_v${nextV}`;
    const versionDir = path.join(exportsDir, version);
    fs.mkdirSync(versionDir, { recursive: true });
    return { version, versionDir };
  }

  /**
   * Edits a single photo according to the plan and saves it in a versioned exports folder.
   */
  public async editPhoto(options: SinglePhotoEditOptions): Promise<PhotoEditResult> {
    const { clientId, projectId, assetId, inputPath, plan, customBackgroundPath } = options;

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input image does not exist at ${inputPath}`);
    }

    const { version, versionDir } = options.versionNumber
      ? {
          version: `photo_v${options.versionNumber}`,
          versionDir: path.join(storageService.getProjectExportsDir(clientId, projectId), `photo_v${options.versionNumber}`),
        }
      : this.getNextPhotoVersionDir(clientId, projectId);

    fs.mkdirSync(versionDir, { recursive: true });

    // Determine output format
    let targetExt = (options.targetFormat || 'jpg').toLowerCase().replace('.', '');
    if (plan.background?.mode === 'remove') {
      targetExt = 'png'; // Must be transparent PNG
    }
    const outputFileName = `${assetId}_edited.${targetExt}`;
    const outputPath = path.join(versionDir, outputFileName);

    // Brand logo
    const brandKit = brandService.getBrandKit();
    const logoPath = brandKit.logoPath && fs.existsSync(brandKit.logoPath) ? brandKit.logoPath : undefined;

    // Write plan to a temporary JSON file to avoid shell escaping issues on Windows
    const tempPlanPath = storageService.getTempPath(`photo_plan_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    const planToExecute = {
      ...plan,
      background: {
        ...plan.background,
        custom_image_path: customBackgroundPath || plan.background?.customImagePath,
      },
      use_brand_logo: plan.use_brand_logo && Boolean(logoPath),
      logo_position: plan.logo_position || brandKit.watermarkPosition || 'top-right',
      logo_size: plan.logo_size || brandKit.watermarkSizePercent || 14,
      logo_opacity: plan.logo_opacity || brandKit.watermarkOpacity || 85,
    };
    fs.writeFileSync(tempPlanPath, JSON.stringify(planToExecute), 'utf-8');

    const args = [
      this.scriptPath,
      'photo-edit',
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--plan',
      tempPlanPath,
    ];

    if (logoPath) {
      args.push('--logo', logoPath);
    }

    try {
      const { stdout } = await execFileAsync(env.PYTHON_PATH, args, {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120000, // 2 minutes
      });

      try {
        if (fs.existsSync(tempPlanPath)) fs.unlinkSync(tempPlanPath);
      } catch {}

      const parsed = JSON.parse(stdout.trim());
      if (!parsed.success) {
        throw new Error(parsed.error || 'Photo editing failed in worker');
      }

      // Save plan metadata alongside exports
      const metaPath = path.join(versionDir, 'photo_plan.json');
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            version,
            createdAt: new Date().toISOString(),
            plan: planToExecute,
            result: parsed.data,
          },
          null,
          2
        ),
        'utf-8'
      );

      const fileSizeBytes = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
      const relativeUrl = storageService.getRelativeUrl(outputPath);

      return {
        version,
        versionDir,
        outputPath,
        filePath: outputPath,
        filename: path.basename(outputPath),
        outputUrl: relativeUrl,
        originalPath: inputPath,
        width: parsed.data.width,
        height: parsed.data.height,
        format: parsed.data.format,
        fileSizeBytes,
        operations: parsed.data.operations,
        plan: planToExecute,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      try {
        if (fs.existsSync(tempPlanPath)) fs.unlinkSync(tempPlanPath);
      } catch {}
      console.error('[PhotoService] Edit error:', err);
      throw new Error(`Photo editing failed: ${err.message}`);
    }
  }

  /**
   * Applies the same photo editing plan across multiple photos in batch.
   */
  public async batchEditPhotos(options: BatchPhotoEditOptions): Promise<PhotoEditResult[]> {
    const { clientId, projectId, photos, plan, onProgress } = options;
    const { version, versionDir } = this.getNextPhotoVersionDir(clientId, projectId);
    const versionNum = parseInt(version.replace('photo_v', ''), 10);

    const results: PhotoEditResult[] = [];
    let completed = 0;

    for (const photo of photos) {
      onProgress?.(completed, photos.length, photo.photoName);
      try {
        const res = await this.editPhoto({
          clientId,
          projectId,
          assetId: photo.assetId,
          inputPath: photo.inputPath,
          plan,
          versionNumber: versionNum,
        });
        results.push(res);
      } catch (err) {
        console.error(`[PhotoService] Failed to edit photo ${photo.photoName}:`, err);
      }
      completed++;
      onProgress?.(completed, photos.length, photo.photoName);
    }

    // Save batch metadata
    const batchMetaPath = path.join(versionDir, 'batch_summary.json');
    fs.writeFileSync(
      batchMetaPath,
      JSON.stringify(
        {
          version,
          createdAt: new Date().toISOString(),
          photoCount: results.length,
          plan,
          results,
        },
        null,
        2
      ),
      'utf-8'
    );

    return results;
  }

  /**
   * Lists all existing photo export versions for a project.
   */
  public listPhotoVersions(clientId: string, projectId: string): PhotoVersionSummary[] {
    const exportsDir = storageService.getProjectExportsDir(clientId, projectId);
    if (!fs.existsSync(exportsDir)) return [];

    const versions: PhotoVersionSummary[] = [];
    const entries = fs.readdirSync(exportsDir);

    for (const entry of entries) {
      if (entry.startsWith('photo_v')) {
        const vDir = path.join(exportsDir, entry);
        if (!fs.statSync(vDir).isDirectory()) continue;

        let planSummary = 'Autonomous Photo Edit';
        let createdAt = fs.statSync(vDir).mtime.toISOString();

        const planFile = path.join(vDir, 'photo_plan.json');
        if (fs.existsSync(planFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
            if (data.plan?.summary) planSummary = data.plan.summary;
            if (data.createdAt) createdAt = data.createdAt;
          } catch {}
        }

        const photoFiles = fs.readdirSync(vDir).filter((f) => {
          const ext = path.extname(f).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) && !f.endsWith('.tmp');
        });

        const photos = photoFiles.map((f) => {
          const fullP = path.join(vDir, f);
          return {
            fileName: f,
            filePath: fullP,
            fileUrl: storageService.getRelativeUrl(fullP),
            fileSizeBytes: fs.statSync(fullP).size,
          };
        });

        versions.push({
          version: entry,
          folderPath: vDir,
          createdAt,
          photoCount: photos.length,
          planSummary,
          photos,
        });
      }
    }

    return versions.sort((a, b) => {
      const vA = parseInt(a.version.replace('photo_v', ''), 10) || 0;
      const vB = parseInt(b.version.replace('photo_v', ''), 10) || 0;
      return vB - vA;
    });
  }

  /**
   * Imports an edited photo into the project's Media Library so it can be used in video projects.
   */
  public async importToVideoProject(clientId: string, projectId: string, editedPhotoPath: string, originalName: string) {
    if (!fs.existsSync(editedPhotoPath)) {
      throw new Error(`Edited photo not found at ${editedPhotoPath}`);
    }

    const rawDir = storageService.getProjectRawDir(clientId, projectId);
    const ext = path.extname(editedPhotoPath);
    const baseName = path.basename(originalName, ext);
    const newFileName = `${baseName}_edited_${Date.now()}${ext}`;
    const destinationPath = path.join(rawDir, newFileName);

    fs.copyFileSync(editedPhotoPath, destinationPath);

    const stat = fs.statSync(destinationPath);
    const probe = await this.analyzePhoto(destinationPath);

    // Save as MediaAsset in Prisma DB
    const asset = await prisma.mediaAsset.create({
      data: {
        projectId,
        filename: newFileName,
        originalName: `${baseName}_edited${ext}`,
        storagePath: destinationPath,
        fileSizeBytes: stat.size,
        mimeType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
        width: probe.width,
        height: probe.height,
        status: 'analyzed',
      },
    });

    return {
      id: asset.id,
      fileName: asset.filename,
      filename: asset.filename,
      originalName: asset.originalName,
      filePath: asset.storagePath,
      storagePath: asset.storagePath,
      fileSizeBytes: asset.fileSizeBytes,
      type: 'photo',
      width: asset.width,
      height: asset.height,
    };
  }

  /**
   * Generates a zip archive of all images in a photo export version.
   */
  public createDownloadZip(versionDir: string): string {
    const zipPath = path.join(versionDir, 'photos_bundle.zip');
    if (fs.existsSync(zipPath)) {
      return zipPath;
    }

    // PowerShell Compress-Archive for reliable zero-dependency zip on Windows
    const safeDir = versionDir.replace(/\\/g, '/');
    const safeZip = zipPath.replace(/\\/g, '/');
    const script = `Compress-Archive -Path "${safeDir}/*.*" -DestinationPath "${safeZip}" -Force`;

    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { stdio: 'pipe' });
      return zipPath;
    } catch (err: any) {
      console.error('[PhotoService] Zip generation error:', err);
      throw new Error(`Failed to create ZIP bundle: ${err.message}`);
    }
  }
}

export const photoService = new PhotoService();

