import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().default('file:./dev.db'),

  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().default(2147483648), // 2GB

  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  PYTHON_PATH: z.string().default('python'),

  // Google Gemini AI Planner (Free Tier)
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_VISION_ENABLED: z
    .preprocess((val) => val === true || val === 'true' || val === '1', z.boolean())
    .default(false),
  WHISPER_MODEL: z.enum(['tiny', 'base', 'small', 'medium']).default('base'),
  WHISPER_LANGUAGE: z.string().default('auto'),

  // Stock Media APIs (Free Tier: Pexels & Pixabay)
  PEXELS_API_KEY: z.string().default(''),
  PIXABAY_API_KEY: z.string().default(''),

  WORKER_CONCURRENCY: z.coerce.number().default(2),
  JOB_TIMEOUT_MS: z.coerce.number().default(600000),
});

import fs from 'node:fs';

const envFilePath = path.resolve(__dirname, '../../.env');

export const env = envSchema.parse(process.env);

export function getMaskedApiKey(key?: string): string | null {
  const k = key !== undefined ? key : env.GEMINI_API_KEY;
  if (!k || k.trim().length === 0) return null;
  const trimmed = k.trim();
  if (trimmed.length <= 8) return '****' + trimmed.slice(-2);
  return trimmed.slice(0, 7) + '...' + trimmed.slice(-4);
}

export function updateEnvFile(updates: Record<string, string>): void {
  let content = '';
  if (fs.existsSync(envFilePath)) {
    content = fs.readFileSync(envFilePath, 'utf8');
  }

  for (const [key, value] of Object.entries(updates)) {
    // Update process.env and mutable env object
    process.env[key] = value;
    (env as any)[key] = key === 'GEMINI_VISION_ENABLED' ? value === 'true' : value;

    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}="${value}"`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += (content.endsWith('\n') || content === '' ? '' : '\n') + `${line}\n`;
    }
  }

  fs.writeFileSync(envFilePath, content, 'utf8');
}
