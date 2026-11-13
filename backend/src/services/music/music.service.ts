import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffprobeService } from '../ffmpeg/ffprobe.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRootDir = path.resolve(__dirname, '../../../');
const MUSIC_DIR = path.resolve(backendRootDir, 'storage/music-library');
const METADATA_FILE = path.join(MUSIC_DIR, 'library.json');

export interface MusicTrack {
  id: string;
  title: string;
  filename: string;
  storagePath: string;
  publicUrl: string;
  durationSeconds: number;
  moodTags: string[]; // upbeat, calm, cinematic, emotional, corporate
  licenseSource: string;
  fileSizeBytes: number;
  format: string;
  createdAt: string;
}

export class MusicService {
  constructor() {
    this.ensureDir();
  }

  public ensureDir(): void {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }
    if (!fs.existsSync(METADATA_FILE)) {
      fs.writeFileSync(METADATA_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  public getMusicDir(): string {
    this.ensureDir();
    return MUSIC_DIR;
  }

  private readMetadata(): MusicTrack[] {
    this.ensureDir();
    try {
      const content = fs.readFileSync(METADATA_FILE, 'utf-8');
      return JSON.parse(content) || [];
    } catch {
      return [];
    }
  }

  private writeMetadata(tracks: MusicTrack[]): void {
    this.ensureDir();
    fs.writeFileSync(METADATA_FILE, JSON.stringify(tracks, null, 2), 'utf-8');
  }

  public async listTracks(): Promise<MusicTrack[]> {
    const tracks = this.readMetadata();
    // Filter to ensure files exist on disk
    const existing = tracks.filter((t) => fs.existsSync(t.storagePath));
    if (existing.length !== tracks.length) {
      this.writeMetadata(existing);
    }
    return existing;
  }

  public async getTrack(id: string): Promise<MusicTrack | null> {
    const tracks = await this.listTracks();
    return tracks.find((t) => t.id === id) || null;
  }

  public async addTrack(data: {
    id: string;
    title: string;
    filename: string;
    tempFilePath: string;
    moodTags?: string[];
    licenseSource?: string;
  }): Promise<MusicTrack> {
    this.ensureDir();
    const ext = path.extname(data.filename).toLowerCase() || '.mp3';
    const safeFilename = `${data.id}${ext}`;
    const destinationPath = path.join(MUSIC_DIR, safeFilename);

    // Move file to destination
    fs.copyFileSync(data.tempFilePath, destinationPath);
    try {
      fs.unlinkSync(data.tempFilePath);
    } catch {}

    // Probe duration and format using ffprobe
    let durationSeconds = 30;
    let format = 'mp3';
    try {
      const probe = await ffprobeService.probeMedia(destinationPath);
      durationSeconds = probe.duration || 30;
      format = probe.format || ext.replace('.', '');
    } catch (e) {
      console.warn('[MusicService] Failed to probe uploaded track:', e);
    }

    const stat = fs.statSync(destinationPath);

    const track: MusicTrack = {
      id: data.id,
      title: data.title || path.basename(data.filename, ext),
      filename: safeFilename,
      storagePath: destinationPath,
      publicUrl: `/api/v1/music/${data.id}/stream`,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      moodTags: data.moodTags && data.moodTags.length > 0 ? data.moodTags : ['upbeat'],
      licenseSource: data.licenseSource || 'Royalty-Free / User Provided',
      fileSizeBytes: stat.size,
      format,
      createdAt: new Date().toISOString(),
    };

    const tracks = this.readMetadata();
    tracks.unshift(track);
    this.writeMetadata(tracks);

    return track;
  }

  public async updateTrack(
    id: string,
    updates: {
      title?: string;
      moodTags?: string[];
      licenseSource?: string;
    }
  ): Promise<MusicTrack | null> {
    const tracks = this.readMetadata();
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    if (updates.title !== undefined) tracks[idx].title = updates.title;
    if (updates.moodTags !== undefined) tracks[idx].moodTags = updates.moodTags;
    if (updates.licenseSource !== undefined) tracks[idx].licenseSource = updates.licenseSource;

    this.writeMetadata(tracks);
    return tracks[idx];
  }

  public async deleteTrack(id: string): Promise<boolean> {
    const tracks = this.readMetadata();
    const track = tracks.find((t) => t.id === id);
    if (!track) return false;

    if (fs.existsSync(track.storagePath)) {
      try {
        fs.unlinkSync(track.storagePath);
      } catch {}
    }

    const remaining = tracks.filter((t) => t.id !== id);
    this.writeMetadata(remaining);
    return true;
  }

  public async findTrackByMood(preferredMood?: string): Promise<MusicTrack | null> {
    const tracks = await this.listTracks();
    if (tracks.length === 0) return null;

    if (preferredMood && preferredMood !== 'none') {
      const normalizedMood = preferredMood.toLowerCase().trim();
      const match = tracks.find((t) =>
        t.moodTags.some((m) => m.toLowerCase().includes(normalizedMood) || normalizedMood.includes(m.toLowerCase()))
      );
      if (match) return match;
    }

    // Default to first track in library
    return tracks[0];
  }
}

export const musicService = new MusicService();

