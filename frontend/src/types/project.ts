import { EditingPreferences } from './plan';
import { VideoMetadata } from './video';

export type ProjectStatus = 'draft' | 'ready' | 'processing' | 'completed' | 'failed';

export interface Client {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    projects: number;
  };
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  versionTag: string;
  filename: string;
  storagePath: string;
  publicUrl: string;
  fileSizeBytes?: number | null;
  duration?: number | null;
  resolution?: string | null;
  format?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  clientId?: string | null;
  client?: Client | null;
  clientName?: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  videoMetadata?: VideoMetadata | null;
  rawPrompt: string;
  tags: string[];
  preferences: EditingPreferences;
  thumbnailUrl?: string;
  durationSeconds?: number;
  versions?: ProjectVersion[];
  _count?: {
    mediaAssets?: number;
    versions?: number;
    exportedFiles?: number;
  };
}
