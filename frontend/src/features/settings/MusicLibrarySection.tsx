import React, { useState, useEffect, useRef } from 'react';
import {
  Music,
  Upload,
  Play,
  Pause,
  Trash2,
  Plus,
  Check,
  AlertCircle,
  Volume2,
  ShieldCheck,
  Clock,
  HardDrive,
  Tag,
  Loader2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { apiClient, MusicTrack } from '../../services/apiClient';
import { formatBytes, formatSimpleDuration } from '../../utils/formatters';

const MOOD_OPTIONS = [
  { id: 'upbeat', label: 'Upbeat / Energetic', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'calm', label: 'Calm / Ambient', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  { id: 'cinematic', label: 'Cinematic / Epic', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'emotional', label: 'Emotional / Reflective', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { id: 'corporate', label: 'Corporate / Tech', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
];

export const MusicLibrarySection: React.FC = () => {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMoodFilter, setSelectedMoodFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Audio Playback state
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Upload modal/form state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadLicense, setUploadLicense] = useState('YouTube Audio Library (Royalty-Free)');
  const [uploadMoods, setUploadMoods] = useState<string[]>(['upbeat']);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchTracks = async (mood?: string) => {
    setIsLoading(true);
    try {
      const list = await apiClient.listMusicTracks(mood && mood !== 'all' ? mood : undefined);
      setTracks(list);
    } catch (err: any) {
      console.warn('Failed to load music tracks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks(selectedMoodFilter);
  }, [selectedMoodFilter]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayToggle = (track: MusicTrack) => {
    if (playingTrackId === track.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const streamUrl = apiClient.getVideoFileUrl(track.url);
    const audio = new Audio(streamUrl);
    audioRef.current = audio;

    audio.onended = () => {
      setPlayingTrackId(null);
    };

    audio.onerror = () => {
      setFeedback({ type: 'error', message: 'Failed to play track preview.' });
      setPlayingTrackId(null);
    };

    audio.play().then(() => {
      setPlayingTrackId(track.id);
    }).catch((e) => {
      console.warn('Audio play error:', e);
      setPlayingTrackId(null);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Clean default title from filename
      const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setUploadTitle(defaultTitle);
    }
  };

  const handleMoodToggle = (moodId: string) => {
    setUploadMoods((prev) =>
      prev.includes(moodId) ? prev.filter((m) => m !== moodId) : [...prev, moodId]
    );
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFeedback({ type: 'error', message: 'Please select an audio file to upload.' });
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      await apiClient.uploadMusicTrack(selectedFile, {
        title: uploadTitle.trim() || selectedFile.name,
        moods: uploadMoods.length > 0 ? uploadMoods : ['upbeat'],
        licenseSource: uploadLicense.trim(),
      });

      setFeedback({ type: 'success', message: `Track "${uploadTitle}" added to Music Library!` });
      setSelectedFile(null);
      setUploadTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchTracks(selectedMoodFilter);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to upload track.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (track: MusicTrack) => {
    if (!window.confirm(`Are you sure you want to remove "${track.title}" from your music library?`)) {
      return;
    }

    if (playingTrackId === track.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackId(null);
    }

    try {
      await apiClient.deleteMusicTrack(track.id);
      setFeedback({ type: 'success', message: `Track "${track.title}" removed.` });
      await fetchTracks(selectedMoodFilter);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete track.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-studio-surface border border-studio-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Music className="w-5 h-5 text-violet-400" />
            <h3 className="text-base font-bold text-white">Royalty-Free Music Library</h3>
          </div>
          <Badge variant="accent">
            {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'} Available
          </Badge>
        </div>

        <p className="text-xs text-studio-muted leading-relaxed">
          Background music is matched automatically based on your edit instructions and rendered with automatic speech ducking.
        </p>

        <div className="p-3.5 rounded bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-2.5 text-emerald-300 text-xs">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-200">Royalty-Free Audio: </span>
            Upload royalty-free music files for production use.
          </div>
        </div>
      </div>

      {/* Upload Track Box */}
      <div className="bg-studio-surface border border-studio-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-studio-border pb-3">
          <Upload className="w-4 h-4 text-violet-400" />
          <h4 className="text-sm font-semibold text-white">Upload New Background Track</h4>
        </div>

        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* File Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-studio-text">Audio File (MP3, WAV, AAC, M4A, OGG)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.aac,.m4a,.ogg"
                onChange={handleFileSelect}
                className="w-full text-xs text-studio-text file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-violet-600 file:text-white hover:file:bg-violet-500 cursor-pointer bg-studio-bg border border-studio-border rounded-lg p-1.5"
              />
            </div>

            {/* Title Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-studio-text">Track Title</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. Sunset Lofi Chill"
                className="w-full bg-studio-bg border border-studio-border rounded-lg px-3 py-2 text-xs text-white placeholder-studio-subtle focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* License Note Input */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-studio-text">License / Attribution Source</label>
              <input
                type="text"
                value={uploadLicense}
                onChange={(e) => setUploadLicense(e.target.value)}
                placeholder="e.g. YouTube Audio Library - Free to use"
                className="w-full bg-studio-bg border border-studio-border rounded-lg px-3 py-2 text-xs text-white placeholder-studio-subtle focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Mood Tags Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-studio-text flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-violet-400" />
              <span>Mood Tags (Select all that apply)</span>
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {MOOD_OPTIONS.map((mood) => {
                const isSelected = uploadMoods.includes(mood.id);
                return (
                  <button
                    key={mood.id}
                    type="button"
                    onClick={() => handleMoodToggle(mood.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      isSelected
                        ? `${mood.color} shadow-sm font-bold`
                        : 'bg-studio-bg border-studio-border text-studio-muted hover:text-white hover:border-studio-subtle'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                    {mood.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isUploading}
              disabled={isUploading || !selectedFile}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Track to Library
            </Button>
          </div>
        </form>

        {feedback && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border border-rose-500/40 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* Tracks List */}
      <div className="bg-studio-surface border border-studio-border rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-studio-border pb-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-violet-400" />
            <h4 className="text-sm font-semibold text-white">Tracks ({tracks.length})</h4>
          </div>

          {/* Mood Filter Pill Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedMoodFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                selectedMoodFilter === 'all'
                  ? 'bg-violet-600 text-white shadow'
                  : 'bg-studio-bg text-studio-muted hover:text-white'
              }`}
            >
              All Moods
            </button>
            {MOOD_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMoodFilter(m.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all capitalize ${
                  selectedMoodFilter === m.id
                    ? 'bg-violet-600 text-white shadow'
                    : 'bg-studio-bg text-studio-muted hover:text-white'
                }`}
              >
                {m.id}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-studio-muted">
            <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
            <span>Loading library tracks...</span>
          </div>
        ) : tracks.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Music className="w-8 h-8 text-studio-subtle mx-auto" />
            <p className="text-xs text-studio-muted">
              {selectedMoodFilter === 'all'
                ? 'Add music in Settings > Music Library (upload your royalty-free tracks above).'
                : `No tracks found with mood "${selectedMoodFilter}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tracks.map((track) => {
              const isPlaying = playingTrackId === track.id;
              return (
                <div
                  key={track.id}
                  className={`bg-studio-card border rounded-lg p-3 flex items-center justify-between gap-3 transition-colors ${
                    isPlaying
                      ? 'border-violet-500 bg-violet-950/20'
                      : 'border-studio-border hover:border-violet-500/40'
                  }`}
                >
                  {/* Left: Play button + Title */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handlePlayToggle(track)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                        isPlaying
                          ? 'bg-violet-600 text-white shadow-lg ring-2 ring-violet-400/50'
                          : 'bg-studio-surface border border-studio-border text-studio-text hover:text-white hover:bg-violet-600 hover:border-transparent'
                      }`}
                      title={isPlaying ? 'Pause preview' : 'Play preview'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>

                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white truncate block">
                        {track.title}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-studio-subtle font-mono mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatSimpleDuration(track.durationSeconds)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {formatBytes(track.fileSizeBytes)}
                        </span>
                        {track.licenseSource && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400/90 truncate max-w-[200px]">
                              {track.licenseSource}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Mood Badges */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    {track.moods.map((m) => {
                      const opt = MOOD_OPTIONS.find((o) => o.id === m);
                      return (
                        <span
                          key={m}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            opt ? opt.color : 'bg-studio-surface border-studio-border text-studio-muted'
                          }`}
                        >
                          {m}
                        </span>
                      );
                    })}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDelete(track)}
                      className="p-1.5 rounded-lg text-studio-muted hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                      title="Remove track"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
