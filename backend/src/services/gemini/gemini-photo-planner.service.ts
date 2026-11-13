import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../../config/env.js';

export const PhotoBackgroundConfigSchema = z.object({
  mode: z.enum(['keep', 'remove', 'solid', 'gradient', 'blur', 'custom']).default('keep'),
  color: z.string().default('#FFFFFF'),
  color2: z.string().optional().default('#111827'),
  blurRadius: z.number().min(5).max(100).default(25),
  customImagePath: z.string().optional(),
});

export const PhotoPlanSchema = z.object({
  summary: z.string(),
  frame: z.string().default('16:9'),
  smart_crop: z.boolean().default(true),
  auto_color: z.boolean().default(false),
  brightness: z.number().min(0.5).max(1.8).default(1.0),
  contrast: z.number().min(0.5).max(1.8).default(1.0),
  saturation: z.number().min(0.0).max(2.5).default(1.0),
  sharpness: z.number().min(0.5).max(2.5).default(1.0),
  denoise: z.boolean().default(false),
  filter: z
    .enum(['none', 'warm', 'cool', 'vintage', 'black_and_white', 'cinematic', 'vivid'])
    .default('none'),
  background: PhotoBackgroundConfigSchema.default({ mode: 'keep' }),
  vignette: z.boolean().default(false),
  text_overlay: z
    .object({
      text: z.string(),
      position: z.enum(['top', 'center', 'bottom', 'bottom-left', 'bottom-right']).default('bottom'),
      font_size: z.number().optional(),
      color: z.string().default('#FFFFFF'),
    })
    .optional(),
  use_brand_logo: z.boolean().default(false),
  logo_position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).default('top-right'),
  logo_size: z.number().min(5).max(35).default(14),
  logo_opacity: z.number().min(10).max(100).default(85),
  explanation: z.string().optional().default(''),
});

export type PhotoPlan = z.infer<typeof PhotoPlanSchema>;

export interface PhotoAnalysisData {
  width: number;
  height: number;
  aspect_ratio: number;
  brightness: number;
  contrast: number;
  blur_score: number;
  is_blurry: boolean;
  is_dark: boolean;
  is_overexposed: boolean;
  face_count: number;
  faces: Array<{ x: number; y: number; w: number; h: number }>;
  saliency_center: { x: number; y: number };
}

export interface PhotoPlanRequest {
  userPrompt: string;
  frame: string; // e.g. "16:9", "1:1", "4:5", "9:16"
  photoName: string;
  fileSizeBytes: number;
  analysis: PhotoAnalysisData;
  previewPath?: string;
  hasBrandLogo?: boolean;
}

export class GeminiPhotoPlannerService {
  /**
   * Generates a deterministic, rule-based fallback photo plan based on local image analysis.
   */
  public generateFallbackPlan(request: PhotoPlanRequest): PhotoPlan {
    const { analysis, frame, userPrompt, hasBrandLogo } = request;
    const lowerPrompt = (userPrompt || '').toLowerCase();

    let brightness = 1.0;
    let contrast = 1.0;
    let saturation = 1.0;
    let sharpness = 1.0;
    let auto_color = true;
    let denoise = false;
    let filter: 'none' | 'warm' | 'cool' | 'vintage' | 'black_and_white' | 'cinematic' | 'vivid' = 'none';
    let vignette = false;
    let bgMode: 'keep' | 'remove' | 'solid' | 'gradient' | 'blur' | 'custom' = 'keep';

    // Auto-adjust according to measurements
    if (analysis.is_dark) {
      brightness = 1.25;
      contrast = 1.1;
    } else if (analysis.is_overexposed) {
      brightness = 0.88;
      contrast = 1.15;
    }

    if (analysis.is_blurry) {
      sharpness = 1.4;
      denoise = true;
    }

    // Inspect user intent in prompt
    if (lowerPrompt.includes('vivid') || lowerPrompt.includes('punchy') || lowerPrompt.includes('colorful')) {
      filter = 'vivid';
      saturation = 1.3;
    } else if (lowerPrompt.includes('warm') || lowerPrompt.includes('golden') || lowerPrompt.includes('sunset')) {
      filter = 'warm';
    } else if (lowerPrompt.includes('cool') || lowerPrompt.includes('cold') || lowerPrompt.includes('clean')) {
      filter = 'cool';
    } else if (lowerPrompt.includes('vintage') || lowerPrompt.includes('retro') || lowerPrompt.includes('film')) {
      filter = 'vintage';
      vignette = true;
    } else if (lowerPrompt.includes('black and white') || lowerPrompt.includes('b&w') || lowerPrompt.includes('monochrome')) {
      filter = 'black_and_white';
    } else if (lowerPrompt.includes('cinematic') || lowerPrompt.includes('movie') || lowerPrompt.includes('hollywood')) {
      filter = 'cinematic';
      vignette = true;
    }

    if (lowerPrompt.includes('remove background') || lowerPrompt.includes('no background') || lowerPrompt.includes('transparent')) {
      bgMode = 'remove';
    } else if (lowerPrompt.includes('blur background')) {
      bgMode = 'blur';
    } else if (lowerPrompt.includes('white background')) {
      bgMode = 'solid';
    }

    const use_brand_logo = Boolean(hasBrandLogo && (lowerPrompt.includes('logo') || lowerPrompt.includes('brand')));

    return {
      summary: `Automated photo enhancement for ${frame}`,
      frame,
      smart_crop: true,
      auto_color,
      brightness,
      contrast,
      saturation,
      sharpness,
      denoise,
      filter,
      background: {
        mode: bgMode,
        color: '#FFFFFF',
        color2: '#111827',
        blurRadius: 25,
      },
      vignette,
      use_brand_logo,
      logo_position: 'top-right',
      logo_size: 14,
      logo_opacity: 85,
      explanation: 'Basic plan (AI was not available): automatic contrast/exposure correction and focal smart crop applied.',
    };
  }

  /**
   * Calls Google Gemini AI with local photo analysis metadata to generate an editing plan.
   * Retries once on transient failure, and gracefully falls back to deterministic analysis plan.
   */
  public async generatePhotoPlan(request: PhotoPlanRequest): Promise<PhotoPlan> {
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      console.log('[GeminiPhotoPlanner] No Gemini API key provided. Using analysis-driven fallback plan.');
      return this.generateFallbackPlan(request);
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const plan = await this.callGeminiApi(request, apiKey);
        const parsed = PhotoPlanSchema.parse(plan);
        return parsed;
      } catch (err: any) {
        console.warn(`[GeminiPhotoPlanner] Attempt ${attempt} failed:`, err?.message || err);
        if (attempt === 2) {
          console.warn('[GeminiPhotoPlanner] Falling back to local analysis photo plan.');
          return this.generateFallbackPlan(request);
        }
      }
    }

    return this.generateFallbackPlan(request);
  }

  private async callGeminiApi(request: PhotoPlanRequest, apiKey: string): Promise<any> {
    const { userPrompt, frame, photoName, analysis, hasBrandLogo, previewPath } = request;

    const systemPrompt = `You are an expert autonomous photo editor.
Your task is to create a professional photo editing plan for an image based on the user's instructions and the photo's measured technical metrics.
You MUST output ONLY valid, raw JSON matching this schema:
{
  "summary": "Short description of changes",
  "frame": "${frame}",
  "smart_crop": true,
  "auto_color": true,
  "brightness": 1.0,      // float between 0.5 and 1.8 (1.0 = unchanged)
  "contrast": 1.0,        // float between 0.5 and 1.8 (1.0 = unchanged)
  "saturation": 1.0,      // float between 0.0 and 2.5 (1.0 = unchanged)
  "sharpness": 1.0,       // float between 0.5 and 2.5 (1.0 = unchanged)
  "denoise": false,       // boolean (true if noisy/grainy or dark)
  "filter": "none",       // "none" | "warm" | "cool" | "vintage" | "black_and_white" | "cinematic" | "vivid"
  "background": {
    "mode": "keep",       // "keep" | "remove" | "solid" | "gradient" | "blur" | "custom"
    "color": "#FFFFFF",   // hex for solid/gradient
    "color2": "#111827",  // secondary hex for gradient
    "blurRadius": 25      // 5-100
  },
  "vignette": false,      // subtle radial edge darkening
  "text_overlay": {       // optional text overlay
    "text": "TITLE",
    "position": "bottom", // "top" | "center" | "bottom" | "bottom-left" | "bottom-right"
    "color": "#FFFFFF"
  },
  "use_brand_logo": ${Boolean(hasBrandLogo)},
  "logo_position": "top-right",
  "logo_size": 14,
  "logo_opacity": 85,
  "explanation": "Brief rationale for settings"
}`;

    const userMessage = `Photo Details:
- File name: ${photoName}
- Resolution: ${analysis.width}x${analysis.height} (Aspect ratio: ${analysis.aspect_ratio})
- Measured Brightness: ${analysis.brightness}/255 (Dark: ${analysis.is_dark}, Overexposed: ${analysis.is_overexposed})
- Measured Contrast: ${analysis.contrast}
- Measured Blur score: ${analysis.blur_score} (Blurry: ${analysis.is_blurry})
- Detected Faces: ${analysis.face_count}
- Focal Center (saliency): X=${analysis.saliency_center.x}, Y=${analysis.saliency_center.y}
- Target Frame: ${frame}
- User Prompt: "${userPrompt || 'Enhance and edit this photo professionally'}"

Return ONLY valid JSON.`;

    const contents: any[] = [];
    const parts: any[] = [{ text: `${systemPrompt}\n\n${userMessage}` }];

    // If Vision is enabled and preview is available, send small inline image
    if (env.GEMINI_VISION_ENABLED && previewPath && fs.existsSync(previewPath)) {
      try {
        const stat = fs.statSync(previewPath);
        if (stat.size <= 2 * 1024 * 1024) {
          const imgBase64 = fs.readFileSync(previewPath).toString('base64');
          parts.push({
            inline_data: {
              mime_type: 'image/jpeg',
              data: imgBase64,
            },
          });
        }
      } catch (e) {
        console.warn('[GeminiPhotoPlanner] Error reading preview frame for vision:', e);
      }
    }

    contents.push({ role: 'user', parts });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Photo planning service error');
      }

      const json = (await response.json()) as any;
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Photo planning service returned an empty response');
      }

      const cleaned = rawText
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      return JSON.parse(cleaned);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const geminiPhotoPlannerService = new GeminiPhotoPlannerService();

