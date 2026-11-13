import { AspectRatio, EditingStyle, FrameRate, VideoResolution } from './video';

export interface EditingPreferences {
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
  frameRate: FrameRate;
  style: EditingStyle;
  pacingDensity: number;
  cutSilences: boolean;
  generateCaptions: boolean;
  autoColorGrade: boolean;
  addBackgroundMusic: boolean;
  musicMood: 'upbeat' | 'chill' | 'cinematic' | 'corporate' | 'none';
}

export interface EditPromptPayload {
  projectId: string;
  userPrompt: string;
  preferences: EditingPreferences;
  sourceVideoName: string;
  sourceDurationSeconds: number;
  sourceResolution: {
    width: number;
    height: number;
  };
  clientTimestamp: string;
}

export type AIPromptPayload = EditPromptPayload;

export interface EditJobStatus {
  jobId: string;
  status: 'offline' | 'queued' | 'analyzing' | 'cutting' | 'rendering' | 'completed' | 'failed';
  progressPercentage: number;
  currentStepMessage: string;
  error?: string;
}

export type AIJobStatus = EditJobStatus;

