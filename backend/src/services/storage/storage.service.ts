import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRootDir = path.resolve(__dirname, '../../../');

export function sanitizeWindowsName(name: string): string {
  if (!name || !name.trim()) return 'unnamed';
  let sanitized = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace illegal Windows characters
    .replace(/[. ]+$/, ''); // Strip trailing dots and spaces
  // Reserved device names in Windows
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(sanitized)) {
    sanitized = `${sanitized}_dir`;
  }
  return sanitized || 'unnamed';
}

export class StorageService {
  private baseDir: string;
  public uploadsDir: string;
  public exportsDir: string;
  public tempDir: string;
  public thumbnailsDir: string;
  public clientsDir: string;

  constructor() {
    const rawStorageDir = env.STORAGE_DIR || './storage';
    if (path.isAbsolute(rawStorageDir)) {
      this.baseDir = rawStorageDir;
    } else {
      this.baseDir = path.resolve(backendRootDir, rawStorageDir);
    }
    this.uploadsDir = path.join(this.baseDir, 'uploads');
    this.exportsDir = path.join(this.baseDir, 'exports');
    this.tempDir = path.join(this.baseDir, 'temp');
    this.thumbnailsDir = path.join(this.baseDir, 'thumbnails');
    this.clientsDir = path.join(this.baseDir, 'clients');

    this.ensureDirs();
  }

  private ensureDirs(): void {
    const dirs = [
      this.baseDir,
      this.uploadsDir,
      this.exportsDir,
      this.tempDir,
      this.thumbnailsDir,
      this.clientsDir,
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public getFontsDir(): string {
    const dir = path.join(this.baseDir, 'fonts');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public getClientsDir(): string {
    if (!fs.existsSync(this.clientsDir)) {
      fs.mkdirSync(this.clientsDir, { recursive: true });
    }
    return this.clientsDir;
  }

  public getProjectDirs(clientName?: string | null, projectName?: string | null): {
    clientDir: string;
    projectDir: string;
    rawDir: string;
    previewDir: string;
    exportsDir: string;
    plansDir: string;
    projectJsonPath: string;
    safeClientName: string;
    safeProjectName: string;
  } {
    const safeClientName = sanitizeWindowsName(clientName || 'General');
    const safeProjectName = sanitizeWindowsName(projectName || 'Untitled Project');

    const clientDir = path.join(this.getClientsDir(), safeClientName);
    const projectDir = path.join(clientDir, safeProjectName);
    const rawDir = path.join(projectDir, 'raw');
    const previewDir = path.join(projectDir, 'preview');
    const exportsDir = path.join(projectDir, 'exports');
    const plansDir = path.join(projectDir, 'plans');
    const projectJsonPath = path.join(projectDir, 'project.json');

    return {
      clientDir,
      projectDir,
      rawDir,
      previewDir,
      exportsDir,
      plansDir,
      projectJsonPath,
      safeClientName,
      safeProjectName,
    };
  }

  public ensureProjectFolders(clientName?: string | null, projectName?: string | null, initialData?: any): {
    clientDir: string;
    projectDir: string;
    rawDir: string;
    previewDir: string;
    exportsDir: string;
    plansDir: string;
    projectJsonPath: string;
    safeClientName: string;
    safeProjectName: string;
  } {
    const dirs = this.getProjectDirs(clientName, projectName);

    if (!fs.existsSync(dirs.clientDir)) fs.mkdirSync(dirs.clientDir, { recursive: true });
    if (!fs.existsSync(dirs.projectDir)) fs.mkdirSync(dirs.projectDir, { recursive: true });
    if (!fs.existsSync(dirs.rawDir)) fs.mkdirSync(dirs.rawDir, { recursive: true });
    if (!fs.existsSync(dirs.previewDir)) fs.mkdirSync(dirs.previewDir, { recursive: true });
    if (!fs.existsSync(dirs.exportsDir)) fs.mkdirSync(dirs.exportsDir, { recursive: true });
    if (!fs.existsSync(dirs.plansDir)) fs.mkdirSync(dirs.plansDir, { recursive: true });

    // Initial v1 directory
    const v1Dir = path.join(dirs.exportsDir, 'v1');
    if (!fs.existsSync(v1Dir)) fs.mkdirSync(v1Dir, { recursive: true });

    // Write initial project.json
    if (!fs.existsSync(dirs.projectJsonPath) || initialData) {
      fs.writeFileSync(
        dirs.projectJsonPath,
        JSON.stringify(
          initialData || {
            client: dirs.safeClientName,
            project: dirs.safeProjectName,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf-8'
      );
    }

    return dirs;
  }

  public saveProjectJson(clientName?: string | null, projectName?: string | null, data: any = {}): void {
    const dirs = this.getProjectDirs(clientName, projectName);
    if (!fs.existsSync(dirs.projectDir)) {
      fs.mkdirSync(dirs.projectDir, { recursive: true });
    }
    fs.writeFileSync(dirs.projectJsonPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  public getProjectJson(clientName?: string | null, projectName?: string | null): any | null {
    const dirs = this.getProjectDirs(clientName, projectName);
    if (fs.existsSync(dirs.projectJsonPath)) {
      try {
        return JSON.parse(fs.readFileSync(dirs.projectJsonPath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  public savePlanJson(
    clientName: string | null | undefined,
    projectName: string | null | undefined,
    planData: any
  ): { versionTag: string; filePath: string } {
    const dirs = this.getProjectDirs(clientName, projectName);
    if (!fs.existsSync(dirs.plansDir)) {
      fs.mkdirSync(dirs.plansDir, { recursive: true });
    }

    // Determine highest plan version e.g. plan_v1.json, plan_v2.json
    let highest = 0;
    const entries = fs.readdirSync(dirs.plansDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile()) {
        const m = ent.name.match(/^plan_v(\d+)\.json$/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > highest) highest = num;
        }
      }
    }

    const nextNum = highest + 1;
    const versionTag = `v${nextNum}`;
    const filename = `plan_${versionTag}.json`;
    const filePath = path.join(dirs.plansDir, filename);

    const fullPayload = {
      version: versionTag,
      savedAt: new Date().toISOString(),
      ...planData,
    };

    fs.writeFileSync(filePath, JSON.stringify(fullPayload, null, 2), 'utf-8');

    return { versionTag, filePath };
  }

  public listPlanJsons(clientName?: string | null, projectName?: string | null): any[] {
    const dirs = this.getProjectDirs(clientName, projectName);
    if (!fs.existsSync(dirs.plansDir)) return [];

    const results: any[] = [];
    const entries = fs.readdirSync(dirs.plansDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dirs.plansDir, ent.name), 'utf-8'));
          results.push({
            filename: ent.name,
            version: content.version || ent.name.replace('.json', ''),
            savedAt: content.savedAt || content.createdAt,
            data: content,
          });
        } catch {}
      }
    }

    return results.sort((a, b) => {
      const numA = parseInt(a.version.replace('v', ''), 10) || 0;
      const numB = parseInt(b.version.replace('v', ''), 10) || 0;
      return numB - numA; // Newest first
    });
  }

  public getNextExportVersion(clientName?: string | null, projectName?: string | null): {
    versionNumber: number;
    versionTag: string;
    versionDir: string;
  } {
    const dirs = this.getProjectDirs(clientName, projectName);
    if (!fs.existsSync(dirs.exportsDir)) {
      fs.mkdirSync(dirs.exportsDir, { recursive: true });
    }

    let highest = 0;
    const entries = fs.readdirSync(dirs.exportsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const match = entry.name.match(/^v(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > highest) highest = num;
        }
      }
    }

    const nextNum = highest + 1;
    const versionTag = `v${nextNum}`;
    const versionDir = path.join(dirs.exportsDir, versionTag);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    return {
      versionNumber: nextNum,
      versionTag,
      versionDir,
    };
  }

  public getUploadPath(filename: string): string {
    return path.join(this.uploadsDir, filename);
  }

  public getExportPath(filename: string): string {
    return path.join(this.exportsDir, filename);
  }

  public getTempPath(filename: string): string {
    return path.join(this.tempDir, filename);
  }

  public getThumbnailPath(filename: string): string {
    return path.join(this.thumbnailsDir, filename);
  }

  public fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  public getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  public deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`Failed to delete file ${filePath}:`, err);
    }
  }

  public getPreviewPath(storagePath: string, targetExt = '.mp4'): string {
    const parsed = path.parse(storagePath);
    const parentDir = path.dirname(storagePath);
    // If inside a raw folder, place inside sibling preview folder
    if (path.basename(parentDir).toLowerCase() === 'raw') {
      const projectDir = path.dirname(parentDir);
      const previewDir = path.join(projectDir, 'preview');
      if (!fs.existsSync(previewDir)) {
        fs.mkdirSync(previewDir, { recursive: true });
      }
      return path.join(previewDir, `${parsed.name}${targetExt}`);
    }

    // Default fallback
    const fallbackDir = path.join(this.baseDir, 'preview');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, `${parsed.name}${targetExt}`);
  }

  public getExistingPreviewPath(storagePath: string): string | null {
    const mp4Path = this.getPreviewPath(storagePath, '.mp4');
    if (fs.existsSync(mp4Path)) return mp4Path;
    const jpgPath = this.getPreviewPath(storagePath, '.jpg');
    if (fs.existsSync(jpgPath)) return jpgPath;
    return null;
  }

  public getPublicUrl(storagePath: string): string {
    const relative = path.relative(this.baseDir, storagePath).replace(/\\/g, '/');
    return `/storage/${relative}`;
  }

  public getRelativeUrl(storagePath: string): string {
    return this.getPublicUrl(storagePath);
  }

  public getProjectExportsDir(clientName?: string | null, projectName?: string | null): string {
    return this.getProjectDirs(clientName, projectName).exportsDir;
  }

  public getProjectRawDir(clientName?: string | null, projectName?: string | null): string {
    return this.getProjectDirs(clientName, projectName).rawDir;
  }
}

export const storageService = new StorageService();
