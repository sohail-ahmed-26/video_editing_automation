import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  SkipBack,
  SkipForward,
  Film,
  Grid,
  Loader2,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';
import { useWorkspace } from '../../store/WorkspaceContext';
import { formatTimecode } from '../../utils/formatters';

interface VideoPlayerProps {
  src?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src }) => {
  const {
    videoUrl,
    videoMetadata,
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    togglePlay,
    seek,
    stepFrame,
    setVolume,
    toggleMute,
    setPlaybackRate,
    registerVideoElement,
    aspectRatio,
    isPreviewLoading,
    previewStatusMessage,
    previewError,
    isPhoto,
  } = useWorkspace();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGridOverlay, setShowGridOverlay] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seek(Math.max(0, currentTime - (e.shiftKey ? 5 : 1)));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seek(Math.min(duration, currentTime + (e.shiftKey ? 5 : 1)));
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seek, currentTime, duration, toggleMute]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const getAspectRatioClasses = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'max-w-[340px] aspect-[9/16]';
      case '1:1':
        return 'max-w-[460px] aspect-square';
      case '4:5':
        return 'max-w-[380px] aspect-[4/5]';
      case '21:9':
        return 'max-w-[850px] aspect-[21/9]';
      case '16:9':
      default:
        return 'max-w-[800px] aspect-video';
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-studio-surface border border-studio-border rounded-xl overflow-hidden shadow-studio"
    >
      {/* Top Preview Bar */}
      <div className="h-10 px-4 bg-studio-card/80 border-b border-studio-border flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-studio-muted">
            {isPhoto ? 'Photo Preview' : 'Preview Monitor'}
          </span>
          {isPreviewLoading && (
            <span className="flex items-center gap-1 text-[11px] text-violet-400 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Preparing...</span>
            </span>
          )}
          {videoMetadata && !isPreviewLoading && (
            <span className="font-mono text-[11px] text-studio-subtle">
              ({videoMetadata.width}×{videoMetadata.height})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGridOverlay(!showGridOverlay)}
            className={`p-1.5 rounded transition-colors ${
              showGridOverlay
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                : 'text-studio-muted hover:text-studio-text hover:bg-studio-surface'
            }`}
            title="Toggle Rule-of-Thirds Grid Overlay"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-studio-surface border border-studio-border text-violet-300">
            Target Aspect: {aspectRatio}
          </span>
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative flex-1 min-h-[320px] max-h-[480px] bg-black/90 flex items-center justify-center p-4 overflow-hidden select-none">
        {isPreviewLoading ? (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Preparing preview...</p>
              <p className="text-xs text-studio-muted max-w-sm">
                {previewStatusMessage || 'Converting to browser-safe format in background...'}
              </p>
            </div>
          </div>
        ) : previewError && !videoUrl ? (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3 max-w-md">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-rose-300">Preview Could Not Be Loaded</p>
              <p className="text-xs text-rose-200/80">{previewError}</p>
            </div>
          </div>
        ) : videoUrl ? (
          <div className={`relative w-full transition-all duration-300 flex items-center justify-center ${getAspectRatioClasses()}`}>
            {isPhoto && !src ? (
              <img
                src={videoUrl}
                alt=""
                className="w-full h-full object-contain rounded shadow-2xl"
              />
            ) : (
              <video
                ref={registerVideoElement}
                src={src || videoUrl}
                playsInline
                onClick={togglePlay}
                className="w-full h-full object-contain cursor-pointer rounded shadow-2xl"
              />
            )}

            {previewError && (
              <div className="absolute top-2 left-2 right-2 bg-amber-950/80 border border-amber-500/40 text-amber-200 px-3 py-1.5 rounded text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                <span className="truncate">{previewError}</span>
              </div>
            )}

            {showGridOverlay && (
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-violet-500/30">
                <div className="border-r border-b border-violet-500/20"></div>
                <div className="border-r border-b border-violet-500/20"></div>
                <div className="border-b border-violet-500/20"></div>
                <div className="border-r border-b border-violet-500/20"></div>
                <div className="border-r border-b border-violet-500/20"></div>
                <div className="border-b border-violet-500/20"></div>
                <div className="border-r border-violet-500/20"></div>
                <div className="border-r border-violet-500/20"></div>
                <div></div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-studio-card border border-studio-border flex items-center justify-center text-studio-subtle">
              <Film className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-studio-text">No Media Loaded</p>
              <p className="text-xs text-studio-muted max-w-xs">
                Upload a video or photo above to activate playback and preview.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Scrubber Bar */}
      <div className="relative px-4 pt-3 pb-1 bg-studio-card/90 border-t border-studio-border">
        <div
          onClick={(e) => {
            if (!duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickRatio = (e.clientX - rect.left) / rect.width;
            seek(clickRatio * duration);
          }}
          className="relative h-2 w-full bg-studio-surface rounded-full cursor-pointer group flex items-center"
        >
          <div
            className="h-full bg-violet-600 rounded-full group-hover:bg-violet-500 transition-colors"
            style={{ width: `${progressPercent}%` }}
          />

          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-violet-600 pointer-events-none transform -translate-x-1/2 group-hover:scale-125 transition-transform"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Control Buttons */}
      <div className="h-12 px-4 bg-studio-card/90 flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepFrame(-30)}
            disabled={!videoUrl}
            className="p-1.5 rounded text-studio-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-studio-surface"
            title="Step Back 1s (Arrow Left)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            disabled={!videoUrl}
            className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-studio-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            onClick={() => stepFrame(30)}
            disabled={!videoUrl}
            className="p-1.5 rounded text-studio-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-studio-surface"
            title="Step Forward 1s (Arrow Right)"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            onClick={() => seek(0)}
            disabled={!videoUrl}
            className="p-1.5 rounded text-studio-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-studio-surface"
            title="Reset to 00:00:00"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="ml-2 px-2.5 py-1 rounded bg-studio-surface border border-studio-border font-timecode text-xs text-studio-text flex items-center gap-1.5">
            <span className="text-violet-400 font-semibold">{formatTimecode(currentTime)}</span>
            <span className="text-studio-subtle">/</span>
            <span className="text-studio-muted">{formatTimecode(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 group">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded text-studio-muted hover:text-white hover:bg-studio-surface"
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-studio-surface rounded-full appearance-none cursor-pointer"
              title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>

          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            className="bg-studio-surface border border-studio-border text-studio-text text-xs rounded px-2 py-1 focus:outline-none"
            title="Playback Speed"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded text-studio-muted hover:text-white hover:bg-studio-surface"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
