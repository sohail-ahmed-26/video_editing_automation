import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env, getMaskedApiKey } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { storageService } from '../storage/storage.service.js';

const execFileAsync = promisify(execFile);

export interface SystemHealthReport {
  status: 'healthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  videoEngine: { status: string; connected: boolean; fixTip?: string };
  speech: { status: string; connected: boolean; fixTip?: string };
  photoCutout: { status: string; connected: boolean; fixTip?: string };
  editService: { status: string; connected: boolean; fixTip?: string };
  footageService: { status: string; connected: boolean; fixTip?: string };
  storage: { status: string; connected: boolean; freeGb: number; totalGb: number; warning: boolean; fixTip?: string };
  music: { status: string; connected: boolean; trackCount: number; fixTip?: string };
  database: { status: string; message: string };
  ffmpeg: { status: string; message: string; version?: string; path: string };
  python: { status: string; message: string; version?: string; path: string };
  whisper: { status: string; model: string };
  onnx: { status: string; model: string; exists: boolean; sizeMb?: number };
  gemini: { status: string; model: string; hasKey: boolean; maskedKey: string | null };
  stock: {
    pexels: { hasKey: boolean; maskedKey: string | null; configured: boolean };
    pixabay: { hasKey: boolean; maskedKey: string | null; configured: boolean };
  };
  disk: { freeGb: number; totalGb: number; warning: boolean };
  musicLibrary: { trackCount: number };
}

export interface ClientStorageInfo {
  name: string;
  projectCount: number;
  totalSizeMb: number;
}

export interface StorageOverviewReport {
  disk: { freeGb: number; totalGb: number; warning: boolean };
  clients: ClientStorageInfo[];
  tempSizeMb: number;
  cacheCleanableMb: number;
}

export interface BackupResult {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  fileCount: number;
  createdAt: string;
}

export class SystemService {
  /**
   * Comprehensive health check of all local components and external API keys.
   */
  public async getHealth(): Promise<SystemHealthReport> {
    const report: SystemHealthReport = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Studio Backend',
      version: '1.0.0',
      videoEngine: { status: 'checking', connected: false },
      speech: { status: 'checking', connected: false },
      photoCutout: { status: 'checking', connected: false },
      editService: { status: 'checking', connected: false },
      footageService: { status: 'checking', connected: false },
      storage: { status: 'checking', connected: true, freeGb: 0, totalGb: 0, warning: false },
      music: { status: 'checking', connected: false, trackCount: 0 },
      database: { status: 'checking', message: '' },
      ffmpeg: { status: 'checking', message: '', path: env.FFMPEG_PATH },
      python: { status: 'checking', message: '', path: env.PYTHON_PATH },
      whisper: { status: 'ok', model: env.WHISPER_MODEL },
      onnx: { status: 'missing', model: 'u2netp.onnx', exists: false },
      gemini: {
        status: env.GEMINI_API_KEY ? 'configured' : 'missing',
        model: env.GEMINI_MODEL,
        hasKey: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0),
        maskedKey: null,
      },
      stock: {
        pexels: {
          hasKey: Boolean(env.PEXELS_API_KEY && env.PEXELS_API_KEY.trim().length > 0),
          maskedKey: null,
          configured: Boolean(env.PEXELS_API_KEY && env.PEXELS_API_KEY.trim().length > 0),
        },
        pixabay: {
          hasKey: Boolean(env.PIXABAY_API_KEY && env.PIXABAY_API_KEY.trim().length > 0),
          maskedKey: null,
          configured: Boolean(env.PIXABAY_API_KEY && env.PIXABAY_API_KEY.trim().length > 0),
        },
      },
      disk: { freeGb: 0, totalGb: 0, warning: false },
      musicLibrary: { trackCount: 0 },
    };

    // 1. Database Check
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      report.database = { status: 'ok', message: 'SQLite database connected successfully' };
    } catch (dbErr: any) {
      report.database = { status: 'error', message: dbErr?.message || 'Database query failed' };
      report.status = 'degraded';
    }

    // 2. FFmpeg Check
    try {
      const { stdout } = await execFileAsync(env.FFMPEG_PATH, ['-version'], { timeout: 5000 });
      const firstLine = stdout.split('\n')[0].trim();
      report.ffmpeg = {
        status: 'ok',
        message: 'FFmpeg binary operational',
        version: firstLine,
        path: env.FFMPEG_PATH,
      };
    } catch (ffErr: any) {
      report.ffmpeg = {
        status: 'error',
        message: `FFmpeg execution error: ${ffErr?.message || 'Failed to execute'}`,
        path: env.FFMPEG_PATH,
      };
      report.status = 'degraded';
    }

    // 3. Python Check
    try {
      const { stdout, stderr } = await execFileAsync(env.PYTHON_PATH, ['--version'], { timeout: 5000 });
      const versionOutput = (stdout || stderr).trim();
      report.python = {
        status: 'ok',
        message: 'Python runtime operational',
        version: versionOutput,
        path: env.PYTHON_PATH,
      };
    } catch (pyErr: any) {
      report.python = {
        status: 'error',
        message: `Python execution error: ${pyErr?.message || 'Failed to execute'}`,
        path: env.PYTHON_PATH,
      };
      report.status = 'degraded';
    }

    // 4. ONNX Model Check (u2netp.onnx)
    try {
      const onnxPath = path.join(storageService.getBaseDir(), 'models', 'u2netp.onnx');
      if (fs.existsSync(onnxPath)) {
        const stats = fs.statSync(onnxPath);
        const sizeMb = Number((stats.size / (1024 * 1024)).toFixed(2));
        report.onnx = { status: 'ok', model: 'u2netp.onnx', exists: true, sizeMb };
      } else {
        report.onnx = { status: 'missing', model: 'u2netp.onnx', exists: false };
      }
    } catch {
      report.onnx = { status: 'error', model: 'u2netp.onnx', exists: false };
    }

    // 5. Disk Space Check
    try {
      const storageDir = storageService.getBaseDir();
      const s = fs.statfsSync(storageDir);
      const freeGb = Number(((s.bavail * s.bsize) / (1024 ** 3)).toFixed(2));
      const totalGb = Number(((s.blocks * s.bsize) / (1024 ** 3)).toFixed(2));
      report.disk = {
        freeGb,
        totalGb,
        warning: freeGb < 10,
      };
    } catch (diskErr) {
      report.disk = { freeGb: 0, totalGb: 0, warning: false };
    }

    // 6. Music Library Track Count
    try {
      const musicDir = path.join(storageService.getBaseDir(), 'music-library');
      if (fs.existsSync(musicDir)) {
        const files = fs.readdirSync(musicDir);
        const audioFiles = files.filter((f) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f));
        report.musicLibrary = { trackCount: audioFiles.length };
      }
    } catch {
      report.musicLibrary = { trackCount: 0 };
    }

    const videoEngineOk = report.ffmpeg.status === 'ok';
    const speechOk = report.python.status === 'ok';
    const photoCutoutOk = report.onnx.exists;
    const editServiceOk = report.gemini.hasKey;
    const footageServiceOk = report.stock.pexels.hasKey || report.stock.pixabay.hasKey;
    const storageOk = report.disk.freeGb > 5;
    const musicOk = report.musicLibrary.trackCount > 0;

    report.videoEngine = {
      status: videoEngineOk ? 'ok' : 'unavailable',
      connected: videoEngineOk,
      fixTip: 'Verify video processing binary is accessible in environment path.',
    };
    report.speech = {
      status: speechOk ? 'ok' : 'unavailable',
      connected: speechOk,
      fixTip: 'Verify speech processing module is active in worker environment.',
    };
    report.photoCutout = {
      status: photoCutoutOk ? 'ok' : 'missing',
      connected: photoCutoutOk,
      fixTip: 'Place cut-out weights file into backend/storage/models directory.',
    };
    report.editService = {
      status: editServiceOk ? 'ok' : 'missing',
      connected: editServiceOk,
      fixTip: 'Paste and save Edit service key in the Services tab.',
    };
    report.footageService = {
      status: footageServiceOk ? 'ok' : 'missing',
      connected: footageServiceOk,
      fixTip: 'Paste and save Footage service key in the Services tab.',
    };
    report.storage = {
      status: storageOk ? 'ok' : 'warning',
      connected: storageOk,
      freeGb: report.disk.freeGb,
      totalGb: report.disk.totalGb,
      warning: report.disk.warning,
      fixTip: 'Clear temporary files in Storage and Backup tab.',
    };
    report.music = {
      status: musicOk ? 'ok' : 'empty',
      connected: musicOk,
      trackCount: report.musicLibrary.trackCount,
      fixTip: 'Upload audio files in the Music tab.',
    };

    return report;
  }

  /**
   * Neutral system check returning strictly neutral labels and 'ok' | 'fail'
   */
  public async getSystemCheck(): Promise<Record<string, 'ok' | 'fail'>> {
    const health = await this.getHealth();
    return {
      'Video engine': health.videoEngine?.connected ? 'ok' : 'fail',
      'Speech': health.speech?.connected ? 'ok' : 'fail',
      'Photo cut-out': health.photoCutout?.connected ? 'ok' : 'fail',
      'Edit service': health.editService?.connected ? 'ok' : 'fail',
      'Footage service': health.footageService?.connected ? 'ok' : 'fail',
      'Storage': health.storage?.connected ? 'ok' : 'fail',
      'Music': health.music?.connected ? 'ok' : 'fail',
    };
  }

  /**
   * Calculates storage usage per client, cache size, and free disk space.
   */
  public async getStorageOverview(): Promise<StorageOverviewReport> {
    const storageDir = storageService.getBaseDir();
    let freeGb = 0;
    let totalGb = 0;
    let warning = false;

    try {
      const s = fs.statfsSync(storageDir);
      freeGb = Number(((s.bavail * s.bsize) / (1024 ** 3)).toFixed(2));
      totalGb = Number(((s.blocks * s.bsize) / (1024 ** 3)).toFixed(2));
      warning = freeGb < 10;
    } catch {
      // Ignore statfs errors if unsupported
    }

    const clientsDir = path.join(storageDir, 'clients');
    const clients: ClientStorageInfo[] = [];

    if (fs.existsSync(clientsDir)) {
      const clientFolders = fs.readdirSync(clientsDir, { withFileTypes: true });
      for (const ent of clientFolders) {
        if (!ent.isDirectory()) continue;
        const cPath = path.join(clientsDir, ent.name);
        const { sizeBytes, projectCount } = this.calculateDirStats(cPath);
        clients.push({
          name: ent.name,
          projectCount,
          totalSizeMb: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
        });
      }
    }

    // Temp folder size
    const tempDir = path.join(storageDir, 'temp');
    let tempBytes = 0;
    if (fs.existsSync(tempDir)) {
      tempBytes = this.getDirectorySize(tempDir);
    }

    // Calculate cleanable preview cache size
    let previewCacheBytes = 0;
    if (fs.existsSync(clientsDir)) {
      previewCacheBytes = this.calculatePreviewCacheSize(clientsDir);
    }

    const tempSizeMb = Number((tempBytes / (1024 * 1024)).toFixed(2));
    const cacheCleanableMb = Number(((tempBytes + previewCacheBytes) / (1024 * 1024)).toFixed(2));

    return {
      disk: { freeGb, totalGb, warning },
      clients,
      tempSizeMb,
      cacheCleanableMb,
    };
  }

  /**
   * Cleans preview cache and temporary render files.
   * NEVER touches raw media, exports, database, brand kit, music library, or models.
   */
  public async cleanCache(): Promise<{ success: boolean; freedMb: number; cleanedFilesCount: number }> {
    const storageDir = storageService.getBaseDir();
    let cleanedFilesCount = 0;
    let freedBytes = 0;

    // 1. Clean backend/storage/temp/ files
    const tempDir = path.join(storageDir, 'temp');
    if (fs.existsSync(tempDir)) {
      const entries = fs.readdirSync(tempDir, { withFileTypes: true });
      for (const ent of entries) {
        const fullPath = path.join(tempDir, ent.name);
        try {
          if (ent.isFile()) {
            const stats = fs.statSync(fullPath);
            freedBytes += stats.size;
            fs.unlinkSync(fullPath);
            cleanedFilesCount++;
          } else if (ent.isDirectory()) {
            // Delete subdirs in temp like test folders
            const dirSize = this.getDirectorySize(fullPath);
            freedBytes += dirSize;
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleanedFilesCount++;
          }
        } catch {
          // Skip file if locked by active render
        }
      }
    }

    // 2. Clean client preview caches in backend/storage/clients/*/*/previews/
    const clientsDir = path.join(storageDir, 'clients');
    if (fs.existsSync(clientsDir)) {
      const clientFolders = fs.readdirSync(clientsDir, { withFileTypes: true });
      for (const clientEnt of clientFolders) {
        if (!clientEnt.isDirectory()) continue;
        const clientPath = path.join(clientsDir, clientEnt.name);
        const projectFolders = fs.readdirSync(clientPath, { withFileTypes: true });
        for (const projEnt of projectFolders) {
          if (!projEnt.isDirectory()) continue;
          const previewDir = path.join(clientPath, projEnt.name, 'previews');
          if (fs.existsSync(previewDir)) {
            const previewFiles = fs.readdirSync(previewDir, { withFileTypes: true });
            for (const fileEnt of previewFiles) {
              if (fileEnt.isFile()) {
                const fullPreview = path.join(previewDir, fileEnt.name);
                try {
                  const stat = fs.statSync(fullPreview);
                  freedBytes += stat.size;
                  fs.unlinkSync(fullPreview);
                  cleanedFilesCount++;
                } catch {
                  // Skip if locked
                }
              }
            }
          }
        }
      }
    }

    return {
      success: true,
      freedMb: Number((freedBytes / (1024 * 1024)).toFixed(2)),
      cleanedFilesCount,
    };
  }

  /**
   * Creates a timestamped backup zip containing dev.db, all project.json, and all plan files.
   * Saved into backend/backups/backup_YYYYMMDD_HHMMSS.zip.
   */
  public async createBackup(): Promise<BackupResult> {
    const backendRoot = path.resolve(storageService.getBaseDir(), '..');
    const backupsDir = path.join(backendRoot, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const zipName = `backup_${timestamp}.zip`;
    const zipPath = path.join(backupsDir, zipName);

    // Collect files to backup
    const filesToBackup: Array<{ absPath: string; arcPath: string }> = [];

    // 1. dev.db
    const devDbPath = path.join(backendRoot, 'prisma', 'dev.db');
    if (fs.existsSync(devDbPath)) {
      filesToBackup.push({ absPath: devDbPath, arcPath: 'prisma/dev.db' });
    }

    // 2. Scan for project.json and plan_v*.json inside storage/clients
    const clientsDir = path.join(storageService.getBaseDir(), 'clients');
    if (fs.existsSync(clientsDir)) {
      this.collectProjectMetaAndPlans(clientsDir, clientsDir, filesToBackup);
    }

    if (filesToBackup.length === 0) {
      throw new Error('No project metadata or database found to back up');
    }

    // Write manifest for python zip creation
    const manifestPath = path.join(storageService.getBaseDir(), 'temp', `backup_manifest_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(filesToBackup), 'utf8');

    // Run Python zipfile script
    const pyScript = `
import zipfile
import json
import sys

manifest_path = r"${manifestPath.replace(/\\/g, '\\\\')}"
zip_path = r"${zipPath.replace(/\\/g, '\\\\')}"

with open(manifest_path, 'r', encoding='utf-8') as f:
    files = json.load(f)

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for item in files:
        zipf.write(item['absPath'], arcname=item['arcPath'])

print("OK")
`;

    try {
      const { stdout } = await execFileAsync(env.PYTHON_PATH, ['-c', pyScript], { timeout: 30000 });
      if (!stdout.includes('OK')) {
        throw new Error(`Backup script failed: ${stdout}`);
      }
    } finally {
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
      }
    }

    const zipStat = fs.statSync(zipPath);

    return {
      fileName: zipName,
      filePath: `/backups/${zipName}`,
      sizeBytes: zipStat.size,
      fileCount: filesToBackup.length,
      createdAt: now.toISOString(),
    };
  }

  public async listBackups(): Promise<BackupResult[]> {
    const backendRoot = path.resolve(storageService.getBaseDir(), '..');
    const backupsDir = path.join(backendRoot, 'backups');
    if (!fs.existsSync(backupsDir)) return [];
    try {
      const files = fs.readdirSync(backupsDir).filter((f) => f.endsWith('.zip'));
      return files
        .map((fileName) => {
          const filePath = path.join(backupsDir, fileName);
          const stat = fs.statSync(filePath);
          return {
            fileName,
            filePath: `/backups/${fileName}`,
            sizeBytes: stat.size,
            fileCount: 0,
            createdAt: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  private calculateDirStats(dirPath: string): { sizeBytes: number; projectCount: number } {
    let sizeBytes = 0;
    let projectCount = 0;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          projectCount++;
          sizeBytes += this.getDirectorySize(path.join(dirPath, ent.name));
        } else if (ent.isFile()) {
          const s = fs.statSync(path.join(dirPath, ent.name));
          sizeBytes += s.size;
        }
      }
    } catch {
      // Ignore read errors
    }

    return { sizeBytes, projectCount };
  }

  private getDirectorySize(dirPath: string): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dirPath, ent.name);
        if (ent.isDirectory()) {
          total += this.getDirectorySize(full);
        } else if (ent.isFile()) {
          total += fs.statSync(full).size;
        }
      }
    } catch {
      // Ignore
    }
    return total;
  }

  private calculatePreviewCacheSize(clientsDir: string): number {
    let total = 0;
    try {
      const clients = fs.readdirSync(clientsDir, { withFileTypes: true });
      for (const c of clients) {
        if (!c.isDirectory()) continue;
        const cPath = path.join(clientsDir, c.name);
        const projs = fs.readdirSync(cPath, { withFileTypes: true });
        for (const p of projs) {
          if (!p.isDirectory()) continue;
          const prevDir = path.join(cPath, p.name, 'previews');
          if (fs.existsSync(prevDir)) {
            total += this.getDirectorySize(prevDir);
          }
        }
      }
    } catch {
      // Ignore
    }
    return total;
  }

  private collectProjectMetaAndPlans(
    currentDir: string,
    clientsBaseDir: string,
    outFiles: Array<{ absPath: string; arcPath: string }>
  ): void {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(currentDir, ent.name);
        if (ent.isDirectory()) {
          this.collectProjectMetaAndPlans(full, clientsBaseDir, outFiles);
        } else if (ent.isFile()) {
          if (ent.name === 'project.json' || /^plan_v.*\.json$/i.test(ent.name)) {
            const rel = path.relative(clientsBaseDir, full);
            outFiles.push({
              absPath: full,
              arcPath: path.join('clients', rel).replace(/\\/g, '/'),
            });
          }
        }
      }
    } catch {
      // Ignore
    }
  }
}

export const systemService = new SystemService();

