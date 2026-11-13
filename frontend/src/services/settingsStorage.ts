import { BackendConfig, EditDefaults, ExportDefaults, UserProfile, WorkspacePreferences } from '../types/settings';

const SETTINGS_KEY = 'studio_settings_v1';
const LEGACY_KEY = 'settings_v1';

export const DEFAULT_SYSTEM_PROMPT = `You are Editron Director, an elite autonomous video editor.
The user wants an automated edit of their media assets. You must decide every cut, motion effect, silence removal, caption, and music setting entirely by yourself based on the user's creative prompt and the provided local media analysis.

STRICT RULES:
1. Every segment's assetId MUST exactly match one of the provided asset IDs.
2. For videos: sourceIn and sourceOut must be within [0, asset.durationSeconds], and sourceIn < sourceOut.
3. For photos: set sourceIn to 0, sourceOut to display duration (default 3.0 to 5.0 seconds). Always assign motionEffect = "ken_burns", "zoom_in", or "pan_left".
4. If the user mentions removing silences, or if silent intervals exist, skip or trim those intervals.
5. If speech transcription is present, generate matching captions with accurate timestamps.
6. When prompt asks for punchy/zoom/highlights, assign motionEffect ("zoom_in", "punch_in", "zoom_out", "pan_left") to impactful moments.
7. Return ONLY valid JSON following the schema.
8. Safe Margins: preserve top, bottom, and side safe zones for social media UI overlays.
9. Hook in first 2-3 seconds: MUST select the most engaging, highest quality moment from the footage.`;

export interface AppSettings {
  profile: UserProfile;
  editDefaults: EditDefaults;
  exportDefaults: ExportDefaults;
  workspacePreferences: WorkspacePreferences;
  backendConfig: BackendConfig;
  systemPrompt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  profile: {
    name: '',
    email: '',
    avatarInitials: '',
    role: '',
    workspaceName: '',
  },
  editDefaults: {
    captions: true,
    captionStyle: 'clean',
    music: false,
    musicMood: 'chill',
    logo: false,
    silenceRemoval: true,
    speechAccuracy: 'high',
    speechLanguage: 'auto',
    visualUnderstanding: false,
  },
  exportDefaults: {
    format: 'mp4',
    resolution: '1080p',
    frameRate: '30fps',
    audioBitrate: '192k',
    codec: 'h264',
    hardwareAcceleration: true,
  },
  workspacePreferences: {
    theme: 'dark-studio',
    timelineDensity: 'comfortable',
    autoSaveIntervalSeconds: 30,
    timecodeFormat: 'smpte',
    showWaveform: true,
    snapToGrid: true,
  },
  backendConfig: {
    apiUrl: 'http://localhost:3001',
    apiKey: '',
    timeoutMs: 15000,
    autoReconnect: true,
    status: 'disconnected',
    lastCheckedAt: null,
    errorMessage: null,
  },
};

export const settingsStorage = {
  get(): AppSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(LEGACY_KEY);
      if (!data) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(data);
      const config = { ...DEFAULT_SETTINGS.backendConfig, ...(parsed.backendConfig || {}) };
      if (config.apiUrl === 'http://localhost:8000') {
        config.apiUrl = 'http://localhost:3001';
      }
      const profile = { ...DEFAULT_SETTINGS.profile, ...(parsed.profile || {}) };

      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        profile,
        editDefaults: { ...DEFAULT_SETTINGS.editDefaults, ...(parsed.editDefaults || {}) },
        exportDefaults: { ...DEFAULT_SETTINGS.exportDefaults, ...(parsed.exportDefaults || {}) },
        workspacePreferences: { ...DEFAULT_SETTINGS.workspacePreferences, ...(parsed.workspacePreferences || {}) },
        backendConfig: config,
        systemPrompt: parsed.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  save(settings: AppSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings to localStorage:', e);
    }
  },

  reset(): AppSettings {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      console.error('Failed to clear settings:', e);
    }
    return DEFAULT_SETTINGS;
  },
};
