import { Project, Client, ProjectVersion } from '../types/project';
import { apiClient } from './apiClient';

let cachedProjects: Project[] = [];

export function backendToFrontendProject(bp: any): Project {
  return {
    id: bp.id,
    title: bp.title,
    description: bp.description || '',
    clientId: bp.clientId || null,
    client: bp.client || null,
    clientName: bp.client?.name || 'General',
    createdAt: bp.createdAt,
    updatedAt: bp.updatedAt,
    status: (bp.status as any) || 'draft',
    rawPrompt: bp.rawPrompt || '',
    tags: Array.isArray(bp.tags) ? bp.tags : (bp.tagsJson ? JSON.parse(bp.tagsJson) : []),
    preferences: bp.preferences || (bp.preferencesJson ? JSON.parse(bp.preferencesJson) : {
      aspectRatio: bp.aspectRatio || '16:9',
      resolution: bp.resolution || '1080p',
      frameRate: '30fps',
      style: 'viral-fast',
      pacingDensity: 4,
      cutSilences: true,
      generateCaptions: true,
      autoColorGrade: false,
      addBackgroundMusic: false,
      musicMood: 'chill',
    }),
    thumbnailUrl: bp.thumbnailUrl || undefined,
    durationSeconds: bp.durationSeconds || 0,
    versions: bp.versions || [],
    _count: bp._count,
    videoMetadata: bp.mediaAssets?.[0]?.metadata
      ? {
          name: bp.mediaAssets[0].originalName || bp.mediaAssets[0].filename,
          sizeBytes: bp.mediaAssets[0].fileSizeBytes,
          type: bp.mediaAssets[0].mimeType,
          durationSeconds: bp.mediaAssets[0].metadata.duration,
          width: bp.mediaAssets[0].metadata.width,
          height: bp.mediaAssets[0].metadata.height,
          aspectRatio: bp.mediaAssets[0].metadata.aspectRatio,
          lastModified: new Date(bp.mediaAssets[0].createdAt).getTime(),
        }
      : null,
  };
}

export const projectStorage = {
  getAll(): Project[] {
    return cachedProjects;
  },

  setCache(projects: Project[]): void {
    cachedProjects = projects;
  },

  async fetchAll(clientId?: string): Promise<Project[]> {
    try {
      const backendProjects = await apiClient.listProjects({ clientId });
      const mapped = backendProjects.map(backendToFrontendProject);
      cachedProjects = mapped;
      return mapped;
    } catch (e) {
      console.error('Failed to fetch projects from backend:', e);
      throw e;
    }
  },

  async getById(id: string): Promise<Project | null> {
    try {
      const bp = await apiClient.getProject(id);
      return backendToFrontendProject(bp);
    } catch (e) {
      console.error(`Failed to get project ${id} from backend:`, e);
      return cachedProjects.find((p) => p.id === id) || null;
    }
  },

  async save(project: Partial<Project> & { title: string }): Promise<Project> {
    try {
      const isExisting = project.id && cachedProjects.some((p) => p.id === project.id);
      let savedBp: any;

      if (isExisting && project.id) {
        savedBp = await apiClient.updateProject(project.id, {
          title: project.title,
          description: project.description,
          clientId: project.clientId,
          clientName: project.clientName,
          status: project.status,
          durationSeconds: project.durationSeconds,
          rawPrompt: project.rawPrompt,
          tags: project.tags,
          preferences: project.preferences,
          aspectRatio: project.preferences?.aspectRatio,
          resolution: project.preferences?.resolution,
        });
      } else {
        savedBp = await apiClient.createProject({
          title: project.title,
          description: project.description,
          clientId: project.clientId,
          clientName: project.clientName,
          aspectRatio: project.preferences?.aspectRatio || '16:9',
          resolution: project.preferences?.resolution || '1080p',
          rawPrompt: project.rawPrompt,
          tags: project.tags,
          preferences: project.preferences,
        });
      }

      const saved = backendToFrontendProject(savedBp);
      const idx = cachedProjects.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        cachedProjects[idx] = saved;
      } else {
        cachedProjects.unshift(saved);
      }
      return saved;
    } catch (e) {
      console.error('Failed to save project to backend:', e);
      throw e;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await apiClient.deleteProject(id);
      cachedProjects = cachedProjects.filter((p) => p.id !== id);
      return true;
    } catch (e) {
      console.error(`Failed to delete project ${id} from backend:`, e);
      return false;
    }
  },

  async duplicate(id: string): Promise<Project | null> {
    try {
      const original = await this.getById(id);
      if (!original) return null;

      const created = await apiClient.createProject({
        title: `${original.title} (Copy)`,
        description: original.description,
        clientId: original.clientId,
        clientName: original.clientName,
        aspectRatio: original.preferences?.aspectRatio || '16:9',
        resolution: original.preferences?.resolution || '1080p',
        rawPrompt: original.rawPrompt,
        tags: original.tags,
        preferences: original.preferences,
      });

      const duplicated = backendToFrontendProject(created);
      cachedProjects.unshift(duplicated);
      return duplicated;
    } catch (e) {
      console.error(`Failed to duplicate project ${id}:`, e);
      return null;
    }
  },

  clearAll(): void {
    cachedProjects = [];
  },
};
