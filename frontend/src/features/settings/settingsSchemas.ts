import { z } from 'zod';

export const profileFormSchema = z.object({
  name: z.string(),
  email: z.string().email('Please enter a valid email address').or(z.literal('')),
  role: z.string(),
  workspaceName: z.string(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const exportFormSchema = z.object({
  format: z.enum(['mp4', 'webm', 'mov']),
  resolution: z.enum(['720p', '1080p', '4K']),
  frameRate: z.enum(['24fps', '30fps', '60fps']),
  codec: z.enum(['h264', 'hevc', 'prores']),
  audioBitrate: z.enum(['128k', '192k', '320k']),
  hardwareAcceleration: z.boolean(),
});

export type ExportFormValues = z.infer<typeof exportFormSchema>;

export const backendConfigSchema = z.object({
  apiUrl: z.string().url('Must be a valid URL with http:// or https://'),
  apiKey: z.string().optional(),
});

export type BackendConfigValues = z.infer<typeof backendConfigSchema>;

