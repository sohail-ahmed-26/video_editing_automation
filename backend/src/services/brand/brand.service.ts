import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRootDir = path.resolve(__dirname, '../../../');
const BRAND_DIR = path.resolve(backendRootDir, 'storage/brand');
const BRAND_JSON_PATH = path.join(BRAND_DIR, 'brand_kit.json');

export interface BrandKitConfig {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  watermarkOpacity: number;
  watermarkSizePercent: number;
  logoFilename?: string | null;
  logoPath?: string | null;
  logoUrl?: string | null;
  updatedAt: string;
}

const DEFAULT_BRAND_KIT: BrandKitConfig = {
  brandName: '',
  primaryColor: '#8b5cf6',
  secondaryColor: '#f1f3f9',
  fontFamily: 'Inter',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 80,
  watermarkSizePercent: 15,
  logoFilename: null,
  logoPath: null,
  logoUrl: null,
  updatedAt: new Date().toISOString(),
};

export class BrandService {
  constructor() {
    this.ensureDir();
  }

  public ensureDir(): void {
    if (!fs.existsSync(BRAND_DIR)) {
      fs.mkdirSync(BRAND_DIR, { recursive: true });
    }
    if (!fs.existsSync(BRAND_JSON_PATH)) {
      fs.writeFileSync(BRAND_JSON_PATH, JSON.stringify(DEFAULT_BRAND_KIT, null, 2), 'utf-8');
    }
  }

  public getBrandDir(): string {
    this.ensureDir();
    return BRAND_DIR;
  }

  public getBrandKit(): BrandKitConfig {
    this.ensureDir();
    try {
      const content = fs.readFileSync(BRAND_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        ...DEFAULT_BRAND_KIT,
        ...parsed,
      };
    } catch {
      return DEFAULT_BRAND_KIT;
    }
  }

  public saveBrandKit(updates: Partial<BrandKitConfig>): BrandKitConfig {
    this.ensureDir();
    const current = this.getBrandKit();
    const merged: BrandKitConfig = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(BRAND_JSON_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  }

  public saveLogoFromBase64(base64Data: string, originalFilename = 'logo.png'): { logoPath: string; logoUrl: string } {
    this.ensureDir();
    const match = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    let buffer: Buffer;
    let ext = '.png';

    if (match) {
      ext = match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`;
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(base64Data, 'base64');
    }

    const filename = `brand_logo${ext}`;
    const logoPath = path.join(BRAND_DIR, filename);
    fs.writeFileSync(logoPath, buffer);

    const logoUrl = `/api/v1/brand/logo?v=${Date.now()}`;
    this.saveBrandKit({
      logoFilename: filename,
      logoPath,
      logoUrl,
    });

    return { logoPath, logoUrl };
  }

  public saveLogoFile(tempFilePath: string, filename: string): { logoPath: string; logoUrl: string } {
    this.ensureDir();
    const ext = path.extname(filename).toLowerCase() || '.png';
    const logoFilename = `brand_logo${ext}`;
    const logoPath = path.join(BRAND_DIR, logoFilename);

    fs.copyFileSync(tempFilePath, logoPath);
    try {
      fs.unlinkSync(tempFilePath);
    } catch {}

    const logoUrl = `/api/v1/brand/logo?v=${Date.now()}`;
    this.saveBrandKit({
      logoFilename,
      logoPath,
      logoUrl,
    });

    return { logoPath, logoUrl };
  }

  public removeLogo(): void {
    const current = this.getBrandKit();
    if (current.logoPath && fs.existsSync(current.logoPath)) {
      try {
        fs.unlinkSync(current.logoPath);
      } catch {}
    }
    this.saveBrandKit({
      logoFilename: null,
      logoPath: null,
      logoUrl: null,
    });
  }
}

export const brandService = new BrandService();

