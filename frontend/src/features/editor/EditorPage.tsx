import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Download,
  Check,
  AlertCircle,
  Loader2,
  Film,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { VideoUploader } from '../../components/video/VideoUploader';
import { VideoPlayer } from '../../components/video/VideoPlayer';
import { MediaLibrary } from '../../components/media/MediaLibrary';
import { PhotoEditingWorkspace } from '../workspace/PhotoEditingWorkspace';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useProjects } from '../../store/ProjectContext';
import { useSettings } from '../../store/SettingsContext';
import { apiClient } from '../../services/apiClient';
import { ProjectVersion } from '../../types/project';

interface FormatOption {
  id: string;
  name: string;
  aspectRatio: string;
  resolution: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'yt-16-9', name: 'YouTube', aspectRatio: '16:9', resolution: '1920x1080' },
  { id: 'yt-shorts', name: 'YouTube Shorts', aspectRatio: '9:16', resolution: '1080x1920' },
  { id: 'tiktok', name: 'TikTok', aspectRatio: '9:16', resolution: '1080x1920' },
  { id: 'ig-reel', name: 'Instagram Reel', aspectRatio: '9:16', resolution: '1080x1920' },
  { id: 'ig-1-1', name: 'Instagram Post 1:1', aspectRatio: '1:1', resolution: '1080x1080' },
  { id: 'ig-4-5', name: 'Instagram Post 4:5', aspectRatio: '4:5', resolution: '1080x1350' },
];

export const EditorPage: React.FC = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const {
    currentProjectId,
    setCurrentProjectId,
    projectTitle,
    setProjectTitle,
    aspectRatio,
    setAspectRatio,
    setResolution,
    mediaItems,
    loadProjectData,
  } = useWorkspace();
  const { getProject, saveProject } = useProjects();
  const { settings } = useSettings();

  // Mode: Video | Photo
  const [editorMode, setEditorMode] = useState<'video' | 'photo'>('video');

  // Format selection
  const [selectedFormatId, setSelectedFormatId] = useState<string>('yt-16-9');

  // Instructions prompt
  const [prompt, setPrompt] = useState('');
  const [addExtraFootage, setAddExtraFootage] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Working state & progress
  const [isWorking, setIsWorking] = useState(false);
  const [friendlyStep, setFriendlyStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result state
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Change request
  const [changeRequestText, setChangeRequestText] = useState('');
  const [isApplyingChange, setIsApplyingChange] = useState(false);

  // Active plan version
  const [activePlanVersion, setActivePlanVersion] = useState<string | null>(null);

  // Auto-save debounce timer
  const autoSaveTimerRef = useRef<any>(null);

  // Load project from route parameter
  useEffect(() => {
    if (projectId && projectId !== currentProjectId) {
      const proj = getProject(projectId);
      if (proj) {
        loadProjectData(proj);
        setCurrentProjectId(proj.id);
        setPrompt(proj.rawPrompt || '');
        if (proj.preferences?.aspectRatio) {
          const match = FORMAT_OPTIONS.find((f) => f.aspectRatio === proj.preferences.aspectRatio);
          if (match) setSelectedFormatId(match.id);
        }
        if (proj.versions && proj.versions.length > 0) {
          setVersions(proj.versions);
          const latest = proj.versions[0];
          setSelectedVersionId(latest.id);
          setActiveVideoUrl(apiClient.getVideoFileUrl(latest.publicUrl));
        }
      }
    }
  }, [projectId, currentProjectId, getProject, loadProjectData, setCurrentProjectId]);

  // Sync format with aspect ratio
  const handleSelectFormat = (format: FormatOption) => {
    setSelectedFormatId(format.id);
    setAspectRatio(format.aspectRatio as any);
    setResolution(format.resolution as any);
  };

  // Debounced auto-save project
  useEffect(() => {
    if (!currentProjectId) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const curFormat = FORMAT_OPTIONS.find((f) => f.id === selectedFormatId) || FORMAT_OPTIONS[0];
        await saveProject({
          id: currentProjectId,
          title: projectTitle || 'Untitled Project',
          rawPrompt: prompt,
          preferences: {
            aspectRatio: curFormat.aspectRatio as any,
            resolution: curFormat.resolution as any,
            style: 'standard',
            cutSilences: settings.editDefaults?.silenceRemoval ?? true,
            generateCaptions: settings.editDefaults?.captions ?? true,
            addBackgroundMusic: settings.editDefaults?.music ?? false,
            musicMood: settings.editDefaults?.musicMood ?? 'chill',
          } as any,
        });
      } catch (err) {
        console.warn('Auto-save warning:', err);
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [prompt, selectedFormatId, projectTitle, currentProjectId, saveProject, settings.editDefaults]);

  // Fetch updated project versions
  const refreshVersions = async (pId: string) => {
    try {
      const vList = await apiClient.listProjectVersions(pId);
      setVersions(vList);
      if (vList.length > 0) {
        setSelectedVersionId(vList[0].id);
        setActiveVideoUrl(apiClient.getVideoFileUrl(vList[0].publicUrl));
      }
    } catch (err) {
      console.warn('Could not refresh versions:', err);
    }
  };

  // Execute render job
  const runRender = async (pId: string, quality: 'draft' | 'final', planVer?: string) => {
    setFriendlyStep('Rendering');
    setProgressPercent(50);

    const editDefaults = settings.editDefaults || {
      captions: true,
      captionStyle: 'clean',
      music: false,
      musicMood: 'chill',
      logo: false,
      silenceRemoval: true,
    };

    const renderRes = await apiClient.startRender(pId, {
      qualityMode: quality,
      planVersion: planVer,
      captions: editDefaults.captions,
      captionStyle: editDefaults.captionStyle,
      music: editDefaults.music,
      musicMood: editDefaults.musicMood,
      useBrandKit: editDefaults.logo,
      silenceRemoval: editDefaults.silenceRemoval,
    });

    const jobId = renderRes.jobId;

    // Poll render progress
    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const status = await apiClient.getRenderStatus(jobId);
          if (status.status === 'completed') {
            clearInterval(interval);
            setProgressPercent(100);
            resolve();
          } else if (status.status === 'failed') {
            clearInterval(interval);
            reject(new Error(status.errorMessage || 'Rendering encountered an issue.'));
          } else {
            const rawProgress = status.progressPercent || 0;
            const mapped = Math.round(50 + (rawProgress * 0.48));
            setProgressPercent(mapped);
          }
        } catch (e) {
          clearInterval(interval);
          reject(e);
        }
      }, 1500);
    });

    await refreshVersions(pId);
  };

  // Main CTA: Create Edit
  const handleCreateEdit = async () => {
    setPromptError(null);
    setErrorMessage(null);

    // Prompt check: square brackets placeholder
    if (/\[[^\]]+\]/.test(prompt)) {
      setPromptError('Please replace the text in [ ] with your own details.');
      return;
    }

    if (mediaItems.length === 0) {
      setErrorMessage('Please upload at least one video or photo to edit.');
      return;
    }

    let targetProjectId = currentProjectId;
    setIsWorking(true);
    setFriendlyStep('Analysing footage');
    setProgressPercent(15);

    try {
      // Ensure project exists
      if (!targetProjectId) {
        const curFormat = FORMAT_OPTIONS.find((f) => f.id === selectedFormatId) || FORMAT_OPTIONS[0];
        const newProj = await saveProject({
          title: projectTitle || 'New Edit',
          clientName: 'General',
          status: 'draft',
          rawPrompt: prompt,
          preferences: {
            aspectRatio: curFormat.aspectRatio as any,
            resolution: curFormat.resolution as any,
          } as any,
        });
        targetProjectId = newProj.id;
        setCurrentProjectId(newProj.id);
      }

      // Step 2: Planning the edit
      setFriendlyStep('Planning the edit');
      setProgressPercent(35);

      const curFormat = FORMAT_OPTIONS.find((f) => f.id === selectedFormatId) || FORMAT_OPTIONS[0];
      const planRes = await apiClient.generateAIPlan(targetProjectId, {
        prompt: prompt.trim() || 'Create a clean, well-paced edit of the uploaded footage.',
        targetPlatform: curFormat.name.toLowerCase().replace(/\s+/g, '_'),
        aspectRatio: curFormat.aspectRatio,
        resolution: curFormat.resolution,
        enableStockBRoll: addExtraFootage,
        cutSilences: settings.editDefaults?.silenceRemoval ?? true,
        generateCaptions: settings.editDefaults?.captions ?? true,
        backgroundMusic: settings.editDefaults?.music ?? false,
        systemPrompt: settings.systemPrompt,
      });

      const planVersion = planRes.data.version;
      setActivePlanVersion(planVersion);

      // Step 3: Rendering
      await runRender(targetProjectId, 'draft', planVersion);
    } catch (err: any) {
      console.error('Create edit error:', err);
      setErrorMessage(err?.message || 'Unable to complete edit. Please check your settings.');
    } finally {
      setIsWorking(false);
      setFriendlyStep('');
      setProgressPercent(0);
    }
  };

  // Higher Quality Render
  const handleHigherQuality = async () => {
    if (!currentProjectId) return;
    setIsWorking(true);
    setErrorMessage(null);
    try {
      await runRender(currentProjectId, 'final', activePlanVersion || undefined);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to render high quality version.');
    } finally {
      setIsWorking(false);
      setFriendlyStep('');
      setProgressPercent(0);
    }
  };

  // Change Request
  const handleApplyChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeRequestText.trim() || !currentProjectId || isApplyingChange) return;

    setIsApplyingChange(true);
    setIsWorking(true);
    setErrorMessage(null);
    setFriendlyStep('Planning the edit');
    setProgressPercent(30);

    try {
      const curFormat = FORMAT_OPTIONS.find((f) => f.id === selectedFormatId) || FORMAT_OPTIONS[0];
      const combinedPrompt = prompt
        ? `${prompt}\n\nRevision request: ${changeRequestText.trim()}`
        : changeRequestText.trim();

      setPrompt(combinedPrompt);

      const planRes = await apiClient.generateAIPlan(currentProjectId, {
        prompt: combinedPrompt,
        targetPlatform: curFormat.name.toLowerCase().replace(/\s+/g, '_'),
        aspectRatio: curFormat.aspectRatio,
        resolution: curFormat.resolution,
        enableStockBRoll: addExtraFootage,
        systemPrompt: settings.systemPrompt,
      });

      const newPlanVersion = planRes.data.version;
      setActivePlanVersion(newPlanVersion);
      setChangeRequestText('');

      await runRender(currentProjectId, 'draft', newPlanVersion);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to apply change request.');
    } finally {
      setIsApplyingChange(false);
      setIsWorking(false);
      setFriendlyStep('');
      setProgressPercent(0);
    }
  };

  return (
    <div className="w-full max-w-none p-6 md:p-8 space-y-6">
      {/* Top Bar: Switch "Video | Photo" */}
      <div className="flex items-center justify-between border-b border-[#23262D] pb-4">
        <div className="flex items-center gap-1 p-0.5 rounded bg-[#121317] border border-[#23262D]">
          <button
            type="button"
            onClick={() => setEditorMode('video')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              editorMode === 'video'
                ? 'bg-[#C8A96A] text-[#0B0C0E]'
                : 'text-[#8B909A] hover:text-[#ECEDEF]'
            }`}
          >
            Video
          </button>
          <button
            type="button"
            onClick={() => setEditorMode('photo')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              editorMode === 'photo'
                ? 'bg-[#C8A96A] text-[#0B0C0E]'
                : 'text-[#8B909A] hover:text-[#ECEDEF]'
            }`}
          >
            Photo
          </button>
        </div>

        {projectTitle && (
          <span className="text-xs text-[#8B909A] truncate max-w-xs font-medium">
            {projectTitle}
          </span>
        )}
      </div>

      {/* PHOTO MODE */}
      {editorMode === 'photo' ? (
        <PhotoEditingWorkspace />
      ) : (
        /* VIDEO MODE: ONE CLEAN COLUMN */
        <div className="space-y-6">
          {/* (1) UPLOAD (Videos and photos, many files, with Media Library below) */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-[#8B909A] uppercase tracking-wider">
              1. Media Footage
            </span>
            <VideoUploader />
            <MediaLibrary />
          </div>

          {/* (2) FORMAT BUTTONS */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-semibold text-[#8B909A] uppercase tracking-wider">
              2. Format
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {FORMAT_OPTIONS.map((fmt) => {
                const isSelected = selectedFormatId === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => handleSelectFormat(fmt)}
                    className={`p-2.5 rounded border text-left transition-colors flex flex-col justify-between min-h-[58px] ${
                      isSelected
                        ? 'bg-[#181A1F] border-[#C8A96A] text-[#ECEDEF]'
                        : 'bg-[#121317] border-[#23262D] text-[#8B909A] hover:text-[#ECEDEF]'
                    }`}
                  >
                    <span className="text-xs font-semibold truncate">{fmt.name}</span>
                    <span className="text-[10px] font-mono text-[#5a5f6b]">{fmt.aspectRatio}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* (3) INSTRUCTIONS (One prompt box + helper line, no example chips) */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-semibold text-[#8B909A] uppercase tracking-wider">
              3. Instructions
            </span>
            <div className="space-y-1.5">
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  if (promptError) setPromptError(null);
                }}
                placeholder="Describe how you want this video edited..."
                rows={3}
                className={`w-full bg-[#121317] border ${
                  promptError ? 'border-[#C75B5B]' : 'border-[#23262D] focus:border-[#C8A96A]'
                } rounded p-3 text-sm text-[#ECEDEF] placeholder-[#5a5f6b] outline-none transition-colors`}
              />
              <p className="text-[11px] text-[#8B909A]">
                Describe how you want this video edited, or leave blank for a standard cut.
              </p>
              {promptError && (
                <p className="text-xs text-[#C75B5B] flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{promptError}</span>
                </p>
              )}
            </div>

            {/* Switch: Add extra footage */}
            <div className="pt-2 flex items-center justify-between p-3 rounded bg-[#121317] border border-[#23262D]">
              <div>
                <span className="text-xs font-medium text-[#ECEDEF]">Add extra footage</span>
                <p className="text-[11px] text-[#8B909A]">Include matching supplemental footage</p>
              </div>
              <button
                type="button"
                onClick={() => setAddExtraFootage(!addExtraFootage)}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  addExtraFootage ? 'bg-[#C8A96A]' : 'bg-[#23262D]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-[#0B0C0E] absolute top-0.5 transition-transform ${
                    addExtraFootage ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* (4) ONE MAIN BUTTON: Create edit */}
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleCreateEdit}
              disabled={isWorking}
              isLoading={isWorking}
              className="w-full py-3 text-sm font-semibold"
            >
              {isWorking ? `${friendlyStep || 'Working'} (${progressPercent}%)` : 'Create edit'}
            </Button>
          </div>

          {/* Progress while working: friendly steps with percent */}
          {isWorking && (
            <div className="p-4 rounded bg-[#121317] border border-[#23262D] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#ECEDEF]">{friendlyStep || 'Processing'}</span>
                <span className="font-mono text-[#C8A96A]">{progressPercent}%</span>
              </div>
              <div className="w-full bg-[#0B0C0E] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#C8A96A] h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(5, progressPercent))}%` }}
                />
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded bg-[#C75B5B]/10 border border-[#C75B5B]/30 flex items-center gap-2 text-xs text-[#C75B5B]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* RESULT AREA (ONLY THIS): Video player, Download, Higher quality, Change request, simple versions list */}
          {activeVideoUrl && (
            <div className="space-y-4 pt-4 border-t border-[#23262D]">
              <span className="text-xs font-semibold text-[#8B909A] uppercase tracking-wider">
                Result
              </span>

              {/* Video Player */}
              <div className="rounded overflow-hidden border border-[#23262D] bg-black">
                <VideoPlayer src={activeVideoUrl} />
              </div>

              {/* Action Buttons: Download & Higher quality */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = activeVideoUrl;
                    a.download = `edit-${Date.now()}.mp4`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  Download
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleHigherQuality}
                  disabled={isWorking}
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#C8A96A]" />}
                >
                  Higher quality
                </Button>
              </div>

              {/* Change request box */}
              <form onSubmit={handleApplyChangeRequest} className="p-3.5 rounded bg-[#121317] border border-[#23262D] space-y-2">
                <label className="block text-xs font-medium text-[#ECEDEF]">
                  Change request
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={changeRequestText}
                    onChange={(e) => setChangeRequestText(e.target.value)}
                    placeholder="Type what to change in this cut..."
                    className="flex-1 bg-[#0B0C0E] border border-[#23262D] focus:border-[#C8A96A] text-xs text-[#ECEDEF] placeholder-[#5a5f6b] rounded px-3 py-2 outline-none"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!changeRequestText.trim() || isWorking || isApplyingChange}
                    isLoading={isApplyingChange}
                  >
                    Apply
                  </Button>
                </div>
              </form>

              {/* Simple Versions List */}
              {versions.length > 0 && (
                <div className="p-3.5 rounded bg-[#121317] border border-[#23262D] space-y-2">
                  <span className="text-xs font-semibold text-[#8B909A] uppercase tracking-wider">
                    Versions
                  </span>

                  <div className="divide-y divide-[#23262D]">
                    {versions.map((v, idx) => {
                      const isSelected = selectedVersionId === v.id;
                      const isDraft = (v.resolution && v.resolution.includes('720')) || (v.format && v.format.includes('draft'));
                      const label = isDraft ? 'Draft' : 'Final';
                      const versionDisplay = v.versionTag
                        ? v.versionTag.toUpperCase()
                        : `Version ${v.versionNumber || (versions.length - idx)}`;

                      return (
                        <div
                          key={v.id}
                          onClick={() => {
                            setSelectedVersionId(v.id);
                            setActiveVideoUrl(apiClient.getVideoFileUrl(v.publicUrl));
                          }}
                          className={`py-2 px-2 flex items-center justify-between cursor-pointer rounded transition-colors ${
                            isSelected ? 'bg-[#181A1F]' : 'hover:bg-[#181A1F]/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[#ECEDEF]">
                              {versionDisplay}
                            </span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              label === 'Final'
                                ? 'bg-[#5FA37A]/10 text-[#5FA37A] border-[#5FA37A]/30'
                                : 'bg-[#121317] text-[#8B909A] border-[#23262D]'
                            }`}>
                              {label}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const a = document.createElement('a');
                              a.href = apiClient.getVideoFileUrl(v.publicUrl);
                              a.download = v.filename || `version-${v.versionNumber}.mp4`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                            }}
                            className="p-1 rounded text-[#8B909A] hover:text-[#ECEDEF] transition-colors"
                            title="Download version"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
