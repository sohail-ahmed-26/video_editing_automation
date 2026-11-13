export interface UserProfile {
  name: string;
  email: string;
  avatarInitials: string;
  role: string;
  workspaceName: string;
}

export interface EditDefaults {
  captions: boolean;
  captionStyle: 'viral' | 'clean' | 'minimal';
  music: boolean;
  musicMood: string;
  logo: boolean;
  silenceRemoval: boolean;
  speechAccuracy: 'standard' | 'high';
  speechLanguage: string;
  visualUnderstanding?: boolean;
}

export interface ExportDefaults {
  format: 'mp4' | 'webm' | 'mov';
  resolution: '720p' | '1080p' | '4K';
  frameRate: '24fps' | '30fps' | '60fps';
  audioBitrate: '128k' | '192k' | '320k';
  codec: 'h264' | 'hevc' | 'prores';
  hardwareAcceleration: boolean;
}

export interface WorkspacePreferences {
  theme: 'dark-studio' | 'high-contrast-dark';
  timelineDensity: 'compact' | 'comfortable';
  autoSaveIntervalSeconds: number;
  timecodeFormat: 'smpte' | 'seconds';
  showWaveform: boolean;
  snapToGrid: boolean;
}

export interface BackendConfig {
  apiUrl: string;
  apiKey: string;
  timeoutMs: number;
  autoReconnect: boolean;
  status: 'disconnected' | 'checking' | 'connected' | 'error';
  lastCheckedAt: string | null;
  errorMessage: string | null;
}
