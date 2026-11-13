import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { AspectRatio, EditingStyle, FrameRate, VideoMetadata, VideoResolution } from '../types/video';
import { EditingPreferences } from '../types/plan';
import { TimelineClip, TimelineTrack } from '../types/timeline';
import { Project } from '../types/project';
import { ProjectMediaItem, UploadQueueItem } from '../types/media';
import { validateVideoFile } from '../utils/validators';
import { apiClient } from '../services/apiClient';

interface WorkspaceContextType {
  // Video State
  videoFile: File | null;
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  isLoadingMedia: boolean;
  mediaError: string | null;
  isPreviewLoading: boolean;
  previewStatusMessage: string;
  previewError: string | null;
  isPhoto: boolean;

  // Playback State
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  
  // Player Controls
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  stepFrame: (frames: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  registerVideoElement: (el: HTMLVideoElement | null) => void;

  // Media Assets Library State
  mediaItems: ProjectMediaItem[];
  activeMediaItem: ProjectMediaItem | null;
  setActiveMediaItem: (item: ProjectMediaItem | null) => void;
  selectMediaItemForPreview: (item: ProjectMediaItem) => void;
  setCustomVideoPreview: (url: string, title?: string, durationSec?: number) => void;
  uploadMultipleFiles: (files: File[]) => Promise<void>;
  uploadQueue: UploadQueueItem[];
  deleteMediaItem: (id: string) => Promise<boolean>;
  reorderMediaItems: (newItems: ProjectMediaItem[]) => Promise<void>;
  addMediaItemToTimeline: (item: ProjectMediaItem) => void;
  dismissUploadQueueItem: (id: string) => void;
  clearUploadQueue: () => void;
  // Media Actions
  loadVideoFile: (file: File) => Promise<boolean>;
  clearVideo: () => void;
  generateMissingPreviews: (projectId?: string) => Promise<void>;

  // Editing Preferences & Prompt
  prompt: string;
  setPrompt: (text: string) => void;
  promptTags: string[];
  addPromptTag: (tag: string) => void;
  removePromptTag: (tag: string) => void;
  togglePromptTag: (tag: string) => void;
  
  aspectRatio: AspectRatio;
  setAspectRatio: (ar: AspectRatio) => void;
  resolution: VideoResolution;
  setResolution: (res: VideoResolution) => void;
  frameRate: FrameRate;
  setFrameRate: (fr: FrameRate) => void;
  style: EditingStyle;
  setStyle: (style: EditingStyle) => void;
  pacingDensity: number;
  setPacingDensity: (val: number) => void;

  cutSilences: boolean;
  setCutSilences: (val: boolean) => void;
  generateCaptions: boolean;
  setGenerateCaptions: (val: boolean) => void;
  autoColorGrade: boolean;
  setAutoColorGrade: (val: boolean) => void;
  addBackgroundMusic: boolean;
  setAddBackgroundMusic: (val: boolean) => void;
  musicMood: 'upbeat' | 'chill' | 'cinematic' | 'corporate' | 'none';
  setMusicMood: (mood: 'upbeat' | 'chill' | 'cinematic' | 'corporate' | 'none') => void;

  // Timeline State
  timelineTracks: TimelineTrack[];
  setTimelineTracks: React.Dispatch<React.SetStateAction<TimelineTrack[]>>;
  timelineZoom: number;
  setTimelineZoom: (zoom: number) => void;
  splitClipAtPlayhead: () => void;
  deleteClip: (clipId: string) => void;
  applyAIEditingPlan: (plan: {
    summary: string;
    clips: Array<{ sourceIn: number; sourceOut: number; speed?: number }>;
    captions?: Array<{ startTime: number; endTime: number; text: string }>;
  }) => void;

  // Project persistence
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  projectTitle: string;
  setProjectTitle: (title: string) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  getPreferencesSnapshot: () => EditingPreferences;
  loadProjectData: (project: Project) => void;
  resetWorkspace: () => void;

  // Inspector modal
  isPayloadModalOpen: boolean;
  setIsPayloadModalOpen: (open: boolean) => void;
}

const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'track-v1', name: 'V1 • Primary Video', type: 'video', isMuted: false, isLocked: false, isVisible: true, clips: [] },
  { id: 'track-v2', name: 'V2 • B-Roll & Visuals', type: 'b-roll', isMuted: false, isLocked: false, isVisible: true, clips: [] },
  { id: 'track-a1', name: 'A1 • Dialogue Audio', type: 'audio-dialogue', isMuted: false, isLocked: false, isVisible: true, clips: [] },
  { id: 'track-a2', name: 'A2 • Music & Sound FX', type: 'audio-music', isMuted: false, isLocked: false, isVisible: true, clips: [] },
  { id: 'track-txt', name: 'TXT • Captions', type: 'captions', isMuted: false, isLocked: false, isVisible: true, clips: [] },
];

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewStatusMessage, setPreviewStatusMessage] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPhoto, setIsPhoto] = useState(false);
  // Media Assets Library state
  const [mediaItems, setMediaItems] = useState<ProjectMediaItem[]>([]);
  const [activeMediaItem, setActiveMediaItem] = useState<ProjectMediaItem | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Prompt and Preferences
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState('Untitled Project');
  const [isDirty, setIsDirty] = useState(false);

  const [prompt, setPromptState] = useState('');
  const [promptTags, setPromptTags] = useState<string[]>([
    'Cut all awkward silences > 0.4s',
    'Auto-generate animated captions',
  ]);
  const [aspectRatio, setAspectRatioState] = useState<AspectRatio>('16:9');
  const [resolution, setResolutionState] = useState<VideoResolution>('1080p');
  const [frameRate, setFrameRateState] = useState<FrameRate>('30fps');
  const [style, setStyleState] = useState<EditingStyle>('viral-fast');
  const [pacingDensity, setPacingDensityState] = useState<number>(4);

  const [cutSilences, setCutSilencesState] = useState(true);
  const [generateCaptions, setGenerateCaptionsState] = useState(true);
  const [autoColorGrade, setAutoColorGradeState] = useState(false);
  const [addBackgroundMusic, setAddBackgroundMusicState] = useState(false);
  const [musicMood, setMusicMoodState] = useState<'upbeat' | 'chill' | 'cinematic' | 'corporate' | 'none'>('chill');

  // Timeline
  const [timelineTracks, setTimelineTracks] = useState<TimelineTrack[]>(DEFAULT_TRACKS);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState(false);

  const setPrompt = (val: string) => {
    setPromptState(val);
    setIsDirty(true);
  };

  const setAspectRatio = (ar: AspectRatio) => {
    setAspectRatioState(ar);
    setIsDirty(true);
  };

  const setResolution = (res: VideoResolution) => {
    setResolutionState(res);
    setIsDirty(true);
  };

  const setFrameRate = (fr: FrameRate) => {
    setFrameRateState(fr);
    setIsDirty(true);
  };

  const setStyle = (s: EditingStyle) => {
    setStyleState(s);
    setIsDirty(true);
  };

  const setPacingDensity = (val: number) => {
    setPacingDensityState(val);
    setIsDirty(true);
  };

  const setCutSilences = (val: boolean) => {
    setCutSilencesState(val);
    setIsDirty(true);
  };

  const setGenerateCaptions = (val: boolean) => {
    setGenerateCaptionsState(val);
    setIsDirty(true);
  };

  const setAutoColorGrade = (val: boolean) => {
    setAutoColorGradeState(val);
    setIsDirty(true);
  };

  const setAddBackgroundMusic = (val: boolean) => {
    setAddBackgroundMusicState(val);
    setIsDirty(true);
  };

  const setMusicMood = (mood: 'upbeat' | 'chill' | 'cinematic' | 'corporate' | 'none') => {
    setMusicMoodState(mood);
    setIsDirty(true);
  };

  const addPromptTag = (tag: string) => {
    if (!promptTags.includes(tag)) {
      setPromptTags((prev) => [...prev, tag]);
      setIsDirty(true);
    }
  };

  const removePromptTag = (tag: string) => {
    setPromptTags((prev) => prev.filter((t) => t !== tag));
    setIsDirty(true);
  };

  const togglePromptTag = (tag: string) => {
    if (promptTags.includes(tag)) {
      removePromptTag(tag);
    } else {
      addPromptTag(tag);
    }
  };

  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoElementRef.current = el;
    if (el) {
      el.volume = isMuted ? 0 : volume;
      el.playbackRate = playbackRate;
    }
  }, [volume, isMuted, playbackRate]);

  // Video element event sync
  useEffect(() => {
    const el = videoElementRef.current;
    if (!el) return;

    const handleTimeUpdate = () => setCurrentTime(el.currentTime);
    const handleDurationChange = () => setDuration(el.duration || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('durationchange', handleDurationChange);
    el.addEventListener('play', handlePlay);
    el.addEventListener('pause', handlePause);
    el.addEventListener('ended', handleEnded);

    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('durationchange', handleDurationChange);
      el.removeEventListener('play', handlePlay);
      el.removeEventListener('pause', handlePause);
      el.removeEventListener('ended', handleEnded);
    };
  }, [videoUrl]);

  const play = () => {
    videoElementRef.current?.play().catch((e) => console.warn('Play interrupted:', e));
  };

  const pause = () => {
    videoElementRef.current?.pause();
  };

  const togglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const seek = (seconds: number) => {
    const clamped = Math.max(0, Math.min(seconds, duration));
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  const stepFrame = (deltaFrames: number) => {
    const fps = 30;
    const newTime = currentTime + deltaFrames / fps;
    seek(newTime);
  };

  const setVolume = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (videoElementRef.current) {
      videoElementRef.current.volume = isMuted ? 0 : clamped;
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoElementRef.current) {
      videoElementRef.current.volume = nextMuted ? 0 : volume;
    }
  };

  const setPlaybackRate = (rate: number) => {
    setPlaybackRateState(rate);
    if (videoElementRef.current) {
      videoElementRef.current.playbackRate = rate;
    }
  };

  // Helper to construct timeline tracks once video metadata is extracted
  const initTimelineTracksForVideo = (fileName: string, totalDuration: number) => {
    const primaryClip: TimelineClip = {
      id: `clip_${Date.now()}`,
      trackId: 'track-v1',
      title: fileName,
      startTime: 0,
      duration: totalDuration,
      sourceStartTime: 0,
      sourceDuration: totalDuration,
      type: 'video',
      color: '#8b5cf6',
    };

    setTimelineTracks([
      { id: 'track-v1', name: 'V1 • Primary Video', type: 'video', isMuted: false, isLocked: false, isVisible: true, clips: [primaryClip] },
      { id: 'track-v2', name: 'V2 • B-Roll & Visuals', type: 'b-roll', isMuted: false, isLocked: false, isVisible: true, clips: [] },
      { id: 'track-a1', name: 'A1 • Dialogue Audio', type: 'audio-dialogue', isMuted: false, isLocked: false, isVisible: true, clips: [] },
      { id: 'track-a2', name: 'A2 • Music & Sound FX', type: 'audio-music', isMuted: false, isLocked: false, isVisible: true, clips: [] },
      { id: 'track-txt', name: 'TXT • Captions', type: 'captions', isMuted: false, isLocked: false, isVisible: true, clips: [] },
    ]);
  };

    const selectMediaItemForPreview = (item: ProjectMediaItem) => {
    setActiveMediaItem(item);
    setIsPhoto(!!item.isPhoto);

    const targetUrl = item.previewUrl || item.publicUrl;
    if (targetUrl) {
      const directUrl = apiClient.getVideoFileUrl(targetUrl);
      setVideoUrl(directUrl);
    } else {
      setVideoUrl(null);
    }

    if (item.previewStatus === 'preparing') {
      setIsPreviewLoading(true);
      setPreviewStatusMessage(item.isPhoto ? 'Preparing photo preview...' : 'Preparing preview copy (H.264 / 30fps)...');
      setPreviewError(null);
    } else if (item.previewStatus === 'error') {
      setIsPreviewLoading(false);
      setPreviewError(item.previewError || 'Preview generation failed.');
    } else {
      setIsPreviewLoading(false);
      setPreviewStatusMessage('');
      setPreviewError(null);
    }

    const durationSec = item.durationSeconds || (item.isPhoto ? 5.0 : 10.0);
    const width = item.width || 1280;
    const height = item.height || 720;
    const meta: VideoMetadata = {
      name: item.originalName || item.filename,
      sizeBytes: item.fileSizeBytes,
      type: item.mimeType,
      durationSeconds: durationSec,
      width,
      height,
      aspectRatio: `${width}:${height}`,
      lastModified: new Date(item.createdAt || Date.now()).getTime(),
    };
    setVideoMetadata(meta);
    setDuration(durationSec);
  };

  const setCustomVideoPreview = (url: string, title?: string, durationSec?: number) => {
    setActiveMediaItem(null);
    setIsPhoto(false);
    const directUrl = apiClient.getVideoFileUrl(url);
    setVideoUrl(directUrl);
    setIsPreviewLoading(false);
    setPreviewStatusMessage('');
    setPreviewError(null);
    if (durationSec !== undefined) {
      setDuration(durationSec);
    }
    if (title) {
      setVideoMetadata({
        name: title,
        sizeBytes: 0,
        type: 'video/mp4',
        durationSeconds: durationSec || 0,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        lastModified: Date.now(),
      });
    }
  };

  const uploadMultipleFiles = async (files: File[]): Promise<void> => {
    if (!files || files.length === 0) return;

    // 1. Ensure active project exists
    let activeProjectId = currentProjectId;
    if (!activeProjectId) {
      const autoTitle = projectTitle !== 'Untitled Project' ? projectTitle : files[0].name.replace(/\.[^/.]+$/, '');
      const created = await apiClient.createProject({
        title: autoTitle,
        clientName: 'General',
        aspectRatio: '16:9',
        resolution: '1080p',
      });
      activeProjectId = created.id;
      setCurrentProjectId(created.id);
    }

    // 2. Add all files to the upload queue
    const newQueueItems: UploadQueueItem[] = files.map((file) => ({
      id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
    }));

    setUploadQueue((prev) => [...prev, ...newQueueItems]);

    // 3. Process files concurrently with pool limit
    const processFile = async (item: UploadQueueItem) => {
      const { id: queueId, file } = item;

      // Validate
      const validation = validateVideoFile(file);
      if (!validation.isValid) {
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === queueId ? { ...q, status: 'error', error: validation.error } : q))
        );
        return;
      }

      try {
        const uploadRes = await apiClient.uploadMediaFile(activeProjectId!, file, (percent) => {
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === queueId ? { ...q, progress: percent } : q))
          );
        });

        // Set status to preparing
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === queueId ? { ...q, progress: 100, status: 'preparing' } : q))
        );

        const isPhoto = !!uploadRes.isPhoto;
        const newMediaItem: ProjectMediaItem = {
          id: uploadRes.id,
          projectId: activeProjectId!,
          filename: uploadRes.filename,
          originalName: uploadRes.originalName,
          mimeType: uploadRes.mimeType,
          fileSizeBytes: uploadRes.fileSizeBytes,
          storagePath: uploadRes.storagePath,
          publicUrl: uploadRes.publicUrl,
          previewUrl: uploadRes.previewUrl || null,
          previewStatus: (uploadRes.previewStatus as any) || 'preparing',
          isPhoto,
          status: uploadRes.status || 'uploaded',
          createdAt: new Date().toISOString(),
        };

        // Add to media items in UI immediately
        setMediaItems((prev) => {
          const filtered = prev.filter((m) => m.id !== newMediaItem.id);
          return [...filtered, newMediaItem];
        });

        // Select for preview if nothing is playing
        setActiveMediaItem((current) => {
          if (!current) {
            selectMediaItemForPreview(newMediaItem);
            return newMediaItem;
          }
          return current;
        });

        // Background poll for preview readiness
        let attempts = 0;
        let pollAsset: any = uploadRes;
        while (attempts < 60 && (pollAsset.previewStatus === 'preparing' || (!pollAsset.previewUrl && pollAsset.status === 'processing'))) {
          await new Promise((r) => setTimeout(r, 1000));
          attempts++;
          try {
            pollAsset = await apiClient.getMediaAsset(uploadRes.id);
            if (pollAsset.previewStatus === 'ready' || pollAsset.previewStatus === 'skipped') {
              break;
            } else if (pollAsset.previewStatus === 'error') {
              break;
            }
          } catch {
            // continue
          }
        }

        const updatedItem: ProjectMediaItem = {
          ...newMediaItem,
          previewUrl: pollAsset.previewUrl || pollAsset.publicUrl,
          previewStatus: pollAsset.previewStatus || 'ready',
          previewError: pollAsset.previewError,
          thumbnailUrl: pollAsset.thumbnailUrl,
          width: pollAsset.metadata?.width || pollAsset.width,
          height: pollAsset.metadata?.height || pollAsset.height,
          durationSeconds: pollAsset.metadata?.duration || pollAsset.durationSeconds || (isPhoto ? 5.0 : 10.0),
        };

        setMediaItems((prev) =>
          prev.map((m) => (m.id === updatedItem.id ? updatedItem : m))
        );

        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === queueId
              ? {
                  ...q,
                  status: pollAsset.previewStatus === 'error' ? 'error' : 'ready',
                  error: pollAsset.previewError,
                }
              : q
          )
        );

        // If this item is currently selected in Preview Monitor, refresh its preview
        setActiveMediaItem((curr) => {
          if (curr?.id === updatedItem.id) {
            selectMediaItemForPreview(updatedItem);
            return updatedItem;
          }
          return curr;
        });
      } catch (err: any) {
        const errorMsg = err?.message || 'Upload failed';
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === queueId ? { ...q, status: 'error', error: errorMsg } : q))
        );
      }
    };

    const poolLimit = 3;
    const executing: Promise<any>[] = [];
    for (const item of newQueueItems) {
      const p = processFile(item).then(() => {
        const idx = executing.indexOf(p);
        if (idx !== -1) executing.splice(idx, 1);
      });
      executing.push(p);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
    setIsDirty(true);
  };

  const deleteMediaItem = async (id: string): Promise<boolean> => {
    try {
      await apiClient.deleteMediaAsset(id);
      setMediaItems((prev) => {
        const next = prev.filter((m) => m.id !== id);
        if (activeMediaItem?.id === id) {
          if (next.length > 0) {
            selectMediaItemForPreview(next[0]);
          } else {
            clearVideo();
          }
        }
        return next;
      });

      // Remove from timeline tracks if present
      setTimelineTracks((prev) =>
        prev.map((track) => ({
          ...track,
          clips: track.clips.filter((c) => (c as any).mediaAssetId !== id && c.id !== id),
        }))
      );

      // Save updated order
      if (currentProjectId) {
        const remainingIds = mediaItems.filter((m) => m.id !== id).map((m) => m.id);
        await apiClient.reorderProjectMedia(currentProjectId, remainingIds);
      }

      setIsDirty(true);
      return true;
    } catch (err: any) {
      setMediaError(err?.message || 'Failed to delete media asset');
      return false;
    }
  };

  const reorderMediaItems = async (newItems: ProjectMediaItem[]): Promise<void> => {
    setMediaItems(newItems);
    if (currentProjectId) {
      try {
        const newOrder = newItems.map((item) => item.id);
        await apiClient.reorderProjectMedia(currentProjectId, newOrder);
      } catch (err) {
        console.warn('Failed to persist media order:', err);
      }
    }
    setIsDirty(true);
  };

  const addMediaItemToTimeline = (item: ProjectMediaItem): void => {
    const clipDuration = item.isPhoto ? 5.0 : (item.durationSeconds || 10.0);

    setTimelineTracks((prev) => {
      let v1Track = prev.find((t) => t.id === 'track-v1' || t.type === 'video');
      let otherTracks = prev.filter((t) => t !== v1Track);

      if (!v1Track) {
        v1Track = {
          id: 'track-v1',
          name: 'V1 • Primary Video',
          type: 'video',
          isMuted: false,
          isLocked: false,
          isVisible: true,
          clips: [],
        };
      }

      const existingClips = v1Track.clips;
      let startTime = 0;
      if (existingClips.length > 0) {
        startTime = Math.max(...existingClips.map((c) => c.startTime + c.duration));
      }

      const newClip: TimelineClip = {
        id: `clip_${item.id}_${Date.now()}`,
        trackId: 'track-v1',
        title: item.originalName || item.filename,
        startTime,
        duration: clipDuration,
        sourceStartTime: 0,
        sourceDuration: clipDuration,
        type: 'video',
        color: item.isPhoto ? '#10b981' : '#8b5cf6',
      };

      const updatedClips = [...existingClips, newClip];
      const updatedTrack = { ...v1Track, clips: updatedClips };

      const totalEndTime = startTime + clipDuration;
      setDuration((prevDur) => Math.max(prevDur, totalEndTime));

      return [updatedTrack, ...otherTracks].sort((a, b) => {
        const order = ['track-v1', 'track-v2', 'track-a1', 'track-a2', 'track-txt'];
        return order.indexOf(a.id) - order.indexOf(b.id);
      });
    });

    selectMediaItemForPreview(item);
    setIsDirty(true);
  };

  const dismissUploadQueueItem = (id: string) => {
    setUploadQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const clearUploadQueue = () => {
    setUploadQueue((prev) => prev.filter((q) => q.status === 'uploading' || q.status === 'preparing'));
  };

    const loadVideoFile = async (file: File): Promise<boolean> => {
    await uploadMultipleFiles([file]);
    return true;
  };


  const clearVideo = () => {
    if (videoUrl && !videoUrl.startsWith('data:') && !videoUrl.startsWith('http')) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setActiveMediaItem(null);
    setIsPreviewLoading(false);
    setPreviewStatusMessage('');
    setPreviewError(null);
    setIsPhoto(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setTimelineTracks(DEFAULT_TRACKS);
  };

  const splitClipAtPlayhead = () => {
    const playhead = currentTime;
    setTimelineTracks((prev) =>
      prev.map((track) => {
        if (track.type !== 'video') return track;
        const newClips: TimelineClip[] = [];

        track.clips.forEach((clip) => {
          const clipStart = clip.startTime;
          const clipEnd = clip.startTime + clip.duration;

          // If playhead falls strictly inside this clip
          if (playhead > clipStart + 0.1 && playhead < clipEnd - 0.1) {
            const firstPartDuration = playhead - clipStart;
            const secondPartDuration = clipEnd - playhead;

            const clipPart1: TimelineClip = {
              ...clip,
              id: `${clip.id}_pt1`,
              duration: firstPartDuration,
              sourceDuration: firstPartDuration,
            };

            const clipPart2: TimelineClip = {
              ...clip,
              id: `${clip.id}_pt2`,
              startTime: playhead,
              duration: secondPartDuration,
              sourceStartTime: clip.sourceStartTime + firstPartDuration,
              sourceDuration: secondPartDuration,
            };

            newClips.push(clipPart1, clipPart2);
          } else {
            newClips.push(clip);
          }
        });

        return { ...track, clips: newClips };
      })
    );
    setIsDirty(true);
  };

  const deleteClip = (clipId: string) => {
    setTimelineTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId),
      }))
    );
    setIsDirty(true);
  };

  const getPreferencesSnapshot = (): EditingPreferences => ({
    aspectRatio,
    resolution,
    frameRate,
    style,
    pacingDensity,
    cutSilences,
    generateCaptions,
    autoColorGrade,
    addBackgroundMusic,
    musicMood,
  });

  const loadProjectData = async (project: Project) => {
    setCurrentProjectId(project.id);
    setProjectTitle(project.title);
    setPrompt(project.rawPrompt || '');
    setPromptTags(project.tags || []);
    if (project.preferences) {
      setAspectRatioState(project.preferences.aspectRatio);
      setResolutionState(project.preferences.resolution);
      setFrameRateState(project.preferences.frameRate);
      setStyleState(project.preferences.style);
      setPacingDensityState(project.preferences.pacingDensity);
      setCutSilencesState(project.preferences.cutSilences);
      setGenerateCaptionsState(project.preferences.generateCaptions);
      setAutoColorGradeState(project.preferences.autoColorGrade);
      setAddBackgroundMusicState(project.preferences.addBackgroundMusic);
      setMusicMoodState(project.preferences.musicMood);
    }
    if (project.videoMetadata) {
      setVideoMetadata(project.videoMetadata);
      setDuration(project.videoMetadata.durationSeconds);
      initTimelineTracksForVideo(project.videoMetadata.name, project.videoMetadata.durationSeconds);
    }

    // Restore video stream directly from backend disk storage
    try {
      const bp = await apiClient.getProject(project.id);
      if (bp.mediaAssets && bp.mediaAssets.length > 0) {
        setMediaItems(bp.mediaAssets as any);
        const firstAsset = bp.mediaAssets[0];
        selectMediaItemForPreview(firstAsset as any);
      } else {
        setMediaItems([]);
        setActiveMediaItem(null);
      }
    } catch (e) {
      console.warn('Could not restore video from backend storage:', e);
    }

    setIsDirty(false);
  };

  const generateMissingPreviews = async (projectId?: string) => {
    setIsPreviewLoading(true);
    setPreviewStatusMessage('Preparing browser-friendly previews in background...');
    setPreviewError(null);
    try {
      const targetId = projectId || currentProjectId || undefined;
      await apiClient.generateAllPreviews(targetId);
      if (currentProjectId) {
        const bp = await apiClient.getProject(currentProjectId);
        if (bp.mediaAssets && bp.mediaAssets.length > 0) {
          const asset = bp.mediaAssets[0];
          setIsPhoto(!!asset.isPhoto);
          if (asset.previewUrl) {
            setVideoUrl(apiClient.getVideoFileUrl(asset.previewUrl));
          }
          setPreviewError(null);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate previews';
      setPreviewError(msg);
    } finally {
      setIsPreviewLoading(false);
      setPreviewStatusMessage('');
    }
  };

  const resetWorkspace = () => {
    clearVideo();
    setCurrentProjectId(null);
    setProjectTitle('Untitled Project');
    setPrompt('');
    setPromptTags(['Cut all awkward silences > 0.4s', 'Auto-generate animated captions']);
    setAspectRatioState('16:9');
    setResolutionState('1080p');
    setFrameRateState('30fps');
    setStyleState('viral-fast');
    setPacingDensityState(4);
    setCutSilencesState(true);
    setGenerateCaptionsState(true);
    setAutoColorGradeState(false);
    setAddBackgroundMusicState(false);
    setMusicMoodState('chill');
    setIsPreviewLoading(false);
    setPreviewStatusMessage('');
    setPreviewError(null);
    setIsPhoto(false);
    setMediaItems([]);
    setActiveMediaItem(null);
    setUploadQueue([]);
    setTimelineTracks(DEFAULT_TRACKS);
    setIsDirty(false);
  };

  const applyAIEditingPlan = (plan: {
    summary: string;
    clips: Array<{ sourceIn: number; sourceOut: number; speed?: number }>;
    captions?: Array<{ startTime: number; endTime: number; text: string }>;
  }) => {
    let cursor = 0;
    const videoClips: TimelineClip[] = plan.clips.map((c, i) => {
      const clipDuration = (c.sourceOut - c.sourceIn) / (c.speed || 1.0);
      const clip: TimelineClip = {
        id: `clip-${i}-${Date.now()}`,
        trackId: 'track-v1',
        title: `Scene ${i + 1} (${c.sourceIn.toFixed(1)}s - ${c.sourceOut.toFixed(1)}s)`,
        startTime: cursor,
        duration: clipDuration,
        sourceStartTime: c.sourceIn,
        sourceDuration: c.sourceOut - c.sourceIn,
        type: 'video',
        color: '#8b5cf6',
      };
      cursor += clipDuration;
      return clip;
    });

    const captionClips: TimelineClip[] = (plan.captions || []).map((cap, i) => ({
      id: `cap-${i}-${Date.now()}`,
      trackId: 'track-txt',
      title: cap.text,
      startTime: cap.startTime,
      duration: Math.max(0.5, cap.endTime - cap.startTime),
      sourceStartTime: cap.startTime,
      sourceDuration: Math.max(0.5, cap.endTime - cap.startTime),
      type: 'captions',
      color: '#10b981',
    }));

    setTimelineTracks((prev) =>
      prev.map((track) => {
        if (track.id === 'track-v1' || track.type === 'video') {
          return { ...track, clips: videoClips };
        }
        if (track.id === 'track-txt' || track.type === 'captions') {
          return { ...track, clips: captionClips };
        }
        return track;
      })
    );

    if (cursor > 0) {
      setDuration(cursor);
    }
    setIsDirty(true);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        videoFile,
        videoUrl,
        videoMetadata,
        isLoadingMedia,
        mediaError,
        isPreviewLoading,
        previewStatusMessage,
        previewError,
        isPhoto,
        currentTime,
        duration,
        isPlaying,
        volume,
        isMuted,
        playbackRate,
        play,
        pause,
        togglePlay,
        seek,
        stepFrame,
        setVolume,
        toggleMute,
        setPlaybackRate,
        registerVideoElement,
        mediaItems,
        activeMediaItem,
        setActiveMediaItem,
        selectMediaItemForPreview,
        setCustomVideoPreview,
        uploadMultipleFiles,
        uploadQueue,
        deleteMediaItem,
        reorderMediaItems,
        addMediaItemToTimeline,
        dismissUploadQueueItem,
        clearUploadQueue,
        loadVideoFile,
        clearVideo,
        generateMissingPreviews,
        prompt,
        setPrompt,
        promptTags,
        addPromptTag,
        removePromptTag,
        togglePromptTag,
        aspectRatio,
        setAspectRatio,
        resolution,
        setResolution,
        frameRate,
        setFrameRate,
        style,
        setStyle,
        pacingDensity,
        setPacingDensity,
        cutSilences,
        setCutSilences,
        generateCaptions,
        setGenerateCaptions,
        autoColorGrade,
        setAutoColorGrade,
        addBackgroundMusic,
        setAddBackgroundMusic,
        musicMood,
        setMusicMood,
        timelineTracks,
        setTimelineTracks,
        timelineZoom,
        setTimelineZoom,
        splitClipAtPlayhead,
        deleteClip,
        applyAIEditingPlan,
        currentProjectId,
        setCurrentProjectId,
        projectTitle,
        setProjectTitle,
        isDirty,
        setIsDirty,
        getPreferencesSnapshot,
        loadProjectData,
        resetWorkspace,
        isPayloadModalOpen,
        setIsPayloadModalOpen,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

